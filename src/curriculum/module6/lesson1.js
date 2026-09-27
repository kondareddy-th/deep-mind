// Module 6, Lesson 1 — Superposition (anchor lesson, Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm6-l1',
  title: '6.1 Superposition — why you can’t just read the weights',
  subtitle:
    'You have every weight, every activation, perfect access. And you still cannot say why the model refused. This lesson explains the specific reason transparency isn’t understanding — and cashes the promise lesson 1.1 made about high-dimensional roominess.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Here is a situation with no equivalent in the rest of science. You have **complete** access to the
object of study. Every one of the 70 billion weights, readable to the last bit. Every activation on
every token, dumpable to disk. You can run the thing forward and backward, freeze it, poke it,
clone it, rewind it. No microscope has ever offered a biologist this. No telescope has ever offered
an astronomer this.

And you *still cannot say why it refused that request.*

That gap — total access, minimal understanding — is what the field of **interpretability** exists
to close, and this module is its story. But before any method, you owe yourself the diagnosis: why
doesn't perfect access just... work? Something specific is in the way, and naming it precisely is
the whole of today's lesson.

## The obvious first move, and its strange failure

Start where everyone starts. A model has neurons — the individual coordinates of the FFN's hidden
layer (2.5). Neurons in *biology* are famously interpretable-ish: the "Jennifer Aniston neuron" of
the medial temporal lobe fires for Jennifer Aniston. So: find a neuron, feed the model a million
documents, record what makes it fire hardest, and read off its meaning.

People did exactly this. Here, roughly, is what a real neuron's top activations look like:

> Korean text · DNA base-pair strings · the word "the" inside legal contracts · code comments in
> Portuguese · photographs of dogs (in a multimodal model)

That is not a concept. That is a junk drawer. And it isn't a rare bad apple — most neurons look
like this. The technical term is **polysemantic**: one neuron, many unrelated meanings. Neurons
went from "the obvious unit of analysis" to "apparently meaningless," and for a while that was
simply a wall.

The resolution is one of the most satisfying arguments in modern ML, and — this is the good part —
**you already derived half of it in lesson 1.1.** Let's finish it.

## The pigeonhole that forces the model's hand

Count what a frontier model must represent. Not vaguely — actually count. The Golden Gate Bridge.
The concept of a bridge. Suspension engineering. San Francisco. Fog. Sarcasm in Portuguese. The
syntax of a Rust lifetime annotation. The fact that a semicolon inside a for-loop header means
something different than at a line's end. The tone of a legal threat. Individual celebrities,
individual proteins, individual API endpoints...

A serious lower bound is **millions** of distinguishable concepts. Now count what it has to store
them in: a residual stream (2.5) of $d = 12{,}288$ dimensions for GPT-3, or 4096 for Llama-7B.

$$\text{millions of concepts} \;\gg\; 12{,}288 \text{ dimensions}$$

If each concept needed its own dedicated dimension — its own neuron, its own axis — the model would
be short by two or three orders of magnitude. **It is not a design choice; it is a pigeonhole.**
Whatever the model is doing, it is *not* one-concept-per-axis. So what else is available?
`,
    },
    {
      type: 'ponder',
      question: md`Before reading on: recall lesson 1.1's final ponder — two *random* directions in
$12{,}288$ dimensions have cosine similarity around $1/\sqrt d \approx 0.009$, i.e. they're
**almost perpendicular**. High-dimensional space is unimaginably roomy. Now use that fact to
escape the pigeonhole: if a model can't give each concept its own *axis*, what cheaper thing can it
give each concept — and what does it have to pay?`,
      answer: md`It gives each concept its own **direction**, not its own axis. Axes are scarce —
exactly $d$ of them, mutually perpendicular by construction. Directions are *abundant*: the
Johnson–Lindenstrauss bound says a $d$-dimensional space holds **exponentially many** directions
that are pairwise near-perpendicular (roughly $e^{c \varepsilon^2 d}$ of them with pairwise
$|\cos| \le \varepsilon$) — at $d = 12{,}288$ that is astronomically more than millions.

**The price is interference.** "Nearly" perpendicular is not perpendicular: any two feature
directions overlap a little, so reading one out picks up a whisper of the others — the dot product
(1.1's agreement meter) can't fully separate them. The model is doing lossy compression, storing
more features than it has dimensions and eating a small error budget in exchange. This is called
**superposition** (the term comes from Chris Olah and colleagues' circuits work; Anthropic's 2022
*Toy Models of Superposition* studied it systematically), and the next section shows why the error is nearly free.`,
    },
    {
      type: 'text',
      md: md`
## Why the interference is (usually) free: sparsity

Interference sounds fatal until you ask *when it actually costs you*. Two feature directions that
overlap by $0.1$ only corrupt each other's readout **when both are active at the same time**. If
"Golden Gate Bridge" and "Rust lifetime annotation" share a bit of geometry but never co-occur in
one token's representation, the collision is theoretical — a ghost in the algebra that never
materializes.

And LLM features are *extremely* sparse. On any given token, the overwhelming majority of the
model's millions of concepts are simply not present. Put numbers on it: suppose a model carries
$N = 10^6$ features and each is active on a fraction $p = 10^{-4}$ of tokens. Expected features
active at once:

$$\mathbb{E}[\text{active}] = N p = 10^6 \times 10^{-4} = 100$$

One hundred active features — inside $12{,}288$ dimensions. The *active set* fits comfortably below
the dimension count, so at any given instant the vectors actually in play are nearly orthogonal and
recoverable. The model has pulled off something lovely: it stores a million things in twelve
thousand slots, and gets away with it because it never needs more than a hundred of them at once.

> **This is a compression scheme, and you have met its cost function.** Superposition is exactly
> the trade lesson 1.5 taught: pack more information into fewer bits, pay in reconstruction error,
> and let the *statistics of the data* (here, sparsity) make the error rare. The model was never
> told to do this. Gradient descent found it, because it minimizes loss and this arrangement holds
> more useful features per parameter than any axis-aligned one.

## And now polysemantic neurons are obvious

Return to the junk-drawer neuron with this picture in hand. If features are directions scattered
all over the space, then any *particular axis* — any single neuron — is a nearly-random line
through that scatter, and lots of feature directions have some component along it. Reading a
neuron's activation is reading a **weighted blend of every feature that happens to lean its way**:
Korean text, DNA strings, legal "the," Portuguese comments, dogs.

The neuron wasn't meaningless. **You were reading in the wrong basis.** The model's concepts don't
live along the coordinate axes you happened to be handed by the architecture — they live along
directions gradient descent chose for its own convenience, and there are far more of them than
there are axes to hold them.

The visualization below is this argument, made physical. Watch what happens as the feature count
crosses the dimension count.
`,
    },
    {
      type: 'viz',
      viz: 'superposition',
      caption:
        'N feature directions living in exactly 3 dimensions, pushing each other apart to minimise their overlaps. Three experiments: (1) set N = 2, then 3 — they settle at perfect right angles, interference 0.000: while features ≤ dimensions, superposition isn’t needed; (2) push to N = 4 and watch them lock into a tetrahedron at max |cos| ≈ 0.333 — the pigeonhole biting, in one number you can verify by hand; (3) crank N to 30 and read the two statistics apart: the WORST pair is now dreadful (the relaxation is a heuristic and genuinely cannot keep 30 lines apart in 3-space — packing directions is a hard problem), while the TYPICAL pair sits near 0.48, and only the few features actually switched on ever send you a bill — hit "sample active set" a dozen times to watch that bill get drawn. Then read the grey clause: two random directions overlap by about 1/√d, which is 0.577 in this cartoon and 0.009 in a real 12,288-dimensional model. Dimension is what turns this crowded mess into a workable filing system',
    },
    {
      type: 'example',
      title: 'the geometry of being over-subscribed',
      md: md`
Work the small cases by hand and the whole phenomenon becomes concrete. Question: place $N$ unit
vectors in $d = 3$ dimensions so that the **largest** pairwise overlap $|\cos\theta|$ is as small as
possible.

| $N$ | best arrangement | max $|\cos|$ | reading |
|---|---|---|---|
| 2 | any perpendicular pair | $0$ | free |
| 3 | the coordinate axes | $0$ | free — exactly saturated |
| 4 | vertices of a tetrahedron | $1/3 \approx 0.333$ | the pigeonhole bites |
| 6 | one vertex from each of the icosahedron's 6 antipodal pairs | $1/\sqrt5 \approx 0.447$ | worse |
| 30 | no clean solid | $\approx 0.9$ (closest pair only ~25° apart) | badly crowded |

Two things to take from the table. First, the cliff at $N = d$: up to three features you get
perfection for free, and the very next feature costs you $0.333$ of permanent interference. Second,
what happens after that. In 3 dimensions the worst pair gets bad fast: at 30 features it sits near
$0.9$ (a cap-area count proves no arrangement can beat about $0.87$ — 3-space is simply too small).
But the *typical* pair degrades far more slowly — around $0.5$ in 3-D, and $1/\sqrt d$ in general —
and with sparse features the typical pair is the one that sends the bill. In high dimensions even
the worst pair stays small for a very long time. Adding features to an already-crowded
high-dimensional space is cheap, which is precisely why a model would keep doing it until it holds
orders of magnitude more features than dimensions.

Now scale the intuition: at $d = 12{,}288$, the "free" regime ends at 12,288 features, but the
*graceful* regime extends to millions — and the sparsity argument above means the model rarely
pays even the crowded-case price.
`,
    },
    {
      type: 'ponder',
      question: md`If superposition is what gradient descent does, why did anyone ever expect
neurons to be interpretable in the first place? Small vision networks *did* famously contain clean
curve-detector and edge-detector neurons. What's different about those cases — and what does that
predict about when you should expect to find interpretable neurons?`,
      answer: md`Superposition is a *response to scarcity*. When a network has more dimensions than
it has features worth representing, there's no pressure to pack — and there's a mild pressure the
other way: the elementwise nonlinearity (ReLU/GELU) acts independently on each coordinate, which
makes the neuron basis slightly **privileged** — a feature that aligns with an axis passes through
the nonlinearity cleanly rather than getting smeared. So in small, feature-poor networks, features
often *do* settle onto axes, and neurons look meaningful. Early vision work found exactly this.

The prediction, which has held up: **interpretable neurons should get rarer as models get bigger
relative to their task**, because the ratio of wanted-features to available-dimensions is what
decides. It also predicts the knob researchers use in toy models — hold the network fixed, vary the
sparsity of the synthetic features, and watch the network transition from clean one-feature-per-
neuron to floridly superposed geometric packings. That experiment has been run (Anthropic's *Toy
Models of Superposition*), and it's about as close to a controlled experiment as this field gets:
the phenomenon appears and disappears on command.`,
    },
    {
      type: 'text',
      md: md`
## The way out: learn the dictionary

So the model writes its thoughts in a basis we weren't given. Fine — then *find the basis*. That is
the central bet of modern interpretability, and the tool is the **sparse autoencoder** (SAE).

The setup follows from everything above. We believe an activation vector $\mathbf{x}$ (a residual
stream at some layer) is approximately a sparse sum of feature directions:

$$\mathbf{x} \;\approx\; \sum_{i} a_i \, \mathbf{f}_i, \qquad \text{with only a handful of } a_i \ne 0$$

We don't know the dictionary $\{\mathbf{f}_i\}$ or the activations $a_i$ — but we know two things
about them, and that turns out to be enough to go looking. So train a small network to find them:
an encoder that maps $\mathbf{x}$ into a **much wider** space (say $4{,}096 \to 4{,}000{,}000$),
a sparsity penalty forcing almost all of those coordinates to zero, and a decoder that must
reconstruct $\mathbf{x}$ from the survivors. The two terms of the loss *are* the two beliefs:

$$\mathcal{L} = \underbrace{\|\mathbf{x} - \hat{\mathbf{x}}\|^2}_{\text{it must explain the activation}} + \lambda \underbrace{\|\mathbf{a}\|_1}_{\text{using almost nothing}}$$

Note the shape of the trick: we go **wider than the model**, deliberately. The model compressed
millions of features into thousands of dimensions; we're trying to *un*-compress — to give each
feature its own coordinate again, in a space big enough to afford it. The sparsity penalty is what
stops the wide layer from cheating with dense mush.

**Does it work?** The reported results are striking, and worth knowing precisely. Applied to
production models, SAE features are dramatically more monosemantic than neurons: a feature that
fires for the Golden Gate Bridge — in English text, in French text, in *photographs* of the bridge;
features for code security vulnerabilities, for sycophantic praise, for inner conflict. And
crucially, the features are **causal handles, not just labels**: clamp the Golden Gate feature high
and the model starts describing itself as the bridge, in the middle of unrelated conversations.
That demo (Anthropic's "Golden Gate Claude," 2024) is the field's most legible evidence that these
directions are the model's own machinery and not a pattern we painted on afterwards.
`,
    },
    {
      type: 'ponder',
      question: md`A well-trained SAE might reconstruct activations to, say, 95% of the variance —
respectable, and the number labs report. But sit with the missing 5%. Where could it be hiding, and
can you construct an argument that the leftovers are *disproportionately* important rather than
harmless rounding?`,
      answer: md`Three places it could hide, each with different consequences. (1) **Everywhere, as
thin noise** — the benign reading: a little error smeared over every feature, and the story is
intact. (2) **In rare, high-magnitude events** — reconstruction error is measured as an *average*
over tokens, so a method can score 95% while failing badly on the unusual inputs. That is
alarming for exactly the reasons a safety researcher cares about: the interesting behaviours
(jailbreaks, deception, weird refusals) live in the tail, not the average. (3) **In genuinely
non-sparse computation** — anything the model does with dense, distributed structure is invisible
to a tool whose objective *assumes* sparsity, and it will be quietly shunted into the residual
rather than represented.

Why "disproportionately important" is a live worry: gradient descent had no incentive to make its
most sophisticated machinery *sparse and human-legible*; sparsity is our prior, not the model's
promise. So the residual is precisely where the parts that don't fit our assumption accumulate.
The methodological upshot — and a habit worth keeping for any interpretability result you read:
**always ask what an explanation leaves unexplained, and whether the leftovers were checked or
merely averaged away.**`,
    },
    {
      type: 'text',
      md: md`
## The honest state of it

You are training to be a researcher, so the caveats are not optional footnotes — they're where the
open problems live:

- **Feature splitting.** Train a bigger dictionary and yesterday's single feature fractures into
  several finer ones. Is the "true" number of features a real quantity, or an artifact of dictionary
  size? Unresolved.
- **Dead features and reconstruction gaps.** A slice of the dictionary learns nothing; and SAEs
  never reconstruct activations perfectly — the residual might be *the interesting part*.
- **Does it help downstream?** The sharpest critique of 2024–2025: on several practical tasks
  (detecting harmful intent, steering reliably), SAE features have not clearly beaten simpler
  baselines like linear probes. A beautiful theory that doesn't yet dominate on utility is a
  *live scientific question*, not a settled win.
- **Sparsity is an assumption.** We *chose* to look for a sparse dictionary. If some of the model's
  computation isn't sparse in this sense, SAEs are structurally blind to it.

Hold both halves at once: superposition is about as well-established as anything in this field,
while sparse dictionaries as *the* method for reading it are a promising, contested bet. That
distinction — between the phenomenon and the current tool for it — is exactly the kind of
discrimination that separates a researcher from a reader of press releases.

## What you now own

1. **The diagnosis:** total access ≠ understanding, and the specific obstacle has a name.
2. **The pigeonhole:** millions of concepts, thousands of dimensions — one-concept-per-axis is
   arithmetically impossible.
3. **The escape (cashing 1.1):** concepts get *directions*, not axes; high-$d$ space holds
   exponentially many near-orthogonal ones. This is **superposition**.
4. **Why it's affordable:** interference only bills when features co-fire, and features are sparse
   ($\sim 100$ active out of a million).
5. **Why neurons are junk drawers:** an axis is a random line through the feature scatter; you were
   reading in the wrong basis — and *when* neurons do look clean (feature-poor nets, privileged
   basis from elementwise nonlinearities) is predictable.
6. **The dictionary bet:** SAEs go deliberately wider than the model and use sparsity to recover
   features — with real causal demonstrations, real open problems, and a genuine debate about
   downstream utility.

Next lesson: features are the *nouns*. The verbs are **circuits** — and we finally build, end to
end, the induction head that has been promised since lesson 2.3.
`,
    },
  ],
  questions: [
    {
      id: 'm6-l1-q1',
      kind: 'mcq',
      prompt: md`A single neuron in a large language model fires on Korean text, DNA strings, and
the word "the" in legal documents. The best explanation is:`,
      options: [
        'The neuron is broken or dead — a training artifact with no function',
        'Features live along directions that are not aligned with the coordinate axes, so any one neuron reads a blend of every feature that leans its way — you are reading in the wrong basis',
        'The model has not been trained long enough for its neurons to specialize',
        'That neuron encodes a genuine abstract concept unifying Korean, DNA, and legal English that humans have not yet recognized',
      ],
      answer: 1,
      explain: md`Superposition packs more features than dimensions, so features occupy scattered
directions; a coordinate axis cuts across many of them at once. The neuron is doing real work — it
just isn't the *unit* of the work. Option D is the seductive one (and researchers genuinely do
find surprising unifying concepts sometimes), which is why the discipline requires a null
hypothesis: with millions of features in thousands of dimensions, blends are *expected by
arithmetic*, so exotic unification needs positive evidence, not just vibes. Option C predicts the
opposite of what's observed — polysemanticity gets *more* pronounced with scale.`,
    },
    {
      id: 'm6-l1-q2',
      kind: 'numeric',
      prompt: md`Place 4 unit vectors in 3 dimensions to minimize the largest pairwise
$|\cos\theta|$. The optimum is the tetrahedron. What is that minimum max $|\cos\theta|$? (Three
decimals — and note you can verify it live in the visualization.)`,
      answer: 0.333,
      tolerance: 0.03,
      explain: md`The regular tetrahedron gives pairwise $\cos\theta = -1/3$, so $|\cos| = 1/3
\approx 0.333$. This is the pigeonhole in a single number: the fourth feature cannot be added to a
3-dimensional space for free, no matter how cleverly you arrange things — and $0.333$ is exactly
the toll.`,
    },
    {
      id: 'm6-l1-q3',
      kind: 'numeric',
      prompt: md`A model carries $N = 10^6$ features, each active on a fraction $p = 10^{-4}$ of
tokens. How many features are active on a typical token?`,
      answer: 100,
      tolerance: 15,
      explain: md`$Np = 10^6 \times 10^{-4} = 100$. Compare to $d \approx 12{,}288$ dimensions: the
*active* set is far smaller than the space, so on any given token the vectors in play are nearly
orthogonal and separable. Superposition is a bet on sparsity — a million tenants, a hundred of them
home at a time.`,
    },
    {
      id: 'm6-l1-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, build the case for superposition from scratch,
in four steps: (1) the counting argument that rules out one-concept-per-dimension; (2) the property
of high-dimensional geometry that offers a way out (state it quantitatively — what is the typical
cosine between random directions in $d$ dimensions, and where did you prove that?); (3) the cost
this incurs and the statistical property of language features that makes the cost rarely bite,
with the expected-active-features computation; (4) the prediction it makes about neurons, and why
that prediction matches what people actually observe.`,
      rubric: md`**(1) Counting:** a frontier model must distinguish millions of concepts but has
only $d \approx 10^4$ dimensions; dedicated axes would need $N \le d$. Impossible by pigeonhole —
so the representation is *not* one-per-axis.

**(2) The geometry (from 1.1):** random directions in $d$ dimensions have typical cosine
$\approx 1/\sqrt d$ (the drunkard's-walk argument: a dot product of typical size $\sqrt d$ divided
by two norms of size $\sqrt d$) — essentially perpendicular. So while only $d$ *exactly* orthogonal
directions exist, exponentially many *nearly* orthogonal ones do (Johnson–Lindenstrauss). Assign
each feature a direction.

**(3) The cost and its rescue:** near-orthogonal is not orthogonal — reading feature $i$ picks up
$\cos\theta_{ij}$ of feature $j$: interference. But it only materializes when both are *active
together*. With $N = 10^6$ features at $p = 10^{-4}$, $\mathbb{E}[\text{active}] = Np = 100 \ll d$,
so the co-active set is nearly orthogonal and recoverable. Sparsity converts a permanent geometric
cost into a rare one.

**(4) The prediction:** if features are non-axis-aligned directions, individual neurons must read
blends of many features — polysemantic junk drawers — which is exactly what large-model neurons
look like. (Bonus credit: the converse prediction — feature-poor networks face no packing pressure
and *do* show interpretable neurons.)

"Nailed it" requires all four steps *with* the two quantitative pieces (the $1/\sqrt d$ typical
cosine and the $Np$ computation). Naming "superposition" without the counting argument is exactly
the recall this question is designed to defeat.`,
    },
    {
      id: 'm6-l1-q5',
      kind: 'mcq',
      prompt: md`What makes superposition *affordable* rather than catastrophic?`,
      options: [
        'The interference between feature directions is exactly zero when the model is well-trained',
        'Features are sparse — only a tiny fraction are active on any token — so overlapping features rarely fire together, and the interference stays hypothetical',
        'Later layers detect and subtract the interference before it reaches the output',
        'The softmax at the output normalizes away any interference introduced in earlier layers',
      ],
      answer: 1,
      explain: md`The whole bet is sparsity: overlap costs you only on co-activation, and with
~100 of a million features live per token, collisions between any specific pair are rare. Option A
is impossible by pigeonhole (that's the entire lesson). Option C describes something suspiciously
convenient that no one has demonstrated as a general mechanism — and it's tempting precisely
because it sounds like the kind of thing a clever network *might* do; superposition needs no such
rescue.`,
    },
    {
      id: 'm6-l1-q6',
      kind: 'numeric',
      prompt: md`A sparse autoencoder is trained on a $4{,}096$-dimensional residual stream with a
dictionary of $4$ million features. What is its **expansion factor** (dictionary size ÷ activation
dimension), to the nearest hundred?`,
      answer: 977,
      tolerance: 120,
      explain: md`$4{,}000{,}000 / 4{,}096 \approx 977$ — call it a thousandfold. Note the
philosophy encoded in that number: the model *compressed* features into its dimensions, so the
tool for reading it deliberately goes a thousand times **wider**, buying back a coordinate per
feature and using the sparsity penalty to keep the wide layer honest.`,
    },
    {
      id: 'm6-l1-q7',
      kind: 'mcq',
      prompt: md`In a sparse autoencoder's loss $\mathcal{L} = \|\mathbf{x} - \hat{\mathbf{x}}\|^2 + \lambda\|\mathbf{a}\|_1$,
what would happen if you set $\lambda = 0$?`,
      options: [
        'The features would become more monosemantic, since reconstruction is all that matters',
        'The autoencoder would reconstruct activations well using dense, entangled codes — learning a basis that explains the data but recovers no interpretable features',
        'Training would diverge because the loss would be unbounded',
        'It would be equivalent to principal component analysis on the activations',
      ],
      answer: 1,
      explain: md`The sparsity term is the *entire* interpretability hypothesis in the loss —
without it, a wide layer trivially reconstructs $\mathbf{x}$ with dense mush (an overcomplete
identity-ish map), scoring perfectly and telling you nothing. Option D is a well-baited trap: PCA
also lacks a sparsity penalty, but it additionally imposes orthogonality and variance-ordering
that an unconstrained autoencoder has no reason to obey. The deep point: the assumption you *put
into* the objective is the assumption you'll *find* in the results — which is also why "maybe some
computation isn't sparse" is a real limitation, not a nitpick.`,
    },
    {
      id: 'm6-l1-q8',
      kind: 'numeric',
      prompt: md`**Fermi:** suppose a frontier model needs to represent roughly 1 million
distinguishable concepts in a residual stream of $12{,}288$ dimensions. How many concepts must
share each dimension, on average? (Round to the nearest whole number.)`,
      answer: 81,
      tolerance: 20,
      explain: md`$10^6 / 12{,}288 \approx 81$ concepts per dimension. Every dimension is
timesharing among ~80 meanings — which is a one-line proof that no dimension can *have* a meaning,
and a one-line explanation of why anyone who reports "neuron 4,721 is the sarcasm neuron" should be
asked several follow-up questions.`,
    },
    {
      id: 'm6-l1-q9',
      kind: 'mcq',
      prompt: md`You ablate (zero out) a single neuron in a large model and observe a small,
diffuse degradation across many unrelated capabilities. Under the superposition picture, what did
you actually just do?`,
      options: [
        'Removed exactly one concept from the model’s repertoire',
        'Damaged the component of every feature that had a projection onto that axis — a partial, blended lesion across many features at once',
        'Nothing meaningful, since neurons are redundant and the model routes around any single one',
        'Removed one attention head’s contribution to the residual stream',
      ],
      answer: 1,
      explain: md`An axis cuts across many feature directions, so zeroing it shaves a slice off each
of them rather than deleting any one cleanly — hence the diffuse, hard-to-interpret damage that
made a decade of neuron-ablation studies so frustrating to read. Option C is tempting because
robustness is real, but "nothing meaningful" is precisely wrong: the damage *is* meaningful,
just not *localized*. Correct interpretability practice is to intervene along **feature
directions** (steering, clamping) instead of along neurons — the topic of the next lesson.`,
    },
    {
      id: 'm6-l1-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "If we made the AI, and we can see every
number inside it, why don't we know how it works?" Explain: why there isn't a little box inside for
each idea (make the counting concrete), the trick the AI uses instead (an analogy you invent —
mixing paint, overlapping tracing paper, a radio dial, a crowded parking lot; inventing a good one
is worth more than borrowing mine), why the trick usually causes no trouble (the "not everyone is
home at once" idea), and what scientists do to try to untangle it. No jargon without kid-level
explanation first.`,
      rubric: md`Grade the teaching, not the vocabulary:

1. **The counting, made concrete** — the AI knows millions of things but has only about twelve
   thousand "slots"; that's like a school with a million students and twelve thousand lockers, so
   nobody gets their own locker. The impossibility must be *arithmetic*, not vague.
2. **The trick** — instead of one idea per slot, each idea is a *combination* spread across many
   slots (a colour mixed from many paints; a chord instead of a single note; a direction on a map
   rather than "north" or "east"). Any single slot therefore holds smudges of many ideas at once —
   which is why looking at one number tells you nothing.
3. **Why it's usually fine** — only a hundred or so ideas are "switched on" at any moment, so two
   ideas sharing space almost never collide (the lockers work because only a hundred students are
   at school on any given day).
4. **What scientists do** — try to work out the recipe for each idea: a special helper program
   watches millions of examples and figures out which combinations keep appearing, then you can
   *test* a guess by turning an idea up and seeing whether the AI starts talking about it (the
   Golden Gate demo, in kid terms — turning up "bridge" until it can't stop mentioning it).
5. **Jargon audit:** "superposition," "residual stream," "sparse autoencoder," "basis," "feature
   direction" used without kid-level translation = partial at best.`,
    },
    {
      id: 'm6-l1-q11',
      kind: 'written',
      prompt: md`**The ghost hunt.** Feature A and feature B have directions with
$\cos\theta = 0.08$. On a given token, A is strongly present (activation $3.0$) and B is genuinely
absent. On paper: (1) compute the spurious activation you measure for B by projecting onto its
direction; (2) explain why this makes "weak but ubiquitous" feature activations the most
treacherous thing in an interpretability dashboard; (3) design a concrete check that distinguishes
a *real* weak activation of B from a *shadow* cast by A.`,
      rubric: md`**(1)** $3.0 \times 0.08 = 0.24$ — a phantom quarter-unit of B, produced entirely
by A's presence and the geometry. (Note what drives it: the *strength* of the interferer matters as
much as the angle — a loud feature shouts through a small overlap.)

**(2)** Weak activations are exactly where genuine-but-subtle features and interference ghosts are
indistinguishable by magnitude alone. A feature that appears weakly on *many* unrelated tokens is
especially suspect: that's the signature of a direction picking up leakage from whatever else is
active, not of a concept that is mildly present everywhere. Read a dashboard naively and you will
confidently name a shadow.

**(3) Distinguishing checks** (any one solid design; the essential move is *intervention or
control*, not more looking):
- **Ablate the suspected interferer:** suppress A's direction and re-measure B. A shadow vanishes
  with A; a real activation survives.
- **Causal test on B:** clamp B up and check whether the *behaviour B claims to encode* appears —
  a shadow has no independent causal power.
- **Co-occurrence statistics:** if B's weak activations occur almost exclusively when A is strong,
  and the ratio tracks $\cos\theta$, that's leakage arithmetic, not a concept.
- **Control tokens:** find contexts where B should genuinely fire without A present; absence there
  plus presence with A is decisive.

Full credit = the computation, the "ubiquitous-and-weak is suspicious" reasoning, and a check whose
outcome could actually come out either way.`,
    },
    {
      id: 'm6-l1-q12',
      kind: 'written',
      prompt: md`**Research judgment.** A colleague claims: "Our SAE found the model's true
features." Write the case for scientific caution: (1) name three concrete reasons this claim is
hard to establish (draw on feature splitting, dictionary-size dependence, the reconstruction
residual, or the built-in sparsity assumption); (2) propose **two falsifiable experiments** whose
outcomes would genuinely raise or lower your confidence — not demonstrations that can only succeed;
and (3) state, in one sentence, the distinction you'd insist on between "superposition is real" and
"SAE features are the model's features."`,
      rubric: md`**(1) Three reasons** (any three, stated with their mechanism): *feature
splitting* — enlarge the dictionary and one feature fractures into several, so the feature count is
partly a choice, not a discovery; *dictionary-size dependence* generally — different hyperparameters
yield different "true" features; *reconstruction residual* — SAEs never fully explain the
activation, and the unexplained part may carry real computation; *the sparsity prior* — we searched
only for sparse structure, so non-sparse computation is invisible by construction; *labeling* —
features are named by humans or an LLM looking at top activations, which invites confirmation bias.

**(2) Two falsifiable experiments** — the key requirement is that failure is *possible and
informative*. Strong examples: **causal necessity** — clamp a feature to zero and check the
specific predicted behaviour degrades *while* matched control behaviours survive (a diffuse
degradation would count against); **downstream benchmark** — pit SAE features against a simple
linear probe on a real task (harmful-intent detection, refusal prediction) and pre-register that
losing to the baseline lowers confidence; **stability under re-training** — train SAEs with
different seeds/widths and measure whether the same features recur (low overlap = the features are
artifacts of the fit); **prediction on held-out behaviour** — use a feature to predict an
unseen model behaviour before testing it.

**(3) The distinction:** superposition is a well-supported claim about *the model's
representational geometry* (forced by counting, confirmed in controlled toy models); "these SAE
features are the model's features" is a much stronger claim about *a particular method recovering
that geometry*, and it must be earned separately by causal and comparative evidence.

Full credit demands genuinely falsifiable designs in (2) — "show it steers the model" is a
demonstration, not a test, unless paired with controls that could fail.`,
    },
  ],
}
