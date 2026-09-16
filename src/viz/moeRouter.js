import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, button, slider } from './dom.js'

// Mixture of Experts: tokens fall through a router to top-2 of 8 expert FFNs.
// Expert load bars fill as tokens route. Without a balancing incentive the
// router collapses onto favorite experts; drag the balance slider and watch
// the load spread. Readout keeps the total-vs-active parameter score.
const N_EXP = 8
const TOKENS = ['The', 'chef', 'seasoned', 'the', 'soup', 'with', 'fresh', 'thyme', 'and', 'served', 'it', 'hot']
// Innate router preferences (unbalanced on purpose): experts 2 and 5 are "popular"
const PREF = [0.4, 0.6, 2.2, 0.5, 0.8, 2.0, 0.6, 0.4]

export default function moeRouter(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [0, 2.6, 10.8], grid: false, axes: false })
  const { scene } = ctx

  const xsE = Array.from({ length: N_EXP }, (_, i) => (i - (N_EXP - 1) / 2) * 1.55)

  // router bar
  const router = new THREE.Mesh(
    new THREE.BoxGeometry(11.5, 0.22, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x8a857a, transparent: true, opacity: 0.85 })
  )
  router.position.set(0, 2.2, 0)
  scene.add(router)
  scene.add(makeLabel('router (learned, tiny)', new THREE.Vector3(0, 2.62, 0), '#f0eee6', 22))

  // expert boxes + load bars
  const loads = new Array(N_EXP).fill(0)
  const loadBars = xsE.map((x, i) => {
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.1, 1.5, 0.7)),
      new THREE.LineBasicMaterial({ color: 0x6a8bc7 })
    )
    frame.position.set(x, 0.15, 0)
    scene.add(frame)
    scene.add(makeLabel(`E${i + 1}`, new THREE.Vector3(x, -1.0, 0), '#f0eee6', 22))
    const g = new THREE.BoxGeometry(0.85, 1, 0.5)
    g.translate(0, 0.5, 0)
    const bar = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x6a8bc7, transparent: true, opacity: 0.9 }))
    bar.position.set(x, -0.58, 0)
    bar.scale.y = 0.001
    scene.add(bar)
    return bar
  })

  const tokenLabel = makeLabel('', new THREE.Vector3(0, 3.6, 0), '#d97757', 30)
  scene.add(tokenLabel)

  let arcs = []
  let ti = 0
  let balance = 0 // 0 = raw preferences, 1 = fully balanced incentive
  let routedTokens = 0
  const out = readout(controlsEl)

  function weights(tokIdx) {
    // per-token jitter (deterministic per index) over innate preferences,
    // interpolated toward uniform by the balance slider
    const scores = PREF.map((p, e) => {
      const jitter = Math.sin(tokIdx * 12.9898 + e * 78.233) * 0.9
      const raw = p + jitter
      return raw * (1 - balance) + 1.0 * balance + jitter * balance * 0.35
    })
    const mx = Math.max(...scores)
    const es = scores.map((s) => Math.exp(s - mx))
    const Z = es.reduce((a, b) => a + b, 0)
    return es.map((e) => e / Z)
  }

  function routeNext() {
    const tok = TOKENS[ti % TOKENS.length]
    const w = weights(ti)
    ti++
    routedTokens++

    const top2 = w.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, 2)

    const fresh = makeLabel(`"${tok}"`, new THREE.Vector3(0, 3.6, 0), '#d97757', 30)
    tokenLabel.material.map?.dispose()
    tokenLabel.material.dispose()
    tokenLabel.material = fresh.material
    tokenLabel.scale.copy(fresh.scale)

    for (const a of arcs) {
      scene.remove(a)
      a.geometry.dispose()
      a.material.dispose()
    }
    arcs = []
    for (const [wt, e] of top2) {
      loads[e] += wt
      const from = new THREE.Vector3(0, 2.2, 0)
      const to = new THREE.Vector3(xsE[e], 0.95, 0)
      const mid = new THREE.Vector3(xsE[e] * 0.45, 1.9, 0)
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), 20, 0.02 + 0.07 * wt, 8),
        new THREE.MeshBasicMaterial({ color: 0xd97757, transparent: true, opacity: 0.35 + 0.6 * wt })
      )
      scene.add(tube)
      arcs.push(tube)
    }
    refresh(top2)
  }

  function refresh(top2) {
    const maxLoad = Math.max(...loads, 0.001)
    const mean = loads.reduce((a, b) => a + b, 0) / N_EXP
    loadBars.forEach((b, e) => {
      const overloaded = loads[e] > 2.2 * mean && routedTokens >= 4
      b.material.color.set(overloaded ? 0xbf4d43 : 0x6a8bc7)
    })
    const imbalance = maxLoad / (mean || 1)
    out.setHTML(
      (top2 ? `token → experts <b>${top2.map(([w, e]) => `E${e + 1} (${(w * 100).toFixed(0)}%)`).join(' + ')}</b> &nbsp; ` : '') +
        `routed: ${routedTokens} &nbsp; imbalance (max/mean): <b style="color:${imbalance > 2.2 ? '#bf4d43' : '#5f8a5a'}">${imbalance.toFixed(1)}×</b>` +
        ` &nbsp; params: total 8 experts, <b>active 2</b> per token (¼ the compute of dense)`
    )
  }

  ctx.onTick(() => {
    const maxLoad = Math.max(...loads, 0.001)
    loadBars.forEach((b, e) => {
      const target = Math.max((loads[e] / maxLoad) * 1.35, 0.001)
      b.scale.y += (target - b.scale.y) * 0.1
    })
  })

  let auto = null
  button(controlsEl, '→ route 1 token', routeNext)
  button(controlsEl, '▶ route stream', () => {
    if (auto) return
    auto = setInterval(routeNext, 450)
  })
  button(controlsEl, '⏸ stop', () => { if (auto) { clearInterval(auto); auto = null } })
  slider(controlsEl, 'load-balancing incentive', { min: 0, max: 1, step: 0.05, value: 0 }, (v) => { balance = v })
  button(controlsEl, '↻ reset loads', () => {
    loads.fill(0)
    routedTokens = 0
    ti = 0
    refresh(null)
  })

  refresh(null)
  const origDispose = ctx.dispose
  return () => { if (auto) clearInterval(auto); origDispose() }
}
