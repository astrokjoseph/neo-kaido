import * as THREE from 'three';
import { U } from '../config.js';
import { GLSL_NOISE } from './glsl.js';

// Procedural facade material. Windows, floors, storefronts and neon trims are all
// computed in the shader from world height and the instance's face size, so one
// material dresses every tower shape. Distant cells fade to their average
// brightness (shader LOD) which kills moiré on far skylines.
//
// Per-instance attributes:
//   aB0   : x style(0..4) y seed z lit fraction w trim mode(0..4)
//   aTrim : trim colour (linear, HDR)

const cache = new Map();

export function createBuildingMaterial(shape = 'box', segments = 4) {
  const key = shape + segments;
  if (cache.has(key)) return cache.get(key);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.2, envMapIntensity: 0.9 });
  mat.defines = { SEGMENTS: segments.toFixed(1) };
  if (shape === 'box') mat.defines.SHAPE_BOX = '';
  mat.customProgramCacheKey = () => 'bld-' + key;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uNight = U.uNight;
    shader.uniforms.uNeon = U.uNeon;
    shader.uniforms.uRain = U.uRain;
    shader.uniforms.uBlackout = mat.userData.blackout;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aB0; attribute vec3 aTrim;
        varying vec3 vObjN; varying vec3 vLocal; varying vec3 vScale; varying vec4 vB0; varying vec3 vTrimC; varying vec3 vBWPos; varying vec2 vFUv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 iScale = vec3(1.0);
        mat4 bIm = mat4(1.0);
        #ifdef USE_INSTANCING
          bIm = instanceMatrix;
          iScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        #endif
        vObjN = normal; vLocal = position * iScale; vScale = iScale; vB0 = aB0; vTrimC = aTrim; vFUv = uv;
        vBWPos = (modelMatrix * bIm * vec4(position, 1.0)).xyz;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uNight; uniform float uNeon; uniform float uRain; uniform vec4 uBlackout;
        varying vec3 vObjN; varying vec3 vLocal; varying vec3 vScale; varying vec4 vB0; varying vec3 vTrimC; varying vec3 vBWPos; varying vec2 vFUv;
        ${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float style = vB0.x; float seed = vB0.y; float litF = vB0.z; float trimMode = vB0.w;
        // blackout: uBlackout.xy = seed range, z = strength
        if (abs(seed - uBlackout.x) < 0.001) litF *= (1.0 - uBlackout.z);
        vec3 on = normalize(vObjN);
        bool isRoof = on.y > 0.5;
        bool isBottom = on.y < -0.5;
        float faceW;
        float cells;
        vec4 sp;
        if (style < 0.5) sp = vec4(3.2, 3.8, 0.13, 0.2);
        else if (style < 1.5) sp = vec4(1.6, 4.0, 0.025, 0.3);
        else if (style < 2.5) sp = vec4(2.4, 3.6, 0.33, 0.04);
        else if (style < 3.5) sp = vec4(4.2, 4.2, 0.025, 0.05);
        else sp = vec4(2.6, 3.1, 0.24, 0.27);
        #ifdef SHAPE_BOX
          faceW = abs(on.x) > 0.5 ? vScale.z : vScale.x;
          cells = max(1.0, floor(faceW / sp.x + 0.5));
        #else
          faceW = SEGMENTS * vScale.x * sin(3.14159265 / SEGMENTS);
          cells = SEGMENTS * max(1.0, floor(faceW / SEGMENTS / sp.x + 0.5));
        #endif
        float wy = vBWPos.y;
        vec2 c = vec2(vFUv.x * cells, wy / sp.y);
        vec2 fw = max(fwidth(c), vec2(1e-4));
        vec2 f = fract(c);
        vec2 m = sp.zw;
        vec2 w2 = smoothstep(m - fw, m + fw, f) * (1.0 - smoothstep(1.0 - m - fw, 1.0 - m + fw, f));
        float cov = (1.0 - 2.0 * m.x) * (1.0 - 2.0 * m.y);
        float lod = smoothstep(0.22, 0.85, max(fw.x, fw.y));
        vec2 cid = floor(c);
        // group neighbouring cells into "rooms" so lights come in clusters
        vec2 room = vec2(floor(cid.x / (1.0 + floor(hash11(cid.y + seed) * 3.0))), cid.y);
        float h1 = hash12(room + seed * 17.13);
        float h2 = hash12(room.yx * 1.37 + seed * 3.1 + 5.0);
        float litP = clamp(litF * (0.15 + 0.85 * uNight), 0.0, 1.0);
        float lit = step(1.0 - litP, h1);
        float flick = 1.0;
        if (h2 > 0.965) flick = 0.55 + 0.45 * sin(uTime * (6.0 + h1 * 24.0) + h2 * 50.0) * sin(uTime * 2.3 + h1 * 9.0);
        vec3 warm = vec3(1.0, 0.62, 0.32); vec3 cool = vec3(0.55, 0.8, 1.0); vec3 whiteL = vec3(1.0, 0.9, 0.78);
        vec3 wc = h2 < 0.45 ? warm : (h2 < 0.8 ? whiteL : cool);
        if (style > 3.5 && h2 > 0.86) wc = mix(vec3(1.0, 0.15, 0.55), vec3(0.2, 1.0, 0.85), step(0.93, h2));
        if (style > 2.5 && style < 3.5) wc = mix(wc, cool, 0.6);
        float blinds = 0.7 + 0.3 * smoothstep(0.3, 0.7, fract(f.y * 5.0 + h2 * 3.0));
        float inten = (0.18 + 0.62 * fract(h1 * 7.31)) * flick * blinds;
        float wmask = w2.x * w2.y;
        vec3 cellE = wc * inten * lit * wmask;
        vec3 avgE = (warm * 0.45 + whiteL * 0.35 + cool * 0.2) * litP * cov * 0.5;
        vec3 winE = mix(cellE, avgE, lod) * (0.6 + 0.4 * uNight);
        float glass = mix(wmask, cov, lod);

        vec3 wallCol = diffuseColor.rgb;
        float pn = hash12(floor(vec2(vFUv.x * faceW * 0.4, wy * 0.35)) + seed);
        wallCol *= 0.8 + 0.4 * pn;
        // rain streak grime running down the facade
        float streak = vnoise(vec2(vFUv.x * faceW * 1.7, wy * 0.04 + seed));
        wallCol *= 0.75 + 0.35 * streak;
        vec3 glassCol = vec3(0.012, 0.016, 0.024);
        float roughB = mix(0.72, 0.08, glass);
        float metalB = mix(0.15, 0.85, glass);

        float tierBase = vBWPos.y - vLocal.y;
        // street-level storefronts
        if (!isRoof && !isBottom && tierBase < 1.0 && wy < 6.2) {
          float sc = vFUv.x * faceW / 6.0; float sid = floor(sc); float sf = fract(sc);
          float hs = hash12(vec2(sid, seed * 9.1));
          vec3 shopCol = hs < 0.3 ? vec3(1.0, 0.75, 0.45) : (hs < 0.5 ? vec3(0.5, 0.9, 1.0) : (hs < 0.7 ? vec3(1.0, 0.25, 0.6) : (hs < 0.85 ? vec3(0.65, 0.4, 1.0) : vec3(1.0, 0.95, 0.85))));
          float sfw = fwidth(sc) * 1.5;
          float shopMask = smoothstep(0.05 - sfw, 0.05 + sfw, sf) * (1.0 - smoothstep(0.95 - sfw, 0.95 + sfw, sf)) * smoothstep(0.3, 0.4, wy) * (1.0 - smoothstep(3.5, 3.6, wy));
          float shut = step(0.88, hs);
          float band = smoothstep(4.0, 4.1, wy) * (1.0 - smoothstep(5.3, 5.4, wy)) * step(0.3, fract(hs * 7.0));
          winE = shopCol * shopMask * (1.0 - shut) * (0.7 + 0.4 * fract(hs * 13.0)) + shopCol * band * 1.6 * uNeon;
          glass = shopMask;
          wallCol = mix(wallCol, vec3(0.03), shut * shopMask);
          roughB = mix(0.7, 0.05, shopMask);
          metalB = mix(0.1, 0.4, shopMask);
        }

        vec3 trimE = vec3(0.0);
        if (!isRoof && !isBottom) {
          float tm = trimMode;
          if (tm > 0.5 && tm < 1.5) {
            #ifdef SHAPE_BOX
              float uu = vFUv.x * faceW; float ed = min(uu, faceW - uu);
            #else
              float sg = fract(vFUv.x * SEGMENTS); float ed = min(sg, 1.0 - sg) * faceW / SEGMENTS;
            #endif
            float ew = fwidth(ed) + 0.02;
            trimE += vTrimC * (1.0 - smoothstep(0.18, 0.18 + ew * 2.0, ed)) * 2.6;
          } else if (tm < 2.5) {
            float top = vScale.y - vLocal.y;
            float tw = fwidth(top);
            trimE += vTrimC * (smoothstep(0.25 - tw, 0.25 + tw, top) * (1.0 - smoothstep(1.05 - tw, 1.05 + tw, top))) * 2.8;
            trimE += vTrimC * (1.0 - smoothstep(0.08, 0.08 + tw * 2.0, abs(top - 2.1))) * 2.0;
          } else if (tm < 3.5) {
            float per = sp.y * 6.0; float b = abs(fract(wy / per) - 0.5) * per;
            float bw = fwidth(b) * 1.5 + 0.02;
            trimE += vTrimC * (1.0 - smoothstep(0.12, 0.12 + bw, b)) * 1.8;
          } else {
            // chase lines running up vertical mullions
            float cu = fract(vFUv.x * cells / 3.0); float d = min(cu, 1.0 - cu) * faceW / cells * 3.0;
            float dw = fwidth(d) + 0.02;
            float pulse = pow(fract(wy * 0.012 - uTime * 0.35 + seed), 6.0);
            trimE += vTrimC * (1.0 - smoothstep(0.1, 0.1 + dw * 2.0, d)) * (0.3 + 3.0 * pulse);
          }
          trimE *= (0.3 + 0.7 * uNight) * uNeon;
        }
        if (isRoof) {
          vec2 rg = abs(fract(vLocal.xz * 0.25) - 0.5);
          wallCol *= 0.45 + 0.15 * step(0.46, max(rg.x, rg.y));
          winE = vec3(0.0); glass = 0.0; roughB = 0.35 + 0.4 * (1.0 - uRain); metalB = 0.1;
          vec2 ed = (vScale.xz * 0.5 - abs(vLocal.xz));
          float edge = min(ed.x, ed.y);
          trimE += vTrimC * (1.0 - smoothstep(0.15, 0.35, edge)) * step(0.5, trimMode) * 2.0 * uNeon * (0.3 + 0.7 * uNight);
        }
        if (isBottom) { winE = vec3(0.0); trimE = vec3(0.0); }
        diffuseColor.rgb = mix(wallCol, glassCol, glass);
        `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = roughB * mix(1.0, 0.6, uRain * (1.0 - glass));`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = metalB;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += trimE;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        #ifdef FOG_EXP2
          float winT = 1.0 - cityFogAmount(vBWPos, fogDensity * 0.5);
        #else
          float winT = 1.0;
        #endif
        gl_FragColor.rgb += winE * winT;`);
  };
  mat.userData.blackout = { value: new THREE.Vector4(-1, 0, 0, 0) };
  cache.set(key, mat);
  return mat;
}

/** Share one blackout uniform across every building material so inspecting a tower can switch it off. */
export function setBlackout(seed, strength) {
  for (const m of cache.values()) m.userData.blackout.value.set(seed, 0, strength, 0);
}
