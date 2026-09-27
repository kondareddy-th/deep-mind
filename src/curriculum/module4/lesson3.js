// Module 4, Lesson 3 — Mixture of Experts (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm4-l3',
  title: '4.3 Mixture of Experts — pay for what you use',
  subtitle: md`Lesson 2.5 found two-thirds of every transformer living in the FFN — and every token, from "the" to "cyclopentadiene", pays the full toll. This lesson asks the forbidden question: must every token touch every parameter? The answer splits one number into two, and the split reshapes the entire infra bill.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Lesson 2.5 ended with an audit you should still find slightly scandalous: the FFN — that
unglamorous $d \to 4d \to d$ sandwich — holds roughly **two-thirds of all the parameters** in a
transformer. Attention gets the papers; the FFN gets the budget.

Now add the part nobody dwells on: **every token pays the full toll.** The word *the* — which the
model has seen billions of times and could handle in its sleep — marches through the same
~135-million-parameter FFN layer (that's a 7B-class model's per-layer bill, $8d^2$ with
$d = 4096$, straight from 2.5's arithmetic) as the token for a rare chemistry term the model has
met forty times ever. Same matrices, same ~270 MFLOPs per layer, thirty-two times over. Recall
2.5's picture of the FFN as a **key-value memory**: rows of stored patterns, a giant library of
facts. Then what we've built is a library where **every visitor must read every book before
leaving** — the tourist asking for directions and the doctoral student get identical treatment,
and the treatment is "the whole library."

Here's what makes this genuinely uncomfortable rather than just inelegant. There is a lawlike
empirical regularity (Module 5 will formalize it as *scaling laws*): **more parameters, more
smarts** — reliably, predictably. So we want the library *bigger*. But every book we add raises
the toll on every visitor: more FLOPs per token, and — by 3.4's decode law, tokens/sec =
bandwidth ÷ bytes — more bytes streamed per token, so *slower generation for everyone, forever*.

Unless the two numbers can be pried apart. **Must "how much the model knows" and "how much one
token pays" be the same number?**

## The idea, derived — where can you even split?

Don't reach for the answer yet; ask where a split is *possible*. Attention is the conversation
between tokens — token 7 reads keys and values from tokens 1 through 6. Specialize *that* per
token and the conversation fragments. But the FFN, 2.5 taught, is a **per-token** operation:
each token walks through it alone, no cross-talk, like visitors reading in private carrels. A
layer that each token traverses privately can be *specialized per token* without any other token
noticing.

So do the obvious-in-hindsight thing. Replace the one big FFN with $N$ smaller FFNs — call them
**experts** — and hire a receptionist: a **router**. The router is nothing exotic. It is a single
linear layer producing $N$ scores from the token's vector, then lesson 1.4's softmax turning
scores into probabilities — the same machine that ends every transformer, now hired for triage.
Take the **top-$k$** experts (classically $k = 2$; newer fine-grained designs pick more, smaller
experts — DeepSeek-V3 takes 8 of 256), run *only those*, and blend their outputs
weighted by the renormalized router probabilities:

$$\text{output} = \sum_{i \in \text{top-}k} \frac{p_i}{\sum_{j \in \text{top-}k} p_j}\; E_i(\mathbf{x})$$

The other $N - k$ experts do not run. Not "run cheaply" — *do not run*. Their weights are not
multiplied, and (hold this thought for the infra section) not even *read*.

Now count what happened. Capacity grew with $N$: eight experts is eight libraries' worth of 2.5's
key-value facts. Per-token compute stayed at $k$ experts' worth: each visitor still reads about
one small library. The single number just became two:

- **Total parameters** — what the model *knows*; what memory must *hold*.
- **Active parameters** — what one token *touches*; what one token's compute and (crucially)
  decode bandwidth *pay*.

That decoupling is the entire idea of **Mixture of Experts (MoE)**. Everything else in this
lesson is the price tag — and MoE charges in three currencies: a training disease, a memory
bill, and a brand-new communication pattern. First, though, let's check the decoupling against a
real model's books.
`,
    },
    {
      type: 'example',
      title: 'Mixtral 8×7B, audited — why 8 × 7 is not 56',
      md: md`
Mixtral 8×7B: 32 layers, 8 experts per layer, top-2 routing. The name begs you to compute
$8 \times 7 = 56$B. The reported total is **~47B**. Where did 9 billion parameters go? They never
existed — the "×8" applies only to the FFN experts, and the audit shows it (all figures reported
ballparks):

| component | arithmetic | params |
|---|---|---|
| shared trunk: attention (all 32 layers) + embeddings + routers | exists **once** | ~1.7B |
| one expert's FFN stack (32 layers × ~176M per layer) | per expert | ~5.6B |
| **total** | $1.7 + 8 \times 5.6$ | **~46.5B ≈ 47B** |
| **active per token** | $1.7 + 2 \times 5.6$ | **~12.9B ≈ 13B** |

The naive 56B counts the shared attention and embeddings *eight times* — but there is one
conversation machinery, not eight. Only the per-token part multiplied.

Read the punchline as a ratio: a token flows through **13B of 47B — about 28%**. Mixtral answers
with quality in the neighborhood of a dense ~47B-class model while each decoded token pays the
compute and bandwidth bill of a ~13B. And for the fullest version of the bet, DeepSeek-V3
(reported): **671B total, 37B active** — a token touches about **5.5%** of the model. The
decoupling is not a rounding trick; at the frontier it is nearly a factor of twenty.
`,
    },
    {
      type: 'text',
      md: md`
## What do the experts become? (Honest section)

The word "expert" writes a story in your head: expert 3 is the math expert, expert 5 does poetry,
expert 7 handles Python. It is a lovely story, and when researchers actually looked — the Mixtral
authors did, and many since — it is **mostly false**. Routing shows no clean topical
specialization. What shows up instead is opportunistic, hard-to-name affinity: this expert
disproportionately catches punctuation, that one digits and number-like tokens, another
whitespace-and-indentation-heavy code contexts, another certain word-fragments; consecutive
tokens often switch experts mid-word. The router discovered *some* consistent division of labor —
routing is far from random — but it carved the space along seams that made the *loss* go down,
not seams a human would label. Why the experts specialize the way they do, and whether cleaner
specialization can be induced, is **open research**. Treat any tidy "math expert" diagram you see
online as marketing.

DeepSeek-V3 pushes the design further in two honest-to-report ways: **finer-grained experts**
(many small experts per layer — 256 routed, choose 8 — so capacity is carved into slivers and
combinations multiply) plus **one shared, always-on expert** that every token visits, a place for
the common knowledge every token needs so the routed experts don't all have to duplicate it.
Same decoupling, finer knife.

So the architecture works and the labels are murky. Fine. Now for the part that nearly killed the
idea in practice: *training* a router is a feedback system, and feedback systems have failure
modes. Before reading on, try to find this one yourself — the next ponder walks you into it.
`,
    },
    {
      type: 'ponder',
      question: md`Training, day one. The experts start near-identical (random init, no reason to
differ) and the router routes near-uniformly. Now suppose expert 3, by pure luck of
initialization, is *slightly* better on some tokens — so the router, trained to minimize loss,
nudges its probability up a little. Trace the consequences forward yourself: what happens to
expert 3's share of tokens? To its gradient updates? Then to its quality? Where does this end?
And here's the sharper question: lesson 2.3 showed attention heads starting symmetric and
*drifting apart* under training — and there, symmetry breaking was exactly what we wanted. Why is
the same-looking process a disease here and a feature there? What is structurally different?`,
      answer: md`The loop: slightly better → router sends **more tokens** → more tokens means
**more gradient**, tuned on more real data → expert 3 genuinely improves → router sends even
more → ... Each turn of the loop amplifies the next. The fixed point is ugly: **expert
collapse** — one (or two) experts receive essentially all traffic and all learning, while the
other six sit frozen at approximately their random initialization, atrophied. You paid the
memory bill for eight libraries and trained one.

The structural difference from 2.3 is *what flows through the loop*. Attention heads all see
**all** tokens, always; when heads drift apart, they differentiate in *what function they
compute on shared input* — competition never touches their food supply. Experts **eat their
tokens**: the routing decision *is* the allocation of training data, and training data is the
food of learning. A head that lags still gets fed and can catch up; an expert that lags gets
*starved*, and starvation is self-reinforcing. Symmetry breaking is not the disease — 2.3 taught
you it's usually the goal. **Unequal food with a rich-get-richer allocator is the disease.** Any
system where performance controls data assignment has this failure mode waiting — remember that
beyond MoE.`,
    },
    {
      type: 'text',
      md: md`
## The training disease, and the three standard medicines

Let's put cartoon numbers on the loop so you feel its speed. Batch of 1,000 tokens, 8 experts,
top-2 — balanced would be 250 tokens each. Say expert A starts at 260 (a 4% edge from luck). A
gets 4% more practice this step, so its edge grows; next week it's catching 350 per batch, the
week after 500, and the router's softmax — remember from 1.4 that softmax turns a modest score
lead into a landslide — locks it in. The endgame is two favorites carrying everything. (Numbers
illustrative; the dynamic is real and was the central obstacle in early MoE work.)

Three medicines have been standard in modern MoEs (with one notable dissent: DeepSeek-V3 replaced
most of the auxiliary loss below with a cheaper bias-adjustment trick, which lesson 8.3 unpacks):

**1. The auxiliary load-balancing loss.** Add to the training loss a term shaped like

$$\mathcal{L}_{\text{balance}} = \alpha \, N \sum_{i=1}^{N} f_i \, P_i$$

where $f_i$ is the **fraction of tokens actually routed** to expert $i$ (hard counts — facts on
the ground, not differentiable) and $P_i$ is the **mean router probability** for expert $i$
(soft, differentiable). Feel the shape: $\sum_i f_i P_i$ is a dot product of two probability
vectors — 1.1's agreement-meter, of all things, repurposed as a *penalty*. It is largest
(near 1) when traffic and the router's affection concentrate on the *same* expert, and smallest
($1/N$, so the $N$ out front normalizes uniform to exactly 1) when either spreads evenly.
Collapse scores about $N$; balance scores 1; minimizing pushes toward uniform. And the two-factor
design is the actual cleverness: gradients flow through the differentiable $P_i$, *steered* by
the non-differentiable-but-true $f_i$. You penalize the router's opinions in proportion to their
measured consequences.

**2. Capacity factors — and the honest wart.** Each expert gets a fixed buffer of slots per
batch, about $(\text{tokens}/N) \times c$ with $c \approx 1.0$–$1.25$. When a popular expert's
buffer fills, the overflow tokens are **dropped**: they skip the FFN entirely and ride the
residual stream through unchanged. Yes — production training systems throw tokens on the floor,
by design, because a variable-size buffer would wreck the fixed-shape tensor math that keeps
GPUs fast. It works well enough. It is still a wart, and you should say "dropped tokens" out
loud when someone shows you a suspiciously clean MoE diagram.

**3. The router z-loss.** One line: a small penalty on the router's logit magnitudes, keeping the
softmax out of its saturated regime — a numerical-stability seatbelt, nothing deeper.

One medicine you might have proposed didn't make the list: route to only the single best expert
(top-1) and save half the compute. It's been done — but $k = 2$ won the argument, and the reason
is worth deriving yourself.
`,
    },
    {
      type: 'ponder',
      question: md`Why route each token to the top **two** experts during training rather than
just the best one? Top-1 would halve the active compute — seemingly the whole point of MoE. What
does the runner-up's participation buy that's worth doubling the bill? (Hint: gradients only flow
through computations that *happen*. What can the router learn about an expert that never runs?)`,
      answer: md`Gradients flow only through experts that **run**. Under top-1, the runner-up on a
token contributes nothing to the output, so the training signal contains no information about
*whether the runner-up would have done better* — the router can never revise its ranking from
evidence it refused to collect. That's collapse's best friend: early wrong opinions freeze.
Top-2 gives the runner-up a real, weighted share of the output, hence real gradient on real
tokens — **second chances**, continuously. It also makes the layer's output a smooth *blend*
whose mixture weights are differentiable, so the router learns from a live comparison ("of my
two picks, which one actually helped?") rather than a counterfactual. And the marginal cost is
mild: $2\times$ one small expert, still $\ll N$. Top-1 routing *can* be made to work (the Switch
Transformer did, with careful balancing) — top-2 is not a law, just the design point where
exploration, differentiability, and cost settle comfortably. Notice the theme repeating: the
discrete routing choice is the source of *all* the trouble — collapse, dropped tokens, and this
gradient blindness are one disease with three faces.`,
    },
    {
      type: 'viz',
      viz: 'moe-router',
      caption: md`A live token stream flows through the router into 8 expert boxes along top-2
arcs; each expert's load bar fills as tokens land, and the imbalance meter (max load ÷ mean
load) drifts red as favorites emerge. Three experiments: (1) set the load-balancing incentive
slider to 0 and just watch — two favorite experts hog the stream and the meter reddens: that is
rich-get-richer happening in front of you, no equations; (2) drag the incentive up mid-stream
and watch the loads spread back toward level as the router pays for its favoritism; (3) read
the readout under the boxes — 8 experts total, 2 active per token — the whole decoupling,
capacity versus per-token cost, in one line.`,
    },
    {
      type: 'text',
      md: md`
## The infra ledger — 4.1's walls, revisited with a router

Now bring in Module 4's machinery, because MoE's real character shows up on the memory ladder.
Two walls, and MoE treats them *oppositely*. State it carefully:

**Bandwidth: MoE wins, and the win is the point.** Lesson 3.4's decode law: tokens/sec =
bandwidth ÷ bytes *moved* per token. To decode one token, only the chosen experts' weights (plus
the shared trunk) must stream from HBM to the multipliers — the six unchosen experts per layer
are not read. So the bytes-per-token that set the decode ceiling scale with **active**
parameters: for Mixtral, ~13B's worth of bytes, not 47B's worth. A ~3.6× higher ceiling than a
dense 47B at equal precision, purely because fewer bytes move. (One honest asterisk: with a
*large batch*, different tokens choose different experts, so collectively every expert gets read
anyway and the amortization arithmetic shifts — the clean per-token story is exact for
single-stream decoding, and lesson 4.5 will redo the accounting for busy servers.)

**Capacity: MoE pays, in full, up front.** All 47B parameters must be **resident** in fast
memory — the 4.1 ladder flatly forbids the tempting alternative. Fantasize about parking the
idle experts one rung down and paging in each token's choices on demand; the ladder prices the
fantasy in the worked example below, and the price is a hundredfold slowdown. So every expert
occupies HBM around the clock while sitting idle for most tokens: **you buy memory for what the
model knows, and bandwidth only for what each token uses.** Capacity bill: total params.
Speed bill: active params. Same decoupling, now stamped on the hardware invoice — and its blunt
consequence is *more GPUs for the same active compute* than a dense model of equal speed.

**A fifth communication signature.** Lesson 4.2 gave you four ways to split a model and each
split's traffic signature. MoE adds its own: **expert parallelism**. Shard the experts across
GPUs — GPU 0 holds experts 0–1, GPU 1 holds 2–3, and so on. But the router assigns tokens with
no regard for where experts live, so the tokens must **travel**: each MoE layer performs an
**all-to-all** — every GPU sends each of its tokens to whichever GPU holds that token's chosen
experts, the experts compute, and a second all-to-all brings the results home. Twice per MoE
layer, every layer, on the latency-critical path — which, by 4.1's ladder logic, is traffic you
keep inside the NVLink island whenever you possibly can.

**And batches smooth the whole machine.** At batch 1, a token's two experts work while six
experts' worth of silicon idles. At batch 256 with decent balance, each expert sees around
$256 \times 2 / 8 = 64$ tokens — everybody's fed, utilization evens out by sheer statistics.
MoE is an economy-of-scale architecture: it is happiest exactly where lesson 4.5 is headed,
in a busy serving fleet.
`,
    },
    {
      type: 'example',
      title: 'three verdicts from the ladder, MoE edition',
      md: md`
Same game as 4.1's example — adjudicate real design calls with arithmetic, no benchmarks:

**1. "Only 2 of 8 experts are active — page the idle ones in from CPU RAM on demand."** One
expert is ~176M params per layer ≈ 350 MB at bf16. Per layer per token you'd haul 2 experts =
700 MB across PCIe at ~64 GB/s ≈ 11 ms; times 32 layers ≈ **350 ms per token ≈ 3 tokens/sec** —
against ~100+ tokens/sec with everything resident in HBM. From NVMe (~7 GB/s), ten times worse
again. Verdict: **never** — the 4.1 ladder forbids paging experts per token; resident or
nothing. This single verdict *is* MoE's capacity bill.

**2. "We deployed Mixtral expert-parallel across 8 GPUs; interactive traffic is one request at a
time."** Each token lights up 2 experts; roughly three-quarters of the expert silicon idles at
any layer. The fix isn't architectural, it's commercial: **traffic**. At batch 256, each expert
sees ~64 tokens per layer and the fleet hums. Verdict: **MoE underperforms at batch 1 and
shines under load** — size deployments for the traffic you actually have (4.5's subject).

**3. "Let's shard experts across two servers — capacity's tight."** Expert parallelism's
all-to-all runs twice per MoE layer on the critical path. Across InfiniBand, each hop costs
~30–60× more per byte than NVLink (4.1's table). Verdict: same as 4.1's tensor-parallel ruling —
**keep the all-to-all inside the NVLink island**; if experts must span servers, span them so
that cross-server hops carry the gentler traffic. The ladder settles it before any benchmark
runs.
`,
    },
    {
      type: 'ponder',
      question: md`Your laptop has 64 GB of unified memory at ~400 GB/s. Is Mixtral a good deal
*for you*? Work it as two separate tests — next lesson (4.4) will justify the 4-bit trick we're
borrowing on credit: at 4-bit, weights cost about half a byte per parameter. Test one: does it
*fit*? Test two: how *fast* does it decode (3.4's law, using which parameter count)? Then
compare against a dense 13B and a dense 47B, both also at 4-bit.`,
      answer: md`**Fit (capacity — binary):** $47\text{B} \times 0.5$ bytes ≈ **24 GB**. Under
64 GB with room for cache and life: passes. On a 16 GB machine the same model scores zero — not
"slower," *zero*. Capacity is a threshold, not a slope.

**Speed (bandwidth — linear):** decode streams only *active* bytes: $13\text{B} \times 0.5 ≈
6.5$ GB per token, so ceiling ≈ $400 / 6.5 \approx$ **60 tokens/sec** — exactly what a dense 13B
at 4-bit gets ($6.5$ GB/token), and ~3.6× what a dense 47B at 4-bit gets ($23.5$ GB/token →
~17 tokens/sec).

So on this laptop Mixtral decodes at **near-13B speed with near-47B quality** — you spent your
abundant resource (64 GB of capacity, of which the model wanted only 24) to buy performance in
your scarce one (bandwidth). That is 4.1's spend-the-slack principle wearing a router. The
general rule worth keeping: **capacity is binary, bandwidth is linear** — first check fit
(pass/fail on *total* params), then compute speed (slope, on *active* params).`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The decoupling:** replace one FFN with $N$ expert FFNs + a router (a linear layer and 1.4's
   softmax); run top-$k$ (usually 2). *Total* parameters (capacity, memory) and *active*
   parameters (per-token compute, decode bytes) become different numbers — Mixtral ~47B/13B,
   DeepSeek-V3 ~671B/37B, and the naive 8×7=56 fails because only FFNs multiply.
2. **Honest routing:** experts specialize opportunistically (token types, punctuation, code-ish
   contexts), not into tidy human topics; routing interpretability is open research.
3. **The disease and the medicines:** routing is rich-get-richer *through the data supply* —
   unlike 2.3's heads, experts eat their tokens — ending in expert collapse; treated with the
   load-balancing loss ($\alpha N \sum_i f_i P_i$, gradients through $P$, steering by $f$),
   capacity factors (dropped tokens — the wart), and the z-loss seatbelt.
4. **The infra ledger:** bandwidth follows *active* bytes (a 3.4 win); capacity follows *total*
   bytes, resident, because the ladder forbids paging (a 4.1 bill); expert parallelism adds the
   all-to-all — a fifth traffic signature beyond 4.2's four — and big batches smooth utilization.
5. **The buyer's rule:** capacity is binary, bandwidth is linear — check fit with total params,
   compute speed with active params.

One debt outstanding: this whole lesson casually priced weights at half a byte per parameter, as
if crushing a trained mind to sixteen levels per number were obviously fine — while 4.1 watched
*sixteen bits* fail. Next lesson pays that debt: quantization, or how many bits a thought
actually needs.
`,
    },
  ],
  questions: [
    {
      id: 'm4-l3-q1',
      kind: 'mcq',
      prompt: md`What is the one decoupling that Mixture of Experts achieves?`,
      options: [
        md`It separates total parameter count (capacity; what memory must hold) from active parameter count (what each token computes with and streams per decode step)`,
        md`It reduces the total memory needed to serve a model of a given quality`,
        md`It makes attention cheaper as well as the FFN, since both are routed`,
        md`It makes each expert individually smarter than the original dense FFN`,
      ],
      answer: 0,
      explain: md`MoE splits "how much the model knows" from "how much one token pays." Option B
is tempting because MoE feels like an efficiency trick — but it's *backwards* on memory: all
experts must stay resident, so an MoE needs *more* memory than a dense model of equal per-token
cost; the savings are in compute and decode bandwidth. Option C: attention is the conversation
between tokens and stays shared — only the per-token FFN is routed. Option D: each expert is
*smaller* than the dense FFN it collectively replaces; the win is in the ensemble of specialists,
not any individual.`,
    },
    {
      id: 'm4-l3-q2',
      kind: 'numeric',
      prompt: md`Mixtral-style arithmetic on paper: the shared trunk (attention + embeddings +
routers) holds ~1.7B parameters; each expert's FFN stack across all 32 layers holds ~5.6B; the
router picks top-2 experts per token. How many parameters are **active** per token, in
**billions**?`,
      answer: 12.9,
      tolerance: 1,
      explain: md`$1.7 + 2 \times 5.6 = 12.9$B — the famous "~13B active." The same ledger gives
the total: $1.7 + 8 \times 5.6 \approx 46.5 \approx 47$B. A token touches about 28% of the
model. Both numbers matter, to different budgets: 47B talks to your memory capacity, 12.9B to
your decode speed and FLOPs.`,
    },
    {
      id: 'm4-l3-q3',
      kind: 'mcq',
      prompt: md`Mixtral is named "8×7B," yet its total is ~47B, not 56B. Why?`,
      options: [
        md`Top-2 routing means most experts are rarely trained, and the undertrained ones were pruned before release`,
        md`The naive 8 × 7 counts the shared attention layers and embeddings eight times, but only the FFN experts are replicated — the conversation machinery exists once`,
        md`The experts share most of their weights with each other (weight tying), so eight experts cost little more than one`,
        md`47B is the size after quantization; 56B is the fp16 size`,
      ],
      answer: 1,
      explain: md`A dense 7B is roughly 5.6B of FFN plus 1.7B of attention-and-embeddings (2.5's
two-thirds rule in action). Clone only the FFN eight times: $1.7 + 8 \times 5.6 \approx 47$B.
Option A tempts because expert imbalance is a real disease from this very lesson — but the
resolution is balancing losses, not pruning. Option C tempts because weight sharing is a real
technique elsewhere (embeddings, some attention schemes) — but Mixtral's experts are genuinely
separate; if they were tied, capacity wouldn't grow and the whole point would evaporate.
Option D confuses a parameter *count* with a byte count — quantization (next lesson) changes
bytes per parameter, never the number of parameters.`,
    },
    {
      id: 'm4-l3-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, derive expert collapse from scratch and then
design its cure. (1) Start from symmetric init — near-identical experts, near-uniform router —
and trace what happens when one expert gets a small lucky edge: each arrow of the feedback loop,
explicitly, ending at the collapsed fixed point. (2) State what makes this loop possible for
experts but not for 2.3's attention heads. (3) Now design the fix: write the load-balancing loss
$\alpha N \sum_i f_i P_i$, define both factors, explain why the minimum sits at uniform routing,
and explain which factor carries the gradient and which supplies the evidence.`,
      rubric: md`**(1) The loop, every arrow:** lucky edge → router raises that expert's
probability (it reduces loss) → expert receives more tokens → more tokens = more gradient steps
on real data → expert genuinely improves → probability rises further → ... Fixed point: one or
two experts carry ~all traffic; the rest sit near random init, starved of gradient. Capacity of
a dense model at the memory price of $N$.

**(2) The structural difference:** heads receive *all* tokens regardless of quality — their
competition never touches their training data; experts *eat their tokens* — routing IS data
allocation, so performance controls food supply, and starvation is self-reinforcing. Full credit
requires naming the data-allocation mechanism, not just saying "positive feedback."

**(3) The cure:** $f_i$ = fraction of tokens actually dispatched to expert $i$ (hard counts,
non-differentiable); $P_i$ = mean router probability on expert $i$ (soft, differentiable).
$\sum_i f_i P_i$ is a dot product of two probability vectors: near 1 when traffic and router
affection pile onto the same expert, $1/N$ when either is uniform — so with the $N$ prefactor,
uniform scores 1 and collapse scores ~$N$; minimizing drives toward balance. Gradient flows
through $P_i$; $f_i$ steers it with the measured facts. "Nailed it" = all three parts, with (2)'s
contrast explicit and (3) explaining the two-factor design rather than merely quoting the
formula.`,
    },
    {
      id: 'm4-l3-q5',
      kind: 'numeric',
      prompt: md`A routing table from one training batch: 1,000 token-slots across 8 experts land
as [400, 200, 150, 100, 60, 40, 30, 20]. Compute the imbalance ratio the viz's meter shows:
**max load ÷ mean load**.`,
      answer: 3.2,
      tolerance: 0.15,
      explain: md`Mean $= 1000 / 8 = 125$; max $= 400$; ratio $= 400 / 125 = 3.2$. Perfectly
balanced routing scores exactly 1. At 3.2, the favorite expert is doing a third of all the work —
and, worse, *receiving a third of all the learning*: left alone, this table is a snapshot of
collapse in progress. It's also a hardware number: with experts sharded one per GPU, the fleet
moves at the pace of the most-loaded card while the least-loaded (20 tokens) idles.`,
    },
    {
      id: 'm4-l3-q6',
      kind: 'mcq',
      prompt: md`Researchers inspect what tokens each Mixtral expert actually receives. What do
they find, empirically?`,
      options: [
        md`Clean human topics — a math expert, a poetry expert, a code expert — matching the model's skill profile`,
        md`Essentially random routing: after balancing losses, expert assignment carries no consistent pattern at all`,
        md`Opportunistic, hard-to-name affinities — token types, punctuation, digits, code-ish contexts — with no tidy topical story; why remains open research`,
        md`One expert per language of the training data`,
      ],
      answer: 2,
      explain: md`Option A is the story the *name* "expert" plants in your head — the single most
tempting wrong answer in this module, and inspections say it's mostly false. Option B
over-corrects: routing is consistent and structured (the same token types reliably hit the same
experts) — it's just structured along loss-reducing seams, not human-legible ones. Option D gets
proposed because languages feel like natural shards; occasional language affinities do show up,
but they're one pattern among many, not the organizing principle. The honest summary: the router
carved capacity opportunistically, and routing interpretability is an open problem.`,
    },
    {
      id: 'm4-l3-q7',
      kind: 'numeric',
      prompt: md`**Fermi.** A DeepSeek-V3-class model: 671B total parameters, 37B active, weights
quantized to 8-bit (1 byte per parameter). About how many **GB** must sit resident in fast
memory just for the weights? (Paper first — and notice which of the two parameter counts the
question even needs.)`,
      answer: 671,
      tolerance: 100,
      explain: md`$671 \times 10^9 \times 1$ byte $= 671$ GB. The 37B active count is
*irrelevant* here — that's the trap, and dodging it is the point: capacity bills charge for
**total** parameters, resident, because the 4.1 ladder forbids paging experts per token. That's
nine 80-GB GPUs ($671 / 80 \approx 8.4$) before any KV cache, activations, or headroom — for a
model whose per-token *compute* is only a 37B's worth. MoE buys speed with floor space.`,
    },
    {
      id: 'm4-l3-q8',
      kind: 'written',
      prompt: md`**The infra ledger, in your own hand.** For a Mixtral-class deployment, write
the four entries an infra engineer must get right, with the reasoning: (a) why decode tokens/sec
follows **active** bytes — state 3.4's law and apply it; (b) why memory capacity follows
**total** bytes — include one arithmetic sanity check showing why paging idle experts from a
lower rung fails; (c) what expert parallelism ships over the wires, and why its signature is an
all-to-all rather than 4.2's all-reduce; (d) what large batches fix. Close with the one-line
buyer's rule.`,
      rubric: md`**(a)** tokens/sec = bandwidth ÷ bytes moved per token (3.4); only the chosen
experts + shared trunk stream from HBM per decoded token, so bytes ≈ active params × precision —
Mixtral decodes at ~13B cost, not 47B. (Bonus honesty: at large batch, all experts get read by
*someone* and the amortization shifts.)

**(b)** All experts resident. Sanity check of the right shape: ~350 MB per expert per layer at
bf16; paging 2 experts × 32 layers over PCIe (~64 GB/s) ≈ 700 MB × 32 / 64 GB/s ≈ 0.35 s per
token ≈ 3 tokens/sec — a ~100× slowdown; the ladder forbids it.

**(c)** Experts sharded across GPUs; *tokens travel* to whichever GPU holds their chosen experts
and travel back — an all-to-all, twice per MoE layer, on the latency-critical path (so: NVLink
island). All-reduce won't describe it because the traffic is data-dependent and point-to-many,
set by the router's choices each batch — a fifth signature beyond 4.2's four.

**(d)** Batch 1 leaves ~6 of 8 experts idle; large batches feed every expert (~batch × 2 / 8
tokens each) and smooth utilization by statistics.

**Rule:** capacity is binary (fit: total params), bandwidth is linear (speed: active params).
Full credit = all four entries with their arithmetic or mechanism, not just assertions.`,
    },
    {
      id: 'm4-l3-q9',
      kind: 'mcq',
      prompt: md`Expert parallelism shards experts across GPUs. What communication pattern does
this add to every MoE layer?`,
      options: [
        md`An all-reduce of gradients once per training step, like data parallelism`,
        md`Point-to-point handoffs between consecutive pipeline stages`,
        md`An all-to-all, twice per layer: each token is dispatched to whichever GPU holds its chosen experts, then the results are gathered back`,
        md`None — each GPU routes its own tokens to its own local experts, so no tokens cross GPUs`,
      ],
      answer: 2,
      explain: md`The router assigns experts with no regard for where they live, so tokens must
travel to their experts and back — dispatch and return, an all-to-all on the critical path of
every MoE layer. Options A and B are real signatures from 4.2's four splits, tempting by
familiarity — but both describe *fixed* traffic, while expert-parallel traffic is data-dependent,
reshaped every batch by routing decisions. Option D describes a different (and real) design —
restricting each token's menu to local experts — but that constrains the router and changes the
model; vanilla expert parallelism lets tokens roam, and pays the all-to-all for it.`,
    },
    {
      id: 'm4-l3-q10',
      kind: 'numeric',
      prompt: md`One H100 at 3.35 TB/s, weights at 8-bit, single-stream decoding, weights-only
accounting. A dense 47B streams ~47 GB per token; Mixtral streams only its active ~13 GB. What
is the **ratio of decode ceilings** (Mixtral ÷ dense)?`,
      answer: 3.6,
      tolerance: 0.4,
      explain: md`By 3.4's law the ceilings are $3350/47 \approx 71$ and $3350/13 \approx 258$
tokens/sec; the ratio is $47/13 \approx 3.6$ — bandwidth divides out, so the answer is just
total ÷ active. That's the decoupling as a speedup: comparable-class quality at 3.6× the decode
rate, paid for by keeping all 47 GB resident. (Note what the ratio is *not*: 8/2 = 4. The shared
trunk rides along on every token, diluting the ideal expert ratio slightly.)`,
    },
    {
      id: 'm4-l3-q11',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A clinic has one receptionist and eight doctors,
and every patient sees exactly two of them. Use it (or invent better — inventing better is worth
more) to explain: (1) how the clinic can know far more than any one doctor without visits taking
longer; (2) why all eight doctors must be in the building and on payroll even though most sit
out any given visit; (3) what goes wrong if the receptionist plays favorites — tell it as the
spiral it is — and one rule that fixes it. No unexplained jargon.`,
      rubric: md`Grade the teaching:

1. **Capacity vs per-visit cost** — eight doctors' knowledge under one roof, but each visit is
   still just two consultations, so visits stay short; the clinic "knows" more than any patient
   ever pays for in time. (Kid-version of total vs active parameters.)
2. **The building must hold everyone** — you can't fetch a doctor from across town mid-visit
   (too slow), so all eight are present and paid even while idle; a bigger clinic building is
   the price of the extra knowledge. (Kid-version of residency in fast memory / no paging.)
3. **The favoritism spiral, told as a spiral** — the receptionist sends most patients to Dr. A →
   Dr. A gets the most practice → gets genuinely better → gets even more patients → meanwhile
   the other doctors forget their medicine from disuse; fix: a rule that nudges the receptionist
   to spread patients around (and honesty bonus: on very busy days, some patients get sent home
   untreated — the dropped-token wart). The *practice-makes-better* link must be explicit — it's
   what makes the loop a spiral and not just unfairness.
4. **Jargon audit:** "router," "expert," "parameters," "GPU," "memory," "load balancing"
   unexplained = partial at best. The analogy must *compute* — each part must map to a mechanism,
   not just decorate.`,
    },
    {
      id: 'm4-l3-q12',
      kind: 'written',
      prompt: md`**The deployment memo.** Your candidates: dense 13B, and Mixtral-class MoE
(47B total / 13B active) — both available at 4-bit (~0.5 bytes/param; next lesson's trick, taken
on credit). Your venues: (a) a 24 GB gaming GPU, (b) a 64 GB laptop at ~400 GB/s, (c) a
high-traffic API server with a multi-GPU NVLink node. For each venue: run the fit test (with
honest headroom for KV cache and buffers), the speed estimate (3.4's law, correct parameter
count), and issue a verdict with its reason. Close with the general principle your three
verdicts share.`,
      rubric: md`**Arithmetic backbone:** Mixtral 4-bit ≈ 23.5 GB weights; dense 13B ≈ 6.5 GB;
active bytes per token: ~6.5 GB for both.

**(a) 24 GB GPU:** Mixtral's 23.5 GB nominally "fits" in 24 — but with KV cache, activations,
and buffers it does not; the fit test fails *once headroom is honest* (catching this knife-edge
is the point of venue a). Verdict: dense 13B (6.5 GB, ample room), which also decodes just as
fast. Capacity is binary; a near-miss is a miss.

**(b) 64 GB laptop:** Mixtral fits with tens of GB to spare; speed ≈ 400 / 6.5 ≈ 60 tokens/sec —
same speed as the dense 13B, far better quality. Verdict: Mixtral; the laptop's slack resource
(capacity) buys quality at zero speed cost — 4.1's spend-the-slack principle.

**(c) API server:** everything fits; the decisive factors become utilization and traffic — big
batches feed all 8 experts (~batch × 2/8 tokens each), expert parallelism's all-to-all stays
inside the NVLink island, and MoE serves near-47B quality at ~13B per-token cost across
thousands of streams. Verdict: MoE, and it *improves* with load.

**Principle:** capacity is binary, bandwidth is linear — test fit with total params (plus honest
headroom), estimate speed with active params, and spend whichever resource has slack. Full
credit = correct arithmetic in all three venues including the venue-(a) headroom catch, and a
genuine principle, not a restated definition.`,
    },
  ],
}
