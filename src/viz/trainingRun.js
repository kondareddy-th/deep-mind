import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, button, slider } from './dom.js'

// A pretraining run's loss curve, replayed with a narrator: warmup, the long
// power-law grind, a data-poison loss spike (and the checkpoint-restart that
// saves the run), the lr-decay bend, and the final anneal. Step through it the
// way an on-call engineer reads the dashboard at 3am.
const STEPS = 10000
const DT = 25

const EVENTS = [
  { at: 0, msg: 'step 0 — warmup begins: lr ramps from 0 so random-init gradients (1.6) can’t wreck the weights' },
  { at: 700, msg: 'warmup complete — lr at peak; the long power-law grind begins (each decade of steps buys less)' },
  { at: 3000, msg: '⚠ LOSS SPIKE — a shard of garbage/duplicated data hit the batch; grad-norm alarm fires' },
  { at: 3200, msg: 'engineers restart from the step-2900 checkpoint and SKIP the bad shard — spike decays; ~2h of GPU-time lost, run saved' },
  { at: 6000, msg: 'mid-run: loss obeys the scaling curve within noise — the run is "on trend"; nobody touches anything' },
  { at: 8000, msg: 'cosine decay bends the curve — smaller steps settle deeper into the valley (1.6)' },
  { at: 9300, msg: 'anneal phase: the data mixture shifts to highest-quality sources for the final descent (5.1)' },
  { at: 9950, msg: 'run complete — final loss ≈ 2.05 nats. The checkpoint ships to post-training (5.4)' },
]

function lossAt(s) {
  // warmup hump + power-law decay + spike + decay-bend + anneal drop + noise
  let L = 2.05 + 1.9 * Math.pow((s + 400) / 10400, -0.35) - 1.9 * Math.pow(1.04, -0.35) // normalize end ≈ 2.05
  L = 2.0 + 2.4 * Math.pow((s + 500) / 500, -0.22) - 0.55
  if (s < 700) L += (700 - s) / 700 * 0.35 // warmup: slightly high early
  if (s >= 3000 && s < 3400) L += 0.85 * Math.exp(-(s - 3000) / 120) // spike + recovery
  if (s >= 8000) L -= 0.06 * ((s - 8000) / 2000) // decay bend helps
  if (s >= 9300) L -= 0.05 * ((s - 9300) / 700) // anneal drop
  L += 0.018 * Math.sin(s * 0.71) * Math.sin(s * 0.13 + 2) // noise
  return L
}

const X0 = -5.6, XW = 11.2, Y0 = 0.3, YS = 2.2, LMIN = 1.9, LMAX = 4.6

export default function trainingRun(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [0, 2.2, 8.5], grid: false, axes: false })
  ctx.controls.target.set(0, 1.6, 0)
  const { scene } = ctx

  const toXY = (s) => new THREE.Vector3(X0 + (s / STEPS) * XW, Y0 + (1 - (lossAt(s) - LMIN) / (LMAX - LMIN)) * YS + 0.6, 0)

  // axes
  const axis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(X0, Y0 + YS + 0.8, 0), new THREE.Vector3(X0, Y0 + 0.4, 0), new THREE.Vector3(X0 + XW + 0.3, Y0 + 0.4, 0),
    ]),
    new THREE.LineBasicMaterial({ color: 0x8a857a })
  )
  scene.add(axis)
  scene.add(makeLabel('loss (nats)', new THREE.Vector3(X0 - 0.9, Y0 + YS + 0.5, 0), '#8a857a', 22))
  scene.add(makeLabel('steps →', new THREE.Vector3(X0 + XW + 0.9, Y0 + 0.4, 0), '#8a857a', 22))

  // event tick marks
  EVENTS.forEach((e) => {
    const x = X0 + (e.at / STEPS) * XW
    const tick = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, Y0 + 0.32, 0), new THREE.Vector3(x, Y0 + 0.48, 0)]),
      new THREE.LineBasicMaterial({ color: 0xc9a227 })
    )
    scene.add(tick)
  })

  const lineMat = new THREE.LineBasicMaterial({ color: 0xd97757 })
  const line = new THREE.Line(new THREE.BufferGeometry(), lineMat)
  scene.add(line)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), new THREE.MeshStandardMaterial({ color: 0xd97757, emissive: 0x66301c }))
  scene.add(head)

  let cur = 0
  let playing = false
  let speed = 40
  const out = readout(controlsEl)

  function redraw() {
    const pts = []
    for (let s = 0; s <= cur; s += DT) pts.push(toXY(s))
    line.geometry.dispose()
    line.geometry = new THREE.BufferGeometry().setFromPoints(pts)
    if (pts.length) head.position.copy(pts[pts.length - 1])
    const past = EVENTS.filter((e) => e.at <= cur)
    const now = past[past.length - 1]
    out.setHTML(
      `step <b>${cur}</b> / ${STEPS} &nbsp; loss <b>${lossAt(cur).toFixed(3)}</b> &nbsp;—&nbsp; ${now ? now.msg : ''}`
    )
  }

  ctx.onTick(() => {
    if (playing && cur < STEPS) {
      cur = Math.min(cur + speed, STEPS)
      redraw()
      if (cur >= STEPS) playing = false
    }
  })

  button(controlsEl, '▶ play', () => { playing = true })
  button(controlsEl, '⏸ pause', () => { playing = false })
  button(controlsEl, '⏭ next event', () => {
    playing = false
    const next = EVENTS.find((e) => e.at > cur)
    cur = next ? next.at : STEPS
    redraw()
  })
  slider(controlsEl, 'speed', { min: 10, max: 150, step: 10, value: speed }, (v) => { speed = v })
  button(controlsEl, '↻ restart', () => { cur = 0; playing = false; redraw() })

  redraw()
  return ctx.dispose
}
