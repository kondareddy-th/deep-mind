// Module 8, Lesson 6 — Your research agenda (FINAL LESSON, Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm8-l6',
  title: '8.6 Your research agenda — choosing what to work on',
  subtitle:
    'Lesson 6.6 taught you to turn a confusion into one runnable experiment. That gets you a project. This is about the harder thing: choosing a direction, so that projects compound instead of scattering — and then the twelve months that follow.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Two people start today with identical knowledge — yours.

Five years later the first has done twenty interesting projects, each on whatever was exciting that
quarter: a diffusion thing, an agent framework, a quantization experiment, three abandoned repos.
Genuinely capable, genuinely knowledgeable, and known to nobody in particular.

The second has done perhaps eight projects, all circling one problem area. Their tooling from year
one made year three's experiments cheap. People in that area know their name and send them drafts.
When something surprising happens in their corner of the field, they are among the handful of
people who can immediately say whether it matters.

Same starting knowledge, same intelligence, same hours. The difference is that the second person's
projects **compounded** and the first person's didn't — and compounding is not a personality trait
or a stroke of luck. It comes from choosing a *direction* rather than a series of tasks, and it is
the last thing this curriculum can teach you.

## What compounds and what doesn't

The test is embarrassingly simple, and almost nobody applies it:

> **If I do this project, is my NEXT project cheaper?**

Things that compound:

- **Infrastructure you rebuild.** An evaluation harness, a training pipeline, a probing toolkit, a
  dataset you curated. Project two starts at hour zero with these already working.
- **Depth in one problem area.** Intuition is domain-specific and accumulates: after a year you know
  which results in your area are load-bearing, which are folklore, and where the bodies are buried.
- **Being early to a durable constraint.** If you started working on evaluation in 2023 you were
  early to something that is *more* pressing now, not less (5.6, 8.5's constraint reading).
- **Public artifacts.** Each honest write-up makes the next one easier to write and easier for
  people to find.

Things that don't:

- **One-off scripts** for a project you'll never touch again.
- **Topic-hopping** toward whatever is trending — you pay the start-up cost of a new area every
  time and never reach the depth where you can see what others miss.
- **Benchmark chasing** — 5.6's Goodhart, and a moving target by construction.
- **Unfinished work**, which compounds to exactly zero no matter how clever it was.

That last one deserves emphasis, because it is the most common way promising people stall: an
abandoned project at 80% teaches you something, but produces no artifact, no feedback, and no
compounding. **Finishing is a research skill**, and for the first few years it is arguably the
binding one.
`,
    },
    {
      type: 'text',
      md: md`
## The map — where the open problems are

For each area: the binding constraint (8.5's generator 1), what is genuinely tractable at small
scale, and what a newcomer contribution actually looks like. This is a snapshot and will age — but
the *way* of reading it should not.

**Interpretability** (6.1, 6.2). *Constraint:* we can read sentences of the model's algorithm, not
books — and we cannot yet tell whether our explanations are correct. *Tractable small:* enormously.
Open weights, one GPU, existing tooling; SAE training on small models is a laptop-to-single-GPU
activity. *Newcomer contribution:* comparative evaluation of interpretability methods (do SAE
features beat linear probes on a real task?), replicating circuit findings in a different model
family, automating a piece of circuit discovery.

**Alignment** (6.3). *Constraint:* we cannot specify what we want, and oversight breaks down exactly
where capability grows. *Tractable small:* scalable-oversight experiments with weak judges and strong
models; measuring honesty and calibration; jailbreak robustness studies. *Newcomer contribution:*
careful measurement — most alignment claims rest on evaluations that could be sharpened.

**Efficiency** (8.1–8.4). *Constraint:* memory bandwidth, energy, and serving cost (and the roofline
tells you which fix is even possible). *Tractable small:* kernels, low-bit quantization, distillation
methods, serving optimisations — all measurable on one GPU with clean before/after numbers.
*Newcomer contribution:* this area has the crispest success criterion in all of ML — your thing is
faster or it isn't — which makes it unusually meritocratic for people without credentials.

**Data** (5.1, 7.3). *Constraint:* high-quality tokens are finite, and synthetic data's failure modes
are poorly mapped. *Tractable small:* curation methods, contamination detection, measuring what data
mixtures actually do at small scale. *Newcomer contribution:* contamination audits of popular
datasets; honest studies of synthetic-data degradation.

**Evaluation** (5.6, 7.6). *Constraint:* arguably the field's weakest link — we cannot reliably
measure what we most care about. *Tractable small:* **needs judgment far more than compute; several
worthwhile projects here need no GPU at all.** *Newcomer contribution:* the most accessible serious
work in the field. Contamination-resistant benchmarks, evaluations for capabilities nobody measures
well, statistical rigour applied to published comparisons.

**Agents and reasoning** (6.4). *Constraint:* long-horizon reliability, and the compounding
arithmetic that governs it. *Tractable small:* failure taxonomies for long runs, verification
strategies, measuring where inference-time compute actually pays. *Newcomer contribution:* rigorous
measurement of agent failure modes — the demos vastly outnumber the studies.

**Adaptation** (Module 7). *Constraint:* we do not really know when fine-tuning beats prompting, or
why merging works. *Tractable small:* very — this whole module is one-GPU work. *Newcomer
contribution:* controlled comparisons of PEFT methods, model-merging studies, and the alignment-tax
measurements almost nobody publishes.

Note the pattern across that list: the areas most accessible to a newcomer — evaluation, careful
measurement, honest comparison — are also the ones the field most needs and most under-supplies.
That is not a coincidence. **Glamour and neglect are anti-correlated**, and you can exploit that.
`,
    },
    {
      type: 'ponder',
      question: md`Two candidate directions for your first year. **(A)** A new attention variant,
benchmarked against transformers — the kind of work that makes headlines. **(B)**
Contamination-resistant evaluation — unglamorous, statistical, no new architecture. Assume you have
one GPU. Which compounds faster for a newcomer, and why does almost everyone choose the other one?`,
      answer: md`**(B), and it isn't close for someone in your position.**

The case: architecture work requires **compute-matched comparisons against a well-tuned baseline**
(6.5's first checklist item) — the exact comparison one GPU cannot make credibly. Even if your
variant is genuinely better, your result will be, correctly, disbelieved. Meanwhile evaluation work
needs judgment and care rather than FLOPs, produces artifacts other people immediately use (a
benchmark is infrastructure), and — the compounding part — **makes every future project of yours more
credible, because you can measure things others can't.** Being the person whose numbers are trusted
is a durable position.

There is a second-order benefit people miss: doing evaluation work teaches you where every other
area is weakest, which is an unusually good vantage point from which to pick your *next* direction.

**Why almost everyone picks (A):** glamour is visible and compounding is not. Architecture work
looks like Real Research; evaluation looks like plumbing. Add that new architectures are what gets
posted and discussed, while careful measurement is what gets cited quietly three years later. The
irony is that (A) is *crowded and compute-gated* while (B) is *neglected and compute-free* — so the
newcomer's comparative advantage points almost exactly opposite to the newcomer's instinct.

This does not mean never work on architecture. It means: earn the compute and the credibility first,
in an area where you can produce trustworthy results today.`,
    },
    {
      type: 'text',
      md: md`
## The personal-fit filter

The map tells you what is open. It does not tell you what is open **to you**, and three filters
narrow it far more than people expect:

**Your compute.** Be concrete rather than aspirational. With no GPU: evaluation, contamination
studies, analysis of published results, interpretability on small open models via free tiers. With
one GPU: everything in Module 7, most of Module 8, SAE training, small-scale scaling ladders. With a
small cluster: architecture work becomes credible. Match the area to the hardware you actually have,
not the hardware you hope to have.

**Your genuine curiosity** — and treat this as a resource, not a luxury. The projects that get
finished are the ones you keep thinking about in the shower; the ones you chose because they seemed
strategically correct die quietly in month four. Since finishing is the binding skill, sustained
interest is a *practical* asset, not a sentimental one.

**Your edge.** What do you know, or have access to, that most ML researchers don't? A domain
(medicine, law, chemistry, finance), a language with poor model coverage, an industry's real
workflows, an unusual technical background, a user population. The intersection of *tractable* ×
*genuinely interesting to you* × *your edge* is usually a much smaller and better-defined set than
people fear — and work sitting in that intersection is work others structurally cannot do.

## The twelve-month arc

Lesson 6.6 gave you the sequence: **replicate → extend → originate**. Here it is with dates
attached.
`,
    },
    {
      type: 'example',
      title: 'a twelve-month plan, with its failure branches',
      md: md`
**Q1 — Replicate something real, end to end.** Pick a published result in your chosen area and
reproduce it. Not a toy version: the actual claim, on the actual scale you can afford. Write it up
honestly, including what didn't match.

*Why:* replication teaches the thousand unstated details that papers omit, and it is the fastest way
to build the tooling that will carry the rest of the year. *Artifact:* a repo others can run, plus a
write-up. *Failure branch:* if it doesn't replicate and you're confident in your setup, **that is
your first real result** — write it up as such; the field needs it.

**Q2 — Extend it with one original question.** You now own the code and the intuition. Ask the
obvious next question the paper didn't answer — does it hold at another scale, on another model
family, under a condition they didn't test? Pre-register your prediction (6.6).

*Artifact:* a second write-up, positive or negative. *Failure branch:* if Q1 spilled into Q2, that is
normal and fine — but check that you're still *finishing*, and cut scope rather than extending
timelines.

**Q3 — Originate.** A question of your own, generated by a confusion (6.6) or by running the seven
generators (8.5) on a constraint in your area. This is the first project where nobody has told you
the answer exists.

*Artifact:* the thing you'd actually submit somewhere, or a substantial public write-up. *Failure
branch:* if the question turns out to be intractable at your scale, shrink it until it isn't — the
small version of a good question is usually still a good question.

**Q4 — Consolidate.** Either a deeper follow-up on Q3, or a second study using the tooling you've
now built three times. Then step back and re-run the direction decision with a year of evidence you
didn't have in Q1.

*By the end:* four artifacts, one reusable toolkit, a specific area where you know more than almost
anyone who hasn't done this, and a name that a few relevant people recognise. That is a genuinely
strong first year, and none of it required a cluster.
`,
    },
    {
      type: 'text',
      md: md`
## The habits that compound

Weekly, not heroically:

- **Reading triage as a calendar item.** 6.5's three-pass method, applied to perhaps twenty papers a
  week at five minutes each — under two hours, and enough to stay oriented. Note what that is as a
  fraction of what's published, and make peace with it: you are not trying to read the field, you
  are trying to not miss the things that matter in *your* corner.
- **A notebook with predictions written before runs** (6.6). The single highest-leverage habit in
  the whole curriculum, because it is how taste gets trained.
- **A reading group**, even of two people. Arguing about a paper is worth three solitary readings.
- **Public writing** as thinking-out-loud. Write the explanation you wish you'd found; it clarifies
  your own understanding and is how people discover you.
- **A shipping cadence.** Something *finished* every quarter, even if small. Unfinished work
  compounds to zero.

## Staying current without drowning

The firehose (6.5) does not slow down, and the correct response is a system rather than willpower:
follow a small number of labs and authors instead of the feed; let a result be discussed for a
fortnight before deciding it matters — most don't replicate, and the ones that do will still be
there, better explained; and accept that you will miss things. The alternative is missing everything
by trying to read all of it.

## What you now own — the whole program

Eight modules, and one continuous argument:

- **M1 · Geometry.** Meaning became direction; the dot product became agreement; loss became
  surprise; learning became descent in seven billion dimensions.
- **M2 · Mechanism.** Frozen embeddings couldn't carry context, so you *invented* attention to fix
  it, gave it heads, taught it order, and assembled a machine whose every parameter you audited.
- **M3 · Behaviour.** Tokens, sampling, the cache, the bandwidth wall — and hallucination,
  chain-of-thought, and in-context learning as *consequences* rather than mysteries.
- **M4 · Engineering.** The memory wall, the four parallelisms, conditional compute, fewer bits, the
  invoice, and how to read any model card as an instrument panel.
- **M5 · Training.** What it eats, the curve labs bet on, ninety days of not dying, and the thin
  final layer of human judgment that shapes a model's character.
- **M6 · Frontier.** Why you can't just read the weights, how to read them anyway, what we can't
  specify, where capability is heading, and how to read and produce literature.
- **M7 · Adaptation.** The decision that precedes all technique, the low-rank bet, data as the real
  lever, preference tuning, the toolchain, and how to know whether any of it worked.
- **M8 · Efficiency and mindset.** Where time actually goes, kernels, a frontier lab taken apart
  piece by piece, capability transfer — and the seven generators that produce new ideas on purpose.

Now go back to the question this course opened with, in lesson 1.1:

> *A computer can only do arithmetic. How could arithmetic ever know that "cat" is more like "dog"
> than like "carburetor"?*

You can answer it at every level now. Geometrically: they occupy nearby directions in a space
arranged so that nearness means similarity. Mechanistically: attention moves information between
those directions and feed-forward layers compute on it. Statistically: nothing arranged it
deliberately — minimising surprise over enough text *forced* the arrangement. Physically: it is
matrix multiplications streaming across memory bandwidth at a price per token you can compute.
Interpretably: those directions are superposed, so reading them needs a dictionary you know how to
build and how to doubt. And practically: you could now *fine-tune* that geometry for a task, *shrink*
it to run on a laptop, *measure* whether you helped, and *explain* the whole chain to a twelve-year-
old.

Forty-eight lessons for one question, and every layer of the answer is load-bearing.

## Where this ends

Lesson 6.6 closed the technical curriculum; these last two modules gave you the practitioner's craft
and the frontier's habits of mind. There is nothing left for the platform to teach you, and that is
not a rhetorical flourish — it is the actual situation.

What remains cannot be delivered in lessons: the experience of being confidently wrong in public and
finding out exactly why; the slow accumulation of taste that comes from predicting results and
watching yourself miss; the specific, unglamorous competence of finishing things.

Your teachers from here are the paper on your desk, the experiment that came out backwards, and the
review queue on your dashboard — those questions you marked *missed* are the ones your future self
most needs you to redo.

So, concretely, on Monday: pick the direction. Write the twelve-month plan from the template above,
with dates. Start Q1's replication. Write down what you expect to happen before you run it.

That's the job. It was always the job. Go do it.
`,
    },
    {
      type: 'ponder',
      question: md`You are twelve months in. No headline result. But your tooling is excellent, you
have four honest write-ups (two of them negative results), and you understand your problem area
better than almost anyone who hasn't done this. Is this failure? And — the harder half — what would
genuinely *distinguish* this from the case where you should switch directions?`,
      answer: md`**Not failure, and the reasoning matters more than the verdict.** What you have
accumulated is *capability*: infrastructure that makes year two's experiments cheap, calibrated
intuition about which claims in your area are load-bearing, four artifacts that make you findable,
and — from the negative results specifically — knowledge the field lacks. Most people's fourth
project is the one that matters, and they only reach it because the first three built the machine
that made it possible.

**But the honest counter-test, because "keep going" can also be denial.** Three things should be
*true* if the direction is still right, and each is checkable:

1. **Are you still learning?** Not "is it going well" — are your predictions getting *better*? If
   you're no more calibrated than a year ago, the loop isn't running.
2. **Are you producing artifacts?** Finished things, on a cadence. A year of near-misses with nothing
   shipped is a different situation from a year of four honest write-ups.
3. **Is your clarity increasing?** Can you state the central open question of your area more sharply
   now than in month one? Growing clarity means you're converging on something; a year of equal
   vagueness means you're circling.

Fail all three and switch without shame — the tooling and habits transfer, so it was not wasted.
Pass all three and the absence of a headline result is simply what year one usually looks like from
the inside. The failure mode to actually fear is neither persistence nor switching: it is *not
finishing*, which produces no evidence either way and leaves you unable to tell which situation
you're in.`,
    },
    {
      type: 'ponder',
      question: md`Apply the compounding test — *does this make my next project cheaper?* — to three
project sketches, and rank them: **(A)** reproduce a published quantization result on two open
models and write it up; **(B)** build a contamination-resistant evaluation set for a domain you know
well, and measure several models on it; **(C)** try fifteen prompting tricks on a benchmark and
report which scored best.`,
      answer: md`**(B) > (A) > (C)**, and the gaps are instructive.

**(B) compounds hardest.** You finish with a *reusable instrument*: every future project of yours
can be measured with it, and other people can use it too — which means it generates collaborations
and citations while you sleep. It also exploits your edge (a domain you know), needs little or no
compute, and teaches you where models fail in that domain, which generates your next questions for
free. Infrastructure plus edge plus question-generation is close to the ideal shape.

**(A) compounds moderately.** You build a quantization evaluation pipeline you'll reuse, and you gain
calibrated knowledge of what actually replicates. But the artifact is more narrowly reusable than a
benchmark, and the intuition is specific to that technique.

**(C) barely compounds at all.** Fifteen prompting tricks on one benchmark produces a leaderboard
snapshot with a short shelf life, no reusable tooling, a result that likely won't survive the next
model release, and — worst — no accumulated understanding of *why* anything worked. It also walks
straight into 5.6's Goodhart problem. Notice that (C) is the *easiest to start* and the most likely to
look productive early, which is exactly why it's the trap.

**The general rule extracted:** prefer projects that leave behind an *instrument* over projects that
leave behind a *number*. Instruments are how one year of work becomes five years of advantage.`,
    },
  ],
  questions: [
    {
      id: 'm8-l6-q1',
      kind: 'mcq',
      prompt: md`What is the sharpest test of whether a project will compound?`,
      options: [
        'Will it be published at a top venue?',
        'Will it make my NEXT project cheaper — through reusable tooling, accumulated intuition, or an artifact others use?',
        'Is it in a currently trending area?',
        'Does it use the largest model I can access?',
      ],
      answer: 1,
      explain: md`Compounding is about what a project *leaves behind* for the next one: infrastructure,
domain intuition, and artifacts others adopt. Option A conflates a proxy with the goal (and 5.6
should have made you suspicious of optimising proxies); option C is precisely the topic-hopping that
prevents depth; option D confuses scale with value — a small careful study on one GPU frequently
compounds more than a large sloppy one. The habit worth building is asking this question *before*
starting, when it can still change what you do.`,
    },
    {
      id: 'm8-l6-q2',
      kind: 'numeric',
      prompt: md`**Fermi.** A twelve-month plan of four projects, each averaging about 30 GPU-hours
at $2.50 per GPU-hour, plus roughly the same again for false starts and re-runs. What is the annual
**compute** cost, in dollars?`,
      answer: 600,
      tolerance: 400,
      explain: md`$4 \times 30 \times \$2.50 = \$300$, doubled for the reality of failed runs and
re-runs $\approx$ **\$600 for the year** — less than a laptop. This is the number that should
disqualify "I don't have the resources" as a reason not to start. The genuinely scarce inputs are
time, taste, and persistence; the financial barrier to serious small-scale research collapsed some
years ago and most people have not updated.`,
    },
    {
      id: 'm8-l6-q3',
      kind: 'mcq',
      prompt: md`Which research area is most accessible to a capable newcomer with **no GPU at
all**?`,
      options: [
        'Novel architecture design, since ideas matter more than compute',
        'Evaluation — contamination audits, benchmark design, and statistical rigour applied to published comparisons, all of which need judgment more than FLOPs',
        'Large-scale pretraining studies, using published loss curves',
        'Kernel optimisation, since kernels are small programs',
      ],
      answer: 1,
      explain: md`Evaluation is judgment-heavy and compute-light, badly under-supplied, and produces
*instruments* other people adopt — an unusually good newcomer position. Option A is the classic
misjudgement: architecture ideas are cheap, but *credible* architecture claims need compute-matched
baselines (6.5) that a newcomer without hardware cannot produce. Option D is tempting and wrong for
a specific reason worth knowing — kernels are short programs but require the hardware to profile
on, and an unprofiled kernel optimisation is a guess (8.1).`,
    },
    {
      id: 'm8-l6-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Using only the compounding test, construct the argument
for why the standard advice "start by replicating a published result" is good advice for a first
project. Address: (1) what a replication leaves behind that a novel project usually doesn't; (2) why
the feedback signal is unusually good; (3) what happens if the replication *fails*, and why that is
a strong outcome rather than a wasted quarter; (4) one specific case where this advice would be
wrong.`,
      rubric: md`**(1) What it leaves behind:** working infrastructure (data pipeline, training or
evaluation harness, plotting) built against a target you know is achievable, plus the thousand
unstated implementation details papers omit — both directly reusable by the next project. A novel
project builds the same tooling but *without* knowing whether the target is reachable, so tooling
bugs and scientific dead-ends are confounded.

**(2) The feedback signal:** you have a known answer to check against. That is rare and immensely
valuable — it tells you whether your setup is correct, which is exactly what you cannot know when
chasing an unknown result. It is the only common situation in research where you get to grade
yourself.

**(3) Failed replication:** if you are confident in your setup, a failure is a *result* — the field
systematically under-produces these (6.5's reproducibility discussion), they are genuinely useful,
and publishing one honestly builds a reputation for trustworthy measurement. The quarter converts
from "learning exercise" to "contribution."

**(4) When it's wrong** (any well-argued case): the result requires compute you don't have, making
failure uninterpretable; the area moves so fast the target is obsolete before you finish; or you
already have the relevant tooling and intuition, in which case you're paying replication's cost
without its benefit and should extend instead.

Full credit requires the argument to run *through* the compounding test rather than citing the
advice as received wisdom.`,
    },
    {
      id: 'm8-l6-q5',
      kind: 'numeric',
      prompt: md`You triage 20 papers a week using the three-pass method's five-minute first pass.
Roughly 2,500 machine-learning papers appear weekly. What percentage of the field's output are you
seeing? (One decimal.)`,
      answer: 0.8,
      tolerance: 0.3,
      explain: md`$20/2500 = 0.8\%$ — and this is what a *disciplined, sustainable* reading practice
looks like from the outside. The point is not to feel inadequate but to update your model of what
"well-read" means: everyone you admire is also seeing under one percent, selected well. Selection
beats volume, which is why 6.5 is about triage rather than reading speed, and why following a small
number of labs and authors outperforms following the feed.`,
    },
    {
      id: 'm8-l6-q6',
      kind: 'numeric',
      prompt: md`Four projects, each needing about 100 hours. Without reusable tooling each takes the
full 100. With tooling, the first still takes 100 (40 of which build the toolkit) but each later
project takes only 60. How many **hours** does the compounding approach save across the four?`,
      answer: 120,
      tolerance: 20,
      explain: md`Without: $4 \times 100 = 400$ hours. With: $100 + 3 \times 60 = 280$ hours. Saving:
**120 hours — 30% of the year's project time**, recovered from a decision made in project one. And
the model understates the effect, because reusable tooling also makes you *more likely to run* the
marginal experiment: when a study costs an afternoon instead of a week, you do the extra ablation
that turns a weak result into a solid one.`,
    },
    {
      id: 'm8-l6-q7',
      kind: 'mcq',
      prompt: md`After twelve months you have no headline result, but four honest write-ups (two
negative), strong tooling, and much sharper understanding of your area. What is the correct read?`,
      options: [
        'A wasted year — switch areas immediately',
        'A normal and productive first year: the accumulated capability is the asset. Switch only if you have stopped learning, stopped shipping artifacts, or stopped gaining clarity',
        'Proof that you need more compute before attempting research',
        'A sign you should work on something more popular to get noticed',
      ],
      answer: 1,
      explain: md`Year one usually looks like this from the inside, and the checkable counter-tests
(learning? shipping? clarity?) are what separate legitimate persistence from denial — which is the
part that makes this a judgement rather than a platitude. Option D inverts the compounding logic
entirely: chasing popularity restarts the depth clock. The genuine failure mode isn't slowness, it's
*not finishing* — which produces no evidence either way and leaves you unable to diagnose your own
situation.`,
    },
    {
      id: 'm8-l6-q8',
      kind: 'written',
      prompt: md`**Map an area.** Choose one open-problem area from this lesson (or another you can
justify). Write its map entry as a researcher would: (1) the binding constraint, argued with a
number or measurement rather than asserted; (2) what is genuinely tractable at *your* compute level,
stated concretely; (3) what a newcomer contribution looks like — a specific project, not a topic;
(4) why this area is currently under- or over-supplied with researchers, and what that implies for
you; (5) the strongest reason someone should *not* work here.`,
      rubric: md`Grade as a supervisor assessing whether the candidate has actually thought about it.

**(1)** A constraint with evidence: e.g. evaluation — 5.6's binomial arithmetic showing most
published gaps are statistically indistinguishable; agents — 6.4's compounding reliability;
efficiency — a roofline placement (8.1). Assertion without a number loses the point.

**(2)** Concrete and matched to real hardware ("SAE training on a 1.4B open model, one GPU, about
six hours"), not aspirational.

**(3)** A *specific project* with a measurable outcome, not "work on interpretability." The test
from 6.6 applies: can you state the first experiment in one sentence, and could it come out either
way?

**(4)** An honest supply argument — glamour, compute requirements, credential gating, or unglamorous
subject matter — with the implication drawn for the candidate's own position.

**(5)** A genuine reason against: the area may be crowded by the time you have results; the
constraint may dissolve with the next model generation; the measurements may not correlate with what
anyone cares about. An entry with no downside is advocacy, and 6.5 trained you to distrust that.`,
    },
    {
      id: 'm8-l6-q9',
      kind: 'mcq',
      prompt: md`Why is "finishing" described as the binding skill for a researcher's first few
years?`,
      options: [
        'Because unfinished work produces no artifact, no external feedback, and no reusable tooling — so it compounds to zero regardless of how good the idea was',
        'Because most research questions are easy once you start',
        'Because journals reject incomplete submissions',
        'Because finishing quickly is more important than being correct',
      ],
      answer: 0,
      explain: md`Compounding runs through *outputs*: the artifact others use, the feedback that
calibrates you, the tooling that cheapens the next project. An abandoned project at 80% has taught
you something privately and produced none of those. Option D is a real misreading to guard against —
the claim is about *completing* work, not rushing it; a carefully finished small study beats a
sprawling unfinished one, and both beat a fast wrong one.`,
    },
    {
      id: 'm8-l6-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "What does a scientist actually *do* all
year? Do they just think of something amazing and then it works?" Explain, with analogies you invent:
why the first project is usually copying something someone else already did (and why that isn't
cheating), why building tools makes everything afterwards faster, why finishing small things beats
starting big ones, and why being wrong on purpose — writing down your guess first — is the part that
makes you better. No jargon without a kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **Copying first, and why it isn't cheating** — like learning to cook by following a recipe someone
   else wrote: you find out whether your oven runs hot, where your knives are, and what the recipe
   left out. Then when you invent your own dish you're not also discovering that your oven is broken.
   The kid should see that replication is about *learning your own kitchen*.
2. **Tools make everything after faster** — spend a day building a proper workbench and every project
   afterwards starts on the bench instead of the floor. Concrete beats abstract here.
3. **Finishing small beats starting big** — ten half-built treehouses give you nothing to sit in; one
   finished small one gives you a place to sit *and* teaches you how to build the next one better.
4. **Writing your guess down first** — if you don't say what you expect, you'll always feel like you
   knew it afterwards; writing it down is how you find out when you were wrong, and being wrong on
   purpose is the fastest way to get better at guessing. (This is the heart — credit answers that
   make the kid *want* to do it.)
5. **Jargon audit:** "replication," "tooling," "artifact," "pre-registration," "compounding" used
   without kid-level translation = partial at best.`,
    },
    {
      id: 'm8-l6-q11',
      kind: 'numeric',
      prompt: md`Following the plan's shipping cadence — one finished artifact per quarter — how
many public artifacts do you have after **three years**?`,
      answer: 12,
      tolerance: 1,
      explain: md`$3 \times 4 = 12$ finished, public artifacts. Sit with how modest the per-unit
requirement is: one finished thing every three months, which is an entirely humane pace — and how
uncommon the result is, because most people ship irregularly or not at all. Twelve honest artifacts
in an area, with the tooling and reputation that accumulate alongside them, is a genuinely strong
position, and it was built from a decision about *cadence* rather than a burst of brilliance.`,
    },
    {
      id: 'm8-l6-q12',
      kind: 'written',
      prompt: md`**The capstone — your twelve-month research plan.** This is the final exercise of
the entire curriculum, and it should take you an hour, not five minutes. Write the plan you will
actually execute: (1) your chosen direction, with the binding-constraint argument for why it matters;
(2) your personal-fit case — compute, curiosity, edge; (3) Q1's replication: the specific paper or
result, and what tooling you expect to build; (4) Q2's extension: the obvious next question and your
written prediction of the answer; (5) Q3's original question, generated from a confusion or by
running the generators (8.5); (6) the artifacts you will publish and where; (7) your weekly habits,
as calendar commitments; (8) the checkpoints at which you would *abandon* this direction, stated
concretely enough that a friend could hold you to them. Then put dates on all of it.`,
      rubric: md`Grade as a supervisor deciding whether to back this person for a year.

**(1) Direction + constraint:** argued with a number or measurement (8.5's generator 1), not asserted.
"Evaluation matters" fails; "most published gaps on 200-item benchmarks are within noise, and here is
the arithmetic" passes.

**(2) Personal fit:** honest about actual hardware; a real statement of what holds your interest; and
a specific edge (domain, language, access, background). Vagueness in any of the three is the most
common reason plans die in month four.

**(3) Q1:** a *named* result to replicate and an explicit list of tooling expected — the tooling is
the point, so a plan that doesn't mention it has missed the compounding argument.

**(4) Q2:** a specific extension question *plus a written prediction*. The prediction is
non-negotiable: without it, the experiment cannot inform you (6.6).

**(5) Q3:** an original question traceable to a stated confusion or a named generator, and small
enough to be answerable at the stated compute.

**(6) Artifacts and venue:** what gets published, where, and in what form (repo, write-up, benchmark,
paper). "I'll see how it goes" fails.

**(7) Habits as calendar commitments:** a weekly triage slot, a notebook practice, a shipping cadence
— specific enough to be kept or broken, not aspirational.

**(8) Abandonment checkpoints:** the item that most distinguishes a real plan from a wish. Concrete
tests (am I still learning? shipping? gaining clarity?) with dates, stated so a friend could hold you
to them.

**Dates on everything.** An undated plan is an intention.

**Full credit** = a plan a competent friend could hold you accountable to without a single
clarifying question. If you write this honestly and then *do* Q1, you will have done more than the
overwhelming majority of people who set out to learn this field — and the curriculum will have
finished its job.`,
    },
  ],
}
