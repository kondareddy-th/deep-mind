// Module 8, Lesson 2 — Kernels: where the same math runs faster (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm8-l2',
  title: '8.2 Kernels — where the same math runs faster',
  subtitle:
    'FlashAttention computes exactly the function you invented in 2.2, does more arithmetic than the naive version, and runs several times faster. Resolving that contradiction rewrites what you think optimisation is — and hands you the single most reusable engineering move on a GPU.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

In lesson 2.2 you invented attention from scratch. Queries, keys, an agreement-meter, a softmax, a
weighted blend of values:

$$\text{Attention}(Q,K,V) = \text{softmax}\!\left(\frac{QK^{\top}}{\sqrt{d_k}}\right)V$$

Now here is FlashAttention, and here are three facts about it.

**One.** It computes *that*. Not an approximation of it, not a sparsified version of it, not "attention
but only over nearby tokens." The same function, the same inputs, the same outputs — agreeing
up to the tiny rounding differences that reordering floating-point additions always introduces
(so not bit-identical, but not an approximation either). Nothing is dropped.

**Two.** It performs **more** arithmetic than the naive implementation. Not incidentally, not as an
unfortunate overhead — *deliberately*. It recomputes quantities it could have saved, and it applies
correction factors the naive version never needs.

**Three.** It is several times faster, and it turned 128k-token context from impossible into routine.

Any two of those facts are comfortable. All three together are an insult to a belief most people
carry without examining it: that "make it faster" means "make it do less." Sit with the contradiction
for a moment. Identical mathematics. More operations. Much less time.

The resolution is the whole lesson, and it is one sentence:

> **The cost was never the math.**

Lesson 8.1 already handed you the instrument that proves it. The roofline said an H100-class chip
does 989 TFLOP/s of bf16 arithmetic and moves 3.35 TB/s of data, so its ridge point sits at about
$989 \times 10^{12} / 3.35 \times 10^{12} \approx 295$ FLOPs per byte. Below that intensity you are
not paying for arithmetic at all — you are paying for **bytes**, and the arithmetic rides along free.

Almost everything in a transformer that is not a large matrix multiply lives *far* below 295. Which
means the question "how do I make this faster?" is, nearly always, the question "**how do I move
fewer bytes?**" — and the answer to *that* question, nearly always, is: stop putting things down.

This lesson is about where computation physically happens on a GPU, why the boundaries between
operations are expensive, and how to erase them.
`,
    },
    {
      type: 'text',
      md: md`
## Zoom in on the ladder

Lesson 4.1 gave you the speed ladder — SRAM, HBM, NVLink, InfiniBand — each rung roughly an order of
magnitude slower than the one above, and it treated HBM as a single rung. Zoom in. Inside one chip
there are more rungs, and the same pattern holds:

| where | how much of it | how fast |
|---|---|---|
| registers | a few hundred KB per SM, tens of MB per chip | hundreds of TB/s |
| SRAM (shared memory / L1) | a couple of hundred KB per SM, tens of MB per chip | tens of TB/s |
| L2 cache | tens of MB, shared by the whole chip | several TB/s |
| HBM | 80 GB | 3.35 TB/s |

Roughly an order of magnitude of bandwidth per step down — though I will be honest that L2 to HBM is
the weakest step in that claim — and, going the other way, three or four orders of magnitude of
*capacity* for each step you descend. That trade is the reason the hierarchy exists at all: fast
memory is small, big memory is slow, and every performance decision on this chip is a negotiation
between those two facts.

Note where 4.1 put FlashAttention: *attention routed through the SRAM rung*. You now get to see what
that sentence actually describes.

## What a kernel is, at intuition level

A **kernel** is one function, launched across thousands of threads at once. Threads are bundled into
**blocks**; a block is assigned to one streaming multiprocessor and its threads share that SM's
SRAM. You write the body once — what one thread does, or in Triton what one *tile* does — and the
hardware runs it everywhere simultaneously. That is the whole programming model, and for our purposes
you need nothing more of it.

But you need two facts about what happens at the *edges* of a kernel, because those two facts are the
entire economics of this lesson.

**First: every launch costs a fixed few microseconds** — host-side dispatch plus device-side setup —
whether the kernel touches four numbers or four billion. A kernel that does 3 microseconds of work
behind a 5-microsecond launch is mostly ceremony.

**Second, and this is the load-bearing one: every kernel reads its inputs from HBM and writes its
outputs back to HBM.** That is the contract. Whatever a kernel held in registers or SRAM while it ran
is *gone* the instant it exits. There is no way to hand a live register file to the next function.

Put those together and you get the sentence to carry out of this section:

> **A kernel boundary is a round trip to the slowest memory on the chip.**

Every time you call a separate operation, you pay that round trip for the privilege of having written
two lines of code instead of one. Usually that is fine. Sometimes it is a catastrophe — and now we can
compute exactly when.
`,
    },
    {
      type: 'text',
      md: md`
## The disaster, derived

Take the humblest operation in lesson 2.5's block: a **residual add**. Elementwise, bf16, two inputs
and one output.

Per element the chip reads 2 bytes of $a$, reads 2 bytes of $b$, writes 2 bytes of $c$ — **6 bytes** —
and performs **one addition**. Arithmetic intensity:

$$I = \frac{1 \text{ FLOP}}{6 \text{ bytes}} \approx 0.17 \text{ FLOPs/byte}$$

Now an **activation** — a GELU, a SiLU. Read 2 bytes, write 2 bytes: 4 bytes per element, and call the
transcendental itself a handful of FLOPs. Intensity lands somewhere around $0.5$ to $2$.

Compare those numbers to 295.

You are two to three orders of magnitude *below* the ridge point. The roofline's verdict is arithmetic,
not opinion: attainable throughput equals intensity times bandwidth. At $I = 0.5$,

$$0.5 \times 3.35 \times 10^{12} = 1.7 \times 10^{12} \text{ FLOP/s} = 1.7 \text{ TFLOP/s}$$

against a peak of 989. That is **0.17% of the machine**. One part in six hundred.

Make it physical, because percentages are easy to nod at and hard to feel. A GELU over one billion
elements in bf16: traffic is $10^9 \times 4 = 4$ GB, which at 3.35 TB/s takes $4/3350 \approx 1.2$
milliseconds. The arithmetic — say $10^{10}$ FLOPs — takes $10^{10}/(989 \times 10^{12}) \approx 10$
microseconds.

**The chip computes for ten microseconds and then waits for twelve hundred.** It is not working
slowly. It is *idle*, holding a completely saturated memory bus, with 99% of its silicon doing
absolutely nothing. This is what a memory-bound operation looks like from the inside.

## And now the chain

One elementwise op is bad. A *sequence* of them is where the waste becomes visible, because the
intermediates between them are things **nobody ever wanted**.

Take a tensor of $N$ elements through five elementwise operations — a normalisation scale, an
activation, a gate multiply, a residual add, a cast. Written the obvious way, that is five kernels,
and each kernel honours the contract:

$$\underbrace{N \text{ read} + N \text{ write}}_{\text{op 1}} + \cdots + \underbrace{N \text{ read} + N \text{ write}}_{\text{op 5}} = 10N \text{ element-movements through HBM}$$

What does the computation *fundamentally* require? You have one input tensor and one output tensor.
Read it once, write it once: $2N$. Everything else — $8N$, **eighty percent of the traffic** — is
bookkeeping. Four intermediate tensors written to the slowest memory on the chip and immediately read
back by the very next function, existing for no reason except that you called five functions instead
of one.

Before I show you the fix, work the numbers yourself. The fix is more satisfying when you have felt
the size of the problem.
`,
    },
    {
      type: 'ponder',
      question: md`Do the arithmetic before reading on. A chain of **five** elementwise operations
runs over a tensor of **one billion elements** stored in bf16 (2 bytes each), on a chip with **3.35
TB/s** of HBM bandwidth and 989 TFLOP/s of compute. **(a)** Total HBM traffic if each operation is its
own kernel. **(b)** Total traffic if all five happen in a single kernel that reads once and writes
once. **(c)** How long does each version take? **(d)** For part (a), roughly what fraction of that
time is the chip actually computing, if the five ops together cost about 10 FLOPs per element?`,
      answer: md`**(a) Unfused.** Each op reads a 2 GB tensor and writes a 2 GB tensor: 4 GB per op.
Five ops: **20 GB**.

**(b) Fused.** Read 2 GB, write 2 GB: **4 GB**. A factor of **5** less — exactly the ratio $10N : 2N$.

**(c) Time.** Unfused: $20 \times 10^{9} / 3.35 \times 10^{12} \approx 6.0$ **ms**. Fused:
$4 \times 10^{9} / 3.35 \times 10^{12} \approx 1.2$ **ms**. Five times faster, and — this is the part
worth staring at — **the two versions compute exactly the same thing.** Not an approximation. Not a
different algorithm. The same arithmetic, on the same numbers, producing the same result — up to
rounding, which fusion usually *improves*, since intermediates can stay in fp32 registers instead of
being rounded to bf16 between kernels. The only difference is where the intermediate values were standing when the next operation
wanted them.

**(d) The fraction spent computing.** $10^{10}$ elements-worth of FLOPs is $10^{10}$ FLOPs, which at
989 TFLOP/s takes about **10 microseconds**. Out of 6,000 microseconds. The chip is doing arithmetic
for roughly **0.17%** of the elapsed time and waiting on memory for the other 99.8%.

Now hold that next to 8.1's hierarchy of wins, which listed kernel work at a modest 1.2–3×. Both
things are true, and the tension between them is worth understanding: the *chain itself* got 5×
faster, but the chain is only a slice of your step time. Amdahl decides what that slice is worth.
Never confuse "I made this 5× faster" with "I made the model 5× faster" — 8.1 exists precisely so
that you compute the second number before celebrating the first.`,
    },
    {
      type: 'text',
      md: md`
## Fusion, which now writes itself

You already know what to do. Load the element once. Do all five operations **while it sits in a
register** — where bandwidth is measured in hundreds of TB/s and the cost is not worth mentioning —
and write the final result back once. One kernel, one round trip, four intermediates that never
existed in HBM at all.

That is a **fused kernel**. It is not a clever trick; it is the refusal to put something down between
two operations that both wanted it.

And here is the rule to carry out of this lesson, in the form you should be able to apply without
thinking:

> **Any maximal run of memory-bound elementwise operations should be one kernel.**

Once you have that sentence, a whole category of software that previously looked like arbitrary
library trivia becomes obvious and predictable:

- **Fused optimizers.** An Adam step (1.6) is roughly ten elementwise operations over four tensors —
  parameters, gradients, first moment, second moment. Written naively, each step drags the entire
  optimizer state through HBM ten times over. Fused, it reads each tensor once and writes back once.
  Same update, same numbers, several times less traffic. This is why the fused flag on your optimizer
  is free money, and why not setting it is a small, silent tax on every step you have ever run.
- **Fused loss functions.** Cross-entropy over a vocabulary-sized logit tensor touches what is often
  the *largest* tensor in the whole training step. A fused loss computes the log-sum-exp, the loss and
  the gradient in one pass, never materialising the softmax probabilities as a separate tensor.
- **Fused norm-plus-activation kernels**, for exactly the reason above.
- **Matmul epilogues** — the sharpest version of the idea. The bias add, the residual add, the
  activation, the cast: all of them can happen *inside the matrix-multiply kernel*, applied to the
  output tile while it is still in registers, before it is ever written. Marginal traffic for a fused
  epilogue is close to zero. The elementwise operation becomes genuinely free, which is the best
  outcome available anywhere in this lesson.

One caution, so you apply the rule and not a cargo-culted version of it. Fusion does not remove a
single FLOP. It removes **round trips**. On a compute-bound operation — one already sitting above the
ridge point, like a big matmul — fusing changes essentially nothing, because you were never waiting on
memory. The roofline tells you which side of that line you are on, and the roofline is 8.1's
instrument, which is why that lesson came first.
`,
    },
    {
      type: 'example',
      title: 'one transformer block, counted in round trips',
      md: md`
Let us price a real block (2.5) rather than an abstract chain. Configuration: $d = 8192$, a gated FFN
with inner width $4d = 32768$, and $T = 32{,}768$ tokens in the batch (say 8 sequences of 4096), all
in bf16.

Two tensor sizes matter:

- the hidden state $H$: $32{,}768 \times 8192 = 2.68 \times 10^{8}$ elements $\approx$ **0.54 GB**
- the FFN intermediate $F$: $32{,}768 \times 32{,}768 = 1.07 \times 10^{9}$ elements $\approx$ **2.15 GB**

Now list only the memory-bound work — the matmuls we leave to the library — and count HBM traffic the
way an unfused eager framework would actually incur it:

| memory-bound op | traffic | why |
|---|---|---|
| RMSNorm, twice | 1.6 GB each = **3.2 GB** | one pass to accumulate row statistics, a second to read and write the scaled values |
| residual add, twice | 1.6 GB each = **3.2 GB** | read two copies of $H$, write one |
| activation on the gate branch | **4.3 GB** | read $F$, write $F$ |
| gate multiply | **6.4 GB** | read two $F$ tensors, write one |
| **total** | **≈ 17.1 GB** | at 3.35 TB/s: **≈ 5.1 ms** |

Against that, the block's matrix multiplies — four attention projections plus three FFN projections —
come to about $7 \times 10^{13}$ FLOPs, which even at *peak* takes about 71 ms.

So look at what we have found. The elementwise work is on the order of $3 \times 10^{10}$ FLOPs:
about **0.04% of the block's arithmetic**. And it consumes about **7% of the block's time**. A
disproportion of roughly 150×. That ratio — trivial share of the math, meaningful share of the clock —
is the signature of memory-bound work, and once you have seen it you will recognise it in every
profile you ever read.

**Now fuse.** Each RMSNorm becomes one kernel that reads a row once, computes its statistic while the
row sits in SRAM, and writes back once: 1.07 GB each. Each residual add folds into the epilogue of the
matmul that produced its input, costing only the read of the residual: 0.54 GB each. The activation
folds into the epilogue of the gate projection, and the gate multiply folds into the epilogue of the
up projection (computing the gate and up projections as one interleaved matmul, so both halves of a
tile are in registers together), so the intermediate $F$ tensors are written **once, already gated**, instead of three
times. Total: about **5.4 GB, or 1.6 ms** — roughly **3.2× less traffic**.

And here is the honest bookkeeping, which is more useful to you than a triumphant one. The block went
from about 76 ms to about 72.6 ms. **A 4.8% improvement.** Amdahl set the ceiling at
$1/(1 - 0.067) \approx 1.07\times$ before we started, and we captured most of it. That is a perfectly
good result and it is nothing like 5×.

**But now change one number.** Run the same block at **batch size 1** for single-stream inference
(3.4). The matmuls collapse into skinny matrix–vector products that are themselves memory-bound —
you are streaming weights, not doing arithmetic — the elementwise tensors become tiny, and suddenly
the dominant costs are launch overhead and round trips rather than FLOPs. In *that* regime the same
fusion, plus graph capture, is routinely worth **2× or more**.

Same kernels. Same model. Opposite verdict. **Where you sit on the roofline is a property of your
batch size, not of your code** — which is why 5.3's MFU discipline and 8.1's profile-first rule are
not bureaucracy. They are the only way to know which of these two worlds you are living in.
`,
    },
    {
      type: 'example',
      title: 'FlashAttention — the paradox, resolved in detail',
      md: md`
Now the flagship, and the puzzle we opened with.

**What the naive path does.** Follow 2.2's formula literally, one kernel per operation, for a sequence
of $n$ tokens:

1. Compute $S = QK^{\top}/\sqrt{d_k}$. That is an $n \times n$ matrix. Write it to HBM.
2. Read $S$ back, apply softmax row-wise, write $P$ to HBM.
3. Read $P$ back, multiply by $V$, write the output.

Count what just happened. The $n \times n$ intermediate crosses the HBM bus about **four times**, and
$n^2$ is the number 2.2 warned you about. At a 128,000-token context, one score matrix at 4 bytes per
entry is the Fermi estimate you did in that lesson: **65 GB**. Per head. Per layer.

Sixty-five gigabytes, moved four times, is 260 GB of traffic — 78 milliseconds at full bandwidth —
for **one head of one layer**. And of course it never gets that far, because 65 GB does not fit
alongside the model on an 80 GB card in the first place. Long context was not slow. It was
*impossible*.

**What FlashAttention does instead.** Cut $Q$ into blocks of rows and $K, V$ into blocks of rows,
sized so that a few tiles fit in an SM's SRAM. For each block of queries, walk over the blocks of keys
and values: load the tiles into SRAM, compute that little patch of scores **there**, and immediately
fold it into a running result. Then discard the patch.

The $n \times n$ matrix is never assembled. It exists only as a sequence of small tiles that live and
die inside SRAM. **It never touches HBM at all** — the 65 GB is never written, never read, never
allocated. Attention routed through the SRAM rung, exactly as 4.1 named it.

**But softmax looks like it forbids this.** To normalise, you need the sum of exponentials over the
*whole* row — and you have only seen a few blocks. Worse, you cannot exponentiate raw scores safely;
you subtract the row maximum first for numerical stability, and you do not know the maximum either.
Softmax appears to demand the complete row before it can produce any output.

**The online softmax** dissolves this, and the algebra is small enough to derive right here. Suppose a
row is split into two chunks. Chunk 1 has maximum $m_1$ and partial denominator
$\ell_1 = \sum e^{s - m_1}$; chunk 2 has $m_2$ and $\ell_2$. What is the denominator over the union?
Let $m = \max(m_1, m_2)$. Every term in chunk 1 was exponentiated against the wrong baseline, and
correcting a baseline in an exponential is a *multiplication*:

$$\ell = e^{m_1 - m}\,\ell_1 + e^{m_2 - m}\,\ell_2 \qquad\text{and likewise}\qquad \mathbf{o} = e^{m_1 - m}\,\mathbf{o}_1 + e^{m_2 - m}\,\mathbf{o}_2$$

That is the entire trick. Carry a running maximum, a running denominator, and a running weighted sum
of value vectors. When a new tile arrives with a bigger maximum, **rescale what you already have by
one scalar factor** and add the new contribution. Divide by the final denominator at the very end.
Softmax never needed the whole row — it needed the ability to *correct itself*, and exponentials
correct with a multiply.

**And the backward pass?** Gradients need the scores again. The naive approach saves them — which is
the 65 GB back again, now as stored activations. FlashAttention instead **recomputes each tile** from
$Q$, $K$ and $V$ during the backward pass. That is lesson 4.1's activation checkpointing — recompute
rather than store — implemented *inside a single kernel* rather than across layers.

**Now settle the accounts.** FLOPs went **up**: the rescaling multiplications, plus a full
recomputation of the scores in the backward pass. Bytes went **down** enormously: the dominant
intermediate never materialises, so attention's memory footprint falls from $O(n^2)$ to $O(n)$ and
HBM accesses drop by close to an order of magnitude on the shapes reported in the original paper.
Wall-clock speedups of roughly 2–4× on typical shapes, and more at long context.

Feed both facts to the roofline. Below a ridge point of 295 FLOPs per byte, **arithmetic is the free
resource and bytes are the scarce one.** Spending free resource to buy scarce resource is not a
paradox. It is the only sensible thing to do, and the naive implementation's mistake was never
"too many FLOPs" — it was writing down a number it was about to read back.
`,
    },
    {
      type: 'ponder',
      question: md`FlashAttention does **more** arithmetic than the naive implementation and runs
several times faster. State the general principle that this establishes — the one-sentence version you
could apply to a problem you have never seen. Then name at least two other techniques from this
curriculum with exactly the same shape, and one with the *opposite* shape. Finally: what determines
which direction you should push?`,
      answer: md`**The principle:** *optimisation is not "do less work" — it is "spend the resource you
have on the resource you lack."* Or, sharpened for this chip: **trade the abundant resource for the
scarce one.** Below the ridge point, FLOPs are abundant. You are handed 295 of them per byte before
compute becomes the constraint, and if you are not using them they are not saved for later — they
simply evaporate, one clock at a time, while the chip waits on memory. Unused capacity on a saturated
machine is not thrift. It is waste.

**Same shape — recompute instead of store:**

- **Activation checkpointing (4.1):** throw away forward activations, recompute them in the backward
  pass. Roughly 30% more FLOPs, dramatically less memory, and often *faster* end to end because the
  memory it frees lets you raise the batch size.
- **MLA (8.3):** cache a small latent vector and rebuild the per-head keys and values on demand,
  instead of storing them. Extra matmuls, roughly 28× less cache.
- **FlashAttention's own backward pass**, which is this move nested inside the technique that already
  made the move once.

**Opposite shape — store instead of recompute:** the **KV cache** itself (3.3). There, recomputing all
previous keys and values every step would be quadratic disaster, so you spend memory to buy FLOPs. And
**Mixture-of-Experts** (4.3) spends parameters — capacity, memory — to save FLOPs per token.

**What determines the direction:** *which resource is actually binding, measured, on your hardware,
at your batch size.* Nothing else. The same technique is brilliant on one machine and foolish on
another, and it can flip between them when you change the batch size on the same machine. This is why
8.1's profile-first discipline is not a chore but the *precondition* for having an opinion — and it is
exactly the diagnostic that opens the DeepSeek teardown, where the scarce resource turned out to be
neither FLOPs nor HBM but bytes crossing between machines.`,
    },
    {
      type: 'text',
      md: md`
## Compilers: fusion you do not have to write

You have now done by hand what a compiler exists to do automatically. So the honest next question is:
why would you ever write a kernel yourself?

Modern frameworks can **capture your model as a graph** — trace what operations run, on what tensors,
in what order — and then compile that graph rather than interpreting it operation by operation. What
that buys, concretely:

**1. Operator fusion.** The compiler finds maximal chains of memory-bound elementwise operations and
generates a single kernel for each. This is precisely the transformation you just derived, applied
everywhere, for free, including in the corners of your model you would never have bothered to profile.
(Many of these compilers generate the fused kernel *in Triton*, which is the next section.)

**2. Memory planning and buffer reuse.** The graph makes tensor lifetimes explicit, so the compiler
knows exactly when a buffer is dead and can hand its memory to the next tensor instead of round-tripping
through an allocator. Lower peak memory, which — via batch size — often converts directly into speed.

**3. Kernel selection and autotuning.** Which matmul implementation, which tile sizes, which
vectorisation width? The compiler can benchmark candidates at compile time on your actual shapes and
keep the winner. You are unlikely to beat this by hand, and you would have to redo it per GPU
generation.

**4. Dead-code elimination and constant folding.** The ordinary compiler repertoire, now applied to
tensor programs.

**5. Reduced launch overhead.** Once the launch sequence is fixed, it can be recorded once and replayed
as a single submission (CUDA graphs), collapsing hundreds of few-microsecond launches into one. On
batch-size-1 inference, where the trace is mostly *gaps between kernels*, this alone can be the largest
single win available to you.

### What a compiler cannot do

It cannot change your algorithm.

That sentence is worth more than the list above. A compiler will happily fuse your attention; it will
never invent MLA. It will not decide that your KV cache should have been a low-rank latent, that your
dense FFN should have been a mixture of experts, or that your $O(n^2)$ operation admits an $O(n \log n)$
formulation. It optimises the **schedule** of the computation you wrote. Choosing a *different*
computation — one with different parameters, different memory behaviour, and slightly different outputs
— is a research decision, and no compiler is permitted to make it on your behalf.

Which sets the order of operations for your whole career in efficiency: **algorithm first, schedule
second.** 8.1 put architectural and algorithmic wins at the top of the hierarchy and kernels near the
bottom for exactly this reason.

### Honest limits

Compilers are close to free, so turn them on — but know how they fail, because the failures are
specific and recognisable:

- **Graph breaks.** Data-dependent control flow — branching on a tensor's *value*, pulling a scalar
  back to the host, printing, an unsupported operation — forces the compiler to cut the graph and hand
  control back to the interpreter. Fusion cannot cross that seam, and a break in the middle of your
  hottest chain quietly deletes most of the benefit. Worse, it is invisible unless you go looking, so
  learn to ask your compiler to report its breaks.
- **Recompilation.** Changing shapes trigger recompiles, and each one costs seconds to minutes. Variable
  sequence lengths, a final ragged batch, or a bucketing scheme with too many buckets can leave you
  compiling more than computing. Short jobs may never amortise the first compile at all.
- **Numerics drift.** A fused kernel may accumulate in a different order or a different precision than
  the eager sequence did. The results are usually *better*, occasionally different enough to matter, and
  always a nuisance when you are chasing an exact-match regression.
- **Debugging.** The code that ran is not the code you wrote. Stack traces point into generated kernels;
  a bug can live in the boundary between graph and interpreter rather than in either.

The practical policy: compile first, because it costs one line and typically returns tens of percent
(much more on small-batch inference). Reach for a hand-written kernel only when you have measured what
the compiler left on the table.
`,
    },
    {
      type: 'text',
      md: md`
## Triton: why kernels stopped being a specialist craft

Writing a CUDA kernel means managing threads, warps, shared-memory allocation, bank conflicts,
synchronisation barriers, and memory coalescing. It is a genuine craft, it takes years, and a
half-competent attempt is usually *slower* than the library function it replaced.

**Triton** changes the unit of thought. You write in a Python-like language, and your program describes
what happens to one **block** — a tile — rather than what happens to one thread. You compute tile
indices, load a tile, do arithmetic on whole tiles, store a tile. The compiler decides how threads
divide the tile, how to vectorise the loads, what goes in shared memory, and where the barriers belong.

The consequence is a shift in who can do this work. A fused kernel for a novel operation went from
*weeks, by a specialist* to *an afternoon, by a researcher who understands their own operation*. That
is why so many new architectural ideas now ship with a hand-written kernel on day one, and it is a real
part of why the pace of architecture research changed.

There is a caveat, and it points somewhere useful. On the hardest kernels — large matmuls exploiting
the newest tensor-core features — hand-tuned CUDA and CUTLASS still win, and Triton may reach 80–95% of
their throughput. But look at *which* kernels you actually want to write. They are the memory-bound
fusions, and for those the target is **bandwidth, not instruction-level perfection**. Saturating a
memory bus is comparatively easy; missing peak FLOPs by 15% on an operation that runs at 0.17% of peak
anyway is beneath noticing. **The kernels a high-level language handles well are exactly the kernels
worth writing yourself.** That is a happy accident, and it is doing a lot of work in the current
research ecosystem.

## One more thing that lives inside kernels: precision

A detail that connects this lesson to 4.4 and is easy to miss until it bites you. **Mixed precision is
not a model-level setting. It is a decision made inside a kernel**, physically, line by line.

A well-written fused kernel loads bf16 from HBM, immediately promotes to fp32 in registers, accumulates
there, and casts back to bf16 only on the final store. The bytes moved are the narrow ones; the
accumulation is the wide one. That is 4.4's principle — *quantize what is read, protect what
accumulates* — and the fused kernel is the place where it actually happens.

FlashAttention is the canonical example again: it loads $Q$, $K$ and $V$ in bf16, and keeps the running
maximum, the running denominator and the output accumulator in fp32, because those are the quantities
that compound across the whole row (1.1's drunkard's walk in an unwelcome role, as 8.3 puts it). Fuse
carelessly — accumulate a normalisation statistic in bf16 across ten thousand elements — and you will
lose real accuracy while your benchmark still shows a lovely speedup. **The numerics live in the
kernel.** If you write one, that responsibility is now yours.
`,
    },
    {
      type: 'ponder',
      question: md`You profile your training step (8.1's discipline, dutifully applied). Attention is
**15%** of step time. You have just finished this lesson, you understand tiling and online softmax, and
you are itching to write a custom attention kernel — genuinely, it is the most interesting thing you
could do this month. Compute the ceiling on that project and decide whether to proceed. Then state the
condition under which your answer would flip.`,
      answer: md`**The ceiling first, before any enthusiasm is permitted.** Amdahl: if a component is
fraction $f$ of runtime and you make it take *zero* time,

$$\text{speedup}_{\max} = \frac{1}{1 - f} = \frac{1}{0.85} \approx 1.18\times$$

An 18% improvement, and that is the *infinitely optimistic* bound — it assumes your kernel makes
attention instantaneous. A genuinely excellent kernel might take attention from 15% of the step to 8%,
which is about **1.08×**. Eight percent.

**The cost side, stated honestly.** Weeks of work. A permanent maintenance obligation — your kernel
needs updating for the next GPU generation, the next framework version, the next architectural tweak,
and you will be the only person who can do it. A correctness risk in the most numerically delicate
part of your model, where a subtle bug shows up as slightly worse loss six hours into a run rather
than as an exception. And an opportunity cost: those weeks were the scarcest resource in the whole
system.

**So: no.** And the reason is the other 85%. Somewhere in that profile is a 45% item you have not
looked at, whose ceiling is $1/0.55 \approx 1.8\times$, and which is probably a data loader, an
unfused optimizer, a synchronisation stall, or a precision setting — something dull that takes a
morning. **Go find that.** The discipline is not "kernels are bad"; it is *compute the ceiling before
you start, not after you finish*, and then spend your weeks where the ceiling is high.

Also, in this particular case, notice the specific absurdity: a well-optimised attention kernel
already exists, has been tuned by people who do this full-time, and is one import away. You would be
spending weeks to build a slower FlashAttention.

**When the answer flips.** Three conditions, and you need something like all of them:

1. **The component is large.** At 45% the ceiling is 1.8×; at 70% it is 3.3×. Now weeks may be
   justified.
2. **There is no good library implementation** — typically because the operation is *yours*, something
   you invented, so nobody has written its kernel. This is the most common legitimate reason a
   researcher writes a kernel: not to beat the library, but because there is no library.
3. **The economics multiply.** If this runs in production for a million users, 8% of inference cost
   forever is a large sum, and an engineering team exists to maintain it. A permanent 8% at scale is a
   completely different proposition from a permanent 8% on your one research run.

Note that (2) is the interesting one for you specifically, and it is the good news hiding in this
ponder: the kernel you should write is not a faster version of something that exists. It is the first
version of something that does not.`,
    },
    {
      type: 'text',
      md: md`
## The decision rule, stated plainly

Enthusiasm for kernels is a newcomer trap, and it is worth naming directly because it is so
sympathetic. Kernels are the most *fun* layer of the stack — closest to the metal, most visibly
clever, most satisfying to get right. They are almost never the most *valuable* place to spend a week.
The correlation between "interesting to work on" and "worth working on" is weaker than anyone would
like.

So here is the order to try things, cheapest and highest-leverage first:

**0. Fix the algorithm.** Is the operation necessary at all? Is there a formulation with better
asymptotics, a smaller cache, a conditional cost? This is where the large wins live (8.1's hierarchy),
and no amount of kernel work substitutes for it.

**1. Use the library.** cuBLAS, cuDNN, FlashAttention, the fused optimizer, the fused loss. These are
written by specialists, tuned per architecture, tested by everyone. You will not beat them and you
should not try.

**2. Turn on the compiler.** One line. It fuses your elementwise chains, plans your memory, autotunes
your kernels, and collapses your launches. Then check for graph breaks, because a break in the hot
path silently eats the benefit.

**3. Only now, consider writing a kernel** — and only if *all three* of these hold:

- **(a) Profiling shows one operation dominating.** Not "feels slow" — measured, with the Amdahl
  ceiling $1/(1-f)$ computed *first*, so you know the maximum reward before you spend the first hour.
- **(b) It is memory-bound with a fusion opportunity, or has no efficient library implementation.**
  Memory-bound means the roofline says bytes are your bill, so fusing them away is a real win. No
  library implementation usually means the operation is novel — which is the honest researcher's case
  for a kernel.
- **(c) The shape is stable enough to be worth maintaining.** A kernel tuned for shapes you abandoned
  next month is a liability with no offsetting asset.

If those three do not all hold: **use the library.** Your custom kernel will be slower, buggier and
unmaintained, and the week it cost you was the most valuable thing in the whole accounting.

## What you now own

1. **The resolution of the puzzle.** FlashAttention computes exactly 2.2's function, does more
   arithmetic, and runs several times faster, because **the cost was never the math**. Below the
   roofline's ridge point of ~295 FLOPs/byte, you pay for bytes and the arithmetic is free.
2. **The hierarchy, zoomed in.** Registers, SRAM, L2, HBM — roughly an order of magnitude of bandwidth
   per rung, and the rule that governs everything: **a kernel boundary is a round trip to HBM.** Plus a
   fixed few microseconds of launch overhead per kernel, which dominates at small batch.
3. **Why elementwise operations are a disaster, derived.** A couple of FLOPs against four-plus bytes
   gives intensity well under 1, and the roofline converts that into **about 0.17% of peak** — a chip
   computing for ten microseconds and waiting for twelve hundred.
4. **Fusion, and its rule.** A chain of five ops moves $10N$ through HBM when the computation needs
   $2N$; do it in one kernel and the traffic falls 5×. **Any maximal run of memory-bound elementwise
   operations should be one kernel** — which is what fused optimizers, fused losses, fused norms and
   matmul epilogues all are.
5. **FlashAttention in mechanism, not slogan.** Tile $Q$, $K$, $V$ into SRAM; combine partial results
   with an **online softmax** (running max, running denominator, one rescaling multiply per merge);
   never materialise the $n \times n$ matrix — the 65 GB at 128k context simply never exists; recompute
   tiles in the backward pass, which is 4.1's checkpointing inside a kernel.
6. **The general principle:** trade the abundant resource for the scarce one. Recompute to save bytes
   when bytes bind; store to save FLOPs when FLOPs bind. Which direction is a *measurement*, not a
   preference.
7. **Compilers:** fusion, memory planning, autotuning, dead-code elimination, launch-overhead collapse
   — automatically. But they optimise the **schedule**, never the **algorithm**: a compiler will fuse
   your attention and will never invent MLA. Watch for graph breaks, recompilation, dynamic shapes and
   opaque debugging.
8. **Triton:** block-level rather than thread-level semantics, so a researcher writes a fused kernel in
   an afternoon — and memory-bound kernels, the ones worth writing, are exactly the ones where a
   high-level language loses nothing.
9. **The decision rule:** algorithm, then library, then compiler, then — only if it dominates the
   profile, is memory-bound or unimplemented, and has a stable shape — your own kernel. Compute the
   Amdahl ceiling before you start. At 15% of step time, that ceiling is 1.18× and the answer is no.
10. **Precision lives inside kernels.** Load narrow, accumulate wide, store narrow — 4.4's principle,
    physically located in the fused kernel where you write it or fail to.

Next lesson: a lab that could not buy its way past its constraint — and every trick they invented turns
out to be this lesson's question asked one level up: *what was expensive, and what structure made it
cheap?*
`,
    },
  ],
  questions: [
    {
      id: 'm8-l2-q1',
      kind: 'mcq',
      prompt: md`FlashAttention computes exactly the same function as standard attention, performs
**more** arithmetic than the naive implementation, and runs several times faster. What is the correct
explanation?`,
      options: [
        'It approximates the softmax over distant tokens, discarding attention weights small enough not to matter',
        'It runs the score matrix multiply in lower precision, halving the bytes moved per entry',
        'It never writes the n × n score matrix to HBM — tiling plus an online softmax keep every intermediate in SRAM, so the extra arithmetic is spent in a currency the chip has spare while the bytes, which it does not have spare, collapse',
        'It is the first implementation able to use tensor cores for the score matrix multiply, which the naive version computes on general-purpose units',
      ],
      answer: 2,
      explain: md`The whole point is that it is **exact** — same inputs, same outputs, equal up to
floating-point rounding (not an approximation). Option A describes a completely different family (sparse, sliding-window
and linear attention): those are real techniques and genuinely useful, but they *approximate*, and
confusing them with FlashAttention is the single most common misunderstanding in this area. Option B
confuses this with quantization (4.4), a separate and stackable lever. Option D is simply false — the
naive version uses tensor cores for its matmuls too.

The mechanism is the roofline (8.1). Below a ridge point of ~295 FLOPs/byte you are billed in bytes,
and the naive path's bill is dominated by writing an $n \times n$ intermediate to HBM and reading it
back. Delete that traffic and you can afford to pay quite a lot of extra arithmetic, because
arithmetic below the ridge point is free.`,
    },
    {
      id: 'm8-l2-q2',
      kind: 'numeric',
      prompt: md`A chain of **7** memory-bound elementwise operations runs over one tensor, each
operation reading it and writing it as its own kernel. By what **factor** does fusing all seven into a
single kernel reduce HBM traffic?`,
      answer: 7,
      tolerance: 0.5,
      explain: md`Unfused: each op moves $N$ reads plus $N$ writes, so seven ops move $14N$. Fused:
read once, write once, $2N$. The ratio is $14N/2N = \mathbf{7\times}$ — for a chain of $k$ such
operations the factor is simply $k$, because the fundamental requirement is always one read and one
write and everything else is bookkeeping between kernels.

Two caveats to keep the rule honest. The traffic ratio equals the *speedup* ratio only while the chain
stays memory-bound — which for elementwise work at intensity well under 1 it certainly does. And the
speedup applies to the chain, not to your model: Amdahl still governs what a 7× on one slice is worth
overall.`,
    },
    {
      id: 'm8-l2-q3',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, build the case for fusion from first principles —
do not cite the rule, produce it. (1) Compute the arithmetic intensity of a bf16 elementwise operation
that does 2 FLOPs per element, reading one tensor and writing one. (2) Using 8.1's ridge point of
about 295 FLOPs/byte and a peak of 989 TFLOP/s, state what fraction of peak that attains and describe
what the chip is physically doing while it runs. (3) Count HBM traffic for a chain of $k$ such
operations, unfused and fused, in units of $N$ elements. (4) State the general rule and the speedup it
predicts. (5) Give **two** distinct conditions under which the rule stops holding.`,
      rubric: md`**(1) Intensity.** Read 2 bytes, write 2 bytes: 4 bytes per element, 2 FLOPs per
element, so $I = 2/4 = 0.5$ FLOPs/byte.

**(2) Fraction of peak.** The roofline's memory-bound branch gives attainable throughput
$= I \times \text{bandwidth} = 0.5 \times 3.35 \times 10^{12} = 1.7$ TFLOP/s, against 989 TFLOP/s of
peak: about **0.17%**, one part in roughly six hundred. Physically: the memory bus is completely
saturated and the arithmetic units are idle almost all of the time. Credit for saying the chip is not
"slow" but *waiting* — this distinction is the whole diagnosis.

**(3) Traffic.** Unfused, each operation reads $N$ and writes $N$, so the chain moves $2kN$. Fused,
the data is read once and written once: $2N$. The $(2k-2)N$ difference is entirely intermediate
tensors that no one ever wanted to read.

**(4) The rule.** *Any maximal run of memory-bound elementwise operations should be a single kernel*,
with predicted speedup for that chain of $k\times$ — because on the memory-bound branch time is
proportional to bytes.

**(5) Two genuine failure conditions** (any two of):

- **The chain is not memory-bound.** If the operations are expensive enough per element to push
  intensity above the ridge point, you were never waiting on memory and fusion buys nothing. Fusion
  removes round trips, not FLOPs.
- **The working set stops fitting.** Fusing forces the intermediate state to live in registers and
  SRAM. Too much per-thread state causes register spills to HBM (reintroducing exactly the traffic you
  removed) or forces occupancy down until the memory bus is no longer saturated.
- **An intermediate is genuinely needed elsewhere** — another consumer reads it, or the backward pass
  needs it saved — so it must be written regardless, and the fused version has to write it anyway.
- **A graph break sits inside the chain** — data-dependent control flow, a host synchronisation — so
  fusion cannot cross the seam.
- **The tensors are tiny**, in which case launch overhead rather than bandwidth dominates; fusion still
  helps, but for a different reason, and the $k\times$ prediction is the wrong model.

Full credit requires the arithmetic in (1)–(3) produced by derivation rather than recall, plus two
conditions in (5) with reasons attached.`,
    },
    {
      id: 'm8-l2-q4',
      kind: 'mcq',
      prompt: md`You profile a small model serving one request at a time. GPU kernels account for only
about 40% of wall-clock; the rest of the trace is *gaps between kernels*, and there are several hundred
tiny kernels per generated token. What is the best first move?`,
      options: [
        'Buy a GPU with higher HBM bandwidth — the memory bus is clearly the bottleneck',
        'Switch the model to fp8 to halve the bytes moved per parameter',
        'Increase threads per block so each kernel uses the SMs more fully',
        'Capture the model as a graph: fuse the elementwise chains so there are far fewer kernels, and replay the remaining launch sequence as a CUDA graph so each one costs less',
      ],
      answer: 3,
      explain: md`Read the symptom precisely. **Gaps** between kernels are not bandwidth — a
bandwidth-bound model shows kernels that *run* for a long time, not a GPU sitting idle between them.
Hundreds of launches per token, each carrying a few microseconds of fixed host and device overhead,
means you are paying for ceremony rather than work. Fusion attacks the *number* of launches; graph
capture attacks the *cost* of each remaining one.

Options A and B are the tempting ones because they are correct answers to a different question: they
address bandwidth, which is what limits you *after* you fix the launch problem — at batch size 1 you
will indeed find yourself streaming weights (3.4). Doing them first buys nothing, because you are not
bandwidth-bound yet. Option C is a real tuning knob that leaves the launch count untouched. This is
8.1's rule in miniature: fix what the profile actually shows, not what you already know how to fix.`,
    },
    {
      id: 'm8-l2-q5',
      kind: 'numeric',
      prompt: md`**Fermi (paper first, calculator last).** A pure elementwise operation has arithmetic
intensity about **0.5 FLOPs/byte**. The chip peaks at **989 TFLOP/s** and moves **3.35 TB/s**. Roughly
what **percentage of peak FLOPs** can this operation possibly attain? (Generous tolerance — the point
is the order of magnitude and what it feels like.)`,
      answer: 0.17,
      tolerance: 0.08,
      explain: md`Attainable throughput on the memory-bound branch is intensity times bandwidth:
$0.5 \times 3.35 \times 10^{12} = 1.7 \times 10^{12}$ FLOP/s. As a fraction of peak:
$1.7/989 \approx 0.0017$, or about **0.17%** — roughly **one part in six hundred** of the machine.

Sit with that. Every unfused elementwise chain in your model — every separate normalisation scale,
activation, residual add, cast, and every step of an unfused optimizer — runs at about one six-hundredth
of the hardware you are paying for. That is why 8.1's ridge point of 295 FLOPs/byte matters so much:
at intensity 0.5 you are not near the ridge, you are 590× below it, and no amount of tuning inside the
kernel changes that. Only moving fewer bytes does.`,
    },
    {
      id: 'm8-l2-q6',
      kind: 'mcq',
      prompt: md`Which of the following will a graph compiler **not** do for you?`,
      options: [
        'Fuse a chain of elementwise operations into one generated kernel',
        'Reuse buffers, so intermediate tensors share memory once their lifetimes end',
        'Replace your standard multi-head attention with a latent-compressed variant that caches far less per token',
        'Choose matmul tile sizes by benchmarking candidates against your actual shapes at compile time',
      ],
      answer: 2,
      explain: md`A compiler optimises the **schedule** of the computation you wrote; it does not
choose a different computation. Fusion, buffer reuse, autotuning, dead-code elimination and
launch-overhead collapse are all scheduling. Swapping MHA for MLA (8.3) changes the parameters, the
memory behaviour *and* the outputs — it is an architectural and quality-affecting research decision,
and no compiler is allowed to make it for you.

The practical corollary is the order of operations for your whole efficiency practice: **turn the
compiler on early, because it is nearly free — and never expect it to rescue an algorithm.** A
compiler will fuse your attention beautifully. It will not invent a better attention.`,
    },
    {
      id: 'm8-l2-q7',
      kind: 'numeric',
      prompt: md`At a context length of **32,768** tokens, how many **gigabytes** is a single
$n \times n$ attention score matrix at **2 bytes** per entry — the intermediate that FlashAttention
never materialises? (One matrix, one head, one layer. Use 1 GB $\approx 10^9$ bytes.)`,
      answer: 2.1,
      tolerance: 0.3,
      explain: md`$32{,}768^2 = 1.07 \times 10^{9}$ entries, times 2 bytes $= 2.15 \times 10^{9}$
bytes $\approx$ **2.1 GB**.

Now scale it, because the per-head figure understates the situation absurdly. A model with 32 heads
across 32 layers would materialise on the order of $2.1 \times 32 \times 32 \approx$ **2,200 GB** of
score matrices for a single sequence. And the naive path does not touch each one once — it writes the
scores, reads them for softmax, writes the probabilities, reads them for the value multiply. At 128k
context the same arithmetic gives 2.2's famous **65 GB** for one matrix at 4 bytes per entry, which
does not fit on the card at all. FlashAttention's headline is not that this traffic got cheaper. It is
that the tensor **never exists**.`,
    },
    {
      id: 'm8-l2-q8',
      kind: 'written',
      prompt: md`**The online softmax, mechanically.** Softmax appears to need every score in a row
before it can normalise anything — yet FlashAttention emits a correct result while having seen only a
few tiles. On paper: (1) define the running quantities carried per row and write the correction applied
when a new tile arrives; (2) explain why a running *maximum* is carried at all, and why correcting it
is cheap; (3) describe what the backward pass does instead of storing the score tiles, and name the
earlier technique it is a special case of; (4) state precisely what is, and what is not, identical to
the attention of lesson 2.2.`,
      rubric: md`**(1) The running state and the merge.** Per row, carry a running maximum $m$, a
running denominator $\ell$, and a running output accumulator $\mathbf{o}$ (unnormalised, a weighted sum
of value vectors). When a tile with its own maximum $m_2$ and partial sums $\ell_2$, $\mathbf{o}_2$
arrives, set $m = \max(m_1, m_2)$ and

$$\ell = e^{m_1 - m}\ell_1 + e^{m_2 - m}\ell_2, \qquad \mathbf{o} = e^{m_1 - m}\mathbf{o}_1 + e^{m_2 - m}\mathbf{o}_2$$

Divide $\mathbf{o}$ by $\ell$ once, at the very end. Credit specifically for seeing that the fix is a
*rescale of what you already have*, not a revisit of what you already discarded.

**(2) Why a maximum.** Raw scores can be large, and $e^{s}$ overflows; subtracting the row maximum
before exponentiating is the standard numerically-stable softmax (2.2) and leaves the result unchanged
because the same factor cancels from numerator and denominator. It is cheap to correct because changing
the baseline of an exponential is a *multiplication*: $e^{s - m_1} = e^{m_1 - m}e^{s - m}$. One scalar
factor per row per merge fixes every term at once.

**(3) The backward pass** recomputes the score tiles from $Q$, $K$ and $V$ rather than storing them —
which is **activation checkpointing** (4.1), recompute-instead-of-store, applied *inside a single
kernel* instead of across layers. Extra FLOPs, no $O(n^2)$ storage.

**(4) Identical / not identical.** *Identical:* the mathematical function, the inputs, and the outputs
— it is exact attention, not an approximation, with no sparsity and nothing dropped. *Not identical:*
the order of floating-point operations (so results agree only up to floating-point reordering, which is
also why a fused version can be slightly *more* accurate); the number of FLOPs performed, which is
higher; and the memory traffic and footprint, which fall from $O(n^2)$ to $O(n)$.

Full credit requires the merge formula in (1) and the explicit exactness claim in (4). Saying "it
approximates attention efficiently" is the failure this question exists to catch.`,
    },
    {
      id: 'm8-l2-q9',
      kind: 'numeric',
      prompt: md`Your profile shows one component consuming **15%** of step time. If a heroic custom
kernel made that component take **zero** time, by what factor would the whole step speed up? (Give the
speedup factor, two decimals.)`,
      answer: 1.18,
      tolerance: 0.05,
      explain: md`Amdahl (8.1): $\text{speedup}_{\max} = 1/(1-f) = 1/0.85 \approx \mathbf{1.18\times}$.

And that is the *infinitely optimistic* bound — it assumes the component becomes instantaneous. A
genuinely excellent kernel might take it from 15% to 8%, which is about 1.08×. For weeks of work, a
permanent maintenance burden, and a correctness risk in code that fails silently as slightly worse
loss rather than as an exception.

The habit this question is training: **compute the ceiling before you start, not after you finish.**
Anything at 15% is telling you to go look at the other 85%, where something is 45% of your step time
with a ceiling of $1/0.55 \approx 1.8\times$ and probably takes a morning to fix.`,
    },
    {
      id: 'm8-l2-q10',
      kind: 'mcq',
      prompt: md`Which situation most justifies writing a custom kernel?`,
      options: [
        'A large dense matmul is 60% of step time, and the library implementation is already achieving about 70% of peak FLOPs',
        'A novel gated normalisation you invented is 30% of step time, currently runs as nine separate elementwise kernels, and its shape is fixed for the whole project',
        'Attention is 15% of step time, you have just learned how tiling and online softmax work, and it is by far the most interesting thing in the profile',
        'Your training loop spends 55% of wall-clock in data loading, and you would like the GPU portion to be faster regardless',
      ],
      answer: 1,
      explain: md`Three conditions must hold together: the operation **dominates the profile**, it is
**memory-bound with a fusion opportunity or has no library implementation**, and its **shape is stable
enough to maintain**. Option B has all three — 30% gives a ceiling of $1/0.7 \approx 1.43\times$, nine
elementwise kernels is the textbook fusion case, and "novel, invented by you" means no library will
ever cover it. That last point is the honest researcher's real reason to write kernels: not to beat the
library, but because there isn't one.

Option A is the biggest item in the profile and therefore the tempting answer, but it fails the second
condition badly: a tuned library matmul at 70% of peak is compute-bound and written by specialists, so
your realistic headroom is small and your realistic outcome is slower. Option C fails the first
condition — a 1.18× ceiling — and states the trap out loud: "most interesting" is not a criterion.
Option D fails 8.1's opening rule; the GPU is not the bottleneck at all, and every hour spent on
kernels there is an hour not spent on the data loader that owns 55% of your time.`,
    },
    {
      id: 'm8-l2-q11',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old.** A kid asks: *"If the computer does MORE steps, how
can it possibly be faster?"* Write out the explanation. You must get three things across: (1) why
*fetching* is the slow part and *thinking* is the fast part on this kind of machine; (2) the trick of
doing all your work while the ingredients are still out on the counter, instead of putting each one
back in the pantry between steps; (3) why sometimes *redoing* a small piece of work is cheaper than
walking back to fetch the answer you saved earlier. Invent your own analogy — inventing a better one
than the lesson's is worth more than borrowing it.`,
      rubric: md`Grade the teaching, not the vocabulary. A "nailed it" answer must:

1. **Establish the speed gap concretely.** The kid must end up believing that the computer thinks
   *unbelievably* faster than it fetches — something like: the chef can chop for one second, but
   walking to the pantry takes ten minutes. Best answers give a ratio and stick to it (the honest
   figure is roughly 600× for the operations in this lesson). If the kid comes away thinking "the
   computer is slow," the explanation has failed; the point is that it is *waiting*, not *working
   slowly*.
2. **Make fusion physical.** The counter-versus-pantry move: if you have five things to do to an
   ingredient, do all five while it is out, instead of putting it away and fetching it again between
   each one. Four unnecessary round trips vanish and nothing about the recipe changed. Any equivalent
   analogy earns full marks — a workbench, a desk versus a filing cabinet in another building, a
   backpack versus a locker.
3. **Land the paradox.** Since walking is so expensive and chopping is so cheap, it can genuinely be
   faster to *chop it again* than to walk back to where you stored the chopped version. That is why
   doing more steps can take less time — and the kid should be able to repeat this in their own words.
   Bonus credit for the general form: *use the thing you have plenty of to save the thing you are short
   of.*
4. **Jargon audit.** HBM, SRAM, kernel, fusion, bandwidth, arithmetic intensity, roofline, memory-bound
   — any of these used without a kid-level translation first is **partial at best**. "It avoids
   materialising the intermediate tensor" is not an explanation; it is the thing you were supposed to
   explain. This is the failure mode the exercise exists to catch.`,
    },
    {
      id: 'm8-l2-q12',
      kind: 'written',
      prompt: md`**Write the plan.** Your training step takes **100 ms**. The profile says: library
matmuls **52 ms** (hitting about 65% of peak), a chain of eleven elementwise operations in a loss
function you wrote yourself **21 ms**, attention **15 ms** (already FlashAttention), the optimizer step
**9 ms** (spread across eleven small kernels per parameter tensor), everything else **3 ms**. On paper,
write the plan a colleague could execute: what you do first, second, third; the Amdahl ceiling on each
intervention; what you deliberately leave alone and why; and exactly where the compiler and where a
hand-written Triton kernel each belong.`,
      rubric: md`Grade this as a supervisor reading a work plan. The ordering matters more than the
list.

**Ceilings, computed first** (any plan that skips this is incomplete): loss chain 21% → $1/0.79
\approx 1.27\times$. Optimizer 9% → $1.10\times$. Attention 15% → $1.18\times$. Matmuls 52% →
$2.08\times$ in principle.

**First: the optimizer, because it is free.** Nine percent is not the biggest number, but the fix is
switching on a fused optimizer that already exists — a keyword argument, not a project. Eleven small
kernels per parameter tensor dragging the optimizer state through HBM repeatedly is the canonical
unfused chain. Ranking by *ceiling divided by effort* rather than by raw size is the single most
important judgement in this answer, and it is worth full credit on its own.

**Second: turn on the compiler**, and measure. It should fuse the eleven-operation loss chain
automatically. Then check for graph breaks — a custom loss is exactly where data-dependent control flow
and unsupported operations hide, and a break in the middle of the chain silently deletes the benefit.
Credit for saying explicitly that you *measure again* before proceeding.

**Third: if and only if the compiler left the loss chain unfused**, write it as a Triton kernel. It has
all three conditions: 21% of the step (ceiling 1.27×), a memory-bound elementwise chain with an obvious
fusion opportunity, and it is code you own, so no library will ever cover it. Eleven passes collapsing
to one predicts roughly an order-of-magnitude traffic reduction on that slice.

**Deliberately left alone:**

- **Attention** — already FlashAttention. A hand-written replacement is weeks of work against specialists
  for a 1.18× ceiling. Do not touch it.
- **The matmuls** — the biggest item, and the one to resist. At 65% of peak against a tuned library, the
  lever is not a kernel you write; it is *shape and precision* (better tile-friendly dimensions, larger
  batch, fp8 or bf16 choices) or an algorithmic change (4.3, 8.3). Anyone proposing to hand-write a
  matmul kernel loses substantial credit.

**Also worth credit:** noticing that these ceilings are not additive in the way people assume — the
percentages shift as you fix things, so re-profile after each change rather than executing the whole
plan blind. And noticing that the profile above contains no data-loading or synchronisation line at all,
which is suspicious: 100 ms of accounted GPU time says nothing about whether the GPU was idle waiting
for the host, and 8.1's first move is to check that before optimising anything on this list.

Full marks for a plan that is ordered by effort-adjusted payoff, computes every ceiling before acting,
puts the compiler before the kernel, and refuses the two most tempting targets for stated reasons.`,
    },
  ],
}
