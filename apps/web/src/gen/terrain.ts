import { VoxelVolume, fbm, hash3 } from '../voxel'
import {
  Placement, SX, SY, SZ, WATER_LEVEL, WORLD_VOX, riverBankZ, tribW, tribX,
} from './common'

/**
 * Ground only: the heightfield, the carved river and tributary, the scum
 * crust along the waterline. Trees, fungus, deadwood, rocks and reeds are
 * separate .vox models placed on top as instances.
 */
export function buildTerrain(): { volume: VoxelVolume; heights: Int16Array } {
  const v = new VoxelVolume(SX, SY, SZ, WORLD_VOX)

  const C = {
    grassA: v.color(0x5c7a3a),
    grassB: v.color(0x6b8a42),
    grassC: v.color(0x7d9a4c),
    grassDry: v.color(0x8e9a52),
    dirt: v.color(0x5a4632),
    dirtDark: v.color(0x47372a),
    mud: v.color(0x4b4034),
    road: v.color(0x7a6a52),
    sand: v.color(0x8b7d5e),
    rockDark: v.color(0x55524c),
    scumCrust: v.color(0x9aa38f),
    fungusB: v.color(0xa89bb5),
    sickGrass: v.color(0x74795a),
    riverBed: v.color(0x3f3a30),
  }

  const heights = new Int16Array(SX * SZ)
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      let h = 38 + fbm(x * 0.012, z * 0.012, 4) * 16
      h += (1 - z / SZ) * 5
      h += (x / SX) * 3

      const bank = riverBankZ(x)
      if (z > bank) {
        const t = Math.min(1, (z - bank) / 12)
        h = h * (1 - t) + (25 + fbm(x * 0.05, 9, 2) * 2.5) * t
      }

      const cx = tribX(z)
      const w = tribW(z)
      const d = Math.abs(x - cx)
      if (d < w + 14) {
        // The stream bed falls gently northward and merges into the river bed.
        const mergeT = Math.min(1, Math.max(0, (z - (bank - 10)) / 22))
        const floor = (30 - (z / SZ) * 2 + fbm(z * 0.08, 3, 2) * 2) * (1 - mergeT) + 25 * mergeT
        const t = Math.max(0, 1 - Math.max(0, d - w) / 14)
        const cut = d < w ? 1 : t * 0.85
        h = Math.min(h, h * (1 - cut) + floor * cut)
      }
      heights[z * SX + x] = Math.round(h)
    }
  }

  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const h = heights[z * SX + x]
      const nearTrib = Math.abs(x - tribX(z)) < tribW(z) + 20
      const bank = riverBankZ(x)
      const underwater = h <= WATER_LEVEL + 1

      for (let y = 0; y <= h; y++) {
        let c: number
        if (y < h - 6) c = hash3(x, y, z) > 0.75 ? C.rockDark : C.dirtDark
        else if (y < h - 1) c = C.dirt
        else if (underwater) c = z > bank ? C.riverBed : C.mud
        else if (y < WATER_LEVEL + 3) c = C.sand
        else if (nearTrib && hash3(x, 7, z) > 0.45) c = C.sickGrass
        else if (x < 34 && z > 60 && z < 200) c = C.road
        else {
          const g = fbm(x * 0.05, z * 0.05, 3)
          c = g > 0.62 ? C.grassC : g > 0.48 ? C.grassB : g > 0.34 ? C.grassA : C.grassDry
        }
        v.set(x, y, z, c)
      }
    }
  }

  // Scum crust hugging the tributary waterline.
  const groundAt = (x: number, z: number) => {
    x = Math.max(0, Math.min(SX - 1, Math.round(x)))
    z = Math.max(0, Math.min(SZ - 1, Math.round(z)))
    return heights[z * SX + x]
  }
  for (let z = 0; z < SZ; z++) {
    const cx = tribX(z), w = tribW(z)
    for (let side = -1; side <= 1; side += 2) {
      for (let o = 0; o < 7; o++) {
        const x = Math.round(cx + side * (w + o))
        const h = groundAt(x, z)
        if (h > WATER_LEVEL + 5) continue
        if (hash3(x, z, 3) > 0.42) v.set(x, h + 1, z, hash3(x, z, 9) > 0.5 ? C.scumCrust : C.fungusB)
      }
    }
  }

  return { volume: v, heights }
}

/** Where every instanced prop goes. Deterministic, so edits are stable. */
export function buildPlacements(heights: Int16Array): {
  placements: Placement[]
  hero: { x: number; y: number; z: number }
} {
  const groundAt = (x: number, z: number) => {
    x = Math.max(0, Math.min(SX - 1, Math.round(x)))
    z = Math.max(0, Math.min(SZ - 1, Math.round(z)))
    return heights[z * SX + x]
  }

  const out: Placement[] = []
  const heroX = 170, heroZ = 232

  // --- trees ---------------------------------------------------------------
  for (let i = 0; i < 74; i++) {
    const x = Math.floor(hash3(i, 31, 7) * SX)
    const z = Math.floor(hash3(i, 17, 23) * (SZ - 70))
    if (Math.abs(x - tribX(z)) < tribW(z) + 14) continue
    if (x < 44 && z > 50 && z < 210) continue
    if (z > riverBankZ(x) - 14) continue
    if (Math.hypot(x - heroX, z - heroZ) < 40) continue
    const g = groundAt(x, z)
    if (g < WATER_LEVEL + 3) continue
    const sick = Math.abs(x - tribX(z)) < 70 && hash3(i, 3, 3) > 0.6
    const variant = Math.floor(hash3(i, 9, 2) * 4)
    out.push({
      model: sick ? `birch_sick_${variant % 2}` : `birch_${variant}`,
      x, y: g, z,
      rot: Math.floor(hash3(i, 11, 5) * 4),
    })
  }

  // --- fungal shelves along the tributary ----------------------------------
  for (let i = 0; i < 44; i++) {
    const z = 12 + Math.floor(hash3(i, 1, 2) * (SZ - 60))
    const side = hash3(i, 5, 1) > 0.5 ? 1 : -1
    const x = Math.round(tribX(z) + side * (tribW(z) + 2 + hash3(i, 3, 7) * 7))
    const g = groundAt(x, z)
    if (g > WATER_LEVEL + 7) continue
    out.push({
      model: `shelf_${Math.floor(hash3(i, 2, 8) * 3)}`,
      x, y: g, z,
      rot: Math.floor(hash3(i, 7, 1) * 4),
    })
  }

  // --- deadwood -------------------------------------------------------------
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(hash3(i, 61, 3) * SX)
    const z = Math.floor(hash3(i, 13, 71) * SZ)
    const g = groundAt(x, z)
    if (g < WATER_LEVEL + 2) continue
    if (z > riverBankZ(x) - 4) continue
    out.push({
      model: `deadwood_${Math.floor(hash3(i, 4, 4) * 3)}`,
      x, y: g, z,
      rot: Math.floor(hash3(i, 9, 9) * 4),
    })
  }

  // --- rocks ----------------------------------------------------------------
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(hash3(i, 83, 5) * SX)
    const z = Math.floor(hash3(i, 29, 41) * SZ)
    const g = groundAt(x, z)
    out.push({
      model: `rock_${Math.floor(hash3(i, 1, 6) * 3)}`,
      x, y: Math.max(g - 1, WATER_LEVEL - 3), z,
      rot: Math.floor(hash3(i, 3, 2) * 4),
    })
  }

  // --- reeds in the river shallows -----------------------------------------
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(hash3(i, 97, 11) * SX)
    const bank = riverBankZ(x)
    const z = Math.round(bank + hash3(i, 3, 19) * 12 - 3)
    const g = groundAt(x, z)
    if (g > WATER_LEVEL + 2 || g < WATER_LEVEL - 7) continue
    out.push({
      model: `reeds_${Math.floor(hash3(i, 5, 5) * 3)}`,
      x, y: g, z,
      rot: Math.floor(hash3(i, 2, 7) * 4),
    })
  }

  // --- the fallen birch crossing -------------------------------------------
  // Placements are centred on the model, so this is the middle of the span:
  // the log straddles the channel with both ends resting on the banks.
  {
    const z = 128
    const cx = Math.round(tribX(z))
    const half = 38 // half the log's length, in world voxels
    const bankL = groundAt(cx - half + 4, z)
    const bankR = groundAt(cx + half - 4, z)
    // Sit the trunk just above the higher bank so it clearly bridges the water.
    const y = Math.max(bankL, bankR) - 4
    out.push({ model: 'fallen_birch', x: cx, y, z, rot: 0 })
  }

  return { placements: out, hero: { x: heroX, y: groundAt(heroX, heroZ) + 1, z: heroZ } }
}
