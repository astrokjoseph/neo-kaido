import * as THREE from 'three';
import { U, CFG, HALF, blockCenter, clamp, lerp, smoothstep } from './config.js';
import { installHeightFog } from './fx/glsl.js';
import { createSignAtlas, createHudAtlas } from './fx/textures.js';
import { PlanarReflection } from './fx/reflection.js';
import { createSky, createEnvironment } from './fx/sky.js';
import { createRain, createSteam } from './fx/rain.js';
import { Post } from './fx/post.js';
import { generateLayout } from './city/layout.js';
import { buildBuildings } from './city/buildings.js';
import { buildStreets } from './city/streets.js';
import { buildSigns } from './city/signs.js';
import { buildDetails, updateDetails } from './city/details.js';
import { buildTraffic, updateTraffic } from './city/traffic.js';
import { buildPedestrians, updatePedestrians } from './city/pedestrians.js';
import { buildHolograms, updateHolograms } from './city/holograms.js';
import { CollisionWorld, PlayerControls } from './controls.js';
import { Cinematic } from './cinematic.js';
import { Interaction } from './interaction.js';
import { UI } from './ui.js';
import { Ambience } from './audio.js';

installHeightFog();

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0d0a1c, 0.003);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.3, 7000);
camera.layers.enable(1); camera.layers.enable(2);
camera.position.set(0, 4, -200);
U.uLampColor.value = new THREE.Color(1.0, 0.72, 0.45);

const ui = new UI();
const audio = new Ambience();
const loadBar = document.getElementById('loadbar');
const loadStatus = document.getElementById('load-status');
const frame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 60); });
async function step(pct, msg) { loadBar.style.width = pct + '%'; loadStatus.textContent = msg; await frame(); }

// ------------------------------------------------------------------ world
const world = { time: 0 };
const QUALITY = {
  low: { pr: 1, refl: false, reflScale: 0.3, shadows: false, shadowSize: 1024, rain: 0.35, msaa: 0, streak: false, peds: 400, peds_r: 120, lights: 3 },
  medium: { pr: 1, refl: true, reflScale: 0.35, shadows: true, shadowSize: 1024, rain: 0.6, msaa: 0, streak: true, peds: 700, peds_r: 160, lights: 5 },
  high: { pr: 1.25, refl: true, reflScale: 0.5, shadows: true, shadowSize: 2048, rain: 0.85, msaa: 4, streak: true, peds: 1100, peds_r: 190, lights: 6 },
  ultra: { pr: 2, refl: true, reflScale: 0.7, shadows: true, shadowSize: 4096, rain: 1, msaa: 4, streak: true, peds: 1100, peds_r: 230, lights: 6 },
};
const settings = { quality: 'high', rain: true, rainAmount: 1, lightning: true, hour: 23.5, cycle: false, speed: 1, fog: 1, reflections: true };

async function build() {
  await step(5, 'Surveying district grid…');
  const layout = generateLayout(2077);
  world.layout = layout;
  const group = new THREE.Group();
  scene.add(group);
  world.reflection = new PlanarReflection();
  await step(12, 'Painting neon atlas…');
  world.atlas = createSignAtlas();
  const hudTex = createHudAtlas();
  await step(22, `Raising ${layout.tiers.length} tower sections…`);
  world.buildingSets = buildBuildings(layout, group);
  await step(36, 'Laying wet asphalt…');
  world.streets = buildStreets(layout, world.reflection, group);
  await step(48, 'Hanging signs and billboards…');
  world.signs = buildSigns(layout, world.atlas, group);
  await step(58, 'Bolting on rooftops, skybridges, maglev…');
  world.details = buildDetails(layout, group);
  await step(68, 'Launching air traffic…');
  world.traffic = buildTraffic(layout, world.details, group);
  await step(76, 'Populating sidewalks…');
  world.peds = buildPedestrians(layout, world.streets, group);
  await step(84, 'Projecting holograms…');
  world.holo = buildHolograms(layout, world.streets, hudTex, group);
  world.rain = createRain();
  scene.add(world.rain.group);
  world.steam = createSteam(world.streets.steam);
  scene.add(world.steam.mesh);
  world.sky = createSky();
  scene.add(world.sky.mesh);
  await step(90, 'Baking reflections…');
  scene.environment = createEnvironment(renderer);
  world.allSets = [...world.buildingSets, ...world.streets.sets, ...world.signs.sets, ...world.details.sets, ...world.holo.sets];

  // lights
  world.hemi = new THREE.HemisphereLight(0x1a2a55, 0x2a0f2a, 0.6);
  scene.add(world.hemi);
  world.sun = new THREE.DirectionalLight(0x8fb0ff, 0.4);
  world.sun.castShadow = true;
  const sc = world.sun.shadow.camera;
  sc.left = -170; sc.right = 170; sc.top = 170; sc.bottom = -170; sc.near = 1; sc.far = 1400;
  world.sun.shadow.bias = -0.0004; world.sun.shadow.normalBias = 0.6;
  scene.add(world.sun, world.sun.target);
  world.pool = [];
  for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffffff, 0, 32, 2); scene.add(l); world.pool.push(l); }
  const sources = [...world.streets.lights, ...world.signs.lights, ...world.holo.lights];
  world.lightGrid = new Map();
  for (const s of sources) { const k = Math.floor(s.x / 40) + ',' + Math.floor(s.z / 40); if (!world.lightGrid.has(k)) world.lightGrid.set(k, []); world.lightGrid.get(k).push(s); }

  world.collision = new CollisionWorld(layout.colliders);
  await step(96, 'Compiling shaders…');
  world.post = new Post(renderer, scene, camera);
  applyTime(settings.hour);
  renderer.compile(scene, camera);
  await step(100, 'District online.');
}

// ------------------------------------------------------------------ time of day
const C = (h) => new THREE.Color(h);
const KEYS = [
  { h: 0, top: C(0x02030a), hor: C(0x1c0e26), fog: C(0x0e0b1d), glow: C(0x4a1838), cloud: C(0x2a1a34), fogD: 0.0031, hs: C(0x22305a), hg: C(0x2a0f2a), hi: 0.7, sun: C(0x8fb0ff), si: 0.35, night: 1, exp: 0.95 },
  { h: 4.6, top: C(0x02030a), hor: C(0x1c0e26), fog: C(0x0e0b1d), glow: C(0x4a1838), cloud: C(0x2a1a34), fogD: 0.0031, hs: C(0x22305a), hg: C(0x2a0f2a), hi: 0.7, sun: C(0x8fb0ff), si: 0.35, night: 1, exp: 0.95 },
  { h: 6.2, top: C(0x1a2050), hor: C(0xd0607a), fog: C(0x553047), glow: C(0xff7a5a), cloud: C(0x6a4060), fogD: 0.0029, hs: C(0x6a70b0), hg: C(0x4a2a30), hi: 1.0, sun: C(0xff9a6a), si: 1.4, night: 0.65, exp: 0.95 },
  { h: 8.5, top: C(0x3a5a7c), hor: C(0xa7b6b8), fog: C(0x7f8c92), glow: C(0x8a9090), cloud: C(0x8a949c), fogD: 0.0026, hs: C(0xb0c4d8), hg: C(0x4a4a48), hi: 1.6, sun: C(0xfff0d8), si: 2.8, night: 0.12, exp: 0.8 },
  { h: 13, top: C(0x4a6a8c), hor: C(0xb0bcbc), fog: C(0x8d9a9c), glow: C(0x9aa0a0), cloud: C(0x9aa4ac), fogD: 0.0024, hs: C(0xc0d0e0), hg: C(0x505050), hi: 1.8, sun: C(0xffffff), si: 3.0, night: 0.06, exp: 0.78 },
  { h: 16.6, top: C(0x3a5070), hor: C(0xd0a080), fog: C(0x8c7a70), glow: C(0xc09070), cloud: C(0x9a8a88), fogD: 0.0025, hs: C(0xb0b8d0), hg: C(0x504040), hi: 1.5, sun: C(0xffd0a0), si: 2.4, night: 0.2, exp: 0.85 },
  { h: 18.6, top: C(0x1c1640), hor: C(0xe0507a), fog: C(0x4c2244), glow: C(0xff5a6a), cloud: C(0x5a2a50), fogD: 0.0029, hs: C(0x5a50a0), hg: C(0x4a2030), hi: 1.0, sun: C(0xff6a5a), si: 1.1, night: 0.7, exp: 1.0 },
  { h: 20.2, top: C(0x02030a), hor: C(0x1c0e26), fog: C(0x0e0b1d), glow: C(0x4a1838), cloud: C(0x2a1a34), fogD: 0.0031, hs: C(0x22305a), hg: C(0x2a0f2a), hi: 0.7, sun: C(0x8fb0ff), si: 0.35, night: 1, exp: 0.95 },
  { h: 24, top: C(0x02030a), hor: C(0x1c0e26), fog: C(0x0e0b1d), glow: C(0x4a1838), cloud: C(0x2a1a34), fogD: 0.0031, hs: C(0x22305a), hg: C(0x2a0f2a), hi: 0.7, sun: C(0x8fb0ff), si: 0.35, night: 1, exp: 0.95 },
];
const TOD = { top: new THREE.Color(), hor: new THREE.Color(), fog: new THREE.Color(), glow: new THREE.Color(), cloud: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), sun: new THREE.Color() };
const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(-0.35, 0.62, -0.7).normalize(), lightDir = new THREE.Vector3();

function applyTime(h) {
  h = ((h % 24) + 24) % 24;
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smoothstep(0, 1, (h - a.h) / (b.h - a.h));
  for (const k of Object.keys(TOD)) TOD[k].copy(a[k]).lerp(b[k], t);
  const night = lerp(a.night, b.night, t);
  world.night = night;
  U.uNight.value = night;
  world.exposure = lerp(a.exp, b.exp, t);
  world.fogD = lerp(a.fogD, b.fogD, t);
  world.hemiI = lerp(a.hi, b.hi, t);
  world.sunI = lerp(a.si, b.si, t);
  scene.fog.color.copy(TOD.fog);
  const su = world.sky.uniforms;
  su.uTop.value.copy(TOD.top); su.uHorizon.value.copy(TOD.hor); su.uFog.value.copy(TOD.fog); su.uGlow.value.copy(TOD.glow); su.uCloud.value.copy(TOD.cloud);
  const el = Math.sin(((h - 6) / 12) * Math.PI);
  const az = ((h - 6) / 12) * Math.PI;
  sunDir.set(Math.cos(az) * 0.8, el, -0.45 + Math.sin(az) * 0.2).normalize();
  su.uSunDir.value.copy(sunDir); su.uSunCol.value.copy(TOD.sun);
  const dayF = smoothstep(-0.08, 0.12, el);
  lightDir.copy(moonDir).lerp(sunDir, dayF).normalize();
  if (lightDir.y < 0.15) { lightDir.y = 0.15; lightDir.normalize(); }
  world.hemi.color.copy(TOD.hs); world.hemi.groundColor.copy(TOD.hg);
  world.sun.color.copy(TOD.sun);
  scene.environmentIntensity = lerp(1.6, 0.55, night);
}

// ------------------------------------------------------------------ quality
function applyQuality(name) {
  const q = QUALITY[name];
  settings.quality = name;
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.pr));
  world.reflection.scale = q.reflScale;
  world.reflection.enabled = q.refl && settings.reflections;
  world.qualityRefl = q.refl;
  world.sun.castShadow = q.shadows;
  world.traffic.spot.castShadow = q.shadows;
  if (world.sun.shadow.mapSize.x !== q.shadowSize) {
    world.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
  }
  world.rainQuality = q.rain;
  world.rain.setDensity(q.rain * settings.rainAmount);
  world.peds.maxCount = q.peds; world.peds.radius = q.peds_r;
  world.lightCount = q.lights;
  world.post.samples = q.msaa; world.post.streakOn = q.streak;
  world.post.build();
  onResize();
}

function onResize() {
  if (!world.post) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  world.reflection.setSize(s.x, s.y);
  world.post.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

// ------------------------------------------------------------------ light pool
const _cand = [];
function updateLightPool(pos) {
  _cand.length = 0;
  const cx = Math.floor(pos.x / 40), cz = Math.floor(pos.z / 40);
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const l = world.lightGrid.get((cx + i) + ',' + (cz + j));
    if (l) for (const s of l) { s._d = Math.hypot(s.x - pos.x, s.y - pos.y, s.z - pos.z); if (s._d < 75) _cand.push(s); }
  }
  _cand.sort((a, b) => a._d - b._d);
  const nightK = smoothstep(0.1, 0.6, world.night);
  world.pool.forEach((l, i) => {
    const s = _cand[i];
    if (!s || i >= world.lightCount) { l.intensity = 0; l.visible = false; return; }
    l.visible = true;
    l.position.set(s.x, s.y, s.z);
    l.color.copy(s.color);
    l.intensity = s.power * 1.2 * smoothstep(75, 40, s._d) * nightK * U.uNeon.value;
  });
}

// ------------------------------------------------------------------ modes
let controls, cinematic, interaction;
const plaza = () => world.holo.plaza;
function setMode(mode) {
  if (mode === controls.mode && mode !== 'cinematic') return;
  if (mode === 'cinematic') { controls.unlock(); controls.mode = 'cinematic'; cinematic.next(); }
  else if (mode === 'walk') controls.setMode('walk', { spawn: { x: plaza().x + 6, z: plaza().z + 30, yaw: 0.12 } });
  else if (mode === 'fly') controls.setMode('fly', { aerial: controls.mode !== 'walk' || true });
  ui.setMode(mode);
  ui.setCrosshair(mode === 'walk' || mode === 'fly');
  updateHint();
  audio.blip('ui');
}
world.follow = (v) => {
  controls.setMode('follow', { follow: v });
  ui.setMode('follow');
  ui.setCrosshair(false);
  ui.setShot('FOLLOWING // ' + (v.call || 'MAGLEV LINE 7'));
  updateHint();
};
world.flyTo = (p) => {
  controls.setMode('fly');
  camera.position.copy(p);
  camera.lookAt(p.x, p.y - 25, p.z - 40);
  controls.syncFromCamera();
  ui.setMode('fly'); ui.setCrosshair(true); updateHint();
};
world.shiftKoi = () => {
  const P = world.holo.koiPalettes;
  for (const k of world.holo.koi) { k.palette = (k.palette + 1) % P.length; k.mat.uniforms.uColor.value.set(P[k.palette][0]); k.mat.uniforms.uColor2.value.set(P[k.palette][1]); }
  audio.blip('hack');
};
world.spinGlobe = () => { world.holo.globeSpin = 12; audio.blip('scan'); };

function updateHint() {
  const m = controls.mode;
  const t = {
    cinematic: 'CINEMATIC AUTOPILOT · <kbd>N</kbd> next shot · <kbd>Click</kbd> anything to inspect · <kbd>2</kbd> walk the streets · <kbd>3</kbd> fly',
    walk: controls.locked ? '<kbd>WASD</kbd> walk · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · <kbd>Click</kbd>/<kbd>F</kbd> inspect · <kbd>Esc</kbd> free mouse' : '<kbd>Click</kbd> to capture mouse (or drag to look) · <kbd>WASD</kbd> walk',
    fly: controls.locked ? '<kbd>WASD</kbd> fly · <kbd>Space</kbd>/<kbd>C</kbd> up/down · <kbd>Shift</kbd> boost · wheel speed · <kbd>Click</kbd>/<kbd>F</kbd> inspect' : '<kbd>Click</kbd> to capture mouse (or drag to look) · <kbd>WASD</kbd> fly · <kbd>Space</kbd>/<kbd>C</kbd> up/down',
    follow: 'FOLLOW CAM · <kbd>Esc</kbd> release · <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> switch mode',
  }[m];
  ui.setHint(t);
}

// ------------------------------------------------------------------ lightning
const storm = { next: 6, t: -10 };
function updateLightning(time, dt) {
  const active = settings.lightning && settings.rain && world.night > 0.3;
  if (active && time > storm.next) { storm.t = time; storm.next = time + 9 + Math.random() * 18; audio.thunder(0.8 + Math.random() * 2.2); }
  const e = time - storm.t;
  let f = 0;
  if (e >= 0 && e < 1.2) f = Math.exp(-e * 14) + (e > 0.18 ? Math.exp(-(e - 0.18) * 9) * 0.8 : 0) + (e > 0.45 ? Math.exp(-(e - 0.45) * 6) * 0.5 : 0);
  U.uLightning.value = f;
  return f;
}

// ------------------------------------------------------------------ main loop
let lastT = performance.now();
let fpsAcc = 0, fpsN = 0, fps = 60, hudT = 0, frameN = 0;
const camPos = new THREE.Vector3(), camDir = new THREE.Vector3();

function loop() {
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  world.time += dt;
  const time = world.time;
  U.uTime.value = time;
  frameN++;

  if (settings.cycle) { settings.hour = (settings.hour + dt * (24 / 240)) % 24; ui.setTimeSlider(settings.hour); applyTime(settings.hour); }

  // camera
  if (controls.mode === 'cinematic') {
    cinematic.speed = settings.speed;
    cinematic.update(dt);
    ui.setShot(cinematic.label);
    world.post.grade.uniforms.uFade.value = cinematic.fade;
    world.post.grade.uniforms.uGlitch.value = cinematic.glitch;
  } else {
    controls.speedMul = settings.speed;
    controls.update(dt);
    world.post.grade.uniforms.uFade.value = 1;
    world.post.grade.uniforms.uGlitch.value = Math.max(0, world.post.grade.uniforms.uGlitch.value - dt * 3);
    if (controls.mode !== 'follow') ui.setShot(controls.mode === 'walk' ? 'STREET LEVEL // ON FOOT' : 'AERIAL // FREE FLIGHT');
  }
  camera.updateMatrixWorld();
  camPos.copy(camera.position);
  camera.getWorldDirection(camDir);

  // simulation
  updateTraffic(world.traffic, time, dt);
  updatePedestrians(world.peds, time, camPos);
  updateHolograms(world.holo, time, dt);
  updateDetails(world.details, time);
  world.rain.update(camPos);
  for (const s of world.allSets) s.update(camPos);
  world.sky.mesh.position.copy(camPos);
  if (frameN % 6 === 0) updateLightPool(camPos);

  // atmosphere
  const flash = updateLightning(time, dt);
  const rainOn = settings.rain ? settings.rainAmount : 0;
  U.uRain.value += (rainOn - U.uRain.value) * Math.min(1, dt * 0.8);
  world.rain.group.visible = U.uRain.value > 0.02;
  scene.fog.density = world.fogD * settings.fog * (0.85 + 0.15 * U.uRain.value);
  world.hemi.intensity = world.hemiI + flash * 0.9;
  world.sun.intensity = world.sunI + flash * 1.2;
  renderer.toneMappingExposure = world.exposure;
  world.post.grade.uniforms.uFlash.value = flash;
  audio.setRain(U.uRain.value);

  // shadow camera follows the viewer, snapped to texels to avoid shimmer
  const snap = 340 / world.sun.shadow.mapSize.x;
  const fx = Math.round((camPos.x + camDir.x * 60) / snap) * snap, fz = Math.round((camPos.z + camDir.z * 60) / snap) * snap;
  world.sun.target.position.set(fx, 0, fz);
  world.sun.position.set(fx + lightDir.x * 600, lightDir.y * 600, fz + lightDir.z * 600);
  world.sun.target.updateMatrixWorld();

  interaction.update(time);

  // render
  world.reflection.render(renderer, scene, camera);
  world.post.render(time);

  // HUD
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  hudT += dt;
  if (hudT > 0.15) {
    hudT = 0;
    ui.hud({ hour: settings.hour, pos: camPos, fps });
    const yaw = Math.atan2(-camDir.x, -camDir.z);
    const sel = interaction.selected?.vehicle?.pos || null;
    ui.minimap(camPos, yaw, Object.values(world.traffic.fleets), sel);
  }
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ boot
document.body.classList.add('intro');
build().then(() => {
  controls = new PlayerControls(camera, canvas, world.collision);
  cinematic = new Cinematic(camera, world);
  interaction = new Interaction({ camera, dom: canvas, world, ui, audio, controls, scene });
  interaction.collectTargets(world);
  ui.onCloseCard = () => interaction.deselect();
  ui.bindSettings({
    quality: (v) => applyQuality(v),
    rain: (on) => { settings.rain = on; },
    rainAmount: (v) => { settings.rainAmount = v; world.rain.setDensity((world.rainQuality ?? 0.85) * v); },
    lightning: (on) => { settings.lightning = on; },
    time: (v) => { settings.hour = v; applyTime(v); },
    cycle: (on) => { settings.cycle = on; },
    speed: (v) => { settings.speed = v; },
    sens: (v) => { controls.sens = v; },
    bloom: (v) => { world.post.bloomStrength = v; },
    fog: (v) => { settings.fog = v; },
    reflections: (on) => { settings.reflections = on; world.reflection.enabled = on && world.qualityRefl !== false; },
    audio: (on) => audio.setEnabled(on),
    mode: (m) => setMode(m),
  });
  applyQuality(settings.quality);
  cinematic.start();
  ui.setMode('cinematic');
  updateHint();
  document.addEventListener('pointerlockchange', updateHint);

  // input
  canvas.addEventListener('click', () => {
    if (document.body.classList.contains('intro')) return;
    const m = controls.mode;
    if ((m === 'walk' || m === 'fly') && !controls.locked) {
      if (controls.dragMoved < 6) controls.lock();
      return;
    }
    interaction.click(controls.locked ? new THREE.Vector2(0, 0) : null);
  });
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (document.body.classList.contains('intro')) { if (e.code === 'Enter') enter(); return; }
    if (e.code === 'Digit1') setMode('cinematic');
    else if (e.code === 'Digit2') setMode('walk');
    else if (e.code === 'Digit3') setMode('fly');
    else if (e.code === 'KeyN' && controls.mode === 'cinematic') cinematic.next();
    else if (e.code === 'KeyH') ui.toggleHud();
    else if (e.code === 'Tab') { e.preventDefault(); ui.toggleSettings(); }
    else if (e.code === 'KeyF') interaction.click(controls.locked || controls.mode === 'walk' || controls.mode === 'fly' ? new THREE.Vector2(0, 0) : null);
    else if (e.code === 'Escape') {
      if (interaction.selected) interaction.deselect();
      if (controls.mode === 'follow') setMode('fly');
    }
  });

  const enterBtn = document.getElementById('enter');
  enterBtn.disabled = false;
  const enter = () => {
    if (!document.body.classList.contains('intro')) return;
    document.body.classList.remove('intro');
    document.getElementById('intro').classList.add('gone');
    audio.start();
    audio.setEnabled(document.getElementById('s-audio').checked);
  };
  enterBtn.addEventListener('click', enter);
  if (new URLSearchParams(location.search).has('autostart')) enter();
  window.__city = { world, camera, controls, cinematic, interaction, setMode, applyTime, applyQuality, renderer, scene, settings };
  requestAnimationFrame(loop);
}).catch((err) => {
  console.error(err);
  loadStatus.textContent = 'ERROR: ' + err.message;
});
