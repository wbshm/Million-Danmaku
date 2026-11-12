/** In-run overlays: level-up cards, the between-wave shop and the pause menu. */
import { wrapText } from '../engine/pixelText';
import { fmtMult, type Gfx } from '../engine/renderer';
import { icons } from '../engine/sprites';
import { BOSS_WAVES, H, W } from '../game/balance';
import { RELICS, RELIC_BY_ID } from '../game/relics';
import { currentMultiplier, relicCount, type Run } from '../game/run';
import { FUSE_LEVEL, RECIPES, WEAPON_BY_ID, type WeaponId } from '../game/weapons';
import { C, type Ui } from './widgets';

function dim(gfx: Gfx, a: number): void {
  gfx.alpha(a);
  gfx.rect(0, 0, W, H, C.black);
  gfx.alpha(1);
}

export function drawLevelUp(gfx: Gfx, ui: Ui, run: Run, onChoose: (i: number) => void, keyHints = false, time = 0, onReroll?: () => void): void {
  ui.modal = true;
  dim(gfx, 0.8);
  gfx.text('升级！', W / 2, 44, C.yellow, { scale: 2, align: 'c' });
  const more = run.pendingLevels > 1 ? ` · 还有 ${run.pendingLevels - 1} 次` : '';
  gfx.text(`Lv${run.level} · 选一个强化${more}`, W / 2, 76, C.white, { align: 'c' });
  (run.choices ?? []).forEach((c, i) => {
    const x = 10, y = 98 + i * 74, w = W - 20, h = 70;
    const fusion = c.type === 'fusion';
    gfx.panel(x, y, w, h, fusion ? '#2c2610' : C.panel, fusion ? (Math.floor(time * 5) % 2 ? C.yellow : C.white) : c.color);
    ui.tile(x + 7, y + 7, c.glyph, c.color);
    gfx.text(c.name, x + 29, y + 8, fusion ? C.yellow : C.white);
    const trick = c.type === 'weapon' && !!WEAPON_BY_ID[c.id as WeaponId]?.trick;
    const kind = fusion ? '合成武器' : trick ? '机制武器' : c.type === 'weapon' ? '武器' : c.type === 'passive' ? '被动' : '';
    if (kind) gfx.text(kind, x + 33 + gfx.textW(c.name), y + 8, fusion ? C.yellow : trick ? C.purple : C.dim);
    const tag = fusion ? '合成' : c.type === 'bonus' ? '' : c.lvl === 1 ? '新' : `Lv${c.lvl}`;
    if (tag) gfx.text(tag, x + w - 8, y + 8, fusion ? C.yellow : c.lvl === 1 ? C.green : C.yellow, { align: 'r' });
    const lines = wrapText(c.desc, w - 18).slice(0, 2);
    lines.forEach((line, j) => gfx.text(line, x + 9, y + 28 + j * 13, C.dim, { shadow: null }));
    if (c.hint) gfx.text(c.hint, x + 9, y + 28 + lines.length * 13, fusion ? C.yellow : C.purple, { shadow: null });
    if (keyHints) gfx.text(`按 ${i + 1}`, x + w - 8, y + h - 15, C.line, { align: 'r', shadow: null });
    ui.zone(x, y, w, h, () => onChoose(i), `Digit${i + 1}`, true);
  });
  // 科技树「选题会」: throw these three back.
  if (onReroll && run.lvRerolls > 0) {
    ui.button(52, 326, W - 104, 24, `换一批（剩 ${run.lvRerolls} 次）`, onReroll, { color: C.blue, key: 'KeyR' });
  }
}

const KIND = { mul: ['乘法', C.pink], add: ['加法', C.blue], util: ['功能', C.green] } as const;

export interface ShopHandlers { buy: (i: number) => void; reroll: () => void; next: () => void }

export function drawShop(gfx: Gfx, ui: Ui, run: Run, h: ShopHandlers): void {
  ui.modal = true;
  dim(gfx, 0.88);
  gfx.text('中场休息', W / 2, 30, C.pink, { scale: 2, align: 'c' });
  const nextBoss = BOSS_WAVES.includes(run.wave + 1);
  gfx.text(`第 ${run.wave} 波结束 · 下一波${nextBoss ? '有 Boss' : `第 ${run.wave + 1} 波`}`, W / 2, 60, C.dim, { align: 'c' });
  gfx.sprite(icons.coin, 12, 81);
  gfx.text(String(run.coins), 21, 78, C.yellow);
  gfx.text(`当前倍率 ${fmtMult(currentMultiplier(run))}`, W - 12, 78, C.yellow, { align: 'r' });

  (run.shop ?? []).forEach((o, i) => {
    const x = 10, y = 96 + i * 66, w = W - 20, hh = 62;
    if (!o) {
      gfx.panel(x, y, w, hh, C.bg, C.line);
      gfx.text('已购买', W / 2, y + 25, C.line, { align: 'c', shadow: null });
      return;
    }
    const d = RELIC_BY_ID[o.id];
    const [tag, col] = KIND[d.kind];
    const owned = run.relics[o.id] ?? 0;
    gfx.panel(x, y, w, hh, C.panel, col);
    gfx.text(d.name, x + 8, y + 5, C.white);
    gfx.text(tag, x + 13 + gfx.textW(d.name), y + 5, col);
    if (owned) gfx.text(`已有 ${owned}`, x + w - 8, y + 5, C.dim, { align: 'r' });
    wrapText(d.desc, w - 68).slice(0, 3).forEach((line, j) => gfx.text(line, x + 8, y + 21 + j * 13, C.dim, { shadow: null }));
    const can = run.coins >= o.price;
    ui.button(x + w - 52, y + hh - 24, 46, 19, `${o.price} 币`, () => h.buy(i), { disabled: !can, color: C.yellow });
  });

  const n = relicCount(run);
  gfx.text(`已有遗物 ${n} 件`, 12, 298, C.white);
  if (n) {
    const names = RELICS.filter(d => run.relics[d.id]).map(d => d.name + ((run.relics[d.id] ?? 0) > 1 ? `×${run.relics[d.id]}` : ''));
    wrapText(names.join(' · '), W - 24).slice(0, 4).forEach((line, j) => gfx.text(line, 12, 313 + j * 13, C.dim, { shadow: null }));
  }

  const free = run.freeRerolls > 0;
  ui.button(10, H - 58, 84, 26, free ? '免费刷新' : `刷新 ${run.rerollCost} 币`, h.reroll, { disabled: !free && run.coins < run.rerollCost, color: C.blue, key: 'KeyR' });
  ui.button(100, H - 58, W - 110, 26, '下一波 >', h.next, { key: 'Enter' });
}

/**
 * The fusion recipes, coloured by how close the current build is to each.
 * `startedOnly` lists just the recipes the build has a hand in (for the narrow PC side panel).
 */
export function drawRecipes(gfx: Gfx, run: Run | null, x: number, y: number, w: number, startedOnly = false): number {
  const lvl = (id: string): number => run?.weapons.find(q => q.id === id)?.lvl ?? 0;
  const fl = run?.tech.fuseLevel ?? FUSE_LEVEL;
  let shown = 0;
  for (const r of RECIPES) {
    const a = lvl(r.a), b = lvl(r.b);
    const done = lvl(r.out) > 0;
    if (startedOnly && !a && !b && !done) continue;
    shown++;
    const col = done ? C.green : a >= fl && b >= fl ? C.yellow : a && b ? C.white : a || b ? '#c8c8dc' : C.dim;
    const text = `${WEAPON_BY_ID[r.a].name}+${WEAPON_BY_ID[r.b].name}→${WEAPON_BY_ID[r.out].name}`;
    for (const line of wrapText(text, w)) { gfx.text(line, x, y, run ? col : C.dim, { shadow: null }); y += 13; }
    y += 1;
  }
  if (startedOnly && !shown) { gfx.text('暂停菜单里有全部配方', x, y, C.dim, { shadow: null }); y += 14; }
  return y;
}

export interface PauseHandlers { resume: () => void; music: () => void; sfx: () => void; quit: () => void; musicOn: boolean; sfxOn: boolean }

export function drawPause(gfx: Gfx, ui: Ui, run: Run, h: PauseHandlers): void {
  ui.modal = true;
  dim(gfx, 0.86);
  gfx.text('暂停', W / 2, 44, C.white, { scale: 2, align: 'c' });
  const x = 38, w = W - 76;
  ui.button(x, 70, w, 26, '继续', h.resume, { key: 'Enter' });
  const half = (w - 4) / 2;
  ui.button(x, 100, half, 22, `音乐 ${h.musicOn ? '开' : '关'}`, h.music, { color: C.panel2, ink: C.white });
  ui.button(x + half + 4, 100, half, 22, `音效 ${h.sfxOn ? '开' : '关'}`, h.sfx, { color: C.panel2, ink: C.white });
  ui.button(x, 126, w, 22, '放弃本局', h.quit, { color: C.panel2, ink: C.red });

  gfx.panel(8, 158, W - 16, 262, C.panel, C.line);
  gfx.text(`专属技能「${run.char.ultName}」`, 16, 164, C.yellow);
  let y = 180;
  for (const line of wrapText(run.char.ultDesc, W - 32)) { gfx.text(line, 16, y, C.dim, { shadow: null }); y += 13; }
  y += 5;
  gfx.text(`合成配方（两把都到 Lv${run.tech.fuseLevel}）`, 16, y, C.pink);
  y = drawRecipes(gfx, run, 16, y + 16, W - 32) + 4;
  gfx.text(`本局擦弹 ${run.grazes} 次`, 16, y, '#9fe8ff', { shadow: null });
}
