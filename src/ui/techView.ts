/** 科技树 screen: three branches of five nodes; pick a node to read it, then buy a level. */
import { wrapText } from '../engine/pixelText';
import type { Gfx } from '../engine/renderer';
import { H, W } from '../game/balance';
import { BRANCHES, TECHS, TIERS, canBuyTech, techCost, techLeft, techOpen } from '../game/tech';
import { C, type Ui } from './widgets';

export interface TechState {
  time: number;
  /** Total 灵感 ever earned. */
  earned: number;
  levels: number[];
  /** Selected node index. */
  sel: number;
  onSelect: (i: number) => void;
  onBuy: (i: number) => void;
  onBack: () => void;
}

const COL_X = [40, 108, 176];
const ROW_Y = 68;
const ROW_H = 44;
const NODE = 24;

export function drawTech(gfx: Gfx, ui: Ui, s: TechState): void {
  gfx.rect(0, 0, W, H, C.bg);
  gfx.text('科技树', 10, 10, C.pink, { scale: 2 });
  const left = techLeft(s.earned, s.levels);
  gfx.text(`灵感 ${left}`, W - 10, 12, C.yellow, { align: 'r' });
  gfx.text('每局结算都会获得', W - 10, 26, C.dim, { align: 'r', shadow: null });

  for (let b = 0; b < BRANCHES.length; b++) {
    const br = BRANCHES[b];
    const cx = COL_X[b];
    gfx.text(br.name, cx, 40, br.color, { align: 'c' });
    gfx.text(br.hint, cx, 55, C.dim, { align: 'c', shadow: null });
    for (let t = 0; t < TIERS; t++) {
      const i = b * TIERS + t;
      const def = TECHS[i];
      const lvl = s.levels[i] ?? 0;
      const max = def.costs.length;
      const open = techOpen(i, s.levels);
      const x = cx - NODE / 2, y = ROW_Y + 6 + t * ROW_H;
      // Trunk to the next tier: lit once this node has a level.
      if (t < TIERS - 1) gfx.rect(cx - 1, y + NODE, 2, ROW_H - NODE, lvl > 0 ? br.color : C.line);
      const can = canBuyTech(i, s.levels, s.earned);
      const face = lvl >= max ? br.color : lvl > 0 ? C.panel2 : C.panel;
      const edge = s.sel === i ? C.white : can && Math.floor(s.time * 3) % 2 === 0 ? C.yellow : open ? br.color : C.line;
      gfx.panel(x, y, NODE, NODE, face, edge);
      if (s.sel === i) gfx.frame(x - 2, y - 2, NODE + 4, NODE + 4, C.white);
      gfx.text(def.glyph, cx, y + 4, lvl >= max ? C.ink : open ? C.white : C.line, { align: 'c', shadow: null });
      // Level pips.
      const pw = max * 4 - 1;
      for (let k = 0; k < max; k++) gfx.rect(cx - pw / 2 + k * 4, y + NODE - 4, 3, 2, k < lvl ? (lvl >= max ? C.ink : br.color) : C.line);
      ui.zone(x - 8, y - 4, NODE + 16, NODE + 12, () => s.onSelect(i));
    }
  }

  // Detail of the selected node.
  const i = Math.max(0, Math.min(TECHS.length - 1, s.sel));
  const def = TECHS[i];
  const br = BRANCHES[Math.floor(i / TIERS)];
  const lvl = s.levels[i] ?? 0;
  const max = def.costs.length;
  const cost = techCost(i, s.levels);
  const open = techOpen(i, s.levels);
  const py = 298, ph = 90;
  gfx.panel(8, py, W - 16, ph, C.panel, br.color);
  ui.tile(16, py + 7, def.glyph, br.color);
  gfx.text(def.name, 38, py + 9, C.white);
  gfx.text(`Lv${lvl}/${max}`, W - 16, py + 9, lvl >= max ? C.green : C.dim, { align: 'r' });
  let y = py + 29;
  for (const line of wrapText(`每级：${def.desc}`, W - 32).slice(0, 2)) { gfx.text(line, 16, y, C.dim, { shadow: null }); y += 13; }
  const state = cost === null ? '已点满' : !open ? `先点亮上一级「${TECHS[i - 1].name}」` : left >= cost ? `升级需要 ${cost} 灵感` : `升级需要 ${cost} 灵感，还差 ${cost - left}`;
  gfx.text(state, 16, py + ph - 18, cost === null ? C.green : !open ? C.dim : left >= cost ? C.yellow : C.red, { shadow: null });

  ui.button(10, H - 36, 70, 26, '返回', s.onBack, { color: C.panel2, ink: C.white, key: 'Escape' });
  const can = canBuyTech(i, s.levels, s.earned);
  ui.button(86, H - 36, W - 96, 26, cost === null ? '已点满' : `升级（${cost} 灵感）`, () => s.onBuy(i), { disabled: !can, color: C.yellow, key: 'Enter' });
}
