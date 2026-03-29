.global calculate_rolling_sums_asm1
.intel_syntax noprefix

calculate_rolling_sums_asm1:
        // push rbp
        // mov rbp, rsp

        // rdi: const float *x
        // rsi: float *rolling_sums
        // edx: unsigned n
        // ecx: unsigned kernel_size

        // r8 = 4 * kernel_size;
        mov r8d, ecx
        imul r8, 4

        // float prev_rolling_sum = 0.0f;
        pxor xmm0, xmm0

        // unsigned i = 0;
        mov eax, 0

        jmp .comparison

        .loop_body:

        // float rolling_sum = prev_rolling_sum;
        movss xmm1, xmm0

        // Add the current element
        addss xmm1, DWORD PTR [rdi]

        // Jump to .skip_subtract_newly_out_of_bounds_element
        // if i < kernel_size
        cmp eax, ecx
        jb .skip_subtract_newly_out_of_bounds_element

        // Subtract the newly out of bounds element
        mov r9, rdi
        sub r9, r8
        subss xmm1, DWORD PTR [r9]
        .skip_subtract_newly_out_of_bounds_element:

        // rolling_sums[i] = rolling_sum;
        movss DWORD PTR [rsi], xmm1

        // prev_rolling_sum = rolling_sum;
        movss xmm0, xmm1
        
        // x++; rolling_sums++; i++;
        add rdi, 4
        add rsi, 4
        add eax, 1

        // Jump to .comparison if i < n
        .comparison:
        cmp eax, edx
        jb .loop_body

        // pop rbp
        ret
