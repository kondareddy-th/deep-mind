import React, { useMemo } from 'react'
import { renderMarkdown } from './renderMarkdown.js'

export default function Markdown({ children, className = '' }) {
  const html = useMemo(() => renderMarkdown(children), [children])
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
