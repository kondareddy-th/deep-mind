// Module 2, Lesson 6 — Assembling GPT: the whole machine, audited (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm2-l6',
  title: '2.6 The whole machine — assembling GPT',
  subtitle: md`"What I cannot create, I do not understand." Eleven lessons handed you every part.
Today: no new mechanisms — you assemble a text-predicting machine on paper and account for every
last parameter of a "7B" model, to nine digits.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle: the Feynman test, at model scale

When Richard Feynman died, his blackboard still carried the sentence: **"What I cannot create, I do
not understand."** Not *recite* — create. Build the thing from parts, with your own hands, and if
you can't, your "understanding" was a rented costume.

So here is the test, and it is the entire lesson. Over eleven lessons you have built, from scratch:
vectors and dot products (1.1), matrix machines (1.2), backpropagation and the residual highway
(1.3), softmax and temperature (1.4), cross-entropy (1.5), AdamW with warmup and cosine decay
(1.6), the case against recurrence (2.1), attention itself (2.2), multi-head attention (2.3),
rotary positions (2.4), and the full block — residual stream, norms, FFN (2.5). Two questions:

> **Can you assemble those parts, on paper, into a machine that predicts text?**
>
> **And when a lab stamps "7B" on the box — is that marketing, or a number you can reproduce from
> scratch and check to the last parameter?**

Today both answers become *yes*. Nothing new gets invented in this lesson; that's the point. If any
box in the diagram feels foggy, that's not a failure — it's a map, telling you exactly which lesson
to revisit. Let's build.

## The forward pass: every box, with its birth certificate

The machine, end to end — each stage stamped with the lesson where you built it:

| # | stage | what happens | built in |
|---|---|---|---|
| 1 | token ids | the text arrives pre-chopped into pieces from a 32,000-entry vocabulary | Module 3 opens here |
| 2 | embedding lookup | each id selects its row of a $32{,}000 \times 4096$ table: word $\to$ vector | 1.1 |
| 3 | $\times 32$ blocks | $\mathbf{x} \leftarrow \mathbf{x} + \text{Attn}(\text{Norm}(\mathbf{x}))$, then $\mathbf{x} \leftarrow \mathbf{x} + \text{FFN}(\text{Norm}(\mathbf{x}))$ | 2.5 |
|   | ... the Attn | causal, multi-head: 32 heads of 128 dims, queries meeting keys, $\sqrt{d_k}$, softmax, values mixed | 2.2, 2.3 |
|   | ... positions | RoPE rotates each query and key by an angle set by its position | 2.4 |
| 4 | final norm | one last RMSNorm tidies the stream | 2.5 |
| 5 | unembedding | a $32{,}000 \times 4096$ matrix turns the final vector into 32,000 scores (logits) | 1.2 |
| 6 | softmax | scores $\to$ a probability for every possible next token | 1.4 |

Read the right-hand column again slowly, because it is the payoff of two modules: **you built every
box.** The embedding table is 1.1's meaning-as-geometry, made a lookup. The blocks are 2.5's
tidy-talk-post, tidy-think-post, with 2.2's attention (your own derivation), 2.3's parallel
conversations, and 2.4's rotations inside. The unembedding is a plain matrix machine from 1.2 —
one learned row per vocabulary token, the final state dotted against all 32,000 of them (1.1's
agreement meter, run 32,000 times). The softmax is 1.4's score-to-belief converter. There is
nothing else in the machine. No hidden module marked "language understanding happens here." The
list above is *exhaustive*.

And training the machine is the other half of Module 1, reassembled: run the forward pass on real
text, score the predicted distribution against the actual next token with cross-entropy (1.5),
backpropagate one sensitivity to every parameter (1.3), and step with AdamW under a
warmup-then-cosine learning-rate schedule (1.6). Repeat on the order of a million times. That —
literally that loop — is where a language model comes from.
`,
    },
    {
      type: 'example',
      title: md`the audit: every parameter of Llama-7B, accounted`,
      md: md`
Config on the box: vocabulary $32{,}000$; $d_{\text{model}} = 4096$; $d_{\text{ff}} = 11008$;
$32$ layers; $32$ heads; no bias vectors anywhere (Llama dropped them all). We audit line by line —
grade-school multiplication only.

**The embedding table.** One 4096-dim vector per vocabulary entry:

$$32{,}000 \times 4096 = 131{,}072{,}000$$

**One block.** Attention: four projection machines $W_Q, W_K, W_V, W_O$, each $4096 \times 4096$
(the 32 heads of dimension 128 partition these — $32 \times 128 = 4096$ — adding no extra
parameters):

$$4 \times 4096^2 = 67{,}108{,}864$$

FFN: three matrices (up, gate, down), each $4096 \times 11008$:

$$3 \times 4096 \times 11008 = 135{,}266{,}304$$

Two RMSNorm gains: $2 \times 4096 = 8{,}192$. RoPE: zero — the rotations are computed from
position, not learned. Block total:

$$67{,}108{,}864 + 135{,}266{,}304 + 8{,}192 = 202{,}383{,}360$$

**All 32 blocks:** $32 \times 202{,}383{,}360 = 6{,}476{,}267{,}520$.

**Final norm:** $4{,}096$.

**Output head.** A second $32{,}000 \times 4096$ matrix: $131{,}072{,}000$. Note the shape — it is
exactly the embedding table's transpose-compatible twin, and some models (the 2017 transformer,
GPT-2) *tie* the two, sharing one matrix for both jobs. Llama does not: these 131M are separate,
learned parameters. (The ponder two sections down asks what tying would mean.)

**Grand total:**

$$131{,}072{,}000 + 6{,}476{,}267{,}520 + 4{,}096 + 131{,}072{,}000 = 6{,}738{,}415{,}616$$

Now the moment of truth: load the actual released Llama-7B checkpoint and count its parameters.
The number reported is $6{,}738{,}415{,}616$. **Match, to the last digit.** "7B" is not marketing —
it is $6.74$ billion, a number you just *generated* from five config values and arithmetic. That is
the Feynman test, passed: you didn't look the answer up; you created it, and reality agreed.
`,
    },
    {
      type: 'ponder',
      question: md`In the audit, the two vocabulary-facing pieces — embedding table and output
head, $131$M each — are the *largest single line items*, bigger than any one block. So is Llama-7B
mostly a vocabulary machine? Compute the fraction of the $6.74$B that faces the vocabulary, and
then — the more interesting question — guess how that fraction looked for tiny models like GPT-2
small (124M parameters, vocabulary 50,257, $d_{\text{model}} = 768$).`,
      answer: md`$\dfrac{131{,}072{,}000 + 131{,}072{,}000}{6{,}738{,}415{,}616} \approx
\dfrac{262\text{M}}{6{,}738\text{M}} \approx 3.9\%$. The model is **96% blocks**: the interface to
words is a thin crust, and virtually all capacity lives in the repeated talk-think engine — which
is two-thirds FFN (2.5), so over 64% of the entire model is feed-forward memory.

For GPT-2 small the picture inverts: $50{,}257 \times 768 \approx 38.6$M, and even counted once
(GPT-2 ties its embedding and head), that's $\approx 31\%$ of the whole model — nearly a third of
the machine spent just getting words in and out. Scaling grows the engine, not the dictionary:
vocabulary cost is fixed while block cost multiplies with width and depth, so big models spend
their budget almost entirely on *processing*, not *lookup*. When you meet a new model, this
fraction is a one-division diagnostic of how much of it is engine.`,
    },
    {
      type: 'text',
      md: md`
## One pass, two thousand exams: why training is parallel

Here is the economic miracle that made transformers take over, and it falls straight out of the
causal mask you built in 2.2. Feed a 2,048-token training sequence through the machine **once**.
Because every position's scores for future tokens were masked to $-\infty$, position $i$'s output
vector was computed from tokens $1..i$ *only* — so its prediction for token $i+1$ is a legitimate
exam answer, graded against a token the position never saw. And that holds for every $i$
simultaneously. One forward pass therefore produces $2{,}048$ honest predictions, $2{,}048$
cross-entropy grades (1.5), and one backward pass (1.3) collects the gradient from all of them at
once. Every prefix of the text is a training example, and they all ride the same matmuls — which
GPUs eat in parallel (1.2's rows-at-once, now positions-at-once). This was 2.1's verdict on
recurrence, cashed: the RNN had to *march* through those 2,048 positions one at a time; the
transformer grades the whole exam stack in one pass.

## And why generation is not

Now flip the machine from student to author, and watch the miracle refuse to come along.
To *write*, the model must run a loop: forward pass $\to$ probability distribution $\to$ **sample**
a token (temperature dial from 1.4) $\to$ append it to the text $\to$ forward pass again. Why can't
it emit 100 future tokens in one parallel pass, the way it grades 100 positions in training? Because
of a dependency no cleverness removes: **the input of step $t+1$ contains the output of step $t$.**
Until the machine has chosen word seven, the question "what follows word seven?" does not exist yet.
Training parallelizes because the full text already sits on the page — all 2,048 prefixes exist at
once. Generation is the model writing the page.

Worse, look at what the naive loop *wastes*. At each step it re-feeds the entire text so far —
including the 999 tokens it already processed last step. The weights are frozen (nothing changes at
inference) and the prefix is unchanged, so every key and value vector recomputed for those old
positions comes out **bit-for-bit identical** to last step's. The machine is doing an enormous
amount of work to rediscover what it computed one step ago and threw away. Surely — *surely* — we
could just remember those keys and values instead of recomputing them? Hold that thought precisely
where it is: it is the single most important idea in Module 3, it has a name, and you have just
independently invented the need for it.
`,
    },
    {
      type: 'example',
      title: md`generation, costed by hand`,
      md: md`
Put numbers on the waste. Prompt: $1{,}000$ tokens. Task: generate $1{,}000$ more, naively.

**Step 1:** process $1{,}000$ positions, sample token $1{,}001$.
**Step 2:** re-process $1{,}001$ positions (the first $1{,}000$ identically to before), sample
token $1{,}002$.
**Step $k$:** process $999 + k$ positions.

Total positions processed across all $1{,}000$ steps:

$$\sum_{t=1000}^{1999} t = \frac{(1000 + 1999) \times 1000}{2} = 1{,}499{,}500 \approx 1.5\text{ million}$$

Now count what was actually *new*: the whole session contains $2{,}000$ distinct token-positions.
The naive loop performed about $750$ position-computations per position of genuine novelty — over
$99.8\%$ of the work is recomputation of results that were already computed, discarded, and
recomputed again, unchanged. At Llama-7B's $\approx 202$M parameters per block, $32$ blocks, that
is trillions of multiply-adds spent rediscovering known answers.

And the recomputed quantities are not merely *similar* — they are **identical**: frozen weights
plus an unchanged prefix is the same function of the same input. This is not an approximation
opportunity; it is a memory opportunity. What exactly should be remembered (hint: whose keys and
values?), how much memory that costs at 128k-token contexts, and what that does to serving
economics — that is Module 3's opening act, and you'll find you can predict most of it.
`,
    },
    {
      type: 'ponder',
      question: md`Sharpen the asymmetry into one sentence you could defend at a whiteboard: why
does the causal mask let training grade 2,048 positions in one parallel pass, while generation —
run by the *same machine with the same mask* — must crawl one token at a time? And connect it to
2.1: which half of the sequential-versus-parallel tradeoff did the transformer actually solve?`,
      answer: md`Training is grading; generation is writing. In training, the complete text already
exists, so all 2,048 prefixes exist *simultaneously* — the mask merely ensures each position's
answer used only its own prefix, and one pass grades every exam at once. In generation the
prefixes do not all exist: the input of step $t+1$ **is** the output of step $t$, a genuine data
dependency — parallel hardware cannot compute a function whose input hasn't been produced. Same
machine, same mask; what differs is whether the future of the text is *known* (parallel) or
*being decided* (sequential).

The 2.1 connection, inverted: recurrent networks were sequential in training *and* generation; the
transformer fixed exactly one half. It bought parallel **training** — which is why it won, because
training cost is the barrier to building models at all — and kept sequential **generation**, which
is why *serving* models became its own science and its own bill. Every chatbot answer you have ever
watched appear word... by... word... is this ponder, rendered as user experience. (Researchers do
attack it — speculative decoding drafts several tokens cheaply and verifies them in one pass — but
verifying in parallel is still not choosing in parallel; the dependency itself is undefeated.)`,
    },
    {
      type: 'text',
      md: md`
## What is NOT in the box

An honest engineer lists what the machine *doesn't* contain. Look back at the diagram — it's all
there is, so these are checkable claims, not opinions:

- **No memory between runs.** Nothing persists from one conversation to the next except the frozen
  weights. The "conversation" is just an ever-longer prompt; clear the context and the machine has
  never met you.
- **No weight change at inference.** Generation is forward passes only — no loss, no backprop, no
  update. Correct the model's mistake mid-chat and all $6{,}738{,}415{,}616$ parameters remain
  bit-for-bit identical; your correction lives in the context window and dies with it.
- **No retrieval.** There is no database, no search, no lookup into anything beyond the weights.
  Whatever the model "knows," it knows the way lesson 2.5 described — patterns pressed into FFN
  key–value memories during training — with all the staleness that implies.

And yet — hold the inventory next to this fact — **in-context learning happens anyway**. Show the
frozen machine three examples of a made-up pattern in the prompt and it continues the pattern; the
weights never move. How? Part of the mechanism is one you met in 2.3: **induction heads**, attention
circuits that learn to find "...A B ... A" in the context and predict "B" — pattern-copying
machinery that emerges from plain next-token training, nobody having asked for it. Learning without
weight change, executed entirely in the attention patterns over the context. Be precise about the
word "emerges": it means researchers found these circuits *after the fact*, not that anything
mystical occurred — but nobody designed them, and that should raise your eyebrows about what else
is in there. (Module 6's whole job.)

## Exit ritual: read the founding paper

You are now qualified — genuinely, technically qualified — to read **"Attention Is All You Need"**
(Vaswani et al., 2017) start to finish. That is this module's exit ritual. One honest orientation
before you start: the paper builds an *encoder–decoder* for translation — two towers, with the
decoder also attending into the encoder ("cross-attention"). GPT-style models keep only the decoder
tower and drop the cross-attention. With that single remapping, every equation in the paper is
something you have derived. Take one guide-question per section:

| section | your guide question |
|---|---|
| 1–2 Introduction, Background | What exactly does the paper blame recurrence for — and is it the same bottleneck you met in 2.1? |
| 3.1 Encoder/decoder stacks | Find "residual connection" and "layer normalization." Is the 2017 wiring pre-norm or post-norm (2.5)? |
| 3.2 Attention | Read equation (1) and the footnote justifying $\sqrt{d_k}$ — is their argument your drunkard's walk (1.1)? How do they motivate multiple heads (2.3)? |
| 3.3 Position-wise FFN | What are their $d_{\text{model}}$ and $d_{\text{ff}}$ — and is the famous $4\times$ expansion (2.5) already there in 2017? |
| 3.4 Embeddings and softmax | Do they tie the embedding matrix to the pre-softmax matrix? (Compare with Llama's choice in today's audit.) |
| 3.5 Positional encoding | What do the sinusoids provide, and what did 2.4's RoPE change about *where* position enters? |
| 4 Why self-attention | In Table 1, find the $n^2$ you counted in 2.2. Which column is it, and what do they trade it against? |
| 5 Training | Find warmup in the learning-rate formula of 5.3. How many warmup steps — and why did 1.6 say warmup exists? |
| 6–7 Results, conclusion | The paper never mentions chatting. What was the actual task — and what does that teach you about how architectures outgrow their birthplaces? |

Answer on 3.3, so you can check your calibration: $d_{\text{model}} = 512$,
$d_{\text{ff}} = 2048$ — the $4\times$ ratio was there from day one, seven years and three orders
of magnitude of scale before Llama. Forced shapes travel.
`,
    },
    {
      type: 'ponder',
      question: md`The shape coincidence from the audit: the output head is $32{,}000 \times 4096$
and the embedding table is $32{,}000 \times 4096$. **Weight tying** shares one matrix between the
two jobs. Three questions: what would the logit for token $t$ *mean* under tying (write it as an
operation from 1.1)? Exactly how many parameters does tying save here? And why might a large model
*want* the two matrices to differ — what is each one actually for?`,
      answer: md`Under tying, the logit for token $t$ is the **dot product of the final residual
state with token $t$'s own embedding** — lesson 1.1's agreement meter as the entire output layer:
"predict whichever token's meaning-vector this state most agrees with." Elegant, symmetric,
and it saves exactly $32{,}000 \times 4096 = 131{,}072{,}000$ parameters.

Why untie, then? Because the two jobs are cousins, not twins. The embedding row for *cat* must
represent "what *cat* means when it has just been **read**" — input semantics. The head row for
*cat* must represent "what the stream looks like just before *cat* should be **written**" —
a prediction template, warped by things like how frequent the token is and which contexts precede
it. Related directions, but no law makes them equal, and forcing equality spends optimization
effort reconciling two jobs in one vector. The economics decide: for GPT-2, 38.6M shared
parameters were $\approx 31\%$ of the model — tying was a huge saving, so GPT-2 tied (as did the
2017 paper). For Llama-7B, 131M is under $2\%$ of $6.74$B — pocket change — so Llama bought the
extra freedom. Same tradeoff, opposite verdicts, both correct at their scale. Design choices in
this field are rarely theorems; they are budget lines.`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The whole machine, assembled from your own parts:** ids $\to$ embedding (1.1) $\to$ 32 blocks
   of tidy-talk-post, tidy-think-post (2.2–2.5) $\to$ final norm $\to$ unembedding matrix (1.2)
   $\to$ softmax (1.4) $\to$ next-token distribution — trained by cross-entropy (1.5), backprop
   (1.3), and AdamW with warmup+cosine (1.6). Every box has your fingerprints on it.
2. **The audit, to nine digits:** $131{,}072{,}000 + 32 \times 202{,}383{,}360 + 4{,}096 +
   131{,}072{,}000 = 6{,}738{,}415{,}616$. "7B" is checkable arithmetic, 96% of it blocks, roughly
   two-thirds of it FFN memory — and you checked it against the shipped model.
3. **The great asymmetry:** the causal mask makes training parallel — 2,048 exams graded per pass —
   while generation stays sequential, because step $t+1$'s input is step $t$'s output. The naive
   loop recomputes $\approx 750\times$ more than it must, all of it bit-identical — a memory
   opportunity with a name you'll learn in Module 3.
4. **The honest inventory:** no memory across runs, no weight change at inference, no retrieval —
   and yet in-context learning emerges from attention circuits (induction heads, 2.3) nobody
   designed.
5. **Admission ticket:** you can read the 2017 paper as a peer — checking their $\sqrt{d_k}$
   argument against your drunkard's walk, their post-norm against your highway, their tied
   embeddings against your audit.

**Module 2 is complete. You have created the machine; by the blackboard standard, you understand
it.** Module 3 asks the questions that begin the moment it has to actually *run*: where do the
32,000 token ids really come from (tokenizers, and the strange bugs they cause)? Once you have the
distribution, how should you actually pick — temperature, top-k, top-p? How does the
remember-don't-recompute idea work, exactly, and what does its memory cost at long context (the KV
cache)? And why is serving a model to a million people its own science with its own bill? The
machine is built. Next: making it run.
`,
    },
  ],
  questions: [
    {
      id: 'm2-l6-q1',
      kind: 'mcq',
      prompt: md`A single 2,048-token sequence is fed through a GPT-style model **once** during
training. How many next-token training signals does that one forward pass produce, and why?`,
      options: [
        md`One — the model makes one next-token prediction per forward pass`,
        md`2,048 — the causal mask guarantees each position's output used only earlier tokens, so every position's prediction of its next token is a simultaneously valid, gradeable exam answer`,
        md`2,048 — because the batch holds 2,048 independent sequences`,
        md`32,000 — one signal per vocabulary entry in the softmax`,
      ],
      answer: 1,
      explain: md`Every prefix of the sequence is a training example, and the mask (scores to
$-\infty$ for $j > i$, from 2.2) is what makes grading all of them in one pass *honest* — no
position ever peeked at its own answer. The first option is the classic trap: it describes
**generation**, where only the final position's prediction gets used; confusing the two modes is
exactly what this lesson's asymmetry section untangles. The batch option confuses sequence length
with batch size (a real batch multiplies the count further). The 32,000 option confuses output
*width* (logits per position) with training *signals* (one graded token per position).`,
    },
    {
      id: 'm2-l6-q2',
      kind: 'numeric',
      prompt: md`Llama-7B's embedding table: 32,000 vocabulary entries, each a 4,096-dimensional
vector. How many parameters, **in millions**? (Paper first — it's one multiplication.)`,
      answer: 131,
      tolerance: 5,
      explain: md`$32{,}000 \times 4096 = 131{,}072{,}000 \approx 131$M — and the untied output
head costs the same again. Together they are the two biggest single line items in the audit, yet
only $\approx 3.9\%$ of the model: the dictionary is a thin crust on a very large engine.`,
    },
    {
      id: 'm2-l6-q3',
      kind: 'mcq',
      prompt: md`What is the machine that converts the final 4,096-number residual state into a
score for each of the 32,000 vocabulary tokens?`,
      options: [
        md`A plain learned $32{,}000 \times 4096$ matrix — the state is dotted with one learned row per token (1.2's row picture), and softmax then turns the 32,000 scores into probabilities`,
        md`The softmax layer itself, using its 32,000 learned per-token temperature parameters`,
        md`A reverse tokenizer that looks the vector up in the embedding table to find the closest stored word`,
        md`The transpose of the embedding matrix — by definition, in every transformer, the same weights serve both directions`,
      ],
      answer: 0,
      explain: md`The unembedding is the most ordinary object in the whole machine: one matrix,
32,000 rows, each row a learned template dotted against the final state — 1.1's agreement meter run
across the entire vocabulary. The softmax option tempts because softmax *is* the last step, but it
has **zero parameters** — it is pure arithmetic (1.4); temperature is a knob you turn, not a weight
that trains. The lookup option fails because the final state is a freshly computed vector that
appears in no table — scoring, not searching. The transpose option is the subtle one: tying *is*
real (the 2017 paper and GPT-2 do it) but it is a design choice, not a definition — Llama keeps a
separate 131M-parameter head, as the audit showed.`,
    },
    {
      id: 'm2-l6-q4',
      kind: 'written',
      prompt: md`**Shape-audit the machine** (paper, every stage): trace $n = 100$ tokens through
Llama-7B and write the tensor shape at each point — after embedding; inside one block: one head's
$Q$, $K$, $V$, one head's attention score matrix, attention's output after $W_O$, the FFN hidden
layer, the block output; then the final logits, and the shape after softmax. (Heads: 32 of
dimension 128.) State the rule from 1.2 that the whole chain obeys, and point out the one shape
that *must* equal another for the architecture to work at all — and why.`,
      rubric: md`The chain, one row per token throughout:

- After embedding: $100 \times 4096$.
- One head's $Q$, $K$, $V$: $100 \times 128$ each (32 such heads; together they span the
  full $100 \times 4096$).
- One head's score matrix: $(100 \times 128)(128 \times 100) \to 100 \times 100$ — the $n^2$
  object from 2.2, one score per pair of positions.
- Attention output after $W_O$: $100 \times 4096$.
- FFN hidden: $100 \times 11{,}008$; FFN output: back to $100 \times 4096$.
- Block output: $100 \times 4096$.
- Logits: $(100 \times 4096)(4096 \times 32{,}000) \to 100 \times 32{,}000$.
- After softmax: still $100 \times 32{,}000$, but now each **row sums to 1** — one probability
  distribution per position (1.4).

**The rule:** shapes must chain — $(m \times n)(n \times p) \to (m \times p)$, inner dimensions
matching (1.2). **The forced equality:** every sublayer's output must be $100 \times 4096$, exactly
its input's shape, because the residual addition $\mathbf{x} + f(\mathbf{x})$ is only defined for
matching shapes — the residual stream freezes the model's width for the entire depth of the
machine; that is *why* the FFN must contract back from 11,008 and attention's $W_O$ must land back
on 4096. Full credit: all shapes right, the row-sums-to-1 observation, the chaining rule named,
and the residual-forces-constant-width point made explicitly.`,
    },
    {
      id: 'm2-l6-q5',
      kind: 'numeric',
      prompt: md`One Llama-7B block: attention $4 \times 4096^2$, FFN $3 \times 4096 \times 11008$,
two norm gains $2 \times 4096$. Total parameters for the block, **in millions**?`,
      answer: 202,
      tolerance: 6,
      explain: md`$67{,}108{,}864 + 135{,}266{,}304 + 8{,}192 = 202{,}383{,}360 \approx 202$M.
Thirty-two of these make $6.48$B — 96% of the whole model. Notice the norms' share: $8{,}192$ of
$202$M is $0.004\%$, yet remove them and training collapses. Parameter count measures capacity,
not importance.`,
    },
    {
      id: 'm2-l6-q6',
      kind: 'mcq',
      prompt: md`During generation you turn the temperature down from $1.0$ toward $0$. What
actually happens?`,
      options: [
        md`The next-token distribution sharpens toward the highest-scoring token; at the limit, sampling becomes deterministic argmax (greedy decoding)`,
        md`The model deliberates longer on each token, improving the quality of its reasoning`,
        md`The weights are scaled down, making the model's behavior more conservative`,
        md`The vocabulary is truncated to only the most common tokens`,
      ],
      answer: 0,
      explain: md`Temperature divides the logits before softmax (1.4): $T < 1$ stretches the gaps
between scores, and softmax lives in exponent-land where stretched gaps become landslides — at
$T \to 0$ the top logit takes probability 1. The "deliberates longer" option is the
anthropomorphizing trap: compute per token is *identical* at every temperature — the forward pass
doesn't know the dial exists; only the final sampling step changes. The weights option violates the
frozen-at-inference rule (nothing touches the 6.74B numbers, ever). The vocabulary option confuses
temperature with truncation-style sampling (top-k / top-p — Module 3); under pure temperature,
every token keeps nonzero probability until exactly $T = 0$.`,
    },
    {
      id: 'm2-l6-q7',
      kind: 'written',
      prompt: md`**Derive, don't recall — the great asymmetry.** On paper: **(a)** show why one
forward pass over a complete $n$-token text legitimately trains all $n$ positions — state precisely
what the causal mask guarantees about position $i$'s output, and why that makes grading its
prediction of token $i+1$ fair. **(b)** Show why the same machine cannot generate $n$ tokens in one
parallel pass — name the exact dependency and explain why no amount of hardware removes it.
**(c)** Connect to 2.1: which half of the RNN's sequential problem did the transformer solve, and
which half survives in every chatbot you've used?`,
      rubric: md`**(a)** The mask overwrites scores for all $j > i$ with $-\infty$ before the
softmax (2.2), so position $i$'s output vector is a function of tokens $1..i$ **only**. During
training the full text is on the page, so all $n$ prefixes exist simultaneously; position $i$'s
predicted distribution is graded by cross-entropy (1.5) against token $i+1$ — a token provably
outside its view, so the exam is honest — and all $n$ gradings ride one parallel pass, since
they're rows of the same matmuls (1.2).

**(b)** The dependency: generation's step $t+1$ takes as *input* the token *sampled from step
$t$'s output*. Output feeds input — before step $t$ completes, step $t+1$'s input **does not
exist**, and no processor can evaluate a function of a value that hasn't been produced. This is a
data dependency, not a resource limit: a million GPUs shorten nothing, because the chain's length
is the number of decisions, not the amount of arithmetic. (Bonus: speculative decoding drafts
ahead and *verifies* in parallel — a bet on the dependency's outcome, not an escape from it.)

**(c)** RNNs were sequential in both training and generation. The transformer solved exactly the
training half — the half that gated whether large models could be built at all (2.1) — and kept
sequential generation, which is why serving became its own discipline and why text still appears
word by word. Full credit requires: the mask's guarantee stated precisely in (a), the
output-becomes-input dependency *named* in (b) (not just "it's sequential"), and the inversion in
(c).`,
    },
    {
      id: 'm2-l6-q8',
      kind: 'numeric',
      prompt: md`**Fermi estimate — the audit, reproduced from scratch (paper only until the last
multiply):** from the config — vocab 32,000; $d_{\text{model}}$ 4,096; $d_{\text{ff}}$ 11,008; 32
layers; per layer 4 attention matrices, 3 FFN matrices, 2 norm gains; separate output head; final
norm — compute Llama-7B's total parameter count, **in billions**. (Generous tolerance: reproduce
the structure of the audit, and the digits follow.)`,
      answer: 6.74,
      tolerance: 0.5,
      explain: md`Embeddings $131$M $+\;32 \times (67.1\text{M} + 135.3\text{M} + 8\text{K})
\approx 32 \times 202.4\text{M} = 6.48\text{B}$, $+$ head $131$M $+$ final norm $4$K
$= 6{,}738{,}415{,}616 \approx 6.74$B. The point of doing it yourself: "7B" stops being a brand
and becomes a checksum. This is the same audit a researcher runs, in their head, in thirty
seconds, on every new model card they read — and it catches real errors in real papers
surprisingly often.`,
    },
    {
      id: 'm2-l6-q9',
      kind: 'mcq',
      prompt: md`After an hour-long conversation in which you taught the model your name, corrected
three of its mistakes, and got noticeably better answers — what has changed **inside its weights**?`,
      options: [
        md`Nothing — all 6,738,415,616 parameters are bit-for-bit identical; every apparent adaptation lives in the growing context window and vanishes with it`,
        md`Small gradient updates from your corrections have fine-tuned it slightly toward your preferences`,
        md`The embedding table has gained entries for the new words and names you introduced`,
        md`Only the attention matrices adapted to your style; the FFN memories stay frozen`,
      ],
      answer: 0,
      explain: md`Inference is forward passes only: no loss is computed, so there is nothing to
backpropagate and no update rule ever runs — training and inference are disjoint modes. The
gradient-update option tempts precisely because the model *behaves* as if it learned; but that
adaptation is in-context learning — patterns held in attention over the conversation (induction
heads, 2.3) — computation over activations, not modification of weights, gone when the context is
gone. The embedding option fails because the vocabulary is fixed at 32,000 forever; your name is
spelled from existing subword pieces (Module 3). The last option invents a distinction that exists
nowhere: at inference, *no* matrix updates — not attention, not FFN, nothing.`,
    },
    {
      id: 'm2-l6-q10',
      kind: 'numeric',
      prompt: md`Across the **entire** 6.74B model, what **percentage** of parameters sits in FFN
matrices? ($32 \times 135.27$M of FFN; total $6{,}738$M. Paper first.)`,
      answer: 64,
      tolerance: 5,
      explain: md`$32 \times 135{,}266{,}304 = 4{,}328{,}521{,}728$, and
$4{,}328.5 / 6{,}738.4 \approx 64\%$. The two lenses agree: FFNs are two-thirds of each block
(2.5), blocks are 96% of the model, so roughly two of every three parameters you download are
feed-forward memory — the model is, by weight, mostly the think-step. When Module 6 goes hunting
for where knowledge lives, this number says where to point the flashlight first.`,
    },
    {
      id: 'm2-l6-q11',
      kind: 'written',
      prompt: md`**The honest memo.** Your product manager proposes three launch features for a
raw Llama-7B: "it will remember each customer between sessions, permanently learn from their
corrections, and quote live prices." Write the memo: for each feature, state whether the raw
machine does it, and *point to the architecture* (the diagram you assembled — where state does and
does not live) to justify the answer and name what would have to be added. Then include the
counterweight: one genuinely surprising thing the frozen machine CAN do, with its mechanism
sketched honestly.`,
      rubric: md`A complete memo makes four architecture-grounded calls:

1. **Memory between sessions — no.** The machine's only persistent state is the frozen weights;
   everything else is the prompt. Cross-session memory requires an added system that stores
   conversation data and re-injects it into future contexts (or periodic fine-tuning) — a system
   *around* the model, not in it.
2. **Permanent learning from corrections — no.** Inference runs no loss and no backprop; weights
   are bit-for-bit unchanged by any conversation. Corrections persist only while they sit in the
   context window. Permanence requires an actual training pipeline (fine-tuning), with its own
   costs and risks.
3. **Live prices — no.** There is no retrieval anywhere in the forward pass; all knowledge is
   pressed into FFN key–value memories (2.5) at training time and is exactly as stale as the
   training data. Live data requires bolting on retrieval or tool calls that paste results into
   the context.
4. **The counterweight — in-context learning.** Despite frozen weights, a few examples in the
   prompt teach the machine a pattern for the rest of that context; mechanism sketch: attention
   circuits, notably induction heads (2.3), that find "...A B ... A" and predict "B" — learning
   executed in activations over the context, not in weights, which is precisely why it evaporates
   when the session ends (consistent with call 1, and worth *saying* it's consistent).

Full credit: all three denials each tied to a specific architectural fact (where state lives), the
add-on named for each, and the counterweight with mechanism. A memo that says "it can't because
it's just predicting text" without pointing at the architecture is the hand-waving this question
exists to cure.`,
    },
    {
      id: 'm2-l6-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old** (write it out — the Feynman technique is *the*
test of ownership). The machine only ever plays one game: *guess the next word*. Explain to the
kid: **(1)** how a whole story comes out of a machine that only guesses one next word — walk the
loop concretely with a real example; **(2)** how it got good at guessing (what it practiced on, and
what "practice" means for a machine with billions of tiny dials — you may borrow lesson 1.3's kid
picture or invent better, and inventing is worth more); and **(3)** one thing kids assume it can
do that it truly cannot, and why. No unexplained technical words.`,
      rubric: md`Grade the teaching. A "nailed it" answer must:

1. **Make the loop concrete and circular:** e.g. start with "The dragon opened its" — the machine
   guesses "eyes," and now the *question changes*: "The dragon opened its eyes" is the new question,
   and it guesses again, and again — each guess becomes part of the next question, which is the
   whole trick: a story is just thousands of next-word guesses, each one stacked on the machine's
   own previous answers. The answer must convey that the machine's own output feeds back in — not
   merely "it guesses many times."
2. **Make practice concrete:** it read mountains of text and played the game on all of it —
   covering the next word, guessing, peeking, and after every guess nudging its billions of tiny
   dials a hair in the direction that would have made the guess better; repeated so many times
   that good guessing emerged. (A borrowed or fresh kid-analogy for the dials — spice knobs,
   tuning pegs — is expected; a fresh one earns extra.)
3. **Name a real absence honestly:** e.g. it cannot remember the kid from yesterday (when the chat
   ends, its scratch paper is thrown away — nothing about the conversation is kept anywhere), or
   it cannot learn new things while chatting (the dials are locked once practice ends; it only
   *seems* to learn while the conversation's notes are still in front of it). The *why* must
   connect to where things are kept, in kid words.
4. **Jargon audit:** "token," "parameters," "weights," "inference," "neural network," "context
   window" — absent, or explained in kid words first. Any unexplained jargon caps the grade at
   partial; hiding behind vocabulary is exactly the failure mode this exercise exists to catch.`,
    },
  ],
}
