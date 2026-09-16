// Module 3, Lesson 4 — The memory-bandwidth wall (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm3-l4',
  title: '3.4 The speed of thought — the memory-bandwidth wall',
  subtitle: md`An H100 multiplies numbers a quadrillion times a second, yet streams your reply at
a few dozen words. Divide the two spec-sheet numbers and the machine should be a thousand times
faster than it is. This lesson finds the missing factor — and then derives half the inference
industry from it.`,
  sections: [
    {
      type: 'text',
      md: md`
## A scandal in two numbers

Pull two numbers off public spec sheets and do the obvious division.

**Number one:** an H100 GPU sustains about $10^{15}$ floating-point operations per second
(counting a multiply-add as two operations).

**Number two:** one decode step of a 7-billion-parameter model costs about 2 FLOPs per
parameter — each weight gets multiplied by one activation and added into a running sum, the
matrix arithmetic you audited in Module 2. So one new token costs roughly
$2 \times 7 \times 10^9 = 1.4 \times 10^{10}$ FLOPs.

**The division:** $10^{15} / (1.4 \times 10^{10}) \approx 70{,}000$ tokens per second.

Now go measure. Single stream, batch of one, 7B model on an H100: **under 100 tokens per
second**. The prediction is off by roughly a factor of a *thousand*. The most expensive
arithmetic machine money can buy is spending 99.9% of its time doing nothing — and no, it isn't
Python overhead, thermal throttling, or a slow softmax. Something enormous is missing from the
naive estimate, and it's missing because it is a cost so mundane that we forgot to count it at
all.

Find the missing factor and you will understand, in one stroke, why quantization works, why
providers batch, why input tokens are cheap, and why one of the cleverest tricks in inference is
free. Let's find it.
`,
    },
    {
      type: 'text',
      md: md`
## Arithmetic needs operands

A multiplier cannot multiply numbers it doesn't have. Every FLOP in that decode step needs its
operands — a weight and an activation — **physically delivered** to the compute units. And where
do the weights live? In the GPU's main memory (HBM), off to the side of the chip. Two facts now
collide:

**Fact 1:** the fast on-chip storage next to the compute units holds roughly 50 MB. The model's
weights, in fp16 at 2 bytes each, are $7 \times 10^9 \times 2 = 14$ GB — about 280× too big to
keep close. The weights live off-chip, full stop.

**Fact 2:** batch-of-one decode computes *one thin column* (lesson 3.3): every layer's work is a
matrix-*vector* product, and a matrix-vector product touches each matrix entry **exactly once**.
Each weight is used once for this token, then not again until the next one.

Used once means *no reuse*. No reuse means every decode step must haul **all 14 GB** from memory
to the compute units — again, for every single token. So time the haul. H100 memory bandwidth:
3.35 TB/s.

$$t_{\text{haul}} \;\ge\; \frac{14 \text{ GB}}{3350 \text{ GB/s}} \approx 4.2 \text{ ms per token}$$

And the arithmetic? $1.4 \times 10^{10}$ FLOPs at $10^{15}$ FLOPs/s = **14 microseconds**. The
step computes for 14 µs and hauls bytes for 4,200 µs. There is your missing factor of ~300 — the
rest of the gap down to "under 100" is overheads and some extra traffic we'll meet in a moment.
The multipliers were never the constraint; the *conveyor belt feeding them* is. Invert the haul
time and you get a hard ceiling that no clever kernel can beat:

$$\boxed{\;\text{single-stream decode tokens/sec} \;\le\; \frac{\text{memory bandwidth}}{\text{bytes that must move per token}}\;}$$

For our case: $3350 / 14 \approx \mathbf{240}$ tokens/sec, *no matter how fast the multipliers
are*. This law is the first thing an inference engineer computes for any chip-model pair, and
you can check it against any spec sheet on Earth — that's the homework hiding in this lesson.

One more passenger on the conveyor: **the KV cache rides along**. Each step must also read every
cached key and value (3.3's bill: 0.5 MB per token of context for this model). At a 4k context
that's +2.1 GB per step — ceiling drops to $3350/16.1 \approx 208$. At 128k context it's +69 GB:
$3350/83 \approx \mathbf{40}$ tokens/sec. Long conversations literally type slower — you have
watched this law act on your own screen without knowing its name.
`,
    },
    {
      type: 'text',
      md: md`
## One number to diagnose any workload: arithmetic intensity

Before harvesting consequences, generalize. For any workload, compute its **arithmetic
intensity**: FLOPs performed per byte moved. Every machine, meanwhile, has a balance point —
peak FLOPs divided by bandwidth. For the H100:

$$\frac{10^{15} \text{ FLOPs/s}}{3.35 \times 10^{12} \text{ bytes/s}} \approx 300 \text{ FLOPs per byte}$$

The **roofline** picture, in words: compute and memory transfer run concurrently, so a
workload's time is $\max(\text{arithmetic time},\, \text{memory time})$ — whichever is longer
binds. Intensity above ~300 FLOPs/byte: the H100 is compute-bound, earning its keep. Below:
memory-bound, and your achieved-FLOPs fraction is roughly intensity ÷ 300.

Now place decode on this map. Two FLOPs per parameter, two bytes per fp16 parameter: about **1
FLOP per byte** — call it 2 if you're feeling generous about the attention arithmetic. Against a
balance point of 300, decode sits *two orders of magnitude* deep in memory-bound territory. The
0.3% utilization isn't sloppy engineering; it is the intrinsic shape of the workload.

Here's the fun part. This one inequality — decode intensity ≈ 1, machine balance ≈ 300 —
*generates an industry*. Everything below is a corollary. Watch.
`,
    },
    {
      type: 'text',
      md: md`
## Corollary 1 — quantization is a bandwidth trick

Quantize the 7B model from fp16 to 4-bit and the weights shrink from 14 GB to 3.5 GB. The
ceiling quadruples: $3350 / 3.5 \approx 960$ tokens/sec on the H100. And here's the point nearly
everyone gets backwards: the speedup is **not** because 4-bit arithmetic is faster. The
multipliers were 99.7% idle — making them faster would change nothing. In fact the GPU typically
*dequantizes* the weights and does the math in higher precision anyway, spending **extra**
FLOPs — and still wins, because below the roofline FLOPs are free and **bytes are everything**.
Quantization is a diet for the conveyor belt.

This single corollary is why local LLMs exist at all — as the next example computes.
`,
    },
    {
      type: 'example',
      title: 'why your laptop can run a 7B model at all',
      md: md`
Apple-silicon laptops have unified memory with bandwidths from roughly 100 GB/s (M2) through
200 GB/s (M2 Pro) to 400 GB/s (M3 Max). A 4-bit 7B model is about $7 \times 10^9 \times 0.5 =
3.5$ GB. Apply the law:

- **M2 (100 GB/s):** $100 / 3.5 \approx 29$ tokens/sec ceiling
- **M2 Pro (200 GB/s):** $200 / 3.5 \approx 57$ tokens/sec
- **M3 Max (400 GB/s):** $400 / 3.5 \approx 114$ tokens/sec

That predicted band — **roughly 30 to 115 tokens/sec** — is exactly the range ollama users
report, typically landing at 50–80% of ceiling once dequantization, attention, and cache reads
take their cut. Two spec-sheet numbers and a division predicted your laptop's behavior before
you downloaded a single model.

Now run it in fp16 instead: 14 GB barely squeezes into a 16 GB machine and the M2 ceiling drops
to $100/14 \approx 7$ tokens/sec — below reading speed. Quantization isn't a nice-to-have for
local inference; it is the difference between a product and a party trick.
`,
    },
    {
      type: 'ponder',
      question: md`Price your own machine. Look up its memory bandwidth (spec sheets list it:
M1 ≈ 68 GB/s, M-series Pro ≈ 200, M3/M4 Max ≈ 400+, desktop DDR5 ≈ 60–90, an RTX 4090 ≈ 1000),
take the on-disk file size of a model you actually run (a GGUF file's size ≈ the bytes hauled
per token), and divide. Then compare against what ollama actually shows you. Two questions: why
does the measured number sit *below* your ceiling — and what does the law predict will happen as
your chat grows long?`,
      answer: md`The recipe: tokens/sec ≤ bandwidth ÷ model-file-bytes. A 4.7 GB q4 model on a
200 GB/s M2 Pro: ceiling ≈ 42; ollama will typically show ~25–35. The gap is real overhead the
envelope ignores: dequantization arithmetic, attention work, KV-cache reads, and scheduling —
50–80% of ceiling is healthy, and if you measure 10% of ceiling, something is genuinely broken
(this diagnostic is the point of owning the law). As the chat grows, the KV cache's bytes join
every step's haul, so tokens/sec *decays with context length* — watch ollama slow down late in
a long conversation and you're watching the denominator grow. Bonus reading of the same law: a
4090 at ~1000 GB/s beats a desktop CPU at ~80 GB/s by ~12× on the identical model — the GPU
market for inference is a bandwidth market wearing a compute costume.`,
    },
    {
      type: 'text',
      md: md`
## Corollary 2 — batching: one haul, thirty-two passengers

If one token's decode hauls 14 GB to perform a sliver of arithmetic, the fix suggests itself:
**make the haul serve more arithmetic**. Stack 32 users' conversations side by side and each
layer's matrix-vector product becomes a matrix-matrix product with 32 columns — the weights are
hauled from memory **once per step** and applied to all 32 sequences. Per-user weight traffic
drops 32×; arithmetic intensity rises 32×; the idle multipliers finally get fed.

This is why every serving provider batches aggressively — and why *your* chat doesn't speed up
when they do. Throughput and latency part ways here, and honesty requires saying so plainly:
the *fleet* generates many times more tokens per second, while each individual stream still
waits for one full step per token. You share the conveyor; you don't get a faster one.
`,
    },
    {
      type: 'example',
      title: 'the batch-32 bill, line by line',
      md: md`
One H100, Llama-7B fp16, 32 concurrent users at 4k context each (3.3's cache bill: 2.1 GB per
user).

**Weight traffic per step:** 14 GB — *shared* by all 32 users. Amortized:
$14 / 32 \approx \mathbf{0.44}$ GB per user per token, down from 14. That ÷32 is the entire
economics of the API business.

**Cache traffic per step:** caches are private — every user's history is different — so they do
**not** amortize: $32 \times 2.1 = 67$ GB. Notice the reversal: in batch serving, the *caches*
out-haul the *weights* five to one. (Now you know why 3.3's GQA — shrinking the cache 4× by
architecture — is worth redesigning attention for: it's the batch-size limiter.)

**Step time:** $(14 + 67) / 3350 \approx 24$ ms — yielding 32 tokens, one per user.

**The two headline numbers:** aggregate throughput $\approx 32 / 0.024 \approx 1{,}300$
tokens/sec (vs 208 serving one user at 4k) — a 6× win for the provider. Per-user speed:
$1/0.024 \approx 41$ tokens/sec — *slower* than the 208 the user would get alone. Throughput
bought with latency, which is precisely the trade your API subscription is priced on.
`,
    },
    {
      type: 'text',
      md: md`
## Corollary 3 — prefill is compute-bound (a promise cashed)

Lesson 3.3 promised this lesson would explain prefill's speed. Watch how little work it takes
now. Processing an $n$-token prompt is one parallel pass: the weights are hauled once and each
weight participates in the arithmetic of **all $n$ positions**. FLOPs scale with $n$; bytes
don't. Arithmetic intensity is therefore roughly $n$ FLOPs per byte — and against the H100's
balance point of ~300, that means **a prompt beyond a few hundred tokens crosses into
compute-bound territory**, the regime the GPU was actually built for. Feed it a 2,000-token
prompt and it devours all 2,000 in roughly the time decode spends on a handful of tokens.

Same weights, same GPU, same math — intensity 300 versus intensity 1, purely because prefill's
tokens already exist and decode's don't. That asymmetry, now fully derived, is 3.3's pricing-page
puzzle closed: **input tokens cost several times less than output tokens** on every provider's
price list because input tokens genuinely cost several times less to produce. The gap on the
pricing page is a roofline diagram wearing a price tag.
`,
    },
    {
      type: 'text',
      md: md`
## Corollary 4 — speculative decoding: the free lunch that checks out

The prefill corollary hides a wild asymmetry worth staring at: **generating** $k$ tokens costs
$k$ full hauls (serial, memory-bound, awful) — but **checking** $k$ tokens that already exist
costs about *one* haul, because scoring known text is a prefill-shaped parallel pass. Verifying
is ~$k$ times cheaper than generating. Can we buy tokens cheap somewhere and only *verify* them
with the big model?

Yes. That's **speculative decoding**:

1. A small, cheap **draft model** (say ~1B parameters — its haul is a few *tenths* of a
   millisecond) proposes the next $k$ tokens, one by one. Fast, but possibly wrong.
2. The big model runs **one** prefill-shaped pass over all $k$ proposals — one 14 GB haul,
   reused $k$ times, intensity multiplied by $k$ — and obtains its own probability for every
   proposed token *simultaneously*.
3. Walk the proposals left to right, accepting while draft and target agree (the acceptance
   test compares their probabilities); at the **first rejection**, throw the rest away and
   resample that position from a corrected distribution. Then repeat from step 1.

Here is the part that sounds too good to be true and isn't: with the acceptance-and-resample
rule done right, the output sequence is distributed **exactly** as if the big model had decoded
alone — bit-for-bit the same statistics, not an approximation. That's a theorem (the
rejection-sampling guarantee; we state it and use it — the full proof belongs to the papers).
The draft model can be terrible; you'd lose *speed*, never *quality*.

The accounting: if the draft's proposals are accepted ~70–80% of the time, each big-model haul
yields 3–4 tokens instead of 1 — and measured end-to-end speedups in production land at
**2–3×**, with zero quality change. Notice what was actually traded: nothing was skipped.
Serial decode was *converted into parallel verification* — moving work from the intensity-1
regime into the intensity-$k$ regime, where the idle multipliers pay for it. The wall didn't
move; we found a shape of work that fits through it.
`,
    },
    {
      type: 'ponder',
      question: md`The whole trick hinges on step 2: the big model checks all $k$ drafted tokens
for the cost of about *one* decode step, not $k$. Why is that possible? (You have met this
property twice before — once in this very lesson.)`,
      answer: md`Because the $k$ drafted tokens already *exist* — and for known text, one forward
pass computes every position's next-token distribution **simultaneously**: the causal mask gives
each position its correct view of the prefix, all positions in parallel (and byte-wise, one
weight haul serves all $k$ checks — intensity ×$k$, with the extra FLOPs landing on idle
multipliers, i.e., free). This is the transformer's deepest symmetry, now cashed for the third
time: it made **training** parallel in 2.6 (score every position of the training text at once),
it made **prefill** cheap earlier this lesson, and it makes **verification** cheap here. The
machine is parallel across positions whenever the tokens are known, and serial only when each
token must be *invented*. Speculative decoding is simply the art of converting invention into
verification — letting a cheap model do the inventing, and the expensive model only ever do the
thing it's structurally good at.`,
    },
    {
      type: 'ponder',
      question: md`Now try to serve a 70B model in fp16 on one H100. Compute the ceiling from
the law — and then say what actually stops you, *before* bandwidth ever gets the chance. What
are the ways out?`,
      answer: md`The law says: $140 \text{ GB} / 3350 \text{ GB/s} \approx 42$ ms per token —
about **24 tokens/sec** — *if the weights were there to haul*. They aren't: 140 GB does not fit
in the H100's 80 GB of memory. Behind the bandwidth wall stands a second wall — **memory
capacity** — and it hits first: some models cannot even board a single GPU. The ways out: (1)
quantize — at 4 bits, 70B is ~35–40 GB, fits, and the ceiling becomes $3350/35 \approx 96$
tokens/sec — capacity *and* bandwidth relief in one move; or (2) split the model across several
GPUs — but now weights and activations must cross the interconnect (NVLink: ~900 GB/s, roughly
a quarter of HBM bandwidth), and the entire analysis of this lesson restarts one level up, with
a slower conveyor between chips. Sharding a model without drowning in interconnect traffic is a
genuine discipline — and it is exactly where Module 4 begins.`,
    },
    {
      type: 'text',
      md: md`
## The envelope, honestly

Everything in this lesson was a batch-size-1 back-of-envelope. It ignored kernel-launch
overheads, the attention arithmetic, dequantization costs, tokenizers, networks, and schedulers;
real serving engines — continuous batching, paged caches, fused kernels — live entirely in those
gaps, and real measurements land at 50–80% of these ceilings. But hold on to what the envelope
*did* do: it predicted the order of magnitude of every number in modern inference — your
laptop's token rate, the API pricing gap, the batch economics, the speculative speedup — from a
division. Bytes over bandwidth is the first calculation any inference engineer performs on any
new chip or model, usually on an actual envelope. Now it's yours too.

## What you now own

1. **The scandal, resolved:** 70,000 tokens/sec predicted, under 100 measured — because decode
   computes for 14 µs and hauls 14 GB for 4.2 ms. Step time *is* memory time.
2. **The law:** tokens/sec ≤ bandwidth ÷ bytes-per-step (weights *plus* KV cache — long chats
   type slower). Checkable against any spec sheet.
3. **Arithmetic intensity:** decode ≈ 1–2 FLOPs/byte against a machine balance of ≈ 300 —
   memory-bound by two orders of magnitude, structurally, not accidentally.
4. **Quantization = fewer bytes**, not faster math: 4-bit quadruples the ceiling and is the
   entire reason a laptop runs 7B models at 30–115 tokens/sec.
5. **Batching:** weights amortize ÷B, caches don't (67 GB vs 14 GB at batch 32!) — throughput
   for the fleet, unchanged-or-worse latency for you. The cache bill from 3.3 is the true batch
   limiter.
6. **Prefill is compute-bound:** intensity ≈ $n$, crossing the roofline near 300-token prompts —
   3.3's promised explanation of the prefill/decode asymmetry and the input/output price gap,
   now derived.
7. **Speculative decoding:** invent cheaply, verify in parallel, accept with the
   rejection-sampling rule — *exactly* the big model's distribution, 2–3× faster, powered by the
   same causal-parallelism that made training parallel (third time cashed).
8. **The wall behind the wall:** capacity. A 140 GB model cannot board an 80 GB GPU no matter
   how fast either of them is.

Module 4 is next: when one GPU isn't enough — parallelism, sharding, and the data centers behind
the API.
`,
    },
  ],
  questions: [
    {
      id: 'm3-l4-q1',
      kind: 'mcq',
      prompt: md`An H100 does ~$10^{15}$ FLOPs/s; a 7B decode step needs ~$1.4 \times 10^{10}$
FLOPs — yet single-stream generation runs under 100 tokens/sec, not ~70,000. What is the
dominant reason?`,
      options: [
        md`Attention's quadratic cost in context length consumes the compute budget`,
        md`Every step must haul all 14 GB of weights from GPU memory to the compute units, and
at 3.35 TB/s that alone takes ~4 ms — the multipliers idle while the bytes arrive`,
        md`Framework and kernel-launch overhead dominates each step`,
        md`The softmax over the 32,000-token vocabulary must run serially`,
      ],
      answer: 1,
      explain: md`Arithmetic needs operands: batch-1 decode uses each weight exactly once per
token (matrix-vector products), so there's no reuse and the full 14 GB crosses the memory bus
every step — 4.2 ms of hauling against 14 µs of math. Option A tempts because attention *is*
quadratic — but at ordinary contexts its cost is small next to the weight haul (and the KV-cache
reads are themselves memory traffic, i.e., the same wall). Option C tempts because overhead is
real — it's part of why measured speed sits below the 240 ceiling — but it's the small
correction, not the missing factor of ~300. D is negligible arithmetic either way.`,
    },
    {
      id: 'm3-l4-q2',
      kind: 'numeric',
      prompt: md`A GPU has 1 TB/s of memory bandwidth and serves a 7B model in fp16 (14 GB).
Using the ceiling law, what is the maximum single-stream decode speed in **tokens per second**
(short context — ignore the KV cache)?`,
      answer: 71,
      tolerance: 10,
      explain: md`$1000 \text{ GB/s} / 14 \text{ GB} \approx \mathbf{71}$ tokens/sec. Note what
did *not* appear in the calculation: the GPU's FLOPs. For single-stream decode, the compute spec
is irrelevant to the ceiling — a scandalous but liberating fact you can now verify against any
spec sheet in about ten seconds.`,
    },
    {
      id: 'm3-l4-q3',
      kind: 'written',
      prompt: md`**Derive, don't recall — the ceiling law.** On paper: (1) starting from what
batch-1 decode actually computes, argue why every parameter's bytes must cross from memory to
compute **once per token** (what property of matrix-vector products, and what fact about
on-chip storage, force this?); (2) derive the bound step time ≥ bytes ÷ bandwidth and invert it
into the tokens/sec law; (3) apply it: a 13B model in fp16 on a 2 TB/s chip — ceiling? — and
what does it become at a context where the KV cache adds 26 GB per step?`,
      rubric: md`**(1) The forced haul:** decode processes one thin column, so each layer is a
matrix-vector product, which touches every matrix entry exactly **once** — no reuse within a
step. And on-chip storage (~tens of MB) is hundreds of times smaller than the weights (26 GB
here), so weights cannot stay resident between steps — every step re-hauls all of them from
main memory. Both halves required: "once per step" needs the no-reuse argument *and* the
capacity argument.

**(2) The law:** transfer time ≥ bytes / bandwidth, and compute time (µs) is negligible beside
it, so step time ≈ haul time; invert: tokens/sec ≤ bandwidth / bytes-per-step.

**(3) Application:** $13 \times 10^9 \times 2 = 26$ GB; $2000 / 26 \approx \mathbf{77}$
tokens/sec. With +26 GB of cache: $2000 / 52 \approx \mathbf{38}$ tokens/sec — halved, which is
the "long chats type slower" phenomenon in numbers.

"Nailed it" = the derivation from no-reuse + capacity (not a recalled formula), the inversion,
and both applied numbers. Reciting the law without the once-per-token argument is exactly what
this question is not about.`,
    },
    {
      id: 'm3-l4-q4',
      kind: 'mcq',
      prompt: md`Quantizing a 7B model from fp16 to 4-bit roughly quadruples single-stream
decode speed. Why?`,
      options: [
        md`4-bit multiply units are about four times faster than fp16 units`,
        md`The weights shrink from 14 GB to 3.5 GB, so each step's mandatory memory haul is 4×
smaller — and decode time was memory time`,
        md`Quantization prunes three quarters of the parameters, so there is less arithmetic to
do`,
        md`At 3.5 GB the weights fit in on-chip cache, eliminating memory traffic entirely`,
      ],
      answer: 1,
      explain: md`Fewer bytes, not faster math: the multipliers were ~99.7% idle, so speeding
them up would change nothing — indeed the GPU typically *dequantizes* and spends extra FLOPs,
and still wins, because FLOPs are free below the roofline. Option A tempts because "smaller
number format = faster arithmetic" is true in compute-bound settings — just not here. Option C
confuses quantization (fewer bits per parameter, same parameter count) with pruning. Option D
tempts with the right instinct at the wrong scale: on-chip cache is ~50 MB, and 3.5 GB is still
70× too big — the haul shrinks 4×, it doesn't vanish.`,
    },
    {
      id: 'm3-l4-q5',
      kind: 'numeric',
      prompt: md`A laptop has 200 GB/s of memory bandwidth and runs a 4-bit 7B model
(≈ 3.5 GB). Ceiling in **tokens per second**?`,
      answer: 57,
      tolerance: 10,
      explain: md`$200 / 3.5 \approx \mathbf{57}$ tokens/sec — squarely in the band ollama users
actually report on M-series Pro machines (expect 50–80% of ceiling once dequantization and
cache reads take their cut). Two public numbers and one division predicted a real product
experience — that's the entire practice of inference estimation in miniature.`,
    },
    {
      id: 'm3-l4-q6',
      kind: 'written',
      prompt: md`**The PM memo.** Your product manager writes: "We enabled batch-32 on the
serving fleet and total token output jumped ~6×, but my own chat streams no faster — maybe
slower. Is batching broken?" Reply in a short memo: define the two quantities being confused,
explain the mechanism by which batching helps one and not the other (use the weight-haul and
the per-user cache numbers), and name at least one lever that *would* speed up a single stream.`,
      rubric: md`**The two quantities:** *throughput* — total tokens/sec across all users (the
fleet's output, the provider's cost line) — versus *latency* — seconds per token for one
stream (what the PM feels). Batching targets the first, by design.

**The mechanism:** each step hauls the 14 GB of weights **once**, shared by 32 sequences —
per-user weight traffic drops to 14/32 ≈ 0.44 GB — but each user's KV cache is private (32 ×
2.1 GB = 67 GB at 4k), and every user still receives exactly **one token per step**. Steps get
*longer* (≈ 24 ms vs ≈ 5 ms solo), so per-user speed can genuinely drop (≈ 41 vs ≈ 208
tokens/sec) while fleet throughput soars. Batching isn't broken; it's working exactly as
purchased — throughput bought with latency.

**True single-stream levers:** quantization (fewer bytes per haul), speculative decoding
(2–3×, quality-lossless), higher-bandwidth hardware, or a smaller/GQA model (smaller cache).

Full credit: both definitions, the shared-weights vs private-caches mechanism with at least the
÷32 number, the honest "your stream may get *slower*" point, and one legitimate latency lever.`,
    },
    {
      id: 'm3-l4-q7',
      kind: 'mcq',
      prompt: md`Why do input (prompt) tokens cost several times less than output tokens on
every provider's pricing page?`,
      options: [
        md`Prompt tokens tend to be commoner words, which are cheaper to embed`,
        md`Prefill processes all n prompt positions in one pass, reusing each hauled weight n
times — arithmetic intensity ~n makes it compute-bound and cheap per token; decode hauls the
full weights for every single output token`,
        md`Providers subsidize input tokens to encourage longer prompts`,
        md`The KV cache makes prompt processing free after the first token`,
      ],
      answer: 1,
      explain: md`Prefill's tokens already exist, so the weights are hauled once and used $n$
times — intensity ≈ $n$ crosses the ~300 FLOPs/byte roofline for prompts beyond a few hundred
tokens, putting the GPU in its compute-bound natural habitat; decode stays at intensity ≈ 1,
paying a full 14 GB haul per token. The price gap mirrors a genuine cost gap. Option D tempts
because the cache *is* built during prefill — but the cache is what makes *decode* survivable
(3.3), not what makes prefill cheap. C tempts the cynical; no subsidy needed when the physics
already does it. A is decoration — embedding cost is identical per token.`,
    },
    {
      id: 'm3-l4-q8',
      kind: 'numeric',
      prompt: md`With batch-32 decoding of a 14 GB model, the weight haul is shared by all 32
sequences. How many **GB of weight traffic per user per token** is that, amortized?`,
      answer: 0.44,
      tolerance: 0.06,
      explain: md`$14 / 32 \approx \mathbf{0.44}$ GB — a 32× cut in the dominant per-user cost,
which is the arithmetic underneath every "tokens are cheap at scale" business model. The
caveat you now know to attach: KV caches are private and do *not* divide by 32 — at long
contexts the caches, not the weights, become the haul that limits how large the batch can grow.`,
    },
    {
      id: 'm3-l4-q9',
      kind: 'written',
      prompt: md`**Teach speculative decoding to a colleague** who knows this lesson's ceiling
law but hasn't seen the trick. Cover: (1) the cost asymmetry it exploits (generating k tokens
vs checking k existing tokens — with the byte accounting); (2) the loop (draft proposes k,
target verifies in one pass, accept-until-first-disagreement, resample there); (3) the exact
statistical guarantee and its status (state it; you need not prove it); (4) where the speed
comes from and when the trick fails to pay.`,
      rubric: md`**(1) Asymmetry:** generating k tokens = k serial hauls of the full weights
(intensity ≈ 1); *checking* k known tokens = one prefill-shaped parallel pass — one haul reused
k times (intensity ×k), with the extra FLOPs landing on idle multipliers. Verification is ~k×
cheaper than generation, byte-for-byte.

**(2) The loop:** small cheap draft model proposes k tokens serially (its haul is ~10× smaller,
so this is fast); big model scores all k in one pass; walk left to right accepting while the
acceptance test (comparing draft vs target probabilities) passes; at the first rejection,
discard the rest and resample that position from a corrected distribution; repeat.

**(3) The guarantee:** with the acceptance-and-resample rule, the output distribution is
*exactly* the big model's — not approximately — a proven rejection-sampling theorem, cited here
rather than derived. A bad draft costs speed, never quality.

**(4) Speed and failure:** each big-model haul now yields ~3–4 tokens at 70–80% acceptance —
2–3× measured. It fails to pay when the draft disagrees constantly (acceptance low → you pay
draft cost plus verification for ~1 token per round) — e.g., a draft mismatched to the domain.

"Nailed it" = all four beats, with the byte accounting doing real work in (1) and the guarantee's
exactness stated in (3). Bonus for connecting the one-pass verification to causal parallelism
(2.6) — the same symmetry, third time cashed.`,
    },
    {
      id: 'm3-l4-q10',
      kind: 'mcq',
      prompt: md`Single-stream decode runs at arithmetic intensity ~2 FLOPs/byte on a GPU whose
balance point is ~300 FLOPs/byte. Which hardware upgrade raises decode speed?`,
      options: [
        md`Double the peak FLOPs (faster tensor cores)`,
        md`Double the memory bandwidth`,
        md`Double the memory capacity (80 GB → 160 GB)`,
        md`Double the on-chip L2 cache`,
      ],
      answer: 1,
      explain: md`Below the balance point, step time = bytes ÷ bandwidth, full stop — compute
finishes in microseconds and waits. Doubling bandwidth halves the haul; doubling FLOPs polishes
an idle unit (option A tempts because "faster chip" is the reflex — the roofline says which
spec is *load-bearing*). Option C is this lesson's subtlest temptation: capacity and bandwidth
both say "memory," but capacity decides what *fits* (the wall behind the wall), not how fast
bytes move — 160 GB at the same TB/s decodes no faster. D fails by scale: caches of tens of MB
cannot hold multi-GB weights, so the haul happens regardless.`,
    },
    {
      id: 'm3-l4-q11',
      kind: 'numeric',
      prompt: md`**Fermi.** A 70B model in fp16 is 140 GB. On an H100-class 3.35 TB/s memory
system — pretending, for the estimate, that the weights fit on one GPU — what single-stream
decode ceiling does the law give, in **tokens per second**?`,
      answer: 24,
      tolerance: 8,
      explain: md`$3350 / 140 \approx \mathbf{24}$ tokens/sec — reading speed, from a
hundred-billion-dollar industry's flagship chip, and that's the *ceiling*. And the "pretending"
clause is the real sting: 140 GB does not fit in 80 GB, so before bandwidth ever binds, memory
*capacity* refuses the boarding pass — quantize it or shard it across GPUs. That second option
is Module 4's opening problem.`,
    },
    {
      id: 'm3-l4-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old.** A computer that can do a million-billion math
steps every second still types its answer at about the speed you read. Explain to the kid: (1)
why doing math needs the numbers *brought to you* first; (2) what the computer must fetch all
over again for every single word it writes; (3) what actually sets the writing speed; (4) one
trick real systems use to go faster. Any word a 12-year-old wouldn't know must be explained in
kid words first.`,
      rubric: md`Grade the teaching, not the vocabulary. A strong answer lands:

1. **Math needs delivery** — you can't add numbers you're not holding; a super-fast calculator
   with an empty desk just waits. (Any grounding analogy works: a chef who chops instantly but
   waits on ingredients from the pantry.)
2. **The giant recipe book** — the computer's "brain" is billions of numbers stored on a big
   shelf, and to pick each next word it must consult *all of them* — so every single word means
   carrying the entire shelf past the desk, again.
3. **The conveyor sets the pace** — the writing speed is the carrying speed (shelf size ÷ how
   fast the hallway moves), not the math speed; the calculator finishes instantly and spends
   almost all its time waiting. Bonus: a longer story means more notes to carry too, so long
   chats type slower.
4. **One real trick, kid-level** — shrink the book (write the numbers smaller so the trip is
   lighter = quantization), share one trip among many people's questions (= batching), or let a
   quick little helper guess a few words ahead and have the big brain check them all in one trip
   (= speculative decoding). Any one, honestly told, earns the point.
5. **Jargon audit:** "GPU," "bandwidth," "FLOPs," "HBM," "quantization," "KV cache," "batch"
   used without a kid-level explanation first = partial credit at best — naming a thing is not
   explaining it, and hiding behind names is the failure this exercise exists to catch.`,
    },
  ],
}
