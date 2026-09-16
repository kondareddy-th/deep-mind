// Module 3, Lesson 3 — The KV cache (anchor lesson, Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm3-l3',
  title: '3.3 The KV cache — remember, don’t recompute',
  subtitle:
    'Lesson 2.6 ended on a cliffhanger: generation recomputes the entire prefix for every new token. The fix is one idea — remember instead — and following it honestly leads straight to why long context is a memory problem, and why modern GPUs spend their lives moving bytes.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle, inherited

Lesson 2.6 left a deliberate splinter in your mind. Generation is a loop: run the model on the
text so far, sample one token (3.2), append it, run the model again. Watch what that costs.
Generating token 1001 means a forward pass over 1001 positions. Token 1002: a pass over 1002.
Every step reprocesses *everything* — the prompt you wrote ten minutes ago gets pushed through all
32 layers again, and again, and again, once per generated token.

Count the waste for a 1000-token reply: $1 + 2 + \cdots + 1000 \approx \frac{1000^2}{2} = 500{,}000$
position-computations, when only $1000$ positions of *new* text ever came into existence. We are
doing roughly **500× more work than the text contains**. Your chat with Claude would be unusable.
It isn't — so somebody found the exit. The exit is one question asked stubbornly:

> When the model processes "The cat sat" for the 800th time, is *anything* about those three
> tokens' computation different from the 799th time?

If the answer is no — and we're going to *prove* it's no — then all that recomputation is
recomputing identical numbers, and identical numbers can be **stored instead**.

## What exactly stays frozen — the proof

The claim: **under the causal mask, a token's entire computation is untouchable by everything that
comes after it.** Not approximately — bit-for-bit.

Follow one token, position $j$, up through the layers, and ask at each stage: what does this
depend on?

- **Layer 0 (embedding + position):** token $j$'s starting vector depends on its token id and its
  position $j$. Tokens after $j$: not consulted.
- **Any attention sublayer:** position $j$'s query scores against keys at positions $\le j$ *only*
  — the causal mask sets every future score to $-\infty$ (lesson 2.2). Its output mixes values
  from positions $\le j$ only.
- **Any FFN sublayer:** operates on position $j$'s own vector, alone (lesson 2.5's division of
  labor: FFN = computation *within* a token).

So by induction up the stack: **position $j$'s representation at every layer is a function of
tokens $1 \dots j$ and nothing else.** Appending token $n{+}1$ changes *no* number anywhere in
columns $1 \dots n$. The 800th forward pass over "The cat sat" produces, to the last bit, the
numbers the 1st one did.

Now, which of those frozen numbers does the *future* actually need? A new token's computation
touches the past in exactly one place: attention, where its query reads the past's **keys** (to
score) and **values** (to mix). That's the complete shopping list. Store every position's
$\mathbf{k}$ and $\mathbf{v}$ at every layer — the **KV cache** — and each new step only has to:

1. compute the new token's own column (its q, k, v and FFN work at each layer),
2. attend: new $\mathbf{q}$ against all cached $\mathbf{k}$s, mix the cached $\mathbf{v}$s,
3. append the new $\mathbf{k}, \mathbf{v}$ to the cache.

Work per step: **one column**, not $n$. The 500,000 shrinks back to 1000.
`,
    },
    {
      type: 'ponder',
      question: md`The cache stores every position's keys and values. Conspicuously absent: the
**queries**. Why does nobody cache $\mathbf{q}$? (Ask: who ever *reads* a query, and when?)`,
      answer: md`A query is read at exactly one moment: when its own token is the newest one,
scoring the past. The next step, a *newer* token asks the questions — and old tokens never ask
again. Keys and values are the *answers* the past keeps giving forever; queries are *questions
asked once*. Storing them would be keeping a stack of used exam papers: perfectly preserved,
never consulted. (This asymmetry is also a preview of a deep serving fact — the question-side and
answer-side of attention have completely different lifetimes, which is exactly what GQA exploits
a few sections from now.)`,
    },
    {
      type: 'ponder',
      question: md`The whole proof leaned on the causal mask. BERT-style models attend
*bidirectionally* — every token sees the whole sentence. Could BERT use a KV cache to generate
text one token at a time?`,
      answer: md`No — and seeing why locks in the real lesson. Append a token to a bidirectional
model and every earlier position's attention row changes (there's a new column to score, with no
mask hiding it), so every representation at every layer shifts. Nothing is frozen; there is
nothing safe to cache. **Caching isn't a GPU trick — it's a *property of the causal factorization*
from lesson 1.4.** The chain rule $p(w_1 \dots w_n) = \prod_i p(w_i \mid w_{<i})$ is what makes
"the past never changes" true, and the KV cache is that mathematical fact converted into gigabytes
and milliseconds. Architecture decisions are cache decisions.`,
    },
    {
      type: 'viz',
      viz: 'kv-cache',
      caption:
        'Generation made visible: columns = token positions, rows = layers; each cube is one position’s cached K/V at one layer. Coral flash = computed this step; steel blue = sitting in cache. Three experiments: (1) prefill the prompt, then +1 token repeatedly — with the cache ON, each step computes exactly one new column; (2) flip KV cache OFF and generate — watch the ENTIRE grid re-flash every single step, and the waste-ratio counter climb; (3) run ▶▶ generate all in both modes and compare the final work counters — that ratio is why your chat responds in seconds',
    },
    {
      type: 'example',
      title: 'the bill, line by line — Llama-7B',
      md: md`
Nothing is free. We bought speed; the currency is memory. Price it for Llama-7B in fp16
(2 bytes per number), whose 32 layers each cache one 4096-dim key and one 4096-dim value per
position:

**Per token:**

$$\underbrace{2}_{K \text{ and } V} \times \underbrace{32}_{\text{layers}} \times \underbrace{4096}_{\text{dims}} \times \underbrace{2}_{\text{bytes}} = 524{,}288 \text{ bytes} \approx \textbf{0.5 MB per token}$$

Half a megabyte of bookkeeping for every token of conversation — feel how heavy that is.

**A 4096-token context:** $0.5 \text{ MB} \times 4096 \approx \textbf{2.1 GB}$ — on top of the
13.5 GB of weights. Noticeable, manageable.

**A 128k-token context** (a long novel-length chat): $0.5 \text{ MB} \times 131{,}072 \approx
\textbf{69 GB}$ — the cache is now **five times larger than the model itself**. One conversation.

There is the punchline of modern inference, and you derived it from a per-token multiplication:
**long context is not a compute problem, it is a memory problem.** When you read that some model
"supports 1M-token context," your first reflex should now be: *where are they putting the cache?*
`,
    },
    {
      type: 'text',
      md: md`
## Shrinking the bill: GQA — share the answers, not the questions

Look again at the per-token bill. The $4096$ came from 32 attention heads × 128 dims each
(lesson 2.3) — every head keeps its *own* private keys and values. Do they need to?

Here's the asymmetry the first ponder handed us: heads' *queries* are their personalities — 32
different questions asked of the past, and we saw in 2.3 how differently they probe. But must the
past supply 32 *separately stored* answer-sheets? What if groups of query heads **shared** one set
of keys and values?

That's **grouped-query attention (GQA)**: keep all 32 query heads, but only, say, 8 K/V head
groups — each serving 4 query heads. The cache shrinks by $32/8 = 4\times$: our 69 GB nightmare
drops to ~17 GB, and quality barely moves (the 32 questions survive; only the answer-sheets are
pooled). Push it to the extreme — *one* shared K/V head for all queries — and you have
multi-query attention (MQA), the maximum-savings, maximum-risk end of the dial. Llama-3-8B ships
with 32 query heads and 8 KV heads; nearly every model trained since 2023 does something like it.
Notice what kind of design decision this is: an *architecture* choice made almost entirely to
shrink a *serving-time* memory bill. The tail wags the dog, profitably.

## Two very different kinds of moment: prefill vs decode

The cache also splits generation into two phases with opposite personalities — and the split runs
the economics of every LLM API you've ever paid for:

- **Prefill** (your prompt): all prompt positions can be computed *at once* — big, parallel
  matrices, every column simultaneously, the mode transformers were born for (lesson 2.1's whole
  argument). GPUs devour it. This is the fast, cheap part — and why "input tokens" cost less than
  "output tokens" on every pricing page.
- **Decode** (the reply): one token at a time, by the data dependency of 2.6's final ponder —
  step $t{+}1$'s input *is* step $t$'s output. Each step does a sliver of arithmetic (one column!)
  but must consult the *entire* cache and the *entire* weights to do it. The GPU — a machine built
  for mountains of arithmetic — spends the step mostly *fetching bytes*.

Sit with that last sentence, because it's the door to the next lesson: during decode, the limiting
resource isn't the GPU's ability to multiply. It's the speed at which memory can feed it. Why that
is, what number governs it, and the beautiful tricks that fight it (batching, speculative
decoding) — that's lesson 3.4.
`,
    },
    {
      type: 'ponder',
      question: md`You run a chat service. Ten users are mid-conversation, each at 32k tokens of
context, on one GPU serving Llama-7B (full MHA, no GQA). Do the memory arithmetic: what does the
cache bill come to, does it fit on an 80 GB GPU next to the 13.5 GB of weights — and what are your
escape hatches?`,
      answer: md`Per user: $0.5 \text{ MB} \times 32{,}768 \approx 17$ GB. Ten users:
$\approx 170$ GB of cache — plus 13.5 GB of weights, against 80 GB of GPU. You are over budget by
more than $2\times$ *before serving user eleven*. The escape hatches, all real and all used
together in production: **GQA** (÷4 to ÷8 by architecture, if you can retrain or switch models),
**quantize the cache** (fp16 → 8-bit or 4-bit K/V: ÷2 to ÷4), and **stop pre-reserving worst-case
blocks** — real conversations vary wildly in length, and paging the cache in small blocks (vLLM's
PagedAttention, borrowed from operating-system virtual memory) reclaims the enormous slack between
"could reach 32k" and "is actually at 3k." Serving at scale is this arithmetic, done seriously —
that's Module 4.`,
    },
    {
      type: 'example',
      title: 'three steps of cached generation, bookkept by hand',
      md: md`
Prompt: "The cat" (2 tokens), one layer shown, $d_k = 2$ toy numbers. Bookkeep exactly what is
computed and what is stored.

**Prefill (both prompt positions at once):** compute q, k, v for both columns; attention runs;
cache ends holding $[\mathbf{k}_1, \mathbf{k}_2]$, $[\mathbf{v}_1, \mathbf{v}_2]$. Say
$\mathbf{k}_1 = (1, 0)$, $\mathbf{v}_1 = (2, 0)$, $\mathbf{k}_2 = (0, 1)$, $\mathbf{v}_2 = (0, 1)$.

**Step 1 — generate token 3 ("sat"):** compute *only* token 3's column:
$\mathbf{q}_3 = (2, 2)$, $\mathbf{k}_3 = (1, 1)$, $\mathbf{v}_3 = (1, 1)$.
Attend: scores $\mathbf{q}_3 \cdot \mathbf{k}_{1,2,3}/\sqrt2 = (1.41,\; 1.41,\; 2.83)$ →
softmax $\approx (0.19,\; 0.19,\; 0.62)$ → output
$0.19(2,0) + 0.19(0,1) + 0.62(1,1) = (1.00,\; 0.81)$.
Append: cache is now $[\mathbf{k}_1, \mathbf{k}_2, \mathbf{k}_3]$, $[\mathbf{v}_1, \mathbf{v}_2, \mathbf{v}_3]$.
Columns 1–2: **untouched** — we read them, never recomputed them.

**Step 2 — generate token 4:** one new column again: q₄, k₄, v₄; q₄ scores against *four* cached
keys; k₄, v₄ appended. Total work so far: 2 (prefill) + 1 + 1 = 4 column-computations. Without
the cache it would have been 2 + 3 + 4 = 9. The gap only widens — by token 1000 it's ~500×.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The redundancy, quantified:** naive generation does $\sim N^2/2$ work for $N$ tokens of
   text — 500× waste at $N = 1000$.
2. **The freeze proof:** under the causal mask, position $j$'s entire stack of representations
   depends only on tokens $\le j$ — by induction over layers. Appending changes nothing behind it.
3. **The shopping list:** the future consults the past only through attention's keys and values —
   so cache exactly those. Queries are questions asked once; never cached.
4. **The bill:** ~0.5 MB per token for Llama-7B — 2.1 GB at 4k, **69 GB at 128k, five times the
   weights**. Long context is a memory problem.
5. **GQA/MQA:** share answer-sheets (K/V) across question-askers (Q heads) — ÷4 to ÷32 on the
   bill; the architecture bends to serve the cache.
6. **Prefill vs decode:** parallel-and-compute-hungry vs sequential-and-memory-hungry — the split
   behind every API pricing page.
7. **The deepest point:** caching is legal *because of* the causal factorization (1.4). A math
   choice from lesson one became gigabytes and milliseconds here.

Next lesson: why decode's byte-fetching, not arithmetic, sets your tokens-per-second — the
memory-bandwidth wall, derived with numbers you can check on a spec sheet.
`,
    },
  ],
  questions: [
    {
      id: 'm3-l3-q1',
      kind: 'mcq',
      prompt: md`What property of the transformer makes the KV cache *exactly correct* (bit-for-bit,
not an approximation)?`,
      options: [
        'GPUs have enough memory to store intermediate results',
        'The causal mask makes every position’s representations depend only on positions before it, so appending a token changes nothing already computed',
        'Keys and values are smaller than the full hidden states, so storing them is lossless',
        'The model’s weights are frozen at inference time',
      ],
      answer: 1,
      explain: md`It's the freeze proof: with causal masking, column $j$ at every layer is a
function of tokens $\le j$ — induction over embedding, masked attention, and per-position FFN.
Option D tempts hardest: frozen *weights* are necessary but nowhere near sufficient — BERT has
frozen weights too, and its bidirectional attention makes every representation shift when a token
is appended, so it has nothing safe to cache. A is backwards (memory is the *cost*, not the
license), and C confuses size with validity.`,
    },
    {
      id: 'm3-l3-q2',
      kind: 'numeric',
      prompt: md`Compute Llama-7B's KV-cache cost **per token, in kilobytes** (fp16): 32 layers,
4096-dim keys and values, 2 bytes per number. Work it on paper first: 2 × 32 × 4096 × 2 bytes,
then convert (1 KB = 1024 bytes).`,
      answer: 512,
      tolerance: 30,
      explain: md`$2 \times 32 \times 4096 \times 2 = 524{,}288$ bytes $= 512$ KB — half a
megabyte of cache for *every single token* of conversation. This one number, multiplied by context
length and concurrent users, is the load-bearing constraint of LLM serving.`,
    },
    {
      id: 'm3-l3-q3',
      kind: 'mcq',
      prompt: md`Why are **queries** never stored in the cache?`,
      options: [
        'Queries are larger than keys and values, so storing them would be wasteful',
        'Queries change at every generation step, so cached copies would immediately go stale',
        'A query is only ever used at the single step when its token is newest — no later step reads an old query',
        'Queries can be recomputed from the cached keys via the attention weights',
      ],
      answer: 2,
      explain: md`Attention's data flow: the *newest* token asks; the *past* answers with its keys
and values, forever. Old questions are never re-asked. Option B tempts because it sounds like the
right kind of reason — but cached prefix quantities never go stale (that's the freeze proof!); the
real point is old queries have no *reader*, stale or not. A is false (same shape), and D is
fiction — K and Q are independent projections.`,
    },
    {
      id: 'm3-l3-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall — the freeze proof.** On paper, prove that appending token
$n{+}1$ cannot change any cached number for positions $1 \dots n$. Structure it as induction over
the layer stack: state what the embedding layer of position $j$ depends on, then show the
inductive step through one attention sublayer (where exactly does the causal mask enter?) and one
FFN sublayer. Finish with the one-sentence reason a bidirectional model breaks the proof.`,
      rubric: md`**Base case:** position $j$'s layer-0 vector = embedding of token $j$ + position
info — depends on token $j$ alone.

**Inductive step (attention):** assume every layer-$(\ell{-}1)$ representation at positions
$\le j$ depends only on tokens $\le j$. At layer $\ell$, position $j$'s attention output uses its
own query and the keys/values of positions where the mask permits — scores at future positions are
$-\infty$, contributing weight exactly $0$ — so it reads only positions $\le j$, all of which (by
hypothesis) depend only on tokens $\le j$.

**Inductive step (FFN):** per-position by construction (2.5) — no new dependencies.

**Conclusion:** by induction, every layer's representation at position $j$ — including its
$\mathbf{k}$ and $\mathbf{v}$ — is a function of tokens $1..j$ only; appending token $n{+}1$
leaves columns $1..n$ bit-identical, so caching them is exact.

**Bidirectional breaker:** without the mask, position $j$ attends to the new token, so its
representations change on every append — nothing is frozen.

"Nailed it" requires the induction *structure* (base + both sublayer steps) and the mask named as
the exact point where the future is cut off — not just the slogan "the past can't see the future."`,
    },
    {
      id: 'm3-l3-q5',
      kind: 'numeric',
      prompt: md`Using the per-token figure of 512 KB: how many **gigabytes** of KV cache does one
Llama-7B conversation at a **4096-token** context hold? (1 GB ≈ 10⁶ KB is fine for estimation.)`,
      answer: 2.1,
      tolerance: 0.3,
      explain: md`$512 \text{ KB} \times 4096 \approx 2.1 \times 10^6$ KB $\approx 2.1$ GB —
alongside 13.5 GB of weights. At short contexts the cache is a passenger; the next question shows
it taking the wheel.`,
    },
    {
      id: 'm3-l3-q6',
      kind: 'numeric',
      prompt: md`**Fermi, and the punchline of the lesson:** at a **128k-token** context
(131,072 tokens), roughly how many **gigabytes** is Llama-7B's KV cache? Compare it to the
13.5 GB of model weights before answering — which is bigger, and by how much?`,
      answer: 69,
      tolerance: 15,
      explain: md`$512 \text{ KB} \times 131{,}072 \approx 6.9 \times 10^7$ KB $\approx 69$ GB —
about **five times the model itself**, for one conversation. Long context is a memory problem;
every long-context headline you read is secretly a claim about where the cache goes (GQA,
quantized K/V, paging, or sliding windows).`,
    },
    {
      id: 'm3-l3-q7',
      kind: 'mcq',
      prompt: md`Grouped-query attention (GQA) shrinks the KV cache by:`,
      options: [
        'Reducing the number of query heads so fewer questions are asked per layer',
        'Storing keys and values at lower precision than the weights',
        'Letting groups of query heads share one set of key/value heads, so fewer K/V copies are stored per position',
        'Caching only the most recent tokens and discarding the distant past',
      ],
      answer: 2,
      explain: md`GQA keeps all the *questions* (32 query heads keep their 32 personalities from
lesson 2.3) and pools the *answer-sheets*: 8 K/V groups serving 4 query heads each → cache ÷4.
Option B is a real technique (KV quantization) but it isn't GQA; D is sliding-window attention —
also real, also not GQA. The mnemonic from the ponder: share the answers, never the questions.`,
    },
    {
      id: 'm3-l3-q8',
      kind: 'numeric',
      prompt: md`Generating **1000** tokens: naive recomputation does $\approx N^2/2$
position-computations while the cached loop does $\approx N$. Roughly what is the waste **ratio**
(naive ÷ cached)?`,
      answer: 500,
      tolerance: 60,
      explain: md`$\frac{1000^2 / 2}{1000} = \frac{N}{2} = 500\times$. Note the shape of the
result: the waste ratio *grows with the reply length* — naive generation gets relatively worse the
longer it runs, which is why no serious system has ever shipped without a cache.`,
    },
    {
      id: 'm3-l3-q9',
      kind: 'mcq',
      prompt: md`Why does **prefill** (processing your prompt) run so much faster per token than
**decode** (generating the reply)?`,
      options: [
        'Prompt tokens are shorter and more common than generated tokens',
        'All prompt positions are known upfront, so they process in parallel as large matrix multiplications; decode must go one token at a time because each step’s input is the previous step’s output',
        'The KV cache only accelerates the prompt, not the reply',
        'Prefill skips the attention layers and only runs the FFNs',
      ],
      answer: 1,
      explain: md`Prefill is the transformer in its natural habitat — every column at once, giant
matmuls, compute-bound (2.1's parallelism argument, cashed). Decode is chained by the data
dependency of 2.6: token $t{+}1$'s input IS token $t$'s output, so it's one thin column per step,
spent mostly reading weights and cache — memory-bound. Option C is backwards: the cache is what
makes *decode* survivable. This asymmetry is why output tokens cost more than input tokens on
every API pricing page.`,
    },
    {
      id: 'm3-l3-q10',
      kind: 'written',
      prompt: md`**Run the bookkeeping by hand.** Prompt "AI is" (2 tokens), then generate 2 more.
One layer, toy numbers: after prefill the cache holds $\mathbf{k}_1 = (1,0)$, $\mathbf{v}_1 = (1,0)$,
$\mathbf{k}_2 = (0,1)$, $\mathbf{v}_2 = (0,2)$. Step 1 computes $\mathbf{q}_3 = (2,0)$,
$\mathbf{k}_3 = (1,1)$, $\mathbf{v}_3 = (1,1)$. With $d_k = 2$ ($\sqrt2 \approx 1.414$,
$e^{1.414} \approx 4.11$): compute step 1's attention scores, softmax weights, and output; state
exactly what the cache holds afterward; then state (no arithmetic needed) what step 2 must compute
and what it merely reads.`,
      rubric: md`**Step 1 scores** ($\mathbf{q}_3 \cdot \mathbf{k}_j / \sqrt2$):
$s_1 = 2/1.414 \approx 1.414$, $s_2 = 0$, $s_3 = 2/1.414 \approx 1.414$.

**Softmax:** $e^{1.414} \approx 4.11$, $e^0 = 1$ → sum $\approx 9.22$ →
$w \approx (0.446,\; 0.108,\; 0.446)$.

**Output:** $0.446(1,0) + 0.108(0,2) + 0.446(1,1) \approx (0.89,\; 0.66)$.

**Cache after step 1:** keys $[(1,0), (0,1), (1,1)]$, values $[(1,0), (0,2), (1,1)]$ — columns
1–2 read but not recomputed.

**Step 2:** computes ONLY token 4's column ($\mathbf{q}_4, \mathbf{k}_4, \mathbf{v}_4$ + its FFN
work); merely *reads* the three cached K/V pairs to attend; appends $\mathbf{k}_4, \mathbf{v}_4$.

Full credit = all three stages of step 1 with arithmetic, the exact cache contents, and the
compute-vs-read distinction stated for step 2.`,
    },
    {
      id: 'm3-l3-q11',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** You're writing a story one word at a time, but you
have a strange rule-following robot brain: to pick each next word, it re-reads the *entire story
so far from the beginning*. Explain to the kid: why that gets slower and slower, what "keeping
notes" fixes (and why the notes never need erasing!), and what new problem the notes create when
the story gets really long. No jargon without a kid-level explanation first.`,
      rubric: md`Grade the teaching:

1. **The slowdown made vivid** — each new word means re-reading a longer story; by page 100
   you're spending all day re-reading and a second writing. (Bonus: the total re-reading grows
   like the square of the story length.)
2. **The notes** — after reading each word once, jot what you'd need to remember about it on a
   card; from then on, glance at the cards instead of re-reading.
3. **Why the notes never go stale** — the story so far never changes (you only ever ADD words at
   the end, never edit the middle), so a card written once is true forever. This is the heart —
   a kid-level freeze proof.
4. **The new problem** — the card pile grows with the story; a really long story means a mountain
   of cards that stops fitting on your desk (traded time for space).
5. **Jargon audit:** "KV cache," "attention," "tokens," "memory bandwidth" unexplained = partial,
   regardless of correctness.`,
    },
    {
      id: 'm3-l3-q12',
      kind: 'written',
      prompt: md`**The serving engineer's estimate.** Your one 80 GB GPU serves Llama-7B (fp16
weights: 13.5 GB; full MHA cache: 0.5 MB/token). Product wants **20 concurrent users at 16k
context each**. On paper: (1) compute the total cache demand and the verdict; (2) rank your three
best levers — GQA (say ÷4), KV quantization to 8-bit (÷2), and paged allocation (assume users
*average* only a quarter of their 16k limit) — showing the arithmetic for how far each one, and
all three combined, gets you.`,
      rubric: md`**(1) Demand:** per user $0.5 \text{ MB} \times 16{,}384 \approx 8.2$ GB; twenty
users $\approx 164$ GB of cache + 13.5 GB weights vs 80 GB GPU → over budget by more than
$2\times$. Verdict: does not fit.

**(2) Levers** (any sensible ranking with arithmetic accepted):
- **GQA ÷4:** 164 → 41 GB. +13.5 weights ≈ 55 GB — *fits*, but requires an architecture change
  (retrain or switch checkpoints); most powerful single lever, least deployable overnight.
- **KV 8-bit ÷2:** 164 → 82 GB — still over alone; deployable immediately with small quality cost.
- **Paging at ¼ average occupancy:** reserve-as-you-go turns 164 GB *worst case* into ~41 GB
  *actual* — but with tail risk: if users simultaneously run long, you must evict, queue, or spill.
- **Combined** (GQA + 8-bit + paging): $164 / 4 / 2 / 4 \approx 5$ GB expected — comfortable
  headroom for growth, plus safety margin for occupancy spikes.

Full credit = correct demand arithmetic, each lever quantified, and at least one honest caveat
(retraining cost, quality loss, or occupancy tail risk). This is a real capacity-planning
interview question — treat your numbers as if a pager depended on them.`,
    },
  ],
}
