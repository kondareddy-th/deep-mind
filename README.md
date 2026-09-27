# AI Research Scientist Academy

A local learning platform for one goal: becoming a world-leading AI research scientist.

## How to run

```bash
npm install   # first time only
npm run dev
```

Open http://localhost:5173

## How to learn here (the method)

1. **Read the lesson.** Every concept is motivated by where it shows up inside an LLM.
2. **Play with the 3D visualizations** — rotate, drag sliders, break things. Intuition first.
3. **Answer every question on paper, by hand.** The physical act of writing is the memory glue.
   - Multiple choice / compute questions: check yourself in the app.
   - Written questions: photograph your page, upload it, *then* reveal the model answer and
     grade yourself honestly (Nailed it / Partially / Missed it).
4. **Revise from the Dashboard.** Anything marked *partial* or *missed* lands in the Review queue.
   Redo it on paper until the queue is empty.

Your progress, typed answers, and photos are stored locally in your browser
(localStorage + IndexedDB). Nothing leaves your machine.

## Curriculum roadmap

| Module | Status |
|---|---|
| 1 · Math for LLMs — vectors, matrices, calculus & backprop, probability, information theory, optimization | ✅ live |
| 2 · Transformers & Attention — why attention, the mechanism from scratch, multi-head, RoPE, the block, full GPT assembly | ✅ live |
| 3 · How LLMs Work — tokenization (BPE by hand), sampling, the KV cache, the memory-bandwidth wall, chat as a costume, hallucination/CoT/ICL from first principles | ✅ live |
| 4 · Architecture & Infra — the memory wall, the four parallelisms, MoE, quantization, serving economics, reading a model card (+ SSM/hybrid frontier) | ✅ live |
| 5 · Training LLMs Better — data pipelines, scaling laws & Chinchilla, running the big one, SFT & LoRA, RLHF/DPO/reasoning models, the eval crisis | ✅ live |
| 6 · Research Frontier — superposition & SAEs, circuits & induction heads, alignment, agents & inference-time compute, reading the literature, doing research | ✅ live |
| 7 · Adaptation — the decision tree (prompt/RAG/fine-tune), LoRA & the low-rank bet, data as the real lever, preference tuning (DPO/KTO/GRPO), the toolchain, evaluating your own model | ✅ live |
| 8 · Efficiency & the Frontier Mindset — where time goes (roofline), kernels, the DeepSeek teardown, distillation, the seven idea-generators, your research agenda (capstone) | ✅ live |

## Foundations: Python and System Design

Two introductory sections sit at the top of the curriculum, one per adaptive track. They assume only
basic programming and are heavy on small, runnable examples.

| Foundations · Python | Foundations · System Design |
|---|---|
| Py.1 Classes | SD.1 The design method |
| Py.2 Inheritance, composition & polymorphism | SD.2 Back-of-envelope estimation |
| Py.3 The data model — dunder methods & dataclasses | SD.3 Networks & APIs |
| Py.4 Properties, class methods & encapsulation | SD.4 Databases |
| Py.5 Functions as objects — closures & decorators | SD.5 Caching |
| Py.6 Iterators, generators & comprehensions | SD.6 Queues & async work |
| Py.7 Errors, context managers & type hints | SD.7 Scaling & reliability |
| Py.8 Modules, testing & async | SD.8 Two full designs — a news feed and an AI assistant |

The adaptive tracks read your quiz results from these lessons, so generated challenges are pitched at
concepts you have actually covered and deliberately exercise the ones you found hard.

## Two ongoing adaptive tracks

Alongside the fixed curriculum there are two **tracks** that never run out, because nothing in
them is written in advance:

| Track | Target |
|---|---|
| **Architecture Design** | Staff-level system design — plus AI-product architecture and live, on-the-clock interview performance |
| **Coding** | Ship products solo at review standard — plus building LLM features and interview-condition execution |

Each track carries a **competency map** (10 dimensions apiece) and a per-competency mastery state
with a forgetting curve: `retention = exp(-daysAway / strength)`. A competency you have nailed
several times survives months away; one you fluffed last time is stale within days.

Because sessions happen whenever you feel like it — nothing for two weeks, then a whole Saturday —
the scheduler is **absence-aware** rather than scheduled. When you open a track it:

1. measures what has decayed since your last visit and what you previously got wrong,
2. opens with a **recall probe** on exactly that material if enough has slipped,
3. reads the probe result to choose the next move — *reinforce*, *advance*, or *consolidate*,
4. generates the challenge at runtime for that decision, at a difficulty set by your current level.

You submit code or a design (typing, or a photo of your whiteboard), it is assessed against a
per-competency rubric with quoted evidence, gaps, what an expert would have added, and the
follow-up question you would face in the room — **and then you set the final score yourself**,
because it is your mastery state and you know whether you understood it or fluked it.

### Setting up the tracks

The tracks call the Anthropic API from your browser with your own key. Either:

- paste a key into **Settings** (stored in this browser's localStorage), or
- put `ANTHROPIC_KEY=sk-ant-…` in a `.env` file at the project root.

The `.env` path is injected **only by the dev server** — a production build always receives an
empty string, so `npm run build` output can never carry your key, and `.env` is gitignored.
Modules 1–8 need no key and work entirely offline.

**The curriculum: 64 lessons (16 foundation + 48 core), 768 questions, 192 stop-and-think boxes, 18 interactive 3D visualizations — plus two adaptive tracks that never run out.**

Modules 1–6 teach how LLMs work, end to end. Modules 7–8 teach what practitioners and frontier
labs actually *do* with that understanding: adapting models, buying capability with less compute,
and generating new ideas on purpose.

## Tech

Vite + React, three.js (3D visualizations), KaTeX (math), marked (markdown),
idb-keyval (photo storage). No backend — fully local.

## Adding lessons

Each lesson is one file in `src/curriculum/moduleN/lessonM.js` exporting
`{ id, title, subtitle, sections, questions }`, registered in `src/curriculum/index.js`.
See `src/curriculum/module1/lesson1.js` for the schema and content conventions
(String.raw templates, `$…$` / `$$…$$` LaTeX, section types text/viz/example,
question kinds mcq/numeric/written).
