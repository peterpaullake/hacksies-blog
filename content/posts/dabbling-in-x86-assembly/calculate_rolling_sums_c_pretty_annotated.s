.global calculate_rolling_sums_c
.intel_syntax noprefix

calculate_rolling_sums_c:
        // rdi: const float *x
        // rsi: float *rolling_sums
        // edx: unsigned n
        // ecx: unsigned kernel_size

        // r8d = kernel_size;
        mov r8d, ecx

        // Return if n == 0
        test edx, edx
        je .quit

        // ecx = -kernel_size;
        neg ecx

        // edx = edx; (zero out the upper 32 bits of rdx)
        mov edx, edx

        // float rolling_sum = 0.0f;
        pxor xmm0, xmm0

        // unsigned i = 0;
        xor eax, eax

.loop_body:
        // rolling_sums[i] = rolling_sum;
        movss DWORD PTR [rsi+rax*4], xmm0

        // rolling_sum += x[i];
        addss xmm0, DWORD PTR [rdi+rax*4]

        // rolling_sums[i] = rolling_sum;
        movss DWORD PTR [rsi+rax*4], xmm0

        // Jump to .comparison if i < kernel_size
        cmp eax, r8d
        jb .comparison

        // r9d = -kernel_size + i;
        mov r9d, ecx

        // rolling_sum -= x[-kernel_size + i];
        subss xmm0, DWORD PTR [rdi+r9*4]

        // rolling_sums[i] = rolling_sum;
        movss DWORD PTR [rsi+rax*4], xmm0

.comparison:
        // i++;
        add rax, 1

        // ecx = -kernel_size + i;
        add ecx, 1

        // Jump to .loop_body if i != n
        cmp rax, rdx
        jne .loop_body

.quit:
        ret
