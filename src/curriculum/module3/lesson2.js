// Module 3, Lesson 2 — From logits to words: sampling policies (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm3-l2',
  title: '3.2 From logits to words — the art of choosing',
  subtitle: md`Module 2 built a machine that ends by handing you 32,000 probabilities. Your chat
window shows words. Somebody, somewhere, is choosing — and the chooser is not part of the model.
This lesson derives every choosing policy in use today, each one born from the failure of the one
before it.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle: who picks the word?

Run the 6.7-billion-parameter machine you audited in Module 2 on "The capital of France is", and
what comes out the far end is *not* the word " Paris". It is a list: 32,000 numbers, one per token
in the vocabulary, pushed through a softmax (lesson 1.4) so they're all positive and sum to
exactly 1. Maybe " Paris" holds 0.82, " the" holds 0.05, " located" 0.02 — and so on, down through
" banana" at 0.0000004. That list is the model's complete, honest opinion about what comes next.
And it is also the model's **last word**. Nothing in those 6.7 billion parameters reaches out and
picks.

But your chat shows words. So between the model's distribution and your screen stands a chooser —
a dozen lines of code that were never trained, hold no parameters, and are not part of the model
at all. Two facts about this chooser should bother you into paying attention:

1. **It has enormous consequences.** Same model, same weights, two different choosers: one
   produces an assistant that loops *"I'm sorry. I'm sorry. I'm sorry."* forever; the other
   produces one that starts a sentence about Paris and ends it somewhere in confident gibberish.
   When people say a model "sounds robotic" or "went off the rails," they are very often
   describing the chooser, not the model.
2. **Nobody handed us the right policy.** It had to be designed — and the design history is a
   beautiful chain of failures, where each policy is the fix for the previous one's disease.

The chooser's policy is called **sampling**, and this lesson walks the chain the honest way:
propose the obvious thing, break it, and let the wreckage dictate the next design. By the end,
the knobs on every LLM API you've ever seen will be things you could have invented.
`,
    },
    {
      type: 'text',
      md: md`
## The obvious answer, and its two funerals

What's the most defensible first policy? The model says " Paris" is the most probable token — so
take it. Every step, pick the single highest-probability token (the *argmax*). This is **greedy
decoding**: deterministic, cheap, and it sounds like the definition of playing it safe. It fails
in two ways, and the second is much deeper than the first.

### Funeral one: the repetition death spiral

Greedy models get stuck: *"I'm sorry. I'm sorry. I'm sorry."* Watch the mechanism, because it is
a genuine feedback loop, not a vague "the model gets confused."

Suppose at some step *"I'm sorry."* is the most probable continuation — at, say, 0.31 — so greedy
takes it. That sentence is now **part of the context**. And a language model is, above all else,
an imitator of its context: it was trained on human text, and human text is full of honest
repetition — choruses, legal boilerplate, itemized lists — so "this document repeats its phrases"
is a real pattern the model has learned to continue. One copy of *"I'm sorry."* in recent context
is mild evidence for that pattern. Greedy appends a second copy, and now the pattern looks
established: the probability of a third climbs — 0.46, say. Greedy, by definition, takes the top
token: a third copy. Three copies are stronger evidence still: 0.61. Then 0.74. Each output
becomes the next input, and the loop feeds itself. (The numbers here are illustrative, but their
*shape* — per-repetition probability bending upward toward 1 — is exactly what researchers
measured when they studied *neural text degeneration*; that part is empirical, not theorem.)

Notice the trap's perfect cruelty: the only exit is to pick some token that is *not* the argmax —
which is the one move greedy is built never to make.

### Funeral two: the likelihood trap

Here's the deeper failure. Even when greedy avoids the spiral, its text has a recognizable
flavor: flat, hedged, oddly generic. Why? Because **maximum-probability text is not typical human
text.**

The model was trained to *match the distribution* of human writing. But humans, when they write,
are effectively drawing *samples* from that distribution — nobody composes the single most
probable essay. And now lesson 1.5 pays off: a source with per-token entropy $H$ produces typical
samples carrying about $H$ bits of surprise per token — that is what entropy *means*. The argmax
sequence is engineered to contain as little surprise as possible. It is a wildly *atypical*
member of the distribution, camped out on the boring extreme — the way a "typical American
family" with 1.9 children has never once been observed at a dinner table.

So: **a model trained to match a distribution must be *sampled from* to sound like the thing it
models.** For open-ended text, determinism isn't a safety feature. Determinism is the bug.
`,
    },
    {
      type: 'ponder',
      question: md`Trace the death spiral yourself. Suppose *"I'm sorry."* has just been emitted
twice in a row. Derive, step by step, why the *third* occurrence is now more probable than the
second was — name the two facts about the system that create the feedback — and then say
precisely why greedy can never exit, even once the loop is obvious to any observer.`,
      answer: md`**Fact 1: the model imitates its context.** It was trained to continue human
text, and human text repeats things for real reasons (refrains, boilerplate, lists) — so "recent
context contains a repeated phrase" is evidence, to the model, that the repetition continues. Two
copies are stronger evidence than one, so $p(\text{third copy}) > p(\text{second copy})$ was.

**Fact 2: generation feeds outputs back as inputs** (the loop from 2.6). The chooser's pick is
appended to the context — so the chooser *edits the very distribution it will face next step*.
Choosing the repeat strengthens the evidence for the repeat: a self-conditioning feedback loop.
Empirically, measured repetition curves climb toward probability 1 as copies accumulate.

**Why greedy can't exit:** escaping requires emitting some token that is not currently the
argmax. Greedy's policy is "always the argmax" — so once the repeated phrase occupies the top
slot, the policy and the feedback loop lock arms. (This is also why real samplers bolt on
*repetition penalties* — hand-written taxes on recently-used tokens. A patch on the chooser, note,
not on the model.)`,
    },
    {
      type: 'text',
      md: md`
## Full trust: spin the wheel

If determinism is the bug, run the other way: trust the distribution *completely*. Build a
roulette wheel with 32,000 slots, one per token, each slot's width equal to its softmax
probability — and spin. This is **pure sampling** (temperature 1, nothing else), and it fixes
both funerals at once: sampled text carries the right, entropy-sized amount of surprise by
construction, and loops can't lock in, because a token at probability 0.61 gets picked 61% of the
time, not 100%.

For a paragraph or two, it reads like the answer. Then you meet the new disease: **the tail**.

Rank all 32,000 tokens by probability. The bottom 20,000 are this context's bananas brigade —
wrong language, broken syntax, a stray chemistry symbol — each individually holding a few
*millionths* of probability. Harmless, right? Individually, yes. But probability mass is a
budget, and 20,000 tiny slivers add up to a real slice of the wheel. Pure sampling — which is
faithfulness itself — gives the tail its full collective share on *every single spin*. And a
reply is a lot of spins.
`,
    },
    {
      type: 'example',
      title: 'weighing the tail — how rare events become certainties',
      md: md`
Say that after a typical prose context, the top 100 tokens together hold 95% of the mass —
leaving 5% spread across the other 31,900. One spin lands in that tail with probability just
0.05. Per-step: rare. But a 200-token reply is 200 spins, and survival means dodging the tail
*every time*:

$$0.95^{200} = e^{200 \ln 0.95} \approx e^{-10.26} \approx 3.5 \times 10^{-5}$$

$$P(\text{at least one tail token in the reply}) = 1 - 0.95^{200} \approx 0.99997$$

A **99.997%** chance the reply contains at least one bananas token. It's worse than it sounds:
survival is already a coin flip by token 14 ($0.95^{14} \approx 0.49$) — you're usually derailed
before the second sentence ends.

And one bad token is never just one bad token. It joins the context, and self-conditioning — the
same feedback that powered the greedy spiral, now fighting *against* you — makes the model, ever
the faithful imitator, continue a context that now officially contains bananas. Quality is a
property of the *sequence*, and a single tail event poisons everything after it.

**So what:** this is why nobody ships untruncated sampling. Every production system you've used
kills the tail somehow — the rest of this lesson is the arms race over *how*.
`,
    },
    {
      type: 'text',
      md: md`
## Temperature: a dial, not a knife

You already own temperature from lesson 1.4: divide every logit by $T$ before the softmax.
$T < 1$ widens the gaps between logits (sharper distribution), $T > 1$ shrinks them (flatter);
$T \to 0$ collapses onto the argmax, $T \to \infty$ flattens toward uniform over all 32,000
tokens. We won't re-derive any of that.

What matters *here* is temperature's role in our story: it is a **spread dial strung between the
two failures**. Slide toward $T = 0$ and you re-enter greedy's graveyard — the spiral and the
likelihood trap. Slide up past 1 and you hand the tail even more than its honest 5%. Useful,
tunable — and constitutionally unable to fix the tail. Dividing by $T$ *reweights* every token
but *deletes* none: the 20,000 junk candidates stay on the wheel at any finite temperature, and
raising $T$ amplifies precisely them (the leaders have probability to lose; the tail can only
gain).

Temperature sets the spread. It cannot edit the guest list. For that, you need a knife.
`,
    },
    {
      type: 'text',
      md: md`
## Top-k: the fixed-width knife

The obvious knife: the tail is the problem, so *chop it at a fixed rank*. Keep only the $k$ most
probable tokens, discard the other $32{,}000 - k$, renormalize the survivors (they must sum to 1
again — more on this in a moment), and spin the smaller wheel. **Top-k sampling.** With $k = 50$
you delete 31,950 bananas in one stroke, and real systems shipped exactly this for years.

But $k$ is one number, frozen when the request is sent — and distributions arrive in a different
shape at every step:

- **Peaked step:** "The capital of France is" → three tokens hold over 99% of the mass. Top-50
  keeps 47 stowaways whose renormalized share is small but is *exactly the tail-risk you swore
  off* — and cranking the temperature inflates them.
- **Flat step:** "Name any city:" → hundreds of tokens are legitimately plausible at around 1%
  or less. Top-50 beheads 150+ perfectly good candidates and biases the model toward the famous
  few.

One fixed $k$, two opposite errors. And the failure dictates the fix, as usual: the cut must
depend on the *shape of the distribution at this step*. Let the distribution choose its own $k$.
`,
    },
    {
      type: 'text',
      md: md`
## Top-p: the knife that measures first

Ask what we actually want from truncation. Not "the top $k$ tokens" — that's a *count*. We want
"enough tokens to cover the model's real belief" — that's a *mass*. So make mass the rule:

> Sort tokens by probability, descending. Walk down the list accumulating probability, and stop
> at the **smallest prefix whose total mass is at least $p$** (typically $p = 0.9$). Discard the
> rest. Renormalize. Spin.

This is **top-p**, or *nucleus sampling* — keep the nucleus, shed the halo. The number of
survivors is now adaptive: a peaked step keeps 2 or 3 tokens; a flat step keeps hundreds — from
the *same* setting. $k$ has become a measurement instead of a guess.

Two footnotes, both load-bearing:

**Renormalize, always.** After truncation the survivors sum to some $s < 1$ — say 0.91. That's
not a probability distribution yet. Divide every survivor by $s$: ratios preserved, total
restored to 1. It's the same normalizing move as the softmax's denominator in 1.4, and it looks
like trivial bookkeeping — the ponder below shows what actually breaks in code when it's skipped.

**Min-p, honestly.** A newer variant thresholds *relative to the leader*: keep every token whose
probability is at least, say, 5% of the top token's. Peaked step (leader 0.82): cutoff 0.041 —
keeps a few. Flat step (leader 0.011): cutoff 0.00055 — keeps hundreds. Adaptive again, but
measured from the top instead of by accumulation; it behaves notably gracefully at high
temperature and has become a favorite in the open-source sampling community. The differences
from top-p are real but modest — the shared design idea, *adaptive truncation*, is the point.
`,
    },
    {
      type: 'example',
      title: 'one setting, two shapes — top-p in action',
      md: md`
Run top-p with $p = 0.9$ on two real-shaped steps.

**Step A (peaked)** — after "The capital of France is":
" Paris" 0.82, " the" 0.05, " a" 0.04, " located" 0.02, " situated" 0.01, … Cumulative:
$0.82 \to 0.87 \to 0.91 \ge 0.9$ — **keep 3 tokens**. Renormalize by $s = 0.91$: the survivors
become $0.90,\; 0.055,\; 0.044$.

**Step B (flat)** — after "Name any city:":
" Tokyo" 0.011, " Paris" 0.010, " London" 0.010, then a long gentle slope of city names. The
running sum doesn't cross 0.90 until around rank 180 — **keep ~180 tokens**, all legitimate.

Now compare a fixed $k = 50$ on the same two steps: in A it drags along 47 stowaways; in B it
beheads about 130 real candidates. Top-p, with one parameter, sizes itself to both — 3 here, 180
there.

**So what:** this is why $p \approx 0.9$–$0.95$ is the default on real APIs — one number that's
simultaneously a scalpel for peaked steps and an open door for flat ones.
`,
    },
    {
      type: 'ponder',
      question: md`Why must the surviving weights be renormalized — and what quietly breaks if
you don't? Concretely: a junior engineer implements top-p as "sort, keep the prefix, then sample
by drawing a uniform random number $u \in [0, 1)$ and walking down the survivors' *original*
probabilities." Using step A above (survivors 0.82, 0.05, 0.04), work out exactly what their code
does — for every possible value of $u$.`,
      answer: md`Without renormalization you're sampling from a **sub-probability measure**: the
survivors sum to $s = 0.91$, and the missing $0.09$ of mass has to land *somewhere* — and where
it lands is decided by the bug, not by the math.

Walk the broken code: $u < 0.82$ → " Paris"; $0.82 \le u < 0.87$ → " the"; $0.87 \le u < 0.91$ →
" a"; and for $u \ge 0.91$ — **9% of all draws** — the walk falls off the end of the list. The
two classic outcomes, both shipped to production somewhere: (1) the loop's fallback returns the
*last* element, so " a" silently absorbs the orphaned mass and is emitted with probability
$0.04 + 0.09 = 0.13$ — three times its correct renormalized share of $0.044$, a systematic bias
toward the *least* probable survivor; or (2) an index-out-of-bounds crash that fires on 9% of
tokens, intermittently, only in production. Dividing by $s$ costs one line and makes the weights
an actual distribution — same ratios, total restored to 1. Cheap insurance against an expensive
class of bug.`,
    },
    {
      type: 'viz',
      viz: 'sampling-playground',
      caption: md`A next-token distribution after "The capital of France is" — bars are token
probabilities, reshaped live by the temperature slider and the truncation selector (none /
top-k / top-p, with k and p sliders); the sample buttons draw tokens and stack tally counts
beneath the bars. Three experiments: (1) set T = 0.1 and admire the landslide, then raise T
slowly toward 3 and find the temperature where " banana" first carries visible mass — nonsense
doesn't switch on at a magic threshold, it fades in; (2) set top-k with k = 3, then top-p with
p = 0.9, and crank T to 2 under each — watch which truncation adapts to the flattening
distribution and which keeps swinging a fixed-width blade; (3) pick any setting and draw 25
samples — watch the tally histogram converge toward the bars. Sampling is the distribution, made
flesh.`,
    },
    {
      type: 'text',
      md: md`
## Beam search: the honest mode-seeker

One loose end from greedy's second funeral. Greedy doesn't even find the most probable
*sequence* — it's myopic. The chain rule (1.4) makes a sequence's probability a *product* over
steps, and a slightly-worse first word can open a much better sentence; greedy can't see past
step one to notice.

**Beam search** fixes the *search*: carry the $B$ best partial sequences (the "beam"), extend
each by every candidate token, keep the $B$ best extensions by total log-probability, repeat.
$B = 1$ is greedy; bigger $B$ approximates the true argmax sequence better and better. It is
honest, principled *mode-seeking* — and its report card is the most instructive split in this
lesson:

- **Closed tasks: it wins.** Translation has essentially one right answer; the output
  distribution is sharply peaked, and its mode *is* the good translation. Beam search with
  $B = 4$–$8$ was machine translation's workhorse for a decade.
- **Open generation: it loses — by winning.** For open text, the sequence-level mode is exactly
  the degenerate, low-surprise text of the likelihood trap. The degeneration studies found the
  damning signature: *increasing* the beam width makes output *more* repetitive and dull. Better
  search, worse text — the unmistakable fingerprint of optimizing the wrong objective, not of a
  weak optimizer.

Add that beam search costs $B\times$ the decode work (and, as the next lesson will price, $B$
copies of some expensive bookkeeping), and you have the full answer to a question you can now
pose sharply: *why do chat APIs offer temperature and top-p, but no beam knob?* Because
mode-seeking is the wrong objective for open conversation at any price — and it isn't even cheap.
`,
    },
    {
      type: 'ponder',
      question: md`A paradox worth resolving cleanly: the model is trained to imitate human
text. Greedy and beam search ask it for its *most probable* text — and receive robotic loops and
bland mush that no human would ever produce. If the model is a good imitator, how can its most
probable output be so unrepresentative? Resolve it with lesson 1.5 in hand.`,
      answer: md`Because **humans are samples from the distribution, not its mode** — and a
distribution's summary statistics are not members of the distribution. A fair die "averages"
3.5, yet no face shows 3.5; asking a die to display its average is a category error, and asking
a language model for its argmax text is the same error one level up.

The entropy version (1.5): typical sequences carry surprisal near $H$ bits per token, and
*collectively* the typical set owns essentially all the probability — even though each typical
sequence is individually less probable than the mode. The mode sits far outside the typical set,
on the zero-surprise extreme: it is the single most probable sequence and simultaneously a
freakish outlier. "Sounding human" means landing in the typical set. Sampling lands there
automatically — that's what sampling *is*. Argmax, by construction, never does. Matching a
distribution and reproducing its mode are simply different tasks, and only the first one was the
training objective.`,
    },
    {
      type: 'text',
      md: md`
## The dial you actually ship

Where does this leave practice? Sampling settings are the model's **temperament, chosen at
request time**:

- $T \approx 0$ (greedy-ish), light truncation, for **math, code, extraction** — closed tasks
  with peaked distributions, where mode and typical set nearly coincide (low entropy means
  little surprise to lose) and reproducibility is a feature, not a bug.
- $T \approx 0.7$–$1.0$ with top-p $0.9$–$0.95$ for **prose, dialogue, brainstorming** — you
  want typical-set text with the tail amputated.

Determinism versus creativity is a **runtime choice, not a model property**: the same 6.7
billion parameters serve the contracts-parser at $T = 0$ and the poetry bot at $T = 1.0$,
switching personalities per request. And when an API doc offers you "temperature" and "top-p"
sliders with the shrug "lower = focused, higher = creative" — that tooltip *is this lesson,
compressed*. You now own the machinery underneath it.

## What you now own

1. **The chooser exists:** the model ends at a distribution (softmax, 1.4); the word on your
   screen is picked by a policy that lives outside the 6.7B parameters.
2. **Greedy, broken twice:** the repetition spiral (a self-conditioning feedback loop — outputs
   become inputs, copies breed copies, and argmax forbids the only exit) and the likelihood trap
   (the mode is not typical; typical text carries entropy-sized surprise, 1.5).
3. **Pure sampling, broken by the tail:** a 5% collective tail becomes a $1 - 0.95^{200} \approx
   99.997\%$ chance of derailment in one reply — and self-conditioning turns one bananas token
   into a bananas paragraph.
4. **Temperature (1.4):** the spread dial between the two ditches — it reweights everything and
   deletes nothing.
5. **Truncation:** top-k is a fixed blade, wrong for peaked *and* flat steps; top-p cuts by mass
   coverage — 3 survivors or 180 from the same $p$; min-p adapts from the top. And renormalize,
   or a bug decides where the missing mass goes.
6. **Beam search:** genuine mode-seeking — wins closed tasks, and on open text gets *worse as
   the search gets better*: wrong objective, not weak search. Hence no beam knob on your API.
7. **Temperament is runtime:** $T \approx 0$ for right-answer work, $0.7$–$1.0$ for prose — the
   API's knobs are literally this lesson.

Next lesson: put the chooser in a loop — sample, append, run the model again — and stare at what
that loop naively costs; the fix is one idea, *remember instead of recompute*, and it's called
the KV cache.
`,
    },
  ],
  questions: [
    {
      id: 'm3-l2-q1',
      kind: 'mcq',
      prompt: md`A greedily-decoded model gets stuck: *"I'm sorry. I'm sorry. I'm sorry."* What
is the actual mechanism of the loop?`,
      options: [
        md`The softmax saturates numerically after repeated tokens, freezing the distribution in
place`,
        md`Each emitted copy joins the context, and the model — an imitator of its context —
rates a further repetition as even *more* probable; greedy can never take the sub-argmax token
that escape requires`,
        md`The model's weights are updated during generation, reinforcing the repeated phrase`,
        md`The phrase is simply the most common sentence in the training data, so it is the
argmax in every context`,
      ],
      answer: 1,
      explain: md`It's a self-conditioning feedback loop: generation feeds outputs back as inputs
(2.6), and repetition-in-context is evidence *for* more repetition, so the phrase's probability
climbs with every copy — the degeneration studies measured exactly this climb. Option C tempts
because "reinforcement" is the right *word* — but it happens through the *context*, not the
weights, which are frozen at inference. Option D tempts with a static picture: if the phrase
were always argmax, the loop wouldn't need to *build up* — yet measured probabilities climb copy
by copy, which only a context-dependent mechanism explains. Option A sounds technical but is
backwards: the distribution isn't frozen, it changes every step — in the loop's favor.`,
    },
    {
      id: 'm3-l2-q2',
      kind: 'numeric',
      prompt: md`After a typical context, the tokens beyond rank 100 collectively hold 5% of the
probability mass, at every step. You sample a 200-token reply with no truncation. Compute the
probability, **in percent**, that at least one token comes from that tail. (Log trick:
$\ln 0.95 \approx -0.0513$.)`,
      answer: 99.997,
      tolerance: 0.5,
      explain: md`$0.95^{200} = e^{200 \ln 0.95} \approx e^{-10.26} \approx 3.5 \times 10^{-5}$,
so $P = 1 - 0.95^{200} \approx 0.99997 = \mathbf{99.997\%}$. Per-step rarity times sequence
length equals near-certainty — survival is a coin flip by token 14 already. And because one tail
token self-conditions everything after it, this is effectively the probability the *reply*
derails, which is why untruncated sampling never ships.`,
    },
    {
      id: 'm3-l2-q3',
      kind: 'mcq',
      prompt: md`Take a model that has *perfectly* learned the distribution of human text. Why
does its argmax (most probable) output still not sound like human writing?`,
      options: [
        md`Perfect training is impossible in practice, and argmax decoding exposes the residual
errors`,
        md`Humans are samples from the distribution, not its mode: typical text carries
entropy-sized surprise per token, while the mode has almost none — the most probable text is an
atypical member of the distribution`,
        md`The argmax is ill-defined because many tokens tie for the maximum probability`,
        md`Real human text has higher probability than the argmax text, but the model cannot
search well enough to find it`,
      ],
      answer: 1,
      explain: md`This is the likelihood trap, and it holds even for a *perfect* model — which is
what option A misses: A tempts because blaming model error is usually safe, but here the flaw is
in the *decoding objective*, not the fit. Option D tempts by muddling search with sampling — but
nothing has higher probability than the argmax; by 1.5, human-typical text is individually *less*
probable than the mode while collectively owning all the mass. C is a technicality that real
continuous logits essentially never produce. The lesson: matching a distribution and emitting
its mode are different tasks.`,
    },
    {
      id: 'm3-l2-q4',
      kind: 'numeric',
      prompt: md`A step's ranked probabilities are $0.40,\; 0.25,\; 0.15,\; 0.08,\; 0.05,\;
0.04,\; 0.02,\; 0.01$ (the rest negligible). Top-p sampling with $p = 0.9$: **how many tokens
are kept?** (Rule: smallest prefix whose cumulative mass is at least $p$.)`,
      answer: 5,
      tolerance: 0.001,
      explain: md`Cumulative sums: $0.40 \to 0.65 \to 0.80 \to 0.88 \to 0.93$. Four tokens reach
only $0.88 < 0.9$; five reach $0.93 \ge 0.9$ — so **5 tokens** survive (then get renormalized by
$0.93$). Note what the rule did: it *measured* this step's shape rather than applying a frozen
count — on a flatter step the same $p$ would have kept dozens.`,
    },
    {
      id: 'm3-l2-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall — invent nucleus sampling.** You know top-k's two
failures: with fixed $k = 50$, a *peaked* step admits dozens of junk stowaways, and a *flat*
step beheads legitimate candidates. On paper: (1) state in one sentence the design goal a better
truncation rule must satisfy; (2) write your rule precisely (including what happens to the
survivors' weights); (3) run it with $p = 0.9$ on two mini-distributions — peaked
$(0.90, 0.05, 0.03, 0.02)$ and flat (eight tokens at $0.125$ each) — reporting how many tokens
each keeps.`,
      rubric: md`**(1) The goal:** truncate by *mass covered*, not by *count* — keep however many
tokens it takes to cover most of the model's belief, so the cut adapts to each step's shape.

**(2) The rule:** sort descending; keep the **smallest prefix whose cumulative probability is
$\ge p$**; discard the rest; **renormalize** the survivors (divide each by their sum $s$ so they
form a true distribution again); sample from the result. Omitting the renormalization step loses
credit — it's load-bearing, not bookkeeping.

**(3) Peaked:** the first token alone has $0.90 \ge 0.9$ — **keep exactly 1** (an edge case that
checks whether the rule was stated precisely; its weight renormalizes from $0.90$ to $1.0$).
**Flat:** seven tokens reach $0.875 < 0.9$; eight reach $1.0$ — **keep all 8**. One setting: one
survivor on the peaked step, eight on the flat one — the adaptivity that fixed $k$ cannot have.

"Nailed it" requires the goal derived *from the failure analysis* (mass vs count), a precise
rule with renormalization, and both counts right — reciting "top-p keeps mass p" without the
smallest-prefix and renormalization details is exactly what this question is not about.`,
    },
    {
      id: 'm3-l2-q6',
      kind: 'mcq',
      prompt: md`Beam search (width 5) reliably beats sampling on translation benchmarks, yet
produces repetitive, dull text in open-ended chat. Why?`,
      options: [
        md`Translation distributions are sharply peaked around the one right answer, so
mode-seeking finds it; open-ended distributions are broad, and their mode is exactly the
degenerate low-surprise text of the likelihood trap`,
        md`Beam search only works on short sequences, and chat replies are too long for the beam
to track`,
        md`Translation models are trained with beam search in the loop, so only they benefit
from it at inference`,
        md`Width 5 is too small for open-ended chat; width 50 would restore quality`,
      ],
      answer: 0,
      explain: md`The split is about the *objective*, not the domain's difficulty: where one
right answer exists, the mode is that answer and better mode-seeking helps; where the
distribution is broad, the mode is the disease. Option D is the most instructive temptation —
"more search = better" — because the measured result is the opposite: *larger* beams produce
*more* degenerate text, since they approximate the true (degenerate) mode more faithfully.
Better search, worse output is the fingerprint of a wrong objective. B has no basis, and C
tempts via training/inference confusion — beam search is purely a decode-time policy.`,
    },
    {
      id: 'm3-l2-q7',
      kind: 'numeric',
      prompt: md`Top-k with $k = 3$ keeps tokens of probability $0.5,\; 0.2,\; 0.1$ (everything
else is cut). After renormalization, what is the sampling weight of the **top token**?`,
      answer: 0.625,
      tolerance: 0.01,
      explain: md`Survivors sum to $s = 0.8$, so the top token's weight becomes $0.5 / 0.8 =
\mathbf{0.625}$. Renormalization preserves the survivors' *ratios* (5 : 2 : 1) while restoring a
total of 1 — the truncated 20% of mass is redistributed proportionally, not dumped on whichever
token the sampling loop happens to hit last.`,
    },
    {
      id: 'm3-l2-q8',
      kind: 'written',
      prompt: md`**The settings consultant.** Three teams share one deployed model and ask you
for sampling settings: (a) a code-completion engine for an IDE; (b) a slogan brainstormer that
must produce 20 *different* slogans per click; (c) a batch pipeline extracting dates and amounts
from contracts into JSON. For each: recommend a temperature (rough number) and truncation,
justify from this lesson's failure modes, and state concretely what goes wrong if that team
copies one of the *other* teams' settings.`,
      rubric: md`**(a) Code completion:** $T \approx 0$–$0.2$, tight truncation (small top-p or
near-greedy). Closed-ish task: peaked distributions, mode ≈ typical (low entropy), and one tail
token can be a syntax error that breaks a build. With the brainstormer's $T = 0.9$: the
$1 - 0.95^{n}$ arithmetic guarantees occasional bananas identifiers and broken code.

**(b) Brainstormer:** $T \approx 0.8$–$1.0$ with top-p $0.9$–$0.95$. Needs typical-set diversity;
20 draws must differ. With the extractor's $T = 0$: all 20 clicks return the *same* slogan
(determinism), and it's the mode — bland by the likelihood trap.

**(c) Extraction:** $T = 0$ exactly. One right answer, and reproducibility/auditability are
features. With sampling on: even a small per-token derail rate, run over millions of contract
tokens, yields thousands of corrupt JSON rows — the tail arithmetic at industrial scale.

Full credit: a number *and* a truncation for each, each justification tied to a named failure
mode (spiral, likelihood trap, tail), and a concrete cross-contamination failure per team. Bonus
insight worth crediting: all three run the *same weights* — temperament is a runtime property,
which is the lesson's deepest practical point.`,
    },
    {
      id: 'm3-l2-q9',
      kind: 'mcq',
      prompt: md`As $T \to 0$ and $T \to \infty$, temperature sampling becomes, respectively:`,
      options: [
        md`Greedy argmax decoding; uniform sampling over the entire 32,000-token vocabulary`,
        md`Uniform sampling over the vocabulary; greedy argmax decoding`,
        md`Greedy argmax decoding; sampling from the unmodified distribution`,
        md`Undefined at both ends — dividing logits by zero or infinity has no meaning`,
      ],
      answer: 0,
      explain: md`Dividing logits by a tiny $T$ stretches every gap, and the softmax turns a
stretched lead into a landslide (1.4) — in the limit, all mass on the argmax. A huge $T$ squashes
all logits toward equality — uniform over *everything*, banana included, which is why high
temperature without truncation is anarchy. Option C tempts because "unmodified" feels like an
extreme — but that's $T = 1$, the *middle* of the dial, not the end. Option D tempts the
literal-minded: the limits are perfectly well-defined, and every API implements $T = 0$ as exact
argmax.`,
    },
    {
      id: 'm3-l2-q10',
      kind: 'numeric',
      prompt: md`**Fermi.** Suppose at every step roughly 10 tokens are genuinely plausible (a
typical prose nucleus). The number of distinct 100-token completions is then about $10^N$. What
is $N$? (For scale: the observable universe holds about $10^{80}$ atoms.)`,
      answer: 100,
      tolerance: 15,
      explain: md`Ten independent-ish choices per step, 100 steps: $10^{100}$ — a googol of
completions, $10^{20}$ times the atom count of the observable universe (you'd have to square the
atom count, $10^{160}$, to comfortably clear it). Cross-check via 1.5: 10 live options ≈
$\log_2 10 \approx 3.3$ bits per token; 100 tokens ≈ 332 bits; $2^{332} \approx 10^{100}$ —
entropy and counting agree. The practical punchline: generation navigates a space that can never
be enumerated, so "find the best completion" is meaningless — a sampling *policy over
distributions* is the only steering wheel there is.`,
    },
    {
      id: 'm3-l2-q11',
      kind: 'written',
      prompt: md`A teammate argues: "Top-p already limits randomness — temperature is redundant."
Another counters: "Temperature already controls randomness — top-p is redundant." Write a short
note explaining why the two knobs do **different jobs**, give one concrete failure for each knob
used alone, and state the order in which a standard sampling pipeline applies them.`,
      rubric: md`**The core distinction:** temperature *reweights the whole distribution* — it
sets the spread between leaders and laggards but deletes nothing; truncation *edits the support*
— it deletes the tail but does not reshape the survivors' relative weights. They act on
different objects (weights vs guest list), which is exactly why they compose.

**Temperature alone fails:** at any finite $T$ the 20,000-token tail stays on the wheel — with a
5% tail, a 200-token reply derails with probability ≈ 99.997%; and dialing $T$ down far enough
to starve the tail walks you back into greedy's spiral and the likelihood trap.

**Truncation alone fails:** it cannot set spread *among survivors* — if the nucleus is
$0.5 / 0.3 / 0.2$, no value of $p$ makes sampling sharper or flatter within it; you cannot get
near-deterministic behavior (or extra diversity) from $p$ alone.

**Pipeline order:** logits → divide by $T$ → softmax → truncate (top-k / top-p / min-p) →
renormalize → sample.

Full credit: the reweight-vs-edit-support distinction stated crisply, one concrete failure per
lone knob (numbers welcome), and the pipeline order. Bonus for noting that because $T$ is
applied *before* truncation, cranking $T$ pushes tail tokens up into the nucleus — the
interaction the viz's second experiment demonstrates.`,
    },
    {
      id: 'm3-l2-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old.** A computer writes stories by guessing one word
at a time: for the next word, it gives every word in the dictionary a score for how well it
would fit. Explain to the kid: (1) why *always* taking the top-scoring word makes a boring robot
that repeats itself; (2) why picking *totally at random* — even among terrible words — eventually
says something bananas; (3) the trick real systems use instead. Any word a 12-year-old wouldn't
know must be explained in kid words first.`,
      rubric: md`Grade the teaching, not the vocabulary:

1. **Top-word-always = boring loop, made vivid** — e.g., once the robot says something twice,
   saying it a third time looks even *more* normal to it, because it reads its own words back
   and copies what it sees; and always playing it safe means never a surprise, and stories with
   zero surprises sound like nobody wrote them.
2. **Total randomness = bananas, via little-chances-add-up** — thousands of terrible words each
   get a tiny chance, and tiny chances over a 200-word story add up to "almost certainly at
   least one bananas word" (kid version of $1 - 0.95^{200}$: a 1-in-20 slip, tried 200 times, is
   a sure slip) — and one bananas word poisons the rest, because the robot copies what it just
   said.
3. **The real trick** — first cross out all the silly words (keep just enough good ones to cover
   most of the robot's confidence), then roll a *weighted* die among the keepers; plus a
   boldness dial you can turn down for homework-style answers and up for silly stories.
4. **Jargon audit:** "logits," "softmax," "distribution," "sampling," "temperature," "top-p,"
   "tokens" used without a kid-level explanation first = partial credit at best — jargon-hiding
   is the exact failure this exercise exists to catch.`,
    },
  ],
}
