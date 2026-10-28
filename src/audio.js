// Procedural ambience with WebAudio: rain hiss, distant city drone, thunder
// rumbles and UI blips. Nothing is downloaded.
export class Ambience {
  constructor() { this.ctx = null; this.enabled = true; this.volume = 0.6; this.rainLevel = 1; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? this.volume : 0; this.master.connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.0; }
    this.noise = noise;
    // rain
    const rs = ctx.createBufferSource(); rs.buffer = noise; rs.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0.22;
    rs.connect(hp).connect(lp).connect(this.rainGain).connect(this.master); rs.start();
    // city rumble
    const cs = ctx.createBufferSource(); cs.buffer = noise; cs.loop = true; cs.playbackRate.value = 0.5;
    const clp = ctx.createBiquadFilter(); clp.type = 'lowpass'; clp.frequency.value = 160;
    const cg = ctx.createGain(); cg.gain.value = 0.35;
    cs.connect(clp).connect(cg).connect(this.master); cs.start();
    // drone pad
    const pad = ctx.createGain(); pad.gain.value = 0.035;
    const plp = ctx.createBiquadFilter(); plp.type = 'lowpass'; plp.frequency.value = 420;
    for (const f of [55, 55.3, 82.4, 110.2]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(plp); o.start(); }
    plp.connect(pad).connect(this.master);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg).connect(plp.frequency); lfo.start();
  }

  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.2); }
  setVolume(v) { this.volume = v; if (this.master && this.enabled) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  setRain(level) { this.rainLevel = level; if (this.rainGain) this.rainGain.gain.setTargetAtTime(0.03 + level * 0.25, this.ctx.currentTime, 0.5); }

  thunder(delay = 1.5) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.35;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + 5);
  }

  blip(kind = 'ui') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const seq = { ui: [[880, 0.05]], open: [[660, 0.05], [990, 0.06]], buy: [[523, 0.07], [659, 0.07], [784, 0.07], [180, 0.25]], hack: [[200, 0.04], [1200, 0.03], [300, 0.04], [1800, 0.05], [90, 0.2]], scan: [[1400, 0.03], [1600, 0.03], [1800, 0.03], [2000, 0.08]] }[kind] || [[880, 0.05]];
    let o = 0;
    for (const [freq, dur] of seq) {
      const osc = ctx.createOscillator(); osc.type = kind === 'hack' ? 'square' : 'sine'; osc.frequency.value = freq;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + o); g.gain.exponentialRampToValueAtTime(0.12, t + o + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + o + dur);
      osc.connect(g).connect(this.master); osc.start(t + o); osc.stop(t + o + dur + 0.02);
      o += dur * 0.9;
    }
  }
}
