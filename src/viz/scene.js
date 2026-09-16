import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// Shared boilerplate: renderer + scene + camera + controls + lights + resize + dispose.
export function createScene(container, { camPos = [4.5, 3.5, 6.5], grid = true, axes = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x1f1e1d)
  container.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
  camera.position.set(...camPos)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const dir = new THREE.DirectionalLight(0xffffff, 1.4)
  dir.position.set(5, 10, 7)
  scene.add(dir)

  if (grid) {
    const g = new THREE.GridHelper(8, 8, 0x45413a, 0x2b2825)
    g.position.y = -0.001
    scene.add(g)
  }
  if (axes) {
    addAxis(scene, [4.2, 0, 0], 0x8a857a, 'x')
    addAxis(scene, [0, 4.2, 0], 0x8a857a, 'y')
    addAxis(scene, [0, 0, 4.2], 0x8a857a, 'z')
  }

  const size = () => {
    const w = container.clientWidth || 800
    const h = container.clientHeight || 420
    renderer.setSize(w, h, false)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  size()
  const ro = new ResizeObserver(size)
  ro.observe(container)

  const tickers = []
  renderer.setAnimationLoop(() => {
    controls.update()
    for (const t of tickers) t()
    renderer.render(scene, camera)
  })

  return {
    scene,
    camera,
    renderer,
    controls,
    onTick: (fn) => tickers.push(fn),
    dispose() {
      renderer.setAnimationLoop(null)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      container.innerHTML = ''
    },
  }
}

function addAxis(scene, end, color, label) {
  const v = new THREE.Vector3(...end)
  const arrow = new THREE.ArrowHelper(v.clone().normalize(), new THREE.Vector3(0, 0, 0), v.length(), color, 0.18, 0.1)
  scene.add(arrow)
  scene.add(makeLabel(label, v.multiplyScalar(1.07), '#8a857a', 26))
}

// Text label as a sprite (canvas texture) — cheap and always camera-facing.
export function makeLabel(text, position, color = '#f0eee6', fontPx = 34) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `600 ${fontPx}px -apple-system, Helvetica, sans-serif`
  const w = Math.ceil(ctx.measureText(text).width) + 16
  const h = fontPx + 14
  canvas.width = w * 2
  canvas.height = h * 2
  const c2 = canvas.getContext('2d')
  c2.scale(2, 2)
  c2.font = `600 ${fontPx}px -apple-system, Helvetica, sans-serif`
  c2.fillStyle = color
  c2.textBaseline = 'middle'
  c2.fillText(text, 8, h / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  const scale = 0.012
  sprite.scale.set(w * scale, h * scale, 1)
  sprite.position.copy(position)
  return sprite
}

export function updateLabel(sprite, text, color = '#e6edf3', fontPx = 34) {
  const fresh = makeLabel(text, sprite.position, color, fontPx)
  sprite.material.map.dispose()
  sprite.material.dispose()
  sprite.material = fresh.material
  sprite.scale.copy(fresh.scale)
}
