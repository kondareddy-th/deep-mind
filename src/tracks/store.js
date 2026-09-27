// Track persistence. Mastery state is small JSON (localStorage); submissions and
// photographed work are bulkier (IndexedDB), matching how the lesson quizzes
// already store your handwritten answers.

import { get, set } from 'idb-keyval'

const KEY = 'ai-academy-tracks-v1'

const emptyTrack = () => ({
  competencies: {},
  sessions: [],
  lastSessionAt: null,
  lastIntegrativeAt: null,
})

export function loadTracks() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

export function saveTracks(all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* quota or private mode */
  }
}

export function trackState(all, trackId) {
  return all[trackId] || emptyTrack()
}

/** Record a completed, graded attempt and roll the mastery state forward. */
export function recordSession(all, trackId, { plan, challenge, evaluation, finalScores, at = Date.now() }) {
  const state = { ...trackState(all, trackId) }
  const comps = { ...state.competencies }

  // finalScores is { competencyId: 0..1 } — the score AFTER your own override.
  for (const [cid, score] of Object.entries(finalScores)) {
    comps[cid] = applyScoreLocal(comps[cid], score, at)
  }

  const overall =
    Object.values(finalScores).length
      ? Object.values(finalScores).reduce((a, b) => a + b, 0) / Object.values(finalScores).length
      : 0

  const next = {
    ...state,
    competencies: comps,
    lastSessionAt: at,
    lastIntegrativeAt: plan.mode === 'consolidate' ? at : state.lastIntegrativeAt,
    sessions: [
      ...(state.sessions || []),
      {
        at,
        mode: plan.mode,
        title: challenge.title,
        level: challenge.level,
        overall,
        primaryCompetency: challenge.primaryCompetency,
        topGap: evaluation?.gaps?.[0]?.gap || null,
      },
    ].slice(-100),
  }

  const updated = { ...all, [trackId]: next }
  saveTracks(updated)
  return updated
}

// Kept local to avoid a circular import with scheduler.js; identical maths.
function applyScoreLocal(prev0, score, now) {
  const prev = prev0 || { level: 1, strength: 2, history: [] }
  let strength = Math.max(prev.strength || 2, 0.75)
  let level = prev.level || 1
  if (score >= 0.75) {
    strength *= 1.5 + score
    if (score >= 0.85) level = Math.min(5, level + 1)
  } else if (score >= 0.5) strength *= 1.25
  else if (score >= 0.3) strength *= 0.9
  else {
    strength = Math.max(0.75, strength * 0.4)
    level = Math.max(1, level - 1)
  }
  return {
    ...prev,
    level,
    strength: Math.min(400, strength),
    lastSeen: now,
    lastScore: score,
    attempts: (prev.attempts || 0) + 1,
    history: [...(prev.history || []), { at: now, score }].slice(-30),
  }
}

// ---- submissions (bulky) ----------------------------------------------------

export const saveSubmission = (id, payload) => set(`track-sub:${id}`, payload)
export const loadSubmission = (id) => get(`track-sub:${id}`)

/** In-flight session, so a refresh mid-challenge doesn't lose your work. */
const ACTIVE = 'ai-academy-active-session-v1'
export function saveActive(session) {
  try {
    session ? localStorage.setItem(ACTIVE, JSON.stringify(session)) : localStorage.removeItem(ACTIVE)
  } catch {
    /* ignore */
  }
}
export function loadActive() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE)) || null
  } catch {
    return null
  }
}
