// Module 8, Lesson 5 — Thinking like the frontier (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm8-l5',
  title: '8.5 Thinking like the frontier — where new ideas come from',
  subtitle:
    'Every technique in this curriculum was once a thing nobody had thought of. Having built forty-odd lessons of machinery, you are now in the rare position to reverse-engineer the generators — the small number of questions that keep producing frontier ideas.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Attention did not exist in 2016. FlashAttention did not exist in 2021. Multi-head latent attention
did not exist in 2023. Someone thought of each of them, and afterwards each looks obvious — which is
the signature of a good idea and the reason they are so hard to generate on purpose.

So: where do they come from? The three available theories are *genius* (useless to you), *luck*
(also useless), and *method*. This lesson argues for method — not because geniuses don't exist, but
because when you line up the last decade's important ideas and ask what question produced each,
the same handful of questions keeps appearing.

You are unusually equipped to do that lining-up. Most people read about MLA or GRPO as isolated
news. You know the machinery underneath, the constraint each was answering, and what it replaced.
That's what makes the reverse-engineering possible — so let's do it, and extract the questions.

## Seven generators

Each of these is a question you can ask of any system, with examples drawn from what you already
know. Read them as *prompts to run*, not facts to memorise.

### 1. Follow the binding constraint — numerically

Not "this is slow." *Which resource is saturated?* The answer is almost never the one people talk
about, and finding it is 8.1's profile-first discipline promoted from tactic to strategy.

- **MLA** (8.3) came from noticing the binding constraint at long context was cache memory, not FLOPs.
- **FlashAttention** (8.2) came from noticing attention was bound by HBM traffic, not arithmetic.
- **GQA** (3.3) came from serving memory, not model quality.
- **DualPipe** (8.3) came from a *deliberately crippled interconnect* — the constraint was imposed
  by export controls, and the response was an architecture that hides communication behind compute.

> **Run it:** name the resource that is actually saturated in your system, with the measurement that
> proves it. If you can't, you are optimising by folklore.

### 2. Hunt redundancy, not slowness

The sharper question is never "how do I make this faster?" but **"why does this cost anything at
all?"** Slowness is a symptom; redundancy is a structure you can attack.

- The KV cache stored 64 heads' worth of keys and values that were *all projections of one hidden
  state* — 28× redundant (8.3).
- A dense model runs every parameter for every token, though MoE shows most can sit out any given
  token (DeepSeek-V3 activates ~5.5% per token, 4.3 and 8.3).
- A fine-tuning update touches 16.8M numbers per matrix when the useful change lives in a few
  directions (7.2).
- Duplicated training documents teach recitation rather than generalisation (5.1).

> **Run it:** find something stored or computed that could be *derived* from something smaller.
> Then pay arithmetic to rebuild it — on a memory-bound chip, arithmetic is the cheap currency.

### 3. Take the constraint out of the loss

If you are enforcing a property with a lambda-weighted penalty term, you are **negotiating with your
own objective**, and the negotiation is paid in the thing you actually care about.

- **AdamW** (1.6): L2 regularisation pushed through Adam's adaptive scaling gets mangled, so decouple
  weight decay out of the gradient path.
- **Aux-loss-free load balancing** (8.3): move expert balancing into a bias control loop beside the
  loss rather than a term inside it.
- **Gradient clipping** (1.6) is a construction, not a penalty — which is exactly why it is reliable.

And note the *open* one: RLHF's KL leash (5.5) is still a penalty term, with a coefficient people
hand-tune. Whether proximity can be enforced structurally instead is a live question — which is what
an unexploited generator looks like from the inside.

> **Run it:** list every lambda in your system. Each one is a place where a construction might beat a
> negotiation.
`,
    },
    {
      type: 'text',
      md: md`
### 4. Change the granularity

An enormous fraction of "X doesn't work" turns out to mean "**X at the granularity everyone tried
doesn't work.**" This generator is the cheapest to run and the most consistently underrated.

- **FP8 training** (8.3): 8-bit had failed for years — because of *per-tensor* scaling. Per-tile and
  per-block scaling made the same bit-width work.
- **AWQ / GPTQ / group quantization** (4.4): per-group scales quarantine outliers that per-tensor
  scales cannot survive.
- **FlashAttention** (8.2): the same attention, computed per *tile* instead of per *matrix*.
- **Fine-grained experts** (8.3): many small experts instead of a few large ones, giving
  combinatorially more specialisation at equal active cost.
- **Sequence packing** (7.5): batching at the *token* level instead of the *example* level.

> **Run it:** take any accepted limitation and ask at what granularity it was actually established.
> Then try a finer one.

### 5. Trade the abundant resource for the scarce one

This is 4.1's spend-the-slack principle, and it is fully general — including in *both directions*,
which is what makes it a thinking tool rather than a rule.

- **Activation checkpointing** (4.1): spend recompute to save memory.
- **The KV cache** (3.3): spend memory to save recompute — *the opposite trade*, correct because the
  scarce resource is different at inference.
- **MLA and FlashAttention**: spend FLOPs to save bytes.
- **Over-training small models** (5.2): spend one-time training compute to save inference compute
  forever.
- **Reasoning models** (6.4): spend inference compute to save parameters.

> **Run it:** name your abundant and scarce resources *right now*, and check whether the current
> design has the trade pointed the correct way. Systems often inherit a trade from a context that no
> longer applies.

### 6. Attack the interface, not the implementation

The largest wins come from changing *what should exist*, not from making the existing thing faster.
People optimise inside a frame; occasionally someone questions the frame.

- Attention (2.1) did not optimise the RNN's fixed-size memory bottleneck — it **abolished** it by
  letting every token look at every other directly.
- Retrieval (6.4) did not make knowledge-in-weights more efficient — it moved knowledge *out of the
  weights* entirely.
- Agents (6.4) did not improve one-shot answers — they replaced the one-shot interface with a loop.
- Multi-token prediction (4.6, 8.3) did not improve next-token supervision — it questioned why
  supervision should be one token wide.

> **Run it:** ask what your system's *interface* assumes, and whether that assumption is load-bearing
> or merely inherited.

### 7. Scale something nobody scaled

Everyone scales the axis in fashion. The opportunities sit on the axes held fixed by convention.

- **Chinchilla** (5.2): everyone scaled parameters; data was the neglected axis, and rebalancing it
  reorganised the industry.
- **Reasoning models** (6.4): everyone scaled *training* compute; inference-time compute was sitting
  there unscaled.
- **R1-Zero** (8.3): everyone assumed RL needed supervised reasoning demonstrations first; scaling RL
  on verifiable rewards without them produced emergent long chains of thought.

> **Run it:** what is everyone in your area holding fixed *because that's how it's done*?
`,
    },
    {
      type: 'ponder',
      question: md`Reverse-engineer three innovations before reading on. For each, name which
generator produced it and state the question its inventor must have asked: **(a)** speculative
decoding (3.4); **(b)** LoRA (7.2); **(c)** continuous batching (4.5). Then the harder part: find one
that took *two* generators, and say why the combination was necessary.`,
      answer: md`**(a) Speculative decoding** — generator 5 (trade abundant for scarce), with a dash
of 2. The question: *decode is memory-bound, so the arithmetic units are idle — what could I spend
those free FLOPs on?* Answer: verifying several guessed tokens in one parallel pass, since
verification is compute-shaped while generation is memory-shaped. The redundancy insight (2) is that
most next tokens are easy and a small model gets them right.

**(b) LoRA** — generator 2 (hunt redundancy). The question: *why should adapting a model require
changing 16.8 million numbers per matrix, when the behaviour change is one consistent shift?* The
update was redundant; its useful content lives in a few directions.

**(c) Continuous batching** — generator 4 (change the granularity). The question: *why is a batch a
fixed group of requests that must finish together?* Batch at the level of individual decode steps
instead of whole requests, and the dead slots vanish.

**Two generators at once — FlashAttention** is the cleanest case. Generator 1 identified the real
constraint (HBM traffic, not FLOPs). But knowing that alone doesn't produce the algorithm — you also
need generator 4 (change the granularity: compute attention per *tile*, in SRAM) plus generator 5
(recompute in the backward pass instead of storing). The combination was necessary because the
constraint told you *what to attack* while the granularity change told you *how*, and neither is
sufficient alone. That is generally how it goes: generator 1 selects the target, and one of
generators 2–7 supplies the mechanism.`,
    },
    {
      type: 'example',
      title: 'the generators, applied to one live problem',
      md: md`
Let's run the whole set on a real, currently-unsolved constraint: **agent runs are dominated by
re-reading their own context** (6.4 — every step re-sends the entire transcript; cost grows
roughly quadratically with the number of steps).

**1. Binding constraint.** Measure it: at 100 steps with a 20k-token context, ~2M tokens processed
for maybe 20k tokens of *new* information. The saturated resource is prefill compute and cache
memory, not model quality.

**2. Redundancy.** Enormous — step 47's context is step 46's context plus a few hundred tokens.
Ninety-nine percent of every prefill is re-reading what was already read. *Candidate: persist the
KV cache across steps and prefill only the delta.* (Real systems do exactly this; the interesting
version is what to do when the agent edits earlier context.)

**3. Out of the loss.** Not obviously applicable — no penalty term here. Honest: some generators
return nothing for some problems, and forcing one is how you get bad papers.

**4. Granularity.** Context is managed per-*step* as one monolithic block. What about per-*segment* —
tool outputs, reasoning, and instructions cached and invalidated independently, at different
lifetimes? *Candidate: a segment-level cache with per-segment eviction policies.*

**5. Trade resources.** Memory is scarce at long horizons; compute is comparatively available.
*Candidate: compress old segments into summaries (spend compute, save cache), keeping raw text only
for recent or explicitly-pinned regions.* Note this is the lossy re-summarisation trap (6.4) unless
the pinning is smart — a real, unsolved design problem, which is what makes it interesting.

**6. Interface.** The deepest one: *why must the agent's state be a linear transcript at all?*
That's an inherited assumption from chat, not a requirement of the machinery. *Candidate:
structured state — a working-memory object the model reads and writes — with the transcript
reserved for what genuinely needs sequence.*

**7. Scale the unscaled.** Everyone scales context length. Nobody much scales *number of agent
steps* — 1,000-step or 10,000-step runs are rare, and the reliability arithmetic (6.4) says why.
*Candidate: what breaks first at 10,000 steps, measured rather than guessed?* That is a paper-shaped
question, and it needs no frontier compute — just patience and instrumentation.

Six candidates from one constraint in ten minutes, at least two of which are genuinely open. That is
what running the generators feels like — and note that the yield is *candidates*, not answers. The
filters come next.
`,
    },
    {
      type: 'text',
      md: md`
## The taste filters — which candidates are worth your year

Generating ideas is the easy half. Most of them are bad, and the filters are what separate a
research direction from a list.

**Does it get better with scale, or worse?** The single most important question. Techniques that
improve as models and compute grow compound with the field's momentum; techniques that help only at
small scale get quietly obsoleted by the next generation. Ask specifically: *if the model were 10×
bigger, would this matter more or less?*

**Does it REMOVE a component, or add one?** This is the most reliable aesthetic signal in the field,
and it is worth taking seriously:

- GRPO removes the critic network (7.4).
- DPO removes the reward model and the RL loop (5.5).
- FlashAttention removes the materialised attention matrix (8.2).
- Aux-loss-free balancing removes a loss term (8.3).
- MQA/GQA/MLA remove cached tensors (3.3, 8.3).

Removals *compose* — you can stack five of them and get a simpler system. Additions *accumulate* —
five additions give you a system nobody can debug, tune, or reproduce. When you find yourself adding
a module with three new hyperparameters, ask what you could delete instead.

**Is it simple enough to survive engineering?** An idea that needs a custom kernel, a new
parallelism strategy, and a hyperparameter schedule will be beaten in adoption by an idea 80% as
good that is ten lines of code. Adoption is part of impact.

**How large is the blast radius?** Ideas requiring everything else to change are rarely adopted even
when correct. The ones that spread are drop-in — LoRA works with any transformer; FlashAttention is
a call-site swap.

## The bitter lesson, honestly

You should know the field's most-cited strategic claim, and its tension with this entire lesson.
Rich Sutton's "bitter lesson": general methods that leverage computation ultimately win over methods
built from human knowledge about the task, because compute keeps growing and hand-crafted structure
keeps needing replacement.

So — isn't MLA hand-crafted structure? Isn't FP8 scaling human engineering? Doesn't this lesson
contradict the bitter lesson?

The distinction that resolves it is worth carrying: there is a difference between engineering that
**injects human priors about the task** (hand-designed features, grammars, curricula of what the
model should believe) and engineering that **makes compute go further** (better kernels, better
precision, better memory layouts, conditional compute). The first kind is what the bitter lesson
kills. The second kind is *how the bitter lesson gets delivered* — every efficiency win is more
effective compute, which is exactly the resource Sutton says wins.

The practical test when you are choosing work: *does my idea teach the model what to think, or does
it let the model learn more per dollar?* Prefer the second. It ages better — and it is where almost
every generator in this lesson points.

## Reading the field's current constraints

Snapshot, and explicitly a snapshot — this section ages fastest, so treat it as an example of the
*reading*, not a fixed answer. As of now the plausible binding constraints are:

- **High-quality data** — the accessible web is largely consumed (5.1), pushing synthetic data,
  multi-epoch training, and multimodal sources.
- **Energy and capital** — the compute frontier is increasingly bounded by power and fabs, not ideas,
  which raises the value of every efficiency technique in Module 8.
- **Long-horizon reliability** — the compounding arithmetic (6.4) is the wall between impressive
  demos and dependable products.
- **Verification and oversight** — RLVR works where a checker exists (5.5); most valuable tasks lack
  one, and scalable oversight (6.3) remains open.
- **Evaluation** — arguably the field's weakest link (5.6), and unusually open to newcomers because
  it needs judgment more than GPUs.

Each of those is a generator-1 answer, and each implies work. That mapping — constraint to research
question — is the skill this lesson exists to install.

## Anti-patterns

Worth naming so you can catch yourself:

- **Benchmark-chasing.** Optimising a fixed measure until it stops measuring (5.6's Goodhart, third
  appearance).
- **Complexity that doesn't scale.** A method with six interacting hyperparameters tuned on one model
  size.
- **Ideas that need a new hardware generation** to be worth it — sometimes right, usually a way to
  avoid testing anything.
- **Results at exactly one size.** If it works at 125M and you have no argument for why it survives
  at 7B, you have a curiosity, not a finding (6.5's checklist).

## What you now own

1. **Seven generators** — follow the binding constraint · hunt redundancy · take the constraint out
   of the loss · change the granularity · trade abundant for scarce · attack the interface · scale
   the unscaled — each with worked examples from the curriculum and a prompt you can run.
2. **The observed pattern** that generator 1 usually selects the *target* while one of 2–7 supplies
   the *mechanism*.
3. **The taste filters:** does it improve with scale, does it remove rather than add, is it simple
   enough to be adopted, how large is its blast radius.
4. **The bitter-lesson distinction:** engineering that injects priors ages badly; engineering that
   makes compute go further *is* the bitter lesson operating.
5. **A reading of the current constraints** — and, more durably, the habit of re-deriving that
   reading yearly rather than inheriting it.

Next lesson closes the whole curriculum: turning all of this into a direction you actually pursue —
and the twelve months after that.
`,
    },
    {
      type: 'ponder',
      question: md`Apply the "removes or adds?" filter to something you have already met. **DPO**
removes the reward model and the RL loop compared with RLHF — clean removal. Now consider
**speculative decoding**: it *adds* a second model, extra machinery, and an acceptance-check step.
By the filter it looks bad, yet it is widely adopted and genuinely valuable. Resolve the tension —
what does the filter actually measure, and when does an addition earn its place?`,
      answer: md`The filter measures **added complexity in the thing you must understand, tune, and
maintain** — and the resolution is that speculative decoding's addition sits *entirely outside the
model's semantics*. It changes no weights, no objective, no output distribution (the acceptance rule
guarantees the big model's exact distribution — 3.4). It is a pure implementation detail that can be
switched off without changing what the system *means*. If it breaks, you lose speed, not
correctness.

Compare with an addition that fails the filter: a new auxiliary loss term with a coefficient you must
tune. That one changes what the model is optimising, interacts with every other hyperparameter,
alters results in ways you cannot switch off, and must be re-tuned at every scale.

**The refined rule, which is more useful than the original:** additions that are *semantically
transparent and independently removable* are cheap regardless of their engineering weight; additions
that *enter the objective or the model's meaning* are expensive regardless of how small they look.
A hundred lines of drafting machinery you can delete on a bad day costs less than one lambda you can
never stop tuning.`,
    },
    {
      type: 'ponder',
      question: md`Here is a trap the generators can walk you into. You run generator 4 on a problem
and find a genuine granularity change that improves your metric by 3% at 125M parameters. You are
excited. Before writing it up, what is the single question most likely to kill it — and what cheap
experiment answers that question?`,
      answer: md`**The question: does it survive scale?** Many small-model improvements are
*compensating for a deficiency that scale removes*. If your finer granularity is helping the model
represent something that a 7B model already handles comfortably, your gain shrinks toward zero
exactly where it would need to matter — and the field is littered with 125M-scale results that
evaporated.

**The cheap experiment: a scaling ladder** (5.2, 6.6's capstone project (a)). Train three or four
sizes — say 30M, 60M, 125M, 250M — with and without your change, and plot the *gap* against model
size on log axes. Three outcomes, all informative: the gap **widens** (excellent — the effect
compounds with scale, and this is a real finding); the gap **holds constant** (good, worth
reporting); the gap **narrows** (your improvement is a small-model crutch, and you have learned this
for a few hundred GPU-hours instead of finding out after a headline claim).

Notice the shape of this advice: it converts a hope into a measurement, and it costs less than a
week. It is also exactly what a reviewer will ask for first (6.5's checklist), so you may as well
ask it yourself — and doing so is most of what separates a researcher from an enthusiast.`,
    },
  ],
  questions: [
    {
      id: 'm8-l5-q1',
      kind: 'mcq',
      prompt: md`Which generator best describes the reasoning that produced Multi-head Latent
Attention?`,
      options: [
        'Scale something nobody scaled — pushing the number of attention heads far beyond convention',
        'Hunt redundancy — noticing the cached keys and values were all projections of one shared hidden state, so the cache stored the same information many times over',
        'Attack the interface — replacing attention with a fundamentally different sequence-mixing operation',
        'Take the constraint out of the loss — moving the cache-size penalty from the objective into a controller',
      ],
      answer: 1,
      explain: md`MLA is the cleanest example of generator 2: the cache was not merely large, it was
*redundant*, because every head's K and V derive from the same hidden state. Once you see the
redundancy, the fix (cache the generator, rebuild the rest) follows. Option C is tempting because
MLA does modify attention — but it computes the same attention function, it changes only what gets
*stored*; genuine interface attacks look like replacing recurrence with attention, or moving
knowledge out of the weights entirely.`,
    },
    {
      id: 'm8-l5-q2',
      kind: 'numeric',
      prompt: md`Three efficiency wins are stacked on one workload, applied one after another: FP8
gives 2×, then better batching gives 1.5×, then a kernel fusion pass gives 3× — each measured as a
whole-workload speedup on top of the previous ones. What is the combined speedup?`,
      answer: 9,
      tolerance: 0.5,
      explain: md`$2 \times 1.5 \times 3 = 9\times$ — multiplicative because each factor is a
multiplier on the *total* time, measured after the previous fix landed. That compounding is why
efficiency work is so valuable: three modest wins become an order of magnitude. Contrast a different
situation: if each fix sped up only its *own* phase of the step, you could not multiply — Amdahl
(8.1) governs, and the combined gain is far smaller.
The essential caveat is 8.1's roofline: once a fix moves you out of the memory-bound region, further
byte-reductions stop helping, so wins stack only while each is addressing a live bottleneck. Claimed
speedups that assume independence without checking are one of the most common overstatements in the
literature.`,
    },
    {
      id: 'm8-l5-q3',
      kind: 'mcq',
      prompt: md`Why is "does it remove a component or add one?" a useful taste filter for research
ideas?`,
      options: [
        'Removals are always more novel than additions, so they publish better',
        'Removals compose — you can stack several and end with a simpler system — while additions accumulate hyperparameters, interactions, and maintenance that make a method hard to adopt',
        'Adding components always increases inference latency',
        'Reviewers prefer papers with fewer equations',
      ],
      answer: 1,
      explain: md`Composability is the mechanism: GRPO deletes the critic, DPO deletes the reward
model, FlashAttention deletes the materialised matrix — stack them and the system gets *simpler*,
which is why they spread. Additions interact combinatorially and each one is another thing to tune
at every scale. The refined version (from the ponder) is worth carrying: what actually costs you is
an addition that enters the *objective or the semantics*; an addition that is transparent and
independently removable — like speculative decoding — is cheap regardless of its engineering weight.`,
    },
    {
      id: 'm8-l5-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Pick three innovations from anywhere in this curriculum
that you did *not* see analysed in this lesson's ponder. For each: state the constraint that made it
necessary, name which generator produced it, write the question its inventor must have asked, and
say what it removed or added. Then identify which of your three has the best "does it improve with
scale" story, and defend that.`,
      rubric: md`Any three defensible choices; grade the *analysis*, not the picks. Strong examples:

- **Chinchilla** (5.2): constraint = fixed compute budget; generator 7 (scale the unscaled axis —
  data); question = *"we all scale parameters; what if the split itself is wrong?"*; adds nothing,
  removes a mistaken allocation.
- **Activation checkpointing** (4.1): constraint = activation memory; generator 5; question =
  *"which resource has slack — and can I pay in that one instead?"*; removes stored tensors, adds
  recompute.
- **PagedAttention** (4.5): constraint = KV fragmentation; generator 4 (granularity: pages instead of
  contiguous blocks) plus a borrowed idea from operating systems; removes reserved-but-unused memory.
- **GQA** (3.3): constraint = cache memory; generator 2/5; removes cached tensors, costs some quality.
- **Aux-loss-free balancing** (8.3): generator 3; removes a loss term.

**The scale defence** is the discriminating part: a good answer argues from *mechanism*, e.g.
"checkpointing's value grows with depth and batch size, both of which grow with scale" or
"PagedAttention's benefit grows with context length and concurrency, both trending up" — rather than
asserting it. An answer that names generators correctly but hand-waves the scale argument is partial.`,
    },
    {
      id: 'm8-l5-q5',
      kind: 'numeric',
      prompt: md`FP8 quantization of a $4096 \times 4096$ weight matrix uses one scale factor per
group of 128 weights, each scale stored in 2 bytes. The quantized weights themselves are 1 byte
each. What percentage overhead do the scale factors add?`,
      answer: 1.6,
      tolerance: 0.5,
      explain: md`Weights: $4096^2 = 16.78$M bytes. Scales: $16.78\text{M}/128 = 131{,}072$ scales
$\times 2$ bytes $= 262$ KB. Overhead $\approx 262{,}144/16{,}777{,}216 \approx 1.6\%$. That number
is the whole granularity argument in one line: finer scaling defeats the outlier problem that had
blocked 8-bit training for years, and it costs under two percent. When someone says a technique
"doesn't work," always ask what the finer-grained version would cost — the answer is frequently this
small.`,
    },
    {
      id: 'm8-l5-q6',
      kind: 'mcq',
      prompt: md`How does the "bitter lesson" square with a decade of engineering work like
FlashAttention, FP8 training, and MoE routing?`,
      options: [
        'It doesn’t — these results falsify the bitter lesson',
        'Engineering that injects human priors about the task ages badly, but engineering that makes compute go further is how the bitter lesson gets delivered: efficiency work produces more effective compute, which is the resource that wins',
        'The bitter lesson applies only to reinforcement learning, not language modelling',
        'These techniques are exceptions permitted because they were discovered empirically rather than designed',
      ],
      answer: 1,
      explain: md`The distinction is between *teaching the model what to think* (hand-designed
features, grammars, task priors — the thing that keeps getting replaced) and *letting the model learn
more per dollar* (kernels, precision, conditional compute). The second is not an exception to the
bitter lesson; it is its delivery mechanism. Option D is the seductive near-miss: how an idea was
*discovered* has no bearing on whether it injects priors — the relevant axis is what it does, not
where it came from. This test — "does my idea teach the model what to think, or let it learn more
per dollar?" — is a genuinely useful filter when choosing research.`,
    },
    {
      id: 'm8-l5-q7',
      kind: 'numeric',
      prompt: md`**Fermi.** A service processes 100 billion tokens per day at an internal cost of $2
per million tokens. An efficiency technique halves the serving cost. What are the **annual savings**,
in millions of dollars?`,
      answer: 36,
      tolerance: 12,
      explain: md`Daily tokens: $10^{11}$. Annual: $3.65\times10^{13}$. At \$2/M: $\approx \$73$M per
year; halving saves about **\$36M annually**. This is why a 2× inference win is not a footnote — a
single such technique can be worth more than the entire research budget that produced it, and it is
the arithmetic behind why efficiency teams at serving-scale companies are funded so heavily. Note
also the researcher's angle: the same technique published openly transfers that saving to everyone,
which is why efficiency work has outsized field-level impact.`,
    },
    {
      id: 'm8-l5-q8',
      kind: 'written',
      prompt: md`**Run all seven generators.** Pick one constrained system you actually care about —
serving a fine-tuned model, running an agent loop, training on one GPU, evaluating a model, or a
workload from your own work. Run every generator on it in order, writing at least one candidate idea
per generator (or an honest "returns nothing here, because…"). Then apply the taste filters to your
candidates and pick the ONE you would actually pursue, with the first experiment stated in a
sentence.`,
      rubric: md`Grade the *process*, not the brilliance of the ideas.

**All seven attempted**, with honest nulls allowed and encouraged — a good answer will have one or
two "this generator returns nothing here, because there is no penalty term / no obvious interface
assumption," and forcing an idea where none exists is precisely how bad papers get written.

**Generator 1 must be numerical** — the binding constraint stated with the measurement that would
confirm it, not a vibe.

**At least two candidates must be non-obvious** — showing the generators did real work rather than
restating known practice.

**Taste filters actually applied**: for the chosen candidate, does it improve with scale, does it
remove or add, is it simple enough to be adopted, what is its blast radius.

**One first experiment in one sentence**, whose result could come out either way (6.6's test).

Full credit for a page a colleague could act on. An answer that produces seven ideas but no filter
pass and no experiment is exactly half the skill — idea generation without selection is the failure
mode this lesson's second half exists to prevent.`,
    },
    {
      id: 'm8-l5-q9',
      kind: 'mcq',
      prompt: md`You find a granularity change that improves your metric by 3% on a 125M-parameter
model. What is the first thing to check before believing it?`,
      options: [
        'Whether the improvement holds on a second benchmark',
        'Whether the gap widens, holds, or narrows across a ladder of model sizes — because many small-model gains compensate for deficiencies that scale simply removes',
        'Whether the technique has already been published under another name',
        'Whether the training loss also improved, not just the benchmark score',
      ],
      answer: 1,
      explain: md`Scale-fragility is the modal failure of small-scale results, and a four-point
scaling ladder answers it for a few hundred GPU-hours (5.2's method, 6.6's capstone project). All
three distractors name *genuinely good practices* — a second benchmark, a novelty check, and a loss
sanity check are all worth doing, which is what makes this question a real judgement call rather
than a giveaway. But none of them addresses the specific way this class of result dies, and a
reviewer will ask about scale first (6.5).`,
    },
    {
      id: 'm8-l5-q10',
      kind: 'numeric',
      prompt: md`Removing the critic network from PPO-style RLHF (GRPO's move) eliminates one
trainable model of the same size as the policy. If policy and critic each require 16 bytes per
parameter of training state while the frozen reference and reward models need 2 bytes each, what
percentage of total memory does removing the critic save for a 7B-parameter setup?`,
      answer: 44,
      tolerance: 8,
      explain: md`Before: policy $7\text{B}\times16 = 112$ GB, critic $112$ GB, reference
$7\text{B}\times2 = 14$ GB, reward $14$ GB → $252$ GB. After: $140$ GB. Saving: $112/252 \approx
\mathbf{44\%}$. Deleting a whole trainable model from the loop is not a tuning tweak — under a
memory constraint it is the difference between a run that fits and one that doesn't, which is
exactly why generator 3's cousin ("replace a learned component with a statistic you already have")
is such a productive question.`,
    },
    {
      id: 'm8-l5-q11',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old.** A kid asks: "Where do new inventions in AI come
from? Does someone just get a really good idea in the shower?" Explain: that there are a few
questions inventors keep asking (pick two or three of the generators and give each a kid-level
name), what "finding the thing that's wasteful" means with an everyday example, why the best
inventions often *take something away* instead of adding something, and why having less of something
(money, computers) sometimes makes people invent more. No jargon without a kid-level explanation
first.`,
      rubric: md`Grade the teaching:

1. **Inventing is a set of questions, not a lightning bolt.** The kid should come away believing this
   is something you can *practise*.
2. **Two or three generators, named in kid terms and illustrated** — e.g. "what are we carrying that
   we don't need?" (redundancy: carrying sixty-four photocopies of a page instead of the original);
   "what's the actual traffic jam?" (binding constraint: the highway is fine, it's the one bridge);
   "what is everyone doing just because that's how it's done?" (scale the unscaled).
3. **Wasteful, with an everyday example** — packing the same T-shirt six times; re-reading a whole
   book every time you want the next sentence.
4. **Taking away beats adding** — a machine with fewer parts is easier to fix and easier for other
   people to use, so it spreads; every extra part is another thing that can break and another knob
   somebody has to get right.
5. **Constraint breeds invention** — if you can afford a bigger suitcase you never ask what's in it;
   the person who *can't* is forced to look, and looking is where the idea comes from. (Bonus if
   they use the DeepSeek shape without needing the name.)
6. **Jargon audit:** "KV cache," "redundancy," "arithmetic intensity," "binding constraint,"
   "granularity" used without kid-level translation = partial at best.`,
    },
    {
      id: 'm8-l5-q12',
      kind: 'written',
      prompt: md`**The strategic essay.** Choose one of the current constraints named in this lesson
(data, energy/capital, long-horizon reliability, verification/oversight, evaluation) and write the
case for working on it: (1) why you believe it is genuinely binding, with a number or measurement
supporting that; (2) which two generators you would run against it and what candidate directions
they yield; (3) how each candidate scores on the four taste filters; (4) what a newcomer with one GPU
could contribute that a frontier lab plausibly would not bother to do; and (5) the strongest argument
*against* your choice, honestly stated.`,
      rubric: md`Grade as a research director reading a pitch.

**(1)** The constraint argued, not asserted, with a supporting quantity — e.g. data: an estimate of
high-quality tokens consumed versus available (5.1); reliability: the compounding arithmetic (6.4);
evaluation: the binomial-noise argument that most reported gaps are indistinguishable (5.6).

**(2)** Two generators named and *run*, producing concrete candidate directions rather than
restatements of the constraint.

**(3)** All four filters applied per candidate (scale, removes-or-adds, simplicity/adoption, blast
radius), with at least one candidate honestly scoring badly — a pitch where everything scores well
has not been filtered.

**(4)** The newcomer-edge argument is the item that most separates a strong answer: good responses
identify work that is *judgment-heavy and compute-light* (contamination-resistant evals, careful
replication, measurement infrastructure, negative results on fashionable methods) or that requires an
edge a lab lacks (a domain, a language, a dataset, a user population).

**(5)** A genuine counter-argument, not a strawman — "this area may be crowded by the time I have
results," "the constraint may dissolve if the next model generation handles it," "my proposed
measurement may not correlate with what people care about." An essay without a real counter-argument
is advocacy, and 6.5 trained you to distrust that.

Full marks for an essay that would make a sceptical reader think "this person has actually decided
something, and knows why they might be wrong."`,
    },
  ],
}
