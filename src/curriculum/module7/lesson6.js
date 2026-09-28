// Module 7, Lesson 6 — Did it actually work? (module finale, Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm7-l6',
  title: '7.6 Did it actually work? — evaluating your own model',
  subtitle:
    'Your training loss curve is beautiful. It cannot tell you whether the model is better, and the reasons are specific enough to derive. This lesson builds the four measurements that can, does the arithmetic that most practitioner evals quietly fail, and closes Module 7 by turning a hunch into a ship decision.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

The run finished at 2am. You open the training curve and it is genuinely lovely — smooth, no spikes,
falling from about $1.42$ to about $0.31$ over three epochs, the kind of curve people screenshot.

Your colleague looks at it and asks the only question that matters:

> **Is the model better?**

And here is the uncomfortable thing. The honest answer is not "probably" and not "we think so." The
honest answer is that **the curve on your screen cannot tell you** — not "doesn't quite tell you,"
*cannot*, in the way a thermometer cannot tell you the time. It is a perfectly good instrument
measuring a different quantity than the one you were asked about.

That is not a slogan. It has four separate causes, each worth deriving, because each one also points
at a piece of the measurement you have to build instead.

## Why the loss cannot answer it, in four parts

Recall what the number actually is (1.5). Training loss is the average per-token surprise of your
model on your training tokens:

$$\mathcal{L} = -\frac{1}{T}\sum_{t=1}^{T}\log p_\theta\!\left(x_t \mid x_{<t}\right)$$

Read that formula like a lawyer. Every word in it is a limitation.

**(a) It measures fit to *your* dataset — noise, duplicates, tics and all.** The loss has no concept
of "correct." It rewards predicting the tokens you handed it. If your set contains the same example
thirty times because your scraper had a bug, memorising it drops the loss. If half your targets
open with the same throat-clearing phrase, learning that phrase drops the loss. And memorisation is
not some exotic risk here — it is the path of least resistance. A LoRA at rank 16 on an 8B model
carries roughly 14 million trainable parameters on the attention projections, or about 42 million
with the FFN too (7.5); 5,000 examples of 500 tokens is 2.5 million training tokens. **You have
more knobs than training tokens, by a factor of five to fifteen.** A model that has simply
memorised your 5,000 examples produces a gorgeous curve and may be useless.

**(b) It is measured on the training distribution, not the deployment one.** Your dataset was
curated (7.3): deduplicated, cleaned, formatted, probably generated or filtered by something with
opinions. Real users are messier, more varied, and worse at typing. The loss tells you about a
world you built. Your colleague is asking about the world you ship into.

**(c) The thing you actually care about is not a token-level likelihood.** This one is worth doing
numerically, because it is the most surprising. Suppose your model emits a 400-token JSON object and
gets exactly one token wrong — a brace where a bracket belonged — with a surprisal of about 5 nats
where the typical token costs 0.2. The effect on the average loss is

$$\frac{5 - 0.2}{400} \approx 0.012 \text{ nats}$$

On a curve running from 1.42 to 0.31, a wiggle of 0.012 is invisible; you could not find it with a
ruler. Meanwhile the schema validator returns **false**, the parse fails, and the request errors out
100% of the time. Loss averages over token positions. Correctness is a property of the *whole
string*, and averaging is precisely the operation that destroys it. Every property you care about —
valid schema, right tone, right length, didn't refuse, didn't hallucinate a field — is like this.

**(d) Post-training deliberately trades likelihood for behaviour.** This is 5.4 and 5.6 arriving with
receipts. Alignment-style training moves probability mass toward behaviours you want and away from
the raw text distribution, so likelihood on general text can *rise* while the model gets *better* at
your task. The relationship between loss and quality is not merely weak; its **sign is not
guaranteed**. Anything whose direction you cannot trust is not a metric, it is a mood.

Held-out *validation* loss fixes (a) and helps with (b) — and you should absolutely watch it, for
reasons we'll get to in the memorisation kit. But it inherits (c) and (d) untouched. It is a better
thermometer. It is still a thermometer.

So: the loss answers "how well does this model predict these tokens?" Your colleague asked "is it
better?" Four different measurements answer that one, and you need all four.
`,
    },
    {
      type: 'ponder',
      question: md`Before we build them — the most common experience in applied fine-tuning. Your
training loss is beautiful, and your eval score is **flat**: 79.5 before, 79.0 after, on the same
200 items. Enumerate every cause you can think of, then — this is the part that matters — say which
*check* distinguishes which. Order your checks by how long they take. (There is one cause here that
is embarrassingly common and takes thirty seconds to rule out. Try to find it before revealing.)`,
      answer: md`Five live hypotheses, and one of them should be tested first because it is both the
cheapest to check and the one you least want to be true.

**0. The adapter isn't actually loaded.** You have been evaluating the base model all afternoon.
This happens constantly: the trainer saved the adapter to a checkpoint directory you aren't pointing
at, or the merge silently no-opped, or the eval script instantiated the base and never attached
anything. **The check, and do it first: run the base and the fine-tune on the same three prompts at
temperature 0 and diff the outputs.** If they are byte-identical, stop investigating anything else.
Thirty seconds, and it explains a *perfectly* flat result better than any subtle hypothesis does.

A close cousin, and the second thing to check: **chat-template mismatch.** You trained on one turn
format and evaluated with another, so at eval time the model is being addressed in a dialect it was
never taught. The outputs will differ from the base (so the diff test passes) but the fine-tuned
behaviour won't fire. Check that the exact template string used by the training collator is the one
your eval harness renders.

**1. Memorisation.** The model fit your 5,000 examples and learned nothing transferable. *Check:*
held-out loss versus training loss — if training loss is falling while held-out loss is flat or
rising, that divergence is the signature. Then the verbatim-regurgitation test later in this lesson.

**2. Your eval measures something the data never taught.** Your dataset demonstrates tone and format;
your eval scores factual accuracy. Everything is working exactly as designed and you built one of
the two things wrong. *Check:* read twenty eval failures. Are they failures of the behaviour your
training examples actually demonstrate? This takes an hour and is the highest-value hour in the
whole debugging process.

**3. The eval is too small to see the change.** 200 items near 80% gives each score a standard
error of about 2.8 points, and the *difference* between two scores about 4 points (the arithmetic is
a few sections down). So a genuine +3 improvement produces a reading anywhere from roughly $-5$ to
$+11$. "Flat" may be what a real improvement looks like through a blurry lens. *Check:* compute the
standard error before you interpret the number — the arithmetic is a few sections down.

**4. Distribution mismatch.** Your training inputs are clean and templated; your eval inputs are real
and ugly. *Check:* score the fine-tune on inputs drawn from the *training* distribution. Excellent
there and flat on eval means you taught it beautifully for a world that does not exist.

The generalisable habit: these hypotheses are not equally likely and they are not equally expensive.
Run them in cost order. The field's folklore is full of elegant explanations for results that turned
out to be an unloaded adapter.`,
    },
    {
      type: 'text',
      md: md`
## The four evaluations you actually need

Not one number. Four measurements answering four different questions, and the failure mode of most
teams is building only the first one.

| # | evaluation | the question it answers |
|---|---|---|
| 1 | task eval | did it learn the new thing? |
| 2 | regression suite | did it *unlearn* anything? |
| 3 | A/B against the base | did *this change* help? |
| 4 | production / online | do real users agree? |

## 1. The task eval — did it learn the new thing?

Held-out realistic inputs, scored the way you actually care. Two design decisions carry all the
weight.

**How you score.** There is a ladder here too, and like every ladder in this module you climb it only
when forced:

- **Programmatic checks** — schema validation, unit tests, "is the extracted date the right date."
  Deterministic, free, unbiased, instant. If your task admits one, use it and be grateful; most of
  the very best evals in production are a JSON schema and an assert.
- **Exact match** — cheap and brittle. Fine for classification, actively misleading for anything
  where two different strings can both be right.
- **Rubric with an LLM judge** — necessary when quality is genuinely a judgement call. Every bias
  from 5.6 is now *your* problem: position, length, self-preference, and the judge's own drift
  between model versions. Calibrate it against human labels on a subset, always.
- **Humans** — the ground truth you calibrate everything else against, and too expensive to be your
  main loop. Spend them on a hundred items, not a thousand.

**How you hold out.** This is where good practitioners still get caught, and the trap is subtle
enough to deserve its own name.

> You generate 6,000 synthetic examples in one run, from one prompt template, with one generator
> model. You randomly split 5,000 for training and 1,000 for eval. You now have a contaminated
> evaluation and it will look fine.

Random splitting is correct **only when the pool you are splitting is an independent sample of your
deployment traffic**. A single generation run is not a sample of your users; it is a sample of your
*generator*. Train and test share its phrasings, its tics, its favourite edge cases, and its
near-duplicates. Score 94% on that and you have measured how well the model memorised one
generator's habits. This is exactly 5.6's benchmark-contamination problem, except you built it
yourself, on purpose, this week.

**Hold out by source or by time instead.** All tickets from March, when you trained on
November through February. Everything from two customers you excluded entirely. Two hundred items a
domain expert wrote by hand from real traffic, sealed before the dataset existed. These splits break
the shared-quirk correlation that a random split preserves.

*What it catches:* whether the target behaviour improved. *What it misses:* everything you did not
intend to change — which is the entire subject of the next one.

## 2. The regression suite — did it unlearn anything?

This is 7.1's alignment-tax ponder, made operational. Fine-tuning moves weights toward your narrow
distribution and behaviours outside it drift (5.4). You will not notice unless you look, and you
will not look unless you decided to in advance.

**What goes in it:**

- A sample of **general capability**: some coding, some multi-step reasoning, some open-domain QA. A
  few hundred items total, not a benchmark suite — you are looking for a large drop, not measuring
  the frontier.
- A sample of **your own ordinary traffic that the base already handled well.** This is the half
  people forget and it is the half that catches the tax where it actually hurts. Public benchmarks
  can look untouched while your model quietly gets worse at the mundane requests that make up 60% of
  your volume.

**The release rule is written down before you see any numbers.** For example: *a drop of more than
2.0 points on any suite blocks the ship.* Why in advance? Because after you have seen $-3.1$ and
have a demo on Thursday, you will find a reason it's fine, and you will be sincere about it. This is
6.5's pre-registration discipline, and it exists because your future self is not a neutral party.

> **An evaluation that can only go up is a progress bar, not an evaluation.**

*What it catches:* the alignment tax, on capabilities you thought to include. *What it misses:*
capabilities you didn't think to include. A regression suite is a sample, and it guards only the
directions you sampled.
`,
    },
    {
      type: 'text',
      md: md`
## 3. The A/B against the base — did *this change* help?

You have two absolute scores: base 71.2, fine-tune 88.5. Why isn't that enough?

Because absolute scores **drift** for reasons that have nothing to do with your model. Your judge
model got a silent version bump. Someone tightened the rubric wording. The prompt template picked up
a newline. Six weeks later nobody can say whether 88.5 is comparable to the 84.1 in the old
spreadsheet. Meanwhile the decision you actually need is *directional*: given these two artefacts,
right now, under identical conditions — which is better?

So compare them head to head, on the same inputs, in the same run. And do it **pairwise**, which is
where a familiar idea returns wearing a new hat. Lesson 5.5 established that *recognising* quality is
easier than *producing* it — that's why reward models work at all. The same asymmetry holds for
evaluation. A judge asked "rate this response 1 to 10" must invent a calibration and hold it steady
across a thousand items, which it cannot do. The same judge asked "which of these two is better"
answers a question it is genuinely good at, and returns one clean, comparable bit.

The discipline that makes it trustworthy:

- **Blind it.** Strip anything identifying — model names, formatting fingerprints, that trailing
  newline only one of them emits.
- **Randomise position.** LLM judges have a real preference for whichever answer comes first (5.6).
  Pairwise comparison does not eliminate position bias; it *creates* the opportunity for it. Coin-flip
  the order per item and you convert a systematic bias into noise you can average away.
- **Fix the decoding settings identically** — same temperature, same top-p, same seed, same maximum
  length, same stop sequences, same system prompt (3.2). Anything left floating becomes a confound
  you cannot separate from the effect you're measuring.
- **Report the win rate with an error bar and the tie count.** A 55% win rate on 100 comparisons has
  a standard error of about 5 points. That is 55 plus or minus 10, which is a coin.
- **Report median output length for both.** If the winner is also 40% longer, you have not measured
  quality, you have measured 5.5's length bias with extra steps. (And if the winner is *shorter*, the
  bias is working against you and your result is conservative — which is a lovely thing to be able to
  say in a review.)

*What it catches:* whether this specific change was an improvement, robustly and cheaply. *What it
misses:* whether *either* model is good enough. A 78% win rate over a model that fails your bar
means you have built a better failure. You need eval 1 for the absolute threshold and eval 3 for the
direction; neither substitutes for the other.

## 4. Production evaluation — do real users agree?

Offline evaluation is a proxy for a proxy. It is enormously valuable and it is not the truth, and
the gap between them has a name in every postmortem you will ever read.

**Shadow deployment.** Run the new model on real production traffic while continuing to serve the
old one. Nobody sees the new outputs; you collect them and compare offline. This is the single
highest-information, lowest-risk measurement available to you, and it is criminally underused.

**Canary.** Route 1 to 5% of traffic to the new model, watch for a fixed window — 24 or 48 hours, not
"until it looks fine" — then ramp. Decide the abort conditions before you start.

**Real signals, which are better than any rubric you can write:**

- **Retry and regeneration rate** — the user asking again is the purest dissatisfaction signal there
  is, and it costs nothing to log.
- **Edit distance** between what the model drafted and what the human actually sent. For any
  human-in-the-loop product this is a gift: a continuous, unfaked quality measurement generated by
  people doing their jobs.
- **Escalation / handoff rate**, task completion, abandonment.
- **Latency and cost**, which belong in the release rule alongside quality, for a reason ponder 3
  will make painfully concrete.
- Thumbs-up buttons, last and least — response rates run around 1%, and the people who click are not
  a random sample of anybody.

And then the part that makes this the *engine* rather than the scoreboard: **production failures are
tomorrow's training data.** You collect the cases where the model was wrong, a human fixes them, they
enter 7.3's loop, and the next version is better at exactly the things that were breaking. Offline
eval is the brake. Production is the flywheel. A team with only offline evals improves in the
direction it guessed; a team with the loop closed improves in the direction reality points.
`,
    },
    {
      type: 'text',
      md: md`
## Statistical hygiene, or: where practitioner evals go to die

Here is a sentence spoken in a thousand standups this week: *"the fine-tune scores 87 versus the
base's 84 on our 200-item eval, so it's a three-point improvement."*

Let's find out whether that sentence contains any information. And let's derive the tool rather than
quoting it, because the derivation is four lines and it will make you permanently harder to fool.

**Step 1: one eval item is a coin flip.** Item $i$ scores $X_i = 1$ if the model got it right, $0$
otherwise, with success probability $p$. That's a Bernoulli variable, and its variance is

$$\operatorname{Var}(X_i) = p(1-p)$$

(Maximal at $p = 0.5$, and shrinking as you approach either extreme — which is why evals near
ceiling are *less* noisy per item, a small mercy.)

**Step 2: your score is the average of $n$ of them.** Independence lets variances add, and pulling
the $1/n$ out of the average squares it:

$$\operatorname{Var}(\hat p) = \frac{1}{n^2}\sum_{i=1}^{n}\operatorname{Var}(X_i) = \frac{n\,p(1-p)}{n^2} = \frac{p(1-p)}{n}
\qquad\Longrightarrow\qquad
\mathrm{SE}(\hat p) = \sqrt{\frac{p(1-p)}{n}}$$

**Step 3: you don't care about one score, you care about a difference.** Two models, two independent
scores, and variances of independent things add — even when you are *subtracting* them:

$$\mathrm{SE}_{\text{diff}} = \sqrt{\frac{p_1(1-p_1)}{n} + \frac{p_2(1-p_2)}{n}} \;\approx\; \sqrt{\frac{2\bar p(1-\bar p)}{n}}$$

**Step 4: notice what just happened.** The difference is $\sqrt{2} \approx 1.41$ times *noisier* than
either score alone. This is the mistake I want you to be immune to: people look at two scores, each
carrying a $\pm 2.5$ error bar, see the bars barely overlap, and declare victory — when the error bar
that governs their actual claim is $\pm 3.5$. **The uncertainty on a comparison is always bigger than
the uncertainty on either thing being compared.**

## Three more habits that cost nothing

**Fix the decoding settings.** At temperature 0.7 the same prompt gives different outputs, so
sampling noise stacks on top of item noise and you cannot tell them apart. Pin temperature, top-p,
seed, maximum length, stop sequences, prompt template, system prompt. If you must evaluate at the
temperature you serve at — and there is a real argument for that, since greedy decoding is not what
your users experience — then sample $k$ times per item and average, and report $k$.

**Run multiple seeds when training is cheap.** A LoRA run costs tens of dollars (7.1). Train three
with different seeds. If seed 1 scores 87 and seed 3 scores 84, then your celebrated "+3 from the new
data mix" was seed variance wearing a hypothesis costume. This is 6.5's error-bar discipline, and
fine-tuning is one of the rare places in ML where you can actually afford it.

**Do not iterate against the set you will report.** Every time you look at your eval, change
something, and keep the change because the number went up, you are running gradient descent on the
eval set with yourself as the optimiser. It is slower than training on the test set and it is the
same mechanism. The fix is three splits: a **dev set** you may abuse freely, a **locked test set**
opened exactly once, and the rule that if you open the test set twice it has become a dev set and you
owe yourself a fresh one.
`,
    },
    {
      type: 'example',
      title: 'the significance arithmetic, step by step',
      md: md`
**The claim:** fine-tune 87%, base 84%, on the same 200 held-out items. "A three-point improvement."

**Pooled rate.** $\bar p = (0.87 + 0.84)/2 = 0.855$.

**Standard error of the difference.**

$$\mathrm{SE}_{\text{diff}} = \sqrt{\frac{2(0.855)(0.145)}{200}} = \sqrt{\frac{0.24795}{200}} = \sqrt{0.00124} \approx 0.0352$$

That is **3.5 percentage points**. (The unpooled version, $\sqrt{0.87 \cdot 0.13/200 + 0.84 \cdot 0.16/200}$,
gives 3.52 — identical to two decimals. Don't agonise over which; near ceiling they agree.)

**The verdict.** Your observed difference is 3.0 points and the noise is 3.5 points:

$$z = \frac{3.0}{3.5} \approx 0.85 \qquad \text{(you want } |z| \ge 1.96 \text{ for the usual 95\% claim)}$$

**The honest interval.** $3.0 \pm 1.96 \times 3.5 = 3.0 \pm 6.9$, so the truth plausibly lies
anywhere in $[-3.9,\; +9.9]$. **Your data is consistent with the fine-tune being four points worse.**
The sentence "it's a three-point improvement" contained no information, and three weeks of work is
about to be judged on it.

---

**So how many items would you need?** Set the requirement — a 3-point difference should equal two
standard errors — and solve backwards. Two standard errors means $\mathrm{SE}_{\text{diff}} \le 0.015$:

$$n = \frac{2\bar p(1-\bar p)}{\mathrm{SE}_{\text{diff}}^{2}} = \frac{2(0.85)(0.15)}{(0.015)^{2}} = \frac{0.255}{0.000225} \approx 1{,}133 \text{ items}$$

Sit with that number, because it indicts an entire profession's habits. **Most practitioner evals are
50 to 100 items.** At $n = 100$ near 85%, $\mathrm{SE}_{\text{diff}} \approx 5.0$ points and the 95%
interval is $\pm 10$ — you could not distinguish an 8-point gain from nothing at all. Yet decisions
of exactly this kind get made on exactly those evals, daily, with confidence.

Two footnotes that make the number honest rather than merely scary:

**Two standard errors is a threshold for noticing, not for reliably detecting.** If you want roughly
an 80% chance of catching a real 3-point gap, the standard power calculation multiplies $n$ by
$(1.96 + 0.84)^2 / 1.96^2 \approx 2$, giving about **2,300 items**.

**Pairing buys back most of the cost.** Both models saw the *same* items, so the items they both got
right and both got wrong carry no information about the difference — only the disagreements do. With
$b$ items the fine-tune won and $c$ the base won, McNemar's test says

$$z = \frac{b - c}{\sqrt{b + c}}$$

Concretely: of 200 items they disagree on 20 — the fine-tune right on 13, the base right on 7. Net
$6/200 = 3$ points, same headline. But now $z = 6/\sqrt{20} = 1.34$, versus 0.85 unpaired. Still not
significant, and considerably less hopeless. Run the sample size again at a 10% disagreement rate and
you need about **430 items**, not 1,133 — a 2.6-fold saving for free, purely from scoring both models
on the same inputs instead of two different samples. Do that. Always.
`,
    },
    {
      type: 'ponder',
      question: md`You did something that felt like diligence. Over five weeks you iterated your
dataset **fifteen times** — added examples, rebalanced categories, fixed formatting — checking your
200-item eval after every round and keeping the changes that helped. The score climbed from 71 to 89.
You put "+18 points" in the deck. Why is that number now partly fictional, roughly how much of it is
fiction, and what should you have held back on day one?`,
      answer: md`Because you ran an optimisation loop for five weeks with the eval as the objective
function and yourself as the optimiser. Fifteen rounds of "keep the change if the number went up" is
**selection on the eval set**. The 89 is not a measurement of your model; it is a measurement of your
model *plus five weeks of selection pressure aimed at those 200 specific items.*

**Two distinct mechanisms, and the second is much larger.**

*Selection on noise.* Each round's score carries a standard error of about 2.9 points at $n = 200$
near 80%. Keeping the best of many noisy draws biases you upward — the maximum of fifteen standard
normal draws sits roughly 1.7 standard deviations above the mean — so even if your fifteen dataset
edits had been *completely useless*, you would expect the reported number to drift up by something
like 3 to 5 points purely by choosing the lucky ones.

*Fitting the specific items, which is worse.* You didn't just watch the number — you read the
failures and wrote training data aimed at them. That is not overfitting to statistical noise; it is
overfitting to those exact 200 questions, their exact phrasings, their exact edge cases. It leaves no
statistical fingerprint at all and it can be worth many more points than the selection effect. It is
the human-in-the-loop form of training on the test set, and it feels, from the inside, exactly like
doing good work. That is what makes it dangerous.

**How much is real?** Nobody can tell you from the numbers you have — which is the entire problem. If
you now cut a genuinely fresh test set from held-out traffic, expect the low-to-mid 80s. A gap of a
few points is normal and forgivable. A gap of 89 to 76 means your five weeks of dataset work fixed
your *eval* rather than your *task*, and you would rather learn that now than from a customer.

**What you should have held back:** a **locked final test set**, drawn from the same real
distribution, sealed on day one, opened exactly once when you believe you are finished — and big
enough (the arithmetic above) that a single reading means something. Iterate freely on a dev set;
that is precisely what a dev set is for and there is no shame in abusing it. The discipline is only
about which number leaves the building.

This is 5.6's Goodhart warning arriving at your own desk. *When a measure becomes a target, it ceases
to be a good measure* — and it does not care whether the optimiser doing the targeting is stochastic
gradient descent or an earnest engineer with a spreadsheet.`,
    },
    {
      type: 'text',
      md: md`
## The memorisation kit

Four checks, cheap to run, that answer "did it learn, or did it just remember?"

**1. Train-versus-held-out divergence.** Plot both losses. Training loss falling while held-out loss
flattens or rises is the textbook signature, and it is the reason to always hold out even when you
think you don't need to. Related knob: **epochs**. One to three is typical for instruction data. If
you are running ten epochs over 5,000 examples, you are not training, you are photocopying.

**2. The verbatim-regurgitation test.** Take twenty training inputs. Feed the model the input alone —
or better, only the first third of it — and see whether the exact training completion comes back
token for token. A couple of near-matches on highly templated outputs is fine. A substantial fraction
returning byte-identical targets means you have built a lookup table with a very expensive index.

**3. N-gram overlap.** For each eval output, find the longest span it shares with any training target,
and compare that distribution against the *base* model's. Base median 5 tokens, fine-tune median 6:
fine. Base 5, fine-tune 22: your model is reciting.

**4. The suspiciously-perfect tell.** 96% on the eval that came out of your generator and 74% on
eighty items a domain expert wrote by hand is not a mysterious discrepancy — it is a contamination
meter, and it is reading loudly. Keep a small hand-written set purely as this instrument. It is the
cheapest insurance in the whole pipeline.

## Error analysis beats score-worship

Now the habit from 6.6, made concrete for someone who has an actual model to improve.

You have a score: 84%. What do you do on Monday?

The score cannot tell you. It is one number summarising a hundred distinct problems, and the only
operation it supports is comparison. So do the thing that feels beneath you and is not: **read fifty
failures.** Actually read them — the input, the output, and what should have happened. Give each a
short label. Group the labels. Count.

Here is a real-shaped taxonomy from a 500-item eval scoring 84%, so 80 failures, of which 50 were
read:

| failure category | count of 50 | share |
|---|---|---|
| required JSON field missing | 21 | 42% |
| tone too chatty for the house style | 12 | 24% |
| hallucinated a value for a field | 9 | 18% |
| unnecessary refusal | 5 | 10% |
| output truncated mid-sentence | 3 | 6% |

Look at what this table just did that the number 84 could not.

**It sorted your failures by cure, not by size.** Truncation is not a model problem at all — that is a
maximum-token setting, fixable in ninety seconds for free, and *no score would ever have told you it
existed.* The hallucinated field values are largely fixable with constrained or grammar-guided
decoding, again with zero training cost. The refusals are a preference or system-prompt matter (7.4),
not something more supervised examples will reliably shift. Only the missing fields and the tone are
honest dataset increments for 7.3's loop — and the ladder rule from 7.1 says try the free fixes
first, because two of these five categories dissolve without you touching the data at all.

**It gives you a forecast.** If you eliminate the largest category entirely, $80 \times 0.42 = 33.6$
failures disappear, leaving 46.4, and your score becomes $453.6/500 \approx 90.7\%$. Now you know what
next month's number will be *before* you spend the month — and if 90.7 still misses your bar, you
have learned something enormously valuable, which is that this increment alone cannot get you there.

A score tells you **whether**. A taxonomy tells you **what to do next**. Only one of those is
actionable, and it is not the one that fits in a slide.
`,
    },
    {
      type: 'example',
      title: 'a full eval report, and the ship decision it forces',
      md: md`
**The artefact.** LoRA (rank 16) on an 8B base, 4,200 examples, three epochs. Task: turn a support
ticket into a JSON object with a category, a priority, and a one-line summary. Pre-registered bar
from 7.1: **at least 85% on the task eval, and no regression suite may drop by more than 2.0 points.**

---

**1. Task eval.** 600 tickets from March, held out **by time** (training data spans November to
February). Scored programmatically: schema valid **and** category correct **and** priority within one
level. Temperature 0, fixed template.

| model | score |
|---|---|
| base | 71.2% |
| fine-tune | **88.5%** |

Difference $+17.3$ points. Pooled $\bar p \approx 0.80$, so
$\mathrm{SE}_{\text{diff}} = \sqrt{2(0.8)(0.2)/600} \approx 0.023$, i.e. 2.3 points, and
$z \approx 7.5$. Overwhelming. And for the *bar* question, what matters is the one-sided view: the
fine-tune's own standard error is 1.3 points, so the 95% interval is $[85.9,\; 91.1]$ — the lower
bound clears 85. **You clear the bar, not merely your point estimate.**

**2. Regression suite.** Rule fixed in advance: any drop beyond 2.0 points blocks.

| suite | items | base | fine-tune | change | verdict |
|---|---|---|---|---|---|
| general reasoning | 250 | 64.0% | 63.2% | −0.8 | pass |
| code generation | 200 | 58.5% | 55.0% | **−3.5** | **BLOCK** |
| open-domain QA | 250 | 72.4% | 71.6% | −0.8 | pass |
| ordinary prior traffic | 400 | 91.0% | 90.5% | −0.5 | pass |

And now the interesting part, which is the whole reason to run this report rather than read a
dashboard. At $n = 200$ near 57%, $\mathrm{SE}_{\text{diff}} = \sqrt{2(0.57)(0.43)/200} \approx 0.050$
— **5.0 points.** So $-3.5 \pm 9.8$: the coding regression is comfortably inside the noise. Do you
ship?

**No — and also, that is the wrong question.** Your pre-registered rule blocks. You do not get to
renegotiate it now that you have seen the number and want to ship on Thursday; that is precisely the
behaviour pre-registration exists to prevent. But you *are* entitled to reduce the noise on a
measurement your own rule declared decision-relevant. Re-run the coding suite at 800 items
($\mathrm{SE}_{\text{diff}} \approx 2.5$): base 58.9%, fine-tune 57.6%, a drop of 1.3 points, which
passes. **You may buy more precision. You may not lower the bar.** Keep that distinction and you will
be trusted in review rooms for the rest of your career.

(Had the larger run confirmed $-3.5$: mix general coding data into the training set and retrain
(7.3), lower the learning rate or drop an epoch (7.2), or route coding traffic to the base model
entirely.)

**3. A/B against the base.** 300 pairwise comparisons on held-out March tickets. Blinded,
position-randomised, temperature 0, identical templates. Judge: a stronger model with a four-point
rubric; 60 of the 300 also graded by a human.

- Fine-tune preferred: **214** · base preferred: **61** · ties: **25**
- Win rate excluding ties: $214/275 = 77.8\%$, $\mathrm{SE} \approx 2.5$ points, so $77.8 \pm 4.9$ —
  decisively above 50.
- Judge/human agreement on the 60-item subset: **87%**. Good enough to trust the other 240.
- Median output length: fine-tune **96** tokens, base **138**. The winner is the *shorter* model, so
  length bias (5.5) is pushing against this result, not inflating it. The number is conservative.

**4. Memorisation checks.** Thirty prefix-prompted training inputs: **zero** verbatim completions.
Longest-shared-n-gram median: fine-tune 6 tokens, base 5 — no jump. Eighty hand-written items from a
support lead who never saw the training data: **86.2%**, against 88.5% on the time-held-out set. A
2.3-point gap, well inside noise. Clean.

**5. Error analysis.** 50 of the 69 remaining failures read:

| category | count | cure |
|---|---|---|
| priority off by two on escalation language | 19 | dataset increment (7.3) |
| billing vs. account category confusion | 14 | dataset increment (7.3) |
| summary exceeds one line | 8 | stop-sequence / length control — free |
| category outside the allowed enum | 6 | constrained decoding — free |
| refusal on tickets containing customer data | 3 | system prompt or preference tuning (7.4) |

Note that 14 of 50 failures — 28% — need no new data whatsoever.

**6. Decision.** Task eval clears the bar with the interval's lower bound above it. A/B decisive and
conservative. Regression rule initially blocked, resolved by a higher-precision re-run, not by
argument. Memorisation clean. **Ship to a 5% canary with a 48-hour hold, latency and cost on the
dashboard, and abort conditions written down now.** Not "ship." Then eval 4 takes over.

**What this report does not tell you** — and saying so is part of the report, not an apology for it:
nothing about seasonality beyond March; nothing about the 15% of tickets not in English, which nobody
sliced; nothing about latency, since every number above was measured at temperature 0 on an unloaded
box.
`,
    },
    {
      type: 'ponder',
      question: md`You shipped. Offline, the task eval said **+6 points** and the A/B said the
fine-tune won 71% of blinded comparisons. Two weeks into full rollout, the support team reports that
users are audibly *less* happy than before. Every offline number still reproduces. List the plausible
explanations — and for each, the slice or measurement that would have caught it before rollout.`,
      answer: md`Five explanations, all common, none of them "the eval was wrong" in the naive sense.
Each offline number is probably still correct; correctness was never the issue.

**1. Distribution mismatch.** Your eval inputs came from a curated set; real traffic contains
categories you never sampled — the angry ones, the multilingual ones, the ones with a screenshot
pasted in. The +6 is real *on the eval's distribution* and simply doesn't transfer. *Caught by:*
sampling eval items from live traffic logs rather than from a generator, and by shadow deployment,
which measures the new model on the actual input distribution before anyone sees it.

**2. Goodhart — your scoring proxy diverged from what users value.** Your rubric rewarded "complete,
well-structured, thorough," so the model learned long and thorough. Users wanted short. If you used
an LLM judge, you may have optimised straight into its documented length preference (5.5, 5.6) and
called it quality. *Caught by:* checking median output length between arms, calibrating the judge
against real human preferences rather than rubric compliance, and asking "what would a model that
gamed this metric perfectly look like?" before you run it.

**3. Regressions your quality eval never measured — latency and cost.** If outputs are 40% longer,
time-to-last-token is 40% worse. For a streaming product that *is* a quality regression, and one that
every offline number is structurally blind to because you measured on an idle box at temperature 0
with no queue. *Caught by:* putting p50 and p95 latency, tokens per response, and cost per request
into the release rule beside accuracy. Quality is not the only axis a release can regress on, and it
is not usually the one users notice first.

**4. A subgroup collapsed while the average improved.** Suppose 85% of traffic improved by 9 points
and 15% got 11 points worse:

$$0.85 \times (+9) + 0.15 \times (-11) = 7.65 - 1.65 = +6.0$$

A perfect $+6$, and one user in seven is having a much worse time — and they are the ones who write
in. *Caught by:* slicing every eval by the dimensions you know exist (language, ticket category,
input length, customer tier, new vs. returning) and reporting the **worst** slice next to the mean.
An average is a summary of a distribution, and the complaints come from its tail.

**5. You changed more than one thing.** The deploy also bumped a prompt template, a maximum-token
setting, and a retrieval config. You are attributing to the fine-tune an effect belonging to a
neighbour. *Caught by:* the A/B discipline from eval 3, extended to the deploy — one change at a
time, or an online experiment that can attribute.

**And a check on the premise itself:** complaint volume is not satisfaction. Complainers are a
self-selected sample and a UI change alone can move their number. Before you roll back, look at the
neutral signals — retry rate, edit distance, escalation rate — which no one has to be angry enough to
generate. Then take whichever failures are real, put them into 7.3's loop, and let production teach
you what your eval didn't know to ask.`,
    },
    {
      type: 'text',
      md: md`
## When to stop

Fine-tuning has no natural terminating condition. The score can always go up a little, there is
always another data increment, and "one more round" is the most expensive sentence in applied ML.
Three stopping conditions, in the order you should consult them:

**1. You cleared the pre-registered bar.** From 7.1: "good enough" was a *number*, decided before you
had any stake in the outcome. Clear it on a **locked test set**, with an interval whose lower bound
is above the bar — not a point estimate that grazes it — and you are finished. Stop. The temptation
to keep going because 91 would be nicer than 88 is the temptation to spend real money buying a number
nobody asked for.

**2. Diminishing returns arrived.** The dataset curve from 7.3 bends hard: the first thousand examples
buy you ten points, the next thousand buy three, the next thousand buy one. When your projected
ceiling from the error taxonomy is worth less than the fortnight it costs, the next increment is
negative value regardless of whether the score would rise.

**3. Maintenance is a running cost, not a one-off.** Every point you buy, you now own. The base model
updates in six months and you re-run everything — training, all four evals, the whole report. A
smaller, simpler fine-tune that clears the bar beats a larger one that clears it by more, because you
will be re-running it for years.

The honest final condition is qualitative and you will recognise it: **the remaining failures are ones
your users don't care about, or ones no amount of your data will fix.** Both are signals to stop
training and go solve a different problem.

## What you now own

From this lesson:

1. **Why the training curve cannot answer "is it better"** — it fits your data's noise, sits on the
   wrong distribution, averages away whole-string properties (one wrong token in 400 moves the loss by
   0.012 and breaks the parse every time), and post-training deliberately trades likelihood for
   behaviour, so even its *sign* is untrustworthy.
2. **The four evaluations**: the task eval (held out by source or time, never randomly from one
   generation run), the regression suite (with the release rule written *before* you see numbers), the
   blinded position-randomised A/B against the base, and production — shadow, canary, and the real
   signals that close the loop back into 7.3.
3. **The binomial arithmetic, derived**: $\mathrm{SE} = \sqrt{p(1-p)/n}$, differences noisier than
   scores by $\sqrt 2$, 87-versus-84 on 200 items meaning nothing at all, roughly 1,133 items to see
   3 points — and pairing cutting that to about 430 for free.
4. **The memorisation kit** — loss divergence, verbatim regurgitation, n-gram overlap, and the
   hand-written set that acts as a contamination meter.
5. **Error analysis over scores** — read fifty failures, taxonomise, count, and let the table pick your
   next move and forecast your next number. Scores say *whether*; taxonomies say *what next*.
6. **The two disciplines that survive contact with a deadline**: an evaluation that can only go up is
   a progress bar, and you may buy more precision but you may not lower the bar.

## And what Module 7 now owns

Six lessons, one arc, and it closes into a loop rather than ending:

> **decide** whether to adapt at all and which failure type you have (7.1) → **update cheaply**, so
> the change is small enough to be safe and revertible (7.2) → **build the data**, which is where the
> real work and the real cost live (7.3) → **teach preference** where there is no single right answer
> (7.4) → **make the run reproducible** with a toolchain you can re-run in a year (7.5) → **measure
> whether any of it worked** (7.6) — and then feed what you measured straight back into the data.

That last arrow is the whole point. Every lesson in this module produced an artefact; only this one
produces the feedback that tells the others what to do next. A team that can adapt a model but cannot
measure it is guessing expensively. A team that can measure is running an experiment, and experiments
compound.

Next module: your model is now measurably better — and almost certainly bigger, slower, and more
expensive than it needs to be. Module 8 is about buying the same capability in the smallest possible
currency, and the frontier mindset that comes with knowing exactly what each unit of quality cost you.
`,
    },
  ],
  questions: [
    {
      id: 'm7-l6-q1',
      kind: 'mcq',
      prompt: md`Your fine-tune's training loss fell smoothly from 1.42 to 0.31 over three epochs,
with no spikes. What can you conclude about whether the model is better at your task?`,
      options: [
        'It is very likely better — a large, smooth loss reduction is the strongest available evidence that learning occurred',
        'Nothing directly: the loss measures token-level fit to your training data (noise and duplicates included) on the training distribution, and the properties you care about are not token-level likelihoods',
        'Nothing, because loss values are only comparable between models that share a tokenizer',
        'It is likely worse — a loss drop that large is a reliable indicator of overfitting',
      ],
      answer: 1,
      explain: md`Four independent reasons, any one of which is fatal on its own. The loss rewards
predicting *your* tokens, so memorising duplicates and stylistic tics lowers it. It is measured on a
curated training distribution, not your users'. It averages over token positions, which destroys
whole-string properties — one wrong token in 400 shifts the mean loss by about 0.012 nats (invisible)
while failing the schema validator 100% of the time. And post-training deliberately trades likelihood
for behaviour (5.4), so the loss can *rise* while the model improves. Option A is the default
intuition and it is what this lesson exists to dislodge. Option C states a true fact that does no work
here — you are comparing the same base model with itself, so tokenizers match and the loss is still
uninformative. Option D overcorrects: a large drop is *consistent with* memorisation but is not
evidence of it. What diagnoses memorisation is the **divergence** between training and held-out loss,
and a single curve cannot show a divergence.`,
    },
    {
      id: 'm7-l6-q2',
      kind: 'numeric',
      prompt: md`Your fine-tune scores **87%** and the base scores **84%** on the same 200 held-out
items. Using $\mathrm{SE}_{\text{diff}} = \sqrt{2\bar p(1-\bar p)/n}$ with the pooled rate
$\bar p = 0.855$, what is the standard error of the difference, **in percentage points**?`,
      answer: 3.5,
      tolerance: 0.4,
      explain: md`$2(0.855)(0.145) = 0.24795$; divided by 200 gives $0.00124$; the square root is
$0.0352$, i.e. **3.5 percentage points**. Your observed gap is 3.0 points against noise of 3.5, so
$z \approx 0.85$ — nowhere near the 1.96 you would want, and the 95% interval $3.0 \pm 6.9$ includes
the possibility that your fine-tune is four points *worse*. Notice too that the SE of either score
alone is only about 2.5 points: the uncertainty on a **comparison** always exceeds the uncertainty on
the things compared, by a factor of $\sqrt 2$. That gap is precisely where confident, wrong claims
get made.`,
    },
    {
      id: 'm7-l6-q3',
      kind: 'mcq',
      prompt: md`You generated 6,000 synthetic training examples in a single run, from one prompt
template and one generator model, then randomly split them 5,000 for training and 1,000 for
evaluation. What is the main problem?`,
      options: [
        'Nothing — a uniformly random split is the statistically correct way to create a held-out set',
        'The eval set is too small at 1,000 items to detect the differences you care about',
        'Train and eval share the generator’s phrasings, quirks and near-duplicates, so a high score partly measures memorisation of a distribution that is not your users’ — hold out by source or by time instead',
        'Synthetic data is never valid for evaluation under any circumstances',
      ],
      answer: 2,
      explain: md`A random split is correct **only when the pool being split is an independent sample
of your deployment traffic**. A single generation run is a sample of the *generator*, not of your
users, so the two halves are correlated through everything the generator does habitually. This is
5.6's contamination problem, self-inflicted. The fix is a split that breaks that correlation: hold out
by time (all of March), by source (two excluded customers), or by hand-written items sealed before the
dataset existed. Option B is the sharpest distractor because it names a real concept that is not the
flaw here — 1,000 items is a perfectly respectable size, giving
$\mathrm{SE}_{\text{diff}} \approx 1.6$ points near 85%. Answering with the right vocabulary about the
wrong problem is a very common way to be confidently useless. Option D overcorrects: synthetic eval
data is fine when it is generated *independently* of the training data and validated against real
inputs.`,
    },
    {
      id: 'm7-l6-q4',
      kind: 'numeric',
      prompt: md`**Fermi.** You want an eval large enough that a **3 percentage-point** improvement
near **85%** accuracy shows up as roughly **two standard errors** of the difference. Using
$\mathrm{SE}_{\text{diff}} = \sqrt{2p(1-p)/n}$ with $p \approx 0.85$, roughly how many held-out items
do you need? (Estimate on paper; the tolerance is generous, and the point is the order of magnitude,
not the digits.)`,
      answer: 1133,
      tolerance: 500,
      explain: md`Three points at two standard errors means $\mathrm{SE}_{\text{diff}} \le 0.015$.
Rearranging: $n = 2p(1-p)/\mathrm{SE}^2 = 2(0.85)(0.15)/(0.015)^2 = 0.255/0.000225 \approx
\mathbf{1{,}133}$ items. The teaching point is the indictment: **most practitioner evals are 50 to 100
items.** At $n = 100$, $\mathrm{SE}_{\text{diff}} \approx 5$ points and the 95% interval is $\pm 10$ —
you could not distinguish an 8-point gain from zero — yet ship decisions get made on exactly those
numbers every day. Two honest footnotes: two standard errors is a threshold for *noticing*, not for
reliably *detecting* (for 80% power you would want roughly 2,300), and **pairing** — scoring both
models on the same items and using McNemar's test on the disagreements — cuts the requirement to
about 430 at a 10% disagreement rate, for free.`,
    },
    {
      id: 'm7-l6-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Starting from a single eval item as a Bernoulli trial,
derive the standard error of a difference between two model scores, and from it the number of items
needed to see a 3-point difference near 85% accuracy at two standard errors. Show every step: the
variance of one item, the variance of the mean of $n$ items, the standard error of a proportion, the
standard error of a difference (say explicitly why the variances **add** when you are subtracting),
the pooled approximation, and the solve for $n$. Then answer two questions in a sentence each: why is
the difference noisier than either score, and what practical mistake does knowing that prevent?`,
      rubric: md`**Step 1 — one item.** Item $i$ scores $X_i \in \{0,1\}$ with success probability $p$.
For a Bernoulli variable, $E[X_i] = p$ and $\operatorname{Var}(X_i) = E[X^2] - (E[X])^2 = p - p^2 = p(1-p)$.

**Step 2 — the mean of $n$ items.** With independent items, variances add; pulling $1/n$ out of the
average squares it:

$$\operatorname{Var}(\hat p) = \frac{1}{n^2}\cdot n\,p(1-p) = \frac{p(1-p)}{n}, \qquad \mathrm{SE}(\hat p) = \sqrt{\frac{p(1-p)}{n}}$$

**Step 3 — a difference of two scores.** $\operatorname{Var}(A - B) = \operatorname{Var}(A) +
\operatorname{Var}(B)$ for independent $A, B$. The explicit reason, which the question asks for:
variance is a squared quantity and the covariance term vanishes under independence — flipping the sign
of $B$ leaves $\operatorname{Var}(-B) = (-1)^2\operatorname{Var}(B) = \operatorname{Var}(B)$
unchanged. **Uncertainties never cancel; they accumulate.** Hence

$$\mathrm{SE}_{\text{diff}} = \sqrt{\frac{p_1(1-p_1)}{n} + \frac{p_2(1-p_2)}{n}} \approx \sqrt{\frac{2\bar p(1-\bar p)}{n}}$$

**Step 4 — solve for $n$.** Requiring $3$ points $= 2\,\mathrm{SE}$ means $\mathrm{SE} \le 0.015$:

$$n = \frac{2p(1-p)}{\mathrm{SE}^2} = \frac{2(0.85)(0.15)}{0.000225} = \frac{0.255}{0.000225} \approx 1{,}133$$

**Why the difference is noisier:** it carries both models' sampling error, so it is $\sqrt 2 \approx
1.41$ times the SE of a single score (about 3.5 points versus 2.5 at $n = 200$).

**The mistake it prevents:** eyeballing two scores whose individual error bars barely overlap and
declaring a real improvement — when the error bar that governs the *claim you are making* is the
larger one. Equivalently: it prevents believing a 50-item eval can adjudicate a 3-point difference.

**Full credit** requires the algebra at every step (not the final formula asserted), the explicit
independence/covariance justification in step 3, the correct $n$, and both one-sentence answers. Using
$\sqrt 2$ as a remembered fact rather than deriving it from adding variances is *partial* — that is
exactly what this question is not about.`,
    },
    {
      id: 'm7-l6-q6',
      kind: 'mcq',
      prompt: md`Why do practitioners compare a fine-tune against its base **pairwise** ("which of
these two responses is better?") rather than scoring each model absolutely on a 1–10 rubric?`,
      options: [
        'Pairwise comparison needs fewer items to reach significance because each comparison exercises two models at once',
        'Absolute scores drift with judge version, rubric interpretation and prompt wording, while the decision you need is directional — and judging which of two outputs is better is an easier task than assigning a calibrated number, so the same judge is more reliable at it',
        'Absolute rubric scores are not valid statistics because they are ordinal rather than binary',
        'Pairwise comparison eliminates the position and length biases that afflict LLM judges',
      ],
      answer: 1,
      explain: md`This is 5.5's asymmetry — recognising quality is easier than producing it, which is
why reward models work — reappearing as an evaluation technique. A judge asked for a 1–10 score must
invent a calibration and hold it steady across a thousand items, which it demonstrably cannot; asked
which of two is better, it answers a question it is genuinely good at and returns one comparable bit.
Option D is the most important distractor because it is exactly backwards: pairwise comparison
*creates* the opportunity for position bias (something has to go first), which is why you must
randomise the order per item — pairwise is more *reliable*, not bias-free. Option A garbles the
statistics; what actually reduces the sample requirement is **pairing** (scoring both models on the
same inputs, so only disagreements carry information), a related but distinct idea. Option C is a red
herring: ordinal scores are perfectly usable, they are just drifty and uncalibrated.`,
    },
    {
      id: 'm7-l6-q7',
      kind: 'numeric',
      prompt: md`Production traffic is **70%** the narrow task you fine-tuned for and **30%** general
requests. On the task eval the fine-tune gains **7.0** percentage points; on the general regression
suite it loses **5.0** percentage points. What is the **traffic-weighted net change**, in percentage
points? (Give a positive number for a net gain.)`,
      answer: 3.4,
      tolerance: 0.3,
      explain: md`$0.7 \times (+7.0) + 0.3 \times (-5.0) = 4.9 - 1.5 = \mathbf{+3.4}$ points. Two
lessons live in this arithmetic. First, it is the right aggregate to quote to a product owner, because
it is the number your users experience — a task-eval headline of "+7" is true and misleading. Second,
and more important: **the average is hiding a real regression.** Nearly a third of your traffic got
five points worse, and those users don't experience a weighted mean, they experience the loss. That is
why the release rule from 7.1 blocks on *any* suite dropping past a threshold rather than on the
aggregate — an average can absorb a serious harm to a minority of traffic and still look like
progress.`,
    },
    {
      id: 'm7-l6-q8',
      kind: 'mcq',
      prompt: md`Your LLM judge reports that the fine-tune beats the base on **68%** of 400
comparisons. You then notice two things: the fine-tune's outputs average 40% longer, and in your
harness the fine-tune's answer is always presented **second**. What is the minimum fix?`,
      options: [
        'Increase the comparison count from 400 to 2,000 to tighten the error bar',
        'Randomise which model appears first, and control for or separately report length-matched pairs — position and length effects are systematic biases, and more comparisons only shrink the error bar *around* a biased estimate',
        'Switch to a stronger judge model, which will not exhibit these biases',
        'Switch to absolute 1–10 scoring, which is immune to position effects',
      ],
      answer: 1,
      explain: md`The whole question turns on the distinction between **noise** and **bias**, and it is
the distinction most practitioners collapse. Your estimate is already precise: at $n = 400$ and
$p = 0.68$, $\mathrm{SE} = \sqrt{0.68 \times 0.32/400} \approx 0.023$, so $68 \pm 4.6$. Going to 2,000
comparisons buys you $\pm 2.0$ — around a number that may be wrong by ten points in a known direction.
**More data never fixes bias; it just makes you more confident in the wrong answer.** Option C is
false in a specific way worth knowing: stronger judges have *smaller* position and self-preference
biases, not absent ones (5.6), and length preference persists across model scale. Option D trades
position bias for calibration drift and self-preference while giving up the comparison reliability
that made the judge usable in the first place.`,
    },
    {
      id: 'm7-l6-q9',
      kind: 'numeric',
      prompt: md`Your 500-item eval scores **84.0%**, so 80 items fail. You read 50 of the failures and
find that **21** of them are missing-required-field schema violations. If you eliminate that entire
category and nothing else changes, what score would you project, **as a percentage**?`,
      answer: 90.7,
      tolerance: 1.5,
      explain: md`Schema violations are $21/50 = 42\%$ of your failures. Applied to all 80:
$80 \times 0.42 = 33.6$ failures removed, leaving $46.4$. The projected score is
$(500 - 46.4)/500 = 453.6/500 \approx \mathbf{90.7\%}$. This is the single most useful thing a failure
taxonomy does that a score cannot: it forecasts your next number *before* you spend the month earning
it. If your bar is 90, this increment alone plausibly gets you there and you should build it. If your
bar is 95, you have just learned — for the price of an afternoon's reading — that this increment
cannot get you there, and you need a different plan rather than a bigger version of the same one. The
projection assumes the 50 you read are representative of the 80, so sample them randomly rather than
taking the first fifty in the file.`,
    },
    {
      id: 'm7-l6-q10',
      kind: 'written',
      prompt: md`**Design the whole evaluation.** You have fine-tuned an 8B model to write commit
messages in your team's house style, given a diff. Specify all four evaluations concretely enough that
a teammate could build them tomorrow: for each, what the items are, where they come from, how you hold
out, how you score, and **one thing that evaluation will miss**. Then state your pre-registered
release rule and justify your eval size with the binomial arithmetic.`,
      rubric: md`Grade as the teammate who has to build it.

**1. Task eval.** Items: real diffs with their real committed messages. Held out **by time** (the last
month of commits) or **by repository** — a random split across commits from one repo shares authors,
conventions and even near-duplicate diffs. Scoring: exact match is *wrong here* and saying so earns
credit — many different messages are correct. Use a rubric (does it state what changed and why, right
imperative mood, right length, correct scope prefix) with an LLM judge calibrated against ~50 human
labels, or programmatic sub-checks for the mechanical parts (prefix format, line length, no trailing
period). *Misses:* whether the message is *true* of the diff in ways the rubric never encoded; rare
commit types absent from the last month.

**2. Regression suite.** General coding ability (the base's other job), general instruction-following,
plus a sample of ordinary prior traffic the base already handled well. A few hundred items. *Misses:*
any capability not sampled — it guards only the directions you thought of.

**3. A/B against the base.** Pairwise on held-out diffs, blinded, **position-randomised**, identical
decoding settings and templates, ties reported, median output length reported for both arms. *Misses:*
whether either model clears the absolute bar — a win rate over a model that fails is a better failure.

**4. Production.** Shadow first: generate suggestions for real commits without showing them. Then the
online signal this task hands you for free — **edit distance between the suggested message and what
the developer actually committed** — plus acceptance rate and time-to-commit. *Misses:* selection
effects (developers who dislike it stop using it, so the remaining acceptance rate rises), and
anything about commits nobody made.

**Pre-registered rule:** a number, fixed before results — e.g. "at least 70% rubric pass on held-out
diffs, no regression suite down more than 2.0 points, A/B win rate significantly above 50%, median
latency under X." Adjectives instead of numbers fail this item.

**Sizing:** must actually use $\mathrm{SE}_{\text{diff}} = \sqrt{2\bar p(1-\bar p)/n}$ to justify the
item count — e.g. roughly 1,100 for a 3-point difference near 85%, or a smaller number defended by
pairing/McNemar or by the fact that a larger expected effect needs fewer items.

**Full credit** = all four evals with source, held-out mechanism, scoring, and a genuine miss; a
numeric release rule; and arithmetic rather than a gesture at "enough items." Recognising that exact
match is the wrong scorer here is a strong signal of real understanding.`,
    },
    {
      id: 'm7-l6-q11',
      kind: 'written',
      prompt: md`**Error analysis into a decision.** Your 600-item eval scores 82.0% (108 failures). You
read 50 of them:

| category | count |
|---|---|
| required JSON field missing | 17 |
| value outside the allowed enum | 11 |
| correct content, too chatty for house style | 9 |
| output truncated mid-sentence | 7 |
| unnecessary refusal when a competitor is mentioned | 6 |

Decide what to do next and defend it. Your answer must: identify which categories are **not** dataset
problems and say what fixes them instead; rank the work by count against cost-to-fix; project a score
for your chosen plan; and state plainly what the number 82.0% alone would and would not have told
you.`,
      rubric: md`**Not dataset problems — this is the heart of the question:**

- **Truncation (7 of 50).** A maximum-token or stop-sequence setting. Ninety seconds, free, zero
  training. No score would ever have revealed it existed.
- **Enum violations (11 of 50)** and much of **missing required fields (17 of 50)**. Constrained or
  grammar-guided decoding makes schema-invalid output structurally unrepresentable. Zero training
  cost, immediate, and it *cannot regress* — a strictly better mechanism than teaching the model to
  usually comply. Strong answers note that it fixes the container, not the content: a field can be
  present and wrong.
- **Refusals (6 of 50).** A system-prompt issue first, and a preference-tuning issue (7.4) if that
  fails. More supervised examples are an unreliable lever on refusal behaviour.

**The genuine dataset increment:** **register/tone (9 of 50)** is the one honest 7.3 item — the
training set probably lacks terse in-style examples or is diluted with chatty ones.

**Ranking by count against cost:** free structural fixes first (the 7.1 ladder rule applied to your
own failure list), covering roughly $17 + 11 + 7 = 35$ of 50 failures, i.e. **70%**, at essentially no
cost. Dataset work last, because it is the expensive lever.

**Projection:** if constrained decoding plus the token-limit fix clears even 56% of failures
($28/50$), that is $108 \times 0.56 \approx 60$ failures removed, leaving ~48, giving
$(600-48)/600 \approx 92\%$. Any defensible arithmetic with stated assumptions earns credit; a plan
with no projected number does not.

**What 82.0% told you:** you are below bar. **What it could not tell you:** that roughly 70% of your
failures need *no new training data at all*, that one category is a configuration bug, and that the
month of dataset work you were about to start would have been aimed at 18% of the problem. Full credit
requires at least two non-data categories correctly identified with their actual cures, an explicit
cost-versus-count ranking, a projected number with assumptions stated, and both halves of the final
contrast.`,
    },
    {
      id: 'm7-l6-q12',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid sees your training graph going satisfyingly down
and says: "The line is going down, so it's getting better — why do you need to test it?" Explain: what
that graph is actually measuring; why a perfect graph can mean the AI learned nothing useful; how you
would *properly* check; why you also have to check it didn't get **worse** at things it used to do;
and why testing on only a handful of questions can fool you. Invent your own analogy — inventing a
better one than the lesson's is worth more.`,
      rubric: md`There is no single right script; grade the **teaching**, and grade the jargon audit
strictly.

1. **What the graph measures, in kid-words.** "How well it guesses the answers in the exact pile of
   examples I showed it" — not "is it good." A strong analogy: a student who studies one specific
   practice packet and gets better and better at that packet. Or: someone who memorised the answer key
   to one test.
2. **Why a perfect graph can mean nothing.** If the student *memorised the answer key*, the graph is
   perfect and the student learned nothing. The kid should feel that a perfect score on the studied
   material is *suspicious*, not reassuring — that is the real insight.
3. **How to check properly.** Questions it has **never seen**, set aside before you started and not
   peeked at — and ideally written by someone else, so they don't accidentally look like your practice
   packet. Bonus for noticing you can only use the sealed set once, or it stops being sealed.
4. **Checking it didn't get worse.** The strongest analogies here are about trade-offs a kid knows:
   practising only free throws until you can't dribble; a friend who spent all summer on chess and
   forgot how to play cards. Then: so you also re-test the old stuff, and you decide *in advance* how
   much of a drop is too much — because deciding afterwards, when you're excited, you'll always talk
   yourself into it.
5. **Why a few questions can fool you.** Coin-flipping language: five questions out of six versus four
   out of six proves nothing, because luck moves a small test around a lot. You need lots of questions
   before a small difference means anything real.
6. **Jargon audit — strict.** "Loss," "overfitting," "held-out," "validation," "epoch," "distribution,"
   "regression suite," "significance," "baseline" used without a kid-level translation *first* is
   **partial at best**. Writing "we hold out a validation set to avoid overfitting" and thinking you
   have explained something is exactly the failure this exercise exists to catch. Full credit needs all
   five beats, a working analogy, and zero unexplained jargon.`,
    },
  ],
}
