import * as THREE from 'three';
import { CFG, Rand, NEON_LIST, U } from '../config.js';
import { rectPath } from './paths.js';
import * as G from './geom.js';

// Crowds: silhouettes walking the sidewalks, idling at food stalls and gathered
// in the plaza. Limbs swing in the vertex shader; only people near the camera
// are written into the instance buffer each frame (distance LOD + compaction).

const FIRST = ['Kenji', 'Mara', 'Yuki', 'Dex', 'Ines', 'Rook', 'Sora', 'Viktor', 'Lin', 'Ash', 'Nadia', 'Hiro', 'Zee', 'Oksana', 'Tomas', 'Rei', 'Juno', 'Kai'];
const LAST = ['Tanaka', 'Okoye', 'Varga', 'Moreau', 'Chen', 'Silva', 'Ivanova', 'Park', 'Nakamura', 'Reyes', 'Kowalski', 'Haddad'];
const JOBS = ['Netrunner', 'Noodle chef', 'Corp accountant', 'Courier', 'Street doc', 'Fixer', 'Sanitation drone tech', 'Bartender', 'Off-duty cop', 'Musician', 'Data broker', 'Student', 'Security guard', 'Taxi pilot'];
const WARE = ['Kiroshi-style optics', 'Subdermal armor', 'Neural link v4', 'Synthetic lungs', 'Reflex booster', 'Chrome arm (left)', 'Bio-monitor', 'Translator implant', 'Smart-link palm', 'None detected'];

function pedMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.1 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = U.uTime;
    s.uniforms.uNight = U.uNight;
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
      attribute float aPart; attribute vec2 aWalk; uniform float uTime;
      mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1,0,0, 0,c,s, 0,-s,c); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float ph = aWalk.x; float spd = aWalk.y;
        float sw = sin(ph) * 0.55 * min(spd, 1.0);
        float ang = 0.0; vec3 piv = vec3(0.0);
        if (aPart > 0.5 && aPart < 1.5) { ang = sw; piv = vec3(0.0, 0.92, 0.0); }
        else if (aPart > 1.5 && aPart < 2.5) { ang = -sw; piv = vec3(0.0, 0.92, 0.0); }
        else if (aPart > 2.5 && aPart < 3.5) { ang = -sw * 0.8; piv = vec3(0.0, 1.5, 0.0); }
        else if (aPart > 3.5) { ang = sw * 0.8; piv = vec3(0.0, 1.5, 0.0); }
        mat3 R = rotX(ang);
        objectNormal = R * objectNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed = R * (transformed - piv) + piv;
        transformed.y += abs(cos(ph)) * 0.04 * min(spd, 1.0) + sin(uTime * 1.3 + aWalk.x * 0.0) * 0.004;`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
        vec3 wn = (vec4(normal, 0.0) * viewMatrix).xyz;
        totalEmissiveRadiance += mix(vec3(0.1, 0.8, 1.0), vec3(1.0, 0.15, 0.6), smoothstep(-0.6, 0.6, wn.x)) * rim * 0.55 * uNight;`);
  };
  m.customProgramCacheKey = () => 'pedestrian';
  return m;
}

function umbrellaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, uTime: U.uTime, uNight: U.uNight },
    fog: true, side: THREE.DoubleSide,
    vertexShader: `attribute float aPart; varying float vPart; varying vec3 vC; varying vec2 vUv2;
      #include <fog_pars_vertex>
      void main(){ vPart = aPart; vUv2 = uv; vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #endif
        #include <begin_vertex>
        #include <project_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform float uNight; varying float vPart; varying vec3 vC; varying vec2 vUv2;
      #include <fog_pars_fragment>
      void main(){
        vec3 c;
        if (vPart < 0.5) c = vC * (0.18 + 0.25 * vUv2.y) + vC * 0.4 * step(0.92, fract(vUv2.x * 8.0));
        else c = vC * (vPart < 1.5 ? 5.0 : 3.5);
        c *= 0.4 + 0.6 * uNight;
        gl_FragColor = vec4(c, 1.0);
        #ifdef FOG_EXP2
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, cityFogAmount(vFogWorldPos, fogDensity * 0.6));
        #endif
      }`,
  });
}

export function buildPedestrians(layout, streets, group, maxCount = 1100) {
  const R = new Rand(4242);
  const peds = [];
  const clothes = [0x15161a, 0x22232a, 0x2a1d1a, 0x1a2228, 0x3a3a40, 0x5a1520, 0x101012, 0x6a6a70, 0x1d2a1d];
  const mkPed = (p) => peds.push({
    ...p, h: R.range(0.88, 1.08), col: new THREE.Color(R.pick(clothes)),
    umbrella: R.chance(0.33), ucol: new THREE.Color(R.pick(NEON_LIST)),
    name: `${R.pick(FIRST)} ${R.pick(LAST)}`, job: R.pick(JOBS), ware: [R.pick(WARE), R.pick(WARE)], threat: R.pick(['Low', 'Low', 'Low', 'Moderate', 'Unknown']),
    pos: new THREE.Vector3(), heading: 0,
  });
  for (const b of layout.blocks) {
    if (b.outer) continue;
    if (b.plaza) {
      for (let i = 0; i < 70; i++) {
        const a = R.next() * Math.PI * 2, r = R.range(14, 27);
        const x = b.cx + Math.cos(a) * r, z = b.cz + Math.sin(a) * r;
        mkPed({ mode: 'idle', x, z, heading: Math.atan2(b.cx - x, b.cz - z) + R.range(-0.4, 0.4), speed: 0 });
      }
      for (let i = 0; i < 40; i++) mkPed({ mode: 'circle', cx: b.cx, cz: b.cz, r: R.range(18, 29), s0: R.next() * 100, speed: R.range(1.0, 1.6) * (R.chance(0.5) ? 1 : -1) });
      continue;
    }
    const n = R.int(6, 12);
    for (let i = 0; i < n; i++) {
      const d = R.range(1.2, 3.6);
      const h = CFG.BLOCK / 2 - d;
      const path = rectPath(b.cx - h, b.cz - h, b.cx + h, b.cz + h, 1.2);
      mkPed({ mode: 'walk', path, s0: R.next() * path.length, speed: R.range(1.0, 1.7) * (R.chance(0.5) ? 1 : -1) });
    }
  }
  for (const k of streets.kiosks) {
    for (let i = 0; i < 2; i++) {
      const fx = Math.sin(k.rot), fz = Math.cos(k.rot);
      const x = k.x + fx * 2.4 + fz * (i ? 0.7 : -0.7), z = k.z + fz * 2.4 - fx * (i ? 0.7 : -0.7);
      mkPed({ mode: 'idle', x, z, heading: Math.atan2(-fx, -fz), speed: 0 });
    }
  }

  const geo = G.pedestrianGeometry();
  const mesh = new THREE.InstancedMesh(geo, pedMaterial(), maxCount);
  mesh.geometry = geo.clone();
  const walkAttr = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * 2), 2);
  walkAttr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aWalk', walkAttr);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * 3), 3);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.userData.kind = 'ped';
  group.add(mesh);

  const umb = new THREE.InstancedMesh(G.umbrellaGeometry(), umbrellaMaterial(), maxCount);
  umb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  umb.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * 3), 3);
  umb.frustumCulled = false;
  umb.count = 0;
  group.add(umb);

  return { peds, mesh, umb, walkAttr, visible: [], maxCount, radius: 190 };
}

export function updatePedestrians(P, time, camPos) {
  const M = P.mesh.instanceMatrix.array, C = P.mesh.instanceColor.array, W = P.walkAttr.array;
  const UM = P.umb.instanceMatrix.array, UC = P.umb.instanceColor.array;
  let n = 0, nu = 0;
  const r2 = P.radius * P.radius;
  P.visible.length = 0;
  const y0 = CFG.CURB;
  for (const p of P.peds) {
    let x, z, hd;
    if (p.mode === 'walk') {
      const q = p.path.at(p.s0 + p.speed * time);
      x = q.x; z = q.z; hd = Math.atan2(q.dx * Math.sign(p.speed), q.dz * Math.sign(p.speed));
    } else if (p.mode === 'circle') {
      const a = (p.s0 + p.speed * time) / p.r;
      x = p.cx + Math.cos(a) * p.r; z = p.cz + Math.sin(a) * p.r;
      const s = Math.sign(p.speed); hd = Math.atan2(-Math.sin(a) * s, Math.cos(a) * s);
    } else { x = p.x; z = p.z; hd = p.heading + Math.sin(time * 0.3 + p.x) * 0.15; }
    p.pos.set(x, y0, z); p.heading = hd;
    const dx = x - camPos.x, dz = z - camPos.z;
    if (dx * dx + dz * dz > r2 || n >= P.maxCount) continue;
    const c = Math.cos(hd), s = Math.sin(hd), h = p.h;
    const o = n * 16;
    M[o] = c * h; M[o + 1] = 0; M[o + 2] = -s * h; M[o + 3] = 0;
    M[o + 4] = 0; M[o + 5] = h; M[o + 6] = 0; M[o + 7] = 0;
    M[o + 8] = s * h; M[o + 9] = 0; M[o + 10] = c * h; M[o + 11] = 0;
    M[o + 12] = x; M[o + 13] = y0; M[o + 14] = z; M[o + 15] = 1;
    C[n * 3] = p.col.r; C[n * 3 + 1] = p.col.g; C[n * 3 + 2] = p.col.b;
    const spd = Math.abs(p.speed);
    W[n * 2] = time * spd * 5.2 + p.h * 10; W[n * 2 + 1] = spd;
    P.visible.push(p);
    if (p.umbrella) {
      const uo = nu * 16;
      for (let i = 0; i < 16; i++) UM[uo + i] = M[o + i];
      UC[nu * 3] = p.ucol.r; UC[nu * 3 + 1] = p.ucol.g; UC[nu * 3 + 2] = p.ucol.b;
      nu++;
    }
    n++;
  }
  P.mesh.count = n; P.umb.count = nu;
  P.mesh.instanceMatrix.needsUpdate = true; P.mesh.instanceColor.needsUpdate = true; P.walkAttr.needsUpdate = true;
  P.umb.instanceMatrix.needsUpdate = true; P.umb.instanceColor.needsUpdate = true;
}
