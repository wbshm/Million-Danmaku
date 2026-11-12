import { H, W } from '../game/balance';
import { drawText, measureText } from './pixelText';

export interface TextOpts {
  scale?: number;
  align?: 'l' | 'c' | 'r';
  /** Drop-shadow colour, or null for none. */
  shadow?: string | null;
}

const SIDE_MIN = 110;
const SIDE_MAX = 280;
/** Viewport aspect ratio (w/h) from which the wide, PC-style layout is used. */
const WIDE_ASPECT = 1.05;

/**
 * Everything is drawn to a low-resolution buffer, then blitted with nearest-neighbour scaling to
 * a backing canvas that is an integer multiple of it; CSS fits that canvas to the available space.
 *
 * The play column is always 216×432 with its origin at (0,0), so the game is identical on every
 * device. On wide (PC) viewports the buffer grows by a panel of `side` pixels on each side:
 * x in [-side, 0) is the left panel and [W, W+side) the right one.
 */
export class Gfx {
  readonly buf: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  private readonly out: CanvasRenderingContext2D;
  private k = 0;
  /** Width of each side panel in logical pixels; 0 in the portrait layout. */
  side = 0;
  /** Extra insets reported by the host container (CSS px). */
  inset = { top: 0, right: 0, bottom: 0, left: 0 };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly stage: HTMLElement) {
    this.buf = document.createElement('canvas');
    this.buf.width = W;
    this.buf.height = H;
    this.g = this.buf.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
    this.out = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    const s = this.stage.style;
    const i = this.inset;
    s.paddingTop = i.top ? `${i.top}px` : '';
    s.paddingRight = i.right ? `${i.right}px` : '';
    s.paddingBottom = i.bottom ? `${i.bottom}px` : '';
    s.paddingLeft = i.left ? `${i.left}px` : '';
    const cs = getComputedStyle(this.stage);
    const aw = this.stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ah = this.stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const aspect = aw / Math.max(1, ah);
    const side = aspect >= WIDE_ASPECT ? Math.max(SIDE_MIN, Math.min(SIDE_MAX, Math.floor((aspect * H - W) / 2))) : 0;
    const vw = W + side * 2;
    const scale = Math.max(0.25, Math.min(aw / vw, ah / H));
    this.canvas.style.width = `${Math.floor(vw * scale)}px`;
    this.canvas.style.height = `${Math.floor(H * scale)}px`;
    const k = Math.max(1, Math.min(6, Math.ceil(scale * (window.devicePixelRatio || 1))));
    if (side !== this.side) {
      this.side = side;
      this.buf.width = vw; // resizing a canvas resets its context state
      this.g.imageSmoothingEnabled = false;
    }
    if (this.canvas.width !== vw * k || this.canvas.height !== H * k) {
      this.k = k;
      this.canvas.width = vw * k;
      this.canvas.height = H * k;
    }
    this.k = k;
    this.out.imageSmoothingEnabled = false;
  }

  /** Start a frame: clear everything and put the origin at the play column's top-left. */
  begin(clear: string): void {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = clear;
    g.fillRect(0, 0, W + this.side * 2, H);
    g.translate(this.side, 0);
  }

  /** Client (CSS px) → play-column coordinates (negative x / x > W are the side panels). */
  toLogical(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const vw = W + this.side * 2;
    return [((clientX - r.left) / Math.max(1, r.width)) * vw - this.side, ((clientY - r.top) / Math.max(1, r.height)) * H];
  }

  present(): void {
    const vw = W + this.side * 2;
    this.out.drawImage(this.buf, 0, 0, vw * this.k, H * this.k);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.g.fillStyle = color;
    this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  frame(x: number, y: number, w: number, h: number, color: string): void {
    this.rect(x, y, w, 1, color);
    this.rect(x, y + h - 1, w, 1, color);
    this.rect(x, y, 1, h, color);
    this.rect(x + w - 1, y, 1, h, color);
  }

  /** Filled box with a 1px border and clipped corners. */
  panel(x: number, y: number, w: number, h: number, fill: string, border: string): void {
    this.rect(x + 1, y, w - 2, h, border);
    this.rect(x, y + 1, w, h - 2, border);
    this.rect(x + 1, y + 1, w - 2, h - 2, fill);
  }

  textW(s: string, scale = 1): number {
    return measureText(s, scale);
  }

  text(s: string, x: number, y: number, color: string, o: TextOpts = {}): void {
    const scale = o.scale ?? 1;
    if (o.align === 'c') x -= measureText(s, scale) / 2;
    else if (o.align === 'r') x -= measureText(s, scale);
    if (o.shadow !== null) drawText(this.g, s, x + scale, y + scale, o.shadow ?? '#000000', scale);
    drawText(this.g, s, x, y, color, scale);
  }

  sprite(img: HTMLCanvasElement, x: number, y: number, flip = false): void {
    const g = this.g;
    if (!flip) { g.drawImage(img, Math.round(x), Math.round(y)); return; }
    g.save();
    g.translate(Math.round(x) + img.width, Math.round(y));
    g.scale(-1, 1);
    g.drawImage(img, 0, 0);
    g.restore();
  }

  alpha(a: number): void {
    this.g.globalAlpha = a;
  }
}

export function fmtInt(n: number): string {
  n = Math.floor(n);
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function fmtShort(n: number): string {
  n = Math.floor(n);
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}万`;
  return String(n);
}

export function fmtMult(m: number): string {
  return `×${m < 100 ? m.toFixed(1) : Math.round(m)}`;
}
