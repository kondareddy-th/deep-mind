// Module 5, Lesson 6 — Evals (module capstone, Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm5-l6',
  title: '5.6 Evals — how do you know it’s any good?',
  subtitle: md`Twenty-eight lessons of machinery built you a frontier model. This one asks the
only question your CEO cares about — is it better than theirs? — and shows why measurement is the
least-solved problem in the field: benchmarks that die when targeted, contamination arms races,
judges with predictable diseases, arenas running on 1952 chess math, and the craft habits that
keep a researcher honest. The capstone of the module — and of the technical curriculum.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

You now own the entire pipeline. Data diet (5.1), the scaling curve (5.2), the three-month run
(5.3), the chat costume fitted (5.4), taste learned from judgments (5.5). The run finishes. The
loss landed within a hair of where the scaling law predicted. Champagne.

Then a rival lab ships a model with a press release: *state of the art*. Your CEO walks over and
asks the only question the outside world will ever ask about your three months and nine figures:

> Is ours better?

And here is the uncomfortable truth this lesson exists to teach: after twenty-eight lessons of
machinery — gradients, attention, distributed training, RLHF — *this* question, measurement, is
genuinely the least-solved problem in the field. Not for lack of trying. Because measuring "good"
is structurally cursed, and by the end of 5.5 you can already name the curse: every measure of
"good" is a proxy, and you just watched what optimization pressure does to proxies.

Start with the one measurement you trust. Loss (1.5) is precise, differentiable, comparable —
and it is not what anyone means by "good." Perplexity measures next-token prediction on a
corpus: superbly correlated with raw capability (that correlation is 5.2's entire premise), and
utterly blind to whether the model follows instructions, admits uncertainty, refuses well, or
stops writing when it's done. Worse — and file this as a real, reported effect — post-training
*deliberately spends* likelihood to buy those virtues: SFT and preference tuning (5.4, 5.5) drag
the model's distribution away from raw text toward preferred behavior, so **the aligned model
has visibly worse perplexity than its own base model**. The best assistant in your lineup is,
by your most trustworthy meter, damaged goods. If your only instrument points backwards at the
finish line, you need other instruments. Welcome to evals — here is how a researcher navigates
them, instrument by instrument, disease by disease.
`,
    },
    {
      type: 'text',
      md: md`
## Benchmark anatomy — categories, and how the scoring works

A benchmark is a fixed set of tasks plus a scoring rule. Learn the *categories* — specific
benchmarks age fast (most of the famous names are already wheezing), but the categories are
stable. One canonical example each:

- **Knowledge / multitask QA** (MMLU-style): thousands of multiple-choice questions across
  dozens of subjects — law, medicine, math. Cheap to run, easy to compare, and gameable in every
  way this lesson will catalogue.
- **Reasoning** (GSM8K/MATH-style): multi-step word problems with a checkable final answer.
  Note the property doing the work: **verifiable** — 5.5's clean-signal point, now as
  measurement instead of training.
- **Code** (HumanEval-style): write a function, run the unit tests. Execution-verified — the
  benchmark literally runs your model's output.
- **Long-context** (needle-in-a-haystack): bury a fact at token 200,000, ask for it at the end —
  a direct stress test of 4.6's machinery. Saturated quickly; modern variants demand multi-hop
  *use* of what was found, not parroting.
- **Safety / refusal balance**: harmful requests it should refuse *and* benign lookalikes it
  shouldn't — measured together, because refusing everything aces the first half for free. A
  model graded only on harmlessness maximizes it by becoming useless: metric design already
  fighting Goodhart, before we've even named the section.
- **Instruction-following** (IFEval-style): "respond in exactly three sentences, in JSON" —
  constraints checkable by a script. Verifiable again.

Now the part beginners skip and researchers obsess over: **how the score is computed matters as
much as the questions.** Three common scoring rules — exact-match on generated text; log-prob
comparison over the choices (which of A/B/C/D does the model assign highest probability?);
execution (run the code) — and they do *not* agree. The same model on the same benchmark can
move by double digits between harnesses (real, reported, and a chronic source of leaderboard
squabbles) — formatting quirks, prompt templates, and few-shot examples all shift it. You met
the deep version in 5.2: emergence's "miracle jumps" were often manufactured by hard metrics
sitting on top of smooth log-prob improvements. That metric forensics was a research skill
there; here it becomes a daily practical tool: **before comparing two numbers, ask how each was
scored.** A 3-point gap between labs' self-reported scores is, as often as not, a harness
difference wearing a victory costume.
`,
    },
    {
      type: 'ponder',
      question: md`Before reading further, derive this lesson's central disaster yourself. 5.5
gave you a law: optimize hard against a proxy and you find its bugs before its wisdom. A public
benchmark is a proxy for capability. Every lab optimizes. Play the law forward: what *must*
happen to every famous benchmark? (Hint: in 5.5's cast of characters — policy, reward model —
who plays whom here?)`,
      answer: md`Cast the roles and the conclusion falls out with the force of arithmetic. A
benchmark is a **reward model that everyone shares** — frozen, public, never retrained. The labs
are the policy. Optimization pressure arrives through a dozen channels, some deliberate, some
ambient: data mixtures tilted toward benchmark-like material, checkpoint selection ("ship the
one that scored best"), prompt-template tuning, and — the industrial-strength channel — RLVR
training on benchmark-adjacent problems. So by 5.5's law, score gains increasingly reflect the
proxy's *bugs* — format familiarity, style matching, leaked or lookalike items — rather than the
capability the benchmark was built to proxy. And notice two ways this is *worse* than RLHF's
version: there is no KL leash (nothing anchors a lab to honest measurement except norms), and
the reward model is never patched (a benchmark is frozen the day it ships, while 5.5's labs at
least re-collect preferences). Conclusion: every public benchmark is born with a countdown
clock. The field's treadmill — new benchmark, optimization, death, new benchmark — isn't a
scandal; it's the *equilibrium* of Goodhart's law applied to a shared, frozen proxy.`,
    },
    {
      type: 'text',
      md: md`
## Contamination — the tease from 5.1, cashed

Back in 5.1, deduplication came with a promise: there's a reason beyond efficiency to care about
what's in the training set. Here it is. Benchmark questions *live on the web* — posted in
papers, GitHub repos, blog explainers, forum discussions of the answers. And your pretraining
pipeline (5.1) is a machine for eating the web. So the exam questions leak into the study
materials, silently, at 15-trillion-token scale. The model isn't smart on those items; it has
*seen the answer key*. This is **contamination**, and it corrupts measurement at the source.

Symptoms a researcher learns to smell:

- **Suspiciously high scores** — above what the model's size, data, and loss would predict
  (5.2's curve, moonlighting as a fraud detector: a 7B model scoring like a 70B on one
  benchmark and nowhere else is not a miracle).
- **Verbatim recall**: prompt the model with the first half of a benchmark question and it
  completes the second half word-for-word — memorization caught in the act. (5.4's
  data-inspection habits, pointed at a new target.)
- **The fresh-variant drop**: rewrite the questions — same skill, same difficulty, new surface
  — and the score falls off a cliff. Real and reported: when researchers hand-wrote fresh
  GSM8K-style problems, several well-known models dropped by up to ~10 points, while others
  barely moved. The gap between old-score and fresh-score is a direct contamination gauge, and
  you'll compute one below.

Defenses, each honest about its limits: **dedup-time exclusion** (5.1's n-gram machinery run
against known benchmark sets before training — necessary, but only catches benchmarks you knew
to exclude, in forms you thought to match); **canary strings** (benchmark files carry a unique
random ID; if a model can complete the canary, it demonstrably ate the file — elegant, but only
flags, never prevents); **private held-out sets** (unpublishable, so unleakable — but then
others must trust your grading); **dynamic benchmarks** (rotate in fresh questions on a
schedule — the treadmill, institutionalized). Notice the shape: it's an arms race, and the
web-scraping side has the bigger budget. There is no clean end state; there is only vigilance
priced into the workflow.
`,
    },
    {
      type: 'example',
      title: 'contamination forensics, by hand',
      md: md`
Your team's model scores **92%** on a famous public benchmark. A skeptical colleague (be this
colleague) commissions 200 freshly written variants — same skills, same difficulty
distribution, never posted anywhere. Score: **74%**.

Is the 18-point drop real, or could it be noise from the smaller fresh set? Binomial arithmetic
(the drunkard's walk from 1.1, wearing a lab coat): the standard error of a proportion $p$
measured on $n$ questions is

$$\text{SE} = \sqrt{\frac{p(1-p)}{n}} = \sqrt{\frac{0.74 \times 0.26}{200}} \approx 0.031 \;\; (3.1 \text{ points})$$

The drop is $18/3.1 \approx 6$ standard errors. Noise produces 1–2 SE wobbles routinely; it does
not produce 6. Verdict: the public score is substantially memorization — the model's *real*
skill on this task family is near 74%, and the 92% belongs in the incident report, not the
press release. (Run the verbatim-completion probe next: if the model can finish benchmark
questions word-for-word, you have the smoking gun as well as the statistics.)

Two habits to extract: fresh variants are a *measurement instrument*, not a nicety — budget for
them; and every score you report deserves an SE next to it, which for 200 questions is a
humbling ±3 points.
`,
    },
    {
      type: 'text',
      md: md`
## Benchmark death — Goodhart's second application

The ponder derived it; now watch the mechanism in production detail. A benchmark is born useful:
for a year or two, scores on it genuinely track capability, papers cite it, and — fatally — it
starts appearing in marketing. Now it's a *target*, and the channels open:

- **Data mixture hill-climbing**: tilt 5.1's diet toward benchmark-like material — sometimes
  crudely (training on rephrased test items — contamination with extra steps), often innocently
  (more math textbooks because the math benchmark matters). Either way, the score rises faster
  than the capability.
- **Checkpoint and prompt cherry-picking**: evaluate ten checkpoints and five prompt templates,
  publish the best cell. Each choice is small; compounded, the public number floats a few points
  above honest.
- **Saturation**: frontier models cluster at 85–95% on aged benchmarks, and the remaining few
  points are substantially *label noise* — MMLU famously contains a percentage-range of
  mislabeled or broken questions (reported by several audits), so past a point, models are being
  graded on their agreement with errors. Differences up there rank nobody.

So the benchmark dies — not with a refutation, but with a shrug: everyone quietly agrees its
numbers stopped meaning anything, and a fresh benchmark rises to be believed, targeted, and
killed in turn. The treadmill is structural. A researcher's posture follows: treat any aged,
famous, marketed benchmark's top-of-leaderboard deltas as approximately noise; treat *young,
unmarketed, or private* measures as the ones still alive; and remember the countdown starts the
day a benchmark gets its first headline.
`,
    },
    {
      type: 'text',
      md: md`
## LLM-as-judge — the reward model returns, un-leashed

Human grading is slow and expensive; benchmarks with checkable answers only cover the verifiable
slice of what models do. The field's workhorse compromise: **use a strong model to grade
another model's outputs** — show the judge a prompt, a response (or two responses to compare),
and a rubric; take its verdict at scale. Empirically — flag: measured, not guaranteed —
LLM judges agree with human raters at rates comparable to human-human agreement on many task
types. Tens of dollars per ten thousand judgments (the Fermi below), minutes instead of weeks.

But you already know this machine. **An LLM judge is a reward model that nobody RL'd against —
5.5's disease catalogue transfers wholesale**, because the diseases came from proxy-of-human-
judgment training, not from the RL loop:

- **Position bias**: shown A-then-B, judges favor one slot (often the first) — the verdict
  changes when you swap the order. A pure artifact; no capability involved.
- **Verbosity bias**: longer answers score higher at equal quality — literally 5.5's length
  disease, same mechanism (length correlated with quality in the judge's own training
  preferences), now corrupting measurement instead of training.
- **Self-preference**: models rate their own style family higher — a judge grading its sibling
  is a conflict of interest with a probability distribution.
- **Confidence sycophancy**: assertive, polished tone outscores hedged accuracy (3.6's
  calibration ghost, haunting the grader this time).

Mitigations, all standard practice and none sufficient alone: **swap positions and average**
(cancels position bias by symmetry); **rubric-anchored grading** (score named criteria —
correctness, then concision *as its own line* — so verbosity can't smuggle itself into
"quality"); **ensembles of different judge models** (a hack must fool uncorrelated biases);
**spot-validate against humans** on a subsample, every time, because judge-human agreement is an
empirical number that varies by task, not a law of nature. The posture: LLM-as-judge is a
thousand-fold cost reduction with known, partially-correctable biases — a superb instrument, as
long as you never forget you're reading a reward model's opinion, not the truth.
`,
    },
    {
      type: 'text',
      md: md`
## Arenas and Elo — 1952 closes its loop

One instrument remains, and it's the one the public trusts most: ask *people*. The arena format:
a user types a real prompt, two anonymous models answer side by side, the user votes for the
better answer, and identities are revealed only after the vote. Blind, paired, crowd-scale.
Millions of votes accumulate. How do you turn pairwise votes into a leaderboard? Chess solved
this decades ago: **Elo ratings**.

Now the loop-closing you can see coming. Elo's expected-score formula for a rating gap
$\Delta$:

$$\mathbb{E}[\text{win}] = \frac{1}{1 + 10^{-\Delta/400}}$$

Rewrite $10^{x} = e^{x \ln 10}$ and this is $\sigma(\Delta \cdot \ln 10 / 400) = \sigma(\Delta / 174)$
— a sigmoid of a score difference. **Elo *is* Bradley–Terry** — the exact math you derived in
5.5 from 1.4's softmax, with cosmetic units (base 10, scale 400 — the Fahrenheit of preference
models). In 5.5 the players were two *responses* and the fitted scores made a reward model; here
the players are two *models* and the fitted scores make a leaderboard. Same likelihood, same
sigmoid, same shift-invariance (only rating *gaps* mean anything). An arena is a reward model
trained over models — the curriculum's loops, closing on schedule. Feel one number: a 100-point
Elo gap means the higher-rated model wins $1/(1 + 10^{-0.25}) \approx 0.64$ — 64 votes in 100.
Leaderboard gaps of 10–20 points? Read on before genuflecting.

What arenas honestly measure: **crowd preference, on crowd prompts, in short exchanges** — which
is genuinely valuable and genuinely narrow. What they structurally miss: long-horizon work (no
one votes on a week-long refactor), specialized domains (few voters can grade the medicine or
the Rust), and safety (the crowd rewards the answer, not the wisdom of giving it). And the
known distortions, both live debates: **style-over-substance** — votes lean toward confident,
well-formatted, flattering answers (the judge biases again — a crowd is also a noisy proxy for
"good," and 5.5's sycophancy pays *at the ballot box*), and **vote brigading / targeting** —
once arena rank drives valuations, the arena is a target, and Goodhart never sleeps. The arena
is the best public instrument we have *and* a proxy with a countdown, like everything else in
this lesson.
`,
    },
    {
      type: 'example',
      title: 'Elo arithmetic, by hand',
      md: md`
**Gap to win-rate.** $\Delta = 100$: expected win rate $1/(1 + 10^{-100/400}) = 1/(1 + 0.562)
\approx 0.64$. $\Delta = 30$: $1/(1 + 10^{-0.075}) \approx 0.543$. $\Delta = 10$:
$\approx 0.514$. Notice how fast real gaps compress toward coin flips.

**Win-rate to votes needed.** To *detect* a gap you must distinguish its win rate from 0.50.
The SE of a measured win rate on $n$ votes is about $0.5/\sqrt{n}$ near 50%. Call a gap
detected at 2 SE:

- $\Delta = 30$ (edge 4.3 points): need $0.5/\sqrt{n} < 0.0215$, so $n > (0.5/0.0215)^2
  \approx 540$ votes.
- $\Delta = 10$ (edge 1.4 points): $n > (0.5/0.0072)^2 \approx 4{,}800$ votes.

Head-to-head, mind — votes between *that specific pair*, which are a small slice of an arena's
total. So when two models sit 10 Elo apart on a leaderboard, that ranking can be fuzzier than
the site's confidence intervals suggest for *your* use case: the votes that separated them came
from the crowd's prompt mix, not yours, and slicing to your domain (say, code, in your language)
can shrink the effective $n$ under the thousands the gap needs. The instrument is honest;
the headline reading of it usually isn't.
`,
    },
    {
      type: 'ponder',
      question: md`Model A scores **87%**, model B **85%**, on the same 500-question benchmark.
Marketing wants the headline. Before revealing: compute the standard error of each score
($\text{SE} = \sqrt{p(1-p)/n}$), combine them for the SE of the *difference* (independent errors
add in quadrature — 1.1's drunkard's walk again), and rule: is A better than B?`,
      answer: md`Each score's SE, using $p \approx 0.86$: $\sqrt{0.86 \times 0.14 / 500} \approx
0.0155$ — about **1.6 points**. The difference of two independent noisy numbers has SE
$\sqrt{1.55^2 + 1.55^2} \approx 2.2$ points. The observed gap is **2.0 points — less than one
standard error of the difference**. Verdict: statistically indistinguishable; a coin-flip-level
wobble, headline-ready. Now the part to never unsee: the industry routinely reports exactly
this — leaderboards ranked on 1–2 point gaps over a few hundred questions, no error bars in
sight, press coverage to match. You now carry a five-second smell test: $\text{SE} \approx
\sqrt{p(1-p)/n}$, double-ish it for a comparison, and any gap inside that band is noise wearing
a crown. (Two refinements worth knowing exist: paired-by-question comparison shrinks the
noise — same questions, so per-question difficulty cancels — and more questions shrink it like
$1/\sqrt{n}$: resolving a true 2-point gap comfortably wants thousands of questions, not 500.)`,
    },
    {
      type: 'text',
      md: md`
## How a researcher actually evaluates

Everything above is the public circus. Here is the craft as practiced inside a serious lab —
the capstone habits, each priced by this module:

**Keep private evals, and never optimize against them.** A held-out internal suite — real tasks
your users care about, fresh variants, never in any training mixture, never in the
hill-climbing loop. The moment a metric enters the decision loop ("retrain until internal-eval-7
improves"), its countdown starts. Some labs formalize the split: dashboards everyone tunes
against, and a locked set opened only for release decisions. A benchmark you never target is
the only kind that stays alive — you are managing an *epistemic* resource, and it depletes with
use.

**Test fresh variants routinely.** The contamination example's arithmetic, as a standing
process: every important public score gets a fresh-variant twin, and the delta is tracked like
a vital sign.

**Change one thing.** 5.3's ablation culture, applied to measurement: never compare two models
that differ in checkpoint *and* prompt template *and* sampling temperature (3.2) and call the
delta "the model." One variable, or the comparison is theater.

**Read the transcripts.** The single highest-leverage habit, and the one score-worship
crowds out: a number is a compression, and 1.5 taught you compression is lossy. Sit down with
forty failures and *taxonomize* them — arithmetic slips? instruction drift? retrieval misses?
premature refusals? Twenty transcripts of error analysis routinely reshape a roadmap that a
thousand aggregate scores left untouched, because the score says *how often* you fail and the
transcripts say *what to fix*.

**Put error bars on everything.** The binomial ponder's arithmetic — $\sqrt{p(1-p)/n}$, doubled
for comparisons — as a reflex. A 2-point gap on 500 questions is noise; say so, out loud, in
the meeting where it's inconvenient.

And over it all, the meta-principle, stated once with each of its three appearances in view —
the reward model (5.5), the benchmark (today), the arena (today):

> **Every eval is a proxy. The moment it becomes a target, schedule its funeral.**

Goodhart's law, third and final appearance. You cannot beat it; you can only stay ahead of it —
rotating instruments, keeping some unmarketed and untargeted, and reading transcripts, which
is the one instrument optimization pressure can't fake, because it isn't a number.
`,
    },
    {
      type: 'ponder',
      question: md`The daily craft, yours now. Your team claims your model is *better at
explaining technical concepts to beginners* than the rival's. Design the eval that would make a
skeptical researcher believe you: what exactly gets graded (a rubric), who or what judges (and
against which diseases you defend), how you contamination-proof it, and — from the binomial
ponder's arithmetic — how many samples you need. Sketch it before revealing.`,
      answer: md`A defensible design: **Prompts** — 300–1,000 freshly written explain-this-to-a-
beginner prompts across domains, authored privately, never posted (contamination-proofing by
construction), stratified by difficulty. **Rubric** — named criteria, separately scored:
factual correctness; no unexplained jargon (a term used before it's taught is a deduction — the
same standard this curriculum's 12-year-old questions apply to you); analogy quality (does it
*compute*, or decorate?); calibration of length to need. Concision as its own line, so
verbosity can't launder itself into "thoroughness." **Judging** — blind pairwise A/B (5.5's
bedrock: comparing beats absolute scoring), both orders judged and averaged (kills position
bias), rubric-anchored LLM judge for scale *plus* a human-judged subsample of 100+ pairs to
measure judge-human agreement before trusting the rest; ideally a judge from a third model
family (self-preference). **Sample size** — to resolve a 55/45 split (a 5-point edge):
SE of a win rate is $0.5/\sqrt{n}$, so 2-SE detection needs $n > (0.5/0.025)^2 = 400$;
call it 500+ pairs, and report the win rate *with its SE*. **Hygiene** — the set is
held out: the day it enters a training mixture or a hill-climbing loop, it's dead
(the meta-principle), so version it, lock it, and budget its replacement. Nothing exotic
anywhere — rubric, blinding, swaps, arithmetic, humility. That's the job: measurement design
*is* research craft, and this exercise is closer to a frontier researcher's Tuesday than
anything else in the module.`,
    },
    {
      type: 'text',
      md: md`
## Closing the module — and the technical curriculum

Look back along the whole arc of Module 5, because it is one continuous story now:

- **5.1 — the diet.** What 15 trillion tokens are, where they come from, why dedup and quality
  filtering are destiny — and a tease about exam questions hiding in the food, cashed today.
- **5.2 — the curve.** Loss falls as a power law smooth enough to bet nine figures on;
  Chinchilla's 20-to-1; emergence as metric forensics — cashed today as scoring-rule
  skepticism.
- **5.3 — the run.** Months, megawatts, dashboards, ablation culture — cashed today as
  change-one-thing measurement hygiene.
- **5.4 — the costume-fitting.** Demonstrations teach format and persona, with imitation's
  ceiling and blind spot.
- **5.5 — the judgment.** Train on preferences; Bradley–Terry; the leash; Goodhart named —
  cashed today twice, on benchmarks and on arenas.
- **5.6 — the measurement.** Every instrument a proxy, every proxy on a countdown, and the
  craft habits that keep you honest anyway.

And now zoom all the way out, because you've earned it. **Modules 1 through 5 took you from a
dot product to a shipped, measured frontier model.** You started with two arrows and an
agreement-meter (1.1); built gradients and the machinery of learning (1.3, 1.6); probability,
softmax, and the loss that runs everything (1.4, 1.5); attention and the transformer; sampling
(3.2), the chat costume (3.5), reasoning and its costs (3.6); the systems that serve it; and
finally this module — data, scaling, the run, SFT, preference tuning, and today, the honest
accounting of whether any of it worked. Every mysterious constant got derived. Every teased
debt got paid. That is the established craft: what the field, collectively, knows how to do.

## What you now own

1. **Loss is necessary, not sufficient:** perplexity tracks capability (5.2) but post-training
   deliberately trades it away — the aligned model has worse perplexity than its base.
2. **Benchmark anatomy:** the six category-types, and the reflex that *scoring rules move
   scores as much as models do* (5.2's forensics, now a daily tool).
3. **Contamination:** the web feeds both the model and the exam; symptoms (off-curve scores,
   verbatim recall, fresh-variant drops), defenses (exclusion, canaries, private sets,
   rotation), and the honest arms-race framing — 5.1's tease, paid.
4. **Benchmark death:** a public benchmark is a shared, frozen, leash-less reward model;
   Goodhart guarantees the treadmill; saturation gaps are label noise ranking nobody.
5. **LLM-as-judge:** a reward model in a grader's costume — position, verbosity,
   self-preference, confidence biases — with swap/rubric/ensemble/human-anchor mitigations.
6. **Arenas and Elo:** Elo *is* Bradley–Terry ($\sigma(\Delta/174)$; 100 points = 64% win
   rate); crowd preference honestly measured, narrowly meaningful, and itself now a target.
7. **The researcher's craft:** private held-out evals, fresh variants, one-variable
   comparisons, transcript-reading over score-worship, error bars by reflex
   ($\sqrt{p(1-p)/n}$ — 2 points on 500 questions is noise), and the meta-principle: every
   eval is a proxy; when it becomes a target, schedule its funeral.

**The bridge to Module 6 — the edge.** Everything so far is the established craft. What remains
is the frontier, where the questions stop having settled answers. Three of them, all
promised long ago: **interpretability** — what *is* actually happening inside those matrices
(the induction heads teased in 2.3; the superposition your 1.1 ponder discovered when random
vectors refused to be perpendicular); **alignment beyond RLHF** — 5.5 ended on the honest
caveat that preference learning only works while judges can judge, and scalable oversight is
the open problem that inherits everything this lesson taught about proxies; and **the
literature itself** — how to read a paper the way you now read a leaderboard (skeptically,
arithmetically, transcripts over headlines), how to judge one, and how, eventually, to write
one. You have the established craft. Next: the edge, where you stop learning the field and
start pushing it.
`,
    },
  ],
  questions: [
    {
      id: 'm5-l6-q1',
      kind: 'mcq',
      prompt: md`Your aligned chat model has *worse* perplexity on a held-out text corpus than
the raw base model it was trained from. What does this mean?`,
      options: [
        md`Something went wrong in post-training — the model regressed and needs retraining`,
        md`Nothing alarming: post-training deliberately trades likelihood-on-text for instruction-following and preference-shaped behavior, so worse perplexity with a better assistant is the expected signature`,
        md`The held-out corpus must be contaminated with the base model's training data`,
        md`Perplexity was computed incorrectly — an aligned model assigns probabilities the same way its base does`,
      ],
      answer: 1,
      explain: md`SFT and preference tuning (5.4, 5.5) drag the distribution away from
raw-web-text toward preferred behavior — an alignment tax paid in likelihood, bought back in
usefulness. Option A tempts precisely because 5.2 trained you to treat loss as *the* progress
meter — within pretraining it is; post-training breaks that coupling *on purpose*, and knowing
where a meter's jurisdiction ends is this lesson's opening point. Option C misapplies today's
contamination lesson (contamination inflates performance on *evals*, and would cut perplexity,
not raise it). Option D is backwards: post-training exists precisely to change what the model
assigns probability to.`,
    },
    {
      id: 'm5-l6-q2',
      kind: 'numeric',
      prompt: md`A model scores 85% on a 500-question benchmark. Compute the standard error of
that score, in percentage points: $\text{SE} = \sqrt{p(1-p)/n}$. (One decimal.)`,
      answer: 1.6,
      tolerance: 0.3,
      explain: md`$\sqrt{0.85 \times 0.15 / 500} = \sqrt{0.000255} \approx 0.016$ — about
**1.6 points**. So this "85%" is honestly 85 ± 1.6, and a comparison between two such models
carries roughly $\sqrt{2} \times 1.6 \approx 2.2$ points of noise. Burn the reflex in: every
percentage on every leaderboard has this number silently attached, computable in five seconds
from $n$ alone — and 500-question benchmarks cannot resolve the 1–2 point gaps that routinely
make headlines.`,
    },
    {
      id: 'm5-l6-q3',
      kind: 'mcq',
      prompt: md`Which observation is the *strongest* evidence that a model's high benchmark
score reflects contamination rather than capability?`,
      options: [
        md`The model beats the previous state of the art by 9 points — an implausibly large jump`,
        md`Prompted with the first half of a benchmark question, the model completes the second half verbatim — and its score drops sharply on freshly written same-difficulty variants`,
        md`The model's score has stayed identical across its last three checkpoints`,
        md`The model performs much better on multiple-choice benchmarks than on free-form generation tasks`,
      ],
      answer: 1,
      explain: md`Verbatim completion proves the text was *in the training data* (memorization
caught in the act), and the fresh-variant drop quantifies how much of the score was the answer
key rather than the skill — mechanism plus magnitude, the smoking-gun pair. Option A tempts
because big jumps do raise eyebrows — but genuine breakthroughs also produce big jumps;
surprise alone convicts nobody without the follow-up forensics. Option C is unremarkable
(converged scores are normal). Option D reflects format-dependent difficulty and scoring-rule
effects — this lesson's *other* measurement pitfall, not contamination.`,
    },
    {
      id: 'm5-l6-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** (1) Starting from the Elo expected-score formula
$\mathbb{E}[\text{win}] = 1/(1 + 10^{-\Delta/400})$, show algebraically that it is a sigmoid
$\sigma(\Delta/s)$, and find $s$ (use $10^{x} = e^{x \ln 10}$, $\ln 10 \approx 2.30$).
(2) Compute the expected win rate at $\Delta = 100$. (3) In 2–3 sentences: map each piece of
arena Elo onto 5.5's reward-model training — what plays the responses, the human picks, the
scores — and state what this identity says about where the curriculum's preference math keeps
reappearing.`,
      rubric: md`**(1)** $10^{-\Delta/400} = e^{-\Delta \ln 10 / 400}$, so
$\mathbb{E}[\text{win}] = 1/(1 + e^{-\Delta \ln 10/400}) = \sigma(\Delta \ln 10 / 400) =
\sigma(\Delta / 174)$ with $s = 400/\ln 10 \approx 174$. The base-change step must be shown —
that's the derivation; asserting "Elo is a sigmoid" from memory is what this question is not.

**(2)** $10^{-100/400} = 10^{-0.25} \approx 0.562$, so $\mathbb{E} = 1/1.562 \approx
\mathbf{0.64}$.

**(3)** The mapping: two *models* play the role 5.5 gave to two *responses*; a crowd vote plays
the human pick; Elo ratings play the reward scores $r$; and the fitting procedure is the same
maximum-likelihood-under-Bradley–Terry (cross-entropy on outcomes, 1.5), with the same
shift-invariance — only rating gaps mean anything. Full credit requires the punchline stated
plainly: an arena is a reward model trained over models — one piece of 1952 math (softmax over
two options, 1.4) underlies RLHF's judge and the industry's most-watched leaderboard alike, so
every bias lesson from 5.5 transfers to arenas by construction.`,
    },
    {
      id: 'm5-l6-q5',
      kind: 'mcq',
      prompt: md`An LLM judge, comparing two answers of equal factual quality, reliably prefers
the longer one. Why did this lesson claim you could have *predicted* that bias without running
the experiment?`,
      options: [
        md`Longer answers genuinely contain more information, so the judge is correctly rewarding thoroughness`,
        md`An LLM judge is functionally a reward model — a learned proxy of human preference — and 5.5 showed such proxies absorb the length-quality correlation from human preference data and misapply it as cause: the same disease, relocated from training to measurement`,
        md`Longer answers take more compute to process, and models assign higher scores to inputs they spend more compute on`,
        md`This is position bias: longer answers usually appear second, and judges favor the second slot`,
      ],
      answer: 1,
      explain: md`The judge was trained (or prompted into behaving as) a model of human
preference, and 5.5 derived exactly what such proxies do: length correlates with quality
on-distribution, correlation gets learned as cause, and off-distribution the bias pays out
— whether a policy is exploiting it (RLHF) or a grader is exercising it (evals). Option A is
the tempting one because the underlying correlation is *real* — that's precisely why the proxy
learned it; the bias is preferring length *at equal quality*, where the correlation should pay
nothing. Option C invents a mechanism (compute spent doesn't set scores). Option D names a
real, different judge disease — position and verbosity bias are separately measured, and
position swapping fixes only the former.`,
    },
    {
      id: 'm5-l6-q6',
      kind: 'numeric',
      prompt: md`Two models sit 100 Elo points apart on an arena leaderboard. What win rate does
that predict for the higher-rated model — as a decimal, two places? ($\mathbb{E} =
1/(1 + 10^{-\Delta/400})$.)`,
      answer: 0.64,
      tolerance: 0.02,
      explain: md`$10^{-100/400} = 10^{-0.25} \approx 0.562$, so $1/1.562 \approx 0.64$. A
hundred points — a gap the leaderboard renders as a chasm — means the "better" model loses 36
matchups in 100. And the typical gaps between adjacent frontier models are far smaller: at
$\Delta = 30$ the win rate is 0.543, at $\Delta = 10$ it's 0.514 — coin-flips with a limp,
needing hundreds to thousands of head-to-head votes just to detect. Elo's sigmoid compresses
exactly where the marketing wants you to see distance.`,
    },
    {
      id: 'm5-l6-q7',
      kind: 'numeric',
      prompt: md`**Fermi — why LLM-judging exists.** You need to grade a 10,000-question eval
with an LLM judge. Each judgment costs about 2,000 tokens (question, response, rubric,
verdict) at roughly 2–3 dollars per million tokens. Estimate the total cost in **dollars**.
(Generous tolerance — get the order of magnitude and the point makes itself.)`,
      answer: 50,
      tolerance: 40,
      explain: md`$10^{4} \times 2 \times 10^{3} = 2 \times 10^{7}$ tokens — 20 million — at
~2.50 per million $\approx$ **50 dollars**. Anything from ~20 to ~90 is a fine estimate. Now
the comparison that explains the industry: careful *human* judgment at ~2 dollars per item
runs $\approx$ 20,000 dollars for the same eval — a gap of roughly three orders of magnitude.
That ~1000× is the entire reason LLM-as-judge exists, and it has a sting: evals this cheap get
run on every checkpoint, which quietly promotes them from instrument to *target* — and you know
what happens to targets.`,
    },
    {
      id: 'm5-l6-q8',
      kind: 'numeric',
      prompt: md`Contamination check: a model scores 91% on a public benchmark but 78% on 300
freshly written same-difficulty variants. Using the fresh score's standard error
($\sqrt{p(1-p)/n}$), how many SEs wide is the 13-point drop? (One decimal; generous
tolerance.)`,
      answer: 5.4,
      tolerance: 1.5,
      explain: md`$\text{SE} = \sqrt{0.78 \times 0.22 / 300} = \sqrt{0.000572} \approx 0.024$ —
about 2.4 points. The drop spans $13/2.4 \approx$ **5.4 standard errors**. Sampling noise
lives at 1–2 SE; 5+ SE is a verdict: a large slice of the public score was the answer key, and
the model's real skill on this family sits near 78%. This two-number forensic — fresh-variant
delta over its SE — is among the highest-value-per-minute computations in a researcher's kit:
one afternoon of question-writing, one division, and a marketing narrative dies.`,
    },
    {
      id: 'm5-l6-q9',
      kind: 'mcq',
      prompt: md`Your team adds benchmark-lookalike material to the training mixture; the target
benchmark's score rises 8 points (far beyond noise). What did you learn about the model's
general capability?`,
      options: [
        md`It improved substantially — the benchmark is a standard, validated measure of general capability`,
        md`Approximately nothing: by targeting the measure you broke its meaning — the 8 points measure your targeting, not generality; only untargeted evals can now tell you what actually changed`,
        md`Nothing happened at all — an 8-point move on a benchmark is within normal statistical noise`,
        md`The benchmark must have already been contaminated before your change`,
      ],
      answer: 1,
      explain: md`Goodhart, applied with your own hands: a benchmark's validity rests on the
model *not* being optimized toward it, and you just were. The 8 points are real movement on the
proxy with unknown — possibly zero, possibly negative — movement on the target. Option C tempts
via this lesson's noise arithmetic, but misapplies it: 8 points on any reasonably sized set is
many SEs — the score genuinely rose; it just stopped *meaning*. Distinguishing "the number
didn't move" (noise) from "the number moved but the meaning broke" (Goodhart) is precisely the
skill. Option A is the pre-lesson instinct. Option D deflects: contamination is someone else's
leak; this is your own targeting — and the honest next step is checking fresh variants and the
untargeted internal suite.`,
    },
    {
      id: 'm5-l6-q10',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old.** The kid reads a headline: "New AI scores 90%
on the big test — smarter than ever!" Explain: (1) two different ways a 90% can be less
impressive than it sounds (one involving how the AI studied, one involving what happens when
everyone practices the same test), (2) how you'd check whether the 90% is real, and (3) why
"90% beats 88%" might not mean anything at all. Kid-words only — any technical term must be
explained before use.`,
      rubric: md`Grade the teaching:

1. **The two deflations** — (a) the answer key was in the study pile: the AI reads basically
   the whole internet, the test's questions and answers are *on* the internet, so it may have
   memorized these exact questions — that's remembering, not understanding (kid-translation of
   contamination); (b) teaching to the test: once every AI team practices for the same famous
   test, being good at *that test* stops meaning being good at *the subject* — like a class
   drilled on last year's exam (kid-translation of Goodhart). Both beats required.
2. **The check** — write brand-new questions of the same kind that have never been on the
   internet and re-test; if 90% falls to 75%, the difference is the memorized part. (Bonus
   credit: "see if it can finish the old test's questions word-for-word from memory.")
3. **90 vs 88** — a test is like coin flips: scores wobble a couple of points by pure luck
   unless the test is very long, so a 2-point gap on a few hundred questions is often a tie
   wearing a trophy. Any honest luck/wobble analogy earns it; citing the actual arithmetic is
   bonus, not required.
4. **Jargon audit:** "benchmark," "contamination," "Goodhart," "standard error," "eval,"
   "held-out" unexplained = partial credit at best — unexplained jargon is the exact failure
   mode this exercise exists to catch.`,
    },
    {
      id: 'm5-l6-q11',
      kind: 'written',
      prompt: md`**Design the eval.** Your team claims the new model writes better
customer-support replies than the incumbent. Design the evaluation that would convince a
skeptical researcher: the prompt set (with contamination-proofing), the grading scheme (rubric
and judges, naming the judge biases you defend against and how), the sample size (justify with
binomial arithmetic), and two hygiene rules that keep the eval alive after this study.`,
      rubric: md`A convincing design needs all four pillars:

**Prompt set:** several hundred realistic support scenarios, freshly written or drawn from
private (properly anonymized) tickets — never posted publicly, never in any training mixture;
stratified across difficulty and issue types. Contamination-proofing must be *by construction*
(private/fresh), not by hoping.

**Grading:** blind pairwise A/B (5.5's bedrock: comparing beats absolute scoring), with named
rubric criteria — correctness of the resolution, tone, concision *as its own scored line* (so
verbosity bias can't hide in "quality"). Judge diseases and defenses, at least two: position
bias → judge both orders and average; verbosity bias → the separate concision criterion;
self-preference → a judge from a different model family; and a human-graded subsample (~100
pairs) to measure judge-human agreement before trusting the LLM judge at scale.

**Sample size:** binomial arithmetic actually run — e.g., to detect a 55/45 win split at 2 SE:
$\text{SE} \approx 0.5/\sqrt{n}$, need $0.5/\sqrt{n} < 0.025$, so $n > 400$; call it 500+
pairs, and commit to reporting the win rate with its SE. Any equivalent computation (or
"a 2-point gap needs thousands") earns full marks; a bare "500 feels like enough" does not.

**Hygiene (any two):** the set never enters training data or a hill-climbing loop; version and
lock it, budget periodic fresh replacements; pre-register the metric before running (no
post-hoc rubric shopping); report the uncertainty in the headline claim.

Full credit = all four pillars with the arithmetic actually shown and at least two judge
diseases defended against by name.`,
    },
    {
      id: 'm5-l6-q12',
      kind: 'written',
      prompt: md`**The skeptic's memo.** A rival announces state-of-the-art: 2 points ahead of
your model on a famous 4-year-old benchmark (500 questions), with a screenshot of the
leaderboard. Your CEO forwards it: "True? And does it matter?" Write the researcher's reply:
the noise arithmetic, at least two mechanisms (from this lesson) other than capability that
could produce the gap, and what evidence — theirs or yours — would actually settle the
question.`,
      rubric: md`**The arithmetic (required, computed):** per-model SE at ~90% on 500 questions
$= \sqrt{0.9 \times 0.1/500} \approx 1.3$ points (≈1.5–1.6 near 85%); difference SE $\approx
\sqrt{2} \times 1.4 \approx 2$ points. The 2-point lead is ~1 SE: statistically
indistinguishable before any other concern. This alone answers "true?": *not established*.

**Mechanisms (any two, clearly explained):** contamination — a 4-year-old benchmark is
thoroughly marinated in every recent crawl, and their newer crawl may be *more* contaminated;
Goodhart/targeting — aged famous benchmarks are hill-climbed via data mixture, checkpoint
selection, and prompt-template shopping, so top-of-leaderboard deltas measure targeting;
harness/scoring differences — exact-match vs log-prob vs template can move scores several
points with zero model difference; saturation — at 90%+, remaining gaps are substantially
label noise, ranking nobody.

**What would settle it (at least two):** fresh-variant testing on same-difficulty items both
models have never seen (with the delta-over-SE forensic); your private held-out suite, never
targeted by either lab; blind pairwise human or arena-style comparison on *your users'* prompt
distribution, with enough votes (the Elo example's hundreds-to-thousands); error analysis —
read transcripts from both models on the tasks that matter commercially.

**Tone (the capstone habit):** the memo neither panics nor dismisses — it prices the claim
(currently ~noise), names the checks, and proposes the cheap decisive experiment. Full credit
requires the computed arithmetic, two named mechanisms, and two named decisive tests.`,
    },
  ],
}
