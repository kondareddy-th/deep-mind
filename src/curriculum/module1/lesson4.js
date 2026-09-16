// Module 1, Lesson 4 — Probability: what a language model actually is (Feynman rewrite)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace (JS interpolation) inside content.

const md = String.raw

export default {
  id: 'm1-l4',
  title: '1.4 Probability — what a language model actually is',
  subtitle: md`Strip away the GPUs, the layers, the hype. What kind of mathematical object is left? One function: text in, a belief about every possible next token out. This lesson earns that claim.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Take the most capable AI system you know of — Claude, GPT-4, pick one. Now strip it. Take away the
data centers. Take away the GPUs. Take away the hundred-odd layers, the attention heads, the
trillion learned parameters, the hype, the discourse. Keep stripping until nothing implementation-
shaped remains, and ask:

> What **kind** of mathematical object is left? Not "how does it work" — what *is* it?

A database of sentences? A pile of if-then rules? Some genuinely new kind of thing that needs new
mathematics? Guess before reading on — most people's first guess is wrong in an interesting way.

Here is the claim this lesson will earn: what's left is **one function**.

$$f(\text{text so far}) \;=\; \text{a probability for every token that could come next}$$

That's the whole object. Writing poetry, debugging code, passing the bar exam — every capability
you have ever watched an LLM display is this one function being evaluated over and over: feed in
the text so far, get back beliefs about the next token, pick one, append it, feed the longer text
back in. Everything else — embeddings, matrices, attention — is *implementation*: the "how" of
computing this function fast and well. The "what" is above, in one line.

But the line contains a word we haven't built yet: **probability**. To see why the function must
output probabilities (and not, say, a single best guess), and what rules those outputs must obey,
we need probability from zero. It's a short trip, and every stop on it shows up verbatim inside a
transformer.

## A distribution is a complete set of beliefs

Start with the everyday meaning. A forecaster says "30% chance of rain tomorrow." What kind of
statement is that? It's not a prediction of what *will* happen — it's a measured **degree of
belief**, a number attached to an outcome. Probability is belief made numerical, and the rules of
probability are nothing but the rules for keeping numerical beliefs *self-consistent*.

There are exactly two rules. Suppose an uncertain situation has a set of possible outcomes — the
faces of a die, the tokens of a vocabulary — and you assign each outcome $x$ a number $p(x)$:

1. $p(x) \ge 0$ for every outcome. Belief can shrink to zero ("won't happen") but there is no such
   thing as less-than-impossible. A negative belief is not a strong "no"; it's nonsense.
2. $\sum_x p(x) = 1$. And here's the *why*, because this rule is the one with content: **something
   must happen.** The outcomes, listed properly, cover every possibility exactly once. If your
   numbers total $0.9$, then $10\%$ of your belief points at... nothing — you believe there's a
   real chance that *no outcome at all* occurs, which is not a thing. If they total $1.2$, you're
   counting some possibility twice — your beliefs overlap and a clever bookmaker can sell you a set
   of bets that loses money no matter what happens. Summing to exactly $1$ is the statement: *my
   beliefs are complete and they don't double-count.*

A full assignment $p$ obeying both rules is called a **probability distribution**. Not a scary
object: it is a *complete, self-consistent set of beliefs about one uncertain thing*. Here's one,
over a toy 4-token vocabulary, for the next token after "The cat":

| token | *sat* | *ran* | *is* | *quantum* |
|---|---|---|---|---|
| $p(x)$ | $0.5$ | $0.3$ | $0.15$ | $0.05$ |

Check: all nonnegative; $0.5 + 0.3 + 0.15 + 0.05 = 1$. Valid. Notice the sum-to-1 rule has teeth:
belief is a *conserved substance*. To raise your belief in *sat*, you must take belief away from
the others. A distribution can't like everything.

> **So what:** every time an LLM emits one token, it first produces exactly this — a table like the
> one above, but with $100{,}000$-ish rows (one per vocabulary token), all nonnegative, summing to
> $1$. A thousand-word reply means roughly $1{,}300$ complete belief-tables, about $130$ *million*
> individual beliefs, manufactured one table per token. The table above *is* the object; the model
> just makes it very, very wide.
`,
    },
    {
      type: 'example',
      title: 'expectation, invented as a fair price',
      md: md`
Suppose uncertain outcomes come with *payoffs*, and I offer you a raffle ticket:

- pays $100$ dollars with probability $0.01$
- pays $10$ dollars with probability $0.19$
- pays nothing with probability $0.80$

What is this ticket *worth*? Don't reach for a formula — reach for a warehouse. Imagine buying a
**million** of these tickets. About $10{,}000$ of them pay $100$ dollars: that's $1{,}000{,}000$
dollars. About $190{,}000$ pay $10$: another $1{,}900{,}000$. The rest pay nothing. Total: about
$2{,}900{,}000$ dollars across a million tickets — so each ticket brought in, on average,

$$\frac{2{,}900{,}000}{1{,}000{,}000} = 2.90 \text{ dollars.}$$

That's the fair price. Pay less and you profit in the long run; pay more and you bleed. Now look at
what our warehouse computation *was*: each payoff, weighted by how often it happens:

$$\mathbb{E}[X] = \sum_x x\, p(x) = 100(0.01) + 10(0.19) + 0(0.80) = 1 + 1.9 + 0 = 2.9$$

That's the **expectation** (or *expected value*) of the payoff $X$ — the long-run average, the
fair price. There's also a physical picture worth keeping: put $1\%$ of a kilogram at position
$100$ on a ruler, $19\%$ at position $10$, $80\%$ at position $0$. The ruler balances at exactly
$2.9$ — expectation is the **center of mass** of belief. One number summarizing where the
distribution "sits."
`,
    },
    {
      type: 'text',
      md: md`
## Variance — and the debt from lesson 1.1, repaid

The average is one number, and one number always hides something. It hides *spread*. A ticket
paying $2.90$ dollars guaranteed and our raffle ticket have the *same* expectation — utterly
different experiences. We want a number for "how far from average is a typical outcome?"

First try: average the deviation from average, $\mathbb{E}[X - \mathbb{E}[X]]$. Compute it:
$\mathbb{E}[X] - \mathbb{E}[X] = 0$. Always zero, for every distribution — overshoots and
undershoots cancel by construction. The average is, by definition, the place deviations cancel.
So kill the signs first: square each deviation, *then* average, then (to undo the squaring's units)
take a square root at the end:

$$\mathrm{Var}(X) = \mathbb{E}\big[(X - \mathbb{E}[X])^2\big], \qquad \sigma = \sqrt{\mathrm{Var}(X)}$$

**Variance** is the average *squared* wobble; its square root $\sigma$, the **standard deviation**,
is the honest "typical distance from average," in the same units as $X$.

Now let me pay off a promise. In lesson 1.1 I claimed — without proof — that a drunkard taking $d$
random $\pm 1$ steps ends up typically $\sqrt{d}$ from home, and that this is why attention scores
get divided by $\sqrt{d_k}$. Watch how cheaply probability delivers the proof.

One step: $X_i = +1$ or $-1$, each with probability $\tfrac12$. Then $\mathbb{E}[X_i] = 0$, and the
variance is $\mathbb{E}[X_i^2] = \tfrac12(+1)^2 + \tfrac12(-1)^2 = 1$. Now the whole walk,
$S = X_1 + X_2 + \cdots + X_d$. Its expectation is $0$ (averages add). Its variance:

$$\mathbb{E}[S^2] = \mathbb{E}\Big[\Big(\sum_i X_i\Big)^2\Big] = \sum_i \mathbb{E}[X_i^2] \;+\; \sum_{i \ne j} \mathbb{E}[X_i X_j]$$

The first sum is $d$ copies of $1$. The cross-terms: for *independent* steps, the average of a
product is the product of averages (each flip doesn't care about the other), so
$\mathbb{E}[X_i X_j] = \mathbb{E}[X_i]\,\mathbb{E}[X_j] = 0 \times 0 = 0$. Everything but the
diagonal dies:

$$\mathrm{Var}(S) = d \qquad \Longrightarrow \qquad \sigma = \sqrt{d}$$

Three lines. Independent wobbles add *in the square*, so typical size grows as the square root.

> **So what:** a query–key attention score is $\mathbf{q}\cdot\mathbf{k} = \sum_i q_i k_i$ — a sum
> of $d_k$ independent-ish random products, i.e. *exactly the walk above*. With $d_k = 128$, raw
> scores come out around $\pm\sqrt{128} \approx \pm 11$ before any learning happens, and later in
> this lesson you'll see why a lead of eleven is a landslide once a softmax gets hold of it.
> Dividing by $\sqrt{d_k}$ tames scores back to $\pm 1$. The most famous denominator in machine
> learning is this variance computation. Debt from lesson 1.1: paid in full.
`,
    },
    {
      type: 'ponder',
      question: md`A forecaster announces a $70\%$ chance of rain tomorrow. It doesn't rain. Was she
wrong? More pointedly: what observation — what *single* event — could ever prove a probability
wrong? Think it through before revealing; the answer changes how you read every claim an LLM makes.`,
      answer: md`She wasn't wrong — and no single day could show she was. "$70\%$ rain" *includes*
"$30\%$ dry"; a dry day is fully compatible with the forecast. Unless she says $0$ or $1$, no
individual outcome can falsify her. That seems to make probabilities unfalsifiable — but there's an
escape, and it's the important part: judge her **in bulk**. Collect the hundred days she said
"$70\%$" and count. If about $70$ of them got rain, she's **calibrated** — her numbers mean what
they say. If $95$ did, she was underconfident; if $40$, she was bluffing.

Probabilistic beliefs can only be graded *on average, over many predictions*. Now the payoff: an
LLM makes a probabilistic forecast at every single token — so it can only be graded the same way,
by averaging a score over many tokens. That average has a name: the **loss function**, and building
the right per-token score is the entire subject of lesson 1.5. One more surprise while we're here:
base LLMs turn out to be remarkably well *calibrated* — when a pretrained model puts $70\%$ on an
answer, it's right about $70\%$ of the time. The models are forecasters in exactly the
weatherwoman's sense.`,
    },
    {
      type: 'text',
      md: md`
## Conditional probability — belief with context

Here is the fact that makes probability subtle and language modeling possible: **probability lives
in the knower, not just in the world.** Same die, same physics — different knowledge, different
correct beliefs.

Roll a fair die under a cup. Your belief: $p(6) = \tfrac16$. Now I peek and tell you: "it's even."
What should you believe about the 6 now? Three outcomes survive the news — $2, 4, 6$ — and nothing
favors one over another, so: $p(6 \mid \text{even}) = \tfrac13$. Your belief *doubled* without the
die moving.

Look at what your mind just did, because it's a two-step recipe worth naming. Step one: **throw
away every outcome incompatible with the news** (goodbye $1, 3, 5$). Step two: the surviving
beliefs now total only $\tfrac12$ — an incomplete belief set! — so **rescale them to sum to 1
again** (divide by $\tfrac12$). That recipe, written as a formula, is the definition of
**conditional probability**:

$$p(A \mid B) = \frac{p(A \text{ and } B)}{p(B)}$$

— the part of $A$ that lives inside the $B$-world, re-measured relative to the $B$-world's size.
Check it on the die: $p(6 \text{ and even}) = \tfrac16$ (a 6 *is* even), $p(\text{even}) =
\tfrac12$, ratio $= \tfrac13$. The formula is your two-step mental recipe, mechanized.

Now feel the size of this effect in language. Across English text at large,
$p(\text{Tower}) \approx 0.0001$ — one word among thousands of plausible ones. But:

$$p(\text{Tower} \mid \text{The Eiffel}) \approx 0.95$$

Two words of context moved a belief by a factor of about **ten thousand** — four orders of
magnitude. Sit with that: what we casually call "understanding language" is, numerically, *knowing
exactly how far and in which direction every possible context should move your beliefs about what
comes next*. That is the skill, the whole skill, that a language model is trained to have.
`,
    },
    {
      type: 'text',
      md: md`
## The chain rule — derived from counting, then unleashed

Take the definition of conditional probability and multiply both sides by $p(B)$:

$$p(A \text{ and } B) = p(B)\; p(A \mid B)$$

As a story: *to land both events, first land $B$, then — living inside the world where $B$ already
happened — land $A$.* It's a counting fact, and you can watch it count. Deal two cards off a
shuffled deck. Probability both are aces? First card: $\tfrac{4}{52}$. Second card, *given* the
first was an ace: only $3$ aces remain among $51$ cards, so $\tfrac{3}{51}$. Multiply:

$$p(\text{ace, ace}) = \frac{4}{52} \times \frac{3}{51} = \frac{12}{2652} = \frac{1}{221} \approx 0.0045$$

No approximation anywhere — we just rearranged a definition. But now do the move that built an
industry: **iterate it**. Three events: peel off the last one, then peel again:

$$p(A, B, C) = p(A)\; p(B \mid A)\; p(C \mid A, B)$$

And for a sequence of $n$ words, peeling all the way down:

$$p(w_1, w_2, \dots, w_n) = \prod_{i=1}^{n} p(w_i \mid w_1, \dots, w_{i-1})$$

This is the **chain rule of probability**. Spell it out for an actual four-word sentence, *"The
cat sat down"*, term by term, with toy numbers:

- $p(\text{The}) = 0.2$ — how often a sentence *starts* with "The"
- $p(\text{cat} \mid \text{The}) = 0.05$ — of all things "The" precedes, cats are some
- $p(\text{sat} \mid \text{The cat}) = 0.3$ — cats sit a lot
- $p(\text{down} \mid \text{The cat sat}) = 0.4$ — and when they sit, it's often down

$$p(\text{The cat sat down}) = 0.2 \times 0.05 \times 0.3 \times 0.4 = 0.0012$$

Each factor is a *next-word prediction given everything so far*. And now the honest observation
that deserves italics, capitals, and a drumroll:

> **This factorization is EXACT.** Not an approximation, not a modeling assumption — an identity,
> true for *every* distribution over sequences, derived in one line from the definition of
> conditioning. Read it right to left and it performs the single most consequential reduction in
> the history of NLP: the impossible-sounding task "assign a coherent probability to every possible
> document" becomes the concrete task "**predict one next token, given the text so far**" — done
> over and over. Nothing is lost in the exchange. A machine that can produce every conditional
> factor automatically defines a complete, exact distribution over all texts of all lengths.

This is what the word **autoregressive** means, and it explains the strangest-sounding fact about
modern AI: that you get something like Claude by training on the objective "guess the next token."
The chain rule is why that modest objective is not modest at all — via the factorization, *guessing
the next token well* is literally the same problem as *modeling all text*. Better still, the
training data labels itself: every position in every real document is a solved exercise ("context:
the text before me; correct answer: me"). Trillions of free exam questions.
`,
    },
    {
      type: 'ponder',
      question: md`Fine — a language model must produce $p(\text{next token} \mid \text{context})$.
Here's the obvious engineering plan: **build the table.** One row per possible context, one column
per vocabulary token; fill in the probabilities by counting occurrences on the internet; done — no
neural networks required. Take a vocabulary of $100{,}000$ tokens and contexts of length $100$.
*Estimate the number of rows before revealing.* Then decide whether the plan can be rescued.`,
      answer: md`Each of the $100$ context positions can hold any of $100{,}000$ tokens, so the row
count is

$$100{,}000^{100} = (10^{5})^{100} = 10^{500}.$$

Numbers like this don't mean anything until you try to house them. Atoms in the observable
universe: about $10^{80}$. Square that — give every atom its own private universe and count *those*
atoms: $10^{160}$. Square it **again**: $10^{320}$. You are *still* short of the table by a factor
of $10^{180}$. The table doesn't fit in physics.

And it gets worse: you couldn't fill it even if it fit. All the text humanity has ever produced is
maybe $10^{13}$–$10^{14}$ tokens — so at most $10^{14}$ of the $10^{500}$ rows would contain even a
single observation. Almost every $100$-token context that will ever be typed, *including the one
you are reading right now*, has never occurred before in history. A lookup table has literally
nothing to look up.

The conclusion is forced, and it is the founding move of the whole field: replace the table with a
**function** — a formula with a few billion *shared* parameters that *computes* any row on demand
instead of storing all rows. Sharing is the magic word: because the same parameters serve every
context, patterns learned from contexts that did occur automatically extend to the
$10^{500} - 10^{14}$ that didn't. That's **generalization**, and it isn't optional — it's the only
way the arithmetic works out. A transformer is nothing more or less than the best functional form
we currently know for this function.`,
    },
    {
      type: 'text',
      md: md`
## The cheap escape that fails — independence

Before accepting "learn a billion-parameter function," a good scientist checks for a cheaper way
out, and there's a classical one on offer. Call events $A$ and $B$ **independent** if

$$p(A \text{ and } B) = p(A)\, p(B) \qquad \text{equivalently} \qquad p(A \mid B) = p(A)$$

— the news $B$ doesn't move your belief in $A$ at all. Coin flips are like this; that's what makes
them boring. Now the tempting move: *assume words are independent.* Then every factor in the chain
rule collapses, $p(w_i \mid \text{context}) = p(w_i)$, and the monstrous $10^{500}$-row table
shrinks to a single row of $100{,}000$ word frequencies. Countable in an afternoon!

And the resulting "language model" is a catastrophe. With context powerless, the best it can do is
emit words by raw frequency: *"the of and a in to was..."* — word salad, forever. The assumption
isn't just inaccurate; it deletes the phenomenon. We measured it earlier:
$p(\text{Tower}) \approx 0.0001$ but $p(\text{Tower} \mid \text{The Eiffel}) \approx 0.95$.
Independence declares those two numbers equal — it is wrong by a factor of ten thousand about the
very thing language *is*. Context changing beliefs is not a complication of language; it is the
entire content of language.

> **So what:** every architecture you'll meet in Module 2 is machinery for *refusing* this
> assumption efficiently — attention is, at bottom, a device for hauling information from distant
> context into the current conditional $p(w_i \mid w_1, \dots, w_{i-1})$. The whole value of a
> trillion-parameter model lives in the gap between $p(w)$ and $p(w \mid \text{context})$. Where
> that gap is zero, a frequency table matches GPT-4.
`,
    },
    {
      type: 'text',
      md: md`
## Inventing softmax

So the model is a function. Functions built from the tools of lessons 1.1–1.3 — matrix
multiplications, nonlinearities — naturally end in a stack of raw numerical scores, one per
vocabulary token. These raw scores are called **logits**: call them $z_1, \dots, z_V$. They can be
anything: $3.2$, $-7.1$, $0.04$. But beliefs, we established, must obey two laws. So we need a
converter, and rather than look one up, let's write the requirements and see what machine they
force on us:

1. **Every output positive.** Nonnegative for the axioms — but in fact *strictly* positive: a model
   should never output an exact $0$, because "impossible" is a claim you can't cash. (Lesson 1.5
   will show the penalty for calling an actual event impossible is *infinite*. Never say never.)
2. **Outputs sum to $1$.** Complete, non-overlapping belief.
3. **Order preserved.** If $z_i > z_j$, then $p_i > p_j$ — the converter must not betray the
   scores' ranking.
4. **Smooth.** Training (lesson 1.3) works by nudging logits in tiny steps and following
   gradients; a tiny nudge must produce a tiny, well-defined change in belief, or learning gets no
   signal.

Requirement 2 is easy to bolt on at the end: whatever positive numbers we produce, divide each by
their total — instant sum-to-1. So the real question is requirement 1 plus 3 plus 4: *what's a
smooth, strictly increasing machine that maps every real number — including the negatives — to a
strictly positive one?* The exponential, $e^z$: always positive, always increasing, smooth
everywhere, and (as lesson 1.3 taught) uniquely comfortable with derivatives. Exponentiate, then
normalize:

$$\mathrm{softmax}(\mathbf{z})_i = \frac{e^{z_i}}{\sum_{j=1}^{V} e^{z_j}}$$

That's **softmax** — not a decree, just the shortest path through four requirements. You could
have invented it, and in a moment (see the ponder below) you'll prove the obvious-looking
alternative fails.
`,
    },
    {
      type: 'example',
      title: 'softmax and temperature, fully by hand',
      md: md`
Logits for a 3-token vocabulary: $\mathbf{z} = (2,\; 1,\; 0.1)$.

**Step 1 — exponentiate:** $\;e^{2} = 7.389$, $\;e^{1} = 2.718$, $\;e^{0.1} = 1.105$.

**Step 2 — total:** $\;7.389 + 2.718 + 1.105 = 11.212$.

**Step 3 — divide each by the total:**

$$p_1 = \frac{7.389}{11.212} \approx 0.659 \qquad p_2 = \frac{2.718}{11.212} \approx 0.242 \qquad p_3 = \frac{1.105}{11.212} \approx 0.099$$

Check: $0.659 + 0.242 + 0.099 = 1.000$. All positive, ordered like the logits. And notice a
signature: $p_1 / p_2 = 0.659 / 0.242 \approx 2.72 \approx e$. A logit *gap* of $1$ became a
probability *ratio* of $e$ — softmax turns additive score differences into multiplicative belief
ratios. Gaps are all it sees (the ponder below shows why that's a feature).

**Now temperature.** Suppose we want to control how *committed* the beliefs are without retraining
anything. The gaps carry the commitment — so stretch or squash the gaps: divide every logit by a
number $T$ before the softmax. Same logits, three settings:

At $T = 0.5$ the effective logits double, to $(4,\; 2,\; 0.2)$:
$e^4 = 54.598$, $e^2 = 7.389$, $e^{0.2} = 1.221$; total $63.208$;

$$p = (0.864,\; 0.117,\; 0.019)$$

At $T = 2$ the effective logits halve, to $(1,\; 0.5,\; 0.05)$:
$e^1 = 2.718$, $e^{0.5} = 1.649$, $e^{0.05} = 1.051$; total $5.418$;

$$p = (0.502,\; 0.304,\; 0.194)$$

| token | $T = 0.5$ (sharpened) | $T = 1$ (raw) | $T = 2$ (flattened) |
|---|---|---|---|
| $p_1$ | $0.864$ | $0.659$ | $0.502$ |
| $p_2$ | $0.117$ | $0.242$ | $0.304$ |
| $p_3$ | $0.019$ | $0.099$ | $0.194$ |

Halving the temperature took the favorite from $66\%$ to $86\%$; doubling it dragged the favorite
down to $50\%$. The *ranking* never moves — dividing by a positive number can't reorder — only the
confidence does.
`,
    },
    {
      type: 'text',
      md: md`
## The temperature knob, end to end

Push temperature to its limits and you understand the knob completely. The cleanest tool is the
ratio between any two probabilities:

$$\frac{p_i(T)}{p_j(T)} = e^{(z_i - z_j)/T}$$

- **$T \to 0^{+}$:** every gap $(z_i - z_j)/T$ blows up toward $\pm\infty$. The largest logit's
  ratio over everyone becomes infinite; since beliefs must still sum to $1$, the favorite takes
  *everything*. Sampling from an all-spike distribution is just picking the argmax: **greedy
  decoding**. Deterministic, safe, and famously prone to repetitive, robotic text.
- **$T \to \infty$:** every gap is squashed to $0$, every ratio to $e^{0} = 1$: all tokens equally
  believed — the **uniform** distribution over the whole vocabulary. Grammar dissolves into static.

Between the extremes lives every LLM API's temperature parameter — this one division, nothing
more. In practice roughly $T \in [0, 0.3]$ for code and facts, up toward $1$ for prose, above only
if you enjoy chaos.

One paragraph of preview, because the distribution is only half of generation: a **sampling
strategy** decides what to *do* with the beliefs. **Greedy** always takes the favorite. **Top-k**
samples only among the $k$ highest-probability tokens (renormalized), amputating the long tail of
one-in-a-million junk that would otherwise occasionally surface. **Nucleus (top-p)** keeps the
*smallest* set of tokens whose beliefs total $p$ (say $0.9$) — an adaptive cutoff that keeps few
options when the model is sure and many when it's torn. Their pathologies and trade-offs are a
Module 3 story; here it's enough to see that all of them are just different hands reaching into the
same distribution.
`,
    },
    {
      type: 'ponder',
      question: md`Exponentials feel fancy. To make scores positive, why not just **square** them?
Define $p_i = z_i^2 \big/ \sum_j z_j^2$ — positive, sums to $1$, no transcendental functions.
Find what's broken before revealing. Two hints, which are really two separate failures: try the
logits $(2, \; -3)$; then try the logits $(1,\; 2)$ versus $(11,\; 12)$.`,
      answer: md`**Failure 1 — squaring betrays the ranking.** Logits $(2, -3)$: squares are
$(4, 9)$, so the *worse* token gets $9/13 \approx 0.69$ of the belief. A logit of $-3$ means the
model is voting *against* that token; squaring hears a loud vote and forgets it was a "no."
Requirement 3, dead. (Exponentials pass: $e^{-3} \approx 0.05$ is small and positive — a quiet,
correctly-signed vote.)

**Failure 2 — squaring invents a fake zero.** Logits $(1, 2)$: squares give beliefs
$(0.2,\; 0.8)$. Now add $10$ to both logits — same gap, so presumably the same beliefs? Squares:
$(121, 144)$, beliefs $(0.457,\; 0.543)$. Wildly different! Squaring cares where zero is, but logit
zero *means nothing* — scores are pure comparisons, with no absolute scale. Any honest converter
should depend only on the **differences** between logits.

Softmax passes this test *exactly*: add any constant $c$ to every logit and

$$\frac{e^{z_i + c}}{\sum_j e^{z_j + c}} = \frac{e^{c}\, e^{z_i}}{e^{c} \sum_j e^{z_j}} = \frac{e^{z_i}}{\sum_j e^{z_j}}$$

— the $e^c$ cancels top and bottom. Adding a constant is a perfect no-op; only gaps matter. That's
the deep reason the exponential is the right machine: it's the function that converts *shifts* into
*scalings*, which normalization then erases. (A practical bonus you'll meet in real code: since
shifting is free, implementations subtract the max logit before exponentiating so nothing
overflows — the famous numerical-stability trick is just this invariance, cashed.)`,
    },
    {
      type: 'text',
      md: md`
## Bayes' rule — the chain rule read backwards

One more tool, and we get it for free. The chain rule can peel a joint probability in two orders:

$$p(A \text{ and } B) = p(A)\,p(B \mid A) = p(B)\,p(A \mid B)$$

Two expressions, one quantity — set them equal and divide by $p(B)$:

$$p(A \mid B) = \frac{p(B \mid A)\;p(A)}{p(B)}$$

That's **Bayes' rule**, and notice what it cost us: nothing. It's the same counting fact viewed in
a mirror. What it *buys* is the ability to reverse a conditional — priceless, because the world
keeps handing us conditionals pointing the wrong way. You know how causes generate evidence
($p(\text{evidence} \mid \text{cause})$); you observe evidence; you want the cause.

Worked example, language-flavored. The token *bank* is ambiguous. Suppose in your corpus the
context is financial with prior probability $0.7$, riverside with $0.3$. Financial contexts are
followed by the word *deposit* with probability $0.2$; riverside contexts, $0.01$. You see
*deposit*. How sure should you now be that this is finance?

$$p(\text{fin} \mid \text{deposit}) = \frac{0.2 \times 0.7}{0.2 \times 0.7 + 0.01 \times 0.3} = \frac{0.140}{0.140 + 0.003} = \frac{0.140}{0.143} \approx 0.979$$

(The denominator is just "all the ways *deposit* can happen," both routes added — that's what
$p(B)$ unpacks into.) One word of evidence lifted belief from $0.70$ to $0.979$. What did the
pushing? Not the word itself, but the **ratio** of how likely each hypothesis makes it:
$0.2 / 0.01 = 20$. Evidence that is twenty times likelier under one story than another is a
bulldozer, and it flattens a mild prior.

> **So what:** Bayes' rule is how *evidence updates belief* — the mathematical shape of learning
> from observation. You'll meet it grading model calibration, and at the research frontier there's
> a serious line of work modeling **in-context learning** — an LLM's eerie ability to pick up a
> task from a few examples in the prompt — as implicit Bayesian updating: the prompt is evidence,
> the model's behavior is the posterior. The two-line rule above is load-bearing in 2026.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The answer to the puzzle:** a language model *is* one function — text so far in, a complete
   self-consistent belief (a probability distribution: nonnegative, sums to $1$ because something
   must happen) over every possible next token out. All else is implementation.
2. **Expectation** — the fair price, the center of mass: $\mathbb{E}[X] = \sum_x x\,p(x) = 2.90$
   dollars for our raffle ticket. **Variance** — the typical squared wobble; independent wobbles
   add, giving the drunkard's $\sqrt{d}$ and the $\sqrt{d_k}$ in attention. Loop closed.
3. **Conditioning** — shrink the world, renormalize: $p(A \mid B) = p(A \text{ and } B)/p(B)$.
   Context moves beliefs by factors of $10^4$, and that movement *is* language.
4. **The chain rule, exact:** $p(w_1 \dots w_n) = \prod_i p(w_i \mid w_{<i})$ — the reduction that
   turned "model all documents" into "predict the next token," with zero loss of generality.
5. **Why a function, not a table:** the table has $10^{500}$ rows; the universe doesn't. Why not
   independence: it deletes context, the only thing that matters. Hence: learned, shared
   parameters — generalization by necessity.
6. **Softmax, invented from four requirements** — exponentiate then normalize; only logit *gaps*
   matter (shift-invariance). **Temperature** — gap-stretching: $T \to 0$ greedy landslide,
   $T \to \infty$ uniform static.
7. **Bayes' rule** — the chain rule read both ways; posteriors moved by likelihood *ratios*.

Next lesson: if the model is a belief machine, what exactly do we *punish* it for? One number —
surprise — and deriving it will hand us the loss function that every LLM ever built is trained to
minimize.
`,
    },
  ],
  questions: [
    {
      id: 'm1-l4-q1',
      kind: 'mcq',
      prompt: md`At each generation step, a model's output layer emits one number per vocabulary token. Which property is **required** for those numbers to be a probability distribution over the next token?`,
      options: [
        md`Every number lies between $-1$ and $1$`,
        md`All numbers are nonnegative and they sum to exactly $1$`,
        md`The numbers are sorted from most likely to least likely`,
        md`The largest number exceeds $0.5$, so there is a clear favorite`,
      ],
      answer: 1,
      explain: md`The two axioms: $p(x) \ge 0$ (no negative belief) and $\sum_x p(x) = 1$ (something
must happen; beliefs complete, no double-counting). The $[-1, 1]$ option tempts because you spent
lesson 1.1 with cosine similarity, which *does* live there — but similarity scores are comparisons,
not beliefs. "Sorted" tempts because top-k lists are how you *see* model outputs — display order is
not a mathematical property. "Favorite above $0.5$" tempts because it feels like a model should
commit — but a perfectly uniform distribution is a valid (maximally humble) belief state, and it's
exactly where every untrained model starts.`,
    },
    {
      id: 'm1-l4-q2',
      kind: 'numeric',
      prompt: md`A raffle ticket pays $100$ dollars with probability $0.02$, pays $5$ dollars with
probability $0.18$, and pays nothing otherwise. What is the fair price of the ticket, in dollars?
(Do it the warehouse way: imagine a million tickets, or use the expectation formula — they're the
same computation.)`,
      answer: 2.9,
      tolerance: 0.01,
      explain: md`$\mathbb{E}[X] = 100(0.02) + 5(0.18) + 0(0.80) = 2.0 + 0.9 + 0 = 2.90$ dollars.
Per million tickets: about $20{,}000$ pay $100$ (two million dollars) and $180{,}000$ pay $5$
(another $0.9$ million) — $2.9$ million across a million tickets. The fair price is the long-run
average payout, i.e. the center of mass of the payoff distribution.`,
    },
    {
      id: 'm1-l4-q3',
      kind: 'mcq',
      prompt: md`If the words of English were mutually **independent**, then $p(\text{Tower} \mid \text{The Eiffel})$ would equal:`,
      options: [
        md`$1$ — the phrase is practically an idiom`,
        md`$p(\text{The Eiffel})$ — conditioning swaps the arguments`,
        md`the unconditional $p(\text{Tower}) \approx 0.0001$ — context would move nothing`,
        md`$0$ — independent events can't occur together`,
      ],
      answer: 2,
      explain: md`Independence means precisely $p(A \mid B) = p(A)$: news moves nothing.
"Equals $1$" tempts because the phrase is so familiar — but that familiarity is *your* conditional
knowledge, the very thing the assumption deletes. "Swaps the arguments" tempts by pattern-matching
Bayes' rule from memory instead of using the definition. "$0$" tempts via a classic confusion:
*mutually exclusive* events never co-occur; *independent* events co-occur exactly at chance rate.
The real conditional is $\approx 0.95$ versus the unconditional $0.0001$ — that $10^4$ gap is the
entire cargo a transformer exists to carry.`,
    },
    {
      id: 'm1-l4-q4',
      kind: 'numeric',
      prompt: md`A model reports $p(w_1) = 0.5$, $\;p(w_2 \mid w_1) = 0.4$, $\;p(w_3 \mid w_1, w_2) = 0.2$.
By the chain rule, what probability does it assign to the full three-token sequence $w_1 w_2 w_3$?`,
      answer: 0.04,
      tolerance: 0.001,
      explain: md`$p(w_1, w_2, w_3) = 0.5 \times 0.4 \times 0.2 = 0.04$ — land the first word, then
the second inside the first's world, then the third inside both. Notice how fast products of
probabilities shrink: three fairly confident predictions already leave only $4\%$. This shrinkage
is why lesson 1.5 works with *sums of logs* instead of products — a thousand-token document's
probability underflows any floating-point format, but its log is a perfectly tame sum.`,
    },
    {
      id: 'm1-l4-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, starting *only* from the definition
$p(A \mid B) = p(A \text{ and } B)/p(B)$: (a) derive the two-event product rule
$p(A \text{ and } B) = p(B)\,p(A \mid B)$ and explain it in one sentence as a statement about
counting or about "worlds." (b) Extend it to three events, showing the peeling step explicitly.
(c) Write the general $n$-word factorization and spell it out, all four factors, for the sentence
*"I love machine learning"*. (d) In two or three sentences: why is this factorization **exact**
rather than an approximation, and why does that exactness mean next-token prediction loses no
generality compared to modeling whole documents directly?`,
      rubric: md`**(a)** Multiply the definition through by $p(B)$:
$p(A \text{ and } B) = p(B)\,p(A \mid B)$. Sentence: to land both events, first land $B$ (cost
$p(B)$), then land $A$ *inside the world where $B$ already happened* (cost $p(A \mid B)$) —
a fraction of a fraction.

**(b)** Treat "$A$ and $B$" as a single event and peel again:
$p(A, B, C) = p(A, B)\,p(C \mid A, B) = p(A)\,p(B \mid A)\,p(C \mid A, B)$. The peeling step —
apply the two-event rule to the front block — must be shown, not asserted.

**(c)** $p(w_1, \dots, w_n) = \prod_{i=1}^{n} p(w_i \mid w_1, \dots, w_{i-1})$, and

$$p(\text{I, love, machine, learning}) = p(\text{I}) \cdot p(\text{love} \mid \text{I}) \cdot p(\text{machine} \mid \text{I, love}) \cdot p(\text{learning} \mid \text{I, love, machine})$$

with conditioning sets growing left to right.

**(d)** Every step was a *rearranged definition* — no assumption (like independence) was ever
introduced, so the identity holds for any distribution over sequences whatsoever. Therefore a model
that gets every next-token conditional right possesses, automatically and exactly, the correct
probability of every document: next-token prediction is not a proxy for language modeling, it *is*
language modeling after a change of variables. Full credit requires the peeling shown in (b), all
four factors in (c), and (d) saying explicitly that no assumption entered the derivation.`,
    },
    {
      id: 'm1-l4-q6',
      kind: 'numeric',
      prompt: md`Logits are $\mathbf{z} = (3, 1, 0)$. Compute the softmax probability of the
**first** token, to three decimal places. Work it by hand: exponentiate, total, divide. (Use
$e^{3} \approx 20.086$, $e^{1} \approx 2.718$, $e^{0} = 1$.)`,
      answer: 0.844,
      tolerance: 0.005,
      explain: md`Total: $20.086 + 2.718 + 1 = 23.804$. Then $p_1 = 20.086 / 23.804 \approx 0.844$.
A logit lead of $2$ over the runner-up already claims $84\%$ of the belief — the ratio
$p_1/p_2 = e^{2} \approx 7.4$. Now you can *feel* the drunkard's-walk problem from lesson 1.1:
unscaled attention scores of typical size $\pm 11$ would produce ratios of $e^{11} \approx 60{,}000$
— a landslide — which is exactly why they're divided by $\sqrt{d_k}$ first.`,
    },
    {
      id: 'm1-l4-q7',
      kind: 'mcq',
      prompt: md`You add $5$ to **every** logit before the softmax. What happens to the output distribution?`,
      options: [
        md`Every probability increases, since every exponential got about $148\times$ bigger`,
        md`Nothing — softmax depends only on the differences between logits, and those didn't change`,
        md`The favorite token gains the most, because the largest exponential grows the most in absolute terms`,
        md`The computation overflows — this is why the shift is forbidden in real implementations`,
      ],
      answer: 1,
      explain: md`Adding $c$ multiplies every $e^{z_i}$ by $e^{c}$ — numerator *and* denominator —
and the factor cancels exactly: softmax is shift-invariant. The first option tempts because each
exponential really does explode by $e^{5} \approx 148$; it forgets the denominator explodes by the
identical factor. The third tempts because the biggest exponential gains the most *absolutely* —
but softmax is a ratio, and every ratio $e^{(z_i - z_j)}$ is untouched. The overflow option has it
backwards: real implementations *deliberately* shift (subtracting the max logit) precisely because
shifting is free — it's the standard trick that prevents overflow.`,
    },
    {
      id: 'm1-l4-q8',
      kind: 'written',
      prompt: md`**Invent softmax yourself.** A colleague proposes converting logits to
probabilities by simple division: $p_i = z_i \big/ \sum_j z_j$. (a) Demolish this proposal: find at
least two concrete failure cases (hint: what can logits be that probabilities can't?). (b) Write
down the four requirements a score-to-belief converter must satisfy, briefly justifying each — the
fourth one should involve how models are trained. (c) Reinvent softmax as the natural machine
meeting all four, explaining *why* the exponential specifically. (d) Show with algebra that your
machine has a bonus property the naive proposal lacks: adding a constant to every logit changes
nothing.`,
      rubric: md`**(a)** Any two of: negative logits produce *negative* "probabilities" (logits
$(2, -1)$ give $p = (2, -1)$ — nonsense); the denominator can be zero or negative (logits
$(1, -1)$: division by zero); the result depends on the arbitrary zero-point of the scores — logits
$(1, 2)$ give $(1/3, 2/3)$ but the informationally identical $(11, 12)$ give $(11/23, 12/23)$.

**(b)** (1) strictly positive outputs — no negative belief, and never exactly zero since
"impossible" is an infinitely risky claim; (2) sum to $1$ — complete, non-overlapping belief;
(3) order-preserving — the converter must respect the model's ranking; (4) smooth — training nudges
logits by tiny gradient steps, so tiny logit changes must yield tiny, differentiable belief changes.

**(c)** Need a smooth, strictly increasing map from *all* reals to positive reals: the exponential
is the canonical such machine, so set $p_i = e^{z_i} / \sum_j e^{z_j}$ — exponentiate to satisfy
(1), (3), (4); normalize to satisfy (2).

**(d)** $\dfrac{e^{z_i + c}}{\sum_j e^{z_j + c}} = \dfrac{e^c\, e^{z_i}}{e^c \sum_j e^{z_j}} =
\dfrac{e^{z_i}}{\sum_j e^{z_j}}$ — shift-invariance: only logit *differences* matter, which is
right because scores have no absolute zero. Full credit: at least two genuine failures in (a), all
four requirements with justifications in (b), the "why exponential" argument (not just the formula)
in (c), and the actual cancellation algebra in (d).`,
    },
    {
      id: 'm1-l4-q9',
      kind: 'mcq',
      prompt: md`As temperature $T \to 0^{+}$, sampling from $\mathrm{softmax}(\mathbf{z}/T)$ becomes equivalent to:`,
      options: [
        md`sampling uniformly over the whole vocabulary`,
        md`greedy decoding — always emitting the highest-logit token`,
        md`sampling from the unchanged $T = 1$ distribution`,
        md`emitting the *lowest*-logit token, since dividing by a tiny number flips the ordering`,
      ],
      answer: 1,
      explain: md`Use the ratio: $p_i/p_j = e^{(z_i - z_j)/T}$. As $T \to 0^{+}$, the favorite's
ratio over every rival blows up to $\infty$; probabilities still sum to $1$, so the favorite takes
all of it — sampling collapses to argmax. The uniform option is the *opposite* limit
($T \to \infty$, all gaps squashed to zero) — the two limits are easy to swap under exam pressure,
so re-derive rather than recall: small $T$ *stretches* gaps. The "flips the ordering" option tempts
because dividing by small numbers feels destabilizing — but dividing by a *positive* number, however
tiny, preserves order always.`,
    },
    {
      id: 'm1-l4-q10',
      kind: 'numeric',
      prompt: md`**Fermi estimate — the table that ate the universe.** A language model has a
vocabulary of $100{,}000$ tokens and conditions on contexts of length $100$. If you tried to store
$p(\text{next token} \mid \text{context})$ as a lookup table with one row per possible context, the
number of rows would be $100{,}000^{100} = 10^{x}$. Find $x$ — no calculator, just exponent
arithmetic on paper.`,
      answer: 500,
      tolerance: 10,
      explain: md`$100{,}000 = 10^{5}$, so $100{,}000^{100} = (10^{5})^{100} = 10^{500}$: exponents
multiply. For scale: atoms in the observable universe $\approx 10^{80}$. Square it: $10^{160}$.
Square it *again*: $10^{320}$ — still short of the table by $10^{180}$. Meanwhile humanity's entire
written output is about $10^{13}$–$10^{14}$ tokens, so essentially every row would be empty anyway.
This one exponent is the founding argument of the field: next-token prediction must be a *function*
with shared parameters, and generalization to never-seen contexts isn't a luxury — it's forced.`,
    },
    {
      id: 'm1-l4-q11',
      kind: 'written',
      prompt: md`**Bayes on paper.** The ambiguous token *bank*: prior $p(\text{finance}) = 0.6$,
$p(\text{river}) = 0.4$. The next word observed is *fishing*, with likelihoods
$p(\text{fishing} \mid \text{river}) = 0.15$ and $p(\text{fishing} \mid \text{finance}) = 0.005$.
(a) Compute the posterior $p(\text{river} \mid \text{fishing})$, showing the numerator and *both*
terms of the denominator. (b) Compute the likelihood ratio and state, in one sentence, its role.
(c) One more sentence: what does this example say about how a single token of context can resolve
an ambiguity that the prior gets wrong?`,
      rubric: md`**(a)** Numerator: $p(\text{fishing} \mid \text{river})\,p(\text{river}) =
0.15 \times 0.4 = 0.06$. Denominator — all the ways *fishing* happens:
$0.15 \times 0.4 + 0.005 \times 0.6 = 0.06 + 0.003 = 0.063$. Posterior:

$$p(\text{river} \mid \text{fishing}) = \frac{0.06}{0.063} \approx 0.952$$

**(b)** Likelihood ratio $= 0.15 / 0.005 = 30$: *fishing* is thirty times likelier under the river
reading, and it is this ratio — not either likelihood alone — that overpowers the prior.

**(c)** The prior favored finance ($0.6$ vs $0.4$), yet one strongly diagnostic token flipped
belief to $95\%$ river: context resolves ambiguity precisely when its likelihood ratio between the
competing readings is large, which is the probabilistic meaning of "disambiguating word." Full
credit requires all three denominator/numerator numbers, the ratio computed as $30$, and an
interpretation naming the ratio (not just "fishing suggests rivers") as the thing doing the work.`,
    },
    {
      id: 'm1-l4-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old** (the Feynman technique — the real test of
ownership). Explain what a language model actually does. You must get across: (1) that the machine
never "knows" the next word — it gives every word a *share* of its belief, and the shares must add
up to one whole (find a kid-friendly picture for this); (2) how it writes an entire story one guess
at a time; (3) what the "temperature" dial changes about its behavior. You may steal the lesson's
images or invent better ones — inventing better ones is worth more.`,
      rubric: md`Grade the *teaching*, not the vocabulary. A "nailed it" answer must:

1. **Make the shares-of-belief idea concrete** — e.g. a pie the machine slices among every word it
   knows: big slice for *sat* after "the cat," sliver for *quantum* — and say clearly that the
   slices always add up to exactly one whole pie (belief is a fixed substance being divided; more
   for one word means less for the rest).
2. **Show the loop** — pick a word (usually a big slice), stick it onto the story, then re-slice
   the pie for the *next* word now that the story is longer; repeat hundreds of times. The story is
   built one slice-pick at a time; the machine never plans the whole sentence in advance.
3. **Explain temperature as a daringness dial** — turned down: always grab the biggest slice
   (safe, samey, robotic stories every time); turned up: give small slices a real chance
   (surprising, sometimes nonsense); somewhere in the middle for interesting-but-sensible.
4. **Contain no unexplained jargon.** "Token," "distribution," "logits," "softmax,"
   "autoregressive," even "probability" used without a kid-picture first — each is *partial credit
   at best*. Hiding behind jargon is precisely the failure mode this exercise exists to expose; a
   genuinely better invented analogy than the pie beats a correct recitation.`,
    },
  ],
}
