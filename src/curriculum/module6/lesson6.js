// Module 6, Lesson 6 — Doing research (CURRICULUM CAPSTONE, Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm6-l6',
  title: '6.6 Doing research — from reader to contributor',
  subtitle:
    'Thirty-five lessons ago you could not have said what a dot product had to do with meaning. You can now derive attention, audit a training bill, and argue about superposition — and none of it makes you a researcher yet. This is the last lesson, and it is about the gap.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Take stock honestly. You can derive $\text{softmax}(QK^\top/\sqrt{d_k})V$ from a broken averaging
machine. You can compute that training a 70B model needs 1.12 TB of state, price a token against a
GPU's memory bandwidth, read a model card like an instrument panel, and hold an informed opinion
about whether sparse autoencoders recover a model's real features.

That is a genuinely uncommon amount of knowledge. And it makes you an extremely well-prepared
**reader**.

The gap between where you are and a research scientist is not more facts. It is the ability to
produce a fact that did not exist this morning — and the thing that produces those is not
knowledge. It is **taste**: knowing which question is worth asking, and which version of it you can
actually answer this month with the hardware you have.

The good news, and the reason this lesson exists rather than a graduation certificate: taste is
not a personality trait. It is a trained skill with an identifiable feedback loop, and the loop is
cheap to run. Here is how to run it.

## Choosing the problem — the actual bottleneck

Beginners believe research is bottlenecked by cleverness. It is bottlenecked by **problem
selection**, and the standard filter has three factors:

- **Importance** — if the answer is yes, does anything change?
- **Tractability** — can *you* get a real answer, with your compute, in weeks not years?
- **Neglectedness** — are fifty better-resourced labs already sprinting at it?

Beginners systematically over-weight the first and under-weight the second. "I'll work on making
models honest" is important, neglected, and completely intractable as a first project — there is no
experiment you can run on Tuesday that resolves any part of it. Meanwhile "does an SAE feature beat
a linear probe at detecting refusal on this open 7B model?" is smaller, sharper, runnable on one
GPU, and — critically — **can come out either way**, which is what makes it an experiment rather
than a demonstration.

And the best generator of such questions is not the one everyone recommends. "Find a gap in the
literature" produces derivative work, because gaps are defined by what others already wrote.
Instead:

> **Start from a confusion you personally have.** A claim in a paper you cannot reconstruct. A
> result that, given what you know, should not work. A number that seems off by an order of
> magnitude.

A confusion is a *guaranteed* research lead, because it means either the field is wrong or you are
— and both outcomes are worth your afternoon. You have spent thirty-five lessons accumulating
exactly the kind of specific knowledge that generates specific confusions. Those confusions are
your research pipeline; write them down as they occur or you will lose them.
`,
    },
    {
      type: 'example',
      title: 'turning confusions into experiments — four worked conversions',
      md: md`
Each of these starts from something a careful reader of this curriculum could genuinely wonder,
and ends somewhere you could actually run.

**Confusion:** *"Lesson 5.1 said the final anneal phase, on the best data, matters unusually much.
Why would the last 2% of training carry more weight than the middle 50%?"*
→ **Question:** does anneal-phase data quality affect final loss more than an equal quantity of
that data earlier in training?
→ **Experiment:** train three identical small models — high-quality data spread uniformly, the same
data concentrated at the end, and none of it — and compare final loss and downstream accuracy.
Three runs of a 50M model: an afternoon.

**Confusion:** *"6.1 said SAE features are more monosemantic than neurons — but the honest section
admitted they may not beat a linear probe downstream. Which is it?"*
→ **Question:** on a specific behaviour (say refusal), does an SAE feature detect it better than a
logistic-regression probe trained on the same activations?
→ **Experiment:** open 7B model, one layer, both methods, one held-out test set. Pre-register that
if the probe wins you will say so. This is a *real* open question and a publishable negative result.

**Confusion:** *"Lesson 5.2's viz caption mentioned that Chinchilla's own fitted constants don't
reproduce its famous 20:1 rule. That's strange for the field's most-cited planning tool."*
→ **Question:** on my own small-model ladder, what token-per-parameter ratio is actually optimal —
and does it drift with budget the way the parametric fit implies?
→ **Experiment:** the scaling-ladder capstone below. Cheap, self-contained, and you end up owning
one of the field's central numbers rather than quoting it.

**Confusion:** *"6.2's backup heads mean ablation understates importance. How much published
ablation evidence is quietly distorted by that?"*
→ **Question:** for a specific known circuit, how far apart do ablation and activation-patching
rank the same components?
→ **Experiment:** GPT-2 small, one documented circuit, both methods, compare the orderings. A week,
zero training compute.

Notice the shape of all four: the confusion is *specific*, the question is *decidable*, and the
experiment fits in a week. That is the conversion you are learning to perform.
`,
    },
    {
      type: 'ponder',
      question: md`Here is the single highest-leverage habit in experimental work, and it costs
thirty seconds: **before you run the experiment, write down what you predict will happen.** Why
does this help so much more than it seems it should? (Hint: think about what you learn in the case
where your prediction is right, versus wrong — and what it tells you about the experiment itself,
not just the system.)`,
      answer: md`Three compounding effects, in increasing order of importance.

**It calibrates you.** You discover how often your confident intuitions about models are wrong.
That discovery *is* the training signal for taste — the thing you cannot get from reading, because
reading only ever shows you the answer alongside the question.

**It prevents post-hoc storytelling.** Without a written prediction, any result feels explicable
afterwards ("of course it did that") — which means you learn nothing, because a theory that
explains every outcome forbids none. The written prediction makes the result capable of surprising
you, and surprise is the only thing that carries information (a payoff of lesson 1.5, if you like:
information *is* surprise).

**It audits the experiment before you waste compute on it.** This is the sharp one. If you cannot
predict the outcome, you don't understand the setup well enough to interpret it either. And if you
predict the *same* outcome for both branches — "either way I'd shrug" — the experiment is
worthless and you just saved yourself a week. **Experiments whose outcomes you cannot distinguish
in advance cannot inform you afterwards.** That test alone will kill a third of your project ideas,
and it should.`,
    },
    {
      type: 'text',
      md: md`
## Experimental discipline: the habits that separate results from noise

Lesson 5.3 described the ablation culture of frontier labs — de-risk everything at small scale,
because the big run is unrepeatable. Here is the personal-scale version, and every item is a
lesson learned the hard way by somebody:

1. **Design the smallest experiment that could refute you**, not the largest that could impress.
2. **Run the baseline first.** If you build the method first, you will (unconsciously, inevitably)
   tune it harder than the baseline, and lesson 6.5 taught you exactly how that paper reads to a
   skeptic.
3. **Change one thing at a time.** Two changes and a positive result tells you nothing about which
   one worked.
4. **Multiple seeds, always.** Lesson 5.6's arithmetic: a single run is an anecdote, and the gap
   you are excited about may be smaller than the variance you did not measure.
5. **Log everything, immediately** — configs, seeds, git hash, the plot you almost deleted. The
   experiment you cannot reproduce did not happen.
6. **Report the negative result**, starting with reporting it to yourself. The strongest signal that
   someone is doing science rather than advocacy is that their notebook contains failures.

## You can afford this — the small-model advantage

The most damaging myth for a newcomer is that real work requires a cluster. It does not, because
**most interesting phenomena show up at small scale.** Superposition was characterised in toy models
you could train in minutes. Induction heads were found in two-layer models. Scaling laws are fit
from *small* models — that's the entire point of them.

Concretely, using lesson 5.2's own budget identity $C \approx 6ND$: a GPT-2-scale model
($N \approx 124$M parameters) trained on $D \approx 2.5$B tokens needs

$$C \approx 6 \times 1.24{\times}10^{8} \times 2.5{\times}10^{9} \approx 1.9 \times 10^{18} \text{ FLOPs}$$

At a realistic sustained ~125 TFLOP/s on one modern GPU (about 40% MFU — lesson 5.3's number),
that is $1.9{\times}10^{18} / 1.25{\times}10^{14} \approx 15{,}000$ seconds: **roughly four hours,
under ten dollars of rented GPU.** The entry ticket to running your own language-model experiments
costs about as much as lunch.

Interpretability is cheaper still — open weights plus existing tooling, no training at all — and an
eval project (the fourth capstone below) needs no GPU whatsoever.
`,
    },
    {
      type: 'example',
      title: 'four capstone projects — pick one and actually do it',
      md: md`
Each has a question, a method, a compute budget, the expected result, and — the part beginners
skip — **the failure mode that would teach you something**.

**(a) Replicate a scaling law.** *Question:* does $L = E + A/N^{\alpha}$ actually predict a model
you have not trained? *Method:* train five models from ~5M to ~80M parameters on a fixed corpus,
fit the curve on four, predict the fifth, then train it and compare. *Compute:* ~8 GPU-hours total
(the small models are nearly free — the largest dominates the bill). *Expected:* prediction within a
few percent. *Instructive failure:* your ladder bends, and you discover your small models were
undertrained (a data-term problem, not a law problem) — which teaches you more about lesson 5.2
than success would.

**(b) Find an induction head.** *Question:* can you locate the two-head circuit of lesson 6.2 in a
real model? *Method:* take a small open model, feed repeated random token sequences, inspect
attention patterns for the previous-token and induction signatures, then confirm causally with
activation patching and measure the in-context-learning damage when you ablate. *Compute:* none —
inference only, runs on a laptop. *Expected:* you find them, roughly where the literature says.
*Instructive failure:* ablation barely dents performance — and you have met backup heads
personally, which is the best possible way to learn why patching beats ablating.

**(c) SAE features versus a linear probe.** *Question:* do sparse-autoencoder features beat a
simple baseline at a real detection task? *Method:* train an SAE on one layer's activations of a
small open model, identify features relating to a target behaviour, and race them against
logistic regression on the raw activations, on held-out data. *Compute:* a few GPU-hours.
*Expected:* genuinely unknown — this is lesson 6.1's live open question, at a scale you can run.
*Instructive failure:* the probe wins, and you have a real (publishable, useful) negative result
about a fashionable method.

**(d) Build a contamination-resistant eval.** *Question:* how much of a saturated benchmark's
reported score is memorisation? *Method:* hand-write fresh variants of 100 items — same skill,
new surface — and measure the score drop across several open models. *Compute:* zero GPUs; API
credits or local inference. *Expected:* a measurable drop, larger for older/more-scraped
benchmarks. *Instructive failure:* no drop at all, which is *excellent* news about that benchmark
and worth reporting.

Pick the one that matches your compute and your curiosity, not the one that sounds most
impressive. A finished (a) beats an abandoned (c) by an infinite margin.
`,
    },
    {
      type: 'ponder',
      question: md`Three project sketches land on your desk as candidate *first* projects.
**(i)** "Make language models honest." **(ii)** "Reproduce the Chinchilla ratio on a 5-model ladder
I can train in a weekend." **(iii)** "Build a better transformer architecture that beats
attention." Which is the right first project, and — the more useful question — *why* do beginners
almost always reach for the wrong one?`,
      answer: md`**(ii)**, and it is not close.

**(i)** fails tractability catastrophically: there is no experiment you can run this month that
moves it, and no result that could come back and settle anything. It is a research *direction*
misfiled as a project.

**(iii)** fails on baselines and compute jointly — beating attention requires compute-matched
comparisons against an extremely well-tuned baseline (lesson 6.5's first checklist item), which is
precisely the comparison a newcomer with one GPU cannot make credibly. Any positive result you get
will be, correctly, disbelieved.

**(ii)** is finishable in a weekend, produces a number you can check against a published one
(so you find out whether you *actually* did it right — rare and precious), teaches the whole
5.2/5.3 stack by hand, and can fail informatively.

**Why beginners choose wrong:** importance is *visible* and tractability is *invisible*. You can
see that honesty matters from the outside; you can only see that a project is infeasible after
you've thought carefully about the specific experiment — which is work most people skip while
choosing. There is also a status pull: ambitious-sounding projects feel like they signal ambition,
whereas the actual signal a researcher reads is *did you finish something and were you honest
about it*. The counter-habit is mechanical: for any candidate project, write the first experiment
in one sentence, including what you'd measure. If you can't, it's a direction, not a project — and
you should go find the small version of it.`,
    },
    {
      type: 'text',
      md: md`
## Writing it up: a paper is an argument, not a report

A report says what you did. An argument says what is true and why you should believe it — and the
difference determines whether anyone builds on your work.

The structure that follows from that:

- **The claim.** One sentence, and it must be something a competent peer could *disagree* with. "We
  study sparse autoencoders" is not a claim. "SAE features do not outperform linear probes for
  refusal detection at 7B scale" is.
- **The evidence.** The experiments that establish it, with the baseline visible.
- **The alternative explanations you ruled out**, and how. This section is where readers decide
  whether you are careful. Anticipate the objection *you* would raise reading someone else's
  version of this paper.
- **Figures that carry the claim.** If a reader looks only at your figures, they should reach your
  conclusion. Decorative plots are wasted space.
- **The abstract as a contract.** Everything it promises must be delivered, at the strength
  promised. Overselling is not a marketing decision; it is a reputational one, and this field is
  small.
- **Limitations that pre-empt the strongest objection**, not the weakest. A limitations section
  that lists only trivia reads as evasion to exactly the readers you most want.

**The one-sentence test:** if you cannot state your contribution in a sentence someone could
argue with, you do not have one yet. Keep experimenting.

## The shape of the path

A few honest observations about how people actually enter this field:

- **Research engineer versus research scientist** is a real distinction on paper and a blurry one
  in practice at frontier labs; the work is overwhelmingly empirical, and people who can *build the
  experiment* are the ones who get to *ask the question*. Your engineering is not a detour.
- **The usual sequence is replicate → extend → originate.** Replicating a real result teaches you
  the thousand unstated details that papers omit, and it is the single most underrated use of a
  first month.
- **Public artifacts beat credentials here**, more than in almost any other technical field. A
  clean replication with an honest write-up, a working interpretability notebook, a well-designed
  eval — these are read, and they are how people get noticed and hired. This field is young enough
  that much of it was built by people who had been in it under five years.
- **Find or start a reading group.** Lesson 6.5's triage skill compounds enormously when three
  people argue about the same paper.

## What you now own — the whole journey

Six modules, and one continuous argument:

- **Module 1 — geometry.** Meaning became direction; the dot product became agreement; loss became
  surprise; learning became rolling downhill in seven billion dimensions.
- **Module 2 — mechanism.** Frozen embeddings couldn't carry context, so you *invented* attention
  to fix it, gave it many heads, taught it order with rotations, and assembled every part into a
  machine whose parameters you audited one by one.
- **Module 3 — behaviour.** Text became tokens, logits became words, the past became a cache, and
  hallucination, chain-of-thought, and in-context learning stopped being mysteries and became
  consequences.
- **Module 4 — engineering.** The memory wall, the four parallelisms, conditional compute, fewer
  bits, and the invoice — how a machine this size is made to run at all.
- **Module 5 — training.** What it eats, the curve that predicts it, the ninety days that build it,
  and the thin final layer of human judgment that shapes its character.
- **Module 6 — frontier.** Why you cannot simply read the weights, how to read them anyway, what we
  cannot specify, where capability is heading, and how to read and produce the literature about it.

Now go back to the very first question this course asked you, in lesson 1.1:

> *A computer can only do arithmetic. How could arithmetic ever know that "cat" is more like "dog"
> than like "carburetor"?*

You can now answer it at every level of the stack, and that is worth noticing. Geometrically: they
occupy nearby directions in a space where nearness was arranged to mean similarity. Mechanistically:
attention heads move information between those directions, and FFN layers compute on it.
Statistically: nothing arranged it deliberately — minimizing surprise on enough text *forced* the
arrangement, because a model that groups words by usage predicts better. Physically: the whole thing
is matrix multiplications streaming across memory bandwidth at a price per token you can compute.
And empirically: those directions are superposed, so you would need a dictionary to read them —
and you know how one is built, and what remains unproven about it.

That is a complete answer, from arithmetic to open problem. It took thirty-six lessons.

## Where this ends and your work begins

This is the last lesson, so let me be plain about what the curriculum can and cannot give you. It
gave you the map. It cannot give you the thing that makes a researcher, which is the experience of
being wrong about something you were confident about, in public, and finding out precisely why.

Your teachers from here are the paper on your desk, the experiment that came out backwards, and the
review queue on your dashboard — the questions you marked *missed* are the ones your future self
most needs you to redo.

So: pick a capstone. Write down what you expect to happen. Run it. Be honest about the result,
especially if it is boring.

That's the whole job. Go do it.
`,
    },
    {
      type: 'ponder',
      question: md`Final exercise of the course, and it's the one that generates all your future
work. Pick any lesson from any module — genuinely pick one — and produce a **researchable question**
from a real confusion you have about it. Then check it against three tests: can you state the first
experiment in one sentence? Could the result come out either way? Would you be able to run it with
the compute you actually have?`,
      answer: md`There is no single right answer — the exercise *is* the answer, and it is the
habit this entire course was building toward. But here is the quality bar, using three more
conversions as calibration:

**From 3.1 (tokenization):** *"Digit tokenization scrambles place value — but do models trained
with digit-level tokenizers actually do arithmetic better, or does the effect vanish with scale?"*
→ compare two small models trained identically except for digit handling, on arithmetic accuracy by
digit count. One sentence ✓, could go either way ✓, two small runs ✓.

**From 4.4 (quantization):** *"Everyone reports perplexity after quantizing. Perplexity is an
average — does 4-bit quantization hurt the tail (rare, hard tokens) far more than the mean
suggests?"* → measure per-token loss distribution before and after quantizing, not just the mean.
One sentence ✓, either way ✓, inference-only ✓. (Note this one comes straight out of 6.1's ponder
about averages hiding tail failures — confusions compound across lessons.)

**From 5.5 (RLHF):** *"Length bias in reward models is well known — is it a property of the
preference data, or does it emerge from the reward model's training regardless?"* → train reward
models on length-balanced versus natural preference data and compare their length correlation.

If your question passes all three tests, you have a project. If it fails the first, it's a
direction — go find its small version. If it fails the second, it's a demonstration — find the
version that could embarrass you. If it fails only the third, keep it in your notebook: compute
gets cheaper every year, and a good question keeps.`,
    },
  ],
  questions: [
    {
      id: 'm6-l6-q1',
      kind: 'mcq',
      prompt: md`Which is the strongest *first* research project for someone with one GPU and a
month?`,
      options: [
        'Design a novel architecture that outperforms the transformer on language modeling',
        'Replicate a published scaling-law fit on a ladder of small models you train yourself, then test its prediction on a held-out size',
        'Investigate whether large language models are conscious',
        'Survey the alignment literature and write a position paper on the field’s direction',
      ],
      answer: 1,
      explain: md`It is finishable, it checks against a published number (so you learn whether you
did it right — rare feedback), and it can fail informatively. Option A fails on compute-matched
baselines: a newcomer cannot tune the transformer baseline credibly enough for anyone to believe
the result. Option C is not currently an empirical question at all — there is no measurement whose
outcome would settle it. Option D is the seductive one, because it feels like scholarship and
requires no compute — but surveys are much easier to write *after* you have run experiments, and
before that they mostly recycle other people's framing.`,
    },
    {
      id: 'm6-l6-q2',
      kind: 'numeric',
      prompt: md`**Fermi (using lesson 5.2's budget identity).** You train a GPT-2-scale model:
$N = 124$M parameters, $D = 2.5$B tokens, so $C \approx 6ND$. Your single GPU sustains about
$125$ TFLOP/s. Roughly how many **hours** does the run take?`,
      answer: 4,
      tolerance: 2,
      explain: md`$C \approx 6 \times 1.24{\times}10^{8} \times 2.5{\times}10^{9} \approx
1.9 \times 10^{18}$ FLOPs; divided by $1.25 \times 10^{14}$ FLOP/s gives $\approx 15{,}000$ s
$\approx$ **4 hours** — under ten dollars of rented GPU. This is the number that should delete the
excuse: the entry ticket to running your own language-model experiments costs about as much as
lunch, and it is the same $C = 6ND$ you learned for planning frontier runs, pointed at your own
desk.`,
    },
    {
      id: 'm6-l6-q3',
      kind: 'numeric',
      prompt: md`Your scaling ladder gives: 10M parameters → reducible loss $1.20$ nats; 100M
parameters → $0.55$ nats. Estimate the exponent $\alpha$ in $L - E = A N^{-\alpha}$ (two decimals;
use $\log_{10}(1.20/0.55) \approx 0.34$).`,
      answer: 0.34,
      tolerance: 0.04,
      explain: md`Slope on log-log axes over one decade of $N$:
$\alpha = \log_{10}(1.20/0.55) / \log_{10}(10) = 0.34/1 = 0.34$ — reassuringly close to the
published Chinchilla-family exponent. Two training runs and a division, and you have measured one
of the field's central constants yourself instead of quoting it. That is precisely the difference
this lesson is about.`,
    },
    {
      id: 'm6-l6-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall — design the smallest refuting experiment.** A colleague
claims: *"Training on code improves a model's reasoning in plain English."* On paper, design the
smallest experiment that could **refute** this: state the two (or more) conditions you would train,
what you hold fixed, what you measure, the sample size reasoning, the result you predict in
advance, and what outcome would make you abandon the claim. Then name the confound you consider
most dangerous and how your design handles it.`,
      rubric: md`**Conditions:** two small models trained identically except for the data mixture —
one with a code fraction, one without — with **total token count and compute held fixed** (else you
are testing "more data", the classic confound; lesson 6.5's compute-matching item).

**Measurement:** a reasoning benchmark that contains *no code*, plus a control task that should be
unaffected (to catch a general "this run was just better" effect).

**Sample size:** enough eval items that the expected gap exceeds noise — lesson 5.6's binomial
arithmetic, e.g. several hundred items for a several-point difference; multiple seeds per
condition.

**Prediction written in advance**, and the refuting outcome named: no significant difference on the
reasoning benchmark under compute-matching kills the claim as stated.

**The most dangerous confound** (any well-argued one): the swapped-in non-code data differs in
quality as well as in kind — so the honest control replaces code with *matched-quality* prose, not
whatever was lying around; or benchmark contamination via code-adjacent text (5.6); or that "code"
correlates with cleaner formatting.

Full credit needs compute-matching, a written prediction, an explicit refuting outcome, and one
confound handled. An answer that merely proposes "train with code and see if it's better" earns
partial at best — that design cannot distinguish the claim from "more data helps".`,
    },
    {
      id: 'm6-l6-q5',
      kind: 'mcq',
      prompt: md`Why is writing down your predicted result *before* running an experiment such a
high-leverage habit?`,
      options: [
        'It makes your paper easier to write afterwards',
        'It calibrates your intuitions, blocks post-hoc storytelling, and — most usefully — reveals experiments whose outcomes you could not distinguish in advance, which are exactly the experiments that cannot inform you',
        'It is required by most journals as a pre-registration step',
        'It prevents you from accidentally running the wrong configuration',
      ],
      answer: 1,
      explain: md`All three effects compound, but the third is the one that saves weeks: if you
would shrug at either outcome, the experiment carries no information and should not be run. Option
A is a real but trivial benefit. Option C is tempting because pre-registration is genuinely a norm
in some fields — but ML mostly does not require it, which is precisely why the *personal* habit
matters: nobody will impose it on you.`,
    },
    {
      id: 'm6-l6-q6',
      kind: 'numeric',
      prompt: md`You want to detect a **5-percentage-point** accuracy difference between two models
scoring near 50%. Using lesson 5.6's arithmetic, the standard error of the difference is
$\sqrt{2p(1-p)/n}$ with $p = 0.5$. Roughly how many eval items $n$ per model do you need for that
5-point gap to be about two standard errors?`,
      answer: 800,
      tolerance: 250,
      explain: md`Two standard errors must be $\le 0.05$, so $\text{SE} \le 0.025$. With
$\sqrt{2(0.25)/n} = \sqrt{0.5/n} \le 0.025$ we get $n \ge 0.5/0.000625 = 800$. Fewer than ~800
items and a 5-point gap is not distinguishable from luck — which is worth remembering next time you
see a leaderboard separated by two points on a few hundred questions.`,
    },
    {
      id: 'm6-l6-q7',
      kind: 'mcq',
      prompt: md`What makes a one-sentence claim a genuine research *contribution* rather than a
description of activity?`,
      options: [
        'It mentions the specific model and dataset used',
        'It states something a competent peer could disagree with — and that your evidence could have failed to support',
        'It uses precise technical terminology',
        'It describes a method nobody has published before',
      ],
      answer: 1,
      explain: md`Disagreeability is the test: "we study sparse autoencoders" cannot be argued with
because it asserts nothing, while "SAE features do not outperform linear probes for refusal
detection at 7B scale" invites — and can survive — challenge. Option D is the most tempting, since
novelty feels like the currency of research; but a novel method with no claim about what is *true*
is an artifact, not a finding, and a well-designed replication with a sharp claim contributes more
than an unfalsifiable novelty.`,
    },
    {
      id: 'm6-l6-q8',
      kind: 'numeric',
      prompt: md`Your five-model scaling ladder has sizes at $\tfrac{1}{16}, \tfrac{1}{8},
\tfrac{1}{4}, \tfrac{1}{2}$ and $1\times$ the largest model, each trained compute-proportionally.
If the largest costs **4 GPU-hours**, roughly how many GPU-hours is the *entire ladder*?`,
      answer: 8,
      tolerance: 2,
      explain: md`$4 \times (1 + 0.5 + 0.25 + 0.125 + 0.0625) \approx 4 \times 1.94 \approx
7.8$ hours. The geometric series is the quiet good news of scaling-law work: the small models are
nearly free, so a full ladder costs barely more than twice its largest member. Studying *how things
scale* is dramatically cheaper than building the biggest thing — which is why it's a great first
project and why the field could afford to discover scaling laws at all.`,
    },
    {
      id: 'm6-l6-q9',
      kind: 'mcq',
      prompt: md`You run your method and the baseline; the baseline wins. What is the correct next
step?`,
      options: [
        'Tune the method further until it wins, then report that configuration',
        'Report the result — after checking the baseline was implemented fairly and that the comparison was compute-matched — because a careful negative result is a genuine contribution',
        'Discard the experiment; negative results are not publishable',
        'Switch to a benchmark where the method performs better and report that',
      ],
      answer: 1,
      explain: md`This is the honesty fork that defines a researcher's reputation, and options A and
D describe *exactly* how well-intentioned people produce a literature that doesn't replicate —
each step feels locally reasonable ("surely it just needs more tuning", "surely this benchmark is
more appropriate"), which is what makes them dangerous rather than obviously wrong. The legitimate
version of A is symmetric effort: tune *both* equally, and say how much you tuned each. Note also
that negative results about fashionable methods are among the most valuable things a newcomer can
publish — the field needs them and few people volunteer.`,
    },
    {
      id: 'm6-l6-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "You know how the AI works now. So what
do scientists actually *do* all day — do they just build bigger ones?" Explain: what a research
question is (versus just a curious thought), why you have to guess the answer before you test it,
why being wrong is the good part, and why a small careful experiment beats a big impressive one. No
jargon without a kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **Question vs curiosity** — a research question is one you can *settle*: you can describe the
   test, and the test could come out either way. "Are AIs smart?" isn't testable; "does an AI that
   read computer code get better at word puzzles than one that didn't?" is — you can build both and
   check. The kid should be able to tell the two apart afterwards.
2. **Guess first** — like calling heads before the flip: if you decide afterwards what you expected,
   you'll always feel you knew it. Writing the guess down is what lets the world tell you
   something new — and if you'd shrug at either outcome, the test was pointless.
3. **Being wrong is the good part** — a right guess teaches you nothing you didn't have; a wrong one
   means the world just handed you a fact you didn't own this morning. Scientists collect surprises.
4. **Small and careful beats big and impressive** — a small test you can finish and check tells you
   something true; a giant one you can't finish tells you nothing, and one where you changed ten
   things at once can't say which mattered.
5. **Jargon audit:** "baseline," "ablation," "scaling law," "compute-matched," "seed variance" used
   without kid-level translation = partial at best.`,
    },
    {
      id: 'm6-l6-q11',
      kind: 'written',
      prompt: md`**Convert a confusion into a project.** Choose any lesson from this curriculum —
your genuine choice — and write: (1) the confusion, stated precisely enough that someone could tell
whether it's resolved; (2) the research question it becomes; (3) the first experiment in ONE
sentence, including what you would measure; (4) the baseline you would compare against; (5) your
written prediction; (6) the outcome that would refute your prediction; (7) the compute you'd need,
and whether you actually have it.`,
      rubric: md`There is no single right answer; grade against the three tests from the lesson.

**Must have, to pass:** a *specific* confusion (not "I don't fully understand attention"); a
question whose answer is a fact rather than an essay; a one-sentence experiment naming a
measurement; a real baseline (a simpler method or an unchanged control, not "nothing"); a
prediction committed to *before* running; a named refuting outcome; and an honest compute estimate.

**Common failure modes to mark down:** a "question" that can only come out one way (a
demonstration, not an experiment); no baseline, so any result is uninterpretable; an experiment
requiring frontier compute, which means it is not *your* project yet; a prediction so vague ("it
will probably do something interesting") that no outcome could contradict it.

**Full marks** go to an answer you could hand to a competent friend, who could then run it without
asking you a single clarifying question. That is the actual bar for a research plan, and hitting it
here is the last thing this course asks of you.`,
    },
    {
      id: 'm6-l6-q12',
      kind: 'written',
      prompt: md`**The capstone commitment.** Choose one of the four capstone projects (replicate a
scaling law · find an induction head · SAE features versus a linear probe · build a
contamination-resistant eval). Write the plan you will actually execute: the question in one
sentence; your step-by-step method; the compute and time you're budgeting; your written prediction
of the result; the specific outcome that would mean you were wrong; and the one thing most likely
to go wrong mechanically (a bug, a data problem, a misread number) with how you'd catch it. Then
put a date on it.`,
      rubric: md`Grade this as a supervisor would grade a plan they were about to fund.

**Question:** one sentence, decidable, matched to the chosen project.

**Method:** steps concrete enough to start tomorrow — which model or corpus, which layer, which
measurement, how many seeds. Vagueness here is the single most common reason projects stall in
week one.

**Budget:** hours and GPU (or explicitly none), and honest about what you have. A plan requiring
compute you don't own is a wish.

**Prediction + refutation:** both written, both specific. If no stated outcome would change your
mind, revise until one does.

**The mechanical failure mode** — this item separates people who have run experiments from people
who have read about them. Strong answers name something concrete: a tokenizer mismatch between
train and eval; loss reported on the wrong split; an off-by-one in position indexing (lesson 6.2's
whole circuit turns on one!); comparing models at different token counts; a plotting bug that hid a
diverged run. And each names *how it would be caught* — a sanity check, a known-value comparison, a
held-out spot check.

**The date** is not decoration: an undated plan is an intention. Full credit requires one.

If you complete this project and write it up honestly — including if it fails — you will have done
something the overwhelming majority of people who "study AI" never do. That is the point of the
exercise, and the end of the course.`,
    },
  ],
}
