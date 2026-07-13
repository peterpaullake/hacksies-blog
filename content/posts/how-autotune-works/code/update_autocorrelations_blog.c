void update_autocorrelations(float *autocorrelations,
                             float *prev_autocorrelations,
                             float *errors,
                             const float *new_samples,
                             const unsigned *lags,
                             unsigned n_lags,
                             unsigned n_new_samples) {
    // autocorrelations:       (n_lags, n_new_samples)
    // prev_autocorrelations:  (n_lags,)
    // errors:                 (n_lags,)
    // new_samples:            (n_new_samples,)
    // lags:                   (n_lags,)

    for (unsigned lag_id = 0; lag_id < n_lags; lag_id++) {
        unsigned lag = lags[lag_id];

        for (unsigned sample_id = 0;
             sample_id < n_new_samples;
             sample_id++) {
            float autocorrelation;

            if (sample_id == 0) {
                autocorrelation = prev_autocorrelations[lag_id];
            } else {
                autocorrelation = autocorrelations[sample_id - 1];
            }

            // Include the present term
            float increment1 =
                (new_samples[sample_id]
                 * new_samples[(int) sample_id - (int) lag]);
            increment_kahan(&autocorrelation, increment1, &errors[lag_id]);

            // Subtract the recently out-of-bounds term
            float increment2 =
                -(new_samples[(int) sample_id - (int) lag]
                  * new_samples[(int) sample_id - 2 * (int) lag]);
            increment_kahan(&autocorrelation, increment2, &errors[lag_id]);

            autocorrelations[sample_id] = autocorrelation;
        }

        // Save `prev_autocorrelations` for the next call
        prev_autocorrelations[lag_id] = autocorrelations[n_new_samples - 1];

        // Point to the autocorrelations array for the next lag
        autocorrelations += n_new_samples;
    }
}
