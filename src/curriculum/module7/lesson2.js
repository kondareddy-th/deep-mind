// Module 7, Lesson 2 — LoRA and the low-rank bet (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm7-l2',
  title: '7.2 LoRA and the low-rank bet',
  subtitle: md`Full fine-tuning a 70B model means hauling 1.12 TB of training state around to teach
it your company's tone. Everyone knows the cheap alternative. Almost nobody can tell you why a
cheap alternative should work at all — and that question, taken seriously, hands you the entire
method, its knobs, its variants, and the test that tells you when it has run out of room.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

You run a support team. Your model answers well, but it answers like a model: chirpy, hedging,
bullet-point-happy. You want it to answer like *your* company — clipped, no exclamation marks,
always closing with a ticket reference. A day of work, conceptually. So you go to fine-tune it.

Lesson 4.1 hands you the invoice. Training state runs 16 bytes per parameter — bf16 working
weights, bf16 gradients, and fp32 master weights plus Adam's two moments — so a 70B model needs

$$70 \times 10^{9} \times 16 = 1.12 \times 10^{12} \text{ bytes} = 1.12 \text{ TB}$$

of permanent state before a single token flows, and activations on top. That is fourteen 80 GB
GPUs, an interconnect, a sharding strategy, and a week of your life. To stop the model saying
*Great question!*

Sit with how absurd that ratio is. The *change* you want is small — you could write it down in a
paragraph. The *machinery* is a small datacenter. Something is badly mismatched, and it isn't the
model's fault.

Now, the obvious move is to ask "how do we make this cheaper?" That's an engineering question, and
engineers make things cheaper every day. But it is not the interesting question, and starting there
will leave you with a bag of tricks and no judgment. The interesting question is one step back:

> **Why should a much cheaper update work at all?**

Because here is the thing nobody says out loud. Every cheap fine-tuning method is a **restriction**.
Full fine-tuning searches all 70 billion coordinates of weight-space for a good answer. Any cheap
method searches a small subset — and a search over a subset only succeeds if a good answer *lives
in that subset*. So every efficient fine-tuning method, without exception, is secretly a **claim
about the shape of the change adaptation needs to make.**

That reframing is worth more than the method. Name the claim and you can name the failure mode; you
can design a test that detects it; you can tell the difference between a variant that fixes
something real and a variant that renames it. So: what do we secretly believe about the shape of
this change?
`,
    },
    {
      type: 'text',
      md: md`
## The bet, derived

Start from what lesson 5.4 established, because it is the whole clue. Supervised fine-tuning does
**not** teach knowledge. It teaches *format and persona*: structure, register, tool-call syntax,
when to refuse, how to sign off. Kilobytes of behavioral policy, not terabytes of world.

Say that out loud in the language of the weights. "Always answer more formally" is not a thousand
unrelated corrections. It is **one adjustment, applied consistently, everywhere.** So is "close with
a ticket reference." So is "never use an exclamation mark." A persona is a short list of consistent
shifts.

Now — and this is the pivot the whole lesson turns on — *consistent shift applied everywhere* is
not a vague description. It is the exact definition of a **low-rank matrix**. Let's prove that to
ourselves rather than assert it.

**What a rank-1 update actually does.** Take the thinnest possible change to a weight matrix: an
outer product of two vectors, $\Delta W = \mathbf{b}\,\mathbf{a}^{\top}$. Apply it to an input
$\mathbf{x}$ and watch what happens, using nothing but the associativity of matrix multiplication:

$$\Delta W \mathbf{x} = \mathbf{b}\,(\mathbf{a}^{\top}\mathbf{x}) = (\mathbf{a}\cdot\mathbf{x})\,\mathbf{b}$$

Read that right-hand side slowly, because it's the entire idea. The update does exactly two things.
It **measures one number** from the input — the dot product with $\mathbf{a}$, which is 1.1's
agreement meter asking "how much does this input look like *that*?" — and then it **adds one fixed
direction** $\mathbf{b}$, scaled by that number. One detector, one nudge. A rank-1 update is a
single if-then rule written in geometry: *to the extent this input looks like a customer email, push
the output toward formal register.*

A rank-$r$ update is $r$ of these, stacked:

$$\Delta W = \sum_{k=1}^{r} \mathbf{b}_k \mathbf{a}_k^{\top}, \qquad
\Delta W \mathbf{x} = \sum_{k=1}^{r} (\mathbf{a}_k \cdot \mathbf{x})\, \mathbf{b}_k$$

$r$ detectors, $r$ nudges. Sixteen of them, say. Now compare that to what a **full-rank** update to
a $4096 \times 4096$ matrix could be. It has 4096 independent directions to play with — 16.8 million
free numbers (2.6's audit) — enough to implement four thousand mutually unrelated read-write rules,
or in the limit an almost arbitrary per-input remapping. What does a change of *that* shape look
like in behavior? Scattered, idiosyncratic, per-input corrections with no shared structure between
them. That is not a persona. **That is memorising.** And 5.4 already told you where memorising
lives: FFN layers behaving as key–value stores, one independent association per fact. A thousand
unrelated facts wants roughly a thousand independent directions, because "unrelated" is precisely
what "cannot be compressed into a shared pattern" means.

So the bet, stated sharply enough to be wrong:

> **The weight change that adaptation needs has almost all of its energy in a handful of
> directions.** Not thousands of independent corrections — a few dozen consistent ones.

## Is the bet true? (honestly)

This is an empirical claim, and it should make you itch, because it is exactly the kind of claim
that sounds inevitable after you've heard it. So here is the actual evidentiary situation.

The backing comes from the **intrinsic dimensionality** line of work. The setup is beautiful and
worth knowing: instead of training all $D$ parameters, project the update through a *random*
$d$-dimensional subspace with $d \ll D$ and train only those $d$ coordinates. Then ask how small
$d$ can get before performance collapses. Measured on pretrained language models, the answer came
out shockingly small — on several classification tasks, a few hundred to a few thousand trainable
coordinates reached most of full fine-tuning's quality, out of hundreds of millions. And the effect
*strengthened* with pretraining: bigger, better-pretrained models had **lower** intrinsic dimension,
which is the opposite of the naive expectation and the strongest single reason to take the bet
seriously. Adaptation is easy in a well-pretrained model because most of the work is already done.

Now the honest caveats, which matter for how much weight you put on it:

- That work was largely on smaller encoder models and classification-flavoured tasks. Extrapolating
  it to modern instruction-tuning of a 70B decoder is an *extrapolation*, not a measurement.
- When people take a full fine-tune, subtract the base, and look at the singular values of the
  difference, the spectrum is typically **fast-decaying but not literally low-rank**. There is a
  long tail. Whether that tail matters is task-dependent, and the honest summary is "usually not
  much, sometimes a lot."

And now a subtlety that is genuinely important and almost always missed. LoRA does **not** require
that the full fine-tune's $\Delta W$ be low-rank. It requires only that **some** low-rank
$\Delta W$ exists that works. Those are different claims, and the second is much weaker: there are
enormously many weight configurations that produce good behavior, and LoRA only has to find one of
them inside its restricted family. So evidence that a full fine-tune's update has a long spectral
tail is *not* evidence against LoRA. This is the difference between "the road I happened to take was
winding" and "no straight road exists."

Go feel the spectrum before we build the machinery.
`,
    },
    {
      type: 'viz',
      viz: 'lora-rank',
      caption: md`Two 28×28 matrices as 3D height-fields. LEFT: a "true" update $\Delta W$ built as a
sum of rank-1 layers with decaying strength — the low-rank hypothesis, made physical. RIGHT: its
best rank-$r$ approximation, which here is just the first $r$ of those layers. The slider sets $r$;
the readout gives the fraction of the update captured, the stored-number count versus full, and the
saving factor. **Three experiments.** (1) Start at $r = 1$ and step up one rank at a time, watching
the right-hand picture and the captured-fraction number together: $r = 1$ already captures 78.6%,
$r = 3$ captures 94.7%, and somewhere around there the two height-fields stop being
distinguishable by eye. Three directions out of twenty-eight. (2) Find the rank that captures about
90% — it is $r = 2$, at 90.7% — and read the storage line: 112 numbers against 784, i.e. **14.3% of
the full parameter count for 90% of the update**, a 7× saving. That single trade is the entire
commercial case for this method. (3) Now push $r$ to the maximum, 28, and watch the saving
*evaporate*: you capture 100.0% but store 1,568 numbers against the full matrix's 784 — a saving
factor of 0.5×, meaning you are now paying **twice** the full matrix to say exactly what the full
matrix says. Break-even is at $r = 14$, exactly half the dimension, and it is no coincidence:
LoRA stores $2Nr$ numbers to describe an $N \times N$ matrix, so it only pays when $r < N/2$.
LoRA's whole value is living far to the left of that curve.`,
    },
    {
      type: 'text',
      md: md`
## The mechanics, one justified piece at a time

Here is the method. Freeze the pretrained matrix $W$ entirely — no gradients, no optimizer state,
nothing. Learn a low-rank correction beside it:

$$W' = W + \frac{\alpha}{r} B A, \qquad B \in \mathbb{R}^{d \times r},\;\; A \in \mathbb{R}^{r \times d},\;\; r \ll d$$

$A$ squeezes the $d$-dimensional input down to $r$ numbers — those are our $r$ detectors — and $B$
expands those $r$ numbers back out into $d$-dimensional nudges. The bottleneck *is* the bet, made
architectural: you have physically forbidden the update from having more than $r$ independent
read-write rules.

Three design choices ride on top of that, and every one of them is usually stated as a rule to
memorise. Let's derive all three instead, because each derivation pays for itself later.

### Why $B$ starts at exactly zero

At initialization we want one property above all: **the adapted model must be the base model.**
Not approximately, not close — exactly. You spent a nine-figure training run buying the behavior in
$W$ (5.3); if step 0 of your fine-tune is a randomly perturbed version of that behavior, you have
lit part of it on fire before you began, and your first hundred optimizer steps are spent
recovering ground you already owned.

$B = 0$ gives it to you free: $BA = 0$, so $W' = W$ identically, whatever $A$ is. Training starts
from the pretrained behavior, and every subsequent step is a deliberate departure from it rather
than a scramble back toward it.

But then $A$ must be something *nonzero* — and the reason is not aesthetic, it's that the gradients
die otherwise. Write them down. Let $\mathbf{g}$ be the gradient arriving at this layer's output.
Since the layer computes $\mathbf{h} = W\mathbf{x} + \frac{\alpha}{r} B(A\mathbf{x})$, the chain
rule gives

$$\frac{\partial \mathcal{L}}{\partial B} = \frac{\alpha}{r}\,\mathbf{g}\,(A\mathbf{x})^{\top},
\qquad
\frac{\partial \mathcal{L}}{\partial A} = \frac{\alpha}{r}\,B^{\top}\mathbf{g}\,\mathbf{x}^{\top}$$

Stare at the structure, ignoring the details: **each factor's gradient is proportional to the other
factor.** $B$ can only learn through $A$; $A$ can only learn through $B$. That is the generic
signature of any multiplicative parameterization, and it means the all-zero point is a genuine dead
fixed point — both gradients vanish, nothing moves, and nothing ever will. So exactly one of the
two must be nonzero. The convention is $A$ drawn from a small random distribution and $B = 0$, which
buys both properties at once: the product is zero, and the gradient to $B$ is alive.

The next ponder makes you work all four combinations, and one of them does *not* behave the way the
folklore says. Do it before reading on.

### Why the scale is $\alpha/r$ and not $\alpha$

Now the knob that practitioners get wrong more often than any other. Why divide by the rank?

Reason it out. The product $BA$ is a **sum of $r$ rank-1 terms**. Each of those terms is learned by
the same optimizer, from the same initialization scale, on the same data — so each arrives at
roughly the same typical magnitude regardless of how many siblings it has. Adding more of them
therefore makes the total update *bigger*, purely because there are more of them. Double $r$ from 16
to 32 and, with no scaling, the effective size of your update roughly doubles — which means your
carefully tuned learning rate is now roughly twice as hot, and your run diverges or bakes for
reasons that have nothing to do with rank.

Dividing by $r$ normalizes the sum so that the *effective* update magnitude stays roughly constant
as $r$ changes. That is the whole purpose: **so that $r$ and the learning rate are independent
knobs.** Sweep rank without silently re-tuning your optimizer.

Which immediately tells you the practical rule, and it is not the one people repeat. The quantity
that matters is $\alpha/r$, the effective scale — a single number, typically 1 or 2. Fixing
$\alpha = 16$ and then sweeping $r$ from 8 to 64 changes the effective scale from 2 down to 0.25,
so you are sweeping your learning rate by 8× while telling yourself you're studying rank. Nearly
every confused "higher rank didn't help" report on the internet has this bug in it. If you want to
compare ranks, **scale $\alpha$ with $r$** — the common convention $\alpha = 2r$ pins the effective
scale at 2 — or equivalently hold $\alpha/r$ fixed by hand.

**Honest wrinkle, and it is the basis of a real variant.** The argument above assumed the $r$ terms
mostly *align*, so their sum grows like $r$. If instead they end up roughly independent, their sum
grows like $\sqrt r$ (1.1's drunkard's walk, in matrix clothing), and dividing by $r$
*over*-corrects — the effective update then shrinks like $1/\sqrt r$ as you raise the rank. That
would produce a very specific symptom: high ranks appearing not to help, when really they were
silently under-trained. This is exactly the argument behind **rsLoRA**, which proposes
$\alpha/\sqrt r$ instead. The reasoning is clean; how much it matters in practice is rank-dependent
and mostly shows up at $r \ge 64$. File it as a real consideration, not a settled correction.
`,
    },
    {
      type: 'ponder',
      question: md`**Work all four corners.** The initialization rule is "$A$ random, $B$ zero," and
it is usually taught as a pair of facts to memorise. Derive it instead. Using the two gradient
expressions above, work out what happens at step 0 in each of the four cases: (i) both $A$ and $B$
random; (ii) both zero; (iii) $A$ zero and $B$ random; (iv) $A$ random and $B$ zero. For each,
answer two questions: *does the adapted model start out equal to the base model?* and *does anything
receive a nonzero gradient?* One of these four will not do what you were probably told it does.`,
      answer: md`**(i) Both random.** $BA \ne 0$, so $W' \ne W$: at step 0 you are training a
*randomly perturbed* copy of a model that cost millions of dollars to make. Gradients are alive, so
it will recover — but you have spent optimizer steps undoing damage you inflicted yourself, and you
have added a random, un-asked-for direction to a carefully balanced network. Strictly worse than
free, for no benefit. Ruled out.

**(ii) Both zero.** $BA = 0$, so the model does start at base — good. But now look at the gradients:
$\partial \mathcal{L}/\partial B \propto (A\mathbf{x})^{\top} = 0$ and
$\partial \mathcal{L}/\partial A \propto B^{\top} = 0$. Both vanish. The parameters do not move on
this step, so they are still both zero on the next step, so the gradients vanish again. This is a
**dead fixed point** in the strict sense — not slow, not badly conditioned, but exactly stationary
forever. The cause is structural: in any product parameterization, each factor's gradient carries
the other factor as a multiplier, so the origin is always stationary. Ruled out.

**(iii) $A$ zero, $B$ random — and here the folklore is wrong.** Check it rather than assuming.
$BA = 0$, so the model does start at base. And the gradient to $B$ is indeed zero, since it is
proportional to $A\mathbf{x} = 0$. But the gradient to $A$ is
$\frac{\alpha}{r} B^{\top}\mathbf{g}\,\mathbf{x}^{\top}$, and $B \ne 0$, so **$A$ receives a
perfectly good nonzero gradient**. $A$ moves on step 1; once $A \ne 0$, $B$ starts moving too. This
configuration is *not* dead — it is the mirror image of the standard choice, and some libraries
offer it. The common claim that "if $A$ were zero, nothing would move" is a sloppy transfer of the
both-zero argument, and running the algebra catches it. Being able to catch that is most of what
deriving is for.

**(iv) $A$ random, $B$ zero — the standard.** $BA = 0$, so you start *exactly* at the pretrained
model, and the gradient to $B$ is $\frac{\alpha}{r}\mathbf{g}(A\mathbf{x})^{\top}$, which is alive
because $A$ is not zero. Both properties, simultaneously.

**So the real rule is the weaker, more useful one:** exactly one factor must be zero. Zero out
both and you are stuck; zero out neither and you have vandalised your base model. Which of the two
valid orderings to prefer is a genuinely finer question — with random $A$ you get, from step 0, a
fixed random $r$-dimensional sketch of the input (a Johnson–Lindenstrauss projection, 6.1's
geometry again), so $B$'s very first update carries information along all $r$ directions at once.
That is a decent argument and it is the historical choice, but $A$ and $B$ are demonstrably *not*
interchangeable in practice — which is precisely the observation the **LoRA+** variant is built on,
and we'll get to it.`,
    },
    {
      type: 'example',
      title: 'the whole trick, in one division',
      md: md`
Everything above earns its keep in about four lines of arithmetic. Take one attention projection
matrix from a Llama-class model, $4096 \times 4096$, the specimen from 2.6's parameter audit.

**Per matrix.** A full update trains every entry:

$$4096^{2} = 16{,}777{,}216 \approx 16.8\text{M trainable numbers}$$

LoRA at $r = 16$ trains two thin slabs instead — $B$ is $4096 \times 16$ and $A$ is $16 \times 4096$:

$$2 \times 4096 \times 16 = 131{,}072 \approx 131\text{k}, \qquad
\text{ratio} = \frac{16{,}777{,}216}{131{,}072} = 128\times$$

**Across the model.** Adapt the four attention projections in every layer of a 70B-class model and
you land in the tens of millions of trainable parameters — call it 40M for a concrete accounting
(the Fermi question makes you derive the range yourself, and it depends on hidden size, layer count,
and whether grouped-query attention has shrunk the $K$ and $V$ matrices). Against 70 billion, that
is **0.06%** of the model.

**Now the part that actually matters,** because 4.1 taught you the real bill is never the weights,
it's the optimizer. Sixteen bytes per parameter applies only to *trainable* parameters — the frozen
base needs no master copy, no momentum, no variance, no gradient buffer:

| | trainable params | training state at 16 B/param |
|---|---|---|
| full fine-tune | $70 \times 10^{9}$ | $1.12 \times 10^{12}$ B = **1.12 TB** |
| LoRA, $r = 16$ | $4 \times 10^{7}$ | $6.4 \times 10^{8}$ B = **640 MB** |

$$\frac{1.12 \text{ TB}}{640 \text{ MB}} \approx 1{,}750\times$$

A terabyte of optimizer state becomes 640 megabytes. **That single division is the whole trick.**
Everything else in this lesson — the initialization, the scaling, the variants, the serving
architecture — is detail hanging off that one number.

Add the frozen base itself and the picture completes: 70B weights at bf16 is 140 GB, which is still
two GPUs; run the base in 4 bits instead (4.4's QLoRA, whose *read-only, no-accumulation* argument
is exactly why that works) and it's ~35 GB. Base plus adapters plus optimizer now fits on one card.
A job that was a multi-node cluster booking became an overnight run on a workstation, and the
reason a thousand fine-tuned variants of every open model exist is that this collapse happened.
`,
    },
    {
      type: 'text',
      md: md`
## Where to put the adapters, and how thick to make them

Two practical choices remain, and I want to be straight with you about their epistemic status:
this section is **practice lore**. Not theory, not theorem — accumulated empirical findings, some
well-replicated and some not, on a moving target. Treat it as a strong prior, not a rule.

**Which modules.** The original work adapted only $W_Q$ and $W_V$, and reported that this was
enough. That finding stuck around as folklore far longer than it should have, because the more
consistent later result is the opposite: **when you can afford it, targeting more modules — all
four attention projections *and* the FFN matrices — is generally better**, and the gap widens on
harder adaptations. The QLoRA work made this point sharply, reporting that matching full
fine-tuning quality depended more on adapting *all* linear layers than on raising the rank.

There is a satisfying reason to expect this from 2.5: the FFN is **two-thirds of the parameters**
and it is where key–value-memory-like computation lives. Leaving it untouched means restricting
your edit to the routing-and-mixing part of the block while the bulk of the machine stays frozen.
If your adaptation involves *what* the model says and not merely *how* it routes, that restriction
bites. The practical upshot: when an adaptation seems to be hitting a wall, "am I adapting the FFN?"
is a better first question than "should I raise the rank?" — and it is asked far less often.

**How thick.** Typical ranks run 8 to 64. Roughly:

- $r = 8$ to $16$ — format, tone, persona, tool-call syntax, refusal habits. 5.4's sweet spot,
  where a handful of consistent directions genuinely is the whole change. This range works
  embarrassingly well and is where most production adapters live.
- $r = 32$ to $64$ — more training data, several distinct behaviors bundled into one adapter, a
  real domain shift (legal drafting, clinical notes, a codebase with its own conventions). More
  distinct behaviors need more independent detector–nudge pairs; that is the rank-1 picture telling
  you directly what rank buys.
- $r = 128$ and up — occasionally worth it with a lot of data, but this is also where the
  $\alpha/r$ trap bites hardest and where rsLoRA's concern lives, so a surprising fraction of
  reports in this range are measuring their own configuration bug.

The honest summary of the rank literature: **rank matters less than people expect, and much less
than which modules you adapt, the learning rate, and the data.** Many careful comparisons find the
curve flattening by $r = 16$ for style-shaped tasks. Anyone who quotes you a universal optimal rank
has stopped measuring.
`,
    },
    {
      type: 'text',
      md: md`
## Merging: the property that makes it deployable

Here is the feature that beat every competing method, and it follows from one word in the equation:
**additive**.

Because the update sits beside $W$ as a sum rather than inside the network as a new operation, you
can do the addition *once, in advance*:

$$W_{\text{deploy}} \;\leftarrow\; W + \frac{\alpha}{r} B A$$

and then throw the adapter away. What ships is a weight matrix of exactly the original shape.
Inference cost, memory footprint, kernel schedule, latency: **identical to the base model, to the
last microsecond.** There is no extra matmul, because there is no extra layer — the adaptation was
folded into a number that was going to be multiplied anyway.

That is not a small win, and the contrast makes it concrete. The main pre-LoRA approach, **bottleneck
adapters**, inserted small trainable modules *between* the frozen layers. They worked, and they were
parameter-efficient. But they were an extra sequential operation in every block, on every token,
forever — a fixed latency tax on every request you will ever serve, in a regime (3.4) that is
already bandwidth-starved and hates small extra ops. LoRA's additivity deleted the tax entirely.
Given two methods of comparable quality where one is free at inference and one is not, the market
does not deliberate for long.

## And now the same property, used backwards

Then comes the twist that built an industry: **you can also decline to merge.**

Keep $B$ and $A$ separate and the adapter is a small, independent file — for a 7B model, a
few tens of megabytes. The base model, all 14 GB of it, sits in GPU memory once. Each incoming
request names an adapter; the server applies that customer's $B$ and $A$ on top of the shared
frozen weights for that request only, and the next request uses a different pair.

Cost it against 4.5's serving economics and the logic is inescapable. That lesson's central fact is
that serving profitability is throughput, throughput is batch size, and batch size is bounded by
what fits in HBM alongside the KV cache. If each customer needs their *own* 14 GB of weights, then
each customer needs their own GPU (or a cold model load per request, which is worse), your batches
are one customer wide, and per-token cost is catastrophic. If every customer shares one copy of
the weights and differs by 40 MB, they can sit in **the same batch on the same GPU**, hauling the
weights once for all of them — which is exactly the amortization 3.4 says you must achieve.

That is the entire architecture behind "bring your own fine-tune" products: thousands of
customer-specific models served from one set of weights, at close to base-model economics. There is
real engineering underneath it — batching requests that need different adapters requires kernels
that can apply per-request low-rank updates, which is its own active area — but the property that
makes it *possible at all* is that the difference between two customers' models is two thin
matrices.

So: merge when you ship one specialized model and want zero latency overhead. Stay unmerged when
you serve many. Same algebra, opposite deployment, and the fact that one method gives you both is
most of why it won.
`,
    },
    {
      type: 'ponder',
      question: md`**Do the business arithmetic.** A company offers fine-tuned models to 500
customers, all built on the same 7B base. Weights are bf16, so the base is 7 billion parameters
at 2 bytes = 14 GB, and each LoRA adapter is roughly 40 MB. Compute the total storage two ways:
(a) full fine-tuning, where each customer gets their own complete copy of the model; (b) LoRA,
where everyone shares one base. Then go past the storage number and say what changes about
*serving*, and name the thing that only exists because of the second number.`,
      answer: md`**(a) Full fine-tuning.** Every customer owns a full set of weights:

$$500 \times 14 \text{ GB} = 7{,}000 \text{ GB} = 7 \text{ TB}$$

**(b) LoRA.** One base, 500 thin deltas:

$$14 \text{ GB} + 500 \times 0.04 \text{ GB} = 14 + 20 = 34 \text{ GB}$$

A ratio of about **206×**, and the shape of it is worth noticing: in (a) the cost scales with
customers, in (b) the *dominant* term doesn't. The base is a fixed cost you pay once no matter how
many customers you sign. (Sanity-check the 40 MB rather than trusting it: a 7B model has
$d = 4096$ and 32 layers, so $r = 16$ on the four attention projections is
$32 \times 4 \times 2 \times 4096 \times 16 = 16{,}777{,}216$ parameters — pleasingly, exactly as
many as a single $4096 \times 4096$ matrix — at 2 bytes each, about 34 MB. So "a few tens of
megabytes" is right, and the whole adapter is the size of one weight matrix out of hundreds.)

**But storage was never the interesting part.** Disk is cheap; 7 TB of disk is an afternoon's
expense. The number that decides whether the business exists is what happens in **GPU memory at
serving time**. Under (a), serving customer 37 means having customer 37's 14 GB resident on a GPU.
Two customers cannot share a batch, because they do not share weights. So either you dedicate GPUs
per customer — at which point a customer with light traffic is paying for an idle H100 — or you
swap models in and out of HBM per request, paying seconds of load time on a request that should
take milliseconds. Either way, 4.5's whole cost structure collapses: batch size goes to one, the
weight-haul (3.4) is amortized across a single request, and your per-token cost is orders of
magnitude above the posted price.

Under (b), one 14 GB base is resident, 500 adapters of 40 MB sit beside it (20 GB, or streamed on
demand in milliseconds), and requests from *different customers* can occupy slots in **the same
batch** — one weight-haul serving all of them. Per-token cost stays near base-model economics no
matter how fragmented your customer base is.

**The thing that exists only because of the second number:** the entire market for
custom-fine-tuned models as a *service* — per-customer models offered at near-commodity prices,
with no per-customer GPU. Under full fine-tuning, a bespoke model is necessarily an enterprise
contract with dedicated hardware. Under LoRA it is a line item. The economics of that product
category are not a business-model innovation; they are two thin matrices.`,
    },
    {
      type: 'text',
      md: md`
## The family, ranked by how much you should trust it

LoRA spawned a large literature, and the literature is not uniformly load-bearing. As a researcher
your job is not to know all the names — it is to know **which ones have earned adoption and which
are promising papers**, and to keep those categories separate. Here is my honest read as of now;
note that this is exactly the kind of ranking that moves, so re-check it rather than quoting it in
two years.

| variant | the idea | how established |
|---|---|---|
| **QLoRA** | freeze the base in 4-bit, train bf16 adapters on top | **standard issue** |
| **DoRA** | split the update into magnitude and direction, adapt each | real adoption, modest gains |
| **rsLoRA** | scale by $\alpha/\sqrt r$ instead of $\alpha/r$ | sound argument, narrow effect |
| **LoRA+** | different learning rates for $A$ and $B$ | promising, cheap to try |
| **PiSSA / OLoRA** | initialize $A, B$ from $W$'s own SVD instead of randomly | thinly replicated |

**QLoRA** is the only one I would call default. Lesson 4.4 owns the mechanism and I will not
re-derive it: the base is stored in 4 bits and only ever *read*, which is the regime where low
precision is fine, while all *accumulation* happens in the bf16 adapters, which is the regime where
it isn't. That accumulate-versus-read distinction is the whole design. It is in every major library,
it is what people mean by "fine-tuning a 70B on one GPU," and its quality cost is small and
well-characterized. Use it.

**DoRA** starts from a real observation: full fine-tuning and LoRA produce updates with different
*statistical signatures* — how much they change a weight vector's length versus its direction. So
decompose each weight column into a magnitude (a scalar) and a direction (a unit vector), and let
LoRA adapt the direction while a separate small parameter adapts the magnitude. Reported gains are
consistent but modest, and largest at low rank, which fits the story: it buys back a degree of
freedom the low-rank bottleneck was spending awkwardly. It costs extra compute during training. It
is implemented in mainstream libraries and it is a reasonable thing to reach for when $r = 8$ isn't
quite enough — but it is not a free lunch and it has not displaced plain LoRA.

**rsLoRA** is the $\alpha/\sqrt r$ argument from earlier. I like it because the reasoning is
transparent and checkable, and it makes a specific prediction: it should matter more as rank grows
and be nearly irrelevant at $r = 8$. That is a *falsifiable* shape, which is more than most
variants offer. Its effect is narrow by construction.

**LoRA+** is the observation that $A$ and $B$ are not symmetric — $B$ starts at zero and $A$
doesn't, they sit at different points in the network, and a scaling analysis suggests they want
different learning rates, typically with $B$'s substantially larger. Reported speedups are real but
task-dependent. It costs one extra hyperparameter and no compute, which makes it cheap to try and
cheap to abandon.

**PiSSA and the SVD-initialization family** ask a genuinely good question: why start $A$ *random*,
when $W$ itself tells you which directions matter? So initialize the adapter from $W$'s principal
singular components and subtract them from the frozen part — which, note, preserves the "start
exactly at base" property we derived, since you take out what you put in. Reported faster
convergence. But results here are **thinly replicated**, comparisons are often against
under-tuned baselines, and the honest position is "interesting, unproven." Treat it as an
experiment to run, not a default to adopt.

The meta-lesson matters more than the table. A large fraction of published improvements over a
strong, widely-tuned baseline evaporate when someone tunes the baseline as carefully as they tuned
their method. Plain LoRA has had years of collective hyperparameter attention; a new variant has
had one paper's worth. So the prior on "beats LoRA by 1%" should be skeptical, and the questions to
ask are always the same: *was the baseline tuned as hard as the method? has anyone independent
reproduced it? does the improvement have a shape the mechanism predicts?*
`,
    },
    {
      type: 'ponder',
      question: md`**Additivity has consequences you did not ask for.** You have two adapters for
the same base model: one trained to write in your company's voice, one trained to emit structured
JSON tool calls. Both are additive corrections to the same frozen $W$. So — can you just add both?
Write down what the combined weight matrix would be, work out what happens to the *rank* of the
combined update, and then explain why the result frequently disappoints even though the algebra is
flawless.`,
      answer: md`**The algebra is trivially fine.** Additivity composes:

$$W' = W + \frac{\alpha_1}{r_1} B_1 A_1 + \frac{\alpha_2}{r_2} B_2 A_2$$

and the combined update has rank at most $r_1 + r_2$ (exactly $r_1 + r_2$ if the two subspaces
don't overlap, less if they do). You can merge both, or serve both. Nothing breaks. Every library
supports it.

**And yet it often disappoints, for a reason that is about training, not algebra.** Each adapter
was optimized under the assumption that **it was the only correction present.** Adapter 1 found a
correction that is good *given the base model's behavior*; so did adapter 2. Neither ever saw a
gradient in a world where the other existed. When you stack them, every layer's input distribution
shifts — adapter 1 is now reading activations that adapter 2 has already perturbed, several layers
upstream. The detectors $\mathbf{a}_k$ that adapter 1 learned were calibrated against a distribution
that no longer holds. Their nudges $\mathbf{b}_k$ land somewhere slightly different than intended,
and small mis-landings compound through depth.

You can predict *when* it works, which is the useful part:

- **Small $\alpha/r$ scales, orthogonal-ish tasks, shallow behavioral changes** — usually fine. Two
  small nudges in unrelated directions barely see each other.
- **Strong adapters, or adapters that touch the same behavior** — often bad. Two corrections both
  fighting for control of output register will sum to something neither of them wanted, and the
  failure looks less like "half of each" than like a third, worse persona. Practitioners routinely
  find they need to down-weight each adapter (scale both by roughly half) to get anything usable,
  which is itself a diagnosis: the interference is roughly additive in magnitude.

**This is a doorway into a real research area, not a corner case.** The same additivity underwrites
**model merging** and **task arithmetic** — the finding that task-specific weight *differences*
behave somewhat like vectors you can add, subtract (subtract a "toxicity" delta to reduce
toxicity), and interpolate. Methods like TIES and DARE exist specifically to handle the collision
problem, mostly by resolving sign conflicts between deltas or by sparsifying them before adding so
they interfere less. Be honest about the state of it: **it demonstrably works better than it has
any right to, nobody has a satisfying theory of why, results are inconsistent across model families
and task pairs, and it is an active and somewhat messy literature.** Which makes it a good place to
do research, and a bad place to make production promises.

The deeper lesson to keep: additivity is what makes LoRA mergeable, serveable, and composable, and
composability is where it gets *interesting* rather than merely convenient. One property, three
consequences, and the third is still being figured out.`,
    },
    {
      type: 'text',
      md: md`
## When LoRA is not enough — and how you would know

Every restriction has a boundary, and a method's boundary is where you have to think. LoRA's
boundary follows directly from the bet: it can implement $r$ consistent read-write rules per matrix.
So it struggles precisely where the needed change is **not** a small set of consistent shifts:

- **Genuinely new knowledge.** Thousands of independent facts want thousands of independent
  directions. This is 5.4's key–value memory argument, and it is the cleanest case. (Also: even
  full fine-tuning is a mediocre way to install facts. If you want the model to know your product
  catalogue, the right answer is usually retrieval, not gradient descent.)
- **Big domain shift.** A new language, a new modality, a programming language absent from
  pretraining. Here you are not adjusting behavior — you are asking for representations the model
  does not have, and there is nothing consistent to shift.
- **Continued pretraining.** If you are running billions of tokens of new-domain text, you are
  doing pretraining, and pretraining changes everything about the model. Restricting it to rank 16
  is fighting your own objective.

Now the part that separates a practitioner from a vibes-haver. Those three categories are
*descriptions*, and in real work you will not know which category you're in. Your adapter is
underperforming — is that rank, modules, data, learning rate, or a genuinely LoRA-shaped
impossibility? You need a **diagnostic**, not a hunch. Here is one that actually discriminates.

**Test 1 — the tiny-subset capacity test.** Take 200 training examples. Train your LoRA config to
convergence on *just those 200*, with a generous learning rate and no early stopping. Separately,
full-fine-tune the same 200. Now compare **training** loss, deliberately, not validation loss.

Why this works: with only 200 examples, any sufficiently expressive model should drive training
loss to near zero — this is a *capacity* probe, and by making the dataset tiny you have removed
data volume and generalization from the picture entirely. If LoRA's training loss plateaus
meaningfully **above** full fine-tuning's, the hypothesis class is too small: you are rank-limited,
and no amount of extra data will fix it. If both go to nearly zero, capacity is *not* your problem
and every hour spent raising the rank is wasted — go fix the data (7.3).

**Test 2 — the rank ladder, run correctly.** Sweep $r \in$ 8, 16, 32, 64, 128 **holding
$\alpha/r$ fixed**. Say it twice, because getting this wrong invalidates the whole experiment: if
$\alpha$ stays constant while $r$ moves, you are sweeping the effective learning rate, not the
rank. If quality is still climbing at $r = 128$, you are rank-limited. If it flattened at $r = 16$
— which it usually does — rank is answered, and stop buying it.

**Test 3 — the module ladder, run first.** Before concluding anything about rank, compare
attention-only against all-linear-including-FFN at fixed rank. In my experience this moves results
more often than rank does, and an apparent "LoRA ceiling" is more frequently an
untouched two-thirds of the parameters (2.5) than a genuine rank limit.

**Test 4 — read the shape of the residual errors.** Look at *what* it is still getting wrong. If
the failures are format, tone, and structure, keep tuning. If the failures are the model not
*knowing* things — confidently wrong facts, invented product names, hallucinated APIs — no rank
will save you, because you have diagnosed a knowledge-shaped problem and rank is a behavior-shaped
tool. Retrieval or continued pretraining.

Notice the structure of all four: each one has an outcome that would tell you **you are wrong**.
That is the difference between a diagnostic and a vibe, and it is the same discipline 6.1 demanded
of interpretability claims. Point at the number that would change your mind, in advance.
`,
    },
    {
      type: 'example',
      title: 'a diagnostic run, worked end to end',
      md: md`
You are adapting a 7B model to draft internal incident reports. You have 4,000 examples. LoRA at
$r = 16$ on attention only, $\alpha = 32$, gets you to validation loss 1.42, and the outputs are
"close but not right." Someone suggests $r = 256$. Run the diagnostic instead.

**Test 1 — tiny-subset capacity.** 200 examples, train both to convergence:

| run | final *training* loss on the 200 |
|---|---|
| LoRA $r = 16$, attention only | 0.31 |
| full fine-tune | 0.04 |

A real gap. So capacity *is* implicated — but do not stop here and buy rank, because "capacity"
covers both rank and module coverage, and you have only tested one configuration.

**Test 3 next, because it is cheaper than Test 2.** Same 200 examples, same rank, add the FFN
matrices:

| run | final training loss on the 200 |
|---|---|
| LoRA $r = 16$, attention only | 0.31 |
| LoRA $r = 16$, **all linear layers** | 0.06 |
| full fine-tune | 0.04 |

There it is. The ceiling was never rank — it was that you were adapting one third of the model.
Adding FFN closed roughly 90% of the gap at *identical* rank, and if you had jumped to $r = 256$
on attention only, you would have spent 16× the trainable parameters chasing a limitation that
lived somewhere else entirely.

**Test 2, now, on the full data, done properly.** Sweep rank with all-linear targeting, holding
$\alpha/r = 2$ fixed — so $\alpha = 16, 32, 64, 128$ as $r = 8, 16, 32, 64$:

| $r$ | $\alpha$ | validation loss |
|---|---|---|
| 8 | 16 | 1.19 |
| 16 | 32 | 1.11 |
| 32 | 64 | 1.09 |
| 64 | 128 | 1.09 |

Flat by $r = 32$. Rank is answered: take $r = 16$ or 32 and stop. Note what the sweep would have
looked like with $\alpha$ pinned at 32 throughout — effective scale sliding 4, 2, 1, 0.5 — a
"declining returns to rank" curve that is entirely an artifact of your own configuration, and a
conclusion you would have believed.

**Test 4.** Read the remaining errors. They are timestamp formats and section ordering — *format*
failures. Behavior-shaped, so more data and better data (7.3) is the lever, not more rank.

**What the run cost:** four short training jobs on 200 examples, plus a four-point sweep. What it
bought: you did not spend a week and a large GPU bill on $r = 256$, and you know what to do next.
That is what a diagnostic is for.
`,
    },
    {
      type: 'text',
      md: md`
## Two roads not taken (briefly, and why)

For completeness, because you will meet these names and should know why they are historical rather
than current. **Prompt tuning** learns a handful of trainable "virtual token" embeddings prepended
at the input; **prefix tuning** goes further, learning trainable key and value vectors prepended to
the attention of *every* layer. Both are elegant — you change no weights at all, only what the
model reads. **(IA)³** takes a different angle again: learn three vectors per block that rescale
keys, values, and the FFN hidden activations elementwise, which is astonishingly few parameters.

Why LoRA won. Prompt and prefix tuning **consume context**: the virtual tokens occupy sequence
positions on every single forward pass, forever, which costs attention compute and takes back part
of the context window you sold to the customer. They **cannot be merged** — the extra tokens are
structurally present at inference, so unlike LoRA there is no version of them that is free. And
they were notoriously **optimization-sensitive**, often working well only at large scale or after
delicate tuning. (IA)³ dodges the first two problems — elementwise rescaling folds into the weights
just fine — but a per-channel gain is a *diagonal* edit, which is a far more restrictive hypothesis
than a rank-$r$ one: it can turn existing directions up and down but cannot create a new
detector–nudge pair. It is a fine method that never gathered ecosystem momentum.

The pattern is worth extracting, because it will repeat with the next generation of methods:
**the method that won was the one whose restriction had no deployment cost.** All of these are
parameter-efficient. Only LoRA is *also* inference-free and mergeable and serveable-in-bulk. When
you evaluate the next efficient-adaptation paper, check the training savings, then immediately ask
what it does to the inference path. That second question decides adoption.

## What you now own

1. **The reframing:** every cheap fine-tuning method is a *restriction*, and therefore a hypothesis
   about the shape of the change you need. Name the hypothesis and you can name the failure mode.
2. **The bet, derived:** $\Delta W \mathbf{x} = (\mathbf{a}\cdot\mathbf{x})\mathbf{b}$ — a rank-1
   update is one detector plus one nudge, so a rank-$r$ update is $r$ consistent read-write rules.
   Persona and format are exactly that shape; memorised facts are exactly not.
3. **Its evidence and its limits:** intrinsic-dimensionality results are real and surprising
   (better pretraining lowers intrinsic dimension) but were measured elsewhere; and LoRA needs only
   that *a* good low-rank solution exists, not that the full fine-tune's update was low-rank.
4. **The mechanics, from first principles:** $B = 0$ so you start *exactly* at the base model; $A$
   nonzero so gradients live, because each factor's gradient is proportional to the other; and
   $\alpha/r$ so that rank and learning rate stay independent knobs — with $\alpha/r$, not
   $\alpha$, being the number that matters.
5. **The arithmetic:** 16.8M to 131k per matrix, 128×; ~40M trainable across a 70B; 1.12 TB of
   optimizer state to 640 MB. One division.
6. **Merging, both ways:** fold it in for zero inference cost, or keep it out and serve thousands
   of customers from one base — the second being the reason an entire product category exists.
7. **The family, ranked honestly:** QLoRA standard; DoRA and rsLoRA real but modest; LoRA+ cheap to
   try; PiSSA-style SVD init unproven. And the prior that improvements over a well-tuned baseline
   usually shrink under scrutiny.
8. **A diagnostic, not a vibe:** tiny-subset capacity test, module ladder, rank ladder with
   $\alpha/r$ held fixed, and reading the shape of what's still wrong.

And notice where every one of those tests bottomed out. Rank was answered by $r = 32$. Modules were
answered by adding the FFN. What is left, every time, is the data — how many examples, of what,
written how, and how do you know they're any good?

Next lesson: **7.3, the data** — the part that actually decides whether your fine-tune works, and
the part everyone skips.
`,
    },
  ],
  questions: [
    {
      id: 'm7-l2-q1',
      kind: 'mcq',
      prompt: md`LoRA scales its update by $\alpha/r$ rather than by $\alpha$ alone. What does
dividing by the rank actually buy you?`,
      options: [
        md`It keeps the effective magnitude of the update roughly constant as $r$ changes, so the rank and the learning rate stay independent knobs`,
        md`It shrinks the adapter file, since dividing by $r$ reduces the number of stored parameters`,
        md`It prevents overfitting by damping the gradients that reach $A$ and $B$`,
        md`It normalizes the activations passing through the adapter, playing the same role as LayerNorm`,
      ],
      answer: 0,
      explain: md`$BA$ is a sum of $r$ rank-1 terms, each learned to roughly the same typical
magnitude, so the total grows with $r$; dividing by $r$ normalizes it. The payoff is *knob
independence*: raise $r$ from 8 to 64 and your tuned learning rate still applies. Option B confuses
the scale with the shape — the parameter count is $2dr$ regardless of $\alpha$, and no scalar
changes it. Option C is the seductive one, because $\alpha/r$ *does* multiply the gradients (look at
the two derivatives — both carry the factor), so it feels like damping; but a uniform rescale of an
update is a *learning-rate* effect, not a regularizer, which is exactly the point — the scaling
exists so that effect stays constant instead of drifting with $r$. Option D describes a
normalization layer, which recomputes statistics per input; $\alpha/r$ is a fixed constant chosen
before training ever starts.`,
    },
    {
      id: 'm7-l2-q2',
      kind: 'numeric',
      prompt: md`One $4096 \times 4096$ attention projection. A full fine-tune trains every entry;
LoRA at $r = 16$ trains $B$ of shape $4096 \times 16$ and $A$ of shape $16 \times 4096$. By what
**factor** does LoRA reduce the trainable-parameter count for this matrix? (Work it on paper.)`,
      answer: 128,
      tolerance: 2,
      explain: md`Full: $4096^{2} = 16{,}777{,}216$. LoRA: $2 \times 4096 \times 16 = 131{,}072$.
Ratio $= 16{,}777{,}216 / 131{,}072 = 128$. Worth seeing the algebra rather than the arithmetic,
because it tells you how the saving scales: the ratio is $d^{2} / (2dr) = d/(2r)$, so it is linear
in the hidden size and inversely linear in the rank. At $d = 4096$, $r = 16$ that is
$4096/32 = 128$. It also tells you instantly where the saving dies: $r = d/2$ gives a factor of 1,
and beyond that LoRA stores *more* than the matrix it is approximating — which is precisely what
the visualization's third experiment makes you watch happen.`,
    },
    {
      id: 'm7-l2-q3',
      kind: 'numeric',
      prompt: md`**Fermi (paper, no calculator until the last step).** You apply LoRA at $r = 16$ to
the four attention projections ($Q$, $K$, $V$, $O$) in *every* layer of a 70B-class model. Take it
as roughly 80 layers with a hidden size of 8192, and treat all four projections as square
$8192 \times 8192$ matrices. Roughly how many trainable parameters is that, **in millions**? The
tolerance is wide on purpose — the point is to land on the right order of magnitude, not the right
digits.`,
      answer: 84,
      tolerance: 45,
      explain: md`Build it up one factor at a time. Per matrix: $2 \times 8192 \times 16 = 262{,}144$.
Four matrices per layer: $\approx 1.05$ million. Eighty layers:
$80 \times 1.05 \times 10^{6} \approx 8.4 \times 10^{7}$ — about **84 million**.

Now the sanity check that is the actual point of the exercise: 84M against 70B is **0.12%**. Tens
of millions, not tens of billions — three orders of magnitude, which is the difference between a
cluster booking and an overnight run.

Two honest refinements, both worth knowing. Real 70B models use **grouped-query attention** (3.3),
which makes $K$ and $V$ far narrower than $8192 \times 8192$ — recomputing with $K, V$ at
$8192 \times 1024$ gives about 65M, so the square assumption over-counts. And if you also adapt the
FFN matrices, which the lesson argues you usually should, the count goes up substantially again
since the FFN is two-thirds of the parameters (2.5). All three numbers — 65M, 84M, and the
with-FFN figure — are the same answer to the only question that matters here: tens of millions.`,
    },
    {
      id: 'm7-l2-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, and without looking back at the lesson, derive
the LoRA initialization rule from scratch. (1) Write the forward pass of an adapted layer and the
gradients with respect to $A$ and $B$, and state in one sentence what structural feature those two
expressions share. (2) Using only those expressions, work out both properties — *does the model
start at base?* and *does anything get a gradient?* — for all four initialization corners: both
random, both zero, $A$ zero with $B$ random, $A$ random with $B$ zero. (3) State the correct general
rule, which is weaker than the one usually quoted, and identify which of the four corners is
commonly described incorrectly.`,
      rubric: md`**(1) The setup.** Forward:
$\mathbf{h} = W\mathbf{x} + \frac{\alpha}{r}B(A\mathbf{x})$. Gradients, with $\mathbf{g}$ the
gradient arriving at the output:

$$\frac{\partial \mathcal{L}}{\partial B} = \frac{\alpha}{r}\mathbf{g}(A\mathbf{x})^{\top},
\qquad
\frac{\partial \mathcal{L}}{\partial A} = \frac{\alpha}{r}B^{\top}\mathbf{g}\,\mathbf{x}^{\top}$$

The structural feature: **each factor's gradient is proportional to the other factor.** (Credit for
naming this as the generic property of a product parameterization.)

**(2) The four corners.**

| init | starts at base? | gradients alive? | verdict |
|---|---|---|---|
| both random | **no** — $BA \ne 0$ | yes | perturbs a pretrained model for nothing |
| both zero | yes | **no** — both vanish | dead fixed point, permanently |
| $A = 0$, $B$ random | yes | **$A$ yes**, $B$ no (at step 0) | works — the mirror choice |
| $A$ random, $B = 0$ | yes | **$B$ yes**, $A$ no (at step 0) | the standard choice |

Both-zero must be argued, not asserted: $\partial \mathcal{L}/\partial B \propto A\mathbf{x} = 0$
and $\partial \mathcal{L}/\partial A \propto B^{\top} = 0$, so nothing moves; since nothing moved,
the same holds next step, forever.

**(3) The rule.** *Exactly one of $A$, $B$ must be zero.* Both zero is stationary; neither zero
destroys the "start at base" property. The corner commonly described incorrectly is **$A$ zero with
$B$ random**: it is routinely claimed to be dead by analogy with the both-zero case, but
$\partial \mathcal{L}/\partial A = \frac{\alpha}{r}B^{\top}\mathbf{g}\mathbf{x}^{\top} \ne 0$ when
$B \ne 0$, so $A$ moves immediately and $B$ follows on the next step.

**Grading.** "Nailed it" requires: both gradient expressions written down; the proportionality
observation stated; all four corners evaluated on *both* criteria; and the third corner correctly
identified as viable. Writing "$A$ random, $B$ zero" with a fluent-sounding justification but no
gradient expressions is exactly the recall this question is built to defeat — mark it partial at
best, however confident it sounds.`,
    },
    {
      id: 'm7-l2-q5',
      kind: 'mcq',
      prompt: md`Why does a merged LoRA add **exactly zero** inference latency, while pre-LoRA
bottleneck adapters (small trainable modules inserted between frozen layers) always cost something?`,
      options: [
        md`Because LoRA adapters have far fewer parameters, so their extra matrix multiply is negligible`,
        md`Because the LoRA update is *additive* to $W$, so $W + \frac{\alpha}{r}BA$ can be computed once in advance and shipped as a single matrix of the original shape — there is no extra operation at all, whereas an inserted module is a genuinely extra sequential op on every token`,
        md`Because LoRA adapters are quantized to 4 bits at deployment while bottleneck adapters run in bf16`,
        md`Because LoRA adapters run in parallel with the frozen layer on a separate CUDA stream, hiding their cost`,
      ],
      answer: 1,
      explain: md`The word doing all the work is *additive*. Fold the sum in ahead of time and what
ships is a $d \times d$ matrix indistinguishable from the original — same kernels, same schedule,
same bytes hauled (3.4). Option A is the trap, and it is a wrong answer to a question it seems to
answer well: "small and therefore cheap" would give you *nearly* zero, not *exactly* zero, and it
would be false in the regime that matters — an inserted op that is tiny in FLOPs is still a separate
kernel launch with its own memory round-trip, which in a bandwidth-bound decode loop is the
expensive part precisely *because* there is so little arithmetic to amortize it against. Option C
confuses QLoRA's training-time storage trick (4.4) with deployment. Option D describes something
that sounds sophisticated but cannot work for an operation whose output the next layer must wait
for. Note that the exact-zero claim only holds for the *merged* configuration: served unmerged,
LoRA does cost a little — that is the price you knowingly pay for multi-tenancy.`,
    },
    {
      id: 'm7-l2-q6',
      kind: 'numeric',
      prompt: md`A LoRA configuration on a 70B model leaves **40 million** trainable parameters, with
the base entirely frozen. Using lesson 4.1's figure of 16 bytes of training state per *trainable*
parameter, how much optimizer-and-gradient state does the run carry, **in megabytes**? (Take 1 MB
as $10^{6}$ bytes.)`,
      answer: 640,
      tolerance: 20,
      explain: md`$4 \times 10^{7} \times 16 = 6.4 \times 10^{8}$ bytes $= 640$ MB. Set it beside
the full fine-tune's $70 \times 10^{9} \times 16 = 1.12$ TB and the ratio is about **1,750×** — a
terabyte of optimizer state becoming a rounding error.

The step people miss is *why* 16 bytes/param applies only to the 40M. The frozen base has no
gradient buffer, no fp32 master copy, and no Adam first or second moment, because none of those
exist for a parameter that never receives an update — it is read-only, exactly the regime 4.4 says
tolerates aggressive quantization. So the base contributes only its own weights (140 GB at bf16, or
about 35 GB in 4 bits), and the *training* machinery scales with the tiny number, not the huge one.`,
    },
    {
      id: 'm7-l2-q7',
      kind: 'mcq',
      prompt: md`A provider serves 500 customer-specific fine-tunes of one 7B base model and keeps
every adapter **unmerged**. From lesson 4.5's serving economics, what is the decisive advantage —
the one that decides whether the product is viable at all?`,
      options: [
        md`It saves disk: 34 GB of storage instead of 7 TB`,
        md`Unmerged adapters can be updated without redeploying the base model`,
        md`One copy of the weights stays resident in GPU memory, so requests from *different* customers can share a batch — the weight-haul is amortized across all of them and per-token cost stays near base-model economics`,
        md`Unmerged adapters can be applied at lower precision than merged ones, reducing memory bandwidth`,
      ],
      answer: 2,
      explain: md`Option A is true and nearly irrelevant, which is what makes it the best distractor
— 7 TB of disk is trivially affordable, and if storage were the whole story nobody would bother.
The binding constraint is HBM at serving time: 4.5 says profitability is throughput, throughput is
batch size, and batch size is bounded by what fits in GPU memory. Per-customer weights mean
per-customer GPUs (or a multi-second model load on a millisecond request), batch size collapses
toward one, and 3.4's fixed weight-haul is amortized across a single request. Shared weights mean
500 customers can occupy slots in one batch. Option B is a genuine operational convenience but not
an economic threshold. Option D invents a precision property that unmerging does not confer.`,
    },
    {
      id: 'm7-l2-q8',
      kind: 'numeric',
      prompt: md`A full fine-tune's update matrix $\Delta W$ is decomposed by SVD, and its top
singular values come out as $10, 6, 3, 2, 1, 1, 1, 1$. The fraction of the update captured by a
rank-$r$ approximation is measured by **squared** singular values (that is the Frobenius energy,
and it is what the visualization's readout reports). What is the smallest rank $r$ that captures at
least **90%** of the update?`,
      answer: 3,
      tolerance: 0.4,
      explain: md`Square them: $100, 36, 9, 4, 1, 1, 1, 1$, totalling **153**. Cumulative fractions:
$r = 1$ gives $100/153 = 65.4\%$; $r = 2$ gives $136/153 = 88.9\%$; $r = 3$ gives
$145/153 = 94.8\%$. So **$r = 3$**.

Two ways to get this wrong, both instructive. Answering $r = 2$ means you saw 88.9% and let it
round — but the threshold was stated, and in a real capacity decision the difference between "just
under" and "just over" is exactly the thing you are measuring. Answering $r = 7$ means you summed
the singular values *unsquared* ($25$ total, needing seven terms to pass 90%) — a real and common
slip, and note how badly it misleads: raw values decay far more gently than their squares, so the
unsquared reading makes every spectrum look much less low-rank than it is. The energy convention is
not arbitrary bookkeeping; it is the Frobenius norm, which is the quantity Eckart–Young's optimality
theorem is actually about.`,
    },
    {
      id: 'm7-l2-q9',
      kind: 'written',
      prompt: md`**The diagnostic.** Your LoRA fine-tune underperforms and a colleague proposes
jumping from $r = 16$ to $r = 256$. Design the experiment you would run *first*, in enough detail
that someone could execute it. Your answer must include: (1) a test that isolates **capacity** from
data volume and generalization, and an explanation of why your design isolates it; (2) the one
configuration mistake that would silently invalidate a rank sweep, and how you avoid it; (3) the
cheaper hypothesis you should rule out before touching rank at all; and (4) for each test, the
specific outcome that would tell you your colleague is *right* — and the outcome that would tell
you they are wrong.`,
      rubric: md`**(1) The capacity test.** Train on a deliberately tiny subset (~200 examples) to
convergence with a generous learning rate, and compare **training** loss against a full fine-tune on
the same 200. Why this isolates capacity: with 200 examples, any adequately expressive model can
drive training loss to near zero, so data volume and generalization have been removed from the
picture by construction — a persistent plateau can only be a limitation of the hypothesis class.
Credit specifically for using *training* loss and for saying why the subset must be small.
(Comparing validation loss here is a common and fatal substitution: it re-imports the two variables
the design exists to eliminate.)

**(2) The invalidating mistake.** Sweeping $r$ while holding $\alpha$ fixed. The effective scale is
$\alpha/r$, so a fixed $\alpha$ across $r = 8 \ldots 128$ slides the effective learning rate by
16× — you would be measuring the optimizer, not the rank, and would very likely manufacture a
convincing "diminishing returns to rank" curve. Avoid it by holding $\alpha/r$ constant (e.g.
$\alpha = 2r$).

**(3) The cheaper hypothesis to rule out first.** Module coverage. Attention-only leaves the FFN —
two-thirds of the parameters (2.5) — entirely frozen. Compare attention-only against all-linear at
*fixed* rank before spending anything on rank. Credit for noting this is both cheaper and more
often the culprit.

**(4) Falsifiable outcomes, per test.** *Capacity test:* a large LoRA-vs-full training-loss gap on
the 200 supports the colleague; both converging to near zero refutes them outright, since capacity
is demonstrably sufficient and the problem lies in data or optimization. *Module test:* if
all-linear at $r = 16$ closes most of the gap, the colleague is wrong and the diagnosis was module
coverage. *Rank ladder (with $\alpha/r$ fixed):* still improving at $r = 128$ supports them; flat by
$r = 32$ refutes them. Bonus credit for a fourth read — inspecting *what* remains wrong, since
knowledge-shaped failures (wrong facts, invented APIs) point to retrieval or continued pretraining
rather than to any rank at all.

**Grading.** "Nailed it" requires all four parts, with (1) justified rather than merely stated and
(4) genuinely two-sided. An answer where every listed outcome confirms the plan is a demonstration,
not a diagnostic.`,
    },
    {
      id: 'm7-l2-q10',
      kind: 'mcq',
      prompt: md`Someone shows you a paper: they took a full fine-tune, subtracted the base weights,
ran an SVD on the difference, and found a long tail of non-negligible singular values — the update
is *not* well approximated by rank 16. They conclude that LoRA's premise is refuted. What is the
strongest objection?`,
      options: [
        md`SVD is numerically unreliable on matrices this large, so the spectrum cannot be trusted`,
        md`LoRA never claimed the full fine-tune's update is low-rank — only that *some* low-rank update exists that works, which is a much weaker claim, since many different weight configurations produce good behavior and LoRA only needs to find one inside its family`,
        md`Singular values should be compared unsquared, which would make the tail look smaller`,
        md`Fine-tuning updates are low-rank only after merging, so the measurement was taken at the wrong point`,
      ],
      answer: 1,
      explain: md`This is the single most useful distinction in the lesson, and it is an
existential-versus-universal confusion. "The path SGD happened to take was high-rank" and "no
low-rank path exists" are different statements, and only the second would refute anything. Loss
landscapes have vast connected regions of good solutions; full fine-tuning wanders through 70
billion dimensions with no incentive whatsoever to stay low-rank, so its trajectory picking up a
long tail is *expected* and carries almost no information about what LoRA could find. Option A is a
plausible-sounding smear on a numerically well-behaved algorithm — resist reaching for "the method
is unreliable" when you can attack the inference instead. Option C is backwards: unsquared values
decay more *gently*, making the tail look worse, and squared energy is the right convention anyway
(it is the Frobenius norm Eckart–Young optimality is stated in). Option D is fabricated — merging is
a deployment step and changes no mathematics. Note what the honest position still concedes: the
observation is real and worth knowing, it just does not support the conclusion drawn from it.`,
    },
    {
      id: 'm7-l2-q11',
      kind: 'written',
      prompt: md`**Research judgment.** A teammate proposes standardizing your team on a new LoRA
variant that reports a 1.5% quality gain over plain LoRA in its paper. Write the case for caution
and the path to a decision: (1) name three concrete reasons a reported gain over plain LoRA is
harder to trust than the same gain over most other baselines; (2) design **two falsifiable
checks** — experiments whose outcome could genuinely go either way — that would raise or lower your
confidence; (3) place QLoRA, DoRA, rsLoRA, LoRA+, and PiSSA-style SVD initialization into "adopt by
default," "reasonable to reach for," and "run as an experiment," and justify one placement in each
tier; (4) state in one sentence what would make you change the tiering.`,
      rubric: md`**(1) Three reasons** (any three, each with its mechanism):

- **Baseline-tuning asymmetry.** Plain LoRA has absorbed years of collective hyperparameter
  attention; a paper's baseline has had one team's worth. Gains over an under-tuned strong baseline
  are the single most common way improvements evaporate on contact with practice.
- **The $\alpha/r$ confound specifically.** If the comparison did not hold effective scale fixed,
  part of any "gain" is a learning-rate difference in disguise — and this is unusually easy to get
  wrong here.
- **Narrow evaluation surface.** Gains often appear on a handful of benchmarks, one model family,
  one data scale; LoRA's use is far broader than any paper's evaluation.
- **Selective reporting / researcher degrees of freedom.** The reported configuration is typically
  the best of many tried for the method and one of few tried for the baseline.
- **Magnitude versus noise.** 1.5% on a small eval may sit inside seed-to-seed variance; if seed
  variance was not reported, the number is not yet a result.

**(2) Two falsifiable checks** — the requirement is that failure is possible and informative.
Strong designs: **matched-budget head-to-head on your own task**, with equal hyperparameter search
effort spent on both arms and multiple seeds, pre-registering that a gap inside seed variance
counts against adoption; **mechanism-shaped prediction** — the variant's own story predicts *where*
it should help (rsLoRA should help more as $r$ grows and be irrelevant at $r = 8$; DoRA should help
most at low rank), so test at both ends and treat a flat-everywhere or backwards-shaped result as
evidence against, since a real mechanism has a shape; **independent-reproduction survey** — check
whether anyone outside the original group has replicated it, and on what. Credit is for
pre-registering the disconfirming outcome, not for the experiment's existence.

**(3) Tiering** (this is the expected placement; a different one is acceptable if defended on
evidence rather than novelty):

- *Adopt by default:* **QLoRA** — mechanism understood from first principles (read-only base
  tolerates 4-bit; accumulation stays in bf16 adapters, 4.4), universal library support, quality
  cost small and well-characterized, and it changes the *feasibility frontier* rather than nudging a
  metric.
- *Reasonable to reach for:* **DoRA** and **rsLoRA** — real adoption and coherent mechanisms, but
  modest and conditional gains (DoRA mainly at low rank, and it costs training compute; rsLoRA
  mainly at high rank, by construction).
- *Run as an experiment:* **LoRA+** (cheap to try, one extra hyperparameter, gains task-dependent)
  and **PiSSA / OLoRA-style SVD init** (good question, plausible mechanism, thinly replicated —
  interesting, unproven).

**(4) What would change it.** Independent reproductions on model families and data scales you care
about, at matched tuning budget, showing a gain with the shape the mechanism predicts — or, in the
other direction, a careful negative result on a well-tuned baseline demoting something a tier.

**Grading.** "Nailed it" requires three mechanisms in (1), genuinely two-sided checks in (2), and a
tiering in (3) justified by *evidence quality* rather than by recency or elegance. Ranking by how
clever the idea sounds is precisely the failure this question exists to catch.`,
    },
    {
      id: 'm7-l2-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old.** A kid asks: "If the AI already knows everything,
why can't you just teach it to talk like your company without a giant computer?" Explain, in
kid-words: (1) why changing the whole AI is so expensive (make the *size* concrete, don't just say
"big"); (2) why the change you actually want is *small* — and what makes it small, not just few
words but a specific *shape*; (3) the trick that lets you write down only the small change; and
(4) why you can hand the same trick to a thousand different companies at once. You may invent your
own analogy — inventing a better one is worth more than borrowing the lesson's. No jargon unless
you explain it in kid-words first.`,
      rubric: md`Grade the *teaching*, not the vocabulary. The beats:

1. **Size, made concrete.** The AI is a machine with billions of tiny dials — more dials than
   there are seconds in a hundred lifetimes. Changing every dial means having every dial in front
   of you at once, plus a notebook per dial remembering how it's been moving (the optimizer, in
   kid-words), and that is a room full of expensive computers. A number or a countable image is
   required; "it's really big" is not the beat.
2. **The shape of the wanted change.** Crucially not just "it's a small change" but *why*: the
   change is the **same adjustment applied every time** — "be a bit more serious, always sign off
   the same way" — rather than a million separate little corrections. Good analogies: tinting every
   window in a house with one shade of film versus repainting each room a different colour; a
   recipe where you add one spice to everything versus rewriting every recipe; a pair of glasses
   you put on rather than new eyes. The key idea the kid must end up with: *one consistent tweak,
   used everywhere* is cheap to describe; *a thousand unrelated tweaks* is not.
3. **The trick.** Instead of rewriting the machine, you write a tiny note beside it — a short list
   of "when you see this, lean that way" rules — and the machine adds your note to what it already
   knew. Because it is only *added on*, you can also stir it in permanently afterwards and the
   machine runs at exactly its normal speed. Credit for getting the *adding* idea across, since
   that is what everything else depends on.
4. **A thousand companies at once.** The giant machine is kept in one place, and each company's
   note is small enough to carry in a pocket. So the expensive part is shared by everybody, and
   only the cheap notes are different — like one enormous library that everyone shares, where each
   visitor brings their own small card of reading instructions.

**Jargon audit.** "Rank," "low-rank," "matrix," "adapter," "parameters," "fine-tuning," "optimizer
state" used without a kid-level translation first = **partial at best**, regardless of how good the
rest is. Hiding behind vocabulary is the exact failure this exercise is built to detect — and it is
the failure mode you are most at risk of *right after* a technical lesson, when the words feel
transparent to you and are opaque to everyone else.`,
    },
  ],
}
