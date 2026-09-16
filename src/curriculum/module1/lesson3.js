// Module 1, Lesson 3 — Calculus: derivatives, gradients, backpropagation (Feynman rewrite)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm1-l3',
  title: '1.3 Calculus — how 7 billion knobs learn',
  subtitle: md`A language model is a machine with seven billion knobs and one output: a single number saying how wrong it is. To learn, it must discover — for every individual knob — which way to turn, and by how much. Seven billion questions, answered afresh a million times. This lesson is how that is even possible.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

A language model is a machine with knobs — $7{,}000{,}000{,}000$ of them for a smallish one. Feed it
a page of text and out comes one number, the **loss**: how wrong its predictions of the next word
were. Training is nothing more mysterious than *turning the knobs to make that number go down*.

Now feel the actual problem. To turn the knobs well, you need to know, for **every single one of the
seven billion**: does turning *this* knob up make the loss better or worse? And by how much? That's
seven billion questions. Worse — the moment you turn the knobs, all seven billion answers go stale,
and you need a fresh set. A real training run does this about a million times.

How could you possibly answer seven billion questions, a million times over?

The honest first idea is the right place to start: *wiggle a knob and watch what happens to the
loss*. Hold onto that idea — it is exactly right about **what to measure**, and catastrophically
wrong about **how to measure it**, by a factor of about three and a half billion. This lesson does
two things: makes wiggle-and-watch precise, and then finds the trick that answers all seven billion
questions for the price of about two.

## One knob first: wiggle it and watch

Strip everything away. One knob $x$, one output $f(x) = x^2$. Set the knob to $x = 3$, so the output
reads $9$. Now wiggle: nudge the knob to $3.01$ and the output becomes $9.0601$. The output moved
$0.0601$ for an input move of $0.01$ — the machine *amplified* our wiggle by a factor of about
$6.01$.

Suspicious of that stray $.01$? Wiggle more gently. Nudge $3 \to 3.001$: output $9.006001$, a move
of $0.006001$, amplification $6.001$. Gentler still, and the ratio keeps settling: $6.0001$,
$6.00001$, closing in on exactly $6$. The junk shrinks with the wiggle; the ratio it settles on is a
property of the machine itself, at this knob setting. That settled number is the **derivative**.

You can catch the pattern red-handed with one line of algebra. Nudge $x$ by $h$:

$$(x+h)^2 - x^2 = 2xh + h^2, \qquad \text{so the ratio is } \frac{2xh + h^2}{h} = 2x + h$$

As the wiggle $h$ shrinks to nothing, the ratio becomes exactly $2x$. At $x = 3$: our $6$. You have
just *derived* that the derivative of $x^2$ is $2x$ — not memorized it. Only now does the official
notation arrive, as a name for the thing we were already doing:

$$f'(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}$$

And the reading to burn into your head is the one we started with:

> **Nudge $x$ by a tiny $\varepsilon$, and $f$ moves by approximately $f'(x)\cdot\varepsilon$.**

The derivative is an *amplifier setting*: how strongly the output responds to a wiggle of the input,
**right here**, at this particular $x$. It is a local statement — at $x = 100$ the same $f(x)=x^2$
amplifies by $200$, over thirty times more touchy than at $x = 3$.

The handful of derivatives this course actually uses, each one verifiable by the nudge test on a
calculator (do it — the habit pays for itself later):

| $f(x)$ | $f'(x)$ | worth noticing |
|---|---|---|
| $x^n$ | $n x^{n-1}$ | powers step down |
| $e^x$ | $e^x$ | its own derivative |
| $\ln x$ | $1/x$ | appears inside cross-entropy loss |
| $\mathrm{relu}(x) = \max(0, x)$ | $1$ if $x > 0$, else $0$ | passes wiggles untouched, or kills them dead |
| $\sigma(x) = 1/(1+e^{-x})$ | $\sigma(x)(1 - \sigma(x))$ | never exceeds $1/4$ — file this away for the end of the lesson |

> **Why you should care:** replace $x$ with one weight $w$ of an LLM and $f$ with the loss.
> $\partial L/\partial w = -3$ is a complete, quantitative answer to our puzzle *for that knob*:
> raise $w$ by $0.001$ and the loss drops by about $0.003$ — so turn it up. One knob answered.
> $6{,}999{,}999{,}999$ to go.
`,
    },
    {
      type: 'text',
      md: md`
## All the knobs: partial derivatives and the gradient

With many knobs, wiggle **one while freezing the rest**. That's all a *partial derivative* is. Try
it on $f(x, y) = x^2 y$ at the point $(3, 2)$, where $f = 18$. Freeze $y = 2$, nudge
$x: 3 \to 3.01$: the output becomes $(3.01)^2 \times 2 = 18.1202$ — a move of $0.1202$, so the
$x$-sensitivity is about $12$. Freeze $x = 3$, nudge $y: 2 \to 2.01$: output
$9 \times 2.01 = 18.09$ — a move of $0.09$, sensitivity $9$. The calculus shortcut agrees:

$$\frac{\partial f}{\partial x} = 2xy = 12 \qquad \frac{\partial f}{\partial y} = x^2 = 9$$

(differentiate treating the other variable as a constant — that's the "freeze" in symbols). The
curly $\partial$ just means "wiggle this one, hold the others."

Now stack every knob's sensitivity into one long list:

$$\nabla f = \left( \frac{\partial f}{\partial x_1}, \frac{\partial f}{\partial x_2}, \dots, \frac{\partial f}{\partial x_d} \right)$$

This is the **gradient** — and notice what kind of object it is: a *vector*, the very thing lesson
1.1 taught you to think of as an arrow. For an LLM, the gradient of the loss is a list of seven
billion numbers, one per knob: the complete answer sheet to our puzzle. (How to *compute* the sheet
cheaply is the second half of the lesson. First: what do you do with it?)

## Which way is downhill in 7 billion dimensions?

Take a tiny step: knob $i$ moves by some small amount $u_i$. To first order, each knob's wiggle
contributes independently — its sensitivity times its move — and the contributions just add:

$$\Delta f \;\approx\; \frac{\partial f}{\partial x_1} u_1 + \frac{\partial f}{\partial x_2} u_2 + \cdots \;=\; \nabla f \cdot \mathbf{u}$$

Look at what appeared. The change in loss is a **dot product** — lesson 1.1's agreement meter —
between your step and the gradient. Steps that *agree* with the gradient raise the loss; steps that
*disagree* lower it; the more perfectly they disagree, the faster it falls. So the best possible
move is the step that points **exactly opposite the gradient**, and the update that trains every
neural network in existence writes itself:

$$\theta \;\leftarrow\; \theta - \eta\, \nabla L(\theta)$$

where $\eta$ is a small positive step size, the *learning rate* (its entire science is lesson 1.6).

> **This is what "the model learns" literally means.** Compute the seven-billion-entry answer sheet
> on a batch of text, move every knob a tiny distance against its own sensitivity, repeat on the
> order of a million times. Every parameter update ever applied to GPT-4 or Claude was one
> execution of this line. There is no other mechanism.
`,
    },
    {
      type: 'ponder',
      question: md`We built $\nabla f$ as pure bookkeeping — wiggle knob 1, write it down; wiggle
knob 2, write it down. Nothing in the construction ever mentioned *direction*, yet everyone says
"the gradient points steepest uphill." Among **all** possible unit-length steps $\mathbf{u}$, which
one gains the most altitude — and why is it the bookkeeping list itself? (You have the tool:
$\Delta f \approx \nabla f \cdot \mathbf{u}$, plus what lesson 1.1 told you about dot products.)`,
      answer: md`Lesson 1.1's identity: $\nabla f \cdot \mathbf{u} = \|\nabla f\|\,\|\mathbf{u}\|\cos\theta
= \|\nabla f\|\cos\theta$ for a unit step. Over all directions, this is largest when $\cos\theta = 1$
— when your step points *along* the gradient — and most negative when $\cos\theta = -1$, exactly
opposite. So the boring list of one-at-a-time sensitivities secretly *is an arrow*, aimed precisely
uphill, whose length $\|\nabla f\|$ is the steepness in that best direction. Descending means
stepping where agreement with uphill is $-1$.

Two things worth savoring. First, the punchline is powered by the same law-of-cosines identity you
proved in lesson 1.1 — the agreement meter is running the show again. Second, a liberation: *any*
step with $\nabla f \cdot \mathbf{u} < 0$ goes downhill, and in seven billion dimensions there are
astronomically many such directions. Gradient descent doesn't need the perfect direction — it needs
a good-enough one, cheaply. That slack is why the noisy, estimated gradients of real training
(lesson 1.6) still work.`,
    },
    {
      type: 'viz',
      viz: 'gradient-descent',
      caption: md`A loss surface with a ball descending by gradient descent — the update rule made
visible. Experiments to run, in order: (1) pick the convex bowl with Vanilla GD and a small learning
rate, and watch the ball follow the negative gradient home; (2) now raise the learning-rate slider
in small increments and find the *exact threshold* where smooth descent turns into overshoot and
then divergence — there is a sharp edge, and lesson 1.6 will compute it by hand; (3) switch to the
bumpy surface and get the ball stuck in a shallow local dip — the gradient there is zero, so the
update stops, even though better valleys exist elsewhere. The Momentum and Adam options in the
optimizer picker are cures you will build in lesson 1.6; feel free to preview them.`,
    },
    {
      type: 'text',
      md: md`
## Sensitivities multiply along a chain

A real network is layered: a knob deep inside affects layer 1's output, which affects layer 2's,
which affects layer 3's... which affects the loss. We need the sensitivity of the *end* of a chain
to something buried at the *start*.

Think about a gear train. Gear A drives gear B so that B turns $3°$ for every $1°$ of A. Gear B
drives gear C: $2°$ of C per $1°$ of B. Turn A by one degree — what does C do? A's degree becomes
$3$ degrees of B, and each of those becomes $2$ degrees of C: six degrees. **Sensitivities along a
chain multiply.** $3 \times 2 = 6$, and if a fourth gear amplified by $10$, the chain would carry
$60$. (Same with gossip: one friend exaggerates $3\times$, the next $2\times$ — a story reaching
the end has grown $6\times$.)

Now say it with functions. If $y = f(u)$ and $u = g(x)$, nudge $x$ by $\varepsilon$. The inner
machine moves its output by $g'(x)\,\varepsilon$ — that's what $g'$ *means*. The outer machine sees
its own input nudged by that amount, and moves by $f'(u)$ times it:

$$\frac{dy}{dx} = f'\big(g(x)\big)\cdot g'(x)$$

That's the **chain rule**, and you could have invented it from the gears. One detail deserves a
spotlight: the outer ratio $f'$ is evaluated *at the value the middle of the chain currently holds*,
$u = g(x)$ — a gear's ratio depends on where the mechanism is sitting. So before you can multiply
ratios, you must run the machine forward and note where every gear sits.

Watch it work with numbers. $h(x) = (3x - 1)^2$ at $x = 1$: the middle value is $u = 3(1) - 1 = 2$,
the inner ratio is $3$, the outer ratio is $2u = 4$, so $h'(1) = 4 \times 3 = 12$. Nudge check:
$h(1.01) = (2.03)^2 = 4.1209$ versus $h(1) = 4$ — a move of $0.1209 \approx 12 \times 0.01$. The
gears don't lie.

> **Why you should care:** "run forward and note where every gear sits" is, at scale, the reason
> training a model needs several times more memory than running it — every layer's activations are
> *cached* during the forward pass because the backward pass must evaluate local ratios at exactly
> those values. When practitioners trade compute for memory by re-running pieces of the forward
> pass ("activation checkpointing"), they are managing this exact bookkeeping.

## Computation graphs: every big function is a wiring diagram

Any monster computation — an entire transformer — is built by wiring together primitive operations:
multiply, add, $\mathrm{relu}$, square. Draw each primitive as a node and you get the
**computation graph**. The magic property: **each node needs to know only its own local ratios.** A
multiply node $z = w \cdot x$ knows $\partial z/\partial w = x$ and $\partial z/\partial x = w$, and
nothing else about the network it lives in.

The sensitivity of the loss to any knob is then the *product of local ratios along the path* from
that knob to the loss — gears all the way. (When a value feeds several paths, sum the products over
paths; in a transformer, where the residual stream fans out to dozens of downstream readers, those
sums are everywhere.) Everything called "backpropagation" is just this multiplication, organized so
that no product is ever computed twice. Time to do one completely, by hand.
`,
    },
    {
      type: 'example',
      title: 'backpropagation by hand, every number shown',
      md: md`
The smallest network that shows everything:

$$L = \big( w_2 \cdot \mathrm{relu}(w_1 x) - y \big)^2$$

with input $x = 2$, target $y = 5$, and weights $w_1 = 0.5$, $w_2 = 3$. As a graph:
$z = w_1 x \to a = \mathrm{relu}(z) \to \hat{y} = w_2 a \to e = \hat{y} - y \to L = e^2$.

**Forward pass** — run the machine, note where every gear sits:

| step | computation | value |
|---|---|---|
| $z = w_1 x$ | $0.5 \times 2$ | $1$ |
| $a = \mathrm{relu}(z)$ | $\max(0, 1)$ | $1$ |
| $\hat{y} = w_2 a$ | $3 \times 1$ | $3$ |
| $e = \hat{y} - y$ | $3 - 5$ | $-2$ |
| $L = e^2$ | $(-2)^2$ | $4$ |

The model predicts $3$; the target is $5$; the loss is $4$.

**Backward pass** — start at the loss, multiply local ratios as we walk left:

$$\frac{\partial L}{\partial \hat{y}} = 2e = -4$$

$$\frac{\partial L}{\partial w_2} = \frac{\partial L}{\partial \hat{y}} \cdot a = (-4)(1) = -4
\qquad
\frac{\partial L}{\partial a} = \frac{\partial L}{\partial \hat{y}} \cdot w_2 = (-4)(3) = -12$$

$$\frac{\partial L}{\partial z} = \frac{\partial L}{\partial a} \cdot \mathrm{relu}'(z) = (-12)(1) = -12 \quad (z = 1 > 0\text{, so the relu gate is open})$$

$$\frac{\partial L}{\partial w_1} = \frac{\partial L}{\partial z} \cdot x = (-12)(2) = -24
\qquad
\frac{\partial L}{\partial x} = \frac{\partial L}{\partial z} \cdot w_1 = (-12)(0.5) = -6$$

**Trust, but verify** — wiggle $w_1$ by hand and see if $-24$ is real. Set $w_1 = 0.51$, everything
else fixed: $z = 1.02$, $a = 1.02$, $\hat{y} = 3.06$, $e = -1.94$, $L = 3.7636$. The loss moved
$-0.2364$ for a knob move of $+0.01$: sensitivity $\approx -23.6$. The backward pass said $-24$.
(Professionals really do this check; it's called a finite-difference gradient check, and it catches
nearly every backprop bug ever written.)

**Read the signs, then cash them in.** Both weight gradients are negative — the prediction $3$
undershoots the target $5$, so *increasing* either weight helps. Take one gradient step with
$\eta = 0.01$: $w_1 \leftarrow 0.5 - 0.01(-24) = 0.74$ and $w_2 \leftarrow 3 - 0.01(-4) = 3.04$.
Rerun forward: $z = 1.48$, $a = 1.48$, $\hat{y} = 3.04 \times 1.48 = 4.4992$, $L \approx 0.251$.
**One step of calculus dropped the loss from $4$ to $0.25$.**

**One dark observation for later.** If $z$ had been negative, $\mathrm{relu}'(z) = 0$ would have
zeroed $\partial L/\partial z$ — and with it *everything upstream*: $w_1$ and $x$ would receive no
signal at all. A gate on the chain closes, and every knob behind it goes deaf.
`,
    },
    {
      type: 'ponder',
      question: md`Now count the cost of the two ways to fill in the whole answer sheet. **Plan A
(wiggle-and-watch):** nudge knob $i$, rerun the entire network forward, compare losses; repeat for
each knob. **Plan B (what we just did):** one forward pass, then one backward walk multiplying local
ratios. For a 7-billion-knob model, roughly how many forward-passes-worth of work does each plan
cost per update? Where does the number of knobs show up in each count?`,
      answer: md`**Plan A:** one baseline forward pass, plus one full forward pass *per knob* —
$7{,}000{,}000{,}001$ forward passes for a single update. The knob count multiplies the cost
directly.

**Plan B:** the forward pass costs $1$. The backward walk visits each node once, doing a
multiply-and-add per edge — roughly the same arithmetic as the forward pass that built those edges
in the first place. Call it $\approx 2$ forward passes for **the entire seven-billion-entry answer
sheet**. The knob count never enters: every knob hangs off the same graph, and the walk covers the
graph once.

Why can one sweep serve everyone? Look back at the example: $\partial L/\partial \hat{y} = -4$ was
computed *once*, then reused by both $w_2$ and $a$; $\partial L/\partial z = -12$ was reused by both
$w_1$ and $x$. Sensitivities of **one** loss with respect to **many** knobs all fan out backward
from a single source, sharing every intermediate product — like one rumor tracing back through the
whole gossip network at once. Training is many-knobs-one-loss, and the backward sweep is
tailor-made for exactly that shape.

The speedup is Plan A over Plan B: $7 \times 10^9 / 2 = 3.5$ **billion times**. This is not an
optimization; it is the difference between deep learning existing and not. When you call
*loss.backward()* in PyTorch, this sweep — reverse-mode automatic differentiation — is what runs.`,
    },
    {
      type: 'text',
      md: md`
## When chains betray you: vanishing and exploding gradients

Backprop through a deep network multiplies one local factor per layer. A modern model stacks on the
order of a hundred layers, so a gradient reaching the bottom is a product of $\sim 100$ factors. And
products of many numbers are exponentially treacherous.

Suppose each layer's factor is a perfectly innocent-looking $0.9$. Over $100$ layers:

$$0.9^{100} \approx 0.0000266$$

Twenty-seven millionths. The early layers receive essentially nothing — they stop learning, and no
learning rate can save them (multiply a hopeless $\eta$ by $0.0000266$ and it is still hopeless).
This is the **vanishing gradient problem**. Now let each factor be $1.1$:

$$1.1^{100} \approx 13{,}780$$

The gradient **explodes**; one update flings the weights into nonsense and the loss becomes NaN.
Notice how narrow the safe corridor is: $0.9$ and $1.1$ are both within ten percent of $1$, and one
hundred layers turned that ten percent into factors of $37{,}000$ apart. Nobody *chooses* these
factors — they emerge from the weights and drift as training proceeds; depth exponentiates the
drift. (Remember the sigmoid's derivative maxing out at $1/4$? Pre-2015 sigmoid networks multiplied
in a factor $\le 1/4$ *per layer* — $0.25^{10} \approx 10^{-6}$ — which is why deep networks were
once considered nearly untrainable.)

## The gradient highway: residual connections

The fix that unlocked real depth is almost insultingly small. Instead of letting each layer
*replace* its input, $\mathbf{h}_{l+1} = F(\mathbf{h}_l)$, let it *add a correction*:

$$\mathbf{h}_{l+1} = \mathbf{h}_l + F(\mathbf{h}_l)$$

Differentiate the scalar version: the per-layer factor becomes $1 + F'$. So the hundred-layer
product becomes

$$\prod_{l=1}^{100} \big( 1 + F_l' \big)$$

and multiplying this out, one of the terms is $1 \times 1 \times \cdots \times 1 = 1$: a **direct,
undiminished route from the loss to every layer**, no matter what the $F_l'$ are doing. That little
$+\,\mathbf{h}_l$ is a highway for gradients; the layers' own contributions become on-ramps and
corrections rather than gates in series. (In vector form the factor is $I + J_F$, identity matrix
plus the layer's Jacobian — same story, more indices.)

> **Why you should care:** every sublayer of a transformer — each attention block, each MLP block —
> is wrapped in exactly this residual connection. A GPT-3-scale model is roughly $200$ residual hops
> deep; without the highway, $200$ multiplied factors would vanish or explode with near-certainty,
> and the architecture would be untrainable. The same wiring gives the *residual stream* picture —
> layers reading from and writing small increments into a shared thoroughfare — that Module 2 and
> all of interpretability research lean on.
`,
    },
    {
      type: 'ponder',
      question: md`Vanishing and exploding both come from per-layer factors drifting away from $1$.
So why not simply *design* layers whose sensitivity is exactly $1$ everywhere — no shrinking, no
exploding, problem solved forever. What goes wrong?`,
      answer: md`A function whose derivative is exactly $1$ everywhere is $f(x) = x + c$ — a pure
shift. It computes *nothing*: every input wiggle passes through unchanged, so the layer cannot
reshape, gate, sharpen, or combine anything. Perfect gradient flow and zero computation are the same
property! A layer is only *useful* insofar as its sensitivity varies — amplifying what matters,
suppressing what doesn't — which is precisely the drifting-away-from-$1$ that endangers deep chains.

So there is a genuine tension: computation wants factors $\ne 1$, trainability wants factors
$\approx 1$. The residual connection is the escape hatch that takes both: an identity route with
factor *exactly* $1$ for the gradient, **plus** a parallel branch $F$ that is free to compute
aggressively, giving the combined factor $1 + F'$. The highway carries the signal; the exits do the
work. That is why the humble $+\,x$ appears in every transformer diagram you will ever see.`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The derivative, invented by wiggling:** nudge $x$ by $\varepsilon$ and $f$ moves by
   $f'(x)\,\varepsilon$ — a local amplifier setting, checkable by hand to catch any bug.
2. **The gradient:** the complete list of per-knob sensitivities. Because
   $\Delta f \approx \nabla f \cdot \mathbf{u}$ — a dot product, lesson 1.1 again — the list is
   secretly an arrow pointing steepest uphill, and $-\nabla L$ is the best possible step down.
3. **The chain rule, from gear trains:** sensitivities along a chain multiply, with each ratio
   evaluated where the mechanism currently sits — hence cached forward values, hence training's
   memory bill.
4. **Backpropagation:** the chain rule organized over the computation graph. One forward sweep, one
   backward sweep, *all* seven billion sensitivities for $\approx 2$ forward passes — versus seven
   billion passes for wiggle-and-watch. A $3.5$-billion-fold difference that is the reason the
   field exists.
5. **Deep chains are treacherous:** $0.9^{100} \approx 0.0000266$ vanishes, $1.1^{100} \approx
   13{,}780$ explodes — and the residual connection's factor $1 + F'$ builds the highway that lets
   transformers stack hundreds of layers anyway.

You now know how the knobs *move*. Next lesson: what the machine is actually saying — the model as
a probability distribution over next tokens, and where that one loss number comes from in the first
place.
`,
    },
  ],
  questions: [
    {
      id: 'm1-l3-q1',
      kind: 'mcq',
      prompt: md`You are told $f'(4) = -3$ for some smooth function $f$. Which statement is the correct reading?`,
      options: [
        md`$f$ is negative at $x = 4$`,
        md`Nudging $x$ from $4$ to $4.01$ moves $f$ down by about $0.03$`,
        md`$f$ is decreasing at every $x$, at rate $3$`,
        md`$f$ has a minimum at $x = 4$`,
      ],
      answer: 1,
      explain: md`The derivative is a *local amplifier*: $\Delta f \approx f'(x)\,\Delta x =
(-3)(0.01) = -0.03$. The first option tempts by confusing the *value* of $f$ with its *slope* —
a function can read $+1000$ and still be falling. The third tempts by forgetting locality: $f'$ is
a statement about *this* $x$ only; elsewhere $f$ may rise. The fourth confuses "derivative is
negative" with "derivative is zero" — minima live where $f' = 0$. In training terms: a weight with
$\partial L/\partial w = -3$ should be *increased*, which is exactly what
$w \leftarrow w - \eta(-3)$ does.`,
    },
    {
      id: 'm1-l3-q2',
      kind: 'numeric',
      prompt: md`By hand: for $f(x) = 3x^2 - 4x + 5$, compute $f'(2)$. Then verify your answer the
way the lesson does — nudge $x$ from $2$ to $2.01$ and check that $f$ moves by about your answer
times $0.01$.`,
      answer: 8,
      tolerance: 0.001,
      explain: md`Term by term: $f'(x) = 6x - 4$ (the constant $5$ contributes nothing — nudging $x$
doesn't wiggle a constant). At $x = 2$: $f'(2) = 12 - 4 = 8$. Nudge check: $f(2) = 9$ and
$f(2.01) = 12.1203 - 8.04 + 5 = 9.0803$ — a move of $0.0803 \approx 8 \times 0.01$. If you make
this check a reflex, backprop bugs will never survive contact with you.`,
    },
    {
      id: 'm1-l3-q3',
      kind: 'mcq',
      prompt: md`Why does the training update $\theta \leftarrow \theta - \eta\,\nabla L$ use the **negative** gradient?`,
      options: [
        md`Because loss values are negative, and the sign must be flipped to make progress positive`,
        md`A tiny unit step $\mathbf{u}$ changes the loss by $\nabla L \cdot \mathbf{u} = \|\nabla L\|\cos\theta$, which is most negative when the step points exactly opposite the gradient — so $-\nabla L$ is the steepest descent`,
        md`The minus sign is a convention; stepping along $+\nabla L$ would also lower the loss, just more slowly`,
        md`Because backprop walks the graph backward, the gradients it produces come out with reversed sign`,
      ],
      answer: 1,
      explain: md`The change in loss for a unit step is the dot product
$\nabla L \cdot \mathbf{u} = \|\nabla L\|\cos\theta$, minimized at $\cos\theta = -1$: step
anti-parallel to the gradient. Stepping *along* $+\nabla L$ is steepest **ascent** — it would make
the model maximally worse, not slowly better, so the third option is dangerously wrong. The last
option tempts because "backward" sounds like sign-flipping, but backprop's "backward" is a
*traversal order* over the graph; the sensitivities it computes are the true ones, sign and all.`,
    },
    {
      id: 'm1-l3-q4',
      kind: 'numeric',
      prompt: md`Chain rule with concrete numbers: for $f(x) = (2x + 1)^3$, compute $f'(1)$. Work it
like a gear train: middle value first, then the outer ratio *at that value*, then multiply.`,
      answer: 54,
      tolerance: 0.001,
      explain: md`Middle gear: $u = 2x + 1$, so $u(1) = 3$, and the inner ratio is $du/dx = 2$.
Outer gear: $u^3$ has ratio $3u^2$, evaluated *where the gear sits*: $3 \times 9 = 27$. Multiply
along the chain: $f'(1) = 27 \times 2 = 54$. Nudge check: $f(1) = 27$ and
$f(1.01) = (3.02)^3 \approx 27.5436$ — a move of $\approx 0.54 = 54 \times 0.01$. The most common
error is evaluating the outer ratio at $x = 1$ instead of at $u = 3$ — the exact mistake that
caching forward values exists to prevent.`,
    },
    {
      id: 'm1-l3-q5',
      kind: 'mcq',
      prompt: md`A plain (non-residual) 60-layer network trains fine in its top few layers, but the earliest layers barely change no matter how long you train. What is the most likely cause?`,
      options: [
        md`The learning rate is too small for the early layers`,
        md`The gradient reaching layer 1 is a product of $\sim 60$ per-layer sensitivities; with typical factors below $1$, that product is exponentially tiny, so almost no signal arrives`,
        md`The early layers converged first and have nothing left to learn`,
        md`Floating-point rounding deletes gradients for layers beyond a fixed depth`,
      ],
      answer: 1,
      explain: md`Vanishing gradients. Factors of, say, $0.8$ give $0.8^{60} \approx 1.5 \times
10^{-6}$ — the early layers' answer sheet is filled with zeros-for-all-practical-purposes. The
learning-rate option tempts because "make the steps bigger" feels like a fix, but multiplying a
sensible $\eta$ by $10^{-6}$ leaves it useless at any sane setting, and cranking $\eta$ a
million-fold would detonate the healthy top layers first. "Converged first" tempts because the
layers *look* settled — but they are starved, not satisfied. The cure is architectural: residual
connections change each factor to $1 + F'$, which contains a route of pure $1$s.`,
    },
    {
      id: 'm1-l3-q6',
      kind: 'numeric',
      prompt: md`A 10-layer chain passes gradient with a factor of $0.5$ per layer. By what overall
factor has the gradient shrunk by the time it reaches layer 1? (Give the shrink factor — the
number you would divide by.)`,
      answer: 1024,
      tolerance: 1,
      explain: md`$2^{10} = 1024$: the gradient arrives about a thousand times smaller after just
ten layers of half-strength coupling. This is the exponential brutality of chained factors — each
layer *multiplies*, so damage compounds geometrically, not additively. Ten layers of $0.5$ cost you
$1000\times$; a hundred layers of a mild-mannered $0.9$ still cost $37{,}600\times$
($1/0.9^{100}$). Depth is dangerous by default; residual highways are why modern networks survive
it.`,
    },
    {
      id: 'm1-l3-q7',
      kind: 'written',
      prompt: md`**Backprop by hand, start to finish.** For the network
$L = \big(w_2 \cdot \mathrm{relu}(w_1 x) - y\big)^2$ with $x = 1$, $y = 10$, $w_1 = 2$, $w_2 = 3$:

1. Run the forward pass, writing down every intermediate value ($z$, $a$, $\hat{y}$, $e$, $L$).
2. Run the backward pass, computing $\partial L/\partial \hat{y}$, $\partial L/\partial w_2$, $\partial L/\partial a$, $\partial L/\partial z$, $\partial L/\partial w_1$, and $\partial L/\partial x$.
3. Take one gradient step with $\eta = 0.01$ on $w_1$ and $w_2$, rerun the forward pass, and report the new loss.`,
      rubric: md`**Forward pass:**

| quantity | computation | value |
|---|---|---|
| $z = w_1 x$ | $2 \times 1$ | $2$ |
| $a = \mathrm{relu}(z)$ | $\max(0,2)$ | $2$ |
| $\hat{y} = w_2 a$ | $3 \times 2$ | $6$ |
| $e = \hat{y} - y$ | $6 - 10$ | $-4$ |
| $L = e^2$ | $(-4)^2$ | $16$ |

**Backward pass** (each line = upstream sensitivity $\times$ local ratio):

$$\frac{\partial L}{\partial \hat{y}} = 2e = -8$$

$$\frac{\partial L}{\partial w_2} = (-8)\,a = -16
\qquad
\frac{\partial L}{\partial a} = (-8)\,w_2 = -24$$

$$\frac{\partial L}{\partial z} = (-24)\cdot\mathrm{relu}'(2) = (-24)(1) = -24$$

$$\frac{\partial L}{\partial w_1} = (-24)\,x = -24
\qquad
\frac{\partial L}{\partial x} = (-24)\,w_1 = -48$$

**Gradient step** with $\eta = 0.01$: $w_1 \leftarrow 2 - 0.01(-24) = 2.24$ and
$w_2 \leftarrow 3 - 0.01(-16) = 3.16$. Rerun forward: $z = 2.24$, $a = 2.24$,
$\hat{y} = 3.16 \times 2.24 \approx 7.078$, $e \approx -2.922$, $L \approx 8.54$. The loss fell
from $16$ to $\approx 8.5$ in one step.

**Grading yourself:** full credit requires (a) all five forward values, (b) all six backward
sensitivities with the relu step made explicit, and (c) the updated weights *and* the new loss. If
any backward value disagrees, check that you evaluated local ratios at the *cached forward values*
($a = 2$, $w_2 = 3$) — evaluating gears in the wrong position is the single most common backprop
error, by a wide margin.`,
    },
    {
      id: 'm1-l3-q8',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Using only the wiggle-reading of the derivative — "nudge
the input by $\varepsilon$ and the output moves by (sensitivity) $\times\ \varepsilon$" — derive the
chain rule for $y = f(g(x))$. Trace one $\varepsilon$-nudge of $x$ through both machines, state
where each sensitivity must be evaluated and why, and arrive at the formula. Then apply it:
$y = (5x - 3)^2$ at $x = 1$, with a nudge check.`,
      rubric: md`**Derivation (the required chain of reasoning):**

1. Nudge $x$ by $\varepsilon$. By the meaning of $g'$, the inner output moves by
   $\Delta u = g'(x)\,\varepsilon$.
2. The outer machine sees *its* input nudged by $\Delta u$, so by the meaning of $f'$, its output
   moves by $\Delta y = f'(u)\,\Delta u = f'\big(g(x)\big)\cdot g'(x)\cdot\varepsilon$.
3. The sensitivity of $y$ to $x$ is the total amplification of the $\varepsilon$:
   $dy/dx = f'(g(x))\cdot g'(x)$ — sensitivities along a chain **multiply**.
4. **Evaluation point (must be stated):** $f'$ is evaluated at $u = g(x)$, the value currently in
   the middle of the chain — a gear's ratio depends on where the mechanism sits, which is why the
   forward pass runs first and caches intermediates.

**Application:** middle value $u = 5(1) - 3 = 2$; inner ratio $5$; outer ratio $2u = 4$; product
$f'(1) = 20$. Nudge check: $f(1) = 4$, $f(1.01) = (2.05)^2 = 4.2025$ — a move of
$0.2025 \approx 20 \times 0.01$.

Grade yourself "nailed it" only if the derivation flowed from the wiggle-reading (steps 1–3) and
step 4 appeared explicitly. Writing the final formula from memory and then plugging in numbers is
precisely what this question is *not* asking for.`,
    },
    {
      id: 'm1-l3-q9',
      kind: 'numeric',
      prompt: md`**Fermi estimate.** One forward pass of a 7-billion-parameter model takes $1$
second on your GPU. You decide to compute the gradient by finite differences: nudge one knob, rerun
the forward pass, repeat for every knob. Roughly how many **years** does ONE gradient update take?
(A year is about $3 \times 10^7$ seconds. Round freely — the tolerance is generous.)`,
      answer: 222,
      tolerance: 80,
      explain: md`$7 \times 10^9$ forward passes at $1$ second each is $7 \times 10^9$ seconds.
Divide by $\approx 3.15 \times 10^7$ seconds per year: about **222 years** — for a *single* one of
the roughly one million updates in a training run. Backpropagation delivers the identical seven
billion numbers in about $2$ seconds of extra work. That ratio — two centuries versus two seconds —
is not a speedup; it is the entire feasibility of deep learning, and it's why *loss.backward()* is
arguably the most valuable function call in computing.`,
    },
    {
      id: 'm1-l3-q10',
      kind: 'mcq',
      prompt: md`You scale a model from 7B parameters to 14B. Per batch, the cost of computing **all** parameter gradients:`,
      options: [
        md`Roughly doubles — the backward sweep costs a fixed multiple of the forward pass, and both scale with the size of the graph`,
        md`Roughly quadruples — twice as many gradients to compute, each through a twice-as-large network`,
        md`Grows by a factor of 14 billion — one pass per parameter`,
        md`Stays the same — the backward pass depends on depth, not parameter count`,
      ],
      answer: 0,
      explain: md`The quadrupling option is the seductive one — it feels like two factors of two
should multiply (more gradients $\times$ bigger network). But backprop never pays "per gradient":
one backward sweep over the graph produces *every* parameter's sensitivity as a side effect of
visiting each edge once. Doubling the parameters doubles the graph, so forward and backward each
double — total cost $\approx 2\times$, and the number of gradients you *wanted* never appears in
the bill. The per-parameter-pass option describes finite differences, the 222-year plan.`,
    },
    {
      id: 'm1-l3-q11',
      kind: 'written',
      prompt: md`**Explain the disease and the cure.** For a friend who knows the chain rule but no
deep learning: what is the *vanishing gradient problem*, why does depth make it exponentially
worse, and how does the residual connection $\mathbf{h}_{l+1} = \mathbf{h}_l + F(\mathbf{h}_l)$ fix
it? Your answer must include a concrete computed number (e.g. $0.9^{100}$), the derivative of a
residual block, and the phrase "product of sensitivities".`,
      rubric: md`A complete answer hits these beats:

1. **The mechanism.** The gradient reaching layer $l$ is a **product of sensitivities** — one local
   factor per layer between $l$ and the loss. Nothing keeps those factors at exactly $1$.
2. **Why depth is exponential.** The number of multiplied factors *is* the depth, so drift
   compounds geometrically: $0.9^{100} \approx 0.0000266$ (vanished — early layers receive
   essentially no signal and stop learning), while $1.1^{100} \approx 13{,}780$ (exploded — one
   update destroys the weights). Both factors sit within $10\%$ of $1$; a hundred layers turn that
   into a $37{,}000{,}000$-fold spread. At least one such computed number must appear.
3. **The residual derivative.** Differentiating $\mathbf{h}_{l+1} = \mathbf{h}_l + F(\mathbf{h}_l)$
   gives a per-layer factor of $1 + F'$ (in vector form $I + J_F$). This must appear explicitly.
4. **Why that fixes it.** Expanding $\prod_l (1 + F_l')$ yields, among its terms, the all-ones
   route: $1 \cdot 1 \cdots 1 = 1$ — a direct highway along which gradient reaches even the first
   layer undiminished, regardless of how small each $F'$ is. The layers become corrections beside
   a highway instead of gates in series.
5. **(Bonus, worth having)** Transformers wrap every attention and MLP sublayer in a residual
   connection — a GPT-3-scale model is $\approx 200$ hops deep — which is why such depth is
   trainable at all.

"Nailed it" requires beats 1–4 with the computed number, the $1 + F'$ derivative, and the required
phrase all present and doing real work — not decorating.`,
    },
    {
      id: 'm1-l3-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old** (write it out — the Feynman technique is *the* test
of ownership). A computer program that predicts the next word has seven billion little dials, and
after each guess it gets a score for how wrong it was. Explain to the kid: (1) how the program
figures out which way to turn *every* dial to get less wrong — without testing the dials one at a
time — and (2) why it only ever turns each dial a tiny bit. Invent an analogy the kid lives inside
(a recipe with billions of ingredients, a giant orchestra, a blame game...) — a fresh analogy is
worth more than reusing the lesson's.`,
      rubric: md`No single right script — grade the *teaching*. A "nailed it" answer must:

1. **Ground it in a kid-familiar analogy** carried all the way through — e.g. a kitchen where a
   billion tiny dials control every pinch of every spice, and one taste-tester score comes back per
   dish; or an orchestra with a billion tuning pegs and one "that sounded off" from the audience.
2. **Make wrongness concrete:** the score is a single number for "how far off was the guess," and
   the whole game is making that number smaller.
3. **Explain the backward blame-trail in kid words** (this is backprop, and it is the heart): the
   program doesn't test dials one by one — it traces the mistake *backwards* through the machine,
   the way you'd trace "the cake is too salty" back through "the frosting crew over-salted, because
   the mixer settings upstream told them to..." — so that one backward trace hands **every** dial
   its own share of the blame, all at once. The answer must convey that one pass assigns all the
   blame, not one pass per dial.
4. **Answer the tiny-steps part:** each dial's advice is only trustworthy *near its current
   setting* (like "a bit more salt" being good advice — but not "a bucket more"), so the program
   takes a small step and re-checks, millions of times.
5. **Contain no unexplained jargon.** "Derivative," "gradient," "backpropagation," "loss," and
   "parameters" must either be absent or immediately explained in kid words. Any unexplained
   jargon caps the grade at *partial* — hiding behind vocabulary is exactly the failure mode this
   exercise exists to catch.`,
    },
  ],
}
