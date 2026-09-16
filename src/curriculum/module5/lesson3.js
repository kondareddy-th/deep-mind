// Module 5, Lesson 3 — The run: three months of not dying (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm5-l3',
  title: '5.3 The run — three months of not dying',
  subtitle: md`Architecture chosen, data mixed, budget split, optimizer tuned. Nothing is left to decide — except that someone must now press go on 16,000 GPUs and keep them alive for ninety days. This lesson is the dashboard, the disasters, and the detective work of a frontier pretraining run.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Every decision has already been made. The architecture was settled in Modules 2 and 4. The data
mixture was engineered in 5.1. The compute split — how many parameters, how many tokens — came out
of 5.2's allocation arithmetic. The optimizer, the warmup, the cosine schedule, the gradient
clipping: 1.6. There is, on paper, nothing left to think about.

And yet the hardest part hasn't started. Someone must now press **go** on 16,000 GPUs (4.2) and
keep them computing, correctly, in lockstep, for about a quarter of a year. Feel the scale: a 405B
model on 15T tokens costs $C \approx 6ND \approx 3.6 \times 10^{25}$ FLOPs (5.2's identity).
Sixteen thousand accelerators at a peak of roughly $10^{15}$ FLOP/s each is $1.6 \times 10^{19}$
FLOP/s of theoretical firepower — 26 days of arithmetic if nothing ever waited on anything. Nothing
runs at peak (we'll derive why); at a realistic 45% utilization it's 58 days of pure compute, and
with failures, restarts, and re-work layered on, the calendar says: about three months.

Here is the mental model to install before anything else. A frontier pretraining run is **not like
launching a rocket** — a rocket is a minute of concentrated risk followed by coasting. It is like
**keeping a city alive through a winter**: no single moment is dramatic, but the power must stay
on, the pipes must not freeze, somebody must be awake at 3 a.m., and small neglected problems
compound into catastrophes. The log of a real run — and at least one lab has published its raw
logbook, which reads exactly like a ship's log — is a detective story: anomalies, suspects,
evidence, verdicts. This lesson teaches you to read one. Better: to be the detective.
`,
    },
    {
      type: 'text',
      md: md`
## The dashboard — four panes and a null hypothesis

City-keeping begins with instrumentation. Four panes matter most, and each answers a different
question.

**Pane 1: loss versus the predicted curve.** Not loss versus yesterday — loss versus the scaling
fit you bought with 5.2's ladder of small runs. That fit is not a forecast you admire; it is the
**null hypothesis you test every hour**. On trend? Touch nothing — do not "improve" a run that is
doing exactly what the law promised. Off trend? Investigate, because the curve has authority: it
was measured, not hoped.

**Pane 2: the gradient norm — the seismograph.** The loss tells you damage *happened*; the
gradient norm often tells you trouble is *arriving*. Instabilities — a poisoned batch, a numerical
blow-up — usually announce themselves as a gradient-norm spike several steps before the loss
registers anything. Gradient clipping (1.6) is the seatbelt bolted on here: it caps the update when
the norm exceeds a threshold, and most transients die quietly inside it. So the dashboard also
plots *fraction of steps clipped*: occasionally is the seatbelt doing its job; every step means
you are driving into a wall.

**Pane 3: throughput, reported as MFU.** Model FLOPs Utilization: the FLOPs your model actually
needed, divided by the cluster's theoretical peak. Concretely: at 2.9 million tokens/s, a 405B
model consumes $2.9 \times 10^{6} \times 6 \times 4.05 \times 10^{11} \approx 7.0 \times 10^{18}$
useful FLOP/s against the $1.6 \times 10^{19}$ peak — MFU $\approx 44\%$. Why not 100? Derive it
from what you know. (a) **Communication** (4.2): every step ends in all-reduces and pipeline
handoffs — bubbles where silicon waits on network. (b) **Stragglers**: 16,000 GPUs advance in
lockstep, so the slowest one sets everyone's pace. (c) **Overhead that isn't "model FLOPs"**:
activation-checkpointing recomputation (4.1) burns real arithmetic that doesn't count as useful,
and checkpoint writes and restarts idle the whole city. At frontier scale, 40–50% is respectable
(reported industry practice, not a theorem). So what? At $3.6 \times 10^{25}$ total FLOPs, **one
MFU point is worth about a day of calendar** — teams fight for single points.

**Pane 4: evals on checkpoints.** Every so many billion tokens, the latest checkpoint gets a
benchmark suite. Because 5.2 taught you the uncomfortable truth: loss is not capability — and
average loss can hide one domain quietly regressing while the mixture drifts (5.1).
`,
    },
    {
      type: 'ponder',
      question: md`Of the four panes, the loss-versus-predicted-curve is the one veterans call the
most important alarm on the dashboard. Before revealing: what property does the scaling-law
prediction have that *no other signal on the dashboard has* — and what failure mode does that
property uniquely catch?`,
      answer: md`It is the only **absolute** reference. Everything else is relative to the run
itself: the gradient norm is judged against its own recent history, MFU against yesterday's, evals
against the last checkpoint. If the run rots slowly, "yesterday" rots with it — a relative monitor
compares the patient to the patient. The predicted curve was drawn *before the run started, from
outside it* (5.2's ladder), so it cannot be dragged along by the disease.

And that matters because the scariest failure is not a spike. Spikes announce themselves. The
scariest failure is a run drifting *slightly* off trend, week after week, with no drama anywhere:
0.005 nats behind this week, 0.011 the next — silent and compounding, until months of compute land
visibly above the loss you paid for. Causes worth suspecting: a subtly wrong data-mixture weight
(5.1), a low-grade numerical issue rounding a little wrong everywhere, hardware lying at a low
rate. None of them trips a relative alarm, because every day looks like the day before. Navigators
carry stars, not just the wake — the scaling curve is the star.`,
    },
    {
      type: 'text',
      md: md`
## Loss spikes — the forensics

Some night, the loss will do this: 2.212, 2.209, 2.213, **3.41**. A spike. Everything downstream of
this moment is detective work, so learn the suspects and their tells.

**Suspect 1: the data.** A shard of garbage that survived 5.1's filters — a crawler dump with one
line repeated two million times, a batch of binary junk decoded as text. The tell is
**reproducibility in data-space**: restart from the last checkpoint and replay; if the spike
recurs at the same *data position* even on different hardware, the data did it.

**Suspect 2: the numerics.** bf16 has fp32's range but only 8 bits of mantissa (4.1, 4.4) — coarse
steps, and range *edges*: one activation blowing past what bf16 can represent becomes an inf, one
inf becomes a NaN, and an all-reduce is a shared water main — one poisoned gradient and every GPU
in the group drinks it within a single step (4.2). The tell: per-layer activation and gradient
statistics, overflow counters.

**Suspect 3: the hardware.** A GPU computing wrong answers *without raising any error* — more on
this below. The tell is the mirror of suspect 1: the spike does **not** reproduce on replay when
the work lands on different nodes.

Now derive the response protocol from the options, cheapest first:

1. **Ride it out.** Small spikes usually self-heal: clipping (1.6) bounds the damage, Adam's
   momentum and variance state (1.6) smooth the aftershock, and the loss walks back down in a few
   hundred steps. If the curve returns to trend — pane 1 again — the incident is closed.
2. **Restart from checkpoint and skip the offending data.** The standard fix when the spike is
   big, repeats, or leaves the loss sitting off-trend: rewind to the last save, fast-forward the
   data loader past the poisoned window, resume. Why is "skip it and move on" *principled* rather
   than sloppy? Arithmetic: the skipped window is one shard among millions — maybe 40M tokens out
   of 15T, or 0.0003% — and 5.1's funnel already discarded **95% of the raw crawl** on far weaker
   evidence than "this data detonated my run." Your dataset was always a choice; you just chose
   slightly harder.
3. **Heavier hammers** — permanently lower the learning rate, tighten clipping for the rest of the
   run — pay a forever tax to fix a local poisoning. Reserved for spikes that keep coming, which
   usually means the diagnosis is wrong.

And remember the seatbelt's selection effect: clipping silently absorbs most transients, so the
spikes you *see* on the dashboard are the survivors — the ones strong enough to matter.
`,
    },
    {
      type: 'example',
      title: 'a spike, worked like a detective',
      md: md`
From a (composite, but representative) run log:

- **step 231,240** — grad norm 3.9 against a recent band of 0.3–0.5; clip engaged. *(seismograph
  fires)*
- **step 231,300** — loss 2.21 → 3.41. *(damage report arrives, 60 steps later)*
- **steps 231,300–232,100** — loss decays back but flattens at 2.23: **0.02 nats above trend**.
  Pane 1 says: not healed.
- **decision** — ride-out failed its exit criterion; escalate. Restart from the step-231,000
  checkpoint, replay with the scheduler assigning *different nodes*.
- **step 231,290 (replay)** — spike recurs at the same data offset on different hardware.
  **Verdict: data.** (Same offset + different silicon acquits the hardware; suspect 2 was already
  unlikely — overflow counters stayed clean.)
- **fix** — rewind again, skip the loader forward 40M tokens (0.0003% of the diet), resume.
  Loss rejoins the predicted curve within the hour. Case closed.
- **postmortem** — the window held a crawler shard with one boilerplate line duplicated ~2M times:
  a dedup miss (5.1). A filter upstream gets a new rule; the run never hears about it again.

Total price of the incident: about three hours of cluster time — roughly 48,000 GPU-hours. The
same incident *without* checkpoints, or without a loader that can replay and skip deterministically,
costs the run itself. That machinery is the next section.
`,
    },
    {
      type: 'text',
      md: md`
## Checkpoints — the other thing called checkpointing

First, defuse a word collision. **Activation checkpointing** (4.1) is a *within-step* memory trick:
don't store activations during the forward pass, recompute them during the backward — trading
FLOPs for memory. What this section is about is the **run checkpoint**: a complete save-file of
the training *state*, written to distributed storage, so that death is a rewind instead of a
funeral. Same word, entirely different machine. Interviewers enjoy this collision; now it can't
catch you.

What must a run checkpoint contain? Everything needed to continue *as if nothing happened*: the
weights, Adam's momentum and variance vectors (1.6 — without them the optimizer restarts amnesiac
and the run wobbles), the learning-rate schedule position, the **data-loader position** (the spike
forensics above only worked because the checkpoint remembers exactly where in the data we were —
replay and skip are checkpoint features), and the random-number state. Tally the bytes with 4.1's
accounting — fp32 master weights, two Adam states, the working copy — and you get the memorable
**16 bytes per parameter**. A 70B model: $70 \times 10^{9} \times 16 = 1.12$ TB per save. A 405B
model: about **6.5 TB**, pushed to storage again and again, all run long.

So: how often should you save? That's an optimization, and to run it you need one input — how
often does the city lose power? Derive that number yourself before reading on.
`,
    },
    {
      type: 'ponder',
      question: md`A single modern GPU is reliable: say it fails, on average, once per **5 years**.
Your cluster has **16,000** of them, and the run needs all of them in lockstep (4.2), so any single
failure stops the world. Before revealing: how often does the *cluster* fail? Do the arithmetic —
and then say what your number does to the phrase "rare hardware failure."`,
      answer: md`Failure rates add. One GPU: one failure per $5 \times 365 \times 24 = 43{,}800$
hours. Sixteen thousand of them: $16{,}000 / 43{,}800 \approx 0.37$ failures per hour — a mean
time between cluster failures of

$$\frac{5 \times 365 \times 24}{16{,}000} \approx 2.7 \text{ hours.}$$

Roughly nine deaths a day; on the order of **800 over a ninety-day run**. "Rare" multiplied by
16,000 is *routine*: if one kid drops an ice cream once a summer, a stadium of 16,000 kids drops
one every few minutes. And the arithmetic reproduces reported reality: one frontier lab's
published post-mortem counted **466 unplanned interruptions in 54 days** of its flagship run —
one every 2.8 hours, roughly three-quarters traced to hardware. The design consequence: failure is
not an *event* to react to, it's *weather* to build for — checkpoints, automated resume, spare
capacity. That's the next derivation.`,
    },
    {
      type: 'example',
      title: 'choosing the checkpoint cadence, by expected value',
      md: md`
Two costs pull in opposite directions. Checkpoint too often and you drown in writes; too rarely and
every death erases hours. So price both, per hour of run time.

Let $w$ = time to write one checkpoint (say 5 minutes, $w = 0.083$ h, if the write stalls
training), $M$ = cluster MTBF ($2.7$ h, just derived), and $T$ = the cadence we're choosing.

- **Insurance premium:** a $w$-long write every $T$ hours costs a fraction $w/T$ of all time.
- **Expected rework:** failures arrive at rate $1/M$; each lands, on average, halfway through an
  interval, destroying $T/2$ of progress. Cost rate: $\dfrac{1}{M} \times \dfrac{T}{2} = \dfrac{T}{2M}$.

Total overhead fraction: $f(T) = \dfrac{w}{T} + \dfrac{T}{2M}$. One term falls with $T$, one
rises — there's a valley. Find it by calculus or by AM–GM (the sum of two such terms is minimized
where they're *equal* — 5.2's equimarginal principle, visiting again):

$$\frac{w}{T^{*}} = \frac{T^{*}}{2M} \quad\Longrightarrow\quad \boxed{\,T^{*} = \sqrt{2wM}\,}$$

Plug in: $T^{*} = \sqrt{2 \times 0.083 \times 2.7} \approx 0.67$ h — **checkpoint every ~40
minutes**, squarely in the 30–60 minute band real runs use. (Supercomputing folks have carried
this result since the 1970s as the Young–Daly interval.)

Now the sting: at the optimum both terms equal $0.12$, so $f(T^{*}) \approx 25\%$ — with 5-minute
blocking writes, **a quarter of the cluster's life goes to mortality and insurance**. Since
$f(T^{*}) = 2\sqrt{w/(2M)}$ scales as $\sqrt{w}$, quartering the write time halves the overhead —
which is exactly why labs engineer asynchronous, sharded checkpoint writes to node-local SSDs
(reported practice): get $w$ to 30 seconds and the optimum moves to $T^{*} \approx 13$ min with
overhead $\approx 8\%$. A storage-engineering detail worth seventeen percent of a
nine-figure run. *That* is why checkpointing is a subfield.
`,
    },
    {
      type: 'text',
      md: md`
## The hardware lies, sometimes

The failures above at least had the decency to be loud — a GPU falls off the bus, a job crashes,
the scheduler notices. The insidious failure mode is **silent data corruption**: a GPU that
occasionally computes $2 + 2 = 5$ and *raises no error* — a marginal transistor, a bit flipped
under heat, arithmetic quietly wrong at some low rate. No crash, no NaN, just poison dripped into
the gradients. How would you even detect a liar among 16,000 workers? Reported industry practice,
all of it: **redundant computation** (recompute a sample of work on different nodes and compare —
disagreement convicts), **grad-norm anomalies traced to a single rank**, and background self-test
sweeps during idle moments. Add the merely-annoying cousins: **stragglers** and **thermal
throttling** — one overheating GPU clocking itself down drags all 16,000 lockstep workers to its
pace (4.2), so MFU sags and pane 3 points the finger.

Around all of this sits an ops culture that looks more like running a power plant than doing
research (again: reported practice, but consistently reported): burn-in tests to cull weak
hardware before the run, hot spares standing by, automated detect–eject–resume machinery so that
a routine 3 a.m. failure is handled with **zero humans awake**, and an on-call rotation with
runbooks for everything the machinery can't handle. The measure of a great infrastructure team is
how boring the logbook is.
`,
    },
    {
      type: 'text',
      md: md`
## The stability bag — and tuning a run you cannot afford to tune

A few more tools from the run-survival bag, honestly labeled.

**Batch-size ramp.** Derive it from 1.6: early in training, the loss falls along almost any
downhill direction, so cheap, noisy, small-batch gradients are perfectly adequate — spending a
huge batch to polish a gradient you barely need is waste. Late in training, signal must beat
noise, and big batches earn their keep. So real runs *ramp*: start with smaller batches, grow them
over the run. (Common reported practice.)

**Z-loss and logit norms** — one line each, filed under *stability lore*: z-loss adds a tiny
penalty keeping the softmax's log-normalizer near zero so logits can't slowly wander toward bf16's
range edges; QK-norms normalize queries and keys so attention logits can't saturate (2.5's
machinery, kept on a leash). Neither is deep theory; both are scar tissue from someone's spiked
run.

**μP (Maximal Update Parametrization)** deserves its honest paragraph. The problem it solves: you
**cannot hyperparameter-search a nine-figure run** — one training of the real model is the entire
budget, so the learning rate must be right the *first* time. Under standard parametrization,
the optimal learning rate *drifts* as models get wider, so a sweep on a small model misleads you
about the big one. μP rescales initializations and per-layer learning rates with width in just the
way that makes optima approximately **width-invariant**: tune on a 40M-parameter model for the
price of lunch, transfer the numbers to the 40B. The muTransfer experiments demonstrated exactly
this, and the technique is increasingly standard in frontier planning — with the honest caveats
that transfer is approximate, and depth, data, and batch size each keep some residual say.
`,
    },
    {
      type: 'text',
      md: md`
## One shot — the culture the arithmetic buys

Step back and notice what every section of this lesson assumed: the big run is **unrepeatable**.
Three months and nine figures buy exactly one attempt. That single fact generates the field's
entire experimental culture:

**Ablate everything at small scale.** Every choice in this run — architecture variants (2.5, 2.6,
4.3), data mixtures (5.1), learning-rate and batch settings (via μP), even spike-response drills —
was tested on 5.2's ladder of small models at a thousandth of the cost, because the ladder is
where being wrong is affordable. The scaling curve then carries the conclusions up.

**Then commit.** The field's own name for the final run is the **YOLO run** — you only launch
once. The psychology is real: at small scale, researchers are bold; at 16,000 GPUs the culture is
deliberately conservative — boring, ablated, de-risked choices only, because a clever untested
idea with a 5% failure probability is a 5% chance of vaporizing a nine-figure budget. Where the
stakes are highest, the science must be most finished.

**The endgame.** In the final stretch, two planned things happen at once: the cosine schedule
(1.6) bends the learning rate toward zero, and the data mixture executes its **anneal** (5.1) —
the diet shifts to the highest-quality tokens for the final descent, and the loss rewards you with
one last, satisfying drop. Then the run simply... stops. Sitting in storage: a base-model
checkpoint that can continue any document ever written and *converse about nothing* — a
magnificent alien, and 5.4's opening problem.
`,
    },
    {
      type: 'ponder',
      question: md`Week 3 of 13. Your small-scale ladder — still running on the side — now says a
learning rate 30% higher would have landed the final loss about 0.01 nats lower. Restart, or
continue? Don't vibe it — set up the actual decision arithmetic: what counts, what doesn't, and
what number would flip you.`,
      answer: md`First, strike what does *not* count: the three weeks already spent are **sunk** —
identical in both branches, so they cannot appear in the comparison (the human instinct to "not
waste them" is the sunk-cost fallacy wearing a lab coat). What remains:

**Restart:** pay 13 more weeks of cluster (about $13 \times 7 \times 24 \times 16{,}000 \approx
35$M GPU-hours) and land 0.01 nats lower — *in expectation*: the 0.01 is a small-model
extrapolation with its own error bars, to be weighed against run-to-run seed noise.
**Continue:** pay 10 more weeks and accept the shortfall — noting that 5.2 says nats near the
floor are the expensive, precious kind, so 0.01 is not automatically negligible.

So the true trade is: three extra weeks of cluster time *plus three weeks of calendar* — and
calendar is often the dearest currency, since a competitor's launch or a product deadline doesn't
care about your loss — against an uncertain 0.01 nats. A third option exists and has been used in
reported runs: raise the learning rate *mid-flight* — cheaper, but now you're doing surgery on a
patient the ablations never studied, adding unquantified spike risk (this whole lesson) for
unquantified gain.

There is no clean answer, and that's the point: the reasoning — sunk costs excluded, expected
benefit versus *future* cost, error bars on the benefit, calendar priced in, risk of mid-flight
surgery weighed — **is** the lesson. And notice the meta-lesson: every tool in this chapter (μP,
the ablation ladder) exists precisely to make this miserable dilemma rare.`,
    },
    {
      type: 'viz',
      viz: 'training-run',
      caption: md`A ninety-day pretraining run, replayed in about a minute: the loss (coral)
against 5.2's predicted scaling curve (dashed), a narrator readout, and gold ticks marking events
on the axis — warmup, the long power-law grind, a data-poison spike at step 3000 resolved by
checkpoint-restart-and-skip, the quiet on-trend middle, the cosine-decay bend, and the final
anneal drop. Controls: play/pause, next-event, speed. Three assignments: (1) play it end to end
once, uninterrupted — that arc is the on-call engineer's quarter compressed 100,000-fold; feel how
much of it is *supposed to be boring*. (2) Rewind and use next-event to stop exactly at the
step-3000 spike — **before** reading the narration, commit out loud to your top two suspects and
your response protocol, then check yourself against the narrator's forensics. (3) Stop at the late
downward bend and again at the final drop: one is the learning-rate schedule doing precisely what
1.6 planned, the other is 5.1's anneal cashing in — say which is which, and why neither is an
anomaly worth paging anyone about.`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The dashboard:** the scaling prediction as the run's *null hypothesis* and only absolute
   reference (on trend → touch nothing; slow silent drift → the scariest failure); the gradient
   norm as seismograph; MFU $=$ achieved/peak model FLOPs, with 40–50% respectable at scale
   because communication bubbles (4.2), stragglers, and recomputation (4.1) each take their cut —
   and one MFU point worth about a day of calendar.
2. **Spike forensics:** three suspects — data (5.1's escapees), numerics (bf16 range edges, one
   NaN shared by all-reduce), lying hardware — each with its diagnostic tell; the protocol: ride
   out small ones (clipping, 1.6, catches most), restart-from-checkpoint **and skip** for the
   rest, principled because the funnel discarded 95% on weaker evidence.
3. **Checkpoints, the run-state kind** (word collision with 4.1 defused): weights + Adam state +
   loader position at 16 bytes/param — 1.12 TB per save at 70B, 6.5 TB at 405B; cluster MTBF
   $\approx 43{,}800/16{,}000 \approx 2.7$ h; cadence from expected value, $T^{*} = \sqrt{2wM}
   \approx 40$ min, and overhead $\propto \sqrt{w}$ — why checkpoint-write engineering is real
   money.
4. **The ops reality** (reported practice): silent data corruption caught by redundancy, hot
   spares, automated resume, on-call rotations — a power plant's culture around a physics
   experiment.
5. **The stability bag:** batch ramp derived from 1.6's noise logic; z-loss and QK-norm as scar
   tissue; μP as the honest answer to "you can't sweep a nine-figure run" — tune small, transfer
   wide.
6. **The one-shot culture:** ablate on the ladder, then YOLO; sunk costs out, expected values in;
   anneal, decay, stop.

The run ends. In storage sits a base model that can finish any document on Earth and answer no
question at all. Next lesson: the cheapest, highest-leverage stage in the whole pipeline — teaching
the costume to fit.
`,
    },
  ],
  questions: [
    {
      id: 'm5-l3-q1',
      kind: 'mcq',
      prompt: md`Every frontier training dashboard gives the **gradient norm** its own pane, watched
at least as nervously as the loss. Why?`,
      options: [
        md`It measures how much the model has learned so far`,
        md`Spikes in the gradient norm tend to *precede* loss spikes by steps — it's the seismograph that says trouble is arriving before the damage report lands`,
        md`It should decay smoothly to zero as training converges, so any rise indicates a bug`,
        md`It is the cheapest metric to compute, so it updates faster than the loss`,
      ],
      answer: 1,
      explain: md`Instabilities — poisoned data, numerical blow-ups — usually show up in the
gradients steps before the loss registers, which is exactly the early warning you want when every
step costs real money; it also drives the clipping seatbelt (1.6). Option C tempts because *some*
training curves are smooth, but gradient norms in practice hover in a noisy band and drift with
the schedule — they are not monotone, and treating every wiggle as a bug would page you hourly.
Option A confuses the *size of the update* with *accumulated knowledge* — the loss curve owns that
job. Cost (option D) has nothing to do with why it's watched.`,
    },
    {
      id: 'm5-l3-q2',
      kind: 'numeric',
      prompt: md`Each of your 16,000 GPUs fails, on average, once per 5 years — and any single
failure stops the lockstep world (4.2). What is the mean time between **cluster** failures, in
hours? (Work it: hours per GPU-lifetime, divided by number of GPUs.)`,
      answer: 2.74,
      tolerance: 0.5,
      explain: md`$5 \times 365 \times 24 = 43{,}800$ hours per individual failure; rates add
across 16,000 GPUs, so the cluster fails every $43{,}800 / 16{,}000 \approx 2.7$ hours — about
nine times a day, ~800 times over a ninety-day run. This one division is why checkpointing,
automated resume, and hot spares are not conveniences but the difference between a run and no
run. Published post-mortems match it almost exactly: 466 interruptions in 54 days is one per
2.8 hours.`,
    },
    {
      id: 'm5-l3-q3',
      kind: 'mcq',
      prompt: md`At step 231,300 the loss spikes from 2.21 to 3.4 and settles 0.02 nats above
trend. You restart from checkpoint on *different nodes* and the spike recurs at the same data
offset. The standard, principled response:`,
      options: [
        md`Permanently lower the learning rate for the remainder of the run`,
        md`Restart from the last checkpoint and skip the data loader past the offending window, then resume`,
        md`Restart the entire run from step 0 with a tighter gradient-clipping threshold`,
        md`Double the batch size so the bad examples get averaged away`,
      ],
      answer: 1,
      explain: md`Recurrence at the same data offset on different hardware convicts the data
(suspect 1) and acquits the hardware. The fix that matches the diagnosis: rewind and *skip* — one
window of maybe 40M tokens among 15T is 0.0003% of the diet, and 5.1's funnel already discarded
95% of the raw crawl on far weaker evidence. Option A tempts because it would probably work — but
it pays a *forever tax* on the whole run to fix a local poisoning. Option C burns weeks to
accomplish what a 40-minute rewind does. Option D dilutes but still eats the poison, and changes
training dynamics mid-run to boot.`,
    },
    {
      id: 'm5-l3-q4',
      kind: 'numeric',
      prompt: md`Your team checkpoints every **2 hours**. A failure lands at a uniformly random
moment within the interval. How many **minutes** of training progress does the average failure
destroy?`,
      answer: 60,
      tolerance: 10,
      explain: md`Uniform arrival means the expected position is halfway through the interval:
$T/2 = 1$ hour $= 60$ minutes of rework per failure. Now feel the aggregate: with the cluster
failing every ~2.7 hours, a ninety-day run sees ~800 failures — at an hour of rework each, that is
~800 cluster-hours, a full **month of the calendar**, lost to rewinding. Which is precisely why
the cadence is optimized (about 40 minutes for 5-minute writes) instead of picked by feel.`,
    },
    {
      id: 'm5-l3-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall — the checkpoint cadence.** On paper, from scratch: (1)
write the total overhead fraction $f(T)$ for cadence $T$, given checkpoint write time $w$ and
cluster MTBF $M$ — one term for writes, one for expected rework (justify the factor of 2). (2)
Minimize it — calculus or the equal-terms argument — to get $T^{*}$. (3) Plug in $w = 2$ minutes,
$M = 2.7$ hours. (4) Sanity-check your formula's *shape*: what should happen to $T^{*}$ as writes
get slower, and as hardware gets less reliable — and does it?`,
      rubric: md`**(1)** Writes: a $w$-cost every $T$ hours $\Rightarrow w/T$. Rework: failures at
rate $1/M$, each destroying on average *half* an interval (uniform arrival — that's the factor of
2) $\Rightarrow (1/M)(T/2) = T/2M$. So $f(T) = w/T + T/2M$.

**(2)** $df/dT = -w/T^{2} + 1/2M = 0 \Rightarrow T^{*} = \sqrt{2wM}$ — equivalently, note the
minimum of a falling-plus-rising pair of this form sits where the two costs are *equal* (the
equimarginal principle from 5.2's allocation, back again). Either route earns full marks; quoting
the formula without an argument earns none — that's the "derive" in the title.

**(3)** $w = 1/30$ h: $T^{*} = \sqrt{2 \times 0.0333 \times 2.7} = \sqrt{0.18} \approx 0.42$ h
$\approx$ **25 minutes**.

**(4)** $T^{*} \propto \sqrt{w}$: slower writes → checkpoint *less* often (each save costs more) ✓.
$T^{*} \propto \sqrt{M}$: flakier hardware (smaller $M$) → checkpoint *more* often ✓. Full credit
requires both limiting behaviors stated and checked against intuition — a formula whose shape you
haven't interrogated is a formula you don't own.`,
    },
    {
      id: 'm5-l3-q6',
      kind: 'mcq',
      prompt: md`A teammate says: "Failures aren't a problem for us — we already use checkpointing;
it's how we fit the model in memory (4.1)." What's the confusion?`,
      options: [
        md`No confusion — activation checkpointing also protects against hardware failures`,
        md`Two different machines share one word: *activation* checkpointing recomputes activations within a step to save memory; a *run* checkpoint persists weights, optimizer state, and loader position to storage so a dead run can rewind — only the second survives a failure`,
        md`Checkpointing of either kind is obsolete now that GPUs rarely fail`,
        md`Run checkpoints are only needed for models too large for one GPU`,
      ],
      answer: 1,
      explain: md`Classic word collision. Activation checkpointing (4.1) trades FLOPs for memory
*inside* a single training step — its data lives and dies in GPU RAM and helps you not at all when
a node catches fire. The run checkpoint is a save-file: 16 bytes/param of weights-plus-Adam-state
(1.12 TB at 70B) plus the data-loader position, written to distributed storage. Option A tempts
precisely because the shared name suggests shared purpose. Option C fails the arithmetic of q2:
individually rare times 16,000 is every 2.7 hours. Option D confuses fault tolerance with model
parallelism (4.2) — even a run that fits on one GPU needs saves.`,
    },
    {
      id: 'm5-l3-q7',
      kind: 'numeric',
      prompt: md`Your cluster's aggregate peak is $1.6 \times 10^{19}$ FLOP/s. Instrumentation
shows the model's useful compute running at $6.9 \times 10^{18}$ FLOP/s. What is the MFU, in
**percent**?`,
      answer: 43,
      tolerance: 3,
      explain: md`$6.9 / 16 \approx 0.43$ — **43%**, respectable at frontier scale. The missing
57% is structural, not sloppiness: communication bubbles while gradients all-reduce (4.2), the
slowest of 16,000 lockstep workers setting the pace, and arithmetic that doesn't count as "model
FLOPs" — activation recomputation (4.1), checkpoint writes, restart rework. The stakes of the
metric: on a $3.6 \times 10^{25}$-FLOP run, each point of MFU is roughly a day of calendar.`,
    },
    {
      id: 'm5-l3-q8',
      kind: 'written',
      prompt: md`**The silent drift memo.** Forty percent through the run, the loss sits 0.015
nats above the predicted curve. No spikes; gradient norms, MFU, and evals all look like last
week's. Write the investigation memo: (1) why this is *more* alarming than a loss spike, not less;
(2) your ranked suspects, with the diagnostic you'd run for each; (3) what you would *not* do yet,
and why.`,
      rubric: md`**(1)** Every other signal is relative — grad norm against its own history, MFU
against yesterday — so a slow rot drags its own baseline along and trips no alarm; the scaling
prediction (5.2's ladder) is the *only absolute reference*, and it is the one complaining. Spikes
announce themselves and get fixed; drift compounds silently — 0.015 nats today prices weeks of
compute at zero if it keeps accruing.

**(2)** Ranked suspects with diagnostics (any three well-argued earn credit): **data mixture bug**
(5.1) — audit the sampler's realized mixture proportions against spec, check per-domain losses for
one domain quietly regressing under a flat average; **subtle numerics** — per-layer activation/
gradient statistics against reference small-run profiles, bf16 overflow/underflow counters;
**lying hardware** (silent data corruption) — redundant recomputation of sampled work on disjoint
nodes, per-rank grad-statistics comparison; also legitimate: **the prediction itself** — recheck
the ladder fit and its error bars before convicting the run (distinguishing "run broke" from
"forecast was off" is part of the skill, 5.2).

**(3)** Do *not* yet: restart, tweak the learning rate, or "fix" anything — you'd be doing surgery
without a diagnosis, and every intervention adds its own risk (this lesson's one-shot logic).
Diagnose first, on side infrastructure, while the run continues. Full credit needs the
absolute-vs-relative argument in (1), concrete *checkable* diagnostics in (2) — not "look into the
data" — and the discipline in (3).`,
    },
    {
      id: 'm5-l3-q9',
      kind: 'mcq',
      prompt: md`Why has μP (Maximal Update Parametrization) become standard practice in planning
frontier runs?`,
      options: [
        md`It reduces the memory footprint of the optimizer states`,
        md`It makes optimal hyperparameters approximately transfer across model *widths*, so you can tune on a cheap small model and apply the result to the one run you cannot afford to sweep`,
        md`It eliminates the need for learning-rate warmup`,
        md`It guarantees the run will have no loss spikes`,
      ],
      answer: 1,
      explain: md`The nine-figure run permits exactly one training — a hyperparameter *search* at
full scale is arithmetically impossible. Under standard parametrization the optimal learning rate
drifts with width, so small-model sweeps mislead; μP rescales initializations and per-layer
learning rates so the optimum is approximately width-invariant — tune at 40M, transfer to 40B
(muTransfer's demonstration; increasingly standard, honestly still approximate). Option C tempts
because μP *does* change early-training dynamics — but warmup (1.6) survives; option D tempts
because stability *folklore* and μP travel together in papers, but μP is about transfer, not spike
immunity. Option A confuses it with the 4.1 memory tricks.`,
    },
    {
      id: 'm5-l3-q10',
      kind: 'numeric',
      prompt: md`**Fermi, at real scale:** a run checkpoint stores the full training state at
**16 bytes per parameter** (4.1's accounting: fp32 master weights plus both Adam states plus the
working copy). For a **405B**-parameter model, roughly how many **terabytes** is one checkpoint?`,
      answer: 6.5,
      tolerance: 2,
      explain: md`$405 \times 10^{9} \times 16 = 6.48 \times 10^{12}$ bytes $\approx$ **6.5 TB**
per save — written to distributed storage every half hour or so, all run long. This number is why
checkpoint *writes* have a duration $w$ worth engineering down (the cadence optimum scales as
$\sqrt{w}$), and why "just save constantly" is not free advice. At 70B the same accounting gives
1.12 TB — worth keeping in your head as the second calibration point.`,
    },
    {
      id: 'm5-l3-q11',
      kind: 'written',
      prompt: md`**The 3 a.m. playbook.** You are on call. The pager fires: loss spiked 1.2 nats
at step 187,400. Write the decision procedure you'd actually follow, as a sequence: the first
thing you check, the three suspects with the *specific* diagnostic that separates them, your exit
criterion for "ride it out," and the escalation — including why the standard escalation is sound
rather than sloppy.`,
      rubric: md`A strong answer is an ordered procedure, not an essay:

1. **First check:** the gradient-norm history around step 187,400 (did the seismograph fire first?
   is clipping now engaging every step?) and whether the loss is already walking back toward the
   predicted curve — pane 1 is the arbiter of "healed."
2. **Suspects and separators:** *data* — restart from checkpoint and replay; recurrence at the
   same **data offset** on different nodes convicts it; *numerics* — per-layer activation/gradient
   stats and bf16 overflow counters around the event (one inf becomes a NaN becomes everyone's
   NaN via all-reduce); *hardware* — spike does **not** reproduce on replay with different node
   assignment; redundant recomputation or per-rank stats finger the lying rank.
3. **Ride-out exit criterion:** something concrete — e.g., loss back within its trend band within
   a few hundred steps and clipping frequency back to baseline; "it looks better" is not a
   criterion.
4. **Escalation:** restart from last checkpoint and **skip** the offending data window. Soundness
   argument required: the window is one shard among millions (order 0.0003% of tokens), and 5.1's
   funnel discarded 95% of the crawl on far weaker evidence — the dataset was always a curated
   choice; also note what you *don't* do (permanent learning-rate cuts: a forever tax for a local
   poison).

Full credit: correct ordering (cheap checks first), all three suspects with *separating*
diagnostics (not just names), a falsifiable ride-out criterion, and the skip-justification
arithmetic.`,
    },
    {
      id: 'm5-l3-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old.** The kid asks: "You said training the AI takes
thousands of computers running for three months. Why is that *hard*? Computers just... run,
right?" Explain: (1) why, when you have *that many* computers, something is broken basically all
the time — with an everyday analogy that makes the arithmetic land; (2) what the save-and-rewind
trick is and why they save so often; (3) the story of one "bad day" — the AI reads something
broken, gets confused, and the team rewinds and skips it. No unexplained jargon — every technical
word gets a kid-sized explanation first or gets left out.`,
      rubric: md`Grade the teaching, not the vocabulary:

1. **The many-hands arithmetic, grounded** — one computer almost never breaks (once in five
   years!), but with 16,000 of them, *someone* breaks every few hours — like: if each kid drops
   an ice cream once a summer, a stadium of 16,000 kids drops one every few minutes. Must convey
   that rare-times-many equals all-the-time, and that when one breaks, *all* of them have to wait
   (they work in lockstep, like rowers in one giant boat).
2. **Save-and-rewind** — like saving a video game: when a computer breaks, you don't start the
   three months over, you go back to the last save. Saving so often because every crash throws
   away everything since the last save — and crashes come every few hours. Bonus insight: saving
   too often is also bad (you spend all your time saving), so there's a sweet spot.
3. **The bad-day story** — the AI learns by reading; one day it read a torn-up, glitchy page (the
   same line printed a million times) and got very confused; the team rewound to the last save and
   skipped that page — fine, because it has millions of books and one bad page won't be missed.
4. **Jargon audit:** "GPU," "checkpoint," "loss," "gradient," "MTBF," "shard" used without a
   kid-words explanation = partial credit at best. Renaming them well (save file, confusion score,
   torn page) is exactly the skill being tested.`,
    },
  ],
}
