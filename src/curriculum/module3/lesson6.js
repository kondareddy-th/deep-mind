// Module 3, Lesson 6 — Why it lies, why it reasons (Feynman standard; closes Module 3)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm3-l6',
  title: '3.6 Why it lies, why it reasons — runtime behavior from first principles',
  subtitle:
    'Three famous behaviors, one machine: it confidently invents citations, it gets measurably smarter when told to think step by step, and shown three examples of a brand-new task it does the fourth — with frozen weights. Nobody designed any of these. All three fall out of machinery you now fully own. This lesson derives each, then closes the module.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle: three behaviors nobody built

Exhibit (a). Ask an assistant for sources and it may hand you "(Smith et al., 2019)" — plausible
authors, plausible venue, plausible page range. The paper does not exist. The model shows no
hesitation whatsoever.

Exhibit (b). Take a hard word problem. Ask for the answer directly: often wrong. Add one sentence
— "think step by step" — and accuracy jumps, measurably, reproducibly, across models and
benchmarks. The same weights got *smarter* because you asked them to narrate.

Exhibit (c). Invent a task yesterday — say, "map each word to its last letter, doubled." Show the
model three examples. It does the fourth correctly. Its weights are frozen; nothing about the
model changed (3.3's caching proof *depends* on nothing changing). It learned — without learning.

Now the strange part: go looking for the responsible machinery. There is no lying module to blame,
no think-harder flag that sentence could flip, no runtime learning code path. Nobody designed any
of these behaviors, and none of them was in the parts list we assembled across two and a half
modules.

The claim of this lesson — the last of Module 3 — is that all three behaviors **fall out of parts
you already own**: the first from the *objective* (1.4, 1.5), the second from the *architecture*
(2.5, 2.6), the third from a *circuit* (2.3). No new machinery will be introduced. That's the
point: when you can derive a system's most famous behaviors from its blueprint, the ghost stories
are over. Let's derive.

## Behavior one: the confident invention — derived from the objective

Start from what the machine actually optimizes — by reference, not re-derivation. Pretraining
minimizes next-token cross-entropy under the chain-rule factorization (1.4, 1.5): the loss pays
for putting probability on whatever token *actually came next* in the training text. Read that
job description twice and notice two clauses that are **missing**:

1. There is no clause about *truth*. The loss rewards **plausible continuation** — text
   statistically shaped like the training distribution. Truth enters only insofar as true text is
   common text.
2. There is no *abstain* action. Lesson 1.5 said it and now it bites: the softmax emits a
   distribution over 50,257 real tokens that sums to exactly 1 — **there is no "I don't know"
   row** — and the sampler (3.2) must draw one. Every forward pass answers. Refusing to answer is
   not in the action space.

Now set the trap. The document reads: "...as shown in (". What does the trained distribution look
like at that position? Millions of academic PDFs taught it precisely: a surname, then "et al.,",
then a year between about 1990 and 2023. So the machine emits "Smith", " et", " al", ".,", " 2019"
— each token *genuinely high-probability text* at its position. Whether a paper by Smith in 2019
exists is a fact about the world; the model scores **text**. A citation-shaped hole in the
document gets citation-shaped filling, and every token of the filling was, by the only standard
the machine has ever been graded on, *correct*.

So resist the word "malfunction." The model is doing exactly its job; we just wish the job were
different. That reframing matters practically: you cannot debug hallucination out of the sampler
or the cache, because it isn't in them — it's in the objective, which means real fixes live in
*training* (Module 5) and in *systems around the model* (retrieval, verification), not in the
runtime loop.

## The subtle half: the distribution often knows

Here's the twist that makes hallucination a research problem instead of a lost cause. If the model
were equally confident everywhere, you could never tell invention from knowledge. But it isn't.
Ask for something it saw ten thousand times and the next-token distribution is a **spike** —
correct token near 0.9, everything else crumbs. Ask at the edge of its knowledge and the
distribution is a **smear** — top candidate at 0.15, a dozen rivals just behind. The *sentence*
that comes out reads equally fluent either way, because fluency is cheap. But underneath, the
distribution often "knows" it doesn't know — the information is there, in the logprobs, in the
entropy of the smear.

Careful, though: there are two different channels here, and they are not equally trustworthy.
**Channel one:** the distribution itself (logprobs) — often reasonably calibrated, in the concrete
sense that answers emitted with probability ~0.9 are right far more often than answers emitted
with probability ~0.2. (This holds best for *base* models; preference tuning such as RLHF often
makes a model's probabilities noticeably less calibrated, as the GPT-4 technical report showed.) **Channel two:** *asking the model* "are you sure?" — but that reply is
just more generated text, produced by the same must-answer machinery, and it is empirically a
worse-calibrated channel (trained habits like sounding helpful contaminate it). Flag planted
honestly: measuring what a model knows — uncertainty quantification, calibration — is an active
research field, not a solved checkbox.

One practical consequence you can use today, and which we'll design properly in a ponder:
**resample**. Ask the same question five times at temperature ~1 (3.2: sampling proportional to
the distribution). A spike gives the same answer five times; a smear scatters. Consistency probes
the distribution's shape from outside — a poor man's logprob reader, and a real hallucination
detector used in real pipelines.
`,
    },
    {
      type: 'ponder',
      question: md`You ask the model "What year was that paper published?" and it answers "2019."
You follow up: "Are you *certain*, or are you guessing?" It replies "I'm certain." Can a model
know whether it knows? Take the question seriously — what would "knowing that it knows" require of
the machinery, and which parts of that requirement does it actually have?`,
      answer: md`Split the question in two, because the honest answer is "partially — through one
channel, and not the one you just used."

**The channel that partially works:** the next-token distribution. When knowledge is solid, the
distribution at the answer position is sharp; when it isn't, it's diffuse. That's real,
measurable self-knowledge of a kind — logprobs are often decently calibrated, and reading them (or
probing them via resampling) genuinely separates many spikes from smears.

**The channel you used, which is worse:** the verbalized reply. "I'm certain" is *generated
text* — produced by the same no-abstain, must-continue machinery as everything else, shaped by
training toward pleasant, assistant-flavored answers. Nothing forces those words to reflect the
distribution's actual sharpness, and empirically they track it poorly.

**What full self-knowledge would require, and what's missing:** a lookup — "do my weights contain
this fact?" — and no such operation exists. The parameters are not an indexed database (there is
no directory of facts to consult); any introspective report is itself a plausible-continuation
product. So: the machine contains real uncertainty information, lacks the ability to reliably
*report* it in words, and cannot query itself at all. Making these three statements precise — and
building models that can honestly say "I don't know" — is an open research field, which is part of
why you're training to enter it.`,
    },
    {
      type: 'example',
      title: 'two distributions, one confident voice — with the numbers',
      md: md`
The same question shape, two states of knowledge, everything computed.

**Case A — the model "knows" (saw it constantly in training).** At the answer position, the
distribution is a spike: $p(\text{1997}) = 0.92$, with the rest crumbs. Sample the answer 5 times
at temperature 1:

- Expected number of samples saying 1997: $5 \times 0.92 = 4.6$ — essentially all five.
- Probability all five agree on it: $0.92^5 \approx 0.66$, and near-unanimity is overwhelmingly
  likely.

**Case B — the edge of knowledge.** The distribution is a smear: $p(\text{2014}) = 0.14$,
$p(\text{2015}) = 0.12$, $p(\text{2016}) = 0.11$, and a long tail. Five samples at temperature 1:

- Expected number agreeing on even the *most likely* year: $5 \times 0.14 = 0.7$ — you'll likely
  see four or five *different* years.
- Probability all five agree on 2014: $0.14^5 \approx 0.00005$ — one in twenty thousand.

Now the trap: **greedy decoding hides all of this.** At temperature 0 (3.2), Case B outputs
"2014" every single time — argmax of a smear looks exactly as decisive as argmax of a spike. The
fluent sentence "It was published in 2014." carries no trace of the 0.14. The uncertainty
information exists, but it lives in the *distribution*, and the moment you collapse to one token
you've thrown it away. Resampling at temperature ~1 is how you get it back from outside; logprobs
are how you read it directly when the API offers them.
`,
    },
    {
      type: 'ponder',
      question: md`A model tells you a specific historical date, and you have no reference book at
hand. Using only the model itself — no logprobs, no internet — design the experiment that
distinguishes "retrieved fact" from "confabulated filler." What do you vary, what do you hold
fixed, what does each outcome mean, and where does the experiment mislead you?`,
      answer: md`**The design:** ask the question about five times at temperature ~1 — *not* at
temperature 0, and that choice is the heart of the experiment: greedy decoding collapses spike
and smear alike into one confidently repeated answer, destroying the very signal you're after,
while temperature ~1 samples in proportion to the distribution (3.2), so agreement statistics
expose its shape. Then *rephrase* the question two or three ways and repeat — a genuinely
memorized fact should survive changes of surface form, while confabulation often clings to one
phrasing's statistical neighborhood.

**Reading the result:** the same date, across samples *and* rephrasings → a sharp distribution —
likely retrieved (the example's arithmetic: a 0.9-spike goes five-for-five with probability
$0.9^5 \approx 0.59$). Scattered dates → a smear — the model is sampling plausible filler, and
each draw lands somewhere else ($0.2^5 \approx 0.0003$ for unanimity). You have measured
distribution sharpness from outside the black box.

**Where it misleads:** stability proves *sharpness*, not *truth* — a confidently memorized
falsehood (a date wrong in a thousand training documents) samples with perfect consistency. And
some questions scatter innocently, when several granularities are all correct ("1997" vs "the
late nineties"). The probe detects confabulation; it does not certify facts. For that you need
sources outside the model — which is why retrieval systems exist, and why this experiment, cheap
as it is, is a real tool in real evaluation pipelines rather than a solved-problem trophy.`,
    },
    {
      type: 'text',
      md: md`
## Behavior two: thinking out loud — derived from the architecture

Now derive exhibit (b), and you need exactly two facts, both already yours.

**Fact 1 — the fixed budget (2.6).** One token = one forward pass = one trip through the same
~32 layers. No loops, no recursion, no "dwell on this one longer." The architecture spends an
*identical* amount of sequential computation on every token, whether it's the "the" in a greeting
or the final digit of a hard calculation. Width is enormous — millions of parallel multiplications
per layer — but **serial depth is fixed at ~32 steps**, and hard problems are hard precisely in
the serial direction: step 7 needs step 6's result, and no amount of parallel width substitutes
for a step that must *wait* for another.

**Fact 2 — the stream dies (2.5, 2.6).** The residual stream — the model's rich working state,
thousands of numbers per position, refined layer by layer — is *discarded* when the pass ends. What
survives into the next pass? Exactly one thing: **which token was emitted.** (The KV cache
persists within the call, but 3.3 proved every cached number is a recomputable function of the
visible tokens — that's *why* caching is exact — so the cache carries no information beyond the
tokens themselves.) Between passes, the model's entire state of mind is compressed through a
choice among 50,257 symbols: about 16 bits.

Hold both facts and the trick derives itself. A problem needing 500 dependent steps cannot fit in
one 32-layer pass — the serial budget is simply too small. The **only** way the machine can get
more sequential computation is *more forward passes*, and the only way to carry an intermediate
result from one pass into the next is to **write it into the document**, where attention reads it
back on every subsequent pass. When the model emits "17 × 20 = 340," it is not showing work for
your benefit. It is *storing the number 340 in the only memory it has* — the page. Chain-of-thought
is not a prompting folk remedy; it is the architecture's missing recurrence, reinvented through
the output channel. **Writing is the model's working memory.**

Price the purchase. An instant answer: 1 pass ≈ 32 sequential layer-steps of thinking, total. A
1,000-token chain: $1{,}000 \times 32 = 32{,}000$ sequential layer-steps, each pass reading all
the intermediates written so far — a **1000× purchase of serial depth**, bought with tokens and
paid for in decode time and KV cache (3.3, 3.4: thinking out loud is not free — it's more of the
memory-bound loop).

Two honest flags before this hardens into dogma. **Faithfulness is contested:** the visible chain
is text the model *conditions on*, not a certified printout of its internal computation. Models
sometimes reach correct answers via wrong-looking chains, and wrong answers via impeccable-looking
ones; whether the stated reasoning is the *causal* reasoning is an open research question — read
chains as evidence, not as introspection. **And the industrial version:** reasoning models
(o1/R1-style) are this insight taken seriously at scale — models trained with reinforcement
learning to produce long, effective chains before answering. That story is Module 5's.
`,
    },
    {
      type: 'example',
      title: 'buying serial depth with tokens — a multiplication, bookkept',
      md: md`
Ask for $17 \times 24$ **instantly**: the answer token must be produced by a single forward pass —
all the partial products and carries somehow squeezed into one 32-layer trip. For small
multiplications, trained models often manage it (32 layers of width is a lot of circuit). Scale
the problem up and single-pass accuracy falls off a cliff: an 8-digit multiplication has a long
chain of carries, *each dependent on the previous one* — a serial chain longer than 32, and the
budget is a hard wall. Sequential steps do not compress into parallel width.

Now let it **write**:

    17 × 24
    = 17 × 20 + 17 × 4
    = 340 + 68
    = 408

That's ~25 tokens, so ~25 forward passes: $25 \times 32 = 800$ sequential layer-steps — a **25×
serial budget** for the same question. And watch the memory mechanics, because this is the deep
part: when the pass that computes "$340 + 68$" runs, the 340 is not held in any hidden state —
that died with an earlier pass (Fact 2). The 340 exists **on the page**, and attention reads it
back into the computation (2.2). Each line is simple enough to fit inside one pass's fixed budget;
the *page* strings the passes into a long serial computation. Fixed hardware, adaptive-depth
compute — the scratchpad converts one into the other.

That is the whole trick of chain-of-thought, and you have now bookkept it down to the layer-step.
`,
    },
    {
      type: 'ponder',
      question: md`Here's an empirical finding that seems to break the story: chain-of-thought
often improves the final answer *even when the written chain contains an error* — a botched
intermediate number, a mislabeled step. If the chain were simply "the computation, printed," an
error should poison everything downstream. Why does it often help anyway?`,
      answer: md`Because the chain is doing at least two jobs, and only one of them is arithmetic.

**Job one — serial compute:** every token of chain, right or wrong, buys another forward pass
(another 32 layer-steps). Much of the benefit is simply *more sequential computation happening*,
and that survives local errors in the transcript.

**Job two — self-conditioning:** the chain steers the model into the right *distributional
neighborhood*. Text that looks like a careful worked solution is, in the training distribution,
far more likely to be followed by a correct final answer than text that looks like a blurted
guess. By writing structured steps, the model conditions its own future passes on
worked-solution-shaped context — a benefit of *form*, partly independent of each line's content.

**And the caveat that dissolves the paradox:** the visible chain is not necessarily the causal
computation (the faithfulness problem). The model conditions on the chain; it is not *executing*
it like an interpreter executes code. A wrong intermediate line can sit in a context that still,
in aggregate, steers the final-answer distribution to the right place.

Keep the two readings separated like a researcher: the chain as *compute* (passes bought — solid,
derivable) and the chain as *explanation* (contested, actively researched). Conflating them is one
of the commonest errors in public discussion of these models — and now not one of yours.`,
    },
    {
      type: 'text',
      md: md`
## Behavior three: learning without learning — cashing lesson 2.3

Exhibit (c), the eeriest of the three. The prompt:

    cheese → fromage
    dog → chien
    house → maison
    apple →

The model outputs "pomme." Now remember what did *not* happen: no gradient ran, no weight moved —
the parameters are bit-identical before and after (3.3's freeze proof leaned on exactly this).
Where did the "learning" happen?

You already met the responsible circuit. Lesson 2.3 found **induction heads**: attention circuits
implementing "where has something like the current situation appeared before? — go there, see what
came next, predict that." On plain text they complete literal repeats ("...Harry" after an earlier
"Harry Potter" predicts "Potter"). But the matching runs in learned feature space, so it
generalizes fuzzily — and look at what a few-shot prompt *is*: a **pattern**, [A → B], [A → B],
[A → B], [A → ... The current situation ("apple →") resembles three earlier situations; the
circuits find them, see what followed (a French translation of the left-hand word), and extend the
pattern. Pattern-completion over the context, exactly the machinery of 2.3, pointed at a prompt
*deliberately shaped like a pattern*.

So in-context "learning" is learning-shaped behavior with **zero weight updates**: the task
knowledge lives in *attention over the prompt* — in activations, not parameters — which is why it
evaporates the instant the context does (3.5: nothing persists between calls). You "taught" it
nothing; you *showed* it a pattern it is architecturally disposed to continue.

This mechanistic reading makes a testable prediction, and the empirical record — flagged honestly
as empirical, with variation across tasks and models — backs it: **format consistency often
matters about as much as label correctness.** Few-shot prompts with deliberately *wrong* labels
but consistent formatting often retain a surprising share of the benefit; scrambling the format
while keeping labels correct often hurts more. That is exactly what you'd expect from
pattern-matching machinery locking onto structure — and very hard to explain if in-context
learning were secretly gradient descent on the examples' content.

## The honest limits inventory

Close the module the way a researcher closes a lab notebook — by writing down what the machine
*cannot* do, each limit already derived:

- **Nothing persists across calls** (3.5). No experience accumulates. The thousandth conversation
  leaves the model exactly as the first found it; only retraining (Module 5) changes the machine.
- **It cannot inspect its own weights.** "Do you know X?" triggers no lookup — there is no index
  over billions of parameters, no query operation from inside. The reply is *generated text*,
  subject to everything in this lesson; introspection is confabulation-prone for the same reason
  citations are. Treat model self-reports about its own knowledge and reasoning as text to be
  tested, never as testimony.
- **Sycophancy** — a teaser with a mechanism-shaped hole: models tuned on human approval learn
  that *agreeing* pleases, so they drift toward telling you what you seem to want to hear. Why
  training does that, and what it costs, is Module 5's opening act.

## What you now own — Module 3, whole

Six lessons ago, "type a message, get a reply" was a black box. Trace it now, end to end, and
watch every lesson click into place:

You type. The app serializes your whole conversation into one costume-wearing document (3.5). The
tokenizer chops it into ~50,000-symbol ids (3.1). Prefill sweeps the document in parallel and
fills the KV cache (3.3). Then the loop: one fixed ~32-layer forward pass (2.6) reads the cache
and emits a distribution; temperature shapes it and the sampler draws (3.2); the token streams to
your screen the instant it's minted — the typing effect is the computation (3.5) — at a speed set
by memory bandwidth, not arithmetic (3.4); the drawn token joins the document and the loop turns
again, until the sampler draws the end-of-turn token and the runtime halts (3.5). And the famous
behaviors riding on top are not extra features: the confident inventions fall out of a no-abstain
objective (this lesson, from 1.4/1.5), the step-by-step smarts fall out of buying serial depth
with tokens (this lesson, from 2.5/2.6), the few-shot learning falls out of induction circuits
reading the prompt (this lesson, from 2.3).

A keystroke to a reply, with **no magic left anywhere in the pipeline**. That was Module 3's
promise, and it's now yours to keep.

One machine, though, is one user. Next, Module 4 — the machine room: what it takes to run this
loop for a planet. GPUs by the rack, batching strangers' tokens together, splitting one model
across many chips, and the economics of a token factory — where 3.4's bandwidth wall stops being
a lesson and starts being a budget.
`,
    },
  ],
  questions: [
    {
      id: 'm3-l6-q1',
      kind: 'mcq',
      prompt: md`A model asked for sources outputs "(Smith et al., 2019)" — no such paper exists.
Mechanically, the best description of what happened is:`,
      options: [
        md`A malfunction: the model was trained to be accurate, and this is that training failing under load`,
        md`The model is doing exactly its trained job: the objective rewards plausible continuation, a citation-shaped hole gets citation-shaped filling, and no abstain action exists — softmax must distribute all its probability over real tokens`,
        md`Its retrieval database returned a corrupted entry for that citation`,
        md`Its training data contained mostly fabricated citations, and it memorized them`,
      ],
      answer: 1,
      explain: md`Cross-entropy (1.5) pays for plausible next tokens; truth has no clause and "I
don't know" has no row in the softmax, so every pass must answer (and the sampler must draw).
Option A tempts most because it *is* a failure by our standards — but calling it a malfunction
points the debugger at the wrong layer: the runtime executed flawlessly, and the fix lives in
training objectives and surrounding systems, not in the loop. Option C invents machinery: a bare
LLM has no database — parameters are not a lookup table. Option D gets it backwards: real
citations abound in training data, and their *statistical shape* is precisely what the model
reproduces so well — that's the problem.`,
    },
    {
      id: 'm3-l6-q2',
      kind: 'mcq',
      prompt: md`During generation, between one forward pass and the next, what information
actually carries forward?`,
      options: [
        md`The full residual stream at every layer, preserved for the next pass`,
        md`Only which token was emitted — the residual stream is discarded, and the KV cache merely stores each past token's recomputable K/V (a deterministic function of the visible tokens)`,
        md`The attention pattern from the previous pass, reused as a template`,
        md`A learned hidden summary vector, updated after each pass`,
      ],
      answer: 1,
      explain: md`The stream dies at the end of every pass (2.5/2.6); the model's entire state of
mind funnels through one choice among ~50,257 tokens — roughly 16 bits. Option B's KV clause is
why the tempting objection fails: yes, the cache persists within a call, but 3.3 proved cached K/V
are exact functions of the visible tokens (that's *why* caching is bit-exact), so they carry zero
information beyond the tokens themselves. This bottleneck is the entire reason chain-of-thought
works: if you want a number to survive into the next pass, you must *write it down*. Options C and
D describe machinery (pattern reuse, recurrent state) that transformers specifically do not have —
D is essentially an RNN, the architecture transformers replaced.`,
    },
    {
      id: 'm3-l6-q3',
      kind: 'numeric',
      prompt: md`A 48-layer model writes a 500-token chain of thought before answering. Roughly
how many **sequential layer-steps** of computation did the chain buy? (Each token = one full
forward pass.)`,
      answer: 24000,
      tolerance: 2000,
      explain: md`$500 \times 48 = 24{,}000$ sequential layer-steps, versus 48 for an instant
answer — a 500× serial-depth purchase. Paid for, remember, in decode time and KV cache (3.3/3.4):
each of those 500 passes is another turn of the memory-bound loop. Reasoning models make exactly
this trade at industrial scale — seconds of visible "thinking" are thousands of passes being
bought.`,
    },
    {
      id: 'm3-l6-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall — why the model must think on paper.** Starting from
exactly two facts — (a) one token = one forward pass through a fixed ~32-layer stack, no loops
(2.6); (b) the residual stream is discarded when a pass ends (2.5) — derive: (1) why some problems
cannot be solved in a single pass, no matter how wide the layers; (2) why emitting intermediate
tokens is the *only* way the model can extend its sequential computation, including why the KV
cache doesn't count as extra memory; (3) the size of the cross-pass information bottleneck in
bits, roughly; (4) the serial-depth arithmetic for a 1,000-token chain on a 32-layer model.`,
      rubric: md`**(1) Serial wall:** a pass offers ~32 *sequential* steps; a problem whose
dependency chain is longer (step $k$ needs step $k{-}1$'s result — carries in arithmetic, nested
inference) cannot fit, because parallel width cannot substitute for a step that must *wait*.
Fixed depth = hard ceiling on serial computation per token.

**(2) Only exit:** more sequential compute requires more passes; but (b) says no internal state
survives a pass, so an intermediate result survives *only* if written into the document, where
attention reads it back next pass. The KV cache is not a loophole: 3.3 proved cached K/V are
deterministic functions of the visible tokens (which is exactly why caching is bit-exact), so the
cache stores recomputable bookkeeping, not information beyond the tokens. Hence: emitted tokens
are the sole carrier — writing is the working memory.

**(3) Bottleneck:** one token from a ~50,257-symbol vocabulary ≈ $\log_2 50{,}257 \approx 15.6$
— call it ~16 bits per pass, versus thousands of numbers of discarded residual stream.

**(4) Arithmetic:** $1{,}000 \times 32 = 32{,}000$ sequential layer-steps vs 32 instantly — a
~1000× purchase of serial depth.

"Nailed it" requires the derivation to *flow from (a) and (b)* — a recalled slogan ("CoT gives
more compute") without the KV-cache exclusion and the bottleneck argument is partial credit at
best. Bonus for the honest caveat: this derives why chains *can* help; whether a given written
chain is the causal computation (faithfulness) is a separate, open question.`,
    },
    {
      id: 'm3-l6-q5',
      kind: 'mcq',
      prompt: md`Why does adding "think step by step" measurably improve accuracy on hard
problems?`,
      options: [
        md`The phrase signals politeness, which activates a more careful mode learned in training`,
        md`The instruction lets the model allocate more layers of computation to each individual token`,
        md`Each emitted token buys another full forward pass, and written intermediates persist in the context where attention can read them back — the chain converts fixed per-token depth into a long serial computation`,
        md`Longer answers are more likely to contain the right answer somewhere by chance`,
      ],
      answer: 2,
      explain: md`The architecture's budget is fixed: ~32 layers per token, always, no loops
(2.6) — which is exactly why option B, the most tempting one, is wrong: there is no mechanism for
"more layers per token"; variable serial compute can *only* come from more tokens. The chain is
the model's working memory (the residual stream dies between passes) plus purchased passes. Option
A mistakes a correlation for a mechanism — no "careful mode" exists in the machinery. Option D
fails on the evidence: the *final answer* improves, graded alone, and structured chains beat
equally long padding — length per se is not the active ingredient; passes-plus-written-state is.`,
    },
    {
      id: 'm3-l6-q6',
      kind: 'numeric',
      prompt: md`**Fermi — the price of thinking out loud.** A 32-layer model answers instantly:
one forward pass. The same model instead writes a 1,000-token chain of thought first. Roughly what
is the **ratio** of sequential layer-steps in the chain-of-thought case to the instant case? (Do
it on paper; generous tolerance.)`,
      answer: 1000,
      tolerance: 400,
      explain: md`Chain: $1{,}000 \times 32 = 32{,}000$ layer-steps. Instant: $32$. Ratio:
$32{,}000 / 32 = 1{,}000\times$ — and notice the layer count cancels: the ratio is just the token
count. Every token of chain is another full trip through the machine. This 1000× is the entire
economic logic of reasoning models: sellers of "thinking time" are selling you forward passes,
priced per output token — which you can verify on any API pricing page.`,
    },
    {
      id: 'm3-l6-q7',
      kind: 'mcq',
      prompt: md`Shown three examples of a brand-new task in the prompt, the model performs the
fourth correctly — with frozen weights. Where does the "learning" live?`,
      options: [
        md`In temporary weight updates that are rolled back when the conversation ends`,
        md`In attention over the prompt: induction-style circuits (2.3) locate earlier instances of the current pattern and extend it — the parameters never change`,
        md`In the KV cache, which stores the learned task and persists it to your next conversation`,
        md`In a fast fine-tuning pass the API runs behind the scenes before responding`,
      ],
      answer: 1,
      explain: md`Few-shot examples form a pattern — [A → B] repeated — and 2.3's induction
machinery ("find where something like now happened before; predict what followed") extends it,
fuzzily, in learned feature space. No gradient runs; the knowledge lives in *activations*, not
parameters, and evaporates with the context (3.5). Option A tempts because researchers sometimes
*describe* attention as implementing something gradient-like — but that's a mathematical analogy;
no weights move (3.3's exactness proof depends on it). Option C fails twice: the cache stores
recomputable K/V, not "knowledge," and it dies at the end of the call — nothing persists to your
next conversation. Option D invents infrastructure that would make responses minutes long and
astronomically expensive.`,
    },
    {
      id: 'm3-l6-q8',
      kind: 'written',
      prompt: md`**Predict the experiment.** Your labmate believes in-context learning is
"basically gradient descent on the examples in the prompt." You believe it's 2.3's
pattern-completion machinery. Design the discriminating experiment: few-shot prompts where you
independently vary (i) label correctness (right vs deliberately wrong labels) and (ii) format
consistency (uniform vs scrambled example formatting). State each hypothesis's prediction for all
four cells, what the empirical record tends to show, and what you'd honestly caveat.`,
      rubric: md`**Design:** a 2×2 — [correct/wrong labels] × [consistent/scrambled format] —
same task, same model, measure accuracy on held-out queries in each cell.

**Gradient-descent hypothesis predicts:** label correctness dominates — wrong labels should
actively *teach the wrong mapping* and crater performance in both wrong-label cells; formatting
is cosmetic.

**Pattern-completion hypothesis predicts:** format consistency dominates — the machinery locks
onto the [input → output] *structure*; wrong-but-consistently-formatted examples still teach the
pattern's shape (task identity, slot structure), so much of the benefit survives; scrambled
format disrupts the very pattern induction circuits need, hurting even with correct labels.

**Empirical record:** famously (and counterintuitively), randomized labels with consistent format
often retain a large share of few-shot benefit, while format disruption is costly — favoring
pattern-completion.

**Required caveats:** results vary substantially by task, model scale, and metric (some tasks
show real label sensitivity — the mechanisms likely coexist); "pattern-completion" itself is a
mechanistic hypothesis with evidence (2.3), not a closed case; flag the whole area as active
research.

Full credit = all four cells predicted under both hypotheses, the empirical tendency stated
correctly, and at least one honest caveat. Partial only if the answer merely recalls "labels
don't matter" without the discriminating-design logic.`,
    },
    {
      id: 'm3-l6-q9',
      kind: 'numeric',
      prompt: md`A model is unsure: at the answer position, the correct year has probability 0.2
(the rest of the mass is smeared over rivals). You sample 5 independent answers at temperature 1.
What is the **expected number** of samples that give the correct year?`,
      answer: 1,
      tolerance: 0.3,
      explain: md`$5 \times 0.2 = 1$ — expect one hit and four scattered misses. Read as an
experimentalist: seeing five different answers across five samples isn't the model "being
broken"; it's the diffuse distribution showing itself, one draw at a time (3.2). Agreement counts
are a window onto distribution sharpness — which is exactly why resampling works as a
hallucination probe.`,
    },
    {
      id: 'm3-l6-q10',
      kind: 'numeric',
      prompt: md`Now the confident case: the correct answer holds probability 0.9. What is the
probability (as a decimal) that **all 5** independent samples at temperature 1 agree on it —
i.e., $0.9^5$?`,
      answer: 0.59,
      tolerance: 0.06,
      explain: md`$0.9^5 \approx 0.59$ — versus $0.2^5 = 0.00032$ for the diffuse case: unanimity
is roughly **1,800 times more likely** when the distribution is sharp. That separation is the
entire statistical engine behind consistency-based hallucination detection: you never see the
logprobs, but five agreeing samples are damning evidence of a spike, and five scattered ones of a
smear. (Note the honest limit: a spike proves *confidence*, not *truth* — confidently memorized
falsehoods sample consistently too.)`,
    },
    {
      id: 'm3-l6-q11',
      kind: 'written',
      prompt: md`**Design the probe.** You need a black-box procedure (no logprob access) that
classifies a model's answer to a factual question as "likely retrieved" vs "likely confabulated."
Specify: (1) the full protocol — sample count, temperature and *why that temperature* (3.2),
rephrasings and why; (2) the decision rule; (3) the mechanism — why consistency tracks
distribution shape; (4) two honest failure modes.`,
      rubric: md`**(1) Protocol:** ask the question ~5 times at temperature ≈ 1 — *not* 0,
because greedy decoding collapses spike and smear alike to one repeated answer, hiding exactly
the signal sought (3.2: temperature ~1 samples in proportion to the distribution, exposing its
shape); additionally rephrase the question 2–3 ways (a memorized fact should be robust to
surface form; confabulation is often anchored to one phrasing's statistical neighborhood).

**(2) Decision rule:** same answer across (nearly) all samples *and* all rephrasings → likely
retrieved/memorized. Answers scatter across samples or flip under rephrasing → likely
confabulated — the model is drawing from a diffuse "plausible filler" distribution.

**(3) Mechanism:** sampling at temperature 1 makes agreement statistics a direct probe of
sharpness — e.g. a 0.9-spike yields unanimity with probability $0.9^5 \approx 0.59$, a 0.2-smear
with probability $0.2^5 \approx 0.0003$. Consistency is the distribution's shape, observed from
outside.

**(4) Failure modes (any two):** confidently memorized *falsehoods* — stable and wrong (stability
proves sharpness, not truth); questions with several legitimately correct phrasings/granularities
(1997 vs "the late 90s") that mimic scatter without confabulation; cost — the probe multiplies
inference spend ~5–15×; distributions sharpened artifactually (e.g. an answer copied from the
prompt itself).

Full credit requires the temperature justification in (1) — it's the most-missed piece and the
deepest connection to 3.2 — plus a numeric flavor of (3) and two genuine failure modes.`,
    },
    {
      id: 'm3-l6-q12',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old:** "Why does the chatbot sometimes just *make stuff
up*? And why doesn't it say 'I don't know'?" Explain both — what game the machine was trained to
play, why that game has no I-don't-know move, and why made-up answers *sound* so real. Every term
a 12-year-old wouldn't know must be explained in kid-words first, or left out.`,
      rubric: md`Grade the teaching. A "nailed it" answer:

1. **The game:** the machine practiced exactly one game, billions of times — cover the next word
   of real writing and guess it. It got astoundingly good at guessing what *usually comes next*.
2. **No I-don't-know move:** in that game, there is no "pass" button — some word always came
   next, so the machine's only move, ever, is to name its best guesses and pick one. Saying
   "I don't know" was never one of the moves it practiced; the game literally has no such move
   on the board.
3. **Why fakes sound real:** it learned the *shape* of things. A made-up book title has perfect
   book-title shape — that's precisely what all that practice teaches. Sounding right and being
   true are different tests, and the game only ever graded sounding right.
4. **Ideally (bonus):** the machine often *is* less sure when it's making things up — like a
   guesser hesitating between many answers — but its confident-sounding sentences hide the
   hesitation, so you have to test it (ask again differently!) rather than ask it if it's sure.
5. **Jargon audit:** "hallucination," "probability distribution," "softmax," "cross-entropy,"
   "tokens," "sampling," "training objective" unexplained = partial credit at most, regardless of
   correctness. Kid-words or nothing — hiding behind jargon is the exact failure this exercise
   catches.`,
    },
  ],
}
