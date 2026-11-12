/** Purely visual effects (particles, floating numbers, shake, banners). Never affects game logic. */
import type { Gfx } from '../engine/renderer';
import { H, LANE_TOP, W } from '../game/balance';

interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Float { text: string; x: number; y: number; life: number; color: string; scale: number }
interface Ring { x: number; y: number; r: number; life: number; max: number; color: string }
interface Beam { y: number; half: number; life: number }
interface Bolt { x: number; y: number; life: number; pts: number[] }

export class Fx {
  parts: Part[] = [];
  floats: Float[] = [];
  rings: Ring[] = [];
  bolts: Bolt[] = [];
  beams: Beam[] = [];
  shake = 0;
  flash = 0;
  flashColor = '#ffffff';
  banner: { text: string; sub: string; color: string; t: number; dur: number } | null = null;

  reset(): void {
    this.parts = [];
    this.floats = [];
    this.rings = [];
    this.bolts = [];
    this.beams = [];
    this.shake = 0;
    this.flash = 0;
    this.banner = null;
  }

  burst(x: number, y: number, color: string, n: number, speed = 50): void {
    for (let i = 0; i < n && this.parts.length < 260; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      const life = 0.25 + Math.random() * 0.3;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, life, max: life, color, size: Math.random() < 0.3 ? 2 : 1 });
    }
  }

  float(text: string, x: number, y: number, color: string, scale = 1): void {
    if (this.floats.length >= 28) this.floats.shift();
    this.floats.push({ text, x, y, life: scale > 1 ? 1.1 : 0.7, color, scale });
  }

  ring(x: number, y: number, r: number, color: string, life = 0.22): void {
    this.rings.push({ x, y, r, life, max: life, color });
  }

  /** A horizontal sweep across the whole row. */
  beam(y: number, half: number): void {
    if (this.beams.length < 12) this.beams.push({ y, half, life: 0.2 });
  }

  bolt(x: number, y: number): void {
    const pts: number[] = [];
    for (let yy = LANE_TOP; yy < y; yy += 12) pts.push(x + (Math.random() * 10 - 5), yy);
    pts.push(x, y);
    this.bolts.push({ x, y, life: 0.14, pts });
  }

  say(text: string, color: string, dur = 1.6, sub = ''): void {
    this.banner = { text, sub, color, t: 0, dur };
  }

  update(dt: number): void {
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt; p.life -= dt; }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const f of this.floats) { f.y -= 22 * dt; f.life -= dt; }
    this.floats = this.floats.filter(f => f.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter(r => r.life > 0);
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter(b => b.life > 0);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter(b => b.life > 0);
    this.shake = Math.max(0, this.shake - 26 * dt);
    this.flash = Math.max(0, this.flash - dt);
    if (this.banner && (this.banner.t += dt) >= this.banner.dur) this.banner = null;
  }

  offset(): [number, number] {
    if (this.shake <= 0.2) return [0, 0];
    return [Math.round((Math.random() * 2 - 1) * this.shake), Math.round((Math.random() * 2 - 1) * this.shake)];
  }

  drawWorld(gfx: Gfx): void {
    for (const b of this.beams) {
      const k = b.life / 0.2;
      gfx.alpha(0.45 * k);
      gfx.rect(0, b.y - b.half, W, b.half * 2, '#ff7a5c');
      gfx.alpha(k);
      gfx.rect(0, b.y - 1, W, 2, '#ffffff');
    }
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      const rad = r.r * (0.35 + 0.65 * k);
      gfx.alpha(0.9 * (1 - k));
      const g = gfx.g;
      g.fillStyle = r.color;
      // Pixel circle outline.
      const dots = Math.max(28, Math.round(rad * 0.9));
      for (let a = 0; a < dots; a++) {
        const t = (a / dots) * Math.PI * 2;
        g.fillRect(Math.round(r.x + Math.cos(t) * rad), Math.round(r.y + Math.sin(t) * rad), 2, 2);
      }
    }
    gfx.alpha(1);
    for (const b of this.bolts) {
      const col = b.life > 0.07 ? '#ffffff' : '#b48cff';
      for (let i = 0; i + 3 < b.pts.length; i += 2) {
        const x0 = b.pts[i], y0 = b.pts[i + 1], x1 = b.pts[i + 2], y1 = b.pts[i + 3];
        const steps = Math.max(1, Math.round(y1 - y0));
        for (let s = 0; s <= steps; s += 2) gfx.rect(x0 + ((x1 - x0) * s) / steps, y0 + s, 2, 2, col);
      }
      gfx.rect(b.x - 3, b.y - 3, 7, 7, col);
    }
    for (const p of this.parts) {
      gfx.alpha(Math.min(1, (p.life / p.max) * 1.6));
      gfx.rect(p.x, p.y, p.size, p.size, p.color);
    }
    gfx.alpha(1);
    for (const f of this.floats) {
      gfx.alpha(Math.min(1, f.life * 3));
      const w = gfx.textW(f.text, f.scale);
      gfx.text(f.text, Math.max(2, Math.min(W - w - 2, f.x - w / 2)), f.y, f.color, { scale: f.scale });
    }
    gfx.alpha(1);
  }

  drawScreen(gfx: Gfx): void {
    if (this.flash > 0) {
      gfx.alpha(Math.min(0.5, this.flash * 1.6));
      gfx.rect(0, 0, W, H, this.flashColor);
      gfx.alpha(1);
    }
    const b = this.banner;
    if (!b) return;
    const k = Math.min(1, b.t / 0.15, (b.dur - b.t) / 0.25);
    const y = Math.round(H * 0.28);
    gfx.alpha(0.72 * k);
    gfx.rect(0, y - 6, W, b.sub ? 50 : 36, '#000000');
    gfx.alpha(k);
    gfx.text(b.text, W / 2, y, b.color, { scale: 2, align: 'c' });
    if (b.sub) gfx.text(b.sub, W / 2, y + 28, '#f4f4f4', { align: 'c' });
    gfx.alpha(1);
  }
}
