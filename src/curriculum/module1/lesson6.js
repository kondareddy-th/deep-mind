const md = String.raw

export default {
  id: 'm1-l6',
  title: '1.6 Optimization — the art of rolling downhill',
  subtitle: md`You are blindfolded on a mountainside in fog, and all you can feel is the slope under your boots. Walking downhill sounds like the easiest problem in the world. This lesson is about why, in seven billion dimensions, it very nearly isn't — and the beautiful sequence of fixes that make training LLMs possible anyway.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

You are standing somewhere on a mountainside. It is night, there is fog, and you are blindfolded.
Somewhere below you is the valley floor, and your job is to reach it. You cannot see the landscape.
All you can feel is the **tilt of the ground under your boots**.

That is training, exactly. The mountain is the loss surface $L(\theta)$: every possible setting of
the model's knobs is a place you could stand, and the altitude at that place is how wrong the model
is there. The tilt under your boots is the gradient — lesson 1.3 went to great lengths to hand it
to you, all seven billion components of it, for the price of about two forward passes. And the
valley floor is a model that predicts text well.

So: feel the slope, step downhill, repeat. What could possibly be interesting about that?

Almost everything, it turns out. The mountain lives in **7,000,000,000 dimensions**, you can only
afford about a million steps, every single step costs a fortune in GPU-time, and — here is the part
that will occupy us — the *size* of each step is a number you must choose while blindfolded, and
choosing it even slightly wrong doesn't just slow you down. It can fling you off the mountain
entirely.

## Inventing the update rule

Let's build the walking algorithm from nothing. You feel the slope. Which way do you step? Downhill
— against the gradient, direction $-\nabla L$. Lesson 1.3 proved this is not just *a* way down but
the *steepest* way down. Fine.

How **far** do you step? Here's a thought: the slope itself is telling you something. Far from the
valley floor, hillsides are steep; near the bottom, the ground flattens out. So a sensible walker
takes steps *proportional to the slope*: stride out boldly where it's steep, and automatically
shorten stride as the ground levels off — a built-in brake that engages exactly when you're
arriving. Call the proportionality constant $\eta$ (the **learning rate**), and you have invented
**gradient descent**:

$$\theta \;\leftarrow\; \theta - \eta\, \nabla L(\theta)$$

One line. This line, executed about a million times, is the entire training loop of every large
language model ever shipped. Everything else in this lesson is a patch on this line.

## The learning-rate laboratory

Now let's find out what $\eta$ really does, on the simplest mountain that exists: $L(x) = x^2$, a
parabola with its valley floor at $x = 0$. The gradient is $L'(x) = 2x$, so one step of gradient
descent reads

$$x \;\leftarrow\; x - \eta \cdot 2x = (1 - 2\eta)\, x$$

Every step multiplies $x$ by the *same fixed factor* $(1 - 2\eta)$. That one factor is about to
tell us the whole story. Start at $x_0 = 1$ and try three learning rates by hand.

**Too small** — $\eta = 0.001$. The factor is $0.998$. Each step keeps $99.8\%$ of your distance
from the goal. To shrink $x$ below $0.001$ takes about $3{,}500$ steps — of pure, shuffling,
nothing-goes-wrong progress. Now remember that a real training step costs real GPU-hours: being
$1000\times$ too cautious turns a three-week run into a run that finishes after your career does.
A century of shuffling downhill, perfectly safely.

**Just right** — $\eta = 0.4$. The factor is $1 - 0.8 = 0.2$. Watch:

$$x:\quad 1 \;\to\; 0.2 \;\to\; 0.04 \;\to\; 0.008 \;\to\; 0.0016$$

Four steps and you've done what the cautious walker needed thousands for. Each step wipes out
$80\%$ of the remaining error.

**Too large** — $\eta = 1.1$. The factor is $1 - 2.2 = -1.2$. Watch *carefully*:

$$x:\quad 1 \;\to\; -1.2 \;\to\; 1.44 \;\to\; -1.728 \;\to\; 2.074$$

Two things at once, both bad. The **sign flips every step**: your stride is so long you leap clean
over the valley and land on the opposite hillside. And the **magnitude grows** $20\%$ per leap:
each overshoot lands *farther up the far wall* than where you left, so the next slope is steeper,
so the next leap is longer... After 50 steps you are at $|x| \approx 9{,}100$, and the loss — the
square — is around eighty million. You didn't descend the mountain. You bounced off both walls of
the valley with exponentially growing violence and launched yourself into the sky.

The boundary between these fates is exact. Convergence needs $|1 - 2\eta| < 1$, i.e. $\eta < 1$.
On a general quadratic with curvature $\lambda$ (here $\lambda = L'' = 2$), the same algebra gives
the **stability bound**

$$\eta < \frac{2}{\lambda}$$

Burn this in: **the steepest curvature you will meet sets a hard ceiling on your learning rate.**
Below the ceiling by a lot, you crawl; above it by a hair, you explode. There is no graceful
failure on the high side — divergence is geometric.

> **So what?** A Llama-class pretraining run uses a peak learning rate around $3 \times 10^{-4}$.
> That number was found by exactly this tightrope logic, at the cost of many dead runs. Set it
> $3\times$ too high and the loss curve NaNs out in the first thousand steps; $3\times$ too low and
> you quietly waste millions of dollars of compute reaching a worse model. The single most
> consequential hyperparameter in deep learning is the step size of a blindfolded walker.
`,
    },
    {
      type: 'text',
      md: md`
## The noisy compass — minibatch SGD

There's a cost I've been hiding. The "true" loss is an average over the whole training set — for an
LLM, **trillions of tokens**. Computing the true gradient means processing all of them for a
*single step*. Nobody has ever done this, and nobody ever will.

Instead: grab a random handful of data — a **minibatch** — and compute the gradient on just that.
For frontier LLMs a "handful" is a few million tokens, which sounds huge until you compare it to
the trillions it stands in for. The minibatch gradient is a **noisy compass**: on average it points
exactly where the true gradient points (statisticians say it's *unbiased*), but any single reading
wobbles randomly around the truth. In exchange, you can read it roughly a *thousand times faster* —
so instead of one perfect compass reading, you take a thousand shaky ones and let the wobbles
average out across steps. This trade — noise for speed — is called **stochastic gradient descent**
(SGD), and it is the only reason training on the internet is possible at all.

And here is the delicious part: the noise is not purely a tax. **Sometimes it helps.** Picture the
mountainside again, but honestly this time: not one smooth valley but a rumpled landscape full of
shallow dips and dimples. A noiseless walker who steps into a little dip is *stuck* — every local
direction is uphill, and the rule says stop. The noisy walker gets randomly jostled with every
step, and a shallow dip can't hold a jostled walker: sooner or later a kick bounces them over the
lip and onward, downhill. Only wide, deep basins can hold them — and wide basins are exactly the
solutions that tend to generalize to unseen text. The trembling of the compass is doing quiet
regularization work.

> **So what?** GPT-class training steps use batches of millions of tokens, and batch size is tuned
> *jointly* with the learning rate — the noise level and the step size are two dials on one
> machine. You'll meet the "critical batch size" literature later; its entire subject is how shaky
> a compass you can afford.
`,
    },
    {
      type: 'text',
      md: md`
## The narrow valley — where the simple plan dies

So far the mountain was round. Real loss surfaces are not. The signature shape of real training —
the shape that killed vanilla gradient descent as a serious LLM algorithm — is the **narrow
valley**: a canyon with steep walls in one direction and an almost-flat floor tilting gently in
another.

Let's build the smallest one in the world:

$$L(x, y) = \tfrac{1}{2}x^2 + 0.02\, y^2$$

Compute the gradient by hand — it's two one-variable derivatives:

$$\nabla L = \left( x,\;\; 0.04\, y \right)$$

The $x$-direction has curvature $1$ (steep canyon walls); the $y$-direction has curvature $0.04$
(the gently sloping floor). The walls are $25\times$ steeper than the floor.

Now stand at the point $(3, 10)$ and feel the slope: $\nabla L = (3,\; 0.4)$. Look at that. You are
much *farther* from the goal in $y$ (10 away) than in $x$ (3 away) — but the slope screams about
$x$ seven times louder, because slope measures steepness, not distance-to-go. Gradient descent
follows the scream. It will spend its energy fighting the canyon walls and barely notice the floor.

Worse: recall the stability bound. The steep direction has $\lambda = 1$, so we *must* keep
$\eta < 2/1 = 2$. But the floor direction, with its feeble curvature $0.04$, would *love*
$\eta = 1/0.04 = 25$ to make real progress. What the floor needs is more than $12\times$ past what
the walls allow. **One learning rate. Two incompatible demands.** That, in one sentence, is
ill-conditioning.

Watch the bind play out. Take $\eta = 1.8$ — aggressively close to the ceiling — starting at
$(3, 10)$. Step one: $x \leftarrow 3 - 1.8 \times 3 = -2.4$ (leapt clean across the canyon), and
$y \leftarrow 10 - 1.8 \times 0.4 = 9.28$ (crawled $7\%$ closer). Step two: the gradient is now
$(-2.4, 0.371)$, so $x \leftarrow -2.4 + 4.32 = 1.92$ (leapt back across!) while
$y \leftarrow 9.28 - 0.668 = 8.61$. There's the picture: the iterate **ricochets between the
canyon walls** — $3, -2.4, 1.92, -1.54, \ldots$ — while inching along the floor at $7\%$ per step,
needing $60$-odd steps to cover what a well-sized step would do in a few. And every alternative is
worse: lower $\eta$ to $0.5$ and the ricochet stops but the floor crawl drops to $2\%$ per step
($230$ steps); raise $\eta$ to $2.5$ and the wall direction diverges outright.

The ratio of steepest to shallowest curvature is called the **condition number**
$\kappa = \lambda_{\max}/\lambda_{\min}$ — here $\kappa = 25$, and the step count for vanilla GD
grows roughly *like* $\kappa$. For a deep network, different layers, different parameter types,
different scales all mix into one loss surface, and $\kappa$ reaches the thousands or worse. Vanilla
gradient descent on an LLM would ricochet forever.

Every optimizer in the rest of this lesson is an attack on this one picture.
`,
    },
    {
      type: 'ponder',
      question: md`Sharpen the diagnosis before we treat it. In the narrow valley, *why exactly* can
no single learning rate serve both directions? Try to phrase it as two separate facts — one about
what limits $\eta$ from above, one about what $\eta$ needs to be for progress — and notice which
feature of the landscape each fact depends on.`,
      answer: md`**Fact 1 (the ceiling):** stability is governed by the *steepest* curvature. The
step-multiplier in a direction with curvature $\lambda$ is $(1 - \eta\lambda)$, and it must stay
inside $(-1, 1)$, so $\eta < 2/\lambda_{\max}$. The walls set the law.

**Fact 2 (the crawl):** progress is governed by the *shallowest* curvature. In the floor direction
the error shrinks by the factor $(1 - \eta\lambda_{\min})$ per step, and with $\eta$ pinned under
$2/\lambda_{\max}$, that factor can't drop below $1 - 2\lambda_{\min}/\lambda_{\max} = 1 - 2/\kappa$.
The floor sets the pace.

One knob, two masters. The best legal $\eta$ leaves the slow direction shrinking by only about
$2/\kappa$ per step, so the run takes on the order of $\kappa$ steps — **the condition number
*is* the problem**, compressed into a single ratio. Every fix that follows (momentum, Adam) is a
scheme for effectively giving different directions different learning rates without ever computing
$\kappa$, which for seven billion dimensions nobody can.`,
    },
    {
      type: 'example',
      title: 'the narrow valley by hand — vanilla GD ricochets in slow motion',
      md: md`
The valley: $L(x,y) = \tfrac{1}{2}x^2 + 0.02y^2$, gradient $\nabla L = (x, 0.04y)$, learning rate
$\eta = 1.8$, start $(x_0, y_0) = (3, 10)$. Each step multiplies $x$ by $(1 - 1.8) = -0.8$ and $y$
by $(1 - 0.072) = 0.928$:

| step | $x$ (canyon walls) | $y$ (valley floor) |
|---|---|---|
| 0 | $3.00$ | $10.00$ |
| 1 | $-2.40$ | $9.28$ |
| 2 | $1.92$ | $8.61$ |
| 3 | $-1.54$ | $7.99$ |
| 4 | $1.23$ | $7.42$ |

Read the columns like a story. The $x$ column **flips sign every single row** — that is the zigzag,
rendered in arithmetic: each step overleaps the canyon and lands on the opposite wall, only $20\%$
closer. Meanwhile $y$, the direction where nearly all the remaining distance lives, oozes downward
at $7.2\%$ per step and needs about $62$ steps just to cover $99\%$ of its journey.

Two morals. First, the walker spends most of its motion *sideways* — crossing the valley, not
descending it. Second, and this is the important one: the landscape did nothing wrong. The same
surface, the same gradients, handed to a smarter algorithm, will produce a nearly straight path
down the floor. **The pathology is in the algorithm, not the mountain** — which means an algorithm
can fix it.
`,
    },
    {
      type: 'text',
      md: md`
## Momentum — give the walker mass

Here's the physical idea, and it's lovely: our walker has been *massless*. Each step consults the
current slope and nothing else — no memory, no inertia. Replace the walker with a **heavy ball**.

A heavy ball rolling downhill doesn't teleport in the direction of the local slope; it carries a
**velocity**, and the slope merely *pushes* on it. Per unit time: the velocity keeps most of what
it had (a little friction), and picks up a push from the current slope. Write that down and you
have derived the momentum method:

$$v \;\leftarrow\; \beta\, v \;-\; \eta\, \nabla L
\qquad\qquad
\theta \;\leftarrow\; \theta + v$$

The friction constant $\beta$ sets the ball's memory: $\beta = 0$ forgets instantly (that's plain
GD again), $\beta = 1$ is a frictionless ball that never stops oscillating. The standard choice is
$\beta = 0.9$.

Now the crucial question: what does mass *do* in the narrow valley? Run the two situations by hand
with $\beta = 0.9$, $\eta = 0.1$, and pushes of size $2$.

**Along the floor**, the gradient points the same way every step: $g = 2, 2, 2, \ldots$

$$v_1 = 0.9 \times 0 - 0.1 \times 2 = -0.2
\qquad
v_2 = 0.9 \times (-0.2) - 0.2 = -0.38
\qquad
v_3 = -0.542 \;\;\ldots$$

The velocity *compounds*. Consistent pushes stack up, heading for the geometric-series limit
$\eta g/(1-\beta) = 0.2/0.1 = 2$ — **ten times** the plain-GD step of $0.2$. The direction that was
starving for a bigger learning rate just got one, automatically, *because its gradient kept saying
the same thing*.

**Across the canyon**, the gradient flips sign every step: $g = +2, -2, +2, \ldots$

$$v_1 = -0.2
\qquad
v_2 = 0.9 \times (-0.2) + 0.2 = +0.02
\qquad
v_3 = 0.9 \times 0.02 - 0.2 = -0.182 \;\;\ldots$$

The pushes *cancel inside the running average*. The oscillation settles to amplitude
$\eta g/(1+\beta) = 0.2/1.9 \approx 0.105$ — about **half** the plain-GD zigzag.

Same $\beta$, same $\eta$, same push sizes: the consistent signal gets amplified $10\times$, the
alternating noise gets damped to $0.53\times$. That's a $19$-to-$1$ asymmetry in favor of whatever
the gradients *agree about across time*. Momentum is a voting scheme over history — and the zigzag,
which by its nature contradicts itself every step, votes itself into oblivion.

> **So what?** $\beta = 0.9$ appears, essentially unchanged, in the training recipe of every LLM
> you have ever used — inside Adam, as you're about to see, under the name $\beta_1$. A frontier
> lab spending a billion dollars on a run is trusting a heavy ball.
`,
    },
    {
      type: 'ponder',
      question: md`$\beta = 0.9$ means the velocity is effectively an average over the last
*how many* gradients? Guess first. Then unroll the update $v_t = \beta v_{t-1} - \eta g_t$ a few
times and look at the coefficients on older and older gradients.`,
      answer: md`Unroll it:

$$v_t = -\eta\left( g_t + \beta\, g_{t-1} + \beta^2 g_{t-2} + \beta^3 g_{t-3} + \cdots \right)$$

Each gradient's vote decays geometrically with age. The total weight available is the geometric
series $1 + \beta + \beta^2 + \cdots = \dfrac{1}{1-\beta}$, which at $\beta = 0.9$ is exactly
$\mathbf{10}$: the velocity behaves like a (weighted) average over roughly the **last 10
gradients**. The horizon rule $1/(1-\beta)$ is worth pocketing, because you're about to meet
$\beta_2 = 0.999$ — a $1000$-step memory — and learn that LLM training often *shortens* it to
$\beta_2 = 0.95$ (a $20$-step memory) so the optimizer can react to trouble in tens of steps rather
than dragging a thousand steps of stale history through a loss spike.`,
    },
    {
      type: 'text',
      md: md`
## Seven billion knobs, seven billion learning rates — Adam

Momentum fixed the *directional* disease. One disease remains, and it's about scale. The seven
billion knobs are wildly unlike each other: an embedding row for a rare token might see gradients
of $10^{-6}$, a layernorm gain might see gradients of $10^{-1}$ — five orders of magnitude apart,
living in the same model, sharing one $\eta$. Any single learning rate is simultaneously absurdly
timid for some knobs and recklessly violent for others. What we *want* is a personal learning rate
for every knob. Seven billion of them. Tuned by hand? Obviously not. So let the gradients
themselves tell us.

Here's the trick. For each knob, keep a running average of its **squared** gradient — squared, so
it measures typical *size* regardless of sign:

$$v \;\leftarrow\; \beta_2\, v + (1 - \beta_2)\, g^2$$

Then **divide the step by** $\sqrt{v}$. A knob whose gradients are habitually huge gets its steps
shrunk; a knob whose gradients are habitually tiny gets its steps boosted. Each knob's step becomes
roughly $\eta \times g/\sqrt{\text{typical } g^2}$ — the *sign and relative pattern* of the
gradient, normalized to size $\sim 1$, so that $\eta$ alone sets the physical step length for
every knob. An automatic per-parameter learning rate, built from bookkeeping we were almost doing
anyway.

Combine this with momentum — keep a running average $m$ of the gradient itself (the heavy ball) *and*
a running average $v$ of its square (the personal scaler) — and you have **Adam** (*adaptive
moments*), the optimizer family that trains essentially everything:

$$m_t = \beta_1 m_{t-1} + (1-\beta_1)\, g_t
\qquad\qquad
v_t = \beta_2 v_{t-1} + (1-\beta_2)\, g_t^2$$

$$\hat{m}_t = \frac{m_t}{1 - \beta_1^t}
\qquad\qquad
\hat{v}_t = \frac{v_t}{1 - \beta_2^t}$$

$$\theta_{t+1} = \theta_t - \eta\, \frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon}$$

Defaults: $\beta_1 = 0.9$, $\beta_2 = 0.999$, $\epsilon = 10^{-8}$ (a tiny guard against dividing
by zero). Two of these four lines you have already built with your own hands. But what are those
hatted quantities in the middle row?

## Bias correction, discovered by arithmetic

Both running averages start at zero — $m_0 = 0$, $v_0 = 0$ — because what else would they start
at? Watch what that does to the very first step. With $\beta_1 = 0.9$:

$$m_1 = 0.9 \times 0 + 0.1 \times g_1 = 0.1\, g_1$$

If the gradient were steady at $g$, the honest "average gradient" is $g$ — but $m_1$ reports
$0.1\,g$. A **tenfold underestimate**, purely because the average is $90\%$ made of the fake zero
we initialized with. How do we fix a weighted average that hasn't collected its full weight yet?
Divide by the weight it *has* collected. After $t$ steps, the weights placed on real gradients sum
to exactly $1 - \beta_1^t$ (the rest of the mass still sits on the phantom zero). So:

$$\hat{m}_t = \frac{m_t}{1 - \beta_1^t}$$

Check it at $t = 1$: divisor $1 - 0.9 = 0.1$, so $\hat{m}_1 = 0.1 g_1/0.1 = g_1$ — **exactly**
right. At $t = 2$ with steady gradients: $m_2 = 0.9 \times 0.1g + 0.1g = 0.19\,g$, divisor
$1 - 0.81 = 0.19$, again exactly $g$. And as $t$ grows, $\beta_1^t \to 0$, the divisor $\to 1$,
and the correction politely retires. The same fix, with $\beta_2$, gives $\hat{v}$.

Now the twist you wouldn't guess. You might think skipping bias correction just makes early steps
timid ($m$ is $10\times$ too small, after all). Compute it instead: the uncorrected first update is

$$\eta \frac{m_1}{\sqrt{v_1}} = \eta \frac{0.1\, g_1}{\sqrt{0.001\, g_1^2}} = \eta \frac{0.1}{0.0316} \approx 3.2\, \eta$$

**Too big** — by a factor of three! The $v$ underestimate ($1000\times$, since
$1 - \beta_2 = 0.001$) sits under a square root in the *denominator*, and it wins. So an
uncorrected Adam takes its very largest steps at the very start of training, in a direction
estimated from a single noisy minibatch. Bias correction is not pedantry. It is early-run crash
protection, and the arithmetic just showed you why.
`,
    },
    {
      type: 'example',
      title: 'two steps of Adam, entirely by hand',
      md: md`
One knob. $\theta_0 = 2$, $\eta = 0.1$, $\beta_1 = 0.9$, $\beta_2 = 0.999$, ignore $\epsilon$. The
gradients arrive as $g_1 = 6$, then $g_2 = 3$.

**Step 1** ($t = 1$; divisors $1 - 0.9 = 0.1$ and $1 - 0.999 = 0.001$):

$$m_1 = 0.9 \times 0 + 0.1 \times 6 = 0.6
\qquad
v_1 = 0.999 \times 0 + 0.001 \times 36 = 0.036$$

$$\hat{m}_1 = \frac{0.6}{0.1} = 6
\qquad
\hat{v}_1 = \frac{0.036}{0.001} = 36$$

$$\theta_1 = 2 - 0.1 \times \frac{6}{\sqrt{36}} = 2 - 0.1 \times 1 = 1.9$$

Notice: bias correction perfectly recovered the raw data ($\hat{m}_1 = g_1$, $\hat{v}_1 = g_1^2$),
the ratio $\hat{m}_1/\sqrt{\hat{v}_1} = 6/6 = 1$, and the step is *exactly* $\eta$. Without the
hats the step would have been $0.1 \times 0.6/\sqrt{0.036} \approx 0.316$ — the $3.2\times$
oversize we predicted.

**Step 2** ($t = 2$; divisors $1 - 0.81 = 0.19$ and $1 - 0.998001 = 0.001999$):

$$m_2 = 0.9 \times 0.6 + 0.1 \times 3 = 0.84
\qquad
v_2 = 0.999 \times 0.036 + 0.001 \times 9 = 0.044964$$

$$\hat{m}_2 = \frac{0.84}{0.19} \approx 4.42
\qquad
\hat{v}_2 = \frac{0.044964}{0.001999} \approx 22.49$$

$$\theta_2 = 1.9 - 0.1 \times \frac{4.42}{\sqrt{22.49}} = 1.9 - 0.1 \times \frac{4.42}{4.74} \approx 1.9 - 0.093 = 1.807$$

**What to notice.** The raw gradient *halved* between steps ($6 \to 3$), yet the two updates are
nearly identical: $0.100$, then $0.093$. That is Adam's signature: $\hat{m}/\sqrt{\hat{v}}$ is a
normalized quantity of typical size $\sim 1$, so $\eta$ directly dictates how far knobs move, in
knob-units. Multiply every gradient in this example by $1000$ and recompute — the trajectory
doesn't change at all. Adam listens to the gradient's *pattern* and ignores its *loudness*.
`,
    },
    {
      type: 'ponder',
      question: md`A strange consequence hiding in the step-1 arithmetic: on the very first step,
what does Adam do to a knob whose gradient is $g_1 = 0.000001$? And to one whose gradient is
$g_1 = 1000$? Work out $\hat{m}_1/\sqrt{\hat{v}_1}$ for each before peeking.`,
      answer: md`The same thing, to both. At $t = 1$ the corrections are exact:
$\hat{m}_1 = g_1$ and $\hat{v}_1 = g_1^2$, so

$$\frac{\hat{m}_1}{\sqrt{\hat{v}_1}} = \frac{g_1}{|g_1|} = \pm 1$$

The gradient's *size cancels out completely*. On step one, **every one of the seven billion knobs
moves by exactly $\eta$** (in the direction its gradient voted) — the whisper-gradient knob and the
scream-gradient knob take identical strides. Adam at $t=1$ is a pure sign method.

Feel how double-edged that is. It's the per-parameter equalization working as designed — no knob
is starved, no knob is battered. But it also means that at initialization, when the weights are
random and the gradients are (as the next section argues) confident garbage, Adam moves the *entire
model* a full $\eta$ in a direction it has essentially no evidence for. Hold that thought for about
four paragraphs, where it becomes the reason every LLM run begins with warmup.`,
    },
    {
      type: 'viz',
      viz: 'gradient-descent',
      caption: md`A loss surface you can finally see — no blindfold — with a ball descending it. Run three experiments. **(1)** Pick the ill-conditioned valley surface with Vanilla GD and count the zigzags: the ball ricochets between the canyon walls exactly like the table you computed by hand, while creeping along the floor. **(2)** Restart with Momentum and watch the sideways ricochets cancel in the velocity while downhill progress compounds; then switch to Adam — per-knob scaling equalizes the two directions and the path runs nearly straight down the valley floor. **(3)** For each optimizer in turn, crank the learning-rate slider upward until the run breaks, and note *where* each one breaks — the stability ceiling is not a metaphor, and the three algorithms hit it differently. The bumpy and saddle surfaces are your dessert: watch how minibatch-style jitter and momentum handle traps that stall pure GD.`,
    },
    {
      type: 'text',
      md: md`
## AdamW — the decay that Adam was quietly sabotaging

One more repair, subtler than the rest. Networks train better when weights are gently pulled toward
zero — **weight decay**, a slow leak that keeps unused knobs from wandering off and overfitting.
The classical way to get it: add $\tfrac{\lambda}{2}\|\theta\|^2$ to the loss, which simply adds
$\lambda\theta$ to every gradient. Under plain GD that works exactly as intended: every weight
shrinks by the same fraction each step.

Now push that same $\lambda\theta$ term through Adam and watch it get mangled. It enters $g$, so it
gets swept into $m$ and — here's the sabotage — **divided by $\sqrt{\hat{v}}$ like everything
else**. A weight with a large gradient history (large $\hat{v}$) has its decay term divided by a
large number: *nearly zero effective decay*, precisely for the busiest, most overfitting-prone
weights. A rarely-touched weight gets its decay amplified. The regularizer you wrote down is not
the regularizer your model received; Adam's adaptive scaling rescaled it, per knob, wrongly.

The fix is almost embarrassing: take the decay *out* of the gradient pipeline and apply it directly
to the weights, after the Adam step is computed:

$$\theta_{t+1} = \theta_t - \eta\left( \frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon} + \lambda\,\theta_t \right)$$

Every weight now leaks toward zero at the same uniform rate, untouched by $\hat{v}$. This is
**AdamW** — W for *decoupled weight decay* — and this one-line change, with $\lambda \approx 0.1$,
is the de facto standard optimizer for every serious LLM pretraining run on Earth.

## Warmup and cosine decay — the honest story

No real run holds $\eta$ constant. The universal schedule is a ramp up, then a long glide down, and
both halves have honest physical reasons.

**Warmup.** At step zero the weights are *random numbers*. The model's opinions are noise, so the
first gradients — which are computed from those opinions — are garbage: enormous, weird, and
unrepresentative of the landscape you'll actually be descending. Meanwhile Adam's $\hat{v}$, the
denominator that sizes every knob's step, has been estimated from one or two samples of that
garbage. And you know from the ponder above that Adam at $t=1$ moves *every* knob by a full $\eta$
regardless. Full-size steps, all seven billion knobs, steered by garbage: runs die this way — a
loss spike in the first few hundred steps that the model never fully recovers from. The remedy is
humility made numerical: ramp $\eta$ linearly from $0$ to $\eta_{\text{peak}}$ over the first
$\sim 1$–$2$k steps (out of hundreds of thousands), so that by the time steps are full-sized,
Adam's moment estimates have seen enough real data to be trusted.

**Cosine decay.** At the other end, remember the noisy compass: SGD noise makes the iterate rattle
around the basin in a "noise ball" whose radius scales with $\eta$. Hold $\eta$ at peak forever and
you orbit the minimum without settling into it. So after warmup, glide $\eta$ down along a smooth
cosine arc to roughly $10\%$ of peak: the noise ball shrinks, and the model settles gently into the
basin it spent the run finding. Llama-class recipe, concretely: warm up to
$\eta_{\text{peak}} \approx 3\times 10^{-4}$, then cosine down to $\approx 3\times 10^{-5}$ over
the rest of training.

## Gradient clipping — the seatbelt

One last device, cheap and unglamorous. Once in a while a bad minibatch — a pathological document,
a rare token pileup — produces a monster gradient, a cliff where you expected a slope. One
unprotected monster step can undo days of progress. So before every update, measure the gradient's
global norm, and if it exceeds a cap $c$ (usually $1.0$), scale the whole vector down to the cap:

$$\mathbf{g} \;\leftarrow\; \mathbf{g} \cdot \min\!\left(1, \frac{c}{\|\mathbf{g}\|}\right)$$

Direction preserved, length limited — a seatbelt. It does nothing at all on normal steps and saves
the run on the rare terrible one. Every frontier training recipe wears it.

> **So what?** You now know the *complete* optimizer recipe of a frontier LLM: AdamW
> ($\beta_1 = 0.9$, $\beta_2 = 0.95$, $\lambda \approx 0.1$), linear warmup $\to$ cosine decay
> ($3\times10^{-4} \to 3\times10^{-5}$), gradient clipping at norm $1.0$. Not a caricature of it —
> the actual recipe, every line of which you can now derive from a story about a blindfolded walker,
> a heavy ball, and a broken average.
`,
    },
    {
      type: 'text',
      md: md`
## The bill arrives — 560 gigabytes of bookkeeping

Everything Adam does, it does by *remembering*: an $m$ and a $v$ for every knob. Two extra numbers
per parameter, and they're kept in full fp32 precision (4 bytes each) because the whole scheme runs
on tiny differences of running averages. Two extra numbers sounds free. Multiply it out for a
70B-parameter model:

$$7\times10^{10} \text{ params} \;\times\; 2 \text{ states} \;\times\; 4 \text{ bytes} \;=\; 560 \text{ GB}$$

**Five hundred sixty gigabytes of optimizer state.** Not the model — the model's *bookkeeping*.
The parameters themselves (bf16, 2 bytes) are 140 GB; the gradients, another 140 GB; the fp32
master copy of the weights that mixed-precision training keeps, another 280 GB. Total: about
$1.1$ terabytes of training state — of which the *optimizer's memory* is the largest single item —
before storing one activation. And the biggest GPU you can buy holds 80 GB.

Divide: $1{,}120 / 80 = 14$ GPUs, minimum, just to *hold the state motionless* — never mind
computing with it. The optimizer, not the model, dominates training memory, which is why the state
must be sliced up and scattered across hundreds of GPUs, and why "how do we shard the optimizer?"
is a foundational systems question rather than an afterthought. That single number — $560$ GB for
two innocent-looking running averages — is why Module 4 (parallelism and sharding) has to exist.

## What you now own

1. **The update rule, from a blindfolded walk:** $\theta \leftarrow \theta - \eta\nabla L$, with
   step-proportional-to-slope as a built-in brake — and the factor $(1 - \eta\lambda)$ containing
   the whole fate of a run: $\eta = 0.4$ on $x^2$ converges in four steps; $\eta = 1.1$ flips sign
   and grows $20\%$ per step until the run leaves the mountain. Stability ceiling: $\eta < 2/\lambda$.
2. **The noisy compass:** minibatch gradients are unbiased but shaky, a thousand times cheaper —
   and the shake itself rattles the walker out of shallow dips toward wide basins that generalize.
3. **The narrow valley:** one $\eta$, two masters — the steepest curvature sets the ceiling, the
   shallowest sets the pace, and their ratio $\kappa$ is the whole disease. Vanilla GD ricochets
   ($3, -2.4, 1.92, \ldots$) while the floor direction crawls.
4. **Momentum, from a heavy ball:** $v \leftarrow \beta v - \eta\nabla L$ amplifies what gradients
   agree about across time ($\times 10$ at $\beta = 0.9$) and cancels what they contradict
   ($\times 0.53$) — a $19$:$1$ vote for signal over zigzag, with memory horizon $1/(1-\beta)$.
5. **Adam:** a personal learning rate for all seven billion knobs, built from a running mean $m$
   and running square $v$; $\hat{m}/\sqrt{\hat{v}}$ has size $\sim 1$, so $\eta$ *is* the step
   length — and on step one, every knob moves exactly $\eta$.
6. **Bias correction, from arithmetic:** a zero-initialized average under-reports by exactly
   $1 - \beta^t$, so divide by that — and skipping it makes early steps $3\times$ too *big*, not
   too small.
7. **The production recipe:** AdamW's decoupled decay (because decay pushed through $\sqrt{\hat{v}}$
   gets wrongly rescaled), warmup (garbage gradients plus untrusted $\hat{v}$ plus full-$\eta$
   first steps = dead runs), cosine decay (shrink the noise ball), clipping (the seatbelt).
8. **The 560 GB bill:** $7\times10^{10} \times 2 \times 4$ bytes of pure bookkeeping — the number
   that forces distributed training into existence.

The mathematics module ends here, and you should notice what happened: vectors gave you the space,
matrices the machinery, calculus the sensitivities, probability the objective, and now optimization
the engine that actually turns the knobs. Module 2 opens the machine itself — **Transformers and
Attention** — and every formula inside it will be one you can already read.
`,
    },
  ],
  questions: [
    {
      id: 'm1-l6-q1',
      kind: 'numeric',
      prompt: md`By hand: a knob sits at $\theta = 3$, its gradient is $\partial L/\partial\theta = 4$, and the learning rate is $\eta = 0.25$. What is $\theta$ after one gradient-descent update?`,
      answer: 2,
      tolerance: 0.001,
      explain: md`$\theta \leftarrow \theta - \eta g = 3 - 0.25 \times 4 = 2$. The positive gradient
means "turning this knob up raises the loss," so the update turns it *down*. This one line of
arithmetic, executed about a million times over seven billion knobs, is the whole training loop —
everything else in the lesson is quality control on this line.`,
    },
    {
      id: 'm1-l6-q2',
      kind: 'mcq',
      prompt: md`You run gradient descent on $L(x) = x^2$ (gradient $2x$, curvature $\lambda = 2$) with learning rate $\eta = 1.1$, starting at $x_0 = 1$. What happens?`,
      options: [
        md`Smooth convergence — each step lands closer to the minimum, on the same side`,
        md`Oscillating convergence — it overshoots each step, but the overshoots shrink`,
        md`Oscillating divergence — each step flips sign *and grows*: $1 \to -1.2 \to 1.44 \to -1.728 \to \cdots$`,
        md`It converges, but to a point other than $x = 0$`,
      ],
      answer: 2,
      explain: md`Each step multiplies $x$ by $(1 - 2\eta) = -1.2$. The minus sign means every step
leaps across the valley; the magnitude $1.2 > 1$ means every leap lands $20\%$ farther up the far
wall — geometric divergence. Option 2 tempts because overshoot-then-converge *is* a real regime:
at $\eta = 0.7$ the factor is $-0.4$, oscillating but shrinking — the trap is assuming overshoots
always shrink. They shrink only below the ceiling $\eta < 2/\lambda = 1$. Option 1 tempts because
"a bit more learning rate = a bit faster" feels linear; the failure is abrupt, not gradual. Option
4 is impossible here: the update has a fixed point only at $x = 0$.`,
    },
    {
      id: 'm1-l6-q3',
      kind: 'numeric',
      prompt: md`Momentum by hand, two steps, using the heavy-ball convention from the lesson: $v \leftarrow \beta v - \eta g$, then $\theta \leftarrow \theta + v$, with $v_0 = 0$, $\beta = 0.9$, $\eta = 0.1$, $\theta_0 = 1$. The gradient is $g = 2$ at both steps. Compute $\theta_2$.`,
      answer: 0.42,
      tolerance: 0.001,
      explain: md`Step 1: $v_1 = 0.9 \times 0 - 0.1 \times 2 = -0.2$, so $\theta_1 = 1 - 0.2 = 0.8$.
Step 2: $v_2 = 0.9 \times (-0.2) - 0.2 = -0.38$, so $\theta_2 = 0.8 - 0.38 = 0.42$. Notice the
second stride ($0.38$) is nearly double the first ($0.2$): with a persistent gradient the velocity
compounds toward the limit $\eta g/(1-\beta) = 2$, ten times the plain-GD step. This compounding is
exactly what rescues the crawling valley-floor direction.`,
    },
    {
      id: 'm1-l6-q4',
      kind: 'mcq',
      prompt: md`Why can the *noise* in minibatch gradients actually help training, rather than being purely a cost of scale?`,
      options: [
        md`The noise makes each minibatch gradient a more accurate estimate of the true gradient`,
        md`Random kicks can bounce the walker out of shallow dips and saddle regions that would trap a noiseless walker, biasing training toward wide basins that generalize better`,
        md`Noise raises the stability ceiling, permitting a much larger learning rate without divergence`,
        md`It cannot help — noise is strictly harmful and is tolerated only because full-dataset gradients are unaffordable`,
      ],
      answer: 1,
      explain: md`Option 1 is exactly backwards — noise makes each single estimate *less* accurate
(it tempts because averaging many noisy steps does recover accuracy over time, but that's across
steps, not within one). Option 3 tempts by association with "noise helps escape things," but the
stability bound is set by curvature and step size; a too-large $\eta$ diverges with or without
noise. Option 4 is the cynical half-truth: affordability *is* why SGD exists, but it misses the
bonus — a jostled walker can't be held by a shallow dimple, so training time concentrates in wide,
deep basins, an implicit regularization that correlates with better generalization. That bonus is
option 2.`,
    },
    {
      id: 'm1-l6-q5',
      kind: 'numeric',
      prompt: md`Bias correction by hand. With $\beta_1 = 0.9$, $m_0 = 0$, and a steady gradient $g_1 = g_2 = 5$: compute $m_2$, then the correction divisor $1 - \beta_1^2$, then the corrected estimate $\hat{m}_2 = m_2/(1 - \beta_1^2)$. Enter $\hat{m}_2$.`,
      answer: 5,
      tolerance: 0.001,
      explain: md`$m_1 = 0.1 \times 5 = 0.5$; $m_2 = 0.9 \times 0.5 + 0.1 \times 5 = 0.95$. The
divisor is $1 - 0.81 = 0.19$, and $\hat{m}_2 = 0.95/0.19 = 5$ — the correction recovers the true
steady gradient *exactly*, because $0.19$ is precisely the total weight the running average has
placed on real data so far (the other $0.81$ still sits on the phantom zero it was initialized
with). Divide a partial average by the weight it actually collected, and it stops lying. The
classic error here is using $t = 1$'s divisor ($0.1$) at $t = 2$, which gives $9.5$ — if you got
that, recheck the exponent on $\beta_1$.`,
    },
    {
      id: 'm1-l6-q6',
      kind: 'mcq',
      prompt: md`What is the essential difference between AdamW and Adam-with-L2-regularization-added-to-the-loss?`,
      options: [
        md`AdamW uses a smaller second-moment decay rate $\beta_2$, which makes it more stable on loss spikes`,
        md`Nothing — the two are algebraically identical, and AdamW is just a renaming`,
        md`Under Adam + L2, the decay term $\lambda\theta$ rides through the $1/\sqrt{\hat{v}}$ scaling, so heavily-updated weights (large $\hat{v}$) receive almost no effective decay; AdamW applies decay directly to the weights, uniformly for every parameter`,
        md`AdamW drops the momentum term and keeps only the per-parameter scaling`,
      ],
      answer: 2,
      explain: md`Option 2 is the honest trap: under *plain SGD* the two really are equivalent, and
that's exactly why people assumed for years the same held under Adam. It doesn't — Adam's
per-parameter division rescales the decay term along with the gradient, so the busiest weights
(large gradient history, large $\hat{v}$) have their decay divided nearly to zero: the weights most
prone to overfitting get the least regularization. AdamW routes the decay around the adaptive
machinery entirely, shrinking every weight at the same uniform rate. Options 1 and 4 tempt because
LLM runs *do* often lower $\beta_2$ (to $0.95$) and momentum *is* a separate component — both real
facts, neither being what the W changes.`,
    },
    {
      id: 'm1-l6-q7',
      kind: 'written',
      prompt: md`**Derive, don't recall — Adam by hand, two full steps.** One knob: $\theta_0 = 1$, $\eta = 0.2$, $\beta_1 = 0.9$, $\beta_2 = 0.999$, $\epsilon \approx 0$ (ignore it), $m_0 = v_0 = 0$. The gradients are $g_1 = 4$, then $g_2 = 2$. For each step write out *every* intermediate: $m_t$, $v_t$, the correction divisors, $\hat{m}_t$, $\hat{v}_t$, the update $\eta\,\hat{m}_t/\sqrt{\hat{v}_t}$, and the new $\theta_t$. Finish with one sentence on what you notice about the two update magnitudes, given that the gradient halved.`,
      rubric: md`**Step 1** ($t = 1$; divisors $1 - 0.9^1 = 0.1$ and $1 - 0.999^1 = 0.001$):

$$m_1 = 0.9 \times 0 + 0.1 \times 4 = 0.4
\qquad
v_1 = 0.999 \times 0 + 0.001 \times 16 = 0.016$$

$$\hat{m}_1 = \frac{0.4}{0.1} = 4
\qquad
\hat{v}_1 = \frac{0.016}{0.001} = 16$$

$$\text{update} = 0.2 \times \frac{4}{\sqrt{16}} = 0.2 \times 1 = 0.2
\qquad
\theta_1 = 1 - 0.2 = 0.8$$

**Step 2** ($t = 2$; divisors $1 - 0.81 = 0.19$ and $1 - 0.998001 = 0.001999$):

$$m_2 = 0.9 \times 0.4 + 0.1 \times 2 = 0.56
\qquad
v_2 = 0.999 \times 0.016 + 0.001 \times 4 = 0.019984$$

$$\hat{m}_2 = \frac{0.56}{0.19} \approx 2.947
\qquad
\hat{v}_2 = \frac{0.019984}{0.001999} \approx 9.997$$

$$\text{update} = 0.2 \times \frac{2.947}{\sqrt{9.997}} \approx 0.2 \times \frac{2.947}{3.162} \approx 0.186
\qquad
\theta_2 = 0.8 - 0.186 \approx 0.614$$

**Observation (required):** the raw gradient halved ($4 \to 2$) but the updates barely moved
($0.200 \to 0.186$, both $\approx \eta$). Adam normalizes: $\hat{m}/\sqrt{\hat{v}}$ has typical
size $\sim 1$, so $\eta$ directly sets the stride and the trajectory is invariant to the overall
loudness of the gradients.

**Grading yourself:** full credit requires all six quantities at both steps (twelve numbers), the
correct divisors at $t = 2$ — writing $0.1$ and $0.001$ again, i.e. forgetting the exponent $t$,
is *the* classic error — and the observation sentence. Recalling only the final $\theta_2$ without
the intermediates is exactly what this question is not about.`,
    },
    {
      id: 'm1-l6-q8',
      kind: 'mcq',
      prompt: md`Gradient clipping by global norm, with cap $c = 1$: a bad minibatch produces a gradient vector of norm $50$. What does clipping do to it?`,
      options: [
        md`Sets to zero every individual component whose absolute value exceeds $1$`,
        md`Skips the update entirely and moves on to the next minibatch`,
        md`Rescales the whole vector by $1/50$ — the direction is kept exactly, the length is capped at $1$`,
        md`Permanently reduces the learning rate for the rest of the run`,
      ],
      answer: 2,
      explain: md`Global-norm clipping multiplies the entire gradient by
$\min(1, c/\|\mathbf{g}\|) = 1/50$: same direction, capped length — a seatbelt, not a steering
wheel. Option 1 tempts because "clip" sounds elementwise, and elementwise clipping does exist —
but zeroing or capping components *individually* changes the gradient's direction, turning a
well-aimed (if oversized) step into a differently-aimed one. Option 2 tempts as the cautious
choice, but discarding the step throws away real information — the direction was fine, only the
magnitude was wild. Option 4 confuses a one-step guard with a schedule change: clipping acts on
this step only and does nothing at all on normal steps.`,
    },
    {
      id: 'm1-l6-q9',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old** (the Feynman technique — the true test of owning an idea): explain *momentum* using a heavy ball rolling along a bumpy gutter that slopes gently downhill. The kid should come away understanding (1) what goes wrong for a very light ball, (2) why a heavy ball does better on the same gutter, and (3) what the heavy ball's "memory" has to do with how computers learn. Every technical word you need, you must first explain in kid-words.`,
      rubric: md`Grade the *teaching*, not the vocabulary. A "nailed it" answer must:

1. **Set the scene in kid-physics:** a gutter (or halfpipe) with steep sides, sloping gently
   toward a drain at the far end. The ball's job is to reach the drain.
2. **The light ball's failure:** a nearly weightless ball obeys whatever patch of ground it's on
   *right now* — steep side-walls shove it hard, gentle downhill barely shoves it — so it
   ping-pongs from wall to wall all the way down, wasting almost all its motion going sideways,
   crawling toward the drain.
3. **Why the heavy ball wins:** a heavy ball keeps its speed and direction — a new shove only
   *nudges* it. The wall-shoves alternate (left, right, left...) so in the ball's motion they
   cancel out; the drain-ward shove is the same every time, so it *adds up* and the ball glides
   faster and straighter the longer it rolls.
4. **The bridge to learning:** the computer improving its guesses is like the ball rolling
   downhill (downhill = fewer mistakes, explained in words). Instead of obeying only the latest
   push, it keeps a running memory of recent pushes and moves the way they *agree* — so jittery,
   contradictory pushes cancel and the steady "you're getting better this way" push wins.
5. **Jargon check (this is where credit is lost):** *gradient*, *velocity*, *learning rate*,
   *optimizer*, *loss*, *exponential moving average* — each of these used without a kid-words
   explanation first costs marks. Jargon-hiding is precisely the failure mode this exercise
   exists to catch. Bonus credit for a quantitative flourish in kid form, e.g. "the steady push
   ends up about ten times stronger than any single shove."`,
    },
    {
      id: 'm1-l6-q10',
      kind: 'written',
      prompt: md`**The schedule.** Describe (or sketch) the learning-rate-vs-step curve of a Llama-class pretraining run — linear warmup, then cosine decay — labeling the peak, the warmup length, and the final value. Then explain: (a) *why* warmup exists — what three things are simultaneously wrong at step 1 that make full-size steps dangerous (your answer should mention the state of the weights, Adam's second moment, and what Adam does on its first step); (b) what concretely tends to happen to a run that skips warmup; (c) why the schedule decays at the end instead of holding the peak forever.`,
      rubric: md`A strong answer:

1. **Shape, with labels:** a straight ramp from $0$ up to $\eta_{\text{peak}} \approx 3\times10^{-4}$
   over the first $\sim 1$–$2$k steps (out of hundreds of thousands), then a smooth cosine arc down
   to $\approx 10\%$ of peak ($\approx 3\times10^{-5}$) at the end. No jumps.
2. **(a) The three-way pileup at step 1:** the weights are random, so the first gradients are
   garbage — huge, weird, unrepresentative of the landscape the run will actually descend;
   Adam's $\hat{v}$, the denominator sizing every knob's step, has been estimated from one or two
   samples of that garbage, so per-knob step sizes are untrustworthy exactly when gradients are
   wildest; and Adam's first step moves *every* knob by a full $\eta$ regardless of gradient size
   ($\hat{m}_1/\sqrt{\hat{v}_1} = \pm 1$). Full-size strides, all seven billion knobs, steered by
   noise.
3. **(b) Without warmup:** loss spikes or outright divergence (NaNs) in the first few hundred
   steps, or a run that survives but plateaus permanently above where the warmed-up run lands —
   early damage that later training never fully repairs.
4. **(c) Why decay:** minibatch noise makes the iterate rattle around the basin in a noise ball
   whose radius scales with $\eta$; annealing $\eta$ shrinks the ball so the model settles finely
   into the basin it found. Holding peak forever means orbiting the minimum instead of landing.

Full credit: correct labeled shape, all *three* step-1 pathologies in (a) — most answers remember
the random weights and forget the $\hat{v}$ and first-step arguments — a concrete failure mode in
(b), and the noise-ball (or equivalent settling) argument in (c).`,
    },
    {
      id: 'm1-l6-q11',
      kind: 'numeric',
      prompt: md`**Fermi estimate (paper first, calculator last):** Adam keeps two extra state numbers ($m$ and $v$) per parameter, each in fp32 (4 bytes). For a 70-billion-parameter model, roughly how many **gigabytes** of optimizer state is that — before counting the parameters or gradients themselves?`,
      answer: 560,
      tolerance: 60,
      explain: md`$7\times10^{10} \times 2 \times 4$ bytes $= 5.6\times10^{11}$ bytes $= 560$ GB.
Feel the absurdity properly: over half a terabyte of pure *bookkeeping* — running averages whose
only job is to remember which way gradients have been pushing — dwarfing the 140 GB the bf16
weights themselves occupy, on hardware that tops out at 80 GB per GPU. One back-of-envelope
multiplication, and you've derived why distributed sharding (Module 4) is not an optimization but
a precondition. Estimates like this catch more research-plan errors than any amount of code.`,
    },
    {
      id: 'm1-l6-q12',
      kind: 'written',
      prompt: md`**The bill and its consequences.** For a 70B-parameter model trained with AdamW using bf16 (2-byte) weights and gradients, and fp32 (4-byte) Adam $m$, Adam $v$, and master weights: compute the memory for each of the five tensors and the total. One H100 GPU holds 80 GB. How many GPUs are needed at minimum just to *store* this state, which single item dominates the bill, and what does this force upon anyone who wants to train such a model?`,
      rubric: md`**The arithmetic** ($7\times10^{10}$ parameters):

- weights, bf16: $7\times10^{10} \times 2$ B $= 140$ GB
- gradients, bf16: $140$ GB
- Adam $m$, fp32: $280$ GB
- Adam $v$, fp32: $280$ GB
- fp32 master weights: $280$ GB

**Total:** $140 + 140 + 280 + 280 + 280 = 1{,}120$ GB $\approx 1.1$ TB — that is $16$ bytes per
parameter, of which $12$ belong to the optimizer and master copy. The dominant item is the
optimizer state: Adam's $m + v$ alone are $560$ GB, four times the model's own bf16 footprint.

**The GPU floor:** $1{,}120 / 80 = 14$ GPUs minimum merely to hold the state — before a single
activation is stored or a single step computed; real runs need far more once activation memory and
throughput enter.

**The forced conclusion:** single-GPU training of a 70B model is not "slow" — it is *physically
impossible*, by an order of magnitude, and the impossibility is caused chiefly by the optimizer,
not the model. Therefore parameters, gradients, and above all optimizer states must be sharded
across many GPUs (ZeRO / FSDP-style), which turns training into a distributed-systems problem —
precisely where Module 4 begins.

Full credit: all five memory numbers, the $\approx 1.1$ TB total, the $14$-GPU floor from
$1{,}120/80$, the identification of optimizer state as the dominant item, and the
impossibility-therefore-sharding conclusion.`,
    },
  ],
}
