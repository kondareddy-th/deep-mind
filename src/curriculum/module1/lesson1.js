// Module 1, Lesson 1 — Vectors, dot products & cosine similarity (Feynman rewrite)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace `${` inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm1-l1',
  title: '1.1 Vectors — the geometry of meaning',
  subtitle:
    'How do you teach arithmetic to understand that "cat" is closer to "dog" than to "carburetor"? You turn meaning into geometry. This lesson is where the whole subject begins.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Here is the entire problem of language modeling, in one question:

> A computer can only do arithmetic. How could arithmetic ever know that *cat* is more like *dog*
> than like *carburetor*?

Sit with that for a second, because it's genuinely strange. There is nothing "cat-like" about any
number. Whatever we do, we must convert words into numbers **in such a way that doing arithmetic on
the numbers gives the same answers as human judgment about the meanings**. That's the game. Every
LLM ever built rests on one particular solution to this puzzle, and it's the subject of this lesson.

## A trick you already know: maps

You've already seen meaning turned into numbers — on a map. Every city on Earth gets exactly two
numbers, latitude and longitude:

$$\text{Paris} \to (48.9,\; 2.4) \qquad \text{Versailles} \to (48.8,\; 2.1) \qquad \text{Tokyo} \to (35.7,\; 139.7)$$

Nobody thinks the number $48.9$ *is* Paris. But look what the numbers can do: Versailles' numbers
are close to Paris's numbers, and Versailles *is* close to Paris. Tokyo's numbers are far away, and
Tokyo *is* far away. The coordinates are chosen so that **a dumb calculation (compare the numbers)
reproduces a real fact about the world (which cities are near each other)**.

So here's the idea, and it is almost embarrassingly simple: *do the same thing with words*. Give
every word coordinates — not on the Earth, but in a made-up "space of meaning" — arranged so that
words with similar meanings sit near each other.

Let's actually try it. Suppose we invent two axes of meaning: *how alive is it?* and *how big is
it?* Then we might score:

| word | alive? | big? |
|---|---|---|
| cat | 0.9 | 0.2 |
| dog | 0.9 | 0.3 |
| whale | 0.9 | 1.0 |
| truck | 0.0 | 0.9 |

Now the puzzle is solved — by subtraction! Cat and dog differ by $(0.0, 0.1)$: practically nothing.
Cat and truck differ by $(0.9, -0.7)$: a lot. A machine that knows only arithmetic can now "see"
that cat is like dog. We turned a question about *meaning* into a question about *distance*, and
distance is arithmetic.

A list of coordinates like $(0.9, 0.2)$ is called a **vector**, and a vector standing for a word is
called an **embedding**. Two dimensions won't get us far, though — and here is the first place your
intuition should object.
`,
    },
    {
      type: 'ponder',
      question: md`Why not just use *one* number per word? Put every word on a single line — say
cat $= 42$, dog $= 43$, truck $= 977$ — and call nearby numbers similar. What goes wrong? Try to
break it before revealing.`,
      answer: md`One number forces **one single ordering** of all words, and meaning refuses to be
ordered once. Try it: *cat* should sit near *dog* (fellow pet), near *tiger* (fellow feline), and
near *cartoon* (fellow internet star). But *tiger* and *cartoon* have nothing to do with each other,
so they must sit far apart — and cat cannot be simultaneously next to two things that are far from
each other *on a line*. In two dimensions it can (stand between them in different directions); with
thousands of dimensions, a word can be near thousands of different neighborhoods **for different
reasons at once**. That is why embeddings are long: GPT-3 uses $12{,}288$ numbers per token. Each
extra dimension is another independent "reason two words might be related."`,
    },
    {
      type: 'text',
      md: md`
## What a vector is (three pictures, one object)

A vector $\mathbf{u} = (2, 1)$ is three things at once, and fluent people flip between the pictures
without noticing:

1. **A list of numbers** — what the computer stores.
2. **A point** — a location in space, like a city on the map.
3. **An arrow** from the origin to that point — a *direction* plus a *length*.

The arrow picture is the one that will earn its keep. Two operations, both obvious as arrows:

**Adding** vectors means walking one arrow, then the other: $(2,1) + (1,-1) = (3,0)$. Head to tail.

**Scaling** stretches: $2 \cdot (2,1) = (4,2)$ — same direction, twice as long.

And now something lovely. On a real map, "go from France to Paris" is a *displacement* — an arrow
you could pick up and reuse somewhere else. Word embeddings, learned purely from text, turn out to
work the same way. The displacement from *man* to *king* is an arrow meaning roughly "add royalty."
Pick that arrow up, set its tail on *woman*, and its head lands near... *queen*:

$$\mathbf{v}_{\text{king}} - \mathbf{v}_{\text{man}} + \mathbf{v}_{\text{woman}} \approx \mathbf{v}_{\text{queen}}$$

Nobody programmed that. It fell out of training. (An honest footnote: in classic word2vec vectors the
single nearest word to that sum is usually *king* itself, so the standard analogy test excludes the
three input words before looking. With them excluded, *queen* comes out on top. The effect is real,
just less clean than the famous slogan.) **Relationships between meanings become directions
in the space.** Keep this in your pocket — it's the first real evidence that geometry is the right
language for meaning.

## Let's invent the dot product

Distance is one way to compare vectors. But there's a second question, subtler and more important
for us: not "how far apart are these points?" but "**how much do these arrows agree?**" Do they
point the same way?

Suppose you had to build the agreement-meter yourself, from spare arithmetic parts. Think about one
dimension at a time — say the "alive?" axis. If *both* words score positive there, that's evidence
of agreement. Both negative? Also agreement (they agree it's *not* alive). One positive, one
negative? Disagreement. And bigger scores should count for more — $0.9$ and $0.9$ agreeing is
stronger evidence than $0.1$ and $0.1$.

Is there a single arithmetic operation that says all that? Multiplication.
$(+)\times(+) = +$, $\;(-)\times(-) = +$, $\;(+)\times(-) = -$, and big inputs make big outputs.
So: let each dimension **vote** by multiplying its two entries, then add up the votes:

$$\mathbf{u} \cdot \mathbf{v} = u_1 v_1 + u_2 v_2 + \cdots + u_d v_d$$

That's the **dot product**. You just invented it. It is not a formula somebody decreed; it is the
simplest possible agreement-meter, and it's the single most executed operation on this planet —
data centers full of GPUs do almost nothing else, trillions of times per second.

> **Why you should care:** in a transformer, every token carries a *query* vector ("what am I
> looking for?") and a *key* vector ("what do I offer?"). The attention score between two tokens is
> exactly $\mathbf{q} \cdot \mathbf{k}$ — the agreement-meter, applied. When you hear "attention,"
> hear "dot products."
`,
    },
    {
      type: 'text',
      md: md`
## The miracle: the votes know about angles

Here's where it gets beautiful. We built the dot product out of pure bookkeeping — multiply, add,
no geometry anywhere. Now watch:

Take perpendicular arrows $\mathbf{u} = (3, 0)$ and $\mathbf{v} = (0, 2)$. Dot product:
$3\cdot 0 + 0 \cdot 2 = 0$. Zero — total indifference.

Take parallel arrows $(2,0)$ and $(5,0)$: dot product $10$, which is exactly $2 \times 5$, the
product of the lengths.

Take opposite arrows $(2,0)$ and $(-5,0)$: dot product $-10$. Full disagreement.

The pattern is no accident. The bookkeeping formula secretly computes a purely geometric quantity:

$$\mathbf{u}\cdot\mathbf{v} = \|\mathbf{u}\|\,\|\mathbf{v}\|\cos\theta$$

where $\theta$ is the angle between the arrows and $\|\mathbf{u}\|$ is the **length** (or *norm*) of
$\mathbf{u}$ — by Pythagoras, $\|\mathbf{u}\| = \sqrt{u_1^2 + \cdots + u_d^2}$. Multiply-and-add on
one side; lengths and angles on the other. Two completely different-looking descriptions, one
number. This identity is the bridge the whole course walks across: it means **the computer's cheap
arithmetic *is* geometry**, even in 12,288 dimensions where nobody can draw the picture.
`,
    },
    {
      type: 'ponder',
      question: md`Can you see *why* the bookkeeping formula knows about angles? Here's the whole
proof, hiding in one identity you learned in school. The law of cosines says that for a triangle
with sides $a$, $b$, $c$ and angle $\theta$ between $a$ and $b$: $\;c^2 = a^2 + b^2 - 2ab\cos\theta$.
Now let the two arrows $\mathbf{u}$ and $\mathbf{v}$ be sides of a triangle, so the third side is
the vector $\mathbf{u} - \mathbf{v}$. Try expanding $\|\mathbf{u}-\mathbf{v}\|^2$ with coordinates
and see what falls out.`,
      answer: md`Expand with coordinates (2D shown; identical in any dimension):

$$\|\mathbf{u}-\mathbf{v}\|^2 = (u_1 - v_1)^2 + (u_2 - v_2)^2 = \underbrace{u_1^2 + u_2^2}_{\|\mathbf{u}\|^2} + \underbrace{v_1^2 + v_2^2}_{\|\mathbf{v}\|^2} - 2(u_1 v_1 + u_2 v_2)$$

Compare with the law of cosines, $\|\mathbf{u}-\mathbf{v}\|^2 = \|\mathbf{u}\|^2 + \|\mathbf{v}\|^2 - 2\|\mathbf{u}\|\|\mathbf{v}\|\cos\theta$.
Both expressions share everything except the last term, so the last terms must be equal:

$$u_1 v_1 + u_2 v_2 = \|\mathbf{u}\|\|\mathbf{v}\|\cos\theta$$

The dot product *is* the cosine term of the law of cosines. School geometry knew about attention
scores all along.`,
    },
    {
      type: 'text',
      md: md`
## Cosine similarity: what you say, not how loud

One wrinkle. The dot product rewards *length* as well as *alignment* — double one vector and the
dot product doubles, though the meaning hasn't changed direction at all. Often that's wrong for
comparing meanings: a document that says "cat cat cat cat" isn't four times more cat-like; it's the
same message, louder. Direction is *what you say*; length is roughly *how loudly*.

So when we only care about the *what*, we divide the lengths back out and keep just the alignment:

$$\text{cos-sim}(\mathbf{u},\mathbf{v}) = \frac{\mathbf{u}\cdot\mathbf{v}}{\|\mathbf{u}\|\,\|\mathbf{v}\|} = \cos\theta \;\in\; [-1, 1]$$

$+1$: same direction. $0$: unrelated. $-1$: opposite. This one number is the workhorse of semantic
search and retrieval-augmented generation (RAG): to find documents relevant to a question, embed
everything and rank by cosine similarity. Billion-dollar products are this formula plus plumbing.

Now go *feel* it. In the playground below, the readout updates live as you drag.
`,
    },
    {
      type: 'viz',
      viz: 'vector-playground',
      caption:
        'Two vectors u (coral) and v (blue); the green arrow is the shadow of u on v. Three experiments: (1) make u·v exactly 0 and look at the angle; (2) double every component of u and watch what changes (u·v, |u|) and what does not (cos θ); (3) make cos θ = −1',
    },
    {
      type: 'example',
      title: 'cosine similarity of toy embeddings, by hand',
      md: md`
A tiny 4-dimensional embedding model gives:

$$\mathbf{v}_{\text{cat}} = (2, 1, 0, 1) \qquad \mathbf{v}_{\text{dog}} = (2, 0, 1, 1) \qquad \mathbf{v}_{\text{car}} = (0, 2, 2, 0)$$

**Dot products (the votes):** cat·dog $= 4 + 0 + 0 + 1 = 5$; cat·car $= 0 + 2 + 0 + 0 = 2$.

**Lengths:** $\|\mathbf{v}_{\text{cat}}\| = \sqrt{4+1+0+1} = \sqrt 6$; $\|\mathbf{v}_{\text{dog}}\| = \sqrt 6$; $\|\mathbf{v}_{\text{car}}\| = \sqrt 8$.

**Cosines:**

$$\text{cos-sim}(\text{cat},\text{dog}) = \frac{5}{\sqrt6 \sqrt6} = \frac 5 6 \approx 0.83
\qquad
\text{cos-sim}(\text{cat},\text{car}) = \frac{2}{\sqrt6\sqrt8} = \frac{2}{\sqrt{48}} \approx 0.29$$

The arithmetic "believes" cat resembles dog far more than car. Notice you never needed to know what
the 4 axes *mean* — and in real models, nobody does. The geometry does the understanding.
`,
    },
    {
      type: 'text',
      md: md`
## Projection: the shadow, derived from a question

Natural question: **how much of $\mathbf{u}$ points along $\mathbf{v}$?** Picture the sun directly
above the line of $\mathbf{v}$: the *shadow* $\mathbf{u}$ casts on that line is the answer.

Let's derive it instead of memorizing it. The shadow lies along $\mathbf{v}$, so it must be
$t\,\mathbf{v}$ for some number $t$ — the only question is what $t$ is. What makes a shadow a
shadow? The leftover piece $\mathbf{u} - t\mathbf{v}$ (from shadow-tip up to $\mathbf{u}$'s tip) is
the light ray, and light falls **perpendicular** to the ground. Perpendicular means dot product
zero — we have an equation:

$$(\mathbf{u} - t\mathbf{v}) \cdot \mathbf{v} = 0
\;\;\Longrightarrow\;\;
\mathbf{u}\cdot\mathbf{v} = t\,(\mathbf{v}\cdot\mathbf{v})
\;\;\Longrightarrow\;\;
t = \frac{\mathbf{u}\cdot\mathbf{v}}{\|\mathbf{v}\|^2}$$

$$\boxed{\;\text{proj}_{\mathbf{v}}(\mathbf{u}) = \frac{\mathbf{u}\cdot\mathbf{v}}{\|\mathbf{v}\|^2}\,\mathbf{v}\;}$$

One line of algebra, from one physical fact about shadows. The decomposition it gives —
$\mathbf{u} = (\text{part along } \mathbf{v}) + (\text{part perpendicular to } \mathbf{v})$ — is a
tool you'll use constantly: "how much of this token's state points along the *refusal direction*?"
is a real question interpretability researchers ask, and it's answered with exactly this formula.

## The drunkard's walk, and a real design decision in the transformer

Last idea, and it's a payoff. Flip a fair coin $d$ times: $+1$ for heads, $-1$ for tails, and keep
a running sum. After $d$ flips, how far from zero do you expect to be? Not $0$ — that's only the
*average over many tries*. Any *single* try wanders. The classic result (we'll prove it in the
probability lesson) is that the typical distance is $\sqrt d$: after $100$ flips you're typically
about $10$ away; after $10{,}000$ flips, about $100$. Wandering grows like the *square root*.

Now the punchline. Take two **random** $d$-dimensional vectors with entries of typical size $1$ and
dot them. Each of the $d$ terms $u_i v_i$ is a random number around $\pm 1$ — so the dot product is
*exactly a drunkard's walk with $d$ steps*, and its typical size is $\sqrt d$. In a transformer with
$d_k = 128$ per attention head, raw query–key scores naturally come out around $\pm\sqrt{128}
\approx \pm 11$, even before any learning has happened — and later they flow through a softmax,
which (as you'll see in lesson 1.4) treats a lead of ten-ish as a landslide: one token grabs
essentially all the attention, and learning stalls because tiny changes can't shift a landslide.

The authors of *Attention Is All You Need* fixed it with one division: scale scores by
$\sqrt{d_k}$, taming their typical size back to $\pm 1$:

$$\text{score} = \frac{\mathbf{q}\cdot\mathbf{k}}{\sqrt{d_k}}$$

That mysterious $\sqrt{d_k}$ in the most famous formula in machine learning is nothing but the
drunkard's walk. You now understand a real engineering decision in every LLM on Earth — before
formally meeting the architecture. That's what the math module is for.
`,
    },
    {
      type: 'ponder',
      question: md`A strange consequence of the same reasoning: pick two *random* directions in
$12{,}288$ dimensions. What angle do you expect between them? (Hint: their cosine similarity is a
dot product of typical size $\sqrt d$, divided by two lengths of typical size $\sqrt d$ each.)`,
      answer: md`$\cos\theta \approx \dfrac{\sqrt d}{\sqrt d \cdot \sqrt d} = \dfrac{1}{\sqrt d}
\approx \dfrac{1}{111} \approx 0.009$ — essentially **zero**. Random high-dimensional vectors are
almost always almost perpendicular! High-dimensional space is unimaginably roomy: around any
direction there's an enormous "equator" of nearly-orthogonal directions. This roominess is a gift
for LLMs — it's how a mere $12{,}288$ dimensions can host *millions* of distinguishable concepts:
concepts don't need private axes, just directions sufficiently perpendicular to each other. (When a
model packs more concepts than dimensions this way, researchers call it *superposition* — an active
research frontier you'll meet in Module 6.)`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The puzzle and its solution:** meaning becomes geometry — words become vectors arranged so
   arithmetic reproduces judgment. Relationships become *directions* (king − man + woman).
2. **The dot product, invented from scratch:** a per-dimension voting scheme — and secretly
   $\|\mathbf{u}\|\|\mathbf{v}\|\cos\theta$, by the law of cosines. Cheap arithmetic *is* geometry.
3. **Cosine similarity:** the *what* without the *how loud*. The engine of semantic search.
4. **Projection:** the shadow, derived in one line from "light falls perpendicular."
5. **The drunkard's walk:** random dot products grow like $\sqrt d$ — which is precisely why
   attention scores are divided by $\sqrt{d_k}$.

Next lesson: what happens when arrows *act on* arrows — matrices, the machines that transform the
whole space at once. Every layer of a transformer is one.
`,
    },
  ],
  questions: [
    {
      id: 'm1-l1-q1',
      kind: 'mcq',
      prompt: md`The dot product of two embedding vectors is **0**. What does this tell you geometrically?`,
      options: [
        'The vectors point in opposite directions',
        'The vectors are perpendicular — the agreement-meter reads "indifferent"',
        'At least one vector has zero length',
        'The vectors are identical',
      ],
      answer: 1,
      explain: md`$\mathbf{u}\cdot\mathbf{v} = \|\mathbf{u}\|\|\mathbf{v}\|\cos\theta = 0$ with
nonzero lengths forces $\cos\theta = 0$: a right angle. In the voting picture: the yes-votes and
no-votes exactly cancel. Opposite directions would give a large *negative* reading, not zero — the
meter distinguishes "we disagree" from "we have nothing to do with each other," and that distinction
matters: it's the difference between *hot* vs *cold* and *hot* vs *Tuesday*.`,
    },
    {
      id: 'm1-l1-q2',
      kind: 'numeric',
      prompt: md`On paper: compute $\mathbf{u} \cdot \mathbf{v}$ for $\mathbf{u} = (3, -1, 2)$ and
$\mathbf{v} = (1, 4, -2)$. Before you compute, *predict the sign* by eyeballing which dimensions
agree — then check yourself.`,
      answer: -5,
      tolerance: 0.001,
      explain: md`$3\cdot1 + (-1)\cdot 4 + 2\cdot(-2) = 3 - 4 - 4 = -5$. Dimension 1 votes yes
(+3); dimensions 2 and 3 vote no ($-4$ each). The no-votes win: these arrows lean *against* each
other ($\theta > 90°$).`,
    },
    {
      id: 'm1-l1-q3',
      kind: 'numeric',
      prompt: md`What is the length $\|\mathbf{w}\|$ of $\mathbf{w} = (2, -2, 1)$?`,
      answer: 3,
      tolerance: 0.001,
      explain: md`$\|\mathbf{w}\| = \sqrt{4 + 4 + 1} = \sqrt 9 = 3$. Pythagoras, applied twice —
once per extra dimension. The minus sign doesn't matter: lengths square everything.`,
    },
    {
      id: 'm1-l1-q4',
      kind: 'written',
      prompt: md`On paper: compute the **cosine similarity** between $\mathbf{a} = (1, 2, 2)$ and
$\mathbf{b} = (2, 2, 1)$, showing every step — dot product, both lengths, the ratio. Then answer in
one sentence: if these were embeddings of two words, what would the number tell you, and what would
it *fail* to tell you?`,
      rubric: md`**Dot product:** $\mathbf{a}\cdot\mathbf{b} = 2 + 4 + 2 = 8$.

**Lengths:** $\|\mathbf{a}\| = \sqrt{1+4+4} = 3$; $\;\|\mathbf{b}\| = \sqrt{4+4+1} = 3$.

**Cosine similarity:** $\dfrac{8}{3\times3} = \dfrac 8 9 \approx 0.89$.

**Interpretation:** $0.89$ is close to $1$, so the two words point in nearly the same direction in
meaning-space — near-synonyms or tightly related concepts. **What it fails to tell you:** anything
about *which* meaning that is (cosine similarity is relative, not absolute), and anything encoded in
the vectors' lengths, which we deliberately divided away. Full credit requires all three computation
steps *and* both halves of the interpretation.`,
    },
    {
      id: 'm1-l1-q5',
      kind: 'mcq',
      prompt: md`Word embeddings satisfy $\mathbf{v}_{\text{Paris}} - \mathbf{v}_{\text{France}} + \mathbf{v}_{\text{Japan}} \approx \;?$ — and *why*?`,
      options: [
        '$\\mathbf{v}_{\\text{Tokyo}}$ — the France→Paris displacement is a reusable "capital-of" arrow',
        '$\\mathbf{v}_{\\text{Asia}}$ — subtraction moves toward broader categories',
        '$\\mathbf{v}_{\\text{France}}$ — the operations cancel out',
        'Nothing meaningful — embedding arithmetic is numerically unstable',
      ],
      answer: 0,
      explain: md`$\mathbf{v}_{\text{Paris}} - \mathbf{v}_{\text{France}}$ is a *displacement* — an
arrow you can pick up and reuse, like "two blocks north" works from any street corner. Planted on
Japan, the capital-of arrow lands near Tokyo. Relationships living as consistent directions is the
deep empirical surprise of learned embeddings — nobody programmed it in.`,
    },
    {
      id: 'm1-l1-q6',
      kind: 'written',
      prompt: md`**Derive, don't recall:** on paper, derive the projection formula yourself, the way
the lesson did. Set up: the shadow of $\mathbf{u}$ on $\mathbf{v}$ must be $t\mathbf{v}$ for some
number $t$; the leftover $\mathbf{u} - t\mathbf{v}$ must be perpendicular to $\mathbf{v}$. Solve for
$t$. Then apply your formula to $\mathbf{u} = (4, 2)$, $\mathbf{v} = (3, 0)$, and draw the picture —
both arrows, the shadow, the perpendicular light ray.`,
      rubric: md`**Derivation:** perpendicularity means $(\mathbf{u} - t\mathbf{v})\cdot\mathbf{v} = 0$.
Distribute: $\mathbf{u}\cdot\mathbf{v} - t\,(\mathbf{v}\cdot\mathbf{v}) = 0$, so

$$t = \frac{\mathbf{u}\cdot\mathbf{v}}{\mathbf{v}\cdot\mathbf{v}} = \frac{\mathbf{u}\cdot\mathbf{v}}{\|\mathbf{v}\|^2},
\qquad \text{proj}_{\mathbf{v}}(\mathbf{u}) = \frac{\mathbf{u}\cdot\mathbf{v}}{\|\mathbf{v}\|^2}\,\mathbf{v}$$

**Application:** $\mathbf{u}\cdot\mathbf{v} = 12$, $\|\mathbf{v}\|^2 = 9$, so $t = 4/3$ and the
shadow is $(4, 0)$.

**Picture:** $\mathbf{u}$ pointing up-and-right, $\mathbf{v}$ along the x-axis, shadow $(4,0)$ on
the axis directly beneath $\mathbf{u}$'s tip, dashed vertical light ray connecting them. Grade
yourself "nailed it" only if you produced the derivation from the perpendicularity condition —
recalling the final formula from memory is exactly what this question is *not* about.`,
    },
    {
      id: 'm1-l1-q7',
      kind: 'mcq',
      prompt: md`Components of $\mathbf{u}, \mathbf{v} \in \mathbb{R}^{4096}$ are independent random
values of typical size $1$ (mean $0$). The dot product $\mathbf{u}\cdot\mathbf{v}$ typically has
magnitude around:`,
      options: ['$1$', '$64$', '$4096$', '$0$ — the terms always cancel exactly'],
      answer: 1,
      explain: md`The dot product is a drunkard's walk with $4096$ steps of size ~$1$: typical
distance from home is $\sqrt{4096} = 64$. The *average* is zero, but averages aren't outcomes — any
single walk strays. Cancellation is only ever approximate, and it fails by exactly $\sqrt d$. This
is the entire reason the transformer's attention formula divides by $\sqrt{d_k}$.`,
    },
    {
      id: 'm1-l1-q8',
      kind: 'written',
      prompt: md`**The Feynman test:** explain to a smart friend who has never seen linear algebra
why "the dot product is the heart of the transformer." You must make them understand: what a
*query* and a *key* are, why a dot product measures their *agreement*, what goes wrong with raw
scores in high dimensions (use the drunkard's walk!), and how dividing by $\sqrt{d_k}$ fixes it. No
formula-dropping — every symbol you use, you must explain in words first.`,
      rubric: md`A strong answer teaches, not recites. The beats:

1. Every token writes a **query** ("what I'm looking for") and a **key** ("what I contain"). Tokens
   need a way to find relevant tokens — that's a matching problem.
2. The dot product multiplies corresponding features and adds: features that agree in sign vote
   "match," weighted by confidence — an **agreement-meter** built from multiplication.
3. With thousands of dimensions, even *random* queries and keys produce scores that wander to
   $\pm\sqrt{d}$ — the drunkard's walk: many random votes don't cancel exactly, they stray by the
   square root of the number of votes.
4. Downstream, a softmax turns scores into attention weights, and it reads a ten-point lead as a
   landslide: one token takes everything, and learning stalls. Dividing every score by
   $\sqrt{d_k}$ shrinks typical scores back to $\pm 1$, keeping the competition live.

"Nailed it" = all four beats, in plain words, with the drunkard's walk actually doing the
explanatory work in beat 3.`,
    },
    {
      id: 'm1-l1-q9',
      kind: 'numeric',
      prompt: md`**Fermi estimate (do it on paper, no calculator until the last step):** GPT-3's
vocabulary has $50{,}257$ tokens, each with a $12{,}288$-dimensional embedding vector. Roughly how
many numbers is that — i.e., how many parameters does the embedding table alone hold, **in
millions**? (Round sensibly; the tolerance is generous. The habit of estimating sizes before
computing exactly is a researcher's reflex worth training.)`,
      answer: 617,
      tolerance: 25,
      explain: md`$50{,}257 \times 12{,}288 \approx 50{,}000 \times 12{,}300 \approx 6.2 \times 10^8$
— about **617 million** parameters, in the lookup table alone, before a single transformer layer.
(Exact: $617{,}558{,}016$.) Sanity-checks like this — "how big is that thing, roughly?" — catch more
research bugs than any debugger.`,
    },
    {
      id: 'm1-l1-q10',
      kind: 'mcq',
      prompt: md`You're building semantic search over documents of wildly different lengths. Why
rank by **cosine similarity** rather than by raw dot product with the query?`,
      options: [
        'Cosine similarity is much faster to compute than the dot product',
        'Long documents get systematically larger embedding norms, so raw dot products would rank "louder" documents above better-matching ones',
        'The dot product can be negative, and negative scores crash the ranking algorithm',
        'Raw dot products only work when the vectors are 2- or 3-dimensional',
      ],
      answer: 1,
      explain: md`Direction is *what a document says*; length is roughly *how loudly*. Raw dot
product rewards both, so verbose documents with big norms would outrank short documents that match
the query's direction better. Dividing out the lengths — cosine similarity — compares pure
direction. (It's actually *slower* than a dot product, not faster: same dot product plus two norms
and a division. Negative scores are harmless — they're just bad matches, ranked last.)`,
    },
    {
      id: 'm1-l1-q11',
      kind: 'numeric',
      prompt: md`What is the **angle in degrees** between $\mathbf{u} = (1, 1, 0)$ and
$\mathbf{v} = (0, 1, 1)$? Work it on paper: dot product, lengths, cosine, then recognize the angle.`,
      answer: 60,
      tolerance: 0.5,
      explain: md`$\mathbf{u}\cdot\mathbf{v} = 0 + 1 + 0 = 1$; $\;\|\mathbf{u}\| = \|\mathbf{v}\| = \sqrt 2$;
$\;\cos\theta = \dfrac{1}{\sqrt2\sqrt2} = \dfrac 1 2$, so $\theta = 60°$. Worth noticing: each
vector is "half agreeing" with the other — they share one active dimension of two apiece — and the
geometry turns that into the cleanest angle in the book.`,
    },
    {
      id: 'm1-l1-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old** (write it out; this is the Feynman technique, and
it is *the* test of whether you own an idea): Computers turn every word into a long list of numbers.
Explain to the kid (1) why lists of numbers can stand for meanings at all, and (2) how the computer
can tell that two words are similar *without any human ever telling it*. You may steal the lesson's
map analogy or invent a better one — inventing a better one is worth more.`,
      rubric: md`There's no single right script; grade the *teaching*. A "nailed it" answer must:

1. **Ground the idea in something the kid knows** — e.g., a map: every city is two numbers, and
   nearby cities have nearby numbers; words work the same but with thousands of "map directions"
   like how-alive, how-big, how-royal (axes the computer invents itself).
2. **Make similarity concrete** — similar words end up with similar number-lists, so the computer
   just checks whether the lists are close (kid-level version of distance/dot product is fine:
   "compare the lists number by number").
3. **Answer the "without being told" part** — the computer reads mountains of text and nudges words
   that show up in the same kinds of sentences toward each other, millions of times, until
   neighborhoods of meaning form on their own.
4. **Contain no unexplained jargon.** If you wrote "vector," "embedding," or "dimension" without
   first explaining it in kid-words, that's *partial* at best — jargon-hiding is exactly the failure
   mode this exercise exists to catch.`,
    },
  ],
}
