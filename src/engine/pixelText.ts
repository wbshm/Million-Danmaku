/**
 * Crisp pixel text. fillText on a low-resolution canvas is anti-aliased and looks blurry, so each
 * glyph is rasterised once, its alpha thresholded to on/off, and cached as a tiny bitmap per colour.
 */
const FONT = "12px FusionPixel, 'PingFang SC', 'Microsoft YaHei', monospace";
const CELL_W = 16;
const CELL_H = 14;
const BASELINE = 11;

interface Glyph { c: HTMLCanvasElement; w: number }

const glyphs = new Map<string, Glyph>();
const advances = new Map<string, number>();
let scratch: CanvasRenderingContext2D | null = null;

function ctx(): CanvasRenderingContext2D {
  if (!scratch) {
    const c = document.createElement('canvas');
    c.width = CELL_W;
    c.height = CELL_H;
    scratch = c.getContext('2d', { willReadFrequently: true })!;
  }
  scratch.font = FONT;
  scratch.textBaseline = 'alphabetic';
  return scratch;
}

function advance(ch: string): number {
  let w = advances.get(ch);
  if (w === undefined) {
    w = Math.max(1, Math.min(CELL_W, Math.round(ctx().measureText(ch).width)));
    advances.set(ch, w);
  }
  return w;
}

function glyph(ch: string, color: string): Glyph {
  const key = color + ch;
  let g = glyphs.get(key);
  if (g) return g;
  const w = advance(ch);
  const s = ctx();
  s.clearRect(0, 0, CELL_W, CELL_H);
  s.fillStyle = '#ffffff';
  s.fillText(ch, 0, BASELINE);
  const img = s.getImageData(0, 0, CELL_W, CELL_H);
  const r = parseInt(color.slice(1, 3), 16), gg = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] >= 100;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = on ? 255 : 0;
  }
  const c = document.createElement('canvas');
  c.width = CELL_W;
  c.height = CELL_H;
  c.getContext('2d')!.putImageData(img, 0, 0);
  g = { c, w };
  glyphs.set(key, g);
  return g;
}

/** Forget cached glyphs (call once the web font has loaded, in case anything was drawn before). */
export function resetGlyphs(): void {
  glyphs.clear();
  advances.clear();
}

export function measureText(s: string, scale = 1): number {
  let w = 0;
  for (const ch of s) w += advance(ch);
  return w * scale;
}

/** Draw `s` with its top-left at (x, y). Colour must be #rrggbb. */
export function drawText(g: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1): void {
  let cx = Math.round(x);
  const cy = Math.round(y) - scale;
  for (const ch of s) {
    const gl = glyph(ch, color);
    if (ch !== ' ') {
      if (scale === 1) g.drawImage(gl.c, cx, cy);
      else g.drawImage(gl.c, cx, cy, CELL_W * scale, CELL_H * scale);
    }
    cx += gl.w * scale;
  }
}

/** Greedy wrap by pixel width; '\n' forces a break. */
export function wrapText(s: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  let w = 0;
  for (const ch of s) {
    if (ch === '\n') { lines.push(line); line = ''; w = 0; continue; }
    const a = advance(ch);
    if (w + a > maxW && line) { lines.push(line); line = ''; w = 0; }
    line += ch;
    w += a;
  }
  if (line) lines.push(line);
  return lines;
}
