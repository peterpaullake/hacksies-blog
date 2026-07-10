float sum_numbers_kahan1(const float *numbers, size_t n) {
    float sum = 0.0f;
    float error = 0.0f;
    for (size_t i = 0; i < n; i++) {
        float term = numbers[i] - error;
        float new_sum = sum + term;
        float difference = new_sum - sum;
        error = difference - term;
        sum = new_sum;
    }
    return sum;
}
