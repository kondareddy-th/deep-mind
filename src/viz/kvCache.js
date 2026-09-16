import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, button } from './dom.js'

// Generation, step by step, with the KV cache made visible: a grid of cubes,
// one column per token position, one row per layer. With the cache ON, each new
// token adds ONE new column (coral flash → steel blue, kept). With it OFF, the
// whole grid re-flashes every step — that's the N² waste. Counters keep score.
const LAYERS = 8
const MAX_POS = 22
const PROMPT_LEN = 5

export default function kvCache(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [0, 4.5, 12.5], grid: false, axes: false })
  const { scene } = ctx

  const x0 = -((MAX_POS - 1) * 0.62) / 2
  const y0 = 0.4

  const cubes = [] // [pos][layer]
  for (let p = 0; p < MAX_POS; p++) {
    cubes.push([])
    for (let l = 0; l < LAYERS; l++) {
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.36, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x3a5a82, transparent: true, opacity: 0 })
      )
      c.position.set(x0 + p * 0.62, y0 + l * 0.44, 0)
      scene.add(c)
      cubes[p].push(c)
    }
  }
  scene.add(makeLabel('layers ↑', new THREE.Vector3(x0 - 1.3, y0 + (LAYERS - 1) * 0.22, 0), '#8a857a', 22))
  scene.add(makeLabel('token position →', new THREE.Vector3(0, -0.5, 0), '#8a857a', 22))
  const promptLbl = makeLabel('prompt', new THREE.Vector3(x0 + ((PROMPT_LEN - 1) * 0.62) / 2, y0 + LAYERS * 0.44 + 0.35, 0), '#7d9b76', 22)
  scene.add(promptLbl)

  let nTok = 0
  let cacheOn = true
  let workCached = 0
  let workUncached = 0
  let flash = [] // cubes currently flashing: [{cube, t}]
  const out = readout(controlsEl)

  function setCube(p, l, state) {
    // state: 'off' | 'cached' | 'compute'
    const c = cubes[p][l]
    if (state === 'off') {
      c.material.opacity = 0
    } else if (state === 'cached') {
      c.material.opacity = 1
      c.material.color.set(0x3a5a82)
    } else {
      c.material.opacity = 1
      c.material.color.set(0xd97757)
      flash.push({ cube: c, t: 0 })
    }
  }

  ctx.onTick(() => {
    flash = flash.filter((f) => {
      f.t += 0.02
      if (f.t >= 1) {
        f.cube.material.color.set(cacheOn ? 0x3a5a82 : 0x55514a)
        if (!cacheOn) f.cube.material.opacity = 0.35 // discarded — recomputed next step
        return false
      }
      f.cube.material.color.lerpColors(new THREE.Color(0xd97757), new THREE.Color(cacheOn ? 0x3a5a82 : 0x55514a), f.t)
      return true
    })
  })

  function step() {
    if (nTok >= MAX_POS) return
    const isPrefill = nTok < PROMPT_LEN
    if (isPrefill) {
      // prefill: all prompt columns computed at once, in parallel
      for (let p = 0; p < PROMPT_LEN; p++)
        for (let l = 0; l < LAYERS; l++) setCube(p, l, 'compute')
      workCached += PROMPT_LEN * LAYERS
      workUncached += PROMPT_LEN * LAYERS
      nTok = PROMPT_LEN
    } else {
      nTok++
      if (cacheOn) {
        // one new column computed; the rest persist untouched
        for (let l = 0; l < LAYERS; l++) setCube(nTok - 1, l, 'compute')
        workCached += LAYERS
        workUncached += nTok * LAYERS
      } else {
        // no cache: EVERYTHING recomputed, then thrown away
        for (let p = 0; p < nTok; p++)
          for (let l = 0; l < LAYERS; l++) setCube(p, l, 'compute')
        workCached += LAYERS
        workUncached += nTok * LAYERS
      }
    }
    refresh()
  }

  function refresh() {
    const gen = Math.max(0, nTok - PROMPT_LEN)
    const cells = cacheOn ? nTok * LAYERS : 0
    out.setHTML(
      `tokens: <b>${nTok}</b> (${PROMPT_LEN} prompt + ${gen} generated) &nbsp; ` +
        `cache holds: <b>${cells}</b> K/V cells &nbsp; ` +
        `work so far — with cache: <b>${workCached}</b> vs without: <b>${workUncached}</b>` +
        (workCached ? ` &nbsp; waste ratio: <b>${(workUncached / workCached).toFixed(1)}×</b>` : '')
    )
  }

  function reset() {
    nTok = 0
    workCached = 0
    workUncached = 0
    flash = []
    for (let p = 0; p < MAX_POS; p++) for (let l = 0; l < LAYERS; l++) setCube(p, l, 'off')
    refresh()
  }

  let auto = null
  button(controlsEl, '▶ prefill prompt', () => { if (nTok === 0) step() })
  button(controlsEl, '+1 token', step)
  button(controlsEl, '▶▶ generate all', () => {
    if (auto) return
    auto = setInterval(() => {
      if (nTok === 0) step()
      else if (nTok < MAX_POS) step()
      else { clearInterval(auto); auto = null }
    }, 550)
  })
  const cacheBtn = button(controlsEl, 'KV cache: ON', () => {
    cacheOn = !cacheOn
    cacheBtn.textContent = `KV cache: ${cacheOn ? 'ON' : 'OFF'}`
    reset()
  })
  button(controlsEl, '↻ reset', () => { if (auto) { clearInterval(auto); auto = null } reset() })

  const origDispose = ctx.dispose
  reset()
  return () => { if (auto) clearInterval(auto); origDispose() }
}
