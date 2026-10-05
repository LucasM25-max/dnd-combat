import * as THREE from 'three'
import { SX, SZ, WATER_LEVEL, WORLD_VOX } from './gen/common'

export const WATER_Y = WATER_LEVEL * WORLD_VOX

/**
 * The fouled stream.
 *
 * This is a real 3D water surface rather than a tinted plane:
 *
 *  - the mesh is displaced by summed Gerstner waves, so the surface has
 *    actual geometry and a silhouette against the bank;
 *  - a heightfield texture gives the shader the true depth of water at every
 *    point, which drives absorption, wave amplitude, foam and flow speed;
 *  - the flow field follows the channels — the tributary runs north, the
 *    river runs east — and everything on the surface is advected along it;
 *  - white water appears where the bed is shallow and steep, which is where
 *    a real stream breaks;
 *  - refraction is screen-space: the scene is rendered first, then sampled
 *    with an offset along the surface normal, so you see the bed bend.
 */
export class Water {
  readonly mesh: THREE.Mesh
  readonly material: THREE.ShaderMaterial
  private readonly renderTarget: THREE.WebGLRenderTarget

  constructor(heights: Int16Array, sunDir: THREE.Vector3) {
    // ---- depth field ------------------------------------------------------
    // Texture holds water depth in metres; 0 means dry land.
    const depth = new Float32Array(SX * SZ)
    for (let i = 0; i < SX * SZ; i++) {
      depth[i] = Math.max(0, (WATER_LEVEL - heights[i]) * WORLD_VOX)
    }
    const depthTex = new THREE.DataTexture(depth, SX, SZ, THREE.RedFormat, THREE.FloatType)
    depthTex.minFilter = THREE.LinearFilter
    depthTex.magFilter = THREE.LinearFilter
    depthTex.wrapS = depthTex.wrapT = THREE.ClampToEdgeWrapping
    depthTex.needsUpdate = true

    this.renderTarget = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
    })

    const w = SX * WORLD_VOX
    const d = SZ * WORLD_VOX

    // Dense enough that Gerstner displacement reads as geometry, not as a
    // normal map: ~4 cm of surface per vertex near the camera.
    const geom = new THREE.PlaneGeometry(w, d, 420, 330)
    geom.rotateX(-Math.PI / 2)
    geom.translate(w / 2, WATER_Y, d / 2)

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uDepthMap: { value: depthTex },
        uSize: { value: new THREE.Vector2(w, d) },
        uWaterY: { value: WATER_Y },
        uSun: { value: sunDir.clone() },
        uSunColor: { value: new THREE.Color(0xffd3a1) },
        uSkyColor: { value: new THREE.Color(0x9fc0d8) },
        uShallow: { value: new THREE.Color(0x5a6b4a) },
        uDeep: { value: new THREE.Color(0x1f2c26) },
        uScum: { value: new THREE.Color(0x9aa88c) },
        uFoam: { value: new THREE.Color(0xdfe4d8) },
        uScene: { value: this.renderTarget.texture },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uRiverBankZ: { value: 268 * WORLD_VOX },
        uFogColor: { value: new THREE.Color(0xa8b6ae) },
        uFogDensity: { value: 0.026 },
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
    this.renderTarget.setSize(w, h)
    this.material.uniforms.uResolution.value.set(w, h)
  }

  /**
   * Render the scene without the water, so the water shader has something to
   * refract. Call immediately before the main render.
   */
  captureBackdrop(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.mesh.visible = false
    const prevTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(this.renderTarget)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.setRenderTarget(prevTarget)
    this.mesh.visible = true
  }

  update(t: number) {
    this.material.uniforms.uTime.value = t
  }
}

const COMMON = /* glsl */`
  uniform float uTime;
  uniform sampler2D uDepthMap;
  uniform vec2 uSize;
  uniform float uRiverBankZ;

  float waterDepth(vec2 p) {
    vec2 uv = p / uSize;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return texture2D(uDepthMap, uv).r;
  }

  // Flow field: the tributary runs north into the river, the river runs east.
  // Speed rises in the narrow channel and falls off in the slack shallows.
  vec2 flowDir(vec2 p) {
    float inRiver = smoothstep(uRiverBankZ - 1.2, uRiverBankZ + 1.6, p.y);
    vec2 dir = mix(vec2(0.12, 1.0), vec2(1.0, 0.1), inRiver);
    return normalize(dir);
  }

  float flowSpeed(vec2 p) {
    float d = waterDepth(p);
    // Shallow, confined water moves fastest; deep slack water barely moves.
    return mix(0.08, 0.55, smoothstep(0.05, 0.4, d) * (1.0 - smoothstep(0.9, 2.2, d)));
  }

  // One Gerstner wave: returns displacement, accumulates analytic normal.
  vec3 gerstner(vec2 p, vec2 dir, float steepness, float wavelength, float t, inout vec3 tangent, inout vec3 binormal) {
    float k = 6.28318 / wavelength;
    float c = sqrt(9.81 / k);
    vec2 dn = normalize(dir);
    float f = k * (dot(dn, p) - c * t);
    float a = steepness / k;

    tangent += vec3(
      -dn.x * dn.x * steepness * sin(f),
      dn.x * steepness * cos(f),
      -dn.x * dn.y * steepness * sin(f)
    );
    binormal += vec3(
      -dn.x * dn.y * steepness * sin(f),
      dn.y * steepness * cos(f),
      -dn.y * dn.y * steepness * sin(f)
    );
    return vec3(dn.x * a * cos(f), a * sin(f), dn.y * a * cos(f));
  }
`

const VERT = /* glsl */`
  precision highp float;
  ${COMMON}

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vDepth;
  varying vec4 vScreen;

  void main() {
    vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 xz = p.xz;

    float depth = waterDepth(xz);
    vDepth = depth;

    // Waves fade out as the water shallows, so nothing pokes through the bank.
    float amp = smoothstep(0.0, 0.55, depth);

    vec3 tangent = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);
    vec3 disp = vec3(0.0);

    vec2 fd = flowDir(xz);
    float spd = flowSpeed(xz);
    float t = uTime;

    // A few crossed Gerstner waves aligned roughly with the current.
    disp += gerstner(xz, fd,                         0.055 * amp, 2.6,  t * spd * 1.6, tangent, binormal);
    disp += gerstner(xz, normalize(fd + vec2(0.6, -0.4)), 0.040 * amp, 1.3,  t * spd * 2.1, tangent, binormal);
    disp += gerstner(xz, normalize(fd + vec2(-0.5, 0.7)), 0.030 * amp, 0.72, t * spd * 2.8, tangent, binormal);
    disp += gerstner(xz, normalize(fd * 0.3 + vec2(1.0, 0.2)), 0.022 * amp, 0.34, t * 2.2, tangent, binormal);

    // Chop over a shallow, broken bed: the stream trips on its own bottom.
    float bedSlope = abs(waterDepth(xz + vec2(0.12, 0.0)) - waterDepth(xz - vec2(0.12, 0.0)))
                   + abs(waterDepth(xz + vec2(0.0, 0.12)) - waterDepth(xz - vec2(0.0, 0.12)));
    float turbulence = smoothstep(0.02, 0.22, bedSlope) * (1.0 - smoothstep(0.05, 0.6, depth));
    disp.y += sin(xz.x * 22.0 + t * 7.0) * cos(xz.y * 19.0 - t * 5.5) * 0.012 * turbulence;

    vec3 worldPos = p + disp;
    vNormal = normalize(cross(binormal, tangent));
    vWorld = worldPos;

    vec4 clip = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
    vScreen = clip;
    gl_Position = clip;
  }
`

const FRAG = /* glsl */`
  precision highp float;
  ${COMMON}

  uniform vec3 uSun, uSunColor, uSkyColor, uShallow, uDeep, uScum, uFoam;
  uniform sampler2D uScene;
  uniform vec2 uResolution;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vDepth;
  varying vec4 vScreen;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += vnoise(p) * a; p *= 2.07; a *= 0.5; }
    return s;
  }

  void main() {
    if (vDepth <= 0.004) discard;  // dry land

    vec2 xz = vWorld.xz;
    vec2 fd = flowDir(xz);
    float spd = flowSpeed(xz);
    float t = uTime;

    // Surface detail advected downstream.
    vec2 drift = fd * spd * t;
    float n1 = fbm(xz * 3.1 - drift * 1.0);
    float n2 = fbm(xz * 9.0 - drift * 1.7 + 11.3);

    // Perturb the analytic wave normal with fine ripples.
    vec3 N = normalize(vNormal + vec3((n2 - n1) * 0.55, 0.0, (n1 - n2) * 0.55));

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uSun);

    // ---- refraction: sample the already-rendered scene, offset by the normal
    vec2 uv = (vScreen.xy / vScreen.w) * 0.5 + 0.5;
    float bend = clamp(vDepth * 0.5, 0.0, 1.0) * 0.045;
    vec2 ruv = clamp(uv + N.xz * bend, vec2(0.001), vec2(0.999));
    vec3 bed = texture2D(uScene, ruv).rgb;

    // ---- absorption: Beer-Lambert through the water column
    vec3 extinction = vec3(1.6, 1.05, 1.35);     // fouled water kills red and blue
    vec3 throughWater = exp(-extinction * vDepth * 1.9);
    vec3 bodyColor = mix(uDeep, uShallow, throughWater.g);
    vec3 col = mix(bodyColor, bed * mix(vec3(0.55, 0.72, 0.62), vec3(1.0), throughWater), throughWater * 0.92);

    // ---- scum: a floating film, thickest in the tributary, smearing downstream
    float corridor = 1.0 - smoothstep(0.4, 2.9, abs(xz.x - 8.4 - sin(xz.y * 0.42) * 1.1));
    float downstream = smoothstep(9.6, 13.2, xz.y) * 0.5;
    float film = smoothstep(0.44, 0.8, n1 * 0.78 + n2 * 0.32) * clamp(corridor + downstream, 0.0, 1.0);
    col = mix(col, uScum, film * 0.8);

    // ---- white water where the bed is shallow and broken
    float bedSlope = abs(waterDepth(xz + vec2(0.12, 0.0)) - waterDepth(xz - vec2(0.12, 0.0)))
                   + abs(waterDepth(xz + vec2(0.0, 0.12)) - waterDepth(xz - vec2(0.0, 0.12)));
    float turbulence = smoothstep(0.015, 0.2, bedSlope) * (1.0 - smoothstep(0.08, 0.7, vDepth));
    float churn = smoothstep(0.45, 0.85, fbm(xz * 7.0 - drift * 3.0 + vec2(0.0, t * 0.6)));
    float foam = turbulence * churn;

    // Lace of foam right at the waterline.
    float edge = (1.0 - smoothstep(0.0, 0.09, vDepth)) * smoothstep(0.3, 0.75, fbm(xz * 11.0 - drift * 2.2));
    foam = clamp(foam + edge, 0.0, 1.0);
    col = mix(col, uFoam, foam * 0.85);

    // ---- lighting
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    col = mix(col, uSkyColor, fres * 0.55 * (1.0 - foam * 0.7));

    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 220.0);
    col += uSunColor * spec * 2.4 * (1.0 - foam * 0.8) * (1.0 - film * 0.5);

    // Glitter: tiny sun sparks riding the current.
    float sparkle = pow(max(0.0, fbm(xz * 26.0 - drift * 5.0)), 7.0);
    col += uSunColor * sparkle * 1.4 * (1.0 - film);

    // Sun scattering through shallow water gives it some life.
    col += uSunColor * 0.14 * exp(-vDepth * 3.0) * max(0.0, dot(N, L));

    // Match the scene's exponential-squared fog so the far bank recedes.
    float dist = length(cameraPosition - vWorld);
    float fogFactor = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
    col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

    float alpha = clamp(mix(0.62, 0.99, vDepth * 1.8) + foam * 0.5 + film * 0.35, 0.0, 1.0);
    alpha = mix(alpha, 1.0, clamp(fogFactor, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
