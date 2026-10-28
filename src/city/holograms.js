import * as THREE from 'three';
import { CFG, Rand, NEON_LIST, U, blockCenter, HALF } from '../config.js';
import { createHologramMaterial, createBeamMaterial, createGlowMaterial } from '../fx/materials.js';
import { createTickerTexture } from '../fx/textures.js';
import { ChunkedInstances, composeMatrix } from './chunks.js';
import * as G from './geom.js';

// Holographic installations: twin koi circling the central plaza, the Aether
// Bank globe with ticker rings, floating HUD panels on the streets, rooftop
// hologram sculptures, glowing cherry trees and the distant orbital tether.

function koiGeometry() {
  const body = new THREE.SphereGeometry(1, 40, 20);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const u = (x + 1) / 2;
    const r = 0.13 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.75) + 0.008;
    p.setXYZ(i, x * 0.5, y * r * 1.15, z * r * 0.85);
  }
  body.computeVertexNormals();
  const tail = new THREE.Shape();
  tail.moveTo(-0.45, 0); tail.quadraticCurveTo(-0.62, 0.05, -0.76, 0.19); tail.quadraticCurveTo(-0.68, 0.02, -0.71, 0);
  tail.quadraticCurveTo(-0.68, -0.02, -0.76, -0.19); tail.quadraticCurveTo(-0.62, -0.05, -0.45, 0);
  const fin = new THREE.Shape();
  fin.moveTo(0, 0); fin.quadraticCurveTo(0.06, 0.12, -0.08, 0.16); fin.quadraticCurveTo(-0.06, 0.05, -0.12, 0); fin.lineTo(0, 0);
  const dorsal = new THREE.Shape();
  dorsal.moveTo(0.12, 0); dorsal.quadraticCurveTo(0.0, 0.1, -0.25, 0.06); dorsal.lineTo(-0.3, 0); dorsal.lineTo(0.12, 0);
  return G.merge([
    { geo: body },
    { geo: new THREE.ShapeGeometry(tail, 6) },
    { geo: new THREE.ShapeGeometry(fin, 4), matrix: G.M(0.2, -0.04, 0.08, Math.PI / 2.4, 0, -0.3) },
    { geo: new THREE.ShapeGeometry(fin, 4), matrix: G.M(0.2, -0.04, -0.08, -Math.PI / 2.4, 0, -0.3) },
    { geo: new THREE.ShapeGeometry(dorsal, 4), matrix: G.M(0, 0.1, 0) },
    // whiskers
    { geo: new THREE.CylinderGeometry(0.004, 0.002, 0.18, 3), matrix: G.M(0.52, -0.03, 0.04, 0, 0, 1.2) },
    { geo: new THREE.CylinderGeometry(0.004, 0.002, 0.18, 3), matrix: G.M(0.52, -0.03, -0.04, 0, 0, 1.2) },
  ]);
}

export function buildHolograms(layout, streets, hudTex, group) {
  const R = new Rand(9001);
  const out = { koi: [], spinners: [], inspect: [], lights: [], tickers: [] };
  const pc = { x: blockCenter(HALF), z: blockCenter(HALF) };
  out.plaza = pc;

  // ---- koi ----
  const kg = koiGeometry();
  const koiDeform = `
    float ku = position.x + 0.5;
    float amp = 0.07 * pow(clamp(1.0 - ku, 0.0, 1.4), 2.0);
    transformed.z += sin(position.x * 8.0 - uTime * 4.0 + uPhase) * amp;`;
  const koiPattern = `
    float spot = smoothstep(0.45, 0.6, fbm(vP.xz * 9.0 + vec2(uPhase * 3.0, 1.0)) + vP.y * 1.5);
    col = mix(col, uColor2, spot * 0.7);
    float scale = smoothstep(0.35, 0.5, abs(fract(vP.x * 60.0 + vP.y * 30.0) - 0.5)) * 0.25;
    alpha += scale;`;
  const palettes = [[0xff5a1a, 0xffffff], [0xff2a8a, 0x19e8ff], [0x19e8ff, 0x8a5cff], [0xffd04a, 0xff2a3a]];
  for (let i = 0; i < 2; i++) {
    const mat = createHologramMaterial({ color: i ? 0xffffff : 0xff5a1a, color2: i ? 0xff3a1a : 0xffffff, intensity: 2.2, deform: koiDeform, pattern: koiPattern });
    mat.uniforms.uPhase.value = i * 3.14;
    const m = new THREE.Mesh(kg, mat);
    m.scale.setScalar(30);
    m.userData.kind = 'koi';
    m.renderOrder = 7;
    group.add(m);
    out.koi.push({ mesh: m, phase: i * Math.PI, mat, palette: i });
    out.inspect.push(m);
  }
  out.koiPalettes = palettes;
  // sparkle trail particles behind the koi
  const trailN = 600;
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(trailN * 3), 3));
  const ta = new Float32Array(trailN); for (let i = 0; i < trailN; i++) ta[i] = R.next();
  tg.setAttribute('aRand', new THREE.Float32BufferAttribute(ta, 1));
  const trailMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCenter: { value: new THREE.Vector3(pc.x, 0, pc.z) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aRand; uniform float uTime; uniform vec3 uCenter; varying float vA;
      void main(){
        float k = fract(aRand * 7.0); float which = step(0.5, aRand);
        float a = uTime * 0.18 + which * 3.14159 - k * 1.6;
        float r = 34.0 + sin(aRand * 50.0) * 3.0;
        vec3 p = uCenter + vec3(cos(a) * r, 82.0 + sin(uTime * 0.25 - k * 2.22) * 14.0 + sin(aRand * 91.0) * 2.0, sin(a) * r);
        p.y -= k * 6.0;
        vA = (1.0 - k) * (0.5 + 0.5 * sin(uTime * 8.0 + aRand * 60.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.0 - k) * 220.0 / -mv.z;
      }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.6, 0.3) * vA * smoothstep(0.5, 0.0, d) * 2.0, 1.0); }`,
  });
  const trail = new THREE.Points(tg, trailMat);
  trail.frustumCulled = false;
  group.add(trail);

  // ---- Aether Bank globe ----
  const globeMat = createHologramMaterial({
    color: 0x19e8ff, color2: 0xe7c66b, intensity: 1.6,
    pattern: `
      vec2 gg = abs(fract(vUv2 * vec2(24.0, 12.0)) - 0.5);
      float gl2 = 1.0 - smoothstep(0.0, 0.05, min(gg.x, gg.y));
      float land = smoothstep(0.5, 0.56, fbm(vUv2 * vec2(9.0, 4.5) + 2.0));
      alpha = alpha * 0.4 + gl2 * 0.5 + land * 0.55;
      col = mix(col, uColor2, land * 0.6);`,
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(13, 64, 32), globeMat);
  globe.position.set(pc.x, 42, pc.z);
  globe.userData.kind = 'globe';
  globe.renderOrder = 7;
  group.add(globe);
  out.globe = globe;
  out.inspect.push(globe);
  const ringTex1 = createTickerTexture('AETHER BANK ◆ THE WORLD IS YOURS ◆ 世界はあなたのもの ◆ NKX +2.41% ◆ ', '#e7c66b');
  const ringTex2 = createTickerTexture('NEO-KAIDŌ DISTRICT 7 ◆ 雨は止まない ◆ CURFEW 03:00 ◆ STAY CHROME ◆ ', '#19e8ff');
  for (const [i, tex] of [ringTex1, ringTex2].entries()) {
    tex.repeat.set(3, 1);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(19 + i * 3, 19 + i * 3, 2.6, 96, 1, true),
      new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(2.2, 2.2, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.set(pc.x, 42 + (i ? -2 : 3), pc.z);
    ring.rotation.set(i ? 0.25 : -0.12, 0, i ? 0.1 : 0.2);
    ring.renderOrder = 8;
    group.add(ring);
    out.tickers.push({ tex, ring, speed: i ? -0.015 : 0.02 });
  }
  // projector pedestal + beam
  const pedestal = new THREE.Mesh(G.merge([
    { geo: new THREE.CylinderGeometry(6, 7, 1.4, 32), matrix: G.M(0, 0.7, 0) },
    { geo: new THREE.CylinderGeometry(3.5, 4.5, 2.2, 24), matrix: G.M(0, 2.4, 0) },
  ]), new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.3, metalness: 0.9 }));
  pedestal.position.set(pc.x, CFG.CURB, pc.z);
  pedestal.castShadow = true;
  group.add(pedestal);
  const pedGlow = new THREE.Mesh(G.merge([
    { geo: new THREE.CylinderGeometry(6.02, 6.02, 0.12, 48, 1, true), matrix: G.M(0, 1.3, 0), aPart: 0 },
    { geo: new THREE.CylinderGeometry(3.4, 3.4, 0.25, 32), matrix: G.M(0, 3.55, 0), aPart: 1 },
  ], ['aPart']), createGlowMaterial({ colors: [new THREE.Color(NEON_LIST[1]).multiplyScalar(5), new THREE.Color(0.6, 1.2, 1.5).multiplyScalar(4)], night: 0.5 }));
  pedGlow.position.copy(pedestal.position);
  group.add(pedGlow);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(10, 3.2, 26, 40, 1, true).translate(0, 13, 0), createBeamMaterial({ color: 0x5ad8ff, intensity: 0.5, rainBoost: 0.3, tipFade: false, night: 0.6 }));
  beam.position.set(pc.x, 3.8, pc.z);
  beam.renderOrder = 6;
  beam.layers.set(2);
  group.add(beam);
  // plaza floor rings
  const floorRings = new THREE.Mesh(G.merge([10, 16, 23, 29].map((r, i) => ({ geo: new THREE.RingGeometry(r, r + 0.15, 96), matrix: G.M(0, 0, 0, -Math.PI / 2, 0, 0), aPart: i % 2 }))),
    createGlowMaterial({ colors: [new THREE.Color(NEON_LIST[1]).multiplyScalar(2.5), new THREE.Color(NEON_LIST[0]).multiplyScalar(2.5)], night: 0.8 }));
  floorRings.geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(floorRings.geometry.attributes.position.count).fill(0), 1));
  floorRings.position.set(pc.x, CFG.CURB + 0.02, pc.z);
  group.add(floorRings);
  out.lights.push({ x: pc.x, y: 8, z: pc.z, color: new THREE.Color(0.3, 0.8, 1), power: 120 });

  // ---- glowing cherry trees around the plaza ----
  const trees = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    trees.push({ x: pc.x + Math.cos(a) * 24.5, z: pc.z + Math.sin(a) * 24.5, rot: R.next() * 6, s: R.range(0.85, 1.2) });
  }
  const trunkGeo = G.merge([
    { geo: new THREE.CylinderGeometry(0.18, 0.32, 4.2, 7), matrix: G.M(0, 2.1, 0, 0, 0, 0.08) },
    { geo: new THREE.CylinderGeometry(0.08, 0.16, 2.6, 6), matrix: G.M(0.7, 4.6, 0, 0, 0, -0.7) },
    { geo: new THREE.CylinderGeometry(0.08, 0.16, 2.4, 6), matrix: G.M(-0.6, 4.4, 0.3, 0.3, 0, 0.75) },
    { geo: new THREE.CylinderGeometry(0.06, 0.12, 2.0, 6), matrix: G.M(0.1, 5.0, -0.6, -0.6, 0, 0) },
  ]);
  const trunkSet = new ChunkedInstances({ items: trees, geometry: trunkGeo, material: new THREE.MeshStandardMaterial({ color: 0x1a1214, roughness: 0.9 }), chunk: 1000, castShadow: true, group, write: { pos: (t) => t, matrix: (t, m) => composeMatrix(m, t.x, CFG.CURB, t.z, t.rot, t.s, t.s, t.s) } });
  const blossomN = 700;
  const bp = new Float32Array(trees.length * blossomN * 3), br = new Float32Array(trees.length * blossomN);
  let bi = 0;
  for (const t of trees) {
    for (let k = 0; k < blossomN; k++) {
      const u = R.next() * Math.PI * 2, v = Math.acos(R.range(-1, 1)), rr = Math.cbrt(R.next());
      bp[bi * 3] = t.x + Math.sin(v) * Math.cos(u) * 2.6 * rr * t.s;
      bp[bi * 3 + 1] = CFG.CURB + (5.6 + Math.cos(v) * 1.5 * rr) * t.s;
      bp[bi * 3 + 2] = t.z + Math.sin(v) * Math.sin(u) * 2.6 * rr * t.s;
      br[bi] = R.next(); bi++;
    }
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  bg.setAttribute('aRand', new THREE.Float32BufferAttribute(br, 1));
  const blossoms = new THREE.Points(bg, new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, uTime: U.uTime, uNight: U.uNight }, fog: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aRand; uniform float uTime; varying float vA;
      #include <fog_pars_vertex>
      void main(){ vec3 p = position; p.x += sin(uTime * 0.8 + p.y + aRand * 6.0) * 0.08; p.z += cos(uTime * 0.7 + p.x) * 0.06;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = (0.18 + aRand * 0.2) * 700.0 / -mvPosition.z; vA = 0.6 + 0.4 * sin(uTime * 2.0 + aRand * 40.0);
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uNight; varying float vA;
      #include <fog_pars_fragment>
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA;
        gl_FragColor = vec4(vec3(1.0, 0.35, 0.65) * a * (0.6 + 1.2 * uNight), 1.0);
        #ifdef FOG_EXP2
          gl_FragColor.rgb *= 1.0 - cityFogAmount(vFogWorldPos, fogDensity);
        #endif
      }`,
  }));
  blossoms.frustumCulled = false;
  group.add(blossoms);
  for (const t of trees) out.lights.push({ x: t.x, y: 5.5, z: t.z, color: new THREE.Color(1, 0.3, 0.6), power: 18 });

  // ---- floating HUD panels on the street ----
  const panels = [];
  for (const f of layout.faces) {
    if (!f.street || !f.ground || !R.chance(0.33)) continue;
    const u = R.range(f.u0 + 2, f.u1 - 2);
    const s = R.range(1.2, 2.4);
    const off = R.range(2.2, 3.6);
    const rot = f.n[0] === 1 ? Math.PI / 2 : f.n[0] === -1 ? -Math.PI / 2 : f.n[1] === 1 ? 0 : Math.PI;
    const p = f.n[0] !== 0 ? { x: f.plane + f.n[0] * off, z: u } : { x: u, z: f.plane + f.n[1] * off };
    const tile = R.int(0, 7);
    panels.push({ ...p, y: R.range(2.6, 4.6), rot: rot + R.range(-0.4, 0.4), s, tile, seed: R.next() });
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    panels.push({ x: pc.x + Math.cos(a) * 31, z: pc.z + Math.sin(a) * 31, y: R.range(9, 16), rot: -a - Math.PI / 2, s: R.range(4, 7), tile: R.int(0, 7), seed: R.next() });
  }
  const panelMat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, tHud: { value: hudTex }, uTime: U.uTime },
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `attribute vec2 aPanel; uniform float uTime; varying vec2 vUv2; varying float vSeed;
      #include <fog_pars_vertex>
      void main(){ float t = aPanel.x; vSeed = aPanel.y;
        vUv2 = vec2((mod(t, 4.0) + uv.x) / 4.0, (1.0 - floor(t / 4.0)) * 0.5 + uv.y * 0.5);
        #include <begin_vertex>
        transformed.y += sin(uTime * 1.2 + vSeed * 20.0) * 0.06;
        #include <project_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D tHud; uniform float uTime; varying vec2 vUv2; varying float vSeed;
      #include <fog_pars_fragment>
      void main(){ vec3 c = texture2D(tHud, vUv2).rgb;
        float scan = 0.7 + 0.3 * sin(vUv2.y * 900.0 + uTime * 8.0);
        float flick = 0.85 + 0.15 * step(0.5, fract(sin(floor(uTime * 20.0) + vSeed * 99.0) * 4375.5));
        gl_FragColor = vec4(c * scan * flick * 1.8 + vec3(0.0, 0.05, 0.08), 1.0);
        #ifdef FOG_EXP2
          gl_FragColor.rgb *= 1.0 - cityFogAmount(vFogWorldPos, fogDensity);
        #endif
      }`,
  });
  const panelSet = new ChunkedInstances({
    items: panels, geometry: new THREE.PlaneGeometry(1, 0.62), material: panelMat, chunk: 328, maxDist: 300, attributes: { aPanel: 2 }, group,
    write: { pos: (p) => p, matrix: (p, m) => composeMatrix(m, p.x, p.y, p.z, p.rot, p.s, p.s, 1), attrs: (p, i, a) => a.aPanel.setXY(i, p.tile, p.seed) },
  });
  for (const m of panelSet.meshes) { m.renderOrder = 8; m.layers.set(2); }
  out.sets = [trunkSet, panelSet];

  // ---- rooftop hologram sculptures ----
  const mids = layout.buildings.filter((b) => b.height > 70 && b.height < 200 && b.top.sx > 14 && !b.twist && b.top.shape === 'box').slice(0);
  const shapes = [() => new THREE.IcosahedronGeometry(6, 1), () => new THREE.TorusKnotGeometry(4.5, 1.2, 120, 12), () => new THREE.OctahedronGeometry(6, 0), () => new THREE.TorusGeometry(5, 1.2, 12, 48)];
  for (let i = 0; i < 9 && mids.length; i++) {
    const b = mids.splice(R.int(0, mids.length - 1), 1)[0];
    const t = b.top;
    const col = R.pick(NEON_LIST), col2 = R.pick(NEON_LIST);
    const m = new THREE.Mesh(shapes[i % shapes.length](), createHologramMaterial({ color: col, color2: col2, intensity: 1.4 }));
    m.position.set(t.x, b.height + 12, t.z);
    m.userData.kind = 'sculpture';
    m.userData.building = b;
    m.renderOrder = 7;
    group.add(m);
    const bm = new THREE.Mesh(new THREE.CylinderGeometry(5, 1.5, 9, 24, 1, true).translate(0, 4.5, 0), createBeamMaterial({ color: col, intensity: 0.35, tipFade: false, rainBoost: 0.3, night: 0.7 }));
    bm.position.set(t.x, b.height, t.z);
    bm.layers.set(2);
    group.add(bm);
    out.spinners.push({ mesh: m, speed: R.range(0.2, 0.5) });
    out.inspect.push(m);
  }
  // ---- giant corporate logo on the tallest tower ----
  const tallest = layout.buildings.reduce((a, b) => (b.height > a.height ? b : a));
  const logo = new THREE.Mesh(new THREE.TorusKnotGeometry(16, 3.2, 220, 18, 2, 3), createHologramMaterial({ color: 0x19e8ff, color2: 0x8a5cff, intensity: 1.3 }));
  logo.position.set(tallest.top.x, tallest.height + 34, tallest.top.z);
  logo.userData.kind = 'sculpture';
  logo.userData.building = tallest;
  logo.renderOrder = 7;
  group.add(logo);
  out.spinners.push({ mesh: logo, speed: 0.15 });
  out.inspect.push(logo);
  out.tallest = tallest;

  // ---- orbital tether on the horizon ----
  const tether = new THREE.Mesh(new THREE.CylinderGeometry(9, 14, 6000, 16, 1, true).translate(0, 3000, 0), new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, uTime: U.uTime }, fog: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      #include <fog_pars_vertex>
      void main(){ vY = position.y;
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        vN = transformedNormal;
        #include <begin_vertex>
        #include <project_vertex>
        vV = -mvPosition.xyz;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; varying float vY; varying vec3 vN; varying vec3 vV;
      #include <fog_pars_fragment>
      void main(){ float e = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
        float pulse = pow(fract(vY * 0.0012 - uTime * 0.08), 30.0) * 5.0 + pow(fract(vY * 0.0005 + uTime * 0.05), 60.0) * 8.0;
        vec3 c = vec3(0.45, 0.85, 1.0) * (0.35 + pulse) * e;
        gl_FragColor = vec4(c, 1.0);
        #ifdef FOG_EXP2
          gl_FragColor.rgb *= 1.0 - cityFogAmount(vFogWorldPos, fogDensity) * 0.97;
        #endif
      }`,
  }));
  tether.position.set(-2700, 0, 1300);
  tether.frustumCulled = false;
  group.add(tether);
  const station = new THREE.Mesh(new THREE.TorusGeometry(120, 10, 12, 64), createGlowMaterial({ colors: [new THREE.Color(0.6, 0.9, 1.2).multiplyScalar(1.5)], night: 0.4, fogK: 0.2 }));
  station.geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(station.geometry.attributes.position.count), 1));
  station.position.set(-2700, 2600, 1300);
  station.rotation.x = Math.PI / 2;
  group.add(station);
  return out;
}

export function updateHolograms(H, time, dt) {
  const pc = H.plaza;
  for (const k of H.koi) {
    const a = time * 0.18 + k.phase;
    const r = 34;
    const y = 82 + Math.sin(time * 0.25 + k.phase) * 14 * (k.phase ? -1 : 1);
    k.mesh.position.set(pc.x + Math.cos(a) * r, y, pc.z + Math.sin(a) * r);
    const dy = Math.cos(time * 0.25 + k.phase) * 14 * 0.25 * (k.phase ? -1 : 1);
    const tx = -Math.sin(a), tz = Math.cos(a);
    k.mesh.rotation.set(-0.3, Math.atan2(-tz, tx), Math.atan2(dy, r * 0.18) * 0.6, 'YXZ');
  }
  H.globeSpin = Math.max(1, (H.globeSpin || 1) - dt * 1.5);
  H.globe.rotation.y += dt * 0.12 * H.globeSpin;
  for (const t of H.tickers) { t.tex.offset.x = (t.tex.offset.x + dt * t.speed) % 1; t.ring.rotation.y = time * 0.05; }
  for (const s of H.spinners) {
    const boost = s.mesh.userData.boost || 1;
    s.mesh.userData.boost = Math.max(1, boost - dt * 0.6);
    s.mesh.rotation.y += dt * s.speed * boost;
    s.mesh.rotation.x = Math.sin(time * 0.3) * 0.3;
  }
}
