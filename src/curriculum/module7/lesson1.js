// Module 7, Lesson 1 — The adaptation decision (anchor lesson, Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm7-l1',
  title: '7.1 The adaptation decision — what to do when the model isn’t good enough',
  subtitle:
    'Six interventions, costs spanning five orders of magnitude, and one diagnostic question that routes between them. Most teams skip the question, reach for fine-tuning because it sounds serious, and burn a month. This lesson is that question.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

You have a task. You point a strong open model at it. It is *not good enough*.

Now look at the menu, in order of what it costs you:

| intervention | money | your time |
|---|---|---|
| rewrite the prompt | $0 | an afternoon |
| few-shot examples in context | pennies per request, forever | an afternoon |
| retrieval (RAG) | infrastructure | days to weeks |
| LoRA fine-tune | tens of dollars | days (mostly data) |
| full fine-tune | hundreds to thousands | weeks |
| continued pretraining | six figures | months |

Five orders of magnitude between the ends. And here is the pathology this lesson exists to cure:
**most teams jump straight to fine-tuning**, because prompting feels like a hack and fine-tuning
feels like engineering. They spend three weeks building a dataset, run the job, and discover the
model is now *worse* — same failure, plus new ones.

The reason isn't that fine-tuning is bad. It's that they never asked the only question that
matters, which is not *"which technique is best?"* but:

> **Why, specifically, is it failing?**

Because there are three fundamentally different ways a model can fail you, they have three
different cures, and applying the wrong cure doesn't just waste money — it can make things
actively worse in a way we will derive precisely.

## The three failure types

Module 5 gave you the distinction this whole lesson rests on. Pretraining (5.1, 5.2) is where
**knowledge** comes from — trillions of tokens, months of compute. Fine-tuning (5.4) is where
**form** comes from — how an answer should look, what persona speaks it, which format it lands in.
Knowledge is *learned at scale*; form is *selected from what the base already contains*.

Split failures along that seam and you get:

**Type 1 — it doesn't KNOW.** Your internal API changed last month; the model confidently
describes the old one. It cannot know: the fact was never in the pretraining data, or has been
superseded. *Cure: give it the fact at inference time — retrieval, or just paste the document in.*

**Type 2 — it knows, but doesn't BEHAVE.** It has the knowledge and the capability, but answers in
the wrong format, wrong register, wrong length; ignores your JSON schema one time in twenty;
refuses things it shouldn't. *Cure: fine-tuning — this is exactly what it's for.*

**Type 3 — it knows and could behave, but you ASKED BADLY.** The instruction was ambiguous, the
examples absent, the output format never specified. *Cure: prompt work. Free, immediate, and
routinely worth several points of accuracy.*

And a fourth that masquerades as a quality problem:

**Type 4 — it's fine, but too slow or too expensive.** Not a quality failure at all. *Cure:
distillation, quantization, caching, a smaller model — Module 8's territory, not this module's.*

The diagnosis is usually cheap: show the model the missing fact in the prompt. If it now succeeds,
you had Type 1 and you need retrieval, not training. If it still mangles the format, you have Type
2. If a clearer instruction fixes it, it was Type 3 all along.
`,
    },
    {
      type: 'ponder',
      question: md`The most expensive mistake in this whole module: you have a **Type 1** failure —
the model doesn't know your product's new pricing tiers — and you decide to fine-tune on 2,000
question-and-answer pairs about them. Lesson 5.4 tells you exactly what will happen. Predict the
failure mode *precisely*, and say what the gradient actually taught the model.`,
      answer: md`You will get a model that answers pricing questions **confidently and wrongly** —
and often *more* confidently than before you started.

Trace the gradient. Each training pair has a question-shaped input and an answer-shaped target. The
loss (1.5) rewards producing that target's tokens. But the model has no internal representation of
your pricing to draw on, so what it can actually learn from these pairs is the *mapping from
question-shape to confident-answer-shape*: "when asked about tiers, emit a fluent, specific,
authoritative-sounding pricing answer." You have trained the **form of knowing** without the
knowledge. That's a bluffing machine, and it is measurably worse than the original, which at least
hedged.

Some facts do stick — repetition can lodge specifics, especially with many epochs — but you're
using the most expensive, least reliable mechanism available to store a fact that a retrieval
system would serve exactly, cheaply, and updatably. And when the pricing changes next quarter, RAG
needs a document edit while your fine-tune needs a retrain.

**The rule that follows:** fine-tune to change *behaviour*, retrieve to change *knowledge*. Nearly
every "our fine-tune made it hallucinate more" story is this mistake.`,
    },
    {
      type: 'text',
      md: md`
## The ladder rule

Order the interventions by cost and climb **only when the rung below provably fails**:

$$\text{prompt} \;\to\; \text{few-shot} \;\to\; \text{retrieval} \;\to\; \text{LoRA} \;\to\; \text{full FT} \;\to\; \text{continued pretraining}$$

The word doing the work is *provably*. "It felt bad" is not a rung failure; a measured score on a
held-out set is. Which produces the discipline that governs this entire module:

> **Build the eval before you choose the intervention.**

Without a number, you cannot tell whether the prompt fix already solved it, whether the fine-tune
helped, or whether you have merely traded one failure for another. Teams that skip this step spend
weeks producing changes they cannot evaluate — and lesson 7.6 is entirely about building the
measurement that makes this ladder navigable.

## What fine-tuning genuinely buys

Once you've earned your way up the ladder, be clear about what you're purchasing, because the
honest list is narrower and more valuable than the hype suggests:

- **Format reliability at scale.** Prompting gets you to 95% schema compliance; fine-tuning gets
  you to 99.5%. If you make a million calls, that difference is 45,000 failures a day.
- **Shorter prompts — a real, recurring cost saving.** A behaviour baked into weights doesn't need
  2,000 tokens of instructions on every request (the arithmetic below is startling).
- **Tone and persona consistency**, which long instructions approximate badly.
- **Tool-call and structured-output syntax** — exactly the "learned format" of 5.4.
- **Latency and cost via distillation**: teach a small model to imitate a big one on *your* narrow
  task (Module 8 does this properly).
- **Refusal and safety behaviour** tuned to your domain.

And what it does *not* buy: reliable new facts (Type 1 — use retrieval), reasoning ability the base
model lacks (you cannot fine-tune a 1B model into a reasoner over a weekend), or a replacement for
having an evaluation.
`,
    },
    {
      type: 'example',
      title: 'four scenarios, routed',
      md: md`
**1. "Our support bot cites deprecated API endpoints."**
Diagnosis: paste the current API docs into the prompt — it answers correctly. **Type 1.** Cure:
retrieval over your docs. A fine-tune here would teach confident-sounding endpoint invention. Cost:
days of engineering, zero GPU.

**2. "It answers well but ignores our JSON schema about 4% of the time, and that breaks the
pipeline."**
Diagnosis: the content is right, the container is wrong; more prompt instructions have plateaued.
**Type 2** — a pure form problem, the exact case fine-tuning was made for. Cure: LoRA on a few
thousand correctly-formatted examples. Expect 4% → well under 1%. Cost: tens of dollars, a few
hours of compute, plus real time on data (7.3).

**3. "Our summaries are technically accurate but read like a robot wrote them."**
Diagnosis: try three prompt variants with an explicit style guide and two worked examples. Often
this alone lands it. **Type 3 first.** If style *still* drifts across thousands of calls, it
becomes Type 2 and a small fine-tune buys consistency prompting can't hold.

**4. "It's good, but at 40 tokens/sec and $8k a month, we can't ship it."**
Diagnosis: quality is fine. **Type 4** — an efficiency problem wearing a quality costume. Cures
live in Module 8: quantize (4.4), distil into a smaller model, batch better (4.5), cache prompts.
Fine-tuning the big model for quality would be solving a problem you don't have.
`,
    },
    {
      type: 'ponder',
      question: md`Run the economics yourself before reading on. You serve **1,000,000 requests per
month**. Your prompt carries a 2,000-token instruction block that a fine-tune could bake into the
weights. Input tokens cost about **$3 per million**. A LoRA fine-tune costs roughly **$50** of
compute, one time. What's the monthly prompt bill, what's the payback period — and then the harder
question: what cost did this arithmetic completely ignore?`,
      answer: md`**The bill:** $2{,}000 \text{ tokens} \times 10^6 \text{ requests} = 2 \times 10^9$
input tokens per month. At \$3 per million: **\$6,000 per month**, purely to re-explain your
instructions to a model that has already read them two million times. The \$50 fine-tune pays for
itself in roughly **six hours of traffic**. On compute alone it is not a close call — and there's a
latency dividend too, since 2,000 fewer prompt tokens means less prefill on every request (3.3).

**What the arithmetic ignored: your time.** The GPU cost of a small fine-tune is trivially cheap;
the *data* is not (7.3 is an entire lesson on why). Realistically: two to three weeks to build,
clean, and iterate on a good dataset, plus an eval harness you needed anyway, plus a retraining
commitment every time the base model or your requirements change. At loaded engineering rates
that's tens of thousands of dollars — three orders of magnitude above the \$50 that felt like "the
cost."

**The real decision rule:** GPU cost almost never decides a fine-tune; *maintenance* does. Ask "am
I prepared to own this dataset for two years?" If the answer is no, keep the prompt — and this is
precisely why so many production systems settle on prompt + retrieval, reserving fine-tuning for
the few behaviours that are stable, high-volume, and worth owning.`,
    },
    {
      type: 'ponder',
      question: md`You climbed the ladder correctly: real Type 2 failure, good data, clean LoRA run.
Your task metric jumps 6 points. You ship it — and within a week support reports that the assistant
has become *worse at everything else*: vaguer on general questions, oddly formal, worse at the
occasional coding request. Nothing in your eval caught it. What happened, and what should have been
in the eval?`,
      answer: md`You bought your 6 points with the **alignment tax** (5.4): fine-tuning moves the
weights toward your narrow distribution, and behaviours outside it drift — a mild, real form of
catastrophic forgetting. Your eval measured only the thing you were optimising, so by construction
it could only report success. **An evaluation that can only go up is not an evaluation; it is a
progress bar.**

What belonged in it: a **regression suite** of held-out general capabilities you are not trying to
change — a handful of coding, reasoning, and open-QA items, plus samples of the ordinary traffic
your model already handled well — scored before and after, with a rule stated in advance that a
drop beyond some threshold blocks the release.

The mitigations, once you can see the problem: mix general instruction data into the fine-tuning
set (7.3), lower the learning rate or train fewer epochs, prefer LoRA at modest rank over full
fine-tuning (a smaller update can move less that you didn't intend — 7.2), and keep the option of
serving the fine-tune only for the narrow route while general traffic hits the base model. The
generalisable habit is the one this lesson keeps returning to: **decide in advance what must not
get worse, and measure that too.**`,
    },
    {
      type: 'text',
      md: md`
## Production is a hybrid, always

One more corrective, because the ladder can read as a tournament with a single winner. Real
systems combine rungs, and the combination is usually the point:

> retrieval supplies the **facts** · a small fine-tune supplies the **format and tone** ·
> the prompt supplies the **task-specific instructions** · the eval supplies the **feedback loop**

A support assistant might retrieve the right three documents (Type 1 handled), use a LoRA that
guarantees the response schema and house voice (Type 2 handled), and carry a 200-token prompt
instead of 2,000 (Type 3 handled, cheaply). Each layer does the job it is actually good at, and
none of them is asked to do another's.

## The order of operations, as a habit

1. **Build the eval.** A held-out set that reflects real inputs, with a score you trust (7.6).
2. **Diagnose the failure type.** The paste-the-fact-in test separates Type 1 from Type 2 in about
   ten minutes.
3. **Try the cheapest cure that addresses that type.** Prompt, few-shot, retrieval.
4. **Measure.** If it clears your bar, stop — you are done, and you have saved a month.
5. **Only then climb.** And when you climb to fine-tuning, know that you are signing up to own a
   dataset (7.3), a training recipe (7.2, 7.4, 7.5), and a regression suite (7.6) for as long as
   the product lives.

## What you now own

1. **The diagnostic question** — *why* is it failing — and the four failure types it sorts into:
   missing knowledge, wrong behaviour, bad instructions, and too-expensive.
2. **The knowledge/form seam** inherited from Module 5, and the derived rule: **fine-tune to change
   behaviour, retrieve to change knowledge** — with the bluffing failure mode you can now predict
   from the gradient.
3. **The ladder rule:** climb only on measured failure, which makes the eval a prerequisite rather
   than an afterthought.
4. **The honest ledger** of what fine-tuning buys (format reliability, prompt-cost savings, tone,
   tool syntax, distillation) and what it doesn't (facts, reasoning it never had).
5. **The economics that actually decide it:** not GPU dollars (a rounding error) but dataset
   ownership and maintenance.

Next lesson: you've decided to fine-tune. Almost nobody updates all the weights any more — and the
reason is a bet about the *shape* of the update, which turns out to be checkable in a picture.
`,
    },
  ],
  questions: [
    {
      id: 'm7-l1-q1',
      kind: 'mcq',
      prompt: md`Your model gives outdated answers about your company's internal API, which changed
last month. What is the right intervention?`,
      options: [
        'Fine-tune on question-and-answer pairs covering the new API',
        'Retrieval — put the current documentation in the model’s context at inference time',
        'Continued pretraining on your entire internal documentation corpus',
        'Increase the temperature so the model explores less-memorised answers',
      ],
      answer: 1,
      explain: md`A Type 1 (knowledge) failure, and knowledge belongs in the context, not the
weights: retrieval is cheaper, immediately updatable when the API changes again, and it doesn't
risk teaching the *form* of confident answering without the substance. Option A is the single most
common and most expensive mistake in applied LLM work — it produces fluent, authoritative, wrong
answers (the bluffing derivation). Option C is A with two more zeroes on the invoice. Option D
misunderstands temperature entirely: sampling (3.2) changes *which* token you draw from the
distribution, not what the model knows.`,
    },
    {
      id: 'm7-l1-q2',
      kind: 'numeric',
      prompt: md`You serve 1,000,000 requests per month with a 2,000-token instruction block in
every prompt. Input tokens cost $3 per million. What is your **monthly** cost, in dollars, for
those instruction tokens alone?`,
      answer: 6000,
      tolerance: 500,
      explain: md`$2{,}000 \times 10^{6} = 2\times10^{9}$ tokens; at \$3 per million that is
**\$6,000 per month** — spent re-explaining your instructions to a model that has read them two
million times. Against a one-time \$50 fine-tune that bakes the behaviour into the weights, the
payback is about six hours of traffic. This calculation converts an architectural preference into a
line item, which is how such decisions actually get approved.`,
    },
    {
      id: 'm7-l1-q3',
      kind: 'mcq',
      prompt: md`Why does the ladder rule insist you build the evaluation *before* choosing an
intervention?`,
      options: [
        'Because reviewers and managers expect metrics in the proposal',
        'Because without a measurement you cannot tell which rung failed, whether the cheap fix already worked, or whether your expensive fix traded one failure for another',
        'Because evaluation datasets can be reused as training data later',
        'Because fine-tuning frameworks require a validation set to run at all',
      ],
      answer: 1,
      explain: md`The ladder's whole logic is "climb only on *measured* failure" — with no number,
every rung looks equally necessary and you will default to the most impressive-sounding one. Option
C is actively dangerous advice: reusing eval data for training is exactly the contamination that
makes your numbers fiction (5.6). Option D is false for most frameworks and would be a poor reason
anyway.`,
    },
    {
      id: 'm7-l1-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Starting from Module 5's finding that pretraining
supplies *knowledge* while supervised fine-tuning supplies *form*, derive the four failure types
and their cures. For each type: what the observable symptom is, what the underlying deficit is,
which intervention addresses it, and — for Type 1 specifically — trace the gradient to show why
applying the Type 2 cure produces a *worse* model rather than merely an unhelpful one.`,
      rubric: md`**The seam:** knowledge is acquired at pretraining scale; form is selected from
what the base already contains. Failures therefore sort by which is missing.

**Type 1 — missing knowledge.** Symptom: confident but factually wrong or outdated. Deficit: the
information isn't in the weights. Cure: supply it in context (retrieval), or continued pretraining
if the gap is pervasive and stable.

**Type 2 — wrong behaviour.** Symptom: right content, wrong format/tone/length/schema compliance.
Deficit: the base can do it but doesn't default to it. Cure: fine-tuning (SFT/LoRA), possibly
preference tuning.

**Type 3 — bad instruction.** Symptom: fixes itself when you ask more clearly or add examples.
Deficit: your prompt. Cure: prompt engineering, few-shot.

**Type 4 — cost/latency.** Symptom: quality acceptable, economics not. Deficit: none, in quality
terms. Cure: quantization, distillation, batching, caching (Module 8).

**The gradient trace for the mis-applied cure:** fine-tuning on question/answer pairs about facts
the model lacks presents inputs shaped like questions and targets shaped like confident answers.
Cross-entropy rewards producing that target's tokens, but the model has no internal grounding to
retrieve, so the learnable regularity is the *mapping from question-shape to confident-answer-shape*
— it learns the form of knowing without the knowledge. Result: a model that bluffs fluently, worse
than the hedging original, and stale again at the next product change.

Full credit requires all four types with symptom/deficit/cure, and a gradient-level (not merely
assertive) account of the bluffing failure.`,
    },
    {
      id: 'm7-l1-q5',
      kind: 'numeric',
      prompt: md`**Fermi.** A LoRA fine-tune of an 8B model on 10,000 examples averaging 500 tokens,
for 3 epochs. Using $C \approx 6ND$ from lesson 5.2 (the forward and backward passes still traverse
the full frozen model), and a GPU sustaining ~125 TFLOP/s, roughly how many **hours** does the run
take?`,
      answer: 1.6,
      tolerance: 1.2,
      explain: md`Tokens: $10{,}000 \times 500 \times 3 = 1.5\times10^{7}$. Compute:
$C \approx 6 \times 8\times10^{9} \times 1.5\times10^{7} \approx 7.2\times10^{17}$ FLOPs. Divided
by $1.25\times10^{14}$ FLOP/s gives $\approx 5{,}800$ s $\approx$ **1.6 hours** — a few dollars of
rented GPU. Note what this means: the *compute* for a serious task-specific fine-tune is
inconsequential. What costs real money is the dataset and the maintenance, which is exactly why the
decision rule in this lesson is about ownership rather than FLOPs.`,
    },
    {
      id: 'm7-l1-q6',
      kind: 'mcq',
      prompt: md`Which of these is fine-tuning genuinely good at?`,
      options: [
        'Teaching the model facts that were not in its pretraining data',
        'Raising schema-compliance from ~95% (achievable by prompting) to ~99.5%, reliably, across millions of calls',
        'Giving a small model reasoning capabilities that its base model lacks',
        'Eliminating the need for an evaluation suite, since the behaviour is now built in',
      ],
      answer: 1,
      explain: md`Format reliability at scale is the archetypal Type 2 win — and that last few
percent matters enormously in production, where 4% of a million calls is 40,000 daily failures.
Option A is Type 1 (retrieve instead). Option C oversells: fine-tuning *elicits and stabilises* what
the base can already do; it does not manufacture absent capability, and a weekend of LoRA will not
turn a small model into a reasoner. Option D inverts the truth — a fine-tuned model needs *more*
evaluation, because you now own a regression surface (7.6).`,
    },
    {
      id: 'm7-l1-q7',
      kind: 'numeric',
      prompt: md`Your pipeline makes 1,000,000 calls per month and the model violates your required
JSON schema 4% of the time. A fine-tune reduces violations to 0.5%. How many **fewer failures per
month** is that?`,
      answer: 35000,
      tolerance: 3000,
      explain: md`$0.04 \times 10^{6} = 40{,}000$ failures before; $0.005 \times 10^{6} = 5{,}000$
after; a reduction of **35,000 per month** — well over a thousand a day. This is the number that
justifies a Type 2 fine-tune to a sceptical engineering manager, and it is why "prompting gets you
most of the way" is a *weaker* argument than it sounds at volume: the last few percent is where all
the operational pain lives.`,
    },
    {
      id: 'm7-l1-q8',
      kind: 'written',
      prompt: md`**Route three scenarios.** For each, state the failure type, the diagnostic test
you would run *first* to confirm it, the intervention you would choose, and one way your choice
could be wrong: (a) a legal-summary tool that is accurate but writes in a chatty, informal register
your clients dislike; (b) an internal assistant that misstates this quarter's org chart; (c) a
classifier built on a 70B model that is accurate but costs $12,000 a month to serve.`,
      rubric: md`**(a) Register/tone.** Likely **Type 3 first, Type 2 if it persists**. Diagnostic:
try two or three prompt revisions with an explicit style guide plus two worked examples, measured
on a held-out set — style problems very often dissolve here. Intervention: prompt work; escalate to
a small LoRA if drift persists across volume. How it could be wrong: the "informality" may be
inherited from the base model's instruct-tuning and prove prompt-resistant, in which case you were
in Type 2 from the start.

**(b) Org chart.** **Type 1.** Diagnostic: paste the current org chart into the context — if it
answers correctly, knowledge was the only gap. Intervention: retrieval from an authoritative
internal source (which also keeps it correct next quarter). How it could be wrong: if the model
*has* the document and still misreads it, the failure is comprehension or retrieval quality, not
knowledge — and fine-tuning still wouldn't be the fix.

**(c) Cost.** **Type 4.** Diagnostic: confirm quality is genuinely acceptable, then profile where
the cost goes (Module 8 / 4.5). Intervention: distil into a much smaller model for this narrow
task, and/or quantize and batch. How it could be wrong: if the small model can't hold the accuracy
bar, you've traded a cost problem for a quality problem — so the distillation must be evaluated
against the same held-out set, not assumed.

Full credit needs all three types correct, a *concrete* diagnostic per scenario (not "test it"),
and a genuine failure mode for each choice.`,
    },
    {
      id: 'm7-l1-q9',
      kind: 'mcq',
      prompt: md`A production system uses retrieval, a small LoRA, and a short prompt together.
What is each layer doing?`,
      options: [
        'Redundancy — three overlapping methods to improve reliability through repetition',
        'Retrieval supplies facts, the LoRA supplies format and tone, the prompt supplies task-specific instructions — each layer handling the failure type it is actually suited to',
        'The LoRA supplies knowledge while retrieval handles formatting edge cases',
        'It is a transitional architecture; a well-trained model would need only the fine-tune',
      ],
      answer: 1,
      explain: md`This is the ladder read correctly: not a tournament with one winner but a division
of labour along the failure types. Option C swaps the two roles — the exact inversion this lesson
exists to prevent. Option D is a common intuition and wrong in a specific way: no amount of
fine-tuning makes facts *updatable*, so any system whose knowledge changes will always want
retrieval alongside.`,
    },
    {
      id: 'm7-l1-q10',
      kind: 'numeric',
      prompt: md`A team estimates 3 weeks of engineering time to build and iterate on a fine-tuning
dataset, at a loaded cost of $4,000 per week, plus $50 of GPU compute. What is the **total** cost,
and what fraction of it is the GPU? (Give the total in dollars.)`,
      answer: 12050,
      tolerance: 500,
      explain: md`$3 \times 4{,}000 + 50 = \$12{,}050$, of which the GPU is $50/12{,}050 \approx
0.4\%$. The compute is a rounding error on the human cost — which is why "fine-tuning is cheap now"
is true about hardware and misleading about projects. The decision rule follows: don't ask whether
you can afford the run, ask whether you're prepared to own the dataset and its retraining for as
long as the product lives.`,
    },
    {
      id: 'm7-l1-q11',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "If the AI isn't good at something, why
don't you just train it more?" Explain: the difference between *not knowing a fact* and *not
behaving the way you want* (use an analogy you invent — a new employee, a musician, a friend
house-sitting), why the fixes are different, what goes wrong if you use the training fix on a
not-knowing problem, and why you should always try the cheap fix first. No jargon without a
kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **The two kinds of "not good enough", made concrete.** A strong analogy: a new employee who is
   brilliant but doesn't know your office's WiFi password (a *fact* — just tell them, and tell them
   again when it changes) versus one who knows everything but writes emails far too casually for
   your clients (a *habit* — that takes coaching and repetition). The kid should be able to sort
   new examples afterwards.
2. **Different fixes for different problems**, stated as a rule: facts you hand over; habits you
   practise into place.
3. **What goes wrong with the mismatch** — coaching someone to *sound* confident about the WiFi
   password without ever telling them the password produces a confident wrong answer, which is
   worse than "I don't know" because now nobody can tell they're guessing. The kid should feel why
   this is *worse*, not merely useless.
4. **Cheapest fix first** — asking more clearly is free and often works, so try it before spending
   three weeks; and you need a way to *check* whether it worked, or you'll never know which fix
   did anything.
5. **Jargon audit:** "fine-tuning," "RAG," "retrieval," "LoRA," "context window" used without
   kid-level translation = partial at best.`,
    },
    {
      id: 'm7-l1-q12',
      kind: 'written',
      prompt: md`**The decision memo.** Pick a real task you would want an LLM to do (yours, or
invent a plausible one). Write the memo you would send before spending any money: the task and what
"good enough" means numerically; how you would build the eval and what's in it; your hypothesised
failure type and the ten-minute diagnostic that would confirm or refute it; the cheapest
intervention you will try first and the measured result that would make you climb the ladder; if
you do climb to fine-tuning, what dataset you would own and who maintains it; and the total cost
including human time.`,
      rubric: md`Grade as a manager deciding whether to fund this.

**Task + numeric bar:** "good enough" must be a *number* on a stated measurement ("≥98% schema
compliance on 500 held-out real requests"), not an adjective.

**Eval design:** real or realistic inputs, held out by source or time (not random — 5.6's
contamination point), enough items for the difference to exceed noise (5.6's binomial arithmetic),
and a scoring method stated.

**Hypothesised failure type + diagnostic:** must name Type 1/2/3/4 and give a *concrete, cheap*
test — the paste-the-fact-in test for Type 1, prompt variants for Type 3.

**Cheapest-first plan with a climb trigger:** an explicit measured threshold that authorises the
next rung. Vague "if it doesn't work well enough" fails this item.

**Ownership:** if fine-tuning is on the table, who owns the dataset, how it gets updated when the
base model or requirements change, and what the regression suite is.

**Total cost including human time**, with the GPU line shown to be the small one.

Full credit = a memo a competent colleague could act on without asking a clarifying question. If
your memo concludes "try a better prompt and measure it," that is a *strong* answer, not a weak one
— most real versions of this memo should end there.`,
    },
  ],
}
