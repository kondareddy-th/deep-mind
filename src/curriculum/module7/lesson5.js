// Module 7, Lesson 5 — The toolchain (Feynman standard, practitioner-focused)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm7-l5',
  title: '7.5 The toolchain — what to actually run',
  subtitle: md`Fifteen libraries claim to do the same thing, with incompatible configs and contradictory advice, and choosing by star count is how people end up unable to debug their own run at 3am. But all fifteen are assembling the same six layers. This lesson teaches the layers — because the names churn yearly and the structure doesn't.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Lesson 7.1 made you earn this. The failure was genuinely Type 2, the prompt work plateaued on a
measured eval, the dataset is real (7.3), and you have decided: you are going to fine-tune.

So you search for *how*. And here is what you find:

> Fifteen libraries, each whose README claims it is the easiest and fastest way to fine-tune an
> LLM. Their configuration files are mutually unintelligible — one wants a YAML with forty keys,
> one wants a Python script, one wants a CLI flag you cannot locate in any documentation. Blog post
> A says learning rate 2e-5. Blog post B says 2e-4, calls A's number obviously wrong, and is *also
> right*. A third of the advice is eighteen months old, which in this field is archaeology.

The usual response is to choose by popularity: most stars, most recent post, whatever a colleague
used. That works. It works right up until 3am the night before the demo, when the loss has been
flat for four hundred steps and the tool that made it so easy to start gives you nothing at all to
think with — because you never learned what it was doing on your behalf. Popularity is a fine way
to pick a *starting point* and a catastrophic way to pick an *understanding*.

There is a way out, and it isn't reading all fifteen READMEs. It's this:

> **All fifteen are assembling the same six layers.** They differ only in which layers they hide,
> which they expose, and which they wrote themselves.

Once you can see the layers, three things happen at once. The choice becomes obvious for *your*
situation rather than in general. Every new tool that appears next year becomes **placeable** — you
read the pitch and say "ah, that's layer 4" in about ten seconds. And when a run misbehaves, you
know which layer to interrogate, which is the entire difference between debugging and flailing.

So let me say the uncomfortable part now, because it's why this lesson is shaped the way it is:

> **Every specific product name in this lesson will eventually be wrong. The six layers will not
> be.** Names churn on a roughly yearly cycle. Structure churns on a decade. Learn the structure;
> rent the names.

Everything below marked *as of this writing* (mid-2026) is a snapshot, not a recommendation.
`,
    },
    {
      type: 'text',
      md: md`
## Layer 1 — model and weights

**The problem it solves:** you need architecture code and a checkpoint, and you need them to agree
about every detail — layer shapes, rotary base, attention head grouping, the vocabulary, the
special tokens, the chat template. That agreement is not optional and it is not obvious; a single
mismatched detail produces a model that runs, emits fluent text, and is quietly wrong.

**As of this writing** the Hugging Face *transformers* ecosystem is the de facto layer: a config
file describing the architecture, safetensors weight shards, and a tokenizer with a chat template
travelling alongside. Nearly every tool in layers 2 through 5 speaks this format, which is why it
functions less like a library and more like a file format everyone agreed on.

**What goes wrong.** Two failures, both silent, both extremely common:

*Chat template mismatch.* You train with one prompt format and serve with another. The model at
inference sees framing it has never been trained on, and your carefully measured 6-point gain
evaporates. Nothing errors. The fix is a rule: **the exact string you train on is the exact string
you serve** — print one fully-rendered training example and one fully-rendered serving prompt and
diff them, character by character, before you build the dataset.

*Token surgery.* You add a special token, the embedding matrix grows by a row, and unless that row
is explicitly marked trainable *and* saved with your adapter, you ship a model whose new token
maps to noise. Layer 2 tools have a setting for this; it is off by default in most of them, because
most runs don't need it.

## Layer 2 — the training algorithm

**The problem it solves:** what the loop does and what it optimises. Supervised fine-tuning is
next-token cross-entropy (1.5) on your examples. Preference methods — DPO and its relatives — need
pairs and a different objective. Reinforcement-style methods such as GRPO need a sampler, a reward,
and a much more complicated loop. Same weights, entirely different machinery around them.

There's a sub-decision inside layer 2 that costs people real points: **which tokens the loss is
computed on.** Compute it over the whole sequence and you are also training the model to generate
the user's questions. Compute it on the response only — usually called completion-only or prompt
masking — and every gradient is spent on the behaviour you actually want. On a tiny dataset the
extra signal from prompt tokens occasionally helps; usually it dilutes. It is one config key, it is
rarely discussed, and the two settings give measurably different models.

**As of this writing** this layer has three flavours, and choosing between them is the real decision
of this lesson:

| flavour | examples (mid-2026) | you get | you pay |
|---|---|---|---|
| libraries | TRL, torchtune | the loop is visible Python you can read and modify | days of assembly; you own the plumbing |
| config-driven wrappers | Axolotl, LLaMA-Factory | a working run in an hour from a YAML | the mechanism is behind the YAML |
| speed-focused stacks | Unsloth | custom kernels, big single-GPU speedups | a narrower supported surface |

The honest tradeoff, stated plainly: **a wrapper gives you a working run in an hour and hides the
mechanism you will need at 2am. A raw library gives you control and costs you a week.** Neither is
the mature choice. The mature choice is to start with the wrapper *and then spend an hour mapping
every key in its config onto one of these six layers* — because a key you cannot place is precisely
the thing you will not be able to debug.

## Layer 3 — the distributed and memory backend

**The problem it solves:** 4.1's memory wall. Mixed-precision Adam holds 16 bytes per parameter —
2 for the bf16 weights, 2 for the gradients, and 12 for the fp32 master copy plus Adam's two moment
estimates. A full fine-tune of an 8B model is therefore 128 GB of permanent state before a single
activation, which does not fit on one card.

4.2 derived the fix and this layer sells it under product names. **DeepSpeed ZeRO** stages map
exactly onto the sharding you already know:

- **Stage 1** shards the *optimizer states* — the 12 heavy bytes.
- **Stage 2** additionally shards the *gradients*.
- **Stage 3** additionally shards the *parameters themselves*, so the whole 16 bytes/param bill
  divides by the number of GPUs — paid for with an all-gather before every layer, forward and
  backward.

**PyTorch FSDP** is the same idea in PyTorch's own vocabulary, and **Accelerate** is the glue that
lets a layer-2 library talk to either without knowing which. Recognising that these are one idea
under three brand names is worth more than memorising any of their config schemas. 4.2's deeper
point still governs: ZeRO/FSDP is not a new parallelism — it divides *storage*, not *computation*.

**What goes wrong.** Enabling ZeRO-3 for a single-GPU LoRA run: you pay communication machinery for
sharding across a group of one. Enabling CPU offload because a tutorial did: it rescues you from an
OOM at a brutal speed cost, and if you didn't need rescuing you've just made your run several times
slower for nothing. And the one people hit last: a stage-3 checkpoint is sharded, and something must
consolidate it before layer 5 can serve it.
`,
    },
    {
      type: 'text',
      md: md`
## Layer 4 — kernels

**The problem it solves:** 4.1's speed ladder. SRAM is enormously faster than HBM, HBM than NVLink,
NVLink than InfiniBand — and a GPU running a transformer spends much of its life waiting on memory
rather than doing arithmetic. A kernel that computes *the same mathematics while moving fewer
bytes* is free speed.

**FlashAttention** is the canonical one: identical softmax attention, computed tile by tile inside
SRAM so the sequence-by-sequence attention matrix never has to be written to HBM at all. Fused
optimizers do the AdamW update in one pass instead of half a dozen. Fused or chunked cross-entropy
kernels exist because of an arithmetic fact worth sitting with: with a 128,256-token vocabulary, a
micro-batch of 8 sequences of 2,048 tokens produces
$8 \times 2048 \times 128256 \approx 2.1 \times 10^{9}$ logits — **4.2 GB in bf16, and the same
again for their gradients**, for a tensor that exists only to be reduced to a single scalar. Fusing
the reduction into the projection means never materialising it.

Triton-based reimplementations are a growth area for exactly this reason: the kernel is where you
can be dramatically faster without being different. **Module 8 owns the mechanism**; what you owe
this layer today is the ability to *notice it*. When a new library promises "2× faster training,
identical results", that is a layer-4 claim, and the correct response is to verify the "identical"
half on a short run before believing the "2×" half.

**What goes wrong.** Almost always the same thing: the fast attention implementation isn't installed
or isn't compatible with your GPU, the library emits a *warning* and silently falls back to the
naive implementation, and your run is three times slower than the blog post promised. A warning is
not an error, and nobody reads warnings at 2am.

## Layer 5 — serving

**The problem it solves:** the trained checkpoint has to answer requests, at a price. 4.5 derived
the economics: continuous batching keeps the GPU fed by admitting new requests as old ones finish,
and PagedAttention stops the KV cache from fragmenting memory into uselessness. As of this writing
vLLM, SGLang and TGI are the usual names.

For this module there is one capability that matters more than all the rest: **serving many LoRA
adapters against one shared base**. Run the numbers, because they're startling. An 8B model in bf16
is 16 GB. A rank-16 adapter on the attention projections is about 13.6M parameters — **27 MB**. So
fifty customer-specific adapters cost you

$$16\ \text{GB} + 50 \times 27\ \text{MB} \approx 17.4\ \text{GB}$$

against $50 \times 16 = 800$ GB for fifty separately merged models. A 46× difference, and it fits on
one card with room for a KV cache. But the deeper win isn't memory at all: requests for *different*
adapters can sit in the *same* continuous batch, so per-customer behaviour costs you almost no
utilisation. Swapping a merged model per request would serialise your traffic by customer and
destroy the batching that 4.5 showed was the whole business model.

This layer should reach backwards and constrain layer 2: **pick the adapter format your serving
stack can load, and prove the round trip on day one** — train two steps on twenty examples, save,
load it in the actual server, generate one token. Five minutes. Toolchain problems are found in
that five minutes or in week three, and there is nothing in between.

## Layer 6 — tracking

**The problem it solves:** knowing what you did. Experiment logging (loss, learning rate, gradient
norm, throughput), config versioning, dataset versioning, checkpoint provenance.

This is the layer everyone skips because it feels like bureaucracy rather than engineering, so let
me argue it as engineering. Three weeks from now you will have eleven checkpoint directories and a
memory of one good result. **An unlogged run is an unrepeatable one** — which means it is not a
result, it is an anecdote. 6.6's whole discipline applies here in miniature: the thing that makes
work *research* rather than *fiddling* is that a second person, or a later you, can get the same
number again. And unrepeatability is not a distant risk; it is the default outcome of a busy week.

The practical test is one sentence long: *could a colleague reproduce this run from what's in the
repository, without messaging me?*

## The stack, on one page

| # | layer | solves | mechanism derived in | classic silent failure |
|---|---|---|---|---|
| 1 | model + weights | architecture, checkpoint, tokenizer, chat template | 3.1, 4.6 | train/serve template mismatch |
| 2 | training algorithm | the loop and the objective | 1.5, 5.4, 7.2 | loss computed on prompt tokens |
| 3 | distributed backend | the 16 bytes/param memory wall | 4.1, 4.2 | offload on when you didn't need it |
| 4 | kernels | fewer bytes moved, same math | 4.1, Module 8 | silent fallback to the slow path |
| 5 | serving | tokens per dollar, adapter swapping | 4.5 | adapter format the server can't load |
| 6 | tracking | repeatability | 6.6 | the good run, unreproducible |

Layers 2, 4 and 5 churn fastest in names. Layers 1, 3 and 6 churn slowest. **Every stack has all
six, whether or not it tells you** — a wrapper that never mentions layer 3 has still made a choice
for you at layer 3.
`,
    },
    {
      type: 'text',
      md: md`
## The knobs that actually matter

Every tutorial ends in a table of magic numbers. Tables of magic numbers are useless the moment
your situation differs from the author's, so here is each knob with the *reason* attached — the
reason is what transfers.

**Target modules.** Which weight matrices get an adapter. The conservative default is the four
attention projections (query, key, value, output). Adding the feed-forward matrices roughly triples
adapter capacity — for an 8B model at rank 16 that's about 13.6M trainable parameters (0.17% of the
model) versus about 42M (0.5%) with the FFN included. Reason to include them: 2.5 showed the FFN
holds roughly two-thirds of a transformer's parameters, so attention-only means most of the model
cannot move at all. Start attention-only for style and format work; add the FFN when you're
teaching something the base doesn't already know how to do.

**Rank and alpha.** 7.2 owns the derivation of *why* a low-rank update is the right shape.
Practically: rank 8–32 for format, tone, and schema compliance; 64–128 when the task is a genuinely
new skill or you have a hundred thousand examples. Alpha is commonly set to the rank or twice it —
and here is the trap: the update is scaled by $\alpha / r$, so **changing the rank with alpha fixed
silently changes your effective step size.** People compare rank 16 against rank 64, forget to
scale alpha, and conclude something about rank that was actually about learning rate.

**Learning rate.** As of this writing, LoRA runs typically want something around 1e-4 to 3e-4;
full fine-tuning wants 1e-5 to 2e-5. Roughly ten times larger — which is a strange enough fact that
it's the next ponder.

**Epochs.** One to three for most supervised fine-tuning. Beyond that you are inviting
memorisation, and memorisation shows up as a beautiful training curve and a worse model. With very
small datasets you may need more passes; that's precisely when you should be watching held-out loss
rather than trusting a rule.

**Batch size and gradient accumulation.** 1.6 established the equivalence: micro-batch times
accumulation steps times devices is your effective batch, and the gradient is mathematically the
same as one big batch — you paid for it in time instead of memory. Effective batches of 32 to 128
sequences are ordinary for task SFT. One caveat that bites: with packing turned on, "batch size in
sequences" stops meaning what you think, and *tokens per optimizer step* becomes the honest unit.

**Max sequence length.** The single biggest memory lever you have, because activation memory scales
with it (4.1). Set it from your data's length distribution — the 99th percentile, say — not from
the model's advertised maximum. Choosing 8,192 because the model supports 8,192, when your examples
are 400 tokens long, is how people buy an out-of-memory error they didn't need.

**Warmup ratio.** Three to ten percent of steps (1.6). Adam's moment estimates are garbage for the
first handful of steps, and taking full-size steps on garbage estimates is how runs blow up in the
first minute.

And the quiet one: **bf16, not fp16.** Same 16 bits, more of them spent on the exponent, and the
wider dynamic range is why bf16 runs don't produce the mysterious NaN at step 200 that fp16 runs
sometimes do (4.4).
`,
    },
    {
      type: 'ponder',
      question: md`Why does LoRA typically want a learning rate roughly *ten times larger* than full
fine-tuning? Both are gradient descent on the same loss, on the same model, with the same optimizer.
Something about the two situations must be fundamentally different. Recall from 7.2 how a LoRA
adapter is initialised, and reason from there before revealing.`,
      answer: md`**Start from the initialisation, because that's where the whole answer lives.** A
LoRA adapter writes the weight update as a product of two thin matrices,
$\Delta W = \frac{\alpha}{r} B A$, with $A$ random and **$B$ initialised to exactly zero**. So at
step 0 the update is not "small". It is *zero* — the model is bit-for-bit the base model. The
adapter must travel from **nothing** to a useful update.

Now contrast full fine-tuning. There, the parameters you're optimising already encode a good
solution: pretraining paid for them, and your job is to *nudge*. Small steps suffice, and large
steps are actively dangerous — they destroy exactly the pretrained structure you're trying to keep
(the alignment tax of 5.4 and 7.1). The caution is bought for a reason.

Three forces then push in the same direction:

1. **Travel distance.** Zero to useful, inside a run that is often only a few hundred optimizer
   steps. At 2e-5 that journey is glacial; you'd finish the data before the adapter finished
   arriving.
2. **Knob count.** The same behavioural change must be produced by moving about 14 million numbers
   instead of 8 billion — roughly **600× fewer knobs**. Each one has to move much further to carry
   the same effect.
3. **Nothing to break.** The base weights are *frozen*. The catastrophe that forces small steps in
   full fine-tuning — wrecking pretrained knowledge — simply cannot happen to weights you are not
   updating. You can afford to be aggressive because the downside that funds caution is absent.

**The honest caveats,** because "10×" is a starting range and not a law. The $\alpha / r$ scaling is
part of the effective step size, so comparing learning rates across different rank-and-alpha
settings is comparing different quantities. Too high still produces spikes and divergence — the
mechanism doesn't repeal 5.3. And on tiny datasets you can overfit long before travel distance was
ever the binding problem.

**The transferable habit:** when a recommended hyperparameter differs by an order of magnitude
between two settings, there is always a structural reason, and finding it is worth more than
memorising both numbers.`,
    },
    {
      type: 'text',
      md: md`
## Padding: the money you burn on nothing

Here is a piece of waste that is invisible in every dashboard and enormous in every invoice.

GPUs want rectangles. A batch is a stack of rows, all the same width, because that is what a matrix
multiplication is. But your training examples are not the same length — some are 80 tokens, some
are 1,400. So the standard move is to pick a maximum sequence length, and **pad** every shorter
example out to it with a filler token that is masked out of the loss.

Masked out of the loss, note. Not masked out of the *compute*. Those filler positions are pushed
through every layer, every matrix multiply, every attention head, at full price, to produce
activations that are then thrown away.

So: suppose your examples average 300 tokens and you've set a maximum length of 2,048.
`,
    },
    {
      type: 'ponder',
      question: md`Work this yourself before reading on. Examples average **300 tokens**; you pad
every one to a maximum length of **2,048**. (a) What fraction of the compute you pay for is spent
on padding? (b) *Sequence packing* concatenates several examples end to end until the window is
full, instead of padding — what throughput factor does that recover? (c) Hardest, and the one that
actually matters: packing has a trap that silently corrupts training while making every metric on
your screen look *better*. What is it?`,
      answer: md`**(a) The waste.** Useful fraction is $300/2048 = 0.1465$, so **about 85% of your
compute is spent on padding tokens.** Six out of every seven dollars, six out of every seven
minutes, six out of every seven GPU-hours — producing nothing. On a \$200 run, \$171 buys air.

**(b) What packing recovers.** Fill the 2,048-token window with real examples back to back and
useful occupancy goes from 14.6% to nearly 100% (a small remainder is lost at the end of each
window, typically a percent or two). The throughput factor is

$$\frac{2048}{300} \approx 6.8\times$$

Your 7-hour run becomes a 1-hour run, and nothing about the learning changed. That is the largest
single-config-key speedup available anywhere in this lesson, which is why the trap matters so much.

**(c) The trap: attention across the boundary.** If you glue five examples into one window and use
an ordinary causal mask, every token of example 5 can attend to examples 1 through 4. You are now
training the model to condition on **unrelated preceding text that will never be present at
inference**, where the context is one clean prompt. You are also teaching it that your format
appears at position 1,500 rather than position 0, because the position indices ran straight through
the boundary.

And here is why it's genuinely dangerous rather than merely wrong: **it is silent, and the loss
often goes *down*.** More preceding context makes tokens marginally more predictable, so the
training curve looks *healthier* than the unpacked run. Every instrument you'd normally use to
catch a problem moves in the reassuring direction. You find out at eval, if you're lucky, or in
production, if you're not.

**The fix** is a block-diagonal attention mask — each example may attend only to itself — plus
position indices that restart at each boundary. In practice this is exposed as variable-length
attention support (cumulative sequence lengths handed to a FlashAttention-style kernel), or as a
config flag with a name like document masking or example separation. **As of this writing, several
popular tools have shipped naive packing as a default or an easy-to-hit option at some point in
their history.** So: don't assume, check. Turn packing on, and in the same breath verify the mask.`,
    },
    {
      type: 'example',
      title: 'the padding bill, priced — and when the knob does not matter',
      md: md`
**Dataset A — chat-style SFT.** 20,000 examples averaging 300 tokens, maximum length 2,048.

Real tokens: $20{,}000 \times 300 = 6 \times 10^{6}$. Token slots paid for with padding:
$20{,}000 \times 2048 \approx 4.1 \times 10^{7}$. Efficiency **14.6%**, waste **85.4%**.

Cost it with 5.2's $C \approx 6ND$ on an 8B model at a sustained 125 TFLOP/s. Padded:
$6 \times 8\times10^{9} \times 4.1\times10^{7} \approx 2.0\times10^{18}$ FLOPs, about **4.4 hours**
per epoch. Packed: $6 \times 8\times10^{9} \times 6\times10^{6} \approx 2.9\times10^{17}$, about
**0.64 hours**. At \$2.50 an hour that is \$11 against \$1.60 — trivial money here, but the *same
6.8× factor* on a 400-GPU-hour job is the difference between a \$1,000 experiment and a \$150 one,
and more importantly between iterating twice a day and twice a week.

**Dataset B — long-document summarisation.** 20,000 examples averaging 1,600 tokens, same 2,048
maximum.

Efficiency $1600/2048 = 78\%$, waste **22%**, packing win only $2048/1600 = 1.28\times$. Real, but
now it's a tuning detail rather than a transformation — and it comes with the masking risk attached.
On dataset B, capping the maximum length correctly and getting your batch size right will buy you
more than packing will.

**The generalisable reading:** the value of packing is governed by the ratio of your maximum length
to your *mean* length. Plot your token-length histogram before you touch any config file (3.1 gave
you the tokenizer; the histogram takes four lines of code). That single plot sets your maximum
length, tells you whether packing is worth the risk, and predicts your out-of-memory failures — all
of which are otherwise discovered the expensive way.

**One honest caveat.** Many frameworks pad to the longest sequence *in the batch* rather than to the
global maximum, and length-sorted batching narrows the gap further. Both reduce the waste
considerably. But "considerably" is not "measurably", and the only way to know which regime you are
in is to log actual tokens-per-second and compare it against the arithmetic above. **Compute the
number you expect, then measure the number you get.** A factor of six hiding between them is
extremely common and completely invisible if you never do the subtraction.
`,
    },
    {
      type: 'example',
      title: 'a first run, end to end — 8B, LoRA r=16, 5,000 examples',
      md: md`
The configuration, with every line placed on its layer:

- **Layer 1.** An 8B instruct-tuned open base in bf16, **pinned to a specific repository revision**.
  Its own chat template, applied identically for training and serving.
- **Layer 2.** Supervised fine-tuning, loss on completion tokens only. LoRA rank 16, alpha 32,
  dropout 0.05, targeting the four attention projections — **13.6M trainable parameters, 0.17% of
  the model**. Two epochs. Maximum length 1,024 (the data's 99th percentile is about 900). Packing
  on, with document masking verified.
- **Layer 3.** One GPU. No ZeRO, no FSDP, no offload — there is nothing to shard, and switching
  them on would buy machinery instead of speed.
- **Layer 4.** FlashAttention-style attention, fused AdamW. Confirmed by reading the startup log
  for a fallback warning, not by assuming.
- **Layer 5.** Save the adapter, not a merged model, because the serving stack can load adapters and
  you may want several. Round trip proved on 20 examples before the real dataset existed.
- **Layer 6.** Config committed, run tagged with the commit hash, dataset file hashed, base revision
  recorded, library versions frozen into the run directory.

**The arithmetic, before pressing go.** 5,000 examples averaging 380 tokens, two epochs
$= 3.8 \times 10^{6}$ training tokens. Micro-batch 4 windows of 1,024 tokens, accumulation 8, one
device: **32,768 tokens per optimizer step**, so about **116 steps**. Compute
$6 \times 8\times10^{9} \times 3.8\times10^{6} \approx 1.8\times10^{17}$ FLOPs, about **24 minutes**
and roughly a dollar of GPU. Throughput should sit near
$1.25\times10^{14} / (6 \times 8\times10^{9}) \approx 2{,}600$ **tokens per second**; if it doesn't,
something in layer 4 is asleep.

Notice something in that arithmetic: unpacked, the same data would have been 312 steps rather than
116, seeing the same real tokens. **Your step count changed by 2.7× and the learning didn't change
at all** — which is why steps are a treacherous x-axis and tokens are the honest one.

Also notice that 116 optimizer steps is a *short* run. That's normal for task SFT, and it has a
consequence: the schedule barely gets to act, and every hyperparameter is high-variance. Before you
believe a one-point difference between two configs, run each three times with different seeds
(7.6 will make this argument properly).

**What healthy looks like** — 5.3's reading skills at small scale:

1. **Loss falls fast, then grinds.** From about 1.7 at step 0 (the base already half-speaks your
   format) down to roughly 1.15 within fifteen steps, then a slow decline to around 0.95 at the end.
   The fast part is the model discovering the format; the grind is the actual learning.
2. **Held-out loss tracks it down and flattens** — flattening is fine; *turning upward* is the
   signal.
3. **Gradient norm settles into a band and stays there.** Throughput steady. Both boring, both
   exactly what you want.

Log all four series from run one. Whatever tokens-per-second you see becomes your baseline, and a
later run at half of it is a bug, not weather. (5.3's MFU is the normalised version of the same
instrument, and worth logging for the same reason.)
`,
    },
    {
      type: 'example',
      title: 'the pathology gallery — five curves, five diagnoses',
      md: md`
**1. Loss dead flat from step 0.** Not falling, not rising, sitting at its initial value.

Two causes, and one costs nothing to distinguish. *Learning rate far too low* — usually because a
full-fine-tuning number like 2e-5 was pasted into a LoRA config (the ponder above explains exactly
why that is a hundred-fold error in effect, not a small one). Or, and this is the one that ruins
nights: **no adapter is attached at all.** The target-module names came from a blog post written for
a different architecture, matched nothing in this model's module tree, and depending on the library
version you got an exception, a warning, or complete silence.

*The cheapest diagnostic in this entire lesson:* **print the trainable parameter count before every
run.** For 8B at rank 16 on attention projections you expect about 13.6M, 0.17%. Zero means you are
training nothing. A number three times too small means only some projections matched. This takes one
line and catches a whole category of catastrophe. (Newer versions of the common adapter libraries do
raise on unmatched names — but "which version raises" is exactly the kind of fact that changes
between releases, which is why you verify by measurement rather than by version number.)

**2. Loss plunges toward zero.** Below about 0.1 and still falling.

The model is *memorising*, not learning. Real supervised fine-tuning loss floors somewhere around
0.5–1.0, because natural language retains genuine uncertainty even when the behaviour is nailed.
Near-zero means it has the answers token for token. Causes: too many epochs, too little data, or
near-duplicate examples. Fix: fewer epochs, more data, deduplicate (7.3), lower rank.

**3. Train loss falling, held-out loss rising.** The textbook picture, and it turns up in real
runs constantly.

Classic overfitting: the model is improving on *these* examples at the cost of everything else.
Fix: stop at the held-out minimum — keep that checkpoint, not the last one — and next time run
fewer epochs or gather more data. One nuance worth carrying: held-out *loss* can rise while the
actual task metric still improves, because loss punishes any wording other than your reference
whereas the task may not care. Which is 7.6's entire argument in one sentence: the loss is not the
evaluation.

**4. Loss spiking.** Sharp vertical excursions.

Two candidates. *Learning rate too high* — spikes appear early, recur, and the run degrades; lower
the learning rate, lengthen warmup. Or *a bad batch* — one pathological example (a wall of repeated
characters, a tokenization blow-up from 3.1, an encoding accident) producing an enormous gradient.
5.3's rule holds here: a spike that recovers is weather, a spike that doesn't is a diverged run,
restart from the last good checkpoint. The diagnostic that turns this from guesswork into forensics:
**log the example indices in every batch**, so when step 61 spikes you can go and *read* the four
examples in step 61. People almost never do this, and it takes one line.

**5. Out of memory at step 3 — not at step 0.** Which is the informative part.

Step 0 fitting means your model, gradients, and optimizer state fit. Step 3 failing means something
*varies*: a longer batch arrived, or the optimizer's state allocated lazily on the first update, or
allocator fragmentation crossed a threshold. Activation memory scales with sequence length (4.1), so
the usual culprit is a long example.

4.1's escape hatches, cheapest first: **cap the maximum sequence length** at your data's 99th
percentile — free, and usually sufficient; **turn on gradient checkpointing** — roughly 30% more
compute in exchange for a large drop in stored activations, the single best memory trade available;
**halve the micro-batch and double the accumulation**, which by 1.6's equivalence leaves your
effective batch and your gradient mathematically unchanged and costs only wall-clock; and **sort or
pack by length**, which makes memory use flat and predictable instead of a lottery.

Note the pattern across all five: **the diagnosis came from a logged series, not from staring at the
loss.** Trainable parameters, batch indices, per-step maximum length, peak memory, tokens per second.
Each is one line of logging. Each converts a mystery into a measurement, which is the only thing
that has ever made a 2am debugging session finish.
`,
    },
    {
      type: 'text',
      md: md`
## Choosing — a decision rule, not a recommendation

A recommendation expires. A rule keyed to *your situation* survives the names changing.

**One GPU, LoRA, and you want it working today.** Take a config-driven wrapper or a speed-focused
stack. You'll have a run inside an hour and that is genuinely the right call — nothing in this
lesson argues for building your own plumbing to fine-tune an 8B model on 5,000 examples. Then pay
the tax: spend a second hour placing every key in that config onto one of the six layers. Any key
you cannot place is a labelled hole in your understanding, sitting exactly where you'll need it.

**Multiple GPUs, full fine-tune, or a model too large to hold.** You need a first-class layer 3.
Choose the library with real, documented, tested FSDP or DeepSpeed support, and check *that*
before anything else about it — because layer 3 is where multi-GPU runs actually fail, and a
wrapper that hides layer 3 well is a wrapper that cannot help you when it fails.

**A research idea that changes the loss function or the sampling loop.** Write the loop yourself.
Every wrapper is built around an assumed objective, and the moment yours differs, the abstraction
that saved you a week begins costing you two — you'll spend it discovering which of forty config
keys secretly assumes the standard objective. Read a real library's training loop, then write your
own. For genuinely novel work this is *faster*, not slower.

**Many customers, per-customer behaviour.** Let layer 5 drive everything upstream. Pick the adapter
format your server loads, then choose layers 2 and 3 to produce it. Prove the round trip on day one.

And the meta-rule, which outlives every branch above:

> **Whichever you pick, do a five-minute end-to-end smoke run first.** Twenty examples, two steps,
> save the artefact, load it in the serving stack, generate one token. Toolchain problems surface in
> that five minutes or in week three. There is nothing in between, and week three is expensive.
`,
    },
    {
      type: 'ponder',
      question: md`A config-driven wrapper got your first run working in an hour, and that was the
right call. Now be concrete about the bill. Name a **specific** failure you could hit at 2am that
you will be unable to debug without knowing the layer beneath the config — not "something might
break", but an actual symptom, and the exact piece of layer knowledge that turns it from a mystery
into a two-minute fix. Then draw the conclusion about *learning order*: what does this imply about
when you should learn the layers, relative to when you use the wrapper?`,
      answer: md`Any of these qualifies, and all of them are ordinary Tuesday-night events:

**The flat-loss one.** You copied *target_modules* from a blog post written for a different
architecture. The names matched nothing in this model's module tree, zero adapters attached, and
your loss has been flat for four hundred steps. The wrapper printed a warning or nothing at all.
**Layer knowledge required:** that layer 2 attaches adapters by *name matching against layer 1's
module tree*. Once you know that, the fix is one line — print the trainable parameter count, see 0
instead of 13.6M, print the module names, correct the list. Without it you will change the learning
rate six times and lose the night.

**The silent-slowdown one.** Your run is 4× slower than advertised because the fast attention kernel
isn't installed for your GPU and the library fell back to the naive path, warning as it went.
**Layer knowledge required:** that layer 4 exists at all, and that its failure mode is a *warning*
rather than an error.

**The good-training-bad-serving one.** Loss curve beautiful, eval catastrophic, because the chat
template used at training doesn't match the one your server applies. **Layer knowledge required:**
that layer 1 owns the template and layer 5 applies its own — and that the fix is to diff two fully
rendered strings.

**The six-times-too-slow one.** Packing was off by default and your 300-token examples are padded to
2,048. **Layer knowledge required:** the padding arithmetic, which lives at layer 2.

**The mysterious-nondeterminism one.** The same config gives a different model three months later,
because the base repository was updated. **Layer knowledge required:** that layer 1 checkpoints have
revisions and that "latest" is not a version.

Notice the shape common to all five: **the wrapper hid a decision, the decision was wrong, and no
error was raised.** Config-driven tools are excellent at turning *your* wrong decisions into working
runs and terrible at telling you which decisions they made on your behalf.

**The conclusion about learning order** is not "don't use wrappers" — that would be silly, and
slower. It is this: **the layers are not something you learn *before* the wrapper; they are
something you must learn before the wrapper *fails*.** And the wrapper will fail on a deadline,
because that is when you are running things you haven't run before. So the practical rule is
sequencing: use the wrapper on day one to get a run, then on day two spend one hour walking the
config key by key and placing each on one of the six layers. Any key you cannot place is a labelled
hole in your understanding, sitting precisely where the next outage will be. That hour is the
cheapest insurance in this module — and unlike the outage, you get to schedule it.`,
    },
    {
      type: 'text',
      md: md`
## Reproducibility hygiene

Six things, none of which take more than a minute, all of which are the difference between a result
and an anecdote:

1. **Set the seed and record it.** And know the limit: some GPU kernels are nondeterministic by
   design, and forcing full determinism costs speed. Aim for *near*-reproducibility and record the
   seed so that "different" and "differently random" stay distinguishable.
2. **The entire config in version control**, with the commit hash logged into the run. Not the
   config you meant to run — the file that ran.
3. **Hash the dataset.** The exact file, plus its example count and total token count. "The dataset"
   is a moving object; a hash is not.
4. **Pin the base model revision.** Model repositories get silently updated — a fixed tokenizer, a
   corrected config, a re-uploaded shard. "We reran the identical config three months later and got
   a different model" is a real and confusing failure whose cause is always this, and whose cure is
   a pinned revision hash.
5. **Freeze library versions** into the run directory. Layers 2 and 4 change behaviour between minor
   releases more often than you would like.
6. **Log throughput.** Tokens per second, and MFU if you can (5.3). It is what lets you tell
   *slower* from *different* six weeks later.

The single test again, because it's the one that decides whether any of this happened: *could a
colleague reproduce this run from the repository, without messaging you?*

## What you now own

1. **The six layers** — model and weights, training algorithm, distributed backend, kernels,
   serving, tracking — with the problem each solves, the earlier lesson that derives its mechanism,
   and its characteristic silent failure. Every tool you meet from now on is a choice about which of
   these six it hides.
2. **The invariance claim, explicitly:** the names churn yearly, the layers don't. When a library
   you've never heard of appears, you place it on the stack first and evaluate it second.
3. **The wrapper tradeoff, honestly priced:** a working run in an hour and a hidden mechanism, or
   control at the cost of a week — plus the resolution, which is to start with the wrapper and spend
   the second hour mapping its config onto the layers.
4. **The knobs with reasons attached** — target modules against where the parameters live, rank and
   the $\alpha / r$ scaling trap, the roughly-ten-times learning rate and *why* the zero
   initialisation demands it, epochs against memorisation, effective batch as micro-batch times
   accumulation times devices, maximum length as your dominant memory lever.
5. **The padding arithmetic:** 300-token examples in a 2,048 window means 85% of your compute buys
   nothing, packing recovers about 6.8×, and naive packing corrupts training *while making your loss
   curve look better*.
6. **A pathology gallery with diagnoses** — flat loss, floor-zero loss, diverging held-out loss,
   spikes, and step-3 out-of-memory — and the deeper habit underneath it: each diagnosis came from a
   one-line logged series, because you cannot debug what you never measured.

Next lesson: your run finished, the loss went from 1.7 to 0.95, and you have a checkpoint. But the
loss falling is evidence that the model got better at predicting *your training set* — which is not
the same claim as *the model got better at your task*, and 7.1 already warned that an evaluation
which can only go up is a progress bar. **7.6 builds the measurement**: what to hold out, how many
examples before a difference is real, what a model-graded eval is worth, and the regression suite
that catches the capability you didn't mean to trade away.
`,
    },
  ],
  questions: [
    {
      id: 'm7-l5-q1',
      kind: 'mcq',
      prompt: md`Your LoRA run's training loss is dead flat at its initial value from step 0 through
step 400. What is the first thing to check?`,
      options: [
        'Too many epochs — the model has already memorised the dataset, so there is nothing left to learn',
        'The trainable parameter count — either the learning rate is far too low, or the target-module names matched nothing and no adapter is attached at all',
        'The batch size is too small; raise gradient accumulation until the curve smooths out',
        'The base model is already too strong for this task, so the loss has nowhere to go',
      ],
      answer: 1,
      explain: md`Flat **at a high value** and flat **near zero** are opposite diagnoses, and reading
which one you have is most of the work. Flat-high means no learning is occurring: either the step
size is negligible (a full-fine-tuning learning rate like 2e-5 pasted into a LoRA config — roughly a
hundred-fold error in effect) or, worse and more common, no adapter got attached because the target
module names came from a different architecture. Printing the trainable parameter count settles it
in one line: for 8B at rank 16 on attention projections you expect ~13.6M (0.17%); zero means you
are training nothing at all.

Option A describes flat *near zero*, the memorisation pathology. Option C confuses the *noisiness*
of a curve with its *slope* — accumulation smooths the wiggle and does not create descent. Option D
is self-refuting: a base model that already nailed the task would start at a **low** loss, not sit
flat at a high one.`,
    },
    {
      id: 'm7-l5-q2',
      kind: 'numeric',
      prompt: md`Your supervised fine-tuning examples average **300 tokens**. You train with a fixed
maximum sequence length of **2,048** and pad every example to it. What **percentage** of the token
slots you pay compute for is padding?`,
      answer: 85.4,
      tolerance: 3,
      explain: md`Useful fraction $= 300/2048 = 0.1465$, so padding is $1 - 0.1465 =$ **85.4%**. Six
of every seven GPU-hours produce nothing: the padding positions are masked out of the *loss*, not
out of the *compute*, so they traverse every layer at full price and their activations are then
discarded. Sequence packing concatenates examples to fill the window and recovers roughly
$2048/300 \approx 6.8\times$ throughput.

The honest caveat, worth carrying: many frameworks pad to the longest sequence *in the batch* rather
than to the global maximum, and length-sorted batching narrows it further — so your real waste may
be much lower. That is an argument for *measuring* tokens per second against the arithmetic, not for
assuming you're fine. A factor of six hiding in that gap is common and invisible unless you subtract.`,
    },
    {
      id: 'm7-l5-q3',
      kind: 'mcq',
      prompt: md`Your 8B **full** fine-tune runs out of memory on 4 GPUs with plain data parallelism.
You switch on ZeRO stage 3. In 4.2's vocabulary, what actually changed?`,
      options: [
        'The computation is now split four ways, so each GPU performs a quarter of the matrix multiplications',
        'Optimizer states, gradients, and parameters are each sharded across the four GPUs, dividing the 16 bytes/param bill by four — paid for with an all-gather before every layer',
        'The parameters are quantized to 4 bits, cutting the weight memory by four',
        'Activations are recomputed during the backward pass instead of being stored',
      ],
      answer: 1,
      explain: md`Stage 1 shards the optimizer states (the 12 heavy bytes of the 16), stage 2 adds
gradients, stage 3 adds the parameters themselves — so the full 16 bytes/param divides by the group
size, and 128 GB of 8B model state becomes 32 GB per card. The price is communication: parameters
must be gathered before each layer's forward and backward.

Option A is the single most common ZeRO misconception, and 4.2 addressed it directly — **ZeRO is
not a new parallelism.** Every GPU still runs the whole model on its own microbatch; only *storage*
is divided, which is exactly why it composes with tensor and pipeline parallelism rather than
competing with them. Option C describes quantization (4.4, and QLoRA) — a real memory technique
living at a different layer. Option D is gradient checkpointing (4.1) — also real, also a different
mechanism, and notably it trades *compute* for memory whereas ZeRO trades *communication* for it.`,
    },
    {
      id: 'm7-l5-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Starting from how a LoRA adapter is initialised, derive
why LoRA runs typically want a learning rate around ten times that of a full fine-tune. Your answer
must reason from the initialisation and from the parameter counts — citing "the recommended value is
2e-4" earns nothing. Then name one thing that would *break* your reasoning, i.e. a situation where
the factor of ten is the wrong guide.`,
      rubric: md`**The initialisation does the work.** LoRA writes the update as
$\Delta W = \frac{\alpha}{r} B A$ with $B$ initialised to **zero**. So at step 0 the update is not
small — it is exactly nothing, and the model is bit-for-bit the base. The adapter must travel from
zero to a useful update.

**The contrast.** Full fine-tuning optimises parameters that already encode a good solution; the
task is a nudge, and large steps destroy the pretrained structure you are paying to keep (the
alignment tax, 5.4 / 7.1). Small steps there are not timidity, they are the correct move.

**Three forces, all pointing the same way** (a strong answer has at least the first two):

1. *Travel distance.* Zero to useful, inside a run that may be only a few hundred optimizer steps.
   At 2e-5 the adapter would still be arriving when the data ran out.
2. *Knob count.* Roughly 14M trainable parameters versus 8B — about **600× fewer knobs** must
   produce the same behavioural change, so each must move much further.
3. *Nothing to break.* The base weights are frozen, so the catastrophe that funds caution in full
   fine-tuning cannot occur. Aggression is cheap here in a way it is not there.

**A named limitation** (any one, argued):

- The $\alpha / r$ scaling is *part of* the effective step size, so learning rates are not
  comparable across different rank-and-alpha settings — a "10×" claim is under-specified without
  them.
- Too high still diverges: spikes and instability (5.3) are not repealed by low-rank structure.
- On very small datasets you overfit long before travel distance was the binding constraint, so the
  right lever is epochs or data, not learning rate.

**Grading.** Full credit requires the zero-initialisation argument doing the real explanatory work,
at least one quantitative comparison (parameter counts or step counts), and a genuine limitation.
An answer that only asserts "LoRA has fewer parameters so it needs a bigger learning rate" is
*partial* — it skips the fact that makes the difference qualitative rather than quantitative.`,
    },
    {
      id: 'm7-l5-q5',
      kind: 'numeric',
      prompt: md`You want an **effective batch of 256 sequences**. You have **4 GPUs**, and the
largest micro-batch that fits on one GPU is **2**. How many **gradient accumulation steps** do you
need?`,
      answer: 32,
      tolerance: 0.5,
      explain: md`Effective batch $=$ micro-batch $\times$ accumulation $\times$ devices, so
$256 = 2 \times a \times 4$ and $a = $ **32**. By 1.6's equivalence, the resulting gradient is
mathematically the same as one batch of 256 — you paid for it in wall-clock instead of memory, which
is the trade every out-of-memory error is really offering you.

One bug this arithmetic hides, worth knowing because it is silent: the loss must be **divided by the
accumulation count** before the gradients are summed. If a library averages within each micro-batch
and then sums 32 of them without normalising, your effective learning rate is 32× what you set, and
the symptom is a run that diverges when you change *only* the accumulation. The check is cheap:
double the accumulation and halve the micro-batch, and the loss curve's *shape* should be
essentially unchanged.`,
    },
    {
      id: 'm7-l5-q6',
      kind: 'written',
      prompt: md`**Place the layers.** A colleague sends you a 40-line YAML and says their run is
**four times slower** than the blog post they copied it from. Without seeing the file: list the six
layers of the stack, and for each give one config key or setting you'd expect to find there, what it
controls, and the most likely way it silently costs you a large multiple of speed. Then say which
layer you'd check first, and why.`,
      rubric: md`**The six layers, with a plausible key and a silent-slowdown mechanism each:**

1. **Model + weights** — base model id, revision, dtype, tokenizer/chat template. Slowdown: loaded
   in fp32 rather than bf16 (double the memory traffic), or a larger model than intended.
2. **Training algorithm** — objective (SFT/DPO), packing on/off, maximum sequence length,
   completion-only loss, epochs. Slowdown: **packing off with short examples**, which is the 6.8×
   padding bill; or a maximum length set to the model's maximum rather than the data's.
3. **Distributed backend** — ZeRO stage or FSDP settings, CPU/NVMe offload. Slowdown: offload
   enabled when it wasn't needed (severe), or ZeRO-3 on a single GPU paying communication for a
   group of one.
4. **Kernels** — attention implementation, fused optimizer, fused loss. Slowdown: the fast attention
   kernel isn't installed or isn't supported on the GPU, so the library **warns and silently falls
   back** to the naive path.
5. **Serving** — adapter save format, merge settings. Correctly noted as *largely absent from a
   training config* — credit for recognising the layers are roles, not files, and that the export
   settings are its only foothold here.
6. **Tracking** — logging backend, run name, checkpoint save frequency. Slowdown: checkpointing
   every N steps writing many gigabytes each time.

**First check and why:** layer 2 (packing and maximum sequence length), then layer 4 (attention
implementation). Both produce *clean multiplicative* slowdowns rather than percentage ones, both
fail silently, and both are one config key. The diagnostic that makes it a measurement rather than a
guess: **log tokens per second** and compare against the $C \approx 6ND$ arithmetic, or against MFU
(5.3). Any answer that says "check the logs for a fallback warning" and "compute expected throughput
and subtract" is doing the right thing.

**Grading.** Full credit: all six layers named with a plausible key each, at least three concrete
*silent* slowdown mechanisms, and a first-check justified by the multiplicative-and-silent argument
rather than by hunch. Listing the layers without the silent-failure reasoning is partial.`,
    },
    {
      id: 'm7-l5-q7',
      kind: 'mcq',
      prompt: md`You enable sequence packing. Throughput jumps about 6×, and the training loss curve
looks *slightly better* than the unpacked run. What must you verify before trusting the result?`,
      options: [
        'Nothing — higher throughput with a lower loss is exactly the outcome you wanted',
        'That attention is block-diagonal across packed boundaries and position indices restart per example — otherwise each example is conditioning on unrelated preceding text that will never exist at inference',
        'That the maximum sequence length was raised to compensate for the packing',
        'That the learning rate was raised in proportion to the throughput gain',
      ],
      answer: 1,
      explain: md`Naive packing lets example 5 attend to examples 1 through 4 through an ordinary
causal mask. You are then training the model to expect unrelated preceding context that a real
request will never contain — and to expect your format at position 1,500 rather than position 0, if
the position indices ran straight through.

The detail that makes this the *most* dangerous item in the lesson is stated in the question stem:
**the loss goes down.** Extra preceding context makes tokens marginally more predictable, so the
instrument you would normally use to detect a problem moves reassuringly. Option A is the trap
working exactly as designed.

Option C inverts the point — packing exists so you can *stop* wasting a long window, not so you can
lengthen it. Option D is the most interesting distractor because it is adjacent to something true:
packing genuinely does change tokens-per-optimizer-step (in the worked run, 312 steps became 116),
so your effective batch **in tokens** did change and is worth revisiting. But that is a batch-size
question, not a proportional-to-throughput learning-rate rule, and it is second in line behind the
mask.`,
    },
    {
      id: 'm7-l5-q8',
      kind: 'numeric',
      prompt: md`**Fermi.** A LoRA fine-tune of an **8B** model on **20,000 examples averaging 400
tokens**, for **2 epochs**. Use $C \approx 6ND$ (forward and backward still traverse the full frozen
model) with a GPU sustaining ~125 TFLOP/s. Roughly how many **hours** does the run take? Estimate on
paper; the tolerance is generous, and the point is the order of magnitude.`,
      answer: 1.7,
      tolerance: 1.2,
      explain: md`Tokens: $20{,}000 \times 400 \times 2 = 1.6\times10^{7}$. Compute:
$C \approx 6 \times 8\times10^{9} \times 1.6\times10^{7} \approx 7.7\times10^{17}$ FLOPs. Divide by
$1.25\times10^{14}$ FLOP/s: about $6{,}100$ seconds, or **1.7 hours** — a few dollars of rented GPU.

Two refinements worth knowing, neither of which changes the order of magnitude. LoRA's backward pass
skips computing weight gradients for the frozen base (it still needs gradients *through* it), so the
true constant sits somewhere between $4ND$ and $6ND$ — using 6 makes your estimate conservative,
which is the right direction for a plan. And if your examples are padded rather than packed, $D$ is
the *padded* token count, which as question 2 showed can be six times larger — the arithmetic is
only as honest as the $D$ you feed it.

**The point, which is 7.1's economics again:** the compute for a serious task-specific fine-tune is
a couple of hours and a few dollars. It is a rounding error against the two to three weeks of human
time the dataset costs. Nobody should ever choose a toolchain to save the four dollars; you choose it
to save the debugging week.`,
    },
    {
      id: 'm7-l5-q9',
      kind: 'written',
      prompt: md`**Triage three runs.** For each: the most likely cause, the *cheapest diagnostic
that would confirm it* (a measurement, not a guess), and the fix. (a) Training loss falls steadily
from 1.9 to 0.35 while held-out loss bottoms out around step 90 and climbs from there. (b) The run
trains normally for forty minutes, then dies with an out-of-memory error. (c) In a 2-epoch run of
312 total steps, the loss drops sharply at step 157 and continues lower.`,
      rubric: md`**(a) Overfitting.** Cause: the model is improving on these specific examples at the
cost of generalisation. Diagnostic: you already have it — the held-out curve *is* the measurement;
strengthen it by checking for near-duplicates between train and held-out (a contamination check, 5.6
/ 7.3). Fix: keep the **step-90 checkpoint**, not the final one; then fewer epochs, more data, lower
rank, or general data mixed in (7.1's regression point). Credit for the nuance that held-out *loss*
can rise while the actual task metric still improves, because loss punishes any wording but the
reference — so confirm against the task metric (7.6) before discarding a checkpoint.

**(b) Memory that varies with the batch.** Cause: step 0 fitting proves the model, gradients, and
optimizer state fit; failing at forty minutes proves something *varies* — almost always a long
example arriving, with lazy optimizer-state allocation and allocator fragmentation as secondary
suspects. Diagnostic: **log per-step maximum sequence length and peak allocated memory**, then look
at the failing step's batch; plot the token-length histogram of the dataset. Fix, cheapest first
(4.1): cap maximum length at the 99th percentile; enable gradient checkpointing (~30% more compute
for a large activation saving); halve the micro-batch and double accumulation, which by 1.6 leaves
the effective batch and the gradient unchanged; sort or pack by length so memory is flat rather than
a lottery.

**(c) The epoch boundary.** The arithmetic must actually be done: $312/2 = 156$, so step 157 is the
first step of epoch 2. A discontinuous drop exactly there is the model **recognising data it has
already seen** — memorisation beginning, not learning continuing. Diagnostic: compare held-out loss
at the same step; a train drop with flat or rising held-out loss confirms it. Fix: one epoch, or
more data. The generalisable habit: be suspicious of any improvement that arrives exactly at an
epoch boundary.

**Grading.** Full credit requires the correct cause for all three, a diagnostic in each case that is
a *logged measurement* rather than an intuition, and the epoch arithmetic explicitly performed in
(c). Naming (c) as "overfitting" without locating the boundary is partial — the boundary is what
makes the diagnosis certain instead of plausible.`,
    },
    {
      id: 'm7-l5-q10',
      kind: 'mcq',
      prompt: md`You have 50 customer-specific LoRA adapters (rank 16, attention projections) over
one 8B base. Why can a modern serving stack host all 50 on a single 80 GB GPU?`,
      options: [
        'Because the adapters are quantized to 4 bits when loaded for serving',
        'Because all 50 share one 16 GB copy of the base and each adapter is only ~27 MB, so the total is under 18 GB — against 800 GB for 50 separately merged models',
        'Because only one adapter is resident at a time and the other 49 wait on disk, swapped in per request',
        'Because LoRA adapters are applied on the CPU and never need to occupy GPU memory',
      ],
      answer: 1,
      explain: md`$16\ \text{GB} + 50 \times 27\ \text{MB} \approx 17.4$ GB against
$50 \times 16 = 800$ GB — a 46× difference, with room left for a KV cache. But the memory is only
half the story, and the other half is 4.5's actual economics: because the base is shared, requests
for **different** adapters can sit in the **same continuous batch**, so per-customer behaviour costs
you almost no GPU utilisation.

Option C is the genuinely tempting one, because it describes a real architecture — the one you get
if you merge each adapter into its own model. It works, and it is much worse: swapping per request
serialises your traffic by customer and destroys the continuous batching that made serving
affordable in the first place. Option A confuses layers (quantization is 4.4, and it applies to the
base far more usefully than to a 27 MB adapter). Option D is simply false — the adapter multiplies
into the forward pass and lives on the GPU.`,
    },
    {
      id: 'm7-l5-q11',
      kind: 'numeric',
      prompt: md`A **full** fine-tune of an **8B** model with mixed-precision Adam, sharded with
**ZeRO-3 across 4 GPUs**. How many **GB** of permanent model state does each GPU hold? (Use 4.1's
16 bytes per parameter; ignore activations.)`,
      answer: 32,
      tolerance: 2,
      explain: md`$16 \times 8\times10^{9} = 128$ GB of total state (2 bytes bf16 weights + 2 bytes
gradients + 12 bytes fp32 master and Adam's two moments). ZeRO-3 shards all three categories across
the group, so each of 4 GPUs holds $128/4 =$ **32 GB** — comfortable on an 80 GB card, leaving
plenty for activations. That is why an 8B full fine-tune on 4 cards is routine while a 70B one is
not: $16 \times 70 = 1120$ GB, and $1120/4 = 280$ GB per card, hopelessly over.

Now put the LoRA alternative beside it, because the contrast is the reason Module 7 exists. Frozen
base at 2 bytes/param $= 16$ GB, gradients only for ~13.6M adapter parameters ($\approx 27$ MB), and
Adam state on those same 13.6M ($\approx 164$ MB). Call it **16.2 GB on one GPU** — no sharding, no
all-gathers, no consolidation step before serving. Four GPUs at 32 GB each versus one GPU at 16 GB,
for the same 8B model. That entire gap is layer 3 disappearing from your problem.`,
    },
    {
      id: 'm7-l5-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old.** A kid looks over your shoulder and asks why the
computer "wasted 85% of its work". Explain, using an analogy you invent (lunchboxes, shipping boxes,
bus seats, egg cartons — inventing a better one is worth more): (1) why the training program insists
every example be the same length; (2) why that wastes so much; (3) what packing does about it; (4)
why the packed examples must not be allowed to *see* each other, and what goes wrong if they can.
No jargon without a kid-level explanation first.`,
      rubric: md`There is no single right script; grade the **teaching**. A "nailed it" answer must:

1. **Explain the sameness requirement concretely.** The computer does its work in big rectangles —
   a stack of rows that all have to be the same width, like a sheet of identical boxes — so a short
   example gets filled up with "nothing" until it reaches the right width. Any analogy that makes
   *fixed-size containers* feel inevitable works: shipping containers, bus seats, egg cartons.
2. **Make the waste vivid with the actual ratio.** If the row is 2,048 wide and your sentences are
   about 300 long, roughly **six out of every seven** slots are filler — and the computer works just
   as hard on filler as on real words, and you pay just as much. Full credit wants the ratio, not
   just the word "wasteful".
3. **Explain packing as the obvious fix.** Put several real examples into the same row, one after
   another, until the row is genuinely full. Same rectangle, same cost, about seven times as much
   real learning.
4. **Explain the wall, and why leaving it out is worse than it sounds.** Glue them together
   carelessly and while the computer reads the third example it can still see the first two — so it
   learns to expect a pile of unrelated stuff in front of every question, which will never be there
   when someone actually uses it. So you build dividers: each example may look only at itself. The
   kid should also get *why this is sneaky* — the practice scores look **better**, not worse, so
   nothing warns you. An analogy that carries the wall naturally (a lunchbox with dividers, one long
   table with screens between readers) is worth extra.
5. **Jargon audit.** "Token", "sequence length", "padding", "batch", "attention mask", "throughput"
   used without a kid-level translation first = **partial at best**. This is the specific failure
   the exercise exists to catch: hiding an unexplained word is not explaining, and if you cannot
   reach the idea without the word, you do not yet own the idea.`,
    },
  ],
}
