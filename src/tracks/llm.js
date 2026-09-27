// Runtime challenge generation and evaluation, via the Anthropic Messages API.
//
// Everything here runs in YOUR browser against YOUR key. Nothing is sent anywhere
// else — same local-first promise as the rest of the platform. The key lives in
// localStorage and is passed straight to the SDK.

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

export const MODEL = 'claude-opus-5'
const KEY_STORAGE = 'ai-academy-anthropic-key'

// Dev convenience: vite.config.js injects ANTHROPIC_KEY from .env when running
// `npm run dev`, and injects '' for any production build — so a built bundle can
// never carry your key. localStorage always wins if you've set a key in Settings.
const devKey = typeof __DEV_ANTHROPIC_KEY__ === 'string' ? __DEV_ANTHROPIC_KEY__ : ''

export const getApiKey = () => {
  try {
    return localStorage.getItem(KEY_STORAGE) || devKey || ''
  } catch {
    return devKey || ''
  }
}

/** True when the key in use came from .env rather than Settings — the UI says so. */
export const keyIsFromEnv = () => {
  try {
    return !localStorage.getItem(KEY_STORAGE) && !!devKey
  } catch {
    return !!devKey
  }
}
export const setApiKey = (k) => {
  try {
    k ? localStorage.setItem(KEY_STORAGE, k) : localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* private mode — key simply won't persist */
  }
}
export const hasApiKey = () => !!getApiKey()

function client() {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('NO_API_KEY')
  // Local-first app, user-supplied key, no server to proxy through.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

// ---- schemas ---------------------------------------------------------------

const ChallengeSchema = z.object({
  title: z.string(),
  scenario: z.string(),
  task: z.string(),
  constraints: z.array(z.string()),
  timeboxMinutes: z.number(),
  primaryCompetency: z.string(),
  alsoTests: z.array(z.string()),
  level: z.number(),
  rubric: z.array(
    z.object({
      competencyId: z.string(),
      criterion: z.string(),
      whatGoodLooksLike: z.string(),
    })
  ),
  whyThisNow: z.string(),
})

const EvaluationSchema = z.object({
  overall: z.number(),
  verdict: z.string(),
  scores: z.array(
    z.object({
      competencyId: z.string(),
      score: z.number(),
      reasoning: z.string(),
      evidence: z.string(),
    })
  ),
  strengths: z.array(z.string()),
  gaps: z.array(
    z.object({
      gap: z.string(),
      whyItMatters: z.string(),
      howToFix: z.string(),
    })
  ),
  expertWouldHaveAdded: z.string(),
  followUp: z.string(),
})

// ---- prompt construction ----------------------------------------------------

function competencyBriefing(track, state, plan) {
  const lines = track.competencies.map((c) => {
    const st = state.competencies?.[c.id]
    if (!st?.lastSeen) return `- ${c.id} (${c.name}): never assessed`
    const days = Math.round((Date.now() - st.lastSeen) / 86400000)
    return `- ${c.id} (${c.name}): level ${st.level}/5, last scored ${Math.round((st.lastScore ?? 0) * 100)}%, ${days}d ago, ${st.attempts} attempt(s)`
  })
  return lines.join('\n')
}

function recentHistory(state, limit = 6) {
  const s = (state.sessions || []).slice(-limit)
  if (!s.length) return 'No prior sessions — this is the first.'
  return s
    .map(
      (x) =>
        `- ${new Date(x.at).toISOString().slice(0, 10)} · ${x.mode} · "${x.title}" · scored ${Math.round((x.overall ?? 0) * 100)}%` +
        (x.topGap ? ` · weakest point: ${x.topGap}` : '')
    )
    .join('\n')
}

const GENERATOR_SYSTEM = `You design practice challenges for a single, serious learner who is working
toward a stated long-term target. You are not writing a quiz. You are choosing the ONE exercise that
would most move this person toward that target right now, given exactly where they are.

Principles:
- The challenge must be concrete and situated. Real numbers, real constraints, a real situation with
  something at stake — never "explain X" or "discuss Y".
- It must be answerable in the stated timebox by someone at the stated level, and it must be
  possible to do it BADLY in an instructive way. If every competent attempt passes, it tests nothing.
- Calibrate to the level given. Level 1-2: can they do the thing at all. Level 3: do they handle the
  awkward case and name the tradeoff. Level 4: can they design under a real constraint and anticipate
  failure. Level 5: would this survive an expert interrogating it.
- Constraints are where difficulty lives. Prefer adding a sharp constraint over adding scope.
- The rubric must be specific enough that two competent graders would agree, and must describe what
  GOOD looks like, not merely what the topic is.
- Never repeat a scenario from the learner's recent history. Vary the domain.`

const EVALUATOR_SYSTEM = `You assess a learner's submitted work against a rubric, in service of a
long-term target. You are a demanding but fair senior reviewer, not a cheerleader and not a pedant.

Principles:
- Score each competency 0.0-1.0 on what the submission ACTUALLY demonstrates. Quote the specific
  evidence — or state plainly that the evidence is absent.
- Absence of evidence is not a pass. If they never addressed failure modes, failure modes score low,
  however good the rest is.
- Be concrete in gaps: name what is missing, why it would bite in reality, and what to do instead.
- "expertWouldHaveAdded" should be the thing a genuinely senior practitioner would have said that
  the learner did not — the highest-value single addition.
- "followUp" is the question you would ask next if you were interrogating this design or this code in
  a room. It should target the weakest or most hand-waved point.
- Do not inflate. A 0.7 means solid-but-improvable. Reserve above 0.85 for work that would genuinely
  hold up under scrutiny.`

// ---- calls ------------------------------------------------------------------

export async function generateChallenge({ track, state, plan, foundationSummary }) {
  const c = client()
  const targetList = plan.targets.map((t) => `${t.id} (${t.name}) — currently level ${t.level ?? 1}`).join('\n')

  const msg = `TRACK: ${track.title}

LONG-TERM TARGET:
${track.target}

COMPETENCY MAP AND CURRENT STATE:
${competencyBriefing(track, state, plan)}

RECENT SESSIONS:
${recentHistory(state)}

FOUNDATION LESSONS THE LEARNER HAS STUDIED (their quiz results — use this to pitch the challenge at concepts they have actually covered, and to deliberately exercise ones they found hard):
${foundationSummary || 'No foundation lessons attempted yet — assume only basic programming knowledge and do not rely on advanced language features without a hint.'}

THE SCHEDULER HAS DECIDED THIS SESSION IS: ${plan.mode.toUpperCase()}
Its reasoning: ${plan.rationale}

TARGET THIS SESSION:
${targetList}

Requested difficulty level: ${plan.difficulty}/5
${
  plan.mode === 'probe'
    ? 'This is a RECALL PROBE after time away. Make it compact and diagnostic — it should establish quickly whether these competencies are still there, not teach something new. Timebox 10-15 minutes.'
    : plan.mode === 'consolidate'
      ? 'This is an INTEGRATIVE exercise: it must force several competencies to be used together, where the gaps BETWEEN skills show up. Timebox 45-90 minutes.'
      : plan.mode === 'reinforce'
        ? 'This is REINFORCEMENT of something that went badly. Approach the same competency from a different angle than a standard exercise would — if the last framing did not land, repeating it will not either.'
        : 'This is NEW GROUND. Push into territory they have not demonstrated yet.'
}

Design the single best challenge for this moment. Use only competency ids from the map above.`

  const res = await c.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: GENERATOR_SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(ChallengeSchema, 'challenge') },
    messages: [{ role: 'user', content: msg }],
  })

  if (!res.parsed_output) throw new Error('The model returned a challenge that could not be parsed. Try again.')
  return res.parsed_output
}

export async function evaluateSubmission({ track, challenge, submission, imageBase64, imageMediaType }) {
  const c = client()

  const rubricText = challenge.rubric
    .map((r) => `- [${r.competencyId}] ${r.criterion}\n    good looks like: ${r.whatGoodLooksLike}`)
    .join('\n')

  const content = []
  if (imageBase64) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: imageMediaType || 'image/png', data: imageBase64 },
    })
  }
  content.push({
    type: 'text',
    text: `TRACK: ${track.title}

LONG-TERM TARGET:
${track.target}

THE CHALLENGE THEY WERE GIVEN
Title: ${challenge.title}
Level: ${challenge.level}/5
Scenario: ${challenge.scenario}
Task: ${challenge.task}
Constraints:
${challenge.constraints.map((x) => `- ${x}`).join('\n')}

RUBRIC:
${rubricText}

THEIR SUBMISSION:
"""
${submission || '(no written submission — see attached image)'}
"""
${imageBase64 ? '\nAn image of their handwritten work/diagram is attached above. Read it as part of the submission.' : ''}

Assess it. Score every competency listed in the rubric, using its id exactly.`,
  })

  const res = await c.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: EVALUATOR_SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(EvaluationSchema, 'evaluation') },
    messages: [{ role: 'user', content }],
  })

  if (!res.parsed_output) throw new Error('The model returned an assessment that could not be parsed. Try again.')
  return res.parsed_output
}

export async function testKey() {
  const c = client()
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 16,
    messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
  })
  return res.content.find((b) => b.type === 'text')?.text ?? ''
}

/** Turn SDK errors into something a human can act on. */
export function explainError(err) {
  if (err?.message === 'NO_API_KEY') return 'No API key set. Add one in Settings to enable the adaptive tracks.'
  if (err instanceof Anthropic.AuthenticationError) return 'That API key was rejected. Check it in Settings.'
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a moment and retry.'
  if (err instanceof Anthropic.BadRequestError) return `The request was rejected: ${err.message}`
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the API — check your connection.'
  if (err instanceof Anthropic.APIError) return `API error ${err.status}: ${err.message}`
  return err?.message || 'Something went wrong.'
}
