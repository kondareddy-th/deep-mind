// Module 6, Lesson 2 — Circuits: the induction head, end to end (Feynman standard)
// Content strings use String.raw so LaTeX backslashes survive.
// NEVER write the sequence dollar-brace inside content (JS interpolation).

const md = String.raw

export default {
  id: 'm6-l2',
  title: '6.2 Circuits — the induction head, end to end',
  subtitle: md`6.1 handed you the nouns. A parts list is not a mechanism: knowing a car contains pistons tells you nothing about how it drives. Today we build a complete algorithm out of frozen matrices — the two-head relay that has been promised since lesson 2.3 — and then learn the four methods that let you prove such a thing.`,
  sections: [
    {
      type: 'text',
      md: md`
## The puzzle

Type this into any decent language model:

> Ms. Kondareddy went to the market. Ms. ___

It finishes it. Correctly. Confidently. On the first try.

Now notice how strange that is. *Kondareddy* was almost certainly not in the training data as a name —
to the tokenizer it is three or four rare fragments glued together, semantic gravel. The model has
never predicted it before in its life. And here is the part that should genuinely bother you:
**nothing was updated.** No gradient was computed. No weight changed by so much as a float's last
bit. The same 175 billion frozen numbers sat there before and after.

So the "learning" that just happened has to live somewhere else. It lives in the **activations** —
in a computation the model ran on the fly, using machinery that training built for exactly this
shape of situation. Lesson 3.6 gave that behaviour a name (in-context learning) and left it as a
wonder. Today we open it.

## Nouns, verbs, and why a parts list is not an explanation

Lesson 6.1 gave you **features**: concepts as directions in the residual stream, packed in
superposition, recoverable (imperfectly) with sparse dictionaries. That is a vocabulary. It is the
set of things the model can *say to itself*.

But suppose I hand you a complete, perfectly labelled parts list for a car: pistons, camshaft,
crankshaft, timing belt, differential. Have I told you how a car drives? Not remotely. You know the
nouns. What you're missing is the **linkage** — what turns what, in what order, so that burning
petrol becomes rotating wheels. That linkage is the explanation, and it is a *different kind of
object* from the parts list.

In a transformer the linkage has a name: a **circuit**. And the whole of today is one worked
example — the most completely understood algorithm in any large language model — plus the toolkit
that let people establish it.
`,
    },
    {
      type: 'text',
      md: md`
## What a circuit actually is

Recall the picture from 2.5. The residual stream is a **bulletin board** running the length of the
model, one board per token position. Every component — each attention head, each FFN path — reads
from the board, computes something, and **adds** its result back onto the board. Layers are clock
ticks: layer 3 can only read what layers 0 through 2 have already posted.

Two consequences, and they're the reason this subject is possible at all:

1. **The board is a sum.** Components add; they don't overwrite. So the state at any point is
   literally $\mathbf{x} = \mathbf{e} + \sum_h \mathbf{o}_h + \sum_f \mathbf{o}_f$ — embedding plus
   every head's output plus every FFN's output. Contributions stay *separable and attributable*,
   which is what makes "this head contributed 1.6 of the 3.4 logit gap" a meaningful sentence.
2. **The board defines a graph.** Nodes are components. There's an edge from component $A$ to
   component $B$ when what $A$ writes is part of what $B$ reads.

A **circuit** is a small subgraph of that graph that together implements an identifiable algorithm.
Not a neuron. Not a layer. A *subgraph*.

Why is that the right unit? Because the two obvious alternatives both fail, for opposite reasons.
The neuron is **too small** — 6.1 proved it: an axis is a nearly-random line through a scatter of
feature directions, so a neuron is a junk drawer, and "explaining" one is explaining a smear. The
layer is **too big** — GPT-2 small has 12 heads per layer, and on any given prompt they are doing
twelve unrelated jobs at once, like calling a floor of an office building "the accounting
department" because one desk on it does accounting.

The software analogy is exact and worth keeping: understanding a program is not understanding a
transistor (too small, meaningless alone) and not understanding the whole chip (too big, everything
at once). It is understanding a **function** — a handful of parts, wired a particular way, doing one
nameable thing.

So: what nameable thing shall we reverse-engineer? The one from the puzzle.
`,
    },
    {
      type: 'text',
      md: md`
## The task, stated so precisely that it becomes a design problem

Strip "Ms. Kondareddy went to the market. Ms. ___" of all its meaning. What's the abstract pattern?

$$\ldots\; [A]\;[B] \;\ldots\; [A] \;\longrightarrow\; [B]$$

Something appeared; something followed it; the something has appeared again; predict the follower.
That's it. This is the **induction** pattern, and it is the engine room of in-context learning: it
is how a model exploits *any* repeated structure in a context it has never seen — a name, a
made-up word, a code style, a format you invented in your prompt three paragraphs ago, the
few-shot examples in a prompt.

As an algorithm the task has two steps, and I want you to read them slowly because the whole lesson
hinges on the second word of the second step:

1. **Find** the earlier position where my current token appeared.
2. **Copy** what came *after* it.

Now put on an engineer's hat. You have attention heads. Can one head do this?
`,
    },
    {
      type: 'ponder',
      question: md`**Try to prove the impossibility yourself before reading on.** Suppose one
attention head, sitting in layer 1, must implement the whole thing. Its query comes from the current
token (call it position $i$, holding token $A$). It needs to place its attention on the position
that holds $B$ — the position *immediately after* the earlier $A$. Call that position $j$.

Ask the two questions that decide it: (a) what would the **key** at position $j$ have to contain for
the score $\mathbf{q}_i \cdot \mathbf{k}_j$ to be large? (b) In layer 1, what is the key at position
$j$ actually computed *from*? Line those two answers up and the verdict writes itself.`,
      answer: md`**(a)** For the head to select $j$ specifically, the score $\mathbf{q}_i \cdot
\mathbf{k}_j$ must be large exactly when "the token *before* $j$ equals my current token." The query
side carries $A$. So the key at $j$ must carry **the identity of token $j-1$**. Not token $j$ —
token $j$ is $B$, which is precisely the thing we don't know yet and are trying to find. The key
must encode the position's *predecessor*.

**(b)** In layer 1, the residual stream at position $j$ is $\mathbf{x}_j = \mathbf{e}(t_j) +
\mathbf{p}_j$: the embedding of its own token, plus its own position. Nothing else has been written
yet. The key is a linear map of that, $\mathbf{k}_j = W_K \mathbf{x}_j$, so it can only ever be a
function of $t_j$ and $j$.

**The verdict:** the head needs $t_{j-1}$ and the entire residual stream at $j$ has never heard of
$t_{j-1}$. This isn't a capacity problem — more parameters, wider heads, longer training would not
help. **The information the head needs does not exist anywhere it can read.** No matrix can be
trained to extract what is not there.

(Two escape hatches worth killing explicitly, because they're the ones people reach for. *Could it
use position instead?* Only if the repeat sat at a fixed known offset — but the earlier $A$ can be
2 tokens back or 900, wherever the context happens to put it. *Could it match token to token,
attending from $A$ to the earlier $A$?* Yes! That's easy, and real heads do it. But then it copies
$A$, predicting that "Ms." is followed by "Ms." — which is the wrong answer, confidently.)

So one head cannot. Which means the fix is forced, and the next section spells out what it has to
be.`,
    },
    {
      type: 'text',
      md: md`
## Deriving the two-layer relay (this is the crown jewel — nobody chose it)

The impossibility argument didn't just say "no." It said exactly *what is missing*: position $j$'s
residual stream lacks any record of token $j-1$. So the repair is completely determined:

> **Some earlier component must first write "here is what preceded me" into every position's
> residual stream.**

And now count clock ticks. The writing must be *finished* before the matching head reads — the
bulletin board only flows forward, layer by layer (2.5). So the writer must sit in a **strictly
earlier layer** than the matcher.

That is the derivation. Two components, in two different layers, one preparing information the
other consumes:

$$\underbrace{\text{layer } \ell_1:\ \text{write } t_{j-1} \text{ into position } j}_{\text{previous-token head}}
\;\longrightarrow\;
\underbrace{\text{layer } \ell_2 > \ell_1:\ \text{match and copy}}_{\text{induction head}}$$

Sit with what just happened, because it is rarer than it looks. **We proved a lower bound on depth
for a specific algorithm, from first principles, in half a page.** Not "empirically, two-layer models
do induction and one-layer models don't" — though that is also true and was checked. We showed that
*any* implementation must span at least two attention layers, because of what information exists
where and when. Lesson 2.3 told you layers are sequential clock ticks and asked you to take it on
faith that depth buys composition. Here is depth buying composition, on a named algorithm, with a
receipt.

And it explains an otherwise-baffling empirical fact you can go verify: one-layer attention-only
transformers are bad at in-context learning, and the jump to two layers is a *qualitative* cliff,
not a smooth improvement. The cliff is this argument.
`,
    },
    {
      type: 'text',
      md: md`
## The mechanism, in three moves

**Move 1 — the previous-token head (layer 1).** A head whose attention pattern is almost comically
dull: from every position $i$, attend to position $i-1$. Nearly all its attention mass on one place,
one step back. Its OV behaviour is "copy what you see." Net effect: after layer 1, position $i$'s
bulletin board carries a record that reads roughly *prev: (token $i-1$)*. Every position now knows
what came before it.

This head is boring. Boring is the point. It is a *librarian*, not a genius: it does bookkeeping
that makes someone else's cleverness possible.

**Move 2 — the induction head's QK (layer 2).** Now a head in a later layer forms its query from the
**current** token $A$, and matches it against those *prev:* records. The score is high at exactly
those positions whose predecessor was $A$ — which is to say, at the position immediately *after* the
earlier occurrence of $A$. That position holds $B$.

**Move 3 — the induction head's OV.** Having attended to the position holding $B$, the head copies
$B$'s token identity into the residual stream at the current position, pointed at the output. When
the unembedding reads the stream, $B$'s logit is up.

Three moves, two heads, zero weight updates. That is the whole of the induction circuit, and it is
the reason a model can pick up a name it has never seen.
`,
    },
    {
      type: 'example',
      title: 'walking the circuit on a real sequence, position by position',
      md: md`
Take the sequence and index it explicitly, 0-based, one token per slot:

| pos | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| token | The | code | is | 7 | 4 | 2 | . | The | code | is | **7** |

The current position is **10**, holding the token *7*. The answer a human gives instantly is *4*.
Watch the machine get there.

**After layer 1**, the previous-token head has written a *prev* tag at every position:

| pos | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|
| token | 7 | 4 | 2 | . | The | code | is | 7 |
| prev tag | is | **7** | 4 | 2 | . | The | code | is |

**Layer 2, the QK question — where do I look?** The induction head at position 10 builds a query
from its own token, *7*, and asks the board: *whose prev tag is 7?* Scan the bottom row. Position 4
is the only match — its predecessor, at position 3, was the earlier *7*. Attention lands on
**position 4**.

Note carefully what the head did *not* do. It did not attend to position 3, the earlier *7* itself.
Matching-my-own-token would be the naive move and it lands one step short. The prev-tag indirection
is what shifts the target by exactly one, and that off-by-one *is* the algorithm.

**Layer 2, the OV question — what do I write?** Position 4 holds the token *4*. The head's OV is a
copier, so it writes *4* toward the output.

**Prediction: 4.** Correct, from a sequence the weights have never seen, with nothing learned in the
usual sense of the word. The "learning" was two matrix multiplies and a softmax.

One more thing to notice, because it's the tell that this is a real mechanism and not a story: the
circuit is **content-blind**. Nowhere did anything reason about codes, digits, or repetition-as-a-
concept. Replace 7, 4, 2 with Kondareddy, went, market — or with three tokens of Klingon — and the
identical machinery fires. That generality is why one small circuit can underwrite so much of
in-context learning.
`,
    },
    {
      type: 'viz',
      viz: 'induction-circuit',
      caption: md`The circuit staged on "The code is 7 4 2 . The code is 7", with an empty
next-token slot at the right. Gold arcs *below* the tokens are the layer-1 previous-token head
writing its prev tags; the coral arc *above* is the layer-2 induction head making its match; the
final stage copies the matched token into the output slot. **Three experiments:** (1) step through
all four stages in order, and at stage 1 stop and ask yourself why this dull one-step-back
bookkeeping is *indispensable* — what exactly would stage 2 be reading if stage 1 had not run?
(2) At stage 2, cover the screen with your hand and **predict which position the head must attend
to** before you reveal it — say the index out loud, and say why it is not the earlier 7 itself;
(3) reset to stage 0 and describe the entire circuit out loud in three sentences, one per stage.
Being able to do that, unaided, is the skill this lesson is actually training.`,
    },
    {
      type: 'text',
      md: md`
## QK and OV: the two questions to ask about any head

The worked example used a habit I want to make explicit, because it is the single most useful
analytic move in mechanistic interpretability and it costs nothing to adopt.

Every attention head answers **two independent questions**:

- **Where do I look?** Decided by the query and key matrices — the **QK circuit**. It produces the
  attention pattern: a distribution over source positions.
- **What do I write when I look there?** Decided by the value and output matrices — the **OV
  circuit**. It decides what gets copied from wherever the attention landed.

These are genuinely separate machines sharing a head. The QK circuit never touches the content that
gets moved; the OV circuit never influences where the head looks. You can swap one without the
other. And once you start asking them separately, head behaviours that looked like mush resolve into
sentences:

| head | QK — where do I look? | OV — what do I write? |
|---|---|---|
| previous-token head | one position back, always | copy the token I see |
| induction head | positions whose *prev tag* matches my token | copy the token I see |
| name-mover head (later) | at names, unless inhibited | copy that name to the output |
| negative name-mover | at names | copy that name with a **minus sign** |

Look at rows one and two. The two heads of our circuit have *the same OV* — both are plain copiers.
The entire difference between "boring librarian" and "engine of in-context learning" is the QK
question. That's the payoff of separating them: it tells you where a head's intelligence actually
lives.

> **So what:** when you next read a paper claiming "head L5H1 is a duplicate-token head," you now
> know to ask two questions, not one, and to be suspicious of any answer that only supplies the
> attention pattern. An attention pattern with no OV story is half an explanation — it tells you the
> head was *looking* at the right thing without establishing that it *did* anything with it.
`,
    },
    {
      type: 'text',
      md: md`
## The toolkit: four ways to find out, and what each one can and cannot prove

The story above is a *hypothesis*. A very pretty one, which makes it more dangerous, not less. How
would you establish it? Four methods, in order of increasing sharpness. Learn each by what it can
and cannot establish — that framing is the whole value.

### 1. Ablation — "does breaking this hurt?"

Zero out a component (or replace it with its mean activation over some dataset), rerun, measure how
much the loss or the target behaviour degrades.

Cheap, obvious, and the first thing anyone tries. Three problems, in ascending order of nastiness:

- **It's a blended lesion** (6.1). Ablating a *neuron* damages a slice of every feature that leans
  on that axis. Ablating a whole *head* is cleaner — heads are architectural units, not arbitrary
  axes — which is one quiet reason attention-head circuits were cracked before FFN circuits.
- **Zero is off-distribution.** A zeroed head writes a vector the model has never once encountered
  in training. Some of the damage you measure is the model being confused by an impossible input,
  not by the missing function. Mean-ablation (substitute the average over a control distribution) is
  the standard patch: it removes the *information* while keeping the activation in a plausible
  range.
- **The network fights back.** This one is bad enough that it gets its own section below.

### 2. Activation patching — "does *restoring* exactly this suffice?"

Here is the move that upgrades the field from lesioning to causal science, and it's worth deriving
rather than reciting. The complaint about ablation is that it asks a **necessity** question in a
system full of redundancy. Flip it into a **sufficiency** question instead:

1. Take a **clean** prompt where the model does the right thing.
2. Build a **corrupted** prompt that is *minimally* different — ideally one token — and on which the
   model does the wrong thing. (For our name task: swap which name is repeated.)
3. Run the corrupted prompt, but **copy a single activation** from the clean run into it — one
   head's output, at one position, at one layer. Everything else stays corrupted.
4. Measure whether the output flips back toward the clean answer.

Read step 3 again and notice how much it asks. You are not damaging the model; you are running the
*wrong* computation and smuggling in one small parcel of *right* information. If the answer flips,
that parcel **contained the deciding information**. That is a genuine causal counterfactual, and
it localizes *where the decision lives* rather than merely where the network is fragile.

The metric is almost always a **logit difference**: logit of the correct answer minus logit of the
tempting wrong one. Differences cancel out everything both continuations share (how confident the
model is overall, how common the words are) and isolate the one bit you care about.

### 3. Path patching — "which *wire*, not which box?"

Activation patching localizes to a **node**. But components talk along many paths at once: head
$H_9$ writes to the board, and head $H_{11}$, the FFNs, and the unembedding all read it. Path
patching restricts the intervention to a single **edge** — patch the clean value *only* into the
input of one specific downstream consumer (say, only into head $H_{11}$'s query), leaving every other
reader on corrupted values. Now you learn whether the signal matters *because of that particular
connection*. Node-level results tell you the parts list; edge-level results tell you the wiring
diagram, and a wiring diagram is what "circuit" means.

### 4. Logit attribution — "what is this component voting for?"

The cheapest and least causal. Because the residual stream is a **sum** (that's the linearity we
banked at the top), you can take a single component's output vector and project it directly onto the
unembedding direction of a candidate token: $\text{contribution} = \mathbf{o}_h \cdot \mathbf{u}_B$.
That number is what the head is voting for, *directly*, ignoring anything downstream layers do with
it. Free to compute, wonderful for generating hypotheses, and strictly correlational — a head's
direct vote can be small while its indirect influence (through some later head it feeds) is
enormous. Use it to find suspects, not to convict them.
`,
    },
    {
      type: 'example',
      title: 'a patching experiment, with the arithmetic done',
      md: md`
Take the flagship task (details in the next section) and just run the procedure.

**Clean prompt:** *When Mary and John went to the store, John gave a drink to* ___ . Correct answer:
**Mary**.

**Corrupted prompt:** *When Mary and John went to the store, Mary gave a drink to* ___ . One token
changed. Now the correct answer is **John** — the model's task has been quietly inverted.

**Metric:** $\Delta = \text{logit(Mary)} - \text{logit(John)}$, so positive means "leaning Mary."

| run | $\Delta$ |
|---|---|
| clean | $+3.4$ |
| corrupted | $-3.1$ |
| corrupted + patch one late-layer head's output at the final position | $+1.5$ |
| corrupted + patch one layer-0 head's output at the final position | $-2.9$ |

**The fraction recovered** is the natural summary — how far the patch dragged the corrupted run back
toward clean, as a share of the full gap:

$$\text{recovered} = \frac{\Delta_{\text{patched}} - \Delta_{\text{corrupted}}}{\Delta_{\text{clean}} - \Delta_{\text{corrupted}}}$$

For the late head: $\dfrac{1.5 - (-3.1)}{3.4 - (-3.1)} = \dfrac{4.6}{6.5} \approx 0.71$ — **71% of
the effect, restored by one head's output at one position.** For the layer-0 head:
$\dfrac{-2.9 + 3.1}{6.5} = \dfrac{0.2}{6.5} \approx 0.03$ — **3%**, i.e. nothing.

Now read what you're entitled to conclude, and what you aren't.

**Entitled:** by the final position, the information that decides between Mary and John is
overwhelmingly concentrated in that late head's output. Seventy-one percent of a decision, localized
to one of 144 heads, is a real finding — and it came from *restoring*, which no amount of breaking
could have given you.

**Not entitled:** you have not shown the head *computes* the answer. It might be a courier carrying
a decision made three layers earlier. Localizing information is not identifying the algorithm — that
takes path patching to trace the edges backwards, and an OV story to say what the head does with
what it fetches. (Note also that scanning every head at every position is only $144 \times L$
forward passes for a model this size — trivially affordable. Hold that thought; it does not survive
contact with a frontier model.)
`,
    },
    {
      type: 'ponder',
      question: md`Make the epistemology explicit. **Why is activation patching stronger evidence
than ablation?** Frame it in terms of *necessity* versus *sufficiency*, and think about what each
one does in a network with redundant parts. Then the harder half: name at least two things patching
**still cannot** tell you, even when it returns a beautiful 90% recovery.`,
      answer: md`**The framing.** Ablation asks a necessity question: *is the behaviour destroyed
when this is gone?* Patching asks a sufficiency question: *is the behaviour restored when this — and
only this — is correct?*

Redundancy breaks necessity but not sufficiency. Suppose two components each independently suffice.
Ablate either alone: nothing happens, and both look useless. Ablate both: catastrophe, and you
conclude "some interaction," which is wrong. Now patch: patching either one alone flips the output,
and you correctly identify **both** as carriers of the deciding information. Sufficiency survives
redundancy; necessity is destroyed by it. Since large neural networks are conspicuously redundant
(next section makes this vivid), that's not a technicality — it's the common case.

Second advantage, quieter but real: patching stays **on-distribution**. Every activation in the
patched run is one the model genuinely produced on some real input. A zero-ablated head produces a
vector that has never existed, so part of any measured damage is confusion rather than deletion.

**What patching still cannot tell you:**

1. **What the component computes.** Patching localizes *information*, not *function*. A courier and
   an author are indistinguishable to it — both carry the deciding bits at their position. You need
   path patching (which edges) plus a QK/OV story (what the head does) to tell them apart.
2. **It is relative to your corruption.** Patching measures effects on the difference between *your*
   clean and *your* corrupted prompt. Change the corruption — swap the names versus scramble the
   sentence versus replace with random tokens — and the localization can move. The counterfactual
   you chose is part of the claim, which is why "we patched" is never a complete methods section.
3. **It says nothing about other inputs.** A circuit established on one narrow template may or may
   not be what the model does on the next distribution. Generalization is a separate experiment.
4. **Recovery percentages do not add up.** Two heads each recovering 60% do not make 120%; effects
   compose non-linearly through attention softmaxes and layer norms, so a table of single-node
   patches is a set of hints about a system, not a decomposition of it.`,
    },
    {
      type: 'text',
      md: md`
## The flagship: the IOI circuit

Induction is two heads. Real behaviours are bigger, and the best-documented one has a name:
**indirect object identification** (IOI), published on GPT-2 small — 12 layers, 12 heads per layer,
144 heads, 117M parameters. *(Flagged as a published finding, not a derivation: Wang et al., 2022.)*

The task:

> When Mary and John went to the store, John gave a drink to ___

Every human says **Mary**, and so does GPT-2. But look at the little logic problem the model just
solved: two names are on offer; one of them appears **twice**; the answer is the one that appears
**once**. The algorithm has to be something like *notice the duplicate, rule it out, emit the other.*

Reverse-engineered with exactly the toolkit above, the circuit came out as roughly **26 heads** —
about 18% of the model — in three functional groups:

1. **Duplicate-token heads** (early layers). Their QK: attend from the second "John" back to the
   first "John." Their OV: write a flag meaning *this token has appeared before*, along with where.
   *(Induction heads participate here too — the very machinery you just built, doing a different job
   in a bigger circuit. Circuits reuse parts.)*
2. **S-inhibition heads** (middle layers). They read the duplicate flag and write into the final
   position a signal that says, in effect, *do not attend to that name.* Note what kind of message
   this is: it is not about the answer, it is about **where a later head should look**. A head
   writing into another head's QK circuit. That is composition, and it is the thing you could never
   see by staring at any single component.
3. **Name-mover heads** (late layers, e.g. the 71%-recovery head from the example above). Their QK:
   attend to names. Their OV: copy the attended name to the output. Left alone they'd be torn
   between Mary and John — but the S-inhibition signal has suppressed John, so their attention falls
   on Mary, and they copy Mary.

And a fourth group nobody predicted: **negative name-mover heads**, whose OV copies the attended
name with a *negative* sign — heads that actively vote **against** the right answer. Best current
guess is calibration, a hedge against overconfidence. Whatever they are, they are a standing rebuke
to tidy stories: the model's algorithm contains a component that, taken alone, looks like a bug.

That is a real algorithm, in real weights, with named parts. It is also — and hold this thought —
**26 heads for one sentence template**.
`,
    },
    {
      type: 'example',
      title: 'the ablation table that lies to you',
      md: md`
Now the finding that should change how you read every interpretability paper for the rest of your
life. Illustrative numbers, in the spirit of the published result:

You have identified a primary name-mover head, call it NM1. You run the obvious check.

| intervention | logit difference | naive reading |
|---|---|---|
| intact model | $3.4$ | — |
| ablate NM1 | $2.6$ | "NM1 is worth 0.8 — about 24%. Minor." |
| NM1's direct logit attribution, intact | $1.6$ | "…but it's directly writing 47% of the answer?" |

Those two rows disagree, and the disagreement is the discovery. The head is *directly contributing*
roughly half the answer, yet removing it costs you a quarter. Where did the missing effect go?

| intervention | logit difference | |
|---|---|---|
| ablate NM1 | $2.6$ | |
| direct contribution of head B1, **intact** | $0.1$ | B1 looks irrelevant |
| direct contribution of head B1, **with NM1 ablated** | $0.7$ | B1 woke up |
| ablate NM1 **and** the three backup heads | $0.9$ | the real hole: $2.5$, i.e. 74% |

**Other heads stepped up and did NM1's job.** These are the **backup name-mover heads**, and the
phenomenon — a network silently repairing the damage you inflict — is called **self-repair**, or
more evocatively the **hydra effect**: cut off a head and others grow to replace it.

Nobody built this in. Nobody trained the model to be robust to interpretability researchers. The
most likely story is mundane and therefore more interesting: dropout and noise during training make
many components partially redundant, and a head that was already weakly voting the same way gets
*more* attention mass or a *cleaner* input once the loud head goes quiet. It costs the network
nothing to have understudies, so it has them.

**The methodological moral, stated as harshly as it deserves:** *ablation can dramatically understate
a component's role, because the network compensates.* A component that looks unimportant under
ablation may be load-bearing in the intact model. Every ablation table you have ever read —
"we removed X and performance dropped only 3%, therefore X is unimportant" — is measuring
**"importance, net of whatever the rest of the network does to cover for it,"** which is a different
and much weaker quantity than the one the sentence claims.

The remedies are exactly the two tools you now own: **patch instead of ablate** (sufficiency survives
redundancy), and **measure direct contributions** (logit attribution catches the head doing work
that ablation hides). When those two disagree with an ablation, believe them, and go looking for
the backups.
`,
    },
    {
      type: 'ponder',
      question: md`You ablate a head you were sure mattered, and the behaviour barely changes.
**Name the two possible explanations** — they lead to opposite conclusions about the head — and then
design a concrete way to **distinguish** them. Don't stop at "run more experiments"; say which
experiment and what each outcome would mean.`,
      answer: md`**Explanation 1: the head genuinely isn't important.** It doesn't participate in
this behaviour; the small change is noise or a minor side effect.

**Explanation 2: the head is important and was compensated for.** It was doing real work, and
backup components absorbed its job the instant it went quiet. Under this reading the head is
load-bearing in the intact model — the one you actually care about explaining — and your ablation
measured the *network's resilience*, not the head's *irrelevance*.

Same measurement, opposite conclusions. Three ways to break the tie, roughly in order of how much
you should trust them:

1. **Patch instead of ablate.** Run a clean/corrupted pair and patch this head's output alone into
   the corrupted run. Sufficiency is immune to compensation: backups cannot hide the fact that this
   head's output carries the deciding information. *High recovery here plus a null ablation is the
   signature of explanation 2* — and it is a result you can get in an afternoon.
2. **Ablate the suspected backups too.** Find the candidates (heads whose direct contribution *rises*
   when the target is ablated — that rise is the fingerprint of an understudy) and knock them out
   jointly. If the joint ablation costs far more than the sum of the individual ones, compensation
   is confirmed. If the joint ablation still costs nothing, explanation 1 is looking strong.
3. **Direct logit attribution in the intact model.** Free, and immediately diagnostic: a head with a
   large direct contribution and a negligible ablation effect is *by definition* being covered for.
   Run this first, because it's a projection, not a forward pass, and it tells you where to point
   the expensive tools.

The habit to internalize: whenever an intervention returns "no effect," the honest write-up is *no
effect **given whatever the rest of the network did in response***. Compensation is not an exotic
edge case — it is what a redundantly-trained system does by default.`,
    },
    {
      type: 'text',
      md: md`
## Cashing lesson 3.6: induction heads and in-context learning

Back to the puzzle we opened with. Module 3 left in-context learning as a genuine wonder: a frozen
model that gets better at a task *within a single prompt*, with no weight updates. You now have a
mechanism that does exactly that for repeated structure. Is the mechanism actually *the* explanation?

Here is the evidence, and it is one of the most satisfying results in the field. *(Flagged as
reported findings — Olsson et al., 2022 — not something we derive here.)*

- **Induction heads form abruptly.** Not gradually. Over a narrow window of training, in a small
  fraction of total steps, heads across the model switch from doing nothing recognizable to
  implementing the prev-token-plus-match relay. A **phase change**.
- **The loss curve shows it.** Remember lesson 5.3, where you learned to read a training curve and
  were told that bumps and kinks are worth investigating rather than smoothing away? There is a
  visible bump — a brief departure from the otherwise-smooth power-law descent — in exactly that
  window.
- **In-context learning ability jumps at the same moment.** Measure it concretely: the model's loss
  on the 500th token of a context minus its loss on the 50th token. A big gap means "having seen more
  of this document made me better at it" — that *is* in-context learning, reduced to a number. That
  gap jumps sharply in the same window.
- **And it's not merely correlational.** In small models, ablating the induction heads reduces
  in-context learning substantially. The causal arrow has at least been pushed on.

Stop and appreciate the shape of this. Three things that normally live in three different worlds —
a **capability** (a behaviour users notice), a **mechanism** (specific heads doing a specific
algorithm), and a **squiggle on a training dashboard** — were connected to each other. That is
almost unheard of in deep learning, where capabilities usually appear with no mechanistic account
and loss curves are treated as weather. A bump in your loss curve turning out to be *the birth of a
named algorithm* is what a mature science of these systems is supposed to look like.

The honest caveat, because you're training as a researcher and not a fan: the tightest evidence is
from small models, "induction head" covers a family of heads of varying purity, and induction is
clearly not *all* of in-context learning — a model doing five-shot arithmetic in context is doing
more than pattern-completion. The claim that survives is: induction heads are a large, mechanistically
identified, causally implicated **chunk** of it.
`,
    },
    {
      type: 'text',
      md: md`
## The honest state of it

Everything above is real, and it is also much less than it sounds. Four limits, all of them live
research problems rather than footnotes.

**1. Small models, narrow tasks.** IOI is one sentence template in a 117M-parameter model from 2019.
Induction is a two-head motif. The frontier models people actually worry about are hundreds of times
larger and do things no template captures. Extrapolating from GPT-2 small to a frontier model is a
leap the evidence does not yet license.

**2. Is the circuit the *whole* story?** Circuit papers typically explain a majority — not all — of
the measured effect on their task. The unexplained remainder is the same worry as 6.1's SAE
reconstruction residual, wearing a different hat: **always ask what an explanation leaves
unexplained, and whether the leftovers were checked or merely averaged away.** And a subsequent
result worth knowing: when researchers tested the IOI circuit on close variants of its own prompt
template, it did *not* always behave as advertised. Circuits found on a distribution are claims
about that distribution.

**3. Scale is the bottleneck, and the arithmetic is brutal.** This is where the Fermi estimate
below earns its keep. Finding IOI's 26 heads took skilled humans months of prompt design, patching
runs, and argument. GPT-2 small has 144 heads. A frontier model has *thousands*. Hand-tracing does
not scale — not slowly, not expensively; it does not scale at all.

**4. The direction of travel** *(all flagged as active research, 2023–2025)*: **automated circuit
discovery** — algorithms that search the component graph for the relevant subgraph instead of a
human guessing; **attribution patching**, a gradient-based approximation to activation patching that
estimates every node's effect in a couple of backward passes instead of one forward pass per node,
trading exactness for a few orders of magnitude of throughput; and the most promising current line,
**attribution graphs** built on **cross-layer transcoders** — replace the model's FFNs with sparse,
interpretable substitutes (6.1's dictionary idea, moved from *representations* to *computation*),
then read the graph of which features cause which. That last one has produced traceable multi-step
reasoning graphs in production-scale models — the first time anyone has watched a big model's
algorithm rather than inferring it.

The fair summary, and the sentence to carry out of this lesson: **we can now read *sentences* of the
model's algorithm. We cannot yet read its *books*.** That gap is not a failure of the field. It is
the job opening.
`,
    },
    {
      type: 'text',
      md: md`
## What you now own

1. **The unit of explanation.** A circuit is a **subgraph** of components communicating through the
   residual stream — not a neuron (too small, and a junk drawer by 6.1) and not a layer (too big, a
   committee of unrelated jobs). Features are the nouns; circuits are the verbs.
2. **A derived impossibility.** One attention head *cannot* do induction, because the key at the
   target position is computed from that position's own embedding and therefore knows nothing about
   its predecessor. The information does not exist where the head can read it, and no amount of
   training conjures it.
3. **A derived architecture.** Therefore some earlier component must write "what preceded me" into
   every position, and it must sit in a strictly earlier layer. Two heads, two layers — **forced by
   information availability, not chosen by a designer.** That is 2.3's clock-tick claim, proven on a
   named algorithm.
4. **The mechanism, end to end.** Previous-token head writes prev tags; induction head's QK matches
   the current token against those tags and lands one position *after* the earlier occurrence; its
   OV copies that token to the output. You can walk it on an indexed sequence, out loud, in three
   sentences.
5. **QK versus OV.** Where do I look, and what do I write — two independent questions, and asking
   them separately is the cheapest large upgrade to your analysis of any head.
6. **Four methods and their epistemics.** Ablation (necessity, cheap, easily fooled); activation
   patching (sufficiency, a real causal counterfactual, on-distribution); path patching (edges, not
   just nodes); logit attribution (free, additive because the stream is a sum, strictly
   correlational).
7. **The hydra.** Backup name-movers mean ablation can badly *understate* a component's role. Read
   every ablation table as "importance, net of the network's compensation" — and when direct
   attribution and ablation disagree, go hunting for understudies.
8. **A capability, a mechanism, and a bump in a loss curve, tied together.** Induction heads form in
   an abrupt phase change that coincides with the jump in in-context learning. Rare, and a template
   for what explanation should look like.
9. **The honest frontier.** Small models, narrow tasks, partial coverage, and no known way to
   hand-trace thousands of heads — with automated discovery, attribution patching, and cross-layer
   transcoders as the current attack.

Next lesson: we have been asking *how* the model computes. 6.3 asks the question that makes all of
this urgent — *what does it want*, and can we tell?
`,
    },
  ],
  questions: [
    {
      id: 'm6-l2-q1',
      kind: 'mcq',
      prompt: md`Why can a **single** attention head in layer 1 not implement induction (find where
my token appeared before, then predict what followed it)?`,
      options: [
        md`The head has too few parameters; a wider head with a larger $d_{\text{head}}$ could do it`,
        md`To attend to the position *after* the earlier match, its keys would have to encode each position's **predecessor** — but a layer-1 key is computed from that position's own embedding, so the required information does not yet exist anywhere the head can read`,
        md`The causal mask prevents any position from attending to earlier positions`,
        md`The softmax saturates when a token appears twice, splitting attention evenly between the two occurrences`,
      ],
      answer: 1,
      explain: md`The argument is about **information availability**, not capacity. The key at
position $j$ is $W_K(\mathbf{e}(t_j) + \mathbf{p}_j)$ — a function of that position's own token and
index only. The head needs $t_{j-1}$. No matrix extracts what is not present, so something in an
earlier layer must write it first.

Why the distractors tempt: **A** is the reflex answer to every "can't do it" claim in deep learning,
and it's usually right — which is exactly why it's the trap here. This is one of the rare cases
where scale is irrelevant; the bound is informational. **C** inverts the causal mask: attending
*backwards* is the one thing it permits (forwards is forbidden). **D** invents a plausible-sounding
softmax pathology; the head *can* attend to the earlier occurrence just fine — the problem is that
doing so retrieves the wrong token, one position short of the answer.`,
    },
    {
      id: 'm6-l2-q2',
      kind: 'numeric',
      prompt: md`Index this sequence 0-based, one token per slot:

| pos | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| tok | Hey | , | my | badge | is | K | 9 | T | . | my | badge | is | **K** |

The induction circuit is running at the final position (12, token *K*). **Which position index does
the induction head attend to?** Work it with prev tags — don't pattern-match.`,
      answer: 6,
      tolerance: 0.4,
      explain: md`Position **6**. The layer-1 head has tagged every position with its predecessor;
the tag at position 6 reads *prev: K*, because position 5 holds the earlier *K*. The induction
head's query is *K*, so it matches position 6 — which holds the token **9**, the prediction.

The seductive wrong answer is **5**, the earlier *K* itself. That is what a same-token matching head
would do, and it retrieves *K*, predicting that *K* follows *K*. The entire algorithm is the
off-by-one: the prev-tag indirection shifts the target exactly one position later.`,
    },
    {
      id: 'm6-l2-q3',
      kind: 'mcq',
      prompt: md`A head's **QK circuit** and **OV circuit** answer which two questions?`,
      options: [
        md`QK: what to write when I look somewhere. OV: where to look.`,
        md`QK: where to look (the attention pattern). OV: what to write when I look there (what gets copied).`,
        md`QK: how much to attend in total. OV: how the result is normalized before entering the residual stream.`,
        md`They are two names for the same computation, distinguished only by whether you analyze it forward or backward.`,
      ],
      answer: 1,
      explain: md`QK builds the attention pattern from queries and keys; OV decides what content the
head moves from the attended position.

Why the distractors tempt: **A** is the correct pair of concepts with the labels swapped — the
commonest slip, and a useful mnemonic kills it (Q and K produce the *scores*, so QK is *where*).
**C** sounds technical and is pure invention. **D** is tempting because both circuits live inside
one head and share its inputs, but they are provably independent: the previous-token head and the
induction head have essentially **the same OV** (copy what you see) and completely different QK —
which is precisely why separating the questions is so revealing.`,
    },
    {
      id: 'm6-l2-q4',
      kind: 'written',
      prompt: md`**Derive, don't recall.** On paper, and without looking back at the lesson, prove
that induction requires at least two attention layers. Structure it: (1) state the task as a
selection problem — which position must the head attend to, and what property defines it?
(2) Write down what the key vector at a candidate position is computed from in the model's first
attention layer. (3) Show the mismatch, and say precisely why more parameters or more training
cannot close it. (4) Derive what must therefore exist, and argue why it must live in a strictly
earlier layer. (5) Kill the two obvious escape hatches: using positional information, and matching
the current token against the earlier identical token.`,
      rubric: md`**(1) The selection problem.** With the current token $A$ at position $i$, the head
must attend to the position $j$ such that $t_{j-1} = A$. The defining property of the target is a
fact about its **predecessor**, not about itself. (Stating this cleanly is half the proof; if your
write-up says "attend to the earlier $A$," you have already lost the off-by-one and will derive the
wrong architecture.)

**(2) What a first-layer key knows.** Before any attention has run, the residual stream at $j$ is
$\mathbf{x}_j = \mathbf{e}(t_j) + \mathbf{p}_j$ — its own token embedding plus its own positional
information. So $\mathbf{k}_j = W_K \mathbf{x}_j$ is a function of $t_j$ and $j$ alone.

**(3) The mismatch.** The score $\mathbf{q}_i \cdot \mathbf{k}_j$ can therefore only depend on
$(t_i, i, t_j, j)$ — and never on $t_{j-1}$. But the target is defined *by* $t_{j-1}$. **No function
can depend on an argument it was not given.** Capacity is irrelevant: this is not "hard to learn,"
it is "not a function of the available inputs." Explicitly saying why scale doesn't help is required
for full credit.

**(4) What must exist.** Some component must write a record of $t_{j-1}$ into position $j$'s residual
stream. The minimal such component is a head attending from $j$ to $j-1$ with a copying OV — a
**previous-token head**. Because the residual stream is written in layer order (2.5's clock ticks),
that write must complete *before* the matching head reads, so the writer sits in a strictly earlier
layer. Hence at least two attention layers. Conclusion: the two-layer structure is **forced by
information availability**, not a design choice.

**(5) The escape hatches.** *Positional*: a head could attend at a fixed offset, but the earlier
occurrence sits at an arbitrary, content-dependent distance (2 tokens back or 900), so no fixed
positional rule selects it. *Same-token matching*: a head absolutely can match $A$ to the earlier
$A$ — but its OV then copies $A$, predicting that $A$ follows $A$. It retrieves the trigger instead
of the continuation.

**"Nailed it"** requires steps 1–4 with the mismatch stated as an information-availability argument
(not a capacity argument), plus at least one escape hatch properly killed. Writing down the finished
two-head architecture from memory and then justifying it backwards is exactly the recall this
question exists to defeat — the direction of the reasoning is the whole point.`,
    },
    {
      id: 'm6-l2-q5',
      kind: 'numeric',
      prompt: md`An activation patching experiment uses logit difference $\Delta$ (correct answer
minus the tempting wrong one) as its metric. The clean run gives $\Delta = +4.0$; the corrupted run
gives $\Delta = -2.0$. Patching one head's output at one position into the corrupted run gives
$\Delta = +2.8$. **What percentage of the effect did that single patch recover?**`,
      answer: 80,
      tolerance: 3,
      explain: md`$$\frac{\Delta_{\text{patched}} - \Delta_{\text{corrupted}}}{\Delta_{\text{clean}} - \Delta_{\text{corrupted}}} = \frac{2.8 - (-2.0)}{4.0 - (-2.0)} = \frac{4.8}{6.0} = 0.80$$

**80%.** The denominator is the full gap the corruption opened; the numerator is how far the single
patch dragged the run back. Two habits encoded in this arithmetic: always measure a *difference* of
logits (so shared factors like overall confidence cancel), and always normalize by the full clean-to-
corrupted gap (so the number is comparable across prompts and models). And the standing caveat: 80%
of the *information* localized to one head is not 80% of the *algorithm* explained — the head may be
a courier.`,
    },
    {
      id: 'm6-l2-q6',
      kind: 'mcq',
      prompt: md`You ablate a name-mover head in GPT-2 small and the model's performance on the IOI
task barely changes. What is the *correct* conclusion?`,
      options: [
        md`The head is not part of the IOI circuit and should be removed from the diagram`,
        md`Little, on its own — backup heads may have stepped in to do its job, so ablation can badly understate a component's role; check with patching and direct logit attribution before concluding anything`,
        md`The circuit hypothesis is falsified, since a real circuit's components would each be individually necessary`,
        md`The head is important but only for other tasks, since ablation effects are always task-specific`,
      ],
      answer: 1,
      explain: md`This is the self-repair / hydra finding, and it is the most important
recalibration in the lesson. Other heads increase their contribution when the primary is removed, so
the ablation measures **importance net of the network's compensation** — a much weaker quantity than
"importance."

Why the distractors tempt: **A** is the literal, natural reading of the experiment, and it is what
thousands of ablation tables have been read to mean. **C** smuggles in an assumption that sounds
rigorous — that circuit components must be individually necessary — but necessity is exactly the
property redundancy destroys; a circuit can be entirely real and have no individually necessary
parts. **D** is a genuine phenomenon (effects *are* task-specific) deployed as a non sequitur: it
doesn't explain the null result on *this* task. The fix in every case is to switch from breaking to
restoring: patch the head's output into a corrupted run and see whether it suffices.`,
    },
    {
      id: 'm6-l2-q7',
      kind: 'numeric',
      prompt: md`GPT-2 small has 12 layers with 12 attention heads each. The published IOI circuit
implicates roughly 26 heads. **What percentage of the model's attention heads is that?** (Nearest
whole percent.)`,
      answer: 18,
      tolerance: 2,
      explain: md`$12 \times 12 = 144$ heads total, and $26/144 \approx 0.181$, so about **18%**.

Sit with that ratio, because it is the argument for why scaling interpretability is hard. Nearly a
fifth of an entire model is implicated in completing *one sentence template*. Either the circuit
description is over-broad (some of those heads are bit-players swept in by a generous threshold), or
even trivial behaviours are genuinely distributed across a large fraction of the network. Both
readings are uncomfortable, and both are probably a little true.`,
    },
    {
      id: 'm6-l2-q8',
      kind: 'numeric',
      prompt: md`**Fermi (do it on paper).** GPT-2 small has $12 \times 12 = 144$ attention heads.
Estimate the number of attention heads in a frontier-scale model with roughly 64 layers and about 64
heads per layer. Give your estimate as a plain number of heads. (Generous tolerance — the habit of
sizing a problem before attacking it is the point. Then ask yourself what 26-heads-per-behaviour
implies about mapping *this* model by hand.)`,
      answer: 4096,
      tolerance: 1500,
      explain: md`$64 \times 64 = 4{,}096$ heads — roughly **28 times** GPT-2 small's 144.

Now finish the estimate, because the number alone isn't the lesson. IOI cost skilled researchers
months of work to establish 26 heads for one template in the *small* model. Suppose, generously,
that a frontier model has "only" a few thousand distinct behaviours worth mapping, and that each
takes a comparable effort scaled by the 28-fold larger search space. You are into thousands of
researcher-years for a single model — which will be obsolete before you finish, since the next one
ships in a year. And single-node activation patching alone costs one forward pass per (component,
position) pair: with 4,096 heads over a long context, an exhaustive scan is millions of forward
passes.

The conclusion is not "give up," it is "**hand-tracing cannot be the method**" — which is exactly
why automated circuit discovery, attribution patching (gradients instead of per-node forward passes),
and attribution graphs over cross-layer transcoders are where the field's effort has gone. Accept
anything in the low thousands; the order of magnitude is the whole answer.`,
    },
    {
      id: 'm6-l2-q9',
      kind: 'written',
      prompt: md`**Design the experiment.** A colleague claims: "Head L8H6 is an S-inhibition head —
it tells the late name-mover heads *not* to look at the repeated name." Design the study that would
establish or refute this. Specify: (1) your clean and corrupted prompts, and why the corruption is
the right minimal change; (2) your metric; (3) which of the four methods you use for which sub-claim
— being explicit that "inhibits" and "tells the name-movers" are **two separate claims** requiring
different evidence; (4) at least one concrete result that would **falsify** the hypothesis.`,
      rubric: md`**(1) The prompt pair.** Clean: *When Mary and John went to the store, John gave a
drink to* ___ (answer Mary). Corrupted: the same sentence with the repeated name swapped —
*...Mary gave a drink to* ___ (answer John). The corruption must be **minimal and targeted**: one
token, changing *which* name is duplicated while holding sentence structure, both names, length and
tokenization fixed. Credit for noticing *why* minimality matters: every difference you leave in the
pair is a confound the patch could be exploiting. (Alternative valid designs: an ABC pattern where
the third name never appeared, or a template with the names' order reversed as a control.)

**(2) The metric.** Logit difference: logit(Mary) minus logit(John), reported as fraction of the
clean-to-corrupted gap recovered. A difference cancels shared factors; a normalized fraction is
comparable across prompts.

**(3) Method per sub-claim** — the heart of the question, and a strong answer keeps the two claims
apart:
- *Does L8H6 carry decision-relevant information at all?* **Activation patching** of its output.
  A large recovery says yes.
- *Does it act by talking to the name-movers specifically?* Patching a node cannot show this. Use
  **path patching**: patch the clean L8H6 output **only into the name-mover heads' query inputs**,
  leaving every other consumer on corrupted values. If the effect survives that restriction, the
  claim about the edge is supported; if it evaporates, L8H6 matters through some other route and the
  "tells the name-movers" half is wrong.
- *Is the effect inhibitory, and does it operate on attention?* Read the **name-movers' attention
  pattern** directly with and without the patch: the prediction is that patching shifts their
  attention mass off the repeated name and onto the other one. This is the sub-claim the word
  "inhibition" is actually making, and it is checked by looking at a QK pattern, not a logit.
- *What does L8H6 write directly?* **Direct logit attribution** — and here the prediction is
  *negative*: an S-inhibition head should have a small direct effect on the answer logits, because
  its job is to steer another head, not to vote. A large direct effect would suggest it's a
  name-mover in disguise.

**(4) Falsifying results** (any one, stated so it could actually happen): path patching into the
name-movers' queries recovers ~nothing while node patching recovers a lot (it acts via a different
route); the name-movers' attention to the repeated name is *unchanged* by the patch (no inhibition
is occurring); L8H6 turns out to have a large direct logit attribution and shifts the answer even
when the name-movers are ablated (it's writing the answer itself); or the effect appears only on
this exact template and vanishes on paraphrases (a template artifact, not a mechanism).

**Full credit** requires the minimal-pair reasoning, the separation of the node claim from the edge
claim with path patching named for the latter, an attention-pattern check for the word "inhibition,"
and a falsifier whose outcome is genuinely uncertain in advance.`,
    },
    {
      id: 'm6-l2-q10',
      kind: 'written',
      prompt: md`**Explain it to a 12-year-old.** A kid asks: "You said the AI stops learning after
it's built. So how did it know my friend's weird made-up nickname the second time I typed it?"
Explain (1) why this is genuinely surprising — nothing inside the AI changed; (2) the *first* helper
that just writes down, at every word, which word came right before it; (3) the *second* helper that
uses those notes to find the earlier copy of the word and then look at **the next one along**;
(4) why the second helper cannot work without the first — this is the part that matters most, so
make the kid *feel* the impossibility, not just hear it. Invent your own analogy; inventing a good
one is worth more than borrowing the lesson's.`,
      rubric: md`Grade the **teaching**, not the vocabulary.

1. **The surprise, made concrete.** The kid must feel that nothing inside changed — same numbers
   before and after, no studying, no remembering afterwards (start a new chat and the nickname is
   gone). The AI didn't *learn* the nickname; it *looked it up in the conversation*.
2. **Helper one, the note-taker.** At every single word, someone jots a sticky note: *the word right
   before me was ___*. Utterly boring, done everywhere, no thinking involved. A good answer flags
   the boringness as suspicious-in-a-good-way — the boring helper is the one that makes the trick
   possible.
3. **Helper two, the finder.** It takes the word we're on now, walks along the sticky notes looking
   for one that says *the word before me was (that word)*, and reads **that** spot. The crucial
   detail: it does not stop at the earlier copy of the word — it lands on the **next one along**,
   because that's the thing we actually want to predict. Something like: you're not looking for your
   friend in the class photo, you're looking for *whoever was standing next to your friend*.
4. **Why helper two is stuck without helper one** — the load-bearing beat. The kid should feel the
   trap: helper two wants to find "the spot right after the earlier nickname," but each spot only
   knows *its own* word — it has no idea what came before it, the way a person in a queue facing
   forwards can't see who's behind them. Without the sticky notes, there is no way to ask the
   question at all. Not "too hard" — *impossible*, because nobody has the information. Making the
   difference between "hard" and "impossible" land is the difference between partial and full credit.
5. **Analogy quality.** Sticky notes, a relay race where the first runner has to place the baton
   before the second can grab it, a treasure hunt where each clue only makes sense if someone
   labelled the doors first — any invented analogy that preserves *the second one literally cannot
   start until the first one has finished* earns full marks. An analogy that makes it sound like a
   speed or effort problem misses the point.
6. **Jargon audit.** "Induction head," "attention," "query," "key," "residual stream," "circuit,"
   "layer," "token," "activation" used without a kid-level translation first = **partial at best**.
   This is the failure mode the exercise exists to catch: hiding behind a name you were given instead
   of explaining a thing you understand.`,
    },
    {
      id: 'm6-l2-q11',
      kind: 'mcq',
      prompt: md`Which experimental setup correctly describes **activation patching**?`,
      options: [
        md`Zero out one component's output and measure how much the loss increases`,
        md`Run a corrupted prompt, copy a single activation from the clean run into it, and check whether the output flips back toward the clean answer`,
        md`Run the clean prompt twice and check that the two runs agree, to establish that the component is deterministic`,
        md`Replace a component's activation with its mean over a large dataset and measure the drop in the target behaviour`,
      ],
      answer: 1,
      explain: md`Patching is a **sufficiency** test: the run is wrong everywhere except one smuggled
parcel of correct information, and you ask whether that parcel decides the output.

Why the distractors tempt: **A** and **D** are real, useful techniques — zero-ablation and
mean-ablation — and they're the ones most people mean by "intervention." But both ask the
*necessity* question, "does breaking this hurt?", which redundancy and backup heads can silently
answer wrong. **D** is the sneakiest, because mean-ablation genuinely fixes one of ablation's
problems (staying on-distribution) and so feels like the sophisticated option; it still can't survive
compensation. **C** is a sanity check, not a causal experiment — it involves no counterfactual at
all, and a causal claim requires a comparison between two worlds that differ in one thing.`,
    },
    {
      id: 'm6-l2-q12',
      kind: 'written',
      prompt: md`**Research judgment.** A paper reports: "We identified a 40-head circuit implementing
factual recall of capital cities in a 7B model. Ablating the circuit destroys the behaviour, and
patching its components recovers 85% of the logit difference. We conclude the model recalls facts by
this mechanism." Write the referee report: (1) three specific things the evidence does **not**
establish, each tied to a limitation you learned today; (2) two experiments you would require before
recommending acceptance, designed so that failure is possible and informative; (3) one sentence on
what the paper would have to show for the word "**the** mechanism" to be warranted.`,
      rubric: md`**(1) Three gaps** (any three, each with its mechanism named):
- **Distribution-boundedness.** The circuit was found on capital-city prompts, probably on a
  template. Nothing shown establishes it fires on paraphrases, other languages, other fact types, or
  the same fact in running prose — and the IOI follow-up work found exactly this kind of failure on
  close variants of its own template.
- **The missing 15%.** 85% recovery means a seventh of the effect is unaccounted for, and 6.1's
  lesson applies verbatim: leftovers may be disproportionately important, especially if the residual
  is concentrated in rare or hard inputs rather than smeared thinly. Was it examined or averaged
  away?
- **Localization is not algorithm.** Node-level patching shows *where deciding information sits*, not
  what any component computes. Without path patching (edges) and a QK/OV story per head, "circuit"
  is a heat map with a narrative attached. Forty heads with no wiring diagram is a parts list.
- **Ablation asymmetry / self-repair.** "Ablating the circuit destroys the behaviour" is consistent
  with the circuit being one of several sufficient routes that happen to be knocked out together;
  conversely, any individual head reported as unimportant may simply have been covered for. Both
  directions of the hydra problem need addressing.
- **Selection effects.** Which heads made the 40 depends on a threshold the authors chose. Report the
  sensitivity, or the number 40 is a hyperparameter.

**(2) Two experiments where failure is possible** — this is the discriminating criterion; reject
demonstrations that can only succeed:
- **Generalization test, pre-registered.** Apply the *fixed* circuit — no refitting, no
  re-thresholding — to held-out paraphrases, a different language, and a different fact category.
  Pre-commit that a large drop in recovered effect counts as evidence against the mechanism claim.
- **Edge-level verification.** Path-patch the claimed connections and check that the effect flows
  along the hypothesized wires. If node effects are large but the specific edges carry little, the
  proposed wiring diagram is wrong even though the localization is right.
- **Backup hunt.** Ablate the primary heads and look for components whose direct contribution
  *rises*. If large backups appear, the necessity claim needs rewriting and the circuit is one route
  among several.
- **Behavioural specificity.** Ablate the circuit and verify that matched control behaviours (recall
  of non-capital facts, general fluency, syntax) survive. A diffuse degradation would mean the
  ablation broke the model, not the mechanism.

**(3) The sentence.** Something equivalent to: to call it *the* mechanism rather than *a* sufficient
pathway, the paper must show the circuit accounts for essentially all of the effect (not 85%), that
no alternative route restores the behaviour when it is removed, and that the same wiring — verified
at the edge level — is what fires across the behaviour's full natural distribution rather than one
template.

**Full credit** requires three genuinely distinct gaps, at least one experiment whose failure would
actually be informative and pre-registered as such, and a part (3) that distinguishes *sufficient
pathway* from *the mechanism*. A report that only says "needs more experiments" is exactly the
non-answer this question is built to catch.`,
    },
  ],
}
