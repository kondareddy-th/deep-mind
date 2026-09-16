import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, button } from './dom.js'

// Three attention heads over one sentence, each with a different "personality" —
// modeled on head types actually found in trained transformers. Toggle heads,
// switch the query token, and watch them disagree productively.
const TOKENS = ['The', 'robot', 'lifted', 'the', 'ball', 'because', 'it', 'was', 'heavy']
const ENTITY = [0, 1, 0.1, 0, 1, 0, 0.5, 0, 0.15] // how entity-like each token is

const softmax = (xs) => {
  const m = Math.max(...xs)
  const es = xs.map((x) => Math.exp(x - m))
  const Z = es.reduce((a, b) => a + b, 0)
  return es.map((e) => e / Z)
}

// Each head: (queryIdx) → weights over tokens (causal).
const HEADS = [
  {
    name: 'previous-token head',
    color: 0xd97757,
    colorCss: '#d97757',
    lift: 0.55,
    weights(qi) {
      return softmax(TOKENS.map((_, i) => (i > qi ? -1e9 : i === qi - 1 ? 4 : i === qi ? 1 : -1)))
    },
  },
  {
    name: 'entity head',
    color: 0x6a8bc7,
    colorCss: '#6a8bc7',
    lift: 0.95,
    weights(qi) {
      return softmax(TOKENS.map((_, i) => (i > qi ? -1e9 : ENTITY[i] * 4 - 1)))
    },
  },
  {
    name: 'broad-context head',
    color: 0x7d9b76,
    colorCss: '#7d9b76',
    lift: 1.4,
    weights(qi) {
      return softmax(TOKENS.map((_, i) => (i > qi ? -1e9 : i === qi ? 0.5 : 0)))
    },
  },
]

export default function multiHead(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [0, 3.4, 9.5], grid: false, axes: false })
  const { scene } = ctx

  const xs = TOKENS.map((_, i) => (i - (TOKENS.length - 1) / 2) * 1.55)
  const spheres = []
  TOKENS.forEach((tok, i) => {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0x3a5a82, emissive: 0x10161f })
    )
    s.position.set(xs[i], 0, 0)
    scene.add(s)
    scene.add(makeLabel(tok, new THREE.Vector3(xs[i], -0.55, 0), '#f0eee6', 26))
    spheres.push(s)
  })

  let arcs = []
  let queryIdx = 6 // "it"
  const active = [true, true, true]
  const out = readout(controlsEl)

  function refresh() {
    for (const a of arcs) {
      scene.remove(a)
      a.geometry.dispose()
      a.material.dispose()
    }
    arcs = []

    spheres.forEach((s, i) => {
      s.material.color.set(i === queryIdx ? 0xd9a057 : i > queryIdx ? 0x2a2a2a : 0x3a5a82)
    })

    const lines = []
    HEADS.forEach((head, h) => {
      if (!active[h]) return
      const w = head.weights(queryIdx)
      w.forEach((wi, i) => {
        if (i === queryIdx || i > queryIdx || wi < 0.02) return
        const from = new THREE.Vector3(xs[queryIdx], 0.12, 0)
        const to = new THREE.Vector3(xs[i], 0.12, 0)
        const mid = from.clone().add(to).multiplyScalar(0.5)
        mid.y = head.lift + Math.abs(xs[i] - xs[queryIdx]) * 0.16
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), 24, 0.011 + 0.09 * wi, 8),
          new THREE.MeshBasicMaterial({ color: head.color, transparent: true, opacity: 0.25 + 0.75 * wi })
        )
        scene.add(tube)
        arcs.push(tube)
      })
      const top = w
        .map((x, i) => ({ x, i }))
        .filter(({ i }) => i <= queryIdx)
        .sort((a, b) => b.x - a.x)
        .slice(0, 2)
        .map(({ x, i }) => `${TOKENS[i]} ${Math.round(x * 100)}%`)
        .join(', ')
      lines.push(`<span style="color:${head.colorCss}">■</span> ${head.name}: ${top}`)
    })
    out.setHTML(`query = <b>"${TOKENS[queryIdx]}"</b> &nbsp;&nbsp; ` + (lines.join(' &nbsp;|&nbsp; ') || 'all heads hidden'))
  }

  TOKENS.forEach((tok, i) => button(controlsEl, tok, () => { queryIdx = i; refresh() }))
  HEADS.forEach((head, h) => {
    const b = button(controlsEl, `${head.name} ✓`, () => {
      active[h] = !active[h]
      b.textContent = `${head.name} ${active[h] ? '✓' : '✗'}`
      b.style.opacity = active[h] ? 1 : 0.5
      refresh()
    })
    b.style.borderColor = head.colorCss
  })

  refresh()
  return ctx.dispose
}
