/**
 * MagicaVoxel .vox read/write (format version 150).
 *
 * Coordinate convention: MagicaVoxel is Z-up, we are Y-up.
 *   vox.x = our.x,  vox.y = our.z,  vox.z = our.y
 *
 * Works in both Node (asset build) and the browser (runtime load), so there is
 * exactly one implementation of the format in the project.
 */

export type RGB = [number, number, number]

export interface VoxModel {
  sx: number
  sy: number
  sz: number
  /** length sx*sy*sz, 0 = empty, else palette index + 1. Layout: (y*sz + z)*sx + x */
  data: Uint16Array
  /** palette[i] is the colour for stored value i+1 */
  palette: RGB[]
}

const MAGIC = 0x20584f56 // 'VOX ' little-endian

function fourCC(s: string): number {
  return s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24)
}

export function encodeVox(model: VoxModel): Uint8Array {
  const { sx, sy, sz, data, palette } = model
  if (palette.length > 255) throw new Error(`palette too large: ${palette.length} (max 255)`)
  if (sx > 256 || sy > 256 || sz > 256) throw new Error(`model exceeds 256 on an axis: ${sx}x${sy}x${sz}`)

  // Collect voxels in MagicaVoxel coordinates.
  const xs: number[] = []
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const v = data[(y * sz + z) * sx + x]
        if (v === 0) continue
        xs.push(x, z, y, v) // vox.x, vox.y, vox.z, colorIndex
      }
    }
  }
  const count = xs.length / 4

  const sizeContent = 12
  const xyziContent = 4 + count * 4
  const rgbaContent = 256 * 4
  const childrenSize = 12 + sizeContent + 12 + xyziContent + 12 + rgbaContent
  const total = 8 + 12 + childrenSize

  const buf = new ArrayBuffer(total)
  const dv = new DataView(buf)
  const u8 = new Uint8Array(buf)
  let o = 0

  dv.setUint32(o, MAGIC, true); o += 4
  dv.setUint32(o, 150, true); o += 4

  // MAIN
  dv.setUint32(o, fourCC('MAIN'), true); o += 4
  dv.setUint32(o, 0, true); o += 4
  dv.setUint32(o, childrenSize, true); o += 4

  // SIZE
  dv.setUint32(o, fourCC('SIZE'), true); o += 4
  dv.setUint32(o, sizeContent, true); o += 4
  dv.setUint32(o, 0, true); o += 4
  dv.setUint32(o, sx, true); o += 4
  dv.setUint32(o, sz, true); o += 4 // vox Y = our Z
  dv.setUint32(o, sy, true); o += 4 // vox Z = our Y

  // XYZI
  dv.setUint32(o, fourCC('XYZI'), true); o += 4
  dv.setUint32(o, xyziContent, true); o += 4
  dv.setUint32(o, 0, true); o += 4
  dv.setUint32(o, count, true); o += 4
  for (let i = 0; i < xs.length; i++) u8[o++] = xs[i] & 0xff

  // RGBA — palette entry i is written at slot i, read back as index i+1.
  dv.setUint32(o, fourCC('RGBA'), true); o += 4
  dv.setUint32(o, rgbaContent, true); o += 4
  dv.setUint32(o, 0, true); o += 4
  for (let i = 0; i < 256; i++) {
    const c = palette[i]
    if (c) {
      u8[o++] = Math.round(linearToSrgb(c[0]) * 255)
      u8[o++] = Math.round(linearToSrgb(c[1]) * 255)
      u8[o++] = Math.round(linearToSrgb(c[2]) * 255)
      u8[o++] = 255
    } else {
      u8[o++] = 0; u8[o++] = 0; u8[o++] = 0; u8[o++] = 255
    }
  }

  return u8
}

export function decodeVox(buffer: ArrayBuffer): VoxModel {
  const dv = new DataView(buffer)
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('not a .vox file')

  let o = 8
  let sx = 0, sy = 0, sz = 0
  let voxels: Uint8Array | null = null
  let palette: RGB[] | null = null

  while (o < buffer.byteLength) {
    const id = dv.getUint32(o, true); o += 4
    const contentSize = dv.getUint32(o, true); o += 4
    o += 4 // childrenSize
    const start = o

    if (id === fourCC('SIZE')) {
      sx = dv.getUint32(start, true)
      sz = dv.getUint32(start + 4, true)  // vox Y -> our Z
      sy = dv.getUint32(start + 8, true)  // vox Z -> our Y
    } else if (id === fourCC('XYZI')) {
      const n = dv.getUint32(start, true)
      voxels = new Uint8Array(buffer, start + 4, n * 4)
    } else if (id === fourCC('RGBA')) {
      palette = []
      for (let i = 0; i < 256; i++) {
        const r = dv.getUint8(start + i * 4)
        const g = dv.getUint8(start + i * 4 + 1)
        const b = dv.getUint8(start + i * 4 + 2)
        palette.push([srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)])
      }
    } else if (id !== fourCC('MAIN')) {
      // PACK, nTRN, nGRP, nSHP, LAYR, MATL, rOBJ etc — skipped.
    }

    if (id === fourCC('MAIN')) continue // descend into children
    o = start + contentSize
  }

  if (!voxels) throw new Error('.vox has no XYZI chunk')
  if (!palette) palette = DEFAULT_PALETTE.map(hexToLinear)

  const data = new Uint16Array(sx * sy * sz)
  for (let i = 0; i < voxels.length; i += 4) {
    const x = voxels[i]
    const z = voxels[i + 1] // vox Y
    const y = voxels[i + 2] // vox Z
    const ci = voxels[i + 3]
    if (x >= sx || y >= sy || z >= sz) continue
    data[(y * sz + z) * sx + x] = ci
  }

  return { sx, sy, sz, data, palette }
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function hexToLinear(hex: number): RGB {
  return [
    srgbToLinear(((hex >> 16) & 255) / 255),
    srgbToLinear(((hex >> 8) & 255) / 255),
    srgbToLinear((hex & 255) / 255),
  ]
}

/** Only used if a file somehow lacks an RGBA chunk. */
const DEFAULT_PALETTE: number[] = Array.from({ length: 256 }, (_, i) => (i * 0x010101) & 0xffffff)
