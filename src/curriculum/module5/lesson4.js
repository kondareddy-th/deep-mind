// Module 5, Lesson 4 — SFT: teaching the costume to fit (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm5-l4',
  title: '5.4 SFT — teaching the costume to fit',
  subtitle: md`The pretraining run of 5.3 ends with a magnificent alien: a model that can continue any document ever written and answer no question at all. Between that alien and the assistant you talk to sits the cheapest, highest-leverage stage in the whole pipeline — and a genuine puzzle about how a droplet of data can change a model's species.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

The run is over. In storage sits the base-model checkpoint from 5.3 — fifteen trillion tokens of
reading distilled into weights. It is, by any honest measure, magnificent: it can continue legal
briefs, Rust code, Tang-dynasty poetry, and your unfinished email, each in flawless style. Now ask
it something.

**You:** What is the capital of France?
**Base model:** What is the capital of Spain? What is the capital of Italy? What is the capital of...

It's not being cheeky. It is doing *exactly* what it was trained to do: this text looks like a quiz
sheet, and quiz sheets continue with more quiz questions. You met this creature in 3.5 — the
document-completer wearing no costume, the actor with no role assigned. It contains the knowledge
(Paris is in there, 3.6 showed you where knowledge lives) but has no reason to *deploy* it the way
you want.

Now the puzzle. The stage that fixes this — **supervised fine-tuning**, SFT — uses a few hundred
thousand example conversations. Call it 500,000 examples averaging 500 tokens: $2.5 \times 10^{8}$
tokens, against the $1.5 \times 10^{13}$ the model was pretrained on. That is **one part in
60,000** — about 0.002% of the model's lifetime reading. And after this homeopathic droplet of
data, the machine changes species: it answers questions, follows instructions, refuses politely,
formats its work. Fifteen trillion tokens built a document-completer; a sixty-thousandth more made
it an assistant.

How can 0.002% of the data do *that*? Hold the question — deriving its answer is this lesson, and
the answer will also tell you precisely what SFT *cannot* do, which is where the real research
lives.
`,
    },
    {
      type: 'text',
      md: md`
## The mechanics — almost nothing changes

First, demystify the machinery, because the machinery is the punchline's setup: **SFT is just more
training.** Same cross-entropy loss you derived in 1.5. Same Adam, same gradient clipping (1.6) —
with a learning rate an order of magnitude or two smaller (around $10^{-5}$ against pretraining's
$3 \times 10^{-4}$ peak) and one to three epochs instead of one endless pass. No new objective, no
new algorithm. What changes is only *the data*: instead of raw documents, curated pairs of
(prompt, ideal response), rendered into text with the chat template from 3.5 — special tokens
fencing off system, user, and assistant turns.

One genuinely new mechanic appears, and it's worth deriving rather than decreeing: the **loss
mask**. Cross-entropy training scores the model's prediction at *every* token position — that's
what "predict the next token" means. But think about what each position's gradient teaches. A
gradient at a position inside the *assistant's response* teaches: given this conversation so far,
produce answers like this. A gradient at a position inside the *user's question* teaches: given
this conversation so far, **write user questions like this one**. That second skill costs the same
compute and is worth nothing — worse than nothing, as the first ponder will show. So SFT masks the
loss: multiply each position's loss term by $m_t \in \{0, 1\}$, with $m_t = 1$ only on response
tokens. Masked positions contribute exactly zero gradient — no parameter moves in the direction of
imitating users.

One subtlety, easy to fumble in an interview: masking removes prompt tokens as *targets*, not as
*inputs*. They still sit in the context window, still flow through attention, still condition every
response prediction. The model reads the question with full comprehension; it just never spends
gradient learning to *write* questions.
`,
    },
    {
      type: 'ponder',
      question: md`Suppose an engineer forgets the mask and trains on every token of every
conversation. Two-part question, and the second part is the sinister one: (1) what does the model
learn that it shouldn't? (2) What happens to the *loss curve on the dashboard* — and why does that
make this bug worse than a crash?`,
      answer: md`(1) The gradient now also optimizes "predict the user's next token": the model
spends capacity learning to write plausible user questions, typos, mid-thought rambles and all —
and at inference it will be that much more inclined to *continue the user's turn* instead of
answering it, the exact disease SFT was hired to cure.

(2) Here's the sinister part: the loss curve *improves*. A chat transcript is full of highly
predictable tokens the mask normally excludes — the fixed system preamble, the template's special
tokens, boilerplate question-openers — and unmasking floods the average with these near-zero-loss
positions. The dashboard number goes **down** while the thing you actually care about gets worse.
A crash is honest; this bug lies. It's your first taste of a theme 5.6 will make central: *a
metric is a proxy, and proxies can be gamed by accident before anyone games them on purpose.*
The habit to install: when a number improves surprisingly, ask what the number actually measures —
before celebrating.`,
    },
    {
      type: 'example',
      title: 'the mask, by hand',
      md: md`
One training example, rendered through the chat template (3.5), with token counts:

| segment | tokens | masked? |
|---|---|---|
| system preamble + special tokens | 12 | yes — loss weight 0 |
| user turn ("Explain why the sky is blue...") | 48 | yes — loss weight 0 |
| assistant response | 180 | **no — loss weight 1** |

Total positions: $12 + 48 + 180 = 240$. Positions carrying gradient: $180$, i.e. **75%** of the
compute pays for learning-to-answer, 0% for learning-to-ask. (The forward pass still runs over all
240 — conditioning is not optional.)

Now the accountant's view of the whole dataset: 500,000 such examples at ~500 tokens is
$2.5 \times 10^{8}$ tokens. Against pretraining's $1.5 \times 10^{13}$:

$$\frac{2.5 \times 10^{8}}{1.5 \times 10^{13}} \approx 1.7 \times 10^{-5} \approx 0.002\%.$$

A pretraining run at 5.3's throughput chews through this entire dataset in **about ninety
seconds**. That is the whole species-changing stage, measured in compute. The puzzle stands: how?
`,
    },
    {
      type: 'text',
      md: md`
## The resolution — you are not filling the library

Here is the resolution, and once you see it, half of post-training makes sense.

**SFT does not teach the model knowledge.** It can't — one part in 60,000 could never compete with
the pretraining corpus, and 3.6 already showed you that facts live in weights shaped by trillions
of tokens. What the base model lacks is not capability. Watch: prompt the *base* model with a
transcript — "The following is a conversation with a brilliant, helpful assistant. User: What is
the capital of France? Assistant:" — and it completes "Paris," fluently, because *documents like
that exist* and it learned to continue them. The assistant was already inside the alien, as one
mode among thousands: alongside quiz-sheet mode, YouTube-comment mode, legal-boilerplate mode.
A base model is a superposition of every writer it has ever read.

So SFT's real job is **selection, not addition**: take one mode that pretraining already built and
make it the *default* — stabilize it so it doesn't need a cleverly-worded preamble, doesn't drift
back into quiz-sheet mode after three turns, and always speaks through the chat template's
costume (3.5). You are not filling the library; the library took fifteen trillion tokens and three
months of 16,000 GPUs (5.3). **You are training the librarian** — the persona at the front desk
who decides how the library answers. And that is why a droplet suffices: a persona is a *small*
piece of information. Format, tone, turn-taking, when-to-refuse — these are kilobytes of
behavioral policy, not terabytes of world knowledge. The data volume matches the information
content of what's actually being taught.

The empirical flag for this picture (treat it as evidence, not gospel): the LIMA result — roughly
a thousand *excellent*, diverse, hand-polished examples produced an assistant competitive with
ones tuned on far larger, sloppier datasets. If SFT were teaching content, a thousand examples
would be absurd; for teaching a *format*, it's about right. The working rule that follows, and
that every lab's data team lives by: for SFT, **quality and diversity dominate quantity** — every
example is a vote for "answers should look like *this*," and a thousand clean votes beat a
million noisy ones.
`,
    },
    {
      type: 'text',
      md: md`
## What SFT can and cannot do — with the failure derived

The librarian picture makes sharp predictions. Score them honestly.

**SFT is excellent at:** response *format* (markdown habits, structure, length calibration), style
and persona, tool-call syntax (emitting exactly the JSON your scaffolding parses), refusal habits,
and chain-of-thought habits — showing worked reasoning before answers, cashing in 3.6's insight
that the tokens a model writes are the compute it gets to think with.

**SFT is bad at adding knowledge — and not neutrally bad. Derive the failure:** suppose the
training set includes QA pairs about facts the base model never learned (say, events after its
data cutoff). Gradient descent will still drive the loss down — the model can memorize 5,000
specific answers. But ask what *generalizes* from those gradients. The reusable pattern across all
5,000 examples is not the facts (each appears once); it is the **format**: "when asked an
X-shaped question, produce a confident, fluent, Y-shaped answer." For the pattern "consult your
knowledge and answer," the knowledge lookup fails on unknown facts — but the confident-answer
*shape* fires regardless. You have trained the model to **bluff**: to produce the costume of a
correct answer whether or not the contents exist. Connect this to 3.6's citation-shaped holes —
the model that emits perfectly formatted citations to papers that don't exist — and flag it
honestly: this is a real, documented phenomenon, not a thought experiment; fine-tuning on facts
the model doesn't know has been shown empirically to *increase* hallucination on other questions.
The librarian analogy holds to the bitter end: teach the librarian to always answer smoothly, and
she'll answer smoothly about books the library doesn't own.

**SFT also has a dosage problem: catastrophic forgetting**, known in this context as the alignment
tax. Fine-tune aggressively on a narrow slice — high learning rate, many epochs, one domain — and
the gradients that sculpt the new behavior overwrite circuitry serving everything else: the
math-tutoring specialist gets worse at code and general chat. The standard mitigations each make
mechanical sense: **mix general data** back into the SFT stream (keep gradients pointing at old
skills too), **lower the learning rate** (smaller steps disturb less), **fewer epochs** (stop
re-carving what's already carved). And a fourth mitigation is dessert: constrain *how much of the
model is allowed to change at all* — which is the next section.
`,
    },
    {
      type: 'ponder',
      question: md`Your SFT set contains QA pairs about events after the pretraining cutoff —
facts the base model *cannot* know. Trace the gradient's lesson precisely: what pattern do these
examples reinforce, what was *not* placed in the weights, and why does that combination raise
hallucination elsewhere? Then design the honest fix — training the model to say "I don't know" —
and explain why implementing it is unexpectedly delicate.`,
      answer: md`The gradient's lesson: across all such pairs, the shared, reusable regularity is
"question of this shape → confident answer of that shape." The *contents* of each answer appear
once and mostly memorize rather than generalize (3.6: knowledge that sticks comes from
pretraining-scale repetition and diversity, not from one exposure). So the transferable update is
pure format — answer confidently — decoupled from whether retrieval succeeds. On new questions
where the model's internal lookup comes up empty, the trained reflex still fires: fluent,
confident, wrong. Bluffing, installed by gradient descent — and empirically documented: tuning on
unknown facts measurably increases hallucination.

The honest fix: include training pairs where the *correct response is* "I don't know" — teach the
refusal-of-confidence format alongside the confidence format. The delicacy: which questions get
the IDK label? They must be questions **this particular model actually cannot answer** — label a
question IDK that the model *does* know, and you've taught it to withhold knowledge (sandbagging);
label a question answerable that it can't answer, and you're back to bluffing. So building the
dataset requires *knowing what the model knows* — probing its knowledge boundary, model by model,
checkpoint by checkpoint. Mapping that boundary reliably is open research, which is why "just
teach it to say IDK" is easy to say and hard to ship.`,
    },
    {
      type: 'text',
      md: md`
## LoRA — fine-tuning without paying the full bill

Now price the operation. Full fine-tuning updates every parameter, so it pays 4.1's full memory
bill: 16 bytes per parameter of weights-plus-Adam-state — for a 70B model, **1.12 terabytes** of
GPU memory, the same bill as pretraining itself. Step back and let that offend you: we just
established that SFT teaches a *persona* — kilobytes of behavioral policy — and the invoice says
"terabyte." The cost is sized to the machinery, not to the change. Surely the change itself is
small enough to parametrize directly?

That intuition is **LoRA** (Low-Rank Adaptation), and you've held both halves of it for a while:
1.2 previewed low-rank matrices — big matrices whose content squeezes through few dimensions —
and 4.4's QLoRA used the frozen-base trick for memory. Here's the idea done properly. Freeze every
pretrained weight matrix $W$. Next to it, place a bypass: the update we *would* have learned,
written as a product of two skinny matrices,

$$W' = W + BA, \qquad B: d \times r, \quad A: r \times d, \quad r \ll d,$$

with $r$ around 8–64, and only $A$ and $B$ trainable ($B$ starts at zero, so training begins
exactly at the base model — nothing changes until the gradients say so). The bet in one sentence:
**the *change* a fine-tune needs is low-rank** — not the weights themselves (pretrained $W$ is
essentially full-rank; that library is dense), just the *edit* to them.

Run the arithmetic on one $4096 \times 4096$ matrix. Full update: $4096^{2} \approx 16.8$ million
trainable numbers. LoRA at $r = 16$: $2 \times 4096 \times 16 = 131{,}072$ — **128 times fewer**.
And the savings cascade, because 4.1 taught you the real bill is the optimizer: Adam's 16
bytes/param now applies *only to the adapters* — the frozen base needs no master weights, no
momentum, no variance. Gradient memory, ditto. QLoRA (4.4 owns it — one line here) compounds the
trick by storing the frozen base in 4 bits. And at inference, $BA$ can be *merged* into $W$ once
— add the matrices — so the deployed model pays zero extra latency. The adapter itself is a file of
tens of megabytes (~40M numbers at 2 bytes each is ~80 MB for the 70B example below): a persona
you can email.

When does LoRA suffice, and when must you pay for full fine-tuning? File this as practice lore
with honest fuzz, not theorem: **LoRA shines exactly in SFT's sweet spot** — format, persona,
style, tool syntax — because (rank intuition, ponder 3) a persona is a *consistent, low-dimensional
shift*. **Full fine-tuning earns its bill** when the change is deep and broad: continued
pretraining on a trillion new-domain tokens, teaching a new language, major behavioral overhauls.
In between sits a gray zone where labs run both and compare — nobody has a clean rule, and anyone
who quotes you one is selling something.
`,
    },
    {
      type: 'example',
      title: 'the LoRA bill, itemized',
      md: md`
Price adapting a 70B model, taking a $4096 \times 4096$ matrix as the specimen and $r = 16$.

**Per matrix:** full update $= 4096^{2} = 16{,}777{,}216$ trainables; LoRA $= 2 \times 4096
\times 16 = 131{,}072$. Ratio: **128×**.

**Whole model:** call it ~300 adapted matrices at roughly specimen size (order-of-magnitude
accounting — exact counts vary by architecture and which matrices you adapt):

$$300 \times 131{,}072 \approx 3.9 \times 10^{7} \; \text{trainables} \; \approx 40\text{M} \; \approx 0.06\% \text{ of } 70\text{B}.$$

**Training-state memory** (4.1's 16 bytes per *trainable* param):

- Full fine-tune: $70 \times 10^{9} \times 16 = 1.12$ **TB** — a multi-node cluster before the
  first token flows.
- LoRA: $4 \times 10^{7} \times 16 = 6.4 \times 10^{8}$ bytes $\approx$ **0.64 GB** — pocket
  change next to the frozen weights themselves, which QLoRA (4.4) then squeezes to ~35 GB in
  4-bit. Total: one 48 GB workstation GPU (the QLoRA paper's own demo), or a pair of 24 GB
  consumer cards — plus activation memory, which grows with sequence length.

Ratio of training-state bills: $1.12 \times 10^{12} / 6.4 \times 10^{8} \approx$ **1,750×**. So
what? Full-FT SFT of a 70B is a cluster job for a well-funded lab; LoRA SFT of the same model fits on a
single workstation GPU. That three-orders-of-magnitude collapse is *why* a thousand fine-tuned
variants of every open model exist — the experiment became affordable to everyone (4.6's model
hubs are full of exactly these adapters).
`,
    },
    {
      type: 'ponder',
      question: md`The rank intuition. LoRA at $r = 16$ forces every update to a $4096$-dimensional
map through a 16-dimensional bottleneck — the edit can only *mix sixteen directions' worth* of new
behavior. Why is that plausibly *enough* for persona and format, yet plausibly *not enough* for
installing a library of new facts? (Recall what 2.5 said FFN layers are.)`,
      answer: md`Think about the *shape* of each change. A persona is a **consistent, global,
low-dimensional shift**: "be more formal," "structure answers," "prefer refusing X" are a handful
of directions applied the same way across all inputs — much like 1.1's discovery that relationships
are directions (king − man + woman). A few dozen well-chosen directions genuinely can carry
"helpful assistant," which is why $r = 16$ works embarrassingly well for SFT-style changes.

New knowledge has the opposite shape. 2.5 showed FFN layers acting as **key–value memories**:
individual facts live as many separate, scattered, mutually unrelated associations — thousands of
independent lookup entries. Independent means not compressible into a shared low-dimensional
pattern: storing a thousand unrelated facts wants a **high-rank** edit, roughly one new direction
per fact, and a 16-direction bottleneck simply lacks the room. Flag with full honesty: this is an
*intuition*, not a theorem — measured effective ranks of full fine-tune updates, and how they vary
by task, are active empirical research, and the boundary between "style-shaped" and
"knowledge-shaped" changes is exactly where practice lore lives. But the intuition earns its keep:
it predicts LoRA's sweet spot (format) and its weak spot (facts) — and both predictions match what
practitioners see.`,
    },
    {
      type: 'text',
      md: md`
## Where the examples come from — and the assembly line's real shape

If quality-per-example dominates (LIMA), the craft question becomes: who writes half a million
*excellent* conversations? Three sources, in rising order of scalability:

**Human-written demonstrations.** Hired writers compose ideal responses from scratch — the
original recipe (reported: the first instruction-tuned assistants were built on exactly this), and
still the gold standard for subtle judgment. Expensive: a good demonstration takes an expert
many minutes, and quality control is its own discipline.

**Model-generated, human-curated.** Use a model to draft responses (or whole conversations —
the self-instruct lineage), then have humans review, fix, and filter. The human's minutes shift
from writing to judging, which is faster — the beginning of a deep idea (models helping supervise
models, the constitutional lineage) that 5.5 will pick up properly.

**Whatever the source, the quality bar is absolute**, because of what SFT *is*: every example is a
vote for "answers should look like *this*." The gradient cannot tell your best writer's work from
an intern's rushed Friday afternoon — it averages all the votes. One systematic flaw across your
dataset (hedging, padding, confident bluffing) becomes the model's personality. Data curation *is*
the product decision.

**And the pipeline isn't a pipeline — it's a loop.** The tidy story is pretrain → SFT → done.
Modern reality (reported practice across labs): SFT and preference tuning (5.5, next door)
interleave and repeat — SFT to establish the format, preference optimization to sharpen judgment,
more SFT on fresh demonstrations mined from the improved model, around again. When a model card
(4.6) offers you *base* and *instruct* checkpoints, you now know exactly what sits between them:
this whole lesson, run several times over, with 5.5 stirred in.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The puzzle, resolved:** 250M tokens against 15T — one part in 60,000, ninety seconds of
   cluster time — changes the species because SFT performs *selection, not addition*: the
   assistant mode already existed in the base model (it read those documents too); SFT makes it
   the stable default. You train the librarian, never the library — and a persona's information
   content is small, so the data can be small. LIMA (empirical flag): a thousand excellent
   examples compete with mountains of mediocre ones; quality and diversity beat quantity.
2. **The mechanics:** same cross-entropy (1.5), same Adam (1.6), chat template (3.5), lower
   learning rate, few epochs — plus the **loss mask**: response tokens are targets, prompt tokens
   are conditioning only; 75% of a typical example carries gradient, and forgetting the mask
   *improves the dashboard while degrading the model* — your first lying metric (5.6 will
   generalize).
3. **The honest ledger:** SFT excels at format, style, tool syntax, refusal and chain-of-thought
   habits (3.6); it cannot add knowledge well — the bluffing failure, *derived*: unknown-fact
   pairs generalize the confident format without the content (documented, and rhyming with 3.6's
   citation-shaped holes); overdo it and the alignment tax arrives (mitigations: mix general
   data, lower lr, fewer epochs).
4. **LoRA, done properly:** the bet that the *change* is low-rank — $W + BA$, $r = 16$ turning
   16.8M trainables per matrix into 131k (**128×**), the whole 70B's training state from 1.12 TB
   into ~0.64 GB (**~1,750×**), mergeable at inference for zero latency; QLoRA (4.4) shrinks the
   frozen base too. Sweet spot: exactly SFT's persona-shaped changes; deep or knowledge-heavy
   changes still argue for full fine-tuning (lore, honestly fuzzy).
5. **The data reality:** demonstrations are votes; humans write, models draft and humans curate
   (self-instruct / constitutional lineage — 5.5's opening act); the pipeline is a loop, and
   "instruct" on a model card (4.6) names this loop's output.

SFT shows the model what a good answer looks like — one worked example at a time, every example
weighted equally. But it has no way to say "*this* answer is better than *that* one," and
"better" is where the remaining magic lives. Next lesson: preference optimization — teaching the
model to want what we prefer.
`,
    },
  ],
  questions: [
    {
      id: 'm5-l4-q1',
      kind: 'mcq',
      prompt: md`An SFT dataset of ~250M tokens — one 60,000th of the pretraining diet — converts
a document-completer into a working assistant. The best explanation of why so little data
suffices:`,
      options: [
        md`SFT uses a much higher learning rate, so each token moves the weights proportionally further`,
        md`Chat-formatted data is far more information-dense than web text, packing equivalent knowledge into fewer tokens`,
        md`SFT adds no new capability — it selects and stabilizes an assistant *mode* the base model already contains; a format-plus-persona is a small piece of information, so small data matches the job`,
        md`SFT only updates the final layers of the network, which are small enough to learn from few examples`,
      ],
      answer: 2,
      explain: md`The base model already completes assistant-transcript documents fluently —
prompt it into that mode and Paris comes right out. SFT's droplet works because it teaches a
*default*, not a library: you train the librarian, and a persona is kilobytes of policy, not
terabytes of facts. Option A tempts because the learning rate *is* different — but it's
*lower* (around $10^{-5}$ vs $3 \times 10^{-4}$), the opposite of the story. Option B tempts
because curated data *is* higher quality (5.1's theme) — but no density miracle covers a
60,000-fold gap in volume. Option D describes something SFT simply doesn't do — standard SFT
updates all layers (constraining the *update's rank* is LoRA, a separate choice).`,
    },
    {
      id: 'm5-l4-q2',
      kind: 'numeric',
      prompt: md`A training example renders to 12 system-and-template tokens, 48 user tokens, and
180 assistant-response tokens. With standard response-only loss masking, what **fraction** of the
example's token positions carry gradient? (Answer as a decimal.)`,
      answer: 0.75,
      tolerance: 0.03,
      explain: md`$180 / (12 + 48 + 180) = 180/240 = 0.75$. The other 25% of positions are
conditioning only: read in the forward pass, attended over, and never scored — the model learns
*from* them but is never trained to *write* them. Worth keeping in your head for cost accounting
too: you pay full forward-pass compute on 100% of tokens and collect training signal on 75% —
a tax that grows in long multi-turn transcripts with big system prompts.`,
    },
    {
      id: 'm5-l4-q3',
      kind: 'mcq',
      prompt: md`An engineer forgets the response mask and fine-tunes on *all* tokens of every
conversation. The most likely observed outcome:`,
      options: [
        md`Training diverges within a few hundred steps`,
        md`Nothing changes — masking is a compute optimization, not a behavioral one`,
        md`Average training loss looks *better* than the masked baseline — predictable template and boilerplate tokens dilute it downward — while the model develops a habit of continuing user turns instead of answering them`,
        md`The loss on assistant tokens rises to compensate for the extra positions`,
      ],
      answer: 2,
      explain: md`Two effects, one nasty combination: behaviorally, gradients now teach
question-writing, nudging the model back toward document-completion of the user's turn; on the
dashboard, the newly unmasked positions are disproportionately easy (fixed system preambles,
special tokens, formulaic openers), so the *average* falls and the run looks healthier than the
baseline. A metric lying by dilution — 5.6's theme, previewed. Option B tempts because the loss
is "the same formula either way" — but *which positions* get scored is precisely what decides
what's being taught. Option A overdramatizes: nothing about extra targets destabilizes training.
Option D imagines a coupling between positions' losses that cross-entropy doesn't have.`,
    },
    {
      id: 'm5-l4-q4',
      kind: 'mcq',
      prompt: md`Your SFT set includes 5,000 QA pairs about events *after* the pretraining cutoff.
Training loss on them falls nicely. The most likely effect on the finished model:`,
      options: [
        md`It learns those 5,000 facts and generalizes to related post-cutoff knowledge`,
        md`It learns a format lesson decoupled from content — "answer X-shaped questions with confident Y-shaped answers" — increasing fluent hallucination on questions whose facts it lacks`,
        md`The loss on those pairs won't actually decrease, since the base model lacks the knowledge`,
        md`It learns to recognize post-cutoff questions and decline them`,
      ],
      answer: 1,
      explain: md`Derive it: the reusable regularity across the 5,000 pairs is not the facts (each
occurs once — it memorizes the specific pairs but 3.6 taught that durable, connected knowledge
comes from pretraining-scale repetition) but the *shape*: confident fluent answering. That reflex
fires even when internal lookup fails — trained bluffing, and empirically documented: fine-tuning
on unknown facts measurably increases hallucination elsewhere. Option A tempts because loss
genuinely falls (memorization) — the trap is reading falling loss as acquired knowledge. Option C
is exactly backwards for the same reason: gradient descent will happily memorize. Option D
describes the *deliberate, delicate fix* (teaching calibrated IDK), which never happens by
accident — it requires knowing what the model doesn't know.`,
    },
    {
      id: 'm5-l4-q5',
      kind: 'numeric',
      prompt: md`LoRA on one $4096 \times 4096$ weight matrix with rank $r = 16$: how many
**trainable parameters** in the adapter pair $B$ ($4096 \times 16$) and $A$ ($16 \times 4096$)?`,
      answer: 131072,
      tolerance: 2000,
      explain: md`$2 \times 4096 \times 16 = 131{,}072$ — against $16{,}777{,}216$ for the full
matrix: **128× fewer**. The general shape is worth owning: $2dr$ versus $d^{2}$, a ratio of
$d/2r$ — the wider the model, the better the deal at fixed rank. And 4.1's lesson multiplies the
win: Adam's 16 bytes per *trainable* parameter now applies to 131k numbers instead of 16.8M, per
matrix, which is what collapses the training-state bill by three orders of magnitude.`,
    },
    {
      id: 'm5-l4-q6',
      kind: 'written',
      prompt: md`**Derive, don't recall — what the mask does to the gradient.** On paper: (1)
write the SFT loss for one example as a masked sum over token positions of the per-position
cross-entropy (1.5), defining the mask $m_t$; (2) show what happens to the gradient contribution
of a masked position, and state precisely what role prompt tokens still play (targets vs
conditioning — be exact); (3) derive what *additional* objective the unmasked version optimizes,
and predict — with the mechanism — the direction the dashboard loss moves if the mask is dropped,
versus the direction behavior moves.`,
      rubric: md`**(1)** $L = \sum_t m_t \cdot \left( -\log p_\theta(x_t \mid x_{<t}) \right)$
with $m_t = 1$ on assistant-response positions and $0$ elsewhere (system, user, template tokens).

**(2)** Gradient is linear in the sum: $\nabla_\theta L = \sum_t m_t \nabla_\theta
(-\log p_\theta(x_t \mid x_{<t}))$ — masked positions contribute exactly zero; no parameter moves
toward predicting them. Crucial precision: masked tokens remain in the *conditioning* $x_{<t}$ of
every later term — they are read, attended over, and shape response predictions; they are just
never *targets*. An answer that says "prompt tokens are ignored" misses the load-bearing
distinction and caps at partial credit.

**(3)** Unmasked adds $\sum_t (1 - m_t)(-\log p_\theta(x_t \mid x_{<t}))$: the objective
"model the user and template turns" — gradient spent learning to write questions. Dashboard
prediction with mechanism: average loss *falls* relative to the masked baseline, because the
added positions skew easy (fixed preambles, special tokens, boilerplate) and dilute the mean;
behavior prediction: increased tendency to continue user turns / generate questions — the
document-completer leaking back. Full credit requires both directions *and* both mechanisms; the
whole point is that the metric and the behavior move opposite ways.`,
    },
    {
      id: 'm5-l4-q7',
      kind: 'mcq',
      prompt: md`LoRA's core wager, stated precisely, is that:`,
      options: [
        md`Pretrained weight matrices are approximately low-rank, so they can be compressed without loss`,
        md`The *update* a fine-tune needs — the difference between adapted and base weights — is approximately low-rank, even though the base weights themselves are not`,
        md`Storing the frozen base in 4-bit precision loses no meaningful capability`,
        md`Only the attention layers need to change during fine-tuning`,
      ],
      answer: 1,
      explain: md`The bet is about $\Delta W$, never about $W$: pretrained matrices are essentially
full-rank — the library is dense — but the *edit* for a format-and-persona change is a consistent,
low-dimensional shift, expressible as $BA$ with $r$ in the dozens. Option A is the tempting
misreading (and it's false — if $W$ were compressible that way, 4.4 would have led with it);
keeping the two claims straight is the difference between explaining LoRA and reciting it. Option
C is QLoRA's *separate* wager about quantization (4.4), frequently bundled but logically distinct.
Option D is a deployment detail — which matrices get adapters is an empirical choice, not the
principle.`,
    },
    {
      id: 'm5-l4-q8',
      kind: 'numeric',
      prompt: md`An SFT dataset: 500,000 examples averaging 500 tokens. Pretraining used 15T
tokens. The SFT set is what **percentage** of the model's total training data? (Answer in percent;
e.g. one-tenth of one percent would be 0.1.)`,
      answer: 0.0017,
      tolerance: 0.001,
      explain: md`$2.5 \times 10^{8} / 1.5 \times 10^{13} \approx 1.7 \times 10^{-5}$, i.e.
**0.0017%** — one part in 60,000, about ninety seconds of work at a frontier cluster's
pretraining throughput (5.3). Keep this number loaded: it is the strongest single piece of
evidence that SFT is mode-selection rather than knowledge-installation — nothing this small could
compete with the library; it can only appoint the librarian.`,
    },
    {
      id: 'm5-l4-q9',
      kind: 'written',
      prompt: md`**The memo.** A product manager asks you to teach the company's brand-new 2026
product catalog to your assistant "with a quick SFT pass — we have 3,000 QA pairs ready." Write
the memo: (1) the mechanism by which this specific plan backfires — derived, not asserted; (2)
what SFT *is* the right tool for in this project; (3) two better routes to the actual goal, with
the mechanism that makes each work; (4) if leadership insists on SFT anyway, the one modification
you'd fight for.`,
      rubric: md`**(1)** The catalog post-dates pretraining, so the base model lacks the
knowledge; 3,000 pairs will memorize (loss falls, demo looks good on the exact pairs) while the
*generalizing* gradient is the format "answer product questions confidently" — installing fluent
bluffing on the thousands of catalog questions not in the set, and measurably raising
hallucination pressure (the documented unknown-facts effect; 3.6's citation-shaped holes as the
rhyme). Must be argued as a gradient/generalization story, not just "SFT can't add knowledge."

**(2)** SFT legitimately owns: the answer *format* for product questions, tone, tool-call syntax,
escalation and refusal habits — the costume.

**(3)** Any two, each with mechanism: **retrieval** — put the catalog in the context window at
inference (3.6: in-context text needs no weight change; always current, updatable by editing a
document); **continued pretraining** on catalog-plus-general data with appropriate mixing (5.1's
mixture logic; knowledge enters weights the way knowledge actually enters weights — bulk exposure
— with general data mixed in to hold off the alignment tax); honorable mention: SFT that teaches
*tool use* to query a product database — knowledge lives outside the model entirely.

**(4)** The fight-for modification: pair SFT with retrieval so demonstrations teach "consult the
provided catalog excerpt, cite it, and say so when it's not there" — and include IDK-formatted
examples for out-of-catalog questions (with the honest caveat that choosing IDK labels requires
knowing what the model can't answer). Full credit = mechanism-level (1), a non-empty (2), two
mechanisms in (3), and a (4) that shows the ponder's delicacy was absorbed.`,
    },
    {
      id: 'm5-l4-q10',
      kind: 'written',
      prompt: md`**The alignment-tax postmortem.** After SFT on 40,000 legal-drafting
conversations — 5 epochs at an aggressive learning rate — your model drafts contracts beautifully
and has gotten measurably worse at math, coding, and casual conversation. Explain (1) what
happened in the weights, mechanically; (2) three standard mitigations, each with the mechanism by
which it helps — not just the name; (3) which *single* mitigation you'd try first for the rerun,
with your reasoning.`,
      rubric: md`**(1)** Catastrophic forgetting / alignment tax: every gradient step for five
epochs pointed at one narrow objective; parameters implementing math, code, and chat circuitry
were repurposed — nothing in the loss protected them, and 3.6's picture applies: capabilities not
represented in the gradient have no vote, and shared circuitry gets overwritten by whatever *is*
voting.

**(2)** With mechanisms (any three): **mix general data** into the SFT stream — restores a
gradient voice for the old skills, so updates must find parameters that serve both; **lower the
learning rate** — smaller steps stay nearer the pretrained optimum, disturbing less of the
existing structure; **fewer epochs / early stopping** — 40k examples seen five times is the
format lesson learned five times over, all marginal gradient going to overfit-and-overwrite;
**LoRA or similar constrained updates** — a rank-$r$ bottleneck (and frozen base) bounds how much
of the network can move at all, with the merge-back option preserving deployment.

**(3)** Any defensible choice with reasoning. A strong pick: data mixing first, because the
failure is "old skills had no vote," and mixing fixes the cause where lr/epoch cuts merely shrink
the damage — ideally combined with dropping to 1–2 epochs (nearly free). Full credit demands
mechanisms in (2) — naming three tricks without the *why* is exactly the recall this course
refuses to reward.`,
    },
    {
      id: 'm5-l4-q11',
      kind: 'numeric',
      prompt: md`**Fermi, at real scale:** full fine-tuning a 70B model holds training state at 16
bytes/param (4.1). LoRA at $r = 16$ across ~300 adapted matrices trains ~40M parameters, with the
same 16 bytes each. Roughly what is the **ratio** of the two training-state memory bills
(full ÷ LoRA)?`,
      answer: 1750,
      tolerance: 800,
      explain: md`Full: $70 \times 10^{9} \times 16 = 1.12$ TB. LoRA: $4 \times 10^{7} \times 16
\approx 0.64$ GB. Ratio $\approx 1.12 \times 10^{12} / 6.4 \times 10^{8} \approx$ **1,750×** —
three orders of magnitude, which is the difference between a multi-node cluster reservation and
a job on a single 48 GB GPU (with the frozen base 4-bit quantized, 4.4). Any answer in
the low thousands shows the right physics; the point of the estimate is the *class* of the answer
— this is why the open-model ecosystem (4.6) overflows with LoRA adapters and not with full
fine-tunes.`,
    },
    {
      id: 'm5-l4-q12',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old.** The kid asks: "You said the AI read basically
the whole internet to get smart. Then you said you fixed it up with a tiny bit more teaching. How
can a tiny bit more do anything, if the internet-sized part is what made it smart?" Explain: (1)
what the internet-sized reading actually built; (2) why the machine was still unhelpful
afterward, with a concrete example of its weird behavior; (3) how a tiny amount of the *right*
teaching fixed that — and what that tiny teaching could never do, with the confident-fibber
danger included. Every technical word gets a kid-sized explanation or gets cut.`,
      rubric: md`Grade the teaching:

1. **What the big reading built** — a machine that got amazingly good at one game: guess what
   comes next in any text. Reading everything made it a know-it-all at continuing — homework,
   stories, recipes — like someone who has read every book in the world's biggest library.
2. **Why still unhelpful, made concrete** — it only ever continues; ask it "what's the capital of
   France?" and it may answer with *more quiz questions*, because on paper, quizzes continue with
   questions. It knows the answer; it doesn't know you wanted answering rather than continuing.
   Any equivalent concrete example works; an abstract "it wasn't aligned" does not.
3. **The tiny fix** — a small stack of examples showing what being helpful *looks like*:
   question, then good answer, thousands of times. Tiny works because we're not teaching it new
   stuff — it already knows the stuff — we're teaching it *manners*: which of its many voices to
   use. Teaching manners is quick; filling a library is slow. (A costume/actor or
   librarian-vs-library analogy, or the kid's own, earns the top mark.)
4. **The limit and the danger** — the tiny teaching can't put new facts in its head, and here's
   the trap: if you use it to drill answers about things it never read, you mostly teach it to
   *sound sure*, so later it will sound sure even when it's making things up — a confident
   fibber. Better to teach it to say "I don't know" — which is trickier than it sounds, because
   you have to figure out what it doesn't know.
5. **Jargon audit:** "SFT," "fine-tuning," "parameters," "tokens," "base model," "gradient" left
   unexplained = partial credit at best. Kid-renaming (the big reading, the manners lessons, the
   guessing game) is the skill under test.`,
    },
  ],
}
