import * as THREE from 'three';
import { Rand, U } from '../config.js';
import { ChunkedInstances, composeMatrix } from './chunks.js';
import * as G from './geom.js';

// Animated advertising: wall billboards (slide-switching between two ads with a
// wipe), giant vertical banners, double-sided blade signs, rooftop boards.

export function createSignMaterial(atlas) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsLib.fog,
      tAtlas: { value: atlas.texture }, uTime: U.uTime, uNight: U.uNight, uNeon: U.uNeon,
      uHack: { value: new THREE.Vector2(-1, -100) },
    },
    fog: true,
    vertexShader: /* glsl */`
      attribute vec4 aTileA; attribute vec4 aTileB; attribute vec4 aParams;
      varying vec2 vUv0; varying vec4 vTA; varying vec4 vTB; varying vec4 vP;
      #include <fog_pars_vertex>
      void main(){
        vUv0 = uv; vTA = aTileA; vTB = aTileB; vP = aParams;
        #include <begin_vertex>
        #include <project_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tAtlas; uniform float uTime; uniform float uNight; uniform float uNeon; uniform vec2 uHack;
      varying vec2 vUv0; varying vec4 vTA; varying vec4 vTB; varying vec4 vP;
      #include <fog_pars_fragment>
      float hh(float x){ return fract(sin(x * 91.17) * 43758.5453); }
      void main(){
        float seed = vP.x; float anim = vP.y; float bright = vP.z; float period = vP.w;
        vec2 uv = vUv0;
        float hack = abs(seed - uHack.x) < 0.0005 ? exp(-(uTime - uHack.y) * 0.8) : 0.0;
        float natural = step(0.985, hh(floor(uTime * 6.0) + seed * 13.0)) * step(0.5, anim);
        float g = max(hack, natural * 0.6);
        float row = floor(uv.y * 24.0);
        uv.x += (hh(row + floor(uTime * 24.0)) - 0.5) * 0.25 * g * step(0.6, hh(row * 3.1 + floor(uTime * 10.0)));
        uv = clamp(uv, 0.002, 0.998);
        float cyc = (uTime + seed * 37.0) / period;
        float ph = fract(cyc);
        float odd = mod(floor(cyc), 2.0);
        float wipe = smoothstep(0.9, 1.0, ph);
        float useB = abs(odd - step(uv.x + uv.y * 0.3, wipe * 1.3));
        vec4 TA = useB > 0.5 ? vTB : vTA;
        vec3 col = texture2D(tAtlas, mix(TA.xy, TA.zw, uv)).rgb;
        if (g > 0.01) {
          vec3 cr = texture2D(tAtlas, mix(TA.xy, TA.zw, uv + vec2(0.01 * g, 0.0))).rgb;
          col.r = cr.r;
          col = mix(col, vec3(0.2, 1.0, 0.9) * step(0.5, hh(row + uTime)), 0.25 * g);
        }
        float wipeLine = (1.0 - smoothstep(0.0, 0.02, abs(uv.x + uv.y * 0.3 - wipe * 1.3))) * step(0.01, wipe) * step(wipe, 0.99);
        col += vec3(1.0) * wipeLine * 2.0;
        // LED sub-pixel grid & scan
        col *= 0.82 + 0.18 * smoothstep(0.2, 0.5, abs(fract(vUv0.y * 140.0) - 0.5));
        col *= 0.9 + 0.1 * sin(vUv0.y * 6.0 - uTime * 3.0);
        // occasional dying tube flicker
        if (anim > 1.5) col *= mix(1.0, step(0.25, hh(floor(uTime * 15.0) + seed)), step(0.7, hh(floor(uTime * 0.5) + seed)));
        float l = max(col.r, max(col.g, col.b));
        col = col * (0.35 + bright * smoothstep(0.2, 1.0, l)) * (0.45 + 0.55 * uNight) * uNeon;
        gl_FragColor = vec4(col, 1.0);
        #ifdef FOG_EXP2
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, cityFogAmount(vFogWorldPos, fogDensity * 0.5));
        #endif
      }`,
  });
}

export function buildSigns(layout, atlas, group) {
  const R = new Rand(321);
  const boards = []; // wall billboards + banners + rooftop boards (single-sided)
  const blades = []; // double-sided blade signs
  const out = { sets: [], lights: [], inspect: [], boards, blades };
  const rotOut = (n) => (n[0] === 1 ? Math.PI / 2 : n[0] === -1 ? -Math.PI / 2 : n[1] === 1 ? 0 : Math.PI);
  const at = (f, u, off) => (f.n[0] !== 0 ? { x: f.plane + f.n[0] * off, z: u } : { x: u, z: f.plane + f.n[1] * off });
  let seedCounter = 1;
  const nextSeed = () => (seedCounter++) * 0.0137 % 1 + 0.0001 * seedCounter;

  for (const f of layout.faces) {
    if (!f.street) continue;
    const len = f.u1 - f.u0;
    // wall billboards
    if (len > 12 && f.y1 > 26 && R.chance(0.42)) {
      const w = Math.min(len * R.range(0.55, 0.85), 30);
      const h = w / 2;
      const yLo = Math.max(f.y0 + h / 2 + 2, 22 + h / 2), yHi = Math.min(f.y1 - h / 2 - 3, 95);
      if (yHi > yLo) {
        const a = R.int(0, 15); let b = R.int(0, 15); if (b === a) b = (a + 5) % 16;
        boards.push({ ...at(f, R.range(f.u0 + w / 2 + 0.5, f.u1 - w / 2 - 0.5), 0.35), y: R.range(yLo, yHi), rot: rotOut(f.n), w, h, tA: atlas.wide[a], tB: atlas.wide[b], seed: nextSeed(), anim: R.chance(0.3) ? 1 : 0, bright: R.range(2.2, 3.4), period: R.range(9, 16), kind: 'billboard', n: f.n });
      }
    }
    // giant vertical banners
    if (f.y1 > 60 && len > 6 && R.chance(0.22)) {
      const w = R.range(4, 6), h = w * 4;
      const y = R.range(Math.max(f.y0, 24) + h / 2, Math.min(f.y1 - h / 2 - 2, 120));
      if (y > 24 + h / 2 - 0.1) {
        const a = R.int(0, 31), b = (a + R.int(3, 20)) % 32;
        const u = R.chance(0.5) ? f.u0 + w / 2 + 0.8 : f.u1 - w / 2 - 0.8;
        boards.push({ ...at(f, u, 0.4), y, rot: rotOut(f.n), w, h, tA: atlas.vert[a], tB: atlas.vert[b], seed: nextSeed(), anim: 0, bright: 3.2, period: R.range(12, 22), kind: 'banner', n: f.n });
      }
    }
    // blade signs at street level
    if (f.ground) {
      const n = Math.floor(len / 8);
      for (let k = 0; k < n; k++) {
        if (!R.chance(0.55)) continue;
        const h = R.range(4.5, 10), w = R.range(1.2, 1.8);
        const u = f.u0 + (k + R.range(0.2, 0.8)) * (len / n);
        const t = R.int(0, 31);
        blades.push({ ...at(f, u, w / 2 + 0.35), y: R.range(5.2, 9) + h / 2, rot: Math.atan2(-f.n[1], f.n[0]), w, h, tA: atlas.vert[t], tB: atlas.vert[(t + R.int(1, 31)) % 32], seed: nextSeed(), anim: R.chance(0.25) ? 2 : (R.chance(0.3) ? 1 : 0), bright: R.range(2.6, 4), period: R.range(14, 30), kind: 'blade', n: f.n });
      }
    }
  }
  // rooftop boards on mid-rise roofs
  for (const b of layout.buildings) {
    const t = b.top;
    if (!t || t.shape !== 'box' || Math.abs(t.rot) > 1e-3 || t.y + t.sy > 140 || t.sx < 14 || !R.chance(0.3)) continue;
    const w = Math.min(t.sx * 0.8, 22), h = w * 0.45;
    const a = R.int(0, 15);
    boards.push({ x: t.x, z: t.z + t.sz * 0.25, y: t.y + t.sy + 2.5 + h / 2, rot: R.pick([0, Math.PI]), w, h, tA: atlas.wide[a], tB: atlas.wide[(a + 7) % 16], seed: nextSeed(), anim: 0, bright: 3, period: 14, kind: 'rooftop', n: [0, 1], strut: true });
  }

  const mat = createSignMaterial(atlas);
  out.material = mat;
  const plane = new THREE.PlaneGeometry(1, 1);
  const attrs = { aTileA: 4, aTileB: 4, aParams: 4 };
  const writeAttrs = (s, i, a) => {
    a.aTileA.setXYZW(i, s.tA.u0, s.tA.v0, s.tA.u1, s.tA.v1);
    a.aTileB.setXYZW(i, s.tB.u0, s.tB.v0, s.tB.u1, s.tB.v1);
    a.aParams.setXYZW(i, s.seed, s.anim, s.bright, s.period);
  };
  const boardSet = new ChunkedInstances({
    items: boards, geometry: plane, material: mat, chunk: 410, attributes: attrs, group,
    write: { pos: (s) => s, matrix: (s, m) => composeMatrix(m, s.x, s.y, s.z, s.rot, s.w, s.h, 1), attrs: writeAttrs },
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x101116, roughness: 0.5, metalness: 0.7 });
  const frameGeo = G.merge([
    { geo: new THREE.BoxGeometry(1, 1, 1), matrix: G.M(0, 0, -0.25, 0, 0, 0, 1.04, 1.06, 0.4) },
  ]);
  const frames = new ChunkedInstances({
    items: boards, geometry: frameGeo, material: frameMat, chunk: 410, castShadow: true, group,
    write: { pos: (s) => s, matrix: (s, m) => composeMatrix(m, s.x, s.y, s.z, s.rot, s.w, s.h, 1) },
  });
  const struts = boards.filter((s) => s.strut);
  const strutSet = new ChunkedInstances({
    items: struts, geometry: G.merge([-0.35, 0, 0.35].map((x) => ({ geo: new THREE.BoxGeometry(0.014, 1, 0.25), matrix: G.M(x, -0.5, -0.4) }))), material: frameMat, chunk: 410, group,
    write: { pos: (s) => s, matrix: (s, m) => composeMatrix(m, s.x, s.y - s.h / 2, s.z, s.rot, s.w, 2.5, 1) },
  });

  // blade signs: back-to-back planes + a slim cabinet
  const bladeGeo = G.merge([
    { geo: new THREE.PlaneGeometry(1, 1), matrix: G.M(0, 0, 0.16) },
    { geo: new THREE.PlaneGeometry(1, 1), matrix: G.M(0, 0, -0.16, 0, Math.PI, 0) },
  ]);
  const bladeSet = new ChunkedInstances({
    items: blades, geometry: bladeGeo, material: mat, chunk: 328, attributes: attrs, maxDist: 520, group,
    write: { pos: (s) => s, matrix: (s, m) => composeMatrix(m, s.x, s.y, s.z, s.rot, s.w, s.h, 1), attrs: writeAttrs },
  });
  const bladeBox = new ChunkedInstances({
    items: blades, geometry: G.merge([{ geo: new THREE.BoxGeometry(1.08, 1.04, 0.3) }, { geo: new THREE.BoxGeometry(0.08, 0.08, 1), matrix: G.M(-0.45, 0.42, 0, 0, Math.PI / 2, 0, 1, 1, 0.5) }]),
    material: frameMat, chunk: 328, maxDist: 420, group,
    write: { pos: (s) => s, matrix: (s, m) => composeMatrix(m, s.x, s.y, s.z, s.rot, s.w, s.h, 1) },
  });

  for (const set of [boardSet, bladeSet]) for (const m of set.meshes) m.userData.kind = 'sign';
  out.sets.push(boardSet, frames, strutSet, bladeSet, bladeBox);
  out.inspect.push(...boardSet.meshes, ...bladeSet.meshes);
  out.boardSet = boardSet; out.bladeSet = bladeSet;

  for (const s of boards) {
    if (s.kind === 'rooftop') continue;
    out.lights.push({ x: s.x + s.n[0] * 5, y: s.y - s.h * 0.3, z: s.z + s.n[1] * 5, color: s.tA.color.clone(), power: s.w * 6 });
  }
  for (const s of blades) out.lights.push({ x: s.x + s.n[0] * 0.8, y: s.y - s.h * 0.3, z: s.z + s.n[1] * 0.8, color: s.tA.color.clone(), power: 9 });
  return out;
}
