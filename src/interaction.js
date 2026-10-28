import * as THREE from 'three';
import { Rand } from './config.js';
import { setBlackout } from './fx/buildingMaterial.js';

// Inspect anything: buildings, billboards, blade signs, vehicles, citizens,
// vending machines, food stalls and holograms. Each kind has an info card and
// one or two small actions (hack an ad, black out a tower, follow a car...).

const _m = new THREE.Matrix4(), _box = new THREE.Box3();

function bracketGeometry() {
  const p = [];
  const L = 0.22;
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) {
    const sx = x ? -1 : 1, sy = y ? -1 : 1, sz = z ? -1 : 1;
    p.push(x, y, z, x + sx * L, y, z, x, y, z, x, y + sy * L, z, x, y, z, x, y, z + sz * L);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return g;
}

export class Interaction {
  constructor({ camera, dom, world, ui, audio, controls, scene }) {
    Object.assign(this, { camera, dom, world, ui, audio, controls });
    this.ray = new THREE.Raycaster();
    this.ray.far = 700;
    this.mouse = new THREE.Vector2(-9, -9);
    this.targets = [];
    this.selected = null;
    this.hover = null;
    this.lastHover = 0;
    this.R = new Rand(17);
    this.bracket = new THREE.LineSegments(bracketGeometry(), new THREE.LineBasicMaterial({ color: new THREE.Color(0.4, 2.5, 3.0), depthTest: false, transparent: true }));
    this.bracket.visible = false;
    this.bracket.renderOrder = 999;
    this.bracket.frustumCulled = false;
    this.bracket.layers.set(2);
    scene.add(this.bracket);
    dom.addEventListener('mousemove', (e) => {
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    });
    dom.addEventListener('mouseleave', () => this.mouse.set(-9, -9));
  }

  collectTargets(w) {
    const t = [];
    for (const set of w.buildingSets) t.push(...set.meshes);
    t.push(...w.signs.inspect, ...w.streets.inspect, ...w.holo.inspect);
    for (const f of Object.values(w.traffic.fleets)) t.push(f.body);
    t.push(w.traffic.train.body, w.peds.mesh);
    this.targets = t;
  }

  pick(ndc) {
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.targets.filter((m) => m.visible !== false), false);
    for (const h of hits) {
      const info = this.resolve(h);
      if (info) return info;
    }
    return null;
  }

  resolve(h) {
    const m = h.object, kind = m.userData.kind, id = h.instanceId;
    const w = this.world;
    if (kind === 'building') {
      const tier = m.userData.items[id];
      const b = tier.building >= 0 ? w.layout.buildings[tier.building] : null;
      return { kind, mesh: m, id, tier, building: b, key: 'b' + tier.index };
    }
    if (kind === 'sign') return { kind, mesh: m, id, sign: m.userData.items[id], key: 's' + m.uuid + id };
    if (kind === 'vending') return { kind, mesh: m, id, item: m.userData.items[id], key: 'v' + m.uuid + id };
    if (kind === 'kiosk') return { kind, mesh: m, id, item: m.userData.items[id], key: 'k' + m.uuid + id };
    if (kind === 'vehicle') { const v = m.userData.fleet.list[id]; return v ? { kind, mesh: m, id, vehicle: v, key: 'c' + v.call } : null; }
    if (kind === 'ped') { const p = w.peds.visible[id]; return p ? { kind, mesh: m, id, ped: p, key: 'p' + p.name + id } : null; }
    if (kind === 'train') return { kind, mesh: m, id: 0, key: 'train' };
    if (kind === 'koi' || kind === 'globe' || kind === 'sculpture') return { kind, mesh: m, key: 'h' + m.uuid };
    return null;
  }

  click(ndc) {
    const info = this.pick(ndc || this.mouse);
    if (!info) { this.deselect(); return false; }
    this.select(info);
    return true;
  }

  select(info) {
    this.selected = info;
    this.audio.blip('open');
    this.ui.showCard(this.card(info));
  }

  deselect() { this.selected = null; this.bracket.visible = false; this.ui.hideCard(); }

  update(time) {
    // hover tooltip (throttled)
    if (time - this.lastHover > 0.12) {
      this.lastHover = time;
      const ndc = this.controls.locked ? new THREE.Vector2(0, 0) : this.mouse;
      const info = ndc.x < -2 ? null : this.pick(ndc);
      this.hover = info;
      this.ui.setHover(info ? this.title(info) : null, this.controls.locked);
      this.dom.style.cursor = info && !this.controls.locked ? 'pointer' : '';
    }
    const s = this.selected;
    if (!s) return;
    // bracket bounds
    if (s.kind === 'koi' || s.kind === 'globe' || s.kind === 'sculpture') {
      _box.setFromObject(s.mesh);
    } else {
      const geo = s.mesh.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      s.mesh.getMatrixAt(s.id, _m);
      _m.premultiply(s.mesh.matrixWorld);
      _box.copy(geo.boundingBox).applyMatrix4(_m);
      if (s.kind === 'ped' && s.ped) {
        _box.min.set(s.ped.pos.x - 0.5, s.ped.pos.y, s.ped.pos.z - 0.5); _box.max.set(s.ped.pos.x + 0.5, s.ped.pos.y + 1.9, s.ped.pos.z + 0.5);
      }
    }
    _box.expandByScalar(0.15);
    this.bracket.position.copy(_box.min);
    _box.getSize(this.bracket.scale);
    this.bracket.visible = true;
    this.bracket.material.opacity = 0.75 + 0.25 * Math.sin(time * 6);
    if (s.kind === 'vehicle' && s.vehicle) this.ui.updateCardLive(this.vehicleLive(s.vehicle));
  }

  title(info) {
    switch (info.kind) {
      case 'building': return info.building ? info.building.name : 'Outer district tower';
      case 'sign': return info.sign.kind === 'blade' ? `${info.sign.tA.sign[0]} — ${info.sign.tA.sign[2]}` : (info.sign.tA.brand ? info.sign.tA.brand.name + ' ' + info.sign.tA.brand.sub : info.sign.tA.sign[1]);
      case 'vending': return info.item.brand + ' vending unit';
      case 'kiosk': return info.item.name;
      case 'vehicle': return `${info.vehicle.fleet.name} ${info.vehicle.call}`;
      case 'ped': return 'Citizen — ' + info.ped.name;
      case 'train': return 'Maglev Line 7';
      case 'koi': return 'Twin Koi hologram';
      case 'globe': return 'Aether Globe';
      case 'sculpture': return 'Rooftop hologram';
    }
    return '';
  }

  vehicleLive(v) {
    return [['Altitude', `${v.pos.y.toFixed(0)} m`], ['Speed', `${(v.vel * 3.6).toFixed(0)} km/h`], ['Heading', `${((Math.atan2(v.dir.x, -v.dir.z) * 180 / Math.PI + 360) % 360).toFixed(0)}°`]];
  }

  card(info) {
    const w = this.world, R = this.R;
    const t = this.title(info);
    const act = (label, fn, cls = '') => ({ label, fn, cls });
    switch (info.kind) {
      case 'building': {
        const b = info.building;
        if (!b) return { title: t, sub: 'OUTER DISTRICT', rows: [['Height', `${(info.tier.y + info.tier.sy).toFixed(0)} m`], ['Status', 'Outside city grid']], actions: [] };
        const occ = (40 + (b.seed * 13) % 58).toFixed(0);
        const dark = this.blackout === b.seedKey;
        return {
          title: b.name, sub: `${b.corp.toUpperCase()} HOLDINGS // ${b.arche.toUpperCase()}`, accent: '#' + b.top.trimCol.getHexString(),
          rows: [['Height', `${b.height.toFixed(0)} m`], ['Floors', b.floors], ['Occupancy', occ + '%'], ['Power draw', `${(b.height * 0.17).toFixed(1)} MW`], ['Security', ['Civilian', 'Corporate', 'Militarized'][Math.floor(b.seed) % 3]]],
          actions: [
            act(dark ? 'Restore power' : 'Trigger blackout', () => this.toggleBlackout(b), 'warn'),
            act('Fly to roof', () => w.flyTo(new THREE.Vector3(b.top.x, b.height + 25, b.top.z + 40))),
          ],
        };
      }
      case 'sign': {
        const s = info.sign;
        if (s.kind === 'blade' || s.kind === 'banner') {
          const sg = s.tA.sign;
          return { title: sg[0], sub: `NEON SIGN // ${sg[1]}`, accent: '#' + s.tA.color.getHexString(), rows: [['Translation', sg[2]], ['Tube age', `${R.int(2, 40)} yrs`], ['Licensed', R.chance(0.6) ? 'Yes' : 'No — pirate sign']], actions: [act('Hack sign', () => this.hackSign(info), 'hack')] };
        }
        const br = s.tA.brand;
        return { title: br.name + (br.sub ? ' ' + br.sub : ''), sub: br.kind.toUpperCase(), accent: br.col, rows: [['Slogan', `“${br.tag}”`], ['Ad spend', `¥${R.int(2, 90)}M / night`], ['Impressions', `${R.int(10, 900)}k / hr`]], actions: [act('Hack billboard', () => this.hackSign(info), 'hack')] };
      }
      case 'vending': return { title: info.item.brand, sub: 'AUTOMAT // CASHLESS', accent: '#' + info.item.col.getHexString(), rows: [['Stock', `${R.int(3, 40)} cans`], ['Price', '¥150'], ['Temperature', '2 °C']], actions: [act('Buy a drink — ¥150', () => this.buy(info))] };
      case 'kiosk': return { title: info.item.name, sub: 'STREET FOOD // OPEN 24H', accent: '#ff7a2a', rows: [['Queue', `${R.int(0, 6)} people`], ['Health rating', R.pick(['A', 'B', 'C', 'Questionable'])], ['Special', R.pick(['Synth-pork ramen', 'Vat-grown tako', 'Neon gyoza', 'Kelp soba'])]], actions: [act('Order food', () => this.order(info))] };
      case 'vehicle': {
        const v = info.vehicle;
        return { title: v.call, sub: `${v.fleet.name.toUpperCase()} // ${v.operator.toUpperCase()}`, accent: '#' + v.glow.getHexString(), rows: [['Destination', v.dest], ...this.vehicleLive(v)], live: true, actions: [act('Follow vehicle', () => w.follow(v)), act('Ping transponder', () => { this.audio.blip('scan'); this.ui.toast(`${v.call}: “Keep your distance, choom.”`); })] };
      }
      case 'ped': {
        const p = info.ped;
        return { title: p.name, sub: `CITIZEN // ${p.job.toUpperCase()}`, accent: '#19e8ff', rows: [['Cyberware', p.ware[0]], ['', p.ware[1]], ['Threat', p.threat], ['Credit', `¥${(p.h * 91283 % 99999).toFixed(0)}`]], actions: [act('Deep scan', () => { this.audio.blip('scan'); this.ui.toast(`${p.name}: no outstanding warrants.`); })] };
      }
      case 'train': return { title: 'Maglev Line 7', sub: 'ELEVATED LOOP // KAIDŌ CIRCLE', accent: '#ff2a8a', rows: [['Cars', '6'], ['Speed', '86 km/h'], ['Passengers', String(R.int(80, 400))]], actions: [act('Ride the train', () => w.follow(w.traffic.train))] };
      case 'koi': return { title: 'Twin Koi', sub: 'PUBLIC HOLOGRAM // SAKURA ROBOTICS', accent: '#ff5a1a', rows: [['Length', '30 m each'], ['Artist', 'Mei Kurogane'], ['Projectors', '48 rooftop emitters']], actions: [act('Shift palette', () => w.shiftKoi())] };
      case 'globe': return { title: 'Aether Globe', sub: 'AETHER BANK // PLAZA INSTALLATION', accent: '#e7c66b', rows: [['Diameter', '26 m'], ['Market', 'NKX +2.41%'], ['Ticker', 'Live']], actions: [act('Spin up', () => w.spinGlobe())] };
      case 'sculpture': return { title: (info.mesh.userData.building?.name || 'Tower') + ' hologram', sub: 'ROOFTOP PROJECTION', accent: '#8a5cff', rows: [['Emitters', '12'], ['Refresh', '240 Hz']], actions: [act('Overclock', () => { info.mesh.userData.boost = 4; this.audio.blip('hack'); })] };
    }
    return { title: t, rows: [], actions: [] };
  }

  toggleBlackout(b) {
    if (this.blackout === b.seedKey) { this.blackout = null; setBlackout(-1, 0); }
    else { this.blackout = b.seedKey; setBlackout(b.seedKey, 1); }
    this.audio.blip('hack');
    this.ui.toast(this.blackout ? `${b.name}: grid disconnected.` : `${b.name}: power restored.`);
    if (this.selected) this.ui.showCard(this.card(this.selected));
  }

  hackSign(info) {
    const s = info.sign, mesh = info.mesh;
    const atlas = this.world.atlas;
    const pool = s.kind === 'billboard' || s.kind === 'rooftop' ? atlas.wide : atlas.vert;
    s.tA = pool[this.R.int(0, pool.length - 1)];
    s.tB = pool[this.R.int(0, pool.length - 1)];
    const a = mesh.geometry.attributes;
    a.aTileA.setXYZW(info.id, s.tA.u0, s.tA.v0, s.tA.u1, s.tA.v1);
    a.aTileB.setXYZW(info.id, s.tB.u0, s.tB.v0, s.tB.u1, s.tB.v1);
    a.aTileA.needsUpdate = a.aTileB.needsUpdate = true;
    this.world.signs.material.uniforms.uHack.value.set(s.seed, this.world.time);
    this.audio.blip('hack');
    this.ui.toast('ICE bypassed. Ad feed rerouted.');
    this.ui.showCard(this.card(info));
  }

  buy(info) {
    const v = info.item;
    this.world.streets.vendFlash.value.set(v.x, 1.2, v.z, this.world.time);
    this.audio.blip('buy');
    this.ui.toast(`*clunk* — one ice-cold ${v.brand}. ¥150 deducted.`);
  }

  order(info) {
    const k = info.item;
    this.world.steam.burst.value.set(k.x + Math.sin(k.rot) * 0.6, 0, k.z + Math.cos(k.rot) * 0.6, this.world.time);
    this.audio.blip('buy');
    this.ui.toast(`${k.name}: “Order up! Extra noodles, no questions.”`);
  }
}
