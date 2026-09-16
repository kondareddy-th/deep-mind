import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, button } from './dom.js'

// The full attention pipeline for one query token, staged:
//   stage 0 — raw q·k scores (bars)
//   stage 1 — ÷√d + softmax → weights (bars sum to 1, arcs thicken)
//   stage 2 — weighted value vectors mix into the output arrow
// Toggles: causal mask, √d scaling (off → watch the softmax saturate).
const TOKENS = ['The', 'robot', 'lifted', 'the', 'ball', 'because', 'it', 'was', 'heavy']

// Toy 4-d features: [entity, action, function-word, weight-property]
const EMB = [
  [0.0, 0.0, 1.0, 0.0], // The
  [1.0, 0.2, 0.0, 0.3], // robot
  [0.2, 1.0, 0.0, 0.2], // lifted
  [0.0, 0.0, 1.0, 0.0], // the
  [1.0, 0.0, 0.0, 0.5], // ball
  [0.0, 0.0, 1.0, 0.2], // because
  [0.6, 0.0, 0.4, 0.6], // it   (pronoun: entity-seeking)
  [0.0, 0.6, 0.6, 0.0], // was
  [0.2, 0.1, 0.0, 1.0], // heavy
]
// Learned maps (toy): Wq turns "what I am" into "what I seek";
// Wk into "what I advertise"; Wv into "what I hand over when chosen".
const Wq = [
  [0.9, 0.1, 0.0, 0.9],
  [0.1, 0.8, 0.0, 0.0],
  [0.0, 0.0, 0.2, 0.0],
  [0.6, 0.0, 0.0, 1.0],
]
const Wk = [
  [1.0, 0.1, 0.0, 0.2],
  [0.1, 1.0, 0.1, 0.0],
  [0.0, 0.1, 0.8, 0.0],
  [0.2, 0.0, 0.0, 1.0],
]
const Wv = [
  [0.9, 0.0, 0.0, 0.1],
  [0.0, 0.9, 0.0, 0.0],
  [0.0, 0.0, 0.5, 0.0],
  [0.1, 0.0, 0.0, 0.9],
]

const mv = (M, v) => M.map((r) => r.reduce((s, m, i) => s + m * v[i], 0))
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)
const softmax = (xs) => {
  const m = Math.max(...xs.filter((x) => x > -1e8))
  const es = xs.map((x) => (x <= -1e8 ? 0 : Math.exp(x - m)))
  const Z = es.reduce((a, b) => a + b, 0) || 1
  return es.map((e) => e / Z)
}

export default function attentionFlow(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [0, 3.2, 9.5], grid: false, axes: false })
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

  // score/weight bars above each token
  const bars = TOKENS.map((_, i) => {
    const g = new THREE.BoxGeometry(0.24, 1, 0.24)
    g.translate(0, 0.5, 0) // grow upward from base
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xd97757, transparent: true, opacity: 0.9 }))
    m.position.set(xs[i], 0.35, 0)
    m.scale.y = 0.001
    scene.add(m)
    return m
  })

  // output arrow (the mixed value vector), revealed at stage 2
  const outArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.001, 0x7d9b76, 0.2, 0.11)
  scene.add(outArrow)
  const outLabel = makeLabel('output', new THREE.Vector3(0, 0, 0), '#7d9b76', 24)
  outLabel.visible = false
  scene.add(outLabel)

  let arcs = []
  let queryIdx = 6 // "it"
  let stageN = 0
  let causal = true
  let scaled = true
  const barTargets = new Array(TOKENS.length).fill(0)
  const out = readout(controlsEl)

  function compute() {
    const q = mv(Wq, EMB[queryIdx])
    const raw = EMB.map((e, i) => {
      if (causal && i > queryIdx) return -1e9
      const s = dot(q, mv(Wk, e))
      return scaled ? s / Math.sqrt(4) : s * 3 // unscaled ×3 exaggerates d — saturation demo
    })
    const w = softmax(raw)
    const vs = EMB.map((e) => mv(Wv, e))
    const output = [0, 0, 0, 0].map((_, d) => vs.reduce((s, v, i) => s + w[i] * v[d], 0))
    return { raw, w, output }
  }

  function refresh() {
    const { raw, w, output } = compute()

    for (const a of arcs) {
      scene.remove(a)
      a.geometry.dispose()
      a.material.dispose()
    }
    arcs = []

    TOKENS.forEach((_, i) => {
      const masked = causal && i > queryIdx
      spheres[i].material.color.set(i === queryIdx ? 0xd97757 : masked ? 0x2a2a2a : 0x3a5a82)
      spheres[i].material.emissive.set(i === queryIdx ? 0x5a2d1c : 0x10161f)
      bars[i].material.color.set(stageN === 0 ? 0x6a8bc7 : 0xd97757)
      bars[i].material.opacity = masked ? 0.12 : 0.9

      const h = stageN === 0 ? (masked ? 0 : Math.max(raw[i], 0) * 0.35 + 0.02) : w[i] * 2.2
      barTargets[i] = Math.max(h, 0.001)

      if (i !== queryIdx && !masked && stageN >= 1) {
        const from = new THREE.Vector3(xs[queryIdx], 0.1, 0)
        const to = new THREE.Vector3(xs[i], 0.1, 0)
        const mid = from.clone().add(to).multiplyScalar(0.5)
        mid.y = -(0.5 + Math.abs(xs[i] - xs[queryIdx]) * 0.18) // arcs below the row, bars above
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), 24, 0.012 + 0.1 * w[i], 8),
          new THREE.MeshBasicMaterial({ color: 0xe8a48c, transparent: true, opacity: 0.2 + 0.8 * w[i] })
        )
        scene.add(tube)
        arcs.push(tube)
      }
    })

    const norm = Math.hypot(...output)
    if (stageN === 2) {
      outArrow.position.set(xs[queryIdx], 2.75, 0)
      outArrow.setLength(Math.max(norm * 1.1, 0.15), 0.2, 0.11)
      outArrow.visible = true
      outLabel.position.set(xs[queryIdx] + 0.85, 3.15, 0)
      outLabel.visible = true
    } else {
      outArrow.visible = false
      outLabel.visible = false
    }

    const fmt = (n) => (n <= -1e8 ? '−∞' : n.toFixed(2))
    const line =
      stageN === 0
        ? `raw scores q·k${scaled ? '/√d' : ' (unscaled ×3)'}: ` + raw.map((s, i) => `${TOKENS[i]} ${fmt(s)}`).join(' · ')
        : stageN === 1
          ? 'softmax weights (sum = 1): ' + w.map((x, i) => `${TOKENS[i]} ${x.toFixed(2)}`).join(' · ')
          : `output = Σ wᵢ·vᵢ = [${output.map((x) => x.toFixed(2)).join(', ')}] — a blend, ` +
            w
              .map((x, i) => ({ x, i }))
              .sort((a, b) => b.x - a.x)
              .slice(0, 3)
              .map(({ x, i }) => `${Math.round(x * 100)}% ${TOKENS[i]}`)
              .join(' + ')
    out.setHTML(`query = <b>"${TOKENS[queryIdx]}"</b> &nbsp; ${line}`)
  }

  ctx.onTick(() => {
    bars.forEach((b, i) => {
      b.scale.y += (barTargets[i] - b.scale.y) * 0.12
    })
  })

  TOKENS.forEach((tok, i) => button(controlsEl, tok, () => { queryIdx = i; refresh() }))
  const stageBtns = [
    button(controlsEl, '① scores', () => { stageN = 0; refresh(); mark() }),
    button(controlsEl, '② softmax', () => { stageN = 1; refresh(); mark() }),
    button(controlsEl, '③ mix values', () => { stageN = 2; refresh(); mark() }),
  ]
  const mark = () => stageBtns.forEach((b, i) => (b.style.borderColor = i === stageN ? '#d97757' : ''))
  const maskBtn = button(controlsEl, 'causal mask: ON', () => {
    causal = !causal
    maskBtn.textContent = `causal mask: ${causal ? 'ON' : 'OFF'}`
    refresh()
  })
  const scaleBtn = button(controlsEl, '√d scaling: ON', () => {
    scaled = !scaled
    scaleBtn.textContent = `√d scaling: ${scaled ? 'ON' : 'OFF'}`
    refresh()
  })

  mark()
  refresh()
  return ctx.dispose
}
