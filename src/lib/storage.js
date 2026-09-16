import { get, set, del } from 'idb-keyval'

// ---- Quiz answer state (localStorage: small JSON) ----
const KEY = 'ai-academy-progress-v1'

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

export function saveProgress(progress) {
  localStorage.setItem(KEY, JSON.stringify(progress))
}

// progress shape:
// { [questionId]: { status: 'correct'|'incorrect'|'partial', answeredAt: iso, attempts: n } }

export function recordAnswer(progress, questionId, status) {
  const prev = progress[questionId]
  const next = {
    ...progress,
    [questionId]: {
      status,
      answeredAt: new Date().toISOString(),
      attempts: (prev?.attempts || 0) + 1,
    },
  }
  saveProgress(next)
  return next
}

// ---- Written answer photos / text (IndexedDB: blobs) ----
export async function savePhoto(questionId, blob) {
  await set(`photo:${questionId}`, blob)
}

export async function loadPhoto(questionId) {
  return await get(`photo:${questionId}`)
}

export async function deletePhoto(questionId) {
  await del(`photo:${questionId}`)
}

export async function saveWrittenText(questionId, text) {
  await set(`text:${questionId}`, text)
}

export async function loadWrittenText(questionId) {
  return await get(`text:${questionId}`)
}

// ---- Lesson stats helpers ----
export function lessonStats(lesson, progress) {
  const total = lesson.questions.length
  let answered = 0
  let correct = 0
  for (const q of lesson.questions) {
    const p = progress[q.id]
    if (p) {
      answered++
      if (p.status === 'correct') correct++
    }
  }
  return { total, answered, correct }
}

export function reviewQueue(curriculum, progress) {
  // Questions marked incorrect/partial, oldest first — your revision list.
  const items = []
  for (const mod of curriculum) {
    for (const lesson of mod.lessons) {
      for (const q of lesson.questions) {
        const p = progress[q.id]
        if (p && (p.status === 'incorrect' || p.status === 'partial')) {
          items.push({ module: mod, lesson, question: q, state: p })
        }
      }
    }
  }
  items.sort((a, b) => new Date(a.state.answeredAt) - new Date(b.state.answeredAt))
  return items
}
