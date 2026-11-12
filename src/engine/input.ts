/**
 * Pointer + keyboard input.
 *  - A press is first offered to the UI (onPress). If no button takes it, it starts a floating
 *    virtual stick: drag in any direction to move.
 *  - WASD / arrow keys also move. Other keys are forwarded to onKey.
 *  - A mouse that is merely hovering is tracked in `hover` so buttons can highlight.
 * UI callbacks run synchronously inside the DOM event, so they count as a user gesture.
 */
const STICK_R = 18;
const DEAD = 2;

const KEY_DIRS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export class Input {
  stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  /** Mouse position while hovering (play-column coordinates); null for touch or when outside. */
  hover: { x: number; y: number } | null = null;
  /** True once a mouse or keyboard has been used; false again after a touch. */
  desktop = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  private readonly keys = new Set<string>();
  onPress: (x: number, y: number) => boolean = () => false;
  onKey: (code: string) => void = () => {};
  onFirstGesture: () => void = () => {};

  constructor(canvas: HTMLCanvasElement, toLogical: (cx: number, cy: number) => [number, number]) {
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.onFirstGesture();
      this.desktop = e.pointerType === 'mouse';
      if (!this.desktop) this.hover = null;
      const [x, y] = toLogical(e.clientX, e.clientY);
      if (this.onPress(x, y)) return;
      if (this.stick) return;
      this.stick = { id: e.pointerId, ox: x, oy: y, x, y };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    });
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') {
        const [hx, hy] = toLogical(e.clientX, e.clientY);
        this.hover = { x: hx, y: hy };
      }
      const s = this.stick;
      if (!s || e.pointerId !== s.id) return;
      [s.x, s.y] = toLogical(e.clientX, e.clientY);
      // Floating stick: once the thumb is past the rim, drag the origin along behind it.
      const dx = s.x - s.ox, dy = s.y - s.oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) {
        s.ox = s.x - (dx / len) * STICK_R;
        s.oy = s.y - (dy / len) * STICK_R;
      }
    });
    const end = (e: PointerEvent): void => {
      if (this.stick && e.pointerId === this.stick.id) this.stick = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { this.hover = null; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (KEY_DIRS[e.code] || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.onFirstGesture();
      this.desktop = true;
      this.keys.add(e.code);
      this.onKey(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
  }

  clear(): void {
    this.keys.clear();
    this.stick = null;
  }

  /** Movement vector with magnitude 0..1. */
  move(): [number, number] {
    let x = 0, y = 0;
    for (const k of this.keys) {
      const d = KEY_DIRS[k];
      if (d) { x += d[0]; y += d[1]; }
    }
    if (x || y) {
      const len = Math.hypot(x, y);
      return [x / len, y / len];
    }
    const s = this.stick;
    if (!s) return [0, 0];
    const dx = s.x - s.ox, dy = s.y - s.oy;
    const len = Math.hypot(dx, dy);
    if (len < DEAD) return [0, 0];
    const m = Math.min(1, len / (STICK_R * 0.7));
    return [(dx / len) * m, (dy / len) * m];
  }
}
