import './style.css';
import { config } from './config';
import { Sound } from './engine/audio';
import { Input } from './engine/input';
import { resetGlyphs } from './engine/pixelText';
import { Gfx, fmtInt } from './engine/renderer';
import { buildSprites } from './engine/sprites';
import { BOSS_WAVES, MILLION, W, H, WAVES } from './game/balance';
import { botMove } from './game/bot';
import { CHARS, unlockedChars } from './game/chars';
import { NO_PERKS, isTriple, perksFromBits, perksToBits, type Perks } from './game/perks';
import { buyRelic, chooseUpgrade, createRun, currentMultiplier, damageShares, leaveShop, rerollChoices, rerollShop, stepRun, useUlt, type DmgShare, type GameEvent, type Run } from './game/run';
import { defaultSave, type Save } from './game/save';
import { anyTechAffordable, buyTech, decodeTech, encodeTech, mergeTech, runInsight, techFx, techLeft } from './game/tech';
import { platform, type MyRank, type Period, type RankItem, type SubmitResult } from './platform/toy';
import { Fx } from './ui/fx';
import { drawGame } from './ui/gameView';
import { drawLevelUp, drawPause, drawShop } from './ui/overlays';
import { drawRank, drawResult, drawTitle } from './ui/screens';
import { drawSides } from './ui/sidePanels';
import { drawTech } from './ui/techView';
import { C, Ui } from './ui/widgets';

type Scene = 'loading' | 'title' | 'game' | 'result' | 'rank' | 'tech';

interface Result {
  fans: number;
  win: boolean;
  millionAt: number | null;
  newBest: boolean;
  wave: number;
  kills: number;
  maxCombo: number;
  mult: number;
  level: number;
  unlocked: string[];
  submit: SubmitResult | 'pending';
  /** 灵感 earned by this run. */
  ins: number;
  grazes: number;
  dmg: DmgShare[];
}

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
// Development aids (dead code in production builds): ?bot=1 auto-steers, ?speed=4 fast-forwards,
// ?bv=BVxxxx stands in for config.videoBvid.
const devBot = import.meta.env.DEV && params.has('bot');
const devSpeed = import.meta.env.DEV ? Math.max(1, Number(params.get('speed')) || 1) : 1;
if (import.meta.env.DEV && params.get('bv')) config.videoBvid = params.get('bv') ?? '';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;
const gfx = new Gfx(canvas, stage);
const ui = new Ui(gfx);
const fx = new Fx();
const sound = new Sound();
const input = new Input(canvas, (x, y) => gfx.toLogical(x, y));

const app = {
  scene: 'loading' as Scene,
  save: defaultSave() as Save,
  run: null as Run | null,
  paused: false,
  /** Seconds left of the death / clear moment before the result screen appears. */
  endTimer: 0,
  /** Final boss went down: the clear sequence that plays before the result screen. */
  finale: null as { t: number; x: number; y: number; name: string; next: number; blown: boolean } | null,
  result: null as Result | null,
  rankFrom: 'title' as Scene,
  techFrom: 'title' as Scene,
  /** Selected 科技树 node, and whether a purchase still has to reach the cloud. */
  techSel: 0,
  techDirty: false,
  challenge: Math.max(0, Math.floor(Number(params.get('s')) || 0)),
  time: 0,
  acc: 0,
  /** Weekly top list shown in the PC side panel. */
  sideRank: null as RankItem[] | null,
  /** The player was sent off to follow / 三连; re-check when they come back. */
  socialDirty: false,
  socialAt: 0,
};

const rank = {
  board: 1,
  period: 'week' as Period,
  loading: false,
  failed: false,
  list: [] as RankItem[],
  mine: null as MyRank | null,
  token: 0,
  lastRefresh: 0,
};

// ------------------------------------------------------------------ social (follow / 三连)

/** Live answer when the platform gave one, otherwise what we last saved. */
function following(): boolean {
  return platform.social.known ? platform.social.following : app.save.fol;
}

function perks(): Perks {
  if (!config.videoBvid) return NO_PERKS;
  const s = platform.social;
  return s.tripleKnown ? { like: s.like, coin: s.coin, fav: s.fav } : perksFromBits(app.save.tri);
}

function unlocked(): boolean[] {
  return unlockedChars(app.save.best, following());
}

function syncSocial(): void {
  app.socialDirty = false;
  app.socialAt = performance.now();
  void platform.refreshSocial(config.videoBvid).then(s => {
    const save = app.save;
    const before = `${save.fol}:${save.tri}`;
    if (s.known) save.fol = s.following;
    if (s.tripleKnown) save.tri = perksToBits({ like: s.like, coin: s.coin, fav: s.fav });
    if (!unlocked()[save.char]) save.char = 0;
    if (before !== `${save.fol}:${save.tri}`) { persist(false); sound.play('buy'); }
  });
}

/** Send the player to the author's video (or space) and re-check once they are back. */
function goAuthor(): void {
  const mid = config.authorMid || platform.author.mid;
  // Video first (三连 + follow in one place), then the author's space, then a search for their name.
  const ok = config.videoBvid ? platform.navigate('video', config.videoBvid)
    : mid ? platform.navigate('space', mid)
    : platform.navigate('search', platform.author.nickname);
  if (!ok) { sound.play('deny'); return; }
  sound.play('ui');
  app.socialDirty = true;
  // If the jump did not take the page to the background (it opened beside us), check anyway.
  window.setTimeout(() => { if (app.socialDirty && !document.hidden) syncSocial(); }, 2500);
}

const followTarget = (): boolean => platform.canNavigate && !!(config.videoBvid || config.authorMid || platform.author.mid || platform.author.nickname);

/** Label of the jump button, or '' when there is nowhere to send the player. */
function socialLabel(): string {
  if (!followTarget()) return '';
  if (config.videoBvid) return isTriple(perks()) && following() ? '看看视频' : following() ? '去三连' : '关注+三连';
  return following() ? 'UP主主页' : '关注UP主';
}

// ------------------------------------------------------------------ flow

function persist(cloud: boolean): void {
  void platform.writeSave(app.save, cloud);
}

function applySound(): void {
  sound.musicOn = app.save.music;
  sound.sfxOn = app.save.sfx;
  sound.apply();
}

function toggleMusic(): void {
  app.save.music = !app.save.music;
  applySound();
  persist(false);
}

const techLevels = (): number[] => decodeTech(app.save.tech);
const insightLeft = (): number => techLeft(app.save.ins, techLevels());
const techReady = (): boolean => anyTechAffordable(techLevels(), app.save.ins);

function openTech(): void {
  app.techFrom = app.scene;
  app.scene = 'tech';
  sound.play('ui');
  ui.lock(250);
}

function closeTech(): void {
  // One cloud write for the whole visit, not one per purchase (the write quota is shared and small).
  if (app.techDirty) { app.techDirty = false; persist(true); }
  app.scene = app.techFrom === 'result' && app.result ? 'result' : 'title';
  ui.lock(250);
}

function buyTechNode(i: number): void {
  const levels = techLevels();
  if (!buyTech(i, levels, app.save.ins)) { sound.play('deny'); return; }
  app.save.tech = encodeTech(levels);
  app.techDirty = true;
  persist(false);
  sound.play('buy');
}

function startRun(): void {
  if (!unlocked()[app.save.char]) return;
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  app.run = createRun(seed, app.save.char, perks(), techFx(techLevels()));
  app.paused = false;
  app.endTimer = 0;
  app.finale = null;
  app.acc = 0;
  app.result = null;
  fx.reset();
  input.clear();
  sound.intensity = 1;
  app.scene = 'game';
  ui.lock(250);
}

function toTitle(): void {
  app.run = null;
  app.scene = 'title';
  sound.intensity = 0;
  ui.lock(250);
}

function finishRun(): void {
  const run = app.run;
  if (!run) return;
  const save = app.save;
  const fans = Math.floor(run.fans);
  const before = unlocked();
  const hadGold = save.best >= MILLION;
  const newBest = fans > save.best;
  save.best = Math.max(save.best, fans);
  save.runs++;
  save.seenHint = true;
  if (run.millionAt !== null) save.bestFast = Math.max(save.bestFast, run.millionAt);
  const after = unlocked();
  const names = CHARS.filter((_, i) => after[i] && !before[i]).map(c => c.name);
  if (!hadGold && save.best >= MILLION) names.push('百万皇冠皮肤（每个角色各一套）');
  const ins = runInsight(run);
  save.ins += ins;
  run.combo = 0;
  const result: Result = {
    fans, win: run.win, millionAt: run.millionAt, newBest, wave: run.wave, kills: run.kills,
    maxCombo: run.maxCombo, mult: currentMultiplier(run), level: run.level, unlocked: names, submit: 'pending', ins, grazes: run.grazes, dmg: damageShares(run, 6),
  };
  app.result = result;
  app.scene = 'result';
  sound.intensity = 0;
  ui.lock(700);
  // Settlement is the one moment we touch cloud storage and the leaderboard.
  persist(true);
  void platform.submit(fans, run.millionAt).then(r => { result.submit = r; });
}

function loadRank(force: boolean): void {
  const token = ++rank.token;
  const { board, period } = rank;
  rank.loading = true;
  rank.failed = false;
  void platform.rank(board, period, force).then(d => {
    if (d && board === 1 && period === 'week') app.sideRank = d.list;
    if (token !== rank.token) return;
    rank.loading = false;
    rank.failed = !d;
    rank.list = d?.list ?? [];
    rank.mine = d?.mine ?? null;
  });
}

function openRank(): void {
  app.rankFrom = app.scene;
  app.scene = 'rank';
  ui.lock(250);
  loadRank(false);
}

function showQr(dataUrl: string): void {
  document.getElementById('qr')?.remove();
  const box = document.createElement('div');
  box.id = 'qr';
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = '本游戏的二维码';
  const tip = document.createElement('div');
  tip.textContent = '用 B 站 App 扫码，在手机上接着玩';
  const close = document.createElement('div');
  close.textContent = '点任意位置关闭';
  box.append(img, tip, close);
  box.addEventListener('click', () => box.remove());
  document.body.append(box);
}

function share(): void {
  const score = app.result?.fans ?? app.save.best;
  void platform.share(score).then(r => { if (r) showQr(r.qr); });
}

function togglePause(): void {
  const run = app.run;
  if (app.scene !== 'game' || !run || run.phase !== 'play' || app.endTimer > 0) return;
  app.paused = !app.paused;
  input.clear();
  ui.lock(200);
}

function toggleFullscreen(): void {
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  } catch { /* not allowed inside this container */ }
}

// ------------------------------------------------------------------ events

function finaleCheer(): number {
  const f = app.finale;
  return f && f.blown ? 1 + Math.abs(Math.sin((f.t - FINALE_BLOW) * 8)) * 5 : 0;
}

/** The dying boss: its text keeps shaking and flickering where it fell until it blows up. */
function drawFinaleBoss(f: NonNullable<typeof app.finale>): void {
  if (f.blown) return;
  const k = f.t / FINALE_BLOW;
  const dx = Math.round((Math.random() * 2 - 1) * (2 + 4 * k)), dy = Math.round((Math.random() * 2 - 1) * (1 + 3 * k));
  const w = gfx.textW(f.name, 2);
  const x = Math.max(2, Math.min(W - w - 2, f.x - w / 2));
  gfx.text(f.name, x + dx, f.y - 12 + dy, Math.floor(f.t * 20) % 2 ? C.white : C.red, { scale: 2 });
}

const FINALE_BLOW = 1.3, FINALE_LEN = 4.4;
const PARTY = [C.yellow, C.pink, C.blue, C.green, C.white];

/** The final boss breaks apart, blows up, then confetti while the fans count up. */
function updateFinale(dt: number): void {
  const f = app.finale, run = app.run;
  if (!f || !run) return;
  f.t += dt;
  if (f.t < FINALE_BLOW) {
    if (f.t >= f.next) {
      f.next = f.t + 0.11;
      const x = f.x + (Math.random() * 2 - 1) * 46, y = f.y + (Math.random() * 2 - 1) * 14;
      fx.burst(x, y, PARTY[Math.floor(Math.random() * PARTY.length)], 8, 70);
      fx.ring(x, y, 12 + Math.random() * 14, C.white, 0.2);
      fx.shake = Math.max(fx.shake, 3);
      sound.play('boom');
    }
    return;
  }
  if (!f.blown) {
    f.blown = true;
    for (const [r, c, life] of [[260, C.yellow, 0.6], [180, C.white, 0.5], [110, C.pink, 0.4]] as const) fx.ring(f.x, f.y, r, c, life);
    for (const c of PARTY) fx.burst(f.x, f.y, c, 22, 150);
    fx.flash = 0.6;
    fx.flashColor = C.white;
    fx.shake = 11;
    fx.say('完播！', C.yellow, FINALE_LEN - FINALE_BLOW, ' ');
    fx.toast(`最终 Boss「${f.name}」击破`, C.pink, FINALE_LEN - FINALE_BLOW);
    sound.play('blast');
    sound.play('win');
  }
  if (f.t >= f.next) { f.next = f.t + 0.06; fx.confetti(3, PARTY); }
  // The fans tally rolls up under the banner.
  const k = Math.min(1, (f.t - FINALE_BLOW) / 1.4);
  if (fx.banner) fx.banner.sub = `本场涨粉 ${fmtInt(Math.floor(run.fans * (1 - Math.pow(1 - k, 3))))}`;
}

function handleEvents(events: GameEvent[]): void {
  let bossDown: GameEvent | null = null;
  for (const e of events) {
    const x = e.x ?? 0, y = e.y ?? 0;
    switch (e.t) {
      case 'hit':
        fx.burst(x, y, e.b ? C.yellow : C.white, e.b ? 3 : 1, 30);
        sound.play('hit');
        break;
      case 'kill':
        fx.burst(x, y, e.s ?? C.white, e.b ? 16 : 6, e.b ? 80 : 50);
        fx.float(`+${e.n ?? 0}`, x, y - 6, e.b ? C.yellow : C.pink, e.b ? 2 : 1);
        if (e.b) { fx.shake = Math.max(fx.shake, 4); sound.play('bigkill'); } else sound.play('kill');
        break;
      case 'pop': fx.burst(x, y, e.s ?? C.white, 3, 40); break;
      case 'boom': fx.ring(x, y, e.n ?? 20, C.yellow); fx.burst(x, y, C.yellow, 6, 60); sound.play('boom'); break;
      case 'bolt': fx.bolt(x, y); sound.play('bolt'); break;
      case 'beam': fx.beam(y, e.n ?? 7); sound.play('beam'); break;
      case 'graze': fx.burst(x, y, '#9fe8ff', 4, 45); fx.float('擦弹', x, y - 12, '#9fe8ff'); sound.play('graze'); break;
      case 'keyword': sound.play('keyword'); break;
      case 'wash': fx.burst(x, y, '#7dffb0', 3, 35); break;
      case 'convert': fx.float('洗白', x, y - 8, '#7dffb0'); fx.burst(x, y, '#7dffb0', 8, 50); sound.play('convert'); break;
      case 'remix': fx.burst(x, y, '#ffb347', 5, 60); sound.play('remix'); break;
      case 'pin': fx.ring(x, y, 16, '#ffe14a'); sound.play('pin'); break;
      case 'blast':
        fx.ring(x, y, e.n ?? 30, e.b ? C.white : '#ff6b5c', e.b ? 0.32 : 0.24);
        if (e.b) { fx.ring(x, y, (e.n ?? 30) * 0.7, '#ff6b5c', 0.28); fx.shake = Math.max(fx.shake, 4); }
        sound.play('blast');
        break;
      case 'nova': fx.ring(x, y, 260, C.yellow, 0.5); fx.ring(x, y, 180, C.white, 0.4); fx.shake = 6; break;
      case 'ult': fx.toast(`专属技能：${e.s ?? ''}`, C.yellow, 1.1); fx.flash = 0.25; fx.flashColor = C.white; sound.play('ult'); break;
      case 'fuse': fx.toast(`合成：${e.s ?? ''}`, C.yellow, 1.8, true); sound.play('fuse'); break;
      case 'shoot': sound.play('shoot'); break;
      case 'pick': sound.play('pick'); break;
      case 'hurt': fx.shake = 7; fx.flash = 0.3; fx.flashColor = C.red; sound.play('hurt'); break;
      case 'revive': fx.toast('复活币生效', C.green, 1.4); fx.flash = 0.4; fx.flashColor = C.white; sound.play('revive'); break;
      case 'level': ui.lock(420); sound.play('level'); break;
      case 'shop': ui.lock(500); break;
      case 'choose': sound.play('choose'); break;
      case 'buy': sound.play('buy'); break;
      case 'reroll': sound.play('ui'); break;
      case 'warn': fx.toast('刷屏来袭 · 躲进绿色安全区', C.red, 1.3, true); sound.play('warn'); break;
      case 'boss': fx.toast(`Boss：${e.s ?? ''}`, C.pink, 2, true); fx.shake = 5; sound.play('boss'); break;
      case 'waveStart':
        if ((e.n ?? 1) > 1) { fx.say(`第 ${e.n} 波`, C.white, 1.3, BOSS_WAVES.includes(e.n ?? 0) ? 'Boss 出没' : ''); sound.play('wave'); }
        break;
      case 'million':
        fx.toast('百万UP主！粉丝突破 100 万', C.yellow, 2.6, true);
        fx.flash = 0.5;
        fx.flashColor = C.yellow;
        fx.burst(W / 2, H * 0.3, C.yellow, 60, 140);
        sound.play('million');
        break;
      case 'slamWarn': sound.play('warn'); break;
      case 'slam': fx.shake = Math.max(fx.shake, 7); fx.ring(x, y, 60, C.red, 0.3); fx.burst(x, y, C.red, 14, 90); sound.play('blast'); break;
      case 'bossDown':
        bossDown = e;
        fx.flash = 0.35;
        fx.flashColor = C.white;
        fx.shake = 9;
        fx.ring(x, y, 90, C.white, 0.4);
        fx.ring(x, y, 50, C.pink, 0.3);
        fx.burst(x, y, C.pink, 30, 120);
        sound.play('bossdown');
        if ((app.run?.wave ?? 0) < WAVES) fx.toast(`Boss「${e.s ?? ''}」击破`, C.pink, 1.6, true);
        break;
      case 'over':
        if (e.b && bossDown) {
          app.finale = { t: 0, x: bossDown.x ?? W / 2, y: bossDown.y ?? 80, name: bossDown.s ?? '', next: 0, blown: false };
          app.endTimer = FINALE_LEN;
          break;
        }
        app.endTimer = 1.5;
        if (e.b) { fx.say('完播！', C.green, 1.5); sound.play('win'); } else { fx.say('直播翻车', C.red, 1.5); sound.play('over'); }
        break;
    }
  }
  events.length = 0;
}

// ------------------------------------------------------------------ frame

function update(dt: number): void {
  app.time += dt;
  const run = app.run;
  if (app.scene !== 'game' || !run) return;
  if (!app.paused) {
    if (run.phase === 'play') {
      app.acc = Math.min(app.acc + dt * devSpeed, 0.1 * devSpeed);
      while (app.acc >= STEP && run.phase === 'play') {
        const [mx, my] = devBot ? botMove(run) : input.move();
        stepRun(run, STEP, mx, my);
        app.acc -= STEP;
      }
    }
    // The final blow lands in slow motion.
    fx.update(app.finale && app.finale.t < 0.45 ? dt * 0.3 : dt);
  }
  handleEvents(run.events);
  if (!app.paused) updateFinale(dt);
  if (app.endTimer > 0 && (app.endTimer -= dt) <= 0) finishRun();
}

function render(dt: number): void {
  gfx.begin(C.bg);
  ui.begin();
  ui.hover = input.hover;
  const run = app.run;
  switch (app.scene) {
    case 'loading':
      break;
    case 'title':
      drawTitle(gfx, ui, {
        dt, time: app.time, best: app.save.best, charIdx: app.save.char, unlocked: unlocked(),
        musicOn: app.save.music, challenge: app.challenge, hasRank: platform.hasRank,
        inBili: platform.hasSocial, author: platform.author.nickname, canFollow: followTarget(),
        perkPanel: !!config.videoBvid, perks: perks(), canTriple: platform.canNavigate,
        canRefresh: performance.now() - app.socialAt > 5000,
        insight: insightLeft(), techReady: techReady(), onTech: openTech,
        onChar: d => { app.save.char = (app.save.char + d + CHARS.length) % CHARS.length; sound.play('ui'); persist(false); },
        onStart: () => { sound.play('choose'); startRun(); },
        onRank: openRank,
        onMusic: toggleMusic,
        followed: following(), social: socialLabel(),
        onFollow: goAuthor,
        onTriple: goAuthor,
        onRefresh: () => { sound.play('ui'); syncSocial(); },
      });
      break;
    case 'game':
      if (!run) break;
      drawGame(gfx, ui, run, fx, input, {
        time: app.time, gold: app.save.best >= MILLION, cheer: finaleCheer(), hint: !app.save.seenHint, desktop: input.desktop, onPause: togglePause,
        onUlt: () => { if (run.phase === 'play' && !app.paused && !useUlt(run)) sound.play('deny'); },
      });
      if (app.finale) drawFinaleBoss(app.finale);
      if (app.endTimer > 0) {
        // Once the boss has blown up a tap goes straight to the result.
        if (app.finale && app.finale.t > FINALE_BLOW + 0.9) ui.zone(0, 0, W, H, () => { app.endTimer = 0.01; });
        break;
      }
      if (run.phase === 'levelup') {
        drawLevelUp(gfx, ui, run, i => { chooseUpgrade(run, i); ui.lock(run.phase === 'play' ? 0 : 300); }, input.desktop, app.time,
          () => { if (rerollChoices(run)) ui.lock(300); });
      }
      else if (run.phase === 'shop') {
        drawShop(gfx, ui, run, {
          buy: i => { if (!buyRelic(run, i)) sound.play('deny'); },
          reroll: () => { if (!rerollShop(run)) sound.play('deny'); },
          next: () => { leaveShop(run); input.clear(); },
        });
      } else if (app.paused) {
        drawPause(gfx, ui, run, {
          resume: togglePause,
          music: toggleMusic,
          sfx: () => { app.save.sfx = !app.save.sfx; applySound(); persist(false); },
          quit: toTitle,
          musicOn: app.save.music, sfxOn: app.save.sfx,
        });
      }
      break;
    case 'result': {
      const r = app.result;
      if (!r) break;
      drawResult(gfx, ui, {
        ...r, best: app.save.best, shareMode: platform.shareMode, hasRank: platform.hasRank, dt, time: app.time,
        insLeft: insightLeft(), techReady: techReady(), onTech: openTech,
        onAgain: () => { sound.play('choose'); startRun(); },
        onRank: openRank, onShare: share, onTitle: toTitle, social: socialLabel(), onSocial: goAuthor,
      });
      break;
    }
    case 'tech':
      drawTech(gfx, ui, {
        time: app.time, earned: app.save.ins, levels: techLevels(), sel: app.techSel,
        onSelect: i => { if (i !== app.techSel) { app.techSel = i; sound.play('ui'); } },
        onBuy: buyTechNode,
        onBack: closeTech,
      });
      break;
    case 'rank':
      drawRank(gfx, ui, {
        board: rank.board, period: rank.period, loading: rank.loading, failed: rank.failed, list: rank.list, mine: rank.mine,
        canRefresh: !rank.loading && performance.now() - rank.lastRefresh > 5000,
        onBoard: b => { if (b !== rank.board) { rank.board = b; loadRank(false); } },
        onPeriod: p => { if (p !== rank.period) { rank.period = p; loadRank(false); } },
        onRefresh: () => { rank.lastRefresh = performance.now(); loadRank(true); },
        onBack: () => { app.scene = app.rankFrom === 'result' && app.result ? 'result' : 'title'; ui.lock(250); },
      });
      break;
  }
  // Keyboard players: say so when the keys are going somewhere else (the page around the game has focus).
  if (input.desktop && app.scene !== 'loading' && !input.focused) {
    gfx.alpha(0.85);
    gfx.rect(0, 0, W, 16, C.black);
    gfx.alpha(1);
    gfx.text('点一下游戏画面，键盘才能操作', W / 2, 2, Math.floor(app.time * 3) % 2 ? C.yellow : C.white, { align: 'c', shadow: null });
  }
  // PC layout: panels beside the play column (drawn last so they cover anything that spilled).
  if (app.scene !== 'loading') drawSides(gfx, ui, { run: app.scene === 'game' ? run : null, rank: app.sideRank });
  gfx.present();
  canvas.style.cursor = ui.hot ? 'pointer' : 'default';
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  update(dt);
  render(dt);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ boot

input.onPress = (x, y) => ui.press(x, y);
input.onKey = code => {
  if (ui.key(code)) return;
  if (code === 'Escape' || code === 'KeyP') togglePause();
  else if (code === 'KeyM') toggleMusic();
  else if (code === 'KeyF') toggleFullscreen();
};
input.onFirstGesture = () => sound.unlock();

window.addEventListener('resize', () => gfx.resize());
window.addEventListener('orientationchange', () => gfx.resize());
document.addEventListener('fullscreenchange', () => gfx.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    sound.suspend();
    if (app.scene === 'game' && app.run?.phase === 'play' && app.endTimer <= 0) app.paused = true;
    input.clear();
  } else {
    sound.resume();
    if (app.socialDirty) syncSocial();
  }
});
// Keyboard focus left the game (a click on the page around it): hold the run rather than let it play on unattended.
window.addEventListener('blur', () => {
  if (input.desktop && app.scene === 'game' && app.run?.phase === 'play' && app.endTimer <= 0) app.paused = true;
});
// On PC the video opens in another tab, so coming back is a focus change rather than a visibility one.
window.addEventListener('focus', () => { if (app.socialDirty) syncSocial(); });

async function boot(): Promise<void> {
  requestAnimationFrame(frame);
  if (import.meta.env.DEV) {
    const mock = params.get('mocktoy');
    if (mock) {
      (await import('./platform/mockToy')).installMockToy(mock);
      if (!config.videoBvid) config.videoBvid = 'BV1mock00000';
    }
    Object.assign(window, { __app: app, __dev: { chooseUpgrade, buyRelic, leaveShop, rerollShop, useUlt, platform, config, finishRun } });
  }
  try {
    await Promise.race([document.fonts.load('12px FusionPixel', '百万弹幕Aa1'), new Promise(r => setTimeout(r, 4000))]);
  } catch { /* fall back to system fonts */ }
  resetGlyphs();
  buildSprites();
  app.save = platform.loadLocal();
  if (app.save.char >= CHARS.length || !unlocked()[app.save.char]) app.save.char = 0;
  applySound();
  // Platform calls never block the title screen: outside B站 they can take seconds to give up.
  void platform.init().then(() => {
    // The side list is only visible in the PC layout; don't spend a request on it otherwise.
    if (platform.hasRank && gfx.side) void platform.rank(1, 'week').then(d => { if (d) app.sideRank = d.list; });
  });
  void platform.loadAuthor();
  syncSocial();
  void platform.loadCloud(app.save).then(cloud => {
    if (!cloud) return;
    // Progress only ever goes up; keep whatever the player changed while we were waiting.
    app.save.best = Math.max(app.save.best, cloud.best);
    app.save.bestFast = Math.max(app.save.bestFast, cloud.bestFast);
    app.save.runs = Math.max(app.save.runs, cloud.runs);
    app.save.seenHint = app.save.seenHint || cloud.seenHint;
    app.save.ins = Math.max(app.save.ins, cloud.ins);
    app.save.tech = encodeTech(mergeTech(techLevels(), decodeTech(cloud.tech)));
    persist(false);
  });
  void platform.watchContainer(s => {
    if (s.safeArea) gfx.inset = { ...s.safeArea };
    gfx.resize();
  });
  gfx.resize();
  app.scene = 'title';
  input.takeFocus();
}

void boot();
