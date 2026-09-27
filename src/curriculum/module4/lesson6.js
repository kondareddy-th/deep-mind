// Module 4, Lesson 6 — Reading a model card (module capstone, Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm4-l6',
  title: '4.6 Reading a model card — the modern menagerie',
  subtitle:
    'A pilot doesn\'t see dials — she sees airspeed, attitude, fuel. Twenty-three lessons ago a model card was alphabet soup. Today you read one the same way: every field a lesson you own, every number a computation you can run. This is the drill — plus the honest frontier where attention itself is being renegotiated.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Tomorrow morning a model release drops, and the card reads:

> **52B total / 12B active MoE · 64 layers · d_model 6144 · 48 query heads / 8 KV heads (GQA) ·
> SwiGLU FFN · RoPE base 1M · sliding-window 4k on 3/4 of layers · trained in bf16 · released in
> int4 · 256k vocabulary · 128k context**

Here is the claim of this capstone: **you can now compute this machine's memory footprint, its
decode speed on your own laptop, its cache bill per conversation, and the engineering stack behind
its context claim — from the card alone, before downloading a byte.** Not vibes; arithmetic. A
researcher reads specs the way a pilot reads instruments: each field maps to a mechanism, each
mechanism to a number, and the numbers either cohere or they don't (spotting *incoherent* cards is
half the skill — marketing writes cards too).

Two fields need one honest paragraph each before the drill — the sliding windows and that "MoE"
— and one section of this lesson looks past the transformer entirely, because the frontier
menagerie now includes machines that renegotiate attention itself. Everything else you already
own. Let's fly the panel.
`,
    },
    {
      type: 'example',
      title: 'the decoding drill — the card, line by line',
      md: md`
Each field: the lesson that owns it → what it implies → the number it yields.

**52B total / 12B active (MoE)** — capacity and per-token compute *decoupled* (4.3): all 52B must
be **resident** (the ladder forbids paging experts per token), but only ~12B **stream** per token —
so memory bills come from 52, speed bills from 12 (3.4's law with *active* bytes).

**64 layers, d_model 6144** — the residual stream's width and the stack's depth (2.5, 2.6). Head
dimension: $6144 / 48 = 128$ — the standard size, good sanity check.

**48 query heads / 8 KV heads (GQA)** — lesson 3.3: six query heads share each answer-sheet. KV
cache per token: $2 \times 64 \times 8 \times 128 \times 2$ bytes $= 262{,}144 \approx$ **0.25
MB/token** — versus 1.5 MB with full 48-head MHA. GQA already saved $6\times$ before you noticed.
A 128k conversation: $\approx 34$ GB of cache even so — long context is still a memory problem.

**SwiGLU FFN** — 2.5's gated FFN variant; two-thirds of those 52B live here.

**RoPE base 1M** — 2.4: the slowest clock hands stretched (base $10^4 \to 10^6$) so 128k positions
fit inside one revolution of the positional fingerprint — the frequency-rescaling move.

**Sliding-window 4k on 3/4 of layers** — 48 of the 64 layers attend only to the last 4,096 tokens
(cost $n \times w$, not $n^2$ — 2.2's quadratic, tamed locally); 16 full-attention layers keep
global reach. The section below derives why this mix works.

**Trained bf16 / released int4** — 4.1's range-over-resolution bet for training; 4.4's crushing
for release: $52 \times 0.5$ bytes $=$ **26 GB resident**.

**256k vocabulary** — 3.1: a much smaller multilingual tax than a 32k tokenizer; embedding table
$256{,}000 \times 6144 \approx$ **1.57B parameters** — 3% of the model, a check that the card's
total is dominated by its blocks (2.6's audit habit).

**128k context** — not one feature but a *stack*: RoPE rescaling (2.4) + GQA (3.3) +
FlashAttention (4.1) + paged serving (4.5) + the windowed/full mix (here). Headline numbers are
engineering stacks wearing one number as a coat.

That's the panel. Every field landed on a lesson, and three numbers fell out en route: 26 GB
resident, 0.25 MB/token of cache, 1.57B embedding parameters. The questions will make you fly it
solo on a different card.
`,
    },
    {
      type: 'text',
      md: md`
## Sliding windows: paying for locality, hopping for distance

Why would anyone amputate attention's defining power — see everything — on 48 of 64 layers?
Because of a fact you've now met three times: most of language's dependencies are *local* (3.1's
morphemes, 2.3's previous-token heads), and 2.2 priced global attention at $n^2$. A 4k window
makes those 48 layers cost $n \times 4096$ — at 128k context, a $31\times$ saving per windowed
layer — while capturing the overwhelmingly common short-range structure.

But here's the beautiful part: **windowed layers still build long-range understanding — by
relay.** Layer 1 lets token $i$ see back 4k. Layer 2's window, attending to *layer-1
representations* (which already contain their own 4k of lookback), extends effective reach to 8k.
Stack $L$ windowed layers: reach $\approx L \times w$. Forty-eight layers × 4k = **192k of
effective reach** — comfortably covering the 128k context. Information travels like a bucket
brigade, one window per layer — the same layers-as-clock-ticks logic that 2.3's induction relay
used, now doing distance instead of composition.

So why keep 16 full-attention layers at all? Because a bucket brigade *degrades* what it carries —
each hop is a lossy summary (you'll feel an old ghost here; hold that thought for the next
section) — and some tasks need *sharp* long-range access: copy a name from page 3, match a quote
verbatim. The full layers are express elevators among staircases: rare, expensive, and the only
way to move something far without touching every floor. The 3-to-1 mix is empirical, not derived —
labs tune it — but the *shape* (mostly cheap local + periodic global) is now standard across the
frontier.
`,
    },
    {
      type: 'ponder',
      question: md`Before reading on: suppose the card had said "sliding-window 4k on **all 64**
layers" — no full-attention layers at all, effective reach $64 \times 4k = 256$k, well past the
128k context. Reach covered — so what specifically breaks? Name a task and trace the failure.`,
      answer: md`Reach is not *fidelity*. With every layer windowed, information from 100k tokens
back arrives only after ~25 relay hops, each hop a lossy re-summarization through a 6144-dim
bottleneck — the telephone game (2.1!) rebuilt inside the transformer. Trace "quote exactly the
sentence from the document's opening": an induction-style copy circuit (2.3) wants to *attend
directly* to where the pattern lives and lift tokens verbatim; a 25-hop relay hands it a paraphrase
of a paraphrase — gist survives, verbatim dies. Needle-in-a-haystack evals expose exactly this.
The 16 full layers exist to give copy/retrieval circuits somewhere to jump directly — which is
also, as the next section shows, precisely the dial that separates transformers from their new
recurrent rivals.`,
    },
    {
      type: 'text',
      md: md`
## The RNN's revenge — state-space models

Lesson 2.1 executed the RNN for two crimes: the fixed-size memory bottleneck (telephone game) and
sequential training (GPUs idle). The transformer won by paying memory for *random access* to
history — and lesson 3.3 priced that memory: for this card's model, 0.25 MB per token, forever
growing. At 128k context, about 34 GB per conversation. The bill invites a heretical question: was the fixed-size state really so
bad?

**State-space models** (Mamba and kin) are the RNN pardoned on appeal — with one technicality
overturning the second conviction. Their recurrence is *linear* in the state (no nonlinearity
wrapping the state update), and linear recurrences can be unrolled algebraically and computed with
a **parallel associative scan** — the whole sequence at once, GPUs saturated, training parallel.
The first crime's sentence is *commuted, not overturned*: the state is still fixed-size, still a
compression of unbounded history — but now it's a *learned, input-dependent* compression: the
model learns what to keep, what to forget, per token.

The ledger against the transformer (all of it flagged: active research, tradeoffs still being
mapped):

- **Decode:** $O(1)$ per token, **no KV cache at all** — 3.3's entire bill, vanished. A
  conversation's memory footprint doesn't grow. Serving economics (4.5) transform.
- **The price:** random access is gone. Ask it to quote page 3 verbatim and the answer must
  already live, compressed, in the fixed state — needle-in-haystack retrieval is the empirically
  documented weak spot, the ponder's bucket-brigade disease as a *permanent condition* rather than
  a 48-layer choice.
- **The compromise shipping today:** hybrids — mostly SSM layers with a few attention layers
  interleaved (Jamba-lineage), express elevators again, this time bolted onto a recurrent
  building. The windowed-transformer and the hybrid-SSM are converging on the same shape from
  opposite directions, which should smell like a real design principle rather than a fashion.

(Linear attention — softmax replaced by a kernel so the sum re-associates into a running state —
is the same bargain from a third door; historically it lagged in quality, and its descendants are
part of the same active frontier.)

## Multi-token prediction, in one breath

One more card-vocabulary item now appearing (DeepSeek-V3 lineage): **multi-token prediction** —
during training, auxiliary heads predict tokens $t{+}2, t{+}3, \dots$ alongside $t{+}1$. Two
payoffs you can price: denser gradient signal per document pass, and — neatly — the extra heads
are a built-in *draft model* for speculative decoding (3.4), no separate drafter to train or
serve. Inference still emits one token at a time; the extra heads just make the guesser free.
`,
    },
    {
      type: 'ponder',
      question: md`The laptop test, full chain: your machine has 32 GB of RAM at ~200 GB/s. The
card's model — 52B total, 12B active, int4. Can you run it, and roughly how fast? Chain three
lessons: 4.4 (resident bytes), 4.3 (active vs total), 3.4 (the ceiling law). Compute before
revealing.`,
      answer: md`**Fit (binary):** resident $= 52\text{B} \times 0.5$ bytes $= 26$ GB — inside
32 GB with ~6 GB to spare for cache, OS, and browser tabs you refuse to close. It fits, barely.
**Speed (linear):** per token, only *active* weights stream: $12\text{B} \times 0.5 = 6$ GB;
ceiling $= 200 / 6 \approx 33$ tokens/sec — brisk reading speed. The MoE surprise in one line:
**52B-class quality at 13B-class speed, *if and only if* it fits** — capacity is binary, bandwidth
is linear (4.3's ledger, now on your desk). Change one card field — say 8-bit instead of 4 — and
resident hits 52 GB: the same laptop runs *nothing at all*. This sensitivity is why quantization
(4.4) decides what the open-model ecosystem can even touch.`,
    },
    {
      type: 'ponder',
      question: md`The opening promised that spotting *incoherent* cards is half the skill —
marketing writes cards too. Here is one: **"7B dense · 32 layers · d_model 4096 · 32 query heads /
32 KV heads · fp16 · 128k context · runs on a single 24 GB consumer GPU."** Every individual claim
is plausible. Together they are not. Find the contradiction with arithmetic before reading on.`,
      answer: md`**Run the two numbers this module taught you.**

*Weights:* $7 \times 10^9 \times 2$ bytes $= 14$ GB. Fits in 24 GB, leaving ~10 GB.

*KV cache per token* (note "32 query / 32 KV heads" means full MHA — no GQA saving): head dimension
$4096/32 = 128$, so $2 \times 32 \text{ layers} \times 32 \text{ heads} \times 128 \times 2$ bytes
$= 524{,}288$ bytes $= 0.5$ MB per token.

*At 128k context:* $0.5 \text{ MB} \times 131{,}072 \approx \mathbf{65\ GB}$ of cache — on a card
with 10 GB free. The claims are off by more than a factor of six.

**What the honest version would say:** with 10 GB of headroom you can hold roughly 20,000 tokens of
cache, not 131,072. So either the card omits something load-bearing (GQA, a quantized KV cache,
sliding-window layers — all of which would *change other fields*), or "128k context" describes the
positional encoding's supported range rather than anything you can actually run on the stated
hardware. Both happen, and neither is usually a lie so much as two true claims placed side by side
in a way that invites a false inference.

**The habit worth keeping:** whenever a card pairs a *context* claim with a *hardware* claim,
multiply the per-token cache by the context length and check. That single multiplication catches
most of the over-claiming in the field, and you can now do it in your head.`,
    },
    {
      type: 'text',
      md: md`
## What you now own — Module 4, and the machine room entire

The module in one arc:

1. **4.1 The wall:** training = 16 bytes/param (the vanishing-update murder) → 1.12 TB for 70B;
   the hierarchy of speeds; spend the slack resource.
2. **4.2 The splits:** data / ZeRO / tensor / pipeline — each an answer to *what splits, what
   travels, which rung*; composed in 3D for frontier runs.
3. **4.3 Pay-for-what-you-use:** MoE decouples capacity (resident, binary) from compute (active,
   linear); the router's rich-get-richer disease and its leashes.
4. **4.4 Fewer bits:** accumulate-vs-read; the integer ruler; outliers and their cures; the one
   trick that pays both walls.
5. **4.5 The invoice:** TTFT/TPOT, continuous batching, PagedAttention, disaggregation — the
   posted API price derived, not marveled at.
6. **4.6 The panel:** any model card decoded to memory, speed, and cost — and the frontier
   (windows, SSMs, hybrids, MTP) read as *positions on dials you understand* (locality vs reach,
   compression vs random access) rather than a parade of names.

And the module's single deepest habit, worth stating once more: **compute is elastic, bytes are
not** — every architecture and every system in this module is some arrangement for moving fewer
bytes, or moving them on faster rungs, or hiding their travel behind arithmetic.

**The bridge to Module 5:** everything so far makes the machine *runnable*. Nothing yet says what
makes it *good*. What data, how much, in what order? Why does loss fall so predictably with scale
that labs bet billions on a curve? And how does a next-token predictor become something you can
actually talk to — SFT, RLHF, and the alignment pipeline? That's the last stretch of the technical
climb: **training it better.**
`,
    },
  ],
  questions: [
    {
      id: 'm4-l6-q1',
      kind: 'mcq',
      prompt: md`The card says "48 query heads / 8 KV heads (GQA)." What does this field tell you,
and what is the headline consequence?`,
      options: [
        'The model asks 8 kinds of questions of the past; consequence: weaker attention quality',
        'Six query heads share each key/value head, so the KV cache per token shrinks 6× versus full MHA — the field is primarily a serving-memory decision (3.3)',
        'Only 8 of the 48 heads are active per token, MoE-style, cutting compute 6×',
        'The context window is divided into 8 segments cached separately',
      ],
      answer: 1,
      explain: md`GQA pools the answer-sheets (K/V), never the questions (Q): all 48 query
personalities survive; the cache bill divides by $48/8 = 6$. Option C is the tempting confusion —
MoE-style sparsity is *conditional* (different tokens, different experts) while GQA is *structural
sharing* (every token, same pooling); the card lists both fields separately precisely because they
are different machines. A researcher reads "8 KV heads" and instantly thinks *cache economics*,
not attention quality.`,
    },
    {
      id: 'm4-l6-q2',
      kind: 'numeric',
      prompt: md`**Fermi — the cache line of the drill:** KV cache per token for the card's config:
$2 \; (\text{K,V}) \times 64 \; \text{layers} \times 8 \; \text{KV heads} \times 128 \;
\text{head-dim} \times 2 \; \text{bytes}$. Answer in **megabytes** (one decimal).`,
      answer: 0.26,
      tolerance: 0.05,
      explain: md`$2 \times 64 \times 8 \times 128 \times 2 = 262{,}144$ bytes $\approx 0.26$ MB
per token — and note GQA already did its work: with all 48 heads it would be 1.5 MB. At 128k
context that's ~34 GB per conversation even *with* GQA; every long-context serving decision (4.5)
flows from this one multiplication, which you can now run for any card in under a minute.`,
    },
    {
      id: 'm4-l6-q3',
      kind: 'numeric',
      prompt: md`The card's embedding table: $256{,}000$ vocabulary $\times \; 6144$ dimensions.
How many parameters, in **billions** (two decimals)?`,
      answer: 1.57,
      tolerance: 0.2,
      explain: md`$256{,}000 \times 6144 \approx 1.57 \times 10^9$ — about 3% of the 52B total,
confirming 2.6's audit habit: modern models are almost entirely their blocks. The big vocabulary's
real purchase isn't parameters — it's 3.1's multilingual tax cut: the same sentence in Burmese or
Tamil costs far fewer tokens than under a 32k English-centric tokenizer.`,
    },
    {
      id: 'm4-l6-q4',
      kind: 'mcq',
      prompt: md`A state-space model (Mamba-class) decodes with $O(1)$ memory — no growing KV
cache. Why hasn't this simply replaced the transformer?`,
      options: [
        'SSMs cannot be trained on GPUs',
        'The fixed-size state must compress unbounded history, so precise long-range retrieval (quote page 3 verbatim, needle-in-haystack) degrades — attention’s growing memory is the price of random access to the past',
        'SSMs are quadratically more expensive at training time',
        'The linear recurrence makes them mathematically unable to model language at all',
      ],
      answer: 1,
      explain: md`Compression vs random access — the module's dial. The SSM commutes the telephone-
game sentence (2.1) from "fatal" to "managed" but cannot dismiss it: what's not kept in the state
is gone, and copy/retrieval circuits (2.3) have nowhere to jump. Options A and C invert the actual
story — the associative-scan trick is precisely what made SSMs *trainable in parallel* on GPUs;
that's why they're contenders at all. D is refuted by their strong empirical language modeling.
Hence hybrids: mostly cheap recurrence, a few express-elevator attention layers.`,
    },
    {
      id: 'm4-l6-q5',
      kind: 'numeric',
      prompt: md`Released in int4: the card's 52B total parameters occupy how many **gigabytes**
resident?`,
      answer: 26,
      tolerance: 3,
      explain: md`$52 \times 10^9 \times 0.5$ bytes $= 26$ GB. The binary gate for every device it
might run on: a 32 GB laptop clears it; a 16 GB one never will, at any speed. Capacity first,
bandwidth second — always in that order (4.3's ledger).`,
    },
    {
      id: 'm4-l6-q6',
      kind: 'written',
      prompt: md`**Derive, don't recall — the reach of stacked windows.** On paper: (1) explain,
via what layer $\ell{+}1$'s window actually attends *to*, why $L$ stacked 4k-window layers give
effective reach $\approx L \times 4$k rather than just 4k; (2) compute the card's windowed reach
(48 layers × 4k) and check it against the 128k context; (3) explain what the 16 full-attention
layers provide that no amount of windowed reach can — name a concrete task and the circuit (2.3)
that needs it.`,
      rubric: md`**(1) The relay:** layer $\ell{+}1$'s window sees the last 4k *layer-$\ell$
representations*, and each of those already summarizes its own 4k of lookback — so reach compounds
by one window per layer: after $L$ layers, $\approx L \times w$. (The bucket-brigade/staircase
image, or the 2.3 layers-as-sequencing argument, earns full marks.)

**(2)** $48 \times 4096 \approx 197$k $> 128$k — the windowed stack alone can *propagate*
information across the whole context.

**(3) Fidelity, not reach:** each relay hop is a lossy re-summarization through the residual
stream; verbatim long-range access (quote the opening sentence; match a legal citation exactly)
needs an induction-style copy circuit (2.3) attending *directly* to the source tokens — an express
elevator only a full-attention layer provides. Gist survives relays; exactness doesn't.

Full credit = the mechanism in (1) stated via what the window attends to (not just the formula),
the arithmetic in (2), and (3) naming both a task and the direct-attention reason.`,
    },
    {
      id: 'm4-l6-q7',
      kind: 'mcq',
      prompt: md`Multi-token prediction (auxiliary heads predicting $t{+}2, t{+}3, \dots$ during
training) buys two things. Which pair?`,
      options: [
        'Faster training convergence per document AND a built-in draft model for speculative decoding at inference',
        'Parallel generation of multiple tokens per step at inference AND a smaller KV cache',
        'Longer context windows AND better tokenization',
        'Lower training memory AND immunity to hallucination',
      ],
      answer: 0,
      explain: md`Denser signal (more predictions supervised per forward pass) plus a free drafter
whose guesses the main head verifies in one prefill-shaped pass (3.4's speculative machinery, no
separate model to serve). Option B is the classic misreading — MTP does *not* let the model emit
several final tokens per step; generation remains autoregressive (2.6's data dependency is not
repealed), the extra heads only make the *guesser* free.`,
    },
    {
      id: 'm4-l6-q8',
      kind: 'numeric',
      prompt: md`The laptop test's speed line: active parameters 12B at int4 (0.5 bytes each)
stream per token through ~200 GB/s of laptop memory bandwidth. Decode ceiling in **tokens/sec**?`,
      answer: 33,
      tolerance: 15,
      explain: md`$12 \times 10^9 \times 0.5 = 6$ GB per token; $200 / 6 \approx 33$ tok/s —
3.4's law with 4.3's *active* bytes. The whole module in one division: a 52B-quality model at
13B speed on a consumer machine, because MoE decoupled what must *sit* from what must *move*.`,
    },
    {
      id: 'm4-l6-q9',
      kind: 'written',
      prompt: md`**Fly the panel solo.** A different card: *"Dense 9B · 42 layers · d_model 4608 ·
36 query heads / 4 KV heads · RoPE · 32k context · released int8 · 128k vocabulary."* On paper,
compute: (1) head dimension; (2) KV cache per token (MB or KB); (3) resident memory at int8;
(4) embedding-table parameters; (5) decode ceiling on a 200 GB/s laptop; and (6) one sentence:
the biggest *serving* difference between this card and the lesson's MoE card, and why.`,
      rubric: md`**(1)** $4608 / 36 = 128$. **(2)** $2 \times 42 \times 4 \times 128 \times 2 =
86{,}016$ B $\approx 84$ KB/token (GQA ÷9 — about three times leaner than the MoE card's
0.25 MB). **(3)**
$9 \times 10^9 \times 1$ byte $= 9$ GB. **(4)** $128{,}000 \times 4608 \approx 590$M. **(5)**
dense → *all* 9 GB streams per token: $200 / 9 \approx 22$ tok/s. **(6)** The dense 9B is slower
per token than the 52B MoE (22 vs ~33 tok/s) despite being $6\times$ smaller resident — because
dense streams *everything* it holds while MoE streams only its active slice; resident size and
streamed size are different axes (4.3), and serving lives on the streamed one (3.4).

Full credit = all five computations with arithmetic + the comparison naming the resident-vs-
streamed distinction. Any student who flags the counterintuitive verdict in (6) unprompted has
earned the module.`,
    },
    {
      id: 'm4-l6-q10',
      kind: 'mcq',
      prompt: md`A card advertises "128k context." What is the researcher's correct reading of that
number?`,
      options: [
        'The attention matrix is materialized at 128k × 128k, requiring extreme hardware',
        'A stack of cooperating techniques — positional rescaling, GQA, tiled attention kernels, paged cache serving, often windowed/hybrid layers — each with its own bill, wearing one number',
        'The model was trained end-to-end on 128k-token documents from scratch, guaranteeing uniform quality across the window',
        'The KV cache is capped at 128k entries and older tokens are silently deleted',
      ],
      answer: 1,
      explain: md`Headline numbers are engineering stacks (the drill's last line): 2.4 + 3.3 + 4.1
+ 4.5 + this lesson's windows, composed. Option C is the tempting over-read — long-context ability
is typically *extended* from shorter training (RoPE rescaling + targeted long-document phases),
and empirical quality across the window is exactly what needle-in-haystack evals exist to audit
(3.5's lost-in-the-middle should still echo). A is what FlashAttention exists to avoid; D
describes a sliding-window *serving* policy some products use, not what the context claim means.`,
    },
    {
      id: 'm4-l6-q11',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** Your friend sees a video-game console's spec sheet —
memory, speed, storage — and can tell which games will run well. Explain how you now read an AI
model's spec sheet the same way: pick any THREE fields from this lesson's card (say, the "26 GB
when shrunk," the "only some experts wake up per word," and the "notepad it keeps per word of
conversation") and for each: what it is in kid terms, and what it lets you predict. No jargon
without kid-level explanation first.`,
      rubric: md`Grade the teaching; any three fields accepted. Model answers:

1. **Shrunk size (int4 resident = 26 GB):** the whole brain, compressed like a photo, must fit in
   the computer's workspace — if the workspace is 32 GB it squeaks in; 16 GB and nothing runs at
   all. Predicts: *which machines can play this game, yes or no.*
2. **Only some experts wake (MoE active vs total):** the brain is a building full of specialists
   but each word only visits two of them — so it *thinks* like a huge brain but *works* like a
   small one. Predicts: speed follows the two specialists, smarts follow the whole building.
3. **The per-word notepad (KV cache):** for every word of your chat it keeps about a quarter of a
   megabyte of notes so it never re-reads the conversation; long chats = mountains of notes. Predicts: how
   many long conversations fit before the workspace overflows.
4. **Jargon audit:** "quantization," "MoE," "KV cache," "GQA" unexplained = partial. The core
   skill being graded: field → mechanism → *prediction*, in words a kid tracks.`,
    },
    {
      id: 'm4-l6-q12',
      kind: 'written',
      prompt: md`**Derive, don't recall — the RNN's pardon.** Lesson 2.1 convicted the RNN of
sequential training: step $t$ needed step $t{-}1$'s output, so GPUs idled. State-space models are
recurrent yet train in parallel. On paper: (1) write a simple linear recurrence $h_t = a \cdot
h_{t-1} + b \cdot x_t$ and unroll it by hand for $h_3$ to show every $h_t$ is a direct weighted
sum of the inputs — no waiting required; (2) explain in one paragraph why a *nonlinearity* wrapping
the state update (classic RNN) destroys this unrolling; (3) state what sentence from 2.1's
conviction remains in force even after the pardon.`,
      rubric: md`**(1) Unroll:** $h_1 = a h_0 + b x_1$; $\;h_2 = a^2 h_0 + a b x_1 + b x_2$;
$\;h_3 = a^3 h_0 + a^2 b x_1 + a b x_2 + b x_3$. Every $h_t$ is a closed-form weighted sum of
inputs — all positions computable at once (and the partial sums combine associatively, which is
what a parallel scan exploits; input-dependent $a_t$ still works because products of the $a$'s
compose associatively too).

**(2) The nonlinear lock:** with $h_t = \tanh(a h_{t-1} + b x_t)$, the tanh must be *applied* to
$h_{t-1}$'s finished value before $h_t$ exists — nothing distributes through the nonlinearity, no
closed form, each step genuinely waits (2.1's conviction). Linearity in the state is precisely
what lets the algebra be done "all at once."

**(3) Still in force:** the fixed-size state must compress unbounded history — the telephone-game
bottleneck. The pardon covers *training speed* only; the memory sentence stands, managed by
learned forgetting and hybrid attention layers.

Full credit = the actual $h_3$ expansion written out, the nonlinearity argument stated as
"nothing passes through the wrapper," and (3) naming the compression bottleneck specifically.`,
    },
  ],
}
