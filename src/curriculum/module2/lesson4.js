// Module 2, Lesson 4 — Positional encoding and RoPE (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm2-l4',
  title: '2.4 Order from chaos — positional encoding and RoPE',
  subtitle: md`Shuffle the input and everything you have built so far shuffles right along with
it — word order is invisible to attention. We prove the scandal, derive what any fix must look
like, and meet RoPE: position as rotation, running inside nearly every modern LLM.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle — a scandal in the machine you just built

Here is a dirty secret about lessons 2.2 and 2.3, and I want you to catch the machine red-handed
rather than take my word for it.

Take the attention machine and feed it *dog bites man*. Now shuffle the input to *man bites dog*
and feed it again. **What changes in the outputs?** Trace the arithmetic:

**Step 1 — the scores.** The score between token $i$ and token $j$ is
$\mathbf{q}_i \cdot \mathbf{k}_j / \sqrt{d_k}$, computed entirely from the two tokens' *content*
vectors. Look for the position number $j$ anywhere in that arithmetic. It isn't there. "Dog" scores
against "bites" identically whether "bites" sits next door or forty tokens away.

**Step 2 — the softmax.** It exponentiates and normalizes the *collection* of scores in the row.
Shuffle the row and the weights shuffle identically — the softmax never asks which score came from
which seat.

**Step 3 — the mixture.** The output is $\sum_j w_{ij}\mathbf{v}_j$ — a sum, and addition is
commutative. Reordering the terms of a sum is the one thing guaranteed to change nothing.

Conclusion: shuffle the sentence and each token's updated vector is *exactly* what it was before —
the outputs just travel along with their tokens to the new seats. Attention is a **set operation**.
It sees a *bag* of tokens. And even the causal mask (2.2) only tells token $i$ "these tokens are
among your predecessors" — membership in a set, again: shuffle token $i$'s past and its output
doesn't budge.

To this machine, *dog bites man* and *man bites dog* are the same bag. Word order — the thing
grammar **is**, the difference between biter and bitten — is invisible. No stack of layers fixes
this, because every layer has the same blindness.

So position must be *injected* from outside. The question with several answers — one obsolete, one
historical, one running inside nearly every model you use today — is: **how?**
`,
    },
    {
      type: 'text',
      md: md`
## Attempt 1: give every seat a name-tag

The bluntest fix, used by GPT-2: a second lookup table. Alongside the token embedding table, keep a
**learned position table** — one vector per seat number — and add the two before the first layer:

$$\mathbf{x}_j = \mathbf{e}_{\text{token}(j)} + \mathbf{p}_j$$

Now "dog"-in-seat-1 and "dog"-in-seat-3 are different vectors, the bag is broken, and training is
free to sculpt the $\mathbf{p}$'s into whatever helps. It genuinely works — GPT-2 ran on it. But it
has two diseases, and diagnosing them will tell us what the *right* answer must look like.

**Disease 1: the map has an edge.** The table has exactly as many rows as the training context —
1024 for GPT-2. Ask for position 1025 and there is no trained vector to look up: whatever sits
there is an untouched random vector, never seen by gradient descent. The model isn't merely worse
past its horizon — it's *off the map*, fed coordinates that mean nothing. A lookup table cannot
generalize to rows nobody trained.

**Disease 2: absolute position is the wrong feature.** Ask what "it" at position 1047 actually
needs to know. Is it "I am at absolute index 1047"? Never. It's "*the noun three tokens back*" —
an offset. A sentence means the same at the top of a document and 1000 tokens deep; language is,
to excellent approximation, **translation-invariant**. Absolute name-tags force the model to
re-learn "subject, three back" separately at every offset — burning data and parameters relearning
a symmetry the world already has.

Disease 2 hands us a design specification. Write it down, because we'll hold every candidate to it:

> **The desideratum.** The attention score between positions $m$ and $n$ should depend on the two
> tokens' *content* and on the offset $m - n$ — and on nothing else.

Any mechanism satisfying this gets translation invariance *for free*: shift a whole passage ten
seats down and every score inside it is untouched.
`,
    },
    {
      type: 'text',
      md: md`
## Attempt 2: clocks in the embedding (brief, and honest)

The original 2017 transformer used no learned table. It *computed* the position vectors from sines
and cosines at many different frequencies and added those instead.

Why many frequencies? Think of how a car's odometer counts: the rightmost digit spins fast and
distinguishes this kilometer from the next; the leftmost digit barely moves and distinguishes this
*thousand* from the next. Fast digits give resolution, slow digits give range, and only the
*ensemble* pins down the number. Sinusoidal encodings are a smooth odometer: position $j$ becomes
the readings of many clocks of geometrically spaced speeds, all stamped into the embedding.

Honest assessment: clever, historically important, and it planted the crucial *clocks* idea — but
adding position into the token vector mixes "what I am" and "where I sit" into the same numbers,
and our desideratum is only *encouraged*, not enforced. Mostly a museum piece now. The modern
answer keeps the clocks and moves them somewhere smarter.
`,
    },
    {
      type: 'text',
      md: md`
## The modern answer: don't add — rotate

**RoPE** — *Rotary Position Embedding* — is what Llama, Qwen, Mistral, and most current models
actually run. The idea fits in one sentence:

> Leave the token's content alone; at matching time, **rotate** the query and key — in 2D planes —
> by an angle proportional to position.

Concretely, in two dimensions first: a token at position $m$ gets its query $\mathbf{q}$ rotated by
angle $m\theta$; a token at position $n$ gets its key $\mathbf{k}$ rotated by $n\theta$, where
$\theta$ is a fixed rotation speed in radians per token. Then attention proceeds exactly as in 2.2,
dotting the *rotated* vectors.

The claim — and it should sound too good — is that the resulting score depends on $m$ and $n$
**only through the gap $m - n$**. The desideratum, satisfied *by construction*: not encouraged by
training, but guaranteed by trigonometry before training begins.

That claim is provable with school geometry, and you should refuse to accept it from me.
`,
    },
    {
      type: 'ponder',
      question: md`Prove it. Two facts about rotation are all you need: a rotation preserves every
vector's **length**, and the dot product depends only on the two lengths and the **angle between**
the vectors (lesson 1.1: $\mathbf{u}\cdot\mathbf{v} = \|\mathbf{u}\|\|\mathbf{v}\|\cos\theta$). Put
$\mathbf{q}$ at angle $\varphi_q$ and $\mathbf{k}$ at angle $\varphi_k$, rotate them by $m\theta$
and $n\theta$ respectively, and compute what happened to the angle between them.`,
      answer: md`Write $\mathbf{q}$ with length $\|\mathbf{q}\|$ at angle $\varphi_q$, and
$\mathbf{k}$ with length $\|\mathbf{k}\|$ at angle $\varphi_k$; their original angular gap is
$\alpha = \varphi_k - \varphi_q$. After rotation, $\mathbf{q}$ sits at angle $\varphi_q + m\theta$
and $\mathbf{k}$ at $\varphi_k + n\theta$ — rotations change angles and touch nothing else. The new
angle between them:

$$(\varphi_k + n\theta) - (\varphi_q + m\theta) = \alpha + (n - m)\,\theta$$

So the score of the rotated pair is

$$\|\mathbf{q}\|\,\|\mathbf{k}\|\,\cos\!\big(\alpha + (n - m)\,\theta\big)$$

Stare at the argument of the cosine: $m$ and $n$ appear **only as the difference** $n - m$. Slide
both tokens down the sentence by any shift $s$: the gap $(n+s) - (m+s) = n - m$ is unchanged, and
the score is *frozen*. Content lives in $\|\mathbf{q}\|$, $\|\mathbf{k}\|$, $\alpha$; position
enters purely as the offset. The desideratum isn't approximated — it's an identity. (If you prefer
algebra to pictures, expanding the rotated coordinates and applying the cosine addition identity
lands on the same line.)`,
    },
    {
      type: 'example',
      title: 'the frozen dot product, with actual numbers',
      md: md`
Take $\theta = 0.5$ rad/token and let both content vectors be $\mathbf{q} = \mathbf{k} = (1, 0)$ —
unit lengths, initial gap $\alpha = 0$.

**Query at $m = 7$, key at $n = 3$.** Rotate $\mathbf{q}$ by $7 \times 0.5 = 3.5$ rad:
$(\cos 3.5, \sin 3.5) \approx (-0.936, -0.351)$. Rotate $\mathbf{k}$ by $3 \times 0.5 = 1.5$ rad:
$(\cos 1.5, \sin 1.5) \approx (0.071, 0.997)$. Dot them:

$$(-0.936)(0.071) + (-0.351)(0.997) \approx -0.066 - 0.350 = -0.416$$

The theory predicts $\cos\big((3 - 7) \times 0.5\big) = \cos(-2) = \cos 2 \approx -0.416$. Match.

**Slide both tokens 10 seats down: $m = 17$, $n = 13$.** The rotation angles balloon to $8.5$ and
$6.5$ rad — every coordinate changes completely — yet the gap is still $-4$ tokens, the angle
between is still $2$ rad, and the dot product is $\cos 2 \approx -0.416$. **Frozen.**

**Now change the gap instead: $m = 8$, $n = 3$.** Score: $\cos(2.5) \approx -0.801$. The machine
felt *that* immediately.

Numb to location, sensitive to distance — exactly the specification we wrote down.
`,
    },
    {
      type: 'text',
      md: md`
## The full-dimensional version: a wrist full of watches

A 128-dimensional query isn't one 2D arrow — so pair up its dimensions: $(1,2), (3,4), \ldots$ —
$64$ independent 2D planes, each rotated by its **own** speed. RoPE assigns plane $j$ the frequency

$$\theta_j = 10000^{-2j/d}$$

which for $d = 128$ runs from $\theta_0 = 1$ radian per token (a fast hand, whipping around once
every $2\pi \approx 6.28$ tokens) down to roughly $1/10000$ radians per token (a slow hand needing
tens of thousands of tokens for one revolution). A token's position becomes the joint reading of 64
clock hands — the odometer again, but now living in the *query-key matching* instead of being mixed
into the content.

The score between two tokens is a sum of per-plane dot products, each frozen to its own gap term —
schematically, for unit hands aligned at gap zero:

$$\text{score} \;\propto\; \sum_j \cos\!\big((m - n)\,\theta_j\big)$$

Fast hands resolve *this token vs. the next*; slow hands resolve *this paragraph vs. that chapter*.
And notice the price tag: the $\theta_j$ are fixed constants — RoPE adds **zero parameters**.
Compare GPT-2's position table, $1024 \times 768 \approx 0.8$M learned parameters, plus a hard
horizon; RoPE gets crisper information for free, at any position you can compute a rotation for.

Why does one clock need company? Because a lone clock has a fatal flaw you can compute.
`,
    },
    {
      type: 'ponder',
      question: md`Suppose you kept only the fast clock, $\theta = 1$ rad/token. Two positions
whose readings are *identical* are indistinguishable to it. At what gap does that first happen —
i.e., how far apart can two tokens be and produce the same reading? Compute the number before
revealing.`,
      answer: md`A rotation repeats after a full turn: gaps differing by $2\pi/\theta$ produce
identical readings. For $\theta = 1$ that's $2\pi/1 \approx \mathbf{6.28}$ **tokens** — a clock
face tells you it's 1:00, never *which day's* 1:00. This is **aliasing**. Token gaps are integers,
so the collision is never exact, but gap 6 comes within a whisker: $\cos 6 \approx 0.96$, nearly
the perfect impostor of gap 0's reading of $1.0$.

The opposite failure haunts a lone *slow* clock: at $\theta = 0.01$, neighbors are
indistinguishable — $\cos(0.01) \approx 0.99995$, so gap 0 and gap 1 read the same to four decimal
places. One clock must choose between resolution and range; it can't have both.

The ensemble refuses the choice — fast hands for fine structure, slow hands for long structure —
a positional **fingerprint** with resolution *and* range, which is exactly how a binary counter
pins down a big number with a handful of two-state digits.`,
    },
    {
      type: 'example',
      title: 'two clocks beat one — the fingerprint, computed',
      md: md`
Two frequency pairs, unit hands aligned at gap 0: fast $\theta = 1$, slow $\theta = 0.01$. Each
plane contributes $\cos(\text{gap} \times \theta)$:

| gap (tokens) | fast: $\cos(\text{gap})$ | slow: $\cos(0.01 \times \text{gap})$ |
|---|---|---|
| 0 | $1.000$ | $1.000$ |
| 1 | $0.540$ | $1.000$ |
| 6 | $0.960$ | $0.998$ |
| 60 | $-0.952$ | $0.825$ |

Read the failures and the rescues off the table. **Gap 0 vs 1:** the slow hand is blind
($1.000$ vs $1.000$) — the fast hand screams the difference ($1.000$ vs $0.540$). **Gap 0 vs 6:**
the fast hand has nearly lapped and reads $0.960$ — a near-impostor of gap 0 — and now the *slow*
hand quietly settles it. **Gap 6 vs 60:** the fast hand is spinning meaninglessly (it has lapped
nine times; $-0.952$ tells you nothing on its own), while the slow hand cleanly separates them
($0.998$ vs $0.825$).

Neither clock suffices. The pair does. Real RoPE uses 64 of them, geometrically spaced, so *some*
hand is in its informative zone at every scale from "next token" to "fifty thousand tokens back."
`,
    },
    {
      type: 'viz',
      viz: 'rope-clock',
      caption: md`Two tokens — coral and blue — each drawn as a set of four clock hands, one per
frequency pair, fast to slow. Sliders set each token's position; the lock icon slides both
together. The readout computes the score $\mathbf{q}\cdot\mathbf{k} = \sum \cos(\text{gap} \times
\text{freq})$ live. Three experiments: (1) slide coral alone — every hand turns and the dot product
swings: position is entering the score; (2) engage the lock and slide both — all eight hands spin
wildly but the readout **freezes**: only the gap survives; that frozen number is relative encoding
made visible; (3) park the pair at gap 0, then at gap 20, and compare hands: the fast hands have
whirled to unrecognizable angles (aliased, several laps in) while the slow hands have barely
crept — resolution from the fast clocks, range from the slow ones, the fingerprint idea in one
glance.`,
    },
    {
      type: 'text',
      md: md`
## Why q and k spin but v doesn't — and how 4k becomes 128k

Look back at *why* the trick worked: the two rotations met **inside a dot product** and canceled
down to their difference. The value vector never enters a dot product — it's the payload, mixed by
the finished weights. Rotate $\mathbf{v}$ and there is no partner to cancel against: the output
would carry raw absolute position baked into its *content* — "ball" delivered from seat 7 would be
a genuinely different vector than "ball" delivered from seat 17 — precisely the translation
dependence we just engineered away, smuggled back in through the loading dock.

So the design principle, worth saying once and remembering forever: **position should influence
*who* you listen to — the matching — never *what* they hand over once chosen.** Queries and keys
spin; values ride clean.

One more payoff, a teaser for Modules 3 and 4. A model trained at 4k context has only ever *seen*
gap-angles up to $4000 \times \theta_j$ in each plane. Run it at 100k and the fast hands enter
angle regimes no gradient ever visited — off-distribution, and quality degrades. The modern lever
is beautifully simple: **rescale the frequencies** — slow every clock down (YaRN and its cousins do
this per-plane, with care) so that 128k tokens of real distance maps into the range of angles the
model already understands. That is how 4k-trained models get stretched to 128k with modest
fine-tuning — and Llama 3 additionally raised the base from $10{,}000$ to $500{,}000$, slowing
every hand from birth. Because position lives in a *formula* rather than a table, context length
became a dial instead of a wall — you cannot retune a lookup table this way.
`,
    },
    {
      type: 'ponder',
      question: md`The shifted-sentence test. The same sentence appears twice in a document — once
starting at position 12, once at position 812. Under learned **absolute** embeddings, do the two
copies produce the same internal attention pattern among their own tokens? Under **RoPE**? And —
the real question — which behavior do you *want* for language?`,
      answer: md`**Absolute:** no. Every token's vector includes its seat's name-tag, and seats
12–20 have different tags than 812–820, so every query, key, and score differs. The model can
*learn* to make the patterns approximately match — but it must spend parameters and data to do so,
at every offset it ever encounters.

**RoPE:** yes, exactly — every within-sentence score depends only on content and gaps, and all the
gaps are identical in the two copies. Identity, not approximation; free, not learned.

**Which do you want?** For language, RoPE's answer: "the cat sat" carries the same grammar at
position 12 as at position 812 — translation invariance is a real symmetry of the domain, and a
mechanism that *bakes in* a true symmetry spends its capacity on what actually varies. This is the
same design wisdom you'll meet again and again: when the world has a symmetry, build it into the
machine rather than making the machine rediscover it. (Absolute position isn't *entirely* useless —
"am I at the very start of the document?" is real information, and models with RoPE can still infer
coarse absolute position through the causal mask's "how much past exists" signal. The desideratum
targets the overwhelmingly dominant need.)`,
    },
    {
      type: 'text',
      md: md`
## So what?

Nearly every open-weights model you will touch — the Llama family, Qwen, Mistral, DeepSeek — ships
with RoPE inside. With the classic base of $10{,}000$, a $d = 128$ head's slowest hand turns at
about $1/10{,}000$ rad/token and needs $2\pi \times 10{,}000 \approx 63{,}000$ tokens for one full
revolution — a number you should now read as "the longest range this positional fingerprint can
express before its slowest digit laps." Llama 3's jump to base $500{,}000$ pushes that to about
$3$ million, headroom for its 128k context. Zero parameters, two rotations per plane, one
trigonometric identity — carrying the entire concept of *word order* for models with tens of
billions of parameters.

## What you now own

1. **The scandal, proved**: attention computes scores from content alone, softmaxes a set, and
   sums commutatively — a set operation; shuffled input yields identically shuffled output, and even
   the causal mask only grants set-membership. Order must be injected.
2. **Attempt 1 diagnosed**: learned absolute tags work but have an edge-of-the-map failure (GPT-2's
   1024 rows) and encode the wrong feature — which handed us the desideratum: *scores may depend
   only on content and $m - n$*.
3. **Attempt 2 honored**: sinusoids — the odometer of many clocks; right idea, wrong address;
   historical.
4. **RoPE, derived**: rotate $\mathbf{q}$ by $m\theta$ and $\mathbf{k}$ by $n\theta$; the score is
   $\|\mathbf{q}\|\|\mathbf{k}\|\cos(\alpha + (n-m)\theta)$ — gap-only *by trigonometric identity*,
   the desideratum satisfied by construction.
5. **The ensemble**: 64 planes at $\theta_j = 10000^{-2j/d}$; a lone clock aliases at $2\pi/\theta$
   (6.28 tokens for $\theta = 1$); fast hands give resolution, slow hands give range.
6. **The asymmetry**: q and k spin, v rides clean — position steers the matching, never the
   message. And frequency rescaling is the modern long-context lever: 4k to 128k by turning a dial.

Attention now knows *who* to listen to and *where everyone stands* — but remember 2.2's confession:
it can only blend what tokens already offer; it never invents. Next lesson, the other half of every
transformer block — the feed-forward network, where the model actually thinks new thoughts.
`,
    },
  ],
  questions: [
    {
      id: 'm2-l4-q1',
      kind: 'mcq',
      prompt: md`What, precisely, makes the lesson-2.2 attention machine blind to word order?`,
      options: [
        md`The softmax destroys ordering information when it normalizes the scores`,
        md`No step references position: scores are computed from content vectors alone, and the
final weighted sum is commutative — permuting the tokens just permutes the terms of a sum`,
        md`The embedding table maps a word to the same vector regardless of context`,
        md`The causal mask erases positional information by hiding future tokens`,
      ],
      answer: 1,
      explain: md`The proof has three links — content-only scores, softmax over a set, commutative
sum — and the conclusion is exact, not approximate. Option A tempts because softmax *is*
order-agnostic over its inputs, but it's downstream of the real issue: even before softmax, no
score ever consulted a position. Option C is last lesson's puzzle — true, but it's what attention
*fixes*, not what makes it order-blind. Option D is backwards: the causal mask is the one place any
positional information enters at all (set-membership in "my past"), and it still conveys no
*arrangement* of that past.`,
    },
    {
      id: 'm2-l4-q2',
      kind: 'numeric',
      prompt: md`A single RoPE plane with $\theta = 0.5$ rad/token; both content vectors are
$(1, 0)$ (unit length, aligned). The query sits at position 9, the key at position 5. Compute the
attention score (the rotated dot product), using: $\cos(1) \approx 0.540$,
$\cos(2) \approx -0.416$, $\cos(4.5) \approx -0.211$, $\cos(7) \approx 0.754$.`,
      answer: -0.416,
      tolerance: 0.02,
      explain: md`Only the gap enters: $(9 - 5) \times 0.5 = 2$ rad, so the score is
$\cos 2 \approx -0.416$. The other cosines in the list are traps with diagnoses: $\cos(4.5)$ is
what you get if you rotate by the query's absolute position ($9 \times 0.5$) and forget the key;
$\cos(7)$ uses the *sum* of positions. If you took either bait, re-run the ponder's derivation —
the whole point of RoPE is that absolute positions cancel.`,
    },
    {
      id: 'm2-l4-q3',
      kind: 'numeric',
      prompt: md`A lone RoPE clock turns at $\theta = 1$ rad/token. At what gap, in tokens, does
its reading first return exactly to the gap-0 reading (i.e., what is the alias distance
$2\pi/\theta$)?`,
      answer: 6.283,
      tolerance: 0.05,
      explain: md`$2\pi/\theta = 2\pi/1 \approx 6.28$ tokens: one full revolution, and the clock
face repeats. Integer gaps never hit it exactly, but gap 6 reads $\cos 6 \approx 0.96$ — a
near-perfect impostor of gap 0. This single number is the argument for the whole frequency
ensemble: any one clock confuses "here" with "one lap away," so RoPE stations 64 clocks at speeds
spanning four orders of magnitude.`,
    },
    {
      id: 'm2-l4-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, prove the 2D RoPE property: rotating
$\mathbf{q}$ by $m\theta$ and $\mathbf{k}$ by $n\theta$ makes their dot product depend on $m$ and
$n$ only through $m - n$. Use either the geometric route (rotations preserve lengths; the dot
product depends only on lengths and the angle between) or the cosine addition identity. Then verify
numerically: $\theta = 0.5$, $\mathbf{q} = \mathbf{k} = (1, 0)$, positions $m = 7$ and $n = 3$ —
compute the rotated coordinates, dot them, and check the result against $\cos 2$.`,
      rubric: md`**Derivation (geometric route):** place $\mathbf{q}$ at angle $\varphi_q$,
$\mathbf{k}$ at $\varphi_k$, original gap $\alpha = \varphi_k - \varphi_q$. Rotation adds to angles
and preserves lengths, so the new angle between is $(\varphi_k + n\theta) - (\varphi_q + m\theta) =
\alpha + (n - m)\theta$, giving score
$\|\mathbf{q}\|\|\mathbf{k}\|\cos(\alpha + (n - m)\theta)$. Positions appear *only* as $n - m$;
adding any shift $s$ to both cancels. (Algebraic route via the cosine addition identity earns equal
credit if the cancellation of $m$ and $n$ into their difference is shown explicitly.)

**Verification:** rotate $\mathbf{q}$ by $3.5$ rad to $(\cos 3.5, \sin 3.5) \approx
(-0.936, -0.351)$; rotate $\mathbf{k}$ by $1.5$ rad to $\approx (0.071, 0.997)$; dot product
$\approx -0.066 - 0.350 = -0.416 = \cos 2$. Check.

"Nailed it" requires the general proof — with the shift-cancellation stated — *plus* the numeric
check. Quoting "RoPE is relative" or the final formula without the intermediate angle arithmetic is
recall, which is exactly what this question is not about.`,
    },
    {
      id: 'm2-l4-q5',
      kind: 'mcq',
      prompt: md`GPT-2 learned an absolute position table for 1024 positions. Suppose you enlarge
the table at inference time so that indexing past 1024 works mechanically, and feed 1030 tokens.
What does the model actually receive at position 1025?`,
      options: [
        md`A sensible interpolation of the nearby trained position vectors`,
        md`The position-1 vector again — the table wraps around`,
        md`A never-trained, essentially random vector — coordinates off the model's map`,
        md`A zero vector, which the model safely treats as "no position information"`,
      ],
      answer: 2,
      explain: md`A lookup table is a set of independent rows; gradient descent only ever touched
rows 1–1024, so row 1025 is whatever initialization put there — noise wearing a position's badge.
Option A is the hope that makes the question worth asking: interpolation is a property of
*functions*, and a table isn't one — nothing connects row 1025 to its neighbors. Option B describes
a design someone *could* build (and some schemes do wrap or re-scale), but learned tables don't do
it by default. Option D fails twice: the row isn't zero, and even a zero vector isn't "safe" — the
model never trained on it either. Fixed-function encodings (sinusoids, RoPE) at least produce
*well-defined* values at any position — though "defined" is not "understood": far-out-of-range
angles are still off-distribution, which is exactly the problem frequency rescaling (YaRN) exists
to solve.`,
    },
    {
      id: 'm2-l4-q6',
      kind: 'written',
      prompt: md`**Prove the scandal in prose.** Without positional information, the 2.2 attention
machine is a set operation: shuffling the input tokens leaves each token's output vector exactly
unchanged. Write the proof in clear prose — one step per stage of the machine (scores, softmax,
mixture) — and finish by addressing the causal mask: does masking rescue word order, and what is
the *most* positional information it can convey?`,
      rubric: md`Four required steps:

1. **Scores are content-only**: the score between tokens $i$ and $j$ is computed from their two
   vectors; the seat numbers appear nowhere in the arithmetic, so shuffling seats changes no score.
2. **Softmax sees a set**: it exponentiates and normalizes the collection of scores; permuting the
   row permutes the weights identically — it never asks which seat a score came from.
3. **The mixture is a commutative sum**: $\sum_j w_{ij}\mathbf{v}_j$ has the same terms in any
   order, so the output vector is unchanged term-for-term.
4. **Conclusion drawn explicitly**: every token's output is what it was; outputs simply travel with
   their tokens — the machine sees a bag, so grammar (biter vs. bitten) is invisible, at every
   layer.

**Mask discussion (required):** the causal mask tells token $i$ only *which* tokens are among its
predecessors — set membership, not arrangement. Shuffle token $i$'s past and its output is
untouched. (Sharp answers may note it does leak *how many* predecessors exist — coarse absolute
information — which is real but nowhere near an ordering.)

Asserting "there are no position embeddings, so it's order-blind" without walking the three
mechanism steps is the conclusion without the proof — partial at best.`,
    },
    {
      id: 'm2-l4-q7',
      kind: 'mcq',
      prompt: md`RoPE rotates the queries and keys but leaves the values untouched. Why not rotate
$\mathbf{v}$ too?`,
      options: [
        md`Rotating $\mathbf{v}$ would roughly double the FLOP cost of attention`,
        md`Value vectors have a different shape, so their dimensions can't be paired into 2D planes`,
        md`The values were already rotated by the previous layer, so rotating again would
double-count position`,
        md`The gap-cancellation happens between two rotated partners inside a dot product; $\mathbf{v}$
never enters one, so its rotation would have no partner to cancel against and would bake absolute
position into the output's content`,
      ],
      answer: 3,
      explain: md`The entire derivation ran on two rotations *meeting* in a dot product and
collapsing to their difference. Values are the payload, mixed by finished weights — rotate them and
$m\theta$ survives uncanceled, making "ball at seat 7" a different delivered vector from "ball at
seat 17": translation dependence smuggled back in. The principle: position steers *who* you listen
to, never *what* they hand over. Option A tempts as engineering-flavored, but rotations are
trivially cheap next to the $n^2$ scores (2.2). Option B is false — $\mathbf{v}$ has the same
per-head shape as $\mathbf{k}$. Option C invents a mechanism: rotations are applied fresh from
positions each layer, not accumulated in the residual stream.`,
    },
    {
      id: 'm2-l4-q8',
      kind: 'written',
      prompt: md`An engineer on your team argues: "Learned absolute position embeddings worked fine
for GPT-2 — why complicate life with rotations?" Write the case for RoPE, on paper, in three
movements: **(1)** the off-the-map problem with a learned table, stated mechanically (what exactly
goes wrong at position 1025?); **(2)** the wrong-feature problem — what positional information
does language actually need, and what symmetry does an absolute table force the model to relearn?;
**(3)** the desideratum this implies, and *why* RoPE satisfies it by construction rather than by
training. End with one honest concession to the engineer's side.`,
      rubric: md`**(1) Off the map:** the table has exactly the trained number of rows; beyond it
sits an untrained vector — not degraded input but *meaningless* input, and no gradient ever
connected it to anything. A table cannot generalize between rows.

**(2) Wrong feature:** what "it" needs is offsets — "the noun three back" — not absolute indices;
language is translation-invariant, so absolute tags force the model to re-learn every relational
pattern separately at each offset, spending data and parameters rediscovering a symmetry the
domain already has.

**(3) Desideratum and construction:** scores should depend only on content and $m - n$. RoPE
rotates $\mathbf{q}$ by $m\theta$ and $\mathbf{k}$ by $n\theta$; the rotations cancel inside the
dot product to $\cos(\alpha + (n-m)\theta)$ — an identity that holds *before any training*, versus
a learned table where relative behavior must be acquired approximately. Bonus strength: the formula
extends to any position and admits frequency rescaling (the 4k-to-128k lever), impossible for a
fixed table.

**Concession (required):** e.g., absolute embeddings are simpler and genuinely worked at GPT-2's
1024-token scale; coarse absolute position ("start of document") has some real value; RoPE at
extreme extrapolation is *also* off-distribution without rescaling. An argument with no concession
is advocacy, not analysis — cap at partial.`,
    },
    {
      id: 'm2-l4-q9',
      kind: 'numeric',
      prompt: md`**Fermi estimate (paper first):** a RoPE head's slowest clock hand turns at about
$1/10{,}000$ radians per token (base 10000, $d = 128$). Roughly how many **tokens** pass before
that hand completes one full revolution ($2\pi$ radians)? Generous tolerance — get the scale right.`,
      answer: 62832,
      tolerance: 15000,
      explain: md`One revolution needs $2\pi$ radians at $1/10{,}000$ rad/token:
$2\pi \times 10{,}000 \approx 62{,}800$ tokens — call it 63k. Read the number as the fingerprint's
*range*: beyond one lap of the slowest hand, the ensemble's longest-scale digit has rolled over,
and long-range distances start to blur — one reason contexts far past this need a bigger base
(Llama 3 chose $500{,}000$, pushing the lap to roughly 3 million tokens) or frequency rescaling
(YaRN). A one-line estimate that predicts a real design change in a frontier model — that's what
Fermi habits are for.`,
    },
    {
      id: 'm2-l4-q10',
      kind: 'mcq',
      prompt: md`Under RoPE, a query token and a key token are *both* shifted 10 positions later in
the sequence (contents unchanged). What happens to their attention score?`,
      options: [
        md`Exactly unchanged — both rotations advance equally, and only the gap enters the score`,
        md`It gets multiplied by roughly $\cos(10\theta)$ in each plane`,
        md`It changes in a content-dependent way, since scores depend on absolute position`,
        md`It becomes zero once the shift passes the training context length`,
      ],
      answer: 0,
      explain: md`The score in each plane is $\cos(\alpha + (n - m)\theta)$, and
$(n + 10) - (m + 10) = n - m$: frozen, exactly — this is the lock-and-slide experiment from the
visualization. Option B tempts because *one* token shifting by 10 does introduce a $10\theta$ term;
the trap is forgetting the partner's rotation cancels it. Option C describes learned absolute
embeddings — the disease, not this cure. Option D confuses the clean mathematical identity (which
holds at any position) with the separate *statistical* issue of unseen angle regimes at extreme
lengths — the score is well-defined and gap-only everywhere; whether the model has trained on such
gaps is another story (YaRN's).`,
    },
    {
      id: 'm2-l4-q11',
      kind: 'numeric',
      prompt: md`Two RoPE planes, unit hands aligned at gap 0: fast $\theta = 1$, slow
$\theta = 0.1$. For a gap of 5 tokens, the score is $\cos(5) + \cos(0.5)$. Compute it, given
$\cos(5\text{ rad}) \approx 0.284$ and $\cos(0.5\text{ rad}) \approx 0.878$.`,
      answer: 1.16,
      tolerance: 0.03,
      explain: md`Each plane contributes $\cos(\text{gap} \times \theta_j)$ independently:
$0.284 + 0.878 \approx 1.16$. Worth noticing while you have the pieces in hand: the fast plane's
contribution ($5$ rad — most of a full lap) is nearly uninformative on its own, while the slow
plane ($0.5$ rad) is still in its crisp early range. The *sum* is the fingerprint: each hand
speaks for the scale it measures well.`,
    },
    {
      id: 'm2-l4-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old** (write it out — the Feynman test). The kid asks:
"If the computer looks at all the words at once, how does it know *dog bites man* from *man bites
dog*?" Explain: **(1)** why looking-at-everything-at-once genuinely loses the order (make the
problem real before you solve it); **(2)** the clock trick — how words can tell *how far apart*
they are without anyone knowing seat numbers; **(3)** why one clock isn't enough and the computer
uses many at different speeds. Analogies encouraged; inventing a better one than the lesson's is
worth more.`,
      rubric: md`Grade the teaching:

1. **The problem made real** — e.g., the computer holds the sentence like beads swept off a broken
   string into a bag: every bead intact, the *order* gone — and "dog bites man" vs "man bites dog"
   is *only* an order difference, so the bag can't tell them apart. Must convey that this is a real
   loss, not a detail.
2. **The clock trick, kid-level** — every word wears a set of spinning clock hands that turn as you
   walk along the sentence; two words compare hands, and the *difference* in their hands says how
   far apart they stand — like telling how long a movie ran from how much the hands moved, without
   knowing when it started. Crucial beat: the trick reveals *apart-ness*, not seat numbers — and
   that's the better thing to know, because a sentence works the same wherever it starts.
3. **Why many speeds** — a fast hand tells neighbors apart but comes back around and repeats (like
   a clock showing 1:00 twice a day — which 1:00?); a slow hand never confuses far-apart words but
   barely moves between neighbors; together, fast for close, slow for far, they pin it down — like
   needing both the minute hand and the hour hand to read a time.
4. **Jargon audit**: "rotation," "vector," "dot product," "frequency," "embedding," "attention"
   used without kid-level translation = partial at best. The kid must be able to repeat the idea
   back — that's the test the answer is graded against.`,
    },
  ],
}
