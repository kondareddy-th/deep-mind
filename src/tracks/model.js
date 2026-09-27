// Track definitions: the two ongoing, adaptive practice tracks.
//
// A MODULE (module1..module8) is fixed content written ahead of time.
// A TRACK is a living loop: a target, a competency map, a per-competency
// mastery state, and a generator that invents the next challenge at runtime
// from where you actually are. Nothing here is a pre-written question.

export const LEVELS = {
  1: 'foundational — can you do the thing at all',
  2: 'working — can you do it unaided on a normal case',
  3: 'solid — handles the awkward cases and states tradeoffs',
  4: 'strong — designs under real constraints, anticipates failure',
  5: 'authority — could set direction and be interrogated by experts',
}

export const TRACKS = [
  {
    id: 'architecture',
    title: 'Architecture Design',
    blurb: 'Design systems under real constraints, and defend the choices.',
    target: `Operate at a staff-engineer level of system design: given any plausible
product requirement, produce a design that names its constraints, justifies each
significant choice against alternatives, anticipates failure and cost, and survives
hostile interrogation. Three specialisations run through it: (a) general
distributed-systems design, (b) AI-product architecture — RAG, agents, evals,
inference cost, the failure modes of LLM systems, (c) performing this live, on a
clock, the way a senior system-design interview demands.`,
    foundation: { moduleId: 'sd', label: 'Foundations · System Design' },
    competencies: [
      { id: 'requirements', name: 'Requirements & scoping', note: 'Pinning down what must actually be built, and what must not.' },
      { id: 'data-modeling', name: 'Data modeling', note: 'Schemas, access patterns, consistency, the shape data really has.' },
      { id: 'api-design', name: 'API & interface design', note: 'Contracts, idempotency, versioning, what callers can rely on.' },
      { id: 'scale', name: 'Scale & bottlenecks', note: 'Partitioning, caching, load paths, finding the binding constraint.' },
      { id: 'failure', name: 'Failure modes', note: 'What breaks, how it degrades, blast radius, recovery.' },
      { id: 'tradeoffs', name: 'Tradeoff reasoning', note: 'Naming what you gave up and why that was the right trade.' },
      { id: 'cost', name: 'Cost & operability', note: 'Dollars, on-call burden, the bill the design signs you up for.' },
      { id: 'evolution', name: 'Evolution & migration', note: 'Changing a running system without stopping it.' },
      { id: 'ai-systems', name: 'AI system design', note: 'RAG, agents, evals, inference economics, LLM-specific failure.' },
      { id: 'communication', name: 'Design communication', note: 'Narrating a design under interrogation, on a clock.' },
    ],
    submission: {
      kind: 'design',
      prompt: 'Write your design. Structure it however you like — but make your assumptions, your choices, and what you rejected explicit.',
      allowsImage: true,
      imageHint: 'Photograph your whiteboard or paper diagram and attach it — diagrams count.',
    },
  },
  {
    id: 'coding',
    title: 'Coding',
    blurb: 'Build the thing, correctly and fast, and be able to prove it works.',
    target: `Be able to take a product idea and execute it end to end in code, at a
standard that survives review: correct on the awkward cases, tested where testing
earns its keep, fast enough on purpose rather than by luck, and readable by someone
who arrives a year later. Two specialisations run through it: (a) building
LLM-powered product features well, (b) performing under interview conditions —
a clean solution, explained while writing it, on a clock.

Primary language: Python. Write challenges in Python unless a specific competency
genuinely needs another language (for example SQL for a data-access exercise).`,
    foundation: { moduleId: 'py', label: 'Foundations · Python' },
    competencies: [
      { id: 'decomposition', name: 'Decomposition', note: 'Cutting a problem into the units it actually has.' },
      { id: 'correctness', name: 'Correctness & edge cases', note: 'Invariants, boundaries, the input that breaks it.' },
      { id: 'testing', name: 'Testing', note: 'What deserves a test, and what a good one asserts.' },
      { id: 'debugging', name: 'Debugging', note: 'Hypothesis-driven, instrumented, not guess-and-poke.' },
      { id: 'performance', name: 'Performance', note: 'Complexity, profiling, knowing which resource is binding.' },
      { id: 'readability', name: 'Readability & structure', note: 'Naming, shape, reviewability by a stranger.' },
      { id: 'api-ergonomics', name: 'Interface ergonomics', note: 'Designing code other people have to call.' },
      { id: 'concurrency', name: 'Concurrency & async', note: 'Races, coordination, ordering, the bugs that hide.' },
      { id: 'tooling', name: 'Tooling & velocity', note: 'Scripts, automation, editor leverage — speed as a skill.' },
      { id: 'ai-integration', name: 'Building with LLMs', note: 'Prompts, tools, evals, cost and failure in real features.' },
    ],
    submission: {
      kind: 'code',
      prompt: 'Paste your code. Include the tests if you wrote them, and a short note on anything you decided deliberately.',
      allowsImage: true,
      imageHint: 'Working on paper or a whiteboard? Photograph it and attach.',
    },
  },
]

export const trackById = (id) => TRACKS.find((t) => t.id === id)
