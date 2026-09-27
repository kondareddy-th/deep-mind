// Module 2, Lesson 3 — Multi-head attention (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm2-l3',
  title: '2.3 Many heads — parallel conversations',
  subtitle: md`One token, one softmax row, one conversation — but "it" needs grammar, reference, and
meaning answered at the same time. The fix runs 32 conversations in parallel, costs almost nothing
extra, and nobody tells the heads what to talk about.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Lesson 2.2 left you owning a machine: every token writes a query, scores every key, softmaxes the
row, and mixes the values. Now look hard at what each token actually *receives*: one row of
weights — positive, summing to $1$ — and therefore **one mixture**. One conversation per token.

Run the machine on our favorite sentence and stand where "it" stands:

> The robot lifted the ball because **it** was heavy.

Ask what "it" needs from its neighbors, and you find it needs *three different things at once*:

1. **Grammar bookkeeping** — where's the nearest noun? (*ball*, two tokens back)
2. **Coreference** — which entity could "it" even be? (*robot* or *ball* — track both candidates)
3. **Semantics** — what does *heavy* select for? (heavy explains why lifting was worth mentioning —
   it points at the thing being lifted)

Three questions, three different target tokens. But one softmax row is one **weight budget**: the
weights must sum to $1$. If the grammar question wants to spend $0.8$ of the budget on *ball*, and
the semantic question wants $0.8$ on *heavy*, the single row can at best split the difference —
$0.4$ and $0.4$ — and now *neither* question got a clean answer. The competing needs have been
averaged into mush.

And it's worse than a budget fight. There is only one $W_V$, so whatever gets attended arrives
**pre-mixed on a single wire**: the grammar answer and the semantic answer are added into one
vector before anything downstream can look at them. Even a perfect compromise on weights delivers
an entangled blend that no later layer can cleanly un-mix.

The obvious fix is brute force: run several complete attention machines side by side and let each
specialize. But a complete copy means another full set of $W_Q, W_K, W_V$ — another $3d^2$
parameters, another full round of score arithmetic. Eight conversations for eight times the price?
That's not a design, that's a ransom.

So here is the real puzzle of this lesson: **how does a token hold several conversations at once —
without paying several times the price?**
`,
    },
    {
      type: 'text',
      md: md`
## Split, don't multiply

The answer is one move: **don't add more machines — slice the one you have.**

Take Llama-7B's numbers. The model width is $d_{\text{model}} = 4096$. Instead of one attention
machine operating on all 4096 dimensions, cut the *output* space into $h = 32$ subspaces of
$4096 / 32 = 128$ dimensions each. Each subspace is a **head**, and each head $i$ gets its own
private, *small* projection matrices:

$$W_Q^{(i)},\; W_K^{(i)},\; W_V^{(i)} \;\in\; \mathbb{R}^{4096 \times 128}$$

Read the shape carefully, because a popular misconception hides here: each head's matrices take
the **full 4096-dimensional token** as input. Heads do not see slices of the token; every head
sees everything, through its own narrow lens, and writes what it sees into a private 128-dimensional
workspace. The slicing happens on the *output* side.

Inside its 128-dimensional room, each head runs the entire lesson-2.2 machine, unmodified and
undisturbed: its own $\mathbf{q}\cdot\mathbf{k}$ scores, its own $\sqrt{d_k}$ with $d_k = 128$,
its own softmax row, its own value mixture. Thirty-two little attention machines, running in
parallel, each producing a 128-dimensional output per token.

Then reassemble: **concatenate** the 32 outputs back into one $32 \times 128 = 4096$-dimensional
vector, and mix that through one final learned matrix $W_O \in \mathbb{R}^{4096 \times 4096}$:

$$\text{head}_i = \text{Attention}\!\left(X W_Q^{(i)},\, X W_K^{(i)},\, X W_V^{(i)}\right)
\qquad
\text{MultiHead}(X) = \text{Concat}\!\left(\text{head}_1, \ldots, \text{head}_{32}\right) W_O$$

That's the whole design. But before you accept my claim that this is cheap — don't. Price it
yourself.
`,
    },
    {
      type: 'ponder',
      question: md`One full-width head at $d = 4096$ needs $W_Q, W_K, W_V$ each of shape
$4096 \times 4096$: that's $3 \times 4096^2 \approx 50.3$M parameters. Now price the 32-head
design: each head owns three matrices of shape $4096 \times 128$, and there are 32 heads. Do the
multiplication before revealing. If you're feeling thorough, also count the multiply-adds needed
to score one token pair (one query dotted against one key) in both designs.`,
      answer: md`Per head: $3 \times 4096 \times 128 \approx 1.57$M parameters. Times 32 heads:
$32 \times 3 \times 4096 \times 128 = 3 \times 4096^2 \approx 50.3$M — **identical**. In symbols:

$$h \times 3 \times \left(d \times \frac{d}{h}\right) = 3d^2$$

The $h$ cancels. You can slice the width into as many heads as you like and the projection bill
doesn't move.

Scoring a pair, same story: single-head is one 4096-dimensional dot product — 4096 multiply-adds.
Multi-head is 32 separate 128-dimensional dots — $32 \times 128 = 4096$ multiply-adds. Same again.

The one genuinely new line on the bill is $W_O$: $4096^2 \approx 16.8$M parameters — real, but
modest (a third of the QKV bill), and you'd want an output mixer anyway.

So the deep accounting fact is: **you don't pay for conversations — you pay for width**, and width
can be sliced into conversations nearly for free. (Not *infinitely*: 4096 heads of 1 dimension each
would score "agreement" with single numbers — no room left to express a *direction* worth caring
about. Trained models across the industry mostly use 64–128 dimensions per head, with a few (such as
Google's Gemma) at 256; empirically, that's about the room one conversation needs.)`,
    },
    {
      type: 'text',
      md: md`
## Thirty-two witnesses at thirty-two windows

What did we actually buy? Each head applies its *own* learned projection to the same token — its
own way of looking. Picture witnesses standing at different windows of the same house. Same scene
inside; different windows; different views. One witness had the window over the kitchen and saw who
held the knife; one had the street-side window and saw the car leave; one only saw silhouettes and
timing. No witness saw everything — and that's precisely what makes the *collection* of testimony
rich.

A projection from 4096 down to 128 dimensions must throw away almost everything — and that
discarding is a *feature*. A head whose $W_K^{(i)}$ preserves only rough part-of-speech and
local-position information becomes a grammar specialist: in its 128-dimensional room, nouns are
loud and everything else is murmur. Another head's matrices might preserve only entity-hood, or
only whether a token sits inside quotation marks. Each head runs honest lesson-2.2 attention on its
own *caricature* of the sentence.

Now the two failures from the opening puzzle dissolve:

**The budget fight is over.** Each head owns a full softmax row of its own — 32 separate budgets,
each summing to $1$, instead of one. The grammar head can spend $0.9$ on *ball* while the semantic
head spends $0.9$ on *heavy*. Nobody compromises; every conversation runs at full volume.

**The wires are separate.** Before $W_O$, head 1's answer occupies dimensions 1–128 of the
concatenation, head 2's occupies 129–256, and so on. The grammar verdict and the semantic verdict
arrive side by side, not pre-mixed. Then $W_O$ acts as the editor who merges 32 witness statements
into one 4096-dimensional report — a *learned* merge, so training decides which heads get amplified,
which get cross-referenced, and which get politely ignored.
`,
    },
    {
      type: 'example',
      title: 'the full attention bill for Llama-7B, by hand',
      md: md`
Llama-7B: $d_{\text{model}} = 4096$, $h = 32$ heads of $d_k = 128$, and $32$ layers. Price one
layer's attention:

**Q, K, V projections (32 heads):** each head has $3$ matrices of $4096 \times 128 = 524{,}288$
entries, so $1{,}572{,}864$ per head; times 32 heads $= 50{,}331{,}648 \approx 50.3$M.

**Sanity check against one full-width head:** $3 \times 4096^2 = 3 \times 16{,}777{,}216 =
50{,}331{,}648$. Identical, as derived — the head count canceled.

**Output mixer:** $W_O$ is $4096 \times 4096 = 16{,}777{,}216 \approx 16.8$M.

**Total per layer:** $50.3\text{M} + 16.8\text{M} = 4 \times 4096^2 \approx 67.1$M.

**Total for the model:** $67.1\text{M} \times 32 \text{ layers} \approx 2.15$B parameters — about a
*third* of Llama-7B's $6.7$B lives in attention projections. (Most of the rest is the feed-forward
half of each block — lesson 2.5's subject.) When you hear "a 7B model," you can now decompose the
number from memory. That's ownership.
`,
    },
    {
      type: 'viz',
      viz: 'multi-head',
      caption: md`Three heads with three personalities over one sentence. Coral is a
**previous-token head** (watches the word just behind the query), blue is an **entity head** (hunts
nouns that could be referents), green is a **broad-context head** (spreads its budget wide). Arcs
at different heights, one color per head. Three experiments: (1) set the query to "it" and compare
which tokens each color picks — three different conversations computed from the same input;
(2) toggle heads off one at a time and watch each conversation in isolation — notice that no head's
pattern changes when another is hidden, because heads run independently; (3) drag the query word by
word along the sentence: the coral head tracks one-step-behind with machine regularity while the
blue head jumps around hunting entities. That difference — mechanical versus content-driven — is
what "specialization" looks like when you can see it.`,
    },
    {
      type: 'text',
      md: md`
## What heads actually learn — a field report

Everything in this section is **empirical**: found by opening up trained models and staring, not
designed in. Nothing in the architecture assigns topics — every head has identical wiring and could
in principle learn anything. What interpretability researchers actually find, again and again
across models, is a recognizable zoo:

- **Previous-token heads**: attend to position $i - 1$, almost mechanically, regardless of content.
- **Positional / local heads**: attend within a small window, or park most of their weight on the
  first token of the sequence as a do-nothing resting position when they have nothing to say.
- **Boundary heads**: camp on commas, periods, and line breaks — punctuation is where segment
  bookkeeping lives.
- **Syntax-flavored heads**: track subject-ish and object-ish relations, imperfectly but far above
  chance.

Two honesty notes. First, these labels are *post-hoc human descriptions of tendencies*, not clean
job titles — many heads are messy, polysemantic, or apparently redundant, and pruning studies show
you can delete a surprising fraction of heads with barely a scratch. Second, a few heads are the
opposite of redundant: delete them and a specific capability craters. The most famous of those is
next.
`,
    },
    {
      type: 'ponder',
      question: md`Nothing distinguishes head 7 from head 23 — same shapes, same input, same loss.
Suppose you initialized all 32 heads of a layer with *literally identical* weights. What happens as
training runs? And what does the answer tell you about why initialization is random?`,
      answer: md`Identical weights receive **identical gradients** — same function of the same
input produces the same output, the same error, the same derivatives — so after the update the
heads are identical again. By induction, identical *forever*: you've bought one head 32 times.
Symmetry cannot break itself.

Random initialization plants each head at a slightly different spot. Now gradients differ, and the
differences compound: once head 7 is accidentally a hair better at tracking the previous token, the
loss leans on it for that job, its gradients push it deeper into the niche, and the other heads
feel less pressure to do that work and drift toward whatever *they* are marginally best at. Two
plants sharing one pot grow apart — each toward the light the other doesn't take. The division of
labor is not designed; it is the stable outcome of competition plus tiny initial differences.

(Empirical footnote: the outcome isn't perfectly efficient — trained models carry redundant,
prunable heads too. Specialization is a strong tendency, not a theorem.)`,
    },
    {
      type: 'text',
      md: md`
## The star of the zoo: induction heads

Here is a behavior every large language model exhibits. Show it a sequence containing a pair of
tokens, then repeat the first token:

$$[A]\;[B]\;\ldots\;[A]\;\rightarrow\;?$$

The model predicts $[B]$. Feed it "... wug blicket ... wug" and it says *blicket* — even if no
document in all of training ever contained those tokens together. The pattern was learned from
**this context, right now**, not from the weights' long-term memory. That is *in-context learning*
in its minimal form, and Anthropic's interpretability team traced it to a concrete two-head circuit
called an **induction head**. (Empirical again — this is a discovered mechanism, verified by
ablation, not a designed one.)

The circuit is a relay between two heads in **different layers**:

**Head 1 — earlier layer, a previous-token head.** At every position $t$, it attends to $t - 1$
and writes into position $t$'s vector a note: *"the token before me was X."* After this layer, every
position carries its own predecessor's name on its back.

**Head 2 — later layer, the matcher.** Its query, computed at the current token $[A]$, broadcasts
*"I am A — find a position whose note says A."* Its keys read the notes. The match lights up at the
old $[B]$'s position — because $[B]$'s note says "preceded by A." Head 2 attends *there*, and its
value pathway copies $[B]$'s identity forward into the prediction: **say B next**.

Read the algorithm in words: *find the last time my current situation occurred, look at what
happened next, and bet on it happening again.* That's a completely general inference strategy
compressed into two softmax rows — and when researchers watch models train, induction heads snap
into existence over a short window (a visible phase change), and the model's ability to exploit its
context jumps at the same moment. In small attention-only models, ablating the induction heads
removes most of that in-context learning; in large models the evidence is mostly this striking
timing correlation rather than a clean ablation. A cartoon this clean, causally verified inside a real model, is rare treasure —
Module 6 puts the whole toolkit for finding such circuits in your hands.
`,
    },
    {
      type: 'example',
      title: 'running the induction relay by hand',
      md: md`
Sequence of nonsense tokens (so no training memory can help): positions 1–4 hold

$$\text{wug}\;\;\; \text{blicket}\;\;\; \text{dax}\;\;\; \text{wug}$$

**After the previous-token head (earlier layer)**, each position carries a note:

| position | token | note written by head 1 |
|---|---|---|
| 1 | wug | (nothing before me) |
| 2 | blicket | before me: **wug** |
| 3 | dax | before me: blicket |
| 4 | wug | before me: dax |

**The induction head (later layer) computes position 4's update.** Its query says *"I am wug —
whose note reads wug?"* Score the keys: position 2's note reads **wug** — match, big score;
positions 1 and 3 — no match, small scores. The softmax hands nearly the whole budget to
position 2. Head 2's value pathway then delivers position 2's *identity* — **blicket** — into the
output, and the model's next-token prediction tilts hard toward *blicket*.

Prediction: wug blicket dax wug $\rightarrow$ **blicket**. Notice what did the work: the match
happened between the *current token* (via the query) and a *note about predecessors* (via the
keys) — two different kinds of information, which only exist together because head 1 ran first.
`,
    },
    {
      type: 'ponder',
      question: md`The induction relay uses two heads in two **different** layers — the
previous-token head strictly earlier, the matcher strictly later. Could both live in the same
layer? Reason it out from what the second head's keys must contain.`,
      answer: md`The matcher's keys must contain *"the token that preceded me"* — a note that does
not exist in the raw embeddings. It exists only *after* the previous-token head has written it. And
all heads within one layer read the same input — the token vectors as they stood **before** the
layer — running in parallel, deaf to each other's outputs. A same-layer matcher would be reading
keys from a world where the notes haven't been written yet.

So the relay needs a *before* and an *after*: computation requires sequencing, and **depth is the
transformer's clock**. Each layer is one tick — one chance to write features that the next tick can
consume. This is the first place in the course where you can see *why* deep networks are deep: not
the hand-wave "more layers, more capacity," but a concrete two-step algorithm that provably cannot
fit into one step.`,
    },
    {
      type: 'text',
      md: md`
## So what?

Count the conversations in real machines. Llama-7B: $32$ heads $\times\, 32$ layers $= 1024$
attention heads, each 128-dimensional. GPT-3: $96 \times 96 = 9216$ heads — and $12{,}288 / 96 =
128$ dimensions each. Different labs, different years, different scales — and both landed on
128-dimensional conversations, because that's roughly the room a niche needs (most models use 64–128;
a few, such as Gemma, use 256). When you read a config file, the head count is no longer trivia:
it's *how many parallel conversations per layer*, at *zero* extra projection cost — you derived
that.

One forward pointer: at generation time every head's keys and values must be *cached* per token
(Module 3), and 1024 independent heads times a 100k-token context is a memory bill that hurts.
The modern patch — grouped-query attention, where several query heads share one K/V pair — is the
first crack in "every head fully independent," and you'll price it exactly when you get there.

## What you now own

1. **The failure mode**: one softmax row = one weight budget = competing linguistic needs averaged
   into mush, delivered pre-mixed on a single $W_V$ wire.
2. **Split, don't multiply**: $4096 = 32 \times 128$; each head reads the whole token through a
   narrow projection and runs the full 2.2 machine in its private subspace.
3. **The cost derivation**: $h \times 3 \times (d \times d/h) = 3d^2$ — the $h$ cancels, in
   parameters *and* FLOPs. The only new bill is $W_O$ ($16.8$M at $d = 4096$).
4. **Why it wins**: 32 separate softmax budgets, 32 separate output wires, merged by a learned
   editor $W_O$ — witnesses at different windows of the same house.
5. **The zoo (empirical)**: previous-token, positional, boundary heads — emergent niches with
   post-hoc names, born from random-init symmetry breaking.
6. **Induction heads**: the two-layer relay implementing $[A][B]\ldots[A] \rightarrow [B]$ — the
   minimal in-context-learning circuit, and living proof that depth is a clock.

Next lesson: a scandal — every one of those 1024 conversations is *deaf to word order*; shuffle the
sentence and no head notices. We'll prove it, then fix it with rotating clock hands.
`,
    },
  ],
  questions: [
    {
      id: 'm2-l3-q1',
      kind: 'mcq',
      prompt: md`Swapping one full-width attention head ($d = 4096$) for 32 heads of dimension 128
changes the total Q/K/V projection parameter count how?`,
      options: [
        md`About $32\times$ more — each additional head brings its own three projection matrices`,
        md`About $32\times$ less — each head's matrices are $32\times$ smaller`,
        md`Unchanged — $32 \times 3 \times (4096 \times 128)$ is exactly $3 \times 4096^2$`,
        md`It depends on the sequence length $n$`,
      ],
      answer: 2,
      explain: md`Each head's matrices are $32\times$ smaller ($4096 \times 128$ instead of
$4096 \times 4096$), and there are $32\times$ more of them: $h \times 3 \times (d \times d/h) =
3d^2$, with $h$ canceling exactly. Option A tempts because "32 heads" *sounds* like 32 machines —
but they're slices, not copies. Option B tempts if you remember the shrinking and forget the
multiplying. Option D confuses weights with activations: sequence length changes the *work done at
runtime* on scores ($n^2$, from 2.2), never the parameter count of the projections.`,
    },
    {
      id: 'm2-l3-q2',
      kind: 'numeric',
      prompt: md`A model has $d_{\text{model}} = 4096$ and 32 attention heads. What is the per-head
dimension $d_k$?`,
      answer: 128,
      tolerance: 0.5,
      explain: md`$4096 / 32 = 128$. This is the same $d_k$ that appears inside each head's
$\sqrt{d_k}$ scaling from lesson 2.2 — every head runs the drunkard's-walk correction for *its own*
dimensionality, $\sqrt{128} \approx 11.3$, not for the full model width.`,
    },
    {
      id: 'm2-l3-q3',
      kind: 'numeric',
      prompt: md`Those 32 heads each output a 128-dimensional vector per token. After
concatenation, what is the width of the vector that enters $W_O$?`,
      answer: 4096,
      tolerance: 1,
      explain: md`$32 \times 128 = 4096$ — the concatenation lands exactly back on
$d_{\text{model}}$. That's not a coincidence; it's the design: slice the width, work in the slices,
reassemble to the original width. It also means $W_O$ is a square $4096 \times 4096$ matrix — it
*mixes* at constant width rather than changing dimensions.`,
    },
    {
      id: 'm2-l3-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, show from scratch that $h$ small heads cost
the same as one big head. Steps: **(1)** count the Q/K/V projection parameters for a single head of
full width $d$; **(2)** count them for $h$ heads of width $d/h$ and simplify the algebra;
**(3)** count the multiply-adds to score one token pair in both designs; **(4)** name the one
genuinely new cost multi-head introduces, and compute its size for $d = 4096$.`,
      rubric: md`**(1)** One full-width head: three matrices of $d \times d$ entries $= 3d^2$.

**(2)** Per small head: $3 \times d \times (d/h)$. Times $h$ heads:

$$h \times 3 \times \left(d \times \frac{d}{h}\right) = 3d^2$$

— the $h$ cancels; the algebra must be shown, not asserted.

**(3)** Single head: one $d$-dimensional dot $= d$ multiply-adds. Multi-head: $h$ dots of $d/h$
dimensions $= h \times d/h = d$ multiply-adds. Same again — the parity holds for FLOPs, not just
parameters.

**(4)** The output mixer $W_O$: $d \times d = 4096^2 = 16{,}777{,}216 \approx 16.8$M parameters —
real but modest, and it's what lets the heads' separate answers recombine.

"Nailed it" requires the cancellation *derived* in step (2) and the FLOP argument in step (3);
writing "it's the same, I remember" is exactly what this question exists to catch. Bonus insight:
step (2) implies you pay for *width*, not for *conversations* — heads are nearly free.`,
    },
    {
      id: 'm2-l3-q5',
      kind: 'mcq',
      prompt: md`A researcher describes head 5 of layer 3 as "a previous-token head" and head 8 of
layer 17 as "a punctuation head." How did those heads come to have those roles?`,
      options: [
        md`The roles emerged during training and were discovered afterwards by interpretability
researchers — the labels are post-hoc human descriptions of tendencies`,
        md`The architecture wires different head indices for different linguistic functions`,
        md`Engineers assign each head a role during fine-tuning, using labeled examples`,
        md`They don't really have roles — all heads compute essentially the same function, and the
labels are storytelling`,
      ],
      answer: 0,
      explain: md`Every head has identical wiring; only random initialization and gradient descent
distinguish them, so any division of labor is *emergent*, and the names are applied by humans after
peering inside. Option B tempts because the names sound architectural — "previous-token head" reads
like a component from a datasheet. Option C projects supervised habits onto self-supervised
training — nobody labels anything. Option D is the sophisticated trap: many heads *are* messy or
prunable, but ablation studies show causally-verified specialists (in small models, deleting the
induction heads removes most in-context learning), so "just storytelling" overshoots the skepticism.`,
    },
    {
      id: 'm2-l3-q6',
      kind: 'written',
      prompt: md`**The induction relay, in your own words.** Write out the induction-head circuit
as an algorithm. Your explanation must cover: **(a)** what the earlier-layer head writes, and where;
**(b)** how the later head's query–key match uses that note, and why the attention lands on the
token *after* the earlier occurrence of $[A]$ rather than on $[A]$ itself; **(c)** why the copied
value produces the right prediction; **(d)** why this counts as *in-context* learning rather than
memory — what would happen on a token pair the model never saw in training?`,
      rubric: md`**(a)** The previous-token head, at every position $t$, attends to $t-1$ and
writes "the token before me was X" into position $t$'s vector — every position ends up carrying its
predecessor's name.

**(b)** The matcher's query at the current $[A]$ broadcasts "find a note reading A"; its keys read
the notes. The position whose note says "preceded by A" is $[B]$'s position — that's why attention
lands on $[B]$, one step *after* the old $[A]$: the note-writing already performed the shift by one.

**(c)** The matcher's value pathway copies the attended token's identity — $[B]$ — into the output,
pushing the next-token prediction toward $[B]$: "last time A appeared, B followed; bet on B."

**(d)** Nothing in the circuit consults training-time co-occurrence: the match runs on notes
written from *this* context, so nonsense pairs work — "wug blicket ... wug" predicts *blicket*.
That's the signature separating context (activations, this forward pass) from memory (weights,
training).

Full credit requires (b)'s off-by-one reasoning — it's the mechanism's cleverest part — and (d)
stated as a testable prediction, not a slogan.`,
    },
    {
      id: 'm2-l3-q7',
      kind: 'mcq',
      prompt: md`In the induction circuit, what is the job of the **first** head (the one in the
earlier layer)?`,
      options: [
        md`It scans the entire context for earlier copies of the current token`,
        md`It attends one position back and writes a "what preceded me" note into each position —
the feature the second head later matches against`,
        md`It memorized the pair $[A] \to [B]$ in its weights during training`,
        md`It predicts $[B]$ directly; the second head merely double-checks`,
      ],
      answer: 1,
      explain: md`Head 1 is a humble previous-token head: mechanical, content-blind, one step back —
its whole contribution is decorating every position with its predecessor's name. Option A tempts
because *searching for copies* is indeed how the circuit feels overall — but that's the *second*
head's query-key match, which only works because the notes exist. Option C confuses weights
(training memory) with activations (context memory) — the circuit's entire point is working on
never-trained pairs. Option D gets the relay backwards: the payoff happens only at the second hop;
head 1 alone predicts nothing.`,
    },
    {
      id: 'm2-l3-q8',
      kind: 'written',
      prompt: md`All 32 heads in a layer are architecturally identical and fed identical input.
Explain on paper: **(1)** what happens over training if all 32 are initialized with *exactly
identical* weights — trace the gradient argument; **(2)** why random initialization plus gradient
descent instead produces heads with different specialties, using the lesson's two-plants analogy or
a better one of your own; **(3)** one honest empirical caveat about how clean this specialization
actually is in real models.`,
      rubric: md`**(1)** Identical weights on identical input compute identical outputs, hence
identical errors, hence *identical gradients* — so the update preserves identity, and by induction
the heads remain clones forever. Symmetry cannot break itself; the layer is one head bought 32
times. The gradient chain must be traced, not just "they stay the same."

**(2)** Random init makes the heads infinitesimally different; gradients now differ and differences
compound: whichever head is accidentally best at some sub-task gets leaned on by the loss, pushed
deeper into that niche, while the others feel less pressure there and drift toward their own
accidental strengths. Analogy earning full credit must *compute* — e.g., two plants in one pot grow
apart, each toward light the other doesn't intercept: competition plus tiny asymmetry yields stable
division of labor with no planner.

**(3)** Any honest caveat: real models carry redundant and prunable heads; many heads resist clean
labels; specialization is a tendency confirmed by ablation in *some* heads, not a per-head
guarantee.

All three parts, with (1)'s induction argument explicit = nailed it.`,
    },
    {
      id: 'm2-l3-q9',
      kind: 'numeric',
      prompt: md`**Fermi estimate (paper, no calculator):** GPT-3 has 96 layers, each with 96
attention heads. Roughly how many attention heads does the full model contain?`,
      answer: 9216,
      tolerance: 1200,
      explain: md`$96 \times 96 = 9216$ — call it nine thousand parallel conversations, each
$12{,}288 / 96 = 128$-dimensional (the same per-head width Llama chose at a totally different
scale). For comparison, Llama-7B carries $32 \times 32 = 1024$. Numbers like these are why
interpretability is *hard labor*: "figure out what every head does" means cataloging thousands of
specialists, redundants, and freeloaders — and why finding even one clean circuit (induction heads)
was a landmark.`,
    },
    {
      id: 'm2-l3-q10',
      kind: 'mcq',
      prompt: md`After concatenating the 32 heads' outputs (giving a $32 \times 128 = 4096$-wide
vector), why is the final matrix $W_O$ needed at all?`,
      options: [
        md`To project the concatenation back down to the model width $d_{\text{model}}$`,
        md`To normalize the head outputs so they sum to 1`,
        md`To add the nonlinearity that attention otherwise lacks`,
        md`To let information from different heads mix — without it, head $i$'s answer could only
ever influence its own 128 dimensions of the output`,
      ],
      answer: 3,
      explain: md`Before $W_O$, each head's verdict sits on private wires (its own 128-dim slice).
$W_O$ is the learned editor that weighs, cross-references, and merges the witness statements — every
output dimension becomes a mixture over *all* heads. Option A is the classic trap: the concatenation
is *already* $4096 = d_{\text{model}}$; no down-projection is needed — check the dimension
arithmetic. Option B confuses $W_O$ with softmax, which already normalized each head's *weights*.
Option C is a lesson-2.5 spoiler in reverse: $W_O$ is linear; the transformer's nonlinearity lives
in the feed-forward network, not here.`,
    },
    {
      id: 'm2-l3-q11',
      kind: 'numeric',
      prompt: md`For $d_{\text{model}} = 4096$, how many parameters does $W_O$ contain, **in
millions**?`,
      answer: 16.8,
      tolerance: 0.4,
      explain: md`$W_O$ is $4096 \times 4096 = 16{,}777{,}216 \approx 16.8$M. Set beside the QKV
bill of $50.3$M, the full attention block is $4 d^2 \approx 67.1$M per layer — a decomposition
worth carrying in your head whenever someone quotes a parameter count.`,
    },
    {
      id: 'm2-l3-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old** (write it out — the Feynman test): the computer
reads a sentence not with one mind but with 32 little minds at once, and nobody tells the little
minds what to look for. Explain to the kid: **(1)** why one mind reading alone does a worse job —
what goes wrong when one reader must answer several questions at once; **(2)** how the little minds
splitting the work fixes it; **(3)** how they end up with different jobs even though nobody assigns
jobs. Use the lesson's witnesses-at-windows or invent something better — inventing is worth more.`,
      rubric: md`Grade the teaching, not the vocabulary:

1. **The one-mind failure, concrete** — e.g., one detective trying to watch the door, the hands,
   and the faces at the same time ends up half-watching everything and solving nothing: attention
   spread over several questions answers none of them well, and the notes get jumbled together.
2. **The split, concrete** — 32 watchers each pick one thing and watch it *fully*; then they
   compare notes, and a final editor stitches the notes into one story. Bonus for noticing the
   surprise from the lesson: hiring the 32 watchers costs no more than the one detective, because
   each watcher works with a smaller piece of the job.
3. **Self-chosen jobs** — nobody hands out assignments; each watcher starts out *slightly*
   different by luck, gets a bit better at what they're accidentally good at, and practice snowballs
   until everyone has their own specialty — like siblings who stop competing at the same sport and
   each get great at different ones.
4. **Jargon audit**: "head," "softmax," "vector," "projection," "parameters" used without a
   kid-level translation = partial credit at best, no matter how correct — hiding behind jargon is
   exactly the failure this exercise catches.`,
    },
  ],
}
