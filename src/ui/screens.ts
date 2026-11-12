/** Out-of-run screens: title, result, leaderboard. */
import { wrapText } from '../engine/pixelText';
import { fmtInt, fmtMult, fmtShort, type Gfx } from '../engine/renderer';
import { charSprites, goldSprites } from '../engine/sprites';
import { SCROLL_TEXT } from '../data/danmaku';
import { H, LANE_H, MILLION, TOTAL_TIME, W, WAVES } from '../game/balance';
import { CHARS } from '../game/chars';
import { PERK_ROWS, PERK_TRIPLE_MULT, isTriple, perkCount, type Perks } from '../game/perks';
import type { MyRank, Period, RankItem, ShareMode, SubmitResult } from '../platform/toy';
import { C, type Ui } from './widgets';

// Decorative danmaku drifting behind the menus (not gameplay; plain Math.random is fine here).
interface Deco { text: string; x: number; y: number; v: number; color: string }
const deco: Deco[] = [];
const DECO_COLORS = ['#f4f4f4', '#f4f4f4', '#ffd24a', '#5fe08a', '#00aeec', '#fb7299'];

function drawDeco(gfx: Gfx, dt: number): void {
  if (!deco.length) {
    for (let i = 0; i < 16; i++) {
      deco.push({ text: SCROLL_TEXT[i * 2 % SCROLL_TEXT.length], x: Math.random() * W * 1.6, y: 12 + i * LANE_H * 1.9, v: 14 + Math.random() * 22, color: DECO_COLORS[i % DECO_COLORS.length] });
    }
  }
  gfx.rect(0, 0, W, H, C.bg);
  gfx.alpha(0.2);
  for (const d of deco) {
    d.x -= d.v * dt;
    if (d.x < -90) {
      d.x = W + Math.random() * 60;
      d.text = SCROLL_TEXT[Math.floor(Math.random() * SCROLL_TEXT.length)];
    }
    gfx.text(d.text, d.x, d.y, d.color, { shadow: null });
  }
  gfx.alpha(1);
}

export interface TitleState {
  dt: number;
  time: number;
  best: number;
  charIdx: number;
  unlocked: boolean[];
  musicOn: boolean;
  challenge: number;
  hasRank: boolean;
  /** Follow / 三连 checks exist here (we are inside B站). */
  inBili: boolean;
  /** Author nickname, if known. */
  author: string;
  /** A "go follow" jump is possible from this screen. */
  canFollow: boolean;
  /** Show the 三连福利 panel (a video is configured). */
  perkPanel: boolean;
  perks: Perks;
  canTriple: boolean;
  canRefresh: boolean;
  /** Spendable 灵感, and whether it can buy anything right now. */
  insight: number;
  techReady: boolean;
  onTech: () => void;
  onChar: (delta: number) => void;
  onStart: () => void;
  onRank: () => void;
  onMusic: () => void;
  onFollow: () => void;
  onTriple: () => void;
  onRefresh: () => void;
}

export function drawTitle(gfx: Gfx, ui: Ui, s: TitleState): void {
  drawDeco(gfx, s.dt);
  gfx.text('百万弹幕', W / 2, 28 + Math.round(Math.sin(s.time * 2) * 2), C.pink, { scale: 3, align: 'c', shadow: '#3a1030' });
  gfx.text(s.challenge > 0 ? `好友涨了 ${fmtShort(s.challenge)} 粉，来超过 TA` : '从 0 粉到百万UP主', W / 2, 72, s.challenge > 0 ? C.yellow : C.white, { align: 'c' });

  const ch = CHARS[s.charIdx];
  const open = s.unlocked[s.charIdx];
  const px = 14, py = 92, pw = W - 28, ph = 134;
  gfx.panel(px, py, pw, ph, C.panel, ch.follow && !open ? C.blue : C.line);
  const set = s.best >= MILLION ? goldSprites : charSprites[s.charIdx];
  const img = Math.floor(s.time * 4) % 2 ? set.b : set.a;
  if (!open) gfx.alpha(0.25);
  gfx.g.drawImage(img, px + 12, py + 9, 40, 48);
  gfx.alpha(1);
  gfx.text(ch.name, px + 62, py + 6, open ? C.white : C.dim);
  if (ch.follow) gfx.text('关注专属', px + pw - 8, py + 6, C.blue, { align: 'r' });
  wrapText(ch.desc, pw - 70).slice(0, 3).forEach((line, i) => gfx.text(line, px + 62, py + 21 + i * 13, C.dim, { shadow: null }));
  // Exclusive skill.
  gfx.rect(px + 8, py + 62, pw - 16, 1, C.line);
  ui.tile(px + 8, py + 67, ch.ultGlyph, C.yellow);
  gfx.text(`专属技能「${ch.ultName}」`, px + 28, py + 69, C.yellow);
  wrapText(ch.ultDesc, pw - 16).slice(0, 2).forEach((line, i) => gfx.text(line, px + 8, py + 86 + i * 13, C.dim, { shadow: null }));
  gfx.text(`${s.charIdx + 1}/${CHARS.length}`, px + pw / 2, py + ph - 18, C.dim, { align: 'c', shadow: null });
  ui.button(px + 6, py + ph - 24, 28, 19, '<', () => s.onChar(-1), { color: C.panel2, ink: C.white, key: 'KeyQ' });
  ui.button(px + pw - 34, py + ph - 24, 28, 19, '>', () => s.onChar(1), { color: C.panel2, ink: C.white, key: 'KeyE' });

  if (open) gfx.text(s.best > 0 ? `最高 ${fmtInt(s.best)} 粉` : '还没有纪录，开播吧', W / 2, 230, s.best >= MILLION ? C.yellow : C.dim, { align: 'c' });
  else {
    const who = s.author ? ` ${[...s.author].slice(0, 8).join('')} ` : ' UP 主';
    const lock = !ch.follow ? `最高分达到 ${fmtShort(ch.unlock)} 粉后解锁`
      : s.inBili ? `关注${who}后解锁` : '在 B 站内关注 UP 主后解锁';
    gfx.text(lock, W / 2, 230, ch.follow ? C.blue : C.yellow, { align: 'c' });
  }
  if (open) ui.button(38, 246, W - 76, 28, '开始直播', s.onStart, { key: 'Enter' });
  else if (ch.follow && s.canFollow) ui.button(38, 246, W - 76, 28, '去关注，解锁角色', s.onFollow, { color: C.blue, key: 'Enter' });
  else ui.button(38, 246, W - 76, 28, '未解锁', s.onStart, { disabled: true });
  ui.button(14, 279, 60, 24, '排行榜', s.onRank, { color: C.blue, disabled: !s.hasRank });
  ui.button(78, 279, 60, 24, '科技树', s.onTech, { color: C.yellow, key: 'KeyT' });
  ui.button(142, 279, 60, 24, s.musicOn ? '音乐 开' : '音乐 关', s.onMusic, { color: C.panel2, ink: C.white, key: 'KeyM' });
  // A blinking dot when there is 灵感 enough to buy something.
  if (s.techReady && Math.floor(s.time * 3) % 2 === 0) { gfx.rect(132, 277, 6, 6, C.ink); gfx.rect(133, 278, 4, 4, C.red); }

  if (!s.perkPanel) {
    gfx.text('拖动移动 · 自动攻击 · 攒满放大招', W / 2, H - 99, C.dim, { align: 'c' });
    gfx.text('贴着弹幕掠过＝擦弹，也能充能', W / 2, H - 84, C.dim, { align: 'c' });
    gfx.text('两把武器都到 Lv4 可以合成', W / 2, H - 69, C.dim, { align: 'c' });
    gfx.text('击败弹幕涨粉，买遗物叠倍率', W / 2, H - 54, C.dim, { align: 'c' });
    gfx.text(s.insight > 0 ? `手里有 ${s.insight} 灵感，去科技树花掉` : '每局结算得灵感，科技树永久变强', W / 2, H - 39, s.insight > 0 ? C.yellow : C.dim, { align: 'c' });
    return;
  }
  // 三连福利: what liking / coining / favouriting the author's video gives at the start of a run.
  const fx = 14, fy = 310, fw = W - 28, fh = 108;
  const all = isTriple(s.perks);
  gfx.panel(fx, fy, fw, fh, C.panel, all ? C.yellow : C.line);
  gfx.text('三连福利', fx + 8, fy + 6, C.pink);
  gfx.text(`${perkCount(s.perks)}/3`, fx + 62, fy + 6, all ? C.yellow : C.dim);
  PERK_ROWS.forEach((row, i) => {
    const on = s.perks[row.key];
    const y = fy + 24 + i * 14;
    gfx.rect(fx + 8, y + 3, 5, 5, on ? C.green : C.line);
    gfx.text(row.name, fx + 18, y, on ? C.white : C.dim, { shadow: null });
    gfx.text(row.desc, fx + fw - 8, y, on ? C.green : C.dim, { align: 'r', shadow: null });
  });
  gfx.text(`三项全亮  倍率 +${PERK_TRIPLE_MULT}`, fx + 8, fy + 68, all ? C.yellow : C.dim, { shadow: null });
  if (!s.inBili) gfx.text('在 B 站内打开才能领取', fx + 8, fy + 87, C.dim, { shadow: null });
  else {
    ui.button(fx + 8, fy + 84, 104, 19, all ? '再去看看视频' : '去给视频三连', s.onTriple, { color: all ? C.panel2 : C.pink, ink: all ? C.white : C.ink, disabled: !s.canTriple });
    ui.button(fx + 118, fy + 84, fw - 126, 19, '刷新状态', s.onRefresh, { color: C.panel2, ink: C.white, disabled: !s.canRefresh });
  }
}

export interface ResultState {
  fans: number;
  win: boolean;
  millionAt: number | null;
  newBest: boolean;
  best: number;
  wave: number;
  kills: number;
  maxCombo: number;
  mult: number;
  level: number;
  unlocked: string[];
  submit: SubmitResult | 'pending';
  /** 灵感 earned this run, and what is spendable now. */
  ins: number;
  insLeft: number;
  techReady: boolean;
  grazes: number;
  onTech: () => void;
  shareMode: ShareMode;
  hasRank: boolean;
  dt: number;
  time: number;
  onAgain: () => void;
  onRank: () => void;
  onShare: () => void;
  onTitle: () => void;
}

export function drawResult(gfx: Gfx, ui: Ui, s: ResultState): void {
  drawDeco(gfx, s.dt);
  const million = s.millionAt !== null;
  const head = million ? '百万UP主！' : s.win ? '顺利下播' : '直播翻车';
  gfx.text(head, W / 2, 30, million ? C.yellow : s.win ? C.green : C.red, { scale: 2, align: 'c' });
  gfx.text('本场涨粉', W / 2, 66, C.dim, { align: 'c' });
  gfx.text(fmtInt(s.fans), W / 2, 82, million ? C.yellow : C.white, { scale: 2, align: 'c' });
  if (s.newBest) {
    if (Math.floor(s.time * 4) % 2) gfx.text('新纪录！', W / 2, 112, C.pink, { align: 'c' });
  } else gfx.text(`最高 ${fmtInt(s.best)}`, W / 2, 112, C.dim, { align: 'c' });

  const rows: [string, string][] = [
    ['到达波次', `${s.wave}/${WAVES}${s.win ? ' 通关' : ''}`],
    ['击败弹幕', fmtInt(s.kills)],
    ['最高连击', String(s.maxCombo)],
    ['擦弹', `${s.grazes} 次`],
    ['最终倍率', fmtMult(s.mult)],
    ['等级', `Lv${s.level}`],
  ];
  if (million) rows.push(['百万用时', `${Math.round(TOTAL_TIME - (s.millionAt ?? 0))} 秒`]);
  gfx.panel(22, 132, W - 44, rows.length * 15 + 10, C.panel, C.line);
  rows.forEach(([k, v], i) => {
    gfx.text(k, 30, 137 + i * 15, C.dim, { shadow: null });
    gfx.text(v, W - 30, 137 + i * 15, C.white, { align: 'r', shadow: null });
  });
  let y = 132 + rows.length * 15 + 14;
  gfx.text(`灵感 +${s.ins}`, W / 2 - 4, y, C.yellow, { align: 'r' });
  gfx.text(`（现有 ${s.insLeft}）`, W / 2 - 2, y, C.dim, { shadow: null });
  y += 15;
  for (const name of s.unlocked) { gfx.text(`解锁：${name}`, W / 2, y, C.green, { align: 'c' }); y += 14; }
  const note = s.submit === 'pending' ? '正在提交成绩…' : s.submit === 'ok' ? '成绩已提交到排行榜' : s.submit === 'fail' ? '成绩提交失败（未登录或网络问题）' : '当前环境没有排行榜，成绩只存在本机';
  wrapText(note, W - 30).forEach(line => { gfx.text(line, W / 2, y, C.dim, { align: 'c', shadow: null }); y += 13; });

  const by = H - 100;
  ui.button(14, by, 92, 30, '再来一局', s.onAgain, { key: 'Enter' });
  ui.button(110, by, 92, 30, '科技树', s.onTech, { color: C.yellow, key: 'KeyT' });
  if (s.techReady && Math.floor(s.time * 3) % 2 === 0) { gfx.rect(196, by - 2, 6, 6, C.ink); gfx.rect(197, by - 1, 4, 4, C.red); }
  const share = s.shareMode !== 'none';
  const bw = share ? 92 : W - 28;
  ui.button(14, by + 36, bw, 24, '排行榜', s.onRank, { color: C.blue, disabled: !s.hasRank });
  if (share) ui.button(110, by + 36, 92, 24, s.shareMode === 'share' ? '分享' : '二维码', s.onShare, { color: C.green });
  ui.button(14, by + 66, W - 28, 22, '返回标题', s.onTitle, { color: C.panel2, ink: C.white, key: 'Escape' });
}

export interface RankState {
  board: number;
  period: Period;
  loading: boolean;
  failed: boolean;
  list: RankItem[];
  mine: MyRank | null;
  canRefresh: boolean;
  onBoard: (b: number) => void;
  onPeriod: (p: Period) => void;
  onRefresh: () => void;
  onBack: () => void;
}

const PERIODS: [Period, string][] = [['day', '日榜'], ['week', '周榜'], ['all', '总榜']];

function clip(gfx: Gfx, s: string, maxW: number): string {
  if (gfx.textW(s) <= maxW) return s;
  let out = '';
  for (const ch of s) {
    if (gfx.textW(out + ch + '…') > maxW) break;
    out += ch;
  }
  return `${out}…`;
}

export function drawRank(gfx: Gfx, ui: Ui, s: RankState): void {
  gfx.rect(0, 0, W, H, C.bg);
  gfx.text('排行榜', W / 2, 12, C.pink, { scale: 2, align: 'c' });
  const tab = (x: number, y: number, w: number, label: string, on: boolean, fn: () => void): void =>
    ui.button(x, y, w, 20, label, fn, on ? { color: C.pink } : { color: C.panel2, ink: C.white });
  tab(10, 44, 96, '涨粉榜', s.board === 1, () => s.onBoard(1));
  tab(110, 44, 96, '百万速通榜', s.board === 2, () => s.onBoard(2));
  PERIODS.forEach(([p, label], i) => tab(10 + i * 66, 68, 64, label, s.period === p, () => s.onPeriod(p)));

  const top = 96;
  gfx.panel(8, top, W - 16, 254, C.panel, C.line);
  if (s.loading) gfx.text('加载中…', W / 2, top + 110, C.dim, { align: 'c' });
  else if (s.failed) {
    gfx.text('榜单暂时拉不到', W / 2, top + 100, C.dim, { align: 'c' });
    gfx.text('请在 B 站内打开并登录后重试', W / 2, top + 116, C.dim, { align: 'c' });
  } else if (!s.list.length) gfx.text('还没有人上榜，来当第一个', W / 2, top + 110, C.dim, { align: 'c' });
  else {
    s.list.slice(0, 16).forEach((r, i) => {
      const y = top + 6 + i * 15;
      const col = r.rank === 1 ? C.yellow : r.rank <= 3 ? C.pink : C.white;
      gfx.text(String(r.rank), 28, y, col, { align: 'r', shadow: null });
      gfx.text(clip(gfx, r.nickname || '匿名', 96), 36, y, col, { shadow: null });
      gfx.text(s.board === 2 ? `剩 ${r.score} 秒` : fmtShort(r.score), W - 14, y, col, { align: 'r', shadow: null });
    });
  }
  const mine = s.mine;
  const me = s.loading || s.failed ? '' : mine && mine.ranked
    ? `我的排名 第 ${mine.rank} 名 · ${s.board === 2 ? `剩 ${mine.score} 秒` : fmtShort(mine.score)}`
    : s.board === 2 ? '你还没在一局里冲到百万' : '你还没有上榜';
  if (me) gfx.text(me, W / 2, top + 260, C.green, { align: 'c' });

  ui.button(10, H - 44, 84, 26, '刷新', s.onRefresh, { color: C.blue, disabled: !s.canRefresh });
  ui.button(100, H - 44, W - 110, 26, '返回', s.onBack, { color: C.panel2, ink: C.white, key: 'Escape' });
}
