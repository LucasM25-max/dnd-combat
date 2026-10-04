import * as THREE from 'three'
import { VoxelVolume, hash3 } from './voxel'

/**
 * Garrick Vell, "the Pride of High Ery" — Fighter 1, chain mail and shield.
 *
 * Built at 2 cm voxels: ~93 voxels tall for a 1.86 m man, which is enough
 * resolution for a face, mail links, buckles and a dented shield rim.
 */

export const HERO_VOX = 0.02

const SX = 72
const SY = 100
const SZ = 48
const CX = 36 // centre line
const CZ = 24

export function buildGarrick(): { geometry: THREE.BufferGeometry; height: number } {
  const v = new VoxelVolume(SX, SY, SZ, HERO_VOX)

  const C = {
    mail: v.color(0x7c8086),
    mailDark: v.color(0x5f6268),
    mailLight: v.color(0x999ea4),
    steel: v.color(0x8e949b),
    steelDark: v.color(0x6a6f76),
    steelLight: v.color(0xb2b8bf),
    leather: v.color(0x5d4430),
    leatherDark: v.color(0x452f20),
    strap: v.color(0x6b4d33),
    tabard: v.color(0x8c3a30),
    tabardDark: v.color(0x6e2b24),
    trim: v.color(0xc9a24a),
    skin: v.color(0xc28e68),
    skinDark: v.color(0xa5724f),
    skinLight: v.color(0xd6a177),
    hair: v.color(0x4a3222),
    hairLight: v.color(0x5e4029),
    eye: v.color(0x2a2420),
    mouth: v.color(0x8d5a44),
    cloak: v.color(0x4a5440),
    cloakDark: v.color(0x3a4232),
    shieldFace: v.color(0x3f5668),
    shieldFace2: v.color(0x4c647a),
    shieldBoss: v.color(0xa8aeb5),
    shieldRim: v.color(0x8a7a52),
    hilt: v.color(0x7a6038),
    grip: v.color(0x3c2c1e),
    blade: v.color(0xaab0b8),
    scabbard: v.color(0x4e3826),
  }

  /** Solid elliptical column between two heights, optionally tapering. */
  const limb = (
    cx: number, cz: number, y0: number, y1: number,
    rx0: number, rz0: number, rx1: number, rz1: number,
    c: number, lean = 0, leanZ = 0,
  ) => {
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0)
      const rx = rx0 + (rx1 - rx0) * t
      const rz = rz0 + (rz1 - rz0) * t
      const ox = lean * (y - y0)
      const oz = leanZ * (y - y0)
      for (let dz = -Math.ceil(rz); dz <= Math.ceil(rz); dz++) {
        for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
          if ((dx * dx) / (rx * rx) + (dz * dz) / (rz * rz) > 1) continue
          v.set(Math.round(cx + dx + ox), y, Math.round(cz + dz + oz), c)
        }
      }
    }
  }

  /** Mail speckle: break up large metal areas so they read as links. */
  const speckle = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, a: number, b: number) => {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          if (!v.solid(x, y, z)) continue
          const h = hash3(x * 3.1, y * 2.7, z * 1.9)
          if (h > 0.72) v.set(x, y, z, a)
          else if (h < 0.22) v.set(x, y, z, b)
        }
  }

  // ---- legs ---------------------------------------------------------------
  // Right leg forward, left leg back: a planted, slightly cocky stance.
  const legs: Array<{ x: number; z: number }> = [
    { x: CX - 7, z: CZ + 3 },  // left, back
    { x: CX + 7, z: CZ - 3 },  // right, forward
  ]
  for (const L of legs) {
    limb(L.x, L.z, 0, 4, 5.2, 7.4, 5.0, 7.0, C.leatherDark)        // boot sole
    limb(L.x, L.z, 4, 13, 5.0, 6.4, 4.6, 5.6, C.leather)           // boot
    limb(L.x, L.z, 13, 16, 5.0, 5.6, 4.6, 5.2, C.leatherDark)      // boot cuff
    limb(L.x, L.z, 16, 34, 4.4, 5.0, 5.0, 5.4, C.mailDark)         // shin, mail
    limb(L.x, L.z, 34, 40, 5.2, 5.6, 5.6, 6.0, C.mail)             // knee
    limb(L.x, L.z, 40, 52, 5.8, 6.2, 6.4, 6.6, C.mail)             // thigh
    // Greave plate over the shin.
    limb(L.x, L.z - 2.4, 18, 32, 3.4, 2.6, 3.6, 2.4, C.steelDark)
  }
  speckle(CX - 14, CX + 14, 16, 52, CZ - 10, CZ + 10, C.mailLight, C.mailDark)

  // ---- hips and belt ------------------------------------------------------
  limb(CX, CZ, 50, 58, 10.5, 7.2, 10.8, 7.4, C.mail)
  speckle(CX - 12, CX + 12, 50, 58, CZ - 9, CZ + 9, C.mailLight, C.mailDark)
  limb(CX, CZ, 55, 58, 11.2, 7.9, 11.2, 7.9, C.strap)   // belt
  // Buckle.
  v.box(CX - 2, 55, CZ - 9, CX + 2, 58, CZ - 8, C.trim)

  // ---- torso --------------------------------------------------------------
  limb(CX, CZ, 58, 66, 11.0, 7.4, 11.8, 7.8, C.mail)
  limb(CX, CZ, 66, 78, 11.8, 7.8, 12.6, 7.6, C.mail)
  speckle(CX - 14, CX + 14, 58, 78, CZ - 9, CZ + 9, C.mailLight, C.mailDark)

  // Tabard over the chest, front and back, with a gold edge.
  for (let y = 56; y <= 76; y++) {
    const w = 7 - Math.max(0, (y - 70) * 0.25)
    for (let dx = -w; dx <= w; dx++) {
      const x = Math.round(CX + dx)
      const front = CZ - 8
      const back = CZ + 8
      const edge = Math.abs(dx) > w - 1.2
      const c = edge ? C.tabardDark : (hash3(x, y, 1) > 0.85 ? C.tabardDark : C.tabard)
      v.set(x, y, front, c)
      v.set(x, y, front - 1, c)
      v.set(x, y, back, c)
    }
  }
  for (let dx = -7; dx <= 7; dx++) v.set(CX + dx, 56, CZ - 9, C.trim)

  // Shoulder straps.
  for (let dz = -8; dz <= 8; dz++) {
    v.set(CX - 6, 77, CZ + dz, C.strap)
    v.set(CX + 6, 77, CZ + dz, C.strap)
  }

  // ---- pauldrons ----------------------------------------------------------
  for (const s of [-1, 1]) {
    const px = CX + s * 13
    limb(px, CZ, 74, 80, 6.4, 6.8, 5.0, 5.4, C.steel)
    limb(px, CZ, 72, 75, 6.8, 7.0, 6.6, 6.8, C.steelDark)
    // Highlight along the top, where a real pauldron catches light.
    for (let dz = -5; dz <= 5; dz++)
      for (let dx = -4; dx <= 4; dx++)
        if (dx * dx + dz * dz < 18) v.set(px + dx, 80, CZ + dz, C.steelLight)
  }

  // ---- arms ---------------------------------------------------------------
  // Left arm (shield side) bent slightly forward; right hangs near the hilt.
  // Left.
  limb(CX - 14, CZ, 62, 76, 4.4, 4.6, 4.8, 5.0, C.mail, 0, -0.12)
  limb(CX - 15, CZ - 2, 52, 62, 4.0, 4.2, 4.2, 4.4, C.steelDark)  // bracer
  limb(CX - 15, CZ - 3, 47, 52, 3.6, 3.8, 3.4, 3.6, C.leather)    // gauntlet
  // Right.
  limb(CX + 14, CZ + 1, 62, 76, 4.4, 4.6, 4.8, 5.0, C.mail, 0, 0.06)
  limb(CX + 15, CZ + 1, 52, 62, 4.0, 4.2, 4.2, 4.4, C.steelDark)
  limb(CX + 15, CZ + 1, 47, 52, 3.6, 3.8, 3.4, 3.6, C.leather)
  speckle(CX - 20, CX + 20, 62, 78, CZ - 8, CZ + 8, C.mailLight, C.mailDark)

  // ---- neck and head ------------------------------------------------------
  limb(CX, CZ, 78, 81, 4.0, 4.0, 3.8, 3.8, C.skinDark)
  limb(CX, CZ, 81, 88, 6.2, 6.0, 6.6, 6.4, C.skin)
  limb(CX, CZ, 88, 93, 6.4, 6.2, 5.2, 5.0, C.skin)

  // Brow, cheekbones, jaw shading.
  for (let dx = -6; dx <= 6; dx++) {
    for (let dz = -6; dz <= 6; dz++) {
      if (dx * dx + dz * dz > 40) continue
      v.set(CX + dx, 93, CZ + dz, C.skinLight)
    }
  }
  for (let dx = -6; dx <= 6; dx++) v.set(CX + dx, 81, CZ - 6, C.skinDark) // jawline

  // Face, on the -Z side.
  const fz = CZ - 6
  v.box(CX - 4, 89, fz, CX - 2, 89, fz, C.hair)   // brows
  v.box(CX + 2, 89, fz, CX + 4, 89, fz, C.hair)
  v.set(CX - 3, 88, fz, C.eye)
  v.set(CX + 3, 88, fz, C.eye)
  v.set(CX - 3, 88, fz - 1, C.eye)
  v.set(CX + 3, 88, fz - 1, C.eye)
  v.box(CX - 1, 85, fz - 1, CX + 1, 87, fz - 1, C.skinLight) // nose
  v.box(CX - 2, 83, fz, CX + 2, 83, fz, C.mouth)             // mouth
  // Stubble along the jaw.
  for (let dx = -5; dx <= 5; dx++)
    for (let y = 82; y <= 84; y++)
      if (hash3(dx, y, 4) > 0.45) v.set(CX + dx, y, fz, C.hairLight)
  // A scar through the left brow — he will tell you about it.
  v.set(CX - 4, 90, fz, C.skinDark)
  v.set(CX - 4, 91, fz, C.skinDark)

  // Hair: swept back, covering the crown and the back of the head.
  for (let y = 86; y <= 95; y++) {
    const t = (y - 86) / 9
    const r = 6.8 - t * 1.6
    for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dz * dz > r * r) continue
        if (dz < -2 && y < 91) continue // leave the face clear
        const h = hash3(dx, y, dz)
        v.set(CX + dx, y, CZ + dz, h > 0.7 ? C.hairLight : C.hair)
      }
    }
  }

  // ---- cloak --------------------------------------------------------------
  for (let y = 40; y <= 78; y++) {
    const t = (y - 40) / 38
    const w = 12 - t * 2.5
    const sway = Math.sin(y * 0.18) * 1.2
    for (let dx = -w; dx <= w; dx++) {
      const x = Math.round(CX + dx + sway)
      const z = CZ + 9 + Math.round(Math.abs(dx) * 0.12)
      const fold = hash3(Math.round(dx * 0.7), Math.round(y * 0.4), 2)
      v.set(x, y, z, fold > 0.58 ? C.cloakDark : C.cloak)
      if (Math.abs(dx) > w - 2) v.set(x, y, z + 1, C.cloakDark)
    }
  }

  // ---- shield, strapped to the left forearm -------------------------------
  {
    const sx = CX - 19
    const sz = CZ - 6
    for (let y = 44; y <= 76; y++) {
      const t = (y - 44) / 32
      // Heater shape: wide at the top, tapering to a point.
      const halfZ = t < 0.45 ? 9.5 : 9.5 * (1 - (t - 0.45) / 0.58)
      if (halfZ <= 0) continue
      for (let dz = -Math.ceil(halfZ); dz <= Math.ceil(halfZ); dz++) {
        const curve = Math.round((dz * dz) / 26)
        const rim = Math.abs(dz) > halfZ - 1.3 || y > 74 || y < 46
        for (let dx = 0; dx < 3; dx++) {
          const c = rim
            ? C.shieldRim
            : (hash3(dx, y, dz) > 0.78 ? C.shieldFace2 : C.shieldFace)
          v.set(sx - dx - curve, y, sz + dz, c)
        }
      }
    }
    // Boss and a couple of honest dents.
    v.ellipsoid(sx - 3, 62, sz, 3.2, 4.4, 4.4, C.shieldBoss, 0.3)
    v.ellipsoid(sx - 1, 54, sz + 5, 2.0, 2.4, 2.4, C.shieldRim, 0.6)
  }

  // ---- sword, scabbarded at the right hip ---------------------------------
  {
    const hx = CX + 12
    for (let i = 0; i < 40; i++) {
      const x = Math.round(hx + i * 0.16)
      const y = Math.round(54 - i * 0.92)
      const z = Math.round(CZ + 5 + i * 0.1)
      if (y < 2) break
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -2; dz <= 2; dz++)
          v.set(x + dx, y, z + dz, hash3(x, y, dz) > 0.8 ? C.leatherDark : C.scabbard)
    }
    // Crossguard, grip and pommel above the belt line.
    v.box(hx - 4, 57, CZ + 3, hx + 4, 58, CZ + 7, C.hilt)
    for (let y = 59; y <= 66; y++) v.box(hx - 1, y, CZ + 4, hx + 1, y, CZ + 6, C.grip)
    v.ellipsoid(hx, 68, CZ + 5, 2.4, 2.4, 2.4, C.hilt, 0.2)
    // A sliver of blade showing at the scabbard throat.
    v.box(hx - 1, 56, CZ + 4, hx + 1, 56, CZ + 6, C.blade)
  }

  const geometry = v.build({ shade: 0.2 })
  // Centre the model on its feet, at the origin.
  geometry.translate(-CX * HERO_VOX, 0, -CZ * HERO_VOX)

  return { geometry, height: SY * HERO_VOX }
}
