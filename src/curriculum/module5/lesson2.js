// Module 5, Lesson 2 — Scaling laws (anchor lesson, Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm5-l2',
  title: '5.2 Scaling laws — the curve labs bet billions on',
  subtitle:
    'Deep learning is famously alchemical — except for one thing. Loss falls along a curve so smooth and so predictable that laboratories commit nine-figure budgets to points on it that don\'t exist yet. This lesson is that curve: what it says, what it forced everyone to admit, and where it honestly runs out.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Almost nothing in deep learning is predictable. Change a learning rate and a run dies (1.6). One
bad data shard spikes a week of progress (5.3 will show you the dashboard). Whether a model can do
arithmetic seems to depend on the phase of the moon. And yet — plot the *pretraining loss* of
models spanning four orders of magnitude in size against their parameter count, on log-log axes,
and the points fall on a **straight line**. Not roughly. Eerily.

Sit with how strange that is. The messiest large-scale engineering process humans run produces,
in its single most important summary number, the kind of clean power law physicists get from
planetary orbits. Strange — and *monetizable*: if loss is a smooth function of parameters $N$,
tokens $D$, and compute $C$, then you can run cheap small experiments, fit the curve, and
**extrapolate** to a model a thousand times bigger before spending the hundred million dollars.
That is not a metaphor; it is the actual planning process of every frontier lab. This lesson
builds the curve, derives the famous correction that reshaped the industry (Chinchilla), and then
— because you are training to be a researcher, not a fan — walks the honest boundary where the
curve's authority ends.

## The law itself

The empirical form (Hoffmann et al.'s fit, constants rounded; flag: fitted constants vary by data
and tokenizer — the *shape* is the robust part):

$$L(N, D) \;=\; \underbrace{E}_{\approx 1.69} \;+\; \underbrace{\frac{A}{N^{\alpha}}}_{\alpha \approx 0.34} \;+\; \underbrace{\frac{B}{D^{\beta}}}_{\beta \approx 0.28}$$

Read it as three stories added together:

- $E$: the **floor** — loss that no model of any size will ever remove. Hold that thought for the
  final ponder; you already know what it is.
- $A/N^{\alpha}$: the **capacity term** — error from the model being too small, melting away as a
  power of parameter count.
- $B/D^{\beta}$: the **data term** — error from having seen too little text, melting as a power
  of token count.

Why do power laws draw *straight lines* on log-log axes? One line of algebra you should own:
subtract the floor and take logs — $\log(L - E) = \log A - \alpha \log N$. A power law *is* a
linear relationship between logarithms; the exponent $\alpha$ *is* the slope. That's why
researchers live on log-log plots: straightness certifies the law, slope measures it, and a
*bend* — a departure from straight — is how you'd first see the law failing.

Feel the exponents, because they are brutal: $\alpha \approx 0.34$ means doubling parameters
shrinks the capacity term by only $2^{0.34} \approx 1.27\times$. A 27% dent, for double the model.
Every decade of improvement costs roughly $10\times$ the resources — scaling works, and scaling is
merciless. Both facts at once.
`,
    },
    {
      type: 'ponder',
      question: md`Why *should* loss follow a power law at all? Before revealing: think about what
kind of process gives diminishing returns of exactly this shape — and be suspicious, because "the
data fits one" is not an explanation.`,
      answer: md`The honest answer first: **nobody fully knows**, and you should distrust anyone
who says otherwise. But the candidate intuitions are worth owning. (1) *A long tail of features:*
language contains patterns at every frequency — common grammar, rare idioms, one-in-a-billion
facts. If skills are learned roughly in order of usefulness-per-parameter, each new increment of
model buys rarer, less-impactful patterns: diminishing returns with no natural scale, which is
exactly what a power law is (a scale-free decay — zoom in anywhere and it looks the same).
(2) *Power laws in, power laws out:* word frequencies themselves follow Zipf's law (a power law);
several toy models show a learner consuming Zipf-distributed skills exhibits power-law loss.
(3) The deflationary option: many decaying curves *look* straight over 4–5 decades; the law is a
superb *interpolation* whose deep-theory status is genuinely open research. A researcher holds all
three: use the curve, respect the curve, don't mistake the curve for a theory.`,
    },
    {
      type: 'text',
      md: md`
## The correction that reshaped the industry: Chinchilla

Now the drama. The law has *two* knobs, $N$ and $D$, but you pay for them with *one* budget:
compute. The accounting identity (derived in one line: each token's forward+backward touches each
parameter with ~3 multiply-accumulates, i.e. ~6 FLOPs, since one multiply-add is 2 FLOPs: 2 FLOPs
forward, 4 backward, because 1.3 showed the backward pass costs about twice the forward):

$$C \approx 6\,N\,D \quad \text{FLOPs}$$

So the real question a lab faces is an *allocation* problem: given $C$, how do you split it —
big model trained briefly, or small model trained long? Substitute $D = C/6N$ into $L(N, D)$ and
minimize over $N$. You can feel the answer without calculus: the optimum is where the **marginal
loss reduction per FLOP is equal for both knobs** — if growing the model helped more than feeding
it, you'd shift budget until it didn't (the economist's equimarginal principle; question 4 makes
you run it properly). With the fitted exponents, the balance point lands at a memorable rule of
thumb:

$$D^* \approx 20 \times N^* \qquad \text{— about twenty tokens per parameter.}$$

The 2022 scandal was that the industry sat nowhere near this point. Kaplan et al.'s earlier fit
had suggested tilting budgets heavily toward $N$, and everyone obliged: GPT-3 was 175B parameters
trained on 300B tokens — **1.7 tokens per parameter**, a tenth of the balanced diet. The
Chinchilla paper made the point unanswerable by experiment: a 70B model fed 1.4T tokens (the
*same* compute as a 280B-scale competitor) beat it across the board. The industry's giants were,
in the only currency that matters, *undertrained* — enormous brains that had read almost nothing.
An entire generation of models was re-planned around this arithmetic. Play with it yourself below:
the valley floor of the surface *is* the twenty-to-one ridge.
`,
    },
    {
      type: 'viz',
      viz: 'scaling-surface',
      caption:
        'The Chinchilla-form loss surface over (params, tokens), with your compute budget draped on it as the coral curve — every point on that curve costs the same FLOPs; the ball marks the minimum. (Constants here are simplified to α = β so the ridge sits exactly at 20 tok/param; the paper\'s own parametric fit implies a somewhat larger, budget-drifting ratio than its empirical ~20 — a real replication wrinkle worth knowing exists.) Three experiments: (1) drag the budget slider and watch the optimal ball ride the valley diagonally — params and tokens in lockstep, ratio pinned at 20 in the readout; (2) at any budget, eyeball how much worse the curve\'s ends are than its middle — that height gap is what "undertrained giant" means, in nats; (3) toggle the 8B@15T marker: deliberately far off the valley — read the next section before judging it',
    },
    {
      type: 'example',
      title: 'the Chinchilla arithmetic, by hand',
      md: md`
**Check the paper's own numbers.** Compute for 70B params × 1.4T tokens:

$$C = 6 \times (7 \times 10^{10}) \times (1.4 \times 10^{12}) \approx 5.9 \times 10^{23} \text{ FLOPs}$$

Ratio: $1.4\text{T} / 70\text{B} = 20$ tokens per parameter. ✓ On the ridge.

**Now plan a bigger run.** Budget $C = 2 \times 10^{25}$ FLOPs (a frontier-scale allocation).
At the optimum, $D = 20N$, so $C = 6N \cdot 20N = 120\,N^2$:

$$N^* = \sqrt{C / 120} = \sqrt{1.67 \times 10^{23}} \approx 4.1 \times 10^{11} \;\; (\approx 410\text{B params}), \qquad D^* = 20 N^* \approx 8.2\text{T tokens}$$

Two lines of algebra, and you have just done — genuinely, not metaphorically — the first
back-of-envelope a frontier lab's planning meeting does. Note what the square root says: a
$100\times$ bigger budget buys only a $10\times$ bigger optimal model (the other $10\times$ goes
to data). The curve giveth, sublinearly.
`,
    },
    {
      type: 'example',
      title: 'why Llama-3-8B ignored the ridge on purpose',
      md: md`
Llama-3-8B: 8B parameters trained on ~15T tokens — **~1,875 tokens per parameter**, ninety times
past the Chinchilla ratio. Its training compute ($6 \times 8\text{e}9 \times 15\text{e}12 \approx
7.2 \times 10^{23}$ FLOPs) exceeds Chinchilla's own budget — spent on a model *one-ninth* the
size. Training-loss-per-FLOP, this is flagrantly suboptimal: the same compute at 20:1 would have
bought a ~77B model with visibly lower loss.

So why do it? Because **Chinchilla optimizes the wrong objective for a model you intend to
ship.** The ridge minimizes loss per *training* FLOP — a one-time cost. But lesson 3.4 priced the
recurring cost: every serving token streams the model's bytes, forever. An 8B serves ~9× cheaper
and faster than a 77B, on laptops instead of clusters (4.4, 4.6). Fold *inference* compute into
the objective — total FLOPs over the model's deployed lifetime — and the optimum shifts hard
toward small-and-overtrained: spend extra training compute *once* to compress capability into
fewer parameters you'll serve *a trillion times*. The scaling law isn't wrong; it answers the
question it was asked. Asking the right question is the researcher's half of the job — and
"train-compute-optimal" quietly became "lifetime-compute-optimal" across the industry without a
single equation changing.
`,
    },
    {
      type: 'ponder',
      question: md`"Emergence": benchmark scores (say, 3-digit arithmetic accuracy) sometimes sit
at zero across model scales, then leap upward at some size — looking nothing like the smooth loss
curve. But the loss curve those same models sit on IS smooth. Both plots are real data. How can
both be true — and what should a researcher check before declaring a "phase transition"?`,
      answer: md`The reconciliation lives in the gap between *loss* and *metric*. Exact-match
arithmetic scores 0 unless *every* digit-token is right: a model whose per-digit probability
climbs smoothly $0.5 \to 0.8 \to 0.95$ scores $\approx 6\% \to 33\% \to 77\%$ on 5-digit
exact-match — the smooth improvement is *hidden below the threshold*, then "erupts." A hard
metric applied to smoothly-improving log-probabilities manufactures a jump (this is the
"emergence is a mirage" argument — measure with a smooth metric like per-token log-likelihood and
many famous jumps flatten). **Before declaring a phase transition, check:** does the capability
look smooth in log-prob? Is the jump robust to metric choice and prompt format? — and honestly:
a few capabilities still look jumpy under every measurement tried, and whether *true* discontinuities
exist is live research. The habit to keep: *smooth loss is the fact; jumpy capabilities are a
claim requiring metric forensics.*`,
    },
    {
      type: 'ponder',
      question: md`The fitted floor is $E \approx 1.69$ nats per token. No parameters, no data, no
compute will ever push loss below it. You met this number's meaning in lesson 1.5 — what is it,
and what would it mean to actually reach it?`,
      answer: md`$E$ is the **entropy of the text itself** (1.5): human language is genuinely
uncertain — many continuations are legitimately possible — and cross-entropy cannot fall below
the true entropy (Gibbs' inequality; betting on the truth is unbeatable, but the truth *is* a
distribution, not a certainty). The capacity and data terms are the model's *removable* confusion;
$E$ is the world's own. Reaching it would mean a model whose predictive distribution *is* the true
distribution of human text — perfect calibration to reality's remaining dice. Two sharp
corollaries: (1) "loss 2.05" must always be read as "0.36 above the floor," not "2.05 above zero"
— the *reducible* loss is the progress meter; (2) as models close the gap, equal loss-drops
represent ever-larger capability gains — the last nats are the expensive, precious ones. (And the
number itself is a *fit*, not a measurement of English — tokenizer- and corpus-dependent; treat
1.69 as this setup's floor, not the universe's.)`,
    },
    {
      type: 'text',
      md: md`
## Where the curve's authority honestly ends

A researcher's relationship with scaling laws has three layers, and interviews probe all three:

**Layer 1 — use it.** Allocation arithmetic (you just did it), extrapolated loss targets,
"on-trend" monitoring during runs (5.3's dashboard uses the predicted curve as its baseline).

**Layer 2 — know its silences.** The law predicts *loss*, not *capabilities* (the emergence
ponder), not safety properties, not what post-training (5.4–5.5) will elicit. It says nothing
about *data quality* — 5.1 showed the same token count can carry wildly different value, and
data-mixture changes shift the fitted constants themselves. And it is fitted on the regime we've
explored; every extrapolation is a bet that no bend is coming.

**Layer 3 — watch its frontier.** Data is not infinite (5.1's arithmetic: the high-quality web is
within an order of magnitude of exhausted) — which pushes toward synthetic data, more epochs, and
inference-time compute (3.6's reasoning-token story became o1/R1-class models precisely as a *new
scaling axis*: spend FLOPs at answer-time instead of train-time — its own emerging scaling curve,
active research). When the training-data axis saturates, the curve doesn't die; the *game board*
grows new dimensions. Watching which axis the field scales next is watching where the next
billion-dollar bet lands.

## What you now own

1. **The law:** $L = E + A/N^{\alpha} + B/D^{\beta}$ — floor, capacity term, data term; power law
   ⇔ straight line on log-log, exponent ⇔ slope; measurable from two points.
2. **The budget identity** $C \approx 6ND$, and the allocation derivation → **~20 tokens per
   parameter** (equimarginal balance).
3. **The Chinchilla verdict:** the GPT-3 generation was undertrained (1.7 tok/param); same
   compute, rebalanced, beats bigger.
4. **The inference-aware amendment:** ship-forever economics justify over-training small models —
   Llama-3-8B's 1,875 tok/param is the *right* answer to a *different* question.
5. **The floor is entropy** (1.5, closed loop): progress is measured above $E$, and the reducible
   nats get precious.
6. **The honest edges:** loss ≠ capability (metric forensics before "emergence"), constants are
   corpus-dependent, extrapolation is a bet, and inference-time compute is the new scaling axis.

Next door in 5.1: what those $D$ tokens actually *are* — and in 5.3, what it's like to babysit
the run that walks down this curve for three months without dying.
`,
    },
  ],
  questions: [
    {
      id: 'm5-l2-q1',
      kind: 'mcq',
      prompt: md`What was the Chinchilla paper's central correction to prior scaling practice?`,
      options: [
        'Loss does not actually follow a power law at large scale',
        'For a fixed compute budget, parameters and tokens should grow roughly in lockstep (~20 tokens/param) — implying GPT-3-era models were dramatically undertrained for their size',
        'Data quality matters more than data quantity',
        'Models should always be as large as the hardware allows, trained on whatever data remains affordable',
      ],
      answer: 1,
      explain: md`Chinchilla re-fit the allocation: equal marginal returns land at $D \approx 20N$,
while GPT-3 sat at 1.7 tokens/param — a huge brain that had read comparatively nothing; the 70B-
beats-280B-scale experiment made it unanswerable. Option D is the *pre*-Chinchilla instinct the
paper demolished. Option C is true-and-important (5.1's lesson) but is not what Chinchilla
measured — its runs held data quality fixed and varied the split.`,
    },
    {
      id: 'm5-l2-q2',
      kind: 'numeric',
      prompt: md`Verify the paper's own budget: $C \approx 6ND$ for $N = 70$B and $D = 1.4$T. Give
$C$ as a multiple of $10^{23}$ FLOPs (one decimal).`,
      answer: 5.9,
      tolerance: 0.6,
      explain: md`$6 \times 7{\times}10^{10} \times 1.4{\times}10^{12} = 5.88 \times 10^{23}$.
The 6 is worth remembering forever: ~2 FLOPs/param forward, ~4 backward (1.3's costing) — the
constant that converts "model × data" into "dollars."`,
    },
    {
      id: 'm5-l2-q3',
      kind: 'mcq',
      prompt: md`Llama-3-8B was trained ~90× past its Chinchilla-optimal token count. This is best
understood as:`,
      options: [
        'A mistake that wasted most of its training compute',
        'Evidence that scaling laws stopped applying after 2022',
        'Optimizing a different objective: minimizing lifetime compute (training once + serving forever), which shifts the optimum toward small, heavily-overtrained models',
        'A data-availability accident — 15T tokens simply happened to exist',
      ],
      answer: 2,
      explain: md`Chinchilla minimizes loss per *training* FLOP; shipping adds a recurring term —
every served token streams the model's bytes (3.4), forever. Fold that in and compressing
capability into fewer parameters is worth flagrant training-side "waste." Option A reads the right
facts with the wrong objective; option B confuses "the question changed" with "the law broke" —
the law predicted the 8B's loss just fine, off-ridge as it was.`,
    },
    {
      id: 'm5-l2-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall — the allocation.** On paper: starting from
$L = E + A N^{-\alpha} + B D^{-\beta}$ and the budget $C = 6ND$: (1) substitute the constraint to
get $L$ as a function of $N$ alone (at fixed $C$); (2) state the optimality condition — either by
differentiating, or by the equimarginal argument (the marginal loss reduction per FLOP through
each knob must be equal at the optimum) — and show it implies the capacity and data terms shrink
in a fixed *ratio* at the optimum; (3) explain in one sentence why this makes $N^*$ and $D^*$ grow
as fixed powers of $C$, and check against the worked example's square-root behavior.`,
      rubric: md`**(1)** $D = C/(6N) \Rightarrow L(N) = E + A N^{-\alpha} + B (6N/C)^{\beta}$ —
the data term now *rises* with $N$ (bigger model = fewer tokens affordable): the tension is
explicit.

**(2)** Set $dL/dN = 0$: $-\alpha A N^{-\alpha - 1} + \beta B \frac{6^\beta N^{\beta-1}}{C^{\beta}} = 0$,
i.e. the marginal gain from capacity equals the marginal cost through starved data — the
equimarginal principle in symbols (a clear verbal equimarginal argument earns full marks in place
of the derivative). Rearranged, $\alpha \cdot A N^{-\alpha} = \beta \cdot B D^{-\beta}$: at the
optimum the two reducible-loss terms sit in the fixed ratio $\beta/\alpha$ — neither ever
dominates.

**(3)** A fixed ratio between $N^{-\alpha}$ and $D^{-\beta}$ under $D \propto C/N$ forces
$N^* \propto C^{\beta/(\alpha+\beta)}$ and $D^* \propto C^{\alpha/(\alpha+\beta)}$ — fixed powers
of the budget; with $\alpha \approx \beta$, both $\approx C^{0.5}$, matching the worked example's
$N^* = \sqrt{C/120}$.

Full credit: the substitution, a genuine optimality argument (not "because 20:1"), the fixed-ratio
observation, and the power-of-$C$ conclusion with the square-root check.`,
    },
    {
      id: 'm5-l2-q5',
      kind: 'numeric',
      prompt: md`Llama-3-8B's ratio: 15T tokens on 8B parameters — how many **tokens per
parameter**?`,
      answer: 1875,
      tolerance: 400,
      explain: md`$15{\times}10^{12} / 8{\times}10^{9} \approx 1{,}875$ — nearly two orders of
magnitude past the ~20 ridge. Now you can read any model release's (params, tokens) pair as a
*strategy statement*: near 20 = training-compute-optimal; way past = built to be served cheaply
forever.`,
    },
    {
      id: 'm5-l2-q6',
      kind: 'mcq',
      prompt: md`A benchmark shows zero performance across model scales, then a sudden leap at 30B
parameters ("emergence"). The *first* forensic check before declaring a phase transition:`,
      options: [
        'Re-run the benchmark several times to rule out random seed effects',
        'Check whether the underlying per-token log-probabilities improve smoothly across scale — a hard exact-match metric can manufacture a jump from smooth improvement',
        'Verify the 30B model was trained on the same data as the smaller ones',
        'Test whether the capability transfers to other languages',
      ],
      answer: 1,
      explain: md`The mirage mechanism: exact-match multiplies per-token success probabilities, so
smooth per-digit gains sit invisibly below threshold, then erupt — the metric, not the model, made
the cliff. Measure in log-prob first; many famous emergences flatten, *some don't* — and only the
survivors deserve the phase-transition headline. Options A and C are good hygiene but don't
address the specific artifact that generates most false emergences.`,
    },
    {
      id: 'm5-l2-q7',
      kind: 'numeric',
      prompt: md`With $\alpha = 0.34$: doubling a model's parameter count shrinks the capacity term
$A/N^{\alpha}$ by what factor? (Two decimals — and let the smallness of this number sink in.)`,
      answer: 1.27,
      tolerance: 0.05,
      explain: md`$2^{0.34} \approx 1.27$ — double the model, and the capacity error only drops
27%. Scaling *works* and scaling is *merciless*: each decade of loss improvement costs roughly a
decade of resources. This one number is why "just make it bigger" is simultaneously the industry's
strategy and its budget crisis.`,
    },
    {
      id: 'm5-l2-q8',
      kind: 'written',
      prompt: md`**The planning memo.** Your lab has $C = 2 \times 10^{24}$ FLOPs for a flagship
run. On paper: (1) the Chinchilla-optimal $N^*$ and $D^*$ (use $D = 20N$, $C = 120N^2$); (2) the
served-forever amendment — product says this model will handle massive traffic on mid-range GPUs:
argue the direction and rough shape of the deviation you'd recommend, with the 3.4/4.4 mechanism
named; (3) one honest risk of your deviation and what small-scale experiment de-risks it.`,
      rubric: md`**(1)** $N^* = \sqrt{2{\times}10^{24}/120} = \sqrt{1.67{\times}10^{22}} \approx
1.3 \times 10^{11}$ (~130B params), $D^* \approx 2.6$T tokens.

**(2)** Deviate *small-and-long*: e.g. a ~30–40B model at several hundred tokens/param (or MoE —
4.3 — as the orthogonal lever). Mechanism: serving cost scales with streamed bytes per token
(3.4), so halving parameters roughly halves per-token cost and doubles the tokens/sec ceiling;
quantization (4.4) compounds it; over-training spends *one-time* FLOPs to compress capability
into *forever-cheaper* form. Any coherent size with the streamed-bytes argument earns credit.

**(3)** Risks (any one, with its experiment): over-trained small models may saturate — run a
scaling ladder of small models at increasing tokens/param and check the loss curve for flattening
*before* committing; or data supply — 5.1-style audit that the token budget exists at acceptable
quality; or capability gaps vs the 130B (evals beyond loss — 5.6 — on the ladder models).

Full credit = correct arithmetic, a mechanism-named deviation (not just "smaller is cheaper"),
and a risk with a *concrete cheap experiment* — the memo's soul is that last habit.`,
    },
    {
      id: 'm5-l2-q9',
      kind: 'mcq',
      prompt: md`The constant $E \approx 1.69$ in the scaling law represents:`,
      options: [
        'The loss of a randomly-initialized model before any training',
        'A fitting artifact with no physical meaning',
        'The irreducible entropy of the text distribution itself — the uncertainty that remains when the model’s predictive distribution matches reality’s (1.5)',
        'The loss contribution of the tokenizer’s encoding overhead',
      ],
      answer: 2,
      explain: md`Cross-entropy ≥ entropy, always (Gibbs, 1.5): language is genuinely uncertain,
and $E$ is that residual dice-roll — the world's confusion, not the model's. Option A is off by an
order of magnitude (random init gives $\ln 128000 \approx 11.8$ nats on a 128k vocab). The
practical habit: read every loss as its distance *above the floor* — that's the number that
measures the model.`,
    },
    {
      id: 'm5-l2-q10',
      kind: 'numeric',
      prompt: md`**Fermi — plan a frontier run:** budget $C = 2 \times 10^{25}$ FLOPs,
Chinchilla-optimal split ($C = 120 N^2$). Optimal parameter count $N^*$, in **billions**?`,
      answer: 410,
      tolerance: 150,
      explain: md`$N^* = \sqrt{2{\times}10^{25}/120} \approx 4.1 \times 10^{11} = 410$B (with
$D^* \approx 8.2$T tokens). Note the square root doing its quiet work: this budget is $34\times$
Chinchilla's, but the optimal model is only $\sim 6\times$ bigger — the other factor went to
data, exactly as the fixed-power law demands.`,
    },
    {
      id: 'm5-l2-q11',
      kind: 'written',
      prompt: md`**Derive, don't recall — reading the slope.** (1) Show algebraically why a power
law $L - E = A N^{-\alpha}$ is a straight line on log-log axes, and what its slope is. (2) Two
models on your scaling ladder: 1B params → reducible loss $0.60$ nats; 10B params → $0.28$ nats.
Estimate $\alpha$ from these two points ($\log_{10}$ arithmetic — note $\log_{10}(0.60/0.28)
\approx 0.33$). (3) One sentence: what would a *bend* in this line at larger $N$ tell you, and
name one honest reason a bend might appear that is NOT "scaling stopped working."`,
      rubric: md`**(1)** $\log(L - E) = \log A - \alpha \log N$: linear in $\log N$ with slope
$-\alpha$. (Must subtract the floor first — plotting raw $L$ bends the line as $L \to E$; catching
that is part of the point.)

**(2)** $\alpha = \dfrac{\log(0.60/0.28)}{\log(10^{10}/10^{9})} = \dfrac{0.33}{1} \approx 0.33$ —
one decade of $N$, read straight off. (Slope from two points; matches the fitted $\approx 0.34$.)

**(3)** A bend = the fitted regime ending — extrapolations beyond it are void. Honest non-doom
causes: the *data* term starting to dominate (undertrained at the ladder's top — fix the ratio,
not the law), data quality shifting across the ladder (5.1: constants are mixture-dependent), or
a mis-estimated floor $E$ bending the plot artificially. Distinguishing "law broke" from "I
plotted it wrong" is the actual skill being graded.`,
    },
    {
      id: 'm5-l2-q12',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "How do the AI companies know a robot
brain 100 times bigger will be smarter, before building it? Isn't that just guessing?" Explain:
the surprising straight line (use a kid-scale analogy — heights and growth charts, or how far
headlights reach in fog), how you use small cheap experiments to draw the line and read off where
the big expensive point will land, the twin-ingredients rule (brain size AND books read, in
balance — what happens with a giant brain and three books?), and ONE honest way the prediction
could still fail. No jargon without kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **The line** — train tiny, small, and medium brains, plot their "confusion score" against
   size on the special graph where each step means "ten times more," and the dots line up like a
   growth chart; ruler-extend the line to where the giant brain will land. It's not a guess — it's
   the same trick as predicting a kid's adult height from the chart, and it has worked again and
   again.
2. **The balance rule** — smarts need brain size AND books read, in step; a giant brain with three
   books is a huge library with empty shelves (and the companies once really built those — huge
   brains, too few books — until someone checked the recipe).
3. **The honest failure** (any one, kid-sized): the line might bend past where we've measured
   (fog past the headlights); or we might run out of good books; or the score we predict (word-
   guessing) might not measure the smartness we care about — the line predicts the score, not
   every skill.
4. **Jargon audit:** "loss," "FLOPs," "parameters," "log-log," "Chinchilla" unexplained = partial.`,
    },
  ],
}
