import * as THREE from 'three'
import { VoxelVolume } from './voxel'
import { decodeVox } from './vox-format'
import type { SceneManifest } from './gen/common'

/**
 * Loads a scene authored as MagicaVoxel .vox files plus a placement manifest.
 *
 * Terrain chunks become static meshes; every prop becomes one InstancedMesh,
 * so 74 birches cost a single draw call. Nothing here knows how the assets
 * were made — swap in hand-authored .vox files and it behaves identically.
 */

export interface LoadedScene {
  group: THREE.Group
  hero: THREE.Mesh
  heroPosition: THREE.Vector3
  manifest: SceneManifest
  stats: { triangles: number; drawCalls: number }
}

async function fetchVox(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status}`)
  return decodeVox(await res.arrayBuffer())
}

export async function loadScene(
  base: string,
  materials: { terrain: THREE.Material; prop: THREE.Material; hero: THREE.Material },
  onProgress?: (msg: string) => void,
): Promise<LoadedScene> {
  const manifest: SceneManifest = await (await fetch(`${base}/scene.json`)).json()
  const V = manifest.worldVoxel
  const group = new THREE.Group()
  let triangles = 0
  let drawCalls = 0

  // ---- terrain ------------------------------------------------------------
  for (const chunk of manifest.terrainChunks) {
    onProgress?.(`terrain ${chunk.file}`)
    const model = await fetchVox(`${base}/${chunk.file}`)
    const vol = VoxelVolume.fromVox(model, V)
    const geo = vol.build({ cullInterior: true, sealSides: true })
    triangles += geo.getAttribute('position').count / 3
    const mesh = new THREE.Mesh(geo, materials.terrain)
    mesh.position.set(chunk.x * V, chunk.y * V, chunk.z * V)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    drawCalls++
  }

  // ---- props, one InstancedMesh per model ---------------------------------
  const byModel = new Map<string, typeof manifest.placements>()
  for (const p of manifest.placements) {
    if (!byModel.has(p.model)) byModel.set(p.model, [])
    byModel.get(p.model)!.push(p)
  }

  const m = new THREE.Matrix4()
  const t = new THREE.Matrix4()
  const r = new THREE.Matrix4()
  const c = new THREE.Matrix4()

  for (const [name, list] of byModel) {
    const file = manifest.models[name]
    if (!file) continue
    onProgress?.(`${name} ×${list.length}`)
    const model = await fetchVox(`${base}/${file}`)
    const vol = VoxelVolume.fromVox(model, V)
    const geo = vol.build({ cullInterior: true })

    // Rotate about the model's own horizontal centre.
    const cx = (model.sx / 2) * V
    const cz = (model.sz / 2) * V

    const inst = new THREE.InstancedMesh(geo, materials.prop, list.length)
    inst.castShadow = true
    inst.receiveShadow = true
    for (let i = 0; i < list.length; i++) {
      const p = list[i]
      c.makeTranslation(-cx, 0, -cz)
      r.makeRotationY((p.rot * Math.PI) / 2)
      t.makeTranslation(p.x * V, p.y * V, p.z * V)
      m.copy(t).multiply(r).multiply(c)
      inst.setMatrixAt(i, m)
    }
    inst.instanceMatrix.needsUpdate = true
    group.add(inst)
    triangles += (geo.getAttribute('position').count / 3) * list.length
    drawCalls++
  }

  // ---- hero ---------------------------------------------------------------
  onProgress?.('garrick')
  const heroModel = await fetchVox(`${base}/${manifest.hero.model}`)
  const heroVol = VoxelVolume.fromVox(heroModel, manifest.heroVoxel)
  const heroGeo = heroVol.build({ shade: 0.2 })
  heroGeo.translate(
    (-heroModel.sx / 2) * manifest.heroVoxel,
    0,
    (-heroModel.sz / 2) * manifest.heroVoxel,
  )
  triangles += heroGeo.getAttribute('position').count / 3
  drawCalls++

  const hero = new THREE.Mesh(heroGeo, materials.hero)
  hero.castShadow = true
  hero.receiveShadow = true
  const heroPosition = new THREE.Vector3(
    manifest.hero.x * V, manifest.hero.y * V, manifest.hero.z * V,
  )
  hero.position.copy(heroPosition)
  hero.rotation.y = manifest.hero.rotation
  group.add(hero)

  return { group, hero, heroPosition, manifest, stats: { triangles: Math.round(triangles), drawCalls } }
}
