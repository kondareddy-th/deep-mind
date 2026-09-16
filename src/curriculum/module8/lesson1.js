// Module 8, Lesson 1 — Where the time actually goes (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm8-l1',
  title: '8.1 Where the time actually goes',
  subtitle:
    'Someone says "make it faster." Before you touch a line of code, there is an arithmetic law that tells you the largest speedup any given fix could possibly deliver — and a diagram that tells you which class of fix is even capable of working. This lesson is how a researcher decides where to spend a week.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Your training run takes three days. Your advisor, your manager, or your own impatience says the
four words that open this module:

> **"Make it faster."**

Where do you look?

Be honest about what you would actually do, because there is a near-universal answer and it is
wrong. Almost everyone looks at the part of the system they can *see*. There is a Python loop in the
data pipeline that you wrote at 2am and have felt guilty about ever since. There is a preprocessing
step that visibly churns. There is a tokenizer call that shows up in the stack trace. These parts
are legible: you wrote them, you can read them, you can imagine them being slow.

So you spend a week. You rewrite the loop, you multiprocess the loader, you cache the tokenization.
You measure. The run is **2% faster**, and you have to report that in standup.

This failure has a name, a formula, and a fix, and the formula is the part almost everyone can state
and almost nobody applies. Here is the uncomfortable version of it: **the maximum possible payoff of
the optimisation you are about to attempt is determined by a number you have not measured.** Not by
your cleverness. Not by how much faster you make the part. By a fraction, in a profile, that you
skipped collecting because collecting it felt like not-working.

Let's derive that bound, and then let's build the two instruments — a profile and a roofline — that
tell you, before you write any code, which fixes are even *allowed* to work.

## Amdahl's law, derived in four lines

Take one step of your training loop and call its total time $1$. (Normalising to one is the whole
trick — every fraction below is then just a share of the step.) Suppose some component takes a
fraction $f$ of that time, and suppose you make **that component** $s$ times faster. What happens?

The component's time shrinks from $f$ to $f/s$. Nothing else changes. So the new total is

$$T_{\text{new}} = (1 - f) + \frac{f}{s}$$

and the speedup you actually get — the number your manager hears — is the ratio of old to new:

$$\boxed{\;\text{speedup} = \frac{1}{(1-f) + f/s}\;}$$

That is **Amdahl's law**, and it is not a deep theorem; it is bookkeeping. But now push it, because
the brutality is in the limit. Let $s \to \infty$. Make the component *infinitely* fast. Make it
take **zero time** — delete it from the universe:

$$\text{speedup}_{\max} = \frac{1}{1-f}$$

The part you did not touch sets your ceiling, and it does so no matter how brilliant you are. Put
numbers on it, because the numbers are more shocking than the algebra:

| the part is $f$ of your time | best possible speedup, even if you delete it entirely |
|---|---|
| 5% | $1.05\times$ |
| 10% | $1.11\times$ |
| 30% | $1.43\times$ |
| 50% | $2.00\times$ |
| 80% | $5.00\times$ |
| 95% | $20\times$ |

Read the 30% row slowly, because it is a real research situation. Attention is 30% of your step
time. You have a brilliant idea for attention. You implement it perfectly — your attention now runs
in *literally zero time*, a physically impossible kernel — and the run finishes $1.43\times$ faster.
Take the realistic version instead: a genuinely excellent $3\times$ attention kernel gives
$1/(0.7 + 0.3/3) = 1/0.8 = 1.25\times$. A quarter faster. That may be a fine outcome, or it may be a
month wasted, and **the only thing that decides which is the 70% you did not look at.**

Hence the corollary that should reorganise your instincts permanently:

> **Profile before you optimise — not because measurement is virtuous, but because the ceiling on
> any optimisation is a number you have not measured.** Deciding what to optimise without a profile
> is choosing an upper bound on your own success at random.

## A profile to argue with

So let's get one. Here is a real-shaped breakdown of a single training step, the sort you get in
twenty minutes from a profiler trace:

| phase | share of step time |
|---|---|
| backward pass | 45% |
| forward pass | 25% |
| data loading (GPU waiting on inputs) | 12% |
| optimizer step | 10% |
| gradient communication (all-reduce) | 8% |

Before you read another word, that table plus the boxed formula is enough to settle several
arguments your team is about to have. Go settle them.
`,
    },
    {
      type: 'ponder',
      question: md`Work the ceilings yourself before revealing. For each of the five phases above,
compute $1/(1-f)$ — the speedup you would get if that phase became *free*. Then answer the question
that matters: **your colleague spent a week making data loading $5\times$ faster.** What speedup did
the run actually get? And — the real question — what should they have done with that week instead?`,
      answer: md`**The ceilings**, in order of leverage:

| phase | $f$ | ceiling $1/(1-f)$ |
|---|---|---|
| backward | 0.45 | $1.82\times$ |
| forward | 0.25 | $1.33\times$ |
| data loading | 0.12 | $1.14\times$ |
| optimizer | 0.10 | $1.11\times$ |
| communication | 0.08 | $1.09\times$ |

**Your colleague's week.** Data loading was 12% and is now $12/5 = 2.4\%$. The step went from $1$ to
$0.88 + 0.024 = 0.904$, so the speedup is

$$\frac{1}{0.904} \approx 1.11\times$$

Five times faster on the thing they optimised; **eleven percent** on the thing that was asked for.
Notice how close $1.11$ is to the $1.14$ ceiling — they executed almost perfectly. Perfect execution
of a badly chosen target still loses, and that is the entire point.

**What they should have done.** Two answers, and the second is better than the first.

The *obvious* answer: the backward pass is 45% of the step and the only phase whose ceiling exceeds
$1.5\times$. All else equal, attack the biggest bar.

The *better* answer, which the next section makes precise: data loading and communication are 20% of
the step during which **the GPU is not computing at all**. They are not work, they are *stalls* —
and a stall does not have to be made faster, it has to be made *invisible*, by running underneath
compute that was happening anyway. Prefetching inputs while the previous step runs, and overlapping
the all-reduce with the backward pass that produces the gradients, take that 20% toward zero rather
than toward a fifth. Ceiling: $1/0.80 = 1.25\times$, from configuration rather than invention. Your
colleague spent a week buying $1.11\times$ when two days of overlap were sitting there paying
$1.25\times$.`,
    },
    {
      type: 'example',
      title: 'a profile teardown, and the decision it forces',
      md: md`
Take the same step and actually make the call, the way you would on a Monday.

**Candidate 1: a faster backward pass.** Biggest bar, best ceiling ($1.82\times$). But check the
second number before committing: the run reports **MFU 42%** (5.3), and forward-plus-backward is
where essentially all the model FLOPs live. Forty-two percent is *respectable* — it is squarely in
the 40–50% band that large runs live in. So the backward pass is not lazy; it is already extracting
close to what the hardware gives. Realistic kernel-level effort might buy $1.15\times$ on that
phase, worth $1/(0.55 + 0.45/1.15) = 1/0.941 \approx 1.06\times$ overall. Weeks of work, 6%.

**Candidate 2: the optimizer step, 10%.** Ceiling $1.11\times$. A fused optimizer is a one-line
change and might get most of it. Cheap, small, do it on a Friday, do not write it in a paper.

**Candidate 3: overlap the stalls.** Data loading (12%) and communication (8%) are dead time.
Prefetch with more loader workers and pinned memory; bucket the gradients so the all-reduce for
layer $k$ fires while layer $k-1$ is still computing. Ceiling $1/0.80 = 1.25\times$; realistically
you hide most but not all of it, say $1.20\times$. **Two days.** This is the correct first move, and
notice it required no cleverness at all — only the observation that a stall is a different kind of
object from a computation.

**Then the part people forget: re-measure.** After the overlap lands, the step is $0.80$ of what it
was, and the backward pass is now $0.45/0.80 = 56\%$ of the *new* step. Its ceiling rose from
$1.82\times$ to $1/(1-0.56) = 2.27\times$. Amdahl fractions are not constants — they are measurements,
and **every fix you land invalidates the profile that justified it.** Optimisation is a loop:
profile, fix the top, profile again. Teams that profile once and then optimise for a month are
navigating with a photograph of the road.

**And the honest ceiling on all of it.** Even doing everything above perfectly, you get somewhere
around $1.3\times$: three days becomes two days and four hours. If what you needed was *three days
becomes seven hours*, no amount of this will deliver it, and continuing to look here is a form of
procrastination. A $4\times$ lives in a different tier entirely — which is the next section.
`,
    },
    {
      type: 'text',
      md: md`
## The hierarchy of wins

Every performance intervention you can make sits in one of four tiers, and the tiers differ from
each other by **orders of magnitude**, not by percentages. This ordering is the spine of the lesson.
Learn it in this order and you will be right about where to spend your time far more often than
people who are better engineers than you.

### Tier 1 — algorithmic and architectural: $10$–$100\times$

You change *what computation is performed at all*. Nothing else in this list can reach these
numbers, because everything else takes the computation as given.

- **Mixture-of-experts instead of dense** (4.3): route each token to a few experts, and a model with
  eight times the parameters costs roughly the same FLOPs per token as the dense one. You bought
  capacity without buying compute.
- **MLA instead of multi-head attention** (8.3 takes this apart): compress the KV cache by an order
  of magnitude, and suddenly you can hold far more concurrent requests in the same memory — which,
  as the roofline below will show, is worth more than any kernel.
- **Better data** (5.1): deduplicated, filtered, better-mixed data reaches a target loss in
  dramatically fewer tokens. The fastest training step is the one you never run.
- **Train a smaller model on more tokens** (5.2, and its inference-aware amendment): the compute-optimal
  point is not the deployment-optimal point, and choosing the right $(N, D)$ pair before you start
  can beat every downstream optimisation combined — forever, on every inference request you will
  ever serve.

### Tier 2 — systems: $2$–$10\times$

Same computation, radically better orchestration.

- **Batching** (4.5): continuous batching routinely multiplies serving throughput several-fold, for
  reasons the roofline will make geometric rather than magical.
- **The right parallelism** (4.2): tensor-parallel where the interconnect is fast, pipeline or data
  parallel where it is not. The wrong choice can cost you half your machine.
- **Overlapping communication with compute**, prefetching data, avoiding recomputation you did not
  need — the tier-2 move you just made in the teardown above.
- **Memory layout and capacity**: paged KV caches, activation checkpointing traded against memory,
  anything that lets you run a bigger batch. Capacity converts into throughput.

### Tier 3 — kernels: $1.2$–$3\times$

Same computation, same orchestration, better execution on the metal. Fusion so intermediate results
never round-trip to HBM, lower precision, IO-aware algorithms in the FlashAttention mould (4.1).
This is real, valuable, publishable work — **and it is lesson 8.2's entire subject**, so it gets a
lesson rather than a bullet.

### Tier 4 — micro-optimisation: usually not worth your salary

List comprehensions instead of loops, a slightly cheaper string operation, shaving Python overhead
that is already hidden behind asynchronous GPU work. Occasionally one of these is secretly a tier-2
problem in disguise (a per-step synchronisation, a hidden host-device copy) — which the profile will
tell you. Absent that evidence, this is where weeks go to die.

> **The meta-point, and the reason this lesson opens the module.** Newcomers reliably start at the
> *bottom* of this list, because tier 3 and 4 look like Real Optimisation: you write intricate code,
> you see a green number in a profiler, it feels like engineering. Tier 1 looks like *reading papers
> and arguing about the data mixture* — it does not feel like work, and it is where the $10\times$
> lives. The senior person on your team is not faster at writing kernels than you. They are faster
> at noticing that the kernel is the wrong question.
`,
    },
    {
      type: 'text',
      md: md`
## Profile first: what to measure, and what each number means

"Profile first" is advice everyone agrees with and few can operationalise. So here is the procedure,
concretely — four instruments, in this order, before you form a single hypothesis.

**1. Wall-clock breakdown by phase.** Data loading, forward, backward, optimizer step,
communication. This is the table you just argued with, and it is the one that sets every Amdahl
ceiling you will invoke.

> **The trap that ruins most homemade timings:** GPU work is asynchronous. Your Python timer around
> a forward pass measures how long it took to *launch* the kernels, not to run them, so every line
> looks instant except the one that happens to block on a result — which then gets blamed for
> everything. Synchronise the device before you stop the clock, or use a real profiler trace. A
> shocking number of "the loss computation is our bottleneck!" reports are this bug.

**2. MFU** (5.3): achieved model FLOP/s divided by the hardware's peak FLOP/s. If you measure one
number, measure this one — it is the single best summary of *am I using this machine at all*. At
scale, 40–50% is respectable; below 25%, something is structurally wrong rather than merely
imperfect.

**3. The memory timeline.** Not average memory — the **peak**, and *when* it occurs. Peak is what
OOMs you, and it is almost always a specific instant (typically the end of the forward pass, when
every saved activation is live and nothing has been freed yet). Memory is not just a constraint on
whether you run; it is a constraint on *batch size*, which is a constraint on speed, which is why
the memory timeline is a performance instrument and not just a debugging one.

**4. Kernel-level breakdown.** Top kernels by total time — and, more revealing, the **gaps between
them**. Gaps are the GPU doing nothing at all.

### The interpretation rules

Now the part that turns four numbers into a decision. Cross-reference MFU against the timeline:

- **Low MFU + heavy memory traffic + few gaps → you are memory-bound.** The multipliers are idle
  because the data is not there yet. Nothing you do to the arithmetic can help; only **moving fewer
  bytes** can. Go to the roofline below.
- **Low MFU + visible idle gaps → you are stalled**, on data loading or communication. The machine
  is waiting on something that is not compute. Fix by *overlapping*, not by making the stalled thing
  faster — a stall hidden behind compute costs zero, and that is a better multiplier than any
  rewrite will give you.
- **High MFU and still too slow → you are genuinely doing too much arithmetic.** This is the good
  news disguised as bad: the machine is being used well, so no systems or kernel work is available
  to you, and the fix **must** be tier 1. Fewer parameters, fewer tokens, sparsity, a different
  architecture, better data. People hate this diagnosis and go looking for a fifth opinion in the
  kernels. There is nothing there.
- **Memory peak near the ceiling + a small batch you were forced into →** your capacity problem is
  disguised as a speed problem. Quantize (4.4), checkpoint, or shard until the batch can grow; the
  speed follows, for the reason the next section explains geometrically.

## The roofline: which fixes are even allowed to work

The interpretation rules above all point at one question — *am I limited by arithmetic or by
bytes?* — and there is one diagram that answers it. Let's derive it, because it takes about as long
to derive as to memorise.

A kernel does $W$ FLOPs and moves $Q$ bytes between memory and the chip. Two clocks run
**concurrently**: the arithmetic units need $W/P$ seconds, where $P$ is peak FLOP/s; the memory
system needs $Q/B$ seconds, where $B$ is bandwidth. You cannot finish before both are done, so

$$T \;\ge\; \max\!\left(\frac{W}{P},\; \frac{Q}{B}\right)$$

Divide $W$ by that to get the performance you can actually attain, and define the one quantity that
matters — the **arithmetic intensity** $I = W/Q$, FLOPs performed per byte moved:

$$\boxed{\;\text{attainable FLOP/s} \;=\; \min\big(P,\; B \times I\big)\;}$$

That is the roofline, and it is two straight lines on a log-log plot: a **rising diagonal**
$B \times I$ — the memory system's promise, that it will feed you $B$ bytes a second and you may do
$I$ FLOPs with each one — and a **flat ceiling** $P$, the arithmetic units' hard limit. Where they
cross is the **ridge point**, $I^{*} = P/B$: the intensity at which the two subsystems are exactly
balanced. For an H100-class chip at 989 TFLOP/s of bf16 and 3.35 TB/s of HBM:

$$I^{*} = \frac{989 \times 10^{12}}{3.35 \times 10^{12}} \approx 295 \;\text{FLOPs per byte}$$

**Two hundred and ninety-five arithmetic operations for every single byte you fetch**, just to keep
the multipliers busy. That number is the whole memory wall (4.1) written as one integer, and it is
why modern chips feel like a factory attached to a drinking straw.

### Now place your workloads on it

The formula only earns its keep once you can compute $I$ for something you actually run. For a
decode step, each parameter is fetched once and used for 2 FLOPs (a multiply and an add) **per
token in the batch**. With $w$ bytes per parameter and batch size $B_{\text{sz}}$:

$$I_{\text{decode}} \;\approx\; \frac{2 B_{\text{sz}}}{w}$$

So the entire picture falls out of one fraction:

- **Batch-1 decode: $I \approx 1$–$2$.** (Exactly 1 in fp16, 2 in int8 — and the distinction is
  comic when the ridge is 295.) You are three hundred times short. Attainable performance is
  $3.35 \times 10^{12} \times 2 \approx 6.7$ TFLOP/s: **under 1% of what the chip can do.** The
  arithmetic units spend over 99% of their existence waiting for weights to arrive.
- **Batch-32 decode: $I \approx 60$.** Still memory-bound, but now roughly 20% of peak — twenty
  times better, from doing nothing to the model at all.
- **Batch-256 decode: $I \approx 400$.** Past the ridge. You have crossed into compute-bound
  territory, and the character of the problem inverts.
- **Prefill and training: $I$ in the thousands.** Every weight fetch serves an entire sequence or
  minibatch. Deeply compute-bound, and 3.4 already showed you where the crossover sits.

And here is the payoff sentence, the reason this diagram is the most useful picture in performance
engineering:

> **The roofline tells you which *class* of fix is capable of working, before you try any of them.**
> Left of the ridge, only fewer bytes help — quantize, fuse, batch, cache better — and a chip with
> twice the FLOP/s would change *nothing*. Right of the ridge, only fewer or faster FLOPs help, and
> a chip with twice the bandwidth would change nothing. Half the optimisation arguments in the
> industry are two people standing on opposite sides of the ridge, both correct.
`,
    },
    {
      type: 'viz',
      viz: 'roofline',
      caption: md`The roofline for an H100-class chip on log axes: the rising diagonal is the memory
system's promise, the flat ceiling is the arithmetic units' limit, and the white dot where they meet
is the ridge at 295 FLOPs per byte. Four workloads are marked, and the coral probe is yours to drag.
Three experiments: (1) press "decode, batch 1" and read the percent-of-peak — that fraction of one
percent is the entire explanation for why single-stream generation feels sluggish on hardware
capable of a quadrillion operations per second, and no kernel you write will change it; (2) walk the
buttons upward — batch 1, 32, 256 — and watch the point climb the diagonal toward the ridge: that
climb IS what batching does for you, drawn geometrically, and notice the last step stops paying
because the roof got in the way; (3) drag the probe slowly past 295 and watch the verdict flip —
everywhere to the right of that line, buying faster memory would do nothing at all, and only having
fewer FLOPs to do can help you.`,
    },
    {
      type: 'ponder',
      question: md`Batching moves a workload **along the roofline's diagonal**, to the right and
upward. Why does it move along the line rather than lifting the line? Put differently: why does
serving 32 requests at once make each chip faster, when nothing about the chip has changed — and
what exactly happens at the ridge that makes further batching stop paying?`,
      answer: md`**Because batching changes the workload's numerator, not the machine's constants.**
Look at what each term does when you go from batch 1 to batch $B$:

- **FLOPs $W$:** every request needs its own arithmetic, so $W$ scales with $B$.
- **Bytes $Q$:** the weights are fetched **once** and reused by all $B$ requests. The dominant term
  in $Q$ does not grow.

So $I = W/Q$ rises roughly **linearly in $B$** — you slide right. And since attainable performance
on the memory-bound side is $B_{\text{bw}} \times I$, sliding right *is* climbing: the diagonal
carries you up as you go. Meanwhile $P$ and $B_{\text{bw}}$ are properties of silicon. You did not
buy bandwidth and you did not buy multipliers; **you moved the workload to the part of the machine
that was already there and idle.** The roof is fixed; only your position under it is yours to
choose.

**At the ridge, the geometry stops helping**, and this is the honest part. Past $I^{*}$ the
attainable performance is $\min$-clamped at $P$: the line goes flat. Another doubling of batch adds
FLOPs proportionally *and* adds throughput proportionally, so per-token cost stops improving —
you are simply doing more work at the same rate. Worse, you now pay real costs for batching that the
diagram does not show: KV cache memory grows linearly with $B$ (which is why 8.3's cache
compression is a throughput technique), queueing delays grow, and time-to-first-token for the
unlucky request at the back of the batch gets ugly. So the ridge is not just a geometric curiosity;
it is roughly where a serving engineer stops turning the batch knob and starts turning a different
one.

The general lesson, worth more than the specific one: **optimisation is the art of relocating a
workload under a fixed roof.** You are almost never making the machine better. You are finding the
part of it you were not using.`,
    },
    {
      type: 'example',
      title: 'stacking three optimisations — and watching one of them evaporate',
      md: md`
An 8B-parameter model in fp16, one H100, greedy decode, one user at a time. Weights are 16 GB, so
every single token requires hauling 16 GB across a 3.35 TB/s bus: a floor of 4.8 ms per token, about
209 tokens/second even in a perfect world. Measured: **142 tokens/s** — 68% of the bandwidth limit,
which is a decent implementation.

Now stack three fixes and measure after each.

**1. Int8 weight-only quantization** (4.4). Halves the bytes hauled per token. The roofline predicts
$2\times$ on a memory-bound workload; you measure **$1.8\times$** — dequantisation costs a little
arithmetic, which is free here. → **256 tok/s**.

**2. Fusion and graph capture** (8.2's territory). The elementwise chain — norms, activations,
residual adds — stops round-tripping intermediates to HBM, and the per-kernel launch overhead
collapses into one replayed graph. **$1.25\times$**. → **320 tok/s**.

**3. Continuous batching to 32 concurrent requests** (4.5). One weight haul now serves 32 streams.
Each *user* sees roughly the speed they saw before; the *server* goes from 320 to about
**5,400 tok/s**, a **$17\times$** on the metric that pays the electricity bill.

$$142 \;\to\; 5{,}400 \;\text{tok/s} \qquad 1.8 \times 1.25 \times 17 \approx 38\times$$

**They compounded multiplicatively.** Of course they did: each is a multiplier on time, and
multipliers on time compose. This is the pleasant half of the story and it is why performance work
feels addictive.

### Now reorder the stack, and watch a win disappear

Do continuous batching **first**, then quantize. Same three optimisations, same hardware, same
model. At batch 32 the weight haul is amortised 32 ways — weight bytes per token fall from 16 GB to
0.5 GB — while the **KV cache traffic does not amortise at all**, because every request has its own
cache. The dominant byte stream is no longer the weights. So halving the weights now halves a term
that is no longer in charge, and the measured win collapses from $1.8\times$ to roughly
**$1.15\times$**.

Push to batch 256, intensity $\approx 400$, past the ridge: now the workload is compute-bound and
weight-byte reduction buys **nothing at all** on throughput. (Int4 still buys you something real —
*capacity*, hence more concurrent requests, hence better utilisation — but the bandwidth argument
for it is dead, and if you quote the bandwidth argument in a design review someone will ask you what
batch size you measured at.)

> **The moral, and it is the most portable idea in this lesson:** a multiplier is not a property of
> an optimisation. It is a property of an optimisation *applied to a particular workload in a
> particular regime*. "Int8 gives $1.8\times$" is not a fact about int8. It is a fact about int8 at
> batch 1 — which is, not coincidentally, the batch size vendor benchmarks like to quote. Optimisations
> compound, but **only within the regime where each of them was binding**, and the earlier ones in
> the stack are busy moving you out of that regime.
`,
    },
    {
      type: 'text',
      md: md`
## Training and inference have different answers

Conflating these two is the most common way a good performance instinct becomes a wrong
recommendation, and now you have the diagram that explains exactly why.

**Training is compute-bound, large-batch, throughput-oriented.** Intensity in the thousands, far to
the right of the ridge. Nobody cares how long one step takes; they care about dollars to reach a
target loss. So the wins are: parallelism that keeps the units fed (4.2), lower precision that
*raises the ceiling itself* rather than just reducing traffic, not recomputing what you could have
kept (and the reverse trade when memory is tighter than arithmetic), and hiding every byte of
communication behind compute. **The failure mode is an idle GPU** — a stall, a bubble, a badly
chosen parallelism.

**Inference decode is memory-bound, latency-sensitive.** Intensity between 1 and a few hundred, on
or near the diagonal. A human is watching the tokens appear. So the wins are: **move fewer bytes**
(quantize weights and KV, 4.4; compress the cache with GQA or MLA, 8.3), **serve more requests per
haul** (continuous batching, 4.5), and **take fewer sequential steps** (speculative decoding, 3.4 —
which is the sneaky one, because it converts spare FLOPs, which you have in abundance on this side
of the ridge, into fewer memory round-trips, which is what you actually lack). **The failure mode is
a person waiting.**

**And prefill is the odd one out** — an inference phase that behaves like training, compute-bound
because one weight haul serves the entire prompt. That single fact is why serving systems schedule
prefill and decode as separate species: chunked prefill, disaggregated prefill/decode fleets, and
the scheduling policies that stop one long prompt from stalling everyone else's stream.

Keep the two columns separate in your head, and you will stop being confused by the fact that two
engineers quote wildly different numbers for the same technique. **They are both telling the truth.
They are standing on opposite sides of the ridge.**

## The objective is dollars, not speed

One last reframing, because "faster" is not actually what anyone wants. The thing you are minimising
on a training run is

$$\text{cost} \;=\; \underbrace{(\text{GPU-hours}) \times (\text{price per GPU-hour})}_{\text{compute}} \;+\; \underbrace{(\text{engineer-weeks}) \times (\text{loaded rate})}_{\text{your time}}$$

and 7.1's lesson applies with full force: **at small scale the second term is almost always the
larger one.** A three-day run on 64 rented H100s is a few thousand dollars of compute. A week of
your time is comparable or more, and unlike the compute it buys nothing else while it is being
spent.

So the right question is never "can this be made faster." It is:

> **Is this the cheapest hour I can spend?**

An hour spent on kernels buys a percent of a run. An hour spent on the eval harness might catch the
bug that saves you from re-running the whole thing. An hour spent on the data mixture might be tier
1. And an hour spent on an optimisation that you will reuse across forty runs this year is worth
forty times what the same hour is worth on one run — which is precisely why frontier labs staff
large performance teams and your two-person project should not. The scale changes the answer, and
knowing *which* answer your scale implies is the frontier mindset this module is named for.
`,
    },
    {
      type: 'ponder',
      question: md`You get your run to **55% MFU**. Your manager, who has read that "the best runs
hit 50–60%", says: let's target **90%**. Is that a good goal? Argue it properly — and if you say no,
say what the right target is instead.`,
      answer: md`**No, and the reasons stack up into a general lesson about metrics.**

**1. The missing 45% is not waste — it is mostly physics.** MFU counts model FLOPs against a peak
that assumes every unit does dense matmul every cycle. But a real step also contains softmaxes,
layer norms, elementwise activations, optimizer arithmetic, and reductions — all of them
**bandwidth-bound by nature**, sitting far left of the ridge no matter who writes the kernel. Add
pipeline bubbles, communication that cannot be fully hidden, and a denominator that is a marketing
number (peak clocks, no thermal throttling, no sparsity discount). Amdahl closes the argument: if
20% of the step is irreducibly memory-bound, then even perfect matmuls cap you at $1/0.2 = 5\times$
on that portion and nowhere near 90% overall.

**2. The metric measures the wrong thing.** MFU asks *how efficiently am I doing arithmetic*, never
*is this arithmetic worth doing*. A 90%-MFU run that trains a badly-sized model on a mediocre data
mixture is a beautifully utilised waste of three days, and it will lose to a 45%-MFU run with a
better mixture — every time, and not by a little. **You can be perfectly efficient at the wrong
thing, and the metric will congratulate you.**

**3. The hierarchy says this axis was never where the wins were.** Chasing MFU is tier-2/tier-3 work,
bounded at roughly $2\times$ by construction. The tier-1 wins — better data, the right $(N, D)$ from
5.2, MoE — are $10\times$ and are *invisible* to MFU. Optimising the metric you can see, again.

**The right target** is the one the cost model names: **dollars per training run that reaches the
target loss**, or **dollars per million tokens served** at the required latency. Those numbers are
sensitive to every tier at once, and they cannot be gamed by doing more arithmetic more efficiently.

**The one honest version of your manager's question** — worth granting, because it is answerable —
is: *"is 55% anomalously low for this hardware and this model shape?"* That is a benchmarking
question with a real answer, and if a comparable published run gets 62%, you have learned something
specific and actionable. "Get to 90%" has learned nothing and committed a quarter to it.`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **Amdahl's law, derived, and its brutal corollary:** a component at fraction $f$ of your time
   caps you at $1/(1-f)$ even if you delete it — so **the ceiling on your optimisation is a number
   you have not measured.** Profile first, and re-profile after every fix, because the fractions
   move.
2. **The hierarchy of wins:** algorithmic/architectural ($10$–$100\times$) $\gg$ systems
   ($2$–$10\times$) $\gg$ kernels ($1.2$–$3\times$) $\gg$ micro-optimisation. Newcomers start at the
   bottom because it feels like real work. The leverage is at the top, where the work looks like
   thinking.
3. **A profiling procedure and its interpretation rules:** phase breakdown, MFU, memory timeline,
   kernel gaps — and the cross-references that turn them into a diagnosis. Low MFU with gaps means
   *stalled*; low MFU without gaps means *memory-bound*; high MFU and still slow means the fix must
   be algorithmic.
4. **The roofline:** attainable $= \min(P, B \times I)$ with $I$ = FLOPs per byte moved, a ridge at
   $\approx 295$ FLOPs/byte on an H100, batch-1 decode stranded near $I \approx 2$ and under 1% of
   peak, prefill and training in the thousands. **It tells you which class of fix is capable of
   working before you try any of them.**
5. **Batching as geometry:** it slides a workload rightward along a fixed diagonal, because the
   weights are hauled once and serve $B$ requests — and it stops paying at the ridge.
6. **Regime-dependence:** multipliers compound, but only while each remains the binding constraint;
   the same int8 kernel is worth $1.8\times$ at batch 1 and nothing at batch 256.
7. **Training and inference are different problems** — compute-bound throughput versus memory-bound
   latency — and the objective behind both is dollars, where at small scale *your time* is the
   dominant term.

Next lesson: you have located the time; **8.2 goes down to where it is actually spent** — kernels,
fusion, and the compilers that try to write them for you.
`,
    },
  ],
  questions: [
    {
      id: 'm8-l1-q1',
      kind: 'mcq',
      prompt: md`Your profile says attention is **30%** of the training step. A colleague proposes a
new attention kernel they are confident will run $3\times$ faster, and estimates three weeks of
work. Which statement is the correct analysis?`,
      options: [
        'It gives about $1.25\\times$ overall — and even a *perfect*, zero-time attention kernel would only give $1.43\\times$, so the 70% you have not examined deserves a look before three weeks are committed',
        'Attention is the largest single kernel in the trace, which makes it the correct target by definition',
        'It gives about $3\\times$ on the attention phase, so roughly $1.9\\times$ overall once you account for attention being the dominant cost',
        'It gives about $2.1\\times$, since a $3\\times$ speedup on 30% of the work removes 70% of that phase from the step',
      ],
      answer: 0,
      explain: md`Amdahl: $1/(0.7 + 0.3/3) = 1/0.8 = 1.25\times$, with a hard ceiling of
$1/0.7 = 1.43\times$ even at $s = \infty$. That may still be worth three weeks — but you cannot know
until you have looked at the 70%, and that is the whole point.

Option C is the single most common error in this domain: people mentally apply the local speedup to
the global runtime, or split the difference toward it. Option D is the same error with more confident
arithmetic attached, which is worse. Option B is the looks-slow fallacy in its purest form — *largest
component* and *best place to spend three weeks* are different claims, and only the first one is
visible in a trace.`,
    },
    {
      id: 'm8-l1-q2',
      kind: 'numeric',
      prompt: md`Compute the **ridge point** of an H100-class chip: peak $989$ TFLOP/s of bf16, HBM
bandwidth $3.35$ TB/s. How many FLOPs must you perform per byte moved to keep the arithmetic units
saturated? (Answer in FLOPs per byte.)`,
      answer: 295,
      tolerance: 15,
      explain: md`$I^{*} = P/B = (989 \times 10^{12}) / (3.35 \times 10^{12}) \approx 295$ FLOPs per
byte. Sit with how large that is: nearly three hundred arithmetic operations for every byte fetched,
merely to break even. It is the memory wall of 4.1 compressed into a single integer, and it is why
batch-1 decode — which manages one or two FLOPs per byte — runs at well under one percent of a chip
that is, on paper, capable of a quadrillion operations a second.`,
    },
    {
      id: 'm8-l1-q3',
      kind: 'mcq',
      prompt: md`Your inference server does batch-1 decode. The profiler shows **0.7% MFU**, heavy
sustained memory traffic, and almost no idle gaps between kernels. A vendor offers a new chip with
**twice the FLOP/s** at the same memory bandwidth. What should you expect from it?`,
      options: [
        'Roughly $2\\times$, since decode is dominated by matrix multiplications and those are FLOPs',
        'Essentially nothing — you are far left of the ridge, so the memory system sets your speed; only moving fewer bytes (quantize, fuse, batch, better caching) can help',
        'Roughly $1.4\\times$ — some of the gain transfers, since only part of the workload is memory-bound',
        'A slowdown, because faster arithmetic units contend more aggressively for the same memory bandwidth',
      ],
      answer: 1,
      explain: md`At $I \approx 2$ and a ridge at 295, attainable performance is $B \times I$ — a
term with no $P$ in it at all. Doubling $P$ raises a ceiling you are nowhere near: the diagonal you
are sitting on does not move. This is the roofline's whole purpose, to rule out a class of fix
*before* you buy it.

Option A is the reflex answer and the expensive one — decode really is dominated by matmuls, which
is exactly why the intuition feels safe; the flaw is that those matmuls are matrix-*vector* products
that reuse each fetched weight once. Option C is the seductive middle: "surely some of it
transfers." Below the ridge, the FLOP/s term is not the binding constraint, so it does not partially
transfer — it does not transfer. Option D is invented physics.`,
    },
    {
      id: 'm8-l1-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, derive Amdahl's law from nothing: normalise a
step to total time $1$, let a component occupy fraction $f$, speed *that component* up by a factor
$s$, and obtain the overall speedup. Then (1) take $s \to \infty$ and state the ceiling; (2) apply
your formula to the profile in this lesson — backward 45%, forward 25%, data loading 12%, optimizer
10%, communication 8% — computing the ceiling for each phase; (3) explain, using your formula, why
*overlapping* a 12% stall is worth more than making it $5\times$ faster; (4) state what happens to
all five fractions once one of the fixes lands, and what that implies about how often you profile.`,
      rubric: md`**The derivation.** Total time $1$; the component takes $f$, the rest takes $1-f$
and is untouched. After the speedup the component takes $f/s$, so
$T_{\text{new}} = (1-f) + f/s$ and

$$\text{speedup} = \frac{T_{\text{old}}}{T_{\text{new}}} = \frac{1}{(1-f) + f/s}$$

**(1)** As $s \to \infty$, $f/s \to 0$ and speedup $\to 1/(1-f)$. Full credit requires stating what
this *means*: even deleting the component entirely cannot beat this.

**(2)** backward $1/0.55 = 1.82\times$; forward $1/0.75 = 1.33\times$; data loading
$1/0.88 = 1.14\times$; optimizer $1/0.90 = 1.11\times$; communication $1/0.92 = 1.09\times$.

**(3)** Making the stall $5\times$ faster sets $s = 5$: $1/(0.88 + 0.024) \approx 1.11\times$.
Overlapping it hides it behind compute that was happening anyway — effectively $s \to \infty$ for
that phase — giving the full $1.14\times$, and overlapping communication too gives
$1/0.80 = 1.25\times$. The essential insight, and the one being graded: a *stall* is not work to be
accelerated but idle time to be filled, so it admits $s = \infty$ at low engineering cost, which no
computation ever does.

**(4)** Every fraction is a ratio to the *current* total, so shrinking any phase inflates all the
others. After the overlap fix the step is $0.80$ of its old length and the backward pass is
$0.45/0.80 = 56\%$, its ceiling rising from $1.82\times$ to $2.27\times$. Implication: profile,
fix the top item, **profile again** — a profile is a photograph, and it expires the moment you act
on it.

"Nailed it" requires the algebra actually derived (not quoted), all five ceilings, and both the
stall-versus-work distinction in (3) and the re-profiling loop in (4).`,
    },
    {
      id: 'm8-l1-q5',
      kind: 'numeric',
      prompt: md`A phase occupies **35%** of your step time. You find a way to make it infinitely
fast — it now costs literally zero. What is your overall speedup, as a multiplier (two decimals)?`,
      answer: 1.54,
      tolerance: 0.06,
      explain: md`$1/(1 - 0.35) = 1/0.65 \approx 1.54\times$. Worth internalising the shape of this
curve: it is nearly flat until $f$ gets large, and only starts rewarding you steeply past about 70%.
Below $f = 0.5$ you are fighting for scraps no matter how total your victory over that phase — which
is why "what fraction is it?" must be the first question you ask about any proposed optimisation,
and why asking it costs twenty minutes with a profiler and saves weeks.`,
    },
    {
      id: 'm8-l1-q6',
      kind: 'numeric',
      prompt: md`Your training run on 1,000 H100s achieves $4.3 \times 10^{17}$ model FLOP/s of
useful work. Each GPU peaks at $989$ TFLOP/s. What is the **MFU**, as a percentage?`,
      answer: 43.5,
      tolerance: 3,
      explain: md`Peak $= 1000 \times 989 \times 10^{12} = 9.89 \times 10^{17}$ FLOP/s, so
MFU $= 4.3/9.89 \approx 43.5\%$. That is a **good** number — squarely in the 40–50% band that 5.3
called respectable at scale — and the correct next move is therefore *not* to hunt for the missing
56%. Much of that gap is irreducible: bandwidth-bound norms and softmaxes, pipeline bubbles,
communication that cannot be fully hidden, and a denominator that assumes marketing-brochure clocks.
Below about 25% you have a structural problem worth chasing; at 43.5% the remaining leverage is in a
different tier of the hierarchy entirely.`,
    },
    {
      id: 'm8-l1-q7',
      kind: 'mcq',
      prompt: md`Your training step runs at **48% MFU** — near the practical ceiling for this
hardware and model shape — and the run still takes three weeks, which is two weeks too many. What is
the honest diagnosis?`,
      options: [
        'You are memory-bound; reduce bytes moved with quantization and fusion',
        'The machine is being used about as well as it can be, so no systems or kernel work is available — the remaining lever is doing *less arithmetic*: a smaller model, fewer tokens, sparsity/MoE, or better data that reaches the target loss sooner',
        'Push MFU toward 80–90% with hand-written kernels; that is where the missing two weeks are',
        'Add more GPUs — MFU is a per-device metric, so it stays constant while wall-clock falls proportionally',
      ],
      answer: 1,
      explain: md`High MFU means the arithmetic units are genuinely busy, so the time is being spent
on real computation. There is no slack to reclaim; the only way to finish sooner is to have less
arithmetic to do, which is a **tier-1** decision about what you are training. This is the diagnosis
people least want, and they reliably go shopping for a second opinion in the kernels.

Option A contradicts the evidence — 48% MFU is the signature of a compute-bound workload, not a
starved one. Option C is the manager's instinct from the third ponder: 90% is not available, because
a real step contains bandwidth-bound norms, softmaxes, and reductions that no kernel can lift past
their own roofline. Option D is the most tempting because it contains a true sentence — MFU *is*
per-device — but scaling out has its own costs (more communication, worse MFU, a fixed batch-size
budget you may already be spending) and, crucially, it does not make the run *cheaper*: you buy
calendar time with the same GPU-hours or more.`,
    },
    {
      id: 'm8-l1-q8',
      kind: 'numeric',
      prompt: md`**Fermi estimate — do it on paper, calculator only at the end.** You rent a node of
**64 H100s** at about **\$2.50 per GPU-hour** and run it flat out for **three days**. Roughly what
does the run cost, in dollars? (Generous tolerance — the habit being trained is producing the right
order of magnitude in thirty seconds, before anyone asks.)`,
      answer: 11520,
      tolerance: 2500,
      explain: md`$64 \text{ GPUs} \times 24 \text{ h} = 1{,}536$ GPU-hours per day; at \$2.50 that
is about **\$3,840 per day**, so roughly **\$11,500** for the three-day run.

Now the decision this number exists to support. A **20% speedup** saves $0.2 \times 11{,}500 \approx
\$2{,}300$. A week of your time at loaded engineering rates is comfortably more than that (7.1), so
for *this run alone* the optimisation loses — decisively, and it is not close. But run the same
arithmetic over a program of forty such runs in a year and the same 20% is worth roughly \$92,000,
at which point it obviously justifies the week. **Nothing about the optimisation changed; the scale
changed.** This is exactly why frontier labs staff large performance teams and your two-person
project should not, and being able to compute which regime you are in — in thirty seconds, out
loud, in a meeting — is a genuine research skill.`,
    },
    {
      id: 'm8-l1-q9',
      kind: 'mcq',
      prompt: md`A technique halves the bytes needed to store and stream model weights, and delivers
a large speedup on batch-1 decode. A colleague proposes it for your **training** run on the same
model. What should you expect, and why?`,
      options: [
        'The same roughly $2\\times$ — bytes are bytes, and both workloads run on the same memory system',
        'Little to no speedup from the byte reduction itself: training sits far right of the ridge at intensity in the thousands, so bandwidth is not the binding constraint. Any real win would have to come from *faster arithmetic* in the lower precision — a different mechanism — and training additionally needs master weights and optimizer state that the technique does not shrink',
        'No speedup, because quantization always degrades accuracy and the run would have to be restarted',
        'A larger speedup than at inference, since training moves far more total bytes over the course of the run',
      ],
      answer: 1,
      explain: md`This is the training/inference conflation, and the roofline settles it in one
glance: training's intensity is in the thousands, past a ridge of 295, so it is compute-bound and
reducing bytes moves a term that is not binding. Note the careful distinction in the correct option —
low precision *can* help training, but through a completely different door (higher peak FLOP/s in
the lower-precision units, which raises the ceiling $P$), and that is a claim you must verify
separately for your hardware rather than inherit from an inference benchmark.

Option A is the error in its natural habitat: the mechanism transfers, the *bindingness* does not.
Option D inverts the reasoning — total bytes over a run is irrelevant; what matters is bytes per
FLOP. Option C smuggles in a real concern (quality) to answer a performance question, and would also
be an overstatement even about quality.`,
    },
    {
      id: 'm8-l1-q10',
      kind: 'written',
      prompt: md`**The first hour.** You inherit a training run that takes three days and are told to
make it meaningfully faster. Write your plan for the first hour — *before* you change any code.
Specify: (1) the four things you measure and in what order; (2) for each, the specific reading that
would worry you; (3) the three cross-referenced diagnoses that turn those readings into a decision
about *which tier* of fix to pursue; (4) one measurement pitfall that could make your entire profile
a fiction, and how you avoid it.`,
      rubric: md`**(1) The four instruments.** Wall-clock breakdown by phase (data loading, forward,
backward, optimizer, communication) — this is what sets every Amdahl ceiling, so it comes first;
**MFU**, achieved model FLOP/s over peak, the single best summary of whether the machine is being
used at all; the **memory timeline**, specifically peak and *when* it occurs, since peak is what OOMs
you and what caps batch size; **kernel-level breakdown**, top kernels by total time *and* the gaps
between them.

**(2) Worrying readings.** Any single non-compute phase above ~10–15%. MFU below ~25% (structural
problem, not imperfection). Memory peak pressed against the ceiling while batch size is small — a
capacity problem masquerading as a speed problem. Large inter-kernel gaps, or a top-10 kernel list
dominated by elementwise operations rather than matmuls.

**(3) The diagnoses.** Low MFU + heavy memory traffic + few gaps → **memory-bound**; the fix is fewer
bytes, and the roofline says faster arithmetic cannot help. Low MFU + visible idle gaps → **stalled**
on data or communication; the fix is *overlap* (prefetch, gradient bucketing), not making the stalled
component faster. High MFU + still too slow → the machine is being used well, so the fix **must be
tier 1** (fewer parameters, fewer tokens, MoE, better data). Credit for adding: capacity-limited
batch → quantize/checkpoint/shard, and the speed follows.

**(4) The pitfall.** GPU execution is asynchronous, so a naive host-side timer measures kernel
*launch* time; every phase looks instantaneous except whichever line happens to block on a result,
which then absorbs the blame for the whole step. Avoid it by synchronising the device before
stopping the clock, or by using a real profiler trace. (Other acceptable answers: profiling only a
warm-up step that includes one-time compilation/allocation costs; profiling with a batch size or
sequence length that is not the production one; averaging over too few steps to see periodic
stalls such as checkpointing or evaluation.)

"Nailed it" requires MFU appearing as a *cross-reference* against the timeline rather than as a
standalone score, and a plan whose output is a **tier**, not a to-do list.`,
    },
    {
      id: 'm8-l1-q11',
      kind: 'written',
      prompt: md`**Regime judgment.** A vendor benchmark claims their fused low-precision kernels
deliver **$2.4\times$ on decode**. You serve at **batch 256**, where your measured arithmetic
intensity is around 400 FLOPs per byte. On paper: (1) predict what you will actually measure, using
the roofline, and say why the vendor is not lying; (2) name the number that could still make the
purchase correct, and the metric you would evaluate it against; (3) design a test whose outcome
could genuinely come out either way, including what you would hold fixed.`,
      rubric: md`**(1) The prediction.** At $I \approx 400$ you are **right of the ridge**
($I^{*} \approx 295$): compute-bound, with attainable performance clamped at $P$ and no bandwidth
term in play. A technique whose mechanism is *moving fewer bytes* therefore has little or nothing to
give you on throughput — predict close to $1.0\times$, perhaps a modest win from the *fusion* half
(fewer launches, fewer activation round-trips) which is a different mechanism. The vendor is not
lying: at batch 1, $I \approx 1$–$2$, deep in memory-bound territory, and there halving bytes really
is worth about $2\times$. **A multiplier is a property of an optimisation applied to a workload in a
regime**, and benchmarks are quoted in the regime that flatters them.

**(2) The number that could still justify it.** *Capacity.* Lower-precision weights (and especially a
smaller KV cache) free memory, which raises the number of concurrent requests you can hold, which
raises utilisation and lowers **cost per million tokens served** at your latency target. That —
dollars per token at a fixed p95 latency, not raw tok/s — is the metric to evaluate against, and it
is the metric the cost model says you actually care about. Credit also for: relief on time-to-first-token
if prefill scheduling improves, or the ability to fit a larger model on the same node.

**(3) The test.** Essentials: measure **your** workload, not theirs — your model, your prompt/output
length distribution, your batch size — and hold latency fixed while comparing throughput (or hold
throughput fixed and compare latency), since otherwise the two systems are being run at different
points on the curve and the comparison is meaningless. Sweep batch size so you can *see* the
crossover: the strong prediction is a large win at batch 1 that decays toward nothing by batch 256,
and observing that curve tells you far more than any single number. Pre-register the decision rule
(e.g. "we adopt if cost per million tokens at p95 under 200 ms improves by more than 15%") so the
result can come out against you. Include a quality check — low precision can move outputs — with a
pass/fail threshold set in advance.

"Nailed it" requires the roofline reasoning in (1), a *capacity/cost* argument distinct from the
bandwidth argument in (2), and a test in (3) with something held fixed and a failure outcome that
is genuinely possible.`,
    },
    {
      id: 'm8-l1-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old.** A kid asks: "If the computer can do a quadrillion
things every second, why does the chatbot type out its answer one word at a time like it's thinking
really hard?" Explain: (1) why the computer spends most of its time *waiting* rather than
calculating; (2) why serving lots of people at once makes each computer much more useful, even
though nothing about the computer changed; (3) the "make the fast part faster" trap — why fixing the
part that *looks* slow often barely helps. Invent your own analogies; inventing a better one than
the lesson's is worth more than borrowing it.`,
      rubric: md`Grade the teaching, not the vocabulary.

**1. The waiting.** The kid must end up with the *ratio*, made concrete: the calculating part is
absurdly fast, but before it can do anything it has to go fetch a gigantic book of numbers, and the
fetching is what takes the time — like a chef who can chop an onion in a tenth of a second but has
to walk to a warehouse across town for every single onion. Strong answers get the asymmetry vivid
(the chef spends 99% of the day walking) rather than merely stating that memory is slow.

**2. Batching.** Since the whole trip is for the *book*, and the book is the same book for everybody,
you can answer thirty people's questions with **one trip**. The chef going to the warehouse once and
carrying enough onions for thirty dinners. Crucially: the chef did not get faster and the warehouse
did not move — you just stopped wasting the trips. Credit for noticing it stops helping eventually
(at some point the chopping itself is the limit — you cannot chop faster than you can chop).

**3. The trap.** If something takes ten minutes and one minute of it is the part you can see, then
even making that part *instant* leaves nine minutes. Any concrete version works: a road trip where
you obsess over how fast you pack the car; homework where you speed up the easy page. The
essential move is that the kid can state the ceiling *before* the work is done, from the fraction
alone — that is Amdahl's law without the name.

**Jargon audit:** "bandwidth," "memory-bound," "arithmetic intensity," "roofline," "MFU," "batching,"
"FLOPs," "ridge point," "parallelism" used without a kid-level translation first = **partial at
best**. Hiding an explanation inside a technical word is precisely the failure this exercise exists
to catch, and it is the failure mode of every performance engineer who has ever confused a listener
by saying "it's memory-bound" as though that were an explanation.`,
    },
  ],
}
