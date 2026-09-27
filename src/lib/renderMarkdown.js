// Pure markdown → HTML, with LaTeX and syntax-highlighted code. Kept free of React
// so it can be tested from Node.
//
// Order matters, and each step exists to stop the next one from damaging content:
//   1. stash code (fenced blocks + inline spans) — so a `$` or `\` inside code is
//      never mistaken for math
//   2. stash escaped dollars (\$) — so currency like \$5.6M stays a dollar sign
//   3. extract $$display$$ and $inline$ math
//   4. restore code, then let marked parse (code is highlighted by the renderer)
//   5. swap math placeholders for KaTeX output, and dollar placeholders for "$"
import { Marked } from 'marked'
import katex from 'katex'
import hljs from 'highlight.js/lib/core'
import python from 'highlight.js/lib/languages/python'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import plaintext from 'highlight.js/lib/languages/plaintext'

for (const [name, lang] of Object.entries({ python, javascript, typescript, bash, sql, json, yaml, plaintext })) {
  hljs.registerLanguage(name, lang)
}
hljs.registerAliases(['py'], { languageName: 'python' })
hljs.registerAliases(['js'], { languageName: 'javascript' })
hljs.registerAliases(['ts'], { languageName: 'typescript' })
hljs.registerAliases(['sh', 'shell', 'console'], { languageName: 'bash' })
hljs.registerAliases(['text', 'txt'], { languageName: 'plaintext' })

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const marked = new Marked({
  breaks: false,
  tokenizer: {
    // Lessons use a single ~ for "approximately" (~50 … ~3,000), which GFM
    // would read as strikethrough. Only honour the explicit ~~double~~ form.
    del(src) {
      const m = /^~~(?=[^\s~])([\s\S]*?[^\s~])~~(?!~)/.exec(src)
      if (m) return { type: 'del', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) }
      return undefined
    },
  },
  renderer: {
    code(token) {
      // marked >= 13 passes a token object
      const text = typeof token === 'object' ? token.text : token
      const lang = ((typeof token === 'object' ? token.lang : arguments[1]) || '').trim().split(/\s+/)[0]
      let body
      if (lang && hljs.getLanguage(lang)) {
        body = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
      } else {
        body = escapeHtml(text)
      }
      const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ''
      return `<pre class="code-block">${label}<code class="hljs language-${escapeHtml(lang || 'text')}">${body}</code></pre>\n`
    },
  },
})

export function renderMarkdown(src) {
  if (!src) return ''
  const code = []
  const math = []

  // 1. code: fenced blocks (``` or ~~~), then inline spans
  let text = src.replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g, (m) => {
    code.push(m)
    return `@@CODE${code.length - 1}@@`
  })
  text = text.replace(/`[^`\n]+`/g, (m) => {
    code.push(m)
    return `@@CODE${code.length - 1}@@`
  })

  // 2. escaped dollars
  text = text.replace(/\\\$/g, '@@DOLLAR@@')

  // 3. math
  const stash = (tex, display) => {
    math.push({ tex, display })
    return `@@MATH${math.length - 1}@@`
  }
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => stash(tex, true))
  text = text.replace(/\$([^$\n]+?)\$/g, (_, tex) => stash(tex, false))

  // 4. restore code, then parse
  text = text.replace(/@@CODE(\d+)@@/g, (_, i) => code[+i])
  let html = marked.parse(text)

  // 5. math + dollars
  html = html.replace(/@@MATH(\d+)@@/g, (_, i) => {
    const { tex, display } = math[+i]
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false })
    } catch {
      return `<code>${escapeHtml(tex)}</code>`
    }
  })
  return html.replace(/@@DOLLAR@@/g, '$')
}
