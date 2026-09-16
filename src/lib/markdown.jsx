import React, { useMemo } from 'react'
import { marked } from 'marked'
import katex from 'katex'

// Render markdown with $inline$ and $$display$$ LaTeX.
// Math is extracted before markdown parsing so marked never mangles it.
function renderMarkdownWithMath(src) {
  if (!src) return ''
  const math = []
  const stash = (tex, display) => {
    math.push({ tex, display })
    return `@@MATH${math.length - 1}@@`
  }
  let text = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => stash(tex, true))
  text = text.replace(/\$([^$\n]+?)\$/g, (_, tex) => stash(tex, false))

  let html = marked.parse(text, { breaks: false })

  html = html.replace(/@@MATH(\d+)@@/g, (_, i) => {
    const { tex, display } = math[+i]
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false })
    } catch {
      return `<code>${tex}</code>`
    }
  })
  return html
}

export default function Markdown({ children, className = '' }) {
  const html = useMemo(() => renderMarkdownWithMath(children), [children])
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
