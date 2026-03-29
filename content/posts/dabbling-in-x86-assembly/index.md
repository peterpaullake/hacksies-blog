+++
date = '2026-03-29'
draft = false
title = 'Dabbling in x86 assembly'
math = true
+++

## Introduction
I have some free time now, so I want to do something that's been in the back of my mind for a long time: learning assembly. I don't really have a strong preference for which variant, but I'm doing x86 assembly just because I have an x86 machine, so it's a little easier to get started with. I have no idea what I'm talking about, so you definitely shouldn't take this as an instructional post. It's more about recording my learning process for posterity and writing down the things that I find interesting along the way.

After playing around with Matt Godbolt's amazing [Compiler Explorer](https://godbolt.org/), watching some old [Low Level](https://www.youtube.com/@LowLevelTV/) videos, and learning about [the call stack](https://en.wikipedia.org/wiki/Call_stack) and how it's conventionally handled in x86 (this is actually really fascinating, and I can't believe I didn't know about it earlier), I feel ready to start trying some things.

## The challenge

As a starting point, I want to see if I can implement my own assembly version of a function that calculates rolling sums of an array of numbers. Something like this:

{{< include-code
    file="content/posts/dabbling-in-x86-assembly/calculate_rolling_sums_c.c"
    lang="C" >}}

My goals are:
- Write a working assembly version of this function
- Make my assembly version run at least as fast as the C version when compiled using GCC[^1] with `-O2` optimization[^2]
- Learn something interesting

[^1]: GCC version 15.2.1.

[^2]: I choose `-O2` optimization because it's supposed to be a good "middle ground" optimization, balancing execution time and executable size, while still being basically guaranteed to run correctly.

This task might seem a bit random, but it's actually quite relevant for me because I'm interested in AutoTune, which (at least in [the original patent](https://patents.google.com/patent/US5973252A/en)) is based on quickly calculating autocorrelations in a similar, rolling fashion. This is like a baby version of that. Maybe I'll return to this topic in a later post.

## First attempt
I start trudging my way through by writing small snippets of C into the Compiler Explorer to answer basic questions like "which registers do my arguments get put into?", "how do I set a floating point register to zero?", or "how do I jump if some register is less than another register?", combined with Googling and ChatGPTing the corresponding output assembly to try to understand what's happening. This gives me a first draft that looks like this:

{{< include-code
    file="content/posts/dabbling-in-x86-assembly/calculate_rolling_sums_asm1.s"
    lang="asm" >}}

Ok, so maybe not that pretty, but it does the job and is quite analogous to the C code from before. I heard that using CPU registers is much faster than using main memory, so I try to be clever by avoiding memory accesses altogether and using only registers to perform the calculations. And because I'm not touching the stack at all, I omit the usual

```asm
push rbp
mov rbp, rsp
```

and

```asm
pop rbp
```

function prologue and epilogue that would usually prepare the stack frame for my function. At this point, I already learned a few things:
- `.global <name>` exposes `<name>` to the linker.
- x86 registers have nested 32 and 64-bit versions, with the 32-bit version living in the lower half of the full 64-bit version. There's also a similar principle for smaller (16-bit, 8-bit) register sizes.
- `mov dst, src` zero-fills the upper half of the full 64-bit version of `dst` if `dst` and `src` are 32-bit. But [not so for smaller register sizes](https://www.youtube.com/watch?v=bSkpMdDe4g4).
- `pxor xmm0, xmm0` is a common way to set a floating point register to zero.
- `cmp op1, op2` followed by `jb .my_label` jumps to `.my_label` if and only if `op1 < op2` (unsigned integer comparison).
- `mov` can accept, for each of its operands, either a register or a memory address. This is common for CISC, but not for RISC. For the latter, there are usually different instructions depending on whether the source and destination are registers or memory addresses.

I also learned that actually assembling this code and calling it from C is pleasantly straightforward:
```bash
as calculate_rolling_sums_asm1.s -o calculate_rolling_sums_asm1.o
gcc -o hello_world -O2 -Wall \
    calculate_rolling_sums_c.c \
    calculate_rolling_sums_asm1.o \
    hello_world.c
```
To summarize the files at this point:
- `calculate_rolling_sums_c.c` contains the C version from above,
- `calculate_rolling_sums_asm1.s` contains my homemade assembly version, and
- `hello_world.c` contains some skeleton code that calls both, times them, and ensures their outputs are the same within a small tolerance.

Doing a quick-and-dirty speed test[^3] like [the one here](https://blog.codingconfessions.com/p/rdtsc), I get the following results:

[^3]: I call the function 10,000 times in a `for` loop on an array of 100,000 random numbers sampled from $\text{Uniform}(0,1)$. The total number of CPU cycles, along with the sample median and interquartile range of the number of cycles for each repeat, are reported.

{{< include-code
    file="content/posts/dabbling-in-x86-assembly/formatted_timing_results/2.txt"
    lang="txt" >}}

Ok, so apparently I'm not so clever after all. My version is noticably slower than the GCC version. But not bad for a first try? Let's have a look at how GCC compiles the C code to hopefully get a hint about what we can improve. This is also very convenient to do with GCC:
```bash
gcc -S -O2 -masm=intel calculate_rolling_sums_c.c
```
This generates an output file, `calculate_rolling_sums_c.s`, with the following contents:

{{< include-code
    file="content/posts/dabbling-in-x86-assembly/calculate_rolling_sums_c.s"
    lang="asm" >}}

This is quite busy, so let's first work out what we can ignore. The lines starting with "." are assembler directives, and most of them aren't that important. Some of them contain metadata about the source file, what version of GCC was used, and so on. `.cfi_startproc` and `.cfi_endproc` are used (I think) by certain debugging tools to keep track of the call stack. `.p2align` [is used to add empty instructions to the assembled code](https://stackoverflow.com/questions/21546946/what-does-p2align-do-in-asm-code) to align the following instruction with a power-of-two number of bytes, which I believe can make jumping to that instruction faster in some cases. None of these are relevant for our purposes, though. So after removing these distracting assembler directives, adding some comments to document the arguments, and giving the labels more suggestive names, we get something like this:

{{< include-code
    file="content/posts/dabbling-in-x86-assembly/calculate_rolling_sums_c_pretty.s"
    lang="asm" >}}

Wow. That's very compact. At first glance, without even understanding anything, I'm very surprised to see things like `movss DWORD PTR [rsi+rax*4], xmm0`. Apparently you can have simple math expressions inside of operands of certain instructions! I had no idea you could do that, which makes my code needlessly long. Now I'm starting to see why x86 assembly is sometimes called an interpreted language.

Next, let's see if we can interpret the code's meaning a little bit by adding some comments:

{{< include-code
    file="content/posts/dabbling-in-x86-assembly/calculate_rolling_sums_c_pretty_annotated.s"
    lang="asm" >}}

So in my own words, the GCC-compiled solution works like this:
- Set `r8d` to `kernel_size` for later use
- Return if `n == 0`
- Set `ecx` to `-kernel_size` for later use
- Zero out the upper 32 bits of `rdx` (`n` is stored in `edx`) so that it can later be safely used as a 64-bit unsigned integer
- Initialize the `rolling_sum` variable, stored in the floating point register `xmm0`, to zero
- Initialize the counting variable `i`, stored in `eax`, to zero
- Enter the loop body:
  - Write `xmm0` to `rolling_sums[i]` (superfluous)
  - Add the `i`th element of `x` to `xmm0`
  - Write `xmm0` to `rolling_sums[i]`
  - If `i >= kernel_size` (`r8d` is used here):
    - Subtract `x[-kernel_size + i]` from `xmm0` (`ecx` is used here)
    - Write `xmm0` to `rolling_sums[i]`
  - Increment `i` by 1
  - Increment `ecx` by 1 (so that it holds `-kernel_size + i`)
  - Quit if `i == n`

So it's actually quite straightforward. It surprises me that there seems to be a superfluous write to `rolling_sums[i]` at the start of the loop body. It also surprises me that `ecx` is copied to `r9d` before being used in the subsequent `subss` instruction. It seems to me that `ecx` could be used directly, and `r9d` could be omitted. But I've heard that relying on intuition to evaluate assembly code, especially for modern processors, doesn't really work, so I'll reserve my judgement for now.

This solution seems quite similar to mine, with a few differences:
- Using `xor eax, eax` to initialize the counting variable instead of `mov eax, 0`
- Using expressions (e.g. `[rsi+rax*4]`) to avoid using extra instructions and registers
- Using just one floating point register (`xmm0`)

As for the first item, apparently this is [just a better way](https://youtu.be/bSkpMdDe4g4?t=829) of setting a register to zero that gets encoded slightly more compactly than the `mov` equivalent, so I'll do it that way from now on. For the latter two, I'll introduce them one at a time.

## Second attempt: use expressions for memory addressing
For the second attempt, let's use `xor eax, eax` to initialize the counting variable `i` to zero, as well as use expressions for memory addressing. That gives us something like this:

{{< include-code
    file="content/posts/dabbling-in-x86-assembly/calculate_rolling_sums_asm2.s"
    lang="asm" >}}

This lets us avoid using `r9` and to use two less instructions in the loop body, previously used to prepare `r9`. Taking a look at the speed comparison, we get something like this:

{{< include-code
    file="content/posts/dabbling-in-x86-assembly/formatted_timing_results/3.txt"
    lang="txt" >}}

Even though these two changes made our code smaller and more readable, they seem not to have helped the execution time. Next, let's try to use just one floating point register like in the GCC solution.

## Third attempt: use only one floating point register
Here we rework the code to not use the second floating point register, `xmm1`, similarly to the GCC-compiled code. This second register isn't actually necessary, and I only wrote it that way because I was translating quite directly from my C code. Now we get something like this:

{{< include-code
    file="content/posts/dabbling-in-x86-assembly/calculate_rolling_sums_asm3.s"
    lang="asm" >}}

And the speed comparison:

{{< include-code
    file="content/posts/dabbling-in-x86-assembly/formatted_timing_results/4.txt"
    lang="txt" >}}

Ok! So the goal is achieved, at least within the precision that [this method of measuring](https://blog.codingconfessions.com/p/rdtsc) allows. At this point, I don't want to spend any more time on this. But I will try one more thing that I've been curious about: can ChatGPT produce a solution that's faster than GCC's?

## Using ChatGPT as a C compiler
Plugging the prompt
```txt
Compile this C code to x86-64 assembly. Make it run as fast as possible.

<C code>
```
into GPT-5.2 on March 19, 2026 produced the following assembly:[^4]

[^4]: The assembly output from ChatGPT is copied verbatim with the following exceptions: I changed the name of the function, and I added four comments at the top to describe the arguments.

{{< include-code
    file="content/posts/dabbling-in-x86-assembly/calculate_rolling_sums_asm4.s"
    lang="asm" >}}

To be honest, I'm not sure what to think of this. It uses not one but **three** floating point registers. The structure is different in that it separates the main loop into two loops: one where `i < kernel_size`, and one where `i >= kernel_size`. In the first loop body, the `i < n` check is at the beginning, whereas in the second loop body, the `i < n` check is at the end. I suppose this saves a few jumps. It also uses the `inc` instruction to increment the counter variable `i`, which I didn't know existed. Anyway, here's how it fares in the speed comparison:

{{< include-code
    file="content/posts/dabbling-in-x86-assembly/formatted_timing_results/5.txt"
    lang="txt" >}}

So definitely not bad. It's on par with GCC's solution and my best solution, but I don't know why. In my solution, removing a floating point register seemd to make the function run faster. But ChatGPT's solution uses three floating point registers while being about as fast as mine. ChatGPT's solution has the same amount of memory accesses per loop iteration as mine, but it tends to explictly copy array elements to registers before using them. This pattern is avoided in the GCC solution.

## Conclusion
I tried my best to capture the main differences between the five solutions in the table below. I don't know enough about assembly yet to really know which metrics are important in this context, but I think it's a nice overview nonetheless.

| Solution | Additional integer registers used[^5] | Floating point registers used | Number of memory accesses per loop[^6] | Cycles per call |
| --- | --- | --- | --- | --- |
| GCC with `-O2` | `rax`, `r8d`, `r9` | `xmm0` | 3 to 5 | 463,120 +/- 50 |
| ASM1 (first attempt) | `eax`, `r8`, `r9` | `xmm0`, `xmm1` | 2 to 3 | 579,000 +/- 5,000 |
| ASM2 (using expressions) | `eax`, `r8` | `xmm0`, `xmm1` | 2 to 3 | 579,000 +/- 4,000 |
| ASM3 (using expressions, using only one floating point register) | `eax`, `r8` | `xmm0` | 2 to 3 | 463,130 +/- 50 |
| ASM4 (ChatGPT) | `r8`, `r9` | `xmm0`, `xmm1`, `xmm2` | 2 to 3 | 463,120 +/- 40 |

[^5]: By "additional integer registers", I mean integer registers besides those used for passing the function's arguments (`rdi`, `rsi`, `edx`, and `ecx`).

[^6]: The first number is for `i < kernel_size`, and the second is for `i >= kernel_size`.

Anyway, that was an interesting little diversion. Writing some homemade assembly (with a lot of help from Compiler Explorer) was very insightful and much more approachable I expected. I look forward to doing more of it soon.

## Appendix
- Everything was compiled and run on an [Intel Core i5-10500H Processor](https://www.intel.com/content/www/us/en/products/sku/201905/intel-core-i510500h-processor-12m-cache-up-to-4-50-ghz/specifications.html).
- [GitHub repository](https://github.com/peterpaullake/dabbling-in-x86-assembly)