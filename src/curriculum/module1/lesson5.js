// Module 1, Lesson 5 — Information theory: the loss function of every LLM (Feynman rewrite)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace (JS interpolation) inside content.

const md = String.raw

export default {
  id: 'm1-l5',
  title: '1.5 Information theory — the loss function of every LLM',
  subtitle: md`With 20 yes/no questions you can find one thing among a million. Hiding inside that
party game is the exact number GPT and Claude are trained to minimize. This lesson digs it out.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

You know the game 20 Questions. I think of *anything* — an aardvark, the Eiffel Tower, your left
shoe — and you ask yes/no questions. A good player names the thing in twenty questions or fewer,
almost every time.

Stop and let that be strange. There are easily a **million** things I might have thought of. How
can twenty questions possibly be enough?

Because each answer can cut the possibilities *in half*, and halving is ferociously fast:

$$2^{20} = 1{,}048{,}576$$

Twenty halvings turn a million candidates into one. That's the whole trick — and notice the game
only works if you ask **balanced** questions. Compare two strategies for finding a number I picked
from $1$ to $8$:

- *Halving:* "Is it more than 4?" … "More than 6?" … "Is it 7?" — always exactly $3$ questions.
- *Guessing one at a time:* "Is it 1?" "Is it 2?" … — on average $\tfrac{1 + 2 + 3 + 4 + 5 + 6 + 7 + 7}{8} = 4.375$ questions.

Why does halving win? Watch what one question does to the pool of candidates. Say $1000$ remain
and your question splits them $900$ / $100$. With probability $0.9$ the answer leaves $900$
standing; with probability $0.1$ it leaves $100$. *Expected* survivors:
$0.9 \times 900 + 0.1 \times 100 = 820$. A fifty-fifty question leaves $500$, guaranteed. The
lopsided question *usually* gives you the answer you already expected — and an answer you expected
teaches you almost nothing. (In general a question that splits the pool into fractions $a$ and
$1 - a$ leaves an expected fraction $a^2 + (1-a)^2$ standing, and that is smallest at $a = \tfrac12$.)

So here is the claim of this lesson, and it's a big one: **information *is* the shrinking of
possibilities**, its natural unit is the halving, and this children's game — how surprised are you
by each answer, on average? — contains, hidden in plain sight, the loss function that trains every
large language model on Earth. By the end you will see the exact equation fall out.
`,
    },
    {
      type: 'text',
      md: md`
## Let's invent "surprise"

We want a number: how much does an event *tell* you when it happens? Call it the **surprise**
$S(p)$ of an event that had probability $p$. Before writing any formula, let's list what any
sane surprise-meter must do — and then see if the requirements leave us any freedom at all.

1. **Certainty tells you nothing.** If $p = 1$, then $S(1) = 0$. "The sun rose this morning"
   carries zero information.
2. **Rarer is more surprising.** $S$ must grow as $p$ shrinks — smoothly, and without bound as
   $p \to 0$. "The sun failed to rise" would be the most informative headline in history.
3. **Independent surprises add.** You learn two unrelated facts — a coin landed heads
   ($p = \tfrac12$) *and* your friend's new phone number ends in 7 ($p = \tfrac1{10}$). Your total
   surprise should be the *sum* of the two surprises. But probabilities of independent events
   *multiply*: the joint probability is $\tfrac12 \times \tfrac1{10} = \tfrac1{20}$. So we need
   $$S(p \cdot q) = S(p) + S(q).$$

Requirement 3 is the killer. We need a machine that eats *products* and excretes *sums* — and
mathematics has exactly one such machine: the **logarithm**. (You'll prove in the ponder below
that nothing else works.) Since probabilities are $\le 1$, their logs are $\le 0$, and we want
surprise $\ge 0$ — so flip the sign:

$$\boxed{\;S(p) = -\log p\;}$$

We didn't decree this formula; we were *cornered* into it. Now let's feel its size. In base-2
logs: a fair coin flip, $p = \tfrac12$, carries $-\log_2 \tfrac12 = 1$ — one halving's worth, one
**bit**. Something with $p = \tfrac1{1{,}048{,}576} = 2^{-20}$ carries exactly $20$ bits — which
is *precisely* why 20 Questions works: naming one thing among a million requires 20 bits, and each
perfectly balanced yes/no answer delivers exactly 1 bit. And $p = 0.999$? Surprise
$-\log_2 0.999 \approx 0.0014$ bits — the sun rose, film at eleven.

**Bits vs nats.** The base of the log is a choice of *unit*, nothing deeper — feet versus meters.
Base 2 gives **bits**; the natural log gives **nats**; the conversion is a constant:
$1$ nat $= \tfrac{1}{\ln 2} \approx 1.4427$ bits. Deep-learning code uses $\ln$ everywhere, so
**every loss you will ever read in an LLM paper is in nats per token**. "Loss 2.0" means: on
average, each real next-token surprises the model by $2.0$ nats $\approx 2.9$ bits — about as much
as three fair coin flips.
`,
    },
    {
      type: 'ponder',
      question: md`Why *must* the log appear? Requirement 3 said independent surprises add while
their probabilities multiply — but maybe some other function does that too. Try to beat the log:
test $S(p) = \tfrac1p$ and $S(p) = 1 - p$ against two independent events with $p = \tfrac12$ and
$p = \tfrac18$. Do the surprises add?`,
      answer: md`**Try $S(p) = 1/p$:** the events score $2$ and $8$, summing to $10$. But the joint
event has probability $\tfrac1{16}$, scoring $16 \ne 10$. Fails.

**Try $S(p) = 1 - p$:** two fair coin flips score $\tfrac12 + \tfrac12 = 1$, but the joint event
($p = \tfrac14$) scores $\tfrac34 \ne 1$. Fails.

They *had* to fail. The requirement is a functional equation, $f(xy) = f(x) + f(y)$, and the only
continuous monotone solutions are $f(x) = c \log x$ — the logarithm is the *unique* bridge from
multiplication to addition. That's not a fact about information; it's a fact about arithmetic,
and it's why logs appear anywhere multiplicative things need to be added: slide rules, decibels,
pH, the Richter scale — and loss functions. The leftover constant $c$ is exactly the freedom to
choose your unit: base 2 for bits, base $e$ for nats. Everything else was forced. You could have
invented $-\log p$ yourself — in fact, you just did.`,
    },
    {
      type: 'text',
      md: md`
## Entropy — the average surprise, and the unbeatable question count

One event has a surprise. A *source* of events — a coin, a die, English text — has an **average**
surprise: weight each outcome's surprise by how often it happens. This average is important enough
to get a name, **entropy**:

$$H(p) = \sum_x p(x) \cdot \big(-\log p(x)\big)$$

Let's compute two coins by hand, in bits.

**Fair coin,** $p = (0.5, 0.5)$. Each outcome surprises by $-\log_2 0.5 = 1$ bit, so

$$H = 0.5 \times 1 + 0.5 \times 1 = 1 \text{ bit.}$$

One fair flip is worth exactly one bit — the unit is *calibrated* by this case.

**A 90/10 coin,** $p = (0.9, 0.1)$. First the two surprises. $\log_2 0.9 = \log_2 9 - \log_2 10
= 3.170 - 3.322 = -0.152$, so heads surprises by $0.152$ bits. Tails: $-\log_2 0.1 = 3.322$ bits —
rare, so genuinely surprising. Now average with the right weights:

$$H = 0.9 \times 0.152 \;+\; 0.1 \times 3.322 \;=\; 0.137 + 0.332 \;\approx\; 0.469 \text{ bits.}$$

Less than *half* the fair coin. Look at why: the big surprise ($3.3$ bits) almost never happens,
and the frequent outcome carries almost nothing. **Lopsided means predictable means
uninformative.** A coin that almost always lands heads is a boring fortune teller — nine times
out of ten it tells you what you already knew. Maximum entropy over $k$ outcomes belongs to the
uniform distribution, $H = \log k$: the state of knowing *nothing*.

Entropy has a second life, and it's the 20 Questions connection: $H(p)$ is the **unbeatable
average number of yes/no questions** needed to learn an outcome drawn from $p$. No questioning
strategy, however clever, averages below $H$ — and a strategy shaped to $p$ can achieve it (exactly,
when the probabilities are powers of $\tfrac12$; within one question of it in general). But wait —
$0.469$ questions per flip? You can't ask less than one question about one flip. True! But you can
ask about *several flips at once*: "were the first three all heads?" has probability
$0.9^3 = 0.729$ — one question harvesting information about three flips. Batch cleverly and your
per-flip average approaches $0.469$. Hold that thought; it is the seed of all data compression.

> **Why you should care:** a language model's output at each step *is* a distribution over its
> vocabulary, and its entropy is the model's own uncertainty meter. After *"The Eiffel"* the
> distribution collapses onto *Tower* — entropy near $0$ bits. At the start of a fresh sentence,
> hundreds of continuations are live — several bits. And a freshly initialized model with vocabulary
> $50{,}257$ is near-uniform: $H = \ln 50{,}257 \approx 10.8$ nats, which is why a GPT-2-style
> pretraining run's loss curve starts near $10.8$ (a model with a 128k vocabulary starts near
> $\ln 128{,}000 \approx 11.8$). You can now read the first pixel of every loss curve.
`,
    },
    {
      type: 'example',
      title: 'the weather station — a question-tree that matches the world',
      md: md`
A town's weather has four outcomes with probabilities

$$p = \big(\tfrac12 \text{ sun},\; \tfrac14 \text{ cloud},\; \tfrac18 \text{ rain},\; \tfrac18 \text{ snow}\big)$$

**Entropy first.** The surprises are $-\log_2 \tfrac12 = 1$, $-\log_2 \tfrac14 = 2$,
$-\log_2 \tfrac18 = 3$, $-\log_2 \tfrac18 = 3$ bits. Average them with weights:

$$H = \tfrac12(1) + \tfrac14(2) + \tfrac18(3) + \tfrac18(3) = 0.5 + 0.5 + 0.375 + 0.375 = 1.75 \text{ bits.}$$

**Now play 20 Questions against the weather.** Strategy A, the "flat tree," ignores the
probabilities: "sun or cloud?" then one more question — always exactly $2$ questions.

Strategy B shapes itself to $p$: ask **"Sun?"** first. Half of all days: done in $1$ question.
If no, ask **"Cloud?"** — a quarter of days end at $2$. If no, ask **"Rain?"** — the remaining
quarter of days end at $3$ (rain and snow each take $3$). Expected questions:

$$\tfrac12(1) + \tfrac14(2) + \tfrac18(3) + \tfrac18(3) = 1.75.$$

Strategy B averages $1.75$ questions — beating the flat tree's $2$, and hitting the entropy
*exactly*. That is no coincidence: look at the depths. Sun sits $1$ question deep, cloud $2$,
rain and snow $3$ — **each outcome's depth in the optimal tree is exactly its surprise**
$-\log_2 p(x)$, so the average depth is exactly $H$. Frequent outcomes get short paths; rare ones
can afford long paths because you so rarely walk them.

A question-tree is secretly a *code*: write Y/N as 1/0 and sun $= 1$, cloud $= 01$, rain $= 001$,
snow $= 000$. Common things, short codes. Morse gave 'e', the most common letter, a single dot.
Your tokenizer gives "the" a single token while "syzygy" gets shredded into pieces. Same theorem,
wearing three costumes.
`,
    },
    {
      type: 'text',
      md: md`
## Cross-entropy — playing with a tree built for the wrong world

Now the concept this whole lesson exists to deliver. Suppose you move to the sunny town of the
example — but you grew up in a snowy mountain village, and you bring your childhood question-tree
with you. Your tree was shaped for
$q = \big(\tfrac18 \text{ sun}, \tfrac18 \text{ cloud}, \tfrac14 \text{ rain}, \tfrac12 \text{ snow}\big)$,
so it asks **"Snow?"** first. Under *your* tree the depths are: sun $3$, cloud $3$, rain $2$,
snow $1$ — each outcome sits at depth $-\log_2 q(x)$, because that's how your tree was built.

But reality deals from $p$, not $q$. Your average question count in the new town:

$$\tfrac12(3) + \tfrac14(3) + \tfrac18(2) + \tfrac18(1) = 1.5 + 0.75 + 0.25 + 0.125 = 2.625 \text{ questions.}$$

Almost a full wasted question per day, forever, because your tree expects snow and the sky keeps
delivering sun. This quantity — *reality picks the outcomes from $p$, but you pay the surprise of
your own beliefs $q$* — is the **cross-entropy**:

$$H(p, q) = \sum_x p(x) \cdot \big(-\log q(x)\big) = -\sum_x p(x) \log q(x)$$

Read it aloud: *the world deals from $p$; your beliefs $q$ foot the surprise bill.* Two facts to
pin down:

- If your beliefs are right, $q = p$, the bill is just the entropy: $H(p,p) = H(p) = 1.75$.
- If your beliefs are wrong, you *always* pay extra: $2.625 > 1.75$, and in general
  $H(p,q) \ge H(p)$, with equality only at $q = p$. (Whether it could ever go the other way is
  the second ponder — don't peek yet.)

> **Why you should care:** a language model *is* a question-tree factory. At every context —
> *"The cat sat on the"* — it publishes a fresh distribution $q$ over $50{,}257$ tokens: its
> belief-tree for what comes next. Reality (the training text) then reveals the actual token, and
> we charge the model that token's depth in its own tree. Training an LLM is nothing but: **make
> the trees match the world.**
`,
    },
    {
      type: 'text',
      md: md`
## The punchline — watch the sum collapse

Here is where the party game becomes the loss function, and I want you to see every step.

One training position. Context: *"The cat sat on the"*. Actual next token: *mat*. What is the true
distribution $p$ for this example? Reality already dealt the card — the token *mat* occurred,
probability $1$; every other token in the vocabulary occurred with probability $0$. The target is
**one-hot**:

$$p = (0,\; 0,\; \dots,\; \underbrace{1}_{\text{mat}},\; \dots,\; 0)$$

Now plug this $p$ into the cross-entropy sum, term by term, and watch:

$$H(p,q) = -\Big(\, 0 \cdot \log q(\text{aardvark}) + 0 \cdot \log q(\text{aback}) + \cdots + 1 \cdot \log q(\text{mat}) + \cdots + 0 \cdot \log q(\text{zyzzyva}) \,\Big)$$

Every term but one is annihilated by its weight $p(x) = 0$. The lone survivor carries weight $1$.
Fifty thousand terms collapse to a single number:

$$H(p, q) = -\log q(\text{mat})$$

**That's it. That is the loss function of every large language model.** The negative log
probability the model assigned to the token that actually came next — the actual token's depth in
the model's question-tree — averaged over every position in the corpus:

$$\boxed{\;\mathcal{L}(\theta) = -\frac{1}{N}\sum_{i=1}^{N} \log q_\theta\big(w_i \mid w_1, \dots, w_{i-1}\big)\;}$$

GPT's loss is this. Claude's loss is this. Llama's loss is this — averaged over *trillions* of
tokens. All of pretraining is one sentence: **read text, be less surprised by it, repeat.**

Three bonus observations, each worth a pause:

1. By the chain rule of probability (Lesson 1.4), the sum of per-token log probs *is* the log
   probability of the entire corpus as one long sequence — so "minimize cross-entropy," "maximize
   the likelihood of the training text," and "predict the next token" are three names for one
   objective.
2. The numbers become concrete: a reported loss of $2.05$ nats means the model assigned the true
   next token, on average, probability $e^{-2.05} \approx 0.13$.
3. Notice what the log does at the bottom: assigning the true token $10^{-9}$ instead of $0.1$
   costs $-\ln 10^{-9} \approx 20.7$ nats instead of $2.3$ — a catastrophe. The log loss makes it
   ruinous to call real text "impossible," which is exactly the pressure that forces a model to
   keep every plausible continuation alive.
`,
    },
    {
      type: 'ponder',
      question: md`Cross-entropy was *always* bigger than entropy in our examples: $2.625$ vs
$1.75$. Could a clever gambler ever flip it — could betting with the *wrong* distribution $q$
ever yield a *smaller* average surprise than betting with the truth? Think about what it would
take, then consider: what does your answer say about how low an LLM's loss can ever go on real
text?`,
      answer: md`**Never.** Betting on the truth is unbeatable — this is **Gibbs' inequality**,
$H(p,q) \ge H(p)$ with equality only at $q = p$, and the proof is one line if you know the tangent
trick $\ln x \le x - 1$:

$$\sum_x p(x) \ln \frac{q(x)}{p(x)} \;\le\; \sum_x p(x)\Big(\frac{q(x)}{p(x)} - 1\Big) \;=\; \sum_x q(x) - \sum_x p(x) \;=\; 1 - 1 \;=\; 0.$$

The left side is $H(p) - H(p,q) \le 0$. Done: no belief system beats the truth, ever.

Now the consequence that runs a trillion-dollar industry: an LLM's loss is a cross-entropy against
real text, so **it can never go below the entropy of the text itself.** English is genuinely
uncertain — after *"I'll have the"* many continuations are truly live, and no model, however
colossal, can know which one a human happened to type. Perfect loss $0$ would mean text is
deterministic, which it isn't. So the loss-versus-compute curve doesn't fall to zero; it bends
toward an **irreducible floor** — the entropy of human language — and scaling-law papers literally
fit that floor as a constant term in their equations. Corollary for your future self reviewing a
paper: a language-model loss *below* any sane estimate of text entropy isn't a breakthrough; it's
a bug (usually test data leaking into training).`,
    },
    {
      type: 'text',
      md: md`
## KL divergence — the tax, isolated

Our mountain villager pays $2.625$ questions per day in a town where a native pays $1.75$. Part of
that bill is unavoidable — the weather is genuinely uncertain — and part is pure waste, caused by
believing $q$ in a world that runs on $p$. Subtract the unavoidable part and you isolate the tax:

$$D_{\mathrm{KL}}(p \,\|\, q) \;=\; H(p,q) - H(p) \;=\; \sum_x p(x)\log\frac{p(x)}{q(x)}$$

For the villager: $2.625 - 1.75 = 0.875$ bits per day — the **Kullback–Leibler divergence** from
$p$ to $q$, the surprise-tax for wrong beliefs. Three properties do all the work:

- $D_{\mathrm{KL}}(p \,\|\, q) \ge 0$ always — that's Gibbs' inequality from the ponder, restated.
- $D_{\mathrm{KL}}(p \,\|\, q) = 0$ exactly when $q = p$: the only way to pay no tax is to believe
  the truth. Zero tax *identifies* the truth.
- And since $H(p)$ doesn't depend on the model, minimizing cross-entropy over $q$ and minimizing
  KL over $q$ are the *same optimization* — pretraining is equally well described as "drive
  $D_{\mathrm{KL}}(\text{data} \,\|\, \text{model})$ toward zero."

One thing KL is *not*: symmetric. $D_{\mathrm{KL}}(p \,\|\, q)$ and $D_{\mathrm{KL}}(q \,\|\, p)$
are different questions — *whose* reality generates the outcomes that get billed? — and they give
different numbers. That sounds like a technicality. It is not; it decides real design choices in
RLHF and variational inference. Let's catch the asymmetry red-handed with actual arithmetic.
`,
    },
    {
      type: 'example',
      title: 'KL both ways — the price of confident wrongness, by hand',
      md: md`
Two beliefs about one coin. The **zealot** says $p = (0.99,\; 0.01)$ — "heads, basically always."
The **agnostic** says $q = (0.5,\; 0.5)$. We compute the tax in both directions, in nats.

**Direction 1: reality is the zealot's coin, you hold the agnostic's beliefs.**

$$D_{\mathrm{KL}}(p \,\|\, q) = 0.99 \ln\frac{0.99}{0.5} + 0.01 \ln\frac{0.01}{0.5}
= 0.99 \times 0.683 \;+\; 0.01 \times (-3.912) = 0.676 - 0.039 \approx 0.637 \text{ nats.}$$

A modest tax: you treat a near-certain coin as fair, wasting caution on a tails that almost never
comes.

**Direction 2: reality is a fair coin, you hold the zealot's beliefs.**

$$D_{\mathrm{KL}}(q \,\|\, p) = 0.5 \ln\frac{0.5}{0.99} + 0.5 \ln\frac{0.5}{0.01}
= 0.5 \times (-0.683) \;+\; 0.5 \times 3.912 = -0.342 + 1.956 \approx 1.614 \text{ nats.}$$

**Same two distributions, and the tax is $2.5\times$ larger.** Why? In direction 2, tails — which
you insisted had probability $0.01$ — actually happens *half the time*, and every single occurrence
bills you $-\ln 0.01 \approx 4.6$ nats. The asymmetry carries a moral worth engraving somewhere:
**being confidently wrong costs far more than being vaguely wrong.** Assign near-zero probability
to something that actually happens, and KL punishes you without limit ($-\ln 0 = \infty$); spread
your bets too thin, and the penalty stays mild. Which direction you choose to minimize is therefore
a genuine modeling decision — it decides whether your approximation must *cover* everything the
truth can do, or is merely forbidden from inventing things the truth doesn't do.
`,
    },
    {
      type: 'text',
      md: md`
## Where KL earns its living in an LLM lab

**1. The RLHF leash.** After pretraining, models are tuned with reinforcement learning against a
learned reward model. The objective has a very particular shape:

$$\text{maximize} \quad \mathbb{E}\big[\text{reward}\big] \;-\; \beta \, D_{\mathrm{KL}}\big(\pi \,\|\, \pi_{\text{base}}\big)$$

where $\pi$ is the policy being tuned and $\pi_{\text{base}}$ is the frozen pretrained model. The
KL term is a *leash*: the policy may chase reward, but each nat of drift from the base model's
distribution costs $\beta$ worth of reward. Why leash it at all? Because the reward model is a
learned *proxy*, trustworthy only near the distribution it was trained on. Unleashed, the policy
wanders off-distribution and finds the proxy's bugs — degenerate, repetitive, sycophantic text
that scores wonderfully and reads terribly. This is **reward hacking**, and the KL penalty is the
industry's standard defense: stay where the reward signal can be trusted, keep the fluency and
diversity stored in the base distribution. The coefficient $\beta$ is literally the leash length.

**2. Distillation.** To shrink a giant teacher into a small student, you don't train the student
on one-hot labels — you train it to minimize KL to the teacher's *full* next-token distribution.
The teacher's soft beliefs ("mat $0.6$, rug $0.25$, sofa $0.05$, …") carry several bits of
information per position; a one-hot label carries only the single sampled outcome. Richer signal
per token is why students can learn from far less data than their teachers did.
`,
    },
    {
      type: 'text',
      md: md`
## Perplexity — turning loss back into a head-count

"Loss $3.0$ nats" is correct but bloodless. Nats live in log-space, and humans don't feel
logarithms. So let's undo the log and recover something you *can* feel: a number of options.

Ask: uniformly-undecided among how many options would produce this much average surprise? Uniform
over $k$ options has entropy $\ln k$ nats, so we solve $\ln k = \mathcal{L}$ and get
$k = e^{\mathcal{L}}$. Give it a name:

$$\mathrm{PPL} = e^{\mathcal{L} \text{ (nats)}}$$

**Check it on a fair die** — a unit test for the definition. Entropy: $\ln 6 \approx 1.792$ nats.
Perplexity: $e^{1.792} = 6$. Exactly $6$ — the formula hands back precisely the number of equally
likely faces. So perplexity is the **effective branching factor**: the size of the uniform menu
the model is *as-if* choosing from at each step. (For a single token it's even simpler:
$e^{-\ln q} = 1/q$; assign the true token $0.7$ and your perplexity is $1.43$.)

Now real numbers. Loss $3.0$ nats: $\mathrm{PPL} = e^{3.0} \approx 20.1$ — the model navigates
text as if picking blindly among $\approx 20$ live continuations per token. And when a colleague
says "perplexity dropped from 20 to 15," translate instantly: the effective menu shrank by five
options — in loss terms, $\ln 20 - \ln 15 = 3.00 - 2.71 = 0.29$ nats per token of surprise gone.

Calibrate your gut with the full journey:

| model state | loss (nats/token) | perplexity |
|---|---|---|
| fresh random init, vocab $50{,}257$ | $\ln 50{,}257 \approx 10.8$ | $\approx 50{,}257$ |
| weak model | $\approx 4.0$ | $\approx 55$ |
| strong modern LLM | $\approx 2.0$ | $\approx 7.4$ |
| impossible perfection | $0$ | $1$ |

Training is the trip down this table: from "any of fifty thousand tokens, who knows" to "one of
about seven plausible words" — and never to $1$, because (as the ponder showed) real text keeps
genuine secrets.
`,
    },
    {
      type: 'ponder',
      question: md`It is 1950. You are Claude Shannon. You want to *measure* the entropy of English
— the irreducible surprise per character — but computers can barely add. There is no model to
evaluate a loss on. What could you possibly use as your predictor?`,
      answer: md`**A human.** Shannon's guessing game: cover a text, reveal it one letter at a
time, and before each reveal have a person guess the next letter until they get it right. Count the guesses. A skilled reader guesses most letters on the first try —
English is *that* predictable — and from the guess statistics Shannon squeezed out an estimate of
roughly **1 bit per character** (his brackets: about $0.6$ to $1.3$). Sit with the trick: the human
brain was deployed as the probability model $q$, and the guessing game charged it the cross-entropy.
Every person playing hangman or Wheel of Fortune is running a language model and being scored by
its loss. Seventy years later we finally built artificial players good enough to push toward
Shannon's floor — and we measure them with exactly his number. Keep the 1 bit/char figure; you'll
use it in the Fermi question below.`,
    },
    {
      type: 'text',
      md: md`
## Loss is compression (and the argument about what that means)

One more identity, and it's exact, not poetic. A predictor that assigns probability $q(x)$ to the
next symbol can drive a compressor (an *arithmetic coder* — a streaming version of our
question-tree codes) that writes the symbol down in $-\log_2 q(x)$ bits. Average that over real
text and you get… the cross-entropy, in bits per token. So:

**Cross-entropy in bits per token is literally the size of the text after compression by the
model.** A model with loss $2.0$ nats $= 2.9$ bits per token compresses its training text to
$2.9$ bits per token — full stop, no metaphor. Plain ASCII spends $8$ bits per character while
English holds only about $1$ bit per character of actual information, so a Shannon-grade predictor
compresses text roughly $8\times$. Lower loss *is* better compression of the internet. Prediction
and compression are one problem in two costumes.

This is why "the loss went down" is such a loaded sentence. To compress chess commentary, you must
predict moves; to predict moves, something inside you must encode the rules. Compressing Wikipedia
well requires facts; compressing dialogue well requires a model of the speakers. Some researchers
(the Hutter Prize school) push this to its limit: *sufficiently good compression of human text
simply is understanding.* Flag planted honestly: that claim is **contested** — critics answer that
prediction can ride shallow statistics further than it should, and that "understanding" carries
baggage no bitrate can weigh. But the uncontested, operational core is enough to organize a
research career: **every capability jump we know how to measure has arrived as a drop in this one
number.**

And one teaser, because you have now earned it: that number's descent is eerily *lawful*. Plot
pretraining loss against compute and you get a smooth power law — so smooth that labs fit it on
small models and *predict the loss of a billion-dollar training run before spending the money*,
irreducible entropy floor and all. Those scaling laws are Module 5. You now hold the quantity they
govern.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **Information is the shrinking of possibilities**, its unit the halving — which is why 20
   balanced questions defeat a million candidates ($2^{20} = 1{,}048{,}576$).
2. **Surprise $= -\log p$, forced, not decreed:** certainty scores zero, rarity scores high, and
   independent surprises must add while probabilities multiply — only the log bridges $\times$
   to $+$. Bits vs nats is just feet vs meters ($1$ nat $\approx 1.44$ bits); paper losses are nats.
3. **Entropy $H(p)$ = average surprise = the unbeatable question count:** $1$ bit for a fair coin,
   $0.469$ bits for a 90/10 coin (worked by hand) — lopsided is predictable is boring.
4. **Cross-entropy $H(p,q)$ = questioning with a tree built for the wrong world:** reality deals
   from $p$, your beliefs $q$ pay the bill — $2.625$ vs $1.75$ for our mountain villager.
5. **The collapse:** one-hot targets kill every term but one, leaving $-\log q(\text{correct})$ —
   *the* pretraining loss of GPT, Claude, and Llama, averaged over trillions of tokens: read text,
   be less surprised, repeat.
6. **KL $= H(p,q) - H(p) \ge 0$, the pure tax:** zero only at the truth (Gibbs), asymmetric
   ($0.637$ vs $1.614$ nats for the same pair!), leashing RLHF and powering distillation.
7. **Perplexity $= e^{\text{loss}}$, the effective branching factor:** the fair die returns
   exactly $6$; loss $3.0$ means a 20-option menu.
8. **Loss is compression**, the floor is the entropy of English itself, and the descent toward
   that floor follows power laws precise enough to bet fortunes on (Module 5).

Next — **1.6 Optimization**: you now know *exactly which number* must get smaller. The next lesson
is about the only trick anyone has for making it smaller: feel the slope, and roll downhill.
`,
    },
  ],
  questions: [
    {
      id: 'm1-l5-q1',
      kind: 'numeric',
      prompt: md`A model assigns probability $\dfrac{1}{32}$ to the token that actually occurs.
What is the surprise of that outcome, in **bits**?`,
      answer: 5,
      tolerance: 0.001,
      explain: md`$S = -\log_2 \tfrac{1}{32} = \log_2 32 = 5$ bits, because $32 = 2^5$. Each
halving of probability adds exactly one bit — five halvings from certainty. In nats the same
event scores $\ln 32 \approx 3.47$: same surprise, different ruler.`,
    },
    {
      id: 'm1-l5-q2',
      kind: 'mcq',
      prompt: md`Which next-token distribution over a 4-token vocabulary has the **highest**
entropy?`,
      options: [
        md`$(1,\; 0,\; 0,\; 0)$ — total confidence`,
        md`$(0.7,\; 0.1,\; 0.1,\; 0.1)$ — a favorite plus three live alternatives`,
        md`$(0.5,\; 0.5,\; 0,\; 0)$ — a fair coin flip between two tokens`,
        md`$(0.25,\; 0.25,\; 0.25,\; 0.25)$ — uniform`,
      ],
      answer: 3,
      explain: md`Compute all four: total confidence gives $0$ bits; the favorite-plus-alternatives
gives $0.7 \times 0.515 + 3 \times 0.1 \times 3.322 \approx 1.36$ bits; the two-way coin flip
gives exactly $1$ bit; uniform gives $\log_2 4 = 2$ bits — the winner. The favorite option tempts
because it "spreads over all four tokens," but spreading *unevenly* always loses to spreading
evenly: any lopsidedness makes the source more predictable, hence less surprising on average.
This is exactly why an untrained LLM (near-uniform beliefs over $50{,}257$ tokens) starts at the
maximum possible loss, $\ln 50{,}257 \approx 10.8$ nats.`,
    },
    {
      id: 'm1-l5-q3',
      kind: 'numeric',
      prompt: md`By hand: compute the entropy, in **bits**, of a biased coin with
$p(\text{heads}) = 0.8$ and $p(\text{tails}) = 0.2$. Use $\log_2 0.8 \approx -0.322$ and
$\log_2 0.2 \approx -2.322$. Answer to three decimals.`,
      answer: 0.722,
      tolerance: 0.01,
      explain: md`Surprises first: heads $0.322$ bits, tails $2.322$ bits. Then weight by
frequency: $H = 0.8 \times 0.322 + 0.2 \times 2.322 = 0.258 + 0.464 \approx 0.722$ bits — below
the fair coin's $1$ bit, as any lopsided coin must be. The rare tails is genuinely surprising
($2.3$ bits) but too infrequent to lift the average: predictability *is* low entropy.`,
    },
    {
      id: 'm1-l5-q4',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old** (the Feynman technique — *the* test of whether
you own an idea): using the game 20 Questions, explain to the kid why a fortune teller who is
almost always right is *boring* — why their predictions tell you almost nothing. If you can, also
explain the flip side: why the one time the fortune teller is wrong is the most interesting day of
the year. No jargon allowed — every technical word you'd normally lean on, you must replace or
explain in kid-words.`,
      rubric: md`There is no single right script; grade the *teaching*. A "nailed it" answer must:

1. **Ground information in the game** — in 20 Questions, a question only helps if you *don't*
   already know the answer; a question whose answer you can guess in advance ("is it a thing?")
   barely shrinks the list of possibilities, and shrinking the list is the whole game.
2. **Apply it to the fortune teller** — if she's almost always right, then before she speaks you
   already know what she'll say, so hearing her say it shrinks your possibilities by almost
   nothing. Being told what you already believe is not news. (Any concrete kid-example works: a
   friend who "predicts" there's school tomorrow, a weather app that always says sunny in the
   desert.)
3. **Get the flip side** — the rare day she's wrong is a *huge* surprise precisely because it was
   so unexpected: rare things carry lots of information, but they're rare, so her *average*
   news-per-prediction is still tiny. An answer that notices both halves (rare = big surprise,
   but rarely happens) is demonstrating entropy without naming it.
4. **Contain no unexplained jargon.** "Entropy," "probability distribution," "log," "information
   content" — each one used without a kid-level explanation costs credit. Jargon-hiding is
   exactly the failure this exercise exists to catch: if you can't say it in kid-words, you don't
   own it yet.`,
    },
    {
      id: 'm1-l5-q5',
      kind: 'mcq',
      prompt: md`During pretraining, the loss contributed by one position whose true next token is
$x^{*}$ is:`,
      options: [
        md`$-\log q(x^{*})$ — the negative log probability the model gave the token that actually occurred`,
        md`$-\sum_x \log q(x)$ — summed over the entire vocabulary`,
        md`$1 - q(x^{*})$ — the shortfall from certainty`,
        md`$\big(q(x^{*}) - 1\big)^2$ — squared error against the one-hot target`,
      ],
      answer: 0,
      explain: md`Cross-entropy against a one-hot target keeps exactly one term: $-\log q(x^{*})$.
The distractors are tempting for good reasons. The shortfall $1 - q(x^{*})$ *feels* like the
natural penalty, and squared error is the first loss everyone learns — but both are **bounded**:
they barely distinguish assigning the true token $10^{-9}$ from assigning it $0.1$, while
$-\log q$ explodes toward $\infty$ as $q \to 0$. That unbounded punishment for calling real text
"impossible" is precisely the pressure that keeps every plausible continuation alive in the model.
The full-vocabulary sum is wrong because the target weights $p(x) = 0$ delete every off-target
term — that deletion is the famous collapse.`,
    },
    {
      id: 'm1-l5-q6',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Start from the definition
$H(p,q) = -\sum_x p(x) \log q(x)$ over a vocabulary of $V$ tokens. Let the target be one-hot:
$p(x^{*}) = 1$ for the observed token, $p(x) = 0$ for every other token. (a) Show, term by term,
that the sum collapses to $-\log q(x^{*})$, and note the one condition on $q$ your derivation
quietly needs. (b) Write the full-corpus pretraining loss as an average over $N$ positions.
(c) In one or two sentences: by the chain rule of probability, what single quantity is the
corpus-level loss the negative log of?`,
      rubric: md`**(a)** Split the sum at $x^{*}$:

$$H(p,q) = -\Big(\sum_{x \ne x^{*}} p(x) \log q(x) \;+\; p(x^{*}) \log q(x^{*})\Big)
= -\Big(\sum_{x \ne x^{*}} 0 \cdot \log q(x) \;+\; 1 \cdot \log q(x^{*})\Big) = -\log q(x^{*})$$

Every off-target term is annihilated by its weight $p(x) = 0$; the survivor carries weight $1$.
The quiet condition: $q(x) > 0$ wherever it is evaluated, so the logs are finite — a softmax
output guarantees this. (Writing only the final line without the term-by-term deletion is
recalling, not deriving — the point of the exercise.)

**(b)** $$\mathcal{L}(\theta) = -\frac{1}{N}\sum_{i=1}^{N} \log q_\theta\big(w_i \mid w_1, \dots, w_{i-1}\big)$$

**(c)** The chain rule turns the sum of conditional log probs into one joint log prob:
$\sum_i \log q_\theta(w_i \mid w_{<i}) = \log q_\theta(w_1, \dots, w_N)$. So the pretraining loss
is $-\tfrac{1}{N} \log q_\theta(\text{entire corpus})$ — minimizing average next-token
cross-entropy *is* maximizing the likelihood of the whole training text.

Full credit requires: the explicit term-by-term collapse with the $q > 0$ caveat in (a), the
correct average in (b), and the product-to-sum chain-rule identification in (c).`,
    },
    {
      id: 'm1-l5-q7',
      kind: 'numeric',
      prompt: md`A model's average test loss is $2.3$ **nats** per token. What is its perplexity?
(Use $e^{2.3} \approx 9.97$; answer to two decimals.)`,
      answer: 9.97,
      tolerance: 0.2,
      explain: md`$\mathrm{PPL} = e^{2.3} \approx 9.97$: the model is, on average, as uncertain as
if it were choosing blindly among about $10$ equally likely tokens per step. Sanity check the
round trip: uniform over $10$ options costs $-\ln \tfrac{1}{10} = \ln 10 \approx 2.303$ nats —
matching the loss. And beware units: had the $2.3$ been *bits*, the perplexity would be
$2^{2.3} \approx 4.9$. Confusing the two is a classic paper-reading error.`,
    },
    {
      id: 'm1-l5-q8',
      kind: 'mcq',
      prompt: md`A colleague reports: "our new checkpoint's perplexity dropped from 20 to 15."
What does this actually mean?`,
      options: [
        md`The model's effective menu of equally-likely next tokens shrank from about 20 to about 15`,
        md`The model's next-token accuracy improved by 5 percentage points`,
        md`The loss dropped by 5 nats per token`,
        md`The model now assigns nonzero probability to only 15 tokens at each step`,
      ],
      answer: 0,
      explain: md`Perplexity is $e^{\text{loss}}$: the size of the uniform choice the model is
*equivalent* to. Falling from 20 to 15 means the effective branching factor narrowed by five
options — in loss terms, $\ln 20 - \ln 15 = 3.00 - 2.71 \approx 0.29$ nats per token, not $5$
(perplexity differences live in exp-space, not loss-space — that's the trap in the third option).
It is not an accuracy percentage: perplexity averages *surprise*, not correct/incorrect counts.
And it is an *as-if* statement, not a hard cutoff — a softmax assigns nonzero probability to every
token in the vocabulary, always; the model merely behaves *as though* choosing among about 15.`,
    },
    {
      id: 'm1-l5-q9',
      kind: 'mcq',
      prompt: md`Which statement about KL divergence is **true**?`,
      options: [
        md`$D_{\mathrm{KL}}(p \,\|\, q) = D_{\mathrm{KL}}(q \,\|\, p)$ — it is a symmetric distance between distributions`,
        md`$D_{\mathrm{KL}}(p \,\|\, q) \ge 0$ always, but in general $D_{\mathrm{KL}}(p \,\|\, q) \ne D_{\mathrm{KL}}(q \,\|\, p)$`,
        md`$D_{\mathrm{KL}}(p \,\|\, q)$ can be negative when $q$ is a better model than $p$`,
        md`$D_{\mathrm{KL}}(p \,\|\, q) = H(p,q) + H(p)$ — cross-entropy plus entropy`,
      ],
      answer: 1,
      explain: md`Gibbs' inequality gives $D_{\mathrm{KL}} \ge 0$ with equality only at $p = q$ —
"betting on the truth is unbeatable" makes negativity impossible, however good $q$ is. Symmetry is
the seductive one: KL is nonnegative and vanishes exactly at equality, so it *feels* like a
distance — but the two directions bill the mismatch under *different* realities, and the lesson's
zealot-vs-agnostic coins gave $0.637$ vs $1.614$ nats for the same pair. The asymmetry is a
feature: it encodes that confident wrongness (near-zero $q$ on events that happen) costs
unboundedly more than vague wrongness — a distinction you will actively exploit when choosing
objectives in RLHF and variational methods. And the last option flips a sign: KL is the *gap*
$H(p,q) - H(p)$, the tax above the unavoidable minimum, not a sum.`,
    },
    {
      id: 'm1-l5-q10',
      kind: 'written',
      prompt: md`**The leash, in your own words.** RLHF tunes a policy $\pi$ with an objective of
the shape $\mathbb{E}[\text{reward}] - \beta\, D_{\mathrm{KL}}(\pi \,\|\, \pi_{\text{base}})$,
where $\pi_{\text{base}}$ is the frozen pretrained model. Explain: (a) what each of the two terms
pushes the policy to do; (b) *why* the KL leash is necessary — name the specific failure mode
that appears without it and why it appears; (c) what goes wrong when $\beta$ is too large, and
too small.`,
      rubric: md`Strong answers hit these beats:

**(a)** The reward term pushes $\pi$ toward outputs the learned reward model scores highly
(helpful, harmless, well-styled text). The KL term charges the policy for assigning token
probabilities that diverge from the pretrained base model's — anchoring it to the distribution of
fluent, diverse language it started from. Each nat of drift costs $\beta$ worth of reward: a
leash, with $\beta$ the leash length.

**(b)** The reward model is a learned **proxy**, accurate only near the distribution its training
data came from. Unconstrained maximization drives $\pi$ off-distribution into regions where the
proxy misjudges — and the optimizer *seeks out* exactly those misjudgments. The named failure is
**reward hacking**: degenerate, repetitive, or sycophantic text that scores high while being bad.
Credit requires the *mechanism* (proxy trusted only on-distribution, optimizer exploits its errors
off-distribution), not just "the model drifts too far."

**(c)** $\beta$ too large: the KL term dominates, $\pi$ barely leaves $\pi_{\text{base}}$, and
tuning accomplishes little. $\beta$ too small: reward dominates, the policy wanders off the
trusted region, and hacking or mode collapse (every answer converging on one high-reward phrasing)
appears. Both directions of the trade-off are required for full credit.

Bonus insight worth credit: the KL direction here is $D_{\mathrm{KL}}(\pi \,\|\, \pi_{\text{base}})$
— it bills outcomes under the *policy's* reality, so it explodes when $\pi$ puts weight where the
base model put almost none: the leash is harshest exactly on "invented" behavior.`,
    },
    {
      id: 'm1-l5-q11',
      kind: 'numeric',
      prompt: md`**Fermi estimate (paper first, calculator last):** Shannon measured English at
roughly $1$ bit of genuine information per character. A 300-page book holds about $600{,}000$
characters. Roughly how many **kilobytes** of irreducible information does the book contain —
i.e., the size below which no compressor, however intelligent, can squeeze it? (Round freely;
tolerance is generous. Note plain ASCII would spend 8 bits per character.)`,
      answer: 75,
      tolerance: 35,
      explain: md`$600{,}000$ characters $\times$ $1$ bit/char $= 600{,}000$ bits. Divide by 8
bits per byte: $75{,}000$ bytes $\approx$ **75 KB**. The raw ASCII file is $600$ KB, so a
Shannon-grade predictor achieves about $8\times$ compression — and that 75 KB is a *floor*, not a
target: it is the book's genuine entropy, the part no intelligence can predict away. An entire
novel's worth of irreducible surprise fits in less space than a single photo. Estimates like this
— cheap, rough, order-of-magnitude — are the researcher's reflex that catches broken experiments
before the debugger does.`,
    },
    {
      id: 'm1-l5-q12',
      kind: 'written',
      prompt: md`**The floor.** A lab scales its language model from 1 billion to 100 billion to
10 trillion parameters, with abundant clean data and flawless optimization, and the pretraining
loss keeps falling — but it will *never* reach 0 on real text. Explain: (a) what a loss of exactly
$0$ would require the model to do, and why real text makes that impossible; (b) the inequality
that makes the floor rigorous, and what the floor *is*; (c) one practical consequence for reading
scaling papers, and one for spotting a broken evaluation.`,
      rubric: md`**(a)** Loss $0$ means $-\log q(x^{*}) = 0$, i.e. $q(x^{*}) = 1$, at *every*
position: the model would have to assign probability $1$ to the actual next token, always — text
would have to be perfectly deterministic given its context. Real text is not: after *"I'll have
the"* many continuations are genuinely live, and which one a human typed is not knowable from the
context. That residual uncertainty is real entropy in the source, not a defect of the model.

**(b)** Gibbs' inequality: $H(p, q) \ge H(p)$, with equality only when $q = p$. The model's loss
is a cross-entropy against real text, so its unbeatable floor is $H(p)$ — the **entropy of the
language itself** (Shannon's estimate: around 1 bit per character). Even the perfect model, $q = p$
exactly, still pays $H(p)$ per token. Full credit requires naming or stating Gibbs (not just
asserting "there's a floor") and identifying the floor as the source's entropy.

**(c)** For scaling papers: loss-versus-compute curves must flatten toward an irreducible constant
— scaling laws are fit with exactly such a term, so "loss stopped falling as fast" can mean
"approaching the entropy floor," not "scaling is broken." For evaluations: a reported loss *below*
any sane estimate of text entropy is a red flag for contamination — usually test text leaked into
training, so the model is reciting rather than predicting. Either concrete consequence, correctly
reasoned, earns the point; both earn it fully.`,
    },
  ],
}
