// Module 4, Lesson 4 — Quantization (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm4-l4',
  title: '4.4 Quantization — how many bits does a thought need?',
  subtitle:
    'Lesson 4.1 proved that sixteen bits were not enough to train a model. Your laptop runs one crushed to four. Both facts are true, and the resolution of that contradiction is a small masterclass in what numbers are for.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Hold these two facts side by side until they itch:

1. **Lesson 4.1:** training in pure fp16 — *sixteen* bits per number — fails, because updates of
   size $10^{-4}$ round away against fp16's resolution of $\sim 10^{-3}$. We needed fp32 master
   copies to learn at all.
2. **Lesson 3.4:** your laptop runs a 7B model comfortably — with the weights crushed to
   **four bits each**. Sixteen distinct values. A number system you could list on one hand and a
   napkin. And the model... mostly still works.

Same weights. Sixteen bits fatally coarse in one setting; four bits survivable in the other. This
is not a paradox to shrug at — it's a clue. Whatever precision *is*, it's not a property of the
numbers. It's a property of **what you do with them**. This lesson works out that principle, then
uses it to squeeze models onto hardware they have no right to fit on.

## What a float actually is: a budget split three ways

A floating-point number spends its bits on three things: one **sign** bit, some **exponent** bits
(which set the *range* — how big and small you can go), and some **mantissa** bits (which set the
*resolution* — how finely you can distinguish neighbors). The three formats that matter:

| format | exponent | mantissa | range | resolution near 1.0 |
|---|---|---|---|---|
| fp32 | 8 | 23 | $\sim 10^{\pm 38}$ | $\approx 10^{-7}$ |
| fp16 | 5 | 10 | $\sim 10^{\pm 4.8}$ | $\approx 10^{-3}$ |
| bf16 | 8 | 7 | $\sim 10^{\pm 38}$ | $\approx 8 \times 10^{-3}$ |

Look at bf16's strange bet: it keeps fp32's *entire exponent* — the full range — and pays for it
by gutting the mantissa down to 7 bits, a resolution near $1.0$ of only $2^{-7} \approx 0.008$.
*Coarser than fp16!* Why did this format win training? Because the two failure modes are not
equal. Gradients in a deep network span wild magnitudes (1.3's vanishing/exploding chains);
running out of **range** means an overflow to infinity or a flush to zero — a training-run
*explosion*. Running out of **resolution** means rounding — which lesson 4.1 already solved with
fp32 master weights, where the accumulation happens. So bf16 spends its budget on the disaster
that has no other fix, and delegates the one that does. Every format choice is this same triage:
range vs resolution vs bytes, priced against what the numbers will be *used for*.

## Resolving the contradiction

Now the itch can be scratched. Why does training demand resolution that inference can shrug off?

**Training accumulates.** A weight is nudged $\sim 10^{-4}$ at a time, a million times. Each nudge
must *survive being added* — below resolution, it vanishes, and a million vanished nudges is a
model that never learned. Worse, rounding in accumulation is *systematic*: it biases the same
direction step after step, and the error compounds linearly with time.

**Inference reads.** The frozen weight is used inside dot products (1.1) — multiplied and summed
with thousands of partners. Round each of 4096 weights a little, in directions that are
essentially independent, and the drunkard's walk (1.1, yet again) says the *sum's* error grows
only like $\sqrt{4096} = 64$ rounding-units, not 4096. How small that is *relative to the output*
depends on the signal: where weights line up with the activations — the features the layer actually
detects — the signal adds coherently and outgrows the noise; in unaligned directions the relative
error stays near the per-weight level. Either way the error is a **one-time, unbiased wobble** that
never compounds, and networks trained on noisy data tolerate small wobbles well.

Accumulate a million times: errors *compound*. Read once into a big sum: errors *cancel*. Same
numbers, opposite arithmetic destinies. That is the whole secret of quantization — and why it's an
inference trick first, and only much more carefully a training one.

## Doing it by hand: integers with a ruler

Four-bit quantization stores each weight as an integer $0 \dots 15$ plus a shared **scale** (and
offset). Build the ruler: for weights spanning $[\min, \max]$,

$$\text{scale} = \frac{\max - \min}{2^b - 1}, \qquad q_i = \text{round}\!\left(\frac{w_i - \min}{\text{scale}}\right), \qquad \hat w_i = \min + q_i \cdot \text{scale}$$

Sixteen tick marks spread evenly across the weights' range; every weight snaps to its nearest
tick. Maximum error: half a tick, $\text{scale}/2$. That's the entire mechanism — the interesting
physics is in where it breaks.
`,
    },
    {
      type: 'example',
      title: 'int4 by hand — four weights, sixteen ticks',
      md: md`
Quantize $w = (-0.8,\; -0.1,\; 0.3,\; 0.9)$ to 4 bits.

**The ruler:** range $= 0.9 - (-0.8) = 1.7$; $\;\text{scale} = 1.7/15 \approx 0.1133$.

**Snap each weight to its tick** $q = \text{round}((w + 0.8)/0.1133)$:

| $w$ | exact ticks | $q$ (stored int) | $\hat w$ (dequantized) | error |
|---|---|---|---|---|
| $-0.8$ | $0.0$ | 0 | $-0.800$ | $0.000$ |
| $-0.1$ | $6.18$ | 6 | $-0.120$ | $0.020$ |
| $0.3$ | $9.71$ | 10 | $0.333$ | $0.033$ |
| $0.9$ | $15.0$ | 15 | $0.900$ | $0.000$ |

Storage: four 4-bit ints + one scale + one offset, versus four fp16s — roughly $4\times$ smaller
at group size, errors all under half a tick ($\approx 0.057$). Feed these $\hat w$ into a
4096-term dot product and the wobbles largely wash out. This is the honeymoon case — every weight
similar in size. Now watch one guest ruin the party.
`,
    },
    {
      type: 'ponder',
      question: md`Quantize $w = (-0.1,\; 0.05,\; 0.2,\; 12.0)$ to int4 with the same recipe.
Compute the scale, snap each weight, and look at what happened to the three small ones. Then
propose the fix before reading it.`,
      answer: md`Range $= 12.1$, so $\text{scale} = 12.1/15 \approx 0.807$ — the tick spacing is
now **eight times larger than the three small weights themselves**. Snap: $-0.1 \to q=0 \to
\hat w = -0.1$; $\;0.05 \to q = 0 \to \hat w = -0.1$ (error $0.15$, i.e. $300\%$ of the weight);
$\;0.2 \to q = 0 \to \hat w = -0.1$ (error $0.3$, sign destroyed!); $\;12.0 \to q = 15 \to 12.0$,
flawless. One outlier stretched the ruler until every normal weight became indistinguishable
static — the many sacrificed to represent the one. **The fix:** don't share one ruler so widely.
*Per-group scales* (a fresh scale every 64–128 weights) quarantine the outlier's damage to its own
small group; *mixed precision* goes further and stores the outlier itself in fp16, letting the
int4 ruler serve only the well-behaved. Real quantization stacks both.`,
    },
    {
      type: 'text',
      md: md`
## The villain is real: outlier features

The ponder was not a contrived corner case. Around 2022, researchers found that trained LLMs
*systematically* develop a handful of activation channels whose values run $10$–$100\times$
larger than everything else — and they matter: zero them and quality craters. Nobody fully
knows why they emerge (active research; they appear as models pass a few billion parameters), but
every practical quantization scheme is, at heart, a strategy for living with them:

- **Quarantine** (per-group scales): every 64–128 weights share a ruler, so an outlier only
  coarsens its own block. The workhorse — this is what the "g128" in quantized model names means.
- **Exempt them** (LLM.int8-style mixed precision): detect outlier channels, run exactly those in
  fp16, quantize the well-behaved 99.9%.
- **Protect their partners** (AWQ): a weight is only as important as the activations it meets
  (1.1: the dot product weighs both sides) — find the weights that multiply big activations and
  spend precision there.
- **Let the team compensate** (GPTQ): quantize weights *sequentially*, and after each rounding,
  adjust the not-yet-quantized weights to absorb the error. Lesson 1.2's deepest habit — a weight
  matrix is a team, not 16 million individuals — turned into an algorithm.

What actually degrades when you do all this well? At 4-bit: a small perplexity creep (1.5's ruler
put to work — this is *the* number quantization papers report), with math and code typically
flinching first (empirically; precise reasoning chains seem least forgiving of static). Below
3 bits: cliffs — 8 ticks is simply not much of a ruler. (Ternary and "1.58-bit" training-time
schemes exist as genuinely contested research — models *trained* to be low-bit rather than crushed
afterward — flag them as frontier, not folklore.) And the same knife cuts the other pile:
**KV-cache quantization** — 3.3's levers, now explained — stores cached K/V at 8 or 4 bits,
shrinking the *other* memory monster.
`,
    },
    {
      type: 'ponder',
      question: md`Lesson 3.3's capacity levers included "quantize the KV cache to 8 or 4 bits."
Using this lesson's accumulate-vs-read principle: what makes a cached key or value *safe* to
quantize? And is there anything about the cache that should make you slightly *more* nervous than
quantizing weights?`,
      answer: md`**Safe because read-like:** a cached $\mathbf{k}$ or $\mathbf{v}$ is written once
and then only ever *read* into attention's dot products (scores $\mathbf{q}\cdot\mathbf{k}$, mixes
$\sum w_i \mathbf{v}_i$) — exactly the big-sum, error-canceling use that forgives coarse ticks.
Nothing accumulates into a cache entry; the freeze proof (3.3) guarantees it's never updated.
**The extra nervousness:** weights were quantized *once, offline*, with fancy compensation (GPTQ's
team adjustments, AWQ's activation statistics); cache entries are quantized *on the fly, one
token at a time, mid-conversation* — no time for cleverness, and errors in a key perturb the
*softmax competition* (2.2), where lesson 1.1 taught you a small score shift can move a landslide.
Empirically 8-bit KV is nearly free and 4-bit costs a little more care (per-head scales) — but the
asymmetry in *how much engineering guards each* is why weight-quantization papers came first.`,
    },
    {
      type: 'example',
      title: 'what the bits buy — one model, four wardrobes',
      md: md`
Llama-3-405B, dressed four ways:

| precision | bytes/param | resident size | fits on... |
|---|---|---|---|
| fp32 | 4 | 1620 GB | a 21-GPU sermon on waste |
| fp16/bf16 | 2 | 810 GB | ~11 H100s |
| int8 | 1 | 405 GB | ~6 H100s |
| int4 | 0.5 | ~203 GB | **3 H100s** |

And by lesson 3.4's law (tokens/sec $\le$ bandwidth ÷ bytes streamed), each halving of bytes is
also a *doubling of the decode ceiling*: quantization is the rare trick that pays **both** walls —
capacity (does it fit?) and bandwidth (how fast does it run?) — at once. This is why the
quantized-model ecosystem exists: the difference between "needs a cluster" and "runs on the
gaming PC in your closet" is, mostly, this table.
`,
    },
    {
      type: 'ponder',
      question: md`If 4 bits mostly works, why not 2 bits? Why not 1? Before revealing: count the
ticks, and think about what the *outlier* section did to tick spacing.`,
      answer: md`Count what's left: 4 bits = 16 ticks, 2 bits = 4 ticks, 1 bit = *two* — every
weight in a group becomes "big-ish positive" or "big-ish negative," full stop. The per-group
outlier machinery assumed there were enough ticks to serve the well-behaved majority once the
outlier was handled; at 4 ticks the majority get 2–3 among themselves — the ruler is nearly all
gaps. Empirically the perplexity curve, gentle from 16→8→4 bits, turns cliff below 3: the
distribution of weights has genuine structure that ~16 levels can sketch and ~4 cannot. The
honest frontier caveat: *training-time* low-bit schemes (ternary weights learned as ternary from
the start) sidestep "crushing" entirely and report striking results — whether they hold at
frontier scale is exactly the kind of contested empirical question a researcher should track
rather than take on faith.`,
    },
    {
      type: 'text',
      md: md`
## One door left ajar: training on a quantized base

If inference tolerates 4-bit weights, a tempting thought follows: could you *fine-tune* on top of
them? Directly, no — training accumulates, and 16 ticks can't hold a nudge. But **QLoRA** threads
the needle with three moves you now recognize: freeze the base model at 4 bits (read-only —
inference rules apply), attach small *low-rank adapter* matrices in bf16 (lesson 1.2's LoRA
preview: the trainable part is thin), and let gradients flow through the frozen base into the
adapters, where accumulation happens at healthy precision. Result: fine-tuning a 65B model on a
single 48 GB GPU — an absurdity by 4.1's arithmetic, made routine. Module 5 picks this thread up
properly.

## What you now own

1. **Precision is about use, not numbers:** accumulation compounds rounding (training needs
   resolution); big dot products cancel it ($\sqrt d$ — the drunkard's walk's third cameo).
2. **The float budget:** sign + exponent (range) + mantissa (resolution); bf16 = fp32's range at
   half price, betting that 4.1's masters cover resolution — the bet that won training.
3. **The integer ruler:** scale $= \text{range}/(2^b{-}1)$, snap, dequantize — max error half a
   tick; you can run it by hand.
4. **The outlier problem** and its cures: per-group quarantine, fp16 exemption, activation-aware
   protection, sequential team compensation.
5. **The double payoff:** fewer bytes = fits at all (capacity) *and* runs faster (bandwidth) —
   4.1's and 3.4's walls, one trick.
6. **QLoRA:** frozen 4-bit reading + thin bf16 accumulation = big-model fine-tuning on small
   hardware.

Next lesson — already live if you peeked ahead: serving, where cache, bandwidth, batching, and
these bits all meet the invoice.
`,
    },
  ],
  questions: [
    {
      id: 'm4-l4-q1',
      kind: 'mcq',
      prompt: md`bf16 has *coarser resolution* than fp16 (7 mantissa bits vs 10), yet it became the
standard for training. Why is its trade the right one?`,
      options: [
        'bf16 arithmetic is faster than fp16 arithmetic on all hardware',
        'bf16 keeps fp32’s full exponent range, avoiding overflow/underflow disasters in wildly-scaled gradients — while the resolution it sacrifices is already protected by fp32 master weights',
        'bf16 numbers compress better in memory than fp16 numbers',
        'Resolution doesn’t matter anywhere in training',
      ],
      answer: 1,
      explain: md`The triage argument: range failure (overflow to inf, flush to zero) has *no*
downstream fix and kills runs; resolution failure (rounding) is already handled where it matters —
the fp32 masters where updates accumulate (4.1). So spend mantissa bits on exponent bits. Option D
overshoots: resolution matters intensely — in the *accumulator*, which is exactly why masters
exist; bf16's bet only works as part of that system.`,
    },
    {
      id: 'm4-l4-q2',
      kind: 'numeric',
      prompt: md`From the worked example (range $[-0.8, 0.9]$, scale $\approx 0.1133$): the weight
$-0.1$ snaps to integer tick $q = 6$. What is its **dequantized value** $\hat w = -0.8 + 6 \times 0.1133$,
to two decimals?`,
      answer: -0.12,
      tolerance: 0.02,
      explain: md`$-0.8 + 0.68 = -0.12$: stored as "tick 6," reconstructed $0.02$ away from the
true $-0.1$ — under half a tick, as guaranteed. Sixteen coarse ticks, small honest errors: the
whole scheme in one row of arithmetic.`,
    },
    {
      id: 'm4-l4-q3',
      kind: 'mcq',
      prompt: md`Why do frozen weights survive 4-bit quantization at inference when 16-bit
precision wasn't even enough for training?`,
      options: [
        'Inference uses smaller numbers than training does',
        'Modern GPUs correct quantization errors in hardware',
        'Training must accumulate tiny sequential updates that vanish below resolution and whose rounding bias compounds over a million steps; inference only reads weights into large dot products, where independent per-weight rounding errors partially cancel (√d growth)',
        'The important weights are stored at full precision during inference',
      ],
      answer: 2,
      explain: md`Accumulate vs read — the lesson's spine. Compounding systematic drift (linear in
steps) versus a one-time, unbiased wobble whose sum grows only as $\sqrt d$ and never compounds:
same numbers, opposite arithmetic destinies. Option D describes a real *garnish*
(mixed-precision outlier handling) but not the reason the main dish works — the well-behaved
99.9% of weights survive at 4 bits on the cancellation argument alone.`,
    },
    {
      id: 'm4-l4-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall — run the ruler yourself.** Quantize
$w = (-0.5,\; 0.0,\; 0.25,\; 1.0)$ to int4 on paper: compute the scale, the integer tick for each
weight, each dequantized value, and each error. State the maximum possible error for this scale
and check your worst actual error against it.`,
      rubric: md`**Scale:** range $= 1.0 - (-0.5) = 1.5$; $\;\text{scale} = 1.5/15 = 0.1$.

**Ticks** $q = \text{round}((w + 0.5)/0.1)$: $-0.5 \to 0$; $\;0.0 \to 5$; $\;0.25 \to
\text{round}(7.5) = 8$ (ties round to even, or accept 7 with its consequences); $\;1.0 \to 15$.

**Dequantized** $\hat w = -0.5 + 0.1q$: $-0.5$; $\;0.0$; $\;0.3$ (error $0.05$); $\;1.0$.

**Bound:** max error $= \text{scale}/2 = 0.05$ — and the worst actual error is exactly $0.05$
(the tie-break case sitting halfway between ticks).

Full credit = all four rows with arithmetic shown, the bound stated, and the check made. Bonus
insight worth noting: three of four weights landed *exactly* on ticks — round-number weights are
kind; real weight distributions aren't, which is why the error bound, not the lucky rows, is the
honest headline.`,
    },
    {
      id: 'm4-l4-q5',
      kind: 'numeric',
      prompt: md`What is bf16's resolution (spacing between adjacent representable numbers) near
$1.0$, given its 7 mantissa bits? Express as a decimal, three places.`,
      answer: 0.008,
      tolerance: 0.003,
      explain: md`$2^{-7} = 1/128 \approx 0.008$. Eight times coarser than fp16's $2^{-10} \approx
0.001$ — bf16 gave that up on purpose, spending the bits on fp32's exponent instead. Formats are
budgets; this number is what the range bet cost.`,
    },
    {
      id: 'm4-l4-q6',
      kind: 'mcq',
      prompt: md`A single outlier weight $100\times$ larger than its groupmates does what to naive
(one shared scale) quantization?`,
      options: [
        'Nothing — the outlier itself is stored with large error but other weights are unaffected',
        'It stretches the shared scale so tick spacing dwarfs the normal weights, collapsing them onto one or two indistinguishable levels — the many sacrificed for the one',
        'It causes integer overflow in the stored values',
        'It flips the signs of nearby weights during rounding',
      ],
      answer: 1,
      explain: md`The ruler serves everyone with one tick spacing $= \text{range}/15$; an outlier
inflates the range $\sim 100\times$, so normal weights fall inside a single tick and all snap
together (the ponder's worked disaster — a $0.2$ reconstructed as $-0.1$). Option A is *exactly
backwards* — that inversion is what makes it tempting: the outlier is the one weight stored
*well*; its victims are everyone else. Hence quarantine (per-group scales) and exemption (fp16
outliers).`,
    },
    {
      id: 'm4-l4-q7',
      kind: 'numeric',
      prompt: md`**Fermi:** Llama-3-405B at int4 (0.5 bytes/param): resident weight memory in
**gigabytes**? (Then privately check the table: how many 80 GB H100s is that?)`,
      answer: 203,
      tolerance: 25,
      explain: md`$405 \times 10^9 \times 0.5 = 2.03 \times 10^{11}$ bytes $\approx 203$ GB —
three H100s instead of eleven (fp16's 810 GB). Same weights, $4\times$ less hardware and, by
3.4's law, $4\times$ the decode ceiling per stream. One table row moves a procurement decision.`,
    },
    {
      id: 'm4-l4-q8',
      kind: 'written',
      prompt: md`**The outlier autopsy.** On paper, quantize $w = (-0.1,\; 0.05,\; 0.2,\; 12.0)$
to int4 with one shared scale: compute the scale, snap all four, dequantize, and report each
error. Then split into two groups — $(-0.1, 0.05, 0.2)$ and $(12.0)$ — with per-group scales, redo
the small group, and quantify the rescue (compare worst small-weight error, before vs after).`,
      rubric: md`**Shared scale:** range $12.1$, scale $\approx 0.807$. Ticks: $-0.1 \to 0$,
$0.05 \to 0$, $0.2 \to 0$, $12.0 \to 15$. Dequantized: $-0.1, -0.1, -0.1, 12.0$. Errors: $0$,
$0.15$ ($300\%$!), $0.3$ (sign lost), $0$. The three small weights are indistinguishable.

**Per-group:** small group range $= 0.3$, scale $= 0.3/15 = 0.02$: $-0.1 \to 0 \to -0.1$;
$0.05 \to \text{round}(7.5) = 8 \to 0.06$ (error $0.01$); $0.2 \to 15 \to 0.2$. Outlier group:
$12.0$ stored exactly (trivially).

**The rescue quantified:** worst small-weight error falls from $0.3$ to $\approx 0.01$ — a
$30\times$ improvement, bought with one extra stored scale. Full credit = both passes with
arithmetic, errors reported per weight, and the before/after comparison stated numerically.`,
    },
    {
      id: 'm4-l4-q9',
      kind: 'mcq',
      prompt: md`GPTQ quantizes a weight matrix *sequentially*, adjusting not-yet-quantized weights
after each rounding. What principle is it exploiting?`,
      options: [
        'Later weights are less important than earlier ones, so their errors matter less',
        'A weight matrix acts as a team — its output is a joint product (1.2) — so remaining weights can shift to absorb the error a rounded teammate introduced, keeping the layer’s function nearly intact',
        'Sequential processing uses less GPU memory than parallel processing',
        'Rounding errors alternate in sign, canceling automatically if processed in order',
      ],
      answer: 1,
      explain: md`What must be preserved is the layer's *function* (its outputs on real data), not
each weight's individual value — so let the team compensate: after rounding weight $i$, nudge its
unquantized colleagues to cancel the induced output error. Option D describes luck; GPTQ
*engineers* the cancellation. Option C is true-ish but incidental — the sequencing exists for
error feedback, not memory.`,
    },
    {
      id: 'm4-l4-q10',
      kind: 'numeric',
      prompt: md`By lesson 3.4's law, moving a model's weights from fp16 to int4 multiplies its
single-stream decode ceiling by what factor?`,
      answer: 4,
      tolerance: 0.3,
      explain: md`Tokens/sec $\le$ bandwidth ÷ bytes streamed; bytes fall $2 \to 0.5$ per
parameter, so the ceiling rises $4\times$. The rare trick that pays both walls: the same $4\times$
also applies to *fitting* (capacity). Bandwidth is why your laptop's 4-bit 7B feels fast, not just
possible.`,
    },
    {
      id: 'm4-l4-q11',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** Paint-by-numbers: a picture can be repainted with
just 16 numbered paints and still look right from across the room. Explain: why 16 paints are
enough for a *finished* painting you only look at, why they are NOT enough for a painting you keep
*retouching* a thousand times (what happens to each tiny retouch?), and what goes wrong when the
picture has one blindingly bright spot and all 16 paints must stretch to cover it (and the fix!).
No jargon without kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **Looking vs retouching** — viewing blends thousands of paint patches so small color errors
   average away (stand back and it looks right); retouching means each tiny adjustment must be
   *representable in the paint set* — a nudge smaller than the gap between paint #7 and #8 simply
   doesn't happen, and a thousand vanished nudges is a painting that never improved. This is the
   heart: the same paints fail or succeed depending on the *activity*.
2. **The bright spot** — one blazing highlight forces the 16 paints to spread from darkest to
   blindingly bright, leaving huge gaps between paints in the normal range; the ordinary parts of
   the picture all get slopped with the same 2–3 paints. **Fix:** paint the picture in patches,
   each patch getting its own 16 paints mixed for *its* range (per-group scales) — or hand-mix
   exact paint just for the highlight (keep outliers in high precision).
3. **Jargon audit:** "quantization," "mantissa," "resolution," "outlier channel" unexplained =
   partial, regardless of correctness.`,
    },
    {
      id: 'm4-l4-q12',
      kind: 'written',
      prompt: md`**The bits memo.** For a 70B model, assign a precision to each of the following
and justify each choice from this lesson's principles (accumulate-vs-read, range-vs-resolution,
outliers, the two walls): (1) matmul compute during training; (2) optimizer states / master
weights; (3) released inference weights for laptop users; (4) the KV cache under memory pressure;
(5) the QLoRA setting — which parts frozen at which precision, which parts trained at which, and
why gradients may flow *through* 4-bit weights but must not *land* in them.`,
      rubric: md`**(1) bf16** — compute wants speed and *range* (gradient magnitudes vary wildly);
resolution is delegated to the masters. **(2) fp32** — this is where accumulation lives; nudges of
$10^{-4}$ must survive addition (4.1's vanishing-update argument verbatim). **(3) int4 with
per-group scales (+outlier handling)** — read-only weights, big-dot-product cancellation, and both
walls paid: 35 GB resident and $4\times$ the decode ceiling vs fp16. **(4) int8 (or int4) K/V** —
cache entries are read into attention's dot products like weights are; 3.3's bill halves or
quarters; noted quality cost is small at 8-bit. **(5) QLoRA:** base frozen int4 (read-only —
inference rules), adapters bf16-trained with fp32-style optimizer states (accumulation rules);
gradients flow *through* the frozen base as computed values (a read-like use) but updates *land*
only in the adapters, because landing means accumulating and 16 ticks cannot hold a nudge.

Full credit = all five with the principle named per choice, not just the format; (5) must
articulate the flow-through-vs-land-in distinction.`,
    },
  ],
}
