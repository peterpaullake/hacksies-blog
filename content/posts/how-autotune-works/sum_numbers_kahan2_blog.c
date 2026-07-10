float sum_numbers_kahan2(const float *numbers, size_t n) {
    float sum = 0.0f;
    float error = 0.0f;
    for (size_t i = 0; i < n; i++) {
        increment_kahan(&sum, numbers[i], &error);
    }
    return sum;
}
