// Module 5, Lesson 1 — Data: the diet of a mind (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm5-l1',
  title: '5.1 Data — the diet of a mind',
  subtitle: md`Everyone argues about architectures. But lesson 1.5 proved that a language model is,
in a precise sense, a lossy compression of its training corpus — change the corpus and you change
the mind. This lesson is about the 15 trillion tokens nobody looks at: where they come from, what
gets thrown away, and why the discards decide more than the architecture does.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Somewhere in a datacenter right now, a frontier model is reading roughly **15 trillion tokens**.
Printed, that corpus would run to about a hundred million books — several Libraries of Congress,
cover to cover. It is plausibly the largest single act of reading in history.

And almost nobody asks what's in the books.

Look at where the attention goes. Modules 2 and 4 anatomized the machine doing the reading —
attention heads, MLPs, mixtures of experts. Lesson 1.6 anatomized the optimizer turning pages.
Model and optimizer get the papers, the talks, the arguments. The data gets a footnote: "trained
on 15T tokens of web text." As if tokens were a fungible fluid, like electricity.

Here is why that footnote should bother you. Lesson 1.5 proved an identity, not an analogy:
**minimizing cross-entropy on a corpus is the same act as compressing that corpus.** Every step of
training makes the model a slightly better compressor of its training data — so the trained model
*is* a lossy compression of its corpus. The architecture is the codec; the data is the photograph.
Swap JPEG for a better codec and the picture sharpens a little. Swap the *photograph* and you get a
different picture entirely. Change the data and you change the mind.

So the questions this lesson answers are the ones the footnote hides:

1. Where do 15 trillion tokens physically come from?
2. What gets thrown away on the way — and it is *almost everything* — and who decides?
3. Why does the throwing-away shape the model more than the architecture that reads the survivors?

By the end you'll be able to read a sentence like "trained on 15T tokens" the way a chef reads a
menu written by another chef: as a stack of decisions, each with a fingerprint.
`,
    },
    {
      type: 'text',
      md: md`
## Where fifteen trillion tokens live

There is exactly one pile of text big enough, and you're soaking in it: the web. The workhorse
source is **Common Crawl**, a nonprofit that has been crawling since 2008 and gives away the
result. One monthly snapshot is on the order of 3 billion pages and a few hundred terabytes;
stacked over the years, that's **hundreds of billions of page-captures and petabytes of raw
crawl** — the closest thing to "the internet" you can download.

But a crawled page is not text. It's HTML: navigation bars, cookie banners, ads, share buttons,
JavaScript, the same footer ten thousand times. The prose you'd actually want is a thin seam
running through a mountain of markup. So every pretraining corpus is the output of a **funnel**,
and the funnel's arithmetic is brutal. Here is a representative one — the numbers are illustrative
and rounded, and every lab's differ, but the *shape* is universal:

| stage | what it does | survives (representative) |
|---|---|---|
| raw crawl | petabytes of HTML, headers, scripts | 100 PB of bytes |
| extraction | strip markup, nav, ads, boilerplate — keep main content | ~2% of bytes → ~2 PB of text ≈ 500T tokens |
| language ID | keep the languages you're targeting | ~45% → ~225T tokens |
| quality filtering | classifiers and heuristics keep the "good" text | ~20% → ~45T tokens |
| deduplication | remove exact and near copies | ~1/3 → **~15T tokens ≈ 60 TB** |

Feel the two big ratios. From raw bytes to final corpus: 100 PB down to 60 TB — about **0.06%**.
From extracted *text* to final corpus: 500T tokens down to 15T — about **3%**, and aggressive
"educational-quality" pipelines keep even less (one public pipeline distills 15T of filtered web
down to ~1.3T of top-grade text — the top tenth of the top few percent).

So the dataset everyone casually calls "the whole internet" is nothing of the kind. It is an
**anthology**: for every hundred pages of candidate text, roughly ninety-seven were rejected by an
editor. The editors are programs — a language classifier, a quality model, a deduplicator — but
they are editors all the same, and each one's taste leaves a fingerprint on the mind that gets
trained. The rest of this lesson interrogates the editors, one by one, starting with the one that
looks most boring and matters most.
`,
    },
    {
      type: 'text',
      md: md`
## Deduplication — the janitor turns out to be load-bearing

First, a fact about the web that surprises everyone who hasn't measured it: **the web is massively
self-copied.** Mirrors of Wikipedia. The same wire-service story on four hundred news sites. SEO
farms that stamp out templated pages by the million. License boilerplate, terms-of-service, "in
this article we will discuss…" Depending on how you count, a large fraction — think a third or
more of crawled documents — are exact or near copies of something else in the crawl (measured on
public crawls; exact fractions vary with the yardstick).

The naive story says dedup is janitorial: copies waste disk and compute, so sweep them up. The
real story is much better, and you can *derive* it from lesson 1.5.

**Reason one: duplication trains recitation.** Training minimizes the *average* cross-entropy over
the corpus. If one document appears 1,000 times among a billion, its loss term is not one vote —
it is **1,000 identical, perfectly aligned votes**, all pushing the weights toward the exact same
continuation, batch after batch, epoch after epoch. What's the cheapest way for the model to
satisfy 1,000 aligned votes at once? Store the string. Drive its probability toward 1. In 1.5's
compression ledger this is spectacular business: a memorized sequence costs nearly **zero bits**
per copy — loss on those 1,000 copies collapses — and the model has learned *nothing*. It has
become a lookup table for one document, spending parameters and gradient signal that generalizable
patterns needed. The loss curve smiles while the mind hollows: your average loss falls, and the
fall is a lie. And it's not hypothetical — extraction experiments find that how often a sequence
was duplicated in training is the strongest predictor of whether the model can be prompted to
regurgitate it verbatim (measured, and the reason duplicated personal data and copyrighted text
are a legal problem, not just a scientific one).

**Reason two: duplication commits benchmark fraud on your behalf.** Where do evaluation questions
live? On the web — GSM8K problems in GitHub repos, MMLU questions on quiz sites, benchmark CSVs
mirrored everywhere. If test items survive into the training set, the model's score measures
*recall*, not ability — a memorized 5% of a benchmark is +5 points of pure fiction. And popular
text is precisely the text that gets copied most, so eval items are disproportionately likely to
ride into your corpus on a duplicate. Contamination is the default state of a web-scale corpus,
not a freak accident — lesson 5.6 will build the defenses; today's job is to see why the attack
surface exists.

**The scale problem.** Exact duplicates are easy: hash every document, keep one per hash. But the
dangerous duplicates are *near*-duplicates — same article, different ads injected, a date changed,
a typo fixed. Detecting those means asking "how similar is document A to document B?" for all
pairs — and with 10 billion documents, that's about $5 \times 10^{19}$ comparisons. At a billion
comparisons per second, sixteen centuries. Impossible — unless you stop comparing *documents* and
start comparing *fingerprints*. That trick is lovely enough to earn its own worked example below.
`,
    },
    {
      type: 'ponder',
      question: md`A junk document teaches the model nothing. A duplicated document is, at least, a
real, well-formed piece of writing — arguably *good* text. So why do data teams fear the duplicate
more than the junk? Try to argue it from the training objective before revealing.`,
      answer: md`Because of how gradients add. The junk document wastes its slot **once**: one noisy
vote toward nonsense, diluted by a billion other votes — the optimizer barely feels it. The
duplicated document votes **1,000 times, in perfect agreement**. Scattered votes cancel; aligned
votes compound. That bloc of aligned gradients actively trains a behavior — recite this exact
string — and distorts everything downstream: the loss curve reports progress that is really
memorization, capacity is spent building a lookup table, generation gets biased toward replaying
the duplicate, extraction attacks can pull it back out verbatim (privacy, copyright), and if the
duplicate happens to contain a benchmark item, your eval scores are quietly inflated too. A useless
document is a wasted meal. A duplicated document is a chant — and minds, artificial or otherwise,
learn chants by heart whether or not the chant deserved it.`,
    },
    {
      type: 'example',
      title: 'near-dedup by hand — the MinHash idea',
      md: md`
Two crawled sentences:

- **A:** "the cat sat on the mat" → 3-word shingles: (the cat sat), (cat sat on), (sat on the), (on the mat)
- **B:** "the cat sat on the hat" → (the cat sat), (cat sat on), (sat on the), (on the hat)

Treat each document as its **set of shingles** (overlapping n-grams). Similarity = overlap of the
sets — the **Jaccard similarity**: shared shingles over total distinct shingles. Here: 3 shared,
union of 5, so $J = 3/5 = 0.6$. High — flag as near-duplicates.

Fine for two sentences. Useless for 10 billion documents — sets are huge and pairs are countless.
Now the trick, derived in three sentences.

Pick a random hash function — think of it as a **lottery ranking every possible shingle** in a
random order. Let each document keep just one number: the best-ranked (minimum-hash) shingle it
contains. Now ask: what's the chance A and B keep the *same* number? The champion among the 5
shingles of the union is equally likely to be any of them — and A's keeper equals B's keeper
exactly when that champion is one of the 3 *shared* shingles. So

$$P(\text{sketch entries agree}) = \frac{\text{shared}}{\text{union}} = J.$$

One random hash gives a coin flip whose bias *is* the similarity. So flip 128 coins: use 128
different hash functions, keep 128 minimums per document — a fixed-size **sketch**. Two documents
with $J = 0.6$ will agree on about $0.6 \times 128 \approx 77$ of the 128 positions, give or take
about 5 (a binomial spread of $\sqrt{0.6 \times 0.4 / 128} \approx 4\%$). Estimate the similarity
of any pair by comparing 128 numbers — never touching the documents.

And you don't even compare all pairs of sketches: slice each sketch into, say, 16 bands of 8
numbers, and bucket documents by each band. Highly similar pairs almost surely collide in some
bucket; dissimilar pairs almost never do — so you only inspect the collisions. Ten billion
documents, petabytes of text, reduced to a couple of terabytes of fingerprints and an overnight
job. That is why near-dedup at web scale exists at all: **compare sketches, not documents.**
`,
    },
    {
      type: 'text',
      md: md`
## Quality filtering — the editor in the machine

After dedup, the corpus is unique — but uniqueness isn't quality. Two instruments do the grading.

**Instrument one: a taste classifier.** Take text you've decided is good — Wikipedia, published
books, pages an LLM grades as "educational" — call it positive; call random crawl negative; train
a small fast classifier to tell them apart; keep the web pages it scores highly (one public
pipeline keeps roughly the top tenth this way). Simple, cheap, effective — hold the obvious
question for one paragraph.

**Instrument two: perplexity — and this one you already own.** Run a small *reference* language
model over every candidate document and read its perplexity (1.5: the model's average surprise per
token). Now derive what the two tails of that score mean. Text the reference finds **too easy** —
ultra-low perplexity — is text carrying almost no information per token: templates, boilerplate,
SEO chum, the ten-thousandth copy of a cookie-banner sentence pattern. Text the reference finds
**impossibly hard** — ultra-high perplexity — isn't deep, it's broken: OCR garbage, encoding
errors, word salad, tables mangled into noise. Real prose written to inform a human sits in the
**middle band**, and that's what you keep. Savor this for a second: perplexity entered this course
in 1.5 as a way to *measure models against fixed data*. Here it returns, pointed the other way —
*measuring data with a fixed model*. Same instrument, rotated 180 degrees. That's what it means to
own a concept.

**Now the honest part, and it matters.** Every filter is an editorial judgment wearing a lab coat.
The classifier didn't learn "quality" — no one can define that — it learned *resemblance to the
positives its authors chose*. The perplexity filter didn't learn "well-formed" — it learned *what
the reference model finds normal*, and the reference model has a diet of its own. Operationalize
"quality" as "looks like Wikipedia and books" and you have quietly decided whose English counts:
audits of exactly these pipelines have documented quality filters disproportionately discarding
text in African-American English, in dialects, from and about minority communities — not because
anyone wrote a rule against them, but because the positives defined a register and everything
unlike it scored as noise (documented; auditing filter bias is an active research area, not a
solved one). And remember 3.6: the training objective makes a model fluently continue whatever it
ate — the diet's blind spots and confident falsehoods become the model's. **Filtering is
curriculum design wearing a lab coat.** The pipeline is the syllabus committee, and it publishes
no syllabus — one honest job of a data researcher is to audit the discard pile, not just the keeps.
`,
    },
    {
      type: 'ponder',
      question: md`The perplexity filter hides a strange loop: you need a language model to choose
the data to train the language model. Pull the thread before revealing: whose taste seeds that
loop — and if next year's filter is built from this year's model, what happens to the taste over
generations?`,
      answer: md`The seed is some earlier corpus — often Wikipedia-and-books-flavored — whose
statistics define what the reference model finds "normal." That's the bootstrap: there is no
model-free way to score text at scale, so *somebody's* earlier editorial choices are baked into
the instrument. And yes, the loop can amplify them. Text unlike the seed — dialects, oral
registers, new genres, other Englishes — scores as high-perplexity "noise" and gets filtered out;
the next model trains on the filtered corpus, finds such text even more surprising, and if that
model becomes the next filter, the window of "normal" ratchets narrower each generation. This is
the editorial-bias amplification concern, and it is an honest open problem — not a solved one, not
a doom certainty. The working mitigations are procedural, not magical: audit what filters *remove*
(not just what they keep), seed reference models from deliberately diverse corpora, keep unfiltered
pools so decisions are reversible, and measure dialect and domain coverage as a first-class metric.
Hold this thought — it returns with teeth in the synthetic-data section, where the text itself,
not just the filter, starts coming from the model.`,
    },
    {
      type: 'text',
      md: md`
## The mixture — a corpus is a recipe

Filtered web text is the flour, but no one bakes with flour alone. A real pretraining set is a
**recipe** — deliberate proportions of distinct sources — and the proportions are a first-class
research knob, tuned as carefully as any learning rate. A representative recipe (illustrative
numbers):

| source | share | why it's there |
|---|---|---|
| filtered web | ~60% | breadth: the world's registers, topics, facts |
| code | ~15% | structure — see below |
| books + academic | ~10% | long-range coherence, careful argument |
| multilingual | ~8% | the other several billion people |
| math | ~4% | scarce, precious, dense |
| other (forums, encyclopedic…) | ~3% | seasoning |

Three things to know about this table.

**Code is upweighted far beyond anyone's interest in autocomplete.** The empirical finding —
replicated across labs, mechanism still argued about — is that models fed substantial code get
*better at multi-step reasoning in plain English*. A plausible story: code is the one genre where
sloppy structure is instantly fatal (a program with a vague antecedent doesn't compile), so it is
the densest natural supply of exact, long-range, compositional dependency. But flag that as a
story: the upweighting is justified by measurement, not by the story.

**Multilingual share collides with the tokenizer tax.** Recall 3.1: a BPE tokenizer trained mostly
on English fragments other languages into many more tokens per sentence — so a language that is 8%
of the *bytes* may be dearer per word and effectively underserved. Who the model works for is set
jointly by this row of the recipe and by a tokenizer choice made months earlier. Nothing about
"15T tokens" tells you any of that.

**The recipe is hiding inside next lesson's constants.** Lesson 5.2 will show you the scaling law
$L = E + A/N^{\alpha} + B/D^{\beta}$, where $D$ is a bare token *count*. But train two models on
the same $N$ and the same $D$ with different recipes and you get different fitted $A$, $B$ — even
a different floor $E$, because different text has different entropy (1.5). The law treats data as
a scalar; the scalar is a disguise. When 5.2 warns you that "fitted constants vary by data," this
table is what's varying.

**And how many times may you reread?** If your dedup was honest, your unique pool may be smaller
than your training budget — so you rerun **epochs** over the same data. The measured answer to
"how much is a reread worth?" (one careful study of data-constrained scaling; treat the numbers as
reported findings): up to about **4 epochs, repeated tokens are worth nearly as much as fresh
ones**; past that the value decays fast, and by a dozen-plus epochs rereads are nearly worthless.
So the recipe gains a second column: scarce precious sources (math, curated text) get read 3–4
times; the abundant web, once. Diminishing returns, measured — your reading diet has a compound
interest schedule.
`,
    },
    {
      type: 'example',
      title: 'planning the diet — a 15T recipe worked end to end',
      md: md`
Your run needs $D = 15$T token-presentations (5.2 will derive where such budgets come from — today
it's given). Your vaults, after the funnel: 9T of filtered web, 0.75T of code, 0.5T of
books+academic, 1T multilingual, 0.125T of math. Unique total: **11.375T** — short of budget. The
epoch rule (≤4 rereads ≈ fresh) closes the gap, spent on the scarce and precious:

| source | unique | epochs | served | share |
|---|---|---|---|---|
| filtered web | 9.0T | 1 | 9.0T | 60% |
| code | 0.75T | 4 | 3.0T | 20% |
| books + academic | 0.5T | 3 | 1.5T | 10% |
| multilingual | 1.0T | 1 | 1.0T | 6.7% |
| math | 0.125T | 4 | 0.5T | 3.3% |
| **total** | **11.375T** | — | **15.0T** | 100% |

Sanity checks a researcher runs by reflex: served total hits budget (9+3+1.5+1+0.5 = 15 ✓); no
source exceeds 4 epochs ✓; overall effective epochs $15/11.375 \approx 1.3$ — comfortably fresh.
Notice the inversion: math is 1% of your holdings but 3.3% of the diet, because rereads are cheap
value *below* the 4-epoch ceiling and math is worth them.

Two footnotes that make this real. First: nobody trusts a table like this on paper — labs **ablate
the recipe** by training small (say 1B-parameter) models on candidate mixtures and comparing, then
extrapolate the winner up the scaling curve: 5.2's methodology, aimed at the menu. Second: the
table above is the diet for *most* of the run — the final stretch gets its own special menu, and
that's the next section.
`,
    },
    {
      type: 'text',
      md: md`
## Annealing — the last word

Here's a question that sounds like trivia and turns out to steer frontier training runs: *does it
matter in what order the model eats?*

Derive the answer from what you know about SGD (1.6). Every gradient update overwrites a little of
what previous updates built — weights are shared, and three months of training is millions of
consecutive edits to the same page. So ask: which lessons survive best? The ones with the **least
subsequent editing** — the ones learned *last*. What the model saw in week one has been smeared by
twelve weeks of later gradients; what it saw in the final week has barely been touched. Late data
gets the last word.

Labs exploit this deliberately. The end of a run is the **anneal**: the learning rate decays
toward zero (the model taking small, careful steps as it settles into its minimum — you'll watch
this phase on 5.3's training-run dashboard), and *simultaneously* the data mixture shifts hard
toward the highest-quality sources — curated text, math, code, the top shelf of the filtered
corpus. The reported result (empirical, replicated across several public efforts, mechanism only
partly understood): a small final serving of top-quality data during the anneal yields benchmark
gains far out of proportion to its token count.

Enjoy how backwards this is. Human curricula put the fundamentals first and the advanced material
last. Pretraining curricula put the *best* material last — because the machine remembers dessert.
When 5.3's dashboard shows you the anneal phase, you'll know it isn't just the learning rate
landing the plane: it's the chef timing the best course for the moment the diner remembers.
`,
    },
    {
      type: 'text',
      md: md`
## Synthetic data — the ouroboros

Now the strangest aisle of the pantry: text written by models, fed to models. This is not
hypothetical or fringe — it is real, growing, and the subject of the field's most interesting
open fight.

**The case for.** The phi lineage of models made the point loudly: train a small model on
deliberately generated "textbook-like" explanations and exercises, and it punches far above its
parameter count on reasoning benchmarks (with the usual benchmark-reading caveats). Math is even
better suited: generate a million worked problems, keep only those whose final answers a symbolic
checker verifies. Code is best of all: generate programs *with their own unit tests* and keep the
ones that pass. And reasoning traces — sample many chains of thought, keep the ones that reach
verified answers, train on the keepers — are the data engine behind the current generation of
reasoning models. Notice the common trick, because it answers 3.6's oldest complaint: the training
objective rewards *plausible* text, but a checker rewards *correct* text — **verification turns
generation into curation.** The model proposes; an external judge disposes; only the survivors
become food.

**The case against — model collapse.** Run the loop naively — train generation $n{+}1$ on
generation $n$'s raw outputs, replacing the data each time — and the distribution measurably
narrows. Why? You already know: a model is a *lossy* compressor (1.5), and lossy compression
discards the rare stuff first. Sampling from the model undersamples the tails; training on those
samples bakes the loss in; iterate, and **the tails die first**, generation by generation, until
outputs converge toward a repetitive center. This has been demonstrated cleanly in controlled
experiments — recursive fine-tuning degrading into near-gibberish — and it is a real theorem-shaped
worry, not scaremongering.

**The honest reconciliation — and the actual fight.** Look at the experimental settings. The
collapse results *replace* data each generation and recycle *unfiltered* output — deliberate,
maximal recursion. The success stories *accumulate* synthetic alongside persistent human data and
admit only *verified, curated* output. Follow-up work suggests accumulation alone blunts most of
the collapse; verification changes the character of the data entirely. Curated synthetic is a
teacher writing fresh exercises; naive recursion is photocopying photocopies. Both camps are right
*about their own settings* — the live research question is which setting the real ecosystem
resembles. And the ecosystem is answering on its own schedule: post-2023 web crawls contain
ever-more model-written text, unlabeled, so even "human" web data is quietly part-synthetic now —
which means the filtering problem from earlier in this lesson is quietly becoming a
synthetic-detection problem too. Open problem; nobody has the clean answer; you are entering the
field at a good time.
`,
    },
    {
      type: 'ponder',
      question: md`Design exercise — do it on paper before revealing. You are handed 1 billion raw
crawled pages and a fixed compute budget for cleaning them. Sketch *your* pipeline: which stages,
in which order? Justify the ordering — why does each stage sit where it sits?`,
      answer: md`The organizing principle: **cost per document × documents remaining.** Run the
cheapest, highest-kill-rate tests first so expensive tests see a small pool. A defensible order:
(1) *extraction* (must happen first — everything downstream scores text, not HTML); (2) *language
ID* (microseconds per document, kills half the pool); (3) *cheap heuristics* — length, symbol
ratio, repetition (nearly free, kills obvious junk); (4) *exact dedup* by hash (cheap, big kill on
a raw crawl); (5) *model-based quality* — perplexity or classifier (a forward pass per document:
your most expensive per-document stage, so it goes late, on the smallest pool); (6) *near-dedup*
with MinHash sketches last-ish, since its corpus-wide index is cheapest to build over the smallest
surviving set. But hold the order loosely — dedup placement is *genuinely debated*: dedup-early
saves quality-filter compute on copies; dedup-late lets quality scores inform which copy to keep;
and one public pipeline measured that deduplicating *within* crawl snapshots beat aggressive
global dedup — more dedup was not monotonically better. Two habits matter more than any fixed
order: measure what each stage removes (audit the discard pile), and remember the only ground
truth for a pipeline is a *trained model* — real teams settle A-vs-B by training small models on
each candidate output and reading the difference. If your answer had cheap-first reasoning plus
those two habits, you designed it like a professional; the specific permutation is negotiable.`,
    },
    {
      type: 'text',
      md: md`
## Running out — the arithmetic 5.2 will cite

One more piece of accounting, and it's the one that ends the lesson on a cliff.

How much high-quality human text *exists*? Estimates vary widely — flag every number in this
paragraph as an estimate with generous error bars — but careful attempts put the stock of public,
human-written text around a few hundred trillion tokens, of which the slice that survives a
quality funnel like this lesson's is some tens of trillions. Frontier runs already consume 15–40T
tokens each. Put those side by side: **consumption is within one order of magnitude of the
usable stock.** Not "will be someday" — is, now.

And the two curves are not friends. Humanity's output of good public text grows a few percent a
year — we write no faster than we ever did. Compute budgets grow orders of magnitude per
generation, and next lesson's allocation arithmetic says data appetite grows as the square root of
compute: a 100× budget wants 10× the tokens. A resource growing at percent-per-year, chased by an
appetite growing at multiples-per-generation, gets caught. Soon.

The field's four responses, each already in motion, each with its lesson attached: **reread** (the
4-epoch rule buys a one-time factor of ~4); **synthesize** (the ouroboros, ridden with verifiers);
**go multimodal** (video, audio, and images hold vastly more raw bits than text — how much of it
converts into language-shaped capability is an open empirical question); and **spend at
answer-time instead** — inference-time compute, the new scaling axis 5.2 closes on: when the data
axis saturates, the game board grows a new dimension rather than ending.

For scale, one last Fermi you'll redo in the exercises: a devoted human reader — 50 pages a day,
every day, for 60 years — gets through roughly 400–500 *million* tokens in a lifetime. A 15T-token
run is about **30,000 reading lifetimes**, ingested in a season. The bottleneck of the next decade
is not FLOPs and it is not parameters. It is that the models have very nearly finished reading us.

## What you now own

1. **The frame:** a model is a lossy compression of its corpus (1.5's identity, taken seriously) —
   change the data, change the mind; "15T tokens of web text" is a stack of editorial decisions.
2. **The funnel:** petabytes of crawl → ~1–5% of extracted text survives → tens of TB, 10–15T
   tokens; the discards outnumber the survivors thirty to one.
3. **Dedup, load-bearing:** 1,000 copies = 1,000 aligned gradient votes for recitation (near-zero
   bits, stolen capacity, regurgitation risk) plus benchmark contamination (5.6's problem, born
   here) — and MinHash sketches make near-dedup possible at all: compare fingerprints, not
   documents.
4. **Quality filtering:** taste classifiers and the perplexity band (1.5's instrument, pointed at
   data) — and the honest part: every filter is curriculum design in a lab coat, with documented
   biases and a bootstrap loop whose taste can amplify.
5. **The recipe:** proportions are a research knob (code ↑ reasoning, empirically; multilingual
   meets 3.1's tokenizer tax); rereads obey the ~4-epoch rule; the recipe hides inside 5.2's
   fitted constants.
6. **The anneal:** last-seen is least-overwritten, so the best data goes last — why 5.3's
   dashboard has an anneal phase.
7. **Synthetic and the runway:** verification turns generation into curation; collapse is real in
   the naive-recursion setting and blunted by accumulation + curation (live fight); and the
   high-quality web is within an order of magnitude of eaten.

Next lesson: with $D$ demystified, the curve that decides how much of this diet to buy — the
scaling law that labs bet billions on, and the Chinchilla arithmetic that rebalanced the industry.
`,
    },
  ],
  questions: [
    {
      id: 'm5-l1-q1',
      kind: 'mcq',
      prompt: md`Modern pipelines treat deduplication as load-bearing rather than janitorial. Which
statement best captures *why*?`,
      options: [
        'Duplicates waste storage and training compute, and disk is the binding constraint at web scale',
        'A document repeated 1,000 times delivers 1,000 aligned gradient votes toward reciting that exact text — training memorization instead of generalization — and duplicated eval items silently inflate benchmark scores',
        'Identical documents in one batch make their gradients accumulate and cause the optimizer to diverge',
        'Deduplication mainly serves privacy compliance; its effect on model quality is negligible',
      ],
      answer: 1,
      explain: md`Both harms flow from the objective: the loss is a corpus *average*, so a
1,000-fold duplicate carries 1,000-fold weight, and the cheapest way to satisfy 1,000 aligned
votes is to store the string — near-zero bits per copy (1.5), stolen capacity, extractable
verbatim. Add contamination: popular text is copied text, and eval items ride in on copies (5.6).
Option A tempts because it is *true* — copies do waste compute — but storage is cheap and that
alone would make dedup a cost optimization, not a quality intervention. Option D tempts because
privacy/regurgitation *is* a real dedup motive, but the quality effect is measured and large, not
negligible. Option C is technical-sounding noise: duplicates do not make SGD diverge.`,
    },
    {
      id: 'm5-l1-q2',
      kind: 'numeric',
      prompt: md`Funnel arithmetic. A crawl yields 50 billion extracted documents. Language ID
keeps 30 billion. Quality filtering keeps 6 billion of those. Deduplication leaves 2 billion. What
**percent** of the original 50 billion survives the whole funnel?`,
      answer: 4,
      tolerance: 0.2,
      explain: md`Survival multiplies stage by stage: $0.6 \times 0.2 \times 1/3 = 0.04$, i.e.
$2/50 = 4\%$. Right in the lesson's representative 1–5% band. Read the funnel backwards for the
real lesson: 96% of candidate documents were *decisions* — the corpus is defined at least as much
by what the editors removed as by what the architecture later does with the survivors.`,
    },
    {
      id: 'm5-l1-q3',
      kind: 'numeric',
      prompt: md`Epochs arithmetic. Your run's budget calls for 15T token-presentations, but your
deduplicated, filtered pool holds only 5T unique tokens. How many **epochs** over the pool does
the budget imply?`,
      answer: 3,
      tolerance: 0.05,
      explain: md`$15\text{T} / 5\text{T} = 3$ epochs. Under the reported ~4-epoch ceiling —
repeated tokens are worth nearly as much as fresh ones up to about 4 rereads (one careful
data-constrained-scaling study; treat as a reported finding) — so this plan is viable. Stretch the
budget to 25T with the same pool and you would be at 5 epochs, past the knee, buying tokens whose
value is visibly decaying: time to shop for data, synthesize it, or spend the compute elsewhere.`,
    },
    {
      id: 'm5-l1-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** Starting from the training objective — minimize the
*average* cross-entropy over the corpus (1.5) — derive why 1,000 copies of one document push a
model toward memorizing it. Your derivation must include: (1) what duplication does to that
document's weight in the loss (think of the loss as an expectation over the *empirical*
distribution of the corpus); (2) why the model's cheapest response is recitation rather than
understanding; (3) what the model spends, in 1.5's compression terms, and what that costs the rest
of the corpus; (4) two distinct downstream harms.`,
      rubric: md`**(1) Weighting:** the loss is an average over corpus documents — an expectation
under the corpus's *empirical* distribution. A document present 1,000 times among $10^9$ has
probability $10^{-6}$ under that empirical distribution instead of $10^{-9}$: its loss term (and
its gradient) is amplified 1,000-fold, and all 1,000 contributions push in the *same aligned
direction*, unlike 1,000 diverse documents whose pushes largely scatter.

**(2) Cheapest response:** driving that one document's probability toward 1 cuts 1,000 loss terms
at once — the highest loss-reduction-per-parameter move available — and the way to give one exact
sequence probability ~1 is to store it: recitation. Understanding (modeling the *patterns* the
document instantiates) reduces each of those 1,000 terms only partially, so pure gradient
economics favors the lookup table.

**(3) Compression cost:** a memorized string costs ~0 bits per copy (1.5) — spectacular
compression of *this* corpus and zero generalization; the parameters and gradient signal spent
storing it are stolen from patterns that would transfer, and the falling loss overstates real
progress (the metric is being gamed by the duplicate).

**(4) Harms (any two):** verbatim regurgitation of private or copyrighted text (extraction risk
rises steeply with duplication count — measured); benchmark contamination if the duplicate carries
eval items; generation biased toward replaying the string; corrupted loss-based comparisons
between runs.

Full credit requires the *weighting* step (1) explicitly — "duplicates cause memorization" recited
without the empirical-distribution argument is exactly the recall this question forbids.`,
    },
    {
      id: 'm5-l1-q5',
      kind: 'mcq',
      prompt: md`A pipeline scores every document with a small reference language model and keeps
only documents in a **middle band** of perplexity, discarding both tails. Why discard the
**low**-perplexity tail?`,
      options: [
        'Low perplexity means the reference model was trained on that exact document, so keeping it would leak the reference training set into the corpus',
        'Ultra-predictable text is mostly templates, boilerplate, and SEO spam — the reference finds it easy precisely because it carries almost no information per token',
        'Low-perplexity documents are usually in languages the reference model cannot score reliably',
        'Text with low perplexity would make early training loss too small, destabilizing the learning-rate schedule',
      ],
      answer: 1,
      explain: md`Perplexity is average surprise per token (1.5), so ultra-low perplexity means
near-zero information per token: cookie banners, templated SEO chum, the ten-thousandth copy of a
boilerplate pattern. (The high tail is the opposite failure — OCR garbage and word salad the
reference cannot predict at all; informative human prose lives between.) Option A tempts because
"seen in training" *does* lower perplexity — but the low tail is dominated by text that is
predictable by its *nature*, not by leakage, and the fix for leakage is dedup, not this filter.
Option C is backwards: unfamiliar languages score *high*, which is exactly how an English-seeded
filter quietly deletes other languages — the editorial-bias point. Option D is schedule-flavored
nonsense. And carry the caveat: the band is defined by the reference model's taste, so "mid
perplexity" means "normal *to it*" — an instrument reading, not an objective fact about quality.`,
    },
    {
      id: 'm5-l1-q6',
      kind: 'written',
      prompt: md`**The audit memo.** Your team trains a quality classifier: positives = Wikipedia
and published books; negatives = random crawl. It will keep the top 10% of the web. Before it
runs, write the audit: (1) predict two specific classes of *good* text this filter will wrongly
discard, each with its mechanism; (2) design a concrete measurement to detect each; (3) state the
tradeoff honestly — what you risk by loosening the filter, and why "just keep everything" is not
an answer either.`,
      rubric: md`**(1) Predicted casualties (any two, with mechanism):** dialectal Englishes (e.g.
African-American English) and informal registers — the classifier learned *register resemblance to
Wikipedia/books*, not quality, so fluent text in another register scores as noise (documented in
audits of real pipelines); forum/Q&A/oral-style text — conversational structure is far from the
encyclopedic positives even when the content is expert; non-Western topics and entities —
underrepresented in the positive set, so topical unfamiliarity leaks into the "quality" score;
technical niches whose jargon the positives lack. Mechanism must be stated as *resemblance to
chosen positives*, not "the classifier makes mistakes."

**(2) Measurements (one per casualty, concrete):** slice classifier score distributions by
dialect/register/topic (via an independent tagger) and compare pass rates; **sample the discard
pile** and human-review it — auditing what is *removed*, not just what is kept, is the key
professional move; train small models on "kept" vs "kept + rescued slice" and compare on
dialect/domain benchmarks — the trained-model A/B being the only ground truth.

**(3) The honest tradeoff:** loosening admits spam, SEO chum, and boilerplate whose removal is
*why* filtered corpora measurably beat raw ones — keep everything and you are back to the raw
crawl the filter exists to fix. The defensible position is not "no editor" (impossible at scale)
but an *accountable* editor: measured, published filtering choices with audits of the discards.
Bonus credit for noticing the regress: the audit's own dialect/topic taggers embed judgments too —
so the remedy is transparency and measurement, not a fantasy of neutrality.`,
    },
    {
      id: 'm5-l1-q7',
      kind: 'mcq',
      prompt: md`Late in a training run, labs shift the data mixture toward their highest-quality
sources (the anneal phase). The main reason the *end* of training has outsized influence on the
final model:`,
      options: [
        'The learning rate is at its highest near the end, so late batches move the weights the most',
        'Whatever is learned last suffers the least subsequent overwriting — earlier lessons are smeared by months of later gradient updates, but the final data has no updates after it',
        'Optimizer momentum has accumulated by the end, amplifying late gradients',
        'Curriculum-ordering theorems require the hardest examples to be presented last',
      ],
      answer: 1,
      explain: md`SGD shares one set of weights across millions of consecutive edits, so early
lessons get partially overwritten by everything after them; the last data faces no later
interference — it gets the last word. Option A tempts by supplying a plausible mechanism with the
sign flipped: during the anneal the learning rate is at its *lowest*, decaying to zero — late
influence survives *despite* small steps, because nothing comes after to erase it. Option C
garbles what momentum is (a smoothed recent-gradient average, not a run-long amplifier), and
option D appeals to theorems that do not exist — the anneal's benefit is an empirical, replicated
finding whose mechanism is only partly understood, and honest flags beat invented theorems.`,
    },
    {
      id: 'm5-l1-q8',
      kind: 'written',
      prompt: md`**The forensics memo.** After adding a large new web dump to pretraining, your 34B
model jumps from 61% to 74% on a famous public math benchmark. Before anyone announces anything,
write the plan: (1) the hypothesis you must rule out first; (2) three concrete checks — at least
one at the *corpus* level and one at the *behavior* level; (3) which verdict each outcome pattern
supports; (4) one sentence on why this failure mode is structural rather than bad luck.`,
      rubric: md`**(1) Hypothesis:** contamination — benchmark items (or paraphrases of them)
entered training inside the new dump, so the jump measures recall, not ability.

**(2) Checks (need ≥3, spanning both levels):** *Corpus:* n-gram overlap search — scan the dump
for long (e.g. 13-token) exact matches against benchmark questions and answers; near-duplicate
sweep — MinHash-style sketch comparison between benchmark items and the dump, catching reworded
copies exact matching misses (paraphrase-awareness is required for full credit). *Behavior:*
perplexity probe — the model's perplexity on benchmark items vs freshly written items of matched
difficulty (suspiciously low on the former = it has seen them); completion probe — feed the first
half of a benchmark problem and check for verbatim continuation of the exact wording or answer;
twin-benchmark test — evaluate on newly written or post-cutoff items of the same skill.

**(3) Verdict mapping:** corpus hits + low perplexity + verbatim completions + jump *vanishing* on
the twin = contaminated, retract; clean corpus scan + normal perplexity + jump *persisting* on
fresh items = plausibly real (the dump may genuinely teach math); mixed signals = quantify —
report scores with matched items excluded.

**(4) Structural:** benchmarks are published on the web and the web is the training set, so
leakage is the *default* state of a web-scale corpus — which is why contamination checks belong in
the pipeline, not in the post-mortem (5.6 builds the standing defenses).`,
    },
    {
      id: 'm5-l1-q9',
      kind: 'numeric',
      prompt: md`**Fermi (paper first, calculator last):** a devoted human reader gets through
about 50 pages a day, every day, for 60 years, at roughly 400 tokens per page. Lifetime reading,
in **millions of tokens**? (Generous tolerance — the order of magnitude is the prize.)`,
      answer: 440,
      tolerance: 300,
      explain: md`$50 \times 365 \approx 18{,}000$ pages/year; $\times 60 \approx 1.1$ million
pages; $\times 400 \approx 4.4 \times 10^8$ — about **440 million tokens**, call it half a
billion for a truly relentless reader. Now the payoff: a 15T-token run is $15{\times}10^{12} /
4.4{\times}10^{8} \approx$ **34,000 reading lifetimes**, consumed in one season. Two morals: the
model has already out-read every scholar who ever lived, combined many times over — and no
plausible army of human writers can refill the tank, which is why the field's responses to data
exhaustion are epochs, synthesis, multimodality, and inference-time compute rather than "write
more."`,
    },
    {
      id: 'm5-l1-q10',
      kind: 'mcq',
      prompt: md`Which statement best reflects the current evidence in the model-collapse debate?`,
      options: [
        'Training on any model-generated text degrades models; synthetic data is a dead end',
        'Model collapse has been experimentally refuted, so recursive training on your own outputs is safe',
        'Naive recursion — each generation replacing its data with its own unfiltered outputs — measurably narrows distributions (tails die first); but accumulating data and using verified, curated synthetic alongside human anchors behaves very differently, and which regime the real ecosystem resembles is open',
        'Collapse only affects image models; discrete text tokens are immune',
      ],
      answer: 2,
      explain: md`Both camps have real evidence *about their own settings*. Collapse: controlled
experiments where generation $n{+}1$ trains on generation $n$'s raw outputs, replacing data each
round — distributions narrow, tails vanish first (a lossy compressor undersamples its tails —
1.5's logic recursing). Against doom: accumulation experiments (synthetic *added* to persistent
human data) blunt most of the effect, and production synthetic is verifier-filtered — teacher
writing exercises, not photocopier photocopying photocopies — with phi-lineage and verified
math/code results as the working evidence. Option A tempts because it is the collapse paper's
finding stripped of its experimental conditions; option B tempts as the equal-and-opposite press
release. The honest state is a live fight over which setting the model-text-flooded web now
resembles.`,
    },
    {
      id: 'm5-l1-q11',
      kind: 'numeric',
      prompt: md`Near-dedup arithmetic. Two documents are shingled into 3-word shingles: A has 9
distinct shingles, B has 9 distinct shingles, and they share 6. What **Jaccard similarity**
(shared over total distinct) should their MinHash sketches converge to?`,
      answer: 0.5,
      tolerance: 0.02,
      explain: md`Union $= 9 + 9 - 6 = 12$ distinct shingles (do not double-count the shared 6 —
the classic slip); $J = 6/12 = 0.5$. A 128-hash sketch would agree in about 64 of 128 positions,
give or take ~5 — and that fingerprint comparison, never touching the documents themselves, is
what turns an impossible $5 \times 10^{19}$ pairwise problem into an overnight job on 10 billion
documents.`,
    },
    {
      id: 'm5-l1-q12',
      kind: 'written',
      prompt: md`**Explain to a 12-year-old** (write it out — the Feynman test): a kid asks, "You
said the AI reads the whole internet. So why do the builders throw most of it away first? Isn't
more reading always better?" Your answer must land four things: (1) why the AI *becomes* what it
reads; (2) why repeated pages are worse than merely useless; (3) why some pages are junk food; (4)
the uncomfortable part — a person had to decide what counts as good, and that choice shapes the
AI. No jargon without kid-words first. Inventing your own analogies beats borrowing the lesson's.`,
      rubric: md`Grade the teaching, not the vocabulary. A "nailed it" answer:

1. **Becomes what it reads** — grounded in something the kid knows: the AI has no teacher and no
   world, only its reading pile, so the pile is the whole diet; you are what you eat, and it is
   *only* what it reads.
2. **The repetition trap** — must convey *memorize-the-words vs learn-the-idea*: hear the same
   page a thousand times and you end up chanting it from memory instead of understanding anything
   — a thousand identical flashcards teach less than a thousand different ones, and the chanted
   page might even contain the answers to the test we later grade the AI with (sneaky bonus if the
   kid version lands the cheating point).
3. **Junk food** — some of the internet is ads, spam, copies of copies, and pages written by
   robots to trick search engines; reading a million of those teaches you to *write spam*, not to
   think — so more reading is only better when the reading is worth it.
4. **The uncomfortable part, honestly** — a person (really, a program built by persons) decided
   what "good reading" means, and pages that just *sound different* from the deciders' favorites
   — like how different families or places talk — can get thrown out too; so the choosers'
   taste ends up inside the AI, which is why the builders have to keep checking the throw-away
   pile.

**Jargon audit:** "token," "dedup," "corpus," "perplexity," "classifier," "benchmark
contamination" — any of these unexplained caps the grade at partial. Jargon-hiding is the exact
failure this exercise exists to catch.`,
    },
  ],
}
