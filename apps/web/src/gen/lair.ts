import { VoxelVolume, fbm, hash3, noise2 } from '../voxel'
import { WORLD_VOX } from './common'

/**
 * ENDLESS MODE — the goblin lair, as a cut-away cross-section.
 *
 * The lane runs left to right along X. The camera looks at the cut face, so
 * you see the tunnel the party is fighting in AND the rock strata above and
 * below it — topsoil, clay, limestone, basalt. Depth in the dungeon is
 * conveyed by where you are in the earth, not by a wave counter.
 */

export const LANE_SX = 700  // 28 m of lane
export const LANE_SY = 190  // 7.6 m from bedrock to grass
export const LANE_SZ = 90   // 3.6 m deep; the cut face is at z = 0

/** Cave floor height at a point along the lane, in voxels. */
export function floorY(x: number): number {
  return Math.round(30 + noise2(x * 0.014, 3.2) * 7 + fbm(x * 0.05, 9.1, 2) * 4)
}

/** Cave ceiling height at a point along the lane, in voxels. */
export function ceilY(x: number): number {
  return Math.round(108 + noise2(x * 0.011, 17.4) * 16 + fbm(x * 0.04, 2.2, 2) * 8)
}

/** How far back the cave is hollowed out, before the back wall. */
function backWall(x: number, y: number): number {
  return Math.round(64 + noise2(x * 0.02, y * 0.03) * 14)
}

export function buildLair(): VoxelVolume {
  const v = new VoxelVolume(LANE_SX, LANE_SY, LANE_SZ, WORLD_VOX)

  const C = {
    grass: v.color(0x5f7c3c),
    grassDry: v.color(0x7d8a48),
    topsoil: v.color(0x4a3a28),
    topsoilDark: v.color(0x3a2d1f),
    clay: v.color(0x8a6244),
    clayDark: v.color(0x74503690),
    limestone: v.color(0x9a927f),
    limestoneDark: v.color(0x7e7667),
    limeVein: v.color(0xb3ab94),
    basalt: v.color(0x4a4a4e),
    basaltDark: v.color(0x3a3a3f),
    basaltCrack: v.color(0x2c2c31),
    caveWall: v.color(0x5e564c),
    caveWallDark: v.color(0x4a443c),
    caveWallLight: v.color(0x6e6558),
    soot: v.color(0x2a2724),
    floorDirt: v.color(0x463828),
    floorDirtDark: v.color(0x372c20),
    rubble: v.color(0x58514a),
    ochre: v.color(0x9c5a2e),
    root: v.color(0x5a452c),
  }

  // ---- strata ------------------------------------------------------------
  for (let z = 0; z < LANE_SZ; z++) {
    for (let x = 0; x < LANE_SX; x++) {
      // Surface relief at the very top of the cut.
      const surface = LANE_SY - 8 + Math.round(noise2(x * 0.02, z * 0.03) * 5)
      const soilBase = surface - 10 - Math.round(noise2(x * 0.03, 5.5) * 5)
      const clayBase = soilBase - 22 - Math.round(noise2(x * 0.018, 11.2) * 9)
      const limeBase = clayBase - 34 - Math.round(noise2(x * 0.012, 23.7) * 12)

      for (let y = 0; y <= surface; y++) {
        const n = hash3(x * 1.3, y * 2.1, z * 0.7)
        let c: number
        if (y > soilBase) {
          c = y >= surface - 1 ? (n > 0.6 ? C.grassDry : C.grass)
            : (n > 0.7 ? C.topsoilDark : C.topsoil)
        } else if (y > clayBase) {
          c = n > 0.72 ? C.clayDark : C.clay
        } else if (y > limeBase) {
          // Bedding planes make the limestone read as layered rock.
          const bedding = Math.sin(y * 0.55 + noise2(x * 0.02, 1.1) * 3) > 0.72
          c = bedding ? C.limeVein : (n > 0.68 ? C.limestoneDark : C.limestone)
        } else {
          c = n > 0.88 ? C.basaltCrack : n > 0.6 ? C.basaltDark : C.basalt
        }
        v.set(x, y, z, c)
      }
    }
  }

  // ---- hollow out the cave ------------------------------------------------
  for (let x = 0; x < LANE_SX; x++) {
    const f = floorY(x)
    const c = ceilY(x)
    for (let y = f; y <= c; y++) {
      // Rounded profile: the tunnel pinches at floor and ceiling.
      const t = (y - f) / Math.max(1, c - f)
      const pinch = Math.sin(t * Math.PI)
      const back = Math.round(backWall(x, y) * (0.45 + 0.55 * pinch))
      for (let z = 0; z < back; z++) v.set(x, y, z, 0)
    }
  }

  // ---- dress the cave surfaces -------------------------------------------
  for (let x = 0; x < LANE_SX; x++) {
    for (let y = 0; y < LANE_SY; y++) {
      for (let z = 0; z < LANE_SZ; z++) {
        if (!v.solid(x, y, z)) continue
        const open =
          !v.solid(x, y, z - 1) || !v.solid(x, y + 1, z) ||
          !v.solid(x, y - 1, z) || !v.solid(x + 1, y, z) || !v.solid(x - 1, y, z)
        if (!open) continue
        const f = floorY(x)
        const n = hash3(x * 2.3, y * 1.7, z * 3.1)
        if (y < f + 2 && y > f - 4) {
          v.set(x, y, z, n > 0.78 ? C.rubble : n > 0.4 ? C.floorDirt : C.floorDirtDark)
        } else if (y > ceilY(x) - 6) {
          // Soot on the ceiling above where the fires burn.
          v.set(x, y, z, n > 0.55 ? C.soot : C.caveWallDark)
        } else {
          v.set(x, y, z, n > 0.8 ? C.caveWallLight : n > 0.35 ? C.caveWall : C.caveWallDark)
        }
      }
    }
  }

  // ---- goblin handprints daubed on the back wall --------------------------
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(hash3(i, 3, 7) * LANE_SX)
    const y = floorY(x) + 12 + Math.floor(hash3(i, 5, 1) * 34)
    for (let z = 0; z < LANE_SZ; z++) {
      if (!v.solid(x, y, z)) continue
      // Found the wall: daub a crude five-finger print on it.
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) === 2 && dy < 1) continue
          if (hash3(x + dx, y + dy, 2) > 0.78) continue
          v.set(x + dx, y + dy, z, C.ochre)
        }
      break
    }
  }

  // ---- roots dangling through the soil layer ------------------------------
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(hash3(i, 11, 5) * LANE_SX)
    const top = ceilY(x)
    const len = 4 + Math.floor(hash3(i, 2, 9) * 14)
    for (let j = 0; j < len; j++) {
      const z = Math.floor(hash3(i, j, 3) * 10)
      v.set(x + Math.round(Math.sin(j * 0.4) * 1.5), top + 2 - j, z, C.root)
    }
  }

  return v
}

/* ------------------------------------------------------------------ props */

export function stalagmite(seed: number, up: boolean): VoxelVolume {
  const h = 10 + Math.floor(hash3(seed, 1, 1) * 22)
  const v = new VoxelVolume(16, h + 2, 16, WORLD_VOX)
  const a = v.color(0x6e6558)
  const b = v.color(0x564f45)
  const tip = v.color(0x8a8070)
  for (let i = 0; i <= h; i++) {
    const t = up ? i / h : 1 - i / h
    const r = Math.max(0.6, 4.6 * (1 - t) * (1 - t * 0.3))
    for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++)
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dz * dz > r * r) continue
        const c = t > 0.85 ? tip : hash3(dx, i, dz + seed) > 0.6 ? a : b
        v.set(8 + dx, i, 8 + dz, c)
      }
  }
  return v
}

export function campfire(): VoxelVolume {
  const v = new VoxelVolume(34, 20, 34, WORLD_VOX)
  const stone = v.color(0x6b645a)
  const stoneDark = v.color(0x524c44)
  const charcoal = v.color(0x241f1b)
  const ember = v.color(0xd1521f)
  const emberHot = v.color(0xf0a63c)
  const log = v.color(0x4e3a25)
  const logDark = v.color(0x38291a)

  // Ring of stones.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2
    const sx = 17 + Math.cos(a) * 12
    const sz = 17 + Math.sin(a) * 12
    const r = 2.2 + hash3(i, 1, 2) * 1.6
    v.ellipsoid(sx, 2, sz, r, r * 0.9, r, hash3(i, 3, 3) > 0.5 ? stone : stoneDark, 0.4)
  }
  // Ash bed and embers.
  for (let dz = -9; dz <= 9; dz++)
    for (let dx = -9; dx <= 9; dx++) {
      if (dx * dx + dz * dz > 81) continue
      const n = hash3(dx, 1, dz)
      v.set(17 + dx, 1, 17 + dz, n > 0.9 ? emberHot : n > 0.72 ? ember : charcoal)
    }
  // Teepee of logs.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4
    for (let j = 0; j < 12; j++) {
      const t = j / 12
      v.ellipsoid(
        17 + Math.cos(a) * (8 - t * 6), 2 + j * 1.1, 17 + Math.sin(a) * (8 - t * 6),
        1.6, 1.4, 1.6, j > 8 ? logDark : log, 0.3,
      )
    }
  }
  return v
}

export function bonePile(seed: number): VoxelVolume {
  const v = new VoxelVolume(26, 12, 22, WORLD_VOX)
  const bone = v.color(0xc8c2a8)
  const boneDark = v.color(0xa49d84)
  const skull = v.color(0xd6d0b6)
  for (let i = 0; i < 16; i++) {
    const a = hash3(seed, i, 1) * Math.PI * 2
    const x = 13 + Math.cos(a) * (2 + hash3(seed, i, 2) * 7)
    const z = 11 + Math.sin(a) * (2 + hash3(seed, i, 3) * 6)
    const y = 1 + Math.floor(hash3(seed, i, 4) * 4)
    const len = 3 + Math.floor(hash3(seed, i, 5) * 7)
    const dir = hash3(seed, i, 6) > 0.5
    for (let j = 0; j < len; j++) {
      v.set(dir ? x + j : x, y, dir ? z : z + j, hash3(i, j, seed) > 0.5 ? bone : boneDark)
    }
  }
  // A skull on top, because goblins.
  v.ellipsoid(13, 6, 11, 3.4, 3.2, 3.4, skull, 0.3)
  v.set(12, 6, 8, v.color(0x1d1a16))
  v.set(15, 6, 8, v.color(0x1d1a16))
  return v
}

export function totem(seed: number): VoxelVolume {
  const v = new VoxelVolume(16, 46, 16, WORLD_VOX)
  const pole = v.color(0x4a3824)
  const poleDark = v.color(0x352819)
  const skull = v.color(0xcfc9ae)
  const rag = v.color(0x7a3030)
  const rope = v.color(0x6e5c3a)

  for (let y = 0; y < 34; y++) {
    const r = 1.6
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dz * dz > r * r) continue
        v.set(8 + dx, y, 8 + dz, hash3(dx, y, dz) > 0.65 ? poleDark : pole)
      }
  }
  v.ellipsoid(8, 37, 8, 4.0, 3.8, 4.0, skull, 0.25)
  v.set(6, 38, 4, v.color(0x15120e))
  v.set(10, 38, 4, v.color(0x15120e))
  for (let dx = -3; dx <= 3; dx++) v.set(8 + dx, 33, 8, rope)
  // Rags knotted below the skull.
  for (let y = 24; y < 32; y++)
    for (let dx = -4; dx <= 4; dx++)
      if (hash3(dx, y, seed) > 0.45) v.set(8 + dx, y, 6, rag)
  return v
}

export function crate(seed: number): VoxelVolume {
  const v = new VoxelVolume(22, 20, 20, WORLD_VOX)
  const wood = v.color(0x5c4429)
  const woodDark = v.color(0x42301d)
  const nail = v.color(0x7d7a72)
  const w = 9 + Math.floor(hash3(seed, 1, 1) * 3)
  const h = 9 + Math.floor(hash3(seed, 2, 2) * 6)
  for (let y = 0; y <= h; y++)
    for (let z = 0; z <= w; z++)
      for (let x = 0; x <= w; x++) {
        const shell = x === 0 || z === 0 || x === w || z === w || y === 0 || y === h
        if (!shell) continue
        if (hash3(x, y, z + seed) > 0.95) continue // broken slats
        const plank = (y % 3 === 0) || (x % 4 === 0)
        v.set(2 + x, y, 2 + z, plank ? woodDark : wood)
      }
  v.set(2, h, 2, nail); v.set(2 + w, h, 2 + w, nail)
  return v
}

export function mushrooms(seed: number): VoxelVolume {
  const v = new VoxelVolume(22, 20, 22, WORLD_VOX)
  const stalk = v.color(0xb9bfa8)
  const capA = v.color(0x4fd8c8)  // faintly luminous
  const capB = v.color(0x3aa89c)
  const n = 3 + Math.floor(hash3(seed, 1, 4) * 4)
  for (let i = 0; i < n; i++) {
    const x = 5 + Math.floor(hash3(seed, i, 2) * 12)
    const z = 5 + Math.floor(hash3(seed, i, 3) * 12)
    const h = 4 + Math.floor(hash3(seed, i, 5) * 8)
    for (let y = 0; y < h; y++) v.set(x, y, z, stalk)
    const r = 2 + hash3(seed, i, 6) * 2.4
    for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++)
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dz * dz > r * r) continue
        v.set(x + dx, h, z + dz, hash3(dx, i, dz) > 0.5 ? capA : capB)
        if (dx * dx + dz * dz < (r - 1) * (r - 1)) v.set(x + dx, h + 1, z + dz, capA)
      }
  }
  return v
}

export function barricade(seed: number): VoxelVolume {
  const v = new VoxelVolume(14, 40, 30, WORLD_VOX)
  const wood = v.color(0x4e3a25)
  const woodDark = v.color(0x37291a)
  const tip = v.color(0x6b5a3e)
  for (let i = 0; i < 5; i++) {
    const z = 3 + i * 5
    const h = 22 + Math.floor(hash3(seed, i, 1) * 14)
    const lean = (hash3(seed, i, 2) - 0.5) * 0.22
    for (let y = 0; y < h; y++) {
      const r = y > h - 4 ? 1 : 1.8
      for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++)
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          if (dx * dx + dz * dz > r * r) continue
          v.set(7 + dx + lean * y, y, z + dz, y > h - 4 ? tip : hash3(dx, y, dz) > 0.6 ? woodDark : wood)
        }
    }
  }
  // Cross-lashing.
  for (let z = 2; z < 28; z++) v.set(7, 16, z, woodDark)
  return v
}

export function torchSconce(): VoxelVolume {
  const v = new VoxelVolume(12, 26, 12, WORLD_VOX)
  const iron = v.color(0x4a4640)
  const wood = v.color(0x4a3824)
  const rag = v.color(0x6b5336)
  const flameA = v.color(0xff9a2e)
  const flameB = v.color(0xffd36b)
  for (let y = 0; y < 8; y++) v.set(6, y, 6, iron)
  for (let y = 6; y < 18; y++) v.set(6 + (y - 6) * 0.2, y, 6, wood)
  for (let y = 16; y < 20; y++)
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        if (dx * dx + dz * dz <= 4) v.set(8 + dx, y, 6 + dz, rag)
  // A stub of flame; the real light comes from a point light.
  v.ellipsoid(8, 21, 6, 2.2, 3.4, 2.2, flameA, 0.4)
  v.ellipsoid(8, 23, 6, 1.3, 2.0, 1.3, flameB, 0.3)
  return v
}
