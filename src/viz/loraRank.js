import * as THREE from 'three'
import { createScene, makeLabel } from './scene.js'
import { readout, slider } from './dom.js'

// Why LoRA works, made visible. LEFT: a "true" weight update ΔW built as a sum of
// rank-1 layers with decaying strength (the empirical claim: fine-tuning updates
// are dominated by a few directions). RIGHT: its best rank-r approximation — which
// is just the first r of those layers (Eckart–Young), so no SVD needed here.
// Slide r and watch the picture snap into place long before r reaches full rank,
// while the parameter counter stays tiny.
const N = 28 // matrix is N×N
const FULL_RANK = N

// Orthonormal basis (discrete cosine) so the rank-1 layers are genuinely independent
function basis(k) {
  const v = new Float32Array(N)
  let norm = 0
  for (let i = 0; i < N; i++) {
    v[i] = Math.cos((Math.PI * (i + 0.5) * k) / N)
    norm += v[i] * v[i]
  }
  norm = Math.sqrt(norm)
  for (let i = 0; i < N; i++) v[i] /= norm
  return v
}

export default function loraRank(stage3d, controlsEl) {
  const ctx = createScene(stage3d, { camPos: [0, 9.5, 13], grid: false, axes: false })
  ctx.controls.target.set(0, 0, 0)
  const { scene } = ctx

  // spectrum: a few strong directions, a long weak tail — the low-rank hypothesis
  const sigma = []
  for (let k = 0; k < FULL_RANK; k++) sigma.push(1 / Math.pow(k + 1, 1.35))
  const U = [], V = []
  for (let k = 0; k < FULL_RANK; k++) {
    U.push(basis(k + 1))
    V.push(basis(FULL_RANK - k))
  }
  const totalEnergy = sigma.reduce((s, x) => s + x * x, 0)

  function build(rank) {
    const M = new Float32Array(N * N)
    for (let k = 0; k < rank; k++) {
      const s = sigma[k], u = U[k], v = V[k]
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) M[i * N + j] += s * u[i] * v[j]
    }
    return M
  }

  const target = build(FULL_RANK)
  let peak = 0
  for (const x of target) peak = Math.max(peak, Math.abs(x))

  // two grids of cells: left = target ΔW, right = rank-r reconstruction
  const cell = 0.3
  const gap = 2.6
  const halfW = (N * cell) / 2
  const geo = new THREE.BoxGeometry(cell * 0.9, 1, cell * 0.9)
  geo.translate(0, 0.5, 0)

  function makeGrid(xOffset) {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), N * N)
    const dummy = new THREE.Object3D()
    let n = 0
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        dummy.position.set(xOffset + j * cell - halfW, 0, i * cell - halfW)
        dummy.scale.set(1, 0.01, 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(n++, dummy.matrix)
      }
    mesh.instanceMatrix.needsUpdate = true
    scene.add(mesh)
    return mesh
  }

  const leftX = -halfW - gap / 2
  const rightX = halfW + gap / 2
  const gridA = makeGrid(leftX)
  const gridB = makeGrid(rightX)

  scene.add(makeLabel('ΔW — the update fine-tuning wants', new THREE.Vector3(leftX, 0.2, -halfW - 1.4), '#d97757', 24))
  scene.add(makeLabel('B·A — what LoRA stores', new THREE.Vector3(rightX, 0.2, -halfW - 1.4), '#7d9b76', 24))

  const dummy = new THREE.Object3D()
  const cWarm = new THREE.Color(0xd97757)
  const cCool = new THREE.Color(0x6a8bc7)
  const cFlat = new THREE.Color(0x3f3b35)

  function paint(mesh, M, xOffset) {
    let n = 0
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const v = M[i * N + j] / peak
        const h = Math.max(Math.abs(v) * 2.6, 0.012)
        dummy.position.set(xOffset + j * cell - halfW, 0, i * cell - halfW)
        dummy.scale.set(1, h, 1)
        dummy.updateMatrix()
        mesh.setMatrixAt(n, dummy.matrix)
        const c = cFlat.clone().lerp(v >= 0 ? cWarm : cCool, Math.min(Math.abs(v) * 1.6, 1))
        mesh.setColorAt(n, c)
        n++
      }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  const out = readout(controlsEl)
  let rank = 2

  function refresh() {
    const approx = build(rank)
    paint(gridB, approx, rightX)

    let kept = 0
    for (let k = 0; k < rank; k++) kept += sigma[k] * sigma[k]
    const captured = (kept / totalEnergy) * 100

    const fullParams = N * N
    const loraParams = 2 * N * rank
    const pct = (loraParams / fullParams) * 100

    out.setHTML(
      `rank r = <b>${rank}</b> of ${FULL_RANK} &nbsp; captures <b>${captured.toFixed(1)}%</b> of the update` +
        ` &nbsp;|&nbsp; stored numbers: <b>${loraParams}</b> vs ${fullParams} full ` +
        `(<b>${pct.toFixed(1)}%</b>, a <b>${(fullParams / loraParams).toFixed(1)}×</b> saving)` +
        `<br><span style="opacity:.75">In a real 4096×4096 layer: full = 16.8M numbers, r=16 LoRA = 131k — the same 128× saving, and the same shape of picture.</span>`
    )
  }

  slider(controlsEl, 'LoRA rank r', { min: 1, max: FULL_RANK, step: 1, value: rank }, (v) => {
    rank = v
    refresh()
  })

  paint(gridA, target, leftX)
  refresh()
  return ctx.dispose
}
