import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { buildWorld, WORLD_VOX } from './world'
import { buildGarrick } from './garrick'

/**
 * Fable — visual demo.
 * Scene 1 of the tutorial campaign: The First Fork, late afternoon.
 * No gameplay. Free camera only: drag to orbit, scroll to zoom, right-drag to pan.
 */

const SUN_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize()

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.12
renderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x9fb0ad)
scene.fog = new THREE.FogExp2(0xa8b6ae, 0.026)

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.05, 220)

// ---------------------------------------------------------------- lighting
// Low golden sun through the birch, from the west.
const sun = new THREE.DirectionalLight(0xffd3a1, 3.1)
sun.position.copy(SUN_DIR).multiplyScalar(40)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.near = 1
sun.shadow.camera.far = 90
const SH = 13
sun.shadow.camera.left = -SH
sun.shadow.camera.right = SH
sun.shadow.camera.top = SH
sun.shadow.camera.bottom = -SH
sun.shadow.bias = -0.0009
sun.shadow.normalBias = 0.03
scene.add(sun)
scene.add(sun.target)

// Cool skylight fill, warm bounce from the ground.
const hemi = new THREE.HemisphereLight(0xa8c4dc, 0x4a4b32, 1.15)
scene.add(hemi)

// A faint cold fill from the north, so the polluted water never goes muddy.
const fill = new THREE.DirectionalLight(0x9fc0d8, 0.5)
fill.position.set(10, 8, 30)
scene.add(fill)

// ------------------------------------------------------------------- world
const world = buildWorld()

const terrainMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.96,
  metalness: 0.0,
  flatShading: false,
})
const terrain = new THREE.Mesh(world.terrain, terrainMat)
terrain.castShadow = true
terrain.receiveShadow = true
scene.add(terrain)

scene.add(world.water)

// ----------------------------------------------------------------- Garrick
const { geometry: garrickGeo } = buildGarrick()
const heroMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.62,
  metalness: 0.22,
})
const garrick = new THREE.Mesh(garrickGeo, heroMat)
garrick.castShadow = true
garrick.receiveShadow = true
garrick.position.copy(world.garrickSpot)
garrick.rotation.y = -0.65 // facing upstream, toward the tributary
scene.add(garrick)

// Keep the shadow camera tight around him for crisp contact shadows.
sun.target.position.copy(world.garrickSpot)
sun.position.copy(world.garrickSpot).add(SUN_DIR.clone().multiplyScalar(40))

// Soft contact shadow so he is planted, not floating.
const contact = new THREE.Mesh(
  new THREE.CircleGeometry(0.55, 24).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({
    color: 0x1a2018, transparent: true, opacity: 0.22, depthWrite: false,
  }),
)
contact.position.copy(world.garrickSpot).add(new THREE.Vector3(0, 0.025, 0))
scene.add(contact)

// -------------------------------------------------------------------- mist
function mistTexture(): THREE.Texture {
  const s = 512
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  g.clearRect(0, 0, s, s)
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * s
    const y = Math.random() * s
    const r = 40 + Math.random() * 120
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    const a = 0.03 + Math.random() * 0.05
    grad.addColorStop(0, `rgba(255,255,255,${a})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

const mistLayers: THREE.Mesh[] = []
{
  const tex = mistTexture()
  const w = world.bounds.sx * WORLD_VOX
  const d = world.bounds.sz * WORLD_VOX
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex.clone(),
      transparent: true,
      opacity: 0.17 - i * 0.035,
      depthWrite: false,
      color: new THREE.Color().setHSL(0.12, 0.1, 0.96),
    })
    mat.map!.needsUpdate = true
    mat.map!.repeat.set(1.6, 1.6)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.3, d * 1.3).rotateX(-Math.PI / 2), mat)
    m.position.set(w / 2, 0.42 + i * 0.4, d / 2)
    m.renderOrder = 2 + i
    scene.add(m)
    mistLayers.push(m)
  }
}

// ------------------------------------------------------------------- motes
// Pollen and spores catching the low sun.
{
  const count = 700
  const pos = new Float32Array(count * 3)
  const w = world.bounds.sx * WORLD_VOX
  const d = world.bounds.sz * WORLD_VOX
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * w
    pos[i * 3 + 1] = 0.2 + Math.random() * 3.6
    pos[i * 3 + 2] = Math.random() * d
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    size: 0.035,
    color: 0xffe6bd,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  scene.add(pts)
  ;(scene.userData as any).motes = pts
}

// ----------------------------------------------------------------- camera
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.055
controls.target.copy(world.garrickSpot).add(new THREE.Vector3(0, 0.9, 0))
controls.minDistance = 0.8
controls.maxDistance = 26
controls.maxPolarAngle = Math.PI * 0.495
controls.autoRotate = true
controls.autoRotateSpeed = 0.26
controls.addEventListener('start', () => { controls.autoRotate = false })

camera.position.copy(world.garrickSpot).add(new THREE.Vector3(3.6, 2.4, -4.6))
controls.update()

// -------------------------------------------------------------- composer
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.72, 0.78,
)
composer.addPass(bloom)
composer.addPass(new SMAAPass())
composer.addPass(new OutputPass())

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock()

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
}
window.addEventListener('resize', onResize)

const waterMat = world.water.material as THREE.ShaderMaterial
const motes = (scene.userData as any).motes as THREE.Points

function tick() {
  const t = clock.getElapsedTime()
  waterMat.uniforms.uTime.value = t

  for (let i = 0; i < mistLayers.length; i++) {
    const m = mistLayers[i].material as THREE.MeshBasicMaterial
    const dir = i % 2 === 0 ? 1 : -1
    m.map!.offset.x = (t * 0.0045 * dir * (1 + i * 0.3)) % 1
    m.map!.offset.y = (t * 0.0022 * (1 + i * 0.2)) % 1
    mistLayers[i].position.y = 0.42 + i * 0.4 + Math.sin(t * 0.18 + i) * 0.05
  }

  const p = motes.geometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 0.0022 + Math.sin(t * 0.5 + i) * 0.0008
    p.setY(i, y > 4.2 ? 0.15 : y)
    p.setX(i, p.getX(i) + Math.sin(t * 0.25 + i * 0.7) * 0.0012)
  }
  p.needsUpdate = true

  // Barely-there breathing, so he reads as alive rather than as a prop.
  garrick.position.y = world.garrickSpot.y + Math.sin(t * 1.1) * 0.006

  controls.update()
  composer.render()
  requestAnimationFrame(tick)
}

// The scene is static, so the shadow map only ever needs rendering once.
renderer.shadowMap.autoUpdate = false
renderer.shadowMap.needsUpdate = true

const loading = document.getElementById('loading')
if (loading) loading.remove()
tick()
