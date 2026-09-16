import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, slider, button } from './dom.js'

// The roofline: the single most useful diagram in performance engineering.
// x = arithmetic intensity (FLOPs performed per byte moved), y = the FLOP/s you
// can actually attain. The diagonal is the memory system's promise; the flat
// ceiling is the arithmetic units'. Every workload sits SOMEWHERE on this plot,
// and where it sits tells you which optimisation could possibly help.
const PEAK_FLOPS = 989e12 // H100 bf16 dense, ballpark
const BANDWIDTH = 3.35e12 // HBM3 bytes/sec
const RIDGE = PEAK_FLOPS / BANDWIDTH // ~295 FLOPs/byte

// log-space plotting helpers
const XMIN = Math.log10(0.5), XMAX = Math.log10(5000)
const YMIN = Math.log10(1e12), YMAX = Math.log10(2e15)
const W = 11, H = 5.6
const px = (i) => ((Math.log10(i) - XMIN) / (XMAX - XMIN)) * W - W / 2
const py = (f) => ((Math.log10(f) - YMIN) / (YMAX - YMIN)) * H

const attainable = (i) => Math.min(PEAK_FLOPS, BANDWIDTH * i)

const WORKLOADS = [
  { key: 'decode1', label: 'decode, batch 1', intensity: 2, color: 0xbf4d43 },
  { key: 'decode32', label: 'decode, batch 32', intensity: 60, color: 0xc9a227 },
  { key: 'decode256', label: 'decode, batch 256', intensity: 400, color: 0x6a8bc7 },
  { key: 'prefill', label: 'prefill / training', intensity: 2000, color: 0x7d9b76 },
]

export default function roofline(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [0, 2.4, 10.5], grid: false, axes: false })
  ctx.controls.target.set(0, 2.4, 0)
  const { scene } = ctx

  // axes
  const axis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-W / 2, H, 0), new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, 0, 0),
    ]),
    new THREE.LineBasicMaterial({ color: 0x8a857a })
  )
  scene.add(axis)
  scene.add(makeLabel('arithmetic intensity — FLOPs per byte moved →', new THREE.Vector3(0, -0.5, 0), '#8a857a', 21))
  scene.add(makeLabel('attainable FLOP/s ↑', new THREE.Vector3(-W / 2 - 0.2, H + 0.35, 0), '#8a857a', 21))

  // the roof itself
  const pts = []
  for (let k = 0; k <= 200; k++) {
    const i = Math.pow(10, XMIN + (k / 200) * (XMAX - XMIN))
    pts.push(new THREE.Vector3(px(i), py(attainable(i)), 0))
  }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf0eee6 })))

  // ridge point
  const ridgeMark = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xf0eee6, emissive: 0x333029 })
  )
  ridgeMark.position.set(px(RIDGE), py(PEAK_FLOPS), 0)
  scene.add(ridgeMark)
  scene.add(makeLabel(`ridge ≈ ${Math.round(RIDGE)} FLOPs/byte`, new THREE.Vector3(px(RIDGE) + 1.55, py(PEAK_FLOPS) + 0.3, 0), '#f0eee6', 18))
  scene.add(makeLabel('memory-bound: only fewer bytes help', new THREE.Vector3(px(3), py(2.2e13) + 0.6, 0), '#c9a227', 18))
  scene.add(makeLabel('compute-bound: only faster math helps', new THREE.Vector3(px(1200), py(PEAK_FLOPS) - 0.75, 0), '#7d9b76', 18))

  // workload markers
  const marks = WORKLOADS.map((w) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 18, 18),
      new THREE.MeshStandardMaterial({ color: w.color, emissive: 0x1a1a1a })
    )
    m.position.set(px(w.intensity), py(attainable(w.intensity)), 0)
    scene.add(m)
    scene.add(makeLabel(w.label, new THREE.Vector3(px(w.intensity), py(attainable(w.intensity)) + 0.38, 0), '#f0eee6', 17))
    return m
  })

  // the movable "your kernel" probe
  const probe = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 20, 20),
    new THREE.MeshStandardMaterial({ color: 0xd97757, emissive: 0x66301c })
  )
  scene.add(probe)
  const drop = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xd97757, dashSize: 0.14, gapSize: 0.1 }))
  scene.add(drop)

  let intensity = 2
  const out = readout(controlsEl)

  function refresh() {
    const perf = attainable(intensity)
    probe.position.set(px(intensity), py(perf), 0)
    drop.geometry.dispose()
    drop.geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(px(intensity), 0, 0), new THREE.Vector3(px(intensity), py(perf), 0),
    ])
    drop.computeLineDistances()

    const memBound = intensity < RIDGE
    const util = (perf / PEAK_FLOPS) * 100
    out.setHTML(
      `intensity = <b>${intensity.toFixed(1)}</b> FLOPs/byte &nbsp; attainable ≈ <b>${(perf / 1e12).toFixed(1)} TFLOP/s</b>` +
        ` &nbsp; that is <b>${util.toFixed(1)}%</b> of the chip's peak` +
        `<br>verdict: <b style="color:${memBound ? '#c9a227' : '#7d9b76'}">${memBound ? 'MEMORY-BOUND — the multipliers are idle; only moving fewer bytes (quantize, fuse, batch, cache) can help' : 'COMPUTE-BOUND — the memory system is keeping up; only faster or fewer FLOPs can help'}</b>`
    )
  }

  slider(controlsEl, 'arithmetic intensity', { min: 0.5, max: 3000, step: 0.5, value: intensity }, (v) => {
    intensity = v
    refresh()
  })
  WORKLOADS.forEach((w) =>
    button(controlsEl, w.label, () => {
      intensity = w.intensity
      refresh()
    })
  )

  refresh()
  return ctx.dispose
}
