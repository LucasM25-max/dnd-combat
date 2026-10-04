import * as THREE from 'three'

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
  build(opts: { shade?: number; origin?: THREE.Vector3 } = {}): THREE.BufferGeometry {
    const shadeAmount = opts.shade ?? 0.16
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
            if (this.solid(x + d[0], y + d[1], z + d[2])) continue

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
