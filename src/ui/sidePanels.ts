/**
 * PC layout only: the two panels beside the play column. Left = the current build (or how to
 * play), right = keyboard controls plus run stats (or the weekly top list).
 */
import { wrapText } from '../engine/pixelText';
import { fmtInt, fmtMult, fmtShort, type Gfx } from '../engine/renderer';
import { H, W, WAVES } from '../game/balance';
import { PASSIVES } from '../game/passives';
import { PERK_ROWS, isTriple } from '../game/perks';
import { RELICS } from '../game/relics';
import { scoreCtx, timeLeft, type Run } from '../game/run';
import { FUSE_LEVEL } from '../game/weapons';
import { drawRecipes } from './overlays';
import { comboMult, multiplier } from '../game/scoring';
import { WEAPON_BY_ID } from '../game/weapons';
import type { RankItem } from '../platform/toy';
import { C, type Ui } from './widgets';

export interface SideState {
  /** The run being played, or null on menu screens. */
  run: Run | null;
  /** Cached weekly top list, if any. */
  rank: RankItem[] | null;
}

const HOW_TO = [
  '弹幕就是敌人，撞到会掉血。',
  '攻击是自动的，你只管走位。',
  '击败弹幕涨粉，捡经验球升级。',
  '贴着弹幕掠过叫擦弹，和杀敌一样给专属技能充能，充满按空格。',
  '机制武器各有玩法：点名关键字、洗白、置顶挡路、站住蓄力……',
  '每波结束用硬币买遗物：加法加倍率，乘法翻倍率。',
  '每局结算得灵感，去科技树换永久加成。',
  '目标：一局涨粉 100 万。',
];

const KEYS: [string, string][] = [
  ['WASD / 方向键', '移动'],
  ['按住鼠标拖动', '移动'],
  ['1 2 3', '选升级'],
  ['R', '刷新 / 换一批'],
  ['T', '科技树（标题页）'],
  ['Enter', '确认'],
  ['空格', '专属技能'],
  ['Esc / P', '暂停'],
  ['M', '音乐开关'],
  ['F', '全屏'],
];

export function drawSides(gfx: Gfx, ui: Ui, s: SideState): void {
  const side = gfx.side;
  if (!side) return;
  const pad = 8;
  const w = side - pad * 2;

  // Opaque panels: anything the play column drew past its edges is covered here.
  gfx.rect(-side, 0, side, H, C.bar);
  gfx.rect(W, 0, side, H, C.bar);
  gfx.rect(-1, 0, 1, H, C.line);
  gfx.rect(W, 0, 1, H, C.line);

  const head = (title: string, x: number, y: number): number => {
    gfx.text(title, x, y, C.pink);
    gfx.rect(x, y + 14, w, 1, C.line);
    return y + 20;
  };
  const para = (text: string, x: number, y: number, color: string): number => {
    for (const line of wrapText(text, w)) { gfx.text(line, x, y, color, { shadow: null }); y += 13; }
    return y;
  };
  const pair = (k: string, v: string, x: number, y: number, vc: string = C.white): number => {
    gfx.text(k, x, y, C.dim, { shadow: null });
    if (gfx.textW(k) + gfx.textW(v) + 6 <= w) { gfx.text(v, x + w, y, vc, { align: 'r', shadow: null }); return y + 14; }
    gfx.text(v, x + w, y + 12, vc, { align: 'r', shadow: null });
    return y + 27;
  };

  // ---------------------------------------------------------------- left
  const lx = -side + pad;
  let y = 8;
  const run = s.run;
  if (run) {
    y = head('本局构筑', lx, y);
    const c = scoreCtx(run);
    gfx.text(fmtMult(multiplier(c)), lx, y, C.yellow, { scale: 2 });
    y += 28;
    y = pair('加法', `1 + ${c.addMult.toFixed(1)}`, lx, y);
    y = pair('乘法', `×${c.mulMult < 100 ? c.mulMult.toFixed(2) : Math.round(c.mulMult)}`, lx, y);
    y = pair('连击', `×${comboMult(c.combo, c.comboCap).toFixed(2)}`, lx, y);
    if (c.addBase) y = pair('基础值', `+${c.addBase}`, lx, y);
    y += 4;
    y = head('武器', lx, y);
    for (const wp of run.weapons) {
      const d = WEAPON_BY_ID[wp.id];
      ui.tile(lx, y, d.glyph, d.color);
      gfx.text(d.name, lx + 20, y + 2, C.white, { shadow: null });
      gfx.text(d.fusion ? `合成 Lv${wp.lvl}` : `Lv${wp.lvl}`, lx + w, y + 2, d.fusion ? C.yellow : d.color, { align: 'r', shadow: null });
      y += 19;
    }
    const owned = PASSIVES.filter(d => run.passives[d.id]);
    if (owned.length) {
      y = head('被动', lx, y + 4);
      for (const d of owned) {
        ui.tile(lx, y, d.glyph, d.color);
        gfx.text(d.name, lx + 20, y + 2, C.white, { shadow: null });
        gfx.text(`Lv${run.passives[d.id]}`, lx + w, y + 2, d.color, { align: 'r', shadow: null });
        y += 19;
      }
    }
    const relics = RELICS.filter(d => run.relics[d.id]).map(d => d.name + ((run.relics[d.id] ?? 0) > 1 ? `×${run.relics[d.id]}` : ''));
    const perks = PERK_ROWS.filter(r => run.perks[r.key]).map(r => r.name);
    if ((relics.length || perks.length) && y < H - 60) {
      y = head('遗物', lx, y + 4);
      if (relics.length) y = para(relics.join(' · '), lx, y, C.dim);
      if (perks.length) para(`福利：${perks.join('、')}${isTriple(run.perks) ? '（三连）' : ''}`, lx, y + 2, C.green);
    }
  } else {
    y = head('玩法', lx, y);
    for (const line of HOW_TO) y = para(line, lx, y, C.dim) + 4;
    if (y < H - 150) {
      y = head(`合成（两把都到 Lv${FUSE_LEVEL}）`, lx, y + 4);
      drawRecipes(gfx, null, lx, y, w);
    }
  }

  // ---------------------------------------------------------------- right
  const rx = W + pad;
  y = 8;
  if (run) {
    y = head('本局', rx, y);
    const left = Math.ceil(timeLeft(run));
    y = pair('波次', `${run.wave} / ${WAVES}`, rx, y);
    y = pair('剩余时间', `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, rx, y);
    y = pair('粉丝', fmtInt(run.fans), rx, y, C.yellow);
    y = pair('击败弹幕', fmtInt(run.kills), rx, y);
    y = pair('最高连击', String(run.maxCombo), rx, y);
    y = pair('擦弹', String(run.grazes), rx, y, '#9fe8ff');
    y = head(`专属技能「${run.char.ultName}」`, rx, y + 6);
    y = para(run.char.ultDesc, rx, y, C.dim);
    y = pair('充能', `${Math.floor(run.ult.energy)} / ${run.ult.need}`, rx, y + 2, run.ult.energy >= run.ult.need ? C.yellow : C.white);
    y = head('合成进度', rx, y + 6);
    y = drawRecipes(gfx, run, rx, y, w, true) + 4;
  }
  y = head('操作', rx, y);
  for (const [k, v] of KEYS) { if (y > H - 14) break; y = pair(k, v, rx, y); }
  if (!run && s.rank && s.rank.length) {
    y = head('本周排行', rx, y + 6);
    for (const r of s.rank.slice(0, Math.max(0, Math.floor((H - y - 6) / 14)))) {
      const col = r.rank === 1 ? C.yellow : r.rank <= 3 ? C.pink : C.white;
      const score = fmtShort(r.score);
      let name = r.nickname || '匿名';
      const room = w - gfx.textW(score) - 22;
      while (name.length > 1 && gfx.textW(name) > room) name = name.slice(0, -1);
      gfx.text(String(r.rank), rx, y, col, { shadow: null });
      gfx.text(name, rx + 16, y, col, { shadow: null });
      gfx.text(score, rx + w, y, col, { align: 'r', shadow: null });
      y += 14;
    }
  }
}
