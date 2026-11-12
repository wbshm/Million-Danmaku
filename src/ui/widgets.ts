import type { Gfx } from '../engine/renderer';

export const C = {
  bg: '#12121c', bar: '#0b0b12', panel: '#1e1e2e', panel2: '#2a2a40', line: '#3d3d5c',
  white: '#f4f4f4', dim: '#9a9ab4', pink: '#fb7299', blue: '#00aeec', yellow: '#ffd24a',
  green: '#5fe08a', red: '#ff5a6e', purple: '#b48cff', black: '#000000', ink: '#14141f',
} as const;

interface Zone { x: number; y: number; w: number; h: number; fn: () => void; key?: string }

export interface ButtonOpts {
  key?: string;
  color?: string;
  disabled?: boolean;
  /** Text colour; defaults to dark ink on the coloured face. */
  ink?: string;
}

/**
 * Immediate-mode buttons. Each frame the screens re-declare their buttons while drawing; presses
 * are hit-tested against the zones from the most recent frame, synchronously in the DOM event.
 */
export class Ui {
  private zones: Zone[] = [];
  private lockUntil = 0;
  /** When set, presses that miss every button are still swallowed (an overlay is open). */
  modal = false;
  /** Mouse position for hover highlights; null on touch devices. */
  hover: { x: number; y: number } | null = null;
  /** The mouse is over something clickable this frame (drives the cursor). */
  hot = false;

  constructor(readonly gfx: Gfx) {}

  begin(): void {
    this.zones = [];
    this.modal = false;
    this.hot = false;
  }

  private over(x: number, y: number, w: number, h: number): boolean {
    const p = this.hover;
    return !!p && !this.locked && p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
  }

  /** Ignore presses briefly, so a thumb that was steering can't pick a card that just appeared. */
  lock(ms = 380): void {
    this.lockUntil = performance.now() + ms;
  }

  get locked(): boolean {
    return performance.now() < this.lockUntil;
  }

  /** Clickable area. `ring` outlines it while the mouse is over it (for cards). */
  zone(x: number, y: number, w: number, h: number, fn: () => void, key?: string, ring = false): void {
    this.zones.push({ x, y, w, h, fn, key });
    if (!this.over(x, y, w, h)) return;
    this.hot = true;
    if (ring) this.gfx.frame(x - 1, y - 1, w + 2, h + 2, C.white);
  }

  button(x: number, y: number, w: number, h: number, label: string, fn: () => void, o: ButtonOpts = {}): void {
    const g = this.gfx;
    const face = o.disabled ? C.panel2 : o.color ?? C.pink;
    g.panel(x, y, w, h, face, o.disabled ? C.line : C.ink);
    g.alpha(0.28);
    g.rect(x + 1, y + h - 3, w - 2, 2, C.black);
    g.alpha(1);
    if (!o.disabled && this.over(x, y, w, h)) {
      g.alpha(0.22);
      g.rect(x + 1, y + 1, w - 2, h - 2, C.white);
      g.alpha(1);
    }
    g.text(label, x + w / 2, y + (h - 12) / 2 - 1, o.disabled ? C.dim : o.ink ?? C.ink, { align: 'c', shadow: null });
    if (!o.disabled) this.zone(x, y, w, h, fn, o.key);
  }

  /** 16×16 coloured tile with one glyph, used as the icon for weapons and passives. */
  tile(x: number, y: number, glyph: string, color: string): void {
    const g = this.gfx;
    g.panel(x, y, 16, 16, color, C.ink);
    g.text(glyph, x + 2, y + 2, C.ink, { shadow: null });
  }

  press(x: number, y: number): boolean {
    if (this.locked) return this.modal || this.zones.length > 0;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) { z.fn(); return true; }
    }
    return this.modal;
  }

  key(code: string): boolean {
    if (this.locked) return false;
    const z = this.zones.find(q => q.key === code);
    if (!z) return false;
    z.fn();
    return true;
  }
}
