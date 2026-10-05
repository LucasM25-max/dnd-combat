import { VoxelVolume, hash3 } from '../voxel'
import { WORLD_VOX } from './common'

/**
 * The kit of parts for The First Fork.
 *
 * Each of these builds ONE standalone model that gets written to its own .vox
 * file. Scenes are assembled by placing instances of them, so a change to
 * birch_a.vox in MagicaVoxel updates every birch in the wood.
 */

export type PropBuilder = () => VoxelVolume

function vol(w: number, h: number, d: number) {
  return new VoxelVolume(w, h, d, WORLD_VOX)
}

// ----------------------------------------------------------------- birch
export function birch(seed: number, sick: boolean): VoxelVolume {
  const W = 150, H = 200, D = 150
  const v = vol(W, H, D)
  const cx = W / 2, cz = D / 2

  const bark = v.color(0xd9d6cc)
  const bark2 = v.color(0xc6c3b6)
  const mark = v.color(0x3a3a38)
  const fungus = v.color(0xbfb4c9)
  const leafA = v.color(sick ? 0x5d7a30 : 0x7e9c3c)
  const leafB = v.color(sick ? 0x6a7340 : 0x94ad46)
  const leafC = v.color(sick ? 0x74795a : 0xb3bd55)
  const leafGold = v.color(sick ? 0x8a8456 : 0xc9b254)

  const height = 54 + Math.floor(hash3(seed, 5, 9) * 44)
  const lean = (hash3(seed, 3, 1) - 0.5) * 0.1
  const r0 = 2.2 + hash3(seed, 13, 2) * 1.8

  // Trunk.
  for (let y = 0; y <= height; y++) {
    const t = y / height
    const rr = Math.max(1, r0 * (1 - t * 0.42))
    const ox = Math.round(lean * y)
    for (let dz = -Math.ceil(rr); dz <= Math.ceil(rr); dz++) {
      for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) {
        if (dx * dx + dz * dz > rr * rr) continue
        const n = hash3(dx + seed, y * 0.4, dz)
        let c = n > 0.88 ? mark : n > 0.55 ? bark : bark2
        if (sick && y < height * 0.45 && hash3(seed, y, dz) > 0.62) c = fungus
        v.set(cx + dx + ox, y, cz + dz, c)
      }
    }
  }

  // Root flare.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + hash3(seed, i, 0)
    for (let j = 0; j < 5; j++) {
      const x = cx + Math.cos(a) * (r0 + j * 0.9)
      const z = cz + Math.sin(a) * (r0 + j * 0.9)
      for (let y = 0; y <= Math.max(0, 3 - j); y++) v.set(x, y, z, bark2)
    }
  }

  // Branches.
  const branches = 3 + Math.floor(hash3(seed, 7, 3) * 3)
  for (let i = 0; i < branches; i++) {
    const a = hash3(seed, 20 + i, 1) * Math.PI * 2
    const y0 = Math.round(height * (0.55 + hash3(seed, i, 4) * 0.35))
    const len = 8 + hash3(seed, i, 6) * 16
    for (let j = 0; j < len; j++) {
      const x = cx + Math.cos(a) * j + lean * y0
      const z = cz + Math.sin(a) * j
      const y = y0 + j * 0.55
      v.set(x, y, z, hash3(x, y, z) > 0.8 ? mark : bark2)
    }
  }

  // Canopy.
  const canopy = [leafA, leafB, leafGold]
  const blobs = sick ? 2 : 3 + Math.floor(hash3(seed, 17, 8) * 2)
  for (let i = 0; i < blobs; i++) {
    const a = hash3(seed, 30 + i, 2) * Math.PI * 2
    const dist = 4 + hash3(seed, i, 11) * 13
    const bx = cx + Math.cos(a) * dist + lean * height
    const bz = cz + Math.sin(a) * dist
    const by = height - 5 + hash3(seed, i, 13) * 15
    const rad = (sick ? 7 : 10) + hash3(seed, i, 17) * 7
    v.ellipsoid(bx, by, bz, rad, rad * 0.62, rad, canopy[i % canopy.length], 0.55)
    v.ellipsoid(bx + 2, by + rad * 0.32, bz - 2, rad * 0.6, rad * 0.3, rad * 0.6, leafC, 0.6)
  }

  return v
}

// ---------------------------------------------------------- fungal shelf
export function fungalShelf(seed: number): VoxelVolume {
  const v = vol(26, 10, 26)
  const a = v.color(0xbfb4c9)
  const b = v.color(0xa89bb5)
  const c = v.color(0xd3cad9)
  const stalk = v.color(0x8e8396)
  const cx = 13, cz = 13
  const r = 5 + hash3(seed, 1, 1) * 5

  for (let i = 0; i < 3; i++) {
    const rr = r * (1 - i * 0.2)
    for (let dz = -Math.ceil(rr); dz <= Math.ceil(rr); dz++) {
      for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) {
        const d = Math.sqrt(dx * dx + dz * dz) / rr
        if (d > 1 + (hash3(dx + seed, i, dz) - 0.5) * 0.3) continue
        v.set(cx + dx, 2 + i, cz + dz, d > 0.72 ? c : d > 0.4 ? a : b)
      }
    }
  }
  // Short stalk underneath.
  for (let y = 0; y < 2; y++)
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) v.set(cx + dx, y, cz + dz, stalk)

  // A second, smaller cap.
  if (hash3(seed, 9, 9) > 0.45) {
    const ox = Math.round((hash3(seed, 2, 2) - 0.5) * 8)
    const oz = Math.round((hash3(seed, 3, 3) - 0.5) * 8)
    v.ellipsoid(cx + ox, 6, cz + oz, r * 0.45, 1.6, r * 0.45, c, 0.4)
  }
  return v
}

// -------------------------------------------------------------- deadwood
export function deadwood(seed: number): VoxelVolume {
  const len = 10 + Math.floor(hash3(seed, 4, 4) * 26)
  const v = vol(len + 6, 12, 14)
  const w = v.color(0x6a5e4e)
  const wd = v.color(0x46352a)
  const moss = v.color(0x5d7a30)

  const r = 1.4 + hash3(seed, 2, 7) * 1.6
  for (let i = 0; i < len; i++) {
    const bend = Math.sin(i * 0.2 + seed) * 1.4
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) {
        if (dy * dy + dz * dz > r * r) continue
        const n = hash3(i, dy, dz + seed)
        v.set(3 + i, 2 + dy + Math.max(0, bend * 0.2), 7 + dz + bend,
          n > 0.9 ? moss : n > 0.5 ? w : wd)
      }
    }
  }
  // Broken stubs.
  for (let i = 0; i < 3; i++) {
    const at = Math.floor(hash3(seed, i, 5) * len)
    const dir = hash3(seed, i, 6) > 0.5 ? 1 : -1
    for (let j = 0; j < 3 + hash3(seed, i, 7) * 4; j++) {
      v.set(3 + at + j * 0.3, 3 + j, 7 + dir * j, wd)
    }
  }
  return v
}

// ------------------------------------------------------------------ rock
export function rock(seed: number): VoxelVolume {
  const r = 3 + hash3(seed, 1, 3) * 6
  const s = Math.ceil(r * 2.6)
  const v = vol(s, s, s)
  const a = v.color(0x6e6a63)
  const b = v.color(0x55524c)
  const lichen = v.color(0x7d8a52)
  const c = s / 2
  v.ellipsoid(c, r * 0.8, c, r, r * 0.74, r * 0.92, a, 0.5)
  v.ellipsoid(c + r * 0.3, r * 0.5, c - r * 0.2, r * 0.6, r * 0.5, r * 0.6, b, 0.6)
  // Lichen on the sunward faces.
  for (let z = 0; z < s; z++)
    for (let x = 0; x < s; x++)
      for (let y = s - 1; y >= 0; y--)
        if (v.solid(x, y, z)) {
          if (hash3(x, y, z) > 0.72) v.set(x, y, z, lichen)
          break
        }
  return v
}

// ----------------------------------------------------------------- reeds
export function reeds(seed: number): VoxelVolume {
  const v = vol(14, 26, 14)
  const dark = v.color(0x4a6a2c)
  const mid = v.color(0x6d8a3a)
  const gold = v.color(0xc9b254)
  const n = 7 + Math.floor(hash3(seed, 2, 2) * 9)
  for (let i = 0; i < n; i++) {
    const x = 3 + Math.floor(hash3(seed, i, 1) * 8)
    const z = 3 + Math.floor(hash3(seed, i, 2) * 8)
    const h = 7 + Math.floor(hash3(seed, i, 3) * 15)
    const lean = (hash3(seed, i, 4) - 0.5) * 0.25
    for (let y = 0; y < h; y++) {
      const c = y > h - 3 ? gold : y > h * 0.5 ? mid : dark
      v.set(x + lean * y, y, z, c)
    }
  }
  return v
}

// ----------------------------------------------------- the fallen birch
export function fallenBirch(): VoxelVolume {
  const len = 76
  const v = vol(len + 18, 24, 26)
  const bark = v.color(0xd9d6cc)
  const bark2 = v.color(0xc6c3b6)
  const mark = v.color(0x3a3a38)
  const dead = v.color(0x6a5e4e)
  const moss = v.color(0x5d7a30)

  for (let i = 0; i <= len; i++) {
    const r = 3.4 - Math.abs(i - len / 2) / len * 1.1
    const sag = Math.sin((i / len) * Math.PI) * 2.2
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) {
        if (dy * dy + dz * dz > r * r) continue
        const n = hash3(i, dy, dz)
        let c = n > 0.9 ? mark : n > 0.6 ? bark : bark2
        if (dy > r - 1.6 && hash3(i, 1, dz) > 0.72) c = moss // mossy on top
        v.set(9 + i, 14 + dy - sag, 13 + dz, c)
      }
    }
  }
  // Root plate at the near end.
  v.ellipsoid(6, 14, 13, 6, 8, 8, dead, 0.8)
  for (let i = 0; i < 9; i++) {
    const a = hash3(i, 2, 2) * Math.PI * 2
    for (let j = 0; j < 5; j++)
      v.set(6 - j * 0.4, 14 + Math.sin(a) * (6 + j), 13 + Math.cos(a) * (6 + j), dead)
  }
  return v
}
