import React, { useState } from 'react'
import { getApiKey, setApiKey, keyIsFromEnv, testKey, explainError, MODEL } from '../tracks/llm.js'

export default function Settings() {
  const fromEnv = keyIsFromEnv()
  const [key, setKey] = useState(fromEnv ? '' : getApiKey())
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  async function check() {
    setBusy(true)
    setStatus(null)
    try {
      if (key.trim()) setApiKey(key.trim())
      const r = await testKey()
      setStatus({ ok: true, msg: `Working — the model replied "${r.trim()}".` })
    } catch (e) {
      setStatus({ ok: false, msg: explainError(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lesson-container">
      <h1>Settings</h1>
      <p className="lesson-subtitle">
        Modules 1–8 are fully offline. The two adaptive tracks invent each challenge at runtime, so they
        need an Anthropic API key — yours, used from your browser, sent nowhere else.
      </p>

      <div className="track-panel">
        <h2>Anthropic API key</h2>
        {fromEnv ? (
          <p className="track-note" style={{ marginTop: 0 }}>
            ✅ Currently using the key from your <code>.env</code> file. That injection is{' '}
            <b>dev-server only</b> — a production build never contains it, and <code>.env</code> is
            gitignored. Set a key below to override it for this browser.
          </p>
        ) : (
          <p className="track-note" style={{ marginTop: 0 }}>
            Stored in this browser's localStorage only.
          </p>
        )}
        <div className="btn-row">
          <input
            className="answer-input"
            style={{ width: 420, fontFamily: 'var(--mono)' }}
            type="password"
            placeholder={fromEnv ? 'override the .env key…' : 'sk-ant-…'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button className="btn" disabled={busy} onClick={check}>
            {busy ? 'Checking…' : 'Save & test'}
          </button>
          {!fromEnv && getApiKey() && (
            <button
              className="btn secondary small"
              onClick={() => {
                setApiKey('')
                setKey('')
                setStatus({ ok: true, msg: 'Key removed from this browser.' })
              }}
            >
              Remove
            </button>
          )}
        </div>
        {status && (
          <div className={`track-alert ${status.ok ? '' : 'error'}`} style={{ marginTop: 14 }}>
            {status.msg}
          </div>
        )}
        <p className="track-note">
          Model: <code>{MODEL}</code>. A generated challenge plus its assessment costs a few cents.
        </p>
      </div>

      <div className="track-panel">
        <h2>What's stored locally</h2>
        <ul>
          <li>
            <b>localStorage</b> — lesson quiz progress, per-competency mastery and decay state, and your
            API key (unless it comes from <code>.env</code>).
          </li>
          <li>
            <b>IndexedDB</b> — photos of your handwritten answers and your track submissions.
          </li>
        </ul>
        <p className="track-note">
          None of it leaves your machine except the challenge text and your submission, which go to the
          Anthropic API when you ask for a challenge or an assessment.
        </p>
      </div>
    </div>
  )
}
