float sum_numbers(const float *numbers, size_t n) {
    float sum = 0.0f;
    for (size_t i = 0; i < n; i++) {
        sum += numbers[i];
    }
    return sum;
}
