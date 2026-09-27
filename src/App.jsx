import React, { useMemo, useState } from 'react'
import Ponder from './components/Ponder.jsx'
import { curriculum } from './curriculum/index.js'
import Markdown from './lib/markdown.jsx'
import Viz from './components/Viz.jsx'
import Quiz from './components/Quiz.jsx'
import { loadProgress, lessonStats, reviewQueue } from './lib/storage.js'
import TrackView from './components/TrackView.jsx'
import Settings from './components/Settings.jsx'
import { TRACKS, trackById } from './tracks/model.js'
import { loadTracks, trackState } from './tracks/store.js'
import { trackSummary } from './tracks/scheduler.js'

export default function App() {
  const [view, setView] = useState({ page: 'dashboard' }) // or { page:'lesson'|'track'|'settings', ... }
  const [progress, setProgress] = useState(loadProgress)
  const [allTracks, setAllTracks] = useState(loadTracks)

  const flat = useMemo(() => {
    const list = []
    for (const mod of curriculum) for (const l of mod.lessons) list.push({ mod, lesson: l })
    return list
  }, [])

  const openLesson = (moduleId, lessonId) => {
    setView({ page: 'lesson', moduleId, lessonId })
    document.querySelector('.main')?.scrollTo(0, 0)
  }

  return (
    <>
      <nav className="sidebar">
        <h1>AI Research Scientist Academy</h1>
        <p className="tagline">Your training ground. Write it by hand — remember it forever.</p>
        <button
          className={`nav-btn ${view.page === 'dashboard' ? 'active' : ''}`}
          onClick={() => setView({ page: 'dashboard' })}
        >
          Dashboard & Review queue
        </button>
        <div className="module-header">Ongoing tracks · adaptive</div>
        {TRACKS.map((t) => {
          const s = trackSummary(t, trackState(allTracks, t.id))
          return (
            <button
              key={t.id}
              className={`nav-btn ${view.page === 'track' && view.trackId === t.id ? 'active' : ''}`}
              onClick={() => {
                setView({ page: 'track', trackId: t.id })
                document.querySelector('.main')?.scrollTo(0, 0)
              }}
            >
              <span className="lesson-row">
                <span className={`dot ${s.overall > 0.6 ? 'done' : s.touched ? 'partial' : ''}`} />
                {t.title}
              </span>
            </button>
          )
        })}
        {curriculum.map((mod) => (
          <ModuleNav key={mod.id} mod={mod} view={view} progress={progress} openLesson={openLesson} />
        ))}
        <div className="module-header">Setup</div>
        <button
          className={`nav-btn ${view.page === 'settings' ? 'active' : ''}`}
          onClick={() => setView({ page: 'settings' })}
        >
          Settings
        </button>
      </nav>
      <main className="main">
        {view.page === 'dashboard' && <Dashboard progress={progress} openLesson={openLesson} />}
        {view.page === 'settings' && <Settings />}
        {view.page === 'track' && (
          <TrackView
            key={view.trackId}
            track={trackById(view.trackId)}
            allTracks={allTracks}
            setAllTracks={setAllTracks}
          />
        )}
        {view.page === 'lesson' && (
          <LessonView
            key={view.lessonId}
            view={view}
            flat={flat}
            progress={progress}
            setProgress={setProgress}
            openLesson={openLesson}
          />
        )}
      </main>
    </>
  )
}

function ModuleNav({ mod, view, progress, openLesson }) {
  const totals = mod.lessons.reduce(
    (acc, l) => {
      const s = lessonStats(l, progress)
      acc.total += s.total
      acc.answered += s.answered
      return acc
    },
    { total: 0, answered: 0 }
  )
  const pct = totals.total ? Math.round((100 * totals.answered) / totals.total) : 0

  return (
    <div>
      <div className={`module-header ${mod.comingSoon ? 'coming-soon' : ''}`}>
        {mod.title}
        {!mod.comingSoon && totals.total > 0 && <span className="pct">{pct}%</span>}
      </div>
      {mod.comingSoon && <div className="nav-btn coming-soon">unlocks after Module {mod.after}</div>}
      {mod.lessons.map((l) => {
        const s = lessonStats(l, progress)
        const dotCls = s.answered === s.total && s.total > 0 ? (s.correct === s.total ? 'done' : 'partial') : ''
        return (
          <button
            key={l.id}
            className={`nav-btn ${view.lessonId === l.id ? 'active' : ''}`}
            onClick={() => openLesson(mod.id, l.id)}
          >
            <span className="lesson-row">
              <span className={`dot ${dotCls}`} />
              {l.title}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function LessonView({ view, flat, progress, setProgress, openLesson }) {
  const idx = flat.findIndex((f) => f.lesson.id === view.lessonId)
  if (idx === -1) return <div className="lesson-container">Lesson not found.</div>
  const { lesson } = flat[idx]
  const prev = flat[idx - 1]
  const next = flat[idx + 1]

  return (
    <div className="lesson-container">
      <h1>{lesson.title}</h1>
      <p className="lesson-subtitle">{lesson.subtitle}</p>
      {lesson.sections.map((sec, i) => {
        if (sec.type === 'viz') return <Viz key={i} name={sec.viz} caption={sec.caption} />
        if (sec.type === 'ponder') return <Ponder key={i} question={sec.question} answer={sec.answer} />
        if (sec.type === 'example')
          return (
            <div key={i} className="example-card">
              <span className="example-tag">Worked example{sec.title ? ` — ${sec.title}` : ''}</span>
              <Markdown>{sec.md}</Markdown>
            </div>
          )
        return <Markdown key={i}>{sec.md}</Markdown>
      })}
      <Quiz lesson={lesson} progress={progress} setProgress={setProgress} />
      <div className="lesson-nav">
        {prev && (
          <button className="btn secondary" onClick={() => openLesson(prev.mod.id, prev.lesson.id)}>
            ← {prev.lesson.title}
          </button>
        )}
        {next && (
          <button className="btn" onClick={() => openLesson(next.mod.id, next.lesson.id)}>
            {next.lesson.title} →
          </button>
        )}
      </div>
    </div>
  )
}

function Dashboard({ progress, openLesson }) {
  const queue = reviewQueue(curriculum, progress)
  let total = 0,
    answered = 0,
    correct = 0
  for (const mod of curriculum)
    for (const l of mod.lessons) {
      const s = lessonStats(l, progress)
      total += s.total
      answered += s.answered
      correct += s.correct
    }

  return (
    <div className="lesson-container">
      <h1>Your training dashboard</h1>
      <p className="lesson-subtitle">
        The goal: world-leading AI research scientist. The method: understand deeply, write by hand, revise
        ruthlessly.
      </p>
      <div className="dash-grid">
        <div className="dash-card">
          <h3>Questions answered</h3>
          <div className="big">
            {answered}
            <span style={{ fontSize: 18, color: 'var(--text-dim)' }}> / {total}</span>
          </div>
          <div className="progress-bar">
            <div style={{ width: `${total ? (100 * answered) / total : 0}%` }} />
          </div>
        </div>
        <div className="dash-card">
          <h3>Accuracy (first-class answers)</h3>
          <div className="big">{answered ? Math.round((100 * correct) / answered) : 0}%</div>
        </div>
        <div className="dash-card">
          <h3>Needs review</h3>
          <div className="big" style={{ color: queue.length ? 'var(--amber)' : 'var(--green)' }}>
            {queue.length}
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 44 }}>Review queue</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: 14.5 }}>
        Everything you marked <i>partial</i> or <i>missed</i>. Redo these on paper until they move out of this
        list — that's spaced repetition doing its job.
      </p>
      {queue.length === 0 && <p className="empty-note">Nothing to review — go learn something new.</p>}
      {queue.map(({ module: mod, lesson, question, state }) => (
        <div key={question.id} className="review-item">
          <span className="pill">{lesson.title}</span>
          <Markdown>{truncate(question.prompt, 110)}</Markdown>
          <button className="btn small" onClick={() => openLesson(mod.id, lesson.id)}>
            Redo →
          </button>
        </div>
      ))}
    </div>
  )
}

function truncate(md, n) {
  const clean = md.replace(/\$[^$]*\$/g, '(…math…)').replace(/[#*`>]/g, '')
  return clean.length > n ? clean.slice(0, n) + '…' : clean
}
