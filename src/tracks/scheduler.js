// The absence-aware scheduler.
//
// You appear at unpredictable intervals — nothing for eleven days, then a whole
// Saturday. So the system never assumes a cadence. Instead, every time you open a
// track it asks two questions: what has decayed since you were last here, and what
// did you get wrong the time before that? Those answers choose the session.
//
// The decay model is a deliberately legible forgetting curve (the spaced-repetition
// idea, simplified so you can audit it):
//
//     retention(t) = exp(-daysSince / strength)
//
// `strength` is measured in days and is the half-life-ish parameter: it grows when
// you demonstrate a competency and collapses when you fail one. A competency you
// nailed three times running survives months of absence; one you fluffed last time
// is stale within days — which is exactly the material a returning session should
// open on.

const DAY_MS = 86400000
const NEW_STRENGTH = 2 // days — an untested competency is assumed fragile
const MIN_STRENGTH = 0.75
const MAX_STRENGTH = 400

export const daysBetween = (a, b) => Math.max(0, (b - a) / DAY_MS)

export function retention(comp, now = Date.now()) {
  if (!comp || !comp.lastSeen) return 0
  const s = Math.max(comp.strength || NEW_STRENGTH, MIN_STRENGTH)
  return Math.exp(-daysBetween(comp.lastSeen, now) / s)
}

// Capability, discounted by how much of it you'd still have right now.
export function effectiveMastery(comp, now = Date.now()) {
  if (!comp || !comp.lastSeen) return 0
  return ((comp.level || 1) / 5) * retention(comp, now)
}

// Update one competency from a graded result. `score` is 0..1.
export function applyScore(comp, score, now = Date.now()) {
  const prev = comp || { level: 1, strength: NEW_STRENGTH, history: [] }
  let strength = Math.max(prev.strength || NEW_STRENGTH, MIN_STRENGTH)
  let level = prev.level || 1

  if (score >= 0.75) {
    strength = strength * (1.5 + score) // 2.25x–2.5x: a clean pass buys real durability
    if (score >= 0.85) level = Math.min(5, level + 1)
  } else if (score >= 0.5) {
    strength = strength * 1.25
  } else if (score >= 0.3) {
    strength = strength * 0.9
  } else {
    strength = Math.max(MIN_STRENGTH, strength * 0.4) // a miss makes it stale fast, on purpose
    level = Math.max(1, level - 1)
  }

  return {
    ...prev,
    level,
    strength: Math.min(MAX_STRENGTH, strength),
    lastSeen: now,
    lastScore: score,
    attempts: (prev.attempts || 0) + 1,
    history: [...(prev.history || []), { at: now, score }].slice(-30),
  }
}

// ---- session planning -------------------------------------------------------

export const MODES = {
  PROBE: 'probe',
  REINFORCE: 'reinforce',
  ADVANCE: 'advance',
  CONSOLIDATE: 'consolidate',
}

function describeAbsence(days) {
  if (days < 1) return 'You were here earlier today'
  if (days < 2) return 'You were here yesterday'
  if (days < 7) return `You have been away ${Math.round(days)} days`
  if (days < 30) return `You have been away ${Math.round(days)} days — long enough for things to slip`
  return `You have been away ${Math.round(days)} days — expect real decay`
}

/**
 * Decide what this session should be, given how long you've been gone and how
 * you did last time. Returns a plan the UI can render and the generator can act on.
 */
export function planSession(track, state, now = Date.now()) {
  const comps = track.competencies.map((c) => {
    const st = state.competencies?.[c.id]
    return {
      ...c,
      state: st,
      seen: !!st?.lastSeen,
      retention: retention(st, now),
      mastery: effectiveMastery(st, now),
      lastScore: st?.lastScore ?? null,
      level: st?.level ?? 1,
    }
  })

  const daysAway = state.lastSessionAt ? daysBetween(state.lastSessionAt, now) : Infinity
  const seen = comps.filter((c) => c.seen)
  const fresh = comps.filter((c) => !c.seen)

  // Decayed: you knew it, and the curve says you probably don't right now.
  const decayed = seen.filter((c) => c.retention < 0.55).sort((a, b) => a.retention - b.retention)
  // Shaky: you got it wrong or half-right the last time it came up.
  const shaky = seen.filter((c) => (c.lastScore ?? 1) < 0.6).sort((a, b) => a.lastScore - b.lastScore)

  const needsProbe = seen.length > 0 && daysAway >= 2 && decayed.length + shaky.length >= 2

  if (needsProbe) {
    const targets = [...new Map([...decayed, ...shaky].map((c) => [c.id, c])).values()].slice(0, 3)
    return {
      mode: MODES.PROBE,
      targets,
      difficulty: Math.max(1, Math.min(...targets.map((t) => t.level))),
      rationale:
        `${describeAbsence(daysAway)}. ${targets.length} ${targets.length === 1 ? 'competency has' : 'competencies have'} ` +
        `drifted below half-recall or went badly last time — ` +
        targets.map((t) => t.name.toLowerCase()).join(', ') +
        `. Starting with a short recall probe before anything new; how it goes decides what comes next.`,
      isProbe: true,
    }
  }

  if (shaky.length > 0) {
    const target = shaky[0]
    return {
      mode: MODES.REINFORCE,
      targets: [target],
      difficulty: Math.max(1, target.level),
      rationale:
        `Last time, ${target.name.toLowerCase()} scored ${Math.round((target.lastScore ?? 0) * 100)}%. ` +
        `Working that again at level ${target.level} before moving on — a weak competency left alone just decays faster.`,
    }
  }

  if (fresh.length > 0) {
    const target = fresh[0]
    return {
      mode: MODES.ADVANCE,
      targets: [target],
      difficulty: 2,
      rationale:
        `Everything you've touched is holding. ${target.name} is untested, so that's the frontier — ` +
        `starting at working level and adjusting from what you produce.`,
    }
  }

  const daysSinceIntegrative = state.lastIntegrativeAt ? daysBetween(state.lastIntegrativeAt, now) : Infinity
  if (daysSinceIntegrative > 21 && seen.length >= 4) {
    return {
      mode: MODES.CONSOLIDATE,
      targets: comps.sort((a, b) => b.mastery - a.mastery).slice(0, 4),
      difficulty: Math.round(comps.reduce((s, c) => s + c.level, 0) / comps.length),
      rationale:
        `Individual competencies are in decent shape, but it has been a while since anything forced you to ` +
        `use several at once. Time for an integrative piece — that's where the gaps between skills show up.`,
    }
  }

  const target = comps.filter((c) => c.level < 5).sort((a, b) => a.mastery - b.mastery)[0] || comps[0]
  return {
    mode: MODES.ADVANCE,
    targets: [target],
    difficulty: Math.min(5, (target.level || 1) + 1),
    rationale:
      `Nothing is stale and nothing is broken. ${target.name} is your weakest live competency ` +
      `(level ${target.level}), so we push it one level up.`,
  }
}

/**
 * After a graded attempt, decide what should happen next in this same sitting.
 * This is what makes a long unplanned session escalate properly.
 */
export function nextAction(track, state, lastResult, now = Date.now()) {
  const score = lastResult?.overall ?? 0
  const wasProbe = lastResult?.mode === MODES.PROBE

  if (wasProbe) {
    return score < 0.6
      ? {
          ...planSession(track, state, now),
          mode: MODES.REINFORCE,
          rationale:
            `The probe came back at ${Math.round(score * 100)}% — that confirms real decay rather than a slow start. ` +
            `Rebuilding those competencies before introducing anything new.`,
        }
      : {
          ...planSession(track, state, now),
          rationale:
            `Probe came back at ${Math.round(score * 100)}% — it held up better than the curve predicted, so the ` +
            `decay estimate has been corrected upward. Moving on to new ground.`,
        }
  }

  if (score < 0.45) {
    const id = lastResult.primaryCompetency
    const comp = track.competencies.find((c) => c.id === id)
    return {
      mode: MODES.REINFORCE,
      targets: comp ? [{ ...comp, level: state.competencies?.[id]?.level ?? 1 }] : [],
      difficulty: Math.max(1, (state.competencies?.[id]?.level ?? 2) - 1),
      rationale:
        `That one didn't land (${Math.round(score * 100)}%). Same competency, one level easier — ` +
        `the point is to rebuild the floor, not to grind against a ceiling.`,
    }
  }

  return planSession(track, state, now)
}

/** Everything the dashboard needs to show you where you stand right now. */
export function trackSummary(track, state, now = Date.now()) {
  const comps = track.competencies.map((c) => {
    const st = state.competencies?.[c.id]
    return {
      id: c.id,
      name: c.name,
      note: c.note,
      level: st?.level ?? 0,
      retention: retention(st, now),
      mastery: effectiveMastery(st, now),
      attempts: st?.attempts ?? 0,
      lastScore: st?.lastScore ?? null,
      lastSeen: st?.lastSeen ?? null,
    }
  })
  const seen = comps.filter((c) => c.attempts > 0)
  return {
    comps,
    overall: seen.length ? seen.reduce((s, c) => s + c.mastery, 0) / track.competencies.length : 0,
    touched: seen.length,
    total: track.competencies.length,
    daysAway: state.lastSessionAt ? daysBetween(state.lastSessionAt, now) : null,
    sessions: state.sessions?.length ?? 0,
  }
}
