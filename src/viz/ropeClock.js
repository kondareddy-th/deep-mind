import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, slider, button } from './dom.js'

// RoPE as clock hands: an 8-d vector = 4 two-dimensional pairs, each rotated by
// position × its own frequency. Two tokens (coral + blue); the readout shows their
// pairwise dot product depends ONLY on the position gap — slide both together and
// the number freezes. That invariance is the whole point of RoPE.
const FREQS = [1.0, 0.42, 0.18, 0.075] // fast → slow "clock hands"
const LABELS = ['fast', 'medium', 'slow', 'slowest']

export default function ropeClock(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [0, 1.8, 8.2], grid: false, axes: false })
  const { scene } = ctx

  const xsClock = FREQS.map((_, j) => (j - (FREQS.length - 1) / 2) * 2.3)

  // circles
  FREQS.forEach((_, j) => {
    const pts = []
    for (let a = 0; a <= 64; a++) pts.push(new THREE.Vector3(Math.cos((a / 64) * 2 * Math.PI), Math.sin((a / 64) * 2 * Math.PI), 0))
    const circ = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x55514a, transparent: true, opacity: 0.8 })
    )
    circ.position.set(xsClock[j], 0.6, 0)
    scene.add(circ)
    scene.add(makeLabel(`pair ${j + 1} · ${LABELS[j]}`, new THREE.Vector3(xsClock[j], -0.75, 0), '#8a857a', 22))
  })

  const mkHands = (color) =>
    FREQS.map((_, j) => {
      const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(xsClock[j], 0.6, 0), 1.0, color, 0.16, 0.09)
      scene.add(a)
      return a
    })
  const handsA = mkHands(0xd97757)
  const handsB = mkHands(0x6a8bc7)
  scene.add(makeLabel('token A', new THREE.Vector3(-4.6, 2.2, 0), '#d97757', 26))
  scene.add(makeLabel('token B', new THREE.Vector3(-4.6, 1.75, 0), '#6a8bc7', 26))

  let posA = 3
  let posB = 7
  let locked = false
  const out = readout(controlsEl)

  function refresh() {
    FREQS.forEach((f, j) => {
      const aA = posA * f
      const aB = posB * f
      handsA[j].setDirection(new THREE.Vector3(Math.cos(aA), Math.sin(aA), 0))
      handsB[j].setDirection(new THREE.Vector3(Math.cos(aB), Math.sin(aB), 0))
    })
    // unit hands per pair → pair dot = cos((posA−posB)·f); total over pairs
    const gap = posA - posB
    const total = FREQS.reduce((s, f) => s + Math.cos(gap * f), 0)
    out.setHTML(
      `pos A = <b>${posA.toFixed(0)}</b> &nbsp; pos B = <b>${posB.toFixed(0)}</b> &nbsp; gap = <b>${gap.toFixed(0)}</b>` +
        ` &nbsp;&nbsp; q·k = Σ cos(gap × freq) = <b>${total.toFixed(3)}</b> — depends only on the gap`
    )
  }

  const sA = slider(controlsEl, 'position of A', { min: 0, max: 40, step: 1, value: posA }, (v) => {
    const d = v - posA
    posA = v
    if (locked) {
      posB = Math.min(40, Math.max(0, posB + d))
      sB.set(posB)
    }
    refresh()
  })
  const sB = slider(controlsEl, 'position of B', { min: 0, max: 40, step: 1, value: posB }, (v) => {
    posB = v
    refresh()
  })
  const lockBtn = button(controlsEl, 'slide together: OFF', () => {
    locked = !locked
    lockBtn.textContent = `slide together: ${locked ? 'ON' : 'OFF'}`
  })

  refresh()
  return ctx.dispose
}
