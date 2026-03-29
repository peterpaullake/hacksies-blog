.global calculate_rolling_sums_asm3
.intel_syntax noprefix

calculate_rolling_sums_asm3:
        // push rbp
        // mov rbp, rsp

        // rdi: const float *x
        // rsi: float *rolling_sums
        // edx: unsigned n
        // ecx: unsigned kernel_size

        // r8 = -kernel_size;
        mov r8d, ecx
        neg r8

        // float rolling_sum = 0.0f;
        pxor xmm0, xmm0

        // unsigned i = 0;
        xor eax, eax

        jmp .comparison

        .loop_body:

        // Add the current element
        addss xmm0, DWORD PTR [rdi]

        // Jump to .skip_subtract_newly_out_of_bounds_element
        // if i < kernel_size
        cmp eax, ecx
        jb .skip_remove_newly_out_of_bounds_element

        // Subtract the newly out of bounds element
        subss xmm0, DWORD PTR [rdi+r8*4]
        .skip_remove_newly_out_of_bounds_element:

        // rolling_sums[i] = rolling_sum;
        movss DWORD PTR [rsi], xmm0
        
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
