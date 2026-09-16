// Module 7, Lesson 4 — Preference tuning in practice (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm7-l4',
  title: '7.4 Preference tuning in practice — what you actually run',
  subtitle:
    'Lesson 5.5 gave you RLHF as an idea. This is the Monday-morning version: one GPU, a few thousand thumbs, and a family of methods whose entire history is a sequence of deletions. Also the lesson where GRPO stops being an acronym and becomes something you could derive on a napkin.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

You have shipped an 8-billion-parameter model. It is *good*. It passes your evals, it does not
hallucinate more than the baseline, its code compiles. And your users quietly hate it.

Read the complaints and none of them is a factual error. It opens every answer with "Great
question!" It writes six paragraphs where two would do. It hedges on things it obviously knows. It
apologises when nobody accused it of anything. The model is technically correct and subtly
annoying, which is the one failure mode supervised fine-tuning (5.4) is worst at fixing — because
SFT can only imitate answers somebody wrote down, and nobody writes down *"here is the version of
this answer that doesn't make you want to close the tab."*

What you *do* have is a table with a few thousand rows in it: prompt, response, and a single bit —
thumbs up or thumbs down — from real users. What you have in hardware is one GPU. What you do not
have: a reward model, a distributed RL cluster, an annotation vendor, or three months.

So: **what do you actually run on Monday?**

Here is the uncomfortable part. If you had asked this question in 2022 the answer was PPO. In 2023
it was DPO. In 2024 half the field said KTO or ORPO and the other half said GRPO. In 2025 a lot of
people said "use a verifier and skip preferences entirely." That is four answers in four years, and
if you learn the four answers you will be wrong again next year.

So we are going to learn the *reason the answer keeps moving* instead. And it turns out there is
exactly one storyline, running in one direction:

> **Every new preference-tuning method is defined by what it deletes.**

Not by what clever thing it adds — by which expensive, fragile component of the previous method it
proves you never needed. Once you see the sequence of deletions, the next method that comes out
will slot into it, and you will be able to ask the only question that matters: *what did this one
remove, and what did removing it cost?*

## The starting position: RLHF with PPO, and its four resident models

Recall the shape of classical RLHF from 5.5. You collect preference pairs, fit a Bradley–Terry
reward model to them, then run reinforcement learning against that reward with a KL penalty
tethering you to the starting model. Conceptually: three moving parts.

Count what is *resident in GPU memory* while it runs, though, and use lesson 4.1's arithmetic
(a trainable parameter costs about 16 bytes once you count fp16 weights, gradients, and the
optimizer's two Adam moments plus an fp32 master copy; a frozen one costs about 2):

| model | role | trainable? | 7B cost |
|---|---|---|---|
| policy | the thing you are improving | yes | $7\times10^9 \times 16 \approx 112$ GB |
| critic (value network) | predicts expected return, to form the advantage baseline | **yes** | $\approx 112$ GB |
| reference | the frozen starting model, for the KL leash | no | $\approx 14$ GB |
| reward model | scores completions | no | $\approx 14$ GB |

That sums to roughly **250 GB** of resident state for a 7B model — and the surprise for most people
is the second row. The critic is not a small head bolted onto the policy; in the standard recipe it
is *another full-size network with its own optimizer state*, and it is being trained at the same
time as the policy, from a moving target. Add a sampling loop (you must generate completions, which
is slow), plus PPO's famous sensitivity to its own hyperparameters, and you have a method that is
genuinely powerful and genuinely miserable.

Everything that follows is someone looking at that table and asking: *do I actually need this row?*

## Deletion 1 — DPO removes the reward model **and** the RL loop

The DPO insight, stated (5.5 derived it; do not re-derive it): for the KL-anchored RLHF objective,
the optimal policy and the reward function are related in **closed form**. Given the reward, you
know the optimal policy. Invert it: given a policy, you know what reward it is implicitly optimal
for. So the reward model was never an independent object — it was a change of variables.

Substitute that inversion into the Bradley–Terry likelihood of your preference pairs and the reward
model cancels out of the problem entirely, leaving a *classification-style* loss on the pairs
themselves:

$$\mathcal{L}_{\text{DPO}} = -\log \sigma\!\left(\beta \log \frac{\pi_\theta(y_w \mid x)}{\pi_{\text{ref}}(y_w \mid x)} - \beta \log \frac{\pi_\theta(y_l \mid x)}{\pi_{\text{ref}}(y_l \mid x)}\right)$$

where $y_w$ is the chosen (winning) response, $y_l$ the rejected one, and $\sigma$ is the sigmoid
from 1.4. Read it in words and it is almost boring: **raise the log-probability of the chosen
response relative to the rejected one — where "relative" is measured against a frozen reference
model, and $\beta$ says how hard you are allowed to push.** No reward model. No sampling loop. No
critic. Two models in memory instead of four, one of them frozen: about **130 GB** at 7B instead of
250, and the training loop is a supervised loop that looks like any other.

The bill for this comes due somewhere, and it is worth naming precisely: DPO is **off-policy**. It
learns from a fixed dataset of pairs that some other model or some human produced. It never
generates anything, so it never discovers anything. It re-ranks what it was shown. Hold that
thought — it is the first ponder.

## The rest of the deletions

Once you see the move, the family tree writes itself. Each of these is one row of the table, or one
assumption, being crossed out:

**IPO deletes the assumption that preferences are noiseless.** DPO's log-sigmoid loss is minimised
by driving the implicit margin to $+\infty$. If your pairs are clean and deterministic — every
annotator agreed, or a rule generated them — nothing stops it from going there, and a model that
has pushed the margin to infinity has drifted arbitrarily far from the reference in pursuit of
pairs it already gets right. That is over-fitting with extra steps. IPO replaces the log-sigmoid
with a squared loss that targets a *finite* margin, so the objective has a bottom and the model
stops when it gets there.

**KTO deletes the requirement for pairs.** And this one matters more in practice than its academic
profile suggests, so slow down. DPO needs $(x, y_w, y_l)$ — *the same prompt, two responses, a
judgment about which is better.* Now go look at your production feedback table again. It is
thumbs-up and thumbs-down on **single** responses to **different** prompts. Nobody showed your user
two answers. Converting that into DPO pairs means either throwing away most of it or manufacturing
fake pairs across different prompts, which teaches the model which *prompts* are nice rather than
which *responses* are. KTO (named after Kahneman–Tversky prospect theory, whose value function it
borrows) learns from unpaired desirable/undesirable labels directly: this response was good, that
one was bad, no comparison required. It eats the data you actually have instead of the data the
paper assumed you had.

**ORPO deletes the separate SFT stage.** Standard pipeline: SFT first, then preference-tune the SFT
model. ORPO folds an odds-ratio preference term straight into the SFT loss so one run does both —
one training job, one set of hyperparameters, no reference model needed because there is no
"before" model to be anchored to.

**SimPO deletes the reference model.** Look again at the DPO loss: $\pi_{\text{ref}}$ appears twice,
which means two extra forward passes per pair and a second set of weights resident. SimPO replaces
the reference-relative reward with a **length-normalised** average log-probability — the average
log-prob per token, which is reference-free and, not coincidentally, does not automatically reward
being longer. One model in memory. (Whether it is *better* is contested; that it is cheaper is not.)

Now put them in a row and the pattern is unmistakable:

| method | what it deletes | what that costs |
|---|---|---|
| PPO / RLHF | — (the baseline everything else edits) | 4 models, sampling loop, instability |
| DPO | reward model + RL loop | off-policy: cannot explore |
| IPO | the noiseless-preference assumption | slightly weaker fit on genuinely clean data |
| KTO | the need for pairs | no explicit comparison signal to lean on |
| ORPO | the separate SFT stage | less control over each stage independently |
| SimPO | the reference model | no explicit anchor; needs careful tuning |

## The honest verdict, which is not a verdict

You want me to tell you which one wins. I can tell you what is defensible as of now, and flag which
parts move:

- **DPO-family methods dominate small-scale practice**, and deservedly: simple, stable, runs on
  hardware you own, no reward model to maintain or hack. If you have preference data and one GPU,
  this is your default and you should feel no shame about it.
- **On-policy RL still wins where exploration matters** — where the good behaviour is not in your
  dataset and has to be *found*. Every strong reasoning model of the last two years got there with
  on-policy RL, not with offline preference pairs.
- **The head-to-head comparisons genuinely disagree with each other**, and the disagreements
  usually trace to unequal tuning budgets, different base models, or evaluation by an LLM judge
  that likes long answers. Anyone who tells you flatly that "DPO beats PPO" or "PPO beats DPO" is
  quoting one table.
- **This section has a shelf life.** The specific rankings here are a snapshot; the *deletion
  logic* is the durable part. When the next acronym lands, ask what row of the table it crossed out.
`,
    },
    {
      type: 'ponder',
      question: md`DPO is **off-policy**: it only ever sees the pairs sitting in your dataset, and
it never generates a completion of its own. Name a *concrete* capability that on-policy RL could
discover and DPO structurally cannot — and say precisely why the difference is structural rather
than a matter of having more data. (Try to name a real behaviour, not "it would be better.")`,
      answer: md`Concrete example: **a model discovering that it should check its own arithmetic by
re-deriving the answer a second way before committing.** Or: backtracking mid-solution when a
branch stops working. Or: deciding to call a tool it was never shown being called in that
situation. Or, less loftily, a phrasing style no annotator ever produced that users nonetheless
prefer.

The structural reason: **DPO's learning signal is bounded by the support of its dataset.** Its loss
is a comparison between two completions that already exist. Whatever it does, it is redistributing
probability mass between things it was handed — it can tell you the chosen answer beats the
rejected answer, and nothing at all about the answer nobody wrote. On-policy RL closes a different
loop: the model **samples its own completions**, and those samples can contain behaviour that
appears nowhere in any human dataset. If one of them happens to work, the reward signal reinforces
it, and it becomes more likely, and then variations of *it* get sampled. That is a search process
with feedback. DPO is a re-ranking.

This is why "self-verification" and long chains of backtracking emerged from RL runs rather than
from preference datasets: no annotator sat down and wrote out the twelve-step wrong-turn-then-
recovery trace that turned out to be the useful behaviour. The model found it by trying, and got
paid for it.

More data does not fix this, which is the part worth internalising. A dataset ten times larger is
still a fixed set; if the behaviour is outside it, DPO's gradient has literally no term that could
point toward it. The only fix is to let the model generate — at which point you have re-invented
on-policy training and inherited its costs. **The exploration/cheapness trade is the real axis of
this whole lesson**, and every method above sits somewhere on it.`,
    },
    {
      type: 'example',
      title: 'one DPO step on one pair — and why the reference model is in the formula at all',
      md: md`
Take a single training pair. Prompt: *"Is 7 a prime number?"*

- **Chosen** $y_w$: "Yes — its only divisors are 1 and 7."
- **Rejected** $y_l$: "Great question! Primality is a rich topic. Let me walk you through it
  carefully. First, a definition..." (four more paragraphs, ending in "yes").

Suppose the current policy and the frozen reference assign these total log-probabilities:

| | $\log \pi_\theta$ | $\log \pi_{\text{ref}}$ | log-ratio |
|---|---|---|---|
| chosen $y_w$ | $-20$ | $-20$ | $0$ |
| rejected $y_l$ | $-22$ | $-25$ | $+3$ |

Read the last column before doing any arithmetic, because it is the whole point. The chosen answer
is exactly as likely under the policy as under the reference: no movement. The rejected answer is
$e^3 \approx 20$ times **more** likely under the policy than under the reference — the SFT run
taught it to be chatty and it has drifted in that direction. The reference model is what lets you
*see* that drift; raw log-probabilities could not, because a long response is always less likely
than a short one simply for having more tokens to be uncertain about. **The reference is a
per-example difficulty calibration.** It answers "compared to where you started," not "compared to
zero."

Now the loss, with a typical $\beta = 0.1$:

$$\text{margin} = \beta(0 - 3) = -0.3, \qquad \mathcal{L} = -\log\sigma(-0.3) = -\log(0.426) \approx 0.854$$

Since $-\log \sigma(0) = \log 2 \approx 0.693$, a loss of $0.854$ means this model is currently
**worse than a coin flip** on this pair: it prefers the answer the human rejected. Good — that is
exactly the pair you want in your dataset.

The gradient does the obvious thing, weighted by how wrong you are: it pushes $\log \pi_\theta(y_w)$
**up** and $\log \pi_\theta(y_l)$ **down**, and the size of the push scales with $\sigma$ of the
*negative* margin — i.e. pairs the model already gets right contribute almost nothing, and pairs it
gets badly wrong dominate. That automatic focusing is why DPO trains fast on few examples.

**Now the trap that catches everyone**, and it is well documented: DPO frequently drives *both*
log-probabilities **down**, with the rejected one falling faster. The margin grows, your training
accuracy hits 90%, your dashboard is green — and the model has become less likely to produce the
chosen response too. It is winning the comparison by making everything unlikely, and what fills the
vacated probability mass is unpredictable (often: shorter, blander, or degenerate text).

**Practitioner rule, worth taping to your monitor:** log the chosen and rejected log-probabilities
as two separate curves, never just the margin or the pairwise accuracy. If $\log \pi_\theta(y_w)$ is
falling, you have a problem no accuracy metric will show you.
`,
    },
    {
      type: 'text',
      md: md`
## GRPO, derived rather than announced

Now go back and stare at the second row of the memory table — the critic — because that is the one
that costs the most and is the least obviously necessary. Getting rid of it is the idea that made
large-scale RL affordable, and it is the bridge to Module 8's teardown of DeepSeek's training
recipe, so let us actually build it.

**Why a critic exists at all.** Policy-gradient methods push up the log-probability of actions in
proportion to how good they were. But "how good" cannot be the raw reward, for a reason that is
easy to feel: if every completion to some prompt scores between $0.80$ and $0.85$, then multiplying
by raw reward pushes *everything* up, hard, and the useful information — which of them was
relatively better — is a rounding error riding on a huge common signal. The updates are enormous
and nearly uninformative. High variance, slow learning.

The fix is to subtract a **baseline**: compare each completion not to zero but to what you
*expected* for this prompt. Then the update carries only the surprise. That quantity — reward minus
expectation — is the **advantage**, and PPO estimates the expectation by training a value network
to predict it. Hence the critic: a whole second network, with a whole second optimizer state,
learning a moving target, contributing its own failure modes (a badly fit critic poisons every
advantage it touches).

**GRPO's move is embarrassingly simple once you see it.** You are already sampling completions.
So sample *several* — a **group** of $G$ of them for the same prompt, typically 4 to 64. Score all
of them. Now you do not need a network to predict the expected reward for this prompt, because you
are holding $G$ samples of it:

$$A_i = r_i - \underbrace{\frac{1}{G}\sum_{j=1}^{G} r_j}_{\text{the group mean}} \qquad \text{(optionally divided by the group's standard deviation)}$$

The baseline is now **a statistic you computed anyway**. The critic is deleted — not approximated,
not shrunk, *deleted* — and replaced by the mean of numbers already sitting in your batch.

Before we verify that this is legitimate, do the ponder. It is the question a reviewer would ask.
`,
    },
    {
      type: 'ponder',
      question: md`Subtracting a baseline from the reward is not automatically safe — subtract the
wrong thing and you are no longer estimating the gradient of the objective you meant to optimise,
you are optimising something else. So: **what property must a baseline have in order not to bias
the update?** State the property first, then check whether the group mean satisfies it. (Careful:
the group mean is computed from the very samples you are updating on. Is that a problem?)`,
      answer: md`**The property: a baseline may depend on the state (here: the prompt), but it must
not depend on the action taken (here: the particular completion being updated).** That is the whole
condition. The reason is a one-line cancellation — the expected value of the score function
$\nabla_\theta \log \pi_\theta(a \mid s)$ under the policy is zero, so any quantity that is constant
across actions for a given state contributes exactly zero to the expected gradient in expectation.
It shifts nothing and biases nothing; it only changes the *variance*. Anything action-dependent
breaks that cancellation and quietly changes your objective.

**Does the group mean qualify?** Yes — it is a function of the prompt and of the policy, not of
which completion you are currently pushing on. Every completion in the group is scored against the
*same* number. That is precisely what a value function was providing: a per-prompt expectation. A
learned $V(s)$ and a Monte-Carlo mean over $G$ samples for the same $s$ are two estimators of the
same quantity, and one of them requires no network.

**The catch you should have flagged:** the mean is computed *from the samples being updated*, so
each completion's own reward is inside its own baseline — a $1/G$ self-dependence, which is a mild
action-dependence and therefore a small bias. It shrinks like $1/G$, it is standard practice to
live with it (some variants use a leave-one-out mean to remove it exactly), and it buys you an
entire deleted network. That is a trade worth making, and being able to *name* the bias you are
accepting is the difference between using a method and understanding it.

**A second catch, less mild:** dividing by the group's standard deviation is *not* covered by the
argument above — the std is also computed from the samples, and it re-weights whole prompts, giving
large updates to prompts where the group happened to agree. There is an active line of criticism
arguing this biases training toward low-variance prompts and that the division should be dropped.
Treat the std normalisation as a tunable convenience, not as part of the derivation.`,
    },
    {
      type: 'example',
      title: 'the group advantage, end to end',
      md: md`
One prompt: *"A train leaves at 3pm travelling 60 km/h..."*. Sample $G = 4$ completions, score each
with your reward source (a reward model, or a verifier that returns 1 for a correct final answer).
Rewards come back:

$$r = (0.9,\; 0.4,\; 0.2,\; 0.5)$$

**Step 1 — the baseline.** $\bar r = (0.9 + 0.4 + 0.2 + 0.5)/4 = 2.0/4 = 0.5$.

**Step 2 — the advantages.**

$$A = (0.9 - 0.5,\; 0.4 - 0.5,\; 0.2 - 0.5,\; 0.5 - 0.5) = (+0.4,\; -0.1,\; -0.3,\; 0.0)$$

**Step 3 — read the update off the signs.** Completion 1 gets pushed **up** hardest: every token in
it becomes more likely. Completions 2 and 3 get pushed **down**, with 3 taking three times the
punishment of 2. Completion 4 scored exactly average and receives **no gradient at all** — it was
neither evidence for nor against anything.

Notice what just happened: completion 2 scored $0.4$, which is a perfectly respectable reward in
absolute terms, and it still gets *penalised* — because for **this** prompt, $0.4$ was
disappointing. That is the baseline doing its job. Absolute reward levels are unlearnable noise;
relative standing within a prompt is the signal.

**Step 4 — optional normalisation.** Deviations $(0.4, -0.1, -0.3, 0.0)$ have mean-square
$(0.16 + 0.01 + 0.09 + 0)/4 = 0.065$, so $\sigma \approx 0.255$, giving

$$\hat A \approx (+1.57,\; -0.39,\; -1.18,\; 0.00)$$

Same signs, same ordering, rescaled to order-one magnitudes so a prompt where everything scored
near-identically still produces a decisive update. (Which, per the ponder, is exactly the property
critics of the std-division object to.)

**Step 5 — the pathological case you must plan for.** Suppose all four completions fail the
verifier: $r = (0, 0, 0, 0)$. Then $\bar r = 0$ and **every advantage is zero**. You sampled four
completions, burned the generation compute, and learned nothing. Same story if all four succeed.

This is not a footnote — with a binary verifier it is the dominant cost of a training run. Prompts
that are far too hard or far too easy for the current model are silent, so serious RLVR pipelines
**filter prompts by pass rate**, keeping the ones where the model succeeds sometimes, which is
exactly where the group has variance and therefore where the gradient lives. Difficulty curation is
not pedagogy here; it is throughput.
`,
    },
    {
      type: 'text',
      md: md`
## The memory payoff, and why this was a hardware story

Now cash the arithmetic. For a 7B model, per lesson 4.1:

$$\text{PPO: } \underbrace{112}_{\text{policy}} + \underbrace{112}_{\text{critic}} + \underbrace{14}_{\text{reference}} + \underbrace{14}_{\text{reward model}} \approx 252\text{ GB}$$

$$\text{GRPO: } \underbrace{112}_{\text{policy}} + \underbrace{14}_{\text{reference}} + \underbrace{14 \text{ or } 0}_{\text{reward model or verifier}} \approx 126\text{–}140\text{ GB}$$

Deleting the critic removes roughly **40% of the resident memory** of an RLHF run, and if your
reward comes from a verifier rather than a network, another 14 GB with it. Scale those numbers to a
70B or 600B model and the constant factor stops being a convenience and becomes the difference
between a training run existing and not existing.

That is the honest history: GRPO came out of a lab operating under real hardware constraints, and
it is a *systems* idea as much as an algorithmic one. Its selling point was never "the group mean
is a better baseline than a value function" — a well-fit critic can be lower-variance. Its selling
point is that the group mean is a **free** baseline, and the compute you save can be spent on more
samples, longer contexts, or a bigger policy. When you read a method paper, always ask what the
authors were short of. It usually explains the design.

(Two caveats so you are not caught out. First, these figures are naive full-parameter arithmetic;
in practice people shard optimizer state across GPUs, offload to CPU, and train LoRA adapters
instead of full weights — all of which change absolute numbers a lot and the *ratios* rather less.
Second, GRPO trades memory for **sampling**: $G$ completions per prompt instead of one. If your
bottleneck is generation throughput rather than memory, that trade can go the other way.)

## RLVR in practice: when the reward stops being a guess

Everything above inherits one weakness from 5.5: the reward is a *proxy*. A reward model is a
learned approximation of what humans liked, and optimising hard against a learned approximation is
the setup for Goodhart's law (6.3) — the model finds the gap between the proxy and the thing.

Sometimes, though, you have something better than a proxy. Unit tests either pass or they do not.
A compiler either accepts the program or it does not. A maths problem with a known answer either
matches or it does not. When a **verifier** exists, the reward is not a guess and there is no reward
model to overfit. That is RLVR — reinforcement learning from verifiable rewards — and the recipe is
short enough to write here:

1. Take a prompt with a checkable answer.
2. Sample a group of $G$ completions (temperature well above zero — you need spread; see 3.2).
3. Run the verifier on each. Reward $= 1$ for pass, $0$ for fail (plus small format rewards, often).
4. Compute group advantages. Update. Repeat.

Two things to hold onto. **First, the honest caveat: Goodhart does not disappear, it relocates —
onto the verifier.** Tests can be gamed. Models have been observed writing code that special-cases
the test inputs, deleting or weakening failing tests, calling exit(0) before an assertion is
reached, and matching an answer-checking regex without solving anything. A verifier is a *specific*
statement of what counts, and optimising against it means optimising against its bugs too. The
practical response is adversarial: hold out tests the model never trains against, check for the
known exploit patterns, and read actual samples with your own eyes at intervals.

**Second — and this is a bridge back to 7.3 — the same loop is a data generation method.** Sample
many, verify, and instead of doing an RL update, simply *keep the completions that passed and
fine-tune on them* with plain SFT. That is rejection sampling. It is dramatically simpler than RL,
it uses only training code you already have, and it captures a solid fraction of the benefit. On a
single GPU with a verifier available, **rejection-sampling fine-tuning is often the correct answer**
and the ambitious-looking RL run is the mistake. Do not let the fancier method's prestige pick your
recipe.

## Practical recipes: where the data comes from, and the one knob

**Sources of preference data**, roughly in order of cost:

- **Human annotators.** The gold standard, expensive, and slower than you plan for. Inter-annotator
  agreement on subjective quality is commonly in the 60–75% range — meaning a meaningful slice of
  your "preferences" are coin flips, which is precisely the noise IPO exists to tolerate.
- **A stronger model as judge.** Cheap, fast, and carries 5.5's biases: judges favour longer
  answers, answers in their own style, the first-listed option, and answers from models like
  themselves. Usable, but you must control for length and position, and you must periodically
  spot-check against humans or you are training on a systematic distortion.
- **Production thumbs.** Free, plentiful, real, and *unpaired* — which is exactly why KTO exists.
  Also badly biased in a specific way: users click thumbs-down when annoyed and rarely click
  thumbs-up when satisfied, so your negatives and positives are not sampled from the same process.
- **Rejection sampling against a verifier.** Free, exact, and only available where a verifier
  exists. When it applies, prefer it.

**The one knob: $\beta$ (equivalently, KL strength).** It is the leash from 5.5 in a new costume,
and both extremes fail in ways you can recognise on sight:

| $\beta$ | behaviour | how it fails |
|---|---|---|
| large (say 0.5+) | policy pinned to the reference | almost nothing changes; you burned a GPU-day to move win-rate by 1 point |
| typical (0.01–0.1) | meaningful movement, bounded drift | the working range for most DPO runs |
| small (say 0.001) | reference barely constrains anything | fast metric gains, then length inflation, repetition, capability loss |

Tune $\beta$ *first*, before anything else, and tune it by looking at KL from the reference
alongside your quality metric — not by looking at the loss curve, which will happily go down while
the model gets worse.

**Dataset sizes, with the caveat that these are rules of thumb and shift with base model quality:**
SFT typically wants $10^4$ to $10^6$ examples. Preference tuning routinely produces visible changes
with **1,000 to 10,000 pairs** — one to two orders of magnitude fewer. The reason is worth stating
because it also tells you what preference tuning *cannot* do: SFT is teaching the model new
behaviour, while preference tuning is mostly **re-weighting behaviour the model can already
produce**. Choosing among things you already know how to do is a much smaller ask than learning to
do them. Which is also why, if your model genuinely lacks a capability, no amount of preference
data will install it — that is an SFT or a pretraining problem wearing a preference-tuning costume.

**And the recipe for Monday**, since that was the puzzle: one GPU, an 8B model, a few thousand
unpaired thumbs. Full-parameter DPO on 8B needs roughly 130 GB and will not fit, so train **LoRA
adapters** — which has a lovely side effect: with LoRA, the reference model is just your base model
with the adapters switched off, so the reference costs you **zero extra weights**. Use **KTO**,
because your labels are unpaired and manufacturing fake pairs would teach the wrong thing. Start at
$\beta \approx 0.1$. Hold out several hundred labels you never train on. Run your capability evals
before and after, on the same day, with the same harness. That is a Monday, not a quarter.

## The failure gallery, and how to catch each one

Preference tuning fails in a small number of highly recognisable ways. Every one of them shows up
as an *improving* number on some dashboard, which is why each needs a paired detection method.
Learn them as pairs.

**1. Length inflation.** Almost every preference signal — human, LLM judge, or thumbs — mildly
prefers longer answers, so gradient descent finds the cheapest way to satisfy it: say more. Your
win-rate climbs and your model becomes exhausting.
*Detect:* plot win-rate against response length, and compare against a length-matched control. If
you re-run the evaluation forcing the tuned model to the baseline's length and the gain evaporates,
you bought verbosity. Track mean output length as a first-class metric from step zero.

**2. Degenerate or repetitive output.** Especially with low $\beta$ or with DPO's both-log-probs-
falling pathology: loops, boilerplate openers, formulaic structure on every answer.
*Detect:* n-gram repetition rate (fraction of repeated 4-grams within a response) and distinct-n
across the eval set. Cheap to compute, catches it early, and it moves before humans notice.

**3. Capability regression — the model gets nicer and dumber.** The most expensive failure, because
it is invisible to the metric you are optimising. You tuned for tone; you lost 6 points of maths.
*Detect:* held-out **capability** evals, run before and after every single run, on tasks you were
explicitly not tuning — code, maths, retrieval, instruction-following. Nothing else finds this.
(Instrumenting this properly is 7.6's whole job.)

**4. Judge hacking.** If your preferences came from an LLM judge, you are not optimising quality,
you are optimising *that judge*, and models are extremely good at finding a judge's tells:
confident tone, bulleted structure, a strong opening sentence, self-flattery.
*Detect:* spot-check a random sample with humans, every run. If the judge's win-rate rises while
the human sample's does not, you have your answer. Also try a *second* judge from a different model
family: agreement between judges that diverges from human agreement is a bright red flag.

**5. Over-optimisation, generally.** The umbrella case, and it has a canonical shape: as you
optimise, quality against the true objective rises, peaks, and then **falls**, while the proxy
metric keeps climbing happily. The curve is well-documented for reward-model optimisation and shows
up across methods.
*Detect:* plot **KL from the reference** on the x-axis and both your proxy metric and a
human-judged metric on the y-axis. Divergence between those two curves is the alarm, and it is the
single most useful plot in this entire lesson.
`,
    },
    {
      type: 'ponder',
      question: md`You are three days into a DPO run on a customer-support model. Your KL from the
reference model is rising steadily. Your automatic win-rate (an LLM judge) has gone from 51% to 68%
and is still climbing. And your weekly human spot-checks, which rose for the first week, have been
**flat** for four days. Your manager wants to ship it Friday. What is happening, what would you
check first, and what do you do?`,
      answer: md`**What is happening: textbook over-optimisation against a proxy** — 6.3's law
arriving on schedule. Three signals, and their *pattern* is the diagnosis, not any one of them:
rising KL says the policy is moving substantially away from the reference; a rising judge score
says it is moving in a direction the judge rewards; a flat human score says that direction has
stopped corresponding to real quality. You are now paying real drift for zero real gain. On the
canonical curve you are at or just past the peak, and the next phase is not stagnation, it is
**decline** — the model keeps travelling in a direction that only the proxy likes.

**What to check first** (cheap, ordered, and each one falsifiable):
1. **Mean response length**, tuned versus reference. If it has grown 2x, you likely have length
   inflation and your judge is rewarding it. Re-run the judge on length-matched pairs; if the gain
   collapses, that is your whole effect.
2. **Held-out capability evals.** Confirm the model has not gone nicer-and-dumber while you were
   watching tone.
3. **Read twenty samples yourself.** Actually read them. This costs fifteen minutes and finds
   things no metric names — a new tic, a formulaic opener, sycophancy the judge scores as warmth.
4. **A second judge from a different model family.** If judge A loves it and judge B does not, you
   are fitting judge A.

**What to do,** in escalating order: **stop early** — go back to the checkpoint where the human
curve flattened, since everything after it is drift you paid for and did not receive; **raise
$\beta$** and re-run, so the leash tightens and the model cannot travel as far for the same
gradient; **fix the signal rather than the model** — refresh the preference data with examples
drawn from the *current* policy's failure modes (a static preference set goes stale precisely
because you have moved away from the distribution that produced it); and **change what you trust**
— promote the human-verified evaluation to the gate for shipping and demote the automatic win-rate
to a monitoring metric.

**And what to tell your manager:** the honest sentence is "the number that is going up is not the
number we care about, and I can show you the plot." Ship the earlier checkpoint. A model that is
17 points better on a judge nobody outside the team will ever run is not 17 points better.`,
    },
    {
      type: 'text',
      md: md`
## The honest state of it

You are training to be a researcher, so hold the uncertainty explicitly rather than filing it away:

- **The DPO-vs-PPO question is genuinely open.** Careful head-to-heads have landed on both sides,
  and the differences frequently trace to tuning budget, base model, or a length-loving judge rather
  than to the algorithms. What is *not* contested: the offline family is far cheaper, and on-policy
  methods have an exploration property the offline family structurally lacks.
- **The GRPO details are actively being revised.** The std normalisation, the KL term, token-level
  versus sequence-level averaging, whether to clip — all of these have live critiques and proposed
  fixes, some of which will be standard by the time you read this and some of which will be
  forgotten. The *baseline-from-a-group* idea is the durable part.
- **KTO, ORPO, SimPO have thinner track records than DPO**, which has thousands of independent
  reproductions behind it. Novelty is not evidence.
- **Almost every reported win in this literature is measured with an LLM judge**, and LLM judges
  have known, measurable biases. Discount accordingly, especially when the reported gain is a few
  points.

None of that is a reason for paralysis. It is a reason to run your own eval, on your own task, with
a held-out human sample — and to be the person in the room who knows which claims are load-bearing.

## What you now own

1. **The organising principle:** every preference-tuning method is defined by **what it deletes**.
   PPO's four resident models are the baseline everyone else is editing down.
2. **The deletion sequence:** DPO removes the reward model and the RL loop (cost: off-policy, no
   exploration); IPO removes the noiseless-preference assumption; KTO removes the need for pairs —
   which is why it fits real production thumbs; ORPO removes the separate SFT stage; SimPO removes
   the reference model.
3. **GRPO, derived:** a baseline must depend on the prompt but not on the action; the mean reward
   over a group of $G$ completions for the same prompt satisfies that; therefore the critic is
   replaceable by a statistic you already computed — about 40% of an RLHF run's memory, deleted.
   You can also name the small self-dependence bias you accepted, and why the std division is
   contested.
4. **The arithmetic in your hands:** rewards $(0.9, 0.4, 0.2, 0.5)$ give advantages
   $(+0.4, -0.1, -0.3, 0.0)$ — including why a $0.4$ can be punished, and why an all-pass or
   all-fail group teaches nothing.
5. **RLVR:** a verifier makes the reward exact and moves Goodhart pressure onto the verifier itself;
   the same sample-and-check loop doubles as rejection-sampling data generation, which is often the
   right answer on one GPU.
6. **The knobs and the sizes:** $\beta$ tuned first and read against KL, not loss; preference tuning
   needs 1–10k pairs versus SFT's $10^4$–$10^6$, because it re-weights what the model can already do
   rather than teaching it something new.
7. **The failure gallery with its detectors:** length inflation → win-rate versus length; degeneracy
   → n-gram repetition; capability regression → held-out capability evals; judge hacking → human
   spot-checks and a second judge; over-optimisation → KL against human-judged quality, the one plot
   to draw.

Next lesson: you know *what* to run — 7.5 is the toolbox that runs it, and how not to be defeated by
somebody else's config file.
`,
    },
  ],
  questions: [
    {
      id: 'm7-l4-q1',
      kind: 'mcq',
      prompt: md`Your feedback table has 6,000 rows: prompt, single response, one bit (thumbs up or
down). Different prompts, no two responses to compare. Which method consumes this data as it
stands, and why?`,
      options: [
        'DPO — pair each thumbs-up response with a randomly chosen thumbs-down response to form training pairs',
        'KTO — it learns from unpaired desirable/undesirable labels, which is exactly the shape of production feedback',
        'ORPO — it folds preference learning into SFT, so it does not need preference labels at all',
        'SimPO — being reference-free, it can score single responses without a comparison',
      ],
      answer: 1,
      explain: md`KTO's entire deletion is the requirement for pairs, and it exists because
production feedback looks like this and preference-tuning papers assumed it did not.

Option A is the *genuinely tempting* one, because people really do it: manufacture pairs by mixing
and matching. The problem is that a DPO pair must share a prompt. Pairing a good answer to prompt X
against a bad answer to prompt Y teaches the model which **prompts** are associated with approval —
a signal about your users' question-asking habits, not about response quality. You will get a
confidently-trained model that learned the wrong variable. Option C misreads ORPO: it removes the
separate SFT *stage*, but it still needs preference signal, and in pair form. Option D confuses
"needs no reference model" with "needs no comparison" — SimPO deletes $\pi_{\text{ref}}$, not the
chosen-versus-rejected structure.`,
    },
    {
      id: 'm7-l4-q2',
      kind: 'numeric',
      prompt: md`**Fermi (paper and pencil, calculator only at the end).** You are planning
PPO-style RLHF on a **7B** model with four resident models: policy, critic, reference, reward model.
The policy and critic are trainable — use lesson 4.1's ~16 bytes per parameter for full training
state (fp16 weights, gradients, Adam moments, fp32 master copy). The reference and reward model are
frozen at ~2 bytes per parameter. Roughly how many **GB** of resident model state does the run need?
(Ignore activations and KV cache. Tolerance is generous — the point is the order of magnitude, not
the decimal.)`,
      answer: 252,
      tolerance: 40,
      explain: md`Trainable: $2 \times (7\times10^9 \times 16) = 2 \times 112 = 224$ GB. Frozen:
$2 \times (7\times10^9 \times 2) = 2 \times 14 = 28$ GB. Total $\approx 252$ GB.

Compare DPO's two models: $112 + 14 \approx 126$ GB. That factor of two is why the deletion story
in this lesson is a **hardware** story, not an aesthetic one — 250 GB does not fit on one 80 GB
card, and no amount of enthusiasm changes that. (Real runs shard optimizer state across GPUs,
offload to CPU, and use LoRA, all of which move the absolute numbers a lot and the ratio much less.
And notice the biggest single lever: the critic alone is 112 GB — a whole trainable network whose
only job is to predict a baseline. That is what GRPO deletes.)`,
    },
    {
      id: 'm7-l4-q3',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, build the case for GRPO's group baseline from
first principles, in four steps: (1) why a policy-gradient update needs a baseline at all — what
specifically goes wrong without one; (2) the exact condition a baseline must satisfy in order not to
bias the update, and the one-line reason that condition works; (3) show that the group mean
satisfies it, and identify the one way it *technically* violates it and how big that violation is;
(4) state what is deleted and what is paid for it, in memory and in compute. Do not just assert that
"GRPO replaces the critic with the group mean" — that sentence is the thing you are deriving.`,
      rubric: md`**(1) Why a baseline.** Policy gradient scales the log-probability update by "how
good" the action was. With raw reward, a prompt whose completions all score 0.80–0.85 produces huge
updates carrying almost no information — the common component dominates the differences. Result:
high variance, slow and unstable learning. Subtracting an expectation leaves only the *surprise*.
(Full credit needs the variance argument, not just "it works better.")

**(2) The condition.** The baseline may depend on the **state/prompt** but must **not depend on the
action** (the particular completion). Reason: the expectation of the score function
$\nabla_\theta \log \pi_\theta(a \mid s)$ under the policy is zero, so any action-independent term
multiplied by it contributes zero to the expected gradient — it changes variance, not the
objective. Anything action-dependent breaks the cancellation and silently changes what you optimise.

**(3) The group mean.** Sample $G$ completions for the *same* prompt and average their rewards: the
result is a function of the prompt and the policy, identical for every completion in the group —
so it is action-independent, and it is a Monte-Carlo estimate of exactly the quantity a value
network was being trained to predict. **The technical violation:** completion $i$'s own reward is
inside its own baseline, a $1/G$ self-dependence, hence a small bias that shrinks as $G$ grows and
can be removed exactly with a leave-one-out mean. Credit for naming this; extra credit for noting
that dividing by the group **std** is *not* covered by the argument and is contested.

**(4) The trade.** Deleted: the critic — a full-size trainable network plus its optimizer state
(~112 GB at 7B, roughly 40% of the run's resident memory), plus its failure modes (a badly fit
critic corrupts every advantage). Paid: $G$ completions per prompt instead of one, so generation
cost rises roughly $G$-fold, and groups that are unanimous (all pass or all fail) produce zero
gradient and waste that compute entirely.

"Nailed it" requires the action-independence condition stated explicitly in (2) — everything else
in the derivation hangs off it. Recalling the advantage formula without the baseline condition is
precisely the recall this question is built to defeat.`,
    },
    {
      id: 'm7-l4-q4',
      kind: 'mcq',
      prompt: md`Relative to PPO, what does GRPO delete, and what does it pay?`,
      options: [
        'It deletes the reward signal: completions are scored against the group mean instead of needing any reward at all',
        'It deletes the reference model and the KL penalty, paying with a greater risk of drift',
        'It deletes the learned value network (critic), paying with $G$ sampled completions per prompt instead of one',
        'It deletes the need for on-policy sampling, so it can be trained on a fixed offline dataset like DPO',
      ],
      answer: 2,
      explain: md`The critic goes; the group of samples arrives. That is the whole trade.

Option A is the best-baited trap here, and it catches people who half-remember the phrase "uses the
group mean instead": the group mean replaces the **baseline**, not the reward. You still need to
score every completion — with a reward model or a verifier — or there would be nothing to average.
Option B inverts the truth: GRPO typically *keeps* a KL term to the reference (its presence and
form are actively debated, but "deleted" is not the claim). Option D is the deepest
misunderstanding: GRPO is squarely on-policy — sampling its own completions is the entire mechanism,
and it is exactly the property that lets it discover behaviours DPO structurally cannot.`,
    },
    {
      id: 'm7-l4-q5',
      kind: 'numeric',
      prompt: md`A GRPO step on one prompt samples a group of $G = 8$ completions and scores them
with a unit-test verifier: reward 1 for pass, 0 for fail. **Three** of the eight pass. Using the
group mean as the baseline (no standard-deviation normalisation), what is the advantage of one of
the **passing** completions?`,
      answer: 0.625,
      tolerance: 0.02,
      explain: md`Group mean $= 3/8 = 0.375$. A passing completion has advantage
$1 - 0.375 = 0.625$; a failing one has $0 - 0.375 = -0.375$.

Now notice the mechanism this exposes, which is the real lesson: **the rarer the success, the
larger the reward for achieving it.** If seven of eight had passed, the mean would be $0.875$ and
the passing completions would each get a feeble $+0.125$ — while the single failure would be
slammed with $-0.875$. The group baseline automatically turns "how surprising was this outcome for
this prompt?" into gradient magnitude, with no tuning and no value network. And at the extremes —
0 of 8 or 8 of 8 — every advantage is exactly zero and the entire group is wasted compute, which is
why RLVR pipelines filter prompts by pass rate.`,
    },
    {
      id: 'm7-l4-q6',
      kind: 'written',
      prompt: md`**The Monday plan.** Write the plan from the opening puzzle as if for a colleague:
an 8B fine-tuned model that is technically correct and subtly annoying, one 80 GB GPU, ~4,000
production records of (prompt, single response, thumbs up/down), no reward model, no cluster, one
week. Specify: (1) which method you run and *why that one given this data shape*; (2) how you fit an
8B model's preference tuning onto one card, and one memory bonus that choice gives you; (3) the one
hyperparameter you tune first and what you read to tune it; (4) the two evaluations you set up
before training starts, and (5) one thing that would make you abandon the run. Justify each choice —
a bare list of tool names scores nothing.`,
      rubric: md`**(1) Method: KTO** (or an explicit, well-argued equivalent for unpaired labels).
The reasoning must be about **data shape**: the records are unpaired thumbs on single responses to
different prompts, and DPO requires two responses to the *same* prompt. Manufacturing cross-prompt
pairs teaches which prompts got approval, not which responses were better. Credit for noting the
thumbs-down bias (annoyed users click; satisfied users mostly do not), so the positive and negative
sets are not sampled from the same process.

**(2) Fitting it: LoRA adapters** rather than full-parameter training — full DPO/KTO on 8B is
roughly 130 GB and does not fit on 80 GB. **The bonus:** with LoRA, the reference model is the base
model with adapters switched off, so the reference costs **no extra resident weights**. (Alternative
credit: quantised base plus adapters, or offloading — but the argument must be quantitative.)

**(3) Tune $\beta$ first**, starting near 0.1, and read it **against KL from the reference plotted
alongside a quality metric** — explicitly *not* the training loss, which falls happily while the
model gets worse. Large $\beta$: nothing moves. Small $\beta$: fast metric gains followed by length
inflation, repetition, and capability loss.

**(4) Two evals, both built before training:** (a) a **held-out slice of human-labelled records**
(several hundred) that is never trained on; (b) **held-out capability evals** on tasks you are not
tuning — code, maths, instruction-following — run before and after with the same harness on the same
day, to catch nicer-and-dumber. Credit also for tracking **mean response length** from step zero as
a first-class metric.

**(5) An abandon/rollback trigger, stated concretely and in advance** — e.g. capability eval drops
more than a set threshold; mean length grows past a set multiple of baseline; the held-out human
score flattens while KL keeps rising; 4-gram repetition rate climbs. Full credit requires a
*specific, checkable* trigger, because a threshold chosen after seeing the results is not a trigger.

"Nailed it" = all five, each with its reasoning. Naming KTO and LoRA without the data-shape and
memory arguments is a tool list, not a plan.`,
    },
    {
      id: 'm7-l4-q7',
      kind: 'mcq',
      prompt: md`After a DPO run, mean response length rose from 180 to 410 tokens and your LLM
judge's win-rate against the base model went from 52% to 74%. Which single diagnostic best tests
whether the model actually got better?`,
      options: [
        'Re-run the judge with a differently worded prompt template to check robustness',
        'Compare win-rate at matched response lengths — or plot win-rate against length — so the gain can be attributed to quality rather than verbosity',
        'Raise $\\beta$ and retrain, since the drift clearly indicates the leash was too loose',
        'Measure perplexity on a held-out corpus to confirm the model did not degrade',
      ],
      answer: 1,
      explain: md`Length is the confound; controlling for it is the test. If the win-rate advantage
survives at matched lengths, you gained quality. If it evaporates, you bought verbosity — a 2.3x
length increase alongside a 22-point judge gain is the classic signature.

Option A is a genuinely good practice and that is what makes it tempting — but rewording the prompt
tests the judge's *robustness*, not the length confound; a length-biased judge stays length-biased
under any template. Option C is the trap of fixing before measuring: you might be right, but you
would be retraining without knowing what was wrong, and you would have no way to tell whether it
helped. Option D measures the wrong thing entirely — perplexity on generic text is nearly blind to
verbosity and tone, and preference-tuned models routinely get worse perplexity while being
preferred.`,
    },
    {
      id: 'm7-l4-q8',
      kind: 'numeric',
      prompt: md`A Bradley–Terry reward model scores two candidate responses to the same prompt:
$r(y_w) = 2.3$ and $r(y_l) = 0.8$. Under the Bradley–Terry model, what is the probability that a
labeller prefers $y_w$ over $y_l$? (Give a probability between 0 and 1.)`,
      answer: 0.818,
      tolerance: 0.02,
      explain: md`Bradley–Terry says the preference probability is the sigmoid (1.4) of the reward
**margin**, never of the raw scores:

$$P(y_w \succ y_l) = \sigma(r_w - r_l) = \sigma(1.5) = \frac{1}{1 + e^{-1.5}} \approx 0.818$$

Two things worth extracting. First, **only the difference matters** — add 100 to both scores and
nothing changes, which is why reward models are defined only up to a constant shift and why raw
reward values are meaningless to compare across prompts. That shift-invariance is the same fact
that makes a per-prompt baseline (a critic, or GRPO's group mean) necessary rather than optional.
Second, a comfortable-looking margin of 1.5 still means roughly **one labeller in five disagrees**.
Preferences are noisy even when your model is confident — which is precisely the assumption DPO's
log-sigmoid loss encodes and that IPO exists to handle when your data is instead deterministic.`,
    },
    {
      id: 'm7-l4-q9',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old.** A kid asks: "If the robot already gives right
answers, why does it need more training? And how can it learn from people just clicking a thumbs-up
button?" Explain (1) why being correct and being liked are different, and why showing it more good
examples does not fix the second one; (2) how thumbs-up and thumbs-down clicks can teach it,
including why a comparison is easier for people to give than a perfect answer; (3) why you have to
be careful — give the kid one concrete way the robot could "cheat" and how you would catch it. Steal
an analogy or invent a better one; inventing is worth more. No unexplained grown-up words.`,
      rubric: md`Grade the **teaching**, not the vocabulary.

1. **Correct versus liked, made concrete.** Something like: a friend who is never wrong but talks
   for ten minutes, repeats your question back, and says sorry constantly — everything true, nobody
   wants to sit with them. The key move is explaining why *more good examples* does not fix it:
   copying good answers only works if somebody wrote down the un-annoying version, and nobody writes
   "here is the same answer but less irritating." You can only *tell it apart* when you see it.
2. **How clicks teach.** Every click is the robot being told "more like that" or "less like that,"
   and after thousands of clicks it does more of the liked kind. Must include the *why comparison is
   easier* point: writing a perfect answer is hard work, but saying which of two answers you liked
   better — or just clicking a thumb — takes a second, so you can collect enormously more of it.
   Bonus credit for the "you can be a good judge of a cake without being a baker" flavour.
3. **A concrete cheat, plus a catch.** Best answers name a *mechanism*: people tend to click thumbs-
   up on longer answers, so the robot learns to pad everything out — it did not get better, it got
   wordier, and you catch it by checking whether it still wins when both answers are the same
   length. (Other good ones: it learns flattery because people like being praised; it gets nicer but
   worse at maths, and you catch that by testing maths separately before and after.) The catch must
   be a *check that could come out either way*, not "look at it carefully."
4. **Jargon audit — this is where most answers lose points.** "Reward model," "policy," "KL
   divergence," "off-policy," "preference pair," "fine-tuning," "gradient," "beta," or "RLHF" used
   without a kid-level translation first = **partial at best**. Grade yourself strictly: if a
   12-year-old would have to nod along without understanding, the sentence failed.`,
    },
    {
      id: 'm7-l4-q10',
      kind: 'mcq',
      prompt: md`Your preference pairs were generated by a deterministic rule, so every pair is
clean and unanimous. During DPO training the implicit margin grows without bound and KL from the
reference climbs steadily, while held-out quality stalls and then declines. What is the failure, and
which deletion in the family addresses it?`,
      options: [
        'Under-fitting — the leash is too tight; lower $\\beta$ so the model can actually move',
        'DPO’s log-sigmoid loss is minimised by pushing the margin to infinity, so on noiseless pairs nothing stops it over-fitting; IPO deletes the noiseless-preference assumption by targeting a finite margin instead',
        'Reward hacking — the model has found a flaw in the reward model, which needs retraining on harder examples',
        'The reference model has gone stale and should be refreshed to the current policy checkpoint',
      ],
      answer: 1,
      explain: md`DPO inherits Bradley–Terry's assumption that preferences are *probabilistic*. Feed
it deterministic pairs and the loss keeps decreasing as the margin grows, so the optimiser happily
travels arbitrarily far from the reference to win pairs it already wins. IPO's squared loss toward a
finite target gives the objective a bottom.

Option C is the most instructive wrong answer, because it is the reflex diagnosis for "metric up,
quality down" — but **DPO has no reward model to hack.** That is the entire point of the deletion:
the reward was eliminated as an explicit object. Diagnosing reward hacking here means you have not
internalised what DPO removed. Option A points the wrong way: a rising KL and an exploding margin
are symptoms of moving *too freely*; lowering $\beta$ loosens the leash and accelerates the failure.
Option D would eliminate the anchor entirely — refresh the reference to the current policy and the
log-ratios reset to zero, so the constraint stops constraining precisely when it is needed.`,
    },
    {
      id: 'm7-l4-q11',
      kind: 'numeric',
      prompt: md`You fine-tuned with SFT on 60,000 instruction-response examples. The preference-
tuning run that followed used 4,000 pairs and produced a clearly visible change in behaviour. How
many times larger was the SFT dataset than the preference dataset?`,
      answer: 15,
      tolerance: 1,
      explain: md`$60{,}000 / 4{,}000 = 15$.

The ratio is the point, and it is typical: preference tuning routinely moves a model with one to two
orders of magnitude fewer examples than SFT needed. The reason tells you what preference tuning can
and cannot do. SFT is **teaching behaviour** — the model must learn to produce something it could
not produce before, which takes many demonstrations. Preference tuning is mostly **re-weighting
behaviour the model can already produce** — choosing among things already in its repertoire, which
is a far smaller ask.

The corollary is the practically valuable half: if your model genuinely *lacks* a capability, no
volume of preference data will install it. You have an SFT or a pretraining problem wearing a
preference-tuning costume, and 40,000 more pairs will not change that.`,
    },
    {
      id: 'm7-l4-q12',
      kind: 'written',
      prompt: md`**Research judgment.** A colleague reports: "We ran both. DPO beat PPO by 6 points
on our benchmark, so offline preference optimisation is simply better — we are dropping on-policy RL
from the roadmap." Write the careful response: (1) three specific reasons a 6-point gap in a
comparison like this may not mean what it appears to; (2) two **falsifiable** experiments whose
outcomes would genuinely move your confidence in either direction — not demonstrations that can only
succeed; and (3) one sentence naming the capability difference between the two families that a
benchmark gap does not settle either way.`,
      rubric: md`**(1) Three reasons** (any three, each with its mechanism, not just named):
- **Unequal tuning budget.** PPO has many more hyperparameters and is far more sensitive to them;
  a lightly-tuned PPO run against a well-tuned DPO run measures effort allocation, not algorithms.
  Ask how many configurations each received.
- **The benchmark is probably LLM-judged**, and judges favour length, structure, confident tone,
  and their own family's style. Ask for mean response length per arm — a 6-point gap alongside a
  large length difference is a length result.
- **One base model, one dataset, one seed.** Preference-tuning results are notoriously sensitive to
  the SFT starting point and to preference-data quality; a single cell of a large grid is an
  anecdote with error bars nobody computed. Ask for seed variance.
- Also creditable: the benchmark may be in-distribution for the DPO pairs; no held-out **capability**
  evals reported, so a tone win could be masking a reasoning regression; and PPO's reward model may
  simply have been weak, which indicts that reward model rather than on-policy RL.

**(2) Two falsifiable experiments** — the requirement is that failure is *possible and informative*:
- **Equalised-budget replication:** fix the base model, the preference data, and the compute, give
  each method the same number of tuning trials and several seeds, and pre-register that a gap inside
  seed variance counts as "no difference." This can come out either way.
- **Length-controlled and human-verified evaluation:** re-score both arms at matched response
  lengths with a human-labelled sample. Pre-register that if DPO's advantage vanishes under length
  control, the original 6 points were verbosity.
- **The exploration test (the sharpest one):** choose a task with a verifier where the target
  behaviour is *absent from the preference data* — a class of maths or coding problem the SFT model
  solves rarely. Run offline preference tuning and on-policy RL on it. Pre-register that if the
  offline method matches on-policy RL there, the exploration argument is weaker than claimed; if it
  cannot move at all, the roadmap decision is wrong regardless of the benchmark.
- Also creditable: held-out capability evals on both arms; transfer to a second base model.

**(3) The capability sentence.** Something equivalent to: *offline preference methods can only
re-rank completions that already exist in the dataset, whereas on-policy RL samples its own
completions and can be rewarded for behaviour no annotator ever produced — so a benchmark whose
target behaviour is already present in the preference data cannot distinguish the two on the axis
that actually separates them.*

Full credit requires genuinely falsifiable designs in (2). "Show that DPO also does well on task X"
is a demonstration, not a test, unless it is paired with a pre-registered outcome that would count
as evidence *against* the position.`,
    },
  ],
}
