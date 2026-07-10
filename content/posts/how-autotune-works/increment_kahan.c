void increment_kahan(float *sum, float increment, float *error) {
    float term = increment - *error;
    float new_sum = *sum + term;
    float difference = new_sum - *sum;
    *error = difference - term;
    *sum = new_sum;
}
