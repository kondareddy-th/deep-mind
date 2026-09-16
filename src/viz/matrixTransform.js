import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { slider, readout, select, button } from './dom.js'

// A cloud of points + unit cube + basis vectors, transformed by a 3×3 matrix.
// Drag t from 0→1 to interpolate identity → M and watch space itself deform.
const PRESETS = {
  rotate: {
    label: 'Rotation (z-axis, 60°)',
    m: rotZ(Math.PI / 3),
  },
  scale: {
    label: 'Scale (2, 0.5, 1)',
    m: [2, 0, 0, 0, 0.5, 0, 0, 0, 1],
  },
  shear: {
    label: 'Shear (x += 0.8y)',
    m: [1, 0.8, 0, 0, 1, 0, 0, 0, 1],
  },
  project: {
    label: 'Rank-2 projection (flatten z)',
    m: [1, 0, 0, 0, 1, 0, 0, 0, 0],
  },
  stretch: {
    label: 'Symmetric stretch (eigen demo)',
    m: [1.5, 0.5, 0, 0.5, 1.5, 0, 0, 0, 1],
  },
}

function rotZ(a) {
  const c = Math.cos(a), s = Math.sin(a)
  return [c, -s, 0, s, c, 0, 0, 0, 1]
}

export default function matrixTransform(stage, controlsEl) {
  const ctx = createScene(stage, { camPos: [3.6, 2.8, 5.2] })
  const { scene } = ctx

  // Point cloud: 5×5×5 grid in [-1.2, 1.2]³
  const base = []
  const N = 5
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      for (let k = 0; k < N; k++)
        base.push(new THREE.Vector3(lerpN(i), lerpN(j), lerpN(k)))
  function lerpN(i) {
    return -1.2 + (2.4 * i) / (N - 1)
  }

  const geom = new THREE.BufferGeometry().setFromPoints(base)
  const points = new THREE.Points(
    geom,
    new THREE.PointsMaterial({ color: 0xd97757, size: 0.07, transparent: true, opacity: 0.9 })
  )
  scene.add(points)

  // Unit cube wireframe
  const cubeGeom = new THREE.BoxGeometry(2.4, 2.4, 2.4)
  const edges = new THREE.EdgesGeometry(cubeGeom)
  const basePositions = edges.attributes.position.array.slice()
  const cube = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x9a958a, transparent: true, opacity: 0.5 }))
  scene.add(cube)

  // Basis vectors → columns of M
  const colors = [0xe07856, 0x7d9b76, 0xc9a227]
  const basisArrows = [0, 1, 2].map((i) => {
    const dir = new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0)
    const a = new THREE.ArrowHelper(dir, new THREE.Vector3(), 1.6, colors[i], 0.18, 0.1)
    scene.add(a)
    return a
  })
  scene.add(makeLabel('e₁→col 1', new THREE.Vector3(1.9, 0.15, 0), '#e07856', 22))
  scene.add(makeLabel('e₂→col 2', new THREE.Vector3(0.3, 1.95, 0), '#7d9b76', 22))
  scene.add(makeLabel('e₃→col 3', new THREE.Vector3(0, 0.15, 1.95), '#c9a227', 22))

  let M = PRESETS.rotate.m
  let t = 0
  let animating = false

  const out = readout(controlsEl)

  function applyAt(tt) {
    // A(t) = (1-t) I + t M
    const a = []
    const I = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    for (let i = 0; i < 9; i++) a[i] = (1 - tt) * I[i] + tt * M[i]

    const arr = geom.attributes.position.array
    for (let p = 0; p < base.length; p++) {
      const b = base[p]
      arr[p * 3] = a[0] * b.x + a[1] * b.y + a[2] * b.z
      arr[p * 3 + 1] = a[3] * b.x + a[4] * b.y + a[5] * b.z
      arr[p * 3 + 2] = a[6] * b.x + a[7] * b.y + a[8] * b.z
    }
    geom.attributes.position.needsUpdate = true

    const cArr = cube.geometry.attributes.position.array
    for (let p = 0; p < basePositions.length / 3; p++) {
      const x = basePositions[p * 3], y = basePositions[p * 3 + 1], z = basePositions[p * 3 + 2]
      cArr[p * 3] = a[0] * x + a[1] * y + a[2] * z
      cArr[p * 3 + 1] = a[3] * x + a[4] * y + a[5] * z
      cArr[p * 3 + 2] = a[6] * x + a[7] * y + a[8] * z
    }
    cube.geometry.attributes.position.needsUpdate = true

    const cols = [
      new THREE.Vector3(a[0], a[3], a[6]),
      new THREE.Vector3(a[1], a[4], a[7]),
      new THREE.Vector3(a[2], a[5], a[8]),
    ]
    cols.forEach((c, i) => {
      const len = Math.max(c.length() * 1.6, 0.001)
      basisArrows[i].setDirection(c.clone().normalize())
      basisArrows[i].setLength(len, 0.18, 0.1)
    })

    const det =
      a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6])
    out.setHTML(
      `M(t) rows: [${a[0].toFixed(2)}, ${a[1].toFixed(2)}, ${a[2].toFixed(2)}] ` +
        `[${a[3].toFixed(2)}, ${a[4].toFixed(2)}, ${a[5].toFixed(2)}] ` +
        `[${a[6].toFixed(2)}, ${a[7].toFixed(2)}, ${a[8].toFixed(2)}] &nbsp; det = <b>${det.toFixed(2)}</b> (volume ×)`
    )
  }

  select(
    controlsEl,
    'matrix',
    Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })),
    (val) => {
      M = PRESETS[val].m
      applyAt(t)
    }
  )

  const tSlider = slider(controlsEl, 't (identity → M)', { min: 0, max: 1, step: 0.01, value: 0 }, (val) => {
    t = val
    animating = false
    applyAt(t)
  })

  button(controlsEl, '▶ animate', () => {
    t = 0
    animating = true
  })

  ctx.onTick(() => {
    if (animating) {
      t = Math.min(t + 0.008, 1)
      tSlider.set(t)
      applyAt(t)
      if (t >= 1) animating = false
    }
  })

  applyAt(0)
  return ctx.dispose
}
