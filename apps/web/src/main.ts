import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { loadScene } from './scene-loader'
import { WORLD_VOX } from './gen/common'

/**
 * Fable — ENDLESS MODE visual demo.
 *
 * The lane, seen side-on as a cut-away through the earth: strata above and
 * below, a goblin lair hollowed out of the middle. Garrick holds the left,
 * four Goblin Minions wait on the right.
 *
 * Purely visual. Nothing fights, nothing spawns, nothing is simulated.
 * Drag to look around, scroll to zoom.
 */

const canvas = document.getElementById('app') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x07080a)
scene.fog = new THREE.FogExp2(0x0a0b0d, 0.052)

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 160)

// ------------------------------------------------------------- ambient light
// Underground: almost nothing but the fires. A faint cold bounce keeps the
// rock from going pure black and separates it from the background.
scene.add(new THREE.HemisphereLight(0x2a3340, 0x15120f, 0.5))

// A dim cool key from camera-left gives the characters readable shape without
// pretending there is daylight down here.
const key = new THREE.DirectionalLight(0x8fa8c4, 0.35)
key.position.set(-6, 9, 14)
scene.add(key)

const status = document.getElementById('loading')
const say = (s: string) => { if (status) status.textContent = s }

// ------------------------------------------------------------------- scene
const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 })
const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0 })
const charMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.16 })

say('Digging out the lair…')
const loaded = await loadScene('/assets/lair', { terrain: rockMat, prop: propMat, hero: charMat }, say)
scene.add(loaded.group)

const bounds = loaded.manifest.bounds
console.log(
  `[fable] ${loaded.stats.triangles.toLocaleString()} triangles, ` +
  `${loaded.stats.drawCalls} draw calls, ${loaded.manifest.placements.length} placements`,
)

// --------------------------------------------------------------- firelight
interface Flame { light: THREE.PointLight; base: number; flicker: number; seed: number }
const flames: Flame[] = []

for (const l of loaded.manifest.lights ?? []) {
  const light = new THREE.PointLight(l.color, l.intensity, l.distance, 2)
  light.position.set(l.x, l.y, l.z)
  if (l.shadow) {
    light.castShadow = true
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.camera.near = 0.1
    light.shadow.camera.far = l.distance
    light.shadow.bias = -0.004
    light.shadow.normalBias = 0.04
  }
  scene.add(light)
  flames.push({ light, base: l.intensity, flicker: l.flicker, seed: Math.random() * 100 })
}

// ------------------------------------------------------------------ embers
// Sparks rising off the campfire, and dust hanging in the torchlight.
const fire = (loaded.manifest.lights ?? []).find(l => l.shadow)
if (fire) {
  const count = 160
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = fire.x + (Math.random() - 0.5) * 0.7
    pos[i * 3 + 1] = fire.y + Math.random() * 2.4
    pos[i * 3 + 2] = fire.z + (Math.random() - 0.5) * 0.7
    seed[i] = Math.random()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    size: 0.045, color: 0xff9a3c, transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const embers = new THREE.Points(geo, mat)
  embers.frustumCulled = false
  scene.add(embers)
  ;(scene.userData as any).embers = { points: embers, seed, origin: fire }
}

{
  const count = 900
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * bounds.sx * WORLD_VOX
    pos[i * 3 + 1] = 1.0 + Math.random() * 3.2
    pos[i * 3 + 2] = Math.random() * bounds.sz * WORLD_VOX * 0.7
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const dust = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.022, color: 0xffd9a8, transparent: true, opacity: 0.4,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }))
  dust.frustumCulled = false
  scene.add(dust)
  ;(scene.userData as any).dust = dust
}

// ------------------------------------------------------------------ camera
const cam = loaded.manifest.camera!
camera.position.set(...cam.position)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.target.set(...cam.target)
controls.minDistance = 2
controls.maxDistance = 22
// Keep it broadly side-on — this is a lane, not a free-roam scene.
controls.minPolarAngle = Math.PI * 0.26
controls.maxPolarAngle = Math.PI * 0.56
controls.minAzimuthAngle = -Math.PI * 0.22
controls.maxAzimuthAngle = Math.PI * 0.22
controls.update()

// A slow dolly along the lane, so the parallax of the strata reads.
let autoPan = true
controls.addEventListener('start', () => { autoPan = false })

// ---------------------------------------------------------------- composer
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
composer.addPass(new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.72, 0.8, 0.62,
))
composer.addPass(new SMAAPass())
composer.addPass(new OutputPass())

// -------------------------------------------------------------------- loop
const clock = new THREE.Clock()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
})

const emberData = (scene.userData as any).embers as
  { points: THREE.Points; seed: Float32Array; origin: { x: number; y: number; z: number } } | undefined
const dust = (scene.userData as any).dust as THREE.Points

const actors = loaded.actors

function tick() {
  const t = clock.getElapsedTime()

  // Firelight flicker: two sine rates plus noise, so it never feels looped.
  for (const f of flames) {
    const n = Math.sin(t * 9.3 + f.seed) * 0.5 + Math.sin(t * 23.7 + f.seed * 2.1) * 0.3
      + Math.sin(t * 3.1 + f.seed * 0.7) * 0.2
    f.light.intensity = f.base * (1 + n * 0.17 * f.flicker)
  }

  // Embers rise, cool and die.
  if (emberData) {
    const p = emberData.points.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const s = emberData.seed[i]
      let y = p.getY(i) + 0.006 + s * 0.012
      let x = p.getX(i) + Math.sin(t * (1.2 + s) + i) * 0.0016
      if (y > emberData.origin.y + 2.6) {
        y = emberData.origin.y - 0.1
        x = emberData.origin.x + (Math.random() - 0.5) * 0.6
      }
      p.setY(i, y)
      p.setX(i, x)
    }
    p.needsUpdate = true
  }

  // Dust drifts down the lane.
  {
    const p = dust.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) - 0.0025
      if (x < 0) x = bounds.sx * WORLD_VOX
      p.setX(i, x)
      p.setY(i, p.getY(i) + Math.sin(t * 0.6 + i) * 0.0004)
    }
    p.needsUpdate = true
  }

  // Idle breathing, offset per character so they are not in lockstep.
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i]
    const rate = i === 0 ? 1.0 : 1.7 + i * 0.13
    a.position.y = (a.userData.baseY ??= a.position.y) + Math.sin(t * rate + i * 1.7) * 0.007
  }

  if (autoPan) {
    const sweep = Math.sin(t * 0.06) * 2.4
    controls.target.x = cam.target[0] + sweep
    camera.position.x = cam.position[0] + sweep
  }

  controls.update()
  composer.render()
  requestAnimationFrame(tick)
}

if (status) status.remove()
tick()
