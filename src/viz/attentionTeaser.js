import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, button } from './dom.js'

// Teaser for Module 2: one attention head over a short sentence.
// Pick a query token; arcs show softmax(q·k/√d) weights to every key token.
const TOKENS = ['The', 'cat', 'sat', 'on', 'the', 'mat']

// Hand-crafted 4-d "embeddings" chosen so the pattern is meaningful:
// 'sat' looks at its subject 'cat'; 'mat' looks back at 'on'/'sat'; articles are boring.
const EMB = [
  [0.2, 0.1, 0.0, 0.9], // The
  [1.0, 0.2, 0.1, 0.1], // cat  (noun-ish)
  [0.2, 1.0, 0.3, 0.0], // sat  (verb-ish)
  [0.1, 0.3, 0.9, 0.2], // on   (prep)
  [0.2, 0.1, 0.0, 0.9], // the
  [0.9, 0.1, 0.4, 0.1], // mat  (noun-ish)
]
// Simple fixed "learned" maps: Wq mixes toward what a token searches for,
// Wk toward what it offers. (Toy numbers — the real thing is Module 2.)
const Wq = [
  [0.2, 1.0, 0.2, 0.0],
  [1.0, 0.3, 0.1, 0.0],
  [0.2, 0.2, 1.0, 0.1],
  [0.1, 0.0, 0.1, 0.3],
]
const Wk = [
  [1.0, 0.1, 0.1, 0.0],
  [0.1, 1.0, 0.2, 0.0],
  [0.1, 0.2, 1.0, 0.1],
  [0.0, 0.0, 0.1, 1.0],
]

function matVec(M, v) {
  return M.map((row) => row.reduce((s, m, i) => s + m * v[i], 0))
}
function dot(a, b) {
  return a.reduce((s, x, i) => s + x * b[i], 0)
}
function softmax(xs) {
  const mx = Math.max(...xs)
  const es = xs.map((x) => Math.exp(x - mx))
  const Z = es.reduce((a, b) => a + b, 0)
  return es.map((e) => e / Z)
}

export default function attentionTeaser(stage, controlsEl) {
  const ctx = createScene(stage, { camPos: [0, 2.2, 7.5], grid: false, axes: false })
  const { scene } = ctx

  const spheres = []
  const xs = TOKENS.map((_, i) => (i - (TOKENS.length - 1) / 2) * 1.7)
  TOKENS.forEach((tok, i) => {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x3a5a82, emissive: 0x10161f })
    )
    s.position.set(xs[i], 0, 0)
    scene.add(s)
    scene.add(makeLabel(tok, new THREE.Vector3(xs[i], 0.75, 0), '#f0eee6', 30))
    spheres.push(s)
  })

  let arcs = []
  let queryIdx = 2
  const out = readout(controlsEl)

  function refresh() {
    for (const a of arcs) {
      scene.remove(a)
      a.geometry.dispose()
      a.material.dispose()
    }
    arcs = []

    const q = matVec(Wq, EMB[queryIdx])
    const scores = EMB.map((e) => dot(q, matVec(Wk, e)) / Math.sqrt(4))
    const weights = softmax(scores)

    weights.forEach((w, i) => {
      spheres[i].material.color.set(i === queryIdx ? 0xd97757 : 0x3a5a82)
      spheres[i].material.emissive.set(i === queryIdx ? 0x5a2d1c : 0x10161f)
      spheres[i].scale.setScalar(0.75 + 1.3 * w)

      if (i === queryIdx) return
      const from = new THREE.Vector3(xs[queryIdx], 0.15, 0)
      const to = new THREE.Vector3(xs[i], 0.15, 0)
      const mid = from.clone().add(to).multiplyScalar(0.5)
      mid.y = 0.6 + Math.abs(xs[i] - xs[queryIdx]) * 0.28
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to)
      const geo = new THREE.TubeGeometry(curve, 24, 0.012 + 0.09 * w, 8)
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe8a48c,
        transparent: true,
        opacity: 0.25 + 0.75 * w,
      })
      const tube = new THREE.Mesh(geo, mat)
      scene.add(tube)
      arcs.push(tube)
    })

    out.setHTML(
      `query = <b>"${TOKENS[queryIdx]}"</b> &nbsp; weights: ` +
        weights.map((w, i) => `${TOKENS[i]} <b>${w.toFixed(2)}</b>`).join(' · ')
    )
  }

  TOKENS.forEach((tok, i) => {
    button(controlsEl, tok, () => {
      queryIdx = i
      refresh()
    })
  })

  refresh()
  return ctx.dispose
}
