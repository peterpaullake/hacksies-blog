/**
 * Vibe-coded helper function to read a null-terminated string from WASM memory.
 */
function getStringFromWasm(memory, pointer) {
    if (pointer === 0) return null; // Handle null pointers safely

    const memoryBytes = new Uint8Array(memory.buffer);
    let end = pointer;

    // Find the null terminator (\0)
    while (memoryBytes[end] !== 0) {
        end++;
    }

    // Slice the relevant bytes (excluding the null terminator)
    const stringBytes = memoryBytes.subarray(pointer, end);

    // Decode the bytes into a UTF-8 JavaScript string
    return String.fromCharCode.apply(null, stringBytes);
}

class AutoTuneProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        // The results from the `update_autotune` calls are saved and returned to the
        // main thread every `resultCounterPeriod` updates. When `aggregateResults`
        // is false, the results from every callback are returned as-is, and the length
        // of this returned array is `resultCounterPeriod`. Otherwise, the results from
        // the callbacks are first aggregated, and the length of the returned array is 1.
        this.aggregateResults = options.processorOptions.aggregateResults;
        this.resultCounter = 0;
        this.resultCounterPeriod = options.processorOptions.resultCounterPeriod;

        this.detectionLags = new Uint32Array(options.processorOptions.detectionLags);
        this.trackingLags = new Uint32Array(options.processorOptions.trackingLags);
        this.downsampleFactor = options.processorOptions.downsampleFactor;

        // Guess that the buffer length should be 128, which is usual for Web Audio
        this.nSamples = 128;

        this.wasmInstance = null;
        this.autotuneStatePointer = null;
        this.detectionLagsPointer = null;
        this.trackingLagsPointer = null;
        this.filteredSamplesPointer = null;
        this.rawSamplesPointer = null;

        this.reportedInfo = false;

        // Set up the output object
        this.results = [];
        this.aggregatedResult = {
            scores: null,
            detectedLagId: null,
            trackingOffset: null,
            trackingWidth: null,
            trackedLagId: null,
            trackedLagIdCorrection: null
        };

        // Listen for the main thread to send us the compiled Wasm bytes
        this.port.onmessage = (event) => {
            if (event.data.type === 'init') {
                // Instantiate the Wasm module
                WebAssembly.instantiate(event.data.wasmBytes).then(({ instance }) => {
                    this.wasmInstance = instance;
                    
                    // Allocate memory in Wasm for the state, detection
                    // and tracking lags, and incoming audio samples
                    this.autotuneStatePointer = this.wasmInstance.exports.malloc(
                        this.wasmInstance.exports.get_autotune_state_size()
                    );

                    this.detectionLagsPointer = this.wasmInstance.exports.malloc(
                        this.detectionLags.length * 4
                    );
                    const detectionLagsView = new Uint32Array(
                        this.wasmInstance.exports.memory.buffer,
                        this.detectionLagsPointer,
                        this.detectionLags.length
                    );
                    detectionLagsView.set(this.detectionLags);

                    this.trackingLagsPointer = this.wasmInstance.exports.malloc(
                        this.trackingLags.length * 4
                    );
                    const trackingLagsView = new Uint32Array(
                        this.wasmInstance.exports.memory.buffer,
                        this.trackingLagsPointer,
                        this.trackingLags.length
                    );
                    trackingLagsView.set(this.trackingLags);

                    this.filteredSamplesPointer = this.wasmInstance.exports.malloc(
                        this.nSamples * 4
                    );
                    this.rawSamplesPointer = this.wasmInstance.exports.malloc(
                        this.nSamples * 4
                    );

                    this.wasmInstance.exports.init_autotune(
                        this.autotuneStatePointer,
                        this.detectionLagsPointer,
                        this.detectionLags.length,
                        this.trackingLagsPointer,
                        this.trackingLags.length,
                        this.nSamples,
                        this.downsampleFactor,
                    )
                });
            }
        };
    }

    process(inputs, outputs, parameters) {
        // Wait until Wasm is loaded
        if (!this.wasmInstance) {
            return true;
        }

        if (inputs.length !== 2) {
            throw new Error(
                `AutoTuneProcessor error: Expected 2 inputs, got ${inputs.length}.`
            );
        }

        // Get the low-pass filtered and raw samples as the first
        // channels of the first and second inputs, respectively
        const filteredSamples = inputs[0][0];
        const rawSamples = inputs[1][0];
        if (filteredSamples.length !== rawSamples.length) {
            throw new Error(
                'Filtered and raw samples have mismatching lengths.'
            );
        }

        // Make sure the number of samples is divisible by
        // the downsample factor, making downsampling easy
        if (filteredSamples.length % this.downsampleFactor !== 0) {
            throw new Error(
                'Audio buffer size not divisble by downsample factor.'
            );
        }

        // If the buffer size changes, we need to reallocate memory
        if (filteredSamples.length !== this.nSamples) {
            this.wasmInstance.exports.free(this.rawSamplesPointer);
            this.wasmInstance.exports.free(this.filteredSamplesPointer);

            this.nSamples = filteredSamples.length;
            this.filteredSamplesPointer = this.wasmInstance.exports.malloc(this.nSamples * 4);
            this.rawSamplesPointer = this.wasmInstance.exports.malloc(this.nSamples * 4);

            this.wasmInstance.exports.free_autotune(this.autotuneStatePointer);
            this.wasmInstance.exports.init_autotune(
                this.autotuneStatePointer,
                this.detectionLagsPointer,
                this.detectionLags.length,
                this.trackingLagsPointer,
                this.trackingLags.length,
                this.nSamples,
                this.downsampleFactor,
            )
        }

        // Copy the JS audio samples in the Wasm memory
        const filteredSamplesView = new Float32Array(
            this.wasmInstance.exports.memory.buffer,
            this.filteredSamplesPointer,
            this.nSamples
        );
        filteredSamplesView.set(filteredSamples);
        const rawSamplesView = new Float32Array(
            this.wasmInstance.exports.memory.buffer,
            this.rawSamplesPointer,
            this.nSamples
        );
        rawSamplesView.set(rawSamples);

        // Update the AutoTune state with the newest audio samples
        const detectionThreshold = 0.1;
        const trackingThreshold = 0.1;
        const minTrackingEnergy = 0.01;
        const detectionMade = this.wasmInstance.exports.update_autotune(
            this.autotuneStatePointer,
            this.filteredSamplesPointer,
            this.rawSamplesPointer,
            this.nSamples,
            detectionThreshold,
            trackingThreshold,
            minTrackingEnergy
        );

        // Print the info if there is any
        const get_info_available = this.wasmInstance.exports.get_info_available
        if (!this.reportedInfo
            && get_info_available
            && get_info_available(this.autotuneStatePointer)) {

            console.log('Info:');
            const memory = this.wasmInstance.exports.memory; 
            const infoPointer = this.wasmInstance.exports.get_info(this.autotuneStatePointer);
            const info = getStringFromWasm(memory, infoPointer);
            console.log(info);

            this.reportedInfo = true;
        }

        // Read the scores
        const readScoresForAggregation =
              this.aggregateResults && (this.resultCounter % this.resultCounterPeriod == 0);
        const readScoresAsIs = !this.aggregateResults;
        if (readScoresForAggregation || readScoresAsIs) {
            const scoresPointer = this.wasmInstance.exports.get_scores(this.autotuneStatePointer);
            const scoresView = new Float32Array(
                this.wasmInstance.exports.memory.buffer,
                scoresPointer,
                this.detectionLags.length
            );

            if (readScoresForAggregation) {
                this.aggregatedResult.scores = Array.from(scoresView);
            } else if (readScoresAsIs) {
                this.results.push({
                    scores: Array.from(scoresView),
                    detectedLagId: null,
                    trackingOffset: null,
                    trackingWidth: null,
                    trackedLagId: null,
                    trackedLagIdCorrection: null
                });
            }
        }

        // Read the detected lag
        if (this.aggregateResults) {
            if (detectionMade) {
                this.aggregatedResult.detectedLagId =
                    this.wasmInstance.exports.get_detected_lag_id(this.autotuneStatePointer);
            }
        } else {
            this.results[this.results.length - 1].detectedLagId = null;
            if (detectionMade) {
                this.results[this.results.length - 1].detectedLagId =
                    this.wasmInstance.exports.get_detected_lag_id(this.autotuneStatePointer);
            }
        }

        // Read the tracked lag
        const readTrackingForAggregation =
              this.aggregateResults && (this.resultCounter % this.resultCounterPeriod == 0)
        const readTrackingAsIs = !this.aggregateResults;
        if (readTrackingForAggregation || readTrackingAsIs) {
            let trackingOffset = null
            let trackingWidth = null;
            let trackedLagId = null;
            let trackedLagIdCorrection = null;
            const mode = this.wasmInstance.exports.get_mode(this.autotuneStatePointer);
            const MODE_TRACKING = 1;
            if (mode === MODE_TRACKING) {
                trackingOffset = this.wasmInstance.exports.get_tracking_offset(
                    this.autotuneStatePointer
                );
                trackingWidth = this.wasmInstance.exports.get_tracking_width(
                    this.autotuneStatePointer
                );
                trackedLagId = this.wasmInstance.exports.get_tracked_lag_id(
                    this.autotuneStatePointer
                );
                trackedLagIdCorrection =
                    this.wasmInstance.exports.get_tracked_lag_id_correction(
                        this.autotuneStatePointer
                    );
            }
            if (readTrackingForAggregation) {
                this.aggregatedResult.trackingOffset = trackingOffset;
                this.aggregatedResult.trackingWidth = trackingWidth;
                this.aggregatedResult.trackedLagId = trackedLagId;
                this.aggregatedResult.trackedLagIdCorrection = trackedLagIdCorrection;
            } else if (readTrackingAsIs) {
                this.results[this.results.length - 1].trackingOffset = trackingOffset;
                this.results[this.results.length - 1].trackingWidth = trackingWidth;
                this.results[this.results.length - 1].trackedLagId = trackedLagId;
                this.results[this.results.length - 1].trackedLagIdCorrection = trackedLagIdCorrection;
            }
        }

        // Send the results back to the main thread
        if (this.resultCounter % this.resultCounterPeriod === 0) {
            if (this.aggregateResults) {
                this.port.postMessage({results: [this.aggregatedResult]});
                this.aggregatedResult.scores = null;
                this.aggregatedResult.detectedLagId = null;
                this.aggregatedResult.trackingOffset = null;
                this.aggregatedResult.trackingWidth = null;
                this.aggregatedResult.trackedLagId = null;
                this.aggregatedResult.trackedLagIdCorrection = null;
            } else {
                this.port.postMessage({results: this.results});
                this.results = [];
            }
        }

        this.resultCounter++;
        this.resultCounter %= this.resultCounterPeriod;

        // Stay alive
        return true;
    }
}

registerProcessor('autotune-processor', AutoTuneProcessor);
