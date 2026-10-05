import { noise2 } from '../voxel'

export const WORLD_VOX = 0.04  // 4 cm voxels for terrain and set dressing
export const HERO_VOX = 0.02   // 2 cm voxels for characters

/** Terrain volume, in world voxels. Chunked for MagicaVoxel's 256 limit. */
export const SX = 460
export const SY = 130
export const SZ = 360

export const WATER_LEVEL = 34 // in world voxels

/** Centre line of the tributary at a given z (south to north). */
export function tribX(z: number): number {
  return 212 + Math.sin(z * 0.018) * 26 + noise2(z * 0.02, 8.3) * 18 - 9
}

/** Half-width of the tributary channel at a given z. */
export function tribW(z: number): number {
  return 10 + noise2(z * 0.03, 2.1) * 4
}

/** Where the main river's south bank sits, per x. */
export function riverBankZ(x: number): number {
  return 268 + noise2(x * 0.016, 41.2) * 22
}

export interface Placement {
  model: string
  /** position in world voxels; y is the voxel the model's base sits on */
  x: number
  y: number
  z: number
  /** 0-3, quarter turns about Y */
  rot: number
}

export interface SceneManifest {
  name: string
  worldVoxel: number
  heroVoxel: number
  waterLevel: number
  bounds: { sx: number; sy: number; sz: number }
  terrainChunks: Array<{ file: string; x: number; y: number; z: number }>
  heightfield: { file: string; sx: number; sz: number }
  models: Record<string, string>
  placements: Placement[]
  hero: { model: string; x: number; y: number; z: number; rotation: number }
}
