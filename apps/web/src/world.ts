import * as THREE from 'three'
import { VoxelVolume, fbm, hash3, noise2 } from './voxel'

/**
 * Scene 1 of the tutorial: THE FIRST FORK.
 *
 * A mile upstream of High Ery, late afternoon. The main river runs along the
 * north edge; a polluted tributary slides out of the wood to the south and
 * joins it. Grey scum, pale fungal shelves on the banks, birch, deadwood,
 * and a fallen birch crossing.
 *
 * Everything here is voxel data generated at build time and baked to a single
 * mesh. No textures, no UVs — colour is per-vertex.
 */

export const WORLD_VOX = 0.04 // 4 cm voxels for terrain and foliage
const SX = 460   // 18.4 m east-west
const SY = 130   // 5.2 m vertical
const SZ = 360   // 14.4 m north-south

export const WATER_Y = 34 * WORLD_VOX

type Built = {
  terrain: THREE.BufferGeometry
  water: THREE.Mesh
  garrickSpot: THREE.Vector3
  bounds: { sx: number; sy: number; sz: number }
}

/** Centre line of the tributary at a given z (south to north). */
function tribX(z: number): number {
  return 212 + Math.sin(z * 0.018) * 26 + noise2(z * 0.02, 8.3) * 18 - 9
}

/** Half-width of the tributary channel at a given z. */
function tribW(z: number): number {
  return 15 + noise2(z * 0.03, 2.1) * 7
}

/** Where the main river's south bank sits, per x. */
function riverBankZ(x: number): number {
  return 268 + noise2(x * 0.016, 41.2) * 22
}

export function buildWorld(): Built {
  const v = new VoxelVolume(SX, SY, SZ, WORLD_VOX)

  // ---- palette -----------------------------------------------------------
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
    rock: v.color(0x6e6a63),
    rockDark: v.color(0x55524c),
    birchBark: v.color(0xd9d6cc),
    birchMark: v.color(0x3a3a38),
    birchBark2: v.color(0xc6c3b6),
    wood: v.color(0x5b4634),
    woodDark: v.color(0x46352a),
    deadWood: v.color(0x6a5e4e),
    leafA: v.color(0x7e9c3c),
    leafB: v.color(0x94ad46),
    leafC: v.color(0xb3bd55),
    leafGold: v.color(0xc9b254),
    leafDark: v.color(0x5d7a30),
    fungusA: v.color(0xbfb4c9),
    fungusB: v.color(0xa89bb5),
    fungusC: v.color(0xd3cad9),
    scumCrust: v.color(0x9aa38f),
    sickGrass: v.color(0x74795a),
    riverBed: v.color(0x3f3a30),
  }

  // ---- ground ------------------------------------------------------------
  // Base height field, then carve the river and the tributary into it.
  const heights = new Int16Array(SX * SZ)

  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const n = fbm(x * 0.012, z * 0.012, 4)
      let h = 38 + n * 16

      // Ground rises gently to the south and east, into the wood.
      h += (1 - z / SZ) * 5
      h += (x / SX) * 3

      // Main river channel along the north edge.
      const bank = riverBankZ(x)
      if (z > bank) {
        const t = Math.min(1, (z - bank) / 26)
        h = h * (1 - t) + (26 + noise2(x * 0.05, 9) * 3) * t
      }

      // Tributary channel.
      const cx = tribX(z)
      const w = tribW(z)
      const d = Math.abs(x - cx)
      if (d < w + 12 && z < bank + 14) {
        const t = Math.max(0, 1 - Math.max(0, d - w) / 12)
        const floor = 28 + noise2(z * 0.08, 3) * 2
        const cut = d < w ? 1 : t * 0.8
        h = h * (1 - cut) + floor * cut
      }

      heights[z * SX + x] = Math.round(h)
    }
  }

  // Fill columns.
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const h = heights[z * SX + x]
      const cx = tribX(z)
      const nearTrib = Math.abs(x - cx) < tribW(z) + 20
      const bank = riverBankZ(x)
      const underwater = h <= WATER_Y / WORLD_VOX + 1

      for (let y = 0; y <= h; y++) {
        let c: number
        if (y < h - 6) {
          c = (hash3(x, y, z) > 0.75) ? C.rockDark : C.dirtDark
        } else if (y < h - 1) {
          c = C.dirt
        } else {
          // Surface layer.
          if (underwater) {
            c = z > bank ? C.riverBed : C.mud
          } else if (y < WATER_Y / WORLD_VOX + 3) {
            c = C.sand
          } else {
            const g = fbm(x * 0.05, z * 0.05, 3)
            if (nearTrib && hash3(x, 7, z) > 0.45) {
              c = C.sickGrass
            } else if (x < 34 && z > 60 && z < 200) {
              c = C.road
            } else {
              c = g > 0.62 ? C.grassC : g > 0.48 ? C.grassB : g > 0.34 ? C.grassA : C.grassDry
            }
          }
        }
        v.set(x, y, z, c)
      }
    }
  }

  const groundAt = (x: number, z: number) => {
    x = Math.max(0, Math.min(SX - 1, Math.round(x)))
    z = Math.max(0, Math.min(SZ - 1, Math.round(z)))
    return heights[z * SX + x]
  }

  // ---- the scum crust along the tributary and the confluence -------------
  for (let z = 0; z < SZ; z++) {
    const cx = tribX(z)
    const w = tribW(z)
    for (let side = -1; side <= 1; side += 2) {
      for (let o = 0; o < 7; o++) {
        const x = Math.round(cx + side * (w + o))
        const h = groundAt(x, z)
        if (h > WATER_Y / WORLD_VOX + 5) continue
        if (hash3(x, z, 3) > 0.42) {
          v.set(x, h + 1, z, hash3(x, z, 9) > 0.5 ? C.scumCrust : C.fungusB)
        }
      }
    }
  }

  // ---- fungal shelves on the banks ---------------------------------------
  const shelf = (bx: number, by: number, bz: number, r: number) => {
    for (let i = 0; i < 3; i++) {
      const rr = r * (1 - i * 0.22)
      for (let z = -Math.ceil(rr); z <= Math.ceil(rr); z++) {
        for (let x = -Math.ceil(rr); x <= Math.ceil(rr); x++) {
          const d = Math.sqrt(x * x + z * z) / rr
          if (d > 1 + (hash3(bx + x, i, bz + z) - 0.5) * 0.3) continue
          const c = d > 0.72 ? C.fungusC : d > 0.4 ? C.fungusA : C.fungusB
          v.set(bx + x, by + i, bz + z, c)
        }
      }
    }
  }

  for (let i = 0; i < 46; i++) {
    const z = 12 + Math.floor(hash3(i, 1, 2) * (SZ - 60))
    const side = hash3(i, 5, 1) > 0.5 ? 1 : -1
    const w = tribW(z)
    const x = Math.round(tribX(z) + side * (w + 2 + hash3(i, 3, 7) * 6))
    const h = groundAt(x, z)
    if (h > WATER_Y / WORLD_VOX + 7) continue
    shelf(x, h + 1, z, 3 + hash3(i, 9, 4) * 4)
  }

  // ---- trees --------------------------------------------------------------
  const birch = (bx: number, bz: number, height: number, sick: boolean) => {
    const base = groundAt(bx, bz)
    if (base < WATER_Y / WORLD_VOX + 2) return
    const lean = (hash3(bx, bz, 11) - 0.5) * 0.12
    const r = 2 + Math.floor(hash3(bx, bz, 13) * 1.6)

    for (let y = 0; y <= height; y++) {
      const t = y / height
      const rr = Math.max(1, r * (1 - t * 0.45))
      const ox = Math.round(lean * y)
      for (let dz = -Math.ceil(rr); dz <= Math.ceil(rr); dz++) {
        for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) {
          if (dx * dx + dz * dz > rr * rr) continue
          const mark = hash3(bx + dx, y * 0.4, bz + dz)
          let c = mark > 0.88 ? C.birchMark : mark > 0.55 ? C.birchBark : C.birchBark2
          if (sick && y < height * 0.4 && hash3(bx, y, bz) > 0.6) c = C.fungusA
          v.set(bx + dx + ox, base + y, bz + dz, c)
        }
      }
    }

    // Branches and canopy.
    const topY = base + height
    const canopyC = sick ? [C.leafDark, C.sickGrass, C.leafDark] : [C.leafA, C.leafB, C.leafGold]
    const blobs = sick ? 2 : 3 + Math.floor(hash3(bx, bz, 17) * 2)
    for (let i = 0; i < blobs; i++) {
      const a = hash3(bx, bz, 20 + i) * Math.PI * 2
      const dist = 4 + hash3(bx, i, bz) * 14
      const cx = bx + Math.cos(a) * dist + lean * height
      const cz = bz + Math.sin(a) * dist
      const cy = topY - 6 + hash3(i, bx, bz) * 14
      const rad = 10 + hash3(i, 2, bz) * 7
      const c = canopyC[i % canopyC.length]
      v.ellipsoid(cx, cy, cz, rad, rad * 0.62, rad, c, 0.55)
      // A second, lighter pass catches the low sun.
      v.ellipsoid(cx + 2, cy + rad * 0.3, cz - 2, rad * 0.6, rad * 0.3, rad * 0.6, sick ? C.sickGrass : C.leafC, 0.6)
    }
  }

  // Dense wood to the south and east, thinning toward the river and the road.
  for (let i = 0; i < 58; i++) {
    const x = Math.floor(hash3(i, 31, 7) * SX)
    const z = Math.floor(hash3(i, 17, 23) * (SZ - 70))
    const cx = tribX(z)
    if (Math.abs(x - cx) < tribW(z) + 14) continue   // keep the channel clear
    if (x < 44 && z > 50 && z < 210) continue        // keep the road clear
    if (z > riverBankZ(x) - 14) continue             // keep the bank clear
    if (Math.hypot(x - 170, z - 232) < 42) continue  // keep Garrick's clearing open
    const sick = Math.abs(x - cx) < 70 && hash3(i, 3, 3) > 0.62
    birch(x, z, 46 + Math.floor(hash3(i, 5, 9) * 36), sick)
  }

  // ---- the fallen birch crossing -----------------------------------------
  {
    const z0 = 128
    const cx = tribX(z0)
    const len = Math.round(tribW(z0) * 2 + 34)
    const x0 = Math.round(cx - len / 2)
    const y = Math.round(Math.max(groundAt(x0, z0), groundAt(x0 + len, z0))) + 2
    for (let i = 0; i <= len; i++) {
      const r = 3.2 - Math.abs(i - len / 2) / len * 1.2
      const sag = Math.sin((i / len) * Math.PI) * 2
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
        for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) {
          if (dy * dy + dz * dz > r * r) continue
          const mark = hash3(x0 + i, dy, dz)
          const c = mark > 0.9 ? C.birchMark : mark > 0.6 ? C.birchBark : C.birchBark2
          v.set(x0 + i, y + dy - sag, z0 + dz, c)
        }
      }
    }
    // Root plate at the near end.
    v.ellipsoid(x0 - 2, y + 1, z0, 7, 7, 3, C.deadWood, 0.8)
  }

  // ---- deadwood, rocks, reeds ---------------------------------------------
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash3(i, 61, 3) * SX)
    const z = Math.floor(hash3(i, 13, 71) * SZ)
    const h = groundAt(x, z)
    if (h < WATER_Y / WORLD_VOX + 2) continue
    const len = 6 + Math.floor(hash3(i, 2, 2) * 20)
    const along = hash3(i, 9, 9) > 0.5
    for (let j = 0; j < len; j++) {
      const px = along ? x + j : x
      const pz = along ? z : z + j
      const g = groundAt(px, pz)
      const c = hash3(px, pz, 5) > 0.7 ? C.woodDark : C.deadWood
      v.set(px, g + 1, pz, c)
      if (hash3(px, 1, pz) > 0.6) v.set(px, g + 2, pz, c)
    }
  }

  for (let i = 0; i < 34; i++) {
    const x = Math.floor(hash3(i, 83, 5) * SX)
    const z = Math.floor(hash3(i, 29, 41) * SZ)
    const h = groundAt(x, z)
    const r = 2 + hash3(i, 7, 7) * 5
    v.ellipsoid(x, h + r * 0.3, z, r, r * 0.7, r * 0.9, hash3(i, 1, 1) > 0.5 ? C.rock : C.rockDark, 0.5)
  }

  // Reeds in the shallows of the main river.
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(hash3(i, 97, 11) * SX)
    const bank = riverBankZ(x)
    const z = Math.round(bank + hash3(i, 3, 19) * 10 - 2)
    const h = groundAt(x, z)
    if (h > WATER_Y / WORLD_VOX + 2 || h < WATER_Y / WORLD_VOX - 6) continue
    const tall = 4 + Math.floor(hash3(i, 5, 5) * 9)
    for (let y = 0; y < tall; y++) {
      v.set(x + (y > tall * 0.6 ? 1 : 0), h + 1 + y, z, y > tall * 0.7 ? C.leafGold : C.leafDark)
    }
  }

  // ---- bake ---------------------------------------------------------------
  const terrain = v.build()

  // ---- water --------------------------------------------------------------
  const water = makeWater()

  const gx = 170
  const gz = 232
  const gy = groundAt(gx, gz) + 1

  return {
    terrain,
    water,
    garrickSpot: new THREE.Vector3(gx * WORLD_VOX, gy * WORLD_VOX, gz * WORLD_VOX),
    bounds: { sx: SX, sy: SY, sz: SZ },
  }
}

/**
 * The water surface. One plane across the whole scene at the waterline —
 * it is only visible where the terrain has been carved below it.
 * Scum concentrates along the tributary and smears out into the river.
 */
function makeWater(): THREE.Mesh {
  const geom = new THREE.PlaneGeometry(SX * WORLD_VOX, SZ * WORLD_VOX, 1, 1)
  geom.rotateX(-Math.PI / 2)
  geom.translate((SX * WORLD_VOX) / 2, WATER_Y, (SZ * WORLD_VOX) / 2)

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: new THREE.Vector3(-0.55, 0.3, -0.76) },
      uSunColor: { value: new THREE.Color(0xffd9a0) },
      uDeep: { value: new THREE.Color(0x2c3a30) },
      uShallow: { value: new THREE.Color(0x4a5a42) },
      uScum: { value: new THREE.Color(0x9fae92) },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime;
      uniform vec3 uSun, uSunColor, uDeep, uShallow, uScum;
      varying vec3 vWorld;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
                   mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
      }
      float fbm(vec2 p){
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++){ s += noise(p) * a; p *= 2.03; a *= 0.5; }
        return s;
      }

      void main() {
        // Current drags north-east; the tributary pushes north.
        vec2 flow = vec2(0.09, 0.26) * uTime;
        float n  = fbm(vWorld.xz * 1.7 + flow);
        float n2 = fbm(vWorld.xz * 4.1 - flow * 1.7);

        // Scum is dense in the tributary corridor, smearing into the river.
        float tribCorridor = 1.0 - smoothstep(0.6, 3.4, abs(vWorld.x - 8.4 - sin(vWorld.z * 0.45) * 1.0));
        float downstream = smoothstep(9.5, 13.5, vWorld.z);
        float scumMask = clamp(tribCorridor + downstream * 0.55 * smoothstep(0.35, 0.8, n), 0.0, 1.0);
        float scum = smoothstep(0.42, 0.78, n * 0.75 + n2 * 0.35) * scumMask;

        vec3 col = mix(uDeep, uShallow, n * 0.8);
        col = mix(col, uScum, scum * 0.85);

        // Cheap specular glitter from the low sun.
        vec3 nrm = normalize(vec3((n2 - n) * 1.4, 1.0, (n - n2) * 1.4));
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 h = normalize(normalize(uSun) + viewDir);
        float spec = pow(max(dot(nrm, h), 0.0), 60.0);
        col += uSunColor * spec * (1.0 - scum * 0.9) * 1.6;

        // Fresnel brightening at grazing angles.
        float fres = pow(1.0 - max(dot(nrm, viewDir), 0.0), 3.0);
        col += vec3(0.16, 0.20, 0.21) * fres;

        float alpha = mix(0.82, 0.97, scum);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })

  const mesh = new THREE.Mesh(geom, mat)
  mesh.renderOrder = 1
  return mesh
}
