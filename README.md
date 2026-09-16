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

**The curriculum is complete: 48 lessons, 576 questions, 144 stop-and-think boxes, 18 interactive 3D visualizations.**

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
