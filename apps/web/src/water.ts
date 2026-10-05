import * as THREE from 'three'
import { SX, SZ, WATER_LEVEL, WORLD_VOX } from './gen/common'

export const WATER_Y = WATER_LEVEL * WORLD_VOX

/**
 * The water surface. One plane across the whole scene at the waterline —
 * it is only visible where the terrain has been carved below it.
 * Scum concentrates along the tributary and smears out into the river.
 */
export function makeWater(): THREE.Mesh {
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
