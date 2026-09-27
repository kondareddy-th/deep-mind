// Usage: node scripts/validate-lesson.mjs src/curriculum/py/lesson2.js [--expect-code python]
// Checks the house standard: 12 questions split 4/4/4, exactly 3 ponders, 2+ examples,
// sequential ids, valid answers, and that every string renders through the real
// markdown pipeline without leftover escapes or KaTeX errors.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { renderMarkdown } from '../src/lib/renderMarkdown.js'

const file = process.argv[2]
const expectIdx = process.argv.indexOf('--expect-code')
const expectLang = expectIdx > -1 ? process.argv[expectIdx + 1] : null
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1 }

const src = readFileSync(file, 'utf8')
if (src.includes('$' + '{')) fail('contains the forbidden dollar-brace sequence')

const l = (await import(pathToFileURL(file).href)).default
const k = l.questions.reduce((a, q) => ((a[q.kind] = (a[q.kind] || 0) + 1), a), {})
if (l.questions.length !== 12 || k.mcq !== 4 || k.numeric !== 4 || k.written !== 4)
  fail(`questions must be 12 as 4 mcq / 4 numeric / 4 written, got ${JSON.stringify(k)}`)
const ponders = l.sections.filter((s) => s.type === 'ponder').length
if (ponders !== 3) fail(`need exactly 3 ponders, got ${ponders}`)
const examples = l.sections.filter((s) => s.type === 'example').length
if (examples < 2) fail(`need at least 2 examples, got ${examples}`)

l.questions.forEach((q, i) => {
  if (q.id !== `${l.id}-q${i + 1}`) fail(`question ${i + 1} id is ${q.id}, expected ${l.id}-q${i + 1}`)
  if (q.kind === 'mcq' && (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.options.length)) fail(`${q.id} bad mcq answer`)
  if (q.kind === 'numeric' && (typeof q.answer !== 'number' || typeof q.tolerance !== 'number')) fail(`${q.id} numeric needs answer + tolerance`)
  if (q.kind === 'written' && !q.rubric) fail(`${q.id} written needs a rubric`)
  if ((q.kind === 'mcq' || q.kind === 'numeric') && !q.explain) fail(`${q.id} needs an explain`)
})

const strings = [
  ...l.sections.flatMap((s) => [s.md, s.question, s.answer, s.caption]),
  ...l.questions.flatMap((q) => [q.prompt, q.explain, q.rubric, ...(q.options || [])]),
].filter((x) => typeof x === 'string')

let codeBlocks = 0
for (const t of strings) {
  if (t.includes('\\`')) fail('unconverted \\` escape — use the md tag from ../md.js')
  const h = renderMarkdown(t)
  if (h.includes('katex-error')) fail('KaTeX error in: ' + t.slice(0, 80))
  if (expectLang) codeBlocks += (h.match(new RegExp(`language-${expectLang}`, 'g')) || []).length
}
if (expectLang && codeBlocks < 8) fail(`expected plenty of ${expectLang} code blocks, found ${codeBlocks}`)

if (!process.exitCode)
  console.log(`OK ${l.id} | ${l.sections.length} sections | ${ponders} ponders | ${examples} examples | ${JSON.stringify(k)}${expectLang ? ` | ${codeBlocks} ${expectLang} blocks` : ''}`)
