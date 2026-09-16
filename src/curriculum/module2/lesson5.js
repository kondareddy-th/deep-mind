// Module 2, Lesson 5 — The transformer block: residual stream, norms, FFN (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm2-l5',
  title: '2.5 The block — residual stream, norms, and the FFN',
  subtitle: md`Attention mixes but cannot invent, and hundred-layer chains starve their own
gradients. Two open wounds, one small block design that heals both — and by the end of this lesson
its shape will feel forced, not chosen.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle: two unpaid debts

This course owes you two answers, and today it pays.

**Debt 1 — from lesson 2.2.** The final ponder there proved something uncomfortable about the
machine you so carefully invented. Attention's output is $\sum_j w_{ij}\mathbf{v}_j$ with weights
that are positive and sum to $1$ — a **convex combination**, forever trapped inside the shrink-wrap
of the value vectors. Attention routes and blends what tokens already offer; it physically cannot
step outside its ingredients. It *mixes*; it does not *invent*. But a model that only reshuffles its
inputs can never compute anything genuinely new — somewhere in the architecture there must be a part
that transforms, thresholds, creates. Where is it?

**Debt 2 — from lesson 1.3.** Gradients reaching layer 1 of a deep stack are a *product* of
per-layer sensitivities, and products of many numbers are exponentially treacherous:
$0.9^{100} \approx 0.0000266$. A hundred stacked layers of perfectly innocent-looking couplings and
the early layers receive twenty-seven millionths of the training signal — they starve, and no
learning rate can feed them. Yet Llama-7B stacks $32$ blocks ($64$ sublayers), and GPT-3 stacks
$96$. Someone found a way to make depth survivable. What was it?

Here is the surprise: **one block design pays both debts at once**, plus a third debt you didn't
know you were owed. The transformer block is not a menu of choices some architect happened to like.
Each piece exists because leaving it out produces a specific, named catastrophe — and by the end of
this lesson you'll be able to name all of them.

## The residual stream: never replace, always add

Rule number one of the block, and it costs a single plus sign. No sublayer ever computes
$f(\mathbf{x})$ and hands *that* forward. Every sublayer computes

$$\mathbf{x}_{\text{new}} = \mathbf{x} + f(\mathbf{x})$$

The input flows through untouched, and the layer's entire contribution is an *added correction*.
Lesson 1.3 promised that this little $+\,\mathbf{x}$ would become the load-bearing wall of Module 2;
time to cash the promise in. Differentiate the scalar version:

$$\frac{d}{dx}\big[\,x + f(x)\,\big] = 1 + f'(x)$$

That leading $1$ is the whole story. Chain a hundred of these blocks and the gradient reaching the
bottom is $\prod_l (1 + f_l')$ — and multiplying that product out, one of its terms is
$1 \times 1 \times \cdots \times 1 = 1$: a direct, toll-free highway from the loss to the very
first layer, present *no matter what the layers' own sensitivities are doing*. The branches $f$ are
free to compute aggressively (sensitivities drifting all over); the identity route carries the
training signal past them regardless. Debt 2: paid.

But there's a second gift hiding in the same plus sign, and it's about what's *easy to learn*.
Ask: what must a layer do to be harmless — to pass its input through unchanged? For a residual
layer, "do nothing" means $f \approx 0$: push the branch weights toward zero, done. And near zero
is exactly where initialization *starts* the weights — a fresh residual network is born as
approximately the identity function and learns to depart from it, gently, where departure pays.
Now ask the same question of a raw layer $\mathbf{x} \to W\mathbf{x}$. To do nothing, $W$ must
*become the identity matrix*: $4096$ ones placed exactly on the diagonal of a
$16{,}777{,}216$-entry filing cabinet, every off-diagonal entry driven to zero, all of it learned
through noisy gradients. The raw layer must fight for years to achieve what the residual layer gets
for free. **The easiest thing for a residual layer to learn is nothing** — and "nothing" being cheap
is what lets depth be safe.

## The stream as a bulletin board

Here is a picture worth carrying for the rest of the course — flagged honestly as a *research lens*,
the working mental model of interpretability researchers rather than a proven theorem (Module 6
takes it apart properly).

Each token owns a $4096$-number vector that flows down through all $32$ blocks. Think of it as that
token's **bulletin board** — a shared workspace that every sublayer reads from and posts to, but
never wipes. The attention sublayer reads the board, goes and looks at *other tokens'* boards, and
posts a note summarizing what it gathered: "context says river, not money." The FFN sublayer reads
only *this token's own* board and posts a note it computed from what was already there: a
conclusion, a recalled fact, a transformed feature. Thirty-two blocks means sixty-four posts
accumulate, early notes still legible under later ones, and at the very end the unembedding reads
the final state of the board to score every possible next token. The residual connection is what
makes the board a board: additions accumulate; nothing is ever erased.
`,
    },
    {
      type: 'ponder',
      question: md`Forget gradients entirely for a moment — suppose backpropagation had no vanishing
problem at all. Make the case that $\mathbf{x} + f(\mathbf{x})$ is *still* the safer design than a
bare $f(\mathbf{x})$. Think about what a useless, untrained, or actively broken layer does to the
signal passing through it, in each design. (A historical hint to chew on: in 2015, a plain 56-layer
network was measured *worse than a 20-layer one on its own training data* — not overfitting,
something stranger. Why would extra layers ever hurt a network at training time?)`,
      answer: md`In the raw design, every layer is a **gate in series**. The signal at the output is
layer 100's transformation of layer 99's transformation of layer 98's... so a single useless layer
anywhere in the chain *replaces* the signal with its own garbage, and everything downstream computes
on garbage. Adding depth adds risk: each new layer is another stage that must be *actively good*
just to avoid being destructive.

In the residual design, a useless layer with $f \approx 0$ adds nothing — and doing nothing does no
damage. The signal sails past on the identity route. Better: a 100-block residual network
*contains* every shallower network inside it (set the extra blocks' branches to zero), so "deeper
can't be worse" stops being a hope and becomes a construction. Depth degrades gracefully.

That 2015 measurement is the famous ResNet observation (He et al.): the plain 56-layer net's
*training* error sat above the 20-layer net's — not overfitting but an **optimization failure**;
the deeper network couldn't even find the shallower solution it provably contained, because finding
it meant learning dozens of near-perfect identity matrices. Residual connections made "the extra
layers can at worst do nothing" true by default, and 152-layer networks promptly trained. So the
plus sign earns its place twice over, by two independent arguments: the gradient highway (lesson
1.3's) and identity-by-default (this one). Great designs are usually overdetermined like this.`,
    },
    {
      type: 'text',
      md: md`
## The thermostat: why the stream needs norms

The bulletin board has a failure mode of its own: it gets *louder*. Every block adds to the stream —
sixty-four posts of multiply-accumulate arithmetic — and lesson 1.2 taught you what repeated matrix
application does to magnitudes: components along the machines' large directions grow geometrically,
components along small directions decay. Nothing pins the scale of the stream at block 30 to the
scale at block 1, so left alone they drift apart — sometimes by orders of magnitude.

Why is drift fatal? Count the victims. The attention softmax saturates: lesson 1.4 showed a score
lead of ten-ish is already a landslide, so if activations swell $10\times$, every attention pattern
collapses to winner-take-all and gradients die. The nonlinearities get pushed into their flat
regions (lesson 1.3: flat means derivative zero means deaf). And lesson 1.6 fought hard to give
every *parameter* a sensible step size — Adam's whole per-knob bookkeeping — only to have the
*activations* smuggle wild scale differences right back in: the same weight matrix faces inputs of
typical size $1$ in one layer and $40$ in another, and no single learning rate serves both.

The fix is a thermostat. Before each sublayer reads the board, **rescale each token's vector to a
standard size**. That's **LayerNorm**: per token, subtract the vector's mean, divide by its standard
deviation, then let learned per-axis gains (and biases) redial the volume. And Llama uses the
stripped-down version, **RMSNorm**, which asks: do we even need the mean-subtraction and the biases?
Measured answer: no. Just divide by the root-mean-square of the entries and apply a learned gain:

$$\text{RMS}(\mathbf{x}) = \sqrt{\frac{1}{d}\sum_{i=1}^{d} x_i^2}
\qquad\qquad
y_i = g_i \cdot \frac{x_i}{\text{RMS}(\mathbf{x})}$$

Same thermostat, fewer moving parts, measurably as good — a very transformer-era story: try
deleting pieces, keep what survives. The parameter bill is comically small: one gain number per
axis, $4096$ per norm, $8192$ per block — about $0.004\%$ of the block's parameters. Delete them
anyway and training falls apart. Cheapest insurance in the building.

**Pre-norm versus post-norm — one honest paragraph.** The 2017 paper put the norm *after* the
addition: $\mathbf{x} \leftarrow \text{Norm}(\mathbf{x} + f(\mathbf{x}))$ — "post-norm." Look at
what that does to our highway: the norm sits *on* the identity route, so every one of the $64$ hops
rescales the through-traffic, and the guaranteed factor-of-$1$ path is gone. Post-norm transformers
train — the original was only 6 layers deep — but deep ones needed delicate learning-rate warmup
(lesson 1.6) and still tipped over. Modern models (GPT-2 onward, Llama included) moved the norm to
the on-ramp: $\mathbf{x} \leftarrow \mathbf{x} + f(\text{Norm}(\mathbf{x}))$ — "pre-norm." The
branch gets clean, standardized inputs; the highway itself runs untouched from embedding to logits.
The honest fine print: pre-norm's stream norm grows steadily as blocks keep adding to it, and a
post-norm model that *does* manage to train sometimes edges pre-norm out on final quality — but a
design that trains reliably beats a design that occasionally trains slightly better, and the field
voted with its checkpoints.
`,
    },
    {
      type: 'example',
      title: md`RMSNorm by hand, twice`,
      md: md`
Take a two-dimensional "board" $\mathbf{x} = (3, 4)$.

**Step 1 — mean of squares:** $\dfrac{3^2 + 4^2}{2} = \dfrac{9 + 16}{2} = 12.5$.

**Step 2 — the RMS:** $\sqrt{12.5} \approx 3.536$.

**Step 3 — divide:** $\mathbf{x}/\text{RMS} \approx (3/3.536,\; 4/3.536) = (0.849,\; 1.131)$.

Check the thermostat did its job: the normalized vector's own RMS is
$\sqrt{(0.849^2 + 1.131^2)/2} = \sqrt{(0.720 + 1.280)/2} = 1$. Whatever came in, what goes out has
typical entry size $1$ — exactly the scale the drunkard's-walk analysis of lesson 1.1 wanted dot
products built from.

**Step 4 — learned gain:** with $\mathbf{g} = (1.5, 0.5)$, the output is
$(1.5 \times 0.849,\; 0.5 \times 1.131) = (1.273,\; 0.566)$. The hard rescale treats all axes
alike; the gain lets training re-amplify the axes that deserve it.

**Now the punchline — run it again on $\mathbf{x} = (30, 40)$**, the same board shouting ten times
louder: mean of squares $= (900 + 1600)/2 = 1250$, RMS $= \sqrt{1250} \approx 35.36$, output
$(30/35.36,\; 40/35.36) = (0.849,\; 1.131)$. *Identical.* RMSNorm erases "how loud" and keeps only
the pattern — which you met in lesson 1.1 as the difference between a vector's length and its
direction. The sublayers downstream get to respond to what the board *says*, never to how loudly
scale-drift happens to be saying it.
`,
    },
    {
      type: 'text',
      md: md`
## The FFN, finally — the part that invents

Debt 1 has waited long enough. The inventing machine is almost anticlimactically simple: two matrix
machines from lesson 1.2 with one nonlinearity pinched between them,

$$\text{FFN}(\mathbf{x}) = W_2\,\phi(W_1\,\mathbf{x})$$

expanding the $d$-dimensional board up to roughly $4d$ and contracting back: in Llama-7B,
$4096 \to 11008 \to 4096$. (Honesty about the fine print: Llama's variant, **SwiGLU**, actually uses
*three* matrices — an up-projection, a gate that multiplies it elementwise, and a down-projection —
with the width set near $\tfrac{2}{3} \times 4 \times 4096 \approx 10923$, rounded to the
hardware-friendly $11008$, so the three-matrix version costs about what the classic two-matrix
$4\times$ version cost. A learned smooth gate, slightly better in practice. Keep the mental model
simple: **expand, threshold, contract**.) One more structural fact, straight from lesson 1.2's
rows-through-the-machine picture: the FFN eats the board of *one token at a time*, the same weights
applied to every position independently. No token ever sees another token in here.

**Why expand?** Because the board is cramped. The stream has $4096$ axes, but the questions worth
asking of a board — "is this a city? is the tone sarcastic? are we inside a for-loop? is the subject
plural?" — number far more than $4096$. Lesson 1.1's ponder showed high-dimensional space is roomy
enough to host more concepts than axes, packed as nearly-perpendicular directions; the up-projection
to $11008$ gives the block that many *independent detector slots* — more basis directions than the
stream itself has — room to compute in before compressing the verdict back down.

**The memory reading** — a second research lens, and a beautiful one (Geva et al., 2021, is the
paper to read later). Look at the anatomy with lesson 1.2's two pictures:

- **Each row of $W_1$ is a pattern detector.** Computing $W_1\mathbf{x}$ dots every row with the
  board — $11008$ simultaneous runs of lesson 1.1's agreement meter, each row asking "is *this*
  combination of features currently on the board?"
- **The nonlinearity is the threshold.** Detectors whose match is weak or negative are cut to zero:
  they get no vote. Only genuine matches pass the gate and get to speak.
- **Each column of $W_2$ is what one detector writes back when it fires.** The output is a weighted
  sum of columns (lesson 1.2 again), weights = firing strengths: every detector that cleared the
  threshold posts its stored response onto the board, scaled by how confidently it matched.

Ask like a librarian, gate like a bouncer, answer like an encyclopedia: the FFN is an associative
**key–value memory** with $11008$ entries per layer — about $352{,}000$ detector–response pairs
across Llama-7B's $32$ layers — and this is where a model's *facts* are largely believed to live.
"Paris" plus "France-context" on the board matches keys whose stored values write
capital-of-France-flavored directions back. The evidence is real but the lens stays a lens: the
next example and ponder show both its power and its limits.

**And the price tag.** Per block: attention's four projection machines cost
$4 \times 4096^2 \approx 67.1$M parameters (lesson 1.2's audit); the FFN's three matrices cost
$3 \times 4096 \times 11008 \approx 135.3$M. The FFN is not a garnish on attention — it is
**two-thirds of every block**, and since the blocks are nearly the whole model (next lesson makes
this exact), two-thirds of everything. When you download Llama-7B's roughly $13.5$ GB of fp16
weights, about $9$ GB of it is feed-forward memory.

## The division of labor, delivered as promised

Lesson 2.2 ended by promising you the cleanest one-sentence summary of the transformer that exists.
Here it is, both halves now earned:

> **Attention is communication between tokens. The FFN is computation within a token.**

Attention is the only place in the entire architecture where information crosses from one position
to another — which is exactly why it needs the $n^2$ pairwise machinery of queries and keys. The
FFN never looks sideways — which is exactly why it can afford to be twice as large: no pairwise
anything, just one board, transformed hard. One tick of the machine, in bulletin-board language:
**read the board → talk** (attention posts notes gathered from other tokens) **→ think** (the FFN
posts conclusions computed from this token's own board) **→ repeat**, thirty-two times.
`,
    },
    {
      type: 'example',
      title: md`a tiny FFN, run by hand as a memory`,
      md: md`
A cartoon small enough to run on paper. The board has $d = 3$ axes with meanings we'll pretend are
clean: (*is-a-city*, *is-French*, *is-the-capital-of-France*). Two detectors, so $W_1$ is
$2 \times 3$ and $W_2$ is $3 \times 2$:

$$W_1 = \begin{bmatrix} 1 & 1 & 0 \\ 1 & -1 & 0 \end{bmatrix}
\qquad
W_2 = \begin{bmatrix} 0 & 0 \\ 0 & 0 \\ 0.6 & -0.5 \end{bmatrix}$$

Read the rows of $W_1$ as questions: detector 1 asks "*city AND French?*"; detector 2 asks "*city
AND not French?*". Read the columns of $W_2$ as stored responses: when detector 1 fires, write
$+0.6$ of *capital-of-France* per unit of firing; when detector 2 fires, write $-0.5$ of it —
actively push the board *away* from the France-capital idea.

**Run "Paris."** Attention has already done its communication job: the board arrived as
$\mathbf{x} = (1, 1, 0)$ — the context established *city* and *French*, but no token in the
sentence ever said "capital." Detector pre-activations (dot each row with the board):
$1 + 1 + 0 = 2$ and $1 - 1 + 0 = 0$. Threshold: $\mathrm{relu}(2, 0) = (2, 0)$ — detector 1 fires
at strength $2$, detector 2 stays silent. Write-back: $2 \times (0, 0, 0.6) = (0, 0, 1.2)$. The
residual posts it: board becomes $(1, 1, 1.2)$.

Stop and look at what just happened, because it is Debt 1 being paid in cash. Every value vector
attention could mix had a *zero* in the third coordinate — no convex combination of them could ever
make that coordinate nonzero; lesson 2.2's shrink-wrap theorem forbids it. The FFN just wrote
$1.2$ there anyway. **The fact came from the weights, not from the context.** Attention gathered
the evidence; the FFN consulted its memory and added something genuinely new to the sentence.

**Run "Tokyo":** $\mathbf{x} = (1, -1, 0)$. Pre-activations: $0$ and $2$. After the threshold:
$(0, 2)$ — now only detector 2 speaks — write-back $2 \times (0, 0, -0.5) = (0, 0, -1)$, board
becomes $(1, -1, -1)$: *definitely not the capital of France*, recorded.

**Why the threshold is not optional — run "France":** $\mathbf{x} = (0, 1, 0)$, French but not a
city. Detector 2's raw match is $0 - 1 + 0 = -1$. Without the nonlinearity, that $-1$ would
multiply the stored response and *write* $(-1) \times (0,0,-0.5) = (0, 0, +0.5)$ — garbage: an
anti-match sneaking a positive capital-of-France note onto the wrong board. The threshold clips the
$-1$ to $0$: detectors speak when they match, and *say nothing* otherwise. That is the nonlinearity's
day job in the memory picture — and its night job, from lesson 1.2, is preventing $W_2 W_1$ from
collapsing into a single matrix.

The honest fine print: real boards don't have labeled axes, real features are smeared across many
directions (superposition, lesson 1.1's ponder), Llama's gate is smooth SwiGLU rather than a hard
relu, and one fact engages many detectors across many layers. The cartoon is the mechanism, not the
scale.
`,
    },
    {
      type: 'ponder',
      question: md`So where, physically, does "Paris is the capital of France" live in Llama-7B?
You now have a mechanistic hypothesis: FFN detector–response pairs. Design the experiment: how
would you *find* the fact's address — and what result would convince you the address is real?`,
      answer: md`The experiment has been run, and it's lovely (look up *causal tracing* and the ROME
paper, Meng et al. 2022, when you reach Module 6). Corrupt the model's processing of "Paris" so the
prediction breaks, then restore the true activations one layer at a time, one position at a time,
and watch where restoration *rescues* the answer. The rescue concentrates — heavily in **FFN
sublayers, in a band of middle layers, at the subject's last token**. Better: surgically editing a
few FFN weight columns there can make the model believe "Paris is the capital of Italy," with the
edit generalizing across phrasings. That's strong evidence for the key–value memory lens.

But hold the lens loosely, because the same research found the fact is not *in one place*: the
rescue is spread across several layers, edits ripple into related facts, and follow-up work showed
you can sometimes edit a fact at layers the tracing said were *uninvolved* — so "where restoration
rescues" and "where the fact is stored" are provably not the same question. The honest summary:
**distributed, FFN-heavy, several middle layers, and an active research frontier** — one you are
now equipped to walk into, because every tool in those papers (dot products, matrix columns,
residual streams) is something you've built by hand.`,
    },
    {
      type: 'text',
      md: md`
## The block, assembled

Every piece now has a reason, so the assembly is one breath of pseudocode-in-prose. For each of the
$32$ blocks, in order:

$$\mathbf{x} \;\leftarrow\; \mathbf{x} + \text{Attn}(\text{Norm}(\mathbf{x}))
\qquad \text{then} \qquad
\mathbf{x} \;\leftarrow\; \mathbf{x} + \text{FFN}(\text{Norm}(\mathbf{x}))$$

Read it aloud in board language: *tidy the scale, talk, post the note; tidy the scale, think, post
the note.* The residual additions are the board; the norms are the thermostat on each on-ramp;
attention is the between-tokens step; the FFN is the within-token step. Per block:
$67.1\text{M} + 135.3\text{M} + 8{,}192 \approx 202.4$M parameters — two-thirds thinking, one-third
talking, a rounding error of thermostat.

And the shape is *forced*. Remove any part and a specific catastrophe you have already studied
arrives on schedule. No residual: lesson 1.3's $0.9^{100} \approx 0.0000266$ starves the early
blocks, and worse, every layer becomes a gate that must learn a $16.8$M-entry identity just to be
harmless. No norms: scale drift saturates every softmax and no learning rate fits all layers. No
attention: tokens never communicate, and "bank" can never learn which bank it is — lesson 2.2's
original puzzle returns unsolved. No FFN: the model is locked in the convex hull, mixing forever,
inventing never. Four parts, four debts, zero decoration. The same skeleton — with the exact same
division of labor — runs GPT-3 at $d = 12288$ (attention $\approx 604$M, FFN $\approx 1.21$B per
block: two-thirds again). Once a shape is forced, it shows up everywhere.
`,
    },
    {
      type: 'ponder',
      question: md`Cash lesson 1.3's promise all the way out, with numbers. Write the backward
factor of one residual sublayer (differentiate $x + f(x)$). Now stack $100$ timid sublayers, each
with branch sensitivity $f' = 0.02$, and compare what reaches the bottom in the two designs: layers
that *replace* (per-layer factor $0.02$) versus layers that *add* (per-layer factor $1.02$).
Finally: expand the product $(1 + f_1')(1 + f_2')\cdots(1 + f_{100}')$ in your head — which single
term can no choice of the $f'$ values ever remove?`,
      answer: md`The factor: $\dfrac{d}{dx}\big[x + f(x)\big] = 1 + f'(x)$.

**Replace-design:** $0.02^{100} = 10^{100\,\log_{10} 0.02} \approx 10^{-170}$. Not small —
*annihilated*. There aren't $10^{170}$ of anything; no learning rate, no optimizer, no patience
recovers a signal that arrives $170$ orders of magnitude down.

**Add-design:** $1.02^{100} = e^{100 \ln 1.02} \approx e^{1.98} \approx 7.2$. The gradient arrives
mildly *amplified* — alive, useful, trainable. Same branches, same timid $0.02$ sensitivities; the
only difference is the plus sign.

**The un-removable term:** expanding the product gives a sum over every subset of layers — each
term picks either the "$1$" (take the identity exit) or the "$f'$" (detour through the branch) at
each layer. The all-identity choice contributes exactly $1 \cdot 1 \cdots 1 = 1$, regardless of
every $f'$ — even if every branch is stone dead, gradient $1$ arrives intact. That term *is* the
highway; everything else is scenic routes on top of it.

One honest caveat, because Feynman would insist: nothing pins the *whole* product at $1$ — our
$7.2$ shows residual stacks can still drift upward, and with bigger branches they drift hard. That
residual drift is part of why the norms sit in the loop and why lesson 1.6's warmup and gradient
clipping exist. The highway guarantees a floor, not a ceiling — and a floor is what vanishing
gradients needed.`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **Both debts, paid by one block.** Attention mixes but cannot invent (2.2) — the FFN invents;
   deep chains starve gradients (1.3) — the residual stream feeds them.
2. **The residual stream:** every sublayer computes $\mathbf{x} + f(\mathbf{x})$; the backward
   factor $1 + f'$ always contains the toll-free identity path, and "do nothing" becomes the free
   default instead of a $16.8$M-entry matrix to learn. As a research lens: the stream is each
   token's bulletin board — attention posts notes from other tokens, the FFN posts conclusions from
   this one, sixty-four posts deep.
3. **Norms:** the thermostat. RMSNorm divides each token's vector by
   $\sqrt{\text{mean of squares}}$ and applies a learned gain — $(3,4) \to (0.849, 1.131)$, same
   answer for $(30,40)$ — erasing "how loud," keeping "what." Pre-norm keeps the thermostat on the
   on-ramp so the highway stays a clean identity.
4. **The FFN:** expand $4096 \to 11008$, threshold, contract — $11008$ pattern detectors (rows of
   $W_1$, dot-product questions), a gate (the nonlinearity), and stored responses (columns of
   $W_2$): a key–value memory where facts largely live, at $135$M parameters per block versus
   attention's $67$M — **two-thirds of every block, and of the whole model**.
5. **The sentence that summarizes the transformer:** attention is communication between tokens; the
   FFN is computation within a token. Tidy, talk, post; tidy, think, post — times thirty-two.

Next lesson: no new mechanisms — the victory lap with a wrench. We bolt every part from eleven
lessons into one machine, run a token from id to next-word probabilities, and account for every
last parameter of Llama-7B's "7B." You will check a frontier lab's arithmetic, and it will balance
to nine digits.
`,
    },
  ],
  questions: [
    {
      id: 'm2-l5-q1',
      kind: 'mcq',
      prompt: md`Every transformer sublayer computes $\mathbf{x} + f(\mathbf{x})$ rather than bare
$f(\mathbf{x})$. What does the plus sign actually buy?`,
      options: [
        md`Addition is cheaper to compute than replacement, so the model runs faster`,
        md`The backward factor becomes $1 + f'$ — guaranteeing an undiminished identity path for gradients through any depth — and "do nothing" becomes the free default instead of a 16.8M-entry identity matrix the layer would have to learn`,
        md`It doubles the effective width of the network from 4096 to 8192 dimensions`,
        md`It keeps outputs close to inputs, which regularizes the model and prevents overfitting`,
      ],
      answer: 1,
      explain: md`Two independent wins from one plus sign: the gradient highway
($\prod(1 + f_l')$ always contains the all-ones term) and identity-by-default (a harmless layer is
$f \approx 0$, which is where initialization already starts). The speed option tempts but is
backwards — bare $f(\mathbf{x})$ skips the addition and is marginally *cheaper*. The width option
confuses adding vectors with concatenating them: the sum lives in the same 4096 axes. The
overfitting option is the seductive one because "stay close to the input" sounds like restraint —
but residuals were invented to fix *training* error (the 56-versus-20-layer failure was measured on
training data); the disease was optimization, not memorization.`,
    },
    {
      id: 'm2-l5-q2',
      kind: 'numeric',
      prompt: md`By hand: apply RMSNorm (gain $= 1$) to $\mathbf{x} = (3, 4)$. Enter the **first
component** of the result, to two decimals. (Mean of squares first, then the square root, then
divide.)`,
      answer: 0.849,
      tolerance: 0.01,
      explain: md`Mean of squares: $(9 + 16)/2 = 12.5$; RMS $= \sqrt{12.5} \approx 3.536$; first
component $3/3.536 \approx 0.849$ (second: $1.131$). Sanity check worth internalizing: the output's
own RMS is exactly $1$ — that's the thermostat's contract. And $(30, 40)$ gives the identical
answer: the norm erases loudness and keeps the pattern.`,
    },
    {
      id: 'm2-l5-q3',
      kind: 'mcq',
      prompt: md`Modern models compute $\mathbf{x} + f(\text{Norm}(\mathbf{x}))$ (pre-norm) instead
of the original 2017 recipe $\text{Norm}(\mathbf{x} + f(\mathbf{x}))$ (post-norm). What is the
decisive reason?`,
      options: [
        md`Pre-norm uses fewer parameters, since one norm can serve both sublayers`,
        md`Post-norm is mathematically invalid — normalizing a sum of vectors is undefined`,
        md`Post-norm places the norm on the residual highway itself, so all $\sim$64 hops rescale the identity path; pre-norm keeps that path a clean untouched identity from embedding to logits`,
        md`Pre-norm makes all activations smaller, halving the memory needed for training`,
      ],
      answer: 2,
      explain: md`The residual highway's value is its guaranteed factor-1 route; post-norm parks a
rescaling operation directly on it, at every hop, and deep post-norm stacks needed warmup
gymnastics and still tipped over. The "invalid" option tempts anyone who wants the old design to be
*wrong* — but the 2017 transformer was post-norm and worked fine at 6 layers; the issue is depth,
not validity. The parameter option is false (both designs use two norms per block, 8,192 numbers
either way), and no meaningful memory halving occurs. Honest fine print: a post-norm model that
*does* train can slightly outperform — trainability won the argument, not raw quality.`,
    },
    {
      id: 'm2-l5-q4',
      kind: 'written',
      prompt: md`**Run the thermostat by hand** (paper, every step): apply RMSNorm with learned gain
$\mathbf{g} = (2, 1, 1)$ to $\mathbf{x} = (1, 2, 2)$. Compute the mean of squares, the RMS, the
normalized vector, and the final output. Then verify the normalized vector's own RMS is $1$, and
answer in one sentence: what does the learned gain let the model do that the bare rescale forbids?`,
      rubric: md`**Mean of squares:** $(1 + 4 + 4)/3 = 3$.

**RMS:** $\sqrt{3} \approx 1.732$.

**Normalized:** $(1/1.732,\; 2/1.732,\; 2/1.732) \approx (0.577,\; 1.155,\; 1.155)$.

**Gain applied:** $(2 \times 0.577,\; 1 \times 1.155,\; 1 \times 1.155) \approx (1.155,\; 1.155,\; 1.155)$.

**Verification:** mean of squares of the normalized vector
$= (0.333 + 1.333 + 1.333)/3 = 1$, so its RMS $= 1$ exactly — the contract of the thermostat.

**The sentence:** the bare rescale forces every vector to the same overall loudness, treating all
axes identically; the learned gain restores per-axis volume control, letting training re-amplify
the directions that matter and mute the ones that don't — standardization without a straitjacket.
Full credit requires all four computed stages, the RMS $= 1$ check, and a sentence that identifies
*per-axis* freedom (not just "it scales things").`,
    },
    {
      id: 'm2-l5-q5',
      kind: 'numeric',
      prompt: md`Llama-7B's FFN uses three matrices of shape $4096 \times 11008$ per layer (up,
gate, down). How many parameters is one layer's FFN, **in millions**? (Multiply it out on paper
first.)`,
      answer: 135,
      tolerance: 5,
      explain: md`$3 \times 4096 \times 11008 = 3 \times 45{,}088{,}768 = 135{,}266{,}304 \approx
135$M — lesson 1.2's counting rule (a shape holds height times width numbers) doing production
work. Set beside attention's $4 \times 4096^2 \approx 67$M, this one number is the architecture
confessing where it keeps most of itself.`,
    },
    {
      id: 'm2-l5-q6',
      kind: 'mcq',
      prompt: md`An engineer strips the nonlinearity out of the FFN to save compute:
$\text{out} = W_2 W_1 \mathbf{x}$, with $W_1$ still expanding $4096 \to 11008$ and $W_2$
contracting back. What is the true cost?`,
      options: [
        md`Nothing functional changes — it just runs faster`,
        md`The FFN can no longer change a vector's length, only rotate it`,
        md`Training diverges immediately, because gradients cannot pass through two consecutive matrices`,
        md`The collapse theorem strikes: $W_2 W_1$ is a single $4096 \times 4096$ machine, so $\sim$90M parameters now express what 16.8M can; the 11008 detectors lose their gate, and every stored response gets written on every input`,
      ],
      answer: 3,
      explain: md`Lesson 1.2's collapse theorem, now with a body count: $W_2(W_1\mathbf{x}) =
(W_2 W_1)\mathbf{x}$ by associativity, and $W_2 W_1$ has shape $4096 \times 4096$ — the entire
expansion buys nothing without the threshold between. In the memory picture it's worse than
wasteful: with no gate, anti-matches write negated responses and every detector "speaks" on every
input, so the memory can't be selective at all. The first option is exactly the trap the collapse
theorem exists to catch. The rotation option confuses general matrices with orthogonal ones. The
divergence option is backwards — chained matmuls are the *easiest* thing backprop handles; that's
most of what it does.`,
    },
    {
      id: 'm2-l5-q7',
      kind: 'numeric',
      prompt: md`Per Llama-7B layer: FFN $\approx 135.3$M parameters, attention's four projections
$\approx 67.1$M. How many **times** more parameters does the FFN hold than attention? (One
decimal.)`,
      answer: 2.0,
      tolerance: 0.2,
      explain: md`$135.3 / 67.1 \approx 2.0$ — the thinking machinery is twice the size of the
talking machinery, in every one of the 32 blocks. A useful reflex-check whenever you meet a new
architecture: compute this ratio from the config file and you instantly know where the capacity
lives.`,
    },
    {
      id: 'm2-l5-q8',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Using only the wiggle-reading of the derivative from
lesson 1.3 ("nudge the input by $\varepsilon$ and the output moves by sensitivity times
$\varepsilon$"): **(a)** derive the backward factor of one residual sublayer
$y = x + f(x)$ — trace the nudge along *both* routes and add. **(b)** Write the gradient factor for
100 stacked residual sublayers as a product, expand it, and identify the term that survives no
matter what every $f'$ is. **(c)** Put numbers on the comparison: branches with $f' = 0.05$
everywhere — what reaches the bottom under replace-layers ($0.05$ per layer) versus
residual layers ($1.05$ per layer)?`,
      rubric: md`**(a)** Nudge $x$ by $\varepsilon$. The nudge travels two routes: through the
identity, arriving unchanged as $\varepsilon$; and through the branch, arriving as
$f'(x)\,\varepsilon$ by the meaning of $f'$. The output moves by their sum,
$(1 + f'(x))\,\varepsilon$ — so the sensitivity is $1 + f'(x)$. (The derivation must visibly use
the two-routes argument; quoting the answer from memory is exactly what this question is not.)

**(b)** The chain multiplies: $\prod_{l=1}^{100}(1 + f_l')$. Expanding the product yields a sum
over all subsets of layers — at each layer a term either takes the $1$ (identity exit) or the
$f_l'$ (branch detour). The all-identity term is $1 \cdot 1 \cdots 1 = 1$: present and equal to
$1$ for *any* values of the $f'$, even all zeros. That term is the gradient highway.

**(c)** Replace-design: $0.05^{100} = 10^{100 \log_{10} 0.05} \approx 10^{-130}$ — dead beyond any
rescue (no learning rate multiplies $10^{-130}$ back to relevance). Residual design:
$1.05^{100} = e^{100 \ln 1.05} \approx e^{4.88} \approx 131$ — alive, arriving amplified about
$131\times$. Bonus credit for the honest caveat: $131 \ne 1$, so residual stacks drift too — which
is why norms, warmup, and clipping still exist; the highway is a floor, not a thermostat.

"Nailed it" requires the two-routes derivation in (a), the explicit all-ones term in (b), and both
computed magnitudes in (c).`,
    },
    {
      id: 'm2-l5-q9',
      kind: 'mcq',
      prompt: md`Which statement correctly captures the transformer block's division of labor?`,
      options: [
        md`Attention is the only place information moves between token positions; the FFN transforms each token's vector alone, with the same weights applied at every position`,
        md`The FFN passes information between neighboring tokens, while attention transforms each token independently`,
        md`Both attention and the FFN mix information across tokens — the FFN is simply a wider version of attention`,
        md`Attention moves information between tokens within a layer, while the FFN's job is moving information between layers`,
      ],
      answer: 0,
      explain: md`Communication between tokens (attention), computation within a token (FFN) — and
the design makes economic sense: crossing between positions needs the expensive $n^2$ pairwise
machinery of queries and keys, while per-token computation needs none of it, which is exactly why
the FFN can afford to be twice attention's size. The second option is the plain reversal; the third
fails because the FFN eats one row at a time (lesson 1.2's rows-in-parallel — it has no access to
any other position); the fourth tempts because *something* does carry information between layers —
but that's the residual stream itself, the board every sublayer posts to, not the FFN.`,
    },
    {
      id: 'm2-l5-q10',
      kind: 'numeric',
      prompt: md`**Fermi estimate (paper first, calculator last):** of the parameters inside
Llama-7B's 32 transformer blocks, roughly what **percentage** sits in the FFN matrices? (Per block:
FFN $3 \times 4096 \times 11008$, attention $4 \times 4096^2$, norms negligible. Generous
tolerance — get the fraction right, not the decimals.)`,
      answer: 67,
      tolerance: 8,
      explain: md`$135.3 / (135.3 + 67.1) = 135.3/202.4 \approx 0.67$ — **two-thirds**. The
transformer is mostly its feed-forward memories, and the split is stable across families (GPT-3's
$1.21$B FFN versus $604$M attention per block: two-thirds again). Worth internalizing as a
worldview number: when you wonder where a model keeps what it knows, remember that two of every
three parameters live in the think-step, not the talk-step.`,
    },
    {
      id: 'm2-l5-q11',
      kind: 'written',
      prompt: md`**The memory reading, taught.** Explain the key–value memory view of the FFN to a
fellow student who knows lessons 1.1 and 1.2 but hasn't seen this lesson: what a row of $W_1$ is
and what operation "asks" it, what the nonlinearity contributes, what a column of $W_2$ is, why
expanding $4096 \to 11008$ buys anything at all, and what this view suggests about where a model
keeps "Paris is the capital of France." End by clearly flagging which parts of your explanation are
exact arithmetic and which are an interpretive research lens.`,
      rubric: md`The beats a strong answer must hit:

1. **Rows of $W_1$ as detectors/keys:** computing $W_1\mathbf{x}$ dots every row with the token's
   vector — 11,008 simultaneous agreement-meter readings (lesson 1.1), each row a stored pattern
   asking "is this feature-combination present?"
2. **The nonlinearity as gate/threshold:** weak and negative matches are cut to zero and get no
   vote — without it, anti-matches would write negated garbage, every entry would "speak" on every
   input, and (lesson 1.2) $W_2 W_1$ would collapse into one $4096 \times 4096$ matrix, wasting
   the expansion entirely.
3. **Columns of $W_2$ as stored responses/values:** the output is a weighted sum of columns with
   firing strengths as weights — each detector that cleared the gate writes its response onto the
   residual stream, scaled by match confidence.
4. **Why expand:** the stream has 4,096 axes but there are far more useful questions than axes;
   11,008 hidden slots give more independent detector directions than the stream itself has
   (roominess/superposition from 1.1's ponder) — room to compute before contracting the verdict.
5. **Where the fact lives:** as detector–response associations — distributed, FFN-heavy, spread
   over several (mostly middle) layers rather than at one address.
6. **The honesty flag (required for full credit):** the arithmetic — dots with rows, thresholding,
   weighted sum of columns — is exact and unarguable; "detectors," "memories," and "where facts
   live" are an interpretive lens with real experimental support (activation studies, model
   editing) but also known limits (features are smeared and superposed; localization experiments
   don't cleanly equal storage).

Missing beat 6 caps the grade at partial no matter how good the rest is — teaching the lens as
settled fact is precisely the failure mode the flag exists to catch.`,
    },
    {
      id: 'm2-l5-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old** (write it out — the Feynman technique is *the*
test of ownership). Every word in the sentence has its own little whiteboard where the machine
keeps notes about that word. Explain to the kid: **(1)** why the machine only ever *adds* notes to
a whiteboard and never wipes it clean and starts over, and **(2)** the difference between the
"talking" step and the "thinking" step — and why the machine would fail without either one. Carry
one concrete example sentence all the way through. No unexplained technical words.`,
      rubric: md`Grade the teaching, not the vocabulary. A "nailed it" answer must:

1. **Carry a concrete scene** — e.g. the sentence "I sat by the bank of the river," each word with
   its own whiteboard, helpers adding sticky notes in rounds.
2. **Adding, never wiping:** two kid-graspable reasons welcome, one required — wiping destroys all
   earlier work forever, so one careless helper ruins everything that came before; whereas if
   helpers only *add*, a useless helper simply adds nothing and does no harm. (Bonus for the
   deeper version: with adding, a brand-new helper who hasn't learned anything yet is automatically
   harmless — so you can safely build very tall teams of helpers.)
3. **Talking versus thinking, with the example doing work:** *talking* = looking at the other
   words' whiteboards and copying over useful notes ("bank" reads "river" from a neighbor's board
   and notes "riverbank, not money-bank"); *thinking* = staring only at your own board and working
   out something new that nobody's board said ("riverbank... that's outdoors, near water, might be
   muddy" — knowledge from memory, not from the sentence).
4. **Why both are necessary:** without talking, no word can ever use the other words — "bank"
   stays ambiguous forever; without thinking, the machine can only shuffle around notes that
   already exist — it can pass information along but never *add* anything from memory or work out
   a conclusion.
5. **Jargon audit:** "residual," "attention," "FFN," "vector," "nonlinearity," "layer" must be
   absent or first explained in kid words. Any unexplained jargon caps the grade at partial —
   hiding behind vocabulary is exactly the failure mode this exercise exists to catch.`,
    },
  ],
}
