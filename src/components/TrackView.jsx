import React, { useEffect, useMemo, useRef, useState } from 'react'
import Markdown from '../lib/markdown.jsx'
import { planSession, nextAction, trackSummary, retention } from '../tracks/scheduler.js'
import { generateChallenge, evaluateSubmission, explainError, hasApiKey, keyIsFromEnv } from '../tracks/llm.js'
import { loadTracks, trackState, recordSession, saveSubmission, saveActive, loadActive } from '../tracks/store.js'
import { curriculum } from '../curriculum/index.js'
import { lessonStats } from '../lib/storage.js'

// What the learner has studied in this track's foundation module, as the generator sees it.
function foundationInfo(track, progress) {
  const mod = curriculum.find((m) => m.id === track.foundation?.moduleId)
  if (!mod) return { mod: null, rows: [], summary: '' }
  const rows = mod.lessons.map((l) => ({ lesson: l, ...lessonStats(l, progress || {}) }))
  const studied = rows.filter((r) => r.answered > 0)
  const summary = studied
    .map((r) => `- ${r.lesson.title}: answered ${r.answered}/${r.total}, ${r.answered ? Math.round((100 * r.correct) / r.answered) : 0}% correct`)
    .join('\n')
  return { mod, rows, studied, summary }
}

const pct = (x) => Math.round((x ?? 0) * 100)

function CompetencyBar({ c }) {
  const tone = c.attempts === 0 ? '#b9b3a6' : c.retention < 0.4 ? '#bf4d43' : c.retention < 0.7 ? '#c9a227' : '#5f8a5a'
  return (
    <div className="comp-row" title={c.note}>
      <span className="comp-name">{c.name}</span>
      <span className="comp-track">
        <span className="comp-fill" style={{ width: `${Math.max(pct(c.mastery), c.attempts ? 3 : 0)}%`, background: tone }} />
      </span>
      <span className="comp-meta">
        {c.attempts === 0 ? (
          <em>untested</em>
        ) : (
          <>
            L{c.level} · recall {pct(c.retention)}%
          </>
        )}
      </span>
    </div>
  )
}

export default function TrackView({ track, allTracks, setAllTracks, progress, openLesson }) {
  const state = trackState(allTracks, track.id)
  const summary = useMemo(() => trackSummary(track, state), [track, state])
  const found = useMemo(() => foundationInfo(track, progress), [track, progress])

  const [phase, setPhase] = useState('idle') // idle | generating | challenge | evaluating | evaluated
  const [plan, setPlan] = useState(() => planSession(track, state))
  const [challenge, setChallenge] = useState(null)
  const [submission, setSubmission] = useState('')
  const [image, setImage] = useState(null) // { dataUrl, base64, mediaType }
  const [evaluation, setEvaluation] = useState(null)
  const [finalScores, setFinalScores] = useState({})
  const [error, setError] = useState(null)
  const [startedAt, setStartedAt] = useState(null)
  const fileRef = useRef(null)

  // Restore an in-flight challenge across refreshes.
  useEffect(() => {
    const a = loadActive()
    if (a && a.trackId === track.id && a.challenge) {
      setPlan(a.plan)
      setChallenge(a.challenge)
      setSubmission(a.submission || '')
      setStartedAt(a.startedAt)
      setPhase('challenge')
    } else {
      setPlan(planSession(track, state))
      setPhase('idle')
      setChallenge(null)
      setSubmission('')
      setEvaluation(null)
      setImage(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id])

  useEffect(() => {
    if (phase === 'challenge' && challenge) {
      saveActive({ trackId: track.id, plan, challenge, submission, startedAt })
    }
  }, [phase, challenge, submission, plan, track.id, startedAt])

  async function begin(customPlan) {
    const p = customPlan || plan
    setError(null)
    setPhase('generating')
    try {
      const ch = await generateChallenge({ track, state, plan: p, foundationSummary: found.summary })
      setChallenge(ch)
      setPlan(p)
      setStartedAt(Date.now())
      setSubmission('')
      setImage(null)
      setEvaluation(null)
      setPhase('challenge')
    } catch (e) {
      setError(explainError(e))
      setPhase('idle')
    }
  }

  async function submit() {
    setError(null)
    setPhase('evaluating')
    try {
      const ev = await evaluateSubmission({
        track,
        challenge,
        submission,
        imageBase64: image?.base64,
        imageMediaType: image?.mediaType,
      })
      setEvaluation(ev)
      const seeded = {}
      for (const s of ev.scores) seeded[s.competencyId] = s.score
      setFinalScores(seeded)
      setPhase('evaluated')
      const id = `${track.id}-${startedAt}`
      saveSubmission(id, { challenge, submission, image: image?.dataUrl || null, evaluation: ev, at: Date.now() })
    } catch (e) {
      setError(explainError(e))
      setPhase('challenge')
    }
  }

  function commit() {
    const updated = recordSession(allTracks, track.id, { plan, challenge, evaluation, finalScores })
    setAllTracks(updated)
    const newState = trackState(updated, track.id)
    const overall = Object.values(finalScores).reduce((a, b) => a + b, 0) / (Object.values(finalScores).length || 1)
    const next = nextAction(track, newState, {
      overall,
      mode: plan.mode,
      primaryCompetency: challenge.primaryCompetency,
    })
    setPlan(next)
    setChallenge(null)
    setEvaluation(null)
    setSubmission('')
    setImage(null)
    setPhase('idle')
    saveActive(null)
  }

  function onFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      setImage({ dataUrl, base64: String(dataUrl).split(',')[1], mediaType: f.type || 'image/png' })
    }
    reader.readAsDataURL(f)
  }

  const noKey = !hasApiKey()

  return (
    <div className="lesson-container">
      <h1>{track.title}</h1>
      <p className="lesson-subtitle">{track.blurb}</p>

      {noKey && (
        <div className="track-alert">
          <b>No API key set.</b> These tracks invent each challenge at runtime, so they need an Anthropic key.
          Add one under <b>Settings</b> in the sidebar — or put <code>ANTHROPIC_KEY=…</code> in a{' '}
          <code>.env</code> file and restart the dev server.
        </div>
      )}

      {found.mod && (
        <div className="track-panel foundation-card">
          <div className="track-panel-head">
            <h2>{track.foundation.label}</h2>
            <span className="track-stat">
              {found.studied.length}/{found.rows.length} lessons started
            </span>
          </div>
          <p className="track-note" style={{ marginTop: 4 }}>
            The fixed lessons teach the concepts; this track makes you use them. The challenge generator
            reads your quiz results from these lessons, so it pitches work at what you've actually covered
            — and deliberately exercises what you found hard.
          </p>
          <div className="foundation-chips">
            {found.rows.map((r) => (
              <button
                key={r.lesson.id}
                className={`foundation-chip ${r.answered === 0 ? '' : r.correct / r.answered >= 0.7 ? 'good' : 'weak'}`}
                onClick={() => openLesson(found.mod.id, r.lesson.id)}
                title={r.lesson.title}
              >
                {r.lesson.title.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- where you stand ---- */}
      <div className="track-panel">
        <div className="track-panel-head">
          <h2>Where you stand</h2>
          <span className="track-stat">
            {summary.touched}/{summary.total} competencies touched · {summary.sessions} sessions
            {summary.daysAway != null && summary.daysAway >= 1 ? ` · ${Math.round(summary.daysAway)}d since last` : ''}
          </span>
        </div>
        <div className="comp-list">
          {summary.comps.map((c) => (
            <CompetencyBar key={c.id} c={c} />
          ))}
        </div>
        <p className="track-note">
          Bars show capability discounted by how much you'd still recall today. Green is fresh, amber is
          slipping, red has decayed — the scheduler reads exactly this to decide what you get next.
        </p>
      </div>

      {error && <div className="track-alert error">{error}</div>}

      {/* ---- the plan ---- */}
      {phase === 'idle' && (
        <div className="track-panel plan">
          <span className="plan-mode">{plan.mode}</span>
          <Markdown>{plan.rationale}</Markdown>
          <div className="btn-row">
            <button className="btn" disabled={noKey} onClick={() => begin()}>
              Begin session
            </button>
            <span className="track-note" style={{ margin: 0 }}>
              Targeting {plan.targets.map((t) => t.name).join(', ')} · level {plan.difficulty}/5
            </span>
          </div>
        </div>
      )}

      {phase === 'generating' && (
        <div className="track-panel">
          <div className="track-loading">Designing a challenge for exactly where you are…</div>
        </div>
      )}

      {/* ---- the challenge ---- */}
      {(phase === 'challenge' || phase === 'evaluating' || phase === 'evaluated') && challenge && (
        <div className="track-panel challenge">
          <div className="track-panel-head">
            <h2>{challenge.title}</h2>
            <span className="track-stat">
              level {challenge.level}/5 · ~{challenge.timeboxMinutes} min
            </span>
          </div>
          <p className="why-this">{challenge.whyThisNow}</p>
          <Markdown>{challenge.scenario}</Markdown>
          <h3>Your task</h3>
          <Markdown>{challenge.task}</Markdown>
          {challenge.constraints?.length > 0 && (
            <>
              <h3>Constraints</h3>
              <ul className="constraints">
                {challenge.constraints.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* ---- your work ---- */}
      {phase === 'challenge' && (
        <div className="track-panel">
          <h2>Your answer</h2>
          <p className="track-note" style={{ marginTop: 0 }}>
            {track.submission.prompt}
          </p>
          <textarea
            className="answer-input"
            style={{ minHeight: 260, fontFamily: track.submission.kind === 'code' ? 'var(--mono)' : 'var(--sans)' }}
            placeholder={track.submission.kind === 'code' ? '// your code here' : 'Your design…'}
            value={submission}
            onChange={(e) => setSubmission(e.target.value)}
          />
          <div className="btn-row">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFile} />
            <button className="btn secondary" onClick={() => fileRef.current.click()}>
              {image ? 'Replace attached image' : 'Attach a photo of your work'}
            </button>
            {image && (
              <button className="btn secondary small" onClick={() => setImage(null)}>
                ✕ remove
              </button>
            )}
            <button className="btn" disabled={!submission.trim() && !image} onClick={submit}>
              Submit for assessment
            </button>
          </div>
          {image && <img className="photo-preview" src={image.dataUrl} alt="your work" />}
          <p className="track-note">{track.submission.imageHint}</p>
        </div>
      )}

      {phase === 'evaluating' && (
        <div className="track-panel">
          <div className="track-loading">Assessing against the rubric…</div>
        </div>
      )}

      {/* ---- assessment + your override ---- */}
      {phase === 'evaluated' && evaluation && (
        <>
          <div className="track-panel">
            <div className="track-panel-head">
              <h2>Assessment</h2>
              <span className="track-stat big">{pct(evaluation.overall)}%</span>
            </div>
            <p className="verdict">{evaluation.verdict}</p>

            {evaluation.strengths?.length > 0 && (
              <>
                <h3>What worked</h3>
                <ul>
                  {evaluation.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}

            {evaluation.gaps?.length > 0 && (
              <>
                <h3>Gaps</h3>
                {evaluation.gaps.map((g, i) => (
                  <div key={i} className="gap">
                    <b>{g.gap}</b>
                    <div className="gap-why">{g.whyItMatters}</div>
                    <div className="gap-fix">→ {g.howToFix}</div>
                  </div>
                ))}
              </>
            )}

            <h3>What an expert would have added</h3>
            <Markdown>{evaluation.expertWouldHaveAdded}</Markdown>

            <div className="followup">
              <span className="followup-tag">The follow-up you'd get in the room</span>
              <Markdown>{evaluation.followUp}</Markdown>
            </div>
          </div>

          <div className="track-panel">
            <h2>Your call</h2>
            <p className="track-note" style={{ marginTop: 0 }}>
              The model scored each competency below. <b>You set the final number</b> — it's your mastery
              state, and you know whether you actually understood it or fluked it. These scores are what
              drive decay and what you get next time.
            </p>
            {evaluation.scores.map((s) => {
              const comp = track.competencies.find((c) => c.id === s.competencyId)
              const val = finalScores[s.competencyId] ?? s.score
              return (
                <div key={s.competencyId} className="score-row">
                  <div className="score-head">
                    <b>{comp?.name || s.competencyId}</b>
                    <span className="score-val">{pct(val)}%</span>
                  </div>
                  <div className="score-why">{s.reasoning}</div>
                  {s.evidence && <div className="score-ev">“{s.evidence}”</div>}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={pct(val)}
                    onChange={(e) =>
                      setFinalScores({ ...finalScores, [s.competencyId]: Number(e.target.value) / 100 })
                    }
                  />
                  <div className="score-anchor">
                    <span>missed it</span>
                    <span>shaky</span>
                    <span>solid</span>
                    <span>would hold up</span>
                  </div>
                </div>
              )
            })}
            <div className="btn-row">
              <button className="btn" onClick={commit}>
                Save and decide what's next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
