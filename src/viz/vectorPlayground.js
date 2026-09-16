import * as THREE from 'three'
import { createScene, makeLabel, updateLabel } from './scene.js'
import { slider, readout } from './dom.js'

// Two vectors u, v in 3D. Live dot product, angle, cosine similarity, and the
// projection of u onto v — the geometry behind embedding similarity.
export default function vectorPlayground(stage, controlsEl) {
  const ctx = createScene(stage)
  const { scene } = ctx

  const u = new THREE.Vector3(2, 1, 0.5)
  const v = new THREE.Vector3(0.5, 2, 1)

  const uArrow = new THREE.ArrowHelper(u.clone().normalize(), origin(), u.length(), 0xd97757, 0.22, 0.12)
  const vArrow = new THREE.ArrowHelper(v.clone().normalize(), origin(), v.length(), 0x6a8bc7, 0.22, 0.12)
  const projArrow = new THREE.ArrowHelper(v.clone().normalize(), origin(), 1, 0x7d9b76, 0.16, 0.09)
  scene.add(uArrow, vArrow, projArrow)

  const uLabel = makeLabel('u', u.clone().multiplyScalar(1.12), '#d97757')
  const vLabel = makeLabel('v', v.clone().multiplyScalar(1.12), '#6a8bc7')
  const pLabel = makeLabel('proj_v(u)', new THREE.Vector3(), '#7d9b76', 24)
  scene.add(uLabel, vLabel, pLabel)

  // dashed line from tip of u down to its projection onto v
  const dropGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
  const dropLine = new THREE.Line(
    dropGeom,
    new THREE.LineDashedMaterial({ color: 0x9a958a, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.7 })
  )
  scene.add(dropLine)

  const out = readout(controlsEl)

  function refresh() {
    uArrow.setDirection(u.clone().normalize())
    uArrow.setLength(Math.max(u.length(), 0.001), 0.22, 0.12)
    vArrow.setDirection(v.clone().normalize())
    vArrow.setLength(Math.max(v.length(), 0.001), 0.22, 0.12)

    const dot = u.dot(v)
    const cos = dot / (u.length() * v.length() || 1)
    const angle = (Math.acos(THREE.MathUtils.clamp(cos, -1, 1)) * 180) / Math.PI

    const proj = v.clone().multiplyScalar(dot / (v.lengthSq() || 1))
    projArrow.setDirection(proj.clone().normalize())
    projArrow.setLength(Math.max(proj.length(), 0.001), 0.16, 0.09)

    dropGeom.setFromPoints([u.clone(), proj.clone()])
    dropLine.computeLineDistances()

    uLabel.position.copy(u.clone().multiplyScalar(1.12))
    vLabel.position.copy(v.clone().multiplyScalar(1.12))
    pLabel.position.copy(proj.clone().multiplyScalar(1.15)).add(new THREE.Vector3(0, -0.2, 0))

    out.setHTML(
      `u·v = <b>${dot.toFixed(2)}</b> &nbsp; |u| = ${u.length().toFixed(2)} &nbsp; |v| = ${v.length().toFixed(2)}` +
        ` &nbsp; cos θ = <b>${cos.toFixed(3)}</b> &nbsp; θ = ${angle.toFixed(1)}°`
    )
  }

  for (const [vec, name, axis] of [
    [u, 'u', 'x'], [u, 'u', 'y'], [u, 'u', 'z'],
    [v, 'v', 'x'], [v, 'v', 'y'], [v, 'v', 'z'],
  ]) {
    slider(controlsEl, `${name}${axis}`, { min: -3, max: 3, step: 0.1, value: vec[axis] }, (val) => {
      vec[axis] = val
      refresh()
    })
  }

  refresh()
  return ctx.dispose

  function origin() {
    return new THREE.Vector3(0, 0, 0)
  }
}
