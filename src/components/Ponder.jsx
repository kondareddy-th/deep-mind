import React, { useState } from 'react'
import Markdown from '../lib/markdown.jsx'

// A Feynman-style "stop and think" box: pose a question, make the reader
// actually try it before revealing the resolution.
export default function Ponder({ question, answer }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="ponder-card">
      <span className="ponder-tag">Stop and think</span>
      <Markdown>{question}</Markdown>
      {!open ? (
        <button className="btn secondary small" onClick={() => setOpen(true)}>
          I've thought about it — reveal
        </button>
      ) : (
        <div className="ponder-answer">
          <Markdown>{answer}</Markdown>
        </div>
      )}
    </div>
  )
}
