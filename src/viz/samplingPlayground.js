import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, button, slider, select } from './dom.js'

// The model's last step, live: a next-token distribution you can reshape with
// temperature, then truncate with top-k / top-p, then actually sample from.
// Green bars = kept, gray = cut. Draw repeatedly and watch the histogram.
const CANDS = [
  [' Paris', 7.1], [' the', 5.2], [' located', 4.6], [' a', 4.3], [' famous', 3.9],
  [' in', 3.6], [' one', 3.3], [' known', 3.1], [' Lyon', 2.7], [' France', 2.4],
  [' beautiful', 2.1], [' also', 1.9], [' home', 1.7], [' Marseille', 1.4],
  [' banana', 0.4], [' Zebra', 0.1],
]

export default function samplingPlayground(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [0, 4.2, 10.5], grid: false, axes: false })
  const { scene } = ctx

  const n = CANDS.length
  const xs = CANDS.map((_, i) => (i - (n - 1) / 2) * 0.95)

  const bars = CANDS.map(([tok], i) => {
    const g = new THREE.BoxGeometry(0.55, 1, 0.55)
    g.translate(0, 0.5, 0)
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x7d9b76 }))
    m.position.set(xs[i], 0, 0)
    scene.add(m)
    const lbl = makeLabel(tok.trim(), new THREE.Vector3(xs[i], -0.45, 0.4), '#f0eee6', 20)
    lbl.material.rotation = -0.9
    scene.add(lbl)
    return m
  })
  // sample-count dots stacked above bars
  const countLabels = CANDS.map((_, i) => {
    const l = makeLabel('', new THREE.Vector3(xs[i], 0.2, 0), '#d97757', 22)
    scene.add(l)
    return l
  })

  scene.add(makeLabel('p(next token | "The capital of France is")', new THREE.Vector3(0, 4.6, 0), '#8a857a', 24))

  let temp = 1.0
  let mode = 'full'
  let topK = 5
  let topP = 0.9
  const counts = new Array(n).fill(0)
  const barTargets = new Array(n).fill(0.001)
  const out = readout(controlsEl)

  function probs() {
    const scaled = CANDS.map(([, l]) => l / temp)
    const mx = Math.max(...scaled)
    const es = scaled.map((s) => Math.exp(s - mx))
    const Z = es.reduce((a, b) => a + b, 0)
    let p = es.map((e) => e / Z)

    let kept = p.map(() => true)
    if (mode === 'topk') {
      const order = p.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0])
      kept = p.map(() => false)
      order.slice(0, topK).forEach(([, i]) => (kept[i] = true))
    } else if (mode === 'topp') {
      const order = p.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0])
      kept = p.map(() => false)
      let acc = 0
      for (const [x, i] of order) {
        kept[i] = true
        acc += x
        if (acc >= topP) break
      }
    }
    const keptMass = p.reduce((s, x, i) => s + (kept[i] ? x : 0), 0)
    const renorm = p.map((x, i) => (kept[i] ? x / keptMass : 0))
    return { p, kept, renorm, keptMass }
  }

  function refresh() {
    const { p, kept, renorm, keptMass } = probs()
    p.forEach((x, i) => {
      barTargets[i] = Math.max((kept[i] ? renorm[i] : x) * 9, 0.012)
      bars[i].material.color.set(kept[i] ? 0x7d9b76 : 0x555149)
      bars[i].material.transparent = !kept[i]
      bars[i].material.opacity = kept[i] ? 1 : 0.45
    })
    const nKept = kept.filter(Boolean).length
    out.setHTML(
      `T = <b>${temp.toFixed(2)}</b> &nbsp; mode = <b>${mode === 'full' ? 'no truncation' : mode === 'topk' ? `top-k (k=${topK})` : `top-p (p=${topP.toFixed(2)})`}</b>` +
        ` &nbsp; candidates kept: <b>${nKept}</b>/${n} &nbsp; mass kept before renorm: <b>${(keptMass * 100).toFixed(1)}%</b>` +
        ` &nbsp; draws: ${counts.reduce((a, b) => a + b, 0)}`
    )
  }

  ctx.onTick(() => {
    bars.forEach((b, i) => {
      b.scale.y += (barTargets[i] - b.scale.y) * 0.15
    })
  })

  function draw(times) {
    const { renorm } = probs()
    for (let t = 0; t < times; t++) {
      let r = Math.random()
      for (let i = 0; i < n; i++) {
        r -= renorm[i]
        if (r <= 0) {
          counts[i]++
          break
        }
      }
    }
    counts.forEach((c, i) => {
      const fresh = makeLabel(c ? String(c) : '', new THREE.Vector3(xs[i], barTargets[i] + 0.35, 0), '#d97757', 22)
      countLabels[i].material.map?.dispose()
      countLabels[i].material.dispose()
      countLabels[i].material = fresh.material
      countLabels[i].scale.copy(fresh.scale)
      countLabels[i].position.copy(fresh.position)
    })
    refresh()
  }

  slider(controlsEl, 'temperature', { min: 0.1, max: 3, step: 0.05, value: temp }, (v) => { temp = v; refresh() })
  select(controlsEl, 'truncation', [
    { value: 'full', label: 'none (full softmax)' },
    { value: 'topk', label: 'top-k' },
    { value: 'topp', label: 'top-p (nucleus)' },
  ], (v) => { mode = v; refresh() })
  slider(controlsEl, 'k', { min: 1, max: 16, step: 1, value: topK }, (v) => { topK = v; if (mode === 'topk') refresh() })
  slider(controlsEl, 'p', { min: 0.1, max: 1, step: 0.02, value: topP }, (v) => { topP = v; if (mode === 'topp') refresh() })
  button(controlsEl, '🎲 sample 1', () => draw(1))
  button(controlsEl, '🎲 sample 25', () => draw(25))
  button(controlsEl, '↻ clear draws', () => { counts.fill(0); draw(0) })

  refresh()
  return ctx.dispose
}
