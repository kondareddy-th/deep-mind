// Module 2, Lesson 2 — Attention from scratch (anchor lesson, Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm2-l2',
  title: '2.2 Attention — invented from scratch',
  subtitle:
    'The most famous equation in machine learning, built piece by piece from one puzzle: a word\'s stored vector is fixed, but its meaning isn\'t. By the end, softmax(QKᵀ/√d)V will be YOUR invention.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Read these two sentences:

> I sat on the **bank** of the river.
> The **bank** raised interest rates.

Module 1 taught you that every token gets an embedding — one vector per token, looked up from a
table. But "bank" is *one token*, so it gets *one vector*... and that vector cannot simultaneously
sit near *riverbed* and near *mortgage* for the two sentences. A lookup table is frozen. Meaning
is not.

So the fix cannot live in the table. It must be an operation that takes the frozen vector of "bank"
and **updates it using the words around it** — pulls it toward the river in one sentence and toward
the money in the other. Today we build that operation with our bare hands, rejecting the broken
versions one by one, until the machine that remains is — literally, symbol for symbol — the
attention mechanism inside every transformer. You have every tool already: dot products (1.1),
matrices (1.2), softmax (1.4).

## Attempt 1: just average the neighbors

The dumbest possible context machine: replace each word's vector by the average of *all* the
vectors in the sentence.

$$\mathbf{x}_i^{\text{new}} = \frac{1}{n} \sum_{j=1}^{n} \mathbf{x}_j$$

Cheap, easy — and catastrophically wrong, for a reason worth feeling. Every token receives the
*same* update. "Bank" in the river sentence gets pulled toward river — good! — but also equally
toward "I", "sat", "on", "the", "the". Grammar filler drowns the signal, and worse: every word in
the sentence ends up with an *identical* context vector. The soup tastes the same everywhere. We
averaged away exactly the thing we care about — *which* neighbors matter *to me*.

The diagnosis writes the prescription: we don't want an average, we want a **weighted** average,
where the weights measure *relevance* — different for every pair of words:

$$\mathbf{x}_i^{\text{new}} = \sum_j w_{ij}\, \mathbf{x}_j, \qquad \text{where } w_{ij} \text{ is large only when word } j \text{ matters to word } i$$

Now everything hangs on one question: where do the weights come from?

## Attempt 2: relevance = dot product

Lesson 1.1 built an agreement-meter for exactly this: the dot product. So try the obvious thing —
let the relevance of word $j$ to word $i$ be $\mathbf{x}_i \cdot \mathbf{x}_j$, then push the
scores through a softmax (lesson 1.4's machine for turning arbitrary scores into weights that are
positive and sum to 1):

$$w_{ij} = \text{softmax}_j(\mathbf{x}_i \cdot \mathbf{x}_j)$$

This is genuinely close — it's content-based, it's differentiable, it's cheap. But it has two
diseases, and finding them yourself is worth more than reading them.
`,
    },
    {
      type: 'ponder',
      question: md`Before reading on, try to break Attempt 2. Two hints: **(1)** compute the
"relevance of a word to itself," $\mathbf{x}_i \cdot \mathbf{x}_i$ — what is that quantity, and
what will the softmax do with it? **(2)** notice that $\mathbf{x}_i \cdot \mathbf{x}_j =
\mathbf{x}_j \cdot \mathbf{x}_i$, always. Why is that symmetry *wrong* for language?`,
      answer: md`**Disease 1 — narcissism.** $\mathbf{x}_i \cdot \mathbf{x}_i = \|\mathbf{x}_i\|^2$,
the squared length — typically the *largest* score in the whole row, since nothing agrees with a
vector like itself. The softmax then hands most of the weight to... the word itself. Our context
machine mostly tells every word what it already knows.

**Disease 2 — forced symmetry.** Real linguistic relevance is *directional*. In "the bank of the
river," the word *bank* desperately needs *river* to fix its meaning; *river* barely needs *bank*
at all. But the dot product physically cannot express $w_{ij} \ne w_{ji}$ this way — one number
serves both directions. The relationship "what $i$ wants from $j$" and "what $j$ wants from $i$"
have been welded together, and no training can un-weld them.

Both diseases have the same root: we made one vector play every role at once.`,
    },
    {
      type: 'text',
      md: md`
## The fix: give every token three jobs

Think about how you actually use a library. Three different pieces of paper are involved:

1. The **query** slip you write: *"I want books about rivers."*
2. The **catalog card** each book advertises: *"this book is about geology."*
3. The **book itself** — what you actually walk away with if the card matches your slip.

The slip and the card are matched against each other; the book is what gets handed over. Crucially,
these are three *different documents*, even though all three describe the same underlying things
(your need, the book). Attempt 2 failed because it used one vector as all three documents at once.

So: give each token three separate representations, produced from its embedding by three **learned
matrices** — machines from lesson 1.2, whose entries training is free to tune:

$$\mathbf{q}_i = W_Q\, \mathbf{x}_i \quad \text{(what I'm looking for)} \qquad
\mathbf{k}_j = W_K\, \mathbf{x}_j \quad \text{(what I advertise)} \qquad
\mathbf{v}_j = W_V\, \mathbf{x}_j \quad \text{(what I hand over if chosen)}$$

Both diseases die instantly. Narcissism: a token's query no longer has any reason to match its own
key — $W_Q \mathbf{x}_i \cdot W_K \mathbf{x}_i$ is not a squared length, it's just another learned
score that training can turn down. Symmetry: the relevance of $j$ to $i$ is
$\mathbf{q}_i \cdot \mathbf{k}_j$, while the reverse direction is $\mathbf{q}_j \cdot \mathbf{k}_i$
— *different queries, different keys, different numbers*. "Bank" can crave "river" while "river"
ignores "bank."

## Assembling the machine you already own the parts for

Now bolt on the two refinements Module 1 already justified:

**Divide by $\sqrt{d_k}$.** Lesson 1.1's drunkard's walk: dot products of $d_k$-dimensional
vectors naturally wander to $\pm\sqrt{d_k}$, and scores that big saturate the softmax — one token
grabs everything and gradients die. Dividing by $\sqrt{d_k}$ tames the spread back to $\pm 1$.

**Softmax the row.** Lesson 1.4's score-to-belief machine: exponentiate (order preserved, all
positive), normalize (sums to 1). The scores become a proper set of mixing weights.

Then mix the *values* with those weights. For one token $i$, the full pipeline:

$$\text{score}_{ij} = \frac{\mathbf{q}_i \cdot \mathbf{k}_j}{\sqrt{d_k}}
\;\;\longrightarrow\;\;
w_{ij} = \text{softmax}_j(\text{score}_{ij})
\;\;\longrightarrow\;\;
\mathbf{x}_i^{\text{new}} = \sum_j w_{ij}\, \mathbf{v}_j$$

Stack all the queries into a matrix $Q$ (one row per token), likewise $K$ and $V$, and the three
steps collapse into one line — lesson 1.2's "matrix multiplication is doing the thing to every row
at once":

$$\boxed{\;\text{Attention}(Q, K, V) = \text{softmax}\!\left(\frac{Q K^\top}{\sqrt{d_k}}\right) V\;}$$

That is the equation from *Attention Is All You Need* — the most cited formula in modern AI.
Look at what just happened: you did not memorize it. You **derived** it, by repairing a broken
averaging machine with parts you built in Module 1. Every symbol has a reason you can state:
$W_Q, W_K$ because one vector can't play asymmetric roles; $W_V$ because what you *hand over*
differs from what you *advertise*; $\sqrt{d_k}$ because random dot products wander; softmax
because weights must be positive beliefs that sum to 1.
`,
    },
    {
      type: 'viz',
      viz: 'attention-flow',
      caption:
        'The pipeline, live: pick a query token (try "it"), then step through ① raw q·k scores, ② softmax weights, ③ the value-mixing that produces the output vector. Three experiments: (1) walk the stages for "it" and watch entity words win the mixture; (2) toggle the causal mask and watch "it" gain/lose access to "heavy" — the future; (3) turn OFF √d scaling and watch the softmax collapse to winner-take-all — the saturation you predicted in lesson 1.1',
    },
    {
      type: 'example',
      title: 'one full attention row, by hand',
      md: md`
Three tokens, $d_k = 2$, computing the update for token 1. Its query and everyone's keys/values:

$$\mathbf{q}_1 = (2, 0) \qquad
\mathbf{k}_1 = (0, 1),\; \mathbf{k}_2 = (1, 1),\; \mathbf{k}_3 = (1, 0) \qquad
\mathbf{v}_1 = (1, 0),\; \mathbf{v}_2 = (0, 2),\; \mathbf{v}_3 = (2, 2)$$

**Scores** ($\mathbf{q}_1 \cdot \mathbf{k}_j / \sqrt{2}$, with $\sqrt 2 \approx 1.414$):

$$s_1 = \frac{0}{\sqrt2} = 0 \qquad s_2 = \frac{2}{\sqrt2} \approx 1.414 \qquad s_3 = \frac{2}{\sqrt2} \approx 1.414$$

**Softmax** ($e^0 = 1$, $e^{1.414} \approx 4.11$; sum $\approx 9.22$):

$$w_1 = \frac{1}{9.22} \approx 0.108 \qquad w_2 = w_3 = \frac{4.11}{9.22} \approx 0.446$$

**Mix the values:**

$$\mathbf{x}_1^{\text{new}} = 0.108\,(1,0) + 0.446\,(0,2) + 0.446\,(2,2) = (0.108 + 0.892,\; 0.892 + 0.892) \approx (1.00,\; 1.78)$$

Token 1 barely listens to itself ($10.8\%$) and blends tokens 2 and 3 equally. Do this once by
hand and the boxed formula stops being notation and becomes a procedure you can run.
`,
    },
    {
      type: 'text',
      md: md`
## The causal mask: no peeking at the exam answers

One more ingredient and the machine is complete. GPT-style models train on next-token prediction:
at position $i$, predict token $i+1$. But our attention row lets token $i$ mix in values from
tokens *after* $i$ — during training, the model could just read the answer off the page. The whole
prediction task collapses into copying.

The fix: before the softmax, overwrite every score where $j > i$ with $-\infty$. After
exponentiation, $e^{-\infty} = 0$ — future tokens get exactly zero weight, and each token sees
only its past. That triangular pattern of allowed/forbidden pairs is the **causal mask**, and it is
why the same architecture can generate text one token at a time.
`,
    },
    {
      type: 'ponder',
      question: md`Why must the masked scores be set to $-\infty$ rather than the seemingly-natural
$0$? Trace one masked score through the softmax and see what a $0$ actually does.`,
      answer: md`A score of $0$ is not "no vote" — it's a *moderate* vote: $e^0 = 1$, which is more
than a token with score $-2$ contributes ($e^{-2} \approx 0.135$)! Zeroing the score would leave
future tokens with substantial weight, often *beating legitimate past tokens*. The neutral element
of the softmax isn't $0$, it's $-\infty$, because softmax lives in exponent-land where adding
scores multiplies influence. (In real code: a large negative constant like $-10^9$, for the same
effect without floating-point drama.) This is a tiny question with a big moral: to switch something
*off* inside a machine, you must know what that machine's *off* actually is.`,
    },
    {
      type: 'text',
      md: md`
## What this costs — the $n^2$ heart of the long-context problem

Count the work. Every token computes a score against every other token: $n$ tokens, $n$ scores
each — $n^2$ dot products, and an $n \times n$ score matrix to hold them. Double your context
length and attention does *four times* the work and holds four times the scores. At chat length
this is nothing. At book length it is the dominant cost of the entire model, and at 128k-token
contexts the raw score matrix alone becomes absurd — you'll put a number on exactly how absurd in
the questions below.

This single quadratic is why a whole research industry exists: KV caches (Module 3), FlashAttention,
sliding windows, sparse and linear attention. When you read those papers, every one of them is
attacking the $n^2$ you just counted.
`,
    },
    {
      type: 'ponder',
      question: md`The output $\mathbf{x}_i^{\text{new}} = \sum_j w_{ij} \mathbf{v}_j$ has weights
that are positive and sum to $1$. Geometrically, where in space can this output possibly land?
And here's the strange consequence: can attention ever produce information that isn't already *in*
some value vector?`,
      answer: md`Weights positive-summing-to-one make the output a **convex combination** — it must
land inside the "shrink-wrap" (convex hull) of the value vectors, like a center of mass must lie
inside the body. Attention can *blend* what tokens offer — beautifully, selectively — but it can
never step outside the span of its ingredients. It **routes and mixes; it does not invent.** The
inventing — nonlinear transformation, "thinking new thoughts" from the blended material — is the
job of the feed-forward network, the *other* half of every transformer block. That division of
labor (attention = communication between tokens, FFN = computation within a token) is the cleanest
one-sentence summary of the transformer that exists, and it's where lesson 2.5 picks up.`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The puzzle**: one frozen vector per token can't carry context-dependent meaning — some
   operation must update tokens from their neighbors.
2. **The derivation chain**: plain averaging (drowns signal) → dot-product weighting (narcissistic
   and symmetric) → separate learned roles $W_Q, W_K, W_V$ — the library slip, the catalog card,
   the book.
3. **The formula, earned**: $\text{softmax}(QK^\top/\sqrt{d_k})\,V$ — with $\sqrt{d_k}$ from the
   drunkard's walk (1.1), softmax from score-to-belief (1.4), and matrix form from rows-at-once (1.2).
4. **The causal mask**: $-\infty$, not $0$, because softmax's *off* lives at $-\infty$.
5. **The $n^2$ cost**: the origin of the long-context problem and the target of a decade of papers.
6. **The limit**: attention mixes, it doesn't invent — the FFN's turn comes in lesson 2.5.

Next lesson: one attention pattern per layer is like one conversation at a party — multi-head
attention lets the model hold eight conversations at once, and they specialize in ways nobody
programmed.
`,
    },
  ],
  questions: [
    {
      id: 'm2-l2-q1',
      kind: 'mcq',
      prompt: md`Why does attention use **separate** matrices $W_Q$ and $W_K$ instead of scoring
relevance directly as $\mathbf{x}_i \cdot \mathbf{x}_j$?`,
      options: [
        'Two matrices double the parameters, and more parameters always help',
        'Raw dot products would make relevance symmetric and make every token attend mostly to itself — separate learned roles break both defects',
        'The embeddings are too high-dimensional to dot-product directly',
        'Without $W_Q$ and $W_K$ the scores could be negative, which softmax cannot handle',
      ],
      answer: 1,
      explain: md`The two diseases of Attempt 2: $\mathbf{x}\cdot\mathbf{x} = \|\mathbf{x}\|^2$
dominates its row (narcissism), and $\mathbf{x}_i\cdot\mathbf{x}_j = \mathbf{x}_j\cdot\mathbf{x}_i$
forces "bank needs river" to equal "river needs bank" (symmetry). Learned $W_Q \ne W_K$ cures both.
The distractors tempt for real reasons: more parameters *do* exist but aren't the point; softmax
handles negative scores perfectly well ($e^{-x}$ is just small); and dimensionality is irrelevant —
dot products work in any $d$.`,
    },
    {
      id: 'm2-l2-q2',
      kind: 'numeric',
      prompt: md`With $d_k = 2$: query $\mathbf{q} = (2, 1)$ and key $\mathbf{k} = (1, 1)$. Compute
the **scaled** attention score $\mathbf{q}\cdot\mathbf{k}/\sqrt{d_k}$ to two decimals.`,
      answer: 2.12,
      tolerance: 0.02,
      explain: md`$\mathbf{q}\cdot\mathbf{k} = 2 + 1 = 3$; divide by $\sqrt2 \approx 1.414$:
$3/1.414 \approx 2.12$. The division looks cosmetic at $d_k = 2$; at $d_k = 128$ it is the
difference between a working softmax and a saturated one.`,
    },
    {
      id: 'm2-l2-q3',
      kind: 'mcq',
      prompt: md`During training with a causal mask, scores for future positions are set to
$-\infty$ (in practice $\approx -10^9$) rather than $0$. What would setting them to $0$ actually do?`,
      options: [
        'Nothing different — zero score means zero weight either way',
        'It would crash the softmax with a division by zero',
        'Future tokens would keep weight $\\propto e^0 = 1$ each — often outvoting legitimate past tokens with negative scores',
        'It would only matter for the very last token in the sequence',
      ],
      answer: 2,
      explain: md`Softmax lives in exponent-land: weight $\propto e^{\text{score}}$, so a score of
$0$ contributes $e^0 = 1$ — a *moderate positive vote*, larger than any negatively-scored real
candidate gets. The "off switch" of a softmax is $-\infty$, because that's what exponentiates to
$0$. Option A is the natural trap: it confuses the score scale (where $0$ feels neutral) with the
weight scale (where $0$ weight requires $-\infty$ score).`,
    },
    {
      id: 'm2-l2-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Starting from "replace each token's vector with a
weighted average of all the vectors," reconstruct scaled dot-product attention on paper the way
this lesson did: state what breaks with uniform averaging, what breaks with
$w_{ij} = \text{softmax}(\mathbf{x}_i\cdot\mathbf{x}_j)$ (both diseases, with the reason), and how
$W_Q, W_K, W_V$ fix it. Finish by writing the boxed formula and justifying the $\sqrt{d_k}$ and the
softmax in one sentence each.`,
      rubric: md`Full credit requires the chain, not the endpoint:

1. **Uniform averaging** gives every token the same update — filler drowns signal; relevance must
   be pairwise and content-based.
2. **Raw dot-product weights**: (a) *narcissism* — $\mathbf{x}\cdot\mathbf{x} = \|\mathbf{x}\|^2$
   is the biggest score in its row, so the softmax mostly returns the token to itself; (b) *forced
   symmetry* — one number serves $i{\to}j$ and $j{\to}i$, but linguistic need is directional.
3. **Three learned roles**: $\mathbf{q} = W_Q\mathbf{x}$ (seek), $\mathbf{k} = W_K\mathbf{x}$
   (advertise), $\mathbf{v} = W_V\mathbf{x}$ (deliver) — asymmetric by construction, and
   self-attention becomes a learnable choice instead of a geometric inevitability.
4. $$\text{Attention}(Q,K,V) = \text{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right)V$$
   with $\sqrt{d_k}$ because random $d_k$-dimensional dot products wander to $\pm\sqrt{d_k}$
   (drunkard's walk) and would saturate the softmax; softmax because mixing weights must be
   positive and sum to 1 while preserving score order.

"Nailed it" only if both diseases in step 2 are stated *with their reasons* — that's the actual
derivation; the rest is assembly.`,
    },
    {
      id: 'm2-l2-q5',
      kind: 'numeric',
      prompt: md`Two candidate tokens have scaled scores $2$ and $0$. What softmax weight does the
first one get? (Three decimals; $e^2 \approx 7.389$.)`,
      answer: 0.881,
      tolerance: 0.005,
      explain: md`$w_1 = \dfrac{e^2}{e^2 + e^0} = \dfrac{7.389}{8.389} \approx 0.881$. A lead of
just $2$ in score-land is already an $88/12$ landslide in weight-land — feel how fast the exponent
amplifies, and why unscaled scores of $\pm 11$ would be winner-take-all.`,
    },
    {
      id: 'm2-l2-q6',
      kind: 'written',
      prompt: md`**Run the machine by hand** (paper, all steps): tokens with
$\mathbf{q}_1 = (1, 1)$; keys $\mathbf{k}_1 = (1, 0)$, $\mathbf{k}_2 = (0, 2)$; values
$\mathbf{v}_1 = (2, 0)$, $\mathbf{v}_2 = (0, 1)$; $d_k = 2$. Compute token 1's two scaled scores,
both softmax weights, and the final mixed output vector. ($\sqrt2 \approx 1.414$,
$e^{0.707} \approx 2.028$, $e^{1.414} \approx 4.113$.)`,
      rubric: md`**Scores:** $s_1 = \mathbf{q}_1\cdot\mathbf{k}_1/\sqrt2 = 1/1.414 \approx 0.707$;
$\;s_2 = \mathbf{q}_1\cdot\mathbf{k}_2/\sqrt2 = 2/1.414 \approx 1.414$.

**Softmax:** $e^{0.707} \approx 2.028$, $e^{1.414} \approx 4.113$, sum $\approx 6.141$:
$w_1 \approx 2.028/6.141 \approx 0.330$, $\;w_2 \approx 4.113/6.141 \approx 0.670$.

**Output:** $0.330\,(2,0) + 0.670\,(0,1) \approx (0.660,\; 0.670)$.

All three stages shown with arithmetic = nailed it. Weights that don't sum to $\approx 1$, or values
mixed with raw scores instead of softmax weights, are the classic slips — partial at best.`,
    },
    {
      id: 'm2-l2-q7',
      kind: 'mcq',
      prompt: md`Attention's output for a token is $\sum_j w_{ij}\mathbf{v}_j$ with
$w_{ij} \ge 0$, $\sum_j w_{ij} = 1$. Which statement about what attention can produce is correct?`,
      options: [
        'The output can be any vector in the embedding space, since the weights are learned',
        'The output is trapped in the convex hull of the value vectors — attention routes and blends existing information but cannot invent outside it',
        'The output always equals one of the value vectors, since softmax picks a winner',
        'The output is always longer than the largest value vector, since contributions add up',
      ],
      answer: 1,
      explain: md`Positive weights summing to 1 = convex combination = center-of-mass, which must
lie inside the shrink-wrap of the ingredients. Option C tempts because softmax often *approaches*
one-hot, but it never exactly picks — it blends. Option D has it backwards: averaging *shrinks*
(the mixture can't be longer than the longest ingredient). This limit is why the FFN exists —
attention is the communication step, not the computation step.`,
    },
    {
      id: 'm2-l2-q8',
      kind: 'numeric',
      prompt: md`Token 1's attention weights are $w = (0.7, 0.3)$ over values
$\mathbf{v}_1 = (2, 0)$ and $\mathbf{v}_2 = (0, 1)$. What is the **first component** of the output
vector?`,
      answer: 1.4,
      tolerance: 0.01,
      explain: md`Output $= 0.7\,(2,0) + 0.3\,(0,1) = (1.4,\; 0.3)$ — first component $1.4$. The
mixing step is nothing but the weighted-average arithmetic you learned in school, done on vectors.`,
    },
    {
      id: 'm2-l2-q9',
      kind: 'mcq',
      prompt: md`Doubling the context length of a transformer multiplies the *work and memory of the
attention score computation* by roughly:`,
      options: ['2× — one extra score per new token', '4× — every token scores every token', 'It stays the same — the matrices are fixed', '8× — the cost is cubic'],
      answer: 1,
      explain: md`$n$ tokens each score all $n$ tokens: $n^2$ scores. Doubling gives
$(2n)^2 = 4n^2$: four times the work. Option A is the intuitive trap — it counts the new tokens' rows but
forgets every *old* token also gains new columns to score. This quadratic is the single number
behind the entire long-context research industry (FlashAttention, sliding windows, KV compression).`,
    },
    {
      id: 'm2-l2-q10',
      kind: 'numeric',
      prompt: md`**Fermi estimate (paper first, calculator last):** a 128,000-token context needs an
attention score matrix of $128{,}000 \times 128{,}000$ entries — *per head, per layer*. At 4 bytes
per entry, roughly how many **gigabytes** is that one matrix? (1 GB $\approx 10^9$ bytes; generous
tolerance — get the order of magnitude and the leading digits.)`,
      answer: 65,
      tolerance: 15,
      explain: md`$128{,}000^2 \approx 1.64 \times 10^{10}$ entries $\times$ 4 bytes
$\approx 6.5 \times 10^{10}$ bytes $\approx$ **65 GB** — one matrix, one head, one layer, before
storing anything else. Materializing it is obviously insane, which is precisely why FlashAttention
computes attention in tiles *without ever writing the full matrix down*, and why your estimate here
is the first line of that paper's motivation section.`,
    },
    {
      id: 'm2-l2-q11',
      kind: 'written',
      prompt: md`**The Feynman test — explain to a 12-year-old:** a classroom where every student
gets to improve their sentence by asking all the other students for help. Using that scene (or a
better one you invent — inventing is worth more), explain: what the query, key, and value are, why
the "how relevant are you to me" question is *not* symmetric, and why each student ends up with a
*blend* of helpers rather than copying the single best one. No math words allowed without a
kid-level explanation first.`,
      rubric: md`Grade the teaching, not the vocabulary:

1. **Three roles made concrete** — e.g. each student holds up a card saying what kind of help they
   *offer* (key), silently carries the actual help they'd *give* (value), and shouts what they
   *need* (query). Matching happens between shouts and cards; what changes hands is the help itself.
2. **Asymmetry with an example** — the kid confused about "it" desperately needs the kid who wrote
   about the ball; that kid needs nothing back. Help-needing is one-directional even when both
   students exist in the same room.
3. **Blending, not copying** — each student takes a *little from everyone in proportion to
   usefulness* (mostly from the most useful), because usefulness comes in degrees and committing
   100% to one helper throws away real information from the runner-up. (Bonus insight worth
   "nailed it" on its own: the blend is also what lets *learning* work — a hard pick-one-winner
   can't be nudged gradually.)
4. **Jargon audit**: "vector," "softmax," "dot product," "matrix" appearing without a kid-level
   translation = partial, no matter how correct the rest is.`,
    },
    {
      id: 'm2-l2-q12',
      kind: 'written',
      prompt: md`**Why a *soft* blend at all?** Suppose an engineer proposes: "softmax is wasteful —
just find the single highest-scoring token and copy its value (a hard argmax)." Write the case
against, on paper, from two independent directions: **(1)** the learning direction — what happens
to gradients when the selection is a hard argmax rather than a soft blend (recall lesson 1.3: what
does the loss's sensitivity to a *score* look like if an infinitesimal score change can't change
the output?), and **(2)** the information direction — a concrete sentence where blending two
sources beats copying one.`,
      rubric: md`**(1) Learning:** a hard argmax is a staircase — output identical for almost any
tiny score wiggle, then a sudden jump when the ranking flips. The derivative of the output with
respect to every score is $0$ almost everywhere (and undefined at the flip): gradient descent
receives *no signal* about how to improve scores. Softmax is the smooth ramp version — every score
wiggle moves every weight a little, so $\partial L/\partial \text{score}$ is informative
everywhere and the $W_Q, W_K$ matrices can actually train. (Sharpest students may note: softmax
*approaches* argmax as scores spread — the model can learn to be nearly-hard where that helps,
while staying differentiable. That's the same saturation dial from 1.1/1.4.)

**(2) Information:** any sentence needing two sources at once — e.g. "The robot lifted the ball
because **it** was heavy": resolving "it" wants the candidate *ball* AND the disambiguating
property *heavy*; copying only one loses the other half of the evidence. Blends preserve graded,
multi-source evidence; copies destroy it.

Both directions, each with its mechanism spelled out = nailed it. One direction only = partial.`,
    },
  ],
}
