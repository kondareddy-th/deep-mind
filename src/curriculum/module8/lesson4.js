// Module 8, Lesson 4 — Distillation (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm8-l4',
  title: '8.4 Distillation — one model discovers, many inherit',
  subtitle:
    'An 8B model today beats a 70B model from two years ago. Some of that is better data and longer training. A large part is a transfer mechanism: capability is discovered once, expensively, and then copied — and understanding why copying works explains much of the current model landscape.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Line up the open models of the last few years by size and date and something odd appears: today's
8B models beat two-year-old 70B models on reasoning, on code, on instruction-following. Some of that
is honest scaling-law progress — more tokens, better data (5.1, 5.2). But a large share comes from
somewhere else, and lesson 8.3 handed you the clue when it reported that **distilling a large
reasoning model into small dense models beat running the same reinforcement learning on those small
models directly.**

Two questions worth taking seriously:

1. Why should *copying* a capability work at all? The student has a fraction of the teacher's
   parameters. If capability lived in raw capacity, the copy should fail.
2. Why would copying ever beat *learning it yourself*? Surely direct optimisation on the task is the
   more fundamental route.

The answers turn out to be the same shape, and they explain a great deal about which models get
built and shipped today.

## The lie in your training data

Start with something you already know intimately and have possibly never questioned. Standard
training uses **one-hot targets** (1.5): for each position, exactly one token is correct, and the
target vector says so with a 1 and a great many 0s.

Look at what that target actually claims about the world. Given the context *"the cat sat on the
___"*, the target says *mat* is correct — and that *floor*, *rug*, *carpet*, and *carburetor* are
all wrong. Equally wrong. The target draws no distinction whatsoever between a near-miss and an
absurdity.

That is a **lie about the structure of language**, and it is a lie the model must overcome using
sheer volume of data. Now consider what a well-trained teacher model outputs for that same context:

$$p(\text{mat}) = 0.41, \quad p(\text{floor}) = 0.18, \quad p(\text{rug}) = 0.11, \quad p(\text{carpet}) = 0.06, \quad \dots, \quad p(\text{carburetor}) = 10^{-9}$$

Everything the one-hot target erased is right there. The teacher's distribution over the *wrong*
answers encodes its entire learned sense of what is *similar to what* — lesson 1.1's geometry of
meaning, made explicit and handed over. This is the classic **"dark knowledge"** argument, and it is
worth stating precisely: the value is not in the teacher's top prediction (the training data already
told you that), it is in the **relative probabilities of everything else**.

So: train the student to match the teacher's distribution rather than the one-hot target.

$$\mathcal{L} = D_{KL}\!\left(p_{\text{teacher}} \,\|\, p_{\text{student}}\right) \quad\text{(1.5's KL divergence)}$$

usually with a **temperature** (1.4) applied to soften both distributions before comparing, because
at low temperature the teacher's distribution collapses toward one-hot and you have thrown away
precisely the tail structure you came for.
`,
    },
    {
      type: 'ponder',
      question: md`Be careful with a claim that gets repeated sloppily. People often say soft targets
help because "the gradient touches every vocabulary entry instead of just one." Check that against
what you know from 1.4: with softmax and cross-entropy, the gradient with respect to the logits is
$\mathbf{p} - \mathbf{y}$. Is the popular claim actually true — and if not, what *is* the real
difference between a one-hot target and a soft one?`,
      answer: md`**The popular claim is false, and pleasingly so.** With one-hot targets the gradient
on the logits is $\mathbf{p} - \mathbf{y}$, which is nonzero for *every* vocabulary entry: the
correct token gets pushed up, and all 128,000 others get pushed down in proportion to their current
probability. The gradient was never sparse.

**The real difference is in the target's *content*, not the gradient's support.** Under a one-hot
target, every incorrect token is pushed down *in proportion to how probable the student currently
finds it* — a rule that knows nothing about the world. *floor* and *carburetor* are treated as
equally wrong, so the more plausible a good alternative looks, the harder it gets suppressed.

Under a soft target, the update instead pushes the student's distribution *toward the teacher's
shape*: down where the student overestimates, and **up** where the student underestimates a
plausible alternative. The student is being taught the similarity structure, not just the answer.

Two consequences worth carrying: (1) the information in the target rises from "which index"
(about $\log_2 128000 \approx 17$ bits) to a full distribution over the vocabulary — which is why
distillation is often dramatically more *sample-efficient* than training on the same text; (2) this
is also why **temperature matters** — as $T \to 0$ the teacher's soft target collapses back to
one-hot and the whole advantage evaporates. And it is a small lesson in reading claims carefully:
the popular version is memorable, wrong in its mechanism, and right in its conclusion.`,
    },
    {
      type: 'text',
      md: md`
## The family, ordered by what each requires

**Response distillation** — generate outputs from the teacher, fine-tune the student on them as
ordinary supervised fine-tuning (5.4). This is what most people now mean by "distillation," and it
needs nothing but API access to the teacher. It transmits *behaviour*: formats, tone, reasoning
style, tool syntax. It does **not** transmit the distribution's fine structure, because you only
ever see sampled text, not probabilities.

**Logit / soft-target distillation** — match the teacher's output distribution directly. Transmits
the dark knowledge above, but requires access to the teacher's probabilities, so in practice: open
weights, or your own model.

**Feature / hidden-state matching** — align the student's intermediate representations with the
teacher's. Transmits more, requires architectural compatibility, and is considerably fiddlier;
useful when student and teacher are related in shape.

**On-policy distillation** — the student generates, and the teacher scores or corrects **the
student's own outputs**. This one deserves its own section, because it fixes something the others
cannot.

## Why on-policy matters: the student does not live where the teacher lives

Here is the deepest idea in the lesson, and it is a failure mode you can derive.

Off-policy distillation trains the student on the *teacher's* trajectories. But at inference the
student is autoregressive (2.6): it conditions on **its own** previously generated tokens. The
moment it produces something slightly different from what the teacher would have produced, it is
standing in a context the teacher never demonstrated and the student never trained on.

Now apply lesson 6.4's compounding arithmetic. Suppose the student stays on the teacher's manifold
with probability 0.99 at each token. Over a 300-token response:

$$0.99^{300} \approx 0.049$$

About a 5% chance of getting through a response without drifting into unrehearsed territory — and
once there, its outputs are unsupervised, which makes further drift *more* likely. This is the
classic **exposure bias** problem of sequence models, and it explains a very familiar phenomenon:
distilled models that look excellent for a sentence and wander over a page.

**On-policy distillation** repairs exactly this: let the student generate, then have the teacher
grade or correct *those* outputs. Now the training distribution is the student's own distribution —
you are teaching it where it actually lives, including in the drifted regions. Flag honestly: this
is an active area, more expensive per step (you must sample from the student and query the teacher
in the loop), and the practical variants are still being worked out — but the *reason* it helps is
solid and follows from the arithmetic above.

## What transfers, and what doesn't

Flagged as empirical, and worth knowing precisely because it sets expectations:

- **Transfers well:** task-specific behaviour, formatting, tone, tool-call syntax, and — the
  striking one — **reasoning traces**. A small model can learn to *produce the shape of good
  reasoning* far more easily than it can learn to discover that shape.
- **Transfers poorly:** broad world knowledge and rare facts. The student simply lacks the capacity
  to hold them (5.2's capacity term is not negotiable by teaching method), which is why distilled
  small models often reason respectably and then confidently misstate a date.
- **The ceiling:** in general the student is bounded by the teacher on the teacher's own
  distribution — imitation cannot exceed its source (5.5's argument). But note three honest
  exceptions: a student **specialised** to a narrow task can beat a generalist teacher *on that
  task*; distillation from **several** teachers can exceed any one of them; and distillation
  followed by **RL** can exceed the teacher, because now the capability is sampleable and RL has
  something to reinforce. That last one is not a footnote — it is exactly the recipe R1 uses.
`,
    },
    {
      type: 'example',
      title: 'the R1 finding, and the economics behind it',
      md: md`
Lesson 8.3 reported that distilling a large reasoning model into small dense models **beat running
the same RL on those small models**. The mechanism, now that you have both halves:

**Why RL failed on the small model.** RL reinforces what the policy already samples (5.5). If a
small base model essentially never produces a correct long chain of thought — even over thousands of
samples — then nearly every rollout scores zero, there is nothing to push up, and you are paying for
an expensive random search in a space where success is vanishingly rare.

**Why distillation succeeded.** The teacher *hands over* completed reasoning traces. No exploration
required — the exploration was already done, once, by a model big enough to do it. The student
learns by ordinary supervised imitation (5.4), which needs no lucky samples at all.

**The economics this creates.** Discovery is expensive and happens once; copying is cheap and happens
many times. Price the second half with 3.4's law — a 70B teacher at bf16 streams about 140 GB per
token-pass, while an 8B student at int4 streams about 4 GB:

$$\frac{140}{4} = 35\times \text{ more throughput per unit of memory bandwidth}$$

So the same capability, once transferred, serves at roughly an order of magnitude less cost per
token. That asymmetry — *discover once at frontier cost, deploy a thousand times at commodity cost*
— is reorganising the entire open-model ecosystem, and it is why strong small models now appear
within months of each frontier release rather than years.
`,
    },
    {
      type: 'ponder',
      question: md`Speculative decoding (3.4) uses a small "draft" model to propose tokens that the
big model verifies in parallel. Where did that draft model come from — and what does its
**acceptance rate** actually measure? Then compute: with an acceptance rate of $\alpha = 0.8$ and
$k = 4$ drafted tokens per round, how many tokens do you get per expensive verification pass?`,
      answer: md`**The draft model is a distilled model** — usually a small model trained
specifically to imitate the big one's distribution. Speculative decoding is therefore *distillation
deployed at inference time*, and the two topics are one mechanism wearing two hats.

**The acceptance rate is a direct measurement of distillation quality.** It is the fraction of
drafted tokens the big model ratifies — i.e. how often the student's prediction matches what the
teacher would have chosen. A better-distilled draft model has a higher acceptance rate, which
translates immediately into speed. It is rare and pleasant to have a *deployment metric* that is
also a clean scientific measure of how well a training procedure worked.

**The arithmetic:** with acceptance probability $\alpha$ per token and $k$ drafted tokens, the
expected number accepted per round is $\frac{1 - \alpha^{k+1}}{1 - \alpha}$. At $\alpha = 0.8$,
$k = 4$:

$$\frac{1 - 0.8^{5}}{1 - 0.8} = \frac{1 - 0.328}{0.2} \approx 3.4 \text{ tokens per verification pass}$$

So roughly a 3.4× reduction in expensive forward passes — with the output distribution *exactly*
preserved by the acceptance rule (3.4). Note the sensitivity: at $\alpha = 0.5$ the same formula
gives about 1.9, so distillation quality translates non-linearly into money.`,
    },
    {
      type: 'ponder',
      question: md`Step back and think strategically, the way lesson 8.5 will ask you to. If a
frontier capability can be copied into a model an order of magnitude smaller within months, what
exactly is a frontier lab's *moat*? And what does your answer predict about how such labs actually
behave — in their API terms, their release timing, and what they publish?`,
      answer: md`**What the moat is not:** the capability itself. Once a behaviour is demonstrated
and its outputs are observable, it is substantially copyable — that is the whole lesson.

**What the moat plausibly is:** (1) **discovery speed** — being the lab that finds the next thing
first, repeatedly, which is a research-culture asset rather than an artifact; (2) **the inputs to
discovery** — proprietary data, compute at a scale others cannot rent, and the accumulated
engineering of 8.3's kind; (3) **access control** — you cannot distil what you cannot query cheaply
or at all; and (4) **the surrounding system** — serving infrastructure, tools, integrations, and
trust, none of which live in the weights.

**The predictions, and they hold up:** API terms of service that explicitly forbid using outputs to
train competing models (the access-control moat, legally enforced); rate limits and pricing that
make mass distillation expensive; a lag between internal capability and public release; and a
pronounced reluctance to publish the *methods* while publishing the *results* — the reverse of the
field's earlier norm, and a direct consequence of methods being the durable asset while
demonstrations are not.

**The honest complication:** some labs release open weights anyway, deliberately dissolving their
own moat — for ecosystem influence, talent attraction, safety-through-scrutiny arguments, or
commoditising a competitor's advantage. Which tells you the moat calculation is strategic rather
than technical, and that "why did they open-source that?" is usually a business question wearing a
technical costume.`,
    },
    {
      type: 'text',
      md: md`
## Model merging, briefly and honestly

A neighbouring idea that belongs here because it shares the "capability as a transferable object"
intuition. You can take two fine-tuned models and **average their weights**; or compute a
fine-tuning delta $\theta_{\text{tuned}} - \theta_{\text{base}}$ and *add* it to a different model
(task arithmetic); or resolve conflicts between several such deltas before merging (TIES-style
methods). This connects directly to 7.2's mergeable LoRA deltas — an adapter *is* a portable
behaviour object.

It works surprisingly well and surprisingly often. It is also poorly understood theoretically —
why weight-space averaging of independently fine-tuned models should produce a coherent model at all
is not settled, and results are uneven across model families and task pairs. Treat it as a cheap
thing to *try* with an honest eval (7.6), not a technique with a reliable theory behind it. Practice
running ahead of explanation is itself a research opportunity (8.5's generators).

## The legal and ethical reality

State it plainly, because practitioners must know it: distilling from a commercial API generally
**violates its terms of service**. Providers prohibit using outputs to train competing models, and
this is enforced. Distilling from open-weight models with permissive licences is normal practice;
distilling from an API you agreed not to distil from is not a grey area, whatever the discourse
suggests. Know which one you are doing.

## What you now own

1. **Why one-hot targets are a lie** — they call every wrong answer equally wrong, erasing the
   similarity structure a teacher's distribution makes explicit ("dark knowledge").
2. **The careful version of the sample-efficiency claim** — the gradient was never sparse; the
   *target's information content* is what changes, and temperature controls how much of it survives.
3. **The family**, ordered by access required: response (API only) → logits (open weights) →
   features (compatible architectures) → on-policy (student generates, teacher corrects).
4. **The exposure-shift argument:** off-policy students are trained where the *teacher* lives, then
   deployed where *they* live, and errors compound ($0.99^{300} \approx 5\%$) — which is what
   on-policy distillation exists to fix.
5. **What transfers** (behaviour, format, reasoning traces) **and what doesn't** (breadth, rare
   facts — a capacity limit no teaching method repeals), plus the three honest ways a student can
   exceed its teacher.
6. **The economics:** discover once at frontier cost, deploy at roughly 35× lower serving cost —
   and speculative decoding as the same idea applied at inference, with acceptance rate as a
   distillation-quality meter.

Next lesson: the tricks in this module were all invented by someone. Where do new ones come from —
and can you generate them on purpose?
`,
    },
  ],
  questions: [
    {
      id: 'm8-l4-q1',
      kind: 'mcq',
      prompt: md`What information does a teacher model's full output distribution carry that a
one-hot training target does not?`,
      options: [
        'The correct next token, which one-hot targets omit',
        'The relative plausibility of all the *incorrect* tokens — the teacher’s learned sense of what is similar to what',
        'A lower-variance estimate of the same one-hot signal',
        'The teacher’s internal activations, compressed into probabilities',
      ],
      answer: 1,
      explain: md`The training text already told you the correct token — that part is free. The
teacher's added value is in the tail: that *floor* and *rug* are reasonable continuations while
*carburetor* is absurd, which is lesson 1.1's similarity geometry made explicit. Option C is the
subtle distractor and worth rejecting precisely: soft targets are not a *cleaner version of the same
signal*, they are a *different and richer signal*, which is why the mechanism is about the target's
information content rather than its noise.`,
    },
    {
      id: 'm8-l4-q2',
      kind: 'numeric',
      prompt: md`A student stays on the teacher's distribution with probability $0.99$ at each
token. Over a 300-token response, what is the probability it never drifts? Give a **percentage** to
one decimal.`,
      answer: 4.9,
      tolerance: 1.5,
      explain: md`$0.99^{300} \approx 0.049 = 4.9\%$. Ninety-nine percent per token sounds excellent
and is catastrophic over a page — 6.4's compounding arithmetic, now explaining why off-policy
distilled models look brilliant for a sentence and wander over a paragraph. Once the student is off
the teacher's manifold it is in territory neither of them trained on, so drift accelerates. This
single number is the entire argument for on-policy distillation.`,
    },
    {
      id: 'm8-l4-q3',
      kind: 'mcq',
      prompt: md`Why did distilling a large reasoning model into a small one beat running the same
reinforcement learning directly on that small model?`,
      options: [
        'Distillation uses more compute, so it explores the space more thoroughly',
        'RL can only reinforce behaviours the policy already samples — and a small base model almost never samples a correct long chain of thought, so nearly every rollout scores zero and there is nothing to push up',
        'Reinforcement learning does not work on models below a certain parameter count',
        'The distilled student inherits the teacher’s parameters directly, so it starts from a better initialisation',
      ],
      answer: 1,
      explain: md`RL redistributes probability mass; it cannot create it. With near-zero success
rate the procedure degenerates into expensive random search, while distillation simply hands over
completed traces and requires no exploration. Option D is a factual error worth catching — the
student does *not* inherit weights, only behaviour, learned through ordinary supervised training.
Option C overgeneralises into a false law: RL works fine on small models once the capability is
*seeded*, which is exactly why the real recipe is distil-then-RL.`,
    },
    {
      id: 'm8-l4-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** A colleague says: "Soft targets help because the gradient
reaches every vocabulary entry instead of just the correct one." On paper: (1) write the gradient of
the cross-entropy loss with respect to the logits for a one-hot target and show why the claim's
stated mechanism is wrong; (2) state what *actually* differs between one-hot and soft targets, in
terms of the direction each update pushes a plausible-but-incorrect token; (3) explain why
temperature is essential to the technique; (4) say why the colleague's conclusion is nevertheless
correct.`,
      rubric: md`**(1)** For softmax outputs $\mathbf{p}$ and target $\mathbf{y}$, the gradient with
respect to the logits is $\mathbf{p} - \mathbf{y}$. With a one-hot $\mathbf{y}$, every non-target
component equals $p_i \ne 0$ — so the gradient is nonzero for *all* vocabulary entries. The claim's
mechanism ("reaches only one entry") is simply false; the gradient was never sparse.

**(2)** The difference is in the *target's content* and therefore the direction of the update: under
one-hot, every incorrect token is pushed **down**, in proportion to its current probability — so a
plausible alternative like *floor* is suppressed harder than an absurd one like *carburetor*. Under a
soft target, the student is pushed toward the teacher's shape: down where it overestimates and **up**
where it underestimates a plausible alternative. Structure is taught, not just the answer.

**(3) Temperature:** as $T \to 0$ the teacher's distribution collapses toward one-hot and the tail
structure — the entire payload — disappears. Softening exposes the relative probabilities of the
non-top tokens, which is what distillation is transmitting.

**(4) Why the conclusion still holds:** the target now carries a full distribution rather than a
single index (roughly 17 bits for the index versus a whole distribution's worth of structure), so
each example teaches far more, and distillation is correspondingly more sample-efficient.

Full credit requires explicitly refuting the stated mechanism in (1) while endorsing the conclusion
in (4) — the skill being tested is separating a right answer from a wrong reason, which 6.5 trained
you for.`,
    },
    {
      id: 'm8-l4-q5',
      kind: 'numeric',
      prompt: md`Compute the KL divergence $D_{KL}(p \| q)$ in **nats** for teacher
$p = (0.7,\, 0.2,\, 0.1)$ and student $q = (0.5,\, 0.3,\, 0.2)$. (Use $\ln 1.4 \approx 0.3365$,
$\ln 0.667 \approx -0.4055$, $\ln 0.5 \approx -0.6931$.)`,
      answer: 0.085,
      tolerance: 0.02,
      explain: md`$0.7(0.3365) + 0.2(-0.4055) + 0.1(-0.6931) = 0.2356 - 0.0811 - 0.0693 \approx
0.085$ nats. Small, because the student is already roughly right in shape — and that is precisely
what a distillation loss measures: not "is the top token correct" but "is the whole *shape* of the
belief correct." Note the asymmetry (1.5): $D_{KL}(p\|q)$ punishes the student most for putting too
*little* mass where the teacher puts a lot, which is the direction you want when teaching.`,
    },
    {
      id: 'm8-l4-q6',
      kind: 'mcq',
      prompt: md`What does on-policy distillation change relative to standard (off-policy)
distillation?`,
      options: [
        'It trains the student on its own generated outputs, graded or corrected by the teacher — so the training distribution matches the distribution the student actually produces at inference',
        'It updates the teacher as well as the student, so both improve together',
        'It uses reinforcement learning instead of supervised learning, removing the need for a teacher',
        'It distils from many teachers at once rather than one',
      ],
      answer: 0,
      explain: md`The fix targets exposure shift: off-policy training happens on the teacher's
trajectories, but deployment happens on the student's own, and the two diverge with compounding
consequences ($0.99^{300} \approx 5\%$). Training where the student actually lives closes that gap.
Option C confuses the mechanism — on-policy distillation still needs the teacher, as the source of
correction; what makes it "on-policy" is *whose outputs* are being trained on, not the choice of
learning paradigm.`,
    },
    {
      id: 'm8-l4-q7',
      kind: 'numeric',
      prompt: md`Speculative decoding with acceptance rate $\alpha = 0.8$ and $k = 4$ drafted tokens
per round. Using the expected accepted tokens per round $\frac{1-\alpha^{k+1}}{1-\alpha}$, how many
tokens do you get per expensive verification pass? (One decimal.)`,
      answer: 3.4,
      tolerance: 0.4,
      explain: md`$\frac{1 - 0.8^{5}}{1 - 0.8} = \frac{1 - 0.328}{0.2} \approx 3.4$ tokens per big-
model pass — roughly a 3.4× reduction in expensive forward passes, with the output distribution
exactly preserved. And note the leverage: at $\alpha = 0.5$ the same formula gives about 1.9, so a
better-distilled draft model converts directly into money. The acceptance rate is a serving metric
that doubles as a clean measure of distillation quality.`,
    },
    {
      id: 'm8-l4-q8',
      kind: 'numeric',
      prompt: md`**Fermi.** A 70B teacher at bf16 streams about 140 GB per token-pass; an 8B student
quantized to int4 streams about 4 GB. By lesson 3.4's law, roughly what throughput advantage does
the student have per unit of memory bandwidth?`,
      answer: 35,
      tolerance: 10,
      explain: md`$140/4 = 35\times$. Since single-stream decode speed scales inversely with bytes
streamed (3.4), the distilled student serves roughly 35× more tokens per second on the same hardware
— and correspondingly cheaper per token (4.5). This is the number behind the whole strategy:
discovery happens once at frontier cost, deployment happens perpetually at commodity cost, and the
gap between those two economics is what the small-model ecosystem is built on.`,
    },
    {
      id: 'm8-l4-q9',
      kind: 'mcq',
      prompt: md`Which capability transfers *least* well from a large teacher to a small student?`,
      options: [
        'Output formatting and tool-call syntax',
        'Broad world knowledge and rare facts',
        'Reasoning style and chain-of-thought structure',
        'Tone and persona',
      ],
      answer: 1,
      explain: md`Knowledge needs *capacity* — 5.2's capacity term $A/N^{\alpha}$ does not care how
good your teacher is, and a small model cannot hold what it has no room for. Behaviour, format, tone,
and even reasoning *shape* transfer remarkably well, because those are patterns rather than stored
content. This is why distilled small models often reason capably and then state a wrong date with
total confidence — and why the right fix for that is retrieval (7.1's Type 1), not a better teacher.`,
    },
    {
      id: 'm8-l4-q10',
      kind: 'written',
      prompt: md`**Can a student beat its teacher?** Lesson 5.5 argued that imitation is bounded by
what it imitates. On paper: (1) state the general argument for why a distilled student cannot exceed
its teacher; (2) give **three** specific circumstances in which it nevertheless can, with the
mechanism for each; (3) explain why R1's actual recipe (distil, then apply RL) is a direct
consequence of your answer to (2).`,
      rubric: md`**(1) The bound:** supervised imitation optimises toward the teacher's conditional
distribution; the best achievable outcome is matching it, so on the teacher's own distribution the
student's ceiling is the teacher — the same argument that limits demonstration-based learning in 5.5.

**(2) Three escapes** (each needs its mechanism):
- **Specialisation:** a student trained only on a narrow slice can beat a generalist teacher *on
  that slice*, because its capacity is spent entirely there rather than on breadth it will never use.
- **Multiple teachers / ensembling:** distilling from several teachers (or from an ensemble, or from
  best-of-N filtered outputs — 7.3's rejection sampling) transmits a distribution better than any
  single teacher's, since errors are partly independent.
- **Distillation followed by RL:** once the capability is *sampleable* in the student, RL can improve
  it beyond the teacher, because RL is not bounded by demonstrations — it optimises the reward
  directly (5.5's "judgment exceeds creation" argument).

**(3) The recipe follows:** distillation solves the bootstrapping problem that made RL useless on a
small base (nothing to reinforce); once distillation has raised the success rate, RL becomes
productive and can push past the teacher. Distil-then-RL is exactly the sequence implied by "RL
needs sampleable success" plus "imitation has a ceiling" — each stage supplying what the other
lacks.

Full credit requires all three escapes with mechanisms and the explicit connection in (3).`,
    },
    {
      id: 'm8-l4-q11',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "If a small AI can just copy a big one,
why does anyone build the big one?" Explain, with analogies you invent: what "copying" actually means
here (it's not copying the parts — it's learning from worked examples), why learning from someone
who shows their *whole thinking* teaches more than being told only the right answer, why the small
copy still can't remember everything the big one knows, and why somebody has to do the expensive
discovering first. No jargon without a kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **What copying means** — not opening the big AI and taking its parts (the small one has nowhere to
   put them), but watching it work through thousands of problems and learning to work the same way.
   A good analogy: you can't copy a chess grandmaster's brain, but you can study ten thousand of
   their games and start playing like them.
2. **Whole thinking beats just the answer** — a teacher who says only "the answer is 7" teaches less
   than one who says "it's probably 7, might be 8, definitely not 200" — the second tells you how the
   world is *shaped*, which helps on the next problem too. The kid should feel why the near-misses
   are informative.
3. **The small copy forgets things** — a small notebook can hold the *method* but not every fact;
   so the copy reasons well and still gets dates and names wrong, and for facts you look them up
   instead.
4. **Why build the big one** — somebody has to *discover* the method before anyone can copy it, and
   discovering is enormously harder than copying: the big model tried millions of things to find what
   works; the small one is handed the answer. (Bonus: and the copy can never be better than its
   teacher at the teacher's own game unless it practises on its own afterwards.)
5. **Jargon audit:** "distillation," "logits," "distribution," "on-policy," "acceptance rate" used
   without kid-level translation = partial at best.`,
    },
    {
      id: 'm8-l4-q12',
      kind: 'written',
      prompt: md`**Design a distillation project.** You have a strong open 70B model and need an 8B
model for a specific task, deployed at high volume. On paper, write the plan: (1) which distillation
variant you would use and why, given that you have the teacher's weights; (2) how you would generate
the training data, including one quality-control step from 7.3; (3) the exposure-shift risk in your
plan and one concrete mitigation; (4) what you would measure to know it worked, including the
regression check from 7.6; (5) the one capability you would expect NOT to transfer, and what you
would do about it instead.`,
      rubric: md`**(1)** With weights in hand, soft-target/logit distillation is available and
transmits more than response distillation — a strong answer picks it *and* notes the practical cost
(you must run the teacher over your corpus and store or stream distributions), or defensibly picks
response distillation for simplicity while acknowledging what is given up.

**(2)** Generate on realistic task inputs (7.3's taxonomy method for coverage, not whatever data is
lying around), with a quality-control step: rejection sampling against a verifier or judge, or
filtering by teacher confidence, or deduplication (5.1). Naming *any* concrete filter with its
rationale earns the point.

**(3) Exposure shift:** the student will drift from the teacher's manifold over long outputs
($0.99^{300} \approx 5\%$). Mitigations: an on-policy round (student generates, teacher corrects),
or at minimum evaluating on *long* outputs rather than short ones so the failure is visible.

**(4) Measurement:** a task eval on held-out realistic inputs (held out by source or time), an A/B
against the teacher and against the un-distilled 8B base, a **regression suite** of capabilities that
must not degrade (7.6), and significance arithmetic sufficient for the gap claimed (5.6).

**(5) What won't transfer:** broad/rare factual knowledge — capacity-bound. The correct response is
*not* more distillation but retrieval (7.1's Type 1 cure), or accepting a narrower scope.

Full credit = a plan a colleague could execute, with the exposure-shift and regression items present.
Those two are the ones that separate someone who has read about distillation from someone who has
shipped it.`,
    },
  ],
}
