// Module 6, Lesson 5 — Reading the literature (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm6-l5',
  title: '6.5 Reading the literature — signal from a firehose',
  subtitle:
    'Every researcher who seems well-read is in fact well-filtered — the arithmetic leaves no other option. This lesson teaches the two skills hiding under that word: triage, and a specific kind of skepticism you can now run using nothing but the thirty-four lessons behind you.',
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Roughly **500 machine-learning papers hit arXiv every weekday**. Call it a hundred thousand a year,
and that is a conservative count — the number has been climbing for a decade.

Now do the reading. Thirty minutes a paper is not generous; it is barely enough to understand what
was claimed. A hundred thousand papers at half an hour each:

$$100{,}000 \text{ papers} \times 0.5 \text{ hours} = 50{,}000 \text{ hours}$$

And a year contains

$$365 \times 24 = 8{,}760 \text{ hours.}$$

Not 8,760 *working* hours. 8,760 hours **total** — sleeping, eating, and all. Reading the field is
not merely hard, the way lifting a heavy thing is hard. It is **arithmetically impossible**, off by
a factor of six, for a person who does nothing else and never sleeps.

So sit with the obvious corollary, because it changes how you should feel in a seminar room:

> Every researcher you have ever admired for being well-read is not well-read. They are
> **well-filtered**. They have read a tiny, deliberately chosen slice, and they have a method for
> choosing it.

That method is not a personality trait. It is two learnable skills — **triage** (deciding fast what
deserves your hours) and **structured skepticism** (deciding what a paper has actually established).
The second one is the reason this lesson comes at the end of the core curriculum rather than the
beginning: you cannot evaluate a claim about KV-cache throughput, compute-optimal training, or
monosemantic features until you own the machinery those claims are made of. You now do. This lesson
turns thirty-four lessons of knowledge into a working instrument.
`,
    },
    {
      type: 'ponder',
      question: md`Before reading on, do the arithmetic yourself and derive your own policy — this
is the whole lesson in miniature. Suppose you can protect **5 hours a week, 50 weeks a year** for
reading. (Be honest: that is already a lot, and more than most working researchers manage.) A pass-1
skim costs 5 minutes, a real read costs 30 minutes, and a full reconstruct-it read costs about 4
hours. Question: what is the *most papers you could possibly touch* in a year, and what allocation
across those three depths would you actually choose? Write down actual numbers before revealing.`,
      answer: md`**The budget:** $5 \times 50 = 250$ hours per year $= 15{,}000$ minutes.

**The ceiling:** spend it all on 5-minute skims and you touch $15{,}000/5 = 3{,}000$ papers — about
**3%** of the year's output. That is the absolute best case, and it buys you nothing but titles.
Spend it all on 30-minute reads and you get 500 papers, or **0.5%** of the field.

**A defensible allocation** (yours may differ; having *an* explicit one is the point):

| depth | papers | hours |
|---|---|---|
| pass 1 — skim | 1,500 | 125 |
| pass 2 — real read | 150 | 75 |
| pass 3 — reconstruct | 12 | 48 |
| | | **248** |

Stare at the bottom row. **Twelve papers a year** get your full attention. Twelve. That number is
not a confession of laziness — it falls out of division. And it forces the design of everything
else: since pass 3 is rationed to roughly one paper a month, your pass-1 filter has to be *ruthless
and cheap*, and it has to be **wrong in the right direction** (better to skim something that
deserved depth than to sink four hours into something that deserved five minutes — the second error
costs 48 times more).

Notice what you just did. You did not decide how to read; you computed a constraint and let the
constraint dictate the strategy. That move — *put numbers on the situation before choosing a
policy* — is the same move that produced Chinchilla (5.2) and the batching argument in 4.5. It is
the researcher's reflex, applied to your own calendar.`,
    },
    {
      type: 'text',
      md: md`
## The triage: three passes, and permission to stop

The three-pass method is old folklore among researchers, and it survives because the arithmetic
above forces it. Each pass is a **decision procedure with an exit**, not a stage of reading.

**Pass 1 — five minutes.** Title, abstract, section headings, every figure, the conclusion. You are
answering exactly two questions:

1. **What is the CLAIM?** Not the topic — the claim. "Attention is all you need" is a claim.
   "Investigating attention mechanisms" is a topic, and a topic is often a warning sign.
2. **What TYPE of evidence backs it?** A benchmark table? A controlled ablation? A theorem? A
   causal intervention? A vibes-based collection of chat transcripts? The type of evidence tells
   you the *maximum* strength the paper could possibly have, before you check whether it achieved
   it.

Then a third question, which is the exit: **is this on a path I care about?** If not, stop. You are
allowed to stop. Ninety percent of pass-1 reads should end at pass 1.

**Pass 2 — thirty minutes.** Method and experiments, carefully; skip proofs. The governing question
is not "do I believe this?" but the sharper:

> **Would this convince a hostile expert?**

Imagine the referee who wants the paper to be wrong — not a troll, a competent rival — and ask what
they would attack first. Then find the delta: **what is the actual improvement over the actual
baseline, and is that gap load-bearing for the paper's story?** A paper whose headline is a 2-point
gain has staked everything on 2 points being real. That is a fact about the paper's fragility, and
you can see it in thirty minutes.

**Pass 3 — hours.** You reconstruct the paper. Could you reimplement the core idea from the text
alone? Do the numbers in the tables cohere with each other and with what you know from Modules 4
and 5 — parameter counts, FLOP budgets, memory footprints, throughput? Pass 3 is where you find
the errors, and also where you find your own next project, because reconstructing something is how
you discover the assumption nobody checked.

**Say the ratio out loud, because people find it shocking:** most papers deserve five minutes, a few
deserve thirty, and roughly one a month deserves an afternoon. That is not arrogance. It is
division. Arrogance would be pretending you read them all.
`,
    },
    {
      type: 'text',
      md: md`
## The skeptic's checklist — which is just your curriculum, pointed at a PDF

Here is the good news you have earned. Every item below is a question you can now answer *because a
specific lesson taught you the machinery*. Run these in roughly this order; the early ones kill more
papers than the late ones.

**1. BASELINES — the single most common failure mode in the entire literature.** Was the baseline
tuned as hard as the proposed method? The authors spent six months on their idea and an afternoon on
the comparison. Learning rate, schedule, warmup, weight decay (1.6) — all of it swept for the new
method, defaults for the old one. An untuned baseline **manufactures improvement out of nothing**,
and it does so invisibly, because nothing in the paper looks wrong. When a reported gain evaporates
on replication, this is the usual reason. Look for evidence the authors tried to beat their own
method: a sweep over the baseline's hyperparameters, a citation to the baseline's own best reported
number, an admission that they tuned both equally.

**2. COMPUTE-MATCHED comparison (5.2).** Is the new method better, or merely *bigger and trained
longer*? Scaling laws mean **more compute always helps**, so any comparison at unequal compute is
uninterpretable — you cannot separate "the idea works" from "we spent more." Check three numbers:
parameters, tokens, and training FLOPs ($C \approx 6ND$). If the new method saw twice the tokens,
you are not reading an architecture result; you are reading a data result wearing an architecture's
clothes. This check alone dissolves an enormous fraction of "we beat the transformer" claims.

**3. ABLATIONS (5.3's culture).** The paper proposes five changes bundled as a Method. Which one did
the work? Without an ablation table you have learned *nothing* about mechanism — only that the
bundle beats the baseline, which might be true because of one component and *despite* the other
four. And a subtlety you own from 6.2: **ablation results themselves can mislead.** Backup heads
mean a component can be genuinely load-bearing and still show a small ablation effect, because
something else compensates when it is removed. Ablation measures *counterfactual necessity in the
presence of a compensating system*, not importance. Treat a null ablation as a question, not an
answer.

**4. EVALUATION and CONTAMINATION (5.6, 5.1).** Which benchmarks, and how old are they? A benchmark
that has been public for four years has been scraped into everyone's pretraining corpus, and its
scores measure a blend of capability and memorization. Did the authors check contamination —
n-gram overlap against the training set, or better, performance on *freshly written* variants? Is
the benchmark saturated (everyone at 90%+, so the remaining 10% is mostly label noise)? A paper that
reports only aged benchmarks and never mentions contamination has not been careless — it has told
you where it did not look.

**5. VARIANCE and error bars (5.6's binomial arithmetic).** You can now do this in your head. For a
benchmark of $n$ questions at accuracy $p$, the standard error is $\sqrt{p(1-p)/n}$; comparing two
models, the SE of the *difference* is roughly $\sqrt{2}$ times that. On a 500-question benchmark at
80%, one SE is about 1.8 points and the difference SE is about 2.5 points — so **a 2-point gap is
noise**. Meanwhile a single training seed is an anecdote: run-to-run variance from initialization
and data order routinely moves downstream benchmark scores by more than the effects people publish.
"Best of 3 seeds" for the method and 1 seed for the baseline is not a comparison; it is a selection.

**6. CHERRY-PICKING.** Are the qualitative examples chosen, and chosen how? "We show representative
outputs" means nothing unless there is a procedure — random sample, fixed prompts, released
transcripts. And ask the shape-of-the-paper question: **is there a failure-case section?** Its
absence is itself data. Every real method fails somewhere; a paper that has not found where is a
paper that has not looked, and you now know something about the authors' epistemics that the results
table did not tell you.

**7. SCALE GENERALIZATION.** The result is demonstrated at 125M parameters. Does the *mechanism*
have any reason to survive at 70B? Sometimes yes, with an argument. Often no — and often the effect
is one that big models get for free, so the method is measuring the small model's deficiency rather
than the method's power. Efficiency tricks that help a small model can vanish or invert at scale;
so can architectural gains that were really just regularization. Demand the argument, or at least a
trend across three sizes so the curve can be extrapolated rather than asserted.

**8. INCENTIVES.** Who benefits from this result being true? A lab announcing that its own model
family leads, a startup whose method is its product, a group whose grant depends on the direction —
none of these make a result false, and cynicism is not a method. But incentives predict *where the
framing will outrun the evidence*: in the abstract's verbs, in the choice of which baseline to
include, in which ablation was run and which was not. The concrete test is a comparison you can
actually make: **does the abstract claim more than the results section supports?** Read them
against each other. The gap between them is the most reliably informative object in the paper.
`,
    },
    {
      type: 'ponder',
      question: md`Apply it. A paper claims a **new architecture beats a transformer baseline by 3%
on one benchmark**, at 125M parameters, with one seed and no ablation table. List, in priority
order, the checks that could change your mind — and then commit to an answer: **which single missing
item most weakens the claim?**`,
      answer: md`**Priority order** (roughly: cheapest checks that could kill the result outright,
first):

1. **Compute-matched?** Parameters, tokens, and training FLOPs for both arms. If the new
   architecture saw more tokens or more steps, the comparison establishes nothing about
   architecture. This is checkable in sixty seconds from the training table.
2. **Was the baseline tuned?** Look for a hyperparameter sweep on the transformer, or a comparison
   against the transformer's own best published number at that scale. A transformer trained with
   the *new* method's hyperparameters is a strawman.
3. **Is 3% outside the noise?** One benchmark, one seed. Compute $\sqrt{p(1-p)/n}$; if the
   benchmark has a few hundred items, 3 points may be near 1 SE of the difference. And one seed
   gives you no estimate of run-to-run variance at all.
4. **One benchmark?** A single benchmark invites selection — if they ran eight and reported one,
   3% is what a null effect looks like after cherry-picking. Ask for the full suite.
5. **No ablation.** With no ablation you cannot tell which of the architecture's changes matters,
   so even if the gain is real, the paper's *explanation* of it is unsupported.
6. **125M only.** No trend across sizes means no basis for believing the effect survives — and
   small-scale architecture wins have a long, sad history of vanishing at scale.
7. **Contamination / benchmark age**, and finally **incentives** — read the abstract against the
   results table.

**The single most damaging omission: the compute match, closely followed by baseline tuning.**
Here is why those two rank above the others. Every remaining item makes the result *uncertain*;
these two make it **uninterpretable**. If the arms differ in compute, there is no experiment here
at all — no quantity was held fixed, so the difference has no owner. Same with an untuned baseline:
you have measured the gap between six months of tuning and an afternoon of it, which is a real gap
about *effort*, not about architecture. Noise, seeds, and scale are questions about how much to
believe a measurement; compute-matching and baseline tuning are questions about whether a
measurement was made.

Personal habit worth forming: when you catch yourself excited by a result, the excitement is the
signal to go check the training table for token counts. Enthusiasm is the moment your skepticism is
cheapest to skip and most valuable to run.`,
    },
    {
      type: 'example',
      title: 'reading a real paper with the curriculum in hand',
      md: md`
Let's prove the claim that you can now decode a frontier paper. Here is a composite — a plausible
open-model release, of the kind that appears every few weeks. Only the tables are shown. Watch how
much each one gives up.

**Table 1 — architecture (decode with 2.6, 4.6):**

| field | value |
|---|---|
| layers | 32 |
| $d_{\text{model}}$ | 4096 |
| attention heads | 32 |
| KV heads | 8 (grouped-query) |
| FFN hidden | 14,336 (SwiGLU) |
| vocab | 128,000 |
| context | 8,192, RoPE |

Audit it, exactly as in 2.6. Attention per layer: $W_Q$ and $W_O$ are $4096 \times 4096 = 16.8$M
each; with 8 KV heads of width 128 the K and V projections are $4096 \times 1024 = 4.2$M each. Total
**41.9M**. FFN with SwiGLU is three matrices of $4096 \times 14{,}336$: $3 \times 58.7 = $ **176.2M**.
Per layer **218M**, times 32 layers $=$ **6.98B**. Embeddings $128{,}000 \times 4096 = 0.52$B, plus
an untied output head, another $0.52$B. Grand total **8.03B** — the name checks out, and you just
verified a frontier model's parameter count from seven numbers with arithmetic you did in Module 2.

The 8 KV heads are not decoration. From 3.3: full multi-head KV cache costs
$2 \times 4096 \times 32 \text{ layers} \times 2 \text{ bytes} = 512$ KB per token; with GQA it is
128 KB — a **4× cut**, which at 8,192 context is 4 GB versus 1 GB per sequence. On an 80 GB GPU
holding 16 GB of bf16 weights, that is the difference between about 16 and about 64 full-length
sequences in flight — and (4.5) bigger batches share each weight read across more users, which cuts
the cost per token substantially (not a full 4×, because the cache reads still grow with batch). One row in the architecture table, four numbers downstream.

**Table 2 — training setup (decode with 5.2, 5.3):**

| field | value |
|---|---|
| tokens | 2.4T |
| baseline (same family) tokens | 1.4T |
| optimizer | AdamW, cosine to 10%, 2k warmup |
| hardware | 1,024 GPUs, 4 days |

Two moves. First, compute: $C \approx 6ND = 6 \times 8.0\text{e}9 \times 2.4\text{e}12 \approx
1.2 \times 10^{23}$ FLOPs. Cross-check it against the hardware — 1,024 GPUs for 4 days is
$3.5 \times 10^8$ GPU-seconds; at a peak near $10^{15}$ FLOP/s that is $3.5 \times 10^{23}$ peak
FLOPs, so the run implies about **33% MFU**. Plausible (4.2 says 30–50% is the real-world band). Had
the table said "1,024 GPUs, 1 day," the implied MFU would exceed 100% and *something in the paper is
wrong* — a table you can falsify with one division.

Second, and far more important: **the baseline saw 1.4T tokens and the new model saw 2.4T.** Every
comparison in this paper is confounded. Not fatally dishonest — the model may well be better — but
the *architecture* claim has no support, because the arms are not compute-matched. This is the
number I would check first in the entire paper.

**Table 3 — efficiency (decode with 3.4, 4.4):**

> "2.1× higher throughput than the baseline at batch 64."

Read the footnote before the number. If the new model is served in FP8 and the baseline in BF16,
this is a **quantization** result (4.4), not a model result — and you could apply the same
quantization to the baseline. If both are BF16, then GQA's 4× smaller KV cache is doing the work
(3.3/3.4), which is real and attributable. "Throughput" without batch size, precision, sequence
length, and hardware named is not a measurement; it is a mood.

**Table 4 — evaluation (decode with 5.6):**

> MMLU 68.2 vs baseline 64.8.

Is 3.4 points real? MMLU has about 14,000 questions, so $\text{SE} = \sqrt{0.68 \times 0.32/14{,}000}
\approx 0.4$ points and the difference SE is about 0.6 — the gap is roughly **6 SE**. Statistically
solid. And *still uninterpretable*, because of Table 2. This is the nuance worth carrying: a
result can be far outside the noise and simultaneously mean nothing, because significance and
confounding are independent problems. Then the contamination question (5.1): MMLU has been public
for years, and a corpus that grew from 1.4T to 2.4T tokens plausibly grew *toward* the internet's
supply of exam questions. Fresh-variant results, or nothing.

**Table 5 — alignment (decode with 5.5, 3.5):**

> "SFT on 100k instructions, then DPO on 60k preference pairs."

Now ask 5.5's question: are the Table-4 evals run on the base model or the aligned one? The
alignment tax means those can differ by points in either direction, and papers are frequently
vague about which checkpoint was measured. Also: DPO on 60k pairs is a modest budget — enough to
install a chat costume (3.5), not obviously enough for robust refusal behaviour, which is why the
safety section deserves its own skepticism pass (6.3).

**The tally.** Five tables, five different lessons, and one clear verdict: an interesting model
whose architecture claim is unsupported by an unmatched-compute comparison. You did not need
insider knowledge or a decade in the field. You needed Modules 2 through 5 and forty minutes.
`,
    },
    {
      type: 'text',
      md: md`
## Finding the signal in the first place

Triage assumes something already reached your desk. Curation is the upstream problem, and it is
mostly about **choosing sources with better priors** rather than filtering harder downstream.

**Follow labs and people, not the firehose.** Research quality is highly autocorrelated: a group
that ran careful ablations last year will run them this year. Ten to twenty researchers whose taste
you have verified will deliver more signal per hour than any keyword alert, because you are
outsourcing the filter to people who are *paid* to run it and whose reputation prices their errors.

**Know what a venue certifies — and what it doesn't.** Peer review at a major conference means
roughly: two or three overworked experts read it and did not find a fatal flaw. That is a real
signal and a weak one. Meanwhile, essentially everything important in this field appeared first as
an unreviewed preprint, often months or years before any venue saw it. So neither status is
decisive: **the preprint is where the frontier is, and the review is a modest noise filter.** Read
preprints; hold them at preprint-strength confidence.

**The third-confirmation heuristic.** For a *surprising* result — one that would change what you
work on — wait for independent replication before updating hard. Concretely: the original claim
(update a little, and only on the strength of the evidence type), the first independent replication
by a group with no stake (update meaningfully), and a third result that reproduces it in a
*different setting* (now treat it as a fact you can build on). The asymmetry is deliberate and
Bayesian: surprising results are surprising precisely because your prior said they were unlikely,
and the most common explanation for a surprising empirical claim in ML remains a subtle
methodological error — an untuned baseline, a contaminated eval, a leaked test set, a seed. Note
the cost structure: waiting costs you a few months of priority; updating on a false result costs
you a research direction.

**Reading groups.** The highest-leverage hour in a researcher's week, for a reason that is
structural rather than social: reading a paper aloud with three other people surfaces every place
your understanding was fake. You cannot skim in front of an audience. And it multiplies coverage —
five people each doing pass 2 on a different paper and reporting back is five times the pass-2
budget you derived above. If none exists near you, start one; the barrier is a recurring calendar
invite.

**Using an LLM as a reading assistant — the right way.** This is a genuine productivity multiplier
and a genuine trap, and the difference is *which question you ask*.

Ask it to **summarize the paper** and you have outsourced the one thing that was building your
judgment. Worse, you will remember the summary as if you had read the paper, with none of the
friction that would have flagged your confusions.

Ask it instead for things that are **mechanical, checkable, and beneath you**:

- "Extract every hyperparameter mentioned anywhere in this paper into a table, with the section it
  came from." (Then *you* look for the ones that are missing.)
- "Explain this notation — what does this subscript range over?"
- "Restate the method section as pseudocode." (Then check the pseudocode against the paper.)
- "List every comparison in Table 3 and, for each, the compute used by both arms." (Then *you*
  decide whether it is matched.)

And the highest-value prompt of all, which inverts the usual one: **"What is the weakest claim in
this paper, and what experiment would a hostile referee demand?"** That produces a list you can
evaluate — a starting point for your judgment rather than a substitute for it. Even then, verify:
the failure mode is a confident, well-written objection to something the paper actually addressed
in an appendix.
`,
    },
    {
      type: 'ponder',
      question: md`Push on that. Where is an LLM *genuinely* good at helping you read papers, and
where does it fail you **in a way you would not notice**? That second clause is the whole question —
a tool that fails loudly is a minor inconvenience; a tool that fails silently reshapes your beliefs.`,
      answer: md`**Genuinely good** — tasks that are local, verifiable, and information-preserving:

- **Explaining unfamiliar notation and unpacking dense derivations.** The answer is checkable
  against the paper's own equations, and being stuck on notation is pure friction.
- **Extracting structured facts** — hyperparameters, dataset sizes, token counts, model
  configurations — into a table. Tedious, mechanical, and you can spot-check three entries.
- **Restating a method section as pseudocode**, which forces exactly the specificity that prose
  hides and makes gaps visible.
- **Translating between fields' vocabularies**, and answering "what does this paper assume I have
  already read?"
- **Adversarial prompting against a claim** — "what would have to be true for this result to be
  spurious?" — used as a checklist generator, not an oracle.

**Fails silently** — everything requiring a model of the field's state and the authors' incentives:

- **Judging novelty.** Whether a contribution is new depends on what exists, including work too
  recent, too obscure, or too unpublished to be represented; a fluent "this is a significant
  advance" is generated from the paper's own framing. Novelty judgments are the field's, not a
  document's.
- **Spotting a missing baseline.** This is a statement about an *absence*, and absences are exactly
  what a text-conditioned reader is worst at. The paper does not contain the comparison it should
  have run; nothing in the input flags it. You notice it because you know the four methods that
  should have been in that table — the model summarizes what is there.
- **Sensing that framing outruns evidence.** The gap between abstract and results is a *tonal*
  judgment across the whole document, made against a background of how careful papers usually
  hedge. An assistant asked to summarize will faithfully reproduce the abstract's confidence,
  laundering overclaim into your notes as fact.
- **Weighing evidence types.** How much a causal intervention is worth versus a correlational
  probe, at this moment in this subfield, is a taste judgment calibrated on hundreds of papers that
  did not replicate.
- **Building your own taste.** The compounding cost. Every paper you struggle through is a training
  example for the pattern-recognizer you are trying to become; outsourcing the struggle collects
  the answer and skips the gradient update.

**The rule that falls out:** use it for *retrieval and translation*, never for *judgment*. A good
test before any prompt — "if the answer were wrong, would I find out?" Notation errors surface
immediately. A wrong novelty assessment surfaces two years later, in a review of your paper.`,
    },
    {
      type: 'text',
      md: md`
## Reproducibility, honestly

A thing the field says quietly and you should hear plainly: **a large fraction of published machine
learning does not replicate cleanly.** Not fraud — friction. The usual causes, in rough order of
frequency:

- **Missing hyperparameters.** The paper reports the learning rate and omits the warmup, the
  gradient-clipping threshold, the exact schedule, the tokenizer version, the data-shuffling seed.
  Any one of them can be worth more than the reported effect.
- **Unreleased or unspecified data.** "Trained on a filtered web corpus" is not a specification, and
  data is usually the single largest driver of results (5.1). Two papers with identical
  architectures and different corpora are not comparable, and one with an undisclosed corpus is not
  checkable.
- **Seed sensitivity.** The reported number is often the best of several runs; your first run lands
  below it and you cannot tell whether you made a mistake or drew a different seed. Without a
  variance estimate, a single number is unfalsifiable.
- **Silent implementation details.** The trick that made it work lives in the code and not the
  paper — an initialization scale, a normalization placement, a clamp — sometimes because the
  authors did not know it mattered.
- **Compute you do not have.** Some results are simply not checkable by anyone outside a handful of
  labs, which is a structural problem the field has not solved.

**What good practice looks like**, so you can recognize it and later produce it: released code and
weights; the full hyperparameter table, including the boring ones; multiple seeds with variance
reported; the data pipeline described well enough to rebuild; ablations that could have failed; and
**negative results** — the variants that did not work, which are the most generous and most
frequently omitted thing a paper can give you.

**How to treat a paper that lacks it.** Not "reject" — *discount*, and be specific about the
direction. A paper with no released code and one seed is a **hypothesis with supporting evidence**,
which is genuinely valuable and is not a fact. Cite it as such, build on it only after replicating
the part you need, and note that the parts most likely to be fragile are precisely the ones that
were most surprising. If you replicate and get a smaller effect, that is a real finding — write it
down, and tell the authors before you tell the internet.
`,
    },
    {
      type: 'example',
      title: 'the deliverable — your next 20 papers',
      md: md`
Read in roughly this order. One line each on why it matters, and which lesson already prepared you —
which is the point: **you are not starting these cold.** Twenty entries, a few of them pairs meant
to be read together.

**Foundations (Modules 1–2)**

| paper | why it matters | you were prepared by |
|---|---|---|
| Attention Is All You Need (Vaswani et al., 2017) | the architecture, in its original 8 pages; read it to see how much was empirical guess and how little was theory | 1.1, 2.2, 2.3 |
| RoFormer (RoPE) | position as rotation — the encoding essentially everything now uses, and the base of context-extension tricks | 2.4 |
| GPT-2 and GPT-3 papers, as a pair | the two claims that made the field: scale alone unlocks multitask ability, then few-shot in-context learning | 3.6, 5.1, 5.2 |
| LLaMA and its open successors | the open-weights lineage every experiment you run will start from; read one model card end to end | 2.6, 4.6 |

**Runtime and infrastructure (Modules 3–4)**

| paper | why it matters | you were prepared by |
|---|---|---|
| FlashAttention | the canonical example of an IO-aware algorithm: same math, different memory traffic, enormous speedup | 3.4, 4.1 |
| vLLM / PagedAttention | virtual memory for the KV cache; why serving throughput jumped and how batching economics really work | 3.3, 4.5 |
| Quantization lineage (LLM.int8, GPTQ, AWQ) | how far you can shrink weights before quality breaks, and why outlier channels are the whole story | 4.4 |
| QLoRA | fine-tuning a 65B model on one GPU — the paper that made small-lab adaptation possible | 4.4, 5.4 |
| Switch Transformer and Mixtral, as a pair | sparse experts from the original idea to a strong open implementation: more parameters, constant FLOPs | 4.3, 4.6 |

**Training (Module 5)**

| paper | why it matters | you were prepared by |
|---|---|---|
| A corpus paper (The Pile, RefinedWeb, or Dolma) | what training data actually is — the filtering, deduplication, and judgment calls behind one line of a model card | 5.1 |
| Scaling laws: Kaplan (2020) then Chinchilla (2022), as a pair | read in order to watch a field correct itself with better experiments; the second is why models got smaller and data got bigger | 5.2 |
| LoRA | low-rank updates — the most useful piece of applied linear algebra in the field, and one you can implement in an afternoon | 1.2, 5.4 |
| InstructGPT | where the assistant came from; the paper that turned a text predictor into a product | 3.5, 5.5 |
| Constitutional AI | supervising with principles instead of per-example human labels — and a preview of scalable oversight | 5.5, 6.3 |
| Direct Preference Optimization (DPO) | the derivation that removed the reward model; a beautiful example of algebra replacing machinery | 5.5 |
| Let's Verify Step by Step (process supervision) | rewarding reasoning steps rather than answers — the hinge between RLHF and the reasoning era | 5.5, 6.4 |

**Frontier (Module 6)**

| paper | why it matters | you were prepared by |
|---|---|---|
| Toy Models of Superposition, then Towards / Scaling Monosemanticity | the phenomenon and the tool, in order: why neurons are junk drawers and what dictionaries recover | 6.1 |
| In-context Learning and Induction Heads, with Interpretability in the Wild (IOI) | the two canonical circuit results — a mechanism found and a circuit mapped end to end | 6.2 |
| An inference-time scaling paper (test-time compute / sampling-and-verifying) | the second scaling axis: buying capability with tokens at inference instead of parameters at training | 5.2, 6.4 |
| An agent benchmark paper (SWE-bench or similar) | what "agent" means when it is measured rather than demoed, and how brutal real task success rates are | 5.6, 6.4 |

**Two warnings about this list.** First, **titles and venues shift** — papers get renamed between
preprint and proceedings, results get superseded, and some entry here will be obsolete within a
year of your reading it. Second, and more important: **re-derive this list annually, yourself.**
The exercise is the value. Ask what the last twelve months changed, which of these got overturned,
and what a newcomer should now read instead. A list you inherited is someone else's map of a field
that has since moved; a list you rebuilt is a snapshot of your own judgment, and you can watch it
improve. **The skill outlives the list** — which is exactly why the checklist above got eight
sections and the list got one.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The arithmetic of impossibility:** ~100,000 papers a year, ~50,000 hours to read them, 8,760
   hours in existence. Well-read people are well-filtered, and filtering is a skill.
2. **Triage in three passes:** 5 minutes for claim-and-evidence-type (most papers stop here); 30
   minutes for "would this convince a hostile expert, and what is the actual delta?"; hours for
   reconstruction, reserved for roughly one paper a month.
3. **The skeptic's checklist**, all of it yours already: baselines, compute-matching (5.2),
   ablations and their backup-head caveat (5.3, 6.2), evaluation and contamination (5.6, 5.1),
   variance via $\sqrt{p(1-p)/n}$ (5.6), cherry-picking, scale generalization, incentives.
4. **Decoding a real paper:** architecture tables audit against 2.6, training tables against 5.2
   and 4.2, efficiency claims against 3.4 and 4.4, evals against 5.6, alignment against 5.5 — and
   the habit of naming *the one number you would check first*.
5. **Curation over filtering:** follow people, treat venues as a weak filter, wait for the third
   confirmation on surprising results, join or start a reading group, and use an LLM for retrieval
   and translation but never for judgment.
6. **Reproducibility, honestly:** much does not replicate; discount rather than dismiss; know what
   good practice looks like so you can produce it yourself.

You can now read the field. The next lesson asks the harder question: how do you **add** to it?
`,
    },
  ],
  questions: [
    {
      id: 'm6-l5-q1',
      kind: 'mcq',
      prompt: md`A paper reports that its new optimizer beats AdamW by 4% on downstream benchmarks.
Which single check is **most likely** to make the reported improvement evaporate?`,
      options: [
        'Whether the paper includes a theoretical convergence proof',
        'Whether the AdamW baseline was tuned as hard as the proposed optimizer — learning rate, warmup, schedule, weight decay',
        'Whether the code is released in PyTorch rather than JAX',
        'Whether the paper was peer-reviewed at a major conference',
      ],
      answer: 1,
      explain: md`Untuned baselines are the field's most common manufacturer of fake improvements,
and optimizer papers are the worst offenders because optimizers are *exceptionally* sensitive to
learning rate and schedule (1.6). Sweep the new method and run the baseline at defaults and you will
reliably "discover" a few percent that belongs to the sweep, not the method. Option A tempts because
theory feels rigorous — but a convergence proof constrains asymptotic behaviour under assumptions
nobody's training run satisfies, and says nothing about a 4% benchmark gap. Option D tempts hardest:
review is a real but weak filter, and reviewers routinely miss exactly this, since an untuned
baseline looks like a normal table.`,
    },
    {
      id: 'm6-l5-q2',
      kind: 'numeric',
      prompt: md`**Fermi (paper and pencil).** About 500 machine-learning papers appear on arXiv
every weekday — call it 100,000 a year. At **30 minutes each**, how many **hours** would reading
them all take? (Tolerance is generous; the point is the order of magnitude, and the comparison to
the 8,760 hours a year contains.)`,
      answer: 50000,
      tolerance: 15000,
      explain: md`$100{,}000 \times 0.5 = 50{,}000$ hours. A year has $365 \times 24 = 8{,}760$ hours
*in total* — not working hours. So reading the field is off by a factor of about **six for someone
who never sleeps**. This is not a productivity problem with a productivity solution; it is a
constraint, and constraints dictate strategy. Everyone who appears well-read is well-filtered.`,
    },
    {
      id: 'm6-l5-q3',
      kind: 'numeric',
      prompt: md`You protect **5 hours a week for 50 weeks** to read. If you spent every minute of
it on 5-minute pass-1 skims, how many papers could you triage in a year?`,
      answer: 3000,
      tolerance: 250,
      explain: md`$5 \times 50 = 250$ hours $= 15{,}000$ minutes; $15{,}000 / 5 = 3{,}000$ papers —
about **3%** of the year's output, and that is the ceiling, buying nothing but claims and
evidence-types. Spend the same budget on 30-minute reads instead and you get 500 papers (0.5%).
The real allocation splits the budget: ~1,500 skims, ~150 real reads, ~12 full reconstructions.
Twelve deep reads a year is what the arithmetic permits, so your pass-1 filter must be cheap and
ruthless.`,
    },
    {
      id: 'm6-l5-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Do not reproduce the three-pass method from memory —
*derive a reading policy from constraints*, the way you would derive a batching policy in 4.5. Start
from: (a) the annual paper flux, (b) your realistic annual reading budget in hours, (c) the cost of
a skim, a real read, and a full reconstruction, and (d) the asymmetric cost of the two errors
(skimming something that deserved depth, versus sinking hours into something that deserved a skim).
Produce actual numbers, an explicit allocation, and then state what each depth level must *decide*
so that the level above it is used efficiently.`,
      rubric: md`**(a) Flux:** ~500/weekday ≈ 100,000+ papers per year in ML.

**(b) Budget:** state one and defend it. 5 h/week × 50 weeks = 250 h = 15,000 minutes is a
reasonable, even generous, figure. Any budget between ~100 and ~500 hours is fine if stated.

**(c) Costs:** skim ≈ 5 min, real read ≈ 30 min, reconstruction ≈ 4 h (240 min). Note the ratios:
1 : 6 : 48.

**(d) The asymmetry, which is the crux:** a false negative at pass 1 (skimming something that
deserved depth) costs you a delay and is usually recoverable — the paper will resurface via
citations, colleagues, or a reading group. A false positive (four hours on something that deserved
five minutes) costs 48 skims, irrecoverably. **Therefore the filter should be tuned to over-reject**,
and pass 1 must be cheap enough that over-rejection is affordable.

**The allocation** — any explicit split whose hours sum to the stated budget, e.g. 1,500 skims (125
h) + 150 reads (75 h) + 12 reconstructions (48 h) = 248 h. Full credit requires the arithmetic to
close and the punchline to be stated: roughly **one deep read a month** is what the budget permits.

**What each level decides** (the part that shows real understanding):
- **Pass 1 decides admission**, so it must extract exactly what predicts value: the *claim* (not the
  topic) and the *type of evidence*. It cannot afford to assess correctness.
- **Pass 2 decides trust**, so it must find the delta over the baseline and ask whether a hostile
  expert would be convinced — the checks that are cheap and dispositive (compute-matching, baseline
  tuning, variance) belong here, because they can kill a paper before it costs four hours.
- **Pass 3 decides buildability**, so it must reconstruct: could you reimplement it, and do the
  tables cohere?

**Nailed it** = numbers that actually multiply out, an allocation summing to the budget, the error
asymmetry doing real work in the argument, and per-level decisions. Reciting "pass 1, pass 2, pass
3" with no arithmetic is exactly the recall this question is designed to defeat.`,
    },
    {
      id: 'm6-l5-q5',
      kind: 'mcq',
      prompt: md`A paper introduces a new architecture at 125M parameters and reports it beats a
transformer baseline. The training table shows the new model saw **3× more tokens** than the
baseline. What does this comparison license you to conclude?`,
      options: [
        'The new architecture is better, since both models reached their loss floors anyway',
        'Essentially nothing about the architecture — with unmatched compute the two effects are confounded, and scaling laws guarantee that more tokens alone improves loss',
        'The new architecture is worse, since it needed 3× the data to win',
        'The comparison is fine as long as both models have the same parameter count',
      ],
      answer: 1,
      explain: md`Compute-matching is not a nicety; it is what makes the comparison an experiment.
5.2 says loss falls as a power law in tokens, so 3× data buys a guaranteed improvement independent
of architecture — the two causes are perfectly entangled and no amount of statistics separates them.
Option D is the trap most people fall into, because parameter count *feels* like the fair thing to
hold fixed. But $C \approx 6ND$ has two factors: matching $N$ while letting $D$ vary matches
nothing. Option A invents a loss floor that 125M models trained on modern corpora are nowhere near
(5.2's irreducible term $E$ is a floor for the *data*, not a plateau these runs reach). Option C
over-corrects: the data does not support "worse" either — it supports *no conclusion*, which is a
distinct and underrated verdict.`,
    },
    {
      id: 'm6-l5-q6',
      kind: 'numeric',
      prompt: md`**Variance check (5.6's arithmetic).** Two models are evaluated on the same
**500-question** benchmark: model A scores **78.0%**, model B scores **80.0%**. Using
$\text{SE} = \sqrt{p(1-p)/n}$ for each and combining them for the difference
($\text{SE}_{\text{diff}} = \sqrt{\text{SE}_A^2 + \text{SE}_B^2}$), how many standard errors wide is
the 2-point gap? (One decimal.)`,
      answer: 0.8,
      tolerance: 0.2,
      explain: md`$\text{SE}_A = \sqrt{0.78 \times 0.22/500} = 0.0185 \to 1.85$ points;
$\text{SE}_B = \sqrt{0.80 \times 0.20/500} = 0.0179 \to 1.79$ points. Combined:
$\sqrt{1.85^2 + 1.79^2} \approx 2.6$ points. The gap is $2.0/2.6 \approx$ **0.8 SE** — comfortably
inside the noise. Two models that are genuinely identical produce gaps this size routinely. When a
paper's headline rests on a 2-point win over 500 questions and reports no error bars, you have not
been shown a result; you have been shown a draw. Run this arithmetic on every leaderboard you read
and a startling fraction of published rankings dissolve.`,
    },
    {
      id: 'm6-l5-q7',
      kind: 'mcq',
      prompt: md`A paper ablates component X from its method and finds performance barely changes.
The authors conclude X is unnecessary. Given 6.2, what is the most careful reading?`,
      options: [
        'The conclusion is sound — ablation is the gold standard for establishing that a component is unimportant',
        'A small ablation effect is consistent with X being genuinely load-bearing, if another component compensates when X is removed — ablation measures counterfactual necessity in a system that can adapt, not importance',
        'The ablation is invalid because ablations can only be run on attention heads, not on architectural components',
        'The result means X was never learning anything, so it can be deleted to save parameters',
      ],
      answer: 1,
      explain: md`This is the backup-head lesson generalized. In 6.2, ablating a name-mover head
produced a smaller effect than its role warranted, because backup heads that were dormant became
active once the primary was removed — a redundant system reports low counterfactual necessity for a
component that is doing the work in the normal forward pass. Option A is the seductive one because
ablation genuinely *is* the field's workhorse causal tool, and this question is not saying to
distrust ablations — it is saying to read a *null* ablation as ambiguous between "unimportant" and
"redundantly implemented." The disambiguating experiments exist: ablate X *and* its suspected
backups jointly, or measure whether other components' behaviour changes when X is removed. Option D
smuggles in a practical decision that the evidence does not support.`,
    },
    {
      id: 'm6-l5-q8',
      kind: 'numeric',
      prompt: md`**Compute-matching, quantitatively.** Using 5.2's scaling law, a model's data term
is $B/D^{\beta}$ with $\beta = 0.28$, and for the baseline that term is worth **0.30 nats** of loss.
A new method trains on **2× the tokens** and reports **0.05 nats** better loss. How many nats of
improvement should you expect from the token doubling **alone**? (Two decimals. Note
$2^{-0.28} \approx 0.824$.)`,
      answer: 0.05,
      tolerance: 0.015,
      explain: md`Doubling $D$ multiplies the data term by $2^{-0.28} \approx 0.824$, so it shrinks
by $0.30 \times (1 - 0.824) = 0.30 \times 0.176 \approx$ **0.053 nats**. The reported improvement is
0.05 nats. In other words, **the entire claimed gain is what you would have gotten by training the
baseline on the same number of tokens** — the method may contribute nothing at all. This is the
compute-matching check with a number attached, and it is worth practising until it is reflexive:
whenever a paper's arms differ in tokens, estimate the free improvement from the scaling law before
you evaluate the claim. Papers rarely present it this way; the arithmetic takes ninety seconds.`,
    },
    {
      id: 'm6-l5-q9',
      kind: 'mcq',
      prompt: md`A preprint from a lab whose work you respect reports a genuinely surprising result:
a simple training change doubles reasoning-benchmark performance. It is not peer-reviewed. What is
the appropriate epistemic response?`,
      options: [
        'Believe it — the lab has a strong track record, and peer review adds little in this field',
        'Dismiss it until it appears at a major conference, since unreviewed preprints are not evidence',
        'Update modestly, note what evidence type backs it, and wait for independent replication in a different setting before letting it change what you work on',
        'Immediately pivot your research to build on it, since being early is where the returns are',
      ],
      answer: 2,
      explain: md`Surprising results are surprising *because* your prior said they were unlikely, and
in empirical ML the most common explanation for a surprising claim remains a subtle methodological
error — an untuned baseline, a contaminated eval, a lucky seed. Hence the third-confirmation
heuristic: original claim (update a little), independent replication (update meaningfully), a third
result in a different setting (build on it). Option A is the most tempting because track record is
genuinely evidence — but reputation is a prior over *care*, not a guarantee about this run, and
respected labs publish results that do not replicate. Option B over-corrects: essentially everything
important in this field appeared first as a preprint, so a review requirement would have you
permanently a year behind. Option D inverts the cost structure — waiting costs months of priority;
building on a false result costs a research direction.`,
    },
    {
      id: 'm6-l5-q10',
      kind: 'written',
      prompt: md`**The replication that came up short.** You reimplement a paper's method and get a
result **3 points below** the reported number. On paper, write what you do, **in order**, before
drawing any conclusion — and then state clearly what you would and would **not** be entitled to
conclude if the gap persisted after all your checks. Be specific about which checks are cheap and
dispositive versus expensive and ambiguous.`,
      rubric: md`**The ordered protocol** (cheap-and-dispositive first — that ordering is itself
being graded):

1. **Check your own implementation before doubting theirs.** Reproduce the *baseline* number in the
   paper first: if you cannot match the baseline, the bug is yours, and you have learned it for the
   cost of one run. This step is first because it is the most likely explanation and one of the
   cheapest.
2. **Compare configurations line by line** against the paper and any released code — including the
   boring ones (warmup, gradient clipping, weight decay, tokenizer version, sequence length, batch
   size, precision). Missing hyperparameters are the single most common replication failure.
3. **Check evaluation-side differences**: prompt formatting, few-shot count, answer parsing,
   normalization, dataset version/split. Eval harness discrepancies alone routinely produce several
   points on the same model.
4. **Run multiple seeds and estimate variance.** Three points may be within run-to-run noise — you
   cannot know from one run. Also ask whether the paper's number is a single run or a best-of-$k$;
   if best-of-several, some of the gap is selection, not method.
5. **Compute-check the arms:** did they train longer, on more tokens, or on different data than you
   did? Same confound as in any comparison.
6. **Ask the authors.** Specific, non-accusatory, with your config attached. This is both good
   practice and frequently the fastest path — the answer is often one unpublished detail.

**Entitled to conclude** if the gap survives all of this: that the effect as reported is **not
reproducible from the paper as written under your conditions**, which is a real, publishable,
useful finding — and that the *size* of the effect is smaller than reported, or conditional on
something undocumented.

**Not entitled to conclude:** that the authors are wrong, dishonest, or that the method does not
work. Absence of your evidence is weak evidence of absence when the space of undocumented details
is large. Also not entitled to conclude anything general from one benchmark and one model scale.

**Norms credit:** contact the authors before publishing the discrepancy; report your own full
configuration; frame it as "we could not reproduce under conditions X" rather than as an
accusation. Strong answers note that "cheap and dispositive" (config diff, eval harness, seeds)
must precede "expensive and ambiguous" (retraining from scratch), and that step 1 — reproducing
their baseline — is the highest-information check per unit cost.`,
    },
    {
      id: 'm6-l5-q11',
      kind: 'written',
      prompt: md`**Triage in the wild.** You are handed the abstract of a paper claiming a new
attention variant that is "3× faster with no quality loss." You have **five minutes** — pass 1 only.
Write (1) the three things you look at, in order, and what each could reveal; (2) the two specific
numbers you would search the PDF for before deciding whether it earns a pass 2; and (3) the exact
condition under which you stop reading. Use the curriculum to justify each choice.`,
      rubric: md`**(1) What you look at, in order:**
- **The claim, stated precisely.** "3× faster" at *what* — training or inference? Prefill or decode?
  At what batch size, sequence length, precision, and hardware? From 3.4 you know decode is
  bandwidth-bound and prefill is compute-bound, so a speedup on one says little about the other, and
  an unqualified "3×" is a mood rather than a measurement.
- **The evidence type.** Wall-clock measurements on real hardware, FLOP counts, or asymptotic
  complexity? Asymptotic wins routinely fail to materialize (4.1: memory traffic, not FLOPs, is
  usually the binding constraint), so a complexity argument alone caps the paper's strength.
- **The quality-loss evidence.** "No quality loss" measured how — perplexity only, or downstream
  benchmarks; at what scale; with what variance? Perplexity parity at 125M is weak evidence for
  downstream parity at 70B (scale generalization).

**(2) Two numbers to grep for** (any two well-justified):
- **The token/compute budget of both arms** — is the comparison compute-matched (5.2)?
- **The sequence length at which the speedup was measured** — many attention variants win only at
  very long context and lose at typical lengths, because the quadratic term they attack is not
  dominant there.
- Also creditable: batch size and precision (4.4/4.5 — an FP8-vs-BF16 comparison is a quantization
  result); the largest model size tested; the KV-cache footprint.

**(3) The stopping condition — must be stated as an actual rule, not a vibe.** Strong forms: "stop
if the speedup is measured only at sequence lengths I do not use, or only as FLOPs rather than
wall-clock"; "stop if quality is shown only at one small scale with no trend"; "stop if the arms
are not compute-matched and the paper's central claim depends on the comparison." Also fully
creditable: "stop if it is not on a path I care about, regardless of quality" — pass 1's job is
admission, and relevance is a legitimate rejection.

**Nailed it** = the three items are ordered by *what could kill the paper cheapest*, each choice
cites the lesson that motivates it, and the stopping rule is specific enough that a colleague could
apply it and reach the same decision.`,
    },
    {
      id: 'm6-l5-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old.** A kid asks: "If scientists write a hundred thousand
papers a year, how does anybody know which ones are true?" Explain (1) why nobody can read them all
— make the impossibility *arithmetic*, not vague; (2) how researchers decide what to spend time on;
(3) two or three concrete tricks for telling a strong result from a weak one, in kid-language (an
unfair race, measuring twice, small numbers wobbling); and (4) why waiting for someone else to check
a surprising result is smart rather than timid. No unexplained jargon.`,
      rubric: md`Grade the *teaching*. A strong answer:

1. **Makes the impossibility concrete with numbers a kid can hold.** "A hundred thousand papers, half
   an hour each, is fifty thousand hours — but a whole year only has about nine thousand hours, even
   if you never slept. So it is not that scientists are slow; it is that there is not enough time in
   the universe." The arithmetic must actually appear.
2. **Explains filtering, not reading.** You give almost everything a five-minute look, a few things a
   proper look, and about one a month a really deep look. You also follow a handful of people who
   are good at picking, the way you follow someone whose taste in games you trust.
3. **Two or three kid-level trust tests**, each with a concrete image:
   - **The unfair race:** if you want to prove your new running shoes are faster, you cannot race a
     kid wearing shoes with the laces tied together. Lots of papers accidentally do that — they try
     very hard with their new idea and barely try with the old one.
   - **Did they use the same amount of practice?** If your shoes got a month of training and the
     other kid got a week, of course you won — but not because of the shoes.
   - **Small numbers wobble:** if you flip a coin ten times you might get 7 heads, and that does not
     mean the coin is special. Testing on only a few hundred questions is like that, so a tiny lead
     might be luck. Do it again a few times and see if the lead survives.
4. **Waiting for a second and third check** — the more surprising a claim, the more likely something
   small went wrong, so the strongest results are the ones that *other* people, who did not want it
   to be true, also got. That is not being timid; it is how you avoid spending a year building on
   something that was never there.
5. **Jargon audit:** "baseline," "compute-matched," "ablation," "contamination," "standard error,"
   "preprint," "peer review," "replication" used without a kid-level translation first = **partial
   at best**. Translating them into images (an unfair race, same practice time, taking a part out to
   see if the machine still works, having seen the answers already, wobbling numbers, a first draft
   posted online, other people checking) is the whole exercise.`,
    },
  ],
}
