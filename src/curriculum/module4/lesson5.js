// Module 4, Lesson 5 — Serving at scale: the economics of a token (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm4-l5',
  title: '4.5 Serving at scale — the economics of a token',
  subtitle: md`An API sells a million output tokens for a couple of dollars. The GPU it runs on rents for $2.50 an hour. Naive arithmetic says that price is impossible — so either it's marketing, or there's engineering you haven't priced in yet. It's engineering, all of it from Modules 3 and 4, and this lesson is where it meets the invoice.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Open any LLM pricing page. A 70B-class model: roughly one to three dollars per **million**
output tokens. Now open a cloud console: one H100 rents for about \$2.50 an hour, and a 70B
model needs eight of them. Twenty dollars an hour of hardware, selling its product for a few
dollars per million words.

Is that price physics or marketing? You are, as of this lesson, equipped to check. You know
what a token *costs* in bytes hauled (3.4), what the cache bill is (3.3), what the hardware
ladder charges for each rung (4.1). By the end of this lesson you will derive a defensible
cost-per-token from first principles — and you'll find that **naive serving misses the posted
price by a factor of 30 to 100**. That gap is not a subsidy. The gap *is* the engineering:
every trick Modules 3 and 4 set up — batching, caching, paging, the ladder — exists because
someone had to close it. Today we watch them close it, with arithmetic.

## The two clocks a customer can feel

Before costing anything, name what's being sold. A customer of a chat API experiences exactly
two latencies, and they come straight from the two phases you met in 3.3 and 3.4:

**TTFT — time to first token.** From pressing enter to the first word appearing. It's queue
time plus **prefill**: the model ingests the whole prompt in one parallel, matmul-rich pass.
Prefill is *compute-bound* (3.4: thousands of tokens share each weight-haul, arithmetic
intensity is huge), so TTFT scales with **prompt length**. A 2,000-token prompt into a 7B
model costs about $2{,}000 \times 14$ GFLOPs $= 28$ TFLOPs; an H100 doing bf16 matmuls at a
realistic ~40% of its ~1,000 TFLOP/s peak clears that in about 70 ms. A 100,000-token prompt:
fifty times longer. Seconds, not milliseconds.

**TPOT — time per output token** (also called inter-token latency). Once tokens start, how
fast do they stream? That's **decode**: one token per step, every step hauling the full
working set through HBM — *bandwidth-bound*, the 3.4 ceiling. For 7B in fp16, 14 GB per step
at ~3.35 TB/s gives a hard floor of ~4 ms; real kernels land near 10 ms, so ~100 tokens/s for
a lone stream. Crucially, TPOT barely cares how long your prompt was — the weights dominate
the haul.

Two clocks, two different physics: TTFT is a *compute* bill that grows with input; TPOT is a
*bandwidth* bill per output token. Keep them separate and half of serving-systems design
becomes legible — including why **streaming** exists at all (3.5): a 500-token answer takes
5+ seconds to finish, but the first word can arrive in half a second. Streaming sells you the
TTFT and hides the TPOT behind your own reading speed.
`,
    },
    {
      type: 'example',
      title: 'naive serving, costed to the penny',
      md: md`
One user, one H100 at \$2.50/hour, a 7B model in fp16, no tricks. Decode runs at ~100 tokens/s
(the bandwidth ceiling with realistic overhead). An hour of nonstop generation:

$$100 \text{ tok/s} \times 3600 \text{ s} = 360{,}000 \text{ tokens/hour}
\qquad\Rightarrow\qquad
\frac{\$2.50}{0.36 \text{ M tokens}} \approx \$7 \text{ per million output tokens}$$

Posted prices for 7B-class models sit around ten to thirty *cents* per million (ballpark —
check any pricing page). Naive serving is **25–70× too expensive**. And look *why*, in
3.4's terms: each decode step hauls 14 GB to perform ~14 GFLOPs — at 100 tok/s that's
1.4 TFLOP/s of work on a ~1,000 TFLOP/s machine. **99.9% of the silicon you're renting is
idle.** Lesson 3.4 called this a scandal; here it is denominated in dollars: of every \$2.50
hour, roughly \$2.49 pays for multipliers doing nothing.

Scale up and it gets worse. A 70B model on an 8×H100 node (\$20/hour): the 140 GB weight-haul
spread over ~26.8 TB/s of aggregate bandwidth gives a ~5 ms/step floor, but per-layer
all-reduces (4.2's tensor-parallel tax, riding NVLink) and kernel overheads drag a lone
stream to ~40 tokens/s realistic. That's 144,000 tokens/hour:

$$\frac{\$20}{0.144 \text{ M tokens}} \approx \$140 \text{ per million output tokens}$$

versus a posted \$1–3. **Naive serving cannot match posted prices — not close, not with any
haggling.** Everything that follows is the machinery that closes a 50–100× gap.
`,
    },
    {
      type: 'text',
      md: md`
## Batching meets the real world — and gets a disease

You already own the cure's first half. Lesson 3.4: the weight-haul is a *fixed cost per
step*, so let $B$ requests share it — one 140 GB haul now produces 64 tokens instead of one,
and per-token cost divides by nearly $B$ until you hit the compute ceiling or run out of
memory. On a benchmark, done.

But serving isn't a benchmark. Requests arrive at random moments, and — here's the killer —
**you don't know how long each one will run**. One user asked for a haiku (30 tokens); another
asked for an essay (2,000 tokens). Enter **static batching**, the obvious first design:
collect 64 requests, launch them as a batch, run the decode loop until all are finished. Now
watch it rot. The haiku finishes at step 30 — but its slot in the batch can't be reused,
because the batch is a fixed formation marching in lockstep until the essay finishes at step
2,000. For 1,970 steps, that slot computes padding. If request lengths spread uniformly from
short to long, roughly *half* the slot-steps in every batch are dead — and worse, newly
arrived requests queue outside until the *entire* batch drains, so TTFT balloons too.

The fix is one idea, and you can derive it by asking a Feynman question: *what actually forces
batch membership to be constant?* Nothing. The decode loop is already a per-token loop; each
iteration is just "for everyone who still needs a token: haul weights once, step everyone
forward." So rebuild the roster **every iteration**: the haiku retires at step 30 and its slot
is handed *that same step* to a request waiting at the door. This is **continuous batching**
(the literature says iteration-level scheduling): admission and retirement at *token*
granularity. Think of a ski lift, not a tour bus — chairs come around every few seconds, and
any empty chair takes the next person in line; nobody waits for a whole busload to return.

Dead slots vanish, queues drain into slots as they open, and measured throughput lands around
**10–20× naive serving** (ballpark — it depends on traffic; the founding papers reported up to
~20× and more with the memory fix below). One order of magnitude of our 50–100× gap, closed by
scheduling alone.
`,
    },
    {
      type: 'ponder',
      question: md`Continuous batching multiplies *throughput* — tokens per GPU-hour. But
throughput is the operator's metric. Whose **latency** does continuous batching change, and in
which direction? Think about an individual user's TPOT when the scheduler admits a new request
mid-stream, and about who benefits from the emptied slots.`,
      answer: md`Everyone's *queue* time collapses — that's the big win, and it's a latency
win: requests no longer wait for a whole batch to drain, so TTFT drops for every arrival. But
an individual stream's **TPOT gets slightly worse**, twice over: (1) sharing the machine at
batch 64 means each decode step hauls weights *plus* 64 caches, so steps are somewhat slower
than a solo stream's; (2) when the scheduler admits a newcomer, its *prefill* must run
somewhere, and every compute-heavy prefill wedged into the loop stalls the decode iterations
of everyone already streaming — a visible stutter. So continuous batching is a **dial between
utilization and per-user snappiness**, and operators run it with explicit service-level
objectives: admit new requests only while predicted TPOT stays under (say) 40 ms, cap the
batch when the tail degrades, slice big prefills into chunks interleaved between decode steps.
The fleet gets cheap by *spending* a little of each user's smoothness — deliberately,
measurably, and no further than the SLO allows. Utilization is bought, never free.`,
    },
    {
      type: 'text',
      md: md`
## PagedAttention — the teaser from 3.3, cashed in full

Continuous batching creates its own bottleneck. Batch size is now the profit lever — and what
bounds batch size? **KV cache memory**. Redo 3.3's bill for a 70B-class model (80 layers,
8,192-wide attention): with vanilla attention it would be $2 \times 80 \times 8{,}192 \times 2$
bytes $\approx 2.6$ MB per token; Llama-70B actually uses GQA with 8 KV heads of 128 dimensions,
so $2 \times 80 \times 1{,}024 \times 2 \approx 0.33$ MB per token. Every admitted request needs cache
room. So the question "how many requests fit?" is a memory question, and here early serving
systems were bleeding without noticing.

The disease: a request's cache **grows token by token, and you don't know its final length**.
Classic allocators handled unknown-growth the lazy way: reserve one *contiguous* slab per
request, sized for the **worst case** — the user *might* run the context to 32,768 tokens, so
reserve all of it. A typical request that actually uses 800 tokens (500 of prompt, 300 of
answer) then wastes $32{,}768 - 800$ token-slots — over 97% of its reservation. Across a real
mix, the vLLM paper measured **60–80% of KV memory wasted** in prior systems (their reported
figure — the mix matters), between reserved-but-unused tails and the contiguity fragments too
small to hold anyone. Waste divides your feasible batch, and by 3.4, batch *is* throughput.
Two-thirds of the profit lever, thrown away by an allocation policy.

Now, where have you seen this exact disease? An operating system, 1970: many processes, each
with unpredictable memory growth, each demanding contiguous address space. The OS textbook
cure is **virtual memory** — and it transplants almost verbatim:

- Chop the KV cache into fixed-size **blocks** — say 16 tokens' worth of keys and values each.
- Give each request a **page table**: logical block 0, 1, 2, … mapped to *any* free physical
  block, scattered wherever they land. The attention kernel follows the table; contiguity is
  no longer anyone's problem.
- **Allocate on demand**: a request holds exactly the blocks its tokens fill, acquiring block
  64 only when token 1,009 arrives. **Free on retirement**: the haiku's blocks return to the
  pool at step 30, instantly reusable.

Waste collapses to the last block's unfilled tail — at most 15 token-slots per request, under
2% for our 800-token request instead of 97%. This is **PagedAttention** (vLLM's core idea),
and 3.3 promised you'd meet it properly. Here's the payoff chain, each link from a prior
lesson: memory utilization goes to near-100% → the same HBM holds 3–5× more requests → batch
grows by that factor → (3.4) throughput grows with it. A memory-bookkeeping fix that
multiplies tokens per dollar.

And paging brings a bonus the OS also discovered: **sharing**. Two requests carrying the same
1,000-token system prompt have *identical* cache blocks for that prefix — so point both page
tables at one physical copy, and duplicate a block only if someone writes into it
(copy-on-write). A hundred concurrent requests on one 70B server, each with that system
prompt: naive storage $100 \times 330$ MB $\approx 33$ GB of identical bytes; shared, 330 MB
total. The freed gigabytes buy — what else — more batch.
`,
    },
    {
      type: 'ponder',
      question: md`It's a little suspicious how *cleanly* a 1970s operating-systems idea
transplants onto a 2020s GPU cache. Why does the OS playbook fit so well here? And is there a
famous part of the OS playbook that does **not** transplant — and what does the ladder of 4.1
say about it?`,
      answer: md`It fits because the *problem shape* is identical, and paging cures shapes,
not substrates: many independent tenants (processes / requests), each growing unpredictably
(malloc / one-token-at-a-time), where contiguous allocation forces worst-case reservation and
fragmentation. Any problem with that shape gets the same medicine — indirection through a page
table, allocation at block granularity, sharing via copy-on-write. What does **not**
transplant: **swap to disk**. The OS survives paging cold memory out because a sleeping
process can wait milliseconds. But a decode step needs a request's *entire* cache re-read
every ~10 ms (3.4); park that cache on NVMe at ~10–30 GB/s (4.1's bottom rung) and a 0.5 GB
cache costs ~30 ms just to fetch — the stream dies. A swapped cache is a dead conversation…
*mostly*. The honest footnote: swapping is fine when the "process" is genuinely asleep —
a user who's been typing for 40 seconds has an *idle* session, and real systems do offload or
even recompute idle caches (CPU RAM at PCIe speeds, or 3.5's prompt-cache storage), restoring
them before the next turn. The ladder's rule survives intact: match each byte's resting rung
to how soon you'll need it again.`,
    },
    {
      type: 'text',
      md: md`
## Two more tricks the pricing page is telling you about

**Prompt caching, now as a product.** Look again at a pricing page: "cached input" tokens sell
at a steep discount — often 5–10× cheaper than regular input (ballpark; it varies). Lesson 3.5
gave you the economics; you now hold the machinery. A cached prefix means its KV blocks are
*already resident* — the prefill compute for those tokens is simply skipped, and with paged,
hashable blocks, "is this prefix cached?" is a lookup, and "use it" is pointing your page
table at existing physical blocks (the copy-on-write sharing above, sold retail). What you pay
for is storage-time and the attention reads; what you skip is the compute. When a discount on
a pricing page maps one-to-one onto a data structure, you're reading infrastructure fluently.

**Disaggregated serving** (current industry practice — the design du jour for big fleets).
Prefill and decode have *opposite* resource appetites: prefill devours FLOPs and barely
touches bandwidth per token; decode devours bandwidth and cache capacity while multipliers
nap (3.4). Serving both from one GPU means each phase idles the other's favorite resource —
and worse, they *interfere*: one 100,000-token prefill monopolizes the compute units for
seconds, stuttering every decode stream sharing the card (the SLO conflict from the ponder
above; chunked prefill softens it but doesn't cure the mismatch). So: split the fleet.
A **prefill pool** runs prompts at high MFU; a **decode pool** runs fat batches against its
bandwidth; between them, ship each request's KV cache once. Price the shipment on 4.1's
ladder: a 2,000-token prompt's cache at 0.33 MB/token is about 0.66 GB — about a millisecond
over NVLink, a dozen or so over InfiniBand, paid *once* — versus mismatched utilization on every GPU *forever*.
The spend-the-slack principle, applied at fleet scale. And you can date the idea's rise:
disaggregation went mainstream as prompts got long (RAG, 3.5's cached mega-contexts), because
long prompts are what makes prefill big enough to deserve its own hardware.
`,
    },
    {
      type: 'example',
      title: 'the full invoice — deriving a posted price',
      md: md`
Assemble everything. One 8×H100 node (\$20/hour, 640 GB HBM, ~26.8 TB/s aggregate), 70B in
fp16 with 8-way GQA, continuous batching with PagedAttention holding batch $B = 64$ at ~8k
context each.

**Decode step time.** Each iteration hauls the weights once — 140 GB — plus every stream's
cache: $64 \times 8{,}192 \times 0.33$ MB $\approx 172$ GB. Total ~312 GB per step:

$$\frac{312 \text{ GB}}{26.8 \text{ TB/s}} \approx 11.6 \text{ ms per step}$$

Sit with that: a *solo* stream's step was ~5 ms. Batch 64 makes each step a bit over twice as
slow — and produces **64 tokens instead of 1**. That asymmetry is the entire economics of
inference. (Notice, too, that at this batch the *caches* outweigh the weights — 3.4's warning,
come true.)

**Throughput.** Ideal: $64 / 11.6$ ms $\approx 5{,}500$ tok/s. Real systems keep maybe a third
of ideal (scheduling gaps, all-reduces, attention kernels, ragged batches — ballpark), call it
**~1,800 tok/s** $\approx 6.6$ M tokens/hour. Cost:

$$\frac{\$20 / \text{hr}}{6.6 \text{ M tok/hr}} \approx \$3 \text{ per million output tokens}$$

That lands at the top edge of the posted \$1–3 range for 70B-class models. And real providers
take one more step you already own: serve weights *and* cache in 8-bit (4.4). Both hauls halve
(70 GB + 86 GB per step, ~5.8 ms), throughput roughly doubles, and the cost falls to about
**\$1.50 per million**. **The price is physics.** Naive \$140 → engineered \$1.50–3: continuous
batching, paging, and quantization did the closing — the 50–100× we owed.

**Why input is cheaper than output.** Price the prefill pool: the node peaks near 8 PFLOP/s
in bf16; at ~40% MFU that's 3.2 PFLOP/s against 140 GFLOPs per token — about 23,000 input
tokens/s, ~82 M/hour, roughly **\$0.25 per million input tokens**. Input runs ~5–10× cheaper
than output because prefill tokens share weight-hauls massively (compute-bound, parallel)
while output tokens are minted one serial bandwidth-bound step at a time. Check a pricing
page: input at 3–5× less than output. The physics predicts the *shape* of the menu.

**Sensitivity — which lever moves the invoice?** Not GPU price (linear, boring). Not kernel
tuning (percents). **Batch size** — cost per token scales like $1/B$ until memory runs out.
So every memory trick in this module converges on one ledger line, "how much batch fits":
GQA (3.3) shrinks each conversation's cache ~8×; PagedAttention stops wasting 60–80% of the
pool; quantization (4.4) shrinks weights *and* cache bytes; MoE (4.3) shrinks the per-step
weight-haul itself. Different lessons, one invoice.
`,
    },
    {
      type: 'ponder',
      question: md`Do the derivation yourself before peeking: from prefill-vs-decode physics
*alone* — no business reasoning — why should input tokens be priced several times cheaper than
output tokens? And having derived the ratio, what does it mean that real pricing pages land at
3–5× rather than the ~10× the raw physics suggests?`,
      answer: md`An input token's marginal cost is almost pure *compute*: prefill processes
the whole prompt in parallel, so each weight-haul is amortized over thousands of tokens and
the GPU runs near its FLOP ceiling — ~140 GFLOPs per token for a 70B model, ~23,000 tok/s per
node, a fraction of a dollar per million. An output token's marginal cost is a *serial
bandwidth event*: it cannot exist until its predecessor does, and its step hauls the working
set through HBM — even batched 64-wide, roughly 2,000–4,000 tok/s per node. Same node, about
ten times fewer tokens per hour: output must cost roughly that multiple more. That the menu says
3–5× instead of ~10×
is itself informative: input tokens carry costs beyond their FLOPs (their KV cache occupies
the pool's memory for the whole conversation, taxing everyone's batch), margins and SLO
headroom differ per phase, and fleets amortize across traffic mixes. The habit worth keeping:
**a pricing page is a physics exam you can now pass** — derive the number, compare, and treat
any residual as a question with an answer, not noise.`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The two clocks:** TTFT = queue + prefill, compute-bound, grows with prompt length;
   TPOT = decode, bandwidth-bound, pinned at 3.4's ceiling. Streaming sells the first and
   hides the second.
2. **The naive scandal, in dollars:** one user, one H100, ~\$7/M tokens for 7B and ~\$140/M for
   70B — with 99.9% of the silicon idle. Posted prices are 30–100× lower; the gap is the
   engineering, never a subsidy.
3. **Continuous batching:** nothing forces batch membership to be constant — rebuild the
   roster every decode step (ski lift, not tour bus); ~10–20× throughput, bought with a
   measured, SLO-governed tax on individual smoothness.
4. **PagedAttention, cashed from 3.3:** worst-case contiguous reservation wasted 60–80% of
   the cache pool (reported); virtual memory's cure — 16-token blocks, per-request page
   tables, on-demand allocation, copy-on-write prefix sharing — takes utilization to
   near-100%, and freed memory is freed *batch*, which is throughput.
5. **The menu decoded:** cached-input discounts are page-sharing sold retail (3.5);
   input-vs-output pricing is prefill-vs-decode physics; disaggregated pools are
   spend-the-slack (4.1) at fleet scale — ship well under a gigabyte once instead of mismatching utilization
   forever.
6. **The invoice:** cost per token ≈ node dollars/hour ÷ (batch × steps/second × 3600), and
   batch is bounded by cache memory — which is why GQA, paging, quantization (4.4), and MoE
   (4.3) all cash out on the same ledger line.

Next lesson: the graduation exercise. A model card lands on your desk — 52B/12B MoE, GQA 48/8,
RoPE base 1M, sliding windows, int4 — and every line item on it maps to a lesson you now own.
Time to read the menagerie.
`,
    },
  ],
  questions: [
    {
      id: 'm4-l5-q1',
      kind: 'mcq',
      prompt: md`Customer A sends a 50-token prompt; customer B sends a 50,000-token prompt to
the same server. Both request a 500-token answer. What does the physics of the two phases
predict about their experiences?`,
      options: [
        'B waits far longer for the first token (prefill compute scales with prompt length), but once streaming starts, both see roughly similar token rates (decode is dominated by the weight-haul)',
        'Both see identical time-to-first-token, because the GPU processes all prompt tokens in parallel',
        'B’s entire generation runs ~1000× slower per token, since every decode step must re-read the longer prompt from scratch',
        'B’s tokens stream faster, because a longer context gives the model more information per prediction',
      ],
      answer: 0,
      explain: md`TTFT is a compute bill that grows with input: 1000× the prompt tokens is
~1000× the prefill FLOPs — parallel, yes, but parallel is not free; the work still takes
proportionally longer. TPOT is a bandwidth bill dominated by hauling the weights, so both
stream at similar rates (B slightly slower — his larger KV cache adds to each step's reads,
but the weights dominate). Option B is the tempting half-truth: "parallel" means high
utilization, not zero time. Option C describes a world without the KV cache — 3.3 exists
precisely so the prompt is *not* re-read each step. Option D confuses prediction quality with
hardware speed.`,
    },
    {
      id: 'm4-l5-q2',
      kind: 'numeric',
      prompt: md`Naive serving, on paper: one H100 rents for \$2.52/hour and serves a single
user at 100 tokens/s, nonstop. What is the cost in **dollars per million output tokens**?`,
      answer: 7,
      tolerance: 0.5,
      explain: md`$100 \times 3600 = 360{,}000$ tokens/hour; $2.52 / 0.36 = \$7$ per million.
Now hold that against a posted price of ten to thirty cents for this model class: naive
serving misses by ~25–70×, while using 0.1% of the GPU's arithmetic. The rest of the lesson
is the machinery that closes exactly this gap — if you remember one number from serving
economics, make it this one.`,
    },
    {
      id: 'm4-l5-q3',
      kind: 'mcq',
      prompt: md`What, precisely, does **continuous batching** change relative to static
batching?`,
      options: [
        'It groups requests of similar predicted length into the same batch so they finish together',
        'It rebuilds batch membership at every decode iteration — finished requests release their slot immediately and queued requests are admitted mid-flight, so no slot ever computes padding',
        'It increases the maximum batch size so more requests fit per launch',
        'It runs each request on its own CUDA stream so requests finish independently',
      ],
      answer: 1,
      explain: md`The insight is that nothing forces the batch roster to be constant: the
decode loop is already per-token, so admission and retirement can happen at token
granularity — the ski lift, not the tour bus. Option A is tempting because it's a *real*
mitigation for static batching (length-aware bucketing) — but it only shrinks the disease,
and it can't help when lengths are unpredictable. Option C is orthogonal: a bigger static
batch has proportionally bigger dead-slot waste. Option D abandons batching's entire point —
separate streams don't share the weight-haul, which was the whole economy (3.4).`,
    },
    {
      id: 'm4-l5-q4',
      kind: 'numeric',
      prompt: md`PagedAttention with 16-token blocks: how many **blocks** does a request
holding exactly 1,000 tokens of KV cache occupy?`,
      answer: 63,
      tolerance: 0.6,
      explain: md`$1000 / 16 = 62.5$, and you can't hold half a block: **63**, with the last
block only half full. That half-block — at most 15 wasted token-slots — is the *entire*
remaining waste per request, versus tens of thousands of slots under worst-case contiguous
reservation. Paging doesn't eliminate internal fragmentation; it shrinks its ceiling to one
block, which is why block size is a tuning knob (smaller blocks waste less but mean longer
page tables and more scattered reads).`,
    },
    {
      id: 'm4-l5-q5',
      kind: 'written',
      prompt: md`**The PagedAttention story, told whole.** On paper, write the four-part
account: (1) the *disease* — why contiguous per-request KV allocation wastes memory, with a
worked number (e.g. a 32k reservation against an 800-token request); (2) the *cure* — blocks,
page tables, on-demand allocation, and where the only remaining waste hides; (3) the *bonus* —
copy-on-write prefix sharing, with a number for 100 requests sharing a 1,000-token system
prompt at 0.33 MB/token; (4) the *payoff chain* — trace how a memory-bookkeeping fix ends up
multiplying tokens per dollar, citing which prior lesson supplies the crucial link.`,
      rubric: md`**(1) Disease:** final length is unknown at admission, so classic allocators
reserve worst-case contiguous slabs — 32,768 slots reserved, 800 used, is >97% waste for that
request; the vLLM paper reported 60–80% of KV memory wasted across real mixes (fragmentation
plus unused reservations).

**(2) Cure:** chop the cache into fixed blocks (~16 tokens); a per-request page table maps
logical to physical blocks, so blocks land anywhere free; allocate only when tokens actually
arrive; free instantly on retirement. Remaining waste = the last block's unfilled tail, at
most 15 slots (< 2% at 800–1,000 tokens).

**(3) Bonus:** identical prefixes are identical blocks — map 100 page tables to one physical
copy, duplicating only on write. Numbers: $1{,}000 \times 0.33$ MB $= 330$ MB shared once
versus $100 \times 330$ MB $= 33$ GB duplicated.

**(4) Payoff chain:** near-100% memory utilization → 3–5× more concurrent requests in the
same HBM → batch grows by that factor → **3.4's amortization law** (the crucial link: batch
multiplies tokens per weight-haul) → throughput and dollars-per-token improve by roughly the
same factor.

Full credit requires all four parts *with the numbers*; the payoff chain must explicitly pass
through batch size — "it saves memory so it's faster" without the batch link is the half-
understanding this question exists to catch.`,
    },
    {
      id: 'm4-l5-q6',
      kind: 'mcq',
      prompt: md`A colleague says: "PagedAttention speeds up serving by computing attention in
small tiles that fit in on-chip SRAM." What's wrong with this?`,
      options: [
        'Nothing — that is exactly what PagedAttention does',
        'They’ve described FlashAttention (4.1). PagedAttention is a memory-management fix: it changes how KV cache is allocated (blocks + page tables instead of contiguous worst-case slabs), attacking fragmentation, not kernel speed',
        'PagedAttention actually works by quantizing the KV cache to 4-bit blocks',
        'PagedAttention actually works by evicting tokens older than a sliding window',
      ],
      answer: 1,
      explain: md`The confusion is natural — both are famous, both touch attention, both live
in serving stacks — but they solve *different diseases on different rungs*: FlashAttention
reroutes the attention **computation** through SRAM so the $n^2$ matrix never touches HBM
(4.1's ladder move); PagedAttention reforms **allocation** so reserved-but-unused cache stops
eating the batch budget. A production server runs *both*, which is exactly why people blur
them. Option C is a real, separate technique (cache quantization, 4.4-adjacent); option D
describes windowed attention (next lesson) — eviction changes *what the model can see*, while
paging is invisible to the model.`,
    },
    {
      id: 'm4-l5-q7',
      kind: 'numeric',
      prompt: md`A serving system reserves a contiguous KV slab of 32,768 token-slots for
every request. A request finishes having used 8,192 slots (prompt + output). What
**percentage** of its reservation was wasted?`,
      answer: 75,
      tolerance: 3,
      explain: md`$(32{,}768 - 8{,}192)/32{,}768 = 0.75$ — **75%**, and this was a *long*
request; an 800-token chat wastes over 97%. Since cache memory bounds the batch and batch is
throughput (3.4), a 75%-wasteful allocator quarters your feasible batch: the allocator, not
the GPU, sets the price. This arithmetic is the entire motivation for paging.`,
    },
    {
      id: 'm4-l5-q8',
      kind: 'written',
      prompt: md`**Derive, don't recall — the invoice.** From first principles, on paper,
derive cost per million output tokens for a 70B fp16 model on an 8×H100 node (\$20/hour,
~26.8 TB/s aggregate HBM bandwidth), twice: (1) naive single-stream (assume ~40 tok/s after
overheads — say why it's bandwidth-bound); (2) continuous batching at $B = 64$, ~8k context,
0.33 MB/token cache — compute the per-step haul (weights + caches), step time, ideal
throughput, apply a ~1/3 reality factor, and get dollars per million. Then name the single
biggest lever in your formula, what bounds it, and the module tricks that buy more of it.`,
      rubric: md`**(1) Naive:** decode hauls 140 GB of weights per token; $140/26.8 \approx
5$ ms floor, overheads → ~40 tok/s → 144k tok/hour → $20/0.144$ M $\approx \$140$/M.
Bandwidth-bound because one token per step gives arithmetic intensity near 1 flop/byte — the
multipliers idle while HBM streams (3.4).

**(2) Batched:** per-step haul $= 140$ GB weights $+ 64 \times 8192 \times 0.33$ MB
$\approx 172$ GB caches $\approx 312$ GB; step $\approx 312/26.8 \approx 11.6$ ms; ideal
$64/0.0116 \approx 5{,}500$ tok/s; ×(~1/3) → ~1,800 tok/s → ~6.6 M tok/hour →
$\approx \$3$/M. Bonus credit for noticing the punchline: steps got a bit over 2× slower and
output 64× larger — and for adding that 8-bit weights and cache halve both hauls, bringing it to
~\$1.50/M.

**(3) The lever:** batch size $B$ — cost scales ~$1/B$ until the ceiling. **The bound:** KV
cache memory (each admitted stream needs ~2.7 GB here). **What buys more:** GQA (3.3, ÷8
cache), PagedAttention (recovers the 60–80% wasted), quantization (4.4, fewer bytes per
weight *and* per cache entry), MoE (4.3, smaller per-step weight-haul).

Grade yourself "nailed it" only if every number was *derived* (haul ÷ bandwidth, tokens ÷
dollars) rather than recalled, and the lever-bound-remedy triple is explicit. This is the
back-of-envelope that infra interviews and capacity-planning meetings actually run on.`,
    },
    {
      id: 'm4-l5-q9',
      kind: 'numeric',
      prompt: md`**Fermi, at real scale:** an 8×80 GB H100 node (640 GB total) serves a 70B
model in fp16 — weights take 140 GB of the node. Llama-70B's GQA cache costs about
0.33 MB/token (80 layers × 8 KV heads × 128 dims × K and V × 2 bytes), and every conversation
holds 8,192 tokens of context.
Roughly how many **concurrent conversations** fit in the remaining HBM? (Generous tolerance —
the point is *what* bounds concurrency, not the third digit.)`,
      answer: 186,
      tolerance: 60,
      explain: md`Free memory: $640 - 140 = 500$ GB. Per conversation:
$8{,}192 \times 0.33$ MB $\approx 2.7$ GB. So $500 / 2.7 \approx$ **186 conversations** — a
bit fewer once you subtract activation buffers and headroom, hence the tolerance. (Without GQA,
at ~2.6 MB/token, it would be about 23.) Notice what you just computed: not a memory statistic but the **throughput
ceiling** — cache capacity bounds batch, and batch is throughput (3.4). Every trick in this
module that shrinks cache or weights (GQA, paging, int4, MoE) is really buying more
conversations under this same roof.`,
    },
    {
      id: 'm4-l5-q10',
      kind: 'mcq',
      prompt: md`Why do large serving fleets increasingly run **disaggregated serving** —
prefill on one GPU pool, decode on another, shipping the KV cache between them?`,
      options: [
        'It avoids ever transferring KV cache between GPUs',
        'Prefill and decode use different weight matrices, so separate pools avoid loading both',
        'Prefill is compute-hungry and decode is bandwidth/memory-hungry; shared GPUs idle one resource per phase and long prefills stutter everyone’s decode streams — separate pools fix both, at the price of one cheap cache shipment per request',
        'Disaggregation is required for streaming responses to work',
      ],
      answer: 2,
      explain: md`Opposite resource profiles (3.4) mean a shared GPU always wastes something:
during prefill the bandwidth sits idle; during decode the multipliers do. Worse is the
interference — a 100k-token prefill occupies the compute units for seconds, freezing
co-resident decode streams (a TPOT SLO violation you can watch). The ladder (4.1) prices the
fix: shipping a 2k-prompt's cache is ~0.66 GB, milliseconds, once — versus mismatch on every
step forever. Option A is exactly backwards: the cache shipment is the *cost* disaggregation
accepts. Option B is false — same weights both phases. Option D confuses transport-level
streaming with fleet topology.`,
    },
    {
      id: 'm4-l5-q11',
      kind: 'written',
      prompt: md`**The SLO memo.** You operate a serving fleet with two promises: TTFT under
1 s, TPOT under 40 ms. Symptom: whenever a very long prompt (say 100k tokens) arrives,
active users' streams visibly freeze for a couple of seconds, though average throughput looks
fine. On paper: (1) diagnose the mechanism — which phase, which resource, why co-resident
streams stall; (2) propose two mitigations from this lesson, and for each state what it
protects, what it costs, and who pays; (3) state the general principle relating utilization
to latency that your memo is an instance of.`,
      rubric: md`**(1) Diagnosis:** the 100k prefill is a compute-bound burst (~100k × 140
GFLOPs for a 70B) that monopolizes the node's arithmetic units for seconds; decode iterations
of co-resident streams can't run meanwhile, so their inter-token gap — TPOT — blows through
the 40 ms SLO. Throughput averages hide it because total tokens/hour barely move; it's a
*tail latency* event.

**(2) Two mitigations** (any two, with protect/cost/payer):
- *Chunked prefill:* slice the 100k prefill into pieces interleaved between decode steps —
  protects everyone's TPOT; costs the long-prompt user a somewhat later first token; the big
  request pays.
- *Disaggregation:* move prefill to its own pool, ship the ~33 GB cache (100k × 0.33 MB)
  once — protects both SLOs; costs hardware partitioning plus the shipment; the operator
  pays in fleet complexity.
- *(Also acceptable)* SLO-aware admission: refuse/queue giant prefills when predicted TPOT
  impact exceeds budget — protects incumbents; costs TTFT for the newcomer.

**(3) The principle:** utilization and per-user latency trade against each other on one dial
(this lesson's continuous-batching ponder / 4.1's spend-the-slack): a fleet at 100%
utilization has no slack to absorb bursts, so SLOs are *purchased* by deliberately not
maximizing throughput. Any honest phrasing accepted; restating "batching is good" is not the
principle.`,
    },
    {
      id: 'm4-l5-q12',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old** why an AI answer costs the company almost
nothing per word, even though the computer it runs on costs more than a car. You must make the
kid understand: (1) why serving one person at a time would be ruinously wasteful (find an
analogy for the expensive machine mostly sitting idle); (2) the sharing trick (many people's
words made in one go); (3) the no-hoarding trick (why promising everyone a huge amount of
space up front wastes it, and what to do instead). No unexplained jargon — every technical
word gets a kid-sized explanation first or doesn't appear.`,
      rubric: md`Grade the teaching, not the vocabulary:

1. **The idle machine made vivid** — e.g. a giant pizza oven that costs a fortune per hour
   whether or not it's full: baking one pizza at a time means paying for a whole oven's heat
   to cook one dinner. (Any analogy that makes *fixed cost + idleness* concrete earns it.)
2. **The sharing trick (batching)** — the oven bakes 64 pizzas in nearly the time of one, so
   each pizza's share of the bill drops ~64×; and crucially the kid-version of *continuous*
   batching: when one pizza is done, its spot is given to the next order *immediately* — no
   waiting for the whole ovenful to finish.
3. **The no-hoarding trick (paging)** — e.g. a cloakroom that reserves 40 hooks for every
   guest because they *might* bring 40 coats: nearly all hooks sit empty and guests get
   turned away at the door. Better: hand out hooks one at a time as coats actually arrive,
   keep a list of whose hooks are whose, take hooks back when a guest leaves. More guests fit
   in the same cloakroom.
4. **Jargon audit:** GPU, batch, KV cache, token, fragmentation, allocation — each used
   without a kid-words explanation costs credit. Inventing a better analogy than the rubric's
   earns more than borrowing these; the test is whether the *trade* (share the fixed cost,
   don't reserve what you might not use) survives translation.`,
    },
  ],
}
