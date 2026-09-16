import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { slider, readout, select, button } from './dom.js'

// A loss surface y = f(x, z) with a ball descending it. Choose the surface,
// the optimizer, and the learning rate — watch what each combination does.
const SURFACES = {
  bowl: {
    label: 'Convex bowl',
    f: (x, z) => 0.22 * (x * x + z * z),
    g: (x, z) => [0.44 * x, 0.44 * z],
  },
  valley: {
    label: 'Ill-conditioned valley',
    f: (x, z) => 0.5 * x * x + 0.02 * z * z,
    g: (x, z) => [1.0 * x, 0.04 * z],
  },
  eggcrate: {
    label: 'Bumpy (local minima)',
    f: (x, z) => 0.12 * (x * x + z * z) + 0.35 * Math.sin(1.6 * x) * Math.sin(1.6 * z) + 0.35,
    g: (x, z) => [
      0.24 * x + 0.56 * Math.cos(1.6 * x) * Math.sin(1.6 * z),
      0.24 * z + 0.56 * Math.sin(1.6 * x) * Math.cos(1.6 * z),
    ],
  },
  saddle: {
    label: 'Saddle point',
    f: (x, z) => 0.18 * (x * x - z * z) + 1.6,
    g: (x, z) => [0.36 * x, -0.36 * z],
  },
}

const START = [-3.1, -2.6]

export default function gradientDescent(stage, controlsEl) {
  const ctx = createScene(stage, { camPos: [7, 6.5, 9], grid: false, axes: false })
  ctx.controls.target.set(0, 1, 0)
  const { scene } = ctx

  let surfaceKey = 'bowl'
  let optimizer = 'sgd'
  let lr = 0.12
  let running = true

  // Surface mesh
  let surfaceMesh = null
  let wire = null
  function buildSurface() {
    if (surfaceMesh) {
      scene.remove(surfaceMesh, wire)
      surfaceMesh.geometry.dispose()
      wire.geometry.dispose()
    }
    const S = SURFACES[surfaceKey]
    const seg = 70
    const geo = new THREE.PlaneGeometry(8, 8, seg, seg)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, S.f(pos.getX(i), pos.getZ(i)))
    }
    geo.computeVertexNormals()
    surfaceMesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x33506e,
        metalness: 0.1,
        roughness: 0.75,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
      })
    )
    wire = new THREE.Mesh(
      geo.clone(),
      new THREE.MeshBasicMaterial({ color: 0x8fb3e8, wireframe: true, transparent: true, opacity: 0.1 })
    )
    scene.add(surfaceMesh, wire)
  }

  // Ball + trail
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xd97757, emissive: 0x66301c })
  )
  scene.add(ball)
  const trailGeom = new THREE.BufferGeometry()
  const trail = new THREE.Line(trailGeom, new THREE.LineBasicMaterial({ color: 0xe8a48c, transparent: true, opacity: 0.9 }))
  scene.add(trail)
  scene.add(makeLabel('loss surface', new THREE.Vector3(0, 3.6, -3.4), '#9a958a', 24))

  // Optimizer state
  let p, vel, m1, m2, step
  function reset() {
    p = [...START]
    vel = [0, 0]
    m1 = [0, 0]
    m2 = [0, 0]
    step = 0
    trailPts.length = 0
    running = true
  }
  const trailPts = []

  const out = readout(controlsEl)

  function optStep() {
    const S = SURFACES[surfaceKey]
    const [gx, gz] = S.g(p[0], p[1])
    step++
    if (optimizer === 'sgd') {
      p[0] -= lr * gx
      p[1] -= lr * gz
    } else if (optimizer === 'momentum') {
      vel[0] = 0.9 * vel[0] - lr * gx
      vel[1] = 0.9 * vel[1] - lr * gz
      p[0] += vel[0]
      p[1] += vel[1]
    } else {
      // adam
      const b1 = 0.9, b2 = 0.999, eps = 1e-8
      m1[0] = b1 * m1[0] + (1 - b1) * gx
      m1[1] = b1 * m1[1] + (1 - b1) * gz
      m2[0] = b2 * m2[0] + (1 - b2) * gx * gx
      m2[1] = b2 * m2[1] + (1 - b2) * gz * gz
      const mh = [m1[0] / (1 - b1 ** step), m1[1] / (1 - b1 ** step)]
      const vh = [m2[0] / (1 - b2 ** step), m2[1] / (1 - b2 ** step)]
      p[0] -= (lr * mh[0]) / (Math.sqrt(vh[0]) + eps)
      p[1] -= (lr * mh[1]) / (Math.sqrt(vh[1]) + eps)
    }
    p[0] = THREE.MathUtils.clamp(p[0], -4, 4)
    p[1] = THREE.MathUtils.clamp(p[1], -4, 4)
  }

  let frame = 0
  ctx.onTick(() => {
    frame++
    if (running && frame % 6 === 0) {
      optStep()
      const S = SURFACES[surfaceKey]
      const y = S.f(p[0], p[1])
      trailPts.push(new THREE.Vector3(p[0], y + 0.1, p[1]))
      if (trailPts.length > 400) trailPts.shift()
      trailGeom.setFromPoints(trailPts)
      ball.position.set(p[0], y + 0.13, p[1])
      const [gx, gz] = S.g(p[0], p[1])
      const gnorm = Math.hypot(gx, gz)
      out.setHTML(`step ${step} &nbsp; loss = <b>${y.toFixed(3)}</b> &nbsp; |∇f| = ${gnorm.toFixed(3)}`)
      if (gnorm < 1e-4 || step > 3000) running = false
    }
  })

  select(
    controlsEl,
    'surface',
    Object.entries(SURFACES).map(([value, s]) => ({ value, label: s.label })),
    (val) => {
      surfaceKey = val
      buildSurface()
      reset()
    }
  )
  select(
    controlsEl,
    'optimizer',
    [
      { value: 'sgd', label: 'Vanilla GD' },
      { value: 'momentum', label: 'Momentum (β=0.9)' },
      { value: 'adam', label: 'Adam' },
    ],
    (val) => {
      optimizer = val
      reset()
    }
  )
  slider(controlsEl, 'learning rate', { min: 0.01, max: 0.6, step: 0.01, value: lr }, (val) => {
    lr = val
  })
  button(controlsEl, '↻ restart', reset)

  buildSurface()
  reset()
  return ctx.dispose
}
