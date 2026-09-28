// Module 7, Lesson 3 — Data for adaptation (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm7-l3',
  title: '7.3 Data — the lever nobody wants to pull',
  subtitle:
    'Two teams, one base model, one task. Team A scrapes 50,000 examples; Team B hand-writes 800. Team B wins, obviously and repeatedly. Working out why teaches you what fine-tuning data actually is — and hands you the highest-return skill in applied machine learning.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Two teams are handed the same base model and the same task: an assistant that answers customer
emails for an online retailer. Same architecture, same fine-tuning code, same compute budget.

**Team A** builds a scraper. Support forums, public ticket archives, a few open datasets, a
generator that turns FAQ pages into question-answer pairs. Two days of engineering, and they have
**50,000** training examples.

**Team B** writes a spreadsheet. Then they write examples by hand — actual prompts, actual replies —
and a second person reads every one and rejects about a fifth of them. Three weeks of two people's
time, and they have **800**.

Team B's model is better. Not by a point of eval noise (5.6 taught you to check that first) — better
in the way you can see by reading ten outputs side by side. Team B used **1.6%** as much data.

Sit with how strange that is, because it should bother you. Module 5 was four lessons of *scale
wins*: loss falling like a power law across orders of magnitude, more data monotonically better,
the whole industry's strategy resting on that curve. And here is a result that practitioners
reproduce constantly, in which a rounding error's worth of data beats the pile.

Two escape hatches present themselves, and neither works.

*"The small set overfits less."* But overfitting predicts something specific: Team A's model should
be excellent on its own distribution and brittle off it. That isn't what happens. Team A's model is
mediocre **everywhere**, including on inputs that look exactly like its training data.

*"The 50,000 are dirty."* Warmer — but this is a dodge until you say what "dirty" means and, more
importantly, why the dirt doesn't average out. In pretraining it largely does: 5.1's crawl funnel
throws away enormous amounts of garbage and the survivors are still mostly slop, and scale still
wins. A bigger pile of mediocre web text makes a better base model. So why doesn't a bigger pile of
mediocre examples make a better fine-tune?

Because the two piles are doing **completely different jobs**. That's the whole lesson, and once you
see it, everything else in the practice of building datasets falls out as a consequence.

## What fine-tuning data is actually for

Go back to what the gradient literally computes. Lesson 5.4: supervised fine-tuning is next-token
cross-entropy (1.5) with the loss **masked to the response tokens**. For each example, the update
asks exactly one question:

> Given this prompt, would you have written these exact response tokens?

And it nudges the weights until the answer is closer to yes. Nothing else enters. There is no term
for *good*, no term for *correct*, no term for *helpful*. The objective is **imitation of what you
showed it**.

So each example is a **vote**: a ballot cast for the proposition "answers around here should look
like this." Fit the model and it settles near the vote-weighted average of your ballots. Fifty
thousand mediocre ballots produce an excellent model — an excellent model *of mediocrity*. If half
your set is curt and wrongly formatted, you have asked, with twenty-five thousand units of
insistence, for curt and wrongly formatted.

Now the contrast is sharp:

- **Pretraining data supplies knowledge.** Coverage of a world. Every extra document has some chance
  of carrying a fact, a construction, a rare pattern that nothing else in the corpus carries. That is
  why the curve is smooth over orders of magnitude — you are buying lottery tickets on coverage, and
  more tickets is strictly better. Scale rules (5.1, 5.2).
- **Fine-tuning data supplies a target form.** The knowledge is already in there; 5.4 was blunt about
  this, and about what happens when you pretend otherwise (fine-tune on facts the base model doesn't
  know and you teach **bluffing**, not knowledge). What SFT does is *select* among behaviours the
  model can already produce. It aims. And the accuracy of an aim is not improved by firing more
  shots in random directions.

One sentence to keep: **volume buys coverage of knowledge; quality and diversity buy a sharp
target.** Team A and Team B were not doing the same thing at different scales. Team A was buying
coverage of something the model already had, and paying for it in target sharpness.

There is empirical support worth knowing, and worth handling carefully. Meta's **LIMA** (2023)
fine-tuned a 65B base model on **1,000** carefully curated examples and reported human evaluators
preferring or matching its outputs against models tuned on vastly larger instruction sets. It is a
genuinely useful result and it is *one result*, with caveats you should hold: human preference
judging carries known biases (5.5), the base model was strong, the evaluation was narrow, and other
work finds gains continuing well past a thousand examples for broader task mixtures. The reliable,
boring, reproducible version of the claim is the one to actually operate on:

> Past a few hundred well-covered examples, marginal **quality and diversity** buy more than marginal
> **volume** — and bad examples don't cancel out, they vote.
`,
    },
    {
      type: 'ponder',
      question: md`Module 5 showed loss falling smoothly, like clockwork, as you add data — a power
law holding over several orders of magnitude. This lesson shows 800 examples beating 50,000 of
nominally the same kind. Both are true. Before reading on, work out two things: what are the two
*different jobs* being done, and what is the most likely **hidden fact** about the 50,000 that makes
the comparison less lopsided than it looks?`,
      answer: md`**The two jobs.** Pretraining data supplies *knowledge*: coverage of a world, where
every additional document might carry something nothing else carries — hence the smooth power law.
Fine-tuning data supplies a *target form*: the model already has the knowledge, and the gradient,
masked to the response tokens (5.4), is only asking "would you have written this response?" So each
example is a vote, and the fitted behaviour is the vote-weighted average of the set.

Here's the trap in its exact shape: **the scaling law still holds** for the objective you wrote
down. Loss on Team A's data really does fall smoothly as they add more of it. What changed is that
the objective is now "imitate this pile," and the pile is the problem. You get a beautiful curve
descending toward a target you'd rather not hit.

**The hidden fact: effective diversity is far below 50,000.** Scraped sets are template-heavy — a
generator with a dozen prompt skeletons, forum posts in the same three formats, the same document
reachable at six URLs. Cluster it at a near-duplicate threshold and you might find a few hundred to
a few thousand genuinely distinct behaviours, distributed brutally unevenly: most of the mass in the
two or three easiest kinds of request. So the real comparison isn't 50,000 against 800. It is
something like **600 lopsided noisy votes against 800 deliberately spread clean ones**, and Team B
wins that comparison on both terms at once.

**And a third thing, which is the one people find hardest to accept.** In an average, one bad
example does not cancel one good example — both pull. So *removing* the worst decile of a dataset
can beat *adding* another decile of average ones. That prediction is testable, has been run many
times in practice, and usually comes out that way — reported as practitioner experience across many
teams rather than as one controlled published result, which is exactly how you should weight it.`,
    },
    {
      type: 'text',
      md: md`
## The taxonomy method

So if you can't buy your way to a good target, how do you build one? Here is the procedure. It is
the practical heart of this lesson, it takes an afternoon, and almost nobody does it.

**The move: enumerate the task distribution before you collect anything.**

Sampling whatever exists gives you the distribution of *what was easy to collect*, which is nobody's
task distribution. Real traffic is horrifyingly lopsided — the easy case is most of the volume, and
the cases that generate all your complaints are 2% of it. Sample proportionally and you will train
a model that is superb at the thing that was never hard and has never once seen the thing that
breaks.

So, five steps:

1. **List the axes of variation** the model must handle. Typically: kind of input; difficulty; tone
   or emotional register; required output format; and — the axis everyone forgets — the things it
   must **refuse** or **escalate** rather than answer.
2. **Take the product.** The axes form a grid. Each cell is a distinct behaviour you are committing
   to support.
3. **Prune and patch.** Delete cells that can't occur in reality. Then add cells the grid missed:
   every production failure you've ever seen, every adversarial input, every case where the correct
   response is a *question* rather than an answer.
4. **Budget per cell,** roughly equally — weighted **up** for cells that are hard or high-stakes, and
   deliberately **not** weighted by traffic share. Traffic-weighting is precisely what a scrape gives
   you for free, and it is how you end up with forty thousand order-status examples and zero
   refusals.
5. **Write, then check.** A second reader per example, with authority to reject. Checking is cheap
   relative to writing and it is what catches the contradictions — two examples that answer the same
   question two different ways.

Look at what this reframes. "800 examples" stops being a shortage and becomes a **design**: a budget
divided over a map of the task. It is not the number you stopped at when you got tired. It is 40
cells at 20 apiece, and you can name every cell.
`,
    },
    {
      type: 'example',
      title: 'a taxonomy for a support assistant — 40 cells, 800 examples',
      md: md`
The task: draft replies to customer emails for a mid-size online retailer, or escalate.

**Axis 1 — intent (6 levels):** order status · return or refund · billing dispute · delivery problem
(lost or damaged) · account and login · cancel or change a subscription.

**Axis 2 — difficulty (3 levels):** *complete* (everything needed is in the message) · *underspecified*
(the correct reply asks exactly one clarifying question — not three) · *tangled* (two intents at
once, or a false premise, such as "cancel the order you shipped yesterday" when it shipped last
week).

**Axis 3 — register (2 levels):** *calm* · *hot* (angry, threatening to leave, third time writing).

$$6 \times 3 \times 2 = 36 \text{ cells}$$

Then the cells the grid could never have generated — the ones that exist only because a human sat
down and asked "what must this thing refuse?" **Four escalation cells:** asks for another customer's
information · makes a legal threat · asks the agent to break policy off the books · asks something
outside the domain entirely (tax advice, a medical question about a product).

$$36 + 4 = 40 \text{ cells} \qquad 40 \times 20 = 800 \text{ examples}$$

**Why 20 per cell?** One example per cell means the cell gets defined by one accidental phrasing, and
the model learns the phrasing rather than the behaviour. Two hundred per cell blows the entire
budget on a handful of cells and reproduces exactly the skew you were trying to escape. Ten to
twenty-five is the working range; push toward the top for the escalation cells, because those are
the ones where being wrong is expensive.

**A few cells made concrete,** so you can see that a cell is a specification and not a label:

| cell | what the target response must demonstrate |
|---|---|
| refund · underspecified · calm | asks for the order number and *nothing else*; does not guess; does not pre-apologise for three sentences |
| delivery · tangled · hot | acknowledges the anger in one line, separates the two requests, resolves the possible one, says plainly why the other cannot happen |
| billing · complete · calm | states the charge, the date, the reason; offers exactly one next step |
| escalation · other customer's data | refuses without accusing, explains the reason in one sentence, offers the legitimate path |

**Now notice what the scrape would have given you.** A dump of the real ticket queue is perhaps 60%
order-status, calm, complete — the single easiest cell — and contains approximately **zero** examples
of the four escalation cells, because human agents handle those by escalating, and an escalation
never gets written down as a reply. The scrape cannot contain the behaviour you most need. The
taxonomy's whole purpose is to make the cells you'd never sample show up as **visibly empty boxes**.

**And the price, honestly.** Eight hundred examples at roughly eight minutes each to write and check
is about $107$ hours — two people for two to three weeks. That is the real cost, and it is exactly
why this lever is the one nobody wants to pull. It is not clever, it is not automatable, and it does
not look like machine learning. It is also, per hour spent, the highest-return thing on the board.
`,
    },
    {
      type: 'text',
      md: md`
## Diversity beats volume — and here is the mechanism

"Diversity matters" is the kind of claim that gets repeated until it sounds like folklore. Let's
derive it, so it stops being folklore.

Take two near-identical training examples. Same intent, near-identical phrasing, near-identical
target response. They produce **near-identical gradients**. The second one therefore contributes
almost no new *direction* to the update — only extra *magnitude* along a direction you already had.

That is a double blow, and the second half is the part people miss. Not only is the near-duplicate
uninformative, it is actively **re-weighting** the target: it tells the optimizer that this region of
the task space matters twice as much. A hundred copies of one behaviour is one lesson shouted a
hundred times, and shouting changes the average.

The useful bookkeeping is **effective count**. Model your set as $k$ clusters of near-copies, with
$n_i$ members in cluster $i$. Then:

$$\text{nominal count} = \sum_i n_i \qquad\text{but}\qquad \text{effective votes} \approx k$$

with the cluster sizes $n_i$ acting as *weights* on those $k$ votes rather than as extra votes. This
is 5.1's deduplication argument, transplanted to fine-tuning scale — but the consequence has changed.
At pretraining scale, dedup mattered because duplicates cause memorization and waste compute. At
fine-tuning scale, with $10^3$ examples and a handful of epochs, duplicates **distort the target
itself**. Same operation, sharper stakes.

### Measuring diversity, three ways (and lesson 1.1 finally pays a dividend)

You don't have to guess at any of this. Three cheap checks, in increasing order of effort:

**1. Length distributions.** Histogram prompt lengths and response lengths. A smooth spread is
healthy; a spike is a template. Then — and this is the one that saves you — compute the correlation
between response length and your quality label. Hold that thought; the next ponder is about what
happens when it's high.

**2. N-gram overlap.** Count the most common opening five words across the set. If 3,000 examples
begin identically, you have found a generator, not a dataset. The heavy-duty version is 5.1's
reflex — near-duplicate detection on 13-grams with MinHash — but the opening-phrase histogram takes
one line and catches most of it.

**3. Embedding-space spread.** Embed every example with a sentence embedding model and use the
geometry of lesson 1.1. Two readings matter. First, cluster (k-means or agglomerative) and check
that **every taxonomy cell has population** and no cluster dominates — that is coverage, measured.
Second, plot the histogram of each example's **nearest-neighbour cosine similarity**. A healthy set
gives a broad hump; a spike jammed against $1.0$ is your near-duplicate population, and the height of
the spike is how badly your nominal count is lying to you.

The 50,000-example scrape, run through check 3, is what turns "I suspect this data is redundant"
into "6,200 of these are within cosine $0.97$ of another row, and 71% of the set sits in two
clusters." Now you can act.
`,
    },
    {
      type: 'ponder',
      question: md`You fine-tune on 5,000 examples. Nothing is *wrong* with any of them. But there is
a correlation you never noticed: the examples you kept — the ones that struck you as excellent —
happen to be the long ones. Median response length is 480 tokens, and essentially every example you
rated "excellent" runs past 300. Predict the **specific** failure you will see at inference, explain
the mechanism, and design the check that catches it before you ship.`,
      answer: md`**The failure: length inflation.** Ask for a one-line answer, get four paragraphs.
Ask a yes/no question, get a preamble, three considerations, a bulleted summary and a closing
"In summary." The model pads: restating the question, enumerating caveats, adding structure nobody
asked for.

**The mechanism, and it is worth stating precisely.** "Be excellent" is a fantastically hard function
of the tokens. "Be long" is a trivially easy one — and in *your* dataset the two are perfectly
correlated, because of how you selected. Gradient descent has no way to prefer the hard feature over
the easy one when both fit the data equally well, so it takes the cheap correlate. Nothing in your
data distinguishes quality from length, so nothing in the model will either. You did not teach
quality; you taught a proxy for it.

It is also not merely cosmetic. Padding gives 3.6's hallucination pressure two hundred extra tokens
of room to operate: the model fills the space it has learned to fill, with material that is plausible
rather than known.

**Recognise the shape of this.** It is 5.5's reward-model disease — judges and reward models prefer
longer answers, so optimisation makes answers longer — wearing SFT clothing. Same disease, same
cause: length was a confound in your labels, whether those labels were pairwise preferences or the
implicit label "we decided to keep this one."

**Three checks, before shipping:**

1. **Output length distribution versus the base model** on the same prompt set. A rightward shift of
   the whole distribution is the signal. Include prompts that explicitly demand brevity ("answer in
   one word") — inflation shows up most violently where it is most obviously wrong.
2. **A length-controlled comparison.** When you measure win rate against a baseline, either bucket by
   response length and compare *within* buckets, or fit win rate as a function of the length
   *difference* and read off the win rate at zero difference. If your advantage evaporates at matched
   length, you bought length, not quality. Report the length-controlled number; it is the honest one.
3. **Audit the data first, which is cheapest of all.** Correlate quality label against length. A
   correlation above roughly $0.4$ means you have a confound. The right fix is not a post-hoc length
   penalty — it is to write **excellent short examples**, which is to say: add "required output
   length" as an axis of your taxonomy and fill the cells you were unconsciously skipping.`,
    },
    {
      type: 'text',
      md: md`
## Synthetic data, practically and honestly

Three person-weeks per 800 examples is a real constraint, so of course people generate data with
models. This works, it is standard practice, and it comes with a specific failure mode you must hold
in your head the entire time. Four families, then the honesty.

**1. Self-instruct-style bootstrapping.** Seed with a few dozen human-written tasks, ask a model to
write more in the same spirit, filter, feed survivors back into the seed pool, repeat. Cheap and
effective for breadth. Prone to drifting into a narrow band of "instruction-shaped" tasks that all
sound alike — which your diversity checks will show you, if you run them.

**2. Distillation from a stronger teacher.** Take your prompts, have a strong model write the
responses, train your smaller model on the pairs. This is the workhorse behind most good open-weight
fine-tunes. **The practical reality, stated plainly and without moralising:** most frontier providers'
terms of service restrict using their model outputs to train competing models. That is a contractual
fact about the specific model you are calling, it varies by provider and changes over time, and the
professional move is to read the terms you agreed to rather than to inherit a rumour about them.

**3. Rejection sampling / best-of-N.** Generate $N$ candidate responses, keep only those that pass a
filter. Where a **verifier** exists — unit tests for code, a checker for math, a schema validator for
structured output, an exact match against a known answer — this is the strongest of the four by a
wide margin, because the filter is ground truth rather than taste. Where no verifier exists you fall
back to an LLM judge, and you inherit every bias catalogued in 5.5, including the length bias you
just spent a ponder learning to fear. Note the lovely property of a verifier-filtered set: the
student trains on the teacher's **good tail**, not the teacher's mean, which is exactly how a student
can end up beating its teacher on the target task.

**4. Complexity escalation** (the evol-instruct lineage). Take an existing instruction and ask a
model to make it harder: add a constraint, add a step, deepen the reasoning required, make the input
messier. This is a targeted tool — it grows the *difficulty axis* of your taxonomy specifically,
which is usually the axis a scrape is thinnest on.

### The honest part

**You are cloning a distribution, faults included.** The teacher's blind spots become the student's
blind spots, silently, because nothing in the pipeline flags the answers the teacher got wrong. If
the teacher is confidently mistaken about your domain's edge cases, your student will be confidently
mistaken in precisely the same places — and if you also generated your **eval** with that teacher, the
eval agrees, and everyone is happy right up until production (5.6's contamination logic, applied to
your own homemade benchmark).

The style comes along too, and more completely than people expect: the hedging, the tricolon, the
bulleted summary, the reflexive "It's important to note." You did not choose that voice. You
inherited it.

And 5.1's **model-collapse** debate applies here in miniature. At pretraining scale it is genuinely
contested — the sharpest results show degeneration when each generation *replaces* its predecessor's
data, and much milder effects when data *accumulates* instead. At fine-tuning scale the contested
part barely matters, because the practical prescription is the same either way and is not
controversial: filter hard, keep real human data in the mixture, and **measure** your diversity
rather than assuming it survived the generation loop.

One more, straight from 5.4: synthetic data cannot add knowledge the teacher has and your base model
lacks. Train a student on confident assertions of facts its own pretraining never contained and you
are running 5.4's bluffing experiment on purpose.

## The ritual: print fifty random examples and read them

Here is the single highest-return activity in applied machine learning. It costs about an hour. It
requires no GPU. Practically nobody schedules it.

**Sample fifty examples uniformly at random** — not the first fifty, which are sorted by whatever your
pipeline happened to sort by — print prompt and response in full, and read every one with a pen in
your hand.

Here is what people actually find, and this list is not hypothetical:

- **Label noise.** Responses that are simply wrong.
- **Truncated responses.** Generation hit a token limit mid-sentence. If 3% of your set ends
  mid-word, you are explicitly teaching the model to stop mid-word.
- **Format drift.** Half in markdown, half plain. JSON sometimes fenced, sometimes bare. Two date
  formats.
- **Mutually contradictory examples.** Two near-identical prompts with opposite answers. The model
  cannot resolve this; it can only average it, which surfaces at inference as hedging or as a coin
  flip.
- **A system prompt accidentally baked into half the set,** because someone changed the collection
  script on a Tuesday.
- **Length bias.** The previous ponder, discovered too late.
- **Duplicates.** Straightforward, invisible in aggregate, everywhere.
- **Leaked artifacts.** "As an AI language model." "Here is the JSON you requested:" when your spec
  forbids preamble. The teacher model's name. Timestamps. The wrong speaker's turn.
- **Masking bugs.** Loss computed over the prompt as well as the response — a one-line error that
  quietly changes what you are training.

Every single item on that list is **invisible in the loss curve**. The curve descends beautifully
while you teach the model to truncate. That is the entire argument for reading your data with your
eyes: the metric you are watching cannot see the thing that is wrong.
`,
    },
    {
      type: 'example',
      title: 'the eval went up by removing data, not adding it',
      md: md`
A team is fine-tuning a model to extract structured fields from supplier invoices and emit JSON.
Training set: **6,000** examples, part scraped and part teacher-generated. Eval: exact match on a
held-out set of **500** invoices. Current score: **71.2%**, two points below the target that lets them
ship. The plan on the whiteboard is to generate 4,000 more examples.

Instead, someone prints fifty at random and reads them. Out of 50:

| defect | count | what it teaches the model |
|---|---|---|
| truncated mid-object | 6 | stop generating before the JSON closes |
| chatty preamble ("Sure! Here is the extracted data:") | 5 | violate the format spec |
| inconsistent currency convention (USD vs a symbol) | 4 | flip a coin on the currency field |
| near-copy of another example in the sample | 3 | over-weight one invoice layout |
| plainly wrong field values | 2 | be wrong, confidently |

Twenty of fifty examples carry at least one defect: a defect rate around **40%**, which on $n = 50$
carries a standard error of $\sqrt{0.4 \times 0.6 / 50} \approx 0.069$ — so "somewhere between a
quarter and a half." Imprecise, and far more than enough to act on.

**The cleanup, by class:**

- **Truncated → drop.** Detectable programmatically (the response fails to parse). About 12% of the
  set goes.
- **Preamble → repair.** A deterministic strip; the payload underneath is correct. About 10% fixed.
- **Currency → fix the spec, then the data.** Note that this one is *not a data bug*. It is an
  ambiguity in the specification, showing up as contradictory votes. Fixing only the data leaves the
  bug alive in whoever writes the next batch. About 8% fixed.
- **Near-duplicates → drop** by clustering at cosine $0.95$, keeping one per cluster. About 6% goes.
- **Wrong values → by hand.** No automatic rule finds these, which is exactly why a human read fifty
  examples in the first place.

**Result:** 6,000 examples become **4,900** (about 1,100 dropped) with another 1,100 repaired. Retrain:
same hyperparameters, same seed, same everything. Score goes **71.2% to 79.5%** — up 8.3 points, from
*subtraction*.

**Is that real, or noise?** 5.6's reflex. On $n = 500$ at an accuracy near $0.75$, the standard error
of a single score is $\sqrt{0.75 \times 0.25 / 500} \approx 0.019$ — about 2 points. A naive
two-independent-proportions comparison would want roughly 5 to 6 points before you believe it, so
8.3 clears the bar. And because both runs are scored on **the same 500 items**, the correct test is
paired (McNemar on the items whose answers changed), which is tighter still. The gain is real.

They never generated the 4,000. And here is the punchline worth internalising: generating them would
have been **worse than doing nothing at all**, because the pipeline's defect rate is a *rate* — 4,000
more examples from it is roughly 1,600 more defective votes, plus a fresh helping of near-duplicate
mass. Scaling a bad pipeline scales the badness. Fix the rate, *then* scale.

*(The numbers here are a composite of the kind of audit that happens constantly in practice, not a
single published controlled study. The shape — several points recovered by subtraction and repair —
is common practitioner experience, and you should weight it accordingly: strong enough to make it
your default first move, not strong enough to quote as a law.)*
`,
    },
    {
      type: 'text',
      md: md`
## Mixing, so the model doesn't forget everything else

Lesson 5.4 named the tax: train hard on a narrow objective and the model quietly gets worse at
everything outside it. Catastrophic forgetting, alignment tax, same family. Run several epochs of
pure task data and you get a model that is excellent at drafting refund emails and has become
noticeably worse at following instructions in general, has softened its refusal behaviour, and has
lost the ability to write in any format other than the one you drilled.

The lever that lives in the data is **mixing**: blend general instruction data into your task data.

$$\text{mixture} = \alpha \cdot (\text{general instruction data}) + (1-\alpha) \cdot (\text{task data})$$

Treat $\alpha$ as a hyperparameter, not a constant of nature. Common practice lands somewhere in the
10–50% range; there is no universal value, because the right one depends on your base model, your
epoch count, how narrow your task is, and how much drift you can tolerate.

**And here is the part that matters more than the number: the diagnostic.** You must carry a
**held-out general-capability eval that is not allowed to regress**, and you report two numbers
together, always:

> task metric **up**, general metric **flat**.

One number alone cannot distinguish "learned the task" from "traded away everything else for the
task." A team that reports only the task metric has not measured the thing that will hurt them.
(Lesson 7.6 turns this pairing into a standing habit.)

Mixing is not the only lever on drift — the fine-tuning *method* is another (a low-rank adapter can
only move the model so far, by construction), as are lower learning rates and fewer epochs. But
mixing is the one that lives in the dataset, which is this lesson's department.

## Contamination — against your own eval this time

Lesson 5.6 taught you to be suspicious of public benchmarks leaking into pretraining corpora. Now
the same disease, in your own house, where it is far more common and far more embarrassing.

**If you build your training set and your eval set from the same source and split rows at random,
you will grade memorization.** Near-duplicates straddle the split: the same support ticket filed
twice by different customers, the same document chunked into overlapping pieces, one template with
different names substituted. Your eval jumps twelve points, your production complaints don't move,
and you spend a month confused.

Hold out **by source** or **by time**, never randomly:

- **By source:** every example from customer X, or from one product line, or from one document, goes
  entirely to one side of the split. No source appears on both sides.
- **By time:** train on everything before a cutoff date, evaluate on everything after. This is the
  honest one, because it is the only split that simulates what deployment actually is — predicting
  the future from the past, against a distribution that drifts.

Then run the near-duplicate check **across** the split, exactly as you ran it within the training
set: embed both sides, flag every eval item whose nearest training neighbour exceeds a similarity
threshold, and read those by hand. It takes ten minutes and it is the difference between a number
you can act on and a number that flatters you.

One specific trap, because it happens constantly: **never let synthetic data derived from your eval
prompts into training.** It sounds too obvious to state. It happens anyway, because generation
pipelines usually start from "some real examples," and nobody tracked which of those real examples
went to the test side.
`,
    },
    {
      type: 'ponder',
      question: md`Production. Your assistant mishandles one specific input type: messages containing
two requests at once, where one of them must be refused. It answers both, or refuses both. This is
about 2% of traffic and about 40% of your complaints. You can spend an afternoon writing **10
targeted examples**, or spend money buying **1,000 more generic ones**. Work out which is likely
better, and — this is the part that matters — say *why*, in terms of what the gradient actually does.`,
      answer: md`**The ten targeted examples win, and it is not close.** The reason is that data edits
are **local**.

**The gradient argument.** An example's update pushes hardest on the model's behaviour in the region
of input space near that example, because that is the region whose conditioning the example
constrains. Behaviour on "two requests, one refusable" is therefore determined almost entirely by
examples that *look like that*. A thousand generic instruction examples exert essentially no force
in that region — they are votes cast in other cells of your taxonomy, and they mostly reinforce
behaviours the model already performs well.

**Worse: they dilute, and some of them vote against you.** Add 1,000 generic examples to an 800-example
set and the failing region's share of the total gradient falls by more than half. And generic
instruction sets tend to be overwhelmingly *compliant* — every example demonstrates helpfully doing
what was asked. Some fraction of those thousand are therefore ballots cast **against** refusing,
which is the exact behaviour you are trying to install.

**The taxonomy view, which is the same argument in the language of this lesson.** A production
failure is not a mystery; it is a **report that a cell is empty**. The fix is to fill that cell. Raising
the global average of a dataset does not fill a specific empty box.

**Now the caveats, because this is what separates a good answer from a correct one:**

- **Ten may be too few to generalise** past the exact phrasings you wrote. So spread them across your
  other axes deliberately: calm and hot, both orderings of the two requests, short and long, three
  different refusable request types. Ten examples that are ten paraphrases of one email is one
  example.
- **Check what else you taught.** With so few examples, the model may latch onto a spurious cue — "long
  message means refuse," or "two question marks means refuse." Probe for it.
- **Measure the over-correction.** The classic outcome of a refusal patch is a model that refuses more
  of *everything*. So carry a control set of legitimate requests and watch its refusal rate before
  and after. Small, precise, and **measured** is the whole recipe.

**The general principle worth keeping:** data edits are local, hyperparameter edits are global. When
your failure is local, reach for the local tool.`,
    },
    {
      type: 'text',
      md: md`
## The loop

Everything above collapses into one discipline, and if you retain nothing else from this lesson,
retain this:

> **small data → train → eval → *inspect the failures* → write targeted examples for exactly those
> failures → repeat.**

The emphasised step is the one that gets skipped. Running the eval gives you a number. **Reading the
failures** gives you a dataset. Sort your eval outputs by whether they passed, read thirty that
failed, and group them — you will find that they fall into three or four kinds, and each kind is a
cell your taxonomy didn't have. Add the cells. Write twenty examples for each. Retrain. Your
taxonomy is a living document, and every production failure is a bug report filed against it.

**Iterating on data beats iterating on hyperparameters,** and most practitioners do the opposite. It
is worth being honest about why, because the reason is sociological rather than technical: a
learning-rate sweep *feels* like engineering. It is scriptable, it runs overnight, it produces a
tidy table with a best cell, and at no point does it require you to read fifty ugly examples and
admit in front of your colleagues that the dataset you built is a mess. Data work feels like
janitorial labour. It is unglamorous, it does not go in the paper, and it is where the wins are.

The asymmetry is not subtle. On a converged fine-tune, a hyperparameter sweep is searching a space
where the reachable gains are typically a point or two. The data sets **what the optimizer is aiming
at**. Moving the target beats tuning the aim.

## What you now own

1. **The resolution of the puzzle:** pretraining data supplies *knowledge* (scale rules); fine-tuning
   data supplies a *target form*. With the loss masked to response tokens, every example is a **vote**
   for what answers should look like, and the model fits the vote-weighted average. Volume buys
   coverage; quality and diversity buy sharpness.
2. **The taxonomy method:** enumerate the task distribution *before* collecting — axes, product,
   prune, patch with the cells reality never generates, budget per cell, write and check. "800
   examples" is a **design**: 40 cells at 20 apiece.
3. **Why diversity beats volume, mechanically:** near-duplicates contribute no new gradient direction
   while re-weighting a region; effective votes $\approx$ the number of clusters, not the row count.
   Measure it — length histograms, opening-n-gram counts, embedding clusters and the
   nearest-neighbour cosine spike.
4. **Synthetic data, without illusions:** self-instruct, distillation (check the terms you agreed
   to), verifier-filtered rejection sampling (the strongest, because the filter is ground truth), and
   complexity escalation. You are cloning a distribution, blind spots and voice included — and 5.1's
   collapse debate applies in miniature.
5. **The ritual:** print fifty random examples and read them. Truncation, format drift, contradictions,
   a stray system prompt, length bias — every one invisible in the loss curve, and a defect rate near
   40% is not unusual for a scraped-plus-generated set. Removing bad examples routinely beats adding good ones.
6. **Mixing and the two-number rule:** blend general data against the alignment tax, and never report
   the task metric without a held-out general-capability metric beside it.
7. **Contamination against your own eval:** hold out by **source** or by **time**, then check for
   near-duplicates across the split. A random row split grades memorization.
8. **The loop:** train, eval, *read the failures*, write examples for exactly those, repeat. Data
   edits are local; use them where the failure is.

Next lesson: SFT can only show the model what a good answer looks like — it has no way to say *this
answer is better than that one*. Lesson 7.4 gives you the comparison, and with it a whole new class
of things that can go wrong: **preference tuning**.
`,
    },
  ],
  questions: [
    {
      id: 'm7-l3-q1',
      kind: 'mcq',
      prompt: md`Team B's 800 hand-written examples beat Team A's 50,000 scraped ones, same base
model, same task, same compute. What is the best explanation?`,
      options: [
        'The smaller dataset overfits less, so the resulting model generalizes better',
        'Fine-tuning data specifies a target form rather than supplying knowledge, so the model fits the vote-weighted average of the examples — and 50,000 mediocre, redundant votes describe a mediocre target',
        'The base model already memorised most of the 50,000 scraped examples during pretraining, so they produce essentially no gradient',
        'Larger fine-tuning sets need proportionally more epochs, and Team A did not train long enough',
      ],
      answer: 1,
      explain: md`Option B. The loss is masked to the response tokens (5.4), so each example is
nothing but a request to reproduce those tokens — a vote for a target form. The model settles near
the vote-weighted average, and averages are not improved by adding mediocre members.

**Why A tempts, and why it fails.** Overfitting is real and "smaller is safer" is an honest instinct
from classical ML. But it predicts the wrong symptom: an overfitted model is *excellent* on its own
distribution and brittle off it. Team A's model is mediocre everywhere, including on inputs that look
exactly like its training data — because mediocre is what it was shown. And if smallness were the
virtue, 800 *random scraped* examples would work as well as 800 curated ones. They do not.

**C** confuses the two regimes and gets the gradient wrong — the model is nowhere near zero loss on
those responses. **D** is the hyperparameter reflex: the thing practitioners reach for so they don't
have to read their data.`,
    },
    {
      id: 'm7-l3-q2',
      kind: 'numeric',
      prompt: md`You are building a fine-tuning set with the taxonomy method. Your axes are 5 input
categories $\times$ 4 difficulty tiers $\times$ 3 emotional registers. You prune 12 combinations as
impossible in practice, then add 8 dedicated must-refuse cells. You budget 15 examples per cell. How
many examples is that in total?`,
      answer: 840,
      tolerance: 5,
      explain: md`$5 \times 4 \times 3 = 60$ cells in the raw grid; $60 - 12 = 48$ after pruning;
$48 + 8 = 56$ cells once the refusal cells are added; $56 \times 15 = 840$ examples.

The number itself is not the lesson — the *provenance* of the number is. You can name every one of
those 56 cells and say what behaviour it specifies. That is what makes 840 a **design** rather than
a shortage, and it is why you can look at the finished set and know which boxes are empty.`,
    },
    {
      id: 'm7-l3-q3',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Without appealing to "everyone knows quality beats
quantity," build the argument that 800 diverse examples can beat 50,000 redundant ones for SFT, in
four steps. (1) State exactly what the SFT gradient is computed on — be specific about masking — and
what that makes each example, functionally. (2) Show what a near-duplicate contributes in gradient
terms, and define an "effective count" for a set that is really $k$ clusters of near-copies. (3) Work
the arithmetic for a 50,000-example set that turns out to be 600 clusters with 80% of the mass in 2
of your 40 taxonomy cells. (4) Name the condition under which the 50,000 *would* in fact win, so your
claim is falsifiable.`,
      rubric: md`**(1) What the gradient sees.** SFT is next-token cross-entropy (1.5) with the loss
**masked to the response tokens** (5.4): for each example the update asks only "given this prompt,
raise the probability of exactly these response tokens." No notion of *good* or *correct* enters the
objective — it is pure imitation of what you showed. Functionally, then, each example is a **vote**
for a target form, and the fitted behaviour is roughly the vote-weighted average of the set.
Equivalently: SFT drives the model toward the empirical conditional distribution of your data, so
its ceiling *is* that distribution.

**(2) The near-duplicate.** Two near-identical examples produce near-identical gradients: the second
adds essentially no new *direction*, only extra *magnitude* along a direction you already had. So a
cluster of $n$ near-copies behaves like **one vote with weight $n$** — it does not teach a new
behaviour, it re-weights an existing one. Effective count $\approx k$, the number of distinct
clusters, with the sizes $n_i$ acting as weights rather than as additional votes. Credit for stating
both halves: uninformative *and* distorting.

**(3) The arithmetic.** 50,000 rows collapse to about **600 effective votes**. With 80% of the mass in
2 of 40 cells, the remaining 38 cells share 20% of the gradient weight — roughly 120 effective votes
across 38 cells, about **3 per cell**, against Team B's **20 per cell across all 40**. So the honest
comparison is ~600 lopsided noisy votes versus 800 deliberately spread clean ones, and 38 of 40 cells
are effectively unsupervised in the big set. Full credit requires numbers of this shape and an
explicit *per-cell* statement — "it's smaller than it looks" is not the answer.

**(4) Falsifiability.** The 50,000 wins when its effective diversity really is large and its quality
floor is high: a genuinely varied, human-written, well-filtered set covering cells your 800 never
imagined; or a task that needs broad knowledge-like coverage across many domains and formats rather
than a sharp single target form; or the case where the 800 are diverse but *specify the wrong
behaviour* — a clean target aimed at the wrong thing is worse than a noisy one aimed at the right
thing. Any condition stated as a **measurable property** (cluster count, per-cell coverage, quality
distribution) rather than a vibe earns this point.

"Nailed it" requires the masking detail in (1), a real effective-count definition in (2), and actual
arithmetic in (3).`,
    },
    {
      id: 'm7-l3-q4',
      kind: 'numeric',
      prompt: md`A scraped set of 50,000 examples goes through near-duplicate clustering, and 40% of
the rows turn out to be near-copies of another row that survives. Roughly how many effectively
distinct examples remain?`,
      answer: 30000,
      tolerance: 500,
      explain: md`$50{,}000 \times 0.6 = 30{,}000$.

Now the part that matters more than the arithmetic: this is the **optimistic** reading. Dedup removes
redundancy; it does nothing whatsoever about **skew**. Those 30,000 survivors can still be piled into
two or three cells of a forty-cell task, leaving most of the task unsupervised. So the count after
dedup is a necessary check, not a sufficient one — always follow it with per-cell coverage. A common
and painful discovery is that the deduplicated set is a third the size *and* still covers only 5% of
what the model has to do.`,
    },
    {
      id: 'm7-l3-q5',
      kind: 'mcq',
      prompt: md`You distil from a strong teacher: your prompts, the teacher's responses, train the
student on the pairs. Which limitation most deserves to be at the front of your mind?`,
      options: [
        'Synthetic data raises training loss, so the student converges more slowly and needs more epochs',
        'The student can never exceed the teacher on any metric, because imitation is bounded by its source',
        'Model-generated text is easy for detectors to spot, so the student’s outputs will be flagged as machine-written',
        'The student inherits the teacher’s blind spots and style along with its competence — you are cloning a distribution, faults included — and nothing in the pipeline flags the answers the teacher got wrong',
      ],
      answer: 3,
      explain: md`Option D. Errors and stylistic tics transfer **silently**, because the pipeline has no
ground truth against which to catch them. If the teacher is confidently wrong about your domain's
edge cases, your student is confidently wrong in exactly those places — and if your eval was
generated by the same teacher, the eval agrees with the error (5.6's contamination logic, applied to
your own benchmark). The voice transfers too: the hedging, the bulleted summaries, the reflexive
caveats. You did not choose that style; you inherited it.

**Why B is the well-baited one:** it sounds like a law, and it is *almost* right. But a student can beat
its teacher. Train on **verifier-filtered** or best-of-N teacher output and the student learns the
teacher's good tail rather than its mean; a narrow student can also beat a generalist teacher on a
narrow task. The truth is subtler and less comforting than the false law.

**A** is not a thing. **C** is a real-world fact about a completely different problem — it says nothing
about whether the training data is any good. And one more from 5.4: teaching a student facts its own
base model never learned reproduces the bluffing failure exactly.`,
    },
    {
      id: 'm7-l3-q6',
      kind: 'numeric',
      prompt: md`You have 900 task examples. Your held-out general-capability eval stops regressing
once general instruction data makes up at least 30% of the **training mixture**. What is the minimum
number of general examples you must add?`,
      answer: 386,
      tolerance: 15,
      explain: md`Let $g$ be the general examples added. The mixture has $900 + g$ examples total, so

$$\frac{g}{900 + g} = 0.30 \;\Longrightarrow\; g = 270 + 0.3g \;\Longrightarrow\; 0.7g = 270 \;\Longrightarrow\; g \approx 385.7$$

so **386**.

**The trap is $900 \times 0.3 = 270$,** which is wrong because the general data is *part of* the total,
not an addition to a fixed denominator: 270 general examples in an 1,170-example mixture is 23%, not
30%. Percentages of a total that includes the thing you are adding always work this way, and getting
it backwards is a classic silent bug in mixing scripts.

Second point, worth as much as the algebra: **30% is not a constant of nature.** It is a number you
found by running the diagnostic — and you would have to find it again for a different base model,
task, or epoch count.`,
    },
    {
      id: 'm7-l3-q7',
      kind: 'mcq',
      prompt: md`You build both your fine-tuning set and your eval set from the same archive of
support tickets, splitting the rows at random. After fine-tuning, your eval jumps 12 points.
Production complaints do not move at all. The most likely explanation:`,
      options: [
        'Near-duplicate tickets straddle the random split, so the model trained on close paraphrases of eval items — you are grading memorisation, and the fix is to hold out by source or by time',
        'The eval set is too small, so a 12-point jump is within binomial noise',
        'The model overfitted the training set, so you should train for fewer epochs',
        'Production traffic has drifted since the archive was collected, so the eval measures an obsolete distribution',
      ],
      answer: 0,
      explain: md`Option A. The same ticket gets filed twice by different customers, templates repeat,
documents get chunked with overlap — a random row split scatters near-identical items across both
sides, and your eval then measures recall of things the model was trained on. This is the single most
common way applied teams fool themselves.

**Why B tempts:** binomial noise is a genuinely underrated explanation and 5.6 trained you to compute
the band first — do compute it. But 12 points is far outside the band for any reasonably sized eval,
and noise does not explain a change that is reliably *in the direction of the thing you just
optimised*.

**Why D tempts:** drift is real and worth checking. But it predicts your eval was already misaligned
*before* fine-tuning; it does not explain a jump that fine-tuning produced.

**C** misdiagnoses the failure: the model may be fitting perfectly sensibly. The problem is that your
test set is not a test set. Split by source or by time, then run a near-duplicate check across the
split and read the flagged items by hand.`,
    },
    {
      id: 'm7-l3-q8',
      kind: 'numeric',
      prompt: md`**Fermi — do it on paper.** Your fine-tuning set is 1,000 examples averaging 500
tokens each. The base model's pretraining corpus was 15 trillion tokens. Estimate the ratio
(fine-tuning tokens divided by pretraining tokens) and express it as a power of ten: enter the
exponent $n$ such that the ratio is about $10^{n}$. Round to the nearest half; the tolerance is
generous.`,
      answer: -7.5,
      tolerance: 1,
      explain: md`$1{,}000 \times 500 = 5 \times 10^{5}$ fine-tuning tokens. The corpus is
$15 \times 10^{12} = 1.5 \times 10^{13}$. So

$$\frac{5 \times 10^{5}}{1.5 \times 10^{13}} \approx 3.3 \times 10^{-8} \approx 10^{-7.5}$$

About **thirty billionths** — three parts in a hundred million.

Now sit with what that means, because it is the reason this lesson exists. A layer of data thinner
than the paint on a battleship determines essentially everything a user ever perceives about the
model: its format, its voice, its refusals, its willingness to say "I don't know," whether it pads
answers to four paragraphs. That vanishing thinness cuts both ways. It is why a small, careful
dataset is such an extraordinary lever — and why a few hundred bad examples can visibly wreck a
model that cost tens of millions of dollars to pretrain.`,
    },
    {
      id: 'm7-l3-q9',
      kind: 'mcq',
      prompt: md`Your fine-tuned model has plateaued two points below the target you need to ship. You
have one day. Which single action has the highest expected return?`,
      options: [
        'Sweep learning rate and batch size over a 3 × 3 grid and take the best cell',
        'Generate 20,000 more examples from the same pipeline and retrain on the larger set',
        'Print fifty randomly sampled training examples and read every one of them, end to end',
        'Train for three more epochs and see whether the plateau breaks',
      ],
      answer: 2,
      explain: md`Option C — one hour, no GPU, and the highest-return activity in applied ML. It
routinely surfaces truncated responses, format drift, a system prompt baked into half the set,
mutually contradictory labels and near-duplicate mass. Every one of those is **invisible in the loss
curve**, which will descend beautifully while you teach the model to stop mid-sentence.

**Why A is the seductive one, and it deserves naming precisely:** a sweep *feels* like engineering. It
is scriptable, it runs overnight, it yields a tidy table with a winning cell, and it never once
requires you to admit your dataset is a mess. But you are tuning the *aim* at a target your data
defined, and on a converged fine-tune the reachable gain from a sweep is usually smaller than the
gain from deleting your worst 10% of examples.

**B** buys more of the same defect rate at larger scale — if the pipeline produces 40% defective
examples, 20,000 more is 8,000 more bad votes. **D** makes memorisation more likely, not less, and if
you are plateaued it is the least informative knob on the board.`,
    },
    {
      id: 'm7-l3-q10',
      kind: 'written',
      prompt: md`**Design the data, then design the split.** You are fine-tuning an assistant that
converts a developer's plain-English bug description into a structured triage record (severity,
component, reproduction steps, suggested owner). Budget: roughly 600 examples. No existing dataset.
On paper: (1) write the taxonomy — name your axes and their levels, take the product, prune, and add
the cells a product would never generate on its own; (2) show the arithmetic that lands near 600;
(3) state your per-cell budget and justify why it is neither 1 nor 200; (4) specify how you will hold
out an eval set so that it cannot grade memorisation; (5) name two diversity checks you would run on
the finished set before training.`,
      rubric: md`**(1) The taxonomy.** Axes must be *behaviourally* distinct, not synonyms for each
other. A strong set: **input completeness** (has repro steps / missing repro / internally
contradictory); **bug type** (crash, data corruption, UI, performance, security, integration);
**severity signal** (obviously critical / obviously minor / genuinely ambiguous); **input style**
(terse one-liner, pasted chat with noise, long structured report).

The cells a product never generates — this is where most of the credit is: **must-escalate** (a
security report that must not be echoed into a public tracker); **must-ask** (too little information
to triage, so the correct output is a question, not a guess); **false premise** ("the API returned
500" when the pasted log clearly shows 404); **non-bug** (a feature request wearing bug clothing).
Any answer whose taxonomy contains only the happy path has missed the method.

**(2) Arithmetic, shown and landing near budget.** For example: $6 \times 3 \times 2 = 36$ cells
(bug type $\times$ completeness $\times$ style-group), prune 6 implausible combinations to get 30, add
8 special cells for 38, at 16 examples per cell $\approx 608$. Any coherent product / prune / add
with a stated per-cell budget earns this — the requirement is that real numbers appear.

**(3) Per-cell budget.** One example per cell means the cell is defined by a single accidental
phrasing, and the model learns the phrasing rather than the behaviour. Two hundred per cell spends
the whole budget on a handful of cells and reproduces exactly the skew you were escaping. Roughly
10–25 is the working range, weighted **up** for hard and high-stakes cells (security, must-escalate)
and explicitly **not** weighted by traffic share.

**(4) The hold-out.** By **source** or by **time** — all bugs from two specific repositories or
services, or every bug filed after a cutoff date — never a random row split, since the same bug gets
filed twice and templates repeat. Then run a near-duplicate check *across* the split: embed both
sides, flag eval items whose nearest training neighbour exceeds a similarity threshold, read those by
hand. Bonus credit for insisting the must-escalate and must-ask cells are represented **in the eval**
— you cannot measure a behaviour you did not put on the test.

**(5) Two diversity checks.** Any two of: embed and cluster, then verify every taxonomy cell has
population and no cluster dominates; nearest-neighbour cosine histogram (a spike near $1.0$ is your
template population); opening-n-gram counts (200 examples starting identically is a generator
artifact); response-length histogram plus the correlation between length and quality label.

Full credit requires actual numbers in (2) and a hold-out rule in (4) that is *not* random.`,
    },
    {
      id: 'm7-l3-q11',
      kind: 'written',
      prompt: md`**The fifty-example audit.** You print 50 random examples from a 6,000-example
JSON-extraction training set and find: 6 truncated mid-object; 5 with a chatty preamble your format
spec forbids; 4 using a different currency convention from the rest; 3 near-copies of another example
in the same sample; 2 with plainly wrong values. On paper: (1) estimate the defect rate in the full
set and quantify that estimate's uncertainty; (2) for each defect class, decide fix / drop / must be
handled by a human, and justify it; (3) predict the direction and rough size of the eval change from
doing nothing but this cleanup, and say how you would know the change was real rather than noise on a
500-item eval; (4) explain why generating 4,000 more examples from the same pipeline would have been
worse than doing nothing.`,
      rubric: md`**(1) Rate and band.** 20 of 50 examples carry at least one defect (assuming little
overlap between classes) — about **40%**, so roughly 2,400 of 6,000. Uncertainty: a proportion from
$n = 50$ has standard error $\sqrt{0.4 \times 0.6 / 50} \approx 0.069$, so about $\pm 7$ points at
one standard error and $\pm 14$ at two — "somewhere between a quarter and a half." Credit for
computing a band **at all**; the habit of never quoting a proportion without one is the point (5.6).

**(2) Triage by class.**
- **Truncated → drop.** Programmatically detectable (the response fails to parse). A truncated example
  actively teaches the model to stop mid-object, which is worse than teaching it nothing.
- **Preamble → fix.** A deterministic strip; the payload underneath is correct, and the defect is
  literally a prefix.
- **Currency convention → fix the *spec*, then the data.** The key insight, and the one that separates
  strong answers: this is not a data bug, it is an ambiguity in the specification surfacing as
  contradictory votes. Contradictory votes produce a model that flips a coin at inference. Repairing
  only the rows leaves the bug alive in whoever writes the next batch.
- **Near-duplicates → drop** by clustering at a similarity threshold and keeping one per cluster.
- **Wrong values → human.** No automatic rule finds them — which is precisely why a person read fifty
  examples. Bonus: turn each detectable class into a permanent pipeline gate (a parse check, a
  preamble check, a schema check), so the defect cannot come back.

**(3) Direction, size, and realness.** Direction: **up**. Size: several points is typical when the
defect rate is this high, with most of the gain from truncation and preamble — the two classes that
corrupt the exact output format the metric measures. Realness: on $n = 500$ at accuracy near $0.75$,
the standard error of a single score is $\sqrt{0.75 \times 0.25 / 500} \approx 0.019$, about 2
points; a naive two-independent-proportions comparison therefore wants roughly 5–6 points before you
believe it. But both runs are scored on **the same items**, so the correct test is **paired** (McNemar
on the items whose answers changed), which is tighter than the independent-samples bound. Credit for
computing a band and for noticing the pairing.

**(4) Why more data would be worse than nothing.** The pipeline's defect rate is a **rate**: 4,000 more
examples is roughly 1,600 more defective votes, strengthening exactly the truncation and preamble
behaviours you are trying to remove — and it brings more near-duplicate mass, so the *effective*
diversity gain is far below 4,000. "Nailed it" answers say explicitly that generation quality is a
rate, and that scaling a bad rate scales the badness. Fix the pipeline, then scale it.`,
    },
    {
      id: 'm7-l3-q12',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "If more practice makes you better, how did
the team with 800 examples beat the team with 50,000?" Explain, in kid-words: (1) what the AI already
knew before anybody fine-tuned it, and what the examples are actually for; (2) why 50,000 sloppy
examples can teach it something *worse* than 800 careful ones; (3) why examples that are nearly the
same barely count; (4) what the small team did on purpose that the big team did not. Invent your own
analogy — a better one than the lesson's is worth more. You may not use a word you have not first
explained in kid-words.`,
      rubric: md`Grade the **teaching**, not the vocabulary.

1. **What it already knew.** The AI read something like the whole internet before anyone showed it
   these examples — it already knows the facts and the words. The examples are not teaching it
   *stuff*; they are showing it *how you want it to answer*. Good framings: a new employee who
   already knows the trade but not the house style; a musician who can play anything but doesn't know
   which song you want.
2. **Sloppy examples teach sloppiness.** The AI copies the *average* of everything you show it. It
   has no way to tell a good example from a bad one — you never told it which was which. So showing
   it 25,000 rushed answers is the same as asking, 25,000 times, for a rushed answer. The best
   answers say plainly: it does **not** notice the good ones and ignore the rest. Averaging is all it
   does.
3. **Near-copies barely count.** Twenty almost-identical examples are one lesson said loudly, not
   twenty lessons. Strong analogies: practising the same free throw from the same spot a thousand
   times and then losing a game because you never shot from anywhere else; a spelling list of fifty
   words where forty of them are "cat."
4. **What the small team did on purpose.** They wrote down every *different kind* of question that
   could come in — including the awkward ones, and the ones the AI has to say no to — and made sure
   they had examples of every kind. The big team took whatever was lying around, which was mostly the
   easy kind, and had *nothing at all* for the hard kinds. The word to land, in kid-words, is
   **coverage**, not count.
5. **Jargon audit.** "Fine-tuning," "gradient," "distribution," "taxonomy," "deduplication," "SFT,"
   "eval," "token," "model" used without a kid-level translation first is **partial at best**. This
   exercise exists specifically to catch jargon-hiding: a fluent-sounding paragraph leaning on
   unexplained words scores *below* a clumsy one that actually explains. If you invented an analogy
   the kid could repeat back at dinner, score yourself up.`,
    },
  ],
}
