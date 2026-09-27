// Module 6, Lesson 4 — Agents and thinking longer (capability frontier, Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm6-l4',
  title: '6.4 Agents and thinking longer — the capability frontier',
  subtitle: md`Everything you have learned builds a better next-token predictor. Nothing in it browses the web, runs a test suite, reads the traceback and fixes the bug for an hour. Yet deployed systems do exactly that. This lesson derives where the agency actually comes from — and then does the one piece of arithmetic that explains why the demo is always so much better than the product.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Take inventory of what you own. Module 1 gave you the geometry. Module 2 built the transformer:
embeddings, attention, feed-forward blocks, a residual stream, an unembedding, a softmax over a
vocabulary. Module 3 made it run fast. Module 4 made it serve millions of users. Module 5 taught it
to follow instructions and rewarded it for correct reasoning.

Every single one of those is machinery for the same act: **given a prefix of tokens, produce a
probability distribution over the next token.** That is the whole job. There is no goal register in
the architecture, no planner, no while-loop, no place where the model decides to try again.

And yet the thing on your screen opens a browser, reads three pages, writes a Python script, runs
it, gets a stack trace, notices it passed a string where an integer was wanted, fixes the line,
reruns, gets a plausible number, sanity-checks it against a second source, and reports back —
forty-five minutes later, unsupervised.

> Nothing in Module 2 does any of that. So where does the agency come from?

And then the sharper half of the puzzle, the one that separates people who build demos from people
who ship products:

> Why is a demo of that so *easy* and a reliable product so *brutally hard*? Not a little harder.
> The demo takes an afternoon. The product takes a year and often never arrives.

Both answers are in this lesson, and the second one is arithmetic you can do on a napkin. Let's
build the machine first, then bill it.

## Building the agent loop out of parts you already have

Here is the entire trick, and it is disappointing in the way that all good tricks are disappointing:
**we did not add anything to the model. We wrapped a loop around it.**

Watch it assemble in three moves.

**Move one: a tool call is just tokens.** The model has no ability to run code — it can only emit
tokens. So teach it to emit tokens in a syntax that *means* "run code," something shaped like

> tool: python — code: print(sum(range(100)))

Nothing magic happened. The model is still doing next-token prediction; it has simply learned, from
supervised fine-tuning on thousands of examples (5.4), that after a user asks for a computation, a
high-probability continuation is this particular format. The format is a **learned convention**,
exactly like the chat costume of 3.5. There is no tool-calling module. There is a text pattern the
model got good at producing.

**Move two: something outside the model watches for that pattern.** A plain program — the
**runtime**, sometimes called the harness or the scaffold — reads the model's output stream,
notices the tool-call syntax, stops generation, parses the arguments, actually executes the code in
a sandbox, and captures the result.

**Move three: the result is appended to the transcript, and we call the model again.**

$$\text{transcript} \;\to\; \text{model} \;\to\; \text{tool call} \;\to\; \text{runtime executes} \;\to\; \text{result appended} \;\to\; \text{transcript} \to \cdots$$

That's it. That is an agent. Model plus tools plus a loop. The intelligence is in the model; the
**agency** — the persistence, the re-trying, the multi-step structure — lives in the loop, which is
maybe two hundred lines of ordinary code with no neural network in it at all.

## The consequence that explains almost everything: the context IS the state

Now cash 3.5, because it is about to do enormous work. Between two calls to the model, the weights
do not change. Nothing is remembered. The model that reads step 40 is the *same frozen function*
that read step 1, with no trace of having been there — except that step 1 through 39 are sitting in
front of it as text.

$$\boxed{\;\text{everything the agent "knows" mid-task lives in the transcript, and nowhere else}\;}$$

Say that back to yourself, because three of the field's biggest engineering problems are corollaries
of it.

**Corollary 1: every fact must be re-shown, every single step.** The goal, the constraints, the
files it read, the error it already fixed once — all of it must physically be in the token stream
each time, or it does not exist. There is no "the agent remembers." There is only "the text is still
in there."

**Corollary 2: cost grows roughly with the square of the number of steps.** The transcript only
grows. Step $n$ processes everything from steps $1$ through $n-1$ plus the new result. If each step
adds about $c$ tokens, total tokens processed across $N$ steps is

$$\sum_{n=1}^{N} n\,c \;=\; c\,\frac{N(N+1)}{2} \;\approx\; \frac{c N^2}{2}$$

Ten times the steps costs about a hundred times the tokens. (3.3's KV cache and prompt caching soften
this a lot in practice — a stable prefix can be cached rather than re-prefilled — but caching helps
the *prefix*, and an agent's transcript is precisely the thing whose *tail* keeps changing.)

**Corollary 3: mid-task "forgetting" is a context-management bug, not a cognition failure.** When an
agent abandons a constraint you stated at step 3 by step 40, the honest diagnosis is almost never
"the model is not smart enough." It is that the constraint was evicted to make room, or summarized
away, or is still present but sitting in the middle of a 90,000-token transcript where 3.5's
lost-in-the-middle effect makes it functionally invisible. You do not fix that with a better model.
You fix it with better bookkeeping.
`,
    },
    {
      type: 'example',
      title: 'one agent run, with the token meter running',
      md: md`
Let's price a real-ish coding task. Assumptions, all deliberately round:

- **System prompt plus tool definitions:** 2,000 tokens. Sent every step, unchanged.
- **The user's task:** 200 tokens.
- **Each step adds:** about 150 tokens of model output (a short reasoning burst plus a tool call),
  plus about 800 tokens of tool result (a file chunk, a test log, a traceback). Call it 950 tokens
  per step.
- **The task takes 40 steps.**

**Context size at step $n$:** roughly $2{,}200 + 950n$ tokens. By the last step:
$2{,}200 + 950 \times 39 \approx 39{,}250$ tokens. Comfortable — no window problems.

**Total input tokens processed across the run:**

$$\sum_{n=0}^{39}\left(2{,}200 + 950n\right) = 40 \times 2{,}200 + 950 \times \frac{39 \times 40}{2} = 88{,}000 + 741{,}000 = 829{,}000$$

**Total output tokens:** $40 \times 150 = 6{,}000$.

Stop and stare at those two numbers. The agent *wrote* six thousand tokens. It *read* eight hundred
and twenty-nine thousand — **138 times more**. An agent is overwhelmingly a re-reading machine.

**In money.** Posted frontier-model prices in this era run around \$3 per million input tokens and
\$15 per million output (these move fast and vary by model — and 4.5 showed you the marginal serving
cost sits well below the posted price):

$$0.829 \times \$3 \;+\; 0.006 \times \$15 \;\approx\; \$2.49 + \$0.09 \;\approx\; \$2.58$$

About two and a half dollars per task run, of which **96% is paying to re-read context**. Two
consequences fall straight out:

1. **Prompt caching is not an optimization, it is the business model.** That 2,200-token prefix is
   identical every step, and much of the transcript prefix is stable too; cached input typically
   bills at a fraction of fresh input. Getting cache hits can cut this bill severalfold, which is
   why agent harnesses work so hard to keep the transcript prefix *append-only* rather than
   rewriting history.
2. **The quadratic bites later, not now.** Run 200 steps instead of 40 and the input total is not
   5 times larger, it is about 25 times larger: roughly 20 million tokens, tens of dollars, per
   single task attempt. This is why "just let it run longer" is a pricing decision, not a
   configuration flag.
`,
    },
    {
      type: 'text',
      md: md`
## The reliability arithmetic

Now the centerpiece. It is one line of algebra and it explains more about this industry than any
architecture diagram.

An agent's task succeeds only if **every** step succeeds. Suppose steps are roughly independent and
each succeeds with probability $p$. Then over $N$ steps:

$$P(\text{task succeeds}) = p^{N}$$

Let's actually compute it, because the numbers are more violent than anyone's intuition. Take
$N = 50$ steps — a modest coding task, forty-ish tool calls and a few retries.

**At $p = 0.95$** — the model gets a step right 19 times out of 20, which *feels* excellent:

$$0.95^{50} = e^{50\ln 0.95} = e^{50 \times (-0.05129)} = e^{-2.564} \approx 0.077$$

**7.7%.** The agent finishes the task about once every thirteen attempts.

**At $p = 0.99$** — one mistake in a hundred steps, which is a genuinely strong system:

$$0.99^{50} = e^{50 \times (-0.01005)} = e^{-0.5025} \approx 0.605$$

**60.5%.** Better than a coin flip. Still fails two runs in five.

**At $p = 0.999$** — one mistake in a *thousand* steps:

$$0.999^{50} = e^{50 \times (-0.0010005)} = e^{-0.0500} \approx 0.951$$

**95.1%.** Finally a product.

| per-step success | 50 steps | 200 steps |
|---|---|---|
| 90% | 0.5% | ~0% |
| 95% | 7.7% | 0.003% |
| 99% | 60.5% | 13.4% |
| 99.9% | 95.1% | 81.9% |

## What that table is actually telling you

**First: it explains the demo-to-product gap completely, with no reference to model quality.** A demo
is one successful run, chosen from several attempts, on a task the demonstrator picked because it
worked. At $p = 0.95$ and $N = 50$, you need about thirteen attempts to film a good one — an
afternoon's work. A *product* needs that same run to succeed on a stranger's task, unattended, most
of the time. The gap between those two situations is a factor of roughly twelve in success rate, and
closing it requires moving $p$ from 0.95 to 0.999. **The demo and the product are separated by a
factor of fifty in the error rate, and they look identical on stage.**

**Second: per-step accuracy is a terrible thing to report and a wonderful thing to hide behind.**
"Our model is 95% accurate on tool use" and "our agent completes 7.7% of tasks" are the same
sentence. Whenever you read an agent capability claim, the first question is: *how many steps?*
A benchmark of 5-step tasks and a benchmark of 100-step tasks are not measuring the same
civilization.

**Third — and this is the load-bearing one — the exponent is where the leverage is.** For small
per-step error $\varepsilon = 1 - p$:

$$P = (1-\varepsilon)^N \approx e^{-N\varepsilon}$$

Success is an exponential in $N\varepsilon$, the **expected number of mistakes per run**. That single
product is the whole story. Get $N\varepsilon$ below about $0.1$ and you have a 90% product; let it
reach $2.5$ and you have a party trick.

Before I show you what to do about it, do this one yourself. It is the most useful thirty seconds of
arithmetic in the module.
`,
    },
    {
      type: 'ponder',
      question: md`On paper, first reproduce the table: compute $0.95^{50}$, $0.99^{50}$ and
$0.999^{50}$ (use $p^{N} = e^{N \ln p}$, and for $p$ near 1 you may use $\ln p \approx -\varepsilon$).

Now the decision. You run an agent at $p = 0.95$ over 50 steps, and you have budget for exactly one
of these:

**(A)** Six months of model work that lifts per-step reliability from 95% to **96%**.

**(B)** A verification step after each action — a test run, a schema check, an assertion — that
**catches half of all errors** at the step where they happen, so the agent can retry immediately.

Work out the task success rate under each *before* revealing. Then answer the real question: why
does one of them win so decisively, and what general rule is hiding in the win?`,
      answer: md`**Option A.** $\varepsilon$ goes from $0.05$ to $0.04$:

$$0.96^{50} = e^{50 \times (-0.040822)} = e^{-2.041} \approx 0.130$$

**13.0%**, up from 7.7%. You nearly doubled the success rate! Six months well spent, surely.

**Option B.** Half of errors are caught and retried, so the *effective* per-step failure rate is
$0.05 \times 0.5 = 0.025$:

$$0.975^{50} = e^{50 \times (-0.025318)} = e^{-1.266} \approx 0.282$$

**28.2%.** More than double option A's result, from a piece of plumbing.

**Why, in general.** Write $P \approx e^{-N\varepsilon}$. Multiply the error rate by a factor $f$ and

$$P_{\text{new}} \approx e^{-N \varepsilon f} = \left(e^{-N\varepsilon}\right)^{f} = P_{\text{old}}^{\,f}$$

**Whatever you do to the error rate becomes an exponent on your success probability.** Halving
errors ($f = 1/2$) takes success to its **square root**: $\sqrt{0.077} = 0.277$ — which is what we
computed. Adding one percentage point of accuracy is only $f = 0.8$, giving $0.077^{0.8} = 0.128$.

Now look at what that rule promises. A verifier that catches **90%** of errors is $f = 0.1$:

$$P \to 0.077^{0.1} = e^{0.1 \times (-2.565)} = e^{-0.257} \approx 0.77$$

**From 7.7% to 77%, with the model completely untouched.** No pretraining run, no new data, no
architecture. That is why, when you look inside a serious agent product, you find shockingly little
model work and shockingly much scaffolding: sandboxes, linters, type checkers, test harnesses,
schema validators, retry policies, checkpoints, and a human sitting at the riskiest junction.

**The honest caveats, which matter.** Verification is not free: verifier calls cost tokens and
latency, retries cost attempts, and a false-positive verifier that rejects good work creates
expensive loops. Worse, the multiplier $f$ only applies to errors the verifier can *see*. A failed
unit test is caught at the step it happened. A subtly wrong interpretation of the requirements
sails past every type checker in the world and is discovered at step 47, poisoning everything
downstream — those errors keep their full compounding power. **Verifiability, not intelligence, is
the scarce resource.**`,
    },
    {
      type: 'text',
      md: md`
## How you actually break the compounding

The exponent rule tells you what to buy. Four things buy it, and every serious agent system is some
mixture of them.

**1. Verify each step.** The single highest-leverage move, for the reason you just derived. Note the
crucial property: the verifier must fire *at the step where the error occurs*. Compounding is not
broken by catching errors — it is broken by catching them **before they become premises**. An error
detected at step 47 that entered at step 5 has already contaminated 42 steps of reasoning that are
now sitting in the transcript being treated as established fact.

**2. Decompose.** $P \approx e^{-N\varepsilon}$ punishes $N$ linearly in the exponent, so cut $N$.
Split a 200-step task into five independent 40-step subtasks with checked hand-offs, and you are
running five easier exponentials rather than one brutal one. This is why agent frameworks obsess
over sub-agents and task decomposition — it is not architectural taste, it is the exponent.

**3. Checkpoint and retry.** If a subtask fails, you want to resume from the last known-good state,
not from scratch. With a perfect checkpoint after every step, a 5% per-step failure rate costs you
about $1/0.95 \approx 1.05$ attempts per step in expectation instead of destroying the run. Version
control is a checkpointing system, which is a quiet part of why agents get on so well with git.

**4. Put a human at the highest-variance junction.** Not "review everything" — that destroys the
economics. Review the irreversible steps: the deploy, the payment, the delete, the email that leaves
the building.

And now the observation that ties the module together. **Which domain has, for free, an oracle that
verifies a step in seconds, is cheap to run millions of times, is unambiguous, and is already
textual?**

Software. A compiler, a type checker, and a test suite are exactly that oracle. This is not a small
advantage; by the exponent rule it is *the* advantage, and it is the honest reason coding agents ran
ahead of every other kind.

## Thinking longer: inference-time compute as a scaling axis

Now switch from *many steps with tools* to *one answer with more thought*. This is the second half
of the frontier, and it is a genuinely new place to spend money.

Recall 5.2: loss falls as a power law in parameters, data and training compute. Every one of those
is spent **before deployment**. Recall 3.6: a chain of thought buys *serial computation* — the
transformer does a fixed amount of work per token, so the only way to get more computation into a
hard problem is to emit more tokens, each one re-read by the next forward pass. The emitted token is
the sole memory carried forward.

Put those together and you get a scaling axis nobody was taking seriously five years ago: **spend
more FLOPs at answer time.** Four ways, and they are genuinely different:

- **Long chains of thought.** Let the model think for 10,000 tokens before answering. *Serial* — you
  pay in latency as well as money.
- **Best-of-$N$.** Sample $N$ independent answers, use a verifier or scorer to pick one. *Parallel* —
  costs $N$ times the money but roughly the same wall-clock time.
- **Self-consistency voting.** Sample $N$ chains, take the majority answer. Best-of-$N$'s poor
  cousin, requiring no verifier, and useful when answers are short and comparable.
- **Verifier-guided search.** Score partial reasoning steps and expand promising branches — tree
  search over thoughts, with a learned process-level scorer.

Empirically, accuracy climbs with inference compute along its own curve, often roughly linear in the
*logarithm* of tokens spent over some useful range, and then flattening.

> **Flag this hard, because it is fast-moving.** The inference-time scaling curves are far newer and
> far less settled than 5.2's pretraining laws. They vary sharply by domain — steep on competition
> math and code, much flatter on tasks with no crisp notion of a correct answer. They depend on the
> verifier: many headline best-of-$N$ numbers assume an *oracle* verifier that recognizes a correct
> answer perfectly, which is not a thing you have in production. And several published curves
> saturate or invert past some budget. Treat "inference-time scaling laws" as an active empirical
> program with real results and unsettled shape, not as a law of nature.

**Reasoning models** (the o1/R1 generation) are what happens when you point 5.5's machinery at this
axis: take RL with **verifiable rewards** — math answers you can check, code that either passes tests
or doesn't — and use it to train long chains of thought rather than short ones. The model learns,
from reward rather than imitation, to spend thousands of tokens backtracking, checking its own
arithmetic, and trying a second approach. Nothing about the *architecture* changed. The training
objective taught the model how to use a resource — its own output stream — that Module 2 gave it all
along.
`,
    },
    {
      type: 'example',
      title: 'what thinking longer costs, in dollars and in seconds',
      md: md`
Cash 3.4 and 4.5, because this is where "think longer" stops being a research idea and becomes a
line item.

The critical fact: **reasoning tokens are decode tokens.** They are generated one at a time,
autoregressively, in the memory-bound regime where tokens per second is bandwidth divided by bytes
read per token. They are the *expensive* kind. They are not prefill; you cannot parallelize them
away; and the user watches the clock while they happen.

**Two ways to answer the same question.**

*Fast mode:* 200 output tokens. At \$15 per million output tokens: $200 \times 15 \times 10^{-6} =
\$0.003$. At a decode rate of 60 tokens/second: **3.3 seconds**.

*Thinking mode:* 6,000 tokens of chain of thought, then the same 200-token answer — 6,200 output
tokens. Cost: $6{,}200 \times 15 \times 10^{-6} \approx \$0.093$. Latency: $6{,}200/60 \approx$
**103 seconds**.

$$\text{cost ratio} = \frac{0.093}{0.003} = 31\times \qquad\qquad \text{latency ratio} \approx 31\times$$

**Thirty-one times more expensive and thirty-one times slower, for the same visible answer.** Now
scale it to a product serving a million questions a day: \$3,000/day versus \$93,000/day. That is a
\$33 million annual line item that exists solely because a flag was set to *think*.

**Which is why every serious deployment has a routing decision**, and why it is a *product* decision
rather than a research one: cheap mode for "what is our refund window," thinking mode for "find the
race condition in this scheduler." Getting that router right is worth more than a point of benchmark
accuracy.

**Contrast the parallel option.** Best-of-8 costs $8\times$ the money but returns in roughly the
*fast* latency, since the eight samples run concurrently on different hardware. Long CoT buys depth
and pays in wall-clock; best-of-$N$ buys breadth and pays in throughput. They fail differently too:
sampling eight times helps when the model *sometimes* gets it right, and helps not at all when the
model is confidently and systematically wrong — a correlated error survives any vote.
`,
    },
    {
      type: 'ponder',
      question: md`An agent's context is its entire state. So: a long task overflows the window.
Something must go. The standard fix is to have the model **summarize the transcript so far** and
continue from the summary — and then, when that fills up, summarize again, and again.

Predict the failure mode *before* reading on. Two questions. (1) What class of information gets lost,
and why is that class systematically the worst one to lose? (2) There is a compounding effect here
with the same shape as the reliability arithmetic you just did — find it, and put a number on it.
(Hint: you met this exact failure once before, in 2.1.)`,
      answer: md`**(1) What gets lost.** Summarization must decide what matters — *now*, at
summarization time, without knowing what step 80 will need. So it keeps the things that look
important in the abstract (the goal, the plan, the current file) and discards the things that look
like debris: the exact error message from step 12, the fact that approach B was already tried and
failed, the user's offhand "oh, and never touch the staging database."

That debris is precisely what long-horizon competence is made of. A summary that says *"explored
several approaches to the caching bug"* has thrown away the one bit that prevents the agent from
re-exploring them. **You lose the negative information first** — the record of what does *not* work —
and negative information is exactly what stops loops. This is why long-running agents so often
rediscover their own dead ends with visible enthusiasm.

**(2) The compounding.** Let $r$ be the fraction of decision-relevant detail that survives one
summarization. After $k$ rounds:

$$\text{retained} = r^{k}$$

The same exponential, wearing a different hat. At a generous $r = 0.8$, after five rounds:

$$0.8^{5} = 0.328$$

**A third of what mattered.** And two things make it worse than the reliability case. First,
summarization is **irreversible** — you cannot un-summarize, so unlike a failed test there is no
retry that recovers the loss. Second, **the summarizer is the same model that will consume the
summary**, so any error it introduces stops being a mistake and becomes a *premise*: written into
the transcript, it is now the state, indistinguishable from ground truth, and every later step
reasons from it confidently.

**This is the telephone game, for the third time in this course.** In 2.1 it was an RNN crushing a
whole sentence into one fixed-size hidden vector, degrading with distance. Attention fixed that by
letting every position look directly at every other. Long-horizon agents have quietly re-created the
bottleneck one level up: a fixed-size context, a lossy compression step, and error that compounds
with the number of compressions. The lesson generalizes — *any* time you force history through a
lossy fixed-size funnel, you get telephone-game degradation, and the fix is always the same in
shape: keep the original around and retrieve from it rather than compress it.

Which is exactly what the better designs do: write the full history to an external store, keep a
short working summary in context, and **retrieve** the specific old detail when it becomes relevant.
That is not a summary. That is a filing cabinet — and the next section is how you search one.`,
    },
    {
      type: 'text',
      md: md`
## Retrieval: lesson 1.1, shipped

Here is the most satisfying payoff in this curriculum. The dominant way to give a model access to
knowledge it was not trained on — every document search product, every "chat with your PDF," every
enterprise knowledge assistant — is **lesson one**. Not a descendant of lesson one. Lesson one.

**Retrieval-augmented generation, complete:**

1. **Chunk.** Cut your documents into pieces of a few hundred tokens.
2. **Embed.** Run each chunk through an embedding model. Every chunk becomes a vector.
3. **Embed the query** the same way.
4. **Rank by cosine similarity** — $\dfrac{\mathbf{q}\cdot\mathbf{c}}{\|\mathbf{q}\|\,\|\mathbf{c}\|}$,
   the agreement-meter you built from scratch in 1.1, with the loudness divided out.
5. **Paste the top $k$ chunks into the context** and ask the question.

That is the entire idea. Billion-dollar products are a cosine and some plumbing, exactly as 1.1
promised. The vector databases, the approximate-nearest-neighbour indexes, the sharding — all of it
is engineering to compute step 4 quickly over a hundred million chunks. The *idea* is a dot product
divided by two norms.

**Now the honest engineering,** because the gap between the idea and a working system is where the
year goes:

- **Chunking is a real decision with no clean answer.** Too small and a chunk loses the context that
  made it meaningful (a table row without its header). Too large and its embedding becomes a mush of
  five topics, pointing in an average direction that matches nothing well — you are averaging away
  the very geometry you are trying to search.
- **Pure vector search misses exact matches.** Ask for error code *TS2345* and a semantic embedding
  will cheerfully return chunks about "type errors in general." Classical keyword search (BM25) nails
  rare literal strings and misses paraphrase; embeddings do the reverse. Production systems run
  **hybrid** search and merge the rankings, because the two methods fail in complementary directions.
- **Rerank the shortlist.** The embedding of a chunk is computed *without ever seeing the query* — it
  must be one vector that serves all future questions. So retrieve 50 candidates cheaply that way,
  then run a **cross-encoder** that reads query and chunk *together* and scores relevance properly.
  Expensive per pair, run on 50 pairs instead of 100 million: the classic cheap-filter-then-careful-
  judge pattern.
- **And the failure that catches everyone: retrieval succeeds and the model ignores it.** These are
  two different systems with two different success rates, and teams routinely measure the first and
  ship the second.
`,
    },
    {
      type: 'example',
      title: 'the retrieval worked; the answer was still wrong',
      md: md`
A support assistant is asked: *"What is our refund window for enterprise contracts?"* The index
returns these cosine similarities:

| chunk | content | cos-sim |
|---|---|---|
| A | Refund Policy, section 2 — consumer refunds, 30 days | 0.81 |
| C | Marketing FAQ — "generous, no-questions-asked refunds!" | 0.79 |
| B | Enterprise MSA, section 7 — enterprise refund window, 45 days | 0.74 |
| E | Enterprise onboarding checklist | 0.66 |
| D | Shipping and delivery policy | 0.42 |

Take $k = 3$: chunks **A, C and B** go into the context. The correct answer — 45 days, in chunk B —
**was retrieved.** Retrieval accuracy on this query: 100%.

The assistant answers **"30 days."**

Walk through why, because every step is something you already know.

**Why B ranked third.** The query says *refund*, and chunk A is about nothing but refunds, densely,
with the word repeated. Chunk B is a dense legal paragraph in which the refund clause is two
sentences inside a wall of indemnity and governing-law language — its embedding is an average over
all of that, so it points somewhat away from the query direction. **The answer is
diluted by the rest of the chunk that contains it.** That is the chunking problem, doing real damage.

**Why the model went with A.** Three consequences of things you know stack up. First, A arrives
first in the assembled context and is stated crisply; B is buried in the middle of a long legal
extract, in exactly the position 3.5 told you attention handles worst. Second, A and C *agree* with
each other, and two confident agreeing sources beat one hedged qualified one. Third — the deep
one — nothing in the pipeline told the model that "enterprise" was the load-bearing word in the
question. Cosine similarity ranks by overall direction; it has no idea which dimension of the query
was the one that mattered.

**Two fixes, both cheap.** A **reranker** reads (query, chunk) jointly and would very likely surface
B first, because a cross-encoder can notice that only B contains both *enterprise* and *refund
window*. And **ordering matters**: put the highest-scoring chunk last, adjacent to the question,
rather than dropping it in the middle where lost-in-the-middle eats it.

**The measurement lesson, which is the real one.** This system's dashboard would report
*retrieval recall@3 = 100%* and look healthy. The user got a wrong answer that could void a
contract. **Retrieval quality and answer quality are separate metrics, and only one of them is the
product.**

**Retrieval versus long context.** Given windows of hundreds of thousands of tokens (4.6), why not
paste the whole handbook in? Because the trade is real in both directions. Retrieval is cheap
(you send 3 chunks, not 300 pages), fast, and scales to corpora far larger than any window — but it
is **lossy**, and any question whose answer requires synthesizing across twelve scattered sections
will fail, because top-$k$ never assembled the twelve. Long context is complete and needs no
pipeline, but you pay to prefill the entire corpus on **every single query**, and 3.5's positional
effects mean stuffing a window is not the same as using it. The current practice — retrieve broadly
into a large window — is a compromise, not a resolution, and which side wins keeps moving as
context prices fall.
`,
    },
    {
      type: 'text',
      md: md`
## Memory, and a gap that is genuinely architectural

Now be precise about something the industry is systematically imprecise about.

At inference, **the weights are frozen** (3.5). The model that answers you today is bit-identical to
the one that answered you yesterday. It follows, with no wiggle room, that:

> Nothing the model learns during a conversation exists after that conversation, unless it was
> written to an external store and explicitly retrieved back into a future context.

Every "memory" feature you have used is that sentence implemented. The system writes notes about you
to a database and retrieves relevant ones into your next prompt. It works, it is genuinely useful,
and it is **retrieval over a log** — the machinery of the previous section, applied to your own
history. It is not the model learning.

The distinction matters because the real thing — **continual learning**, updating the weights from
experience as it accumulates — remains unsolved, and the reasons are specific rather than
mysterious:

- **Catastrophic forgetting.** Fine-tune a network on new data and it degrades on the old
  distribution, sometimes dramatically. Gradient descent has no concept of protecting what it
  already knows; each update just moves the weights toward lower loss *on the current batch*.
- **You cannot verify the update.** A fact learned from a conversation might be true, false, a joke,
  or an attack. Retrieval keeps candidate knowledge outside the model where it can be inspected,
  attributed, edited and deleted. Once it is in the weights, it is smeared across billions of
  parameters — you cannot cite its source, and 6.1 explains exactly why you cannot simply find and
  remove it.
- **The alignment tax (5.4) recurs, per update.** Every training pass risks eroding the careful
  post-training that made the model safe and well-behaved. Doing that continuously, per user,
  unsupervised, is an unsolved safety problem before it is an unsolved ML problem.
- **Deletion becomes hard.** "Forget what I told you" is one row in a database and an open research
  area in a weight matrix.

So state it exactly: **today's AI memory is retrieval, and the limitation is architectural, not a
missing feature.** Anyone who tells you it is a UI problem has skipped the part where the weights
are frozen. There is real research here — parameter-efficient adapters, model editing, replay-based
continual learning, retrieval as an explicit learned component — and it is one of the most valuable
open problems in the field, which is a good reason for you to know precisely what it is.

## Multimodality, honestly

Short section, because the honest answer is anticlimactic and that is the point.

**An image becomes tokens.** Cut it into patches (say 14x14 pixels each), run each patch through a
learned linear projection into the model's residual stream dimension, add position information, and
concatenate them with the text tokens. From the first attention layer onward, **2.6's pipeline does
not know or care** which tokens came from pixels. Same attention, same residual stream, same
unembedding, same everything. Vision was not bolted onto the transformer; the transformer just
accepts any sequence of vectors, and someone wrote a function that turns pictures into vectors.

Which means nearly everything you own transfers unchanged: the KV cache, the memory-bound decode,
the serving economics, the context-is-state agent loop, the lost-in-the-middle effect.

**Where it genuinely differs — three places:**

1. **Token budgets and resolution.** Patches are expensive. A high-resolution image can consume a
   thousand or more tokens, so systems downsample or tile, and reading fine print then becomes a
   *sampling* problem rather than a *vision* problem. This collides brutally with the agent loop: an
   agent that screenshots a browser every step at ~1,200 tokens per image has spent 120,000 tokens on
   images alone by step 100, which is why real harnesses drop all but the most recent screenshots —
   and then the agent cannot remember what the page looked like three steps ago.
2. **Cross-modal grounding.** Tying a phrase to a *region* — which pixels are "the third button" —
   is a genuinely harder learning problem than tying a word to a word, and it is where multimodal
   models most visibly fail (counting objects, reading dense charts, precise spatial relations).
3. **Evaluation.** Grading "describe this image" is far harder than grading "is this answer 42?" —
   which, by 5.5's logic, means the verifiable-reward machinery that drove reasoning models forward
   has much less purchase here. Expect progress to be slower for structural reasons, not for lack of
   effort.

## Evaluating agents: 5.6's crisis, with a longer fuse

5.6 taught you that evaluation is in trouble. Agents make every part of it worse.

- **Grading is expensive.** Each run of our earlier example cost \$2.58 and ten minutes. A 500-task
  suite is \$1,300 and days of wall-clock — *per evaluation*. And because outcomes are high-variance,
  a single run per task is nearly meaningless; you want five or ten, and now you are at five figures
  to measure one checkpoint.
- **Partial credit is undefined.** The agent did 38 of 40 steps beautifully and then deleted the
  wrong file. Score? Any number you pick encodes a debatable philosophy of value, and different
  benchmarks pick differently, which is one reason their numbers do not compare.
- **Contamination is worse, not better.** Public agentic suites are built from public artifacts —
  GitHub issues, their discussion threads, and *the merged patches that fix them*. The solution is
  in the training data by construction. Held-out sets go stale the moment they are published.
- **Success is often bimodal.** Agents tend to either solve a task or flail spectacularly, so the
  mean of a benchmark hides a bimodal distribution and small score changes can mean a couple of
  tasks flipping rather than a capability shift.
- **Attribution is brutal.** A 40-step run failed. *Which step?* The proximate error is usually
  downstream of the real one, often by dozens of steps, and finding the true cause means a human
  reading a 40,000-token transcript. This is the single biggest tax on agent development.
- **The environment drifts.** The websites, APIs and package versions the agent uses change
  underneath the benchmark, so a score from last year is not comparable to one from today even with
  the identical task list. Very few reported comparisons control for this.

Practical upshot for reading claims: an agent benchmark number without **step count, number of runs
per task, variance, the exact harness, and the environment snapshot** is close to uninterpretable.
The harness is often worth more points than the model, and it is the part least often described.
`,
    },
    {
      type: 'ponder',
      question: md`Coding agents advanced faster than agents for any other domain — not slightly
faster, conspicuously faster, and consistently across labs. Build the explanation from things this
course has already given you (at least three distinct mechanisms), and then use it as a *predictive*
theory: which domain should fall next, which should resist longest, and what would make you wrong?`,
      answer: md`**Three mechanisms, all of which you already own.**

**(1) Verifiable rewards (5.5).** A test suite is a free, fast, unambiguous, automatic grader. That
is exactly the ingredient RLVR needs, and it is why reasoning-style RL works on code at all: you can
generate millions of attempts and score every one without a human. Most domains have no such oracle;
software ships with one.

**(2) Retriable verified steps (this lesson).** The same oracle runs *mid-task*, at the step where
the error occurs. By the exponent rule $P \to P^{f}$, an in-loop verifier that catches most errors is
worth more than years of per-step model improvement. Compilers and type checkers make $f$ small and
they do it in milliseconds.

**(3) Abundant, aligned training data.** Public code, commit histories with before-and-after pairs,
issue threads, documentation, Stack Overflow. And crucially the *environment itself* is free,
sandboxable, and reproducible: you can spin up a container, run the tests, throw it away, and do it
ten million times. Compare the cost of ten million trials in a chemistry lab.

**(4) The feedback is already in the model's modality.** A stack trace is text. The error message,
the diff, the log, the file — all text, in the format the model was pretrained on. No perception
layer, no grounding problem, no lossy translation between the world and the token stream.

**As a predictive theory.** Progress should be fastest where a cheap, fast, unambiguous, sandboxable
verifier exists and the interface is textual. That points at: **formal mathematics** (Lean and
friends — the proof checker is a perfect oracle); **SQL and data analysis** against known-correct
results; **configuration, infrastructure and hardware description** where a simulator or linter
exists; **anything with a deterministic engine** to check against.

It should be slowest where the reward is slow, expensive, subjective, or revealed months later:
drug discovery gated on wet-lab results, management decisions, therapy, most of clinical medicine,
and long-horizon research taste — where "was this the right question to work on?" may take two years
to answer and never gets a scalar.

**Two honest caveats, and they are the mark of a researcher.** First, this is a *plausible and
widely-held story*, not a controlled experiment. Coding also had vastly more commercial pressure,
the most motivated user base on earth, and the people building the models were themselves the users.
Disentangling verifiability from incentives is not something anyone has actually done. What would
make me wrong: a domain with excellent verifiers that stubbornly fails to advance, or a domain with
no verifier that advances quickly anyway.

Second — and this is 5.6 wearing a different hat — **verifiable is not the same as valuable.** Code
that passes its tests can still be the wrong program. Optimizing hard against the checkable part of
a task is precisely how you get systems that are superb at the measurable slice and quietly
indifferent to the rest.`,
    },
    {
      type: 'text',
      md: md`
## The honest frontier list

Not "limitations we will fix next quarter." These are the actual open problems, and the first four
are all the same problem seen from different angles.

- **Long-horizon coherence.** Keeping a goal, a plan and a set of constraints intact across hundreds
  of steps, when the only state is a transcript that is being edited for length.
- **Error recovery.** Not avoiding mistakes — *noticing* them. Recognizing "I have tried three
  variations of this and none worked, so my model of the problem is wrong" requires a kind of
  self-monitoring that current systems do erratically. The characteristic failure is not a crash but
  a loop, executed with total confidence.
- **Knowing when to stop or ask.** An agent that asks too often is useless; one that never asks is
  dangerous. Calibrating that on the fly is unsolved, and it is fundamentally a *calibration*
  problem — the model would need to know how uncertain it is, which is exactly what these systems
  are worst at.
- **Cost control.** Because the transcript grows quadratically, a stuck agent does not fail cheaply;
  it fails *expensively*, burning tokens on a loop until something stops it.
- **Safety of autonomous action.** The previous lesson was about aligning what a model *says*. An
  agent's outputs are not utterances; they are **actions** — files written, code deployed, money
  moved, emails sent, all faster than a human can read them. Every alignment failure you studied
  there — reward hacking, sycophancy, specification gaming, the sharp gap between the stated
  objective and the intended one — arrives with a shell prompt, a credit card and a network
  connection attached. **An agent with tools is an alignment problem with hands.** Reversibility,
  sandboxing, permission scoping and human checkpoints on irreversible actions are not compliance
  overhead; by the arithmetic in this lesson they are the primary engineering surface.

## What you now own

1. **Where agency comes from:** not the architecture. Model plus tools plus a loop. A tool call is
   just tokens in a learned syntax (5.4); a plain runtime parses them, executes, and appends the
   result. The intelligence is in the model; the persistence is in two hundred lines of ordinary
   code.
2. **The context is the entire state.** Weights are frozen between calls, so everything the agent
   knows must be re-shown every step. Hence: quadratic-ish token cost, caching as a business model,
   and mid-task "forgetting" that is bookkeeping rather than cognition.
3. **The reliability arithmetic, which explains the industry.** $P \approx e^{-N\varepsilon}$:
   50 steps at 95% is **7.7%**, at 99% is **60.5%**, at 99.9% is **95.1%**. Demo and product are
   separated by a factor of fifty in error rate and look identical on stage.
4. **The exponent rule and the escape.** Multiply the error rate by $f$ and success becomes
   $P^{f}$ — halving errors takes success to its *square root*. Which is why the engineering goes
   into verification, decomposition, checkpointing and human-in-the-loop rather than raw model
   quality, and why coding — which ships with a free oracle — ran ahead.
5. **Inference-time compute as a scaling axis:** long CoT, best-of-$N$, self-consistency,
   verifier-guided search — with curves that are real, domain-dependent, and much less settled than
   5.2's. Reasoning models are 5.5's verifiable-reward RL pointed at long chains of thought.
6. **Its price:** reasoning tokens are *decode* tokens (3.4) — 6,200 of them cost about 31 times a
   200-token answer and take 31 times as long. Thinking longer is a priceable product decision.
7. **Retrieval is lesson 1.1 in production:** chunk, embed, cosine-rank, paste top-$k$ — plus the
   engineering (chunking, hybrid search, reranking) and the failure everyone measures wrong, where
   retrieval succeeds and the model ignores what it retrieved.
8. **Memory is a real architectural gap.** Frozen weights mean today's learning does not survive to
   tomorrow except as an external log that gets retrieved back. Continual learning — safe weight
   updates without catastrophic forgetting or a per-update alignment tax — is genuinely unsolved.
9. **Multimodality changes less than you would think:** patches become tokens in the same residual
   stream. Where it really differs is token budgets, grounding, and the fact that its outputs are
   hard to verify — which predicts slower progress for structural reasons.
10. **Agent evaluation is 5.6's crisis with a longer fuse:** expensive to grade, undefined partial
    credit, worse contamination, bimodal outcomes, brutal failure attribution, drifting
    environments. A number without step count, run count, variance and harness is uninterpretable.

You now hold the whole picture: the mathematics, the architecture, the systems, the training, the
science of what these things are, and the frontier of what they can do. One thing is missing, and
it is the thing that turns a person who has finished a course into a person who can keep going.

Next lesson: how to read the literature — how to find the few papers that matter in a firehose of
thousands, how to read one in twenty minutes, and how to tell a real result from a well-decorated
press release.
`,
    },
  ],
  questions: [
    {
      id: 'm6-l4-q1',
      kind: 'mcq',
      prompt: md`A model that was trained purely to predict the next token now browses the web, runs
code, reads the traceback and iterates for an hour. Where does that capability actually come from?`,
      options: [
        md`A planning module added alongside the transformer, which maintains goals and dispatches sub-tasks`,
        md`The model emits tool calls as ordinary tokens in a learned syntax; an external runtime parses them, executes them, appends the results to the transcript, and calls the model again`,
        md`Recurrence was reintroduced into the architecture so the model can carry hidden state between steps`,
        md`During RL post-training the model developed an internal world model and persistent goals that survive between API calls`,
      ],
      answer: 1,
      explain: md`The model never stopped being a next-token predictor. A tool call is *text* in a
format that supervised fine-tuning (5.4) made high-probability in the right situations; everything
agentic — the executing, the appending, the looping — happens in ordinary code outside the network.

Option A is the intuitive guess, because "agent" sounds architectural, and it is wrong in a way
worth feeling: there is no planner, and if you want planning you must elicit it as *tokens*. Option
C is tempting because agents obviously carry state across steps — but the state is the transcript,
re-read from scratch every call, not a hidden vector (that was the RNN of 2.1, and attention
replaced it). Option D is the most seductive and the most important to reject cleanly: weights are
frozen at inference, so nothing whatsoever persists between calls except the tokens you send back
in. Whatever "goal" the agent has is a sentence in the context window.`,
    },
    {
      id: 'm6-l4-q2',
      kind: 'numeric',
      prompt: md`An agent completes a task in **50 sequential steps**, each succeeding independently
with probability **0.95**. What is the probability the whole task succeeds, **as a percentage**?
(Work it as $e^{50 \ln 0.95}$ on paper, then check.)`,
      answer: 7.7,
      tolerance: 0.5,
      explain: md`$\ln 0.95 = -0.05129$, so $0.95^{50} = e^{-2.564} \approx 0.077$ — **7.7%**. About
one run in thirteen.

Sit with the gap between the two numbers. "95% per-step reliability" sounds like a system that
basically works; "7.7% task success" is a system that basically doesn't. They are the *same system*.
The approximation $P \approx e^{-N\varepsilon}$ tells you why: what matters is $N\varepsilon = 2.5$,
the expected number of mistakes per run. Two and a half mistakes per run is not a good system, and
saying "95%" is how that fact gets hidden.`,
    },
    {
      id: 'm6-l4-q3',
      kind: 'mcq',
      prompt: md`A product manager asks why enabling extended reasoning made the per-request bill jump
roughly 30x when the visible answer is the same length as before. What is the correct explanation?`,
      options: [
        md`Reasoning happens during prefill, which is compute-bound and therefore the expensive phase`,
        md`The reasoning tokens are generated one at a time in the memory-bound decode regime (3.4) — they are output tokens, the expensive kind (4.5), and there are now thousands of them instead of hundreds`,
        md`Extended reasoning silently switches the request to a much larger model`,
        md`Hidden reasoning tokens are not billed, so the increase must be a metering bug`,
      ],
      answer: 1,
      explain: md`Chain of thought is *generated*, so every reasoning token is a decode step: one
forward pass, weights streamed from memory, tokens per second capped by bandwidth divided by bytes
read per token (3.4). Six thousand reasoning tokens plus a 200-token answer is 31 times the output
of a 200-token answer, at output-token prices — and about 31 times the latency, since decode is
serial and cannot be parallelized away.

Option A inverts the two phases: prefill is the compute-bound, cheap-per-token, highly parallel one —
and reasoning is not prefill. Option C is tempting because "thinking mode" often *is* a different
product tier, but the arithmetic here needs no model change; token count alone explains it. Option D
is the trap for anyone who noticed that reasoning traces are sometimes hidden from the user: hidden
in the response body is not the same as unbilled, and providers generally do bill them — which is
exactly why the routing decision between fast mode and thinking mode is a real product design
question rather than a checkbox.`,
    },
    {
      id: 'm6-l4-q4',
      kind: 'numeric',
      prompt: md`A model solves a certain class of problem on **40%** of independent attempts. You
sample **8** attempts and use a perfect verifier to select any correct one. What is the probability
at least one attempt is correct, **as a percentage**?`,
      answer: 98.3,
      tolerance: 1.5,
      explain: md`Probability all 8 fail is $0.6^{8}$. Compute it by repeated squaring:
$0.6^2 = 0.36$, $0.6^4 = 0.1296$, $0.6^8 = 0.01680$. So

$$P(\text{at least one correct}) = 1 - 0.0168 = 0.9832 \approx 98.3\%$$

From 40% to 98% for eight times the money, spent in parallel so the latency barely moves. This is
best-of-$N$ at its most flattering — and now the caveat that makes you a careful reader of papers:
**it assumes a perfect verifier.** What you actually computed is $\text{pass@}8$, the probability the
correct answer is *somewhere in the batch*. Deployable accuracy requires something that can reliably
*pick* it, and real verifiers miss correct answers and accept wrong ones. Headline best-of-$N$
numbers reported with an oracle verifier are an upper bound, not a product spec — always check which
one a paper measured.`,
    },
    {
      id: 'm6-l4-q5',
      kind: 'written',
      prompt: md`**Derive, don't recall.** From scratch, on paper: (1) write the probability that an
$N$-step agent task succeeds given independent per-step success probability $p$, and state the
assumption you just made; (2) using $\varepsilon = 1-p$, derive the approximation
$P \approx e^{-N\varepsilon}$ and say what quantity is really controlling everything; (3) from that
approximation, derive what happens to $P$ when you multiply the per-step error rate by a factor $f$;
(4) use your result to compute, for $N = 50$ and $p = 0.95$, the task success rate under (a) a
one-percentage-point model improvement and (b) a verifier that catches 90% of errors at the step
where they occur; (5) state the engineering conclusion, **and** name the specific class of error for
which your whole analysis fails.`,
      rubric: md`**(1)** $P = p^{N}$. The assumption is **independence** of step outcomes — stated
explicitly. (Credit for noting it is optimistic: real agent errors are correlated, since a confused
agent tends to keep being confused, and a poisoned transcript makes every later step worse.)

**(2)** $P = (1-\varepsilon)^N = e^{N\ln(1-\varepsilon)}$ and $\ln(1-\varepsilon) \approx
-\varepsilon$ for small $\varepsilon$, giving $P \approx e^{-N\varepsilon}$. The controlling
quantity is the product $N\varepsilon$ — **the expected number of mistakes per run**. Neither $N$
nor $\varepsilon$ matters alone.

**(3)** $\varepsilon \to f\varepsilon$ gives $P \to e^{-N\varepsilon f} = (e^{-N\varepsilon})^{f} =
P^{f}$. **Any multiplicative change to the error rate becomes an exponent on the success
probability.** Halving errors square-roots the failure, i.e. $P \to \sqrt{P}$.

**(4)** Baseline $P = 0.95^{50} \approx 0.077$.
(a) $0.05 \to 0.04$ is $f = 0.8$: $P \to 0.077^{0.8} = e^{0.8 \times (-2.565)} \approx 0.128$ —
**about 13%**. (Exact $0.96^{50} = 0.130$; noting the small gap comes from the $e^{-N\varepsilon}$
approximation earns credit.)
(b) Catching 90% of errors is $f = 0.1$: $P \to 0.077^{0.1} = e^{-0.257} \approx 0.77$ — **about
77%**.

**(5) Conclusion:** verification dominates model improvement by a wide margin, because it acts on
the exponent. Hence scaffolding — tests, type checkers, schema validation, checkpoints, retries,
human review at irreversible steps — beats raw model quality for long-horizon reliability, and
domains with free verifiers (software, formal math) advance fastest.

**The class of error where it fails:** errors the verifier **cannot see** — a plausible but wrong
interpretation of the requirements, a subtly incorrect assumption, a correct-looking result from
the wrong data. Those pass every check, become premises in the transcript, and retain their full
compounding power; they are typically detected many steps later, when the whole tail is already
contaminated. (Also creditable: verifier false positives causing retry loops, and the cost of
verification itself.)

**"Nailed it"** requires the independence caveat in (1), the derivation (not the statement) of
$P \to P^{f}$ in (3), both numbers in (4), and a genuine unverifiable-error class in (5). Quoting
"0.95 to the 50th is 7.7%" from memory without deriving the exponent rule is precisely the recall
this question exists to defeat.`,
    },
    {
      id: 'm6-l4-q6',
      kind: 'numeric',
      prompt: md`A RAG system embeds the query and six candidate chunks, giving these cosine
similarities: C1 = 0.31, C2 = 0.78, C3 = 0.55, C4 = 0.62, C5 = 0.19, C6 = 0.58. With **top-$k$
retrieval at $k = 3$**, what is the cosine similarity of the **lowest-ranked chunk that still gets
retrieved**?`,
      answer: 0.58,
      tolerance: 0.01,
      explain: md`Sort descending: C2 (0.78), C4 (0.62), C6 (0.58), C3 (0.55), C1 (0.31), C5 (0.19).
Top-3 is C2, C4, C6, so the cut-off — the lowest retrieved score — is **0.58**.

Now the part that matters more than the arithmetic: **C3 at 0.55 missed by 0.03.** If C3 is the chunk
that actually contains the answer, this system fails and no amount of model quality rescues it,
because C3 is not in the context — it does not exist as far as the model is concerned. That
three-hundredths of a cosine is why production pipelines retrieve a generous shortlist (say 50) and
then **rerank** with a cross-encoder that reads query and chunk together, instead of trusting a
bi-encoder score computed without the query ever being seen. It is also why hybrid keyword-plus-vector
search exists: a rare literal string in C3 would have pulled it up regardless of the cosine.`,
    },
    {
      id: 'm6-l4-q7',
      kind: 'mcq',
      prompt: md`Your RAG evaluation shows the correct chunk appears in the top-3 for **92%** of
queries, but end-to-end answer accuracy is only **61%**. What is the most likely diagnosis?`,
      options: [
        md`The embedding model is too weak and should be replaced with a larger one`,
        md`Retrieval and utilization are separate systems with separate failure rates — the right chunk is reaching the context but is being buried mid-context, out-ranked by confident-sounding wrong chunks, or contradicted by neighbours, so the model does not use it`,
        md`$k$ is too small; raising it to 10 will close the gap`,
        md`Cosine similarity is the wrong metric and should be replaced with Euclidean distance`,
      ],
      answer: 1,
      explain: md`The measurement already tells you retrieval is doing its job 92% of the time. The
31-point gap therefore lives *after* retrieval: 3.5's lost-in-the-middle effect when the good chunk
lands in the interior of a long context, ordering effects when a crisp-but-wrong chunk arrives first,
and outright contradiction between retrieved chunks that the model resolves badly. Fixes are
reranking, ordering the best chunk adjacent to the question, and de-duplicating contradictory
sources.

Option A is the reflex answer and is refuted by the 92% — the embeddings are working. Option C is
genuinely tempting and is often actively *harmful*: raising $k$ adds more distractors and more
context to get lost in, so recall goes up while answer accuracy goes down. Option D sounds
sophisticated but on normalized embeddings, cosine ranking and Euclidean ranking are monotonically
equivalent — they produce the identical order, so it cannot explain anything at all. The habit worth
keeping: **when two stages are chained, measure both, because the healthy one will happily mask the
sick one.**`,
    },
    {
      id: 'm6-l4-q8',
      kind: 'numeric',
      prompt: md`**Fermi estimate — do it on paper, calculator only at the end.** An agent runs for
**100 steps**. Each step re-sends a context of roughly **20,000 tokens** (the goal, the tool
definitions, the accumulated transcript). Roughly how many **million input tokens** does the whole
task run process? Generous tolerance — the habit of estimating an order of magnitude before touching
a billing dashboard is the point.`,
      answer: 2,
      tolerance: 0.8,
      explain: md`$100 \times 20{,}000 = 2{,}000{,}000$ — **about 2 million input tokens for one run
of one task.**

Convert it to money at roughly \$3 per million input tokens and you get about **\$6 per task
attempt**, before counting output tokens, which are a rounding error here: the agent might *write*
15,000 tokens across those 100 steps, under 1% of what it *read*.

That ratio is the punchline. **Agent economics are dominated by re-reading context**, because the
weights are frozen and the transcript is the only state, so the entire history must be re-sent every
single step. Three consequences fall out immediately: prompt caching is load-bearing rather than a
nice-to-have; a stuck agent burns money at full rate while accomplishing nothing; and doubling the
step count more than doubles the bill, since the context grows as it goes (this estimate flattered
you by holding it at 20k).`,
    },
    {
      id: 'm6-l4-q9',
      kind: 'mcq',
      prompt: md`Which statement about multimodal models is **most accurate**?`,
      options: [
        md`Images are processed by a separate convolutional network whose output is fused with the language model's logits at the very end`,
        md`Image patches are linearly projected into the same residual stream as text tokens, so most of the transformer stack is unchanged — the real differences are token budgets and resolution, cross-modal grounding, and the difficulty of evaluation`,
        md`Multimodal models require attention to be redesigned, since pixels have two-dimensional structure that one-dimensional attention cannot represent`,
        md`Because images carry far more information than text, image inputs are cheaper per unit of information and reduce the cost of agent loops`,
      ],
      answer: 1,
      explain: md`Patchify, project, add position information, concatenate — from layer one onward the
stack cannot tell pixels from words, which is why the KV cache, memory-bound decode, serving
economics and lost-in-the-middle all transfer unchanged.

Option A describes an older generation of architecture and is tempting because late fusion sounds
natural; the modern answer is that vision enters at the *input*, not the output. Option C states a
real intuition — images genuinely are 2D and attention is permutation-invariant over a flat sequence
— but the resolution is mundane: 2D structure is injected through positional encodings on the
patches, not by redesigning attention. Option D inverts the actual economics, and dangerously: a
single screenshot can cost a thousand-plus tokens, so an agent that screenshots every step blows
through its context and its budget far faster than a text-only one — which is exactly why real
harnesses discard all but the most recent images.`,
    },
    {
      id: 'm6-l4-q10',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: *"Why do I have to keep telling the AI the
same stuff over and over? And why doesn't it remember what we did yesterday? Is it lazy?"*

Explain, in kid-words: (1) why the AI genuinely does not remember anything between messages;
(2) what the app is actually doing when it "remembers" your name; (3) why remembering properly is
*hard* rather than something the engineers forgot to build; and (4) why a long job makes this worse,
not better. Invent your own analogy — inventing a good one is worth more than borrowing mine.`,
      rubric: md`Grade the **teaching**, not the vocabulary. A "nailed it" answer hits four beats in
plain language:

1. **No memory, and why.** The AI's "brain" is a gigantic pile of numbers that got fixed in place
   when it finished learning, and **it does not change when you talk to it**. So each time you send
   a message, it is genuinely meeting you for the first time. A strong analogy makes the *re-reading*
   concrete: the app secretly staples the whole conversation to the top of every message and hands
   the pile over again — like a brilliant person who wakes up with no memory each morning and can
   only work from the notebook you hand them.
2. **What "memory" features really are.** The app keeps a **notebook outside the AI** — a file with
   notes about you — and quietly pastes the relevant lines into the top of your next message. The AI
   isn't remembering; someone is reminding it, every single time. (Credit for noticing this is
   actually a nice property: you can read the notebook, fix it, or tear a page out.)
3. **Why real remembering is hard.** Changing the pile of numbers is the only way to truly learn, and
   it is dangerous: teaching it something new tends to knock loose things it already knew (like
   rearranging a whole library to add one book); you can't check whether the new thing is even true
   before it gets mixed in; and once it's mixed in you can't find it again to remove it. The notebook
   is safer *because* it is outside.
4. **Why long jobs make it worse.** The stapled pile keeps growing, so every step gets slower and
   more expensive, and eventually the pile is too big to hand over — so the app squeezes it into a
   shorter summary, and each squeeze throws things away. A kid-level version of the telephone game
   here is worth extra credit.

**Jargon audit — this is where most answers lose points.** Using *context window*, *weights*,
*frozen*, *inference*, *token*, *retrieval*, *RAG*, *embedding*, *fine-tuning* or *catastrophic
forgetting* **without first explaining it in kid-words** is partial credit at best. Naming the
concept is not explaining it; if you wrote "the weights are frozen" and moved on, you hid the idea
behind a word instead of teaching it.`,
    },
    {
      id: 'm6-l4-q11',
      kind: 'written',
      prompt: md`**The memory gap, precisely.** A colleague says: *"AI memory is basically solved —
the apps remember me across sessions now. It was only ever a UI problem."*

On paper: (1) state exactly what those products do mechanically, and why it is not the model
learning; (2) give **three specific technical reasons** continual learning — updating weights from
experience — remains unsolved, drawing on this course; (3) name two genuine *advantages* the
external-store approach has over weight updates, so your critique is not just a complaint; and
(4) describe what a real solution would have to demonstrate, including one result that would make
you *lower* your confidence that it worked.`,
      rubric: md`**(1) The mechanism.** A separate system writes facts about the user to an external
store, and at query time retrieves relevant entries and inserts them into the prompt. The model's
weights never change; it is 1.1's cosine retrieval pointed at a log of your own history. The proof
is one sentence: send the same prompt with an empty store and the model behaves as if you had never
met. It is *reminding*, not remembering.

**(2) Three reasons** (any three, with mechanism, not just names):
- **Catastrophic forgetting** — gradient descent optimizes loss on the current batch and has no term
  protecting prior knowledge, so training on new experience degrades old capabilities, sometimes
  sharply.
- **Unverifiable updates** — a fact from a conversation may be false, a joke, or a deliberate
  injection attack. Weight updates bake it in with no provenance and no ability to inspect it first.
- **The alignment tax (5.4), recurring** — every training pass risks eroding the post-training that
  made the model safe and well-behaved; doing this continuously, per user, unsupervised, is a safety
  problem before it is an ML problem.
- **Non-deletability / non-localizability** — once smeared across billions of parameters, a fact
  cannot be cleanly cited or removed, and 6.1's superposition explains exactly why there is no single
  place to go and delete it.
- **Evaluation cost** — you cannot re-run a full safety and capability evaluation after every
  incremental update, so you would be shipping unvalidated models continuously.

**(3) Two advantages of the external store** (this half separates critique from complaint):
inspectability and auditability (you can read what the system believes about you and see *why* it
said something); editability and deletion (one row, versus an open research problem); attribution
and citation of sources; per-user isolation with no cross-contamination between users; and instant
effect with no training run.

**(4) What a real solution must demonstrate.** At minimum: sustained incorporation of new knowledge
into the weights, **with** measured retention on a broad held-out capability suite (no catastrophic
forgetting), **with** safety and alignment properties preserved across many sequential updates,
**with** a working deletion or reversal mechanism, and **with** robustness to adversarial or false
inputs — validated over a long sequence of updates, not one.

**The confidence-lowering result** is the essential part: e.g. the method is demonstrated only over a
handful of updates (drift and forgetting are cumulative, so short sequences prove nothing); or it is
evaluated only on the newly-learned facts and not on a broad prior-capability suite; or degradation
appears on tasks the paper did not measure; or the update is shown to be adversarially triggerable.
Credit specifically for demanding **negative controls** — a result that could have come out badly and
didn't — rather than a demonstration that can only succeed.

Full credit requires all four parts, with part (3) genuinely arguing the other side.`,
    },
    {
      id: 'm6-l4-q12',
      kind: 'written',
      prompt: md`**Research judgment.** A lab announces: *"Our agent solves 71% of tasks on a
long-horizon coding benchmark, up from 52% last year — a decisive capability jump."*

Write the careful reader's response: (1) list **five specific questions** you would need answered
before you could interpret the 71% at all, saying for each what a bad answer would reveal; (2)
explain why *contamination* is a sharper worry for agentic coding benchmarks than for, say, a
multiple-choice knowledge test; (3) explain why the headline gap between 52% and 71% might reflect
almost no change in the model, and name the component most likely responsible; and (4) design one
concrete experiment that could distinguish a genuine model capability improvement from a
scaffolding improvement.`,
      rubric: md`**(1) Five questions** (any five, each paired with what a bad answer reveals):
- **How many steps does a typical task take?** By $P \approx e^{-N\varepsilon}$, a 5-step suite and a
  100-step suite measure incomparable things; a low step count means the headline says little about
  long-horizon competence.
- **How many runs per task, and what is the variance?** One run per task on a high-variance,
  bimodal-outcome system is close to noise; no error bars means the 19-point gap may be a handful of
  tasks flipping.
- **What is the harness?** Tools, retry policy, context management, verifier loop. If undescribed,
  the result is not reproducible and may not be about the model at all.
- **What is the scoring rule?** Is a task that completes 38 of 40 steps and then deletes the wrong
  file scored 0, or partial? Different suites choose differently, so numbers do not compare across
  benchmarks.
- **Contamination controls?** Were the tasks and their public solutions in the training corpus? Was
  there a held-out set created after the training cutoff?
- **Was the environment snapshot pinned?** Packages, APIs and websites drift, so a year-over-year
  comparison on a live environment is not a controlled comparison.
- **Cost and time per task?** A 71% achieved with 50x the inference compute is a different claim from
  71% at parity — inference-time compute is a *dial*, and comparing across settings of it is
  comparing nothing.

**(2) Why contamination is sharper here.** Agentic coding suites are assembled from public artifacts:
the issue text, the discussion thread, *and the merged patch that resolved it* are all on the public
internet and therefore plausibly in pretraining data. The benchmark ships with its own answer key.
Worse, the leak is subtle — the model need not reproduce the patch verbatim, only be nudged toward
the right file and approach, which looks exactly like competence. And unlike a multiple-choice item
that can be paraphrased or regenerated, a real repository task cannot be rewritten without changing
what it tests, so held-out sets go stale immediately upon publication.

**(3) Why the model might be unchanged.** By this lesson's arithmetic, the exponent rule
$P \to P^{f}$ means a better **harness** — a verifier that catches more errors at the step where they
occur, better context management, smarter retries and checkpoints, task decomposition, more
inference-time compute — can move end-to-end task success enormously with identical weights. The
component most likely responsible is the **scaffolding, especially the in-loop verification and
retry policy**. (Credit also for: more inference compute per task, or a better prompt/tool set.)
Note this is not a criticism of the result — the harness is real engineering — it is a criticism of
attributing it to the model.

**(4) The distinguishing experiment.** The essential move is a **factorial / swap design**: run
old-model-plus-new-harness and new-model-plus-old-harness, on the same pinned environment, same task
list, same inference budget, with multiple runs per task and reported variance. If the old model in
the new harness recovers most of the 19 points, the gain was scaffolding. Strong answers hold
inference compute constant across arms (otherwise you have measured the dial, not the model) and
pre-register the comparison. Also creditable: evaluating both models on a freshly-authored,
never-published task set created after both training cutoffs, to separate capability from
contamination.

Full credit requires the swap or ablation design in (4) — an experiment whose outcome could come out
either way — rather than a demonstration that can only confirm the headline.`,
    },
  ],
}
