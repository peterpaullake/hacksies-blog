        .file   "calculate_rolling_sums_c.c"
        .intel_syntax noprefix
        .text
        .p2align 4
        .globl  calculate_rolling_sums_c
        .type   calculate_rolling_sums_c, @function
calculate_rolling_sums_c:
.LFB0:
        .cfi_startproc
        mov     r8d, ecx
        test    edx, edx
        je      .L1
        neg     ecx
        mov     edx, edx
        pxor    xmm0, xmm0
        xor     eax, eax
        .p2align 6
        .p2align 4
        .p2align 3
.L4:
        movss   DWORD PTR [rsi+rax*4], xmm0
        addss   xmm0, DWORD PTR [rdi+rax*4]
        movss   DWORD PTR [rsi+rax*4], xmm0
        cmp     eax, r8d
        jb      .L3
        mov     r9d, ecx
        subss   xmm0, DWORD PTR [rdi+r9*4]
        movss   DWORD PTR [rsi+rax*4], xmm0
.L3:
        add     rax, 1
        add     ecx, 1
        cmp     rax, rdx
        jne     .L4
.L1:
        ret
        .cfi_endproc
.LFE0:
        .size   calculate_rolling_sums_c, .-calculate_rolling_sums_c
        .ident  "GCC: (GNU) 15.2.1 20260123 (Red Hat 15.2.1-7)"
        .section        .note.GNU-stack,"",@progbits
