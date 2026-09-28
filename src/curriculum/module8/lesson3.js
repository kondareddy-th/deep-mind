// Module 8, Lesson 3 — The DeepSeek teardown (anchor lesson, Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm8-l3',
  title: '8.3 The DeepSeek teardown — what a constrained lab invented',
  subtitle:
    'A lab denied the best hardware trained a frontier-class model for a reported few million dollars of GPU time and published how. Six innovations, every one of them legible to you now — and a pattern of thinking that is worth more than all six.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

In late 2024 a Chinese lab published DeepSeek-V3: a 671-billion-parameter model competitive with
the best in the world, trained on **2.788 million H800 GPU-hours** — about **\$5.6M** at \$2 per
GPU-hour (their reported figure). Then they published the weights, the architecture, and enough of
the engineering that you can check the arithmetic. A few months later, R1 did the same for
reasoning.

The reaction split three ways. *It's a lie.* *It's a trick — they distilled someone else's model.*
*It's real and everything is different now.* All three reactions have one thing in common: none of
them requires understanding what was actually done.

You are in an unusual position. You have spent thirty-seven lessons building exactly the machinery
these papers assume. You can read them. So let's do the thing almost no commentary did: **take the
system apart, innovation by innovation, and ask of each one — what was expensive, and what
structure made it cheap?**

Because here is the claim I want to earn by the end: the specific tricks are worth knowing, but the
*pattern that generated them* is worth more, and it is learnable.

## Start with the constraint

Export controls meant DeepSeek could not buy H100s. They trained on **H800s** — essentially the
same compute, with the **chip-to-chip interconnect deliberately cut** (NVLink at roughly 400 GB/s
instead of the H100's 900).

Look at what that does through lesson 4.1's ladder. The rungs — SRAM, HBM, NVLink, InfiniBand —
each an order of magnitude slower than the last. The NVLink rung got slower, and the InfiniBand rung
between machines was already the slowest of all. 4.2 told you which workloads live on those bottom
rungs: expert parallelism's all-to-all traffic, pipeline stages, gradient synchronisation. For a
huge MoE model spread over thousands of GPUs, that traffic is enormous — the V3 paper reports that
cross-node expert communication alone was on the order of the compute time itself.

So their binding constraint was not FLOPs. It was **bytes crossing machines**. Hold that in mind,
because from here almost everything they did reads as a direct answer to it — and that is what
makes this a case study in *thinking*, rather than a list of tricks.
`,
    },
    {
      type: 'text',
      md: md`
## Innovation 1 — MLA: stop caching what you can rebuild

**What was expensive:** the KV cache. Lesson 3.3 priced it: half a megabyte per token for a
7B model with plain attention (a 70B-class model pays ~2.6 MB, or ~0.33 MB with GQA), tens of
gigabytes per long conversation, and it *grows with every token* while the
weights stay fixed. GQA (3.3) shrinks it by sharing key/value heads across query heads — but that
is a blunt instrument: you pay in quality for every group you merge.

**The structural question:** must we store $K$ and $V$ at all, or merely *enough to reconstruct
them*?

**Multi-head Latent Attention** takes the second option. Compress each token's representation down
into a small **latent vector** $\mathbf{c}$ — a few hundred dimensions — and cache only that. When
attention runs, up-project $\mathbf{c}$ back into the full per-head keys and values:

$$\mathbf{c}_t = W^{DKV}\mathbf{h}_t \quad (\text{cache this, } d_c \approx 512) \qquad\qquad K_t = W^{UK}\mathbf{c}_t, \;\; V_t = W^{UV}\mathbf{c}_t \quad (\text{rebuild these})$$

This is lesson 1.2's low-rank idea (and 7.2's LoRA bet) pointed at a completely different target:
not the weight update, but *the cache*. And there is a lovely refinement — because the
up-projections are fixed matrices, they can be **absorbed** into the neighbouring query and output
projections, so the full $K$ and $V$ never need to be materialised at all.

One wrinkle, and it is the kind of detail that separates a real design from a whiteboard sketch:
RoPE (2.4) rotates keys *by position*, which does not commute with that absorption trick. Their fix
is honest engineering — split off a small slice of each head's dimensions to carry the rotary part,
cache that slice separately, and leave the rest to the latent compression. Not elegant. Correct.

**What it bought** (their reported numbers, from DeepSeek-V2 where MLA debuted): a KV cache
**93% smaller than their previous dense model's** — DeepSeek 67B, which already used GQA, so the
saving against plain MHA is larger still — and, in their ablations, quality *matching or exceeding*
full MHA — not the usual quality-for-memory trade, which
is why it landed hard. Play with the arithmetic below before reading on.
`,
    },
    {
      type: 'viz',
      viz: 'cache-compare',
      caption:
        'Four ways to store the past, same model shape (64 layers, 64 heads × 128 dims), one context-length slider, four bars in gigabytes against an 80 GB single-GPU line. Three experiments: (1) at 32k context read MHA versus MLA and compute the ratio yourself before trusting the readout; (2) drag context to 128k and watch MHA sail past the capacity of an entire H100 — for ONE conversation — while MLA stays in single-digit gigabytes; (3) compare MLA against MQA: they sit at similar heights, which is the whole point — MLA reaches MQA-scale memory while (per the paper) keeping MHA-scale quality, and that combination is what makes it more than a compression trick',
    },
    {
      type: 'ponder',
      question: md`Do the MLA arithmetic yourself before accepting the headline. Take a model with
64 layers and 64 heads of dimension 128. **(a)** How many numbers per token does standard MHA cache
(remember: both K and V, every layer, every head)? **(b)** MLA caches a latent of $d_c = 512$ plus a
64-dimensional rotary slice, per layer. How many numbers is that? **(c)** What is the reduction
factor — and where did the saving actually come from?`,
      answer: md`**(a) MHA:** $2 \times 64 \times 64 \times 128 = 1{,}048{,}576$ numbers per token —
about 2 MB at 2 bytes each.

**(b) MLA:** $64 \times (512 + 64) = 36{,}864$ numbers — about 74 KB.

**(c) Reduction:** $1{,}048{,}576 / 36{,}864 \approx \mathbf{28\times}$ (the exact factor depends on
$d_c$ and head count; the published ~93% was measured against their earlier GQA model, a different baseline).

**Where the saving came from** — this is the part worth internalising. Not from throwing information
away (that is GQA's method: fewer independent key/value heads, and quality pays). MLA's saving comes
from noticing that the per-head keys and values are *not independent* — they are all computed from
one 7168-dimensional hidden state through fixed matrices, so they live on a low-dimensional
manifold. Storing 64 heads' worth of K and V separately stores the *same underlying information*
sixty-four times over. MLA stores it once and reconstructs the rest.

**The generalisable move:** when something is expensive to store, ask whether it is *redundant* —
whether it was derived from something smaller. If so, cache the small thing and pay a little
arithmetic to rebuild the rest. That is the roofline (8.1) exploited deliberately: trade FLOPs,
which you have, for bytes, which you don't.`,
    },
    {
      type: 'text',
      md: md`
## Innovation 2 — fine-grained MoE, and balancing without a fight

**What was expensive:** capacity. More parameters means a better model (5.2), but a dense model
makes every token pay for every parameter (4.3's opening complaint).

DeepSeek-V3's answer is Mixture-of-Experts pushed further than usual: **671B total parameters,
about 37B active per token** — roughly 5.5% of the model does the work on any given token. Two
design choices distinguish it from the standard recipe:

**Fine-grained experts.** Instead of a handful of large experts, use many small ones and route to
several. The combinatorial argument is nice: choosing 8 of 256 small experts gives vastly more
distinct expert *combinations* than choosing 2 of 8 large ones, so specialisation can be sharper at
the same active-parameter cost.

**A shared expert** that every token passes through. The reasoning: some processing is needed by
*all* tokens (common syntax, general language competence). Without a shared path, every routed
expert must independently learn that common material — paying for the same knowledge many times
over. Give it one dedicated home and the routed experts are freed to specialise.

**And then the elegant part.** Lesson 4.3 taught you MoE's disease: routing collapses, a few
favourite experts get all the traffic, the rest atrophy. The standard fix is an **auxiliary
load-balancing loss** — but look at what that actually does. You have added a second term to your
objective that is *not* about predicting text. At every step the model is pulled between "predict
well" and "spread the load," and where those disagree, language modelling loses.

DeepSeek's **auxiliary-loss-free balancing** dissolves the conflict instead of managing it. Add a
per-expert **bias** to the routing scores that decides *which* experts get selected — then nudge
that bias during training: raise it for underloaded experts, lower it for overloaded ones. Crucially
the bias affects **selection only**, not the gating weight applied to the chosen expert's output.

Sit with why that is clever: balancing is now a **control loop running beside the objective** rather
than a **term inside it**. The language-modelling gradient never gets bent. Same balance, no fight.
`,
    },
    {
      type: 'ponder',
      question: md`Generalise that last move, because it is the most transferable idea in the
lesson. An auxiliary loss and a bias-adjustment control loop can produce the same balanced routing —
so why is moving the mechanism *out of the loss* a real win rather than a cosmetic one? And can you
name another place in this curriculum where the same restructuring would apply?`,
      answer: md`**Why it is real:** a term in the loss competes for the *same gradient budget* as
your actual objective. Every weight update is a compromise between "predict the next token well"
and "keep the experts balanced," and the compromise is paid in exactly the currency you care about.
Worse, its strength is a hyperparameter you must tune, and the right value drifts during training.
The control loop achieves the same *outcome* through a mechanism the language-modelling gradient
never sees — the model is never asked to trade quality for tidiness, because tidiness is no longer
its job.

The general principle: **if a constraint can be enforced by construction or by an external
controller, do not enforce it with a penalty term.** Penalties negotiate; constructions do not.

**Where else it applies** (any of these earns full marks): the KL leash in RLHF (5.5) is a penalty
term — and there is a live research thread on enforcing proximity structurally instead. Weight decay
in Adam versus AdamW (1.6) is *exactly* this lesson already learned once: L2 pushed through the
adaptive scaling gets mangled, so AdamW decouples it out of the gradient path — same restructuring,
different decade. Gradient clipping is a construction rather than a penalty and is all the more
reliable for it. And in your own work: whenever you find yourself adding a lambda-weighted term to
make a model behave, ask first whether the behaviour can be *built in* or *controlled outside* the
loss.`,
    },
    {
      type: 'text',
      md: md`
## Innovation 3 — FP8 training, and why it was hard

**What was expensive:** every byte moved and every GEMM performed. Lesson 4.1 explained why
training runs in bf16 with fp32 masters — range matters, and updates vanish below resolution. But
bf16 is still *two bytes*. What about one?

FP8 halves the bytes again: half the memory traffic through the ladder, and roughly double the
tensor-core throughput. The reason nobody had done it at frontier scale is lesson 4.4's villain —
**outliers**. With only 4 exponent bits and 3 mantissa bits, one extreme activation channel stretches
a per-tensor scale until every ordinary value collapses to a couple of levels. Precisely the
quantization disaster you already worked by hand.

Their fixes are worth studying as engineering:

- **Fine-grained scaling.** Not one scale per tensor, but per small tile of activations and per
  block of weights. Exactly 4.4's per-group quarantine, applied at *training* time where the stakes
  are far higher — an outlier now poisons a gradient, not just an inference.
- **Promoted accumulation.** FP8 matrix units accumulate at limited precision; error compounds
  across a long dot product (1.1's drunkard's walk, in an unwelcome role). They periodically promote
  partial sums into higher-precision accumulation. A hardware limitation, worked around in software.
- **Keeping the delicate parts wide.** Embeddings, the output head, normalisation, gating, and
  attention stay at higher precision. The 4.4 principle in action: quantize what is *read*, protect
  what *accumulates or is delicate*.

Reported result: loss parity with a bf16 run to within a fraction of a percent, at roughly half the
memory traffic and considerably more throughput. Notice the shape once more — the win did not come
from a bolder claim ("8 bits are enough!"), it came from a **finer-grained** version of a technique
everyone already had.

## Innovation 4 — DualPipe: hide the communication behind the compute

**What was expensive:** the very thing the H800 restriction targeted. Expert parallelism means
tokens must *travel to their experts* (4.3) — an all-to-all exchange, across nodes, every MoE layer,
every step. On reduced interconnect, that is the wall.

Two responses, and neither is "wait faster":

**Overlap it.** Lesson 4.1's third verdict said communication hidden behind compute is free until it
isn't. DeepSeek's **DualPipe** schedules forward and backward work from different micro-batches so
that while one chunk is computing, another chunk's all-to-all is in flight. Done well, the network
traffic disappears into the gaps in the compute schedule — and 4.2's pipeline bubble shrinks at the
same time.

**Route with the topology in mind.** Limit how many nodes a token's experts may span, and use the
fast intra-node links (NVLink) for what can stay local while the slow inter-node links carry only
what must cross. This is 4.1's ladder used as a *design constraint on the model itself* — the
architecture bending to fit the network, which is exactly the kind of move that only occurs to
people who have measured the network.

## Innovation 5 — multi-token prediction, twice useful

During training, extra modules predict tokens $t{+}2, t{+}3, \dots$ alongside the usual next token
(lesson 4.6 introduced this). Two payoffs from one mechanism: a **denser training signal** — more
supervision extracted per document — and, at inference, those same modules act as a **built-in
draft model for speculative decoding** (3.4), reportedly delivering a substantial tokens-per-second
gain at high acceptance rates. One addition, paying in both training efficiency and serving
efficiency, which is the sort of thing that shows up when a team is optimising the whole pipeline
rather than a stage of it.

## Innovation 6 — R1: reasoning without reasoning data

The V3 base model became **R1**, and the interesting part is what they *didn't* need.

**GRPO** (lesson 7.4 derived it) removes PPO's critic network — a second full-sized model with its
own optimizer state (4.1's bill) — replacing the learned baseline with the mean reward of a *group*
of sampled completions for the same prompt. Under a memory constraint, deleting a whole model from
the training loop is not a tweak; it is what makes the run possible at all.

**R1-Zero** then asked something genuinely bold: skip supervised reasoning data entirely and run RL
straight on the base model with **rule-based verifiable rewards** (5.5) — did the answer match, was
the format respected. No human demonstrations of chains of thought. And long chains of reasoning,
self-checking, and backtracking *emerged* from the optimisation, because the base model could
already sample such behaviour occasionally and the reward reinforced it. R1 proper then adds a small
cold-start supervised stage and a multi-stage pipeline to fix readability and language mixing —
the practical version of the pure result.

**And the finding I would most like you to remember:** distilling R1's reasoning into *small dense
models* worked **better** than running the same RL directly on those small models. Which should
immediately make you ask why — and the answer, once you see it, is a genuine piece of research
taste. It is the ponder below, and lesson 8.4 builds a whole lesson on it.
`,
    },
    {
      type: 'ponder',
      question: md`Reinforcement learning on a small model produced worse reasoning than distilling
a large model's reasoning into that same small model. Both approaches spend compute on the same
architecture. Why should distillation win — and what does that tell you about what RL can and
cannot do?`,
      answer: md`**RL can only reinforce what the model already samples.** The loop is: generate
candidates, score them, increase the probability of the good ones. If a small base model essentially
never produces a long, correct, self-correcting chain of thought — even across thousands of samples
— then the reward signal is almost always zero, there is nothing to push up, and you are performing
an expensive random search over a space where success is vanishingly rare. **RL sharpens a
distribution; it cannot conjure mass where there is none.**

Distillation faces no such barrier: the teacher *hands over* completed reasoning traces, and the
student learns them by ordinary supervised imitation (5.4) — no exploration required, because the
exploration was already done, once, by a model big enough to do it.

**What this tells you about RL in general** — and it is a genuinely useful heuristic: RL's value is
proportional to how often your current policy stumbles into success. High-sample-rate success →
RL compounds beautifully. Near-zero success rate → you need to *seed* the capability first (cold-start
data, distillation, curriculum) before RL has anything to work with. This is why R1 itself uses a
cold-start stage, and why "just run RL on it" fails so often for people who have read only the
headline.

There is also an economic reading worth holding: it is cheaper to have *one* expensive model
discover a capability and then copy it into many cheap ones than to have each cheap one rediscover
it. That asymmetry is shaping the entire small-model ecosystem — and it is lesson 8.4's subject.`,
    },
    {
      type: 'example',
      title: 'the cost claim, audited honestly',
      md: md`
The reported figure: **2.788M H800 GPU-hours**, about **\$5.576M** at \$2/GPU-hour. Before repeating
it, know what it does and does not contain — this is lesson 6.5's skepticism applied to the most
quoted number in recent AI.

**What it includes:** the final pretraining run plus context extension and post-training. Real
compute, honestly reported.

**What it excludes**, by their own statement: all prior research, architecture ablations, failed
runs, data pipeline construction, and the salaries of the people who did the thinking. A frontier
lab's *total* cost of arriving at a model is dominated by the experiments that did not become the
model (5.3's culture: de-risk everything at small scale — those small runs are numerous and they
are not free).

**So what is the honest reading?** Not "frontier models now cost \$5.6M." It is: *the marginal
compute for one frontier-class training run, given the architecture and recipe already worked out,
was about \$5.6M on constrained hardware.* That is still a striking number, and it is the number
their published techniques earn.

**The comparison trap:** other labs' quoted figures often bundle different things, so head-to-head
ratios ("10× cheaper!") compare quantities that were never defined the same way. The disciplined
move — and lesson 6.5 trained you for exactly this — is to ask *what is inside each number* before
dividing one by the other.
`,
    },
    {
      type: 'example',
      title: 'the six innovations as one table of moves',
      md: md`
Read down the right-hand column. That column is the lesson.

| what was expensive | the structure that made it cheap | the transferable move |
|---|---|---|
| KV cache grows without bound (3.3) | K and V are all derived from one hidden state — cache the latent, rebuild the rest (MLA) | **cache the generator, not the generated** |
| every token pays for every parameter (4.3) | route to a few fine-grained experts, plus a shared one for common work | **make the cost conditional on the input** |
| aux load-balancing loss fights the objective | move balancing into a bias control loop outside the loss | **constrain by construction, not by penalty** |
| bf16 still moves two bytes per number (4.1) | fine-grained per-tile scaling + promoted accumulation → FP8 | **the blocker was granularity, not the bit-width** |
| all-to-all traffic on a throttled network (4.2) | overlap communication with computation; route within the fast rung | **hide the cost behind work you already do** |
| a critic doubles RL memory (7.4) | use the group mean as the baseline (GRPO) | **replace a learned component with a statistic you already have** |
`,
    },
    {
      type: 'text',
      md: md`
## The mindset — how these ideas were actually generated

You asked for the tricks; here is the thing that outlives them. Every innovation above came from the
same four-step loop, and you can run it deliberately:

**1. Find the binding constraint, numerically.** Not "training is expensive" — *which resource is
saturated*? DeepSeek's was inter-node bandwidth, and everything followed from knowing that. This is
8.1's profile-first discipline, elevated to strategy. Most teams optimise what they can see; the
wins come from optimising what is actually binding, and those are rarely the same thing.

**2. Ask what is redundant, not what is slow.** The interesting question is never "how do I make
this faster?" but "**why does this cost anything at all?**" The KV cache was 28× redundant because
64 heads stored projections of one shared vector. MoE bets that most parameters are irrelevant to any given
input — V3 activates only ~5.5% of its weights per token and still competes with dense models. Redundancy is compressible; slowness often isn't.

**3. Suspect any penalty term.** If you are enforcing something with a lambda-weighted loss, you are
negotiating with your own objective. Ask whether it can be built into the architecture, or handled by
a controller beside it.

**4. Check whether the blocker is fundamental or granular.** FP8 "didn't work" for years — but the
obstacle wasn't 8 bits, it was *per-tensor* scaling. A great many "X doesn't work" beliefs are
really "X at the granularity everyone tried doesn't work," and that distinction is where papers
live.

And the meta-observation, which is the real reason this case study belongs in a research curriculum:
**constraint is generative.** A lab with unlimited H100s would have had no reason to invent MLA —
they would have bought more memory. The most interesting engineering in this field consistently
comes from someone who *could not* buy their way out of a problem. When you are choosing what to
work on (6.6), a constraint you cannot spend your way past is not an obstacle to your research; it
is frequently the *source* of it.

## What you now own

1. **MLA** — cache a low-rank latent and rebuild K and V; ~28× less cache in our worked config,
   without the usual quality trade. Low-rank thinking (1.2, 7.2) aimed at memory.
2. **Fine-grained MoE + shared expert** — sharper specialisation per active FLOP, with common work
   given a dedicated home.
3. **Auxiliary-loss-free balancing** — a control loop beside the objective instead of a penalty
   inside it; the single most transferable idea here.
4. **FP8 training** — fine-grained scaling plus promoted accumulation beat the outlier problem that
   had blocked 8-bit training.
5. **DualPipe and topology-aware routing** — communication hidden behind compute, and a model shaped
   to fit its network.
6. **MTP** — denser training signal *and* a free speculative-decoding drafter.
7. **GRPO and R1** — delete the critic; RL on verifiable rewards can grow reasoning that was already
   sampleable, which is exactly why distillation beats RL at small scale.
8. **The generating loop:** find the binding constraint numerically → ask what is redundant → suspect
   penalty terms → check whether the blocker is fundamental or merely granular.

Next lesson: that last finding — big model discovers, small model inherits — deserves its own
treatment, because it is quietly reorganising what gets deployed.
`,
    },
  ],
  questions: [
    {
      id: 'm8-l3-q1',
      kind: 'mcq',
      prompt: md`What does Multi-head Latent Attention (MLA) cache, and why does it beat the usual
memory-versus-quality trade?`,
      options: [
        'Only the keys, reconstructing values from them — halving the cache at no quality cost',
        'A low-rank latent vector per token, from which per-head keys and values are reconstructed — exploiting the fact that all heads’ K and V derive from one shared hidden state, so the cache was redundant rather than informative',
        'The attention scores instead of the keys and values, since scores are smaller',
        'Keys and values at 4-bit precision instead of 16-bit',
      ],
      answer: 1,
      explain: md`The move is *compress-and-reconstruct*: 64 heads' worth of K and V are all
projections of a single hidden state, so storing them separately stores the same information many
times over. MLA caches the small generator and rebuilds the rest — which is why it can shrink memory
without discarding information the way GQA's head-sharing does. Option D describes KV-cache
quantization: a real and complementary technique (4.4), but a different mechanism — and note it
*would* stack with MLA. Option C is impossible: scores depend on the current query, which changes
every step (3.3's why-queries-are-never-cached argument).`,
    },
    {
      id: 'm8-l3-q2',
      kind: 'numeric',
      prompt: md`A model has 64 layers and 64 heads of dimension 128. How many numbers does standard
MHA cache **per token** (both K and V, all layers, all heads)? Give the answer in **millions**, to
one decimal.`,
      answer: 1.0,
      tolerance: 0.15,
      explain: md`$2 \times 64 \times 64 \times 128 = 1{,}048{,}576 \approx$ **1.0 million numbers
per token** — about 2 MB at bf16. Against MLA's $64 \times (512+64) = 36{,}864$ numbers (~74 KB),
that is roughly a 28× reduction. One multiplication tells you why long-context serving economics
(4.5) changed when this shipped.`,
    },
    {
      id: 'm8-l3-q3',
      kind: 'mcq',
      prompt: md`Why is auxiliary-loss-free load balancing (a bias term adjusted by a control loop)
preferable to an auxiliary load-balancing loss?`,
      options: [
        'It is computationally cheaper to evaluate a bias than a loss term',
        'It achieves balance without adding a competing term to the objective, so the language-modelling gradient is never traded against tidiness',
        'It guarantees perfectly equal expert utilisation, which an auxiliary loss cannot',
        'It removes the need for a router entirely',
      ],
      answer: 1,
      explain: md`A penalty term negotiates with your real objective for the same gradient budget;
a controller beside the loss enforces the same outcome without that trade — and without a lambda
you must tune as it drifts. Option A is true but trivial and not the reason. Option C overclaims:
the control loop *improves* balance, it does not guarantee perfection (and a small safety-net
auxiliary term is still typically retained). The deep version of this idea is the same one that
turned Adam into AdamW (1.6): take the constraint out of the gradient path.`,
    },
    {
      id: 'm8-l3-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Reconstruct the reasoning that leads to MLA without
naming it: (1) state precisely what the KV cache stores and why it grows without bound; (2) identify
the *redundancy* — what are the per-head keys and values all computed from, and why does that make
separate storage wasteful; (3) propose the compress-and-reconstruct scheme and say what you now
cache; (4) compute the saving for a 64-layer, 64-head, 128-dim model with a 512-dim latent; (5) name
one thing that breaks and how you would patch it.`,
      rubric: md`**(1)** Per token, per layer, per head: a key and a value vector, retained for every
past position so future queries can attend to them (3.3's freeze proof makes them safe to keep).
Growth is linear in context length while weights are fixed, so at long context the cache dominates
memory.

**(2)** Every head's $K$ and $V$ at a layer are linear projections of the *same* hidden state
$\mathbf{h}_t$. So the cached tensors are 64 different views of one underlying vector — the
information content is that of $\mathbf{h}_t$, stored many times over. Redundant, therefore
compressible.

**(3)** Cache a low-rank latent $\mathbf{c}_t = W^{DKV}\mathbf{h}_t$ with $d_c \ll n_h d_h$, and
reconstruct $K_t = W^{UK}\mathbf{c}_t$, $V_t = W^{UV}\mathbf{c}_t$ at attention time. Bonus credit:
the fixed up-projections can be absorbed into the query and output projections so full K and V never
materialise.

**(4)** MHA: $2 \times 64 \times 64 \times 128 \approx 1.05$M numbers/token. MLA: $64 \times 512 =
32{,}768$ (plus a rotary slice) — roughly **28–32× smaller**.

**(5) What breaks:** RoPE (2.4) applies a position-dependent rotation to keys, which does not commute
with absorbing the up-projection — so you cannot both absorb the matrices and apply rotation as
usual. **Patch:** carve off a small dedicated slice of dimensions to carry the rotary component and
cache it separately, leaving the rest to latent compression.

Full credit needs the redundancy argument in (2) — that is the actual insight — plus the arithmetic
and a genuine account of the RoPE conflict. Naming "MLA" without deriving the redundancy earns
partial at best.`,
    },
    {
      id: 'm8-l3-q5',
      kind: 'numeric',
      prompt: md`DeepSeek-V3 reports roughly 671B total parameters with about 37B active per token.
What percentage of the model does the work on any given token? (One decimal.)`,
      answer: 5.5,
      tolerance: 1.0,
      explain: md`$37/671 \approx 5.5\%$. Read it as lesson 4.3's ledger: *capacity* is billed
against the 671B (all of it must be resident — you cannot page experts per token), while *speed* is
billed against the 37B that streams (3.4's law with active bytes). Two different axes, two different
bills, one model — which is why "how big is it?" stopped being a single question.`,
    },
    {
      id: 'm8-l3-q6',
      kind: 'mcq',
      prompt: md`FP8 training had been considered impractical at scale. What was the actual blocker,
and what unlocked it?`,
      options: [
        '8 bits fundamentally cannot represent gradients; the fix was to keep gradients in bf16',
        'Per-tensor scaling let a few outlier values stretch the range and crush everything else; the fix was much finer-grained (per-tile, per-block) scaling plus promoting accumulation to higher precision',
        'GPUs lacked FP8 tensor cores until recently; the fix was new hardware',
        'FP8 training diverged due to learning-rate instability; the fix was a longer warmup',
      ],
      answer: 1,
      explain: md`Lesson 4.4's villain, at training stakes: outliers plus a single shared scale
destroys the resolution of ordinary values, and long FP8 accumulations compound rounding on top.
Finer granularity quarantines the outliers; promoted accumulation handles the summation error.
Option C is tempting because hardware support genuinely was a prerequisite — but tensor cores alone
didn't make it work; the numerics did. The transferable lesson is in the distinction: "X doesn't
work" often means "X at the granularity everyone tried doesn't work."`,
    },
    {
      id: 'm8-l3-q7',
      kind: 'numeric',
      prompt: md`**Fermi.** 2.788 million H800 GPU-hours at \$2 per GPU-hour. What is the reported
training cost in **millions of dollars**? (One decimal.)`,
      answer: 5.6,
      tolerance: 0.6,
      explain: md`$2.788 \times 10^{6} \times \$2 \approx \$5.58$M. The number is real but its
*scope* is narrow: it covers the final runs, not the research programme, ablations, failed attempts,
data pipeline, or salaries. The disciplined reading (6.5) is "marginal compute for one frontier-class
run, given a recipe already worked out" — which is still remarkable, and is precisely what the six
innovations bought.`,
    },
    {
      id: 'm8-l3-q8',
      kind: 'written',
      prompt: md`**The RL-versus-distillation question.** Distilling a large reasoning model into a
small dense model produced better reasoning than running the same reinforcement learning directly on
that small model. On paper: (1) explain mechanically why RL underperforms here, in terms of what the
RL update actually requires; (2) explain why distillation is unaffected by that obstacle; (3) state
the general rule this gives you for deciding when RL is the right tool; (4) name one thing this
finding does *not* prove.`,
      rubric: md`**(1)** RL's update needs *successful samples to reinforce*. The loop generates
candidates, scores them, and raises the probability of good ones. If the small base model almost
never produces a correct long chain of thought, nearly every sample scores zero, the gradient signal
is nearly absent, and the procedure degenerates into expensive random search. RL redistributes
probability mass; it cannot create mass where the policy has none.

**(2)** Distillation supplies the successful traces from outside — the student learns by supervised
imitation (5.4), needing no exploration, because a model large enough to find the behaviour already
did the finding.

**(3) The rule:** RL's value scales with your policy's current success rate on the target behaviour.
High success rate → RL compounds. Near-zero → seed the capability first (cold-start SFT,
distillation, curriculum, easier task variants), *then* apply RL. This is why R1 itself uses a
cold-start stage.

**(4) What it does not prove** (any one): that RL is useless at small scale in general — with a
seeded capability or an easier task distribution it may work fine; that distillation is superior
*in general* (the student is bounded by its teacher, and cannot surpass it the way RL sometimes
surpasses its demonstrations — 5.5's ceiling argument); or that the result transfers to other
domains or model families without testing.

Full credit requires the "RL needs sampleable success" mechanism in (1) and a genuine limitation in
(4).`,
    },
    {
      id: 'm8-l3-q9',
      kind: 'mcq',
      prompt: md`DualPipe and topology-aware expert routing both address which constraint?`,
      options: [
        'Insufficient GPU memory for the model’s parameters',
        'Limited inter-node interconnect bandwidth — by hiding all-to-all communication behind computation and keeping traffic on faster links where possible',
        'Slow tensor-core throughput on the H800',
        'The quadratic cost of attention at long context',
      ],
      answer: 1,
      explain: md`The H800's distinguishing restriction was interconnect (its NVLink was cut), not
compute — and with cross-node InfiniBand already the slowest link, the binding constraint was bytes
crossing between GPUs and machines (4.1's slowest rungs), and both techniques target
exactly that: overlap the traffic with work you were doing anyway, and keep what you can on NVLink.
Option C names the H800's *unrestricted* dimension, which is the tempting error: knowing which
resource was actually scarce is the entire diagnostic skill this lesson teaches.`,
    },
    {
      id: 'm8-l3-q10',
      kind: 'numeric',
      prompt: md`Moving from bf16 to FP8 for the bulk of training GEMMs changes bytes-per-number
from 2 to 1. By what factor does the memory traffic for those tensors fall — and, by lesson 3.4's
law, what is the corresponding ceiling improvement for a memory-bound step?`,
      answer: 2,
      tolerance: 0.2,
      explain: md`A factor of **2** on both counts: half the bytes moved, and (for anything
memory-bound) roughly double the attainable throughput, since tokens/sec scales inversely with bytes
streamed. (Most training GEMMs are actually compute-bound, not memory-bound — but there the other
half of FP8 kicks in: its tensor cores run at roughly twice the bf16 rate, so the ceiling doubles
either way.) This is the same lever quantization pulls at inference (4.4) applied to training — and
it's why the FP8 work matters beyond a memory saving: on a machine whose scarce resource is data
movement, halving the bytes is close to doubling the machine.`,
    },
    {
      id: 'm8-l3-q11',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "How did a team with worse computers
build an AI as good as the ones built with the best computers?" Explain, using analogies you invent:
what their limitation actually was (not "slower computers" — something more specific), two of the
clever fixes in kid terms (the not-storing-things-you-can-rebuild idea, and the only-wake-up-the-
experts-you-need idea), and the big lesson that not being able to buy your way out of a problem can
make you *more* inventive. No jargon without a kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **The specific limitation** — not "slow computers" but something like: their thousands of
   computers couldn't *talk to each other* fast enough, so any plan requiring lots of chatter between
   machines was doomed even though each machine could think plenty fast. The kid should grasp that
   the bottleneck was *communication*, not *thinking*.
2. **The rebuild-instead-of-store idea (MLA)** — a good analogy: instead of keeping sixty-four
   photocopies of a page in your backpack, keep the original and photocopy it when you need one;
   the copies were never new information, so carrying them all was wasted weight.
3. **The wake-up-only-who-you-need idea (MoE)** — a school with 256 specialist teachers where each
   question only wakes up the eight teachers who know that subject, instead of making all 256 sit
   through every question. The school is huge; the cost per question is small.
4. **The big lesson** — when you can't buy a bigger backpack, you're forced to ask why you were
   carrying so much; people with unlimited money often never ask. Constraint is what made them look.
5. **Jargon audit:** "KV cache," "latent," "MoE," "expert routing," "bandwidth," "FP8" used without
   kid-level translation = partial at best.`,
    },
    {
      id: 'm8-l3-q12',
      kind: 'written',
      prompt: md`**Run the generating loop on your own problem.** Take any system you know — one of
your own projects, or a workload from this curriculum (serving a fine-tuned model, running an agent
loop, training on one GPU). Apply the four steps: (1) what is the binding constraint, stated
*numerically* and with the measurement you would take to confirm it; (2) what in the system is
*redundant* rather than merely slow — something stored or computed that could be derived from
something smaller; (3) is there a penalty term or negotiated compromise that could instead be a
construction or an external controller; (4) is any blocker you have accepted possibly *granular*
rather than fundamental — something that "doesn't work" at the resolution everyone tried. Propose
one concrete change, with the experiment that would test it.`,
      rubric: md`Grade as a research supervisor reading a proposal.

**(1)** Must be *numerical and measurable* — "the KV cache is 40 GB at our context length, versus
14 GB of weights, and I'd confirm with a memory profile" beats "memory is tight." A constraint you
haven't measured is a guess, and 8.1's discipline says the ceiling on any fix is set by a number you
don't have.

**(2)** Must identify something genuinely *derivable* — repeated context re-sent every agent step
(3.5) and recomputable from a summary; duplicated retrieval chunks; cached values reconstructible
from a smaller representation; logged data stored at full fidelity when statistics would do. Credit
the *reasoning* about redundancy, not the specific answer.

**(3)** A real penalty/compromise in their system — a tuned lambda, a hand-balanced tradeoff, a
heuristic threshold — with a plausible construction or controller replacement.

**(4)** A believed limitation, and a granularity axis worth testing (per-request versus per-batch,
per-tensor versus per-block, global versus per-user).

**The concrete change + experiment** is the load-bearing part: one change, one measurement, and a
result that could come out either way (6.6's test). A proposal whose experiment cannot fail is a
plan to confirm what you already believe.

Full marks for a proposal a colleague could execute this week without asking you anything.`,
    },
  ],
}
