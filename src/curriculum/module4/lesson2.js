// Module 4, Lesson 2 — The four splits: parallelism derived (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm4-l2',
  title: '4.2 The four splits — parallelism derived',
  subtitle: md`Lesson 4.1 left 1.12 terabytes homeless and gave you three questions to interrogate
any plan for housing it. This lesson asks those questions four times and gets four different
machines: data, ZeRO, tensor, and pipeline parallelism — then bolts all four together the way a
frontier run actually does.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Lesson 4.1 ended with a verdict and a promise. The verdict: training a 70B model carries 1.12 TB
of permanent state, and no GPU on Earth holds a tenth of it, so the state must live across many.
The promise: 4.2 would show *how* to split it.

Here is the trap. "Spread it across many GPUs" sounds like one decision. It is four, and they are
wildly non-interchangeable, because 4.1's ladder prices the same 140 GB of traffic at 42 ms on one
rung and ~2 seconds on another — a factor of fifty. Pick the split whose traffic rides the wrong
rung and you don't lose 10%; you lose the whole cluster's purpose. The run doesn't slow down. It
effectively stops.

So let's make the fork visible with a job you could actually do. You and 7 friends must copy-edit
a 1000-page book in one night — that's one training step. Four plans present themselves:

1. **Split the pages.** Each friend takes 125 pages. But each must lug the *entire* dictionary and
   style guide to their desk, and at dawn you must hold one meeting to merge everyone's rulings
   into a single consistent style.
2. **Split the dictionary.** Pages still split — but each friend carries only one-eighth of the
   reference shelf, and volumes get passed hand to hand *just before* the moment they're needed.
3. **Split each sentence.** Eight specialists: one fixes verbs, one spelling, one punctuation…
   every single sentence passes through all eight hands, which means conferring *constantly*.
4. **Form an assembly line.** Eight desks in a row, each owning one stage of editing; chapters
   flow desk to desk — and desk 8 twiddles its thumbs while desk 1 fills the line.

Each plan splits a different thing, so a different thing must *travel*, at a different cadence, on
a different rung of the ladder. Those are exactly 4.1's three questions — *what splits, what must
travel, which rung affords it* — and asking them four times is this entire lesson. No new physics,
just the ladder, applied.

## Data parallelism — split the pages

The most obvious split first. Copy the whole model onto every GPU, and split the **batch**: with
$N$ GPUs, each runs forward and backward on $1/N$ of the examples and produces a gradient.

And now, a subtlety with teeth. Lesson 1.6 defined the optimizer step on **the batch gradient** —
the average of the loss's gradient over the whole batch. Each GPU holds the average over *its
shard* only. These are not the same thing, and you cannot just let each GPU apply its own (the
first ponder below asks you to work out the wreckage). The shard gradients must be **averaged**
across all GPUs, every step, before anyone updates a weight. That averaging is the famous
**all-reduce**: every GPU ends up holding the same, full, averaged gradient.

Price it with the three questions. *What travels?* One full gradient copy — for 70B in bf16,
that's the 140 GB gradient row from 4.1's bill. The classic ring all-reduce has a lovely property
we'll state and not prove: each GPU sends and receives about $2 \times$ the gradient bytes
**regardless of how many GPUs participate** — the exact factor is $2(N-1)/N \approx 2$, and the
scheduling trick that achieves it is a beautiful exercise for a rainy afternoon. So: roughly
280 GB traded per GPU per step. *How often?* **Once per step** — not per layer — and better
still, layer $k$'s gradients are finished the moment backprop passes layer $k$, so their
all-reduce can start *while the rest of the backward pass is still running*. That is 4.1's
verdict #3, overlap, in its natural habitat. *Which rung?* Almost any. Once-per-step traffic that
hides behind compute is the gentlest traffic there is; data parallelism happily crosses
InfiniBand between servers.

Cheap on all three questions — that's why data parallelism is the default, the first thing every
framework gives you. And yet it cannot stand alone, for the reason you *watched* in 4.1's rack
viz: every GPU still holds the entire 1.12 TB. Splitting the batch shrank the activations and
multiplied your throughput; it removed not one byte of model state. **Data parallelism scales
throughput, not capacity.** A thousand GPUs deep, each 80 GB card still faces the full terabyte —
and (3.4's warning) if you split a fixed batch too many ways, each shard gets so small the
multipliers starve. Splitting pages was never going to shrink the dictionary.
`,
    },
    {
      type: 'ponder',
      question: md`Why must the gradients be averaged at all? Concretely: suppose each of the 8
GPUs skips the all-reduce and just applies its *own* shard's gradient to its *own* copy of the
weights. Every GPU still learns from real data. What breaks, and how fast?`,
      answer: md`After one step, the eight weight copies differ — each moved in its own shard's
direction. After two steps, each GPU is computing gradients *of a different model*, and the word
"replicas" has become a lie: you now run 8 independent models, each trained on one-eighth of the
data with one-eighth of the batch (hello again, 3.4 starvation), and at the end you own eight
mediocre models and zero good ones. The all-reduce is not bookkeeping — it **is the definition of
training one shared model**. Lesson 1.6's step wants *the* batch gradient, and averaging
equal-sized shard averages gives exactly that: data parallelism is the same mathematics as one
giant GPU running the whole batch, computed in two stages (identical up to floating-point rounding,
since the sums happen in a different order). That quiet
exactness is its superpower — of the four splits, it's the only one you can bolt on without
re-deriving anything.`,
    },
    {
      type: 'text',
      md: md`
## ZeRO / FSDP — split the dictionary

Now stare at data parallelism's memory picture until it offends you. $N$ GPUs, each holding an
*identical* 1.12 TB. That is $N-1$ copies of pure, deliberate waste — and the worst offender is
the optimizer state: the fp32 masters plus Adam's $m$ and $v$ are 12 of the 16 bytes per
parameter, and they're touched exactly *once* per step, at the very end. Why does every replica
carry all of it?

It shouldn't. **Shard it across the data-parallel group.** That's ZeRO ("Zero Redundancy
Optimizer"), in three escalating stages: shard the optimizer states (stage 1), plus the gradients
(stage 2), plus the parameters themselves (stage 3 — what PyTorch calls FSDP, fully sharded data
parallel). Under stage 3, each of the $N$ GPUs *owns* $1/N$ of everything: per-GPU state is
$1120/N$ GB — the exact "ZeRO-3 mode" you toggled in 4.1's rack. Eight GPUs: 140 GB each — still
over the line, interestingly; sharding 8 ways isn't enough for 70B. Thirty-two GPUs: 35 GB each,
and the run finally breathes. Sixty-four: 17.5 GB, luxurious.

But wait — if no GPU holds the full weights, how does anyone compute a forward pass? **Just in
time, layer by layer.** As the computation approaches layer 12, the group all-gathers layer 12's
parameter shards so that, briefly, everyone holds that one layer whole; everyone applies it to
their own batch shard; everyone *drops it* and moves on. The full model exists only one layer at
a time, like a wave passing through the group. The dictionary volume gets passed hand to hand
just before it's needed, and nobody's backpack ever holds the whole shelf.

The price, by the three questions: what travels is parameter shards (gathered each layer, forward
and again backward) plus a reduce-scatter of gradients — in total about $1.5\times$ plain data
parallelism's communication. But the cadence changed character: it's now *per layer*, which
sounds alarming until you notice each gather is small, predictable, and — the third ponder below
— prefetchable behind the previous layer's compute.

Hold on to the deep point, because it renames the whole idea: **ZeRO is not a new parallelism.
It is data parallelism with the redundancy squeezed out.** Same batch splitting. Same gradient
averaging (just ending with shards instead of copies). Identical math. Nothing about the
*computation* was divided — only the *storage*. Which means there remains a thing ZeRO cannot do,
and it forces the third split.
`,
    },
    {
      type: 'ponder',
      question: md`ZeRO-3 inserts an all-gather before *every layer*, forward and backward —
hundreds of communication events per step where plain data parallelism had one. Why doesn't this
demolish performance? And — the honest question — when *would* it?`,
      answer: md`Prefetch. While the GPUs compute layer $k$, the group is already gathering layer
$k{+}1$'s shards in the background — the ladder's overlap principle from 4.1, applied per layer.
The gather's cost is hidden behind compute that was happening anyway, so the *measured* step time
barely moves. And the failure boundary is exactly where that sentence breaks: overlap works only
while (time to compute layer $k$) $\ge$ (time to gather layer $k{+}1$). Make the layers too fast
(a small model, where you didn't need ZeRO-3 anyway) or the interconnect too slow (full sharding
across a weak network) and the gathers surface as stalls — the wave of parameters can't keep up
with the wave of computation. Communication hidden behind compute is free *until it isn't*; ZeRO-3
lives on the sunny side of that inequality, and knowing the inequality is what lets you predict
when it won't.`,
    },
    {
      type: 'text',
      md: md`
## Tensor parallelism — split the sentence

Data parallelism and ZeRO share an assumption so quiet you may not have noticed it: *each layer's
computation happens whole, on one GPU*. ZeRO shards where layers are **stored**, but at compute
time each GPU still runs the entire layer on its batch shard. What if one layer is itself too
big — its working set won't fit, or you need its FLOPs to land on more than one card's
multipliers?

Then you split **inside the matmul**. Take an FFN weight matrix you met in Module 2 — say
$4096 \times 11008$. Lesson 1.2 taught the crucial license: the columns of a matrix act
*independently* — each output feature is its own dot product with the input. So slice the matrix
into 8 column blocks of $4096 \times 1376$, one per GPU on the server. Feed every GPU the same
token; each computes its own 1376 features of the 11008-wide interior — a perfectly legal
one-eighth of the layer. To hand the next layer a complete token, the pieces must be recombined:
one **all-reduce**, and in the standard (Megatron-style) arrangement that happens **twice per
transformer block** — once after attention's output projection, once after the FFN.

Price it. *What travels?* Activation-sized tensors: for 2048 tokens at hidden size 8192 in bf16,
about 34 MB per all-reduce — tiny next to a 140 GB gradient. *How often?* Twice per block, every
block, forward and again backward — for an 80-layer model, 160 all-reduces per forward pass
alone, each one sitting **on the critical path**: the next layer literally cannot start until the
reduce completes. The disease isn't bytes; it's frequency times latency. *Which rung?* Now 4.1's
verdict #1 — "tensor parallelism never crosses servers" — stops being a decree and becomes a
derivation: traffic that fires inside every layer cannot afford a rung that is $10$–$20\times$
slower per byte and far worse in latency. Tensor parallelism lives on the NVLink island — the 8
GPUs of one server — or it doesn't live.

What do you get for tolerating the neediest split in the zoo? The one thing nothing else offers:
**the layer itself divides.** Each GPU holds one-eighth of every weight matrix *and* one-eighth
of each layer's fat interior activations (the 11008-wide hidden features that dominate a block's
working set), and one layer's FLOPs spread across eight multipliers. Note the mirror-image trade
with ZeRO: ZeRO splits the *tokens* (each GPU sees $1/N$ of the batch, all features); tensor
parallelism splits the *features* (each GPU sees **every token**, $1/8$ of the features). When
even a single layer's working set outgrows one GPU — and at frontier scale it does — tensor
parallelism isn't an option. It's the only door.

## Pipeline parallelism — the assembly line

One split remains: the **layer stack**. Put layers 1–10 on GPU 1, layers 11–20 on GPU 2, … layers
71–80 on GPU 8. *What travels?* Just the activations crossing each boundary: GPU 1 finishes layer
10 and ships one activation tensor — that same ~34 MB — to GPU 2. Point-to-point, not a collective;
once per stage boundary per microbatch. This is the gentlest communication signature of all four
splits, and it rides InfiniBand between servers without complaint. Pipeline parallelism is *the*
split you send across boxes.

So where's the catch? Not in the network — in the **calendar**. Send one batch down the line:
while GPU 1 chews on it, GPUs 2 through 8 have *nothing to do*; when it reaches GPU 8, GPU 1 is
idle instead. Let's derive the damage rather than mourn it. Chop the batch into $m$
**microbatches** and clock time in units of one stage-step. The first microbatch needs $p$ slots
to traverse all $p$ stages; after that the pipe is full and one microbatch pops out per slot, so
all $m$ clear in about $m + p - 1$ slots. But each stage only does $m$ slots of useful work. The
idle share — the **bubble** — is what's left:

$$\text{bubble} \;\approx\; \frac{p-1}{m+p-1}$$

Now compute it, because the formula's personality lives in its numbers. Eight stages, $m = 4$:
$7/11 \approx 64\%$ idle — you paid for 8 GPUs and are effectively running 3. Same eight stages,
$m = 32$: $7/39 \approx 18\%$ — tolerable. The medicine is *more, smaller microbatches*, and here
the course folds back on itself beautifully: lesson 1.6's **gradient accumulation** already
wanted the batch cut into microbatches whose gradients *sum* before one optimizer step. Pipeline
parallelism gets its $m$ from the accumulation you were doing anyway — one mechanism, two jobs,
and the optimizer step at the end is identical either way.
`,
    },
    {
      type: 'ponder',
      question: md`Before reading on: a 4-stage pipeline fed 4 microbatches. Derive the bubble
fraction yourself from the slot-counting argument — don't plug into the formula until you've
rebuilt it.`,
      answer: md`Total slots: the first microbatch takes 4 to cross, then one finishes per slot —
$4 + (4-1) = 7$ slots. Useful work per stage: 4 slots. Idle: $3/7 \approx 43\%$. Nearly half the
cluster, spent on waiting — with $p$ and $m$ equal, the pipeline spends as long filling and
draining as working. The formula agrees: $(4-1)/(4+4-1) = 3/7$. The lesson in your hands: the
bubble depends on the *ratio* of $m$ to $p$, so deep pipelines demand many microbatches — and
since microbatches are gradient-accumulation slices, "how much do you accumulate" and "how deep
can you pipeline" are secretly the same budget.`,
    },
    {
      type: 'viz',
      viz: 'parallelism-rack',
      caption: md`The same 8-GPU rack from 4.1 — but this time you have the theory, so use it
analytically. (1) Data parallel: watch the activation bars shrink (the batch splits) while the
state bars replicate identically on all 8 — throughput without capacity, the whole diagnosis in
one picture. (2) ZeRO-3: every bar divides by 8; now read the communication line and name
precisely what got more expensive (per-layer parameter gathers, ~1.5× plain DP's bytes — and say
why it's survivable: prefetch). (3) Tensor: notice the activations do NOT shrink per-GPU the way
ZeRO's did in this simplified rack — because every GPU sees every token, only the features split
— and recall which rung this mode is allowed to ride (NVLink island only). (4) Pipeline: memory
looks comfortably ZeRO-ish, but the caption's bubble warning is the part the bars can't show —
idle time never appears on a memory chart.`,
    },
    {
      type: 'example',
      title: 'the communication signature ledger — four splits, priced',
      md: md`
One table, built entirely from 4.1's three questions — worth rebuilding from memory before any
infra interview:

| split | what splits | what travels | cadence | rung verdict |
|---|---|---|---|---|
| **data** | the batch | one gradient copy (~140 GB grads → ~280 GB traded/GPU) | once per step, overlaps behind backward | any rung, even InfiniBand |
| **ZeRO-3 / FSDP** | the 16 B/param state (batch too) | parameter shards + gradient reduce-scatter (~1.5× DP) | per layer, prefetchable | NVLink easy; slower rungs while overlap holds |
| **tensor** | each matmul (features) | ~34 MB activation all-reduces, on the critical path | 2 per block, fwd + bwd — hundreds per step | **NVLink island only** |
| **pipeline** | the layer stack | one ~34 MB boundary activation per microbatch | per boundary per microbatch, point-to-point | happily InfiniBand |

Read it like an engineer and the cluster layout writes itself: **latency-critical, per-layer
traffic stays inside the box; per-step, overlappable traffic crosses boxes.** That single
sentence *is* the modern datacenter floor plan — and every entry in the table came from asking
what splits, what travels, which rung.
`,
    },
    {
      type: 'example',
      title: 'composing all four — a 16,384-GPU recipe, justified line by line',
      md: md`
Frontier runs don't choose one split; they nest them. Here's a representative factorization for
16,384 GPUs (illustrative — the shape is standard, the exact numbers are ours, not a quote of any
lab's config):

$$16{,}384 \;=\; \underbrace{8}_{\text{TP}} \times \underbrace{16}_{\text{PP}} \times \underbrace{128}_{\text{DP}}$$

**TP = 8, inside each NVLink island.** The neediest split gets the fastest rung — per-layer
all-reduces never leave the server. Eight is not a fashion statement; it's the island size.

**PP = 16, across islands.** The 80-layer stack chunks into 16 stages of 5 layers, spanning 16
servers; only ~34 MB boundary activations cross InfiniBand. One model replica now spans
$8 \times 16 = 128$ GPUs, so per-GPU permanent state is $1120/128 = 8.75$ GB — the terabyte,
tamed, with room left for activations and headroom. Bubble check: $p = 16$ with $m = 128$
microbatches gives $15/143 \approx 10\%$ idle. Acceptable; with $m = 32$ it would be
$15/47 \approx 32\%$ — the formula, not taste, sets the accumulation schedule.

**DP = 128 replicas, for throughput.** Each GPU all-reduces only *its* slice of the gradient
with its 128 counterparts: $140/128 \approx 1.1$ GB of gradient, ~2.2 GB traded per step —
trivial, overlapped behind backward. Real recipes then run ZeRO stage 1 *over this DP axis* to
shave the optimizer slice of that 8.75 GB further, because redundancy is redundancy.

Notice what the composition really is: **each split assigned to the rung whose price it can
afford.** Swap any two — say, tensor parallelism across islands — and those hundreds of
critical-path all-reduces each pay InfiniBand latency: the 50× penalty from 4.1, hundreds of
times per step. That's the fork's wrong tine, and nothing downstream can save you from it.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **Data parallelism, derived:** split the batch, average the gradients — because 1.6's step is
   defined on *the* batch gradient; ~2× gradient bytes per GPU per step (the ring's
   $2(N-1)/N$), once per step, overlappable, any rung. Scales **throughput, not capacity**.
2. **ZeRO/FSDP, derived from waste:** $N$ identical replicas are $N-1$ copies of redundancy;
   shard states → gradients → parameters, gather just in time, drop after use. $1120/N$ GB per
   GPU for ~1.5× the communication, hidden by prefetch. *Data parallelism with the redundancy
   squeezed out* — same math, thinner storage.
3. **Tensor parallelism, derived from 1.2:** columns are independent, so split inside the matmul;
   all-reduce twice per block on the critical path → NVLink island only. The only split that
   divides a *single layer's* memory and compute — mandatory when one layer outgrows one GPU.
4. **Pipeline parallelism, derived from the calendar:** split the layer stack, ship ~34 MB
   boundary activations anywhere — but pay the bubble, $(p-1)/(m+p-1)$: 64% idle at $p=8, m=4$;
   18% at $m=32$. Microbatches are 1.6's gradient-accumulation slices moonlighting.
5. **The composition rule:** TP inside the island, PP across islands, DP(+ZeRO) across replicas —
   *every split assigned to the rung whose price it can afford*. Three questions in, floor plan
   out.

All four splits shared one unexamined assumption: every parameter works on every token. Next
lesson breaks it — **Mixture of Experts**, where the model itself becomes a router and the fifth
thing to travel is the tokens.
`,
    },
  ],
  questions: [
    {
      id: 'm4-l2-q1',
      kind: 'mcq',
      prompt: md`You launch Llama-70B training with plain data parallelism (no ZeRO) across 128
H100s (80 GB each). Every single GPU immediately runs out of memory. Why?`,
      options: [
        'The all-reduce buffers grow with the number of GPUs, and at 128 GPUs they exceed 80 GB',
        'Every GPU still holds the entire 1.12 TB of model + optimizer state — data parallelism splits the batch, not the state: throughput without capacity',
        'With 128 ways to split, each GPU’s batch shard is too small to compute a valid gradient',
        'Averaging requires promoting all gradients to fp32 on every GPU, doubling gradient memory past the limit',
      ],
      answer: 1,
      explain: md`Data parallelism *replicates* the model; only the batch divides. Each card faces
the full 1.12 TB whether you have 8 GPUs or 8000 — capacity never improves, which is exactly what
4.1's rack viz showed and exactly what ZeRO exists to fix. Option A tempts because communication
"feels" like it should grow with $N$ — but the ring all-reduce's per-GPU traffic is ~2× the
gradient bytes *regardless of $N$*, one of its charms. Option C names a real disease (tiny shards
starve the multipliers — 3.4) but it's a *throughput* disease, not an OOM. Option D: the
averaging happens inside the all-reduce; nothing forces fp32 gradient copies, and even an extra
140 GB wouldn't be the story next to the terabyte already there.`,
    },
    {
      id: 'm4-l2-q2',
      kind: 'numeric',
      prompt: md`ZeRO-3 / FSDP shards the full 16 bytes/param training state across the
data-parallel group. For the 70B model (1120 GB of state) sharded across **32 GPUs**, how many
**GB of permanent state** does each GPU hold?`,
      answer: 35,
      tolerance: 2,
      explain: md`$1120 / 32 = 35$ GB — the number from 4.1's cluster-request memo, now derived
from the mechanism rather than asserted: each GPU *owns* one thirty-second of every tensor, and
the rest of each layer exists on this GPU only during its just-in-time moment. 35 GB of state on
an 80 GB card leaves real room for activations and headroom — which is why "ZeRO-3 across 32" was
a defensible minimum and "across 8" ($1120/8 = 140$ GB) still is not.`,
    },
    {
      id: 'm4-l2-q3',
      kind: 'mcq',
      prompt: md`Which statement correctly captures the relationship between ZeRO-3/FSDP and plain
data parallelism?`,
      options: [
        'ZeRO is tensor parallelism applied to the optimizer: each GPU computes every layer using only its slice of each weight matrix',
        'ZeRO turns the run into N semi-independent models that periodically synchronize their weights',
        'ZeRO is data parallelism with the redundancy squeezed out: same batch split, same gradient averaging, identical math — the N identical copies of state are sharded and gathered just in time',
        'ZeRO is pipeline parallelism in which optimizer states, rather than activations, flow between stages',
      ],
      answer: 2,
      explain: md`ZeRO changes *where bytes live*, never *what gets computed*: each GPU still runs
every layer, whole, on its own batch shard — the layer's weights are simply gathered for the
moment they're needed and dropped after. Option A tempts because both ZeRO and tensor parallelism
"shard parameters" — but TP shards the *computation* (each GPU computes a slice of features)
while ZeRO shards only *storage* and gathers before computing. Option B describes a real family
of methods (local SGD / periodic averaging) that genuinely changes the math — ZeRO pointedly does
not; its exactness is the selling point. Option D confuses which axis is being cut: ZeRO slices
across the data-parallel group, not along the depth of the network.`,
    },
    {
      id: 'm4-l2-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** From the assembly-line picture, derive the pipeline
bubble fraction on paper. Set up the time accounting yourself: with $p$ stages and $m$
microbatches, count how many stage-time slots pass before the last microbatch exits, and how many
of those slots each stage spends doing useful work. Produce the formula, then apply it to
$p = 8$, $m = 8$: state the idle percentage and name the fix (and the lesson-1.6 mechanism it
reuses).`,
      rubric: md`**The accounting:** the first microbatch takes $p$ slots to traverse the pipe;
once full, one microbatch completes per slot, so all $m$ finish in about $m + p - 1$ slots. Each
stage does exactly $m$ slots of useful work, leaving $p - 1$ idle slots:

$$\text{bubble} = \frac{p-1}{m+p-1}$$

**Application:** $p = 8, m = 8$: $7/15 \approx 47\%$ idle — half the hardware spent waiting.

**The fix:** raise $m$ — more, smaller microbatches ($m = 32$ gives $7/39 \approx 18\%$) — and
the mechanism is gradient accumulation from 1.6: microbatch gradients *sum* before the single
optimizer step, so pipelining's $m$ and accumulation's step count are the same knob.

"Nailed it" requires the formula to *emerge from the slot-counting* (fill time $p-1$, total
$m+p-1$, useful $m$) — writing the formula from memory and plugging in is precisely what this
question is not about. Full credit also names gradient accumulation, not just "use more
microbatches."`,
    },
    {
      id: 'm4-l2-q5',
      kind: 'mcq',
      prompt: md`At frontier scale, a single transformer layer's weights-plus-activations working
set exceeds one GPU's memory even at microbatch size 1. Which parallelism is now *mandatory*, and
why?`,
      options: [
        'Pipeline parallelism — it splits the model across GPUs by layers',
        'Tensor parallelism — it splits inside each matmul, so a single layer’s weights, activations, and FLOPs divide across GPUs; every other split leaves each layer’s computation whole on one card',
        'ZeRO-3 — it shards all parameters, so no GPU ever holds a full layer',
        'Data parallelism with a smaller per-GPU batch — activation memory scales with batch size',
      ],
      answer: 1,
      explain: md`Only tensor parallelism cuts *within* a layer: column-splitting the matmul puts
$1/8$ of the weights, $1/8$ of the fat interior activations, and $1/8$ of the FLOPs on each GPU.
Option A tempts because pipeline "splits the model" — but each stage still runs its layers
*whole*; a too-big layer is too big on whichever stage it lands. Option C is the subtle one:
ZeRO-3 shards *storage*, but at compute time it gathers the full layer back and each GPU runs the
entire layer's computation — the working set at the moment of use is undivided. Option D is
foreclosed by the premise: the batch is already 1. When one layer outgrows one GPU, feature-axis
splitting isn't a preference; it's the only door.`,
    },
    {
      id: 'm4-l2-q6',
      kind: 'numeric',
      prompt: md`Pipeline bubble arithmetic: $p = 8$ stages, $m = 32$ microbatches. What
**percentage** of the cluster's time is idle bubble? (Use the formula you derived; answer as a
percent.)`,
      answer: 18,
      tolerance: 2,
      explain: md`$(8-1)/(32+8-1) = 7/39 \approx 17.9\% \approx 18\%$. Compare $m = 4$: $7/11
\approx 64\%$ — same hardware, same model, and the difference between "runs fine" and "wastes
two-thirds of a datacenter" is one scheduling integer. This is why microbatch count is a
first-class hyperparameter of frontier training, negotiated jointly with gradient accumulation.`,
    },
    {
      id: 'm4-l2-q7',
      kind: 'numeric',
      prompt: md`Tensor parallelism issues 2 all-reduces per transformer block (attention output +
FFN output). For an **80-layer** model, how many tensor-parallel all-reduces does **one forward
pass** require?`,
      answer: 160,
      tolerance: 1,
      explain: md`$80 \times 2 = 160$ per forward pass — and backward roughly doubles it, so
300-plus critical-path collectives *per training step*, each blocking the next layer until it
completes. Set that cadence against the ladder: on NVLink each is sub-millisecond noise; across
InfiniBand each pays an order-of-magnitude latency and bandwidth penalty, hundreds of times per
step. That single multiplication is the entire proof behind 4.1's verdict #1: tensor parallelism
never leaves the island.`,
    },
    {
      id: 'm4-l2-q8',
      kind: 'mcq',
      prompt: md`Your 8-stage pipeline runs at 64% idle ($m = 4$ microbatches). What's the
*cheapest effective* fix?`,
      options: [
        'Buy a faster interconnect between the pipeline stages',
        'Raise the microbatch count: bubble = (p−1)/(m+p−1), so m = 32 drops idleness from 64% to about 18% — and the microbatches are lesson 1.6’s gradient-accumulation slices you likely wanted anyway',
        'Halve the pipeline to p = 4 stages by giving each GPU twice the layers',
        'Overlap the stage-to-stage activation sends behind compute',
      ],
      answer: 1,
      explain: md`The bubble is a *scheduling* disease — stages idle because nothing has reached
them yet — so the cure is keeping the pipe full, and $m$ is a nearly free knob. Option A tempts
because "waiting = slow network" is a reflex, but the boundary traffic is ~34 MB point-to-point;
the network was never the problem. Option C actually helps the formula ($3/7 \approx 43\%$ at
$m=4$) — that's what makes it tempting — but doubling layers per GPU doubles per-stage memory,
reinstating the very wall that forced pipelining. Option D is 4.1's favorite medicine prescribed
for the wrong illness: overlap hides *communication cost*, and here the idle GPUs have no compute
to hide anything behind — that's the disease itself.`,
    },
    {
      id: 'm4-l2-q9',
      kind: 'numeric',
      prompt: md`**Fermi, at cluster scale (paper first, calculator last):** a data-parallel group
trains the 70B model; gradients are bf16 (140 GB). Using the ring all-reduce's ~2× rule of thumb,
roughly how many **GB does each GPU send-plus-receive per optimizer step** for gradient
averaging? (Generous tolerance — the exponent and leading digit are what matter.)`,
      answer: 280,
      tolerance: 70,
      explain: md`$140 \times 2 \approx 280$ GB traded per GPU per step — independent of the group
size, courtesy of $2(N-1)/N \approx 2$. Now price it against the ladder: at NVLink's ~900 GB/s
that's ~0.3 s; over InfiniBand at ~50 GB/s, ~5.6 s — which is why the all-reduce *must* overlap
behind the backward pass (4.1's verdict #3) and why gradient bucketing exists. A researcher who
can produce "~280 GB, ~0.3 s on the fast rung" on a napkin wins most infra arguments before
anyone opens a profiler.`,
    },
    {
      id: 'm4-l2-q10',
      kind: 'written',
      prompt: md`**The three questions, applied.** You're handed 4096 GPUs: 512 servers of 8
(NVLink ~900 GB/s inside each server; InfiniBand ~50–100 GB/s between). The model: 80 layers,
1.12 TB of training state. On paper, propose a TP × PP × DP factorization multiplying to 4096.
For *each* axis, justify the choice with 4.1's three questions (what splits / what travels /
which rung affords it). Show the per-GPU state arithmetic, and run one bubble check with a chosen
microbatch count.`,
      rubric: md`Any coherent factorization earns credit if every axis is rung-justified; the
canonical answer:

**TP = 8, inside each island:** splits each matmul; activation-sized all-reduces twice per block,
forward and backward, on the critical path — only NVLink affords that cadence. TP > 8 (crossing
islands) is an automatic fail of the layout, whatever the rest says.

**PP = 16, across islands:** splits the 80 layers into 16 stages of 5; only ~34 MB boundary
activations travel, point-to-point, per microbatch — InfiniBand-friendly. One replica spans
$8 \times 16 = 128$ GPUs → per-GPU state $1120/128 = 8.75$ GB. Comfortable.

**DP = 32 replicas** ($8 \times 16 \times 32 = 4096$): splits the batch; each GPU trades ~2× its
gradient *slice* ($140/128 \approx 1.1$ GB → ~2.2 GB) once per step, overlapped behind backward —
happily crosses InfiniBand. Bonus credit: ZeRO stage 1 over this axis to shave the optimizer
share of the 8.75 GB.

**Bubble check** (any honest one): $p = 16$, $m = 64$ → $15/79 \approx 19\%$; $m = 128$ →
$15/142 \approx 11\%$; the answer should *conclude* something (pick $m \gtrsim 64$).

Full credit = all three axes justified via the three questions (not vibes), correct per-GPU
arithmetic, a bubble computation with a stated conclusion, and no latency-critical traffic
assigned to InfiniBand.`,
    },
    {
      id: 'm4-l2-q11',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** You and 7 friends must copy-edit a giant 1000-page
book in one night. Explain the four ways to split the work — everyone takes their own pages;
everyone takes pages but you split up the one heavy reference shelf between backpacks; eight
specialists who each fix one thing in every sentence; an assembly line of desks — and, for each,
the annoying cost that comes with it. Then say which costs are about *talking* and which are
about *waiting*. No jargon without kid-words first — inventing your own better analogy beats
reusing this one.`,
      rubric: md`Grade the teaching, not the vocabulary. A "nailed it" answer must:

1. **All four plans, each with its cost:** pages → everyone lugs the whole reference shelf AND
   you need one big dawn meeting to agree on the rules (the meeting = averaging everyone's
   corrections into one set); shelf-splitting → nobody carries much, but volumes must be passed
   hand to hand *just before* they're needed, and a slow hallway means friends stand waiting for
   the book to arrive; sentence-specialists → every sentence needs all eight people to confer,
   constantly, so they'd better be sitting at the same table (not phoning between houses);
   assembly line → desk 8 has nothing to do until work flows down the line, so you keep everyone
   busy by sending many *small* stacks of pages instead of one big one.
2. **The talking/waiting sort:** pages, shelf, and specialists cost *talking* (meetings, passing,
   conferring); the assembly line's cost is *waiting* (empty desks) — and more, smaller stacks
   fix waiting, while sitting closer together fixes talking.
3. **Jargon audit:** "all-reduce," "gradient," "shard," "GPU," "tensor parallel," "bubble,"
   "microbatch" without a kid-words explanation first = partial credit at best — jargon-hiding is
   the exact failure this exercise exists to catch.
4. A genuinely different analogy that carries all four splits and their costs earns *more* than a
   faithful retelling.`,
    },
    {
      id: 'm4-l2-q12',
      kind: 'written',
      prompt: md`**The signature ledger, from memory.** Rebuild the four-row table on paper: for
each split (data, ZeRO-3, tensor, pipeline) state (a) what splits, (b) what must travel and how
often, (c) which rung affords it, and (d) the one reason it cannot stand alone. Close with the
one-sentence cluster-layout rule the table implies.`,
      rubric: md`Per row, all four cells:

**Data:** batch splits; ~2× gradient bytes (~280 GB/GPU for 70B) once per step, overlappable
behind backward; any rung, InfiniBand included; cannot stand alone because every GPU holds the
full 1.12 TB — throughput without capacity.

**ZeRO-3:** the 16 B/param state splits across the DP group (batch too); per-layer parameter
all-gathers + gradient reduce-scatter, ~1.5× plain DP; fast rungs comfortably, slower rungs only
while prefetch overlap holds; cannot stand alone at the frontier because each layer's
*computation* still runs whole per GPU — a too-big layer stays too big.

**Tensor:** each matmul splits along features; ~34 MB activation all-reduces twice per block,
forward and backward, latency-critical; NVLink island only; cannot stand alone because the island
has ~8 GPUs — nowhere near a terabyte of headroom, and no throughput scaling beyond the box.

**Pipeline:** the layer stack splits; one boundary activation per microbatch, point-to-point;
happily InfiniBand; cannot stand alone because of bubbles — $(p-1)/(m+p-1)$ idleness that deep
pipelines only tame with many microbatches (and depth alone doesn't shrink one stage's state
enough anyway).

**The rule** (any faithful phrasing): latency-critical per-layer traffic stays inside the NVLink
box; per-step overlappable traffic crosses boxes — every split rides the rung whose price it can
afford.

Full credit = all sixteen cells substantially right *with the numbers* (280 GB, 1.5×, 2/block,
the bubble formula), plus a layout rule that mentions both the island and the overlap idea.`,
    },
  ],
}
