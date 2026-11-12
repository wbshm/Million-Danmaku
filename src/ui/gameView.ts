/** Draws the play field and HUD for a run. */
import type { Input } from '../engine/input';
import { fmtInt, fmtMult, type Gfx } from '../engine/renderer';
import { charSprites, goldSprites, icons } from '../engine/sprites';
import { H, LANES, LANE_H, LANE_TOP, W, WAVES, laneY, waveDuration } from '../game/balance';
import { CHARS } from '../game/chars';
import { PASSIVES } from '../game/passives';
import { WALL_GAP, currentMultiplier, dronePos, ultReady, type Enemy, type Run } from '../game/run';
import { WEAPON_BY_ID, weaponStats } from '../game/weapons';
import type { Fx } from './fx';
import { C, type Ui } from './widgets';

let bg: HTMLCanvasElement | null = null;

function background(): HTMLCanvasElement {
  if (bg) return bg;
  bg = document.createElement('canvas');
  bg.width = W;
  bg.height = H;
  const g = bg.getContext('2d')!;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  // Faint alternating lanes so the rows danmaku travel on can be read at a glance.
  g.fillStyle = '#151523';
  for (let i = 0; i < LANES; i += 2) g.fillRect(0, laneY(i) - 1, W, LANE_H);
  g.fillStyle = '#1d1d30';
  let s = 12345;
  for (let i = 0; i < 70; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    const x = s % W;
    s = (s * 1103515245 + 12345) >>> 0;
    g.fillRect(x, LANE_TOP + (s % (H - LANE_TOP)), 1, 1);
  }
  return bg;
}

function drawEnemy(gfx: Gfx, e: Enemy, time: number, frozen: boolean): void {
  if ((e.kind === 'fixed' && e.t < 0.9) || (e.kind === 'boss' && e.t < 1.2)) gfx.alpha(Math.floor(time * 12) % 2 ? 0.35 : 0.7);
  else if (e.kind === 'fixed' && e.life < 1) gfx.alpha(0.5);
  const col = e.flash > 0 ? (e.color === '#ffffff' ? '#fb7299' : '#ffffff') : frozen ? '#9fd8ff' : e.color;
  gfx.text(e.text, e.x, e.y, col, { scale: e.scale });
  gfx.alpha(1);
  // 关键词 just named this one: strike it through.
  if (e.mark > 0) gfx.rect(e.x - 1, e.y + e.h / 2 - 1, e.w + 2, e.scale + 1, '#ff8fb8');
  if (e.slow > 0 && !frozen) gfx.rect(e.x, e.y + e.h, e.w, 1, '#aab4ff');
  if (e.kind === 'big' && e.hp < e.maxHp) {
    gfx.rect(e.x, e.y + e.h + 1, e.w, 2, '#3a1a1a');
    gfx.rect(e.x, e.y + e.h + 1, (e.w * Math.max(0, e.hp)) / e.maxHp, 2, C.red);
  }
}

function drawWallWarning(gfx: Gfx, run: Run, time: number): void {
  if (run.wallTimer <= 0) return;
  const blink = Math.floor(time * 10) % 2 === 0;
  gfx.alpha(0.14);
  gfx.rect(0, laneY(run.wallGap) - 1, W, WALL_GAP * LANE_H, C.green);
  gfx.alpha(1);
  for (let i = 0; i < LANES; i++) {
    const safe = i >= run.wallGap && i < run.wallGap + WALL_GAP;
    if (safe) gfx.rect(W - 4, laneY(i) - 1, 4, LANE_H, C.green);
    else if (blink) gfx.rect(W - 5, laneY(i) + 1, 5, LANE_H - 4, C.red);
  }
  gfx.text('安全区', W - 8, laneY(run.wallGap + 2), C.green, { align: 'r' });
}

/** Experience: a green gem. Deliberately a different hue and shape from enemy bullets. */
function drawXp(gfx: Gfx, x: number, y: number, time: number): void {
  const bob = Math.round(Math.sin(time * 5 + x) * 1);
  y += bob;
  gfx.rect(x - 1, y - 3, 2, 6, '#1f7a44');
  gfx.rect(x - 3, y - 1, 6, 2, '#1f7a44');
  gfx.rect(x - 2, y - 2, 4, 4, C.green);
  gfx.rect(x - 1, y - 2, 1, 1, C.white);
}

/** Enemy bullet: a red ball with a dark rim and a pulsing yellow core — reads as "danger". */
function drawBullet(gfx: Gfx, x: number, y: number, time: number): void {
  const big = Math.floor(time * 8) % 2 === 0;
  gfx.rect(x - 2, y - 3, 5, 7, C.ink);
  gfx.rect(x - 3, y - 2, 7, 5, C.ink);
  gfx.rect(x - 1, y - 2, 3, 5, C.red);
  gfx.rect(x - 2, y - 1, 5, 3, C.red);
  gfx.rect(x - (big ? 1 : 0), y - (big ? 1 : 0), big ? 3 : 1, big ? 3 : 1, C.yellow);
}

/** 粉丝弹幕 (green, underlined, with an arrow in the direction it charges) and 置顶牌. */
function drawFriends(gfx: Gfx, run: Run, time: number): void {
  for (const pin of run.pins) {
    const fading = pin.life < 1 && Math.floor(time * 10) % 2 === 0;
    gfx.panel(pin.x, pin.y, pin.w, pin.h, fading ? '#8a7a2a' : '#ffe14a', C.ink);
    gfx.text('置顶', pin.x, pin.y, C.ink, { shadow: null });
    gfx.rect(pin.x, pin.y + pin.h, (pin.w * Math.max(0, pin.life)) / pin.max, 1, C.white);
  }
  for (const a of run.allies) {
    gfx.text(a.text, a.x, a.y, '#7dffb0', { scale: a.scale });
    gfx.rect(a.x, a.y + a.h, a.w, 1, '#7dffb0');
    const hx = a.vx > 0 ? a.x + a.w + 2 : a.x - 5;
    const d = a.vx > 0 ? 1 : -1;
    gfx.rect(hx, a.y + a.h / 2 - 3, 2, 6, '#7dffb0');
    gfx.rect(hx + d * 2, a.y + a.h / 2 - 1, 2, 2, C.white);
  }
}

function drawWeapons(gfx: Gfx, run: Run, time: number): void {
  const p = run.player;
  for (const w of run.weapons) {
    const st = weaponStats(w.id, w.lvl);
    const col = WEAPON_BY_ID[w.id].color;
    if (w.id === 'hold') {
      // Charge pips over the head, and a ring showing how far the blast will reach right now.
      const stage = Math.floor(run.hold + 1e-6);
      for (let i = 0; i < st.count; i++) gfx.rect(p.x - 6 + i * 4, p.y - 12, 3, 2, i < stage ? col : run.hold > i ? C.dim : C.line);
      if (stage >= 1) {
        const r = st.radius + 9 * stage;
        const n = Math.round(r * 0.7);
        gfx.alpha(0.55);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 - time * 1.5;
          gfx.rect(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 1, 1, col);
        }
        gfx.alpha(1);
      }
      continue;
    }
    if (w.id === 'star' || w.id === 'chain') {
      for (let i = 0; i < st.count; i++) {
        const a = run.time * 3.2 + (i * Math.PI * 2) / st.count;
        gfx.sprite(icons.star, p.x + Math.cos(a) * st.radius - 2, p.y + Math.sin(a) * st.radius - 2);
      }
    } else if (w.id === 'block' || w.id === 'jail') {
      // Dotted ring marking the aura's reach.
      gfx.alpha(0.6);
      const n = Math.round(st.radius * 0.8);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + time * 0.8;
        gfx.rect(p.x + Math.cos(a) * st.radius, p.y + Math.sin(a) * st.radius, 1, 1, col);
      }
      gfx.alpha(1);
    } else if (w.id === 'drone' || w.id === 'squad') {
      for (let i = 0; i < st.count; i++) {
        const [x, y] = dronePos(run, i, st.count);
        gfx.rect(x - 3, y - 3, 7, 5, C.ink);
        gfx.rect(x - 2, y - 2, 5, 3, col);
        gfx.rect(x - 1, y - 1, 1, 1, C.white);
        gfx.rect(x, y + 2, 1, 2, C.dim);
      }
    }
  }
  for (const s of run.shots) {
    if (s.kind === 'coin') {
      const u = Math.min(1, s.t / s.dur);
      const x = s.sx + (s.tx - s.sx) * u, y = s.sy + (s.ty - s.sy) * u - Math.sin(u * Math.PI) * 26;
      gfx.alpha(0.35);
      gfx.rect(s.tx - 3, s.ty - 1, 6, 2, C.yellow);
      gfx.alpha(1);
      gfx.sprite(icons.coin, x - 3, y - 3);
    } else if (s.kind === 'like') {
      gfx.rect(s.x - 2, s.y - 2, 4, 4, C.pink);
      gfx.rect(s.x - 1, s.y - 1, 2, 2, C.white);
    } else if (s.kind === 'storm') {
      // A white-hot dart with a short tail, so it can't be mistaken for an enemy bullet.
      gfx.alpha(0.6);
      gfx.rect(s.x - s.vx * 0.02 - 1, s.y - s.vy * 0.02 - 1, 2, 2, '#ff5fa2');
      gfx.alpha(1);
      gfx.rect(s.x - 2, s.y - 1, 4, 2, '#ff5fa2');
      gfx.rect(s.x - 1, s.y - 2, 2, 4, '#ff5fa2');
      gfx.rect(s.x - 1, s.y - 1, 2, 2, C.white);
    } else if (s.kind === 'triple') {
      gfx.rect(s.x - 1, s.y - 2, 3, 4, C.green);
      gfx.rect(s.x, s.y - 1, 1, 2, C.white);
    } else if (s.kind === 'drone') {
      gfx.rect(s.x - 1, s.y - 1, 3, 3, '#ff9ec0');
    } else if (s.kind === 'glyph') {
      const ch = s.ch ?? '草';
      gfx.text(ch, s.x - ((ch.codePointAt(0) ?? 0) > 0xff ? 6 : 3), s.y - 6, '#ffb347');
    } else if (s.kind === 'dart') {
      gfx.alpha(0.6);
      gfx.rect(s.x - s.vx * 0.02 - 1, s.y - s.vy * 0.02 - 1, 2, 2, '#9fe8ff');
      gfx.alpha(1);
      gfx.rect(s.x - 2, s.y - 1, 4, 2, '#9fe8ff');
      gfx.rect(s.x - 1, s.y - 1, 2, 2, C.white);
    } else if (s.kind === 'rewind') {
      // Two chevrons, like a fast-forward icon; flips when it turns back.
      const d = s.vx >= 0 ? 1 : -1;
      for (const o of [-2, 2]) {
        gfx.rect(s.x + o * d - 1, s.y - 3, 2, 7, '#3fd6c6');
        gfx.rect(s.x + o * d + d, s.y - 1, 2, 3, C.white);
      }
    } else {
      gfx.rect(s.x - 2, s.y - 1, 5, 3, C.blue);
      gfx.rect(s.x - 1, s.y - 2, 3, 5, C.blue);
      gfx.rect(s.x, s.y, 1, 1, C.white);
    }
  }
}

function drawPlayer(gfx: Gfx, run: Run, time: number, charIdx: number, gold: boolean): void {
  const p = run.player;
  if (p.iframes > 0 && run.phase !== 'over' && Math.floor(time * 14) % 2 === 0) return;
  const set = gold ? goldSprites : charSprites[charIdx] ?? charSprites[0];
  const img = p.moving && Math.floor(time * 8) % 2 ? set.b : set.a;
  gfx.alpha(0.3);
  gfx.rect(p.x - 4, p.y + 6, 8, 2, C.black);
  gfx.alpha(1);
  gfx.sprite(img, p.x - 5, p.y - 6, p.face < 0);
}

function drawHud(gfx: Gfx, ui: Ui, run: Run, o: GameViewOpts): void {
  gfx.rect(0, 0, W, LANE_TOP - 2, C.bar);
  gfx.rect(0, LANE_TOP - 2, W, 1, C.line);
  gfx.rect(0, 0, W, 2, '#23233a');
  gfx.rect(0, 0, (W * run.xp) / run.xpNext, 2, C.green);

  gfx.text('粉丝', 4, 3, C.pink);
  gfx.text(fmtInt(run.fans), 31, 3, run.millionAt !== null ? C.yellow : C.white);
  gfx.text(fmtMult(currentMultiplier(run) * (run.buff.fans > 0 ? 2 : 1)), W - 20, 3, C.yellow, { align: 'r' });
  gfx.rect(W - 13, 5, 3, 9, C.dim);
  gfx.rect(W - 8, 5, 3, 9, C.dim);
  ui.zone(W - 20, 0, 20, 18, o.onPause);

  const max = run.stats.maxHp;
  if (max <= 8) {
    for (let i = 0; i < max; i++) gfx.sprite(i < run.player.hp ? icons.heart : icons.heartEmpty, 4 + i * 8, 18);
  } else {
    gfx.sprite(icons.heart, 4, 18);
    gfx.text(`${run.player.hp}/${max}`, 13, 15, C.white);
  }
  gfx.sprite(icons.coin, 76, 18);
  gfx.text(String(run.coins), 84, 15, C.yellow);
  gfx.text(`Lv${run.level}`, 116, 15, C.green);
  gfx.text(`第${run.wave}/${WAVES}波`, W - 4, 15, C.white, { align: 'r' });

  // Status lines sit below the boss title when one is on screen.
  const top = run.enemies.some(e => e.kind === 'boss') ? LANE_TOP + 50 : LANE_TOP + 2;
  if (run.combo >= 5) {
    gfx.text(`${run.combo} 连击`, W - 4, top, C.yellow, { align: 'r' });
    gfx.rect(W - 44, top + 13, (40 * Math.max(0, run.comboTimer)) / 3, 1, C.yellow);
  }
  const buffs: [number, string, string][] = [[run.buff.haste, '攻速×2', C.pink], [run.buff.fans, '涨粉×2', C.yellow], [run.buff.freeze, '全场定身', '#9fd8ff']];
  let by = top;
  for (const [t, label, col] of buffs) {
    if (t <= 0) continue;
    gfx.text(`${label} ${Math.ceil(t)}秒`, 4, by, col);
    by += 13;
  }
  if (run.keyword.t > 0) gfx.text(`关键词「${run.keyword.s}」`, 4, by, '#ff8fb8');

  // The wave timer is drawn as a video progress bar.
  const u = Math.min(1, run.waveT / waveDuration(run.wave));
  gfx.rect(0, H - 3, W, 3, C.panel2);
  gfx.rect(0, H - 3, W * u, 3, C.pink);
  gfx.rect(Math.min(W - 3, W * u - 1), H - 5, 3, 5, C.white);

  // Current build: weapons then passives, with level pips (fusions get gold pips).
  gfx.alpha(0.8);
  let x = 3;
  const y = H - 24;
  const tile = (glyph: string, color: string, lvl: number, pip: string): void => {
    ui.tile(x, y, glyph, color);
    for (let i = 0; i < lvl; i++) gfx.rect(x + 1 + i * 3, y + 17, 2, 1, pip);
    x += 18;
  };
  for (const w of run.weapons) {
    const d = WEAPON_BY_ID[w.id];
    tile(d.glyph, d.color, w.lvl, d.fusion ? C.yellow : d.color);
    if (d.fusion) gfx.frame(x - 19, y - 1, 18, 18, C.yellow);
  }
  x += 3;
  for (const d of PASSIVES) {
    const lvl = run.passives[d.id];
    if (lvl) tile(d.glyph, d.color, lvl, d.color);
  }
  gfx.alpha(1);

  // Exclusive skill button: fills up with kills, flashes when ready.
  const ready = ultReady(run);
  const bx = W - 33, byy = H - 40, bs = 29;
  const k = Math.min(1, run.ult.energy / run.ult.need);
  const lit = ready && Math.floor(o.time * 6) % 2 === 0;
  gfx.panel(bx, byy, bs, bs, C.panel, ready ? (lit ? C.white : C.yellow) : C.line);
  const fill = Math.round((bs - 2) * k);
  gfx.alpha(ready ? 1 : 0.55);
  gfx.rect(bx + 1, byy + bs - 1 - fill, bs - 2, fill, ready ? C.yellow : C.pink);
  gfx.alpha(1);
  gfx.text(run.char.ultGlyph, bx + bs / 2, byy + 8, ready ? C.ink : C.white, { align: 'c', shadow: ready ? null : '#000000' });
  if (ready) gfx.text(o.desktop ? '空格' : '大招', bx + bs / 2, byy - 13, C.yellow, { align: 'c' });
  ui.zone(bx - 3, byy - 3, bs + 6, bs + 6, o.onUlt, 'Space');
}

export interface GameViewOpts {
  time: number;
  gold: boolean;
  hint: boolean;
  /** Mouse / keyboard player: word the hints for them. */
  desktop: boolean;
  onPause: () => void;
  onUlt: () => void;
}

export function drawGame(gfx: Gfx, ui: Ui, run: Run, fx: Fx, input: Input, o: GameViewOpts): void {
  const g = gfx.g;
  g.drawImage(background(), 0, 0);
  const [sx, sy] = fx.offset();
  g.save();
  g.translate(sx, sy);

  drawWallWarning(gfx, run, o.time);
  for (const orb of run.orbs) {
    if (orb.kind === 'xp') drawXp(gfx, orb.x, orb.y, o.time);
    else if (orb.kind === 'coin') gfx.sprite(icons.coin, orb.x - 3, orb.y - 3);
    else gfx.sprite(icons.heartPickup, orb.x - 3, orb.y - 3);
  }
  const frozen = run.buff.freeze > 0;
  for (const e of run.enemies) if (!e.dead) drawEnemy(gfx, e, o.time, frozen);
  drawFriends(gfx, run, o.time);
  drawWeapons(gfx, run, o.time);
  drawPlayer(gfx, run, o.time, CHARS.indexOf(run.char), o.gold);
  for (const b of run.bullets) drawBullet(gfx, b.x, b.y, o.time);
  fx.drawWorld(gfx);
  g.restore();

  const boss = run.enemies.find(e => e.kind === 'boss' && !e.dead);
  drawHud(gfx, ui, run, o);
  if (boss) {
    gfx.rect(20, LANE_TOP + 1, W - 40, 4, C.ink);
    gfx.rect(21, LANE_TOP + 2, ((W - 42) * Math.max(0, boss.hp)) / boss.maxHp, 2, C.pink);
  }

  if (o.hint && run.wave === 1 && run.waveT < 8 && run.phase === 'play') {
    gfx.alpha(Math.min(1, (8 - run.waveT) / 1.5));
    gfx.text(o.desktop ? 'WASD 或方向键移动' : '拖动屏幕移动', W / 2, H * 0.76, C.white, { align: 'c' });
    gfx.text('攻击自动进行 · 别被弹幕撞到', W / 2, H * 0.76 + 15, C.dim, { align: 'c' });
    gfx.text('贴着弹幕掠过＝擦弹，给大招充能', W / 2, H * 0.76 + 30, '#9fe8ff', { align: 'c' });
    gfx.text(o.desktop ? '右下角充满后按空格放大招' : '右下角充满后点它放大招', W / 2, H * 0.76 + 45, C.dim, { align: 'c' });
    gfx.alpha(1);
  }

  const s = input.stick;
  if (s && run.phase === 'play') {
    gfx.alpha(0.35);
    gfx.frame(s.ox - 12, s.oy - 12, 24, 24, C.white);
    gfx.rect(s.x - 4, s.y - 4, 8, 8, C.white);
    gfx.alpha(1);
  }
  fx.drawScreen(gfx);
}
