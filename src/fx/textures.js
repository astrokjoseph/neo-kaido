import * as THREE from 'three';
import { Rand } from '../config.js';

// Procedurally painted canvas atlases: billboard ads, vertical blade signs,
// holographic HUD panels and a scrolling ring ticker. No external images.

const FONT_JP = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP","Meiryo",sans-serif';
const FONT_EN = '"Avenir Next Condensed","Helvetica Neue","Arial Narrow",Arial,sans-serif';

export const BRANDS = [
  { name: 'HYPERION', sub: 'DYNAMICS', tag: 'Tomorrow, manufactured.', jp: '未来', col: '#19e8ff', col2: '#2a6bff', kind: 'Megacorp — orbital logistics' },
  { name: 'VOLT', sub: 'COLA', tag: 'Charge your blood.', jp: '電撃', col: '#ff2a3a', col2: '#ffb347', kind: 'Beverage — synthetic caffeine' },
  { name: 'SAKURA', sub: 'ROBOTICS', tag: 'Companions that remember.', jp: '桜', col: '#ff5ab4', col2: '#ffd0ea', kind: 'Androids — domestic units' },
  { name: 'MIRAGE', sub: 'OS 9', tag: 'Reality, upgraded.', jp: '蜃気楼', col: '#8a5cff', col2: '#19e8ff', kind: 'Neural interface firmware' },
  { name: 'ZERO-G', sub: 'NOODLE', tag: 'Ramen from orbit. 24H.', jp: 'ラーメン', col: '#ffa53a', col2: '#ff2a3a', kind: 'Fast food — orbital franchise' },
  { name: 'AETHER', sub: 'BANK', tag: 'The world is yours.', jp: '銀行', col: '#e7c66b', col2: '#19e8ff', kind: 'Financial — quantum ledgers' },
  { name: 'OKAMI', sub: 'SECURITY', tag: 'We are already watching.', jp: '狼', col: '#ff2a3a', col2: '#eeeeee', kind: 'Private military contractor' },
  { name: 'DREAMWARE', sub: '', tag: 'Sleep is a subscription.', jp: '夢', col: '#6dff5a', col2: '#19e8ff', kind: 'Neural entertainment' },
  { name: 'ORBITAL', sub: 'LINES', tag: 'Luna in 6 hours.', jp: '月行き', col: '#19e8ff', col2: '#ffffff', kind: 'Spaceline' },
  { name: 'KAGE', sub: 'CLINIC', tag: 'New eyes. Same you.', jp: '義眼', col: '#19ffc8', col2: '#ff2a8a', kind: 'Cyberware clinic' },
  { name: 'PULSE', sub: '//SYNTH', tag: 'Feel every frequency.', jp: '鼓動', col: '#ff2a8a', col2: '#8a5cff', kind: 'Music implants' },
  { name: 'NEOGENE', sub: '', tag: 'Grow better children.', jp: '遺伝子', col: '#9dff3a', col2: '#ffffff', kind: 'Genetic boutique' },
  { name: 'KITSUNE', sub: 'CASINO', tag: 'Luck is programmable.', jp: '狐', col: '#ffa53a', col2: '#ff2a8a', kind: 'Entertainment complex' },
  { name: 'TESSERACT', sub: 'CLOUD', tag: 'Store your soul.', jp: '魂', col: '#2a9bff', col2: '#8a5cff', kind: 'Consciousness backup' },
  { name: 'RYU', sub: 'MOTORS', tag: 'Gravity is optional.', jp: '龍', col: '#ff3a2a', col2: '#ffa53a', kind: 'AV manufacturer' },
  { name: 'NOVA', sub: 'PHARMA', tag: 'Feel nothing. Feel fine.', jp: '薬', col: '#ffffff', col2: '#19e8ff', kind: 'Pharmaceuticals' },
];

export const VERTICAL_SIGNS = [
  ['酒', 'BAR', 'Sake — bar'], ['ホテル', 'HOTEL', 'Hotel'], ['ラーメン', 'RAMEN', 'Ramen'],
  ['薬', 'PHARMACY', 'Medicine'], ['電脳', 'CYBER', 'Electric brain — cyberware'], ['カラオケ', 'KARAOKE', 'Karaoke'],
  ['寿司', 'SUSHI', 'Sushi'], ['夜城', 'NIGHT CITY', 'Night castle'], ['龍', 'DRAGON', 'Dragon'],
  ['質屋', 'PAWN', 'Pawn shop'], ['義体', 'BODY MOD', 'Prosthetic body'], ['24H', 'OPEN', 'Open all night'],
  ['麻雀', 'MAHJONG', 'Mahjong parlour'], ['湯', 'BATH', 'Hot bath'], ['占い', 'FORTUNE', 'Fortune telling'],
  ['焼肉', 'BBQ', 'Grilled meat'], ['ゲーム', 'ARCADE', 'Game centre'], ['書', 'BOOKS', 'Books'],
  ['蕎麦', 'SOBA', 'Soba noodles'], ['医', 'CLINIC', 'Doctor'], ['猫', 'CAT CAFE', 'Cat'],
  ['雨', 'RAIN', 'Rain'], ['夢', 'DREAMS', 'Dreams'], ['金', 'GOLD', 'Gold / money'],
  ['BAR', 'BAR', 'Bar'], ['SHOP', 'SHOP', 'Shop'], ['HOTEL', 'HOTEL', 'Hotel'], ['禁煙', 'NO SMOKING', 'No smoking'],
  ['愛', 'LOVE', 'Love'], ['鬼', 'ONI', 'Demon'], ['刀', 'BLADES', 'Sword'], ['魚', 'FISH', 'Fish market'],
];

const NEONS = ['#ff2a8a', '#19e8ff', '#8a5cff', '#ffa53a', '#ff2a3a', '#2a9bff', '#6dff5a', '#ffe14a'];

function glowText(ctx, text, x, y, col, blur = 18, passes = 2) {
  ctx.save();
  ctx.shadowColor = col; ctx.fillStyle = col;
  for (let i = 0; i < passes; i++) { ctx.shadowBlur = blur * (i + 1); ctx.fillText(text, x, y); }
  ctx.shadowBlur = blur * 0.3; ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85; ctx.fillText(text, x, y);
  ctx.restore();
}

function fitFont(ctx, text, maxW, size, family, weight = '800') {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 2; } while (ctx.measureText(text).width > maxW && s > 8);
}

function drawWideAd(ctx, x, y, w, h, b, variant, rnd) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  // background
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#04030a'); g.addColorStop(1, variant % 2 ? '#0d0618' : '#020a14');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (variant === 0) {
    // big translucent kanji + brand
    ctx.globalAlpha = 0.22; ctx.fillStyle = b.col2; fitFont(ctx, b.jp, w * 0.9, h * 0.95, FONT_JP, '900');
    ctx.fillText(b.jp, x + w * 0.5, y + h * 0.52); ctx.globalAlpha = 1;
    fitFont(ctx, b.name, w * 0.82, h * 0.38, FONT_EN, '900'); glowText(ctx, b.name, x + w / 2, y + h * 0.42, b.col, 14);
    ctx.font = `600 ${h * 0.1}px ${FONT_EN}`; ctx.fillStyle = b.col2; ctx.fillText((b.sub ? b.sub + '  ·  ' : '') + b.tag.toUpperCase(), x + w / 2, y + h * 0.75);
  } else if (variant === 1) {
    // planet / eye on the left, text on the right
    const cx = x + h * 0.55, cy = y + h * 0.5, r = h * 0.36;
    const rg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.3, b.col); rg.addColorStop(1, '#000000');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = b.col2; ctx.lineWidth = 3; ctx.shadowColor = b.col2; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.5, r * 0.35, -0.3, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    fitFont(ctx, b.name, w - h * 1.25, h * 0.3, FONT_EN, '900'); glowText(ctx, b.name, x + h * 1.1, y + h * 0.38, b.col, 12);
    ctx.font = `500 ${h * 0.09}px ${FONT_EN}`; ctx.fillStyle = '#d8e6ff'; ctx.fillText(b.tag, x + h * 1.12, y + h * 0.62);
    ctx.font = `700 ${h * 0.12}px ${FONT_JP}`; ctx.fillStyle = b.col2; ctx.fillText(b.jp + (b.sub ? '  ' + b.sub : ''), x + h * 1.12, y + h * 0.8);
  } else if (variant === 2) {
    // diagonal stripes and a huge number
    ctx.save(); ctx.globalAlpha = 0.35;
    for (let i = -10; i < 30; i++) { ctx.fillStyle = i % 2 ? b.col : 'transparent'; ctx.beginPath();
      ctx.moveTo(x + i * 28, y); ctx.lineTo(x + i * 28 + 14, y); ctx.lineTo(x + i * 28 + 14 - h, y + h); ctx.lineTo(x + i * 28 - h, y + h); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x + w * 0.08, y + h * 0.14, w * 0.84, h * 0.72);
    const num = rnd.pick(['-40%', '2099', '¥980', 'NEW', '×10', '24H', 'v9.0']);
    fitFont(ctx, num, w * 0.4, h * 0.55, FONT_EN, '900'); ctx.textAlign = 'left';
    glowText(ctx, num, x + w * 0.12, y + h * 0.5, b.col2, 12);
    ctx.textAlign = 'right'; fitFont(ctx, b.name, w * 0.4, h * 0.24, FONT_EN, '900');
    glowText(ctx, b.name, x + w * 0.88, y + h * 0.4, b.col, 10);
    ctx.font = `700 ${h * 0.12}px ${FONT_JP}`; ctx.fillStyle = '#ffffff'; ctx.fillText(b.jp, x + w * 0.88, y + h * 0.64);
  } else {
    // the watching eye
    const cx = x + w * 0.5, cy = y + h * 0.45;
    ctx.strokeStyle = b.col; ctx.lineWidth = 6; ctx.shadowColor = b.col; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.32, cy); ctx.quadraticCurveTo(cx, cy - h * 0.55, cx + w * 0.32, cy);
    ctx.quadraticCurveTo(cx, cy + h * 0.55, cx - w * 0.32, cy); ctx.stroke();
    const rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, h * 0.22);
    rg.addColorStop(0, '#000'); rg.addColorStop(0.35, '#000'); rg.addColorStop(0.4, b.col2); rg.addColorStop(1, b.col);
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, h * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = `800 ${h * 0.11}px ${FONT_EN}`; ctx.fillStyle = '#ffffff';
    ctx.fillText(b.name + ' ' + b.sub + ' — ' + b.tag.toUpperCase(), cx, y + h * 0.88);
  }
  // frame
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = b.col; ctx.lineWidth = 5; ctx.shadowColor = b.col; ctx.shadowBlur = 10;
  ctx.strokeRect(x + 5, y + 5, w - 10, h - 10); ctx.restore();
}

function drawVerticalSign(ctx, x, y, w, h, sign, i, rnd) {
  const col = NEONS[i % NEONS.length];
  const inverse = i % 5 === 2;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = inverse ? col : '#06040a'; ctx.fillRect(x, y, w, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const text = sign[0];
  const chars = /^[A-Z0-9]+$/.test(text) ? text.split('') : Array.from(text);
  const n = chars.length;
  const step = Math.min((h - 30) / n, w * 1.05);
  const size = Math.min(step * 0.92, w * 0.82);
  const top = y + h / 2 - (step * n) / 2 + step / 2;
  ctx.font = `900 ${size}px ${FONT_JP}`;
  for (let k = 0; k < n; k++) {
    const cy = top + k * step;
    if (inverse) { ctx.fillStyle = '#05030a'; ctx.fillText(chars[k], x + w / 2, cy); }
    else glowText(ctx, chars[k], x + w / 2, cy, col, 10, 2);
  }
  ctx.restore();
  ctx.save(); ctx.strokeStyle = inverse ? '#ffffff' : col; ctx.lineWidth = 4; ctx.shadowColor = col; ctx.shadowBlur = 8;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8); ctx.restore();
}

/** Billboard atlas: 16 wide ads (512x256) in the top half, 32 vertical signs (128x512) in the bottom half. */
export function createSignAtlas() {
  const S = 2048;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  const rnd = new Rand(77);
  const wide = []; const vert = []; const avg = [];
  for (let i = 0; i < 16; i++) {
    const cx = i % 4, cy = Math.floor(i / 4);
    drawWideAd(ctx, cx * 512, cy * 256, 512, 256, BRANDS[i], i % 4, rnd);
    wide.push({ u0: cx * 0.25, v0: 1 - (cy + 1) * 0.125, u1: (cx + 1) * 0.25, v1: 1 - cy * 0.125, brand: BRANDS[i], color: new THREE.Color(BRANDS[i].col) });
  }
  for (let i = 0; i < 32; i++) {
    const cx = i % 16, cy = Math.floor(i / 16);
    drawVerticalSign(ctx, cx * 128, 1024 + cy * 512, 128, 512, VERTICAL_SIGNS[i], i, rnd);
    vert.push({ u0: cx / 16, v0: 1 - (1024 + (cy + 1) * 512) / S, u1: (cx + 1) / 16, v1: 1 - (1024 + cy * 512) / S, sign: VERTICAL_SIGNS[i], color: new THREE.Color(NEONS[i % NEONS.length]) });
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { texture: tex, wide, vert, canvas: cv, avg };
}

/** Holographic HUD panels: 4x2 tiles of 256px, drawn as light on black for additive blending. */
export function createHudAtlas() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1024, 512);
  const rnd = new Rand(1234);
  const C = ['#19e8ff', '#ff2a8a', '#ffa53a', '#8a5cff', '#6dff5a', '#19e8ff', '#ff2a8a', '#e7f6ff'];
  for (let i = 0; i < 8; i++) {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 256, c = C[i];
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 2; ctx.shadowColor = c; ctx.shadowBlur = 6;
    ctx.strokeRect(8, 8, 240, 240);
    ctx.beginPath(); ctx.moveTo(8, 40); ctx.lineTo(248, 40); ctx.stroke();
    ctx.font = `700 15px ${FONT_EN}`; ctx.textBaseline = 'middle';
    const titles = ['MARKET // NKX', 'BIOMETRICS', 'TRAFFIC CTRL', 'WEATHER', 'NET STATUS', 'SECTOR MAP', 'ALERT', 'TRANSIT'];
    ctx.fillText(titles[i], 16, 24);
    ctx.fillText(String(rnd.int(10, 99)) + '.' + rnd.int(0, 9), 200, 24);
    const kind = i % 4;
    if (kind === 0) {
      ctx.beginPath(); let v = 150;
      for (let k = 0; k <= 30; k++) { v += rnd.range(-18, 18); v = Math.max(60, Math.min(230, v)); k ? ctx.lineTo(16 + k * 7.6, v) : ctx.moveTo(16, v); }
      ctx.stroke();
      for (let k = 0; k < 18; k++) { const hh = rnd.range(8, 50); ctx.globalAlpha = 0.5; ctx.fillRect(16 + k * 13, 238 - hh, 8, hh); }
      ctx.globalAlpha = 1;
    } else if (kind === 1) {
      for (let r = 0; r < 4; r++) { ctx.beginPath(); ctx.arc(128, 140, 30 + r * 22, rnd.range(0, 6), rnd.range(0, 6) + 3.5); ctx.stroke(); }
      ctx.font = `800 34px ${FONT_EN}`; ctx.textAlign = 'center'; ctx.fillText(String(rnd.int(40, 99)) + '%', 128, 140); ctx.textAlign = 'left';
    } else if (kind === 2) {
      ctx.font = `500 13px monospace`;
      for (let k = 0; k < 12; k++) { ctx.globalAlpha = rnd.range(0.4, 1); ctx.fillText(Array.from({ length: 22 }, () => '0123456789ABCDEF<>/#'[rnd.int(0, 19)]).join(''), 16, 58 + k * 15); }
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 0.6;
      for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.moveTo(16 + k * 28, 48); ctx.lineTo(16 + k * 28, 240); ctx.stroke(); ctx.beginPath(); ctx.moveTo(16, 48 + k * 24); ctx.lineTo(240, 48 + k * 24); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(rnd.range(60, 200), rnd.range(80, 200), 10, 0, 7); ctx.fill();
      if (i === 6) { ctx.font = `900 64px ${FONT_EN}`; ctx.textAlign = 'center'; ctx.fillText('⚠', 128, 150); ctx.textAlign = 'left'; }
    }
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Long ticker strip for the holographic globe rings. */
export function createTickerTexture(text, color = '#19e8ff') {
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 2048, 128);
  ctx.font = `800 64px ${FONT_JP}`; ctx.textBaseline = 'middle';
  let x = 10;
  while (x < 2048) { glowText(ctx, text, x, 64, color, 10, 1); x += ctx.measureText(text).width + 60; }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Helipad decal. */
export function createHelipadTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#ffd04a'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(128, 128, 110, 0, 7); ctx.stroke();
  ctx.font = `900 150px ${FONT_EN}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', 128, 136);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
