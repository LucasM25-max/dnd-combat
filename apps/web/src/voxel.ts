import * as THREE from 'three'
import type { VoxModel, RGB as VoxRGB } from './vox-format'

/**
 * A dense voxel volume that bakes down to a single triangle mesh.
 *
 * Voxels are an authoring format, not a runtime structure: we generate the
 * grid, cull hidden faces, bake per-vertex ambient occlusion, and hand three.js
 * plain geometry. Nothing queries the grid after the mesh is built.
 */

export type RGB = [number, number, number]

export class VoxelVolume {
  readonly sx: number
  readonly sy: number
  readonly sz: number
  readonly voxelSize: number
  /** 0 = empty, otherwise palette index + 1 */
  private data: Uint16Array
  private palette: RGB[] = []
  private paletteKey = new Map<string, number>()

  /** Wrap a decoded .vox model so it can be meshed. */
  static fromVox(model: VoxModel, voxelSize: number): VoxelVolume {
    const v = new VoxelVolume(model.sx, model.sy, model.sz, voxelSize)
    v.data = model.data
    v.palette = model.palette as VoxRGB[] as RGB[]
    return v
  }

  /** Export for writing to a .vox file. */
  toVox(): VoxModel {
    return { sx: this.sx, sy: this.sy, sz: this.sz, data: this.data, palette: this.palette }
  }

  getPalette(): RGB[] {
    return this.palette
  }

  countSolid(): number {
    let n = 0
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== 0) n++
    return n
  }

  /**
   * Remove fully-enclosed voxels. They can never be seen, so dropping them
   * keeps the .vox files small and MagicaVoxel responsive. Voxels on the
   * volume boundary are kept so neighbouring chunks still stitch.
   */
  hollow(): this {
    const out = new Uint16Array(this.data.length)
    for (let y = 0; y < this.sy; y++) {
      for (let z = 0; z < this.sz; z++) {
        for (let x = 0; x < this.sx; x++) {
          const i = this.index(x, y, z)
          if (this.data[i] === 0) continue
          const edge = x === 0 || y === 0 || z === 0 ||
            x === this.sx - 1 || y === this.sy - 1 || z === this.sz - 1
          const exposed = edge ||
            !this.solid(x + 1, y, z) || !this.solid(x - 1, y, z) ||
            !this.solid(x, y + 1, z) || !this.solid(x, y - 1, z) ||
            !this.solid(x, y, z + 1) || !this.solid(x, y, z - 1)
          if (exposed) out[i] = this.data[i]
        }
      }
    }
    this.data = out
    return this
  }

  /** Tight bounds of the solid voxels, or null if empty. */
  extents(): { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } | null {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -1, y1 = -1, z1 = -1
    for (let y = 0; y < this.sy; y++)
      for (let z = 0; z < this.sz; z++)
        for (let x = 0; x < this.sx; x++) {
          if (this.data[this.index(x, y, z)] === 0) continue
          if (x < x0) x0 = x; if (x > x1) x1 = x
          if (y < y0) y0 = y; if (y > y1) y1 = y
          if (z < z0) z0 = z; if (z > z1) z1 = z
        }
    return x1 < 0 ? null : { x0, y0, z0, x1, y1, z1 }
  }

  /** Copy into a new volume cropped to its solid extents. */
  cropped(): { volume: VoxelVolume; offset: [number, number, number] } {
    const e = this.extents()
    if (!e) return { volume: new VoxelVolume(1, 1, 1, this.voxelSize), offset: [0, 0, 0] }
    const w = e.x1 - e.x0 + 1, h = e.y1 - e.y0 + 1, d = e.z1 - e.z0 + 1
    const out = new VoxelVolume(w, h, d, this.voxelSize)
    out.palette = this.palette.slice()
    out.paletteKey = new Map(this.paletteKey)
    for (let y = 0; y < h; y++)
      for (let z = 0; z < d; z++)
        for (let x = 0; x < w; x++)
          out.data[out.index(x, y, z)] = this.data[this.index(x + e.x0, y + e.y0, z + e.z0)]
    return { volume: out, offset: [e.x0, e.y0, e.z0] }
  }

  constructor(sx: number, sy: number, sz: number, voxelSize: number) {
    this.sx = sx
    this.sy = sy
    this.sz = sz
    this.voxelSize = voxelSize
    this.data = new Uint16Array(sx * sy * sz)
  }

  color(hex: number): number {
    const key = String(hex)
    const existing = this.paletteKey.get(key)
    if (existing !== undefined) return existing
    const c = new THREE.Color(hex)
    this.palette.push([c.r, c.g, c.b])
    const idx = this.palette.length - 1
    this.paletteKey.set(key, idx)
    return idx
  }

  private index(x: number, y: number, z: number): number {
    return (y * this.sz + z) * this.sx + x
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz
  }

  set(x: number, y: number, z: number, colorIdx: number) {
    x |= 0; y |= 0; z |= 0
    if (!this.inside(x, y, z)) return
    this.data[this.index(x, y, z)] = colorIdx + 1
  }

  get(x: number, y: number, z: number): number {
    if (!this.inside(x, y, z)) return 0
    return this.data[this.index(x, y, z)]
  }

  solid(x: number, y: number, z: number): boolean {
    return this.get(x, y, z) !== 0
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number) {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) this.set(x, y, z, c)
  }

  /** Axis-aligned ellipsoid, used for foliage blobs and rounded forms. */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number, jitter = 0) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x - cx) / rx
          const dy = (y - cy) / ry
          const dz = (z - cz) / rz
          let d = dx * dx + dy * dy + dz * dz
          if (jitter > 0) d += (hash3(x, y, z) - 0.5) * jitter
          if (d <= 1) this.set(x, y, z, c)
        }
      }
    }
  }

  /**
   * Cull hidden faces, bake AO, emit one BufferGeometry.
   * Colours are per-vertex, so there are no textures and no UVs anywhere.
   */
  build(opts: {
    shade?: number
    origin?: THREE.Vector3
    /** Skip faces that open into an enclosed pocket (hollowed .vox models). */
    cullInterior?: boolean
    /** Skip faces on the X/Z/bottom borders, so chunks stitch invisibly. */
    sealSides?: boolean
  } = {}): THREE.BufferGeometry {
    const shadeAmount = opts.shade ?? 0.16
    const exterior = opts.cullInterior ? this.computeExterior() : null
    const s = this.voxelSize
    const ox = opts.origin?.x ?? 0
    const oy = opts.origin?.y ?? 0
    const oz = opts.origin?.z ?? 0

    const positions: number[] = []
    const normals: number[] = []
    const colors: number[] = []

    // +X, -X, +Y, -Y, +Z, -Z
    const dirs: Array<[number, number, number]> = [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    ]
    // Four corner offsets per face, counter-clockwise seen from outside.
    const faceVerts: number[][][] = [
      [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], // +X
      [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], // -X
      [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], // +Y
      [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], // -Y
      [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], // +Z
      [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], // -Z
    ]

    // Face tinting: top faces catch light, undersides sit in shadow.
    const faceTint = [1.0, 0.94, 1.12, 0.74, 0.98, 0.9]

    const tmp: RGB = [0, 0, 0]

    for (let y = 0; y < this.sy; y++) {
      for (let z = 0; z < this.sz; z++) {
        for (let x = 0; x < this.sx; x++) {
          const v = this.get(x, y, z)
          if (v === 0) continue
          const base = this.palette[v - 1]

          // Per-voxel colour variation so large flat areas never read as plastic.
          const n = hash3(x * 1.7, y * 2.3, z * 1.1)
          const varia = 1 + (n - 0.5) * 0.085

          for (let f = 0; f < 6; f++) {
            const d = dirs[f]
            const nx = x + d[0], ny = y + d[1], nz = z + d[2]
            if (this.solid(nx, ny, nz)) continue
            if (!this.inside(nx, ny, nz)) {
              // Outside the volume: hide side and bottom faces of a chunk.
              if (opts.sealSides && f !== 2) continue
            } else if (exterior && exterior[this.index(nx, ny, nz)] === 0) {
              continue // opens into a sealed interior pocket
            }

            const tint = faceTint[f] * varia
            tmp[0] = base[0] * tint
            tmp[1] = base[1] * tint
            tmp[2] = base[2] * tint

            const verts = faceVerts[f]
            const ao: number[] = []
            for (let i = 0; i < 4; i++) ao.push(this.vertexAO(x, y, z, f, verts[i]))

            // Flip the quad split to avoid the classic AO seam artefact.
            const order = ao[0] + ao[2] > ao[1] + ao[3]
              ? [0, 1, 2, 0, 2, 3]
              : [1, 2, 3, 1, 3, 0]

            for (const i of order) {
              const c = verts[i]
              positions.push(
                (x + c[0]) * s + ox,
                (y + c[1]) * s + oy,
                (z + c[2]) * s + oz,
              )
              normals.push(d[0], d[1], d[2])
              const k = 1 - (1 - ao[i]) * shadeAmount * 3
              // Shadowed crevices cool off rather than going flat black.
              colors.push(
                Math.max(0, tmp[0] * k),
                Math.max(0, tmp[1] * k * 1.004),
                Math.max(0, tmp[2] * k * 1.02),
              )
            }
          }
        }
      }
    }

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geom.computeBoundingSphere()
    return geom
  }

  /**
   * Flood fill the empty space reachable from the volume boundary.
   * Anything not reached is an interior pocket — the inside of a hollowed
   * model — and must not generate faces.
   */
  computeExterior(): Uint8Array {
    const n = this.data.length
    const mask = new Uint8Array(n)
    const stack = new Int32Array(n)
    let sp = 0

    const push = (x: number, y: number, z: number) => {
      if (!this.inside(x, y, z)) return
      const i = this.index(x, y, z)
      if (mask[i] || this.data[i] !== 0) return
      mask[i] = 1
      stack[sp++] = i
    }

    for (let y = 0; y < this.sy; y++)
      for (let z = 0; z < this.sz; z++) {
        push(0, y, z); push(this.sx - 1, y, z)
      }
    for (let y = 0; y < this.sy; y++)
      for (let x = 0; x < this.sx; x++) {
        push(x, y, 0); push(x, y, this.sz - 1)
      }
    for (let z = 0; z < this.sz; z++)
      for (let x = 0; x < this.sx; x++) {
        push(x, 0, z); push(x, this.sy - 1, z)
      }

    while (sp > 0) {
      const i = stack[--sp]
      const x = i % this.sx
      const rest = (i - x) / this.sx
      const z = rest % this.sz
      const y = (rest - z) / this.sz
      push(x + 1, y, z); push(x - 1, y, z)
      push(x, y + 1, z); push(x, y - 1, z)
      push(x, y, z + 1); push(x, y, z - 1)
    }
    return mask
  }

  /** Standard 3-neighbour voxel AO: side, side, corner. */
  private vertexAO(x: number, y: number, z: number, face: number, corner: number[]): number {
    // Build the two tangent axes for this face.
    let a: [number, number, number]
    let b: [number, number, number]
    let n: [number, number, number]
    switch (face) {
      case 0: n = [1, 0, 0]; a = [0, 1, 0]; b = [0, 0, 1]; break
      case 1: n = [-1, 0, 0]; a = [0, 1, 0]; b = [0, 0, 1]; break
      case 2: n = [0, 1, 0]; a = [1, 0, 0]; b = [0, 0, 1]; break
      case 3: n = [0, -1, 0]; a = [1, 0, 0]; b = [0, 0, 1]; break
      case 4: n = [0, 0, 1]; a = [1, 0, 0]; b = [0, 1, 0]; break
      default: n = [0, 0, -1]; a = [1, 0, 0]; b = [0, 1, 0]; break
    }
    // Corner offsets are 0/1; convert to -1/+1 along each tangent.
    const da = (corner[a[0] ? 0 : a[1] ? 1 : 2] ? 1 : -1)
    const db = (corner[b[0] ? 0 : b[1] ? 1 : 2] ? 1 : -1)

    const px = x + n[0], py = y + n[1], pz = z + n[2]
    const s1 = this.solid(px + a[0] * da, py + a[1] * da, pz + a[2] * da) ? 1 : 0
    const s2 = this.solid(px + b[0] * db, py + b[1] * db, pz + b[2] * db) ? 1 : 0
    const cor = this.solid(
      px + a[0] * da + b[0] * db,
      py + a[1] * da + b[1] * db,
      pz + a[2] * da + b[2] * db,
    ) ? 1 : 0

    if (s1 && s2) return 0
    return (3 - (s1 + s2 + cor)) / 3
  }
}

/** Cheap deterministic hash in [0,1). */
export function hash3(x: number, y: number, z: number): number {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return h - Math.floor(h)
}

/** Smooth value noise, good enough for terrain and bank wobble. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash3(xi, yi, 0)
  const b = hash3(xi + 1, yi, 0)
  const c = hash3(xi, yi + 1, 0)
  const d = hash3(xi + 1, yi + 1, 0)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

export function fbm(x: number, y: number, octaves = 4): number {
  let sum = 0, amp = 0.5, freq = 1
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, y * freq) * amp
    freq *= 2
    amp *= 0.5
  }
  return sum
}
