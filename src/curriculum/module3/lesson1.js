// Module 3, Lesson 1 — Tokenization (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm3-l1',
  title: '3.1 Tokenization — the machine’s alphabet',
  subtitle:
    'Module 2 audited an embedding table with 32,000 rows and never asked the awkward question: who chose those 32,000 symbols — and what happens to every string that isn’t one of them? The answer turns out to be a compression trick from 1994, and it quietly explains half the strange behaviors of modern LLMs.',
  sections: [
    {
      type: 'text',
      md: md`
## The 32,000 question

In Module 2's parameter audit, the very first line item was an embedding table: $32{,}000$ rows,
$4096$ numbers each, for Llama. We counted its parameters and moved on. Go back and look at what
that table *demands*. A lookup table has a fixed number of rows. Before the model can read a single
character, every text on Earth must be converted into a sequence of row numbers — ids into a
**fixed, finite, frozen list of symbols**, decided once, before training, forever.

But language is not fixed, finite, or frozen. New words are coined weekly. Typos exist. So do
Python, Korean, emoji, chemical names, URLs, and DNA strings like ACGTACGT. Whatever list you
choose, tomorrow someone will type something that isn't on it.

> So here is the puzzle: **what finite list of symbols do you hand the machine**, knowing it must
> read an unbounded language through them?

There are two obvious answers. Both are catastrophic — in *opposite* directions. Working out
exactly *how* they fail is what tells us what the right answer must look like. Let's do it.

## Catastrophe one: use characters (or better, bytes)

Take the 256 possible byte values as your alphabet. This solution has one magnificent property:
**nothing is ever out-of-vocabulary.** Every string in every language, every typo, every emoji is,
by definition of UTF-8, a sequence of bytes. The machine is never mute.

Now the bill. In English, the units real tokenizers use average about 4 characters each — so byte
sequences are roughly **4–6× longer** than they need to be. That sounds like a linear
inconvenience. It is not. Lesson 2.2 priced attention: every token attends to every other token —
cost grows like $n^2$. Multiply the sequence length by 4–6 and the attention bill multiplies by
$4^2$ to $6^2$: **16–36× more work** to read the same paragraph. And a "4,096-token context
window" now holds a quarter to a sixth of the *meaning* it could have held.

There's a subtler tax. What does the embedding row for the letter *t* mean? It appears in *the*,
*truth*, *strawberry*, *HTTP* — trillions of contexts, no stable meaning. Each symbol arrives
nearly empty, and the model must spend its early layers just *reassembling spelling into words*
before it can begin on meaning. You're paying rent in depth, the scarcest resource in the stack.

## Catastrophe two: use whole words

Swing to the other extreme: one symbol per word. Now every unit is meaningful — the row for *cat*
gets to mean cat — and sequences are short. The bill arrives in three installments.

**First, the table explodes.** How many words? Count inflections, names, jargon, code identifiers,
and any honest list runs to millions. Price a modest one million rows at Llama's dimensions:

$$1{,}000{,}000 \times 4096 \times 2 \text{ bytes} \approx 8.2 \text{ GB}$$

**8 GB of embeddings alone** — about $30\times$ Llama's actual table
($32{,}000 \times 4096 \times 2 \approx 0.26$ GB) — before one attention layer exists. And the
output end scales identically: the final softmax must score *every* row, every single token.

**Second, the tail starves.** Word frequencies follow Zipf's law: a few words are everywhere,
and roughly half your million rows appear only a handful of times in the training data. A row is
only trained when its word shows up. Those tail rows get a handful of gradient nudges each —
they remain, effectively, random noise wearing a word's name tag.

**Third — and fatally — the first surprise makes the machine mute.** Someone types *teh*. A new
word is coined. A user writes in Korean. There is **no row to look up**. Not "the model performs
poorly" — the model *cannot construct its input*. The conversation ends at the lookup table.

## What the right answer must look like

Read the two failures side by side and the specification writes itself. Bytes fail by making
sequences long and symbols empty. Words fail by making the table huge, mostly untrained, and
brittle. So we want units *between* letters and words: **common strings get their own symbol;
rarer strings get spelled out in a few pieces; and in the worst case anything decomposes all the
way to bytes**, so nothing is ever unreadable.

But that raises the real question: who decides which strings are "common enough" to deserve a
symbol? Not a linguist with a whiteboard. The training data itself should decide — and there is a
beautifully dumb way to let it. Notice that "give frequent strings short encodings" is the
definition of **compression**. So run a greedy compressor: start from bytes, find the pair of
adjacent symbols that occurs most often, fuse it into a new symbol, and repeat until you have as
many symbols as you want. That algorithm is **byte-pair encoding (BPE)** — invented in 1994 to
shrink files, resurrected in 2016 for machine translation, and now the alphabet-maker for
essentially every LLM you've used. Let's run it with our own hands.
`,
    },
    {
      type: 'example',
      title: 'BPE by hand — watch an alphabet grow',
      md: md`
Our entire training corpus, twelve words:

**low low low lower lower newest newest newest newest widest widest widest**

That is: *low* ×3, *lower* ×2, *newest* ×4, *widest* ×3. Start from characters (real BPE starts
from bytes and runs about a hundred thousand merges over terabytes; we'll run six over twelve
words — same algorithm). Pairs never cross a word boundary, and we break ties by whichever pair we
met first while scanning.

**Round 1 — count every adjacent pair** (weighted by word frequency):

| pair | count | pair | count |
|---|---|---|---|
| e·s | **7** | n·e | 4 |
| s·t | 7 | e·w | 4 |
| w·e | 6 | w·i / i·d / d·e | 3 each |
| l·o | 5 | e·r | 2 |
| o·w | 5 | | |

Check one: e·s occurs in *newest* (×4) and *widest* (×3) — 7. Top count is a tie, e·s and s·t at
7; e·s came first. **Merge e+s → es.** Now *newest* is n·e·w·es·t and *widest* is w·i·d·es·t.

**Round 2:** the pair es·t now occurs in *newest* (4) and *widest* (3) — count **7**, the new
champion (w·e fell to 2: the merge inside *newest* destroyed its copies).
**Merge es+t → est.** The English superlative suffix just crystallized out of arithmetic.

**Round 3:** top counts now: l·o **5**, o·w 5 (tie; l·o first), then w·est, n·e, e·w at 4.
**Merge l+o → lo.**

**Round 4:** lo·w occurs in *low* (3) and *lower* (2) — count **5**. **Merge lo+w → low.**
The word *low* is now a single symbol.

**Round 5:** three-way tie at **4**: n·e, e·w, w·est. First met: n·e. **Merge n+e → ne.**

**Round 6:** ne·w — count **4**. **Merge ne+w → new.** (One more round would fuse new+est into
*newest*; you can see where this is going.)

After six merges, the corpus reads: [low] ×3, [low][e][r] ×2, [new][est] ×4, [w][i][d][est] ×3 —
and our learned vocabulary has grown by: **es, est, lo, low, ne, new**.

Now the punchline. Tokenize the word **lowest** — a word that appears *nowhere* in the corpus.
Apply the merges in the order they were learned: l·o·w·e·s·t → (es) → l·o·w·est → (lo) →
lo·w·est → (low) → **[low][est]**. A never-seen word came out as two symbols, *each of which
means something*: a stem the model has seen 5 times and a suffix it has seen 7 times. That is the
exact trick the whole-word vocabulary could never do — and no one ever gets a "not in table"
error, because in the worst case a string simply stays as raw bytes.

Look at what emerged: *low*, *new*, *est* — a frequency-counter with no idea what English is just
discovered stems and a suffix. That should bother you. It's the next question.
`,
    },
    {
      type: 'ponder',
      question: md`BPE knows nothing about grammar. It never saw a dictionary. It counts adjacent
pairs and greedily fuses the winner — a file-compression algorithm. Why on earth does dumb
frequency-compression keep discovering *morphemes* — meaningful units like *est*, *ing*, *pre*,
*low* — instead of arbitrary frequent junk?`,
      answer: md`Because **morphemes are language's own compression scheme, and BPE is
re-deriving it**. Why does English have a reusable suffix *-est* at all, instead of a completely
unrelated word for every superlative (*low/nadir, new/brand, wide/vast...*)? Because human
languages are under the same pressure BPE is: reusable parts are cheap — to learn, to remember, to
transmit. A part gets reused *because* reuse is efficient, and heavy reuse is precisely what makes
a character pair frequent in text. So the frequency statistics of a corpus are the fingerprint of
the language's existing compression, and BPE, following frequency downhill, walks the same path
and finds the same units. It doesn't understand morphology; it *rediscovers the reason morphology
exists*. One honest caveat: the alignment is imperfect — BPE will happily fuse across a morpheme
boundary when the counts say so (in our corpus, w·e — straddling the seam of *new+est* — was one
count away from winning round 1). It's a statistician, not a grammarian, and it matches linguistics
only as far as linguistics shaped the statistics.`,
    },
    {
      type: 'text',
      md: md`
## Vocabulary size is a dial — so where do you set it?

BPE hands you a dial: stop after 0 merges and you're at bytes ($256$ symbols); never stop and you
approach whole words (millions). Every position trades three quantities against each other:

1. **Table cost, linear in $V$.** Rows aren't free — at 4096 dims in fp16, each row is 8 KB, and
   the output softmax scores all $V$ rows for every generated token. $32$k rows: 0.26 GB.
   $1$M rows: 8.2 GB.
2. **Sequence length, shrinking in $V$ — with diminishing returns.** Each merge shortens the
   corpus by that pair's frequency, and Zipf's law guarantees the frequencies plummet: the first
   thousand merges shorten text dramatically; merge number 200,001 buys almost nothing while
   still costing a full row.
3. **Per-symbol learnability.** A row learns *only* when its token appears. More, rarer tokens
   means thinner training per row — push too far and you're back to the starving tail.

Every real model is one answer to this three-way tug-of-war, and the industry's revealed answer
sits in a surprisingly tight band: GPT-2 used $50{,}257$ tokens; Llama 1 and 2 used $32{,}000$;
GPT-4-era tokenizers run around $100$k; Llama 3 jumped to $128{,}256$; several 2024-and-later
models sit near $200$k. (Ballparks — exact numbers vary by model and year.) Note the drift
*upward*: as models grew, the table became a smaller fraction of total parameters, and serving
long contexts plus more languages made shorter sequences worth paying for.

From this band falls out a reflex you will use weekly for the rest of your career:

> **In English: 1 token ≈ 4 characters ≈ ¾ of a word.** (Equivalently: about 1.3 tokens per word.)

Every context-window spec, every API bill, every "how big is my dataset" estimate runs through
that conversion. Let's install it properly.
`,
    },
    {
      type: 'ponder',
      question: md`Without looking anything up: roughly how many tokens is **one page of an
English novel**? Estimate it *two independent ways* — once through words, once through characters
— and see if they agree. Then cash it in: does a 300-page novel fit in Llama 3's 128k-token
context window?`,
      answer: md`**Via words:** a paperback page holds ~350 words; at ~1.3 tokens per word that's
$350 \times 1.3 \approx 460$ tokens. **Via characters:** ~350 words at ~6 characters each
(counting the space) is ~2,100 characters; at 4 characters per token, $2100 / 4 \approx 525$
tokens. Two routes, no shared steps, both land near **~500 tokens per page** — when independent
estimates agree, believe them; that agreement is the whole point of having two routes. Cash-in: a
300-page novel is $300 \times 500 = 150{,}000$ tokens. Llama 3's window is $128$k — **a full novel
almost fits, and doesn't.** Now you can price any document at a glance: this page ~500, a long
email ~1k, a 10-page paper ~9k (dense pages run bigger), your codebase... measure it, but estimate
it first.`,
    },
    {
      type: 'text',
      md: md`
## The failure-mode menagerie

Here's the payoff for doing tokenization properly: a whole zoo of famous LLM weirdness stops being
"lol, AI is dumb" anecdotes and becomes *derivable from the machinery*. Every exhibit below is the
same fact wearing a different costume: **the model has never seen a character. It lives entirely
inside the alphabet the tokenizer built.**

**Exhibit A: "How many r's in strawberry?"** The model may receive that word as [str][awberry],
or [straw][berry] — whichever way the learned merges happen to slice it. Each token is one row of
the embedding table: a single 4096-dim vector with **no letter-substructure whatsoever**. The
letters are invisible *inside* the symbol — asking the model to count them is asking someone to
count the letters in a word they've only ever *heard spoken*. Honesty requires a flag: newer
models often answer correctly — but from *knowledge*, not *perception*: training text about
spelling (dictionaries, spelling bees, s-t-r-a-w...) taught them facts about letters they still
cannot see.

**Exhibit B: arithmetic on scrambled place value.** The string 12345 may tokenize as [123][45].
Now place value — the entire organizing principle of arithmetic — is destroyed before the math
begins: the token [123] gives no sign that its 1 is worth ten thousand here, and [45] must align
its columns against a symbol, not against digits. This is why several modern models force
digit-by-digit (or fixed groups-of-three) tokenization for numbers: it hands place value back to
*position*, which the model can see, instead of burying it *inside* symbols, which it can't.

**Exhibit C: the haunted trailing space.** To a tokenizer, hello and (space)hello are **different
tokens with different embedding rows** — most English word-tokens come with their leading space
glued on, because that's how words appear in text. So if your prompt ends with a trailing space,
you've *already spent* the space that the natural next token wanted to include — the model is
forced to continue from the rarer no-leading-space tokens, which mostly occur mid-word, and the
completion distribution shifts. Prompts really do behave differently with a trailing space, and
now you know the mechanism, not the superstition.

**Exhibit D: glitch tokens (historical lore, real lesson).** Around 2023, prompting GPT-3 with the
token SolidGoldMagikarp — a Reddit username — produced evasions, insults, and word salad. The
machinery: the *tokenizer* was trained on one web scrape (where that username appeared thousands
of times — enough to earn merges), but the *model* was trained later on a cleaned corpus where it
essentially never appeared. Result: a legitimate row of the embedding table that **training never
touched** — still sitting at its random initialization. Summon the token and you inject untrained
noise at layer 0: undefined behavior, by construction. Newer pipelines check for this, but the
lesson stands: tokenizer and model are trained separately, on different data, and the seam between
them can crack.

**Exhibit E: the multilingual tax.** This one isn't funny. BPE merges are earned by frequency in
the *tokenizer's* training corpus — which has historically been mostly English. English strings
earn long, generous merges; underrepresented scripts never accumulate the counts, so their text
falls through to characters or raw bytes — and non-Latin scripts cost 2–3 UTF-8 *bytes per
character*, so even the fallback floor is worse. The same meaning that costs $1\times$ tokens in
English costs $2$–$10\times$ in Burmese, Amharic, or Telugu under an English-heavy tokenizer.
Let's put real arithmetic on it, because it's a fairness result derived from a compression
statistic.
`,
    },
    {
      type: 'example',
      title: 'the multilingual bill — same meaning, different price',
      md: md`
Take a plain sentence — "The weather is nice today." — about 26 characters, roughly **6 tokens**
under a modern English-heavy tokenizer (check it against the reflex: $26/4 \approx 6.5$ ✓).

Now the same meaning in a script the tokenizer's corpus barely contained. Say ~23 characters of
Telugu. Each character is ~3 bytes in UTF-8, so if almost no merges exist for the script, the
sentence falls through to byte-level: $23 \times 3 \approx 69$ byte-tokens — call it **~60 tokens**
after the few merges that do exist. (Illustrative numbers; the mechanism is exact. Modern
multilingual tokenizers — one big reason vocabularies drifted from 32k toward 128k–200k — cut this
to more like 2–4×.)

Same thought. One user pays 6 tokens, the other ~60. Follow the consequences through systems you
now understand:

- **Money:** APIs bill per token. The Telugu speaker pays up to **10× more per thought**, for the
  life of the product.
- **Context:** lesson 2.2's window is measured in tokens. A 128k window holds ~96k English words —
  or ~10× fewer Telugu words. One user pastes a book; the other, a chapter.
- **Quality:** the model *reasons over* these units. English arrives as words and morphemes;
  Telugu arrives as shards of bytes — each embedding nearly meaningless (catastrophe one, but
  imposed on one language only), with fewer training occurrences per unit on top.

A frequency statistic in a compression algorithm became a pricing policy, a memory budget, and a
quality gap — decided before the model saw its first example. When you design a tokenizer, you are
deciding *whose language gets to be cheap*. That is why tokenizer training data is a genuine
research and policy question, not plumbing.
`,
    },
    {
      type: 'ponder',
      question: md`Suppose a better tokenizer comes along — 128k tokens, beautiful multilingual
coverage. Your lab has a fully trained model that used an old 32k tokenizer. The tokenizer is
"just preprocessing," says a colleague — **can you swap the new one in without retraining the
model?**`,
      answer: md`No — and seeing *why* locks in what an embedding actually is. What does row 4832
of the table mean? Nothing intrinsically: it's 4096 numbers. Its meaning was **carved by
training** — millions of gradient updates that happened *because* the old tokenizer kept mapping
some particular string to id 4832. The id is a handle; the meaning lives in the trained weights
that learned to respond to that row. Swap tokenizers and every string now maps to different ids
with different segmentations: your input text summons rows whose trained meanings belong to
*other strings*. It's not "slightly worse" — it's a scrambled alphabet: every book in the library
re-encoded overnight while the reader's memory stays keyed to the old encoding. And it breaks at
the output end too: the final softmax produces one score per *old* row. The embedding table is a
dictionary written in invisible ink that only the trained weights can read — hand those weights a
new dictionary and they're illiterate. (Real vocabulary transplants exist, but they earn the name:
re-initialize and *retrain* the embeddings with continued pretraining. The marriage of tokenizer
and model survives anything except separation.)`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The dilemma, priced:** bytes — never mute, but 4–6× longer sequences and (via 2.2's $n^2$)
   16–36× the attention bill, with near-empty symbols. Whole words — meaningful and short, but an
   8 GB table at 1M rows, a Zipf-starved tail, and *mute at the first typo*.
2. **BPE, run by your own hands:** greedy pair-merging = compression. From twelve words, six
   merges produced *low*, *new*, *est* — and tokenized the never-seen *lowest* as [low][est].
3. **Why compression finds morphemes:** language already compressed itself — reusable parts exist
   because reuse is efficient — and BPE follows the frequency fingerprint back to them.
4. **The dial and the reflex:** real vocabularies sit at 32k–200k, balancing table cost, sequence
   length, and per-row learnability. **1 token ≈ 4 chars ≈ ¾ word**; a novel page ≈ 500 tokens;
   a 15T-token corpus ≈ 60 TB of text.
5. **The menagerie, mechanized:** strawberry (letters invisible inside symbols), arithmetic
   (place value buried), trailing spaces (different rows entirely), glitch tokens (untrained rows
   summoned), and the multilingual tax (merges follow frequency; frequency follows the corpus;
   the corpus decides whose language is cheap).
6. **The marriage:** token ids are handles; meaning lives in weights trained against one specific
   tokenizer. No swaps without retraining.

You now know exactly what the machine's alphabet is and where it came from. So picture the moment
of generation: the forward pass ends, and the model hands you one score for *every row of this
table* — 128,256 numbers, one per symbol we just learned to build. Turning that pile of scores
into the *one token that gets spoken* — greedily, randomly, somewhere cleverly in between — is a
surprisingly deep decision, and it's next: lesson 3.2, sampling.
`,
    },
  ],
  questions: [
    {
      id: 'm3-l1-q1',
      kind: 'mcq',
      prompt: md`A user asks an LLM how many r's are in "strawberry" and it confidently answers
two. What does the machinery of this lesson say actually went wrong?`,
      options: [
        'The model’s attention span is too short to hold all the letters of a long word at once',
        'Language models are fundamentally incapable of counting anything',
        'The model receives the word as tokens like [str][awberry] — each a single embedding row with no letter-substructure — so the r’s are not visible objects it could count',
        'The letter r is too rare in the training data for the model to have learned it well',
      ],
      answer: 2,
      explain: md`The word arrives as one or two symbols — single rows of the embedding table —
and letters simply are not parts of what the model perceives; it's counting the letters of a word
it has only ever heard spoken. Option A tempts because attention limits are real — but this input
is two tokens long; span is not the issue. Option B is refuted by the same models doing arithmetic
and counting *tokens-worth* of things fine. Option D confuses frequency with visibility: r is one
of the most common letters in English — the model has just never *seen* one. Honest flag from the
lesson: newer models often get this right via memorized spelling knowledge (dictionaries and
spelled-out words in training text) — knowledge about letters, still not perception of them.`,
    },
    {
      id: 'm3-l1-q2',
      kind: 'numeric',
      prompt: md`On paper — a fresh mini-corpus for BPE: **hug hug hug hugs pug** (that's *hug* ×3,
*hugs* ×1, *pug* ×1). Starting from characters, count every adjacent pair (weighted by word
frequency; pairs don't cross word boundaries). What is the **count of the most frequent pair** —
the number BPE writes down when choosing its first merge?`,
      answer: 5,
      tolerance: 0.001,
      explain: md`The pair u·g appears in *hug* (×3), *hugs* (×1), and *pug* (×1): count
$3 + 1 + 1 = \mathbf{5}$. Runner-up is h·u at 4 (it misses *pug*). So the first merge is
u+g → ug, and next round h·ug stands at 4. Notice the habit being trained: BPE is nothing but
this counting, repeated — if you can do one round on paper, you understand the algorithm that
built GPT-4's alphabet.`,
    },
    {
      id: 'm3-l1-q3',
      kind: 'numeric',
      prompt: md`Price catastrophe two properly. A whole-word vocabulary of **1 million words**,
each with a 4096-dimensional embedding in fp16 (2 bytes per number): how many **gigabytes** is the
embedding table alone? (Use 1 GB = 10⁹ bytes.)`,
      answer: 8.2,
      tolerance: 0.6,
      explain: md`$10^6 \times 4096 \times 2 = 8.192 \times 10^9$ bytes $\approx \mathbf{8.2}$ GB —
roughly 30× Llama's real 0.26 GB table, spent before a single attention layer exists, and doubled
in effect because the output softmax must score every row on every generated token. And the size
isn't even the worst of it: Zipf's law guarantees most of those million rows are near-untrained,
and the first out-of-vocabulary word makes the machine mute anyway.`,
    },
    {
      id: 'm3-l1-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall — run BPE yourself.** Corpus: **pin pin pin pins spin
spin** (*pin* ×3, *pins* ×1, *spin* ×2). Starting from characters, run the **first three merges**.
For each round, show the full pair-count table, name the winning pair and its count (state a
tie-breaking rule if you need one), and rewrite the corpus in merged symbols. Finish with one
sentence on what kind of units emerged and how the word *pins* tokenizes afterward.`,
      rubric: md`**Round 1 counts:** p·i $= 3+1+2 = 6$; i·n $= 6$; n·s $= 1$; s·p $= 2$. Tie at 6
between p·i and i·n — any stated deterministic rule is fine (the lesson used first-encountered,
giving p·i). **Merge p+i → pi.** Corpus: [pi][n] ×3, [pi][n][s] ×1, [s][pi][n] ×2.

**Round 2 counts:** pi·n $= 6$; n·s $= 1$; s·pi $= 2$. **Merge pi+n → pin** (count 6). Corpus:
[pin] ×3, [pin][s] ×1, [s][pin] ×2.

**Round 3 counts:** pin·s $= 1$; s·pin $= 2$. **Merge s+pin → spin** (count 2). Corpus: [pin] ×3,
[pin][s] ×1, [spin] ×2.

**Interpretation:** whole words emerged — *pin* and *spin* became single symbols purely from
frequency — and *pins* now tokenizes as [pin][s]: stem plus plural suffix, morphology nobody
taught it.

Full credit requires the actual counts at every round (not just the merge list), the tie
acknowledged with a rule, the corpus rewritten each round, and the closing observation. Reciting
"BPE merges frequent pairs" without executing the counts is exactly what this question is not
about.`,
    },
    {
      id: 'm3-l1-q5',
      kind: 'mcq',
      prompt: md`The historical glitch token SolidGoldMagikarp made GPT-3 produce evasions and
word salad when prompted with it. What was the mechanism?`,
      options: [
        'Adversaries deliberately poisoned the training data with that string',
        'The token appeared in the tokenizer’s training corpus (earning it a vocabulary slot) but almost never in the model’s training data — so its embedding row was never trained and stayed near random initialization',
        'The string was longer than the model’s maximum context window',
        'A safety filter matched part of the username and corrupted the output',
      ],
      answer: 1,
      explain: md`Tokenizer and model are trained separately, on different corpora, at different
times. A Reddit username frequent in the tokenizer's scrape earned merges and a row; the model's
cleaned corpus essentially never contained it, so that row sat untouched at its random
initialization. Summoning the token injects untrained noise at layer 0 — undefined behavior, by
construction. Option A tempts because data poisoning is real — but this needed no attacker, just
the seam between two training runs. Options C and D invent machinery: the string is a single
token (that's the whole point), and no filter is required to explain noise-in, noise-out. The
durable lesson: every vocabulary row is a promise that training kept — except the rows where it
didn't.`,
    },
    {
      id: 'm3-l1-q6',
      kind: 'numeric',
      prompt: md`A paragraph is **400 characters** of English. Tokenize it two ways: byte-level
(one symbol per character, near enough for English) versus a BPE vocabulary averaging 4
characters per token. **How many times longer** is the byte-level sequence?`,
      answer: 4,
      tolerance: 0.5,
      explain: md`Byte-level: 400 symbols. BPE: $400 / 4 = 100$ tokens. Ratio: $\mathbf{4\times}$.
The sting is that attention doesn't pay linearly: by lesson 2.2's $n^2$, the same paragraph costs
$4^2 = 16\times$ more attention compute at byte level — and your context window now holds a
quarter of the meaning. That squared penalty is why nobody serious ships byte-level models at
scale today, despite the genuine charm of never being out-of-vocabulary.`,
    },
    {
      id: 'm3-l1-q7',
      kind: 'mcq',
      prompt: md`A prompt ending in "The answer is" sometimes behaves differently from the same
prompt ending in "The answer is " (trailing space). Why?`,
      options: [
        'Tokenizers strip whitespace, so any difference must be random sampling noise',
        'The extra space adds one token, shifting every position and confusing the position encodings',
        'The trailing space pushes the prompt over the context limit',
        'Most word-tokens include their leading space; a trailing space in the prompt forces the continuation to come from no-leading-space tokens — a rarer, differently-distributed set',
      ],
      answer: 3,
      explain: md`In BPE vocabularies trained on real text, hello and (space)hello are different
tokens with different embedding rows, because words almost always arrive with a leading space
attached. End your prompt with a space and you've already spent the space the natural next token
wanted to contain — the model must continue from tokens that *don't* start with one, which mostly
occur mid-word, so the distribution shifts. Option B tempts because it's the right *kind* of
mechanical story — but a one-position shift is exactly what position encodings handle all day; the
issue is which tokens are *reachable*, not where they sit. Option A has it backwards: whitespace
is precious signal (ask any Python-generating model). C is arithmetic fiction — one token.`,
    },
    {
      id: 'm3-l1-q8',
      kind: 'written',
      prompt: md`**Kill the proposal.** A colleague suggests upgrading your lab's fully trained
32k-vocab model by swapping in a shiny new 128k tokenizer — "no retraining needed; the tokenizer
is just preprocessing." Write the short memo that stops this. You must explain: where a token
id's *meaning* actually lives, what the new tokenizer does to the mapping between text and
embedding rows, why the *output* end breaks too, and what a legitimate vocabulary upgrade would
actually require.`,
      rubric: md`The memo must land four points:

1. **Where meaning lives:** row 4832 is just 4096 numbers; its meaning was carved by training —
   gradient updates that happened because the *old* tokenizer consistently mapped one particular
   string to that id. The id is a handle; the meaning is in the trained weights that respond
   to it.
2. **What the swap does:** the new tokenizer segments text differently and assigns different ids,
   so every input now summons rows whose trained meanings belong to *other strings* — a scrambled
   alphabet handed to a reader whose memory is keyed to the old one. Not degraded: incoherent.
3. **The output end:** the final layer produces one score per *old* vocabulary row (and in
   weight-tied models it is literally the embedding table transposed) — the model can only
   *speak* the old alphabet, whatever you feed it.
4. **The legitimate path:** re-initialize embeddings for the new vocabulary and retrain them
   (continued pretraining / vocabulary-transplant methods) — i.e., the upgrade is real but costs
   training, which is exactly what the proposal claimed to skip.

Full credit needs both the input-side and output-side failures plus the meaning-lives-in-weights
argument stated in the writer's own words. Bonus for the lesson's image: the embedding table is a
dictionary in invisible ink that only the trained weights can read.`,
    },
    {
      id: 'm3-l1-q9',
      kind: 'numeric',
      prompt: md`**Fermi estimate (paper first, calculator last):** a Llama-3-class model trains
on roughly **15 trillion tokens**. Using this lesson's reflex for English-heavy text, about how
many **terabytes** of raw text is that? (1 character ≈ 1 byte; generous tolerance — the exercise
is the estimate, not the decimal.)`,
      answer: 60,
      tolerance: 25,
      explain: md`$15 \times 10^{12}$ tokens $\times \approx 4$ characters/token
$\approx 6 \times 10^{13}$ characters $\approx \mathbf{60}$ **TB** of raw text. Sit with how
*small* that is: the text that taught a frontier model fits on about fifteen hard drives from an
office-supply store — roughly 2,000 English Wikipedias. The scarce resources in LLM training are
compute and *good* data — raw bytes were never the bottleneck. This one conversion (tokens ↔
bytes) turns every dataset headline you read into a number you can check.`,
    },
    {
      id: 'm3-l1-q10',
      kind: 'mcq',
      prompt: md`Real LLM vocabularies cluster in the 32k–200k range — orders of magnitude above
256 bytes, orders of magnitude below millions of words. What actually pins them in that band?`,
      options: [
        'It balances three costs: embedding-table size (linear in vocab), sequence length (shrinking with vocab, but with Zipf-diminishing returns), and per-token training signal (rarer tokens learn less)',
        'English contains about 100,000 words, and the vocabulary must match the language',
        'GPU hardware requires vocabulary sizes near powers of two for efficient matrix multiplication',
        'The softmax becomes numerically unstable beyond a few hundred thousand classes',
      ],
      answer: 0,
      explain: md`It's the three-way tug-of-war: every added token costs a row (and a slot in every
output softmax), buys ever-less sequence shortening (Zipf: merge 200,001 is nearly worthless),
and dilutes training signal across rarer symbols. Option B tempts by numerical coincidence — but
vocabularies are mostly *subwords*, cover many languages, and Llama 1 did fine at 32k; there is no
"number of words in English" to match. Option C reverses causality: sizes like 32,000 are chosen
round-ish for convenience, not demanded by hardware. Option D is false — softmax over 200k classes
is routine; over a million it's merely *expensive*, which is option A's first cost wearing a
disguise.`,
    },
    {
      id: 'm3-l1-q11',
      kind: 'written',
      prompt: md`**The multilingual tax, end to end.** Explain, mechanism first: (1) *why* a BPE
tokenizer trained on mostly-English text gives English long tokens while shredding
underrepresented scripts (include the UTF-8 detail that makes the fallback floor worse); (2)
three concrete costs this imposes on a user writing in such a script — one about money, one about
context, one about quality; (3) one honest fix, and what the fix costs (hint: the marriage).`,
      rubric: md`**(1) Mechanism:** BPE merges are earned purely by pair frequency in the
tokenizer's training corpus; an English-heavy corpus means English strings accumulate the counts
and win the merges, while other scripts never do — their text falls through to characters or raw
bytes. The floor is worse than it sounds: non-Latin scripts cost 2–3 UTF-8 bytes *per character*,
so byte-fallback multiplies before meaning even starts. Net: the same meaning costs roughly 2–10×
the tokens.

**(2) Costs:** *money* — per-token billing means up to 10× the price for the same thought, forever;
*context* — a 128k window holds proportionally fewer of that language's words (a book for one
user, a chapter for another); *quality* — the model reasons over byte-shards instead of
words/morphemes: each unit's embedding is nearly meaningless (catastrophe one imposed selectively)
and gets fewer training occurrences on top.

**(3) Fix and its price:** train the tokenizer on balanced multilingual data and/or grow the
vocabulary (one real reason for the 32k → 128k–200k drift) — but a tokenizer is married to its
model, so deploying the fix means retraining or a full vocabulary transplant with continued
pretraining; you cannot patch it into an existing model.

Full credit = mechanism derived (not asserted), all three cost categories with the reasoning
attached, and the fix stated *with* its retraining price. Bonus for the lesson's framing: a
compression statistic became a policy about whose language is cheap.`,
    },
    {
      id: 'm3-l1-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old.** The kid asks: "How does the computer read what I
type?" Explain: (1) that the computer chops text into puzzle pieces from a fixed sticker book of
about a hundred thousand stickers; (2) why the stickers aren't single letters and aren't whole
words either — give the kid the *reason* each extreme fails; (3) why the computer can flub "how
many r's in strawberry" even when it seems smart. Any word a 12-year-old wouldn't know must be
explained in kid-words first — or not used.`,
      rubric: md`Grade the teaching, not the vocabulary:

1. **The sticker book made concrete** — the computer owns a fixed album of ~100,000 stickers
   (some are whole common words, some are word-chunks like -est or str-, some are single letters
   as backup), and everything you type gets rebuilt out of those stickers, nothing else.
2. **Why not letters** — in kid terms: the message gets way too long (like spelling out every
   word aloud, letter by letter), and each letter alone tells you almost nothing about what's
   being said.
3. **Why not whole words** — the list of words never ends (new words get invented, people make
   typos, other languages exist), so one day someone types a word with no sticker and the
   computer is completely stuck — chunks mean it can always build *something*.
4. **Strawberry** — the computer sees the sticker, not what's printed inside it: like knowing a
   word by its sound without ever seeing it written, so "count the r's" isn't a thing it can
   *look at* — sometimes it has memorized the spelling the way you memorize a fact, and then it
   gets it right anyway.
5. **Jargon audit — this is pass/fail:** *token*, *tokenizer*, *vocabulary*, *embedding*, *BPE*,
   or *subword* used without a kid-words explanation first = partial credit at best, regardless
   of correctness. Jargon-hiding is exactly the failure mode this exercise exists to catch.`,
    },
  ],
}
