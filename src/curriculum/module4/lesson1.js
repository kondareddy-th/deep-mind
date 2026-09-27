// Module 4, Lesson 1 — The memory wall (anchor lesson, Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm4-l1',
  title: '4.1 The memory wall — why one GPU is never enough',
  subtitle:
    'Lesson 1.6 whispered that Adam keeps two extra copies of everything. Lesson 3.4 found a 70B model that won\'t even fit. This lesson adds up the whole bill — and the total is so absurd that everything else in Module 4 becomes inevitable.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

You have Llama-70B and one H100 — the best AI accelerator money can rent, with 80 GB of fast
memory. Load the model for *inference* in fp16: $70 \times 10^9 \times 2$ bytes $= 140$ GB. Dead.
You haven't computed a single token; the weights alone are $1.75\times$ the card.

Fine — you buy a second H100 and split the weights. Now try to **train** it. Training, you'll
recall, needs more than weights: lesson 1.3 gave every parameter a gradient, and lesson 1.6 gave
Adam two running moments per parameter — and teased that this bill would come due. Today it does,
and it is spectacular: training this 140 GB model honestly requires about **1.1 terabytes** of
state — *fourteen H100s just to hold the numbers*, before one byte of activations, before any
efficiency concerns, before you've even started.

This lesson does three things: derives that bill line by line (no hand-waving — you'll check every
entry), maps the *hierarchy of speeds* that any escape plan must respect, and shows why every
escape buys memory by spending the one thing the hierarchy punishes: **communication**.

## The bill, derived: why training costs 16 bytes per parameter

Modern training runs in **mixed precision**: fast 16-bit arithmetic where possible, careful 32-bit
where necessary. Why not 16-bit everywhere? Because of an arithmetic murder you can witness on
paper.

A typical single Adam update nudges a weight by something like $10^{-4}$ relative to its size.
Represent the weight $1.0$ in fp16 — which carries about 10-11 bits of mantissa, i.e. resolution
$\approx 2^{-10} \approx 0.001$ near $1.0$ — and try to apply the nudge:

$$1.0 + 0.0001 \;\xrightarrow{\text{fp16 rounding}}\; 1.0$$

The update **vanishes**. Not shrinks — vanishes: the step is smaller than the space between
adjacent representable numbers. Train for a million steps and a fp16-only model quietly refuses to
learn its fine structure. So the optimizer keeps *master copies* in fp32 (23-bit mantissa,
resolution $\approx 10^{-7}$), where the nudge survives, and rounds to bf16 only for the fast
matmuls. Add it up, per parameter:

| what | precision | bytes |
|---|---|---|
| working weights (for fast matmuls) | bf16 | 2 |
| gradients | bf16 | 2 |
| master weights | fp32 | 4 |
| Adam first moment $m$ | fp32 | 4 |
| Adam second moment $v$ | fp32 | 4 |
| **total** | | **16** |

**Sixteen bytes per parameter** — versus two for inference. The model you chat with is the cheap
part; the machine that *made* it carried $8\times$ the state. For 70B parameters:
$70 \times 10^9 \times 16 = 1.12$ TB. There's the terabyte, from a table you can rebuild from
memory. (Surprise: pure fp32 training is *also* 16 bytes — 4 each for weights, gradients, $m$ and
$v$, with no separate master copy needed. Mixed precision doesn't shrink the optimizer bill; it buys
speed, via fast 16-bit matmuls, and halves the activation memory.)

## The other pile: activations

The 1.12 TB is only the *permanent* state. Lesson 1.3's backpropagation needs, at each layer, the
values from the forward pass — you can't compute how the loss wiggles with a weight without
knowing what flowed through it. Those stored forward values are **activations**, and they scale
with everything you want more of: batch size × sequence length × hidden size × layers. For a real
70B run at real batch sizes, naively storing them all adds *another* several hundred gigabytes to
terabytes.

The standard escape is a trade you already know inverted. **Activation checkpointing**: store only
every $k$-th layer's activations; when backprop needs the ones in between, *recompute* them from
the last checkpoint. Memory drops by roughly the checkpoint spacing; compute rises by about one
extra forward pass (~33% of the step). Recognize the shape: lesson 3.3's KV cache spent **memory
to avoid recomputing**; checkpointing spends **recompute to avoid remembering**. Same
time-vs-space dial, opposite ends — chosen by which resource is scarcer, and in training, memory
always is.
`,
    },
    {
      type: 'ponder',
      question: md`Both tricks — the KV cache (3.3) and activation checkpointing — sit on the same
time-versus-memory dial, yet production systems turn the dial in *opposite directions* for
inference and training. What makes memory the scarce resource in training but (usually) the
spendable one in inference?`,
      answer: md`Count what each must hold. Inference keeps 2 bytes/param and a KV cache;
recomputing the past every token would multiply *latency*, the thing users feel — so it spends
memory to save time. Training already holds 16 bytes/param *plus* activations *plus* bigger
batches; it's pinned against the capacity wall from the start, and its currency is *throughput*,
not per-request latency — a 33% slower step that lets you fit $4\times$ the batch (or fit at all!)
is a bargain. The dial setting isn't a law of nature; it's an economics theorem: **spend whichever
resource has slack**. When someone shows you a new systems trick, your first question is now
"which direction is it turning this dial, and why is that the right direction *here*?"`,
    },
    {
      type: 'text',
      md: md`
## The hierarchy of speeds — the terrain every escape must cross

So the state doesn't fit in one GPU; it must live across many. Before choosing *how* to split
(that's lesson 4.2), you must know the terrain, because not all "elsewhere" is equal. Data lives
on a ladder, and every rung down is roughly an order of magnitude slower:

| rung | size | bandwidth | time to move 140 GB |
|---|---|---|---|
| on-chip SRAM | ~50 MB | tens of TB/s | (doesn't fit — that's the point) |
| HBM (the GPU's own memory) | 80 GB | ~3.35 TB/s | ~42 ms |
| NVLink (GPU↔GPU, same server) | — | ~900 GB/s | ~0.16 s |
| InfiniBand (server↔server) | — | ~50–100 GB/s | ~1.4–2.8 s |
| NVMe / host (spill to disk) | TBs | ~7–30 GB/s | ~5–20 s |

Read the last column like a musician reads a metronome. Lesson 3.4 taught that even *within* one
GPU, hauling 140 GB from HBM costs 42 ms and sets your tokens/sec. Now see what crossing servers
costs: the same 140 GB over InfiniBand takes ~2 seconds — **fifty times worse**. A parallelism
plan that casually ships weight-sized traffic across the slow rungs doesn't run slower; it doesn't
effectively run at all.

This ladder also explains a trick you met as magic in 2.2: **FlashAttention**. The $n^2$ attention
matrix at long context is huge (you computed 65 GB once) and lives nowhere — FlashAttention
computes attention in *tiles* small enough to stay in the top rung, the ~50 MB of SRAM that is
$10\times$ faster than even HBM, and never writes the full matrix down. It's not a new attention;
it's the old attention *routed through the fast rung of the ladder*. Most of modern systems
research is exactly this move, applied somewhere new.

## The shape of every escape

One GPU can't hold the state; many GPUs must — and now the ladder prices each option. Every
splitting strategy in lesson 4.2 is an answer to the same three questions:

1. **What do you split?** (the batch? the optimizer states? each matrix? the layer stack?)
2. **What must then travel, and how often?** (gradients each step? activations each layer?
   parameter shards on demand?)
3. **Which rung carries it — and can you hide the travel time behind compute?**

Different answers give data parallelism, ZeRO/FSDP, tensor parallelism, and pipeline parallelism —
and real frontier runs compose all four at once across tens of thousands of GPUs. Play with the
rack below to *see* what each choice does to the memory bars before the next lesson derives them.
`,
    },
    {
      type: 'viz',
      viz: 'parallelism-rack',
      caption:
        'Eight 80 GB GPUs and the 70B training bill (params, grads, optimizer, activations) as stacked bars against the red capacity line. Three experiments: (1) start on "1 GPU" and take in the disaster — 1240 GB against 80; (2) switch to data parallel — activations shrink (the batch splits) but the model state replicates, still catastrophically over the line on every card; (3) switch to ZeRO-3/FSDP — every bar drops 8×... and read the total: STILL over 80 GB. Eight GPUs cannot train a 70B even fully sharded — work out from the readout how many you would actually need (that is question 12). The next lesson derives each mode',
    },
    {
      type: 'example',
      title: 'the 70B training bill, line by line',
      md: md`
Check every entry — this table is the one an infra engineer scribbles before requesting a cluster:

| component | arithmetic | GB |
|---|---|---|
| working weights (bf16) | $70 \times 10^9 \times 2$ | 140 |
| gradients (bf16) | $70 \times 10^9 \times 2$ | 140 |
| master weights (fp32) | $70 \times 10^9 \times 4$ | 280 |
| Adam $m$ (fp32) | $70 \times 10^9 \times 4$ | 280 |
| Adam $v$ (fp32) | $70 \times 10^9 \times 4$ | 280 |
| **permanent state** | $70 \times 10^9 \times 16$ | **1120** |
| activations (batched, checkpointed) | depends on batch × seq | ~100–400+ |

Floor: **~14 H100s just to hold permanent state** ($1120 / 80$), before activations and working
headroom. Lesson 1.6's "560 GB of optimizer state" teaser was, you can now verify, just the $m$
and $v$ rows ($280 + 280$) — the full picture is worse. And notice the punchline hiding in the
ratio: the deployed model is 140 GB, so **training carries $8\times$ the memory of the artifact it
produces**. Nobody ships the scaffolding, but somebody has to hold it up.
`,
    },
    {
      type: 'ponder',
      question: md`Activations scale with batch size, so an obvious escape from the activation pile
is "just use a smaller batch." Lesson 3.4 should make you suspicious of this. What squeezes from
the other side?`,
      answer: md`The bandwidth wall. Each training step must haul the full working weights (and
write gradients) through HBM regardless of batch size — that traffic is *fixed*. A big batch
amortizes the fixed haul over many examples (high arithmetic intensity, GPUs fed); a small batch
turns training into decode-like starvation: the multipliers idle while memory streams weights for
a handful of examples (3.4's exact disease). So batch DOWN → bandwidth-starved throughput; batch
UP → activation memory explodes. Caught between the memory wall and the bandwidth wall, you take
the third door: checkpointing (recompute), sharding (4.2), or gradient accumulation — simulate a
big batch as several small forward/backward passes that *sum gradients* before one optimizer step,
trading a little step latency for both walls at once. The vice is real; the trade-space is where
infra engineers live.`,
    },
    {
      type: 'ponder',
      question: md`Checkpointing arithmetic, worked: an 80-layer model stores activations at every
layer. Suppose instead you checkpoint every 8th layer and recompute between checkpoints during
backprop. Roughly what happens to activation memory, and what does it cost in compute? (Then:
why is the *recompute* nearly free by lesson 3.4's logic?)`,
      answer: md`Memory: you permanently store $80/8 = 10$ checkpoint layers instead of 80 —
roughly $8\times$ less (plus one segment's worth of transient recomputed activations, ~8 layers,
so call it $\sim 80/(8{+}8) \approx 5$–$8\times$ in practice). Compute: each segment is re-run
forward once during backprop — about one extra forward pass, and since a training step costs
roughly one forward plus a backward that is about twice as expensive (≈ 3 forward passes in all),
that's **~33% more FLOPs**. The 3.4 twist that makes this a
famously good deal: training compute is *high arithmetic intensity* — the weights hauled for
recompute are reused across the whole batch, so the GPU actually has spare multiplier capacity;
you're spending the resource that was idling (FLOPs) to save the one that was full (HBM). The
ladder strikes again: know which resource is scarce, spend the other one.`,
    },
    {
      type: 'example',
      title: 'reading the ladder like an engineer — three quick verdicts',
      md: md`
Use the speeds table to adjudicate three real design calls, no simulation needed:

**1. "Let's do tensor parallelism across two servers."** Tensor parallelism (4.2 preview) needs an
all-reduce *inside every layer*, dozens of times per step, latency-critical. Across servers it
rides InfiniBand (~50–100 GB/s) — the ladder says each hop costs $30$–$60\times$ more than NVLink.
Verdict: **never** — which is why real systems keep tensor parallelism *inside* the NVLink island
(8 GPUs of one server) and cross servers only with gentler traffic.

**2. "Offload optimizer states to CPU RAM; they're only touched once per step."** The $840$ GB of
fp32 state crosses PCIe (~64 GB/s) once per step: $840/64 \approx 13$ s *per step* if fully
offloaded. If a step is 10+ seconds anyway (huge batch), this converts a cluster you can't afford
into a slow run you can — the DeepSpeed-Offload bet, correct exactly when steps are long and
budgets short. Verdict: **situational, and the arithmetic decides.**

**3. "Our gradient all-reduce (140 GB per step across the cluster) is killing us."** Check the
hiding option first: all-reduce of layer $k$'s gradients can start while layers $k{-}1, \dots$ are
still computing their backward pass — communication *overlapped* behind compute is free until it
isn't. Verdict: **overlap first, shrink second** (gradient compression/bucketing), panic third.

The pattern in all three: *nobody benchmarked anything yet*. The ladder plus arithmetic settles
the first 80% of every infra argument — which is why this lesson comes before the parallelism zoo.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The 16-bytes-per-parameter law** and its reason: fp16 updates *vanish* ($1.0 + 0.0001 = 1.0$),
   so Adam keeps fp32 masters — cashing 1.6's teaser in full: 70B ⇒ 1.12 TB of permanent state.
2. **Activations, the second pile**, and checkpointing — the KV cache's mirror twin on the
   time-memory dial: spend recompute (the idle resource) to save memory (the full one).
3. **The hierarchy of speeds**: SRAM → HBM → NVLink → InfiniBand → disk, each rung ~an order of
   magnitude slower; "time to move 140 GB" as the column that settles arguments.
4. **FlashAttention demystified**: attention routed through the SRAM rung, tiles instead of the
   65 GB matrix — systems research as ladder-navigation.
5. **The shape of every escape**: split something, pay communication somewhere; the art is
   choosing traffic that rides fast rungs and hides behind compute.

Next lesson: the four ways to split — data, ZeRO/FSDP, tensor, pipeline — each derived from what
it splits, what must then travel, and which rung it can afford.
`,
    },
  ],
  questions: [
    {
      id: 'm4-l1-q1',
      kind: 'mcq',
      prompt: md`Mixed-precision training keeps fp32 "master" copies of the weights even though the
matmuls run in bf16. What goes wrong with a pure-16-bit training loop?`,
      options: [
        '16-bit matrix multiplications are slower than 32-bit on modern GPUs',
        'Typical Adam updates (~10⁻⁴ relative) are smaller than fp16’s resolution near 1.0 (~10⁻³), so weight updates round away to nothing and learning stalls',
        'Gradients cannot be represented in 16 bits at all',
        'The loss function requires 32-bit precision to be differentiable',
      ],
      answer: 1,
      explain: md`The vanishing update: $1.0 + 0.0001$ rounds back to $1.0$ in fp16 because the gap
between adjacent representable numbers near $1.0$ is $\approx 0.001$. The step isn't small — it's
*sub-resolution*. Option A is backwards (16-bit is faster — that's why we use it for matmuls);
C is false (gradients live fine in 16 bits, they're just *applied* in 32); D confuses numerics
with calculus.`,
    },
    {
      id: 'm4-l1-q2',
      kind: 'numeric',
      prompt: md`How many **bytes per parameter** does standard mixed-precision Adam training hold?
Rebuild the table on paper: bf16 working weights + bf16 gradients + fp32 master weights + fp32
Adam $m$ + fp32 Adam $v$.`,
      answer: 16,
      tolerance: 0.5,
      explain: md`$2 + 2 + 4 + 4 + 4 = 16$ bytes per parameter — versus 2 for fp16 inference. The
$8\times$ ratio between "machine that trains it" and "artifact that ships" is the single most
load-bearing number in training infrastructure.`,
    },
    {
      id: 'm4-l1-q3',
      kind: 'numeric',
      prompt: md`Total **permanent training state** for a 70B-parameter model at 16 bytes/param, in
**gigabytes** (ignore activations)?`,
      answer: 1120,
      tolerance: 60,
      explain: md`$70 \times 10^9 \times 16 = 1.12 \times 10^{12}$ bytes $= 1120$ GB. Fourteen
80 GB GPUs *just to hold the numbers still* — before activations, before headroom, before any
actual computing. This one number makes all of lesson 4.2 inevitable.`,
    },
    {
      id: 'm4-l1-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, rebuild the full 70B training memory bill from
first principles: state *why* each of the five components exists (which lesson gave each its
job — 1.3 for gradients, 1.6 for the moments, this lesson for the fp32 masters), assign each its
precision and bytes, total it, and finish with the activations line — why activations must be kept
at all (what operation needs them, from 1.3?), and the one-sentence checkpointing escape.`,
      rubric: md`Full credit requires the *reasons*, not just the table:

1. **Working weights (bf16, 2 B):** the matmuls of every forward/backward pass — fast precision.
2. **Gradients (bf16, 2 B):** backprop (1.3) produces one sensitivity per parameter each step.
3. **Master weights (fp32, 4 B):** updates of ~10⁻⁴ vanish below fp16 resolution (~10⁻³ near 1);
   the accumulation must happen where the nudge survives.
4. **Adam $m, v$ (fp32, 4+4 B):** lesson 1.6's momentum and per-parameter scale memories.
5. **Total $= 16$ B/param → 1.12 TB at 70B.**
6. **Activations:** backprop's chain rule needs each layer's forward values to compute weight
   sensitivities ($\partial L/\partial W$ involves the inputs that flowed through $W$); scale with
   batch × seq × hidden × depth. **Checkpointing:** keep every $k$-th layer, recompute between —
   ~$8\times$ memory for ~33% extra compute.

"Nailed it" = every line has its *why* and its bytes; the fp32-master justification must include
the vanishing-update argument, not just "for stability."`,
    },
    {
      id: 'm4-l1-q5',
      kind: 'mcq',
      prompt: md`Tensor parallelism requires an all-reduce **inside every layer**, dozens of times
per training step. According to the hierarchy of speeds, where must the participating GPUs live?`,
      options: [
        'Anywhere in the datacenter — all-reduce is bandwidth-light',
        'On the same NVLink island (within one server), because per-layer communication cannot afford the ~30–60× slower per-byte cost of crossing InfiniBand',
        'On the same chip, since only SRAM is fast enough for gradients',
        'It doesn’t matter, because communication always overlaps with compute for free',
      ],
      answer: 1,
      explain: md`Per-layer, latency-critical traffic must ride the fastest inter-GPU rung: NVLink
(~900 GB/s) inside one server. Crossing servers (InfiniBand, ~50–100 GB/s) per layer per step
doesn't slow the run — it buries it. Option D names a real technique (overlap) but as a false
universal: intra-layer all-reduces sit on the critical path and are precisely the hardest traffic
to hide. This "TP inside the box, other parallelism across boxes" rule is how every real cluster
is laid out.`,
    },
    {
      id: 'm4-l1-q6',
      kind: 'written',
      prompt: md`**Two trades, one dial.** The KV cache (3.3) and activation checkpointing sit at
opposite ends of the time-versus-memory dial. On paper, for each: state what is stored or
recomputed, which resource is spent and which is saved, and the *reason* that direction is right
for its setting (inference vs training). Close with the general principle in one sentence of your
own — the sentence you'd use to evaluate the next systems trick you meet.`,
      rubric: md`**KV cache:** stores every past position's keys/values (memory spent) to avoid
re-running the prefix each step (time saved). Right for inference because latency is the felt
resource, per-token compute would scale quadratically without it, and inference memory (2 B/param)
has slack.

**Checkpointing:** stores only every k-th layer's activations, recomputing between (time spent,
~33% extra compute) to shrink the activation pile ~8× (memory saved). Right for training because
memory is pinned at 16 B/param + activations against a hard capacity wall, while FLOPs have slack
(high arithmetic intensity leaves multiplier headroom — 3.4).

**The principle** (any phrasing): *spend the resource with slack to relieve the one that's full* —
or equivalently, first ask of any trick "which direction does it turn the time-memory dial, and is
that the scarce-resource direction here?"

Full credit = both trades with all four elements (stored/recomputed, spent, saved, why-here) and a
genuine one-sentence principle — not a restated definition.`,
    },
    {
      id: 'm4-l1-q7',
      kind: 'mcq',
      prompt: md`Activation checkpointing saves memory by:`,
      options: [
        'Compressing stored activations to 8-bit precision',
        'Storing only every k-th layer’s activations and recomputing the ones in between during backprop, paying ~33% extra compute',
        'Moving activations to CPU RAM between the forward and backward passes',
        'Skipping the backward pass for some layers each step',
      ],
      answer: 1,
      explain: md`Checkpointing = deliberate amnesia + recompute: the KV cache's trade turned
inside-out (spend time to save space, because in training memory is the full resource and FLOPs
have slack). Options A and C are *also real techniques* (activation quantization; CPU offload) —
tempting because the menagerie is large — but they aren't what "checkpointing" names. D would
simply not train those layers.`,
    },
    {
      id: 'm4-l1-q8',
      kind: 'numeric',
      prompt: md`**Fermi:** Llama-3-405B in mixed-precision Adam training: at 16 bytes/param, how
many **80 GB GPUs** are needed *just to hold the permanent state* (no activations, no headroom)?
Paper first: total GB, then divide.`,
      answer: 81,
      tolerance: 15,
      explain: md`$405 \times 10^9 \times 16 = 6.48$ TB; $6480 / 80 \approx 81$ GPUs — the *floor*,
holding still, computing nothing. Real runs used ~16,000 GPUs: the gap between 81 and 16,000 is
activations, batch, replication for data parallelism, and the subject of the next lesson —
throughput, not just capacity.`,
    },
    {
      id: 'm4-l1-q9',
      kind: 'mcq',
      prompt: md`FlashAttention makes long-context attention feasible by:`,
      options: [
        'Approximating the attention matrix with a low-rank factorization',
        'Skipping attention for distant token pairs (sparse attention)',
        'Computing attention in small tiles that fit in on-chip SRAM, so the full n² score matrix is never written to HBM at all',
        'Caching the attention matrix between generation steps like the KV cache',
      ],
      answer: 2,
      explain: md`Exact attention, rerouted up the ladder: tiles stream through the ~50 MB SRAM
rung (tens of TB/s) and the 65 GB matrix simply never exists in HBM. Options A and B are real
*approximate*-attention research lines — tempting because they solve the same pain — but Flash's
whole point is being exact. D can't work: attention scores involve the newest query, which
changes every step (3.3's why-not-cache-Q argument, again).`,
    },
    {
      id: 'm4-l1-q10',
      kind: 'numeric',
      prompt: md`Offloading experiment (from the worked example): shipping 840 GB of fp32 optimizer
state across PCIe at 64 GB/s costs how many **seconds per training step** (one full round of
touching it)?`,
      answer: 13,
      tolerance: 3,
      explain: md`$840 / 64 \approx 13$ s per step. Verdict machinery in action: catastrophic for a
2-second step, tolerable for a 30-second step — the ladder doesn't say "never offload," it says
"divide and compare before you argue." (This is DeepSpeed-Offload's actual bet.)`,
    },
    {
      id: 'm4-l1-q11',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** You're doing a giant jigsaw puzzle (the training
run). Your desk (GPU memory) is tiny; there's a shelf across the room (other GPUs / CPU RAM), a
closet down the hall (other servers), and a storage unit across town (disk). Explain: why you
can't just get a bigger desk, how the walking time to each place changes what you keep where, and
one clever trick where *redoing work on purpose* beats storing something. No jargon without
kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **The desk limit made real** — even the biggest desks money buys (80 GB on an H100, ~200 GB on
   the newest cards) are far smaller than the puzzle (a terabyte of pieces); you can't buy your way out, so you must *organize*.
2. **Distance = time, in tiers** — grabbing from the desk is instant, the shelf is a walk, the
   closet a trek, the storage unit an afternoon; each is ~10× the previous, so what you touch
   constantly lives close, what you touch once a day can live far.
3. **The redo-it trick (checkpointing)** — some part-built sections you *dismantle* to free desk
   space, keeping just a photo (a checkpoint); when needed again you rebuild from the photo —
   rebuilding costs a little work, but your hands were idle anyway while you searched for space.
   The trade is stated as a trade.
4. **Jargon audit:** "HBM," "activation," "checkpointing," "bandwidth" unexplained = partial.`,
    },
    {
      id: 'm4-l1-q12',
      kind: 'written',
      prompt: md`**The cluster request memo.** You must train a 70B model and may request H100s
(80 GB each). On paper: (1) the permanent-state floor in GPUs; (2) why the floor is not enough —
name the two additional memory consumers this lesson identified and one throughput reason the GPU
count grows beyond memory needs; (3) a defensible minimum request with sharding (state the
parallelism assumption, e.g. "ZeRO-3 across N GPUs"), showing per-GPU arithmetic; (4) the two
questions from the hierarchy of speeds you must answer *before* finalizing the cluster layout.`,
      rubric: md`**(1) Floor:** $1120 / 80 = 14$ GPUs just for permanent state.

**(2) Beyond the floor:** activations (batch × seq × depth — hundreds of GB even checkpointed)
and working headroom (temporary buffers, comm staging, fragmentation); throughput reason: data
parallelism replicates compute across more GPUs to reach useful tokens/day (81-GPU-floor vs
16k-GPU-reality logic), or equivalently the bandwidth wall favors large batches which need more
activation room.

**(3) A defensible minimum** (any coherent arithmetic accepted): e.g. ZeRO-3 across 32 GPUs →
$1120/32 = 35$ GB/GPU of state + ~20–30 GB activations w/ checkpointing + headroom ≈ 65–75 GB —
tight but plausible on 80 GB; 64 GPUs if you want batch/comfort. (14–16 GPUs is *not* defensible
once activations are counted — catching that is part of the exercise.)

**(4) The two layout questions:** which traffic rides NVLink vs InfiniBand (keep per-layer/tensor
traffic inside the 8-GPU island; let per-step traffic cross), and what can overlap behind compute
(gradient all-reduce during backward) vs what sits on the critical path.

Full credit = correct floor, both extra consumers + a throughput argument, per-GPU arithmetic that
includes activations, and both ladder questions. This memo is a real interview exercise for infra
roles — treat the numbers as if procurement will sign them.`,
    },
  ],
}
