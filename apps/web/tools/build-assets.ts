import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { VoxelVolume } from '../src/voxel'
import { encodeVox } from '../src/vox-format'
import { buildTerrain, buildPlacements } from '../src/gen/terrain'
import { birch, deadwood, fallenBirch, fungalShelf, reeds, rock } from '../src/gen/props'
import { buildGarrick, GARRICK_CENTRE } from '../src/gen/garrick'
import { HERO_VOX, SX, SY, SZ, SceneManifest, WATER_LEVEL, WORLD_VOX } from '../src/gen/common'

/**
 * Generates the MagicaVoxel source assets for The First Fork.
 *
 *   npm run assets
 *
 * Output lands in public/assets as real .vox files. Open any of them in
 * MagicaVoxel, edit, save in place, reload the page — the change is live.
 * Re-running this script OVERWRITES them, so edit the generator or the .vox,
 * not both.
 */

const OUT = join(import.meta.dirname, '..', 'public', 'assets')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

let totalBytes = 0
function write(name: string, v: VoxelVolume, hollow = true) {
  const vol = hollow ? v.hollow() : v
  const bytes = encodeVox(vol.toVox())
  writeFileSync(join(OUT, name), bytes)
  totalBytes += bytes.length
  console.log(
    `  ${name.padEnd(26)} ${String(vol.sx).padStart(3)}x${String(vol.sy).padStart(3)}x${String(vol.sz).padStart(3)}` +
    `  ${String(vol.countSolid()).padStart(8)} voxels  ${(bytes.length / 1024).toFixed(0).padStart(5)} KB`,
  )
}

console.log('\nprops')
const models: Record<string, string> = {}
const prop = (name: string, v: VoxelVolume) => {
  const { volume } = v.cropped()
  write(`${name}.vox`, volume)
  models[name] = `${name}.vox`
}

for (let i = 0; i < 4; i++) prop(`birch_${i}`, birch(i * 7 + 1, false))
for (let i = 0; i < 2; i++) prop(`birch_sick_${i}`, birch(i * 13 + 5, true))
for (let i = 0; i < 3; i++) prop(`shelf_${i}`, fungalShelf(i * 3 + 2))
for (let i = 0; i < 3; i++) prop(`deadwood_${i}`, deadwood(i * 5 + 1))
for (let i = 0; i < 3; i++) prop(`rock_${i}`, rock(i * 11 + 3))
for (let i = 0; i < 3; i++) prop(`reeds_${i}`, reeds(i * 9 + 4))
prop('fallen_birch', fallenBirch())

console.log('\nhero')
const garrick = buildGarrick()
write('garrick.vox', garrick, false)

console.log('\nterrain chunks')
const { volume: terrain, heights } = buildTerrain()

// MagicaVoxel caps a model at 256 on each axis, so the ground ships as a grid
// of chunks. 230 x 130 x 180 keeps every axis under the limit.
const CW = 230, CD = 180
const terrainChunks: SceneManifest['terrainChunks'] = []
for (let cz = 0; cz < SZ; cz += CD) {
  for (let cx = 0; cx < SX; cx += CW) {
    const w = Math.min(CW, SX - cx)
    const d = Math.min(CD, SZ - cz)
    const chunk = new VoxelVolume(w, SY, d, WORLD_VOX)
    // Share the terrain palette so every chunk indexes identically.
    ;(chunk as any).palette = terrain.getPalette().slice()
    for (let y = 0; y < SY; y++)
      for (let z = 0; z < d; z++)
        for (let x = 0; x < w; x++) {
          const val = terrain.get(cx + x, y, cz + z)
          if (val) (chunk as any).data[(y * d + z) * w + x] = val
        }
    const file = `terrain_${cx}_${cz}.vox`
    write(file, chunk)
    terrainChunks.push({ file, x: cx, y: 0, z: cz })
  }
}

const { placements, hero } = buildPlacements(heights)

// Terrain heightfield, written for the water shader: it needs to know the
// depth of the water at every point to shade absorption, foam and flow.
const heightBytes = new Uint8Array(heights.buffer.slice(0))
writeFileSync(join(OUT, 'heights.bin'), heightBytes)
console.log(`  ${'heights.bin'.padEnd(26)} ${SX}x${SZ} Int16   ${(heightBytes.length / 1024).toFixed(0).padStart(5)} KB`)

const manifest: SceneManifest = {
  name: 'The First Fork',
  worldVoxel: WORLD_VOX,
  heroVoxel: HERO_VOX,
  waterLevel: WATER_LEVEL,
  bounds: { sx: SX, sy: SY, sz: SZ },
  terrainChunks,
  heightfield: { file: 'heights.bin', sx: SX, sz: SZ },
  models,
  placements,
  hero: {
    model: 'garrick.vox',
    x: hero.x, y: hero.y, z: hero.z,
    rotation: -0.65,
  },
}
writeFileSync(join(OUT, 'scene.json'), JSON.stringify(manifest, null, 2))

console.log(`\n${placements.length} placements, ${terrainChunks.length} terrain chunks`)
console.log(`total ${(totalBytes / 1024 / 1024).toFixed(2)} MB written to public/assets\n`)
