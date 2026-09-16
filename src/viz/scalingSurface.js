import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, slider, button } from './dom.js'

// The Chinchilla loss surface L(N, D) = E + A/N^α + B/D^β over log-scale axes,
// with an iso-compute budget curve C = 6ND draped on it and a marker at the
// compute-optimal (N*, D*). Drag the budget slider and watch the optimum slide
// up the valley — tokens and parameters growing in lockstep.
// Chinchilla-form constants, simplified to α = β so the compute-optimal ridge sits
// exactly at the textbook ~20 tokens/param at every budget. (The paper's own fitted
// constants — A=406.4, B=410.7, α=0.34, β=0.28 — imply a drifting, larger ratio;
// its empirical iso-FLOP fits gave ~20. The lesson caption flags this honestly.)
const E = 1.69, A = 162, B = 410.7, ALPHA = 0.31, BETA = 0.31

const LOGN = { min: 8, max: 12.5 }   // 1e8 .. ~3e12 params
const LOGD = { min: 9, max: 13.5 }   // 1e9 .. ~3e13 tokens
const SIZE = 8

const loss = (N, D) => E + A / Math.pow(N, ALPHA) + B / Math.pow(D, BETA)
const toX = (logN) => ((logN - LOGN.min) / (LOGN.max - LOGN.min) - 0.5) * SIZE
const toZ = (logD) => ((logD - LOGD.min) / (LOGD.max - LOGD.min) - 0.5) * SIZE
const toY = (L) => (4.4 - L) * 1.55 // lower loss = lower on screen? no: lower loss should look like a valley → smaller y

export default function scalingSurface(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [8, 6, 9], grid: false, axes: false })
  ctx.controls.target.set(0, 1.5, 0)
  const { scene } = ctx

  // surface
  const seg = 60
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const logN = ((pos.getX(i) / SIZE) + 0.5) * (LOGN.max - LOGN.min) + LOGN.min
    const logD = ((pos.getZ(i) / SIZE) + 0.5) * (LOGD.max - LOGD.min) + LOGD.min
    pos.setY(i, toY(loss(Math.pow(10, logN), Math.pow(10, logD))))
  }
  geo.computeVertexNormals()
  scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0x33506e, metalness: 0.1, roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.92,
  })))
  scene.add(new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({
    color: 0x8fb3e8, wireframe: true, transparent: true, opacity: 0.08,
  })))

  scene.add(makeLabel('more params →', new THREE.Vector3(SIZE / 2 + 1.2, 0.4, 0), '#8a857a', 24))
  scene.add(makeLabel('more tokens →', new THREE.Vector3(0, 0.4, SIZE / 2 + 1.2), '#8a857a', 24))
  scene.add(makeLabel('loss ↓ into the valley', new THREE.Vector3(-SIZE / 2 - 1.6, 3.2, -SIZE / 2), '#8a857a', 22))

  // iso-compute curve + optimal marker
  const curveLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xd97757, linewidth: 2 })
  )
  scene.add(curveLine)
  const optBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0xd97757, emissive: 0x66301c })
  )
  scene.add(optBall)

  // Llama-3-8B style over-trained marker (8e9 params, 1.5e13 tokens)
  const llama = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0x7d9b76, emissive: 0x2c3a28 })
  )
  const lN = Math.log10(8e9), lD = Math.log10(1.5e13)
  llama.position.set(toX(lN), toY(loss(8e9, 1.5e13)) + 0.12, toZ(lD))
  llama.visible = false
  scene.add(llama)
  const llamaLbl = makeLabel('8B @ 15T (over-trained on purpose)', new THREE.Vector3(toX(lN), llama.position.y + 0.55, toZ(lD)), '#7d9b76', 20)
  llamaLbl.visible = false
  scene.add(llamaLbl)

  let logC = 23.76 // Chinchilla's budget ≈ 5.76e23
  const out = readout(controlsEl)

  const fmt = (x) => {
    if (x >= 1e12) return (x / 1e12).toFixed(1) + 'T'
    if (x >= 1e9) return (x / 1e9).toFixed(0) + 'B'
    if (x >= 1e6) return (x / 1e6).toFixed(0) + 'M'
    return x.toExponential(1)
  }

  function refresh() {
    const C = Math.pow(10, logC)
    const pts = []
    let best = { L: Infinity }
    for (let i = 0; i <= 220; i++) {
      const logN = LOGN.min + (i / 220) * (LOGN.max - LOGN.min)
      const N = Math.pow(10, logN)
      const D = C / (6 * N)
      const logD = Math.log10(D)
      if (logD < LOGD.min || logD > LOGD.max) continue
      const L = loss(N, D)
      pts.push(new THREE.Vector3(toX(logN), toY(L) + 0.05, toZ(logD)))
      if (L < best.L) best = { L, N, D, logN, logD }
    }
    curveLine.geometry.dispose()
    curveLine.geometry = new THREE.BufferGeometry().setFromPoints(pts)
    if (best.N) {
      optBall.position.set(toX(best.logN), toY(best.L) + 0.14, toZ(best.logD))
      out.setHTML(
        `budget C = 10<sup>${logC.toFixed(1)}</sup> FLOPs &nbsp; optimal: <b>${fmt(best.N)} params</b> × <b>${fmt(best.D)} tokens</b>` +
          ` &nbsp; ratio ${(best.D / best.N).toFixed(0)} tok/param &nbsp; predicted loss <b>${best.L.toFixed(3)}</b> nats (floor E = ${E})`
      )
    }
  }

  slider(controlsEl, 'log₁₀ compute budget', { min: 21, max: 26, step: 0.1, value: logC }, (v) => {
    logC = v
    refresh()
  })
  const lb = button(controlsEl, 'show 8B@15T marker', () => {
    llama.visible = !llama.visible
    llamaLbl.visible = llama.visible
    lb.textContent = llama.visible ? 'hide 8B@15T marker' : 'show 8B@15T marker'
  })

  refresh()
  return ctx.dispose
}
