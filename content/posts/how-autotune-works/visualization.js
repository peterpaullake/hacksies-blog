let visualizations = [];


/**
 * Utilities
 */

function range(start, stop, stride = 1) {
    const result = [];

    for (let i = start; i < stop; i += stride) {
        result.push(i);
    }

    return result;
}

function linspace(start, stop, n) {
    const result = [];

    for (let i = 0; i < n; i++) {
        result.push(start + i * (stop - start) / (n - 1));
    }

    return result;
}

function indexToFrequency(index, nIndices, minFrequency, maxFrequency) {
    return minFrequency * (maxFrequency / minFrequency) ** (index / (nIndices - 1));
}

function frequencyToLag(frequency, sampleRate) {
    return Math.round(sampleRate / frequency);
}

function lagToFrequency(lag, sampleRate) {
    return sampleRate / lag;
}

function frequencyToIndex(frequency, minFrequency, maxFrequency, nIndices) {
    return Math.round(
        Math.log(frequency / minFrequency)
            / Math.log(maxFrequency / minFrequency)
            * (nIndices - 1));
}

function lerp(mix, x1, x2) {
    return x1 + mix * (x2 - x1);
}


/**
 * Waterfall
 */

function clearCanvas(canvas, ctx, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function createNewCanvas(width, height, color) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height

    const ctx = canvas.getContext('2d');
    clearCanvas(canvas, ctx, color);
    return canvas;
}

function createWaterfall(width, height) {
    /**
     * Creates a waterfall plot. `waterfall1` is shown directly
     * above `waterfall2`. Only `waterfall2` is actually drawn to:
     * when `waterfall2` is filled up, the contents of `waterfall1`
     * and `waterfall2` are swapped, then `waterfall2` is cleared,
     * allowing it to be drawn to again. `pos` is defined to be equal
     * to the amount of lines of `waterfall2` that are visible on
     * the destination canvas minus 1, or, equivalently, the y-position
     * of the bottom line of the waterfall plot in the local coordinate
     * system of `waterfall2`.
     */

    const mainCanvas = createNewCanvas(width, height, 'black');
    const waterfall1_canvas = createNewCanvas(width, height, 'black');
    const waterfall2_canvas = createNewCanvas(width, height, 'black');
    return {
        pos: -1,
        width,
        height,
        mainCanvas,
        mainCtx: mainCanvas.getContext('2d'),
        waterfall1_canvas: waterfall1_canvas,
        waterfall1_ctx: waterfall1_canvas.getContext('2d'),
        waterfall2_canvas: waterfall2_canvas,
        waterfall2_ctx: waterfall2_canvas.getContext('2d')
    };
}

function swapWaterfall(waterfall) {
    // Draw waterfall2 to waterfall1
    waterfall.waterfall1_ctx.drawImage(waterfall.waterfall2_canvas, 0, 0);

    // Clear waterfall2
    waterfall.waterfall2_ctx.fillStyle = 'black';
    waterfall.waterfall2_ctx.fillRect(0, 0, waterfall.width, waterfall.height);
}

function updateWaterfall(
    waterfall,
    results,
    pixelIdToScoreId,
    detectedLagIdToPixelId,
    trackedLagIdToPixelId
) {
    if (results.length === 0) {
        return;
    }

    // Check how many more lines we can draw before we need to swap the waterfall
    const nUsedLines = waterfall.pos + 1;
    const nRemainingLines = waterfall.height - nUsedLines;

    // If we don't have enough free lines left, we split the call into two with a swap in between
    if (nRemainingLines < results.length) {
        updateWaterfall(
            waterfall,
            results.slice(0, nRemainingLines),
            pixelIdToScoreId,
            detectedLagIdToPixelId,
            trackedLagIdToPixelId
        );

        swapWaterfall(waterfall);
        waterfall.pos = -1;

        updateWaterfall(
            waterfall,
            results.slice(nRemainingLines),
            pixelIdToScoreId,
            detectedLagIdToPixelId,
            trackedLagIdToPixelId
        );
    }

    // Increment the waterfall position
    waterfall.pos += results.length;

    // Draw the values to the waterfall plot
    const imageData = waterfall.waterfall2_ctx.createImageData(waterfall.width, results.length);
    for (let resultId = 0; resultId < results.length; resultId++) {
        const result = results[resultId];
        for (let pixelId = 0; pixelId < waterfall.width; pixelId++) {
            const index = (resultId * waterfall.width + pixelId) * 4;
            const scoreId = pixelIdToScoreId(pixelId);
            const value = result.scores[scoreId];
            const minValue = 0.0;
            const maxValue = 2.0;
            let normalized_value = (value - minValue) / (maxValue - minValue);
            if (normalized_value < 0.0) {
                normalized_value = 0.0;
            }
            if (normalized_value > 1.0) {
                normalized_value = 1.0;
            }
            imageData.data[index + 0] = Math.floor(lerp(normalized_value, 255, 0));
            imageData.data[index + 1] = 0;
            imageData.data[index + 2] = Math.floor(lerp(normalized_value, 0, 128));
            imageData.data[index + 3] = 255;
        }
    }
    waterfall.waterfall2_ctx.putImageData(imageData, 0, waterfall.pos - results.length + 1);

    // Draw the detected lags to the waterfall plot
    waterfall.waterfall2_ctx.save();
    waterfall.waterfall2_ctx.strokeStyle = 'white'
    waterfall.waterfall2_ctx.lineWidth = 8;
    for (let resultId = 0; resultId < results.length; resultId++) {
        const result = results[resultId];

        if (result.detectedLagId !== null) {
            const pixelId = detectedLagIdToPixelId(result.detectedLagId);
            const y = waterfall.pos - results.length + 1 + resultId;
            waterfall.waterfall2_ctx.beginPath();
            waterfall.waterfall2_ctx.moveTo(pixelId - 2, y);
            waterfall.waterfall2_ctx.lineTo(pixelId + 2, y);
            waterfall.waterfall2_ctx.stroke();
        }
    }
    waterfall.waterfall2_ctx.restore();

    // Draw the tracked lags to the waterfall plot
    waterfall.waterfall2_ctx.save();
    waterfall.waterfall2_ctx.strokeStyle = 'lime'
    waterfall.waterfall2_ctx.lineWidth = 2;
    for (let resultId = 0; resultId < results.length; resultId++){
        const result = results[resultId];

        if (result.trackedLagId !== null) {
            const pixelId = trackedLagIdToPixelId(result.trackedLagId, result.trackedLagIdCorrection);
            const y = waterfall.pos - results.length + 1 + resultId;
            waterfall.waterfall2_ctx.beginPath();
            waterfall.waterfall2_ctx.moveTo(pixelId - 1, y);
            waterfall.waterfall2_ctx.lineTo(pixelId + 1, y);
            waterfall.waterfall2_ctx.stroke();
        }
    }
    waterfall.waterfall2_ctx.restore();

    // Draw the tracking window
    waterfall.waterfall2_ctx.save();
    waterfall.waterfall2_ctx.strokeStyle = 'yellow';
    waterfall.waterfall2_ctx.lineWidth = 1;
    // waterfall.waterfall2_ctx.globalAlpha = 0.8;
    for (let resultId = 0; resultId < results.length; resultId++) {
        const result = results[resultId];

        if (result.trackedLagId !== null) {
            const trackingWindowLeftPixelId = trackedLagIdToPixelId(
                result.trackingOffset,
                0.0
            );
            const trackingWindowRightPixelId = trackedLagIdToPixelId(
                result.trackingOffset + result.trackingWidth,
                0.0
            );
            const y = waterfall.pos - results.length + 1 + resultId;

            waterfall.waterfall2_ctx.beginPath();
            waterfall.waterfall2_ctx.moveTo(trackingWindowLeftPixelId - 1, y);
            waterfall.waterfall2_ctx.lineTo(trackingWindowLeftPixelId + 1, y);
            waterfall.waterfall2_ctx.stroke();

            waterfall.waterfall2_ctx.beginPath();
            waterfall.waterfall2_ctx.moveTo(trackingWindowRightPixelId - 1, y);
            waterfall.waterfall2_ctx.lineTo(trackingWindowRightPixelId + 1, y);
            waterfall.waterfall2_ctx.stroke();
        }
    }

    waterfall.waterfall2_ctx.restore();
}

function drawWaterfall(waterfall, canvas, ctx) {
    canvas = waterfall.mainCanvas;
    ctx = waterfall.mainCtx;
    ctx.drawImage(waterfall.waterfall1_canvas, 0, -waterfall.pos - 1);
    ctx.drawImage(waterfall.waterfall2_canvas, 0, -waterfall.pos - 1 + canvas.height);
}


/**
 * Axis decorations
 */

function drawXAxisTicks(labels, xPositions, yPosition, canvas, ctx) {
    ctx.save();

    // Set styling for the ticks and labels
    ctx.strokeStyle = '#AAAAAA';   // Tick color
    ctx.lineWidth = 1;             // Thin, crisp lines
    ctx.fillStyle = '#AAAAAA';     // Label color
    ctx.font = '14px sans-serif';  // Label font
    ctx.textAlign = 'center';      // Center text horizontally on the tick
    ctx.textBaseline = 'top';      // Align text from the top so it sits below the tick

    const tickLength = 6;          // Length of the tick mark in pixels
    const labelOffset = 4;         // Space between the bottom of the tick and the text

    // Loop through the positions and draw
    xPositions.forEach((x, index) => {
        // Crisp pixel trick: standard 1px lines blur across pixels
        // if they land on integers. Offsetting by 0.5 keeps them sharp.
        const sharpX = Math.floor(x) + 0.5;
        const sharpY = Math.floor(yPosition);

        // Draw the tick mark line
        ctx.beginPath();
        ctx.moveTo(sharpX, sharpY);
        ctx.lineTo(sharpX, sharpY + tickLength);
        ctx.stroke();

        // Draw the corresponding label if it exists
        if (labels && labels[index] !== undefined) {
            ctx.fillText(labels[index], sharpX, sharpY + tickLength + labelOffset);
        }
    });

    ctx.restore();
}

function drawXAxisLabel(labelText, xPosition, yPosition, canvas, ctx) {
    // Save the current context state
    ctx.save();

    // Set styling for the main axis label
    ctx.fillStyle = '#AAAAAA';          // Usually a bit darker/bolder than ticks
    ctx.font = 'bold 14px sans-serif';  // Bolder and slightly larger font
    ctx.textAlign = 'center';           // Center horizontally relative to the text anchor
    ctx.textBaseline = 'top';           // Align text from the top

    // Draw the text
    ctx.fillText(labelText, xPosition, yPosition);

    // Restore the original context state
    ctx.restore();
}


/**
 * Visualization
 */

function stopVisualization(visualization) {
    const canvas = visualization.canvas;
    const ctx = visualization.ctx;

    // Clear the waterfall canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(
        visualization.waterfallSidePadding,
        0,
        canvas.width - 2 * visualization.waterfallSidePadding,
        canvas.height - visualization.waterfallBottomPadding
    );

    // Draw the "Click to start" text
    ctx.save();
    ctx.fillStyle = 'white';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Click to start/stop demo...', canvas.width / 2, canvas.height / 2);
    ctx.restore();

    // Release the audio resources
    if (visualization.stream) {
        visualization.stream.getTracks().forEach(track => track.stop());
        visualization.stream = null;
    }
    if (visualization.audioContext) {
        visualization.audioContext.close();
        visualization.audioContext = null;
    }

    visualization.started = false;
}

async function startVisualization(visualization) {
    if (visualization.started) {
        return;
    }
    visualizations.forEach(v => stopVisualization(v));

    try {
        const audioContext = new AudioContext({ sampleRate: visualization.sampleRate });
        visualization.audioContext = audioContext;

        // Create an audio node for the microphone
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        visualization.stream = stream;
        const source = audioContext.createMediaStreamSource(stream);

        // Create a low-pass filter to avoid aliasing when downsampling
        const downsampledNyquistFrequency = visualization.downsampledSampleRate / 2;
        const lowPassFilter = audioContext.createBiquadFilter();
        lowPassFilter.type = 'lowpass';
        lowPassFilter.frequency.value = 0.9 * downsampledNyquistFrequency;

        // Create a node to process the audio
        await audioContext.audioWorklet.addModule('processor.js');
        const autotuneNode = new AudioWorkletNode(
            audioContext,
            'autotune-processor',
            {
                numberOfInputs: 2,
                processorOptions: {
                    aggregateResults: false,
                    resultCounterPeriod: 10,
                    detectionLags: visualization.detectionLags,
                    trackingLags: visualization.trackingLags,
                    downsampleFactor: visualization.downsampleFactor
                }
            }
        );

        // Fetch the compiled WebAssembly module and send it to the processing node
        const response = await fetch('processor.wasm');
        const wasmBytes = await response.arrayBuffer();
        autotuneNode.port.postMessage({ type: 'init', wasmBytes: wasmBytes });

        // Listen for messages from the Worklet
        const pixelIdToScoreId = (pixelId) => {
            const frequency = indexToFrequency(
                pixelId,
                visualization.waterfall.width,
                visualization.minFrequency,
                visualization.maxFrequency
            );
            const detectionLag = frequencyToLag(frequency, visualization.downsampledSampleRate);
            const detectionLagId = detectionLag - visualization.detectionLags[0];
            return detectionLagId;
        };
        const detectedLagIdToPixelId = (detectedLagId) => {
            const detectedLag = visualization.detectionLags[detectedLagId];
            const frequency = lagToFrequency(detectedLag, visualization.downsampledSampleRate);
            const pixelId = frequencyToIndex(
                frequency,
                visualization.minFrequency,
                visualization.maxFrequency,
                visualization.waterfall.width
            );
            return pixelId;
        };
        const trackedLagIdToPixelId = (trackedLagId, trackedLagIdCorrection) => {
            const trackedLag = visualization.trackingLags[trackedLagId] + trackedLagIdCorrection;
            const frequency = lagToFrequency(trackedLag, visualization.sampleRate);
            const pixelId = frequencyToIndex(
                frequency,
                visualization.minFrequency,
                visualization.maxFrequency,
                visualization.waterfall.width
            );
            return pixelId;
        };
        autotuneNode.port.onmessage = (event) => {
            if (!visualization.started) {
                return;
            }

            updateWaterfall(
                visualization.waterfall,
                event.data.results,
                pixelIdToScoreId,
                detectedLagIdToPixelId,
                trackedLagIdToPixelId
            );
            drawWaterfall(visualization.waterfall);
            visualization.ctx.drawImage(
                visualization.waterfall.mainCanvas,
                visualization.waterfallSidePadding,
                0
            );
        };

        // Connect the source audio node to the processing node twice:
        // once through the low-pass filter, and once directly
        source.connect(lowPassFilter);
        lowPassFilter.connect(
            autotuneNode,
            /* outputIndex = */ 0,
            /* inputIndex = */ 0
        );
        source.connect(
            autotuneNode,
            /* outputIndex = */ 0,
            /* inputIndex = */ 1
        );
    } catch (err) {
        console.error('Initialization failed:', err);
    }

    visualization.started = true;
}

function clickVisualization(visualization) {
    if (visualization.started) {
        stopVisualization(visualization);
    } else {
        startVisualization(visualization);
    }
}

function createVisualization(canvas) {
    const ctx = canvas.getContext('2d');

    // Set up a few constants
    const sampleRate = 48000;
    const downsampleFactor = 8;
    const downsampledSampleRate = sampleRate / downsampleFactor;
    const minFrequency = 50.1;
    const maxFrequency = 2756;
    const detectionLags = range(
        frequencyToLag(maxFrequency, downsampledSampleRate),
        frequencyToLag(minFrequency, downsampledSampleRate) + 1
    );
    const trackingLags = range(
        downsampleFactor * detectionLags[0] ,
        downsampleFactor * detectionLags[detectionLags.length - 1] + 1
    );

    // High resolution mode for taking screenshots
    const highResolutionMode = false;

    // Set up the waterfall plot based on the sample rate and lag settings
    let waterfall = null;
    if (highResolutionMode) {
        waterfall = createWaterfall(8 * detectionLags.length, 1280);
    } else {
        waterfall = createWaterfall(4 * detectionLags.length, 640);
    }

    // Set up the canvas where the waterfall plot will be
    // drawn, making room for the x-axis ticks and label
    const waterfallSidePadding = 30;
    const waterfallBottomPadding = 60;
    canvas.width = waterfall.width + 2 * waterfallSidePadding;
    canvas.height = waterfall.height + waterfallBottomPadding;

    // Draw the x-axis ticks and label
    const nXAxisTicks = 8;
    const xTickPositions = linspace(
        waterfallSidePadding, (canvas.width - waterfallSidePadding) - 1, nXAxisTicks
    );
    const xTickFrequencyValues = linspace(
        0, waterfall.width - 1, nXAxisTicks
    ).map(i => indexToFrequency(i, waterfall.width, minFrequency, maxFrequency));
    drawXAxisTicks(
        xTickFrequencyValues.map(f => f.toFixed(2)),
        xTickPositions,
        canvas.height - waterfallBottomPadding,
        canvas,
        ctx
    );
    drawXAxisLabel(
        'Frequency (Hz)',
        canvas.width / 2,
        canvas.height - waterfallBottomPadding / 2,
        canvas,
        ctx
    );

    // Create and return the visualization object
    const visualization = {
        sampleRate,
        downsampleFactor,
        downsampledSampleRate,
        minFrequency,
        maxFrequency,
        detectionLags,
        trackingLags,
        canvas,
        ctx,
        waterfall,
        waterfallSidePadding,
        waterfallBottomPadding,
        audioContext: null,
        stream: null,
        started: false
    };
    stopVisualization(visualization);
    canvas.addEventListener('click', () => {
        clickVisualization(visualization);
    });
    return visualization;
}

function screenshotVisualization(visualization) {
    const canvas = visualization.canvas;
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "screenshot.png";
        a.click();
        URL.revokeObjectURL(url);
    }, "image/png");
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.visualization-canvas').forEach(canvas => {
        visualizations.push(createVisualization(canvas));
    });
});

// Set up a keypress intercept for taking a screenshot
document.addEventListener('keydown', (e) => {
    if (event.ctrlKey && event.shiftKey && event.key === "X") {
        event.preventDefault();  // prevent the browser's default action
        visualizations.forEach(visualization => {
            if (visualization.started) {
                console.log("Saving screenshot...");
                screenshotVisualization(visualization);
            }
        });
    }
});
