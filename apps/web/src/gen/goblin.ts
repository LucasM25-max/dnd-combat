import { VoxelVolume, hash3 } from '../voxel'
import { HERO_VOX } from './common'

/**
 * Goblin Minion — Small Fey (Goblinoid), AC 12, 7 HP, three daggers.
 *
 * Built at the same 2 cm voxel scale as Garrick, so the size difference is
 * honest: ~1.15 m tall against his 1.86 m. Hunched, long-armed, big-eared,
 * with a dagger in hand and two more on the belt.
 */

const SX = 56
const SY = 68
const SZ = 46
const CX = 28
const CZ = 23

export function buildGoblin(variant = 0): VoxelVolume {
  const v = new VoxelVolume(SX, SY, SZ, HERO_VOX)

  const skinHues = [0x6f8a46, 0x62803e, 0x7b9150]
  const base = skinHues[variant % skinHues.length]

  const C = {
    skin: v.color(base),
    skinDark: v.color(shade(base, 0.78)),
    skinLight: v.color(shade(base, 1.18)),
    eye: v.color(0xe8c24a),
    pupil: v.color(0x2a1d10),
    tooth: v.color(0xd8d2bd),
    mouth: v.color(0x4a2a28),
    leather: v.color(0x5a4028),
    leatherDark: v.color(0x3f2c1c),
    rag: v.color(0x6b5a3e),
    ragDark: v.color(0x4e4130),
    strap: v.color(0x53402a),
    steel: v.color(0x9aa0a6),
    steelDark: v.color(0x6c7278),
    hilt: v.color(0x3b2a1a),
    nail: v.color(0xc2bba0),
    hair: v.color(0x2d2a24),
  }

  const limb = (
    cx: number, cz: number, y0: number, y1: number,
    rx0: number, rz0: number, rx1: number, rz1: number,
    c: number, leanX = 0, leanZ = 0,
  ) => {
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0)
      const rx = rx0 + (rx1 - rx0) * t
      const rz = rz0 + (rz1 - rz0) * t
      const ox = leanX * (y - y0)
      const oz = leanZ * (y - y0)
      for (let dz = -Math.ceil(rz); dz <= Math.ceil(rz); dz++)
        for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
          if ((dx * dx) / (rx * rx) + (dz * dz) / (rz * rz) > 1) continue
          v.set(Math.round(cx + dx + ox), y, Math.round(cz + dz + oz), c)
        }
    }
  }

  // ---- legs: short, bowed, splayed feet -----------------------------------
  for (const s of [-1, 1]) {
    const lx = CX + s * 5
    limb(lx + s, CZ - 1, 0, 3, 4.2, 5.6, 3.8, 5.0, C.skinDark)   // foot
    v.set(lx + s * 3, 0, CZ - 5, C.nail)                          // claws
    v.set(lx + s, 0, CZ - 6, C.nail)
    limb(lx, CZ, 3, 12, 3.2, 3.4, 3.6, 3.8, C.skin, s * 0.12)     // shin
    limb(lx + s, CZ, 12, 20, 3.8, 4.0, 4.2, 4.2, C.skin, -s * 0.06) // thigh
  }

  // ---- hips, ragged loincloth ---------------------------------------------
  limb(CX, CZ, 18, 24, 7.0, 5.4, 7.2, 5.6, C.skin)
  for (let y = 15; y <= 24; y++) {
    for (let dx = -7; dx <= 7; dx++) {
      if (y < 19 && hash3(dx, y, variant) > 0.55) continue // torn hem
      const c = hash3(dx, y, 3) > 0.7 ? C.ragDark : C.rag
      v.set(CX + dx, y, CZ - 6, c)
      v.set(CX + dx, y, CZ + 6, c)
    }
  }

  // ---- torso: hunched forward ---------------------------------------------
  limb(CX, CZ, 24, 32, 7.0, 5.2, 7.4, 5.0, C.skin, 0, -0.14)
  limb(CX, CZ - 1, 32, 39, 7.4, 5.0, 6.8, 4.6, C.skin, 0, -0.16)
  // Ribs catching the light.
  for (let dx = -5; dx <= 5; dx++)
    for (let y = 27; y <= 33; y += 2)
      if (hash3(dx, y, 1) > 0.4) v.set(CX + dx, y, CZ - 6, C.skinLight)

  // Leather scraps over one shoulder.
  for (let y = 30; y <= 40; y++) {
    const w = 5 - Math.abs(y - 35) * 0.2
    for (let dx = -w; dx <= w; dx++) {
      const x = Math.round(CX + dx - 2)
      const c = hash3(x, y, 2) > 0.72 ? C.leatherDark : C.leather
      v.set(x, y, CZ - 6, c)
      v.set(x, y, CZ + 5, c)
    }
  }
  // Belt with two spare daggers.
  for (let dx = -7; dx <= 7; dx++) v.set(CX + dx, 25, CZ - 6, C.strap)
  for (let dx = -7; dx <= 7; dx++) v.set(CX + dx, 25, CZ + 6, C.strap)
  for (const s of [-1, 1]) {
    const bx = CX + s * 6
    for (let y = 18; y <= 24; y++) v.set(bx, y, CZ + 6 * s * 0 + 6, C.hilt)
    v.set(bx, 17, CZ + 6, C.steelDark)
  }

  // ---- arms: long, thin, knuckles near the knees --------------------------
  // Right arm (lane-forward) holds the dagger, raised a little.
  limb(CX + 9, CZ - 2, 30, 38, 2.8, 3.0, 3.2, 3.4, C.skin, 0.1, -0.1)  // upper
  limb(CX + 12, CZ - 4, 22, 30, 2.4, 2.6, 2.8, 3.0, C.skin, 0.1, 0)    // fore
  limb(CX + 13, CZ - 4, 19, 22, 2.6, 2.6, 2.2, 2.2, C.skinDark)        // hand
  // Left arm hangs.
  limb(CX - 9, CZ, 30, 38, 2.8, 3.0, 3.2, 3.4, C.skin, -0.08, 0)
  limb(CX - 11, CZ + 1, 21, 30, 2.4, 2.6, 2.8, 3.0, C.skin, -0.05, 0)
  limb(CX - 12, CZ + 1, 18, 21, 2.6, 2.6, 2.2, 2.2, C.skinDark)
  for (let i = 0; i < 3; i++) v.set(CX - 13 - i * 0.4, 17, CZ + 1 + (i - 1) * 2, C.nail)

  // ---- the dagger ----------------------------------------------------------
  {
    const hx = CX + 13
    const hz = CZ - 4
    for (let y = 17; y <= 22; y++) v.set(hx, y, hz, C.hilt)      // grip
    v.box(hx - 2, 23, hz - 1, hx + 2, 23, hz + 1, C.steelDark)   // guard
    for (let i = 0; i < 13; i++) {                                // blade
      const w = i < 10 ? 1 : 0
      for (let dx = -w; dx <= w; dx++)
        v.set(hx + dx, 24 + i, hz, i > 9 ? C.steelDark : C.steel)
    }
  }

  // ---- head: oversized, snouted, enormous ears ----------------------------
  limb(CX, CZ - 1, 39, 42, 3.4, 3.4, 4.2, 4.2, C.skinDark)        // neck
  limb(CX, CZ - 2, 42, 52, 7.2, 7.0, 8.0, 7.6, C.skin)            // skull
  limb(CX, CZ - 2, 52, 57, 7.6, 7.2, 5.0, 4.8, C.skin)            // crown
  // Brow ridge and snout.
  limb(CX, CZ - 8, 47, 50, 5.4, 2.6, 4.6, 2.2, C.skin)
  v.box(CX - 2, 45, CZ - 10, CX + 2, 47, CZ - 9, C.skinDark)      // nose
  for (let dx = -4; dx <= 4; dx++) v.set(CX + dx, 50, CZ - 9, C.skinLight) // brow

  // Eyes, deep set and yellow.
  for (const s of [-1, 1]) {
    v.box(CX + s * 3 - 1, 48, CZ - 9, CX + s * 3 + 1, 49, CZ - 9, C.eye)
    v.set(CX + s * 3, 48, CZ - 10, C.pupil)
  }
  // Mouth and tusks.
  for (let dx = -3; dx <= 3; dx++) v.set(CX + dx, 44, CZ - 9, C.mouth)
  v.set(CX - 2, 45, CZ - 9, C.tooth)
  v.set(CX + 2, 45, CZ - 9, C.tooth)
  v.set(CX - 3, 43, CZ - 9, C.tooth)

  // Ears: big, swept back, slightly different each variant.
  for (const s of [-1, 1]) {
    const tilt = 0.5 + hash3(variant, s, 1) * 0.5
    for (let i = 0; i < 12; i++) {
      const ex = CX + s * (7 + i * 0.85)
      const ey = 50 + i * tilt
      const ez = CZ - 2 + i * 0.45
      const r = Math.max(1, 3.2 - i * 0.22)
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
        for (let dz = -1; dz <= 1; dz++) {
          if (Math.abs(dy) > r) continue
          v.set(ex, ey + dy, ez + dz, Math.abs(dy) > r - 1 ? C.skinDark : C.skin)
        }
    }
  }

  // A few lank hairs.
  for (let i = 0; i < 9; i++) {
    const a = hash3(i, variant, 5) * Math.PI * 2
    v.set(CX + Math.cos(a) * 4, 57 + hash3(i, 2, 2) * 2, CZ - 2 + Math.sin(a) * 4, C.hair)
  }

  return v
}

function shade(hex: number, f: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f))
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f))
  const b = Math.min(255, Math.round((hex & 255) * f))
  return (r << 16) | (g << 8) | b
}
