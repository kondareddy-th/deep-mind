import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, slider } from './dom.js'

// Four ways to store the past. Same model shape (64 layers, 64 heads × 128 dims),
// four attention variants, one context-length slider — and four bars whose heights
// are gigabytes of KV cache. This is the arithmetic behind DeepSeek's MLA and the
// reason every serious model since 2023 does *something* here.
const LAYERS = 64
const N_HEADS = 64
const D_HEAD = 128
const BYTES = 2 // bf16

const VARIANTS = [
  {
    key: 'mha',
    label: 'MHA — every head its own K/V',
    color: 0xbf4d43,
    perTokenBytes: 2 * LAYERS * N_HEADS * D_HEAD * BYTES,
    note: 'the original: 64 private answer-sheets per layer',
  },
  {
    key: 'gqa',
    label: 'GQA — 8 groups share',
    color: 0xc9a227,
    perTokenBytes: 2 * LAYERS * 8 * D_HEAD * BYTES,
    note: 'the 2023 default: 8× smaller, quality ~intact',
  },
  {
    key: 'mqa',
    label: 'MQA — one shared K/V',
    color: 0x6a8bc7,
    perTokenBytes: 2 * LAYERS * 1 * D_HEAD * BYTES,
    note: 'maximum sharing: 64× smaller, quality cost real',
  },
  {
    key: 'mla',
    label: 'MLA — cache a compressed latent',
    color: 0x7d9b76,
    // one latent vector (d_c) + the decoupled RoPE part, per layer, per token
    perTokenBytes: LAYERS * (512 + 64) * BYTES,
    note: 'DeepSeek: store a 512-d summary, rebuild K and V on the fly',
  },
]

export default function cacheCompare(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [0, 4.5, 12], grid: false, axes: false })
  ctx.controls.target.set(0, 2, 0)
  const { scene } = ctx

  const xs = VARIANTS.map((_, i) => (i - (VARIANTS.length - 1) / 2) * 3.0)
  const bars = VARIANTS.map((v, i) => {
    const g = new THREE.BoxGeometry(1.5, 1, 1.5)
    g.translate(0, 0.5, 0)
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: v.color }))
    m.position.set(xs[i], 0, 0)
    m.scale.y = 0.001
    scene.add(m)
    scene.add(makeLabel(v.label, new THREE.Vector3(xs[i], -0.55, 0.9), '#f0eee6', 19))
    scene.add(makeLabel(v.note, new THREE.Vector3(xs[i], -0.95, 0.9), '#8a857a', 15))
    return m
  })

  // 80 GB reference line — one H100
  const capLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-6.2, 0, 0), new THREE.Vector3(6.2, 0, 0)]),
    new THREE.LineBasicMaterial({ color: 0xbf4d43 })
  )
  scene.add(capLine)
  const capLabel = makeLabel('80 GB — one H100', new THREE.Vector3(7.4, 0, 0), '#bf4d43', 19)
  scene.add(capLabel)

  let ctxLen = 32768
  const SCALE_GB = 0.05 // world units per GB
  const targets = VARIANTS.map(() => 0.001)
  const out = readout(controlsEl)

  function fmt(gb) {
    return gb >= 1 ? gb.toFixed(1) + ' GB' : (gb * 1024).toFixed(0) + ' MB'
  }

  function refresh() {
    const gbs = VARIANTS.map((v) => (v.perTokenBytes * ctxLen) / 1e9)
    gbs.forEach((gb, i) => (targets[i] = Math.max(gb * SCALE_GB, 0.01)))
    const capY = 80 * SCALE_GB
    capLine.position.y = capY
    capLabel.position.y = capY

    const mha = gbs[0]
    out.setHTML(
      `context = <b>${ctxLen.toLocaleString()}</b> tokens &nbsp; ` +
        VARIANTS.map((v, i) => `${v.key.toUpperCase()} <b>${fmt(gbs[i])}</b>`).join(' &nbsp;·&nbsp; ') +
        `<br>relative to MHA: ` +
        VARIANTS.slice(1)
          .map((v, i) => `${v.key.toUpperCase()} is <b>${(mha / gbs[i + 1]).toFixed(0)}× smaller</b>`)
          .join(' &nbsp;·&nbsp; ') +
        ` &nbsp;<span style="opacity:.75">(per conversation, on top of the weights)</span>`
    )
  }

  ctx.onTick(() => {
    bars.forEach((b, i) => {
      b.scale.y += (targets[i] - b.scale.y) * 0.12
    })
  })

  slider(controlsEl, 'context length', { min: 4096, max: 131072, step: 4096, value: ctxLen }, (v) => {
    ctxLen = v
    refresh()
  })

  refresh()
  return ctx.dispose
}
