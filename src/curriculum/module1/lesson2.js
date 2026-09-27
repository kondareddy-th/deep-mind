// Module 1, Lesson 2 — Matrices: machines that transform space (Feynman rewrite)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace (JS interpolation) inside content.

const md = String.raw

export default {
  id: 'm1-l2',
  title: '1.2 Matrices — machines that transform space',
  subtitle: md`A matrix moves every point in space at once — infinitely many points — yet nine
numbers pin the whole machine down. This lesson is about that trick, and about why a 7-billion-parameter
language model is honestly described as a pile of these machines.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Last lesson the arrows just sat there. Now something is going to *act* on them.

Picture all of three-dimensional space — every point of it, the whole infinite fog. Now move the
entire fog at once: swirl it, stretch it, squash it. A machine that does this owes an answer to
*every single point*: "you go here, you go there," infinitely many assignments. And yet the machines
in this lesson — the ones inside every neural network — are each pinned down completely by **nine
numbers**. Not nine numbers per point. Nine numbers, total, for all of infinity.

That should bother you. Nine numbers cannot *store* infinitely many independent facts. The only way
out is that the machine's behavior is not infinitely many independent facts — the machine must be so
lawful that once you know a tiny bit of what it does, everything else is *forced*. Let's find the law.

## The law: respect the recipes

The machines we allow, called **linear** machines, obey two rules:

$$M(\mathbf{x} + \mathbf{y}) = M\mathbf{x} + M\mathbf{y} \qquad\qquad M(c\,\mathbf{x}) = c\,(M\mathbf{x})$$

In words: if you build an input out of pieces, the output is built out of the transformed pieces,
with the same amounts. The machine **respects recipes**. Geometrically this means grid lines stay
straight, parallel, and evenly spaced, and the origin never moves — the machine may rotate, stretch,
shear, reflect, or flatten space, but never bend it and never shift it.

Now watch the law do its work. *Any* vector is a recipe of basis arrows:

$$(3, 2) = 3\,\mathbf{e}_1 + 2\,\mathbf{e}_2 \qquad \text{— walk 3 along } \mathbf{e}_1 \text{, then 2 along } \mathbf{e}_2.$$

Feed that recipe to a lawful machine and the rules leave it no freedom at all:

$$M(3,2) = M(3\,\mathbf{e}_1 + 2\,\mathbf{e}_2) = 3\,(M\mathbf{e}_1) + 2\,(M\mathbf{e}_2)$$

Look at what just happened. Nobody has to tell the machine where $(3,2)$ goes. It only needs to know
where the **two basis arrows** land — the fate of everything else is forced by the recipe rule. And
the same argument works for every point in the plane at once. In 3D there are three basis arrows,
each landing spot takes three coordinates: $3 \times 3 = 9$ numbers. **That is how nine numbers
control infinity: they don't store the answers, they store the two or three facts from which every
answer follows.**

## The filing cabinet, and a formula we discover rather than memorize

So a machine *is* its list of landing spots. Let's file them tidily: write the landing spot of
$\mathbf{e}_i$ as the $i$-th **column** of a grid of numbers. Say our machine sends
$\mathbf{e}_1 \to (2,1)$ and $\mathbf{e}_2 \to (1,3)$. The file is

$$M = \begin{bmatrix} 2 & 1 \\ 1 & 3 \end{bmatrix} \qquad \text{— column } i \text{ is the fate of arrow } i.$$

That grid is all a **matrix** is: the machine's filing cabinet. Now, where does $(3,2)$ go? We
derived it already:

$$M(3,2) = 3\begin{bmatrix}2\\1\end{bmatrix} + 2\begin{bmatrix}1\\3\end{bmatrix}
= \begin{bmatrix}6\\3\end{bmatrix} + \begin{bmatrix}2\\6\end{bmatrix} = \begin{bmatrix}8\\9\end{bmatrix}$$

And in general, for columns $\mathbf{c}_1, \dots, \mathbf{c}_n$:

$$M\mathbf{x} = x_1\,\mathbf{c}_1 + x_2\,\mathbf{c}_2 + \cdots + x_n\,\mathbf{c}_n$$

**The matrix-vector product is a weighted mix of the columns, with the input's entries as the
weights.** We didn't define this formula; the recipe law forced it on us. If someone ever taught you
matrix multiplication as an arbitrary ritual, this is what the ritual was hiding.

There's a second way to read the same arithmetic. Stare at the first output coordinate above:
$2 \cdot 3 + 1 \cdot 2 = 8$. That is the **dot product** of the first *row* $(2,1)$ with the input
$(3,2)$ — lesson 1.1's agreement meter! Each output coordinate is one row's agreement score with the
input. So every matrix-vector product is simultaneously a *mix of columns* and a *stack of row-dot-products*.
Both pictures are true; fluent people flip between them without noticing.

> **Why you should care:** in Llama-7B, a token is a vector with $d_{\text{model}} = 4096$
> coordinates, and each weight matrix is a machine pinned down by where 4096 basis arrows land —
> $4096 \times 4096 \approx 16.8$ million numbers for a single machine. The model contains a few
> hundred of them. When researchers say "the weights," they mean these filing cabinets.
`,
    },
    {
      type: 'viz',
      viz: 'matrix-transform',
      caption: md`The machine, made visible: a 3D point cloud, the unit cube, and the basis arrows,
carried smoothly from the do-nothing machine (identity) to a chosen preset, with a live determinant
readout. Three experiments: **(1)** run *scale* and *rotation* and watch the cube's volume track the
det number — rotation keeps it pinned at exactly 1 while everything spins; **(2)** run *rank-2
projection* and watch the cube get crushed flat as det slides to 0 — then pick two cloud points that
end up in the same place and ask yourself what could ever pull them apart again; **(3)** run
*symmetric stretch* and hunt for the two directions that never turn, only stretch — you are finding
eigenvectors with your eyes, three sections early.`,
    },
    {
      type: 'example',
      title: md`matrix-vector products by hand — both pictures`,
      md: md`
**2×2 warm-up.** Let $A = \begin{bmatrix} 2 & 1 \\ 0 & 3 \end{bmatrix}$ and $\mathbf{x} = (1, 2)$.

*Row picture* (dot each row with $\mathbf{x}$):

$$A\mathbf{x} = \begin{bmatrix} (2,1)\cdot(1,2) \\ (0,3)\cdot(1,2) \end{bmatrix}
= \begin{bmatrix} 2 + 2 \\ 0 + 6 \end{bmatrix} = \begin{bmatrix} 4 \\ 6 \end{bmatrix}$$

*Column picture* (weighted mix of the columns):

$$A\mathbf{x} = 1 \begin{bmatrix} 2 \\ 0 \end{bmatrix} + 2 \begin{bmatrix} 1 \\ 3 \end{bmatrix}
= \begin{bmatrix} 2 \\ 0 \end{bmatrix} + \begin{bmatrix} 2 \\ 6 \end{bmatrix} = \begin{bmatrix} 4 \\ 6 \end{bmatrix}$$

Same answer, two mental models. Notice the column picture also *tells you a story*: the machine sends
$\mathbf{e}_1$ to $(2,0)$ and $\mathbf{e}_2$ to $(1,3)$, and the output is one helping of the first
fate plus two helpings of the second.

**3×3, by hand.** Let $B = \begin{bmatrix} 1 & 0 & 2 \\ 0 & 1 & -1 \\ 3 & 1 & 0 \end{bmatrix}$ and
$\mathbf{v} = (2, -1, 1)$.

Row by row: $\;(1)(2) + (0)(-1) + (2)(1) = 4$; $\;(0)(2) + (1)(-1) + (-1)(1) = -2$;
$\;(3)(2) + (1)(-1) + (0)(1) = 5$. So

$$B\mathbf{v} = (4, -2, 5)$$

Cross-check with columns: $2(1,0,3) + (-1)(0,1,1) + 1(2,-1,0) = (2,0,6) + (0,-1,-1) + (2,-1,0) = (4,-2,5)$.
The pictures agree, as they must. Do a few of these until they're automatic — every attention head on
Earth does trillions of them per second.
`,
    },
    {
      type: 'text',
      md: md`
## Multiplying machines — discovered, not decreed

Machines can be chained: run $\mathbf{x}$ through $B$, feed the result to $A$, getting
$A(B\mathbf{x})$. First question: is the chain itself a lawful machine? Check the recipe rule: $B$
respects recipes, and then $A$ respects what $B$ hands it — so yes, "first $B$, then $A$" respects
recipes. But we just proved something sneaky-powerful: *every lawful machine is pinned down by where
the basis arrows land.* So the chain must have its own filing cabinet — its own matrix. Call it
$AB$, defined by what it does:

$$(AB)\,\mathbf{x} = A(B\mathbf{x})$$

What are its entries? We know exactly how to find out — ask where the basis arrows land. Arrow
$\mathbf{e}_j$ goes through $B$ and lands on column $j$ of $B$; then $A$ carries *that* wherever it
goes. So:

$$\text{column } j \text{ of } AB \;=\; A \cdot (\text{column } j \text{ of } B)$$

And since each entry of $A \cdot (\text{anything})$ is a row-dot-product, each entry of the product is

$$(AB)_{ij} = (\text{row } i \text{ of } A)\cdot(\text{column } j \text{ of } B) = \sum_k A_{ik}\,B_{kj}$$

The mysterious rows-times-columns ritual from school is nothing but **"do one machine, then the
other," unpacked into arithmetic.** You could have invented it.

**The shape rule — also forced.** $B$ eats $p$-dimensional vectors and outputs $n$-dimensional
ones; $A$ must be able to eat what $B$ outputs. So $A$'s input size must equal $B$'s output size —
the *inner* dimensions must match, and they cancel:

$$(m \times n)(n \times p) \;\longrightarrow\; (m \times p)$$

If they don't match, the pipeline is nonsense and the product simply does not exist. Checking that
shapes chain is the first reflex when reading — or debugging — any model.

## Order matters, and here are the numbers to prove it

Take two machines. $R$ rotates the plane $90°$ counter-clockwise: $\mathbf{e}_1 \to (0,1)$,
$\mathbf{e}_2 \to (-1,0)$, so $R = \begin{bmatrix} 0 & -1 \\ 1 & 0 \end{bmatrix}$. $P$ squashes
everything flat onto the floor (the x-axis): $\mathbf{e}_1 \to (1,0)$, $\mathbf{e}_2 \to (0,0)$, so
$P = \begin{bmatrix} 1 & 0 \\ 0 & 0 \end{bmatrix}$.

Follow the fate of the humble arrow $(1,0)$, lying flat on the floor.

**Rotate, then squash** — that's the machine $PR$, reading right to left:
$(1,0) \xrightarrow{\;R\;} (0,1) \xrightarrow{\;P\;} (0,0)$. *Annihilated.* The rotation stood the
arrow upright, and the squash flattened it to nothing.

**Squash, then rotate** — the machine $RP$:
$(1,0) \xrightarrow{\;P\;} (1,0) \xrightarrow{\;R\;} (0,1)$. *Alive and well.* The squash couldn't
hurt an arrow already lying on the floor, and the rotation just stood it up.

Same two machines, opposite fates. The matrices agree — compute each product column-by-column
(column $j$ of the product = first machine's column $j$, pushed through the second machine):

$$PR = \begin{bmatrix} 0 & -1 \\ 0 & 0 \end{bmatrix} \qquad\qquad RP = \begin{bmatrix} 0 & 0 \\ 1 & 0 \end{bmatrix}$$

Different machines, different kill zones. Physical version you can do right now: lay a book flat on
the table. Rotate it a quarter turn, then flip it over toward you. Reset, and this time flip first,
then rotate. It ends up in a different position. Motions have no reason to commute — so matrix
multiplication doesn't either: in general $AB \neq BA$, and often one of the two orders isn't even
shape-legal.

## The collapse theorem — why depth needs nonlinearity

One more consequence, and it explains a design choice in every neural network ever built. Chain any
number of lawful machines and the whole chain collapses into a *single* matrix:
$W_3 W_2 W_1$ is one filing cabinet. So a hundred stacked linear layers have **exactly** the
expressive power of one linear layer — the depth is an illusion; you could precompute the product and
ship one matrix.

> **Why you should care:** this is precisely why transformers sandwich cheap pointwise
> nonlinearities (ReLU, GELU, SwiGLU) between their matrix multiplications. The nonlinearities are
> firewalls against collapse — they are the only reason "32 layers" means more than "1 layer." And a
> token's journey through Llama-7B really is a chain of a few hundred matrix multiplications, read
> right to left, with a firewall between each pair.
`,
    },
    {
      type: 'ponder',
      question: md`Some machines can obviously be undone: rotate everything $90°$, and rotating
$-90°$ puts every point back. Now take $P$, the squash-onto-the-floor machine. Could *any* machine
$U$ un-squash it — that is, satisfy $U(P\mathbf{x}) = \mathbf{x}$ for every $\mathbf{x}$? Before
answering, follow the two points $(3,1)$ and $(3,5)$ through $P$ and see what $U$ would be up
against.`,
      answer: md`No machine can do it — not a linear one, not any function at all. $P$ sends *both*
$(3,1)$ and $(3,5)$ to $(3,0)$. After the squash, they are the same point. Whatever $U$ is, it
receives $(3,0)$ and must output *one* answer — it cannot answer $(3,1)$ to one ghost of the past
and $(3,5)$ to the other. The height coordinate isn't hidden somewhere; **it no longer exists
anywhere in the output.** The information died at the moment of squashing.

So the rule is: a machine is invertible exactly when it never merges two inputs — equivalently, when
it crushes no direction to zero. And destruction is *forever*: no later machine, however clever, can
recover what an earlier machine destroyed. (Hold that thought — it will become an equation in the
next ponder.) Coming up: a single number that detects crushing before it's too late — the
determinant.`,
    },
    {
      type: 'text',
      md: md`
## Three machines with names

**The identity $I$** — the do-nothing machine. Each basis arrow lands on itself, so the columns are
$\mathbf{e}_1, \dots, \mathbf{e}_n$: ones on the diagonal, zeros elsewhere. $I\mathbf{x} = \mathbf{x}$
and $MI = IM = M$. It is the "multiply by 1" of matrix land, and the starting frame of the
visualization above.

**The inverse $M^{-1}$** — the undo machine: $M^{-1}M = I$. By the ponder you just did, it exists
*only* when $M$ merged no inputs — when nothing was crushed. And undoing a chain reverses the order,
for the same reason you take off shoes before socks:

$$(AB)^{-1} = B^{-1}A^{-1}$$

**The transpose $M^{\mathsf{T}}$** — flip the cabinet across its diagonal so rows become columns
(an $m \times n$ matrix becomes $n \times m$). It also reverses order:
$(AB)^{\mathsf{T}} = B^{\mathsf{T}}A^{\mathsf{T}}$. Its most famous job: you met the attention score
$\mathbf{q}\cdot\mathbf{k}$ in lesson 1.1; the product $QK^{\mathsf{T}}$ computes *every query
dotted with every key*, all at once, as one matrix multiplication.

## Shape bookkeeping inside a transformer

Transformers process all tokens simultaneously by stacking their vectors as the **rows** of one
matrix. For $n$ tokens with model width $d_{\text{model}}$:

$$X \in \mathbb{R}^{n \times d_{\text{model}}} \qquad \text{(one row per token)}$$

Weights multiply on the right, and the shape rule does the bookkeeping. A feed-forward up-projection
$W_1 \in \mathbb{R}^{4096 \times 11008}$ gives

$$XW_1: \quad (n \times 4096)(4096 \times 11008) \longrightarrow (n \times 11008)$$

— every token's row pushed through the *same* machine, independently and in parallel. That is why
sequence length and batch size can vary freely while the weights stay fixed. Attention is shape
bookkeeping too: with $Q, K \in \mathbb{R}^{n \times d_k}$,

$$QK^{\mathsf{T}}: \quad (n \times d_k)(d_k \times n) \longrightarrow (n \times n)$$

— the famous $n \times n$ attention matrix, one agreement score per pair of tokens, and the exact
reason vanilla attention costs $O(n^2)$ in sequence length. When a researcher opens unfamiliar model
code, the first pass is always this: *do the shapes chain?*
`,
    },
    {
      type: 'example',
      title: md`auditing Llama-7B with nothing but multiplication`,
      md: md`
A weight matrix of shape $a \times b$ holds exactly $a \cdot b$ learnable numbers — where each of
$b$ basis arrows lands, times $a$ coordinates per landing spot. That one fact lets you audit a
model's entire size from its config file. Llama-7B: $d_{\text{model}} = 4096$,
$d_{\text{ff}} = 11008$, 32 layers, vocabulary 32{,}000.

**Feed-forward layers.** One projection matrix holds

$$4096 \times 11008 = 45{,}088{,}768 \text{ numbers.}$$

Llama's SwiGLU block uses *three* such matrices (up, gate, down):

$$3 \times 45{,}088{,}768 = 135{,}266{,}304 \approx 135\text{M per layer}, \qquad
32 \times 135\text{M} \approx 4.33\text{B total.}$$

**Attention layers.** Four projection machines per layer ($W_Q, W_K, W_V, W_O$), each
$4096 \times 4096$:

$$4 \times 4096^2 = 67{,}108{,}864 \approx 67\text{M per layer}, \qquad
32 \times 67\text{M} \approx 2.15\text{B total.}$$

**Embeddings.** A lookup table in and a projection out: $2 \times 32{,}000 \times 4096 \approx 0.26\text{B}$.

**Grand total:** $4.33 + 2.15 + 0.26 \approx 6.7$ billion — the "7B." You have just accounted for a
frontier-class model's entire parameter budget with grade-school multiplication, and found that it
is, quite literally, a pile of matrices: roughly two-thirds feed-forward machines, one-third
attention machines, plus a dictionary.
`,
    },
    {
      type: 'text',
      md: md`
## The crush detector: one number for volume

The ponder left us wanting an alarm — a number that rats out flattening machines. Here is the
natural candidate. Watch what a machine does to the **unit square** (in 2D; the unit cube in 3D).
The square's corners are recipes of $\mathbf{e}_1$ and $\mathbf{e}_2$, so the machine carries it to
the parallelogram whose sides are the columns $\mathbf{c}_1, \mathbf{c}_2$. And because linearity
treats every little cell of the grid identically, *every* region's area gets scaled by the same
factor — the area of that one parallelogram. That factor is the **determinant**. For
$M = \begin{bmatrix} a & b \\ c & d \end{bmatrix}$, a little triangle-chopping gives

$$\det(M) = ad - bc$$

Don't take the formula on faith — calibrate it against machines we already understand:

- **Scale** $\begin{bmatrix} 2 & 0 \\ 0 & 3 \end{bmatrix}$: $\det = 6$. The square becomes a
  2-by-3 rectangle. Area 6. Checks.
- **Rotation** $\begin{bmatrix} 0 & -1 \\ 1 & 0 \end{bmatrix}$: $\det = (0)(0) - (-1)(1) = 1$.
  Rigid — it spins, never squashes. Checks.
- **Shear** $\begin{bmatrix} 1 & 1 \\ 0 & 1 \end{bmatrix}$: $\det = 1$. The square leans into a
  parallelogram — same base, same height, so *same area*, even though the shape distorts. Surprising
  but true; verify it in the visualization.
- **The squash** $P = \begin{bmatrix} 1 & 0 \\ 0 & 0 \end{bmatrix}$: $\det = 0$. The square is
  flattened to a line segment. Zero area. **Alarm.**

So the detector works: $\det(M) = 0$ *exactly* when some direction is crushed to nothing, exactly
when inputs collide, exactly when no inverse exists, exactly when information dies. A negative
determinant means a mirror is hiding inside the machine (orientation flips) — the volume factor is
$|\det|$. In $n$ dimensions the same number scales $n$-dimensional volume.

**Rank: counting the survivors.** The rank of a machine is the number of dimensions that survive
the trip. A full-rank $n \times n$ machine keeps all $n$ and has $\det \neq 0$; the visualization's
rank-2 projection keeps 2 of 3, hence $\det = 0$.

> **Why you should care:** rank collapse is a real transformer pathology, not algebra trivia. A
> stack of attention-only layers — no residual connections, no MLPs — provably drives token
> representations toward rank *one*: every token collapses toward the same vector, and the model can
> no longer tell its inputs apart. Residual streams and feed-forward layers are the anti-crush
> plumbing that keeps representational rank — that is, information — alive. When you meet residual
> connections in lesson 2.5, remember the flattened cube.
`,
    },
    {
      type: 'ponder',
      question: md`Here is a fact: $\det(AB) = \det(A)\cdot\det(B)$, always. You could verify it by
grinding out the $2 \times 2$ algebra — expand both sides and watch eight terms cancel. But that
proves it without *explaining* it. Feynman's standard: why must this be true, obviously, before any
computation at all?`,
      answer: md`Read $AB$ as a pipeline and think about what happens to volume. Machine $B$ scales
every volume by $\det(B)$. Then machine $A$ scales every volume by $\det(A)$. So the pipeline scales
volume by $\det(A)\cdot\det(B)$. But the pipeline *is* the single machine $AB$, which scales volume
by $\det(AB)$. Same machine, same number:

$$\det(AB) = \det(A)\cdot\det(B)$$

No algebra — the identity is just "scaling factors multiply along a pipeline." And two corollaries
fall out free of charge. First, $\det(A)\det(A^{-1}) = \det(I) = 1$: the undo machine must un-scale,
so $\det(A^{-1}) = 1/\det(A)$ — and now you see *algebraically* why a $\det = 0$ machine has no
inverse: nothing times $0$ makes $1$. Second, if $\det(B) = 0$ then $\det(AB) = 0$ no matter how
magnificent $A$ is: once space has been flattened, no subsequent machine can un-flatten it. The
equation is the ponder from earlier — *information destruction is forever* — wearing algebraic
clothes.`,
    },
    {
      type: 'text',
      md: md`
## The machine's own directions

Take the symmetric stretch machine $M = \begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}$ from the
visualization and just *feed it arrows*, watching what comes out.

Feed $(1,0)$: out comes $(2,1)$ — turned and stretched. Feed $(0,1)$: out comes $(1,2)$ — turned
the other way. Ordinary behavior. Now feed $(1,1)$:

$$M\begin{bmatrix}1\\1\end{bmatrix} = \begin{bmatrix}2+1\\1+2\end{bmatrix} = \begin{bmatrix}3\\3\end{bmatrix} = 3\begin{bmatrix}1\\1\end{bmatrix}$$

*Parallel.* Stretched by exactly 3, not turned by a single degree. And feed $(1,-1)$:

$$M\begin{bmatrix}1\\-1\end{bmatrix} = \begin{bmatrix}2-1\\1-2\end{bmatrix} = \begin{bmatrix}1\\-1\end{bmatrix}$$

Untouched entirely. These two directions are the machine's **own directions** — its *eigenvectors*
(German *eigen* = "own"), with stretch factors — *eigenvalues* — of $3$ and $1$:

$$M\mathbf{v} = \lambda\,\mathbf{v}$$

Along its own directions, a complicated machine is nothing but multiplication by a number. They are
the arrows in the visualization that never turn during the whole animation.

**Hunting them systematically.** We got lucky guessing. Here's the method, and it reuses the crush
detector beautifully. $M\mathbf{v} = \lambda\mathbf{v}$ rearranges to
$(M - \lambda I)\mathbf{v} = \mathbf{0}$ with $\mathbf{v} \neq \mathbf{0}$ — the machine
$M - \lambda I$ crushes an entire direction to nothing. But we *have* a crush detector:

$$\det(M - \lambda I) = 0$$

Work it for our $M$: $\det\begin{bmatrix} 2-\lambda & 1 \\ 1 & 2-\lambda \end{bmatrix}
= (2-\lambda)^2 - 1 = 0$, so $2 - \lambda = \pm 1$, giving $\lambda = 3$ or $\lambda = 1$. Then find
each crushed direction: for $\lambda = 3$, $(M - 3I)\mathbf{v} = \mathbf{0}$ forces $v_1 = v_2$ —
direction $(1,1)$; for $\lambda = 1$ it forces $v_1 = -v_2$ — direction $(1,-1)$. Exactly our
guesses. (For symmetric machines the own directions always come out perpendicular — file that away;
it is the engine of PCA.)

**Why researchers care: repetition.** Apply $M$ over and over: $M^k\mathbf{v} = \lambda^k\mathbf{v}$.
Split any input along the machine's own directions, and each component grows or dies *geometrically*
— after 20 applications, a $\lambda = 3$ component has grown by $3^{20} \approx 3.5$ billion while a
$\lambda = 0.5$ component has shrunk to about a millionth. The largest $|\lambda|$ takes over
everything.

> **Why you should care:** backpropagation through a deep network multiplies by roughly the same
> matrices layer after layer — repetition. Whether the gradient signal explodes or vanishes is
> governed by the top eigenvalue (the *spectral radius*), which is why exploding/vanishing gradients
> exist, why initialization schemes are tuned the way they are, and why tricks like spectral
> normalization work. And PCA — the standard tool for peeking inside embedding spaces — is nothing
> but the eigenvectors of a covariance matrix.
`,
    },
    {
      type: 'ponder',
      question: md`Try the eigenvector hunt on the rotation $R = \begin{bmatrix} 0 & -1 \\ 1 & 0 \end{bmatrix}$
(every arrow turns $90°$). Geometrically first: can *any* direction come out parallel to itself?
Then run the machinery: $\det(R - \lambda I) = 0$. What do you get — and what changes if you rotate
in 3D instead?`,
      answer: md`Geometrically: a $90°$ rotation turns *every* direction, so no arrow comes out
parallel to itself — there is no real eigenvector at all. The algebra agrees, with a wink:
$\det(R - \lambda I) = \lambda^2 + 1 = 0$ has no real solution; the eigenvalues are $\lambda = \pm i$,
*imaginary*. A rotation's "stretch factors" are complex numbers — a first glimpse of the deep
marriage between rotation and $i$ (multiplying by $i$ *is* rotating the complex plane by $90°$).

But move to 3D and something lovely happens: every rotation of 3D space, however messy the tumble,
must leave one direction unmoved — the **axis**. That is a genuine eigenvector with $\lambda = 1$,
and it must exist (Euler proved it). Spin any object however you like: it is always spinning *about
some axis*. The eigenvector isn't a formality — you can point at it.`,
    },
    {
      type: 'text',
      md: md`
## Every machine is rotate, stretch, rotate — and why LoRA works

Eigen-analysis wants square (ideally symmetric) machines. But there is a factorization no matrix
escapes, not even rectangular ones — the **singular value decomposition**:

$$M = U\,\Sigma\,V^{\mathsf{T}} \qquad \text{— rotate, stretch along perpendicular axes, rotate again.}$$

$\Sigma$ is diagonal and holds the **singular values** $\sigma_1 \geq \sigma_2 \geq \cdots \geq 0$:
how much action the machine has in each of its principal directions. Read it as a claim with a
punchline: *every* linear machine, no matter how gnarly its entries, is secretly just an
axis-aligned stretch wearing two rotations.

Now the observation with a billion-dollar consequence. Suppose only $r$ of the singular values are
meaningfully large — the machine's action mostly *lives in $r$ directions*. Then $M$ is well
approximated by a rank-$r$ machine, and a rank-$r$ machine can be written **thin times thin**:

$$M \approx B\,A, \qquad B: m \times r, \quad A: r \times n \qquad \text{— } (m+n)\,r \text{ numbers instead of } m \cdot n.$$

Count it for a Llama-sized machine. Full $4096 \times 4096$: $16{,}777{,}216$ numbers. Rank-16
version: $4096 \times 16 + 16 \times 4096 = 131{,}072$ numbers — **0.78% of the original, a 128-fold
shrink**, in exchange for pretending the machine only acts in 16 directions.

> **Why you should care:** this is the entire idea of **LoRA** finetuning. Empirically, the *update*
> $\Delta W$ needed to adapt a pretrained model to a new task is approximately low-rank — teaching an
> old machine a new trick mostly means adjusting its action in a few directions, not rebuilding all
> 4096. So LoRA freezes $W$ and learns $\Delta W = BA$ with $r = 8$ or $16$: about a thousandth of
> the parameters, which is why you can finetune a 7B model on one consumer GPU. A top-tier research
> technique, and it is nothing more than the geometry on this page.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The puzzle, resolved:** a linear machine respects recipes, so it is pinned down by where the
   basis arrows land — nine numbers steer infinity, and column $i$ is the fate of arrow $i$. Every
   weight matrix you will ever read is this filing cabinet.
2. **The product $M\mathbf{x}$, discovered:** a weighted mix of the columns — equivalently one
   row-dot-product per output coordinate. Attention heads and feed-forward layers execute exactly
   this, trillions of times per second.
3. **Matrix multiplication as composition:** $AB$ means "do $B$, then $A$"; the rows-times-columns
   formula, the shape rule $(m \times n)(n \times p) \to (m \times p)$, and $AB \neq BA$ are all
   *forced* by that meaning. A token's forward pass through Llama-7B is a few hundred of these,
   chained right to left.
4. **The collapse theorem:** stacked linear machines merge into one matrix, so nonlinearities are
   the firewalls that make depth mean anything — the reason a GELU sits inside every feed-forward
   block.
5. **Shape bookkeeping and parameter counting:** $X$ is $n \times d_{\text{model}}$, weights multiply
   on the right, and multiplying dimensions audited all $6.7$ billion parameters of Llama-7B.
6. **The determinant:** the volume knob; $\det = 0$ means a crushed direction, collided inputs, dead
   information — and determinants multiply along pipelines, so destruction is permanent. In
   transformers: rank collapse, and why residual streams exist.
7. **Eigenvectors:** the machine's own directions, where it is just multiplication by $\lambda$;
   under repetition $\lambda^k$ rules everything — the root of exploding/vanishing gradients and of
   PCA.
8. **SVD and low rank:** every machine is rotate-stretch-rotate, and a machine that lives in few
   directions is thin-times-thin — LoRA's $16{,}777{,}216 \to 131{,}072$.

Next, lesson 1.3: matrices tell you what a layer *does*; calculus tells you how to *nudge* its
millions of numbers so it does better. And the punchline waiting there: the derivative of a machine
is itself a linear machine — so you have already met the main character.
`,
    },
  ],
  questions: [
    {
      id: 'm1-l2-q1',
      kind: 'mcq',
      prompt: md`Let $M$ be an $m \times n$ matrix with columns $\mathbf{c}_1, \dots, \mathbf{c}_n$,
and let $\mathbf{x} = (x_1, \dots, x_n)$. Which statement correctly describes $M\mathbf{x}$?`,
      options: [
        md`A vector whose $i$-th entry is the dot product of the $i$-th **column** of $M$ with $\mathbf{x}$`,
        md`The weighted mix $x_1\mathbf{c}_1 + x_2\mathbf{c}_2 + \cdots + x_n\mathbf{c}_n$ of the **columns**, with the entries of $\mathbf{x}$ as weights`,
        md`The element-wise product of the diagonal of $M$ with $\mathbf{x}$`,
        md`It depends on the entries of $M$ — for large enough entries the map becomes nonlinear`,
      ],
      answer: 1,
      explain: md`Derive it, don't recall it: $\mathbf{x} = x_1\mathbf{e}_1 + \cdots + x_n\mathbf{e}_n$
is a recipe of basis arrows, and linearity forces
$M\mathbf{x} = x_1(M\mathbf{e}_1) + \cdots + x_n(M\mathbf{e}_n) = x_1\mathbf{c}_1 + \cdots + x_n\mathbf{c}_n$.
The first option is the classic trap because entries of $M\mathbf{x}$ *are* dot products — but with
**rows**, not columns; mixing those up is the single most common matrix slip, and the cure is
holding both pictures at once (mix of columns, dots with rows). The diagonal option tempts anyone
picturing matrices as element-wise scalers — only diagonal matrices act that way; a general machine
mixes coordinates. And no entries, however large, ever break linearity: the entries choose *which*
linear machine you have, never *whether* it is linear.`,
    },
    {
      id: 'm1-l2-q2',
      kind: 'numeric',
      prompt: md`By hand: for
$$A = \begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}, \qquad B = \begin{bmatrix} 0 & 1 \\ 5 & 6 \end{bmatrix},$$
compute the product $AB$ and enter its entry in **row 2, column 1**. (Row of $A$, dotted with column
of $B$ — say out loud which row and which column before you multiply.)`,
      answer: 20,
      tolerance: 0.001,
      explain: md`$(AB)_{21} = (\text{row 2 of } A)\cdot(\text{column 1 of } B) = (3,4)\cdot(0,5) = 0 + 20 = 20$.
The full product is $AB = \begin{bmatrix} 10 & 13 \\ 20 & 27 \end{bmatrix}$. Cross-check with the
machine picture: column 1 of $AB$ should be $A$ applied to column 1 of $B$, and indeed
$A(0,5) = 0\,(1,3) + 5\,(2,4) = (10,20)$ — the first column. The entry formula and "do one machine,
then the other" are the same fact.`,
    },
    {
      id: 'm1-l2-q3',
      kind: 'mcq',
      prompt: md`$R$ rotates the plane $90°$ counter-clockwise; $P$ squashes everything onto the
x-axis. Which product sends the vector $(1, 0)$ to the zero vector?`,
      options: [
        md`$RP$ — in the product $RP$, the machine $R$ is written first, so it acts first`,
        md`$PR$ — products act right to left: $R$ first stands $(1,0)$ upright, then $P$ flattens it to nothing`,
        md`Both — the same two machines are involved either way, so the order cannot change the outcome`,
        md`Neither — since neither machine alone sends $(1,0)$ to zero, no chain of the two can`,
      ],
      answer: 1,
      explain: md`$(PR)\mathbf{x} = P(R\mathbf{x})$: the machine written on the *right* acts first,
because matrix products inherit their order from function composition $f(g(x))$. So in $PR$, the
rotation goes first — $(1,0) \to (0,1)$ — and the squash then annihilates the upright arrow. In
$RP$, the squash hits $(1,0)$ first, and an arrow already lying on the floor is unharmed; it then
rotates up to $(0,1)$, very much alive. The left-to-right reading is the trap nearly everyone falls
into once. "Both" is the instinct that order can't matter — the exact instinct this lesson's
book-flipping experiment exists to kill. And "neither" fails for a subtle, important reason: a
machine that kills nothing can still *deliver a survivor into another machine's kill zone*. That is
what "order matters" really means.`,
    },
    {
      id: 'm1-l2-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Starting from only the two linearity rules —
$M(\mathbf{x} + \mathbf{y}) = M\mathbf{x} + M\mathbf{y}$ and $M(c\mathbf{x}) = c\,M\mathbf{x}$ —
derive on paper: (a) that the machine is completely determined by where the basis arrows
$\mathbf{e}_1, \dots, \mathbf{e}_n$ land, and (b) the formula
$M\mathbf{x} = x_1\mathbf{c}_1 + \cdots + x_n\mathbf{c}_n$ where $\mathbf{c}_i = M\mathbf{e}_i$.
Then answer in one sentence: why does this mean a $3 \times 3$ matrix needs *exactly* nine numbers
to steer all of 3D space?`,
      rubric: md`**Step 1 — every vector is a recipe.** Write
$\mathbf{x} = x_1\mathbf{e}_1 + x_2\mathbf{e}_2 + \cdots + x_n\mathbf{e}_n$ (each coordinate says
how far to walk along each basis arrow).

**Step 2 — apply the addition rule** repeatedly to split the sum:
$M\mathbf{x} = M(x_1\mathbf{e}_1) + M(x_2\mathbf{e}_2) + \cdots + M(x_n\mathbf{e}_n)$.

**Step 3 — apply the scaling rule** to each term to pull the weights out:
$M(x_i\mathbf{e}_i) = x_i\,(M\mathbf{e}_i)$, giving
$M\mathbf{x} = x_1(M\mathbf{e}_1) + \cdots + x_n(M\mathbf{e}_n)$.

**Step 4 — name the landing spots** $\mathbf{c}_i := M\mathbf{e}_i$ and conclude
$M\mathbf{x} = x_1\mathbf{c}_1 + \cdots + x_n\mathbf{c}_n$: the output of *any* input is forced by
the $n$ landing spots — which is (a) — and it takes the weighted-mix form — which is (b).

**The sentence:** in 3D there are three basis arrows, each landing spot takes three coordinates, so
$3 \times 3 = 9$ numbers determine the machine's answer for every one of infinitely many points —
the numbers store the *generators* of the behavior, not the behavior itself.

Full credit only for a derivation that visibly *uses* each rule where it is needed (rule one in step
2, rule two in step 3) — quoting "columns are where basis vectors land" from memory is exactly what
this question is not about.`,
    },
    {
      id: 'm1-l2-q5',
      kind: 'numeric',
      prompt: md`Compute $\det \begin{bmatrix} 4 & 2 \\ 1 & 3 \end{bmatrix}$ by hand. Your answer is
the factor by which this machine scales the area of *every* region of the plane — including the unit
square in the visualization.`,
      answer: 10,
      tolerance: 0.001,
      explain: md`$ad - bc = (4)(3) - (2)(1) = 12 - 2 = 10$. The unit square is carried onto the
parallelogram with sides $(4,1)$ and $(2,3)$, which has area exactly 10 — and by linearity every
other region scales by the same factor. Since $10 \neq 0$, nothing is crushed: the machine merges no
inputs and an inverse exists (which must scale areas by $1/10$, since scale factors multiply to
$\det(I) = 1$).`,
    },
    {
      id: 'm1-l2-q6',
      kind: 'mcq',
      prompt: md`A square weight matrix $W$ has $\det(W) = 0$ exactly. Which statement *must* be true?`,
      options: [
        md`All entries of $W$ are zero`,
        md`$W$ flattens space onto a lower-dimensional subspace: distinct inputs collide onto the same output, and no machine of any kind can recover them`,
        md`$W$ flips the orientation of space — a reflection is hiding inside`,
        md`$W$ shrinks volumes drastically, but a sufficiently precise inverse can still recover the input`,
      ],
      answer: 1,
      explain: md`$|\det|$ is the volume scale factor, so $\det = 0$ means the unit cube comes out
with zero volume: at least one whole direction is crushed, the rank drops, and infinitely many
inputs land on each output. Collided inputs are *gone* — recovery is impossible in principle, not
just in practice. The last option is the deepest trap: it treats $\det = 0$ as extreme compression,
but compression (tiny nonzero det) is invertible — you just divide the tiny factor back out; zero is
different in *kind*, not degree, because it is collision, not compression. "All entries zero" tempts
because zero det sounds like a zero matrix — but two identical rows give $\det = 0$ with every entry
nonzero. Orientation flips are *negative* determinant, not zero.`,
    },
    {
      id: 'm1-l2-q7',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old** (write it out — this is the Feynman technique, and
it is the test of whether you own the idea): explain (1) what a matrix *does* — not what it looks
like, what it does — and (2) why "multiplying two matrices" means doing one machine after the other,
and why doing them in the other order can end up somewhere completely different. Use physical,
everyday pictures the kid can act out. Every technical word you use, you must first explain in kid
words.`,
      rubric: md`There is no single right script; grade the *teaching*. A "nailed it" answer must:

1. **Make the machine physical.** Something like: a matrix is a machine that grabs *every point* of
   a picture (or the whole room) and moves them all at once by one consistent rule — spin the whole
   photo, stretch it sideways, squash it flat onto a line. Bonus insight worth extra credit: the
   machine only needs to remember what it does to a couple of special arrows, because every other
   point just follows the recipe.
2. **Make multiplication a chain.** Feeding one machine's output into a second machine is itself one
   big combined machine — "multiplying the matrices" is just working out the settings of that one
   combined machine so you can do both jobs in a single step.
3. **Make order concrete and act-out-able.** For example: spin your photo a quarter turn then
   squash it flat, versus squash it flat then spin — an arrow lying on the floor survives the squash
   in one order and gets flattened to nothing in the other. Or the book on the table: rotate then
   flip lands differently than flip then rotate. The kid must be able to physically perform the two
   orders and *see* different endings.
4. **Contain no unexplained jargon.** "Matrix," "vector," "linear," "transformation," "composition"
   — each used only after a kid-words explanation, or not at all. Unexplained jargon caps the grade
   at partial: jargon-hiding is exactly the failure mode this exercise exists to catch.`,
    },
    {
      id: 'm1-l2-q8',
      kind: 'numeric',
      prompt: md`Check by hand that $\mathbf{v} = (1, 1)$ is an eigenvector of
$M = \begin{bmatrix} 5 & 2 \\ 2 & 5 \end{bmatrix}$ — compute $M\mathbf{v}$ and confirm it comes out
parallel to $\mathbf{v}$. Enter its eigenvalue $\lambda$.`,
      answer: 7,
      tolerance: 0.001,
      explain: md`$M(1,1) = (5 + 2,\; 2 + 5) = (7, 7) = 7\,(1,1)$: out parallel, stretched by
$\lambda = 7$, not turned a degree — that is what "the machine's own direction" means. For the full
picture, feed the perpendicular direction too: $M(1,-1) = (5-2,\; 2-5) = (3,-3) = 3\,(1,-1)$, so the
other eigenvalue is 3. A symmetric machine's own directions are always perpendicular like this —
which is why PCA (eigenvectors of a symmetric covariance matrix) yields perpendicular principal
axes.`,
    },
    {
      id: 'm1-l2-q9',
      kind: 'mcq',
      prompt: md`You stack 100 linear layers with no nonlinearities between them:
$\mathbf{y} = W_{100}\,W_{99} \cdots W_1\,\mathbf{x}$. The expressive power of this network is:`,
      options: [
        md`Far more than one layer — 100 layers of parameters must buy 100 layers of expressiveness`,
        md`No more than a single linear layer: the whole stack multiplies out to one matrix before any input ever arrives`,
        md`More than one layer, but only if the layers have different shapes from each other`,
        md`Impossible to say without knowing the entries of the matrices`,
      ],
      answer: 1,
      explain: md`Composition of lawful machines is a lawful machine: $W_{100}\cdots W_1$ collapses
into a single matrix you could precompute and ship — the depth is an illusion. The first option is
the natural trap: it equates parameter count with expressiveness, but 100 matrices' worth of
parameters here can only ever express what one matrix expresses. The shapes option tempts because
shapes *do* matter a little — a narrow intermediate layer bottlenecks the product's rank — but a
rank-limited single matrix is still a single matrix, so the collapse conclusion stands. The entries
never matter for this question: linearity is structural. This is exactly why a GELU or SwiGLU sits
between every pair of matrix multiplications in a transformer — nonlinear firewalls are the only
thing that makes 32 layers mean more than 1.`,
    },
    {
      id: 'm1-l2-q10',
      kind: 'numeric',
      prompt: md`**Fermi estimate (paper first, calculator last):** every layer of Llama-7B carries
four attention projection machines — $W_Q, W_K, W_V, W_O$ — each of shape $4096 \times 4096$.
Roughly how many parameters is that **per layer, in millions**? (Generous tolerance; the reflex of
sizing a model in your head before running any code is the point.)`,
      answer: 67,
      tolerance: 10,
      explain: md`$4096^2 = 16{,}777{,}216 \approx 16.8$M per machine, and four machines give
$4 \times 16.8\text{M} \approx 67$M per layer (exact: $67{,}108{,}864$). Across 32 layers that is
$\approx 2.15$B — nearly a third of the whole model — and every one of those numbers is just "where
does basis arrow $i$ land," recorded 4096 arrows at a time, four machines per layer. Estimates like
this catch shape bugs and budget mistakes before a single GPU-hour is burned.`,
    },
    {
      id: 'm1-l2-q11',
      kind: 'written',
      prompt: md`**Synthesis:** write a short paragraph explaining to a smart friend who knows no
machine learning why a 7-billion-parameter language model is accurately described as "mostly a pile
of matrices." Your paragraph must use the words *shape*, *composition*, *parameters*, and
*nonlinearity* — naturally, not as a checklist — and must include at least one concrete parameter
count computed as an explicit product of dimensions.`,
      rubric: md`A strong answer hits these beats, in plain language:

1. **Layers are matrix machines.** The text being processed sits as rows of a matrix $X$ of
   **shape** $n \times d_{\text{model}}$ (one row per token), and each layer multiplies it by learned
   weight matrices whose shapes must chain: $(m \times n)(n \times p) \to (m \times p)$.
2. **Parameters live inside the matrices, and counting them is multiplying dimensions** — with an
   explicit product, e.g. one Llama-7B feed-forward matrix is
   $4096 \times 11008 = 45{,}088{,}768$ numbers, and three per layer across 32 layers is already
   $\approx 4.3$B of the 6.7B **parameters** (or the attention version:
   $4 \times 4096 \times 4096 \approx 67$M per layer).
3. **Depth is composition** — running a token through the model is applying machine after machine,
   right to left. But composed *linear* machines collapse into a single matrix, so a
   **nonlinearity** between layers is the only thing that makes 32 layers more expressive than one.
4. **The punchline lands:** almost every one of the 7 billion numbers is an entry of some weight
   matrix — the model *is* the pile, plus cheap nonlinear glue.

Grade "nailed it" only if all four required words appear doing real work, the parameter count is an
explicit product of dimensions, and a person with no ML background could follow every sentence.`,
    },
    {
      id: 'm1-l2-q12',
      kind: 'written',
      prompt: md`**Eigen-thinking meets LoRA.** LoRA finetunes a model by freezing each big weight
matrix $W$ and learning a small update $\Delta W = BA$, with $B$ of shape $4096 \times 16$ and $A$
of shape $16 \times 4096$. On paper: (a) explain what it means, in machine language, for a
$4096 \times 4096$ machine to have rank 16 — where do all its outputs live? (b) Show *why* the
product $BA$ can never have rank above 16, by following an input through the pipeline. (c) Count
parameters: full $\Delta W$ versus the two factors, and the savings ratio. (d) Using the SVD idea —
singular values ranking the directions of a machine's action — explain why "the finetuning update
lives in a few directions" is a plausible claim about adapting a pretrained model.`,
      rubric: md`**(a) Rank 16 in machine language:** every output is a mix of at most 16
independent directions — the machine flattens 4096-dimensional space onto (at most) a 16-dimensional
subspace. Compared to a full-rank machine, 4080 potential output directions are simply never used.

**(b) Why rank at most 16 — follow the pipeline:** $\Delta W\mathbf{x} = B(A\mathbf{x})$. First
$A$ crushes the 4096-dimensional input down to just 16 numbers; then the output is a weighted mix of
$B$'s 16 columns. A mix of 16 arrows can never leave the (at most) 16-dimensional subspace they
span — so no input, ever, produces an output outside it. The bottleneck *is* the rank bound.

**(c) The count:** full $\Delta W$: $4096 \times 4096 = 16{,}777{,}216$ numbers. Factors:
$4096 \times 16 + 16 \times 4096 = 65{,}536 + 65{,}536 = 131{,}072$ numbers. Ratio:
$16{,}777{,}216 / 131{,}072 = 128$ — a 128-fold saving, about 0.78% of the original, per matrix.

**(d) Why low rank is plausible:** the SVD writes any machine as rotate-stretch-rotate with
singular values $\sigma_1 \geq \sigma_2 \geq \cdots$ ranking how much action lives in each
direction; keeping the top $r$ directions gives the best rank-$r$ approximation. Finetuning adapts
an already-capable model to a comparatively narrow job — a style, a format, a domain — so the
*change* required plausibly concentrates its action in a few directions rather than rebuilding all
4096; empirically, measured $\Delta W$ spectra confirm the tail of singular values is small. Full
credit requires the bottleneck argument in (b) — not just "thin matrices are small" — the exact
numbers in (c), and (d) connecting to singular values rather than hand-waving "updates are simple."`,
    },
  ],
}
