.global calculate_rolling_sums_c
.intel_syntax noprefix

calculate_rolling_sums_c:
        // rdi: const float *x
        // rsi: float *rolling_sums
        // edx: unsigned n
        // ecx: unsigned kernel_size

        mov r8d, ecx
        test edx, edx
        je .quit
        neg ecx
        mov edx, edx
        pxor xmm0, xmm0
        xor eax, eax

.loop_body:
        movss DWORD PTR [rsi+rax*4], xmm0
        addss xmm0, DWORD PTR [rdi+rax*4]
        movss DWORD PTR [rsi+rax*4], xmm0
        cmp eax, r8d
        jb .comparison
        mov r9d, ecx
        subss xmm0, DWORD PTR [rdi+r9*4]
        movss DWORD PTR [rsi+rax*4], xmm0

.comparison:
        add rax, 1
        add ecx, 1
        cmp rax, rdx
        jne .loop_body

.quit:
        ret
