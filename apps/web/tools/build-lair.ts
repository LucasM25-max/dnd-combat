import { mkdirSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { VoxelVolume, hash3 } from '../src/voxel'
import { encodeVox } from '../src/vox-format'
import {
  LANE_SX, LANE_SY, LANE_SZ, barricade, bonePile, buildLair, campfire, ceilY,
  crate, floorY, mushrooms, stalagmite, torchSconce, totem,
} from '../src/gen/lair'
import { buildGoblin } from '../src/gen/goblin'
import { buildGarrick } from '../src/gen/garrick'
import { HERO_VOX, Placement, SceneLight, SceneManifest, WORLD_VOX, Actor } from '../src/gen/common'

/**
 * Builds the ENDLESS MODE demo scene: a goblin lair, cut away so the lane
 * reads as a cross-section through the earth.
 */

export function buildLairScene(out: string) {
  mkdirSync(out, { recursive: true })
  if (existsSync(out)) {
    for (const f of readdirSync(out)) {
      if (f.endsWith('.vox') || f === 'scene.json') unlinkSync(join(out, f))
    }
  }

  let total = 0
  const write = (name: string, v: VoxelVolume, hollow = true) => {
    const vol = hollow ? v.hollow() : v
    const bytes = encodeVox(vol.toVox())
    writeFileSync(join(out, name), bytes)
    total += bytes.length
    console.log(
      `  ${name.padEnd(24)} ${String(vol.sx).padStart(3)}x${String(vol.sy).padStart(3)}x${String(vol.sz).padStart(3)}` +
      `  ${String(vol.countSolid()).padStart(8)} voxels  ${(bytes.length / 1024).toFixed(0).padStart(5)} KB`,
    )
  }

  // ---- props --------------------------------------------------------------
  console.log('\nlair props')
  const models: Record<string, string> = {}
  const sizes: Record<string, { sx: number; sy: number; sz: number }> = {}
  const prop = (name: string, raw: VoxelVolume) => {
    const { volume } = raw.cropped()
    write(`${name}.vox`, volume)
    models[name] = `${name}.vox`
    sizes[name] = { sx: volume.sx, sy: volume.sy, sz: volume.sz }
  }

  for (let i = 0; i < 3; i++) prop(`stalagmite_${i}`, stalagmite(i * 3 + 1, true))
  for (let i = 0; i < 3; i++) prop(`stalactite_${i}`, stalagmite(i * 5 + 2, false))
  for (let i = 0; i < 2; i++) prop(`bones_${i}`, bonePile(i * 7 + 1))
  for (let i = 0; i < 2; i++) prop(`crate_${i}`, crate(i * 4 + 1))
  for (let i = 0; i < 2; i++) prop(`shrooms_${i}`, mushrooms(i * 6 + 3))
  prop('totem', totem(2))
  prop('campfire', campfire())
  prop('barricade', barricade(1))
  prop('torch', torchSconce())

  // ---- characters ----------------------------------------------------------
  console.log('\nlair characters')
  write('garrick.vox', buildGarrick(), false)
  models['garrick'] = 'garrick.vox'
  for (let i = 0; i < 3; i++) {
    write(`goblin_${i}.vox`, buildGoblin(i), false)
    models[`goblin_${i}`] = `goblin_${i}.vox`
  }

  // ---- the lane ------------------------------------------------------------
  console.log('\nlair chunks')
  const lane = buildLair()
  const CW = 234
  const chunks: SceneManifest['terrainChunks'] = []
  for (let cx = 0; cx < LANE_SX; cx += CW) {
    const w = Math.min(CW, LANE_SX - cx)
    const chunk = new VoxelVolume(w, LANE_SY, LANE_SZ, WORLD_VOX)
    ;(chunk as any).palette = lane.getPalette().slice()
    for (let y = 0; y < LANE_SY; y++)
      for (let z = 0; z < LANE_SZ; z++)
        for (let x = 0; x < w; x++) {
          const val = lane.get(cx + x, y, z)
          if (val) (chunk as any).data[(y * LANE_SZ + z) * w + x] = val
        }
    const file = `lane_${cx}.vox`
    write(file, chunk)
    chunks.push({ file, x: cx, y: 0, z: 0 })
  }

  // ---- placements -----------------------------------------------------------
  const placements: Placement[] = []
  const lights: SceneLight[] = []
  const place = (model: string, x: number, y: number, z: number, rot = 0) =>
    placements.push({ model, x, y, z, rot })

  // Stalagmites along the floor and stalactites from the ceiling.
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(hash3(i, 1, 9) * LANE_SX)
    const z = 16 + Math.floor(hash3(i, 2, 3) * 34)
    const m = `stalagmite_${i % 3}`
    place(m, x, floorY(x) - 1, z, Math.floor(hash3(i, 5, 5) * 4))
  }
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(hash3(i, 7, 2) * LANE_SX)
    const z = 14 + Math.floor(hash3(i, 3, 8) * 36)
    const m = `stalactite_${i % 3}`
    place(m, x, ceilY(x) - sizes[m].sy + 3, z, Math.floor(hash3(i, 4, 1) * 4))
  }

  // Glowing fungus in the damp corners.
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(hash3(i, 11, 4) * LANE_SX)
    const z = 20 + Math.floor(hash3(i, 6, 6) * 36)
    place(`shrooms_${i % 2}`, x, floorY(x), z, Math.floor(hash3(i, 2, 2) * 4))
    if (i % 4 === 0) {
      lights.push({
        x: (x + 2) * WORLD_VOX, y: (floorY(x) + 4) * WORLD_VOX, z: (z + 2) * WORLD_VOX,
        color: 0x4fd8c8, intensity: 1.6, distance: 3.2, flicker: 0.12,
      })
    }
  }

  // The goblin camp occupies the right-hand half of the lane.
  const fireX = 452
  place('campfire', fireX, floorY(fireX) - 1, 34)
  lights.push({
    x: fireX * WORLD_VOX, y: (floorY(fireX) + 5) * WORLD_VOX, z: 34 * WORLD_VOX,
    color: 0xff7a24, intensity: 26, distance: 11, flicker: 1, shadow: true,
  })
  lights.push({
    x: fireX * WORLD_VOX, y: (floorY(fireX) + 11) * WORLD_VOX, z: 34 * WORLD_VOX,
    color: 0xffb257, intensity: 9, distance: 18, flicker: 0.75,
  })

  place('bones_0', 400, floorY(400), 24, 1)
  place('bones_1', 510, floorY(510), 44, 3)
  place('bones_0', 620, floorY(620), 30, 2)
  place('totem', 398, floorY(398), 50, 0)
  place('totem', 560, floorY(560), 52, 2)
  place('crate_0', 500, floorY(500), 52, 1)
  place('crate_1', 524, floorY(524), 50, 0)
  place('crate_0', 516, floorY(516) + 10, 51, 2)   // stacked
  place('barricade', 648, floorY(648) - 2, 34, 0)
  place('bones_1', 300, floorY(300), 40, 0)

  // Torches down the back wall, each with its own point light.
  for (const tx of [96, 212, 330, 470, 600, 668]) {
    const ty = floorY(tx) + 26
    place('torch', tx, ty, 54, 0)
    lights.push({
      x: (tx + 2) * WORLD_VOX, y: (ty + 21) * WORLD_VOX, z: 52 * WORLD_VOX,
      color: 0xff9a3c, intensity: 11, distance: 7.5, flicker: 0.85,
    })
  }

  // ---- actors ---------------------------------------------------------------
  // Garrick holds the left of the lane; the goblins come from the right.
  const gx = 150
  const actors: Actor[] = [
    { model: 'garrick.vox', x: gx, y: floorY(gx) + 1, z: 30, rotation: -Math.PI / 2 },
  ]
  const goblinXs = [430, 486, 532, 580]
  goblinXs.forEach((x, i) => {
    actors.push({
      model: `goblin_${i % 3}.vox`,
      x, y: floorY(x) + 1, z: 26 + (i % 3) * 7,
      rotation: Math.PI / 2,
    })
  })

  const manifest: SceneManifest = {
    name: 'Endless Mode — Goblin Lair',
    worldVoxel: WORLD_VOX,
    heroVoxel: HERO_VOX,
    bounds: { sx: LANE_SX, sy: LANE_SY, sz: LANE_SZ },
    terrainChunks: chunks,
    models,
    placements,
    actors,
    lights,
    camera: {
      position: [14.6, 2.35, 9.6],
      target: [13.2, 1.75, 1.3],
    },
  }
  writeFileSync(join(out, 'scene.json'), JSON.stringify(manifest, null, 2))

  console.log(`\n${placements.length} placements, ${lights.length} lights, ${actors.length} actors`)
  console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB\n`)
}
