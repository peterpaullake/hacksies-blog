void calculate_rolling_sums_c(const float *x,
                              float *rolling_sums,
                              unsigned n,
                              unsigned kernel_size) {
    float prev_rolling_sum = 0.0f;

    for (unsigned i = 0; i < n; i++) {
        // Start the current rolling sum as the previous rolling sum
        rolling_sums[i] = prev_rolling_sum;

        // Add the current element
        rolling_sums[i] += x[i];

        // Subtract the newly out of bounds element
        if (i >= kernel_size) {
            rolling_sums[i] -= x[i - kernel_size];
        }

        prev_rolling_sum = rolling_sums[i];
    }
}
