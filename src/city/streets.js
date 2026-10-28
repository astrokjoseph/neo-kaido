import * as THREE from 'three';
import { CFG, Rand, NEON_LIST, U, streetLine, HALF } from '../config.js';
import { createWetMaterial } from '../fx/wetMaterial.js';
import { createGlowMaterial, createBeamMaterial } from '../fx/materials.js';
import { ChunkedInstances, composeMatrix } from './chunks.js';
import * as G from './geom.js';

const ARM_ROT = (nx, nz) => (nx === 1 ? 0 : nx === -1 ? Math.PI : nz === 1 ? -Math.PI / 2 : Math.PI / 2);

export function buildStreets(layout, reflection, group) {
  const R = new Rand(99);
  const out = { sets: [], lights: [], steam: [], inspect: [], vending: [], kiosks: [] };
  const metal = new THREE.MeshStandardMaterial({ color: 0x1d2027, roughness: 0.38, metalness: 0.85 });
  const darkPaint = new THREE.MeshStandardMaterial({ color: 0x15161b, roughness: 0.55, metalness: 0.4 });

  // ---- ground ----
  const groundMat = createWetMaterial('road', reflection);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true;
  ground.layers.set(1);
  group.add(ground);

  const walkMat = createWetMaterial('walk', reflection);
  const sidewalks = new ChunkedInstances({
    items: layout.blocks, geometry: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), material: walkMat,
    chunk: 410, layer: 1, receiveShadow: true, group, name: 'sidewalk',
    write: { pos: (b) => ({ x: b.cx, z: b.cz }), matrix: (b, m) => composeMatrix(m, b.cx, 0, b.cz, 0, CFG.BLOCK, CFG.CURB, CFG.BLOCK) },
  });
  out.sets.push(sidewalks);

  const mainBlocks = layout.blocks.filter((b) => !b.outer);

  // ---- streetlights ----
  const lamps = [];
  for (const b of mainBlocks) {
    const e = CFG.BLOCK / 2 - 0.8;
    for (const o of [10, 32, 54]) {
      const u = -CFG.BLOCK / 2 + o;
      lamps.push({ x: b.cx + e, z: b.cz + u, nx: 1, nz: 0 });
      lamps.push({ x: b.cx - e, z: b.cz + u, nx: -1, nz: 0 });
      lamps.push({ x: b.cx + u, z: b.cz + e, nx: 0, nz: 1 });
      lamps.push({ x: b.cx + u, z: b.cz - e, nx: 0, nz: -1 });
    }
  }
  const slg = G.streetlightGeometry();
  const lampMatrix = (l, m) => composeMatrix(m, l.x, CFG.CURB, l.z, ARM_ROT(l.nx, l.nz), 1, 1, 1);
  out.sets.push(new ChunkedInstances({ items: lamps, geometry: slg.body, material: metal, chunk: 328, maxDist: 650, castShadow: true, group, write: { pos: (l) => l, matrix: lampMatrix } }));
  const lampGlow = createGlowMaterial({ colors: [new THREE.Color(1.0, 0.8, 0.6).multiplyScalar(9), new THREE.Color(NEON_LIST[1]).multiplyScalar(2.5)], night: 0.95 });
  out.sets.push(new ChunkedInstances({ items: lamps, geometry: slg.glow, material: lampGlow, chunk: 328, maxDist: 900, group, write: { pos: (l) => l, matrix: lampMatrix } }));
  // light cones
  const cone = new THREE.CylinderGeometry(0.35, 4.6, 7.0, 20, 1, true).translate(0, 3.5, 0);
  const coneMat = createBeamMaterial({ color: 0xffd9a8, intensity: 0.11, rainBoost: 0.7 });
  // uv.y of CylinderGeometry: 1 at top, so fade naturally strongest at the lamp head
  const cones = new ChunkedInstances({
    items: lamps, geometry: cone, material: coneMat, chunk: 328, maxDist: 260, layer: 2, receiveShadow: false, group,
    write: { pos: (l) => l, matrix: (l, m) => composeMatrix(m, l.x + l.nx * 2.55, CFG.CURB, l.z + l.nz * 2.55, 0, 1, 1, 1) },
  });
  for (const m of cones.meshes) m.renderOrder = 5;
  out.sets.push(cones);
  out.lamps = lamps;

  // ---- traffic signals at intersections ----
  const signals = [];
  for (let k = 0; k < CFG.GRID - 1; k++) {
    for (let l = 0; l < CFG.GRID - 1; l++) {
      const x = streetLine(k), z = streetLine(l);
      const c = CFG.STREET / 2 + 1.0;
      signals.push({ x: x + c, z: z + c, rot: Math.PI, phase: 0 });
      signals.push({ x: x - c, z: z - c, rot: 0, phase: 0 });
      signals.push({ x: x - c, z: z + c, rot: Math.PI / 2, phase: 1 });
      signals.push({ x: x + c, z: z - c, rot: -Math.PI / 2, phase: 1 });
    }
  }
  const tsg = G.trafficSignalGeometry();
  const sigMatrix = (s, m) => composeMatrix(m, s.x, CFG.CURB, s.z, s.rot, 1, 1, 1);
  out.sets.push(new ChunkedInstances({ items: signals, geometry: tsg.body, material: darkPaint, chunk: 328, maxDist: 450, group, write: { pos: (s) => s, matrix: sigMatrix } }));
  const sigMat = createGlowMaterial({
    colors: [0xff2020, 0xffaa10, 0x20ff70, 0xff2020, 0xffaa10, 0x20ff70].map((c) => new THREE.Color(c).multiplyScalar(5)),
    night: 0.4,
    anim: `
      float axis = mod(float(part), 3.0) < 0.5 ? 0.0 : 0.0;
      float ph = fract(uTime / 24.0 + (instanceMatrix[0].x * instanceMatrix[0].x > 0.5 ? 0.0 : 0.5));
      float state = ph < 0.42 ? 2.0 : (ph < 0.5 ? 1.0 : 0.0);
      float lampIdx = mod(float(part), 3.0);
      c *= abs(lampIdx - state) < 0.5 ? 1.0 : 0.04;`,
  });
  out.sets.push(new ChunkedInstances({ items: signals, geometry: tsg.lamps, material: sigMat, chunk: 328, maxDist: 600, group, write: { pos: (s) => s, matrix: sigMatrix } }));

  // ---- facade-mounted street props: vending machines, kiosks, awnings ----
  const vend = [], kiosks = [], awn = [], bollards = [];
  for (const f of layout.faces) {
    if (!f.street || !f.ground) continue;
    const len = f.u1 - f.u0;
    const place = (u, off) => {
      const nx = f.n[0], nz = f.n[1];
      return f.n[0] !== 0 ? { x: f.plane + nx * off, z: u, rot: nx === 1 ? Math.PI / 2 : -Math.PI / 2 } : { x: u, z: f.plane + nz * off, rot: nz === 1 ? 0 : Math.PI };
    };
    if (len > 10 && R.chance(0.55)) {
      const u = R.range(f.u0 + 2, f.u1 - 2);
      const p = place(u, 0.45);
      const brand = R.pick(['VOLT COLA', 'NEON TEA', 'SYNTH-O', 'HYDRA WATER', 'KAIJU COFFEE']);
      vend.push({ ...p, col: new THREE.Color(R.pick([0xff2a3a, 0x19e8ff, 0xffa53a, 0x6dff5a, 0xff2a8a])), brand });
      if (R.chance(0.4)) vend.push({ ...place(u + 1.15, 0.45), col: new THREE.Color(R.pick([0x19e8ff, 0xff2a8a, 0xffffff])), brand: 'NEON TEA' });
    }
    if (len > 14 && R.chance(0.22)) {
      const p = place(R.range(f.u0 + 3, f.u1 - 3), 0.9);
      kiosks.push({ ...p, name: R.pick(['Zero-G Ramen', 'Takoyaki Ghost', 'Dragon Dumplings', 'Midnight Yakitori', 'Soba-Bot 3000']) });
    }
    // awnings over storefronts
    const n = Math.floor(len / 7);
    for (let k = 0; k < n; k++) {
      if (!R.chance(0.45)) continue;
      const u = f.u0 + (k + 0.5) * (len / n);
      const p = place(u, 1.1);
      awn.push({ ...p, w: R.range(3, 5.5), col: new THREE.Color(R.pick(NEON_LIST)) });
    }
  }
  // bollards at block corners
  for (const b of mainBlocks) {
    if (b.plaza) continue;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      for (let k = 0; k < 3; k++) {
        bollards.push({ x: b.cx + sx * (CFG.BLOCK / 2 - 0.5), z: b.cz + sz * (CFG.BLOCK / 2 - 5.5 - k * 1.6) });
        bollards.push({ x: b.cx + sx * (CFG.BLOCK / 2 - 5.5 - k * 1.6), z: b.cz + sz * (CFG.BLOCK / 2 - 0.5) });
      }
    }
  }

  const vg = G.vendingGeometry();
  const vMat = (v, m) => composeMatrix(m, v.x, CFG.CURB, v.z, v.rot, 1, 1, 1);
  const vendBody = new ChunkedInstances({ items: vend, geometry: vg.body, material: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.5 }), chunk: 328, maxDist: 320, color: true, group, write: { pos: (v) => v, matrix: vMat, color: (v, c) => c.copy(v.col).multiplyScalar(0.35) } });
  const vendPanelMat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, uTime: U.uTime, uFlash: { value: new THREE.Vector4(0, 0, 0, -10) } },
    fog: true,
    vertexShader: `varying vec2 vUv2; varying vec3 vC; varying vec3 vWP;
      #include <fog_pars_vertex>
      void main(){ vUv2 = uv; vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #endif
        #include <begin_vertex>
        #include <project_vertex>
        vWP = (modelMatrix * instanceMatrix * vec4(position,1.0)).xyz;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform vec4 uFlash; varying vec2 vUv2; varying vec3 vC; varying vec3 vWP;
      #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 uv = vUv2;
        vec3 col = vC * (0.6 + 0.6 * uv.y);
        vec2 g = vec2(uv.x * 5.0, uv.y * 7.0); vec2 id = floor(g); vec2 f = fract(g);
        float slot = step(0.3, uv.y) * step(uv.y, 0.92);
        float can = smoothstep(0.42, 0.38, abs(f.x - 0.5)) * smoothstep(0.45, 0.35, abs(f.y - 0.5)) * slot;
        vec3 cc = mix(vec3(1.0,0.3,0.4), vec3(0.3,0.9,1.0), h(id)) * 1.6;
        col = mix(col, cc, can * 0.85);
        float logo = step(0.08, uv.y) * step(uv.y, 0.24) * step(0.1, uv.x) * step(uv.x, 0.9);
        col += vec3(1.5) * logo * step(0.5, fract(uv.x * 12.0 + uTime * 0.8)) * 0.35;
        float fl = exp(-max(uTime - uFlash.w, 0.0) * 3.0) * step(distance(vWP, uFlash.xyz), 2.0);
        col *= 1.8 + fl * 4.0;
        gl_FragColor = vec4(col, 1.0);
        #ifdef FOG_EXP2
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, cityFogAmount(vFogWorldPos, fogDensity * 0.6));
        #endif
      }`,
  });
  const vendPanel = new ChunkedInstances({ items: vend, geometry: vg.panel, material: vendPanelMat, chunk: 328, maxDist: 420, color: true, group, write: { pos: (v) => v, matrix: vMat, color: (v, c) => c.copy(v.col) } });
  for (const m of vendBody.meshes) m.userData.kind = 'vending';
  for (const m of vendPanel.meshes) m.userData.kind = 'vending';
  out.sets.push(vendBody, vendPanel);
  out.vending = vend; out.vendFlash = vendPanelMat.uniforms.uFlash;
  out.inspect.push(...vendBody.meshes, ...vendPanel.meshes);

  const kg = G.kioskGeometry();
  const kMat = (k, m) => composeMatrix(m, k.x, CFG.CURB, k.z, k.rot, 1, 1, 1);
  const kioskBody = new ChunkedInstances({ items: kiosks, geometry: kg.body, material: new THREE.MeshStandardMaterial({ color: 0x3a2a28, roughness: 0.6, metalness: 0.3 }), chunk: 328, maxDist: 320, castShadow: true, group, write: { pos: (k) => k, matrix: kMat } });
  const kioskGlow = new ChunkedInstances({
    items: kiosks, geometry: kg.glow, chunk: 328, maxDist: 420, group,
    material: createGlowMaterial({ colors: [new THREE.Color(1, 0.75, 0.4).multiplyScalar(4), new THREE.Color(1, 0.3, 0.5).multiplyScalar(2.2), new THREE.Color(1.0, 0.25, 0.08).multiplyScalar(4)], night: 0.6,
      anim: 'if (part == 2) c *= 0.85 + 0.15 * sin(uTime * 3.0 + position.x * 4.0 + seed * 20.0);' }),
    write: { pos: (k) => k, matrix: kMat },
  });
  for (const m of kioskBody.meshes) m.userData.kind = 'kiosk';
  out.sets.push(kioskBody, kioskGlow);
  out.kiosks = kiosks;
  out.inspect.push(...kioskBody.meshes);

  // awnings: dark canopy + neon front edge
  const awnMatrix = (a, m) => composeMatrix(m, a.x, CFG.CURB + 3.4, a.z, a.rot, a.w, 1, 1);
  out.sets.push(new ChunkedInstances({ items: awn, geometry: G.merge([{ geo: new THREE.BoxGeometry(1, 0.12, 2.2), matrix: G.M(0, 0, 0, -0.18, 0, 0) }]), material: darkPaint, chunk: 328, maxDist: 380, castShadow: true, group, write: { pos: (a) => a, matrix: awnMatrix } }));
  out.sets.push(new ChunkedInstances({
    items: awn, geometry: G.merge([{ geo: new THREE.BoxGeometry(1, 0.06, 0.06), matrix: G.M(0, -0.22, 1.08), aPart: 0 }], ['aPart']),
    material: createGlowMaterial({ colors: [new THREE.Color(4, 4, 4)], instMask: [1], night: 0.8 }), chunk: 328, maxDist: 500, color: true, group,
    write: { pos: (a) => a, matrix: awnMatrix, color: (a, c) => c.copy(a.col) },
  }));

  const bg = G.bollardGeometry();
  const bMat = (b, m) => composeMatrix(m, b.x, CFG.CURB, b.z, 0, 1, 1, 1);
  out.sets.push(new ChunkedInstances({ items: bollards, geometry: bg.body, material: metal, chunk: 328, maxDist: 220, group, write: { pos: (b) => b, matrix: bMat } }));
  out.sets.push(new ChunkedInstances({ items: bollards, geometry: G.merge([{ geo: bg.glow, aPart: 0 }], ['aPart']), material: createGlowMaterial({ colors: [new THREE.Color(NEON_LIST[1]).multiplyScalar(3)], night: 0.8 }), chunk: 328, maxDist: 260, group, write: { pos: (b) => b, matrix: bMat } }));

  // light sources for the dynamic light pool
  for (const v of vend) out.lights.push({ x: v.x + Math.sin(v.rot) * 1.2, y: 1.6, z: v.z + Math.cos(v.rot) * 1.2, color: v.col.clone(), power: 14 });
  for (const k of kiosks) {
    out.lights.push({ x: k.x + Math.sin(k.rot) * 1.6, y: 2.0, z: k.z + Math.cos(k.rot) * 1.6, color: new THREE.Color(1.0, 0.45, 0.2), power: 22 });
    out.steam.push({ x: k.x + Math.sin(k.rot) * 0.6, y: 1.2, z: k.z + Math.cos(k.rot) * 0.6, rate: 1.3, size: 0.6 });
  }
  for (const a of awn) if (R.chance(0.35)) out.lights.push({ x: a.x + Math.sin(a.rot) * 1.8, y: 3.0, z: a.z + Math.cos(a.rot) * 1.8, color: a.col.clone(), power: 10 });

  // manhole steam in the streets
  for (let i = 0; i < 70; i++) {
    const k = R.int(0, CFG.GRID - 2), along = R.range(-HALF * CFG.PITCH, HALF * CFG.PITCH);
    const off = R.pick([-4.5, 0, 4.5]) + R.range(-1, 1);
    const p = R.chance(0.5) ? { x: streetLine(k) + off, z: along } : { x: along, z: streetLine(k) + off };
    out.steam.push({ ...p, y: 0.05, rate: 1, size: 1 });
  }
  return out;
}
