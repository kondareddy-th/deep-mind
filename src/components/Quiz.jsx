import React, { useEffect, useRef, useState } from 'react'
import Markdown from '../lib/markdown.jsx'
import {
  recordAnswer,
  savePhoto,
  loadPhoto,
  deletePhoto,
  saveWrittenText,
  loadWrittenText,
} from '../lib/storage.js'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export default function Quiz({ lesson, progress, setProgress }) {
  if (!lesson.questions?.length) return null
  return (
    <div className="quiz-section">
      <h2>Test yourself ({lesson.questions.length} questions)</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: 14.5 }}>
        Write every answer <b>by hand on paper first</b> — the physical act of writing is what makes it stick.
        For written questions, photograph your page and upload it before revealing the model answer.
      </p>
      {lesson.questions.map((q, i) => (
        <Question key={q.id} q={q} num={i + 1} progress={progress} setProgress={setProgress} />
      ))}
    </div>
  )
}

function Question({ q, num, progress, setProgress }) {
  const state = progress[q.id]
  return (
    <div className="question-card">
      <div className="q-meta">
        <span className="q-num">Q{num}</span>
        <span className="q-kind">{q.kind === 'mcq' ? 'multiple choice' : q.kind === 'numeric' ? 'compute' : 'written · pen & paper'}</span>
        {state && (
          <span className={`q-status ${state.status}`}>
            {state.status === 'correct' ? '✓ got it' : state.status === 'partial' ? '◐ partial' : '✗ review this'}
            {state.attempts > 1 ? ` · attempt ${state.attempts}` : ''}
          </span>
        )}
      </div>
      <Markdown>{q.prompt}</Markdown>
      {q.kind === 'mcq' && <MCQ q={q} progress={progress} setProgress={setProgress} />}
      {q.kind === 'numeric' && <Numeric q={q} progress={progress} setProgress={setProgress} />}
      {q.kind === 'written' && <Written q={q} progress={progress} setProgress={setProgress} />}
    </div>
  )
}

function MCQ({ q, progress, setProgress }) {
  const answered = !!progress[q.id]
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(answered)

  const submit = () => {
    if (selected == null) return
    const status = selected === q.answer ? 'correct' : 'incorrect'
    setProgress(recordAnswer(progress, q.id, status))
    setRevealed(true)
  }
  const retry = () => {
    setSelected(null)
    setRevealed(false)
  }

  return (
    <div>
      {q.options.map((opt, i) => {
        let cls = 'mcq-option'
        if (!revealed && selected === i) cls += ' selected'
        if (revealed && i === q.answer) cls += ' right'
        if (revealed && selected === i && i !== q.answer) cls += ' wrong'
        return (
          <button key={i} className={cls} disabled={revealed} onClick={() => setSelected(i)}>
            <span className="opt-letter">{LETTERS[i]}.</span>
            <Markdown>{opt}</Markdown>
          </button>
        )
      })}
      <div className="btn-row">
        {!revealed && (
          <button className="btn" disabled={selected == null} onClick={submit}>
            Check answer
          </button>
        )}
        {revealed && (
          <button className="btn secondary small" onClick={retry}>
            ↻ Try again
          </button>
        )}
      </div>
      {revealed && q.explain && (
        <div className="explain-box">
          <span className="explain-tag">Why</span>
          <Markdown>{q.explain}</Markdown>
        </div>
      )}
    </div>
  )
}

function Numeric({ q, progress, setProgress }) {
  const answered = !!progress[q.id]
  const [value, setValue] = useState('')
  const [revealed, setRevealed] = useState(answered)
  const [wasRight, setWasRight] = useState(answered ? progress[q.id].status === 'correct' : null)

  const submit = () => {
    const num = parseFloat(value)
    if (Number.isNaN(num)) return
    const tol = q.tolerance ?? 1e-6
    const right = Math.abs(num - q.answer) <= tol
    setWasRight(right)
    setProgress(recordAnswer(progress, q.id, right ? 'correct' : 'incorrect'))
    setRevealed(true)
  }
  const retry = () => {
    setValue('')
    setRevealed(false)
    setWasRight(null)
  }

  return (
    <div>
      <div className="btn-row">
        <input
          className="answer-input"
          placeholder="your answer (number)"
          value={value}
          disabled={revealed}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {!revealed && (
          <button className="btn" onClick={submit}>
            Check
          </button>
        )}
        {revealed && (
          <button className="btn secondary small" onClick={retry}>
            ↻ Try again
          </button>
        )}
      </div>
      {revealed && (
        <div className="explain-box">
          <span className="explain-tag">{wasRight ? 'Correct' : `Answer: ${q.answer}`}</span>
          {q.explain && <Markdown>{q.explain}</Markdown>}
        </div>
      )}
    </div>
  )
}

function Written({ q, progress, setProgress }) {
  const answered = !!progress[q.id]
  const [photoUrl, setPhotoUrl] = useState(null)
  const [text, setText] = useState('')
  const [hasWork, setHasWork] = useState(false)
  const [revealed, setRevealed] = useState(answered)
  const fileRef = useRef(null)
  const urlRef = useRef(null)

  useEffect(() => {
    let alive = true
    loadPhoto(q.id).then((blob) => {
      if (alive && blob) {
        const url = URL.createObjectURL(blob)
        urlRef.current = url
        setPhotoUrl(url)
        setHasWork(true)
      }
    })
    loadWrittenText(q.id).then((t) => {
      if (alive && t) {
        setText(t)
        setHasWork(true)
      }
    })
    return () => {
      alive = false
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [q.id])

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    await savePhoto(q.id, file)
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(file)
    urlRef.current = url
    setPhotoUrl(url)
    setHasWork(true)
  }

  const removePhoto = async () => {
    await deletePhoto(q.id)
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    setPhotoUrl(null)
    setHasWork(!!text.trim())
  }

  const onText = (v) => {
    setText(v)
    saveWrittenText(q.id, v)
    if (v.trim()) setHasWork(true)
  }

  const grade = (status) => {
    setProgress(recordAnswer(progress, q.id, status))
  }
  const currentGrade = progress[q.id]?.status

  return (
    <div>
      <div className="written-hint">
        Work this out fully <b>on paper</b> — derivations, diagrams, all steps. Then upload a photo of
        your page (or type a summary), and only then reveal the model answer to grade yourself.
      </div>
      <div className="btn-row">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={onFile}
        />
        <button className="btn secondary" onClick={() => fileRef.current.click()}>
          {photoUrl ? 'Replace photo' : 'Upload photo of your answer'}
        </button>
        {photoUrl && (
          <button className="btn secondary small" onClick={removePhoto}>
            ✕ remove photo
          </button>
        )}
      </div>
      {photoUrl && <img className="photo-preview" src={photoUrl} alt="your written answer" />}
      <textarea
        className="answer-input"
        style={{ marginTop: 12 }}
        placeholder="…or type your answer / key steps here"
        value={text}
        onChange={(e) => onText(e.target.value)}
      />
      {!revealed && (
        <div className="btn-row">
          <button className="btn" disabled={!hasWork} onClick={() => setRevealed(true)}>
            Reveal model answer
          </button>
          {!hasWork && <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>upload or type your attempt first</span>}
        </div>
      )}
      {revealed && (
        <>
          <div className="explain-box model-answer">
            <span className="explain-tag">Model answer</span>
            <Markdown>{q.rubric}</Markdown>
          </div>
          <div className="self-grade">
            <span>Grade yourself honestly:</span>
            <button className={`grade-btn g-nailed ${currentGrade === 'correct' ? 'on' : ''}`} onClick={() => grade('correct')}>
              ✓ Nailed it
            </button>
            <button className={`grade-btn g-partial ${currentGrade === 'partial' ? 'on' : ''}`} onClick={() => grade('partial')}>
              ◐ Partially
            </button>
            <button className={`grade-btn g-missed ${currentGrade === 'incorrect' ? 'on' : ''}`} onClick={() => grade('incorrect')}>
              ✗ Missed it
            </button>
          </div>
        </>
      )}
    </div>
  )
}
