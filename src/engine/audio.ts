/** WebAudio chiptune: synthesised sound effects and a small original looping tune. No audio files. */

type Wave = OscillatorType;

// Am – F – C – G, two passes with a different lead figure.
const CHORDS: { bass: number; lead: number[] }[] = [
  { bass: 110.0, lead: [440.0, 523.25, 659.25] },
  { bass: 87.31, lead: [349.23, 440.0, 523.25] },
  { bass: 130.81, lead: [392.0, 523.25, 659.25] },
  { bass: 98.0, lead: [392.0, 493.88, 587.33] },
];
const LEAD_A = [0, -1, 1, 2, -1, 1, 0, -1, 2, 1, -1, 0, 1, -1, 2, -1];
const LEAD_B = [2, 1, 0, 1, 2, -1, 2, 1, 0, -1, 1, 2, 1, 0, -1, -1];
const BASS = [0, -1, 0, -1, 1, -1, 0, -1, 0, -1, 0, 1, 1, -1, 0, -1];
const STEP = 60 / 124 / 4;

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicG!: GainNode;
  private sfxG!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private timer = 0;
  private step = 0;
  private nextT = 0;
  private readonly last: Record<string, number> = {};
  musicOn = true;
  sfxOn = true;
  /** 0 = menus (sparse), 1 = in a run (full arrangement). */
  intensity = 0;

  /** Must be called from a user gesture; safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(c.destination);
      this.musicG = c.createGain();
      this.musicG.connect(this.master);
      this.sfxG = c.createGain();
      this.sfxG.connect(this.master);
      const len = Math.floor(c.sampleRate * 0.3);
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.apply();
      this.nextT = c.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 60);
    }
    if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.nextT = this.ctx.currentTime + 0.1;
      void this.ctx.resume();
    }
  }

  apply(): void {
    if (!this.ctx) return;
    this.musicG.gain.value = this.musicOn ? 0.55 : 0;
    this.sfxG.gain.value = this.sfxOn ? 1 : 0;
  }

  private tone(freq: number, dur: number, type: Wave, vol: number, slideTo = 0, at = 0, dest?: GainNode): void {
    const c = this.ctx;
    if (!c) return;
    const t = (at || c.currentTime) + 0.001;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(dest ?? this.sfxG);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, at = 0, dest?: GainNode): void {
    const c = this.ctx;
    if (!c || !this.noiseBuf) return;
    const t = (at || c.currentTime) + 0.001;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(g);
    g.connect(dest ?? this.sfxG);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  private schedule(): void {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.05;
    while (this.nextT < c.currentTime + 0.25) {
      const i = this.step % 16;
      const bar = Math.floor(this.step / 16) % 8;
      const ch = CHORDS[bar % 4];
      const t = this.nextT;
      const b = BASS[i];
      if (b >= 0) this.tone(ch.bass * (b ? 2 : 1), STEP * 1.7, 'triangle', 0.22, 0, t, this.musicG);
      const l = (bar < 4 ? LEAD_A : LEAD_B)[i];
      if (l >= 0 && (this.intensity > 0 || i % 4 === 0)) {
        this.tone(ch.lead[l] * (bar >= 4 && i >= 8 ? 2 : 1), STEP * 1.2, 'square', 0.045, 0, t, this.musicG);
      }
      if (this.intensity > 0) {
        if (i % 4 === 2) this.noise(0.03, 0.05, t, this.musicG);
        if (i % 8 === 4) this.noise(0.08, 0.07, t, this.musicG);
        if (i % 8 === 0) this.tone(140, 0.09, 'sine', 0.25, 45, t, this.musicG);
      }
      this.step++;
      this.nextT += STEP;
    }
  }

  /** Play a named effect; `gap` (ms) throttles effects that can fire many times per frame. */
  play(name: string): void {
    const c = this.ctx;
    if (!c || !this.sfxOn || c.state !== 'running') return;
    const now = performance.now();
    const gap = name === 'hit' ? 55 : name === 'kill' ? 45 : name === 'pick' ? 60 : name === 'shoot' ? 110 : name === 'beam' || name === 'boom' || name === 'bolt' || name === 'blast' ? 70 : name === 'graze' ? 90 : name === 'remix' || name === 'convert' ? 80 : 0;
    if (gap && now - (this.last[name] ?? 0) < gap) return;
    this.last[name] = now;
    switch (name) {
      case 'shoot': this.tone(880, 0.04, 'square', 0.025, 1300); break;
      case 'hit': this.tone(320, 0.04, 'square', 0.04, 200); break;
      case 'kill': this.tone(520, 0.07, 'square', 0.06, 940); break;
      case 'bigkill': this.tone(300, 0.2, 'square', 0.1, 900); this.noise(0.15, 0.1); break;
      case 'pick': this.tone(1200, 0.04, 'sine', 0.06, 1700); break;
      case 'boom': this.noise(0.14, 0.11); this.tone(120, 0.14, 'sine', 0.16, 50); break;
      case 'bolt': this.noise(0.06, 0.08); this.tone(1700, 0.08, 'sawtooth', 0.04, 300); break;
      case 'hurt': this.tone(200, 0.28, 'sawtooth', 0.16, 55); this.noise(0.2, 0.14); break;
      case 'level': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.11, 'square', 0.07, 0, c.currentTime + i * 0.065)); break;
      case 'choose': this.tone(660, 0.07, 'square', 0.07, 990); break;
      case 'buy': this.tone(988, 0.06, 'square', 0.07); this.tone(1319, 0.14, 'square', 0.07, 0, c.currentTime + 0.06); break;
      case 'deny': this.tone(180, 0.12, 'square', 0.07, 140); break;
      case 'ui': this.tone(740, 0.04, 'square', 0.05); break;
      case 'warn': [0, 0.16, 0.32].forEach(d => this.tone(880, 0.1, 'square', 0.08, 0, c.currentTime + d)); break;
      case 'boss': this.tone(110, 0.6, 'sawtooth', 0.14, 55); this.noise(0.3, 0.1); break;
      case 'wave': this.tone(392, 0.09, 'square', 0.07); this.tone(587, 0.16, 'square', 0.07, 0, c.currentTime + 0.09); break;
      case 'million':
      case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, 'square', 0.09, 0, c.currentTime + i * 0.1)); break;
      case 'over': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, 0, c.currentTime + i * 0.16)); break;
      case 'beam': this.noise(0.09, 0.07); this.tone(900, 0.1, 'sawtooth', 0.04, 220); break;
      case 'ult': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 'sawtooth', 0.07, 0, c.currentTime + i * 0.05)); this.noise(0.25, 0.1); break;
      case 'fuse': [330, 415, 494, 659, 831, 988].forEach((f, i) => this.tone(f, 0.18, 'square', 0.08, 0, c.currentTime + i * 0.07)); break;
      case 'graze': this.tone(1500, 0.05, 'triangle', 0.07, 2300); break;
      case 'keyword': this.tone(240, 0.1, 'square', 0.07, 180); this.tone(480, 0.12, 'square', 0.05, 0, c.currentTime + 0.05); break;
      case 'convert': this.tone(520, 0.09, 'triangle', 0.1, 1040); this.tone(1040, 0.1, 'triangle', 0.08, 0, c.currentTime + 0.08); break;
      case 'remix': this.tone(700, 0.05, 'square', 0.05, 350); this.tone(350, 0.05, 'square', 0.05, 700, c.currentTime + 0.05); break;
      case 'pin': this.tone(180, 0.1, 'square', 0.1, 90); this.noise(0.05, 0.08); break;
      case 'blast': this.noise(0.18, 0.12); this.tone(90, 0.2, 'sine', 0.2, 40); break;
      case 'revive': [262, 392, 523, 784].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.14, 0, c.currentTime + i * 0.07)); break;
    }
  }

  dispose(): void {
    window.clearInterval(this.timer);
  }
}
