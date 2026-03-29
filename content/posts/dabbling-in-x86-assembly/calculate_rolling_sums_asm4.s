.global calculate_rolling_sums_asm4
.intel_syntax noprefix

calculate_rolling_sums_asm4:
    // rdi: const float *x
    // rsi: float *rolling_sums
    // edx: unsigned n
    // ecx: unsigned kernel_size

    test    edx, edx                # n == 0 ?
    je      .done

    pxor    xmm0, xmm0              # prev_rolling_sum = 0.0

    xor     r8d, r8d                # i = 0

    # -------- First phase: i < kernel_size --------
.loop1:
    cmp     r8d, ecx
    jae     .loop2_entry

    cmp     r8d, edx
    jae     .done

    movss   xmm1, DWORD PTR [rdi + r8*4]   # load x[i]
    addss   xmm0, xmm1                     # sum += x[i]

    movss   DWORD PTR [rsi + r8*4], xmm0   # store result

    inc     r8d
    jmp     .loop1

# -------- Second phase: i >= kernel_size --------
.loop2_entry:
    cmp     r8d, edx
    jae     .done

.loop2:
    movss   xmm1, DWORD PTR [rdi + r8*4]           # x[i]
    addss   xmm0, xmm1                             # sum += x[i]

    mov     r9d, r8d
    sub     r9d, ecx                               # i - kernel_size
    movss   xmm2, DWORD PTR [rdi + r9*4]           # x[i - k]
    subss   xmm0, xmm2                             # sum -= old

    movss   DWORD PTR [rsi + r8*4], xmm0           # store

    inc     r8d
    cmp     r8d, edx
    jb      .loop2

.done:
    ret
