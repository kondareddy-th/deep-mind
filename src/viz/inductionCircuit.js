import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, button } from './dom.js'

// The induction circuit, stage by stage — the two-head relay that lets a model
// complete "…[A][B]… [A] → [B]" with no weight updates at all.
//   stage 1: a layer-1 previous-token head writes "what came before me" into
//            every position's residual stream
//   stage 2: a layer-2 induction head, querying with the CURRENT token, finds
//            the position whose prev-token record matches it
//   stage 3: it copies THAT position's token to the output — the prediction
const TOKENS = ['The', 'code', 'is', '7', '4', '2', '.', 'The', 'code', 'is', '7']
const CUR = TOKENS.length - 1 // the final '7'
const MATCH = 4 // the '4' whose predecessor was '7'

const STAGES = [
  'stage 0 — a sequence with a repeat. The last token is "7"; nothing in the weights knows this document. What comes next?',
  'stage 1 — LAYER 1, previous-token head: every position attends one step back and records what preceded it (the tags above). Pure bookkeeping, no cleverness.',
  'stage 2 — LAYER 2, induction head: the current token "7" asks "who has 7 as their prev-tag?" — position 5 answers. That match is only possible because layer 1 already wrote the tags.',
  'stage 3 — copy: the induction head reads out the token AT the match — "4" — and writes it to the output. Prediction: "4", learned from this context alone, zero weight updates.',
]

export default function inductionCircuit(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [0, 2.6, 11], grid: false, axes: false })
  const { scene } = ctx

  const xs = TOKENS.map((_, i) => (i - (TOKENS.length - 1) / 2) * 1.42)
  const spheres = []
  const prevTags = []

  TOKENS.forEach((tok, i) => {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0x3a5a82, emissive: 0x10161f })
    )
    s.position.set(xs[i], 0, 0)
    scene.add(s)
    spheres.push(s)
    scene.add(makeLabel(tok, new THREE.Vector3(xs[i], -0.55, 0), '#f0eee6', 26))
    const tag = makeLabel(`prev: ${i === 0 ? '—' : TOKENS[i - 1]}`, new THREE.Vector3(xs[i], 0.62, 0), '#c9a227', 17)
    tag.visible = false
    scene.add(tag)
    prevTags.push(tag)
  })

  // output slot
  const outX = xs[TOKENS.length - 1] + 1.7
  const outBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.62, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: 0x0a0a0a })
  )
  outBox.position.set(outX, 0, 0)
  scene.add(outBox)
  scene.add(makeLabel('next?', new THREE.Vector3(outX, -0.55, 0), '#8a857a', 22))
  let outLabel = makeLabel('', new THREE.Vector3(outX, 0.75, 0), '#7d9b76', 30)
  scene.add(outLabel)

  scene.add(makeLabel('layer 2 · induction head', new THREE.Vector3(-7.6, 2.35, 0), '#d97757', 20))
  scene.add(makeLabel('layer 1 · prev-token head', new THREE.Vector3(-7.6, -1.55, 0), '#c9a227', 20))

  let arcs = []
  let stage = 0
  const out = readout(controlsEl)

  const clearArcs = () => {
    for (const a of arcs) {
      scene.remove(a)
      a.geometry.dispose()
      a.material.dispose()
    }
    arcs = []
  }

  function arc(i, j, color, lift, radius, below) {
    const sign = below ? -1 : 1
    const from = new THREE.Vector3(xs[i], sign * 0.18, 0)
    const to = new THREE.Vector3(xs[j], sign * 0.18, 0)
    const mid = from.clone().add(to).multiplyScalar(0.5)
    mid.y = sign * (lift + Math.abs(xs[i] - xs[j]) * 0.14)
    const t = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), 22, radius, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 })
    )
    scene.add(t)
    arcs.push(t)
  }

  function setOut(text) {
    const fresh = makeLabel(text, new THREE.Vector3(outX, 0.75, 0), '#7d9b76', 30)
    outLabel.material.map?.dispose()
    outLabel.material.dispose()
    outLabel.material = fresh.material
    outLabel.scale.copy(fresh.scale)
  }

  function render() {
    clearArcs()
    prevTags.forEach((t) => (t.visible = stage >= 1))
    spheres.forEach((s, i) => {
      const hot = (stage >= 2 && i === CUR) || (stage >= 2 && i === MATCH)
      s.material.color.set(i === CUR ? 0xd97757 : hot ? 0x7d9b76 : 0x3a5a82)
      s.scale.setScalar(hot ? 1.35 : 1)
    })

    if (stage >= 1) for (let i = 1; i < TOKENS.length; i++) arc(i, i - 1, 0xc9a227, 0.5, 0.018, true)
    if (stage >= 2) arc(CUR, MATCH, 0xd97757, 1.25, 0.055, false)
    if (stage >= 3) {
      const from = new THREE.Vector3(xs[MATCH], 0.18, 0)
      const to = new THREE.Vector3(outX, 0.3, 0)
      const mid = from.clone().add(to).multiplyScalar(0.5)
      mid.y = 2.15
      const t = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), 24, 0.05, 8),
        new THREE.MeshBasicMaterial({ color: 0x7d9b76, transparent: true, opacity: 0.85 })
      )
      scene.add(t)
      arcs.push(t)
      outBox.material.color.set(0x2f4a2c)
      setOut('"4"')
    } else {
      outBox.material.color.set(0x2a2a2a)
      setOut('')
    }

    out.setHTML(STAGES[stage])
  }

  button(controlsEl, '▶ next stage', () => {
    stage = Math.min(stage + 1, STAGES.length - 1)
    render()
  })
  button(controlsEl, '◀ back', () => {
    stage = Math.max(stage - 1, 0)
    render()
  })
  button(controlsEl, '↻ reset', () => {
    stage = 0
    render()
  })

  render()
  return ctx.dispose
}
