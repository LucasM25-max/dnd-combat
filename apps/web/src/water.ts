import * as THREE from 'three'
import { SX, SZ, WATER_LEVEL, WORLD_VOX } from './gen/common'

export const WATER_Y = WATER_LEVEL * WORLD_VOX
const RIVER_BANK_Z = 268 * WORLD_VOX

/**
 * The fouled stream — rendered as a body of water, not a surface.
 *
 * What makes it read as 3D:
 *
 *  - the water surface is NOT level. It slopes downstream and steps over
 *    riffles, so the stream visibly runs downhill into the river;
 *  - thickness is measured per pixel from the scene depth buffer, so
 *    absorption, colour and opacity respond to how much water the eye is
 *    actually looking through at that angle — grazing views go opaque,
 *    looking straight down stays clear;
 *  - standing waves pile up over shallow, steep bed, as they do in a real
 *    stream, and stay put while the travelling waves move through them;
 *  - caustics are projected onto the bed from the wave normals;
 *  - the shoreline is soft, with wet darkened ground and foam, instead of a
 *    hard cut where a plane intersects terrain.
 */
export class Water {
  readonly mesh: THREE.Mesh
  readonly material: THREE.ShaderMaterial
  private readonly target: THREE.WebGLRenderTarget

  constructor(heights: Int16Array, sunDir: THREE.Vector3, fogColor: THREE.Color, fogDensity: number) {
    // Bed depth relative to the nominal waterline, in metres.
    const depth = new Float32Array(SX * SZ)
    for (let i = 0; i < SX * SZ; i++) depth[i] = (WATER_LEVEL - heights[i]) * WORLD_VOX

    const depthTex = new THREE.DataTexture(depth, SX, SZ, THREE.RedFormat, THREE.FloatType)
    depthTex.minFilter = THREE.LinearFilter
    depthTex.magFilter = THREE.LinearFilter
    depthTex.wrapS = depthTex.wrapT = THREE.ClampToEdgeWrapping
    depthTex.needsUpdate = true

    const sceneDepth = new THREE.DepthTexture(1, 1)
    sceneDepth.type = THREE.UnsignedIntType
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      depthTexture: sceneDepth,
    })

    const w = SX * WORLD_VOX
    const d = SZ * WORLD_VOX

    const geom = new THREE.PlaneGeometry(w, d, 460, 360)
    geom.rotateX(-Math.PI / 2)
    geom.translate(w / 2, 0, d / 2)

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uBed: { value: depthTex },
        uSize: { value: new THREE.Vector2(w, d) },
        uWaterY: { value: WATER_Y },
        uRiverBankZ: { value: RIVER_BANK_Z },
        uSun: { value: sunDir.clone() },
        uSunColor: { value: new THREE.Color(0xffd3a1) },
        uSkyColor: { value: new THREE.Color(0x9fc0d8) },
        uSilt: { value: new THREE.Color(0x56664a) },
        uScum: { value: new THREE.Color(0x97a688) },
        uFoam: { value: new THREE.Color(0xe6eade) },
        uScene: { value: this.target.texture },
        uSceneDepth: { value: sceneDepth },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.05 },
        uFar: { value: 220 },
        uFogColor: { value: fogColor.clone() },
        uFogDensity: { value: fogDensity },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    })

    this.mesh = new THREE.Mesh(geom, this.material)
    this.mesh.renderOrder = 10
    this.mesh.frustumCulled = false
  }

  setSize(width: number, height: number, pixelRatio: number) {
    const w = Math.max(1, Math.floor(width * pixelRatio))
    const h = Math.max(1, Math.floor(height * pixelRatio))
    this.target.setSize(w, h)
    this.material.uniforms.uResolution.value.set(w, h)
  }

  setCamera(camera: THREE.PerspectiveCamera) {
    this.material.uniforms.uNear.value = camera.near
    this.material.uniforms.uFar.value = camera.far
  }

  /** Render the scene without water, capturing colour AND depth to refract. */
  captureBackdrop(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.mesh.visible = false
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(this.target)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.setRenderTarget(prev)
    this.mesh.visible = true
  }

  update(t: number) {
    this.material.uniforms.uTime.value = t
  }
}

/* ------------------------------------------------------------------ shared */

const COMMON = /* glsl */`
  uniform float uTime;
  uniform sampler2D uBed;
  uniform vec2 uSize;
  uniform float uWaterY;
  uniform float uRiverBankZ;

  // Bed depth below the nominal waterline (metres). Negative means dry land.
  float bedDepth(vec2 p) {
    vec2 uv = p / uSize;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -1.0;
    return texture2D(uBed, uv).r;
  }

  float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1,0)), u.x),
               mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += vnoise(p) * a; p *= 2.07; a *= 0.5; }
    return s;
  }

  /**
   * The waterline is not level. The stream falls about 16 cm from the south
   * edge of the wood to the river, in a series of riffle steps, and the river
   * itself sits lowest. This is the single biggest reason it stops looking
   * like a sheet of glass laid over the map.
   */
  float surfaceLevel(vec2 p) {
    float toRiver = clamp(p.y / uRiverBankZ, 0.0, 1.0);
    float fall = (1.0 - toRiver);
    float level = uWaterY + 0.165 * pow(fall, 1.25);

    // Riffle steps: short pools separated by small drops.
    float steps = floor(fall * 5.0);
    level += steps * 0.012;
    float edge = fract(fall * 5.0);
    level -= smoothstep(0.0, 0.35, edge) * 0.010;

    // The river is slightly lower still and almost flat.
    level -= smoothstep(uRiverBankZ - 0.5, uRiverBankZ + 3.0, p.y) * 0.03;
    return level;
  }

  // Depth of water at a point, accounting for the sloping surface.
  float waterColumn(vec2 p) {
    return (surfaceLevel(p) - uWaterY) + bedDepth(p);
  }

  vec2 flowDir(vec2 p) {
    float inRiver = smoothstep(uRiverBankZ - 1.2, uRiverBankZ + 1.6, p.y);
    return normalize(mix(vec2(0.12, 1.0), vec2(1.0, 0.1), inRiver));
  }

  float flowSpeed(vec2 p) {
    float c = waterColumn(p);
    return mix(0.10, 0.70, smoothstep(0.03, 0.35, c) * (1.0 - smoothstep(0.9, 2.4, c)));
  }

  // Steepness of the bed: where the stream trips over its own bottom.
  float bedSlope(vec2 p) {
    float e = 0.11;
    return abs(bedDepth(p + vec2(e, 0.0)) - bedDepth(p - vec2(e, 0.0)))
         + abs(bedDepth(p + vec2(0.0, e)) - bedDepth(p - vec2(0.0, e)));
  }

  vec3 gerstner(vec2 p, vec2 dir, float steepness, float wavelength, float t,
                inout vec3 tangent, inout vec3 binormal) {
    float k = 6.28318 / wavelength;
    float c = sqrt(9.81 / k);
    vec2 dn = normalize(dir);
    float f = k * (dot(dn, p) - c * t);
    float a = steepness / k;
    tangent  += vec3(-dn.x * dn.x * steepness * sin(f), dn.x * steepness * cos(f), -dn.x * dn.y * steepness * sin(f));
    binormal += vec3(-dn.x * dn.y * steepness * sin(f), dn.y * steepness * cos(f), -dn.y * dn.y * steepness * sin(f));
    return vec3(dn.x * a * cos(f), a * sin(f), dn.y * a * cos(f));
  }
`

const VERT = /* glsl */`
  precision highp float;
  ${COMMON}

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vColumn;
  varying float vViewZ;
  varying vec4 vScreen;
  varying float vStanding;

  void main() {
    vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 xz = p.xz;

    float column = waterColumn(xz);
    vColumn = column;

    // Waves die at the shoreline so the surface meets the bank cleanly.
    float amp = smoothstep(0.0, 0.5, column);
    float spd = flowSpeed(xz);
    vec2 fd = flowDir(xz);
    float t = uTime;

    vec3 tangent = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);
    vec3 disp = vec3(0.0);

    // Travelling waves — bigger and longer than before, so the surface has
    // real relief rather than a shimmer.
    disp += gerstner(xz, fd,                                0.30 * amp, 3.1,  t * spd * 1.5, tangent, binormal);
    disp += gerstner(xz, normalize(fd + vec2(0.55, -0.40)), 0.24 * amp, 1.55, t * spd * 2.0, tangent, binormal);
    disp += gerstner(xz, normalize(fd + vec2(-0.45, 0.65)), 0.17 * amp, 0.85, t * spd * 2.6, tangent, binormal);
    disp += gerstner(xz, normalize(fd * 0.3 + vec2(1.0, 0.25)), 0.11 * amp, 0.42, t * 2.4, tangent, binormal);

    // Standing waves: fast shallow flow over a steep bed humps up and stays
    // put. These are stationary in world space, which is what makes moving
    // water look like it is running over something.
    float slope = bedSlope(xz);
    float standing = smoothstep(0.02, 0.26, slope) * smoothstep(0.02, 0.18, column)
                   * (1.0 - smoothstep(0.35, 0.9, column)) * smoothstep(0.2, 0.5, spd);
    vStanding = standing;
    float hump = sin(xz.x * 7.0) * cos(xz.y * 8.0) * 0.5 + 0.5;
    disp.y += standing * (0.055 * hump + 0.016 * sin(xz.x * 31.0 + t * 9.0) * cos(xz.y * 27.0 - t * 7.0));

    // Build the surface: sloping waterline plus displacement.
    vec3 worldPos = vec3(p.x + disp.x, surfaceLevel(xz) + disp.y, p.z + disp.z);

    vNormal = normalize(cross(binormal, tangent));
    vWorld = worldPos;

    vec4 mv = viewMatrix * vec4(worldPos, 1.0);
    vViewZ = -mv.z;
    vec4 clip = projectionMatrix * mv;
    vScreen = clip;
    gl_Position = clip;
  }
`

const FRAG = /* glsl */`
  precision highp float;
  ${COMMON}

  uniform vec3 uSun, uSunColor, uSkyColor, uSilt, uScum, uFoam;
  uniform sampler2D uScene;
  uniform sampler2D uSceneDepth;
  uniform vec2 uResolution;
  uniform float uNear, uFar;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vColumn;
  varying float vViewZ;
  varying vec4 vScreen;
  varying float vStanding;

  float linearDepth(vec2 uv) {
    float d = texture2D(uSceneDepth, uv).x;
    float ndc = d * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
  }

  void main() {
    if (vColumn <= 0.003) discard;  // dry land

    vec2 xz = vWorld.xz;
    vec2 fd = flowDir(xz);
    float spd = flowSpeed(xz);
    float t = uTime;
    vec2 drift = fd * spd * t;

    // Fine ripples riding the big waves.
    float n1 = fbm(xz * 3.4 - drift);
    float n2 = fbm(xz * 10.0 - drift * 1.8 + 11.3);
    float n3 = fbm(xz * 26.0 - drift * 3.1);
    vec3 N = normalize(vNormal + vec3((n2 - n1) * 0.7 + (n3 - 0.5) * 0.25, 0.0,
                                      (n1 - n2) * 0.7 + (n3 - 0.5) * 0.25));

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uSun);

    // ---- how much water is the eye actually looking through? ---------------
    // Measured from the depth buffer, so it grows at grazing angles. This is
    // what gives the water body volume instead of a constant tint.
    vec2 uv = (vScreen.xy / vScreen.w) * 0.5 + 0.5;
    float bedZ = linearDepth(uv);
    float thickness = max(0.0, bedZ - vViewZ);
    thickness = min(thickness, 6.0);

    // Refraction offset scales with thickness, and is clamped so we never
    // sample something in front of the water.
    float bend = clamp(thickness * 0.35, 0.0, 1.0) * 0.055;
    vec2 ruv = clamp(uv + N.xz * bend, vec2(0.002), vec2(0.998));
    if (linearDepth(ruv) < vViewZ) ruv = uv;
    vec3 bed = texture2D(uScene, ruv).rgb;

    // ---- caustics on the bed ----------------------------------------------
    vec2 cp = xz * 5.5 - drift * 1.4 + N.xz * 0.6;
    float caus = pow(max(0.0, 1.0 - abs(fbm(cp) - 0.5) * 3.2), 4.0);
    caus += pow(max(0.0, 1.0 - abs(fbm(cp * 1.9 + 3.1) - 0.5) * 3.0), 5.0) * 0.6;
    bed += uSunColor * caus * 0.55 * exp(-thickness * 1.1);

    // ---- absorption through the column (Beer-Lambert) ----------------------
    vec3 extinction = vec3(1.45, 0.78, 1.25);   // fouled green water
    vec3 transmit = exp(-extinction * thickness * 1.25);
    vec3 col = mix(uSilt, bed, transmit);

    // Suspended silt scatters light back out — the water glows faintly.
    col += uSilt * (1.0 - transmit) * 0.35 * max(0.25, dot(N, L));

    // ---- scum film ----------------------------------------------------------
    float corridor = 1.0 - smoothstep(0.4, 2.9, abs(xz.x - 8.4 - sin(xz.y * 0.42) * 1.1));
    float downstream = smoothstep(9.6, 13.2, xz.y) * 0.5;
    float film = smoothstep(0.46, 0.82, n1 * 0.78 + n2 * 0.32) * clamp(corridor + downstream, 0.0, 1.0);
    col = mix(col, uScum, film * 0.8);

    // ---- white water --------------------------------------------------------
    float churn = smoothstep(0.42, 0.85, fbm(xz * 7.5 - drift * 3.2 + vec2(0.0, t * 0.7)));
    float foam = vStanding * (0.55 + 0.45 * churn);
    // Foam lace at the waterline, and in the slack behind obstacles.
    float edge = (1.0 - smoothstep(0.0, 0.085, vColumn)) * smoothstep(0.28, 0.72, fbm(xz * 12.0 - drift * 2.4));
    foam = clamp(foam + edge, 0.0, 1.0);
    col = mix(col, uFoam, foam * 0.9);

    // ---- surface lighting ---------------------------------------------------
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    col = mix(col, uSkyColor, fres * 0.6 * (1.0 - foam * 0.8));

    vec3 H = normalize(L + V);
    col += uSunColor * pow(max(dot(N, H), 0.0), 240.0) * 2.6 * (1.0 - foam * 0.8) * (1.0 - film * 0.5);
    col += uSunColor * pow(max(0.0, fbm(xz * 30.0 - drift * 5.5)), 7.0) * 1.3 * (1.0 - film);

    // ---- soft shoreline ------------------------------------------------------
    // Fade out over the last few centimetres of thickness so there is no hard
    // line where the surface cuts the bank.
    float shore = smoothstep(0.0, 0.05, thickness) * smoothstep(0.0, 0.03, vColumn);

    float dist = length(cameraPosition - vWorld);
    float fog = clamp(1.0 - exp(-pow(uFogDensity * dist, 2.0)), 0.0, 1.0);
    col = mix(col, uFogColor, fog);

    float alpha = clamp(0.35 + thickness * 1.6, 0.0, 1.0);
    alpha = max(alpha, foam * 0.95);
    alpha = max(alpha, fres * 0.75);
    alpha *= shore;
    alpha = mix(alpha, 1.0, fog);

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
