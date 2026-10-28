import { CFG, HALF, blockCenter } from './config.js';

// DOM overlay: HUD telemetry, minimap radar, info cards, tooltips, toasts and
// the settings panel.
const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.card = $('card');
    this.tooltip = $('tooltip');
    this.toastEl = $('toast');
    this.cross = $('crosshair');
    this.mm = $('minimap').getContext('2d');
    this.mouse = { x: 0, y: 0 };
    addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.tooltip.style.left = e.clientX + 'px'; this.tooltip.style.top = e.clientY + 'px'; });
    $('card-close').addEventListener('click', () => this.onCloseCard && this.onCloseCard());
    $('settings-toggle').addEventListener('click', () => this.toggleSettings());
    this.liveRows = null;
  }

  toggleSettings(force) {
    const s = $('settings');
    const on = force ?? !s.classList.contains('on');
    s.classList.toggle('on', on);
  }

  bindSettings(handlers) {
    const bindRange = (id, out, fmt, fn) => {
      const el = $(id), o = $(out);
      const go = () => { const v = parseFloat(el.value); o.textContent = fmt(v); fn(v); };
      el.addEventListener('input', go); go();
    };
    const bindCheck = (id, fn) => { const el = $(id); el.addEventListener('change', () => fn(el.checked)); fn(el.checked); };
    $('s-quality').addEventListener('change', (e) => handlers.quality(e.target.value));
    bindCheck('s-rain', handlers.rain);
    bindRange('s-rainamt', 'o-rainamt', (v) => Math.round(v * 100) + '%', handlers.rainAmount);
    bindCheck('s-lightning', handlers.lightning);
    bindRange('s-time', 'o-time', (v) => fmtTime(v), handlers.time);
    bindCheck('s-cycle', handlers.cycle);
    bindRange('s-speed', 'o-speed', (v) => v.toFixed(2) + '×', handlers.speed);
    bindRange('s-sens', 'o-sens', (v) => v.toFixed(2), handlers.sens);
    bindRange('s-bloom', 'o-bloom', (v) => v.toFixed(2), handlers.bloom);
    bindRange('s-fog', 'o-fog', (v) => v.toFixed(2) + '×', handlers.fog);
    bindCheck('s-refl', handlers.reflections);
    bindCheck('s-audio', handlers.audio);
    bindCheck('s-hud', (on) => document.body.classList.toggle('hud-off', !on));
    for (const b of document.querySelectorAll('#modes button')) b.addEventListener('click', (e) => { e.stopPropagation(); handlers.mode(b.dataset.mode); });
  }

  setTimeSlider(h) { const el = $('s-time'); el.value = h; $('o-time').textContent = fmtTime(h); }
  toggleHud() { const el = $('s-hud'); el.checked = !el.checked; el.dispatchEvent(new Event('change')); }

  setMode(mode) {
    for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('active', b.dataset.mode === mode || (mode === 'follow' && false));
    $('hud-mode').textContent = { cinematic: 'CINEMATIC', walk: 'STREET', fly: 'AERIAL', follow: 'FOLLOW' }[mode];
    this.mode = mode;
  }

  setHint(text) { $('hint').innerHTML = text; }
  setShot(text) { $('hud-shot').textContent = text; }

  setHover(title, locked) {
    this.cross.classList.toggle('hot', !!title && locked);
    if (!title) { this.tooltip.classList.remove('on'); return; }
    this.tooltip.textContent = '◈ ' + title + (locked ? '  [click]' : '');
    if (locked) { this.tooltip.style.left = innerWidth / 2 + 'px'; this.tooltip.style.top = innerHeight / 2 + 'px'; }
    this.tooltip.classList.add('on');
  }

  setCrosshair(on) { this.cross.classList.toggle('on', on); }

  showCard(c) {
    this.card.style.setProperty('--accent', c.accent || '#19e8ff');
    $('card-sub').textContent = c.sub || '';
    $('card-title').textContent = c.title;
    const dl = $('card-rows');
    dl.innerHTML = '';
    this.liveRows = {};
    for (const [k, v] of c.rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
      this.liveRows[k] = dd;
    }
    const acts = $('card-actions');
    acts.innerHTML = '';
    for (const a of c.actions) {
      const b = document.createElement('button');
      b.textContent = a.label; if (a.cls) b.className = a.cls;
      b.addEventListener('click', (e) => { e.stopPropagation(); a.fn(); });
      acts.append(b);
    }
    this.card.classList.add('on');
  }
  updateCardLive(rows) { if (!this.liveRows) return; for (const [k, v] of rows) if (this.liveRows[k]) this.liveRows[k].textContent = v; }
  hideCard() { this.card.classList.remove('on'); this.liveRows = null; }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.toastEl.classList.remove('on'), 3200);
  }

  hud({ hour, pos, fps }) {
    $('hud-time').textContent = fmtTime(hour);
    $('hud-pos').textContent = `${pos.x.toFixed(0)} / ${pos.z.toFixed(0)}`;
    $('hud-alt').textContent = `${pos.y.toFixed(1)} m`;
    $('hud-fps').textContent = fps.toFixed(0);
  }

  /** Radar: the street grid rotated with the camera, traffic blips, plaza ring. */
  minimap(cam, yaw, fleets, selected) {
    const g = this.mm, S = 360, C = S / 2, scale = 0.42;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.clip();
    g.translate(C, C); g.rotate(yaw);
    const tx = (x) => (x - cam.x) * scale, tz = (z) => (z - cam.z) * scale;
    g.fillStyle = 'rgba(25,232,255,0.10)'; g.strokeStyle = 'rgba(25,232,255,0.28)'; g.lineWidth = 1;
    const range = 460;
    for (let i = -CFG.OUTER; i <= CFG.OUTER; i++) {
      const cx = i * CFG.PITCH; if (Math.abs(cx - cam.x) > range) continue;
      for (let j = -CFG.OUTER; j <= CFG.OUTER; j++) {
        const cz = j * CFG.PITCH; if (Math.abs(cz - cam.z) > range) continue;
        const b = CFG.BLOCK * scale;
        if (i === 0 && j === 0) { g.strokeStyle = 'rgba(255,42,138,0.8)'; g.beginPath(); g.arc(tx(cx), tz(cz), 12, 0, 7); g.stroke(); g.strokeStyle = 'rgba(25,232,255,0.28)'; continue; }
        const outer = Math.max(Math.abs(i), Math.abs(j)) > HALF;
        g.fillStyle = outer ? 'rgba(25,232,255,0.05)' : 'rgba(25,232,255,0.12)';
        g.fillRect(tx(cx) - b / 2, tz(cz) - b / 2, b, b);
      }
    }
    // traffic
    for (const f of fleets) {
      g.fillStyle = f.name === 'Police Spinner' ? '#4a7bff' : f.name === 'Ground Car' ? 'rgba(255,190,90,0.6)' : 'rgba(255,42,138,0.85)';
      for (const v of f.list) {
        const x = tx(v.pos.x), z = tz(v.pos.z);
        if (x * x + z * z > C * C) continue;
        g.fillRect(x - 1.5, z - 1.5, 3, 3);
      }
    }
    if (selected) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(tx(selected.x), tz(selected.z), 6, 0, 7); g.stroke(); }
    g.restore();
    // player arrow (always up)
    g.fillStyle = '#19e8ff'; g.shadowColor = '#19e8ff'; g.shadowBlur = 10;
    g.beginPath(); g.moveTo(C, C - 11); g.lineTo(C + 7, C + 8); g.lineTo(C, C + 4); g.lineTo(C - 7, C + 8); g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(25,232,255,0.4)'; g.beginPath(); g.arc(C, C, C - 2, 0, 7); g.stroke();
    g.fillStyle = 'rgba(232,244,255,0.7)'; g.font = '20px "Share Tech Mono", monospace'; g.textAlign = 'center';
    const nx = Math.sin(yaw) * (C - 18), nz = -Math.cos(yaw) * (C - 18);
    g.fillText('N', C + nx, C + nz + 7);
  }
}

export function fmtTime(h) {
  h = ((h % 24) + 24) % 24;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
