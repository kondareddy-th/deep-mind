import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, slider, button } from './dom.js'

// N feature directions crammed into 3 dimensions. They repel each other (as
// lines through the origin) until they find the best packing available. With
// N ≤ 3 they reach perfect orthogonality — zero interference. Past 3 the
// pigeonhole bites and EVERY packing leaves overlap. Then sample a sparse
// "active set" and watch how rarely that overlap actually costs anything.

const MAXN = 40

export default function superposition(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [4.6, 3.5, 6.0], grid: false, axes: true })
  const { scene } = ctx

  let N = 3
  let k = 2
  let vecs = []
  let arrows = []
  let activeSet = []

  const out = readout(controlsEl)

  function seed(i) {
    // golden-angle spiral start so the relaxation converges from a spread state
    const ga = Math.PI * (3 - Math.sqrt(5))
    const y = 1 - (2 * (i + 0.5)) / Math.max(N, 1)
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const th = ga * i
    return new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).normalize()
  }

  function rebuild(n) {
    N = n
    for (const a of arrows) scene.remove(a)
    arrows = []
    vecs = []
    for (let i = 0; i < N; i++) {
      const v = seed(i)
      vecs.push(v)
      const a = new THREE.ArrowHelper(v.clone(), new THREE.Vector3(), 2.6, 0x4a6b93, 0.18, 0.1)
      scene.add(a)
      arrows.push(a)
    }
    activeSet = []
    refresh()
  }

  // Gradient descent on the sum of squared pairwise dot products — i.e. drive every
  // |cos| toward 0, which is exactly "minimize interference". The force is linear in
  // the overlap (push away from a neighbour you point WITH, toward one you point
  // AGAINST), and a whisper of noise keeps symmetric saddle configurations — like
  // three vectors trapped coplanar at 120° — from holding the packing hostage.
  function relax(iters = 6) {
    if (N < 2) return
    for (let it = 0; it < iters; it++) {
      const forces = vecs.map(() => new THREE.Vector3())
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if (i === j) continue
          const d = vecs[i].dot(vecs[j])
          // linear term drives small overlaps to zero (so N ≤ 3 reaches true
          // orthogonality); cubic term punishes near-collisions hard, so the
          // packing spreads instead of stacking duplicate directions
          forces[i].addScaledVector(vecs[j], -(d + 6 * d * d * d))
        }
      }
      const lr = 0.6 / Math.max(N - 1, 1) // scale-invariant: forces sum over N−1 neighbours
      for (let i = 0; i < N; i++) {
        const f = forces[i]
        f.addScaledVector(vecs[i], -vecs[i].dot(f)) // keep the step tangent to the sphere
        // A pair sitting exactly parallel (or antiparallel) feels ZERO tangential
        // force — a degenerate fixed point that would freeze two features onto one
        // direction. Kick anything nearly collinear with a neighbour.
        let closest = 0
        for (let j = 0; j < N; j++) if (j !== i) closest = Math.max(closest, Math.abs(vecs[i].dot(vecs[j])))
        f.x += (Math.random() - 0.5) * 0.004
        f.y += (Math.random() - 0.5) * 0.004
        f.z += (Math.random() - 0.5) * 0.004
        vecs[i].addScaledVector(f, lr)
        if (closest > 0.9) {
          // scramble a stuck vector outright — the tangential force here is ~0,
          // so no gentle nudge can ever separate it from its twin
          vecs[i].x += (Math.random() - 0.5) * 0.5
          vecs[i].y += (Math.random() - 0.5) * 0.5
          vecs[i].z += (Math.random() - 0.5) * 0.5
        }
        vecs[i].normalize()
      }
    }
    for (let i = 0; i < N; i++) arrows[i].setDirection(vecs[i])
  }

  function overlapStats() {
    let m = 0
    let sum = 0
    let pairs = 0
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        const c = Math.abs(vecs[i].dot(vecs[j]))
        m = Math.max(m, c)
        sum += c
        pairs++
      }
    return { worst: m, typical: pairs ? sum / pairs : 0 }
  }

  function sampleActive() {
    const idx = [...Array(N).keys()]
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    activeSet = idx.slice(0, Math.min(k, N))
    refresh()
  }

  function refresh() {
    arrows.forEach((a, i) => {
      const on = activeSet.includes(i)
      a.setColor(new THREE.Color(on ? 0xd97757 : 0x4a6b93))
      a.setLength(on ? 3.0 : 2.6, on ? 0.2 : 0.18, on ? 0.11 : 0.1)
    })

    const { worst, typical } = overlapStats()
    let activeLine = ''
    if (activeSet.length >= 2) {
      let w = 0
      for (let a = 0; a < activeSet.length; a++)
        for (let b = a + 1; b < activeSet.length; b++)
          w = Math.max(w, Math.abs(vecs[activeSet[a]].dot(vecs[activeSet[b]])))
      activeLine =
        `<br>the bill you actually pay: only the <b>active</b> features interfere — ` +
        `{${activeSet.map((i) => 'f' + (i + 1)).join(', ')}} overlap by <b>${w.toFixed(3)}</b> ` +
        `(vs the packing's worst case ${worst.toFixed(3)})`
    }
    const verdict =
      N <= 3
        ? '<b style="color:#5f8a5a">≤ 3 features fit perfectly — zero interference</b>'
        : `<b style="color:#bf4d43">${N} features in 3 dims — the pigeonhole bites</b>`
    out.setHTML(
      `${verdict} &nbsp; worst pair: <b>${worst.toFixed(3)}</b> &nbsp; typical pair: <b>${typical.toFixed(3)}</b>` +
        ` &nbsp; <span style="opacity:.75">(two random directions overlap ~1/√d: <b>0.577</b> here in 3-d, <b>0.009</b> in a 12,288-d model — dimension is what buys the room)</span>` +
        activeLine
    )
  }

  scene.add(makeLabel('3 dimensions — how many features can hide in here?', new THREE.Vector3(0, 4.8, 0), '#8a857a', 24))

  let frame = 0
  ctx.onTick(() => {
    relax()
    if (++frame % 12 === 0) refresh()
  })

  slider(controlsEl, 'features (N)', { min: 1, max: MAXN, step: 1, value: N }, (v) => rebuild(v))
  slider(controlsEl, 'active at once (k)', { min: 1, max: 6, step: 1, value: k }, (v) => {
    k = v
    if (activeSet.length) sampleActive()
  })
  button(controlsEl, '🎲 sample active set', sampleActive)
  button(controlsEl, '↻ re-seed packing', () => rebuild(N))

  rebuild(3)
  return ctx.dispose
}
