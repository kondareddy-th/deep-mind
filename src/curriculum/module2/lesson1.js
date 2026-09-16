const md = String.raw

// Module 2, Lesson 1 — Why attention: the problem of frozen meaning
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

export default {
  id: 'm2-l1',
  title: '2.1 Why attention — the problem of frozen meaning',
  subtitle: md`Module 1 ended in triumph: every word a vector, meaning as geometry. Two
innocent-looking sentences bring the whole design down — and the search for the repair leads
through a beautiful failed idea, a telephone game with real arithmetic, and an idle GPU, to the
doorstep of attention.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Module 1 left you holding a genuinely powerful machine. Every token gets a vector, looked up from
a table — $50{,}257$ rows, $12{,}288$ numbers per row, about $617$ million parameters, a number
you computed yourself — arranged so that cheap arithmetic reproduces human judgment about meaning.
Similarity became a dot product. *King − man + woman* landed near *queen*. Be proud of that
machine. Now feed it two sentences:

> I sat on the **bank** of the river.
> The **bank** raised interest rates.

Walk through what happens, slowly, because the failure is instructive. The tokenizer maps "bank"
to the same token id in both sentences — of course it does; it's the same string of letters. The
lookup then hands both sentences the *same row*: the same $12{,}288$ numbers, to the last decimal.
But the first bank belongs near *shore*, *mud*, *heron*; the second near *loan*, *vault*,
*interest rate*. One token, one frozen vector, two incompatible meanings.

Careful — didn't lesson 1.1 show that one vector *can* be near many neighborhoods at once? It did:
*cat* sits near *dog*, near *tiger*, near *cartoon*, and high-dimensional roominess makes that
easy. But those are compatible facets of one meaning, all true simultaneously. The two banks are
*alternatives*: in any given sentence exactly one applies, and the arithmetic downstream needs to
know which. A frozen row can't know — it was carved at training time and merely *copied* at
reading time. So training parks "bank" at a compromise, a blur of river and money. This is
measurably true of classic static embeddings like word2vec: their "bank" vector has respectable
cosine similarity to both the water words and the finance words, and is therefore exactly right
for neither sentence.

And if you suspect polysemy is a corner case — some words have two meanings, tough luck — here is
the second killer, sneakier and more damning:

> dog bites man
> man bites dog

No rare words. No ambiguous senses. The same three tokens, so the table emits the same three
vectors — and if your machine consumes only the *collection* of vectors, a bag of ingredients, the
two sentences are **literally the same input**. Yet one is an ordinary Tuesday and the other is a
headline. Same contents, different meaning: therefore meaning does not live only *in* the tokens.
It lives **between** them — in arrangement, in who did what to whom.

Two independent killers, then. Frozen meaning: one vector per token cannot carry
context-dependent sense. And bag-blindness: whatever machine processes the vectors must care
about **relationships**, not just contents. Both must fall, and this module is the story of what
replaces them.
`,
    },
    {
      type: 'example',
      title: md`one frozen row, two sentences — with coordinates`,
      md: md`
Let's make the disease and the shape of the cure concrete with toy coordinates. Take just two of
the $12{,}288$ dimensions and pretend they mean *river-ness* and *finance-ness*. The frozen table,
forced to serve both sentences, has parked the word at a compromise:

$$\mathbf{v}_{\text{bank}} = (0.5,\; 0.5) \qquad \mathbf{v}_{\text{river}} = (1,\; 0) \qquad \mathbf{v}_{\text{rates}} = (0,\; 1)$$

How river-ish is frozen "bank"? Cosine similarity with the pure river direction:
$0.5 / 0.707 \approx 0.71$. Same with finance: $0.71$. Perfectly, uselessly noncommittal.

Now imagine some operation — never mind yet *how* it works — that, while reading sentence one,
lets "bank" absorb $0.8$ of its important neighbor's vector:

$$\mathbf{v}_{\text{bank}}^{\text{(river sentence)}} = (0.5, 0.5) + 0.8\,(1, 0) = (1.3,\; 0.5)$$

Cosine with the river direction: $1.3 / \sqrt{1.3^2 + 0.5^2} = 1.3/1.393 \approx 0.93$. In the
finance sentence, absorbing $0.8$ of "rates" instead gives $(0.5, 1.3)$ — cosine $0.93$ with
*finance*. One table row, two different working vectors, each decisively in the right
neighborhood. And notice: **nothing in the table changed.** The table still says $(0.5, 0.5)$.
The context-aware vector was *computed fresh, at reading time*, for this sentence only.

Every mystery in this module hides in the two choices we waved our hands over: the operation had
to know **which** neighbor mattered (river, not "the" or "sat") and **how much** ($0.8$, not
$0.1$). Building the machine that makes those choices — from scratch, with parts you already own —
is lesson 2.2's entire job.
`,
    },
    {
      type: 'text',
      md: md`
## Why the fix cannot live in the table

The obvious repair: more rows. Give "bank" several tokens — *bank-riverside*, *bank-financial* —
one embedding each, and let the tokenizer pick. Dictionaries list senses; enumerate them. This
was, roughly, a real research program once, and it fails twice, once embarrassingly and once
fatally.

The embarrassing failure is circularity. The tokenizer runs *before* anything has read the
sentence — it chops raw text into ids. To emit *bank-riverside* it would need to know the sense,
and the sense is exactly what reading the context tells you. The table is consulted before the
context exists. You'd need a context-understanding machine to build the input to your
context-understanding machine.

The fatal failure is arithmetic, and you have already done it. Senses aren't a tidy finite list —
*bank of clouds*, *blood bank*, *bank the fire*, *bank shot*, and every shading between — and
meaning really depends on the *whole configuration* of context. So suppose you tried the honest
version: a table indexed not by word but by word-in-context. Lesson 1.4 priced that table for you:
on the order of $10^{500}$ rows — against roughly $10^{80}$ atoms in the observable universe. Not
expensive. **Impossible.** Context-dependence is combinatorially infinite; no lookup, however
large, enumerates it.

When storage is impossible, you must *compute*. The conclusion is forced, and it is the thesis of
this whole module:

> The fix is not a better table. It is an **operation** — run fresh at reading time, for every
> sentence — that takes each token's frozen vector and **updates it using its neighbors**.

The question becomes: what operation? Honest science looks first at the answer that actually ruled
the field before attention — because its failure is what makes attention's design intelligible.
`,
    },
    {
      type: 'text',
      md: md`
## The pre-attention answer: the relay race

Suppose it's 2015 and you must build the context operation yourself. The natural design — so
natural it dominated the field for years — is: *read the way a reader reads*. Left to right, one
token at a time, keeping a running summary as you go. Concretely: carry one fixed-size **memory
vector**; at each step, feed the machine the old memory and the new token's vector, and it outputs
a new memory. By the end of the sentence, the memory "contains" everything read so far. This is
the **recurrent neural network** (RNN), and give it its due: dressed up with gates (the LSTM), it
powered Google Translate's big 2016 leap and was the state of the art of its era. At short range,
it genuinely works.

Now watch what happens to a fact over *distance*. The memory is rewritten at every single step —
squeezed through the machine again and again, with new tokens fighting their way in each time.
It's a relay race where the baton is the message itself, or the telephone game: each hand-off
preserves *most* of what it received, never all. Say each step preserves $90\%$ of some distant
word's signal — a generous figure. Survival is multiplicative:

$$\underbrace{0.9 \times 0.9 \times \cdots \times 0.9}_{50 \text{ steps}} = 0.9^{50} = e^{50 \ln 0.9} \approx e^{-5.27} \approx 0.0052$$

After fifty tokens, **half a percent** of the signal survives. Not half — half a *percent*. And
$50$ tokens is two ordinary sentences. Consider the classic pronoun test (a *Winograd schema*):

> The trophy doesn't fit in the suitcase because **it** is too big.

When the reader arrives at "it," the word that resolves it — "trophy" — sits seven hand-offs back:
$0.9^7 \approx 48\%$ survives, already a coin flip. In real prose, antecedents and their clues
routinely sit hundreds of tokens back: at $200$ steps, $0.9^{200} \approx 7 \times 10^{-10}$ —
under one part in a *billion*. Long-range dependencies don't degrade gracefully in this design;
they **starve**.

You have met this mathematics before, wearing a different costume. Lesson 1.3: multiply many
numbers smaller than $1$ and the product dies geometrically — *vanishing gradients*. Same theorem,
and the RNN pays it **twice**: forward, as the signal decays across steps, and backward, as the
learning signal decays through the same chain — so the network can't even *learn* to preserve
better. The LSTM's gates are precision engineering to push the retention factor toward $1$, and
they help — but run the demand in reverse and feel how brutal it is: to keep even *half* a signal
alive across $50$ steps you need $0.5^{1/50} \approx 98.6\%$ retention per step; across a thousand
steps, $99.93\%$. Per step. Forever. For every fact worth keeping. Gates buy you range; they do
not repeal geometry.
`,
    },
    {
      type: 'ponder',
      question: md`The RNN's forgetting (a fact fades as reading proceeds) and lesson 1.3's
vanishing gradients (a learning signal fades as it propagates back through layers) *look* like two
different diseases — one strikes at reading time, one at training time. Convince yourself they are
the same theorem. What single mathematical fact underlies both? And given that fact, what are the
only two possible cures — and which one does attention choose?`,
      answer: md`Both are **a quantity forced to traverse a long chain, multiplied by a factor at
every link**. Survival after $k$ links with per-link factor $r$ is $r^k$ — geometric decay —
whether the traveler is a forward-flowing signal (the RNN's memory of "trophy") or a
backward-flowing gradient (1.3's chain rule multiplying layer factors). Same mathematics,
different costume; the RNN even suffers both directions through the *same* chain.

Look at the formula $r^k$ and there are exactly two knobs. **Cure 1: push $r$ to $1$.** That's
the LSTM road (and, for depth, the residual-connection road you'll meet in 2.5) — real
engineering, but $r$ must be nearly perfect *per step, forever*: $98.6\%$ just to keep half over
$50$ steps, and ever closer to $1$ as documents grow. You're fighting the base of an exponential
with finite precision. **Cure 2: pin $k$ at $1$.** Change the wiring so no signal ever traverses
more than one link — then there is nothing to compound: $r^1 = r$, distance drops out of the
formula entirely. That is attention's move. The surprise worth savoring: the cure for forgetting
turns out to be not a better memory but a **shorter path** — it attacks the exponent, not the
base.`,
    },
    {
      type: 'example',
      title: md`the telephone game, measured`,
      md: md`
Thirty kids in a line; kid 1 whispers a message down the chain. Each whisper preserves $90\%$ of
what arrives — an excellent whisperer. Survival is $0.9^k$ after $k$ whispers:

| hand-offs $k$ | survives ($0.9^k$) |
|---|---|
| 1 | $90\%$ |
| 10 | $35\%$ |
| 22 | $10\%$ |
| 50 | $0.5\%$ |
| 200 | about $7$ in $10$ billion |

Feel the shape: it's not a slope, it's a cliff with a long floor. By ten hand-offs, two-thirds is
gone; by fifty, effectively everything. And nothing about this is the kids' fault — replace them
with better whisperers and you delay the cliff, never remove it (you'll compute exactly how
demanding "better" must get in the questions).

Now change the *wiring* instead of the kids. Give kid 51 a direct phone line to kid 1. One hop:
$90\%$ arrives — whether the chain between them was $50$ kids or $50{,}000$. The decay wasn't
"fixed"; it was made irrelevant, because the exponent got pinned at $1$. Hold onto this picture:
it is the entire architectural argument for attention, in a school hallway.
`,
    },
    {
      type: 'text',
      md: md`
## The second disease: one word at a time

Suppose you didn't care about forgetting — short documents only. The relay design has a second,
completely independent disease, and this one is about *speed*.

The recurrence is $\mathbf{h}_t = f(\mathbf{h}_{t-1}, \mathbf{x}_t)$: step $t$'s input includes
step $t-1$'s freshly computed output. To process token $1{,}000$ you must first finish token
$999$, and before that $998$... a dependency chain, irreducibly **sequential** across the
document. No amount of hardware flattens a true dependency chain — ten thousand sprinters do not
finish a relay race faster than the sum of its legs, because each must wait for the baton.

Now recall what lesson 1.2 said a GPU *is*: a factory with tens of thousands of arithmetic units
built to execute one enormous matrix multiplication in a gulp — all rows at once, all columns at
once. The RNN feeds that factory a trickle: one small matmul for step $t$, then a stall while the
result loops back, then another small matmul. The chip idles between sips. Meanwhile, modern
training runs consume on the order of $10^{13}$ tokens — fifteen trillion in one 2024 model's
diet. An architecture whose wall-clock time per document is chained to *sequence length itself*
cannot drink that ocean.

Worse, the two diseases conspire: the standard remedy for forgetting — a bigger, gated memory —
makes each sequential step *heavier*, slowing the already-serial crawl. The design isn't just
imperfect; it is fighting the hardware it runs on.
`,
    },
    {
      type: 'ponder',
      question: md`The forgetting argument smells like a capacity problem: if one memory vector is
too small a suitcase for a whole book, buy a bigger suitcase. Make the memory $10{,}000$
dimensions. A million. Does that fix long-range dependencies? Think *structurally* — what grows
as reading proceeds, and what doesn't — before revealing.`,
      answer: md`It helps the constants and leaves the disease. Watch the mismatch: at position
$t$, the single memory vector must summarize **all $t-1$ predecessors** — its burden grows
*linearly* with position — while its size stays *constant*. Whatever size you buy, there is a
document length that overfills it, and once storage is contested, every rewrite must sacrifice
something old for something new: the retention factor drops below $1$ and geometric decay
returns. Bigger $h$ postpones the cliff; it cannot remove it.

And you pay twice for the postponement: the per-step matrices act on the memory, so their cost
grows like $h^2$ — a $10\times$ bigger memory means roughly $100\times$ more work *per sequential
step*, deepening the throughput disease. The bottleneck was never the suitcase's size; it is that
the design forces **all** history through **one** channel per step. Attention's answer is not a
bigger vector but *more wires*: give every pair of tokens its own direct channel, so no single
vector is ever asked to summarize everything. The fix is plumbing, not capacity.`,
    },
    {
      type: 'text',
      md: md`
## The direct-wiring idea

Every failure above traces back to one design decision: information travels through a **chain**.
So make the opposite decision. Remove the chain. Let every word look **directly** at every other
word — a dedicated wire between each pair of tokens.

Three consequences fall out immediately, and together they are the case for attention:

**1. Distance dies.** Between any two tokens — adjacent, or separated by an entire novel — the
path is now *one hop*. Decay compounds per hop; over one hop, nothing compounds. "It" reaches
"trophy" as easily at $200$ tokens as at $2$. The geometric-decay argument doesn't get beaten; it
gets *evicted* — its exponent is pinned at $1$.

**2. Sequence dies (for computation).** Whether token $j$ matters to token $i$ depends only on
the two tokens' vectors — already sitting in memory, all of them, before any looking begins. No
look waits on any other look, so *all pairs can be computed simultaneously* — and "the same little
operation applied to every pair at once" is precisely the shape lesson 1.2 taught you to recognize
as a **matrix multiplication**. The GPU factory gets fed the one dish it was built to devour. The
whole document, one gulp, during training. (This, as much as accuracy, is why the 2017 paper that
introduced the pure-attention architecture could get away with its swaggering title: *Attention Is
All You Need*. Recurrence wasn't improved. It was abolished.)

**3. You pay for it.** $n$ tokens, a wire per pair: $n \times n = n^2$ wires. Double the context,
quadruple the bill. At the six-token toy scale below, that's $36$ pairs — nothing. At book-length
contexts, that quadratic becomes the central engineering obsession of the entire field. Plant the
flag here; next lesson you'll put brutal numbers on it. The honest slogan of the transformer:
**remove the bottleneck, pay $n^2$ for it.**

One question remains — the only one, and it's the same one Example 1 waved its hands over. With
the wires in place, *what flows along them, and how much*? When "sat" looks at its five neighbors
in "The cat sat on the mat," it should drink deeply from "cat" — a verb hunting its subject — and
barely sip from "the." Some number, per pair, computed from *content*, must set each wire's flow.
Building the machine that computes that number — rejecting the broken designs one by one until
the real mechanism is in your hands — is lesson 2.2. Below is a preview of the finished machine,
just to see it breathe.
`,
    },
    {
      type: 'viz',
      viz: 'attention-teaser',
      caption: md`**A preview, not a lesson**: a finished attention head running on six tokens. The
arcs show each pair's flow strength — computed by the formula
$\text{softmax}(\mathbf{q}\cdot\mathbf{k}/\sqrt{d})$, symbols that will mean nothing today and
everything by the end of lesson 2.2, where you build this machine from scratch. Experiments:
(1) click each of the six tokens in turn and watch where its arcs concentrate; (2) click "sat" —
a verb hunting its subject — and watch it pull hard toward "cat"; (3) click "The" and notice the
articles stay diffuse, arcs spread thin and near-uniform: little to seek, little to offer;
(4) confirm the direct-wiring claim — no arc is penalized for spanning the whole sentence versus
touching a neighbor. Distance has left the building.`,
    },
    {
      type: 'ponder',
      question: md`An objection worth taking seriously: humans read left to right, one word at a
time, carrying a running understanding — suspiciously like an RNN. Isn't human reading an argument
*for* the relay design and against everyone-sees-everyone wiring? Why not?`,
      answer: md`Watch an actual human read — with an eye tracker — and the left-to-right story
dissolves. Roughly one eye movement in seven is a **regression**: a jump *backward* to re-fetch
something earlier. Readers re-read hard sentences, flip back forty pages to check who a character
is, keep a thumb wedged at the map. Human reading is left-to-right *by default* with **random
access on demand** — and the random access is precisely what rescues us when the running summary
fails.

The RNN has the default with no rescue: its past exists *only* as the current memory vector. The
original words are gone — there is no page to flip back to, so whatever the summary dropped is
dropped forever. Attention keeps the whole page open: every token's vector remains reachable, one
hop, at any time. So the honest comparison is not "attention vs. how humans read" — it's that
attention takes the *recovery move* humans deploy when reading gets hard (look back, anywhere,
anytime) and makes it the primitive, applied at every token. Our working memory is famously about
seven items; we invented re-reading to survive it. Attention is re-reading, institutionalized.`,
    },
    {
      type: 'text',
      md: md`
## The map of Module 2

You now hold the problem. Here is how the module solves it, one earned piece at a time:

- **2.2 — the mechanism.** Build the update operation with bare hands: what flows on the wires
  and how much, derived by breaking bad designs until the real formula is yours.
- **2.3 — many heads.** One wiring pattern tracks one kind of relationship; language has many.
  Run several in parallel and watch them specialize.
- **2.4 — word order.** An IOU made honest: direct wiring, taken alone, treats the sentence as a
  *set* — even blinder to order than the bag that "dog bites man" killed! The cure is injected
  separately, and it's cleverer than you'd guess.
- **2.5 — the block.** Attention moves information *between* tokens; a second machine thinks
  *within* each token. Bolt them together, stack the result.
- **2.6 — the whole GPT.** Assemble everything from embeddings to predictions, end to end, and
  the architecture diagram becomes a list of things you built.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **Two killers of the lookup design.** Frozen polysemy — one token, one vector, incompatible
   meanings ("bank"/"bank") — and bag-blindness: identical ingredients, different meaning ("dog
   bites man"/"man bites dog"), so meaning lives partly *between* tokens.
2. **Why no table survives.** Choosing a sense requires context the tokenizer hasn't seen
   (circularity), and word-in-context tables need $\sim 10^{500}$ rows (1.4). Storage being
   impossible, the fix must be an **operation**: update each token's vector from its neighbors,
   fresh, at reading time.
3. **The relay race and its arithmetic.** A fixed-size memory rewritten per step retains $r^k$ of
   a $k$-step-old signal: $0.9^{50} \approx 0.5\%$; half-decay in about seven steps; $98.6\%$
   per-step retention needed just to keep half across $50$. Same geometric mathematics as 1.3's
   vanishing gradients — paid forward *and* backward.
4. **The throughput disease.** Step $t$ waits on step $t-1$: a sequential chain that starves the
   all-at-once matmul hardware of 1.2, at $10^{13}$-token training scale.
5. **The direct-wiring idea.** A wire per pair: distance pinned to one hop (decay evicted),
   all pairs computed at once (GPUs fed), price $n^2$ (flag planted). Remove the bottleneck, pay
   $n^2$ for it.

Next lesson: with the wires justified, you build the machine that decides what flows through them
— and the equation left in your hands will be the most cited formula in modern AI, every symbol
earned.
`,
    },
  ],
  questions: [
    {
      id: 'm2-l1-q1',
      kind: 'mcq',
      prompt: md`A tempting repair for frozen "bank": expand the vocabulary — separate tokens
*bank-riverside* and *bank-financial*, each with its own embedding, chosen by the tokenizer. Why
does this fail as a general cure?`,
      options: [
        md`It would work, but the extra rows would make the embedding table too large to store`,
        md`The tokenizer must pick a token *before* any context is read, yet the sense is exactly what context determines — and shades of meaning-in-context are combinatorial ($10^{500}$-table territory from 1.4), so no finite enumeration covers them; disambiguation must be *computed*, at reading time`,
        md`Word senses are too similar for separate embeddings to be distinguishable in only $12{,}288$ dimensions`,
        md`It works for nouns, whose senses are finite and listed in dictionaries, but fails for verbs`,
      ],
      answer: 1,
      explain: md`The deep failure is **circularity**: emitting *bank-riverside* requires knowing
the sense, knowing the sense requires reading the context, and the tokenizer runs before any
reading happens — you'd need the understanding machine to build its own input. And even granting
an oracle tokenizer, senses shade continuously (*bank of clouds*, *blood bank*, *bank the fire*)
into combinatorially many contexts — the $10^{500}$ wall from 1.4. The distractors tempt for real
reasons: storage (option A) sounds plausible but a few thousand extra rows is a rounding error
next to $617$M parameters; dimensionality (option C) is backwards — 1.1 showed $12{,}288$
dimensions host *millions* of distinguishable directions; and dictionaries (option D) do list
senses, but a list is a lossy editorial cut of a continuum, for nouns and verbs alike.`,
    },
    {
      id: 'm2-l1-q2',
      kind: 'numeric',
      prompt: md`A relay memory preserves $90\%$ of a distant word's signal at each hand-off. What
**percentage** of the signal survives after $50$ hand-offs? (Paper first: $\ln 0.9 \approx
-0.1054$; multiply by $50$; exponentiate. One decimal place is plenty.)`,
      answer: 0.5,
      tolerance: 0.25,
      explain: md`$0.9^{50} = e^{50 \ln 0.9} \approx e^{-5.27} \approx 0.0052$ — about
$\mathbf{0.5\%}$. The trap is that $90\%$ *sounds* high, so intuition predicts "most of it
survives." Geometric decay doesn't care how virtuous the factor sounds — only how many times it
is applied. Fifty applications of a $10\%$ toll leaves half a percent. This is lesson 1.3's
vanishing-multiplication arithmetic, now eating forward-flowing meaning instead of
backward-flowing gradients.`,
    },
    {
      id: 'm2-l1-q3',
      kind: 'mcq',
      prompt: md`Lesson 1.2's GPU is a factory for enormous all-at-once matrix multiplications.
Training an RNN on a $10{,}000$-token document, why can't the GPU parallelize across the
$10{,}000$ positions the way it parallelizes across the rows of a matmul?`,
      options: [
        md`RNN steps contain no matrix multiplications, and GPUs can only multiply matrices`,
        md`Holding $10{,}000$ hidden-state vectors would exceed GPU memory`,
        md`Step $t$'s input includes step $t-1$'s freshly computed memory — a true dependency chain across time, and no quantity of idle arithmetic units can start a step whose input does not exist yet`,
        md`It can — modern GPUs parallelize RNN time steps fine; the sequential bottleneck is a myth about older hardware`,
      ],
      answer: 2,
      explain: md`It's an *ordering* constraint, not an arithmetic shortage. Option A holds a
grain of truth that makes it tempting: each RNN step **does** contain matmuls — but small ones,
forced to run one-after-another because each consumes the previous step's output. Ten thousand
sprinters don't finish a relay faster than the sum of its legs; the baton — the hidden state —
must be handed over. Memory (option B) is trivial: $10{,}000$ vectors is nothing next to the
weights. And option D flatters wishful thinking: no hardware, present or future, flattens a true
data dependency — parallelism requires *independent* work, which the recurrence definitionally
denies. Attention manufactures exactly that independence: every pairwise look depends only on
inputs that already exist, so the whole document collapses into a few giant matmuls.`,
    },
    {
      id: 'm2-l1-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Prove on paper that *any* machine which reads left to
right and carries its entire past in one fixed-size memory vector must lose long-range
information — regardless of how cleverly its update rule is engineered. Structure your argument:
(1) state what the memory must contain by position $t$, and what grows versus what doesn't;
(2) argue that each step's rewrite can preserve only some fraction $r < 1$ of a given old fact —
identify where the pressure on $r$ comes from; (3) derive the survival after $k$ steps and
evaluate it for $r = 0.9$, $k = 50$; (4) name this mathematics and say where in Module 1 you met
it; (5) state precisely which structural feature of direct pairwise wiring escapes your own
argument.`,
      rubric: md`The chain of reasoning, step by step:

1. **Growing burden, constant capacity.** By position $t$ the single vector must encode
   everything still relevant from all $t-1$ predecessors. The burden grows linearly with $t$;
   the vector's size does not grow at all. Any fixed capacity is eventually overfull.
2. **Why $r < 1$.** Each step computes new-memory $= f(\text{old memory}, \text{new token})$ —
   writing fresh information into the *same fixed set of numbers*. Once capacity is contested,
   storing the new necessarily disturbs the old: a given old fact survives a rewrite only
   partially, some average fraction $r < 1$. (Gating — the LSTM — can push $r$ near $1$, but
   with finite capacity and endless arrivals it cannot hold $r = 1$ for everything forever.)
3. **Compounding.** Survival multiplies per rewrite: $r$ after one, $r^2$ after two, $r^k$ after
   $k$ — geometric decay. For $r = 0.9$, $k = 50$: $0.9^{50} = e^{50\ln 0.9} \approx e^{-5.27}
   \approx 0.0052$ — about half a percent.
4. **The twin.** Lesson 1.3's vanishing gradients: a product of many factors below $1$ dies
   geometrically. Same theorem; here it kills the forward signal, there the backward learning
   signal — the RNN pays through the same chain in both directions.
5. **The escape.** The argument needs a *growing exponent* — a path whose length increases with
   distance. Direct wiring pins the path between any pair at one hop: $k = 1$ always, so nothing
   compounds. Bigger memory or better gates attack the base $r$ or the constants; only shorter
   paths attack the exponent.

"Nailed it" requires step 2's capacity-competition justification for $r < 1$ (not merely
asserting decay) *and* step 5 identifying the exponent as the escape hatch. Steps 1–4 without 5
show the disease but not the cure's logic — partial.`,
    },
    {
      id: 'm2-l1-q5',
      kind: 'mcq',
      prompt: md`"dog bites man" and "man bites dog" tokenize to the same three tokens, hence
identical vectors from the embedding table. What does this pair actually *prove* about any
adequate language machine?`,
      options: [
        md`The embedding table needs further training until the dog/man vectors distinguish the two sentences`,
        md`The tokenizer should insert subject and object marker tokens so the bags differ`,
        md`Part of meaning lives *between* tokens — in arrangement and relationships — so the machine must compute over pairs and positions, not merely over the collection of vectors`,
        md`Little: a bag-of-words model treats them alike, and such reversal pairs are rare enough in real text to ignore`,
      ],
      answer: 2,
      explain: md`Option A is logically impossible, which is why it's worth staring at: a machine
whose input is only the multiset of vectors receives *literally identical inputs* for the two
sentences — no training of the table can make one input produce two outputs. Option B is a real
historical instinct (hand-engineer the missing feature), but the markers would have to be placed
by something that already parses who-did-what-to-whom: circular. Option D tempts because clean
reversal *pairs* are rare — yet every ordinary sentence's meaning hinges on role assignment; the
pair is merely the cleanest exhibit of a universal fact. And keep the honest IOU in view: direct
pairwise wiring *alone* is also order-blind — the machinery that injects word order arrives in
lesson 2.4.`,
    },
    {
      id: 'm2-l1-q6',
      kind: 'numeric',
      prompt: md`At $90\%$ retention per hand-off, after roughly how many relay steps has **half**
the original signal died? ($\ln 0.5 \approx -0.693$, $\ln 0.9 \approx -0.105$.)`,
      answer: 6.6,
      tolerance: 0.8,
      explain: md`Solve $0.9^k = 0.5$: $\;k = \ln 0.5 / \ln 0.9 \approx 0.693/0.105 \approx 6.6$ —
call it seven hand-offs. **Seven.** That's the distance from "trophy" to "it" inside a single
sentence, and already the halfway point of oblivion. The moral: geometric decay is savage even at
"high" retention, on distances you'd never call long-range.`,
    },
    {
      id: 'm2-l1-q7',
      kind: 'numeric',
      prompt: md`You demand that at least **half** of a signal survive a $200$-token gap — a
realistic antecedent distance in prose. What per-step retention rate $r$ does the relay design
require, as a **percentage**? (Solve $r^{200} = 0.5$ on paper: take logs, divide, exponentiate.
Two decimals.)`,
      answer: 99.65,
      tolerance: 0.2,
      explain: md`$r = 0.5^{1/200} = e^{\ln 0.5 / 200} = e^{-0.693/200} = e^{-0.00347} \approx
0.99654$ — the memory must be $\mathbf{99.65\%}$ faithful *per step, at every one of the 200
steps*, just to deliver a coin-flip's worth of signal. Compare the lesson's figures: $98.6\%$ for
a 50-step gap, $99.93\%$ for a 1000-step gap. The required perfection marches toward $100\%$ as
documents grow — a design that demands ever-more-flawless components to stand still is a design
fighting an exponential, and losing.`,
    },
    {
      id: 'm2-l1-q8',
      kind: 'numeric',
      prompt: md`**Fermi estimate (paper first):** a $1{,}000{,}000$-token book. An RNN connecting
the last word to the first must traverse roughly one dependency step per token — about $10^6$
sequential hand-offs. In a transformer, any token reaches any other in **one** attention hop, and
the network's total sequential depth is just its stack of roughly $100$ layers. Estimate the
**ratio** of the RNN's chain length to the transformer's depth. (Order of magnitude is what
matters; tolerance is generous.)`,
      answer: 10000,
      tolerance: 5000,
      explain: md`$10^6$ hand-offs versus $\sim 10^2$ layers: a ratio of about
$\mathbf{10{,}000\times}$. And the comparison is even more lopsided than the ratio suggests: each
of the RNN's million steps applies another decay factor *and* must wait for its predecessor in
wall-clock time, while each transformer layer computes all its pairwise looks simultaneously as
matmuls — the price being the $n^2$ pair count, which you'll weigh properly in lesson 2.2.
Fermi habits like this — chain length versus depth, before any benchmark — are how architecture
arguments are actually settled at the whiteboard.`,
    },
    {
      id: 'm2-l1-q9',
      kind: 'mcq',
      prompt: md`The relay's decay law is $r^k$: per-step retention $r$, path length $k$. Which
statement best describes attention's cure?`,
      options: [
        md`It learns a better update rule, pushing $r$ far closer to $1$ than an LSTM's gates can manage`,
        md`It changes the exponent, not the base: every pair of tokens sits one hop apart, so $k = 1$ and nothing compounds — at the price of $n^2$ pairwise channels`,
        md`It compresses history more efficiently, so the same fixed-size memory vector holds far more of the past`,
        md`It reads the text in both directions at once, so decay from the left is repaired by the pass from the right`,
      ],
      answer: 1,
      explain: md`The move is structural, not incremental: pin the path length at one hop and
distance drops out of $r^k$ entirely — decay dies when compounding dies. Option A is the LSTM
road, genuinely useful but doomed to chase $r \to 1$ against ever-longer documents ($99.65\%$ for
$200$ steps, $99.93\%$ for $1000$...). Option C misreads the design at its root: attention doesn't
compress the past into one vector *at all* — it abolishes the single-summary bottleneck and keeps
every token's vector reachable. Option D tempts because bidirectional RNNs really existed and
really helped — but two relays are still relays: each direction obeys its own $r^k$, and a token
mid-document is still dozens of hand-offs from both ends.`,
    },
    {
      id: 'm2-l1-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old** — the telephone game versus the classroom where
everyone can see everyone. Your explanation must land four things: (1) why a whisper chain garbles
messages that travel far, with the half-gone-in-about-seven-whispers flavor made concrete;
(2) why "just whisper more carefully" doesn't rescue a *long* chain; (3) how a room where any kid
can look directly at any other kid's card fixes it; (4) what the fix costs. Rule: no unexplained
jargon — "vector," "gradient," "recurrent," "attention," "quadratic" must be translated into
kid-words or left out entirely.`,
      rubric: md`Grade the teaching, not the vocabulary:

1. **Chain decay, felt in numbers.** Each whisper keeps most-but-not-all — say 9 parts in 10.
   Losses stack by multiplying: 90% of 90% of 90%... about half the message is mush after seven
   kids, and after fifty kids nearly nothing is left. (Any concrete version of "the losses
   multiply, so distance is deadly" earns this beat.)
2. **Careful doesn't scale.** Even a kid who keeps 99 parts in 100 loses the battle if the chain
   is long enough — the problem is *how many hand-offs*, not how clumsy any one kid is. Better
   whisperers move the cliff; they don't remove it.
3. **Direct looking.** Let any kid look straight at any other kid's card: the message crosses one
   gap no matter how far apart they sit. Distance stops mattering because nothing is passed
   through middlemen anymore.
4. **The cost.** Everyone-can-look-at-everyone means a lot of looking: 30 kids is 30 × 30 = 900
   possible glances, and doubling the class makes four times as many. That's the price the
   direct-look classroom pays for never garbling.
5. **Jargon audit.** Any term from the banned list (or friends like "matrix," "softmax") appearing
   without a kid-level translation caps the grade at partial — jargon-hiding is precisely the
   failure this exercise exists to catch.`,
    },
    {
      id: 'm2-l1-q11',
      kind: 'written',
      prompt: md`**Connect to lesson 1.2.** Write a paragraph for a fellow student who knows a GPU
only as "a machine built to do enormous matrix multiplications all at once." Explain: (1) exactly
where the RNN's structure fights that machine — name the dependency; (2) why direct pairwise
wiring is precisely shaped to feed it; (3) the historical punchline — why this hardware fit
mattered as much as raw accuracy in deciding which architecture conquered the field.`,
      rubric: md`Three beats, each with its mechanism:

1. **The fight.** The recurrence $\mathbf{h}_t = f(\mathbf{h}_{t-1}, \mathbf{x}_t)$ makes each
   step's input the previous step's *output*: a true dependency chain across time. The GPU's tens
   of thousands of arithmetic units need *independent* work to run at once; the RNN offers a
   string of small dependent matmuls with stalls between them — the factory sips instead of
   gulps, and wall-clock per document grows with sequence length.
2. **The fit.** In direct wiring, whether token $j$ matters to token $i$ depends only on inputs
   that already exist — every pairwise look is independent of every other. Independent, identical
   little computations over all pairs stack into a few *giant* matrix multiplications spanning
   the whole document — exactly the all-rows-at-once shape 1.2 said GPUs were built for.
3. **The punchline.** Training corpora run to $\sim 10^{13}$ tokens; only an architecture whose
   training time doesn't serialize token-by-token can afford that diet. *Attention Is All You
   Need* (2017) abolished recurrence outright, and scaling took off — the transformer won partly
   because it matched the machines available. (Bonus insight worth "nailed it" on its own:
   the feedback loop — hardware and software then co-evolved *for* transformers, entrenching the
   choice.)

All three beats with mechanisms = full credit; asserting "GPUs like parallel things" without
naming the dependency or the matmul shape = partial.`,
    },
    {
      id: 'm2-l1-q12',
      kind: 'written',
      prompt: md`**Routing on paper.** Take the sentence: *"The trophy doesn't fit in the suitcase
because it is too big."* Write out the information-routing requirements: (a) which token has the
frozen-meaning problem worst, and what are its candidate resolutions? (b) what information must
flow **to** that token, **from** which tokens, for the sentence to be understood — and why does
swapping "big" for "small" flip the routing? (c) do the same in one line for *"I sat on the bank
of the river."* (d) conclude: what do these routes demand of an architecture — why does a
fixed-size relay struggle to deliver them, and what property of the routes makes any lookup table
hopeless?`,
      rubric: md`(a) **"it"** — the most frozen token in the language: its table vector is a
generic pronoun stub, and essentially *all* of its working meaning must arrive from context. The
candidates are **trophy** and **suitcase**.

(b) "it" needs at least three deliveries: the candidate vectors from *trophy* and *suitcase*, and
the predicate *too big* — because the tiebreaker is world knowledge: a thing too **big** for a
container is the *contained* thing, so "it" resolves to trophy. Swap in "too small" and the same
knowledge points at the container: suitcase. One word changed, routing reversed — so the routes
must be computed from **content**, not read off positions or syntax templates.

(c) "bank" must draw from "river" (and "sat on" helps) to land its working vector on the
shoreline sense rather than the finance sense.

(d) The demands: routes are *pair-specific*, *content-dependent*, and *different for every
sentence* — so no finite table can pre-store them (the $10^{500}$ wall), and a relay struggles
because every delivery must squeeze through the same one-vector pipe across the gap, decaying
like $r^k$ ($0.9^7 \approx 48\%$ even for this short sentence; far worse at real antecedent
distances). Direct wiring gives each needed pair its own one-hop channel with a tunable flow.
(Bonus, worth "nailed it" on its own: noticing the need is *directional* — "it" desperately needs
"trophy," while "trophy" needs nothing from "it." Hold that thought; lesson 2.2 turns exactly
this observation into machinery.)

Full credit: all four parts, with the big/small flip explained by world knowledge rather than
grammar. Missing the flip's implication (content-computed routing) = partial.`,
    },
  ],
}
