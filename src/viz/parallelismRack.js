import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, select } from './dom.js'

// Eight GPUs training a 70B model. Inside each GPU: stacked memory bars
// (params / grads / optimizer / activations) against an 80 GB capacity line.
// Switch the parallelism strategy and watch what replicates, what shards,
// and which links carry the communication.
const N_GPU = 8
const CAP_GB = 80

// 70B mixed-precision training bill, in GB (per full copy):
const BILL = { params: 140, grads: 140, optim: 840, acts: 120 }
const COLORS = { params: 0xd97757, grads: 0xc9a227, optim: 0x6a8bc7, acts: 0x7d9b76 }
const NAMES = { params: 'params', grads: 'grads', optim: 'optimizer', acts: 'activations' }

const MODES = {
  single: {
    label: '1 GPU (dense, no tricks)',
    per: () => ({ params: 140, grads: 140, optim: 840, acts: 120 }),
    comm: 'none — and none needed: the run is dead on arrival, 1240 GB into 80 GB',
    arcs: [],
  },
  data: {
    label: 'Data parallel (replicate everything)',
    per: () => ({ params: 140, grads: 140, optim: 840, acts: 120 / N_GPU }),
    comm: 'gradient all-reduce each step (~140 GB traded around the ring)',
    arcs: 'ring',
  },
  zero: {
    label: 'ZeRO-3 / FSDP (shard params+grads+optim)',
    per: () => ({ params: 140 / N_GPU, grads: 140 / N_GPU, optim: 840 / N_GPU, acts: 120 / N_GPU }),
    comm: 'all-gather params per layer, reduce-scatter grads — more traffic, overlapped with compute',
    arcs: 'all',
  },
  tensor: {
    label: 'Tensor parallel (split every matmul)',
    per: () => ({ params: 140 / N_GPU, grads: 140 / N_GPU, optim: 840 / N_GPU, acts: 120 }),
    comm: 'all-reduce inside EVERY layer, twice — needs the fastest links (NVLink)',
    arcs: 'all',
  },
  pipeline: {
    label: 'Pipeline parallel (layers 1-10 → GPU1, …)',
    per: () => ({ params: 140 / N_GPU, grads: 140 / N_GPU, optim: 840 / N_GPU, acts: 120 / N_GPU }),
    comm: 'activations handed to the next stage only — tiny traffic, but bubbles at the ends',
    arcs: 'chain',
  },
}

export default function parallelismRack(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [0, 3.6, 11.5], grid: false, axes: false })
  const { scene } = ctx

  const xs = Array.from({ length: N_GPU }, (_, i) => (i - (N_GPU - 1) / 2) * 1.62)
  const SCALE = 3.0 / CAP_GB // 80 GB of bar = 3 world units... bars overflow past cap dramatically

  // GPU casings + capacity lines
  xs.forEach((x, i) => {
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.15, 3.35, 0.7)),
      new THREE.LineBasicMaterial({ color: 0x8a857a, transparent: true, opacity: 0.8 })
    )
    frame.position.set(x, 3.35 / 2, 0)
    scene.add(frame)
    scene.add(makeLabel(`GPU ${i + 1}`, new THREE.Vector3(x, -0.42, 0), '#f0eee6', 22))
    // capacity line at 80 GB
    const cap = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x - 0.72, CAP_GB * SCALE, 0.38),
        new THREE.Vector3(x + 0.72, CAP_GB * SCALE, 0.38),
      ]),
      new THREE.LineBasicMaterial({ color: 0xbf4d43 })
    )
    scene.add(cap)
  })
  scene.add(makeLabel('— 80 GB capacity', new THREE.Vector3(xs[N_GPU - 1] + 1.75, CAP_GB * SCALE, 0.38), '#bf4d43', 20))

  // stacked memory bars per GPU per component
  const KEYS = ['params', 'grads', 'optim', 'acts']
  const bars = xs.map((x) =>
    KEYS.map((k, ki) => {
      const g = new THREE.BoxGeometry(0.22, 1, 0.5)
      g.translate(0, 0.5, 0)
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: COLORS[k], transparent: true, opacity: 0.95 }))
      m.position.set(x - 0.39 + ki * 0.26, 0.02, 0)
      m.scale.y = 0.001
      scene.add(m)
      return m
    })
  )
  // legend
  KEYS.forEach((k, i) => {
    const sq = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: COLORS[k] }))
    sq.position.set(-6.4 + i * 2.1, 4.35, 0)
    scene.add(sq)
    scene.add(makeLabel(NAMES[k], new THREE.Vector3(-6.15 + i * 2.1, 4.35, 0), '#8a857a', 20))
  })

  let arcs = []
  const targets = bars.map(() => KEYS.map(() => 0.001))
  const out = readout(controlsEl)

  function setMode(key) {
    const mode = MODES[key]
    const per = mode.per()
    for (let g = 0; g < N_GPU; g++) KEYS.forEach((k, ki) => (targets[g][ki] = Math.max(per[k] * SCALE, 0.02)))

    for (const a of arcs) {
      scene.remove(a)
      a.geometry.dispose()
      a.material.dispose()
    }
    arcs = []
    const mkArc = (i, j, lift) => {
      const from = new THREE.Vector3(xs[i], 3.5, 0)
      const to = new THREE.Vector3(xs[j], 3.5, 0)
      const mid = from.clone().add(to).multiplyScalar(0.5)
      mid.y = 3.9 + lift
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), 20, 0.022, 8),
        new THREE.MeshBasicMaterial({ color: 0xe8a48c, transparent: true, opacity: 0.6 })
      )
      scene.add(tube)
      arcs.push(tube)
    }
    if (mode.arcs === 'ring' || mode.arcs === 'chain') {
      for (let i = 0; i < N_GPU - 1; i++) mkArc(i, i + 1, 0)
      if (mode.arcs === 'ring') mkArc(0, N_GPU - 1, 0.7)
    } else if (mode.arcs === 'all') {
      for (let i = 0; i < N_GPU - 1; i++) mkArc(i, i + 1, 0)
      mkArc(0, N_GPU - 1, 0.9)
      mkArc(0, 4, 0.5)
      mkArc(3, 7, 0.5)
    }

    const totalPer = KEYS.reduce((s, k) => s + per[k], 0)
    const fits = totalPer <= CAP_GB
    out.setHTML(
      `<b>${mode.label}</b> &nbsp; per-GPU: ${KEYS.map((k) => `${NAMES[k]} ${per[k] < 10 ? per[k].toFixed(1) : Math.round(per[k])} GB`).join(' · ')}` +
        ` &nbsp; total <b style="color:${fits ? '#5f8a5a' : '#bf4d43'}">${Math.round(totalPer)} GB ${fits ? '— fits ✓' : '— OVER 80 GB ✗'}</b>` +
        `<br>communication: ${mode.comm}`
    )
  }

  ctx.onTick(() => {
    bars.forEach((gpu, g) =>
      gpu.forEach((bar, ki) => {
        bar.scale.y += (targets[g][ki] - bar.scale.y) * 0.1
      })
    )
  })

  select(
    controlsEl,
    'strategy',
    Object.entries(MODES).map(([value, m]) => ({ value, label: m.label })),
    setMode
  )

  setMode('single')
  return ctx.dispose
}
