/**
 * One run of the game. Pure logic: no DOM, no timers, seeded RNG only, so vitest and the
 * headless simulator can play whole runs. The front end reads state and drains `run.events`.
 */
import { Rng } from '../engine/rng';
import { BIG_TEXT, BOSS_NAME, FIXED_TEXT, SCROLL_TEXT, SPAM_TEXT } from '../data/danmaku';
import {
  H, LANES, LANE_H, LANE_TOP, MAX_LEVEL, MAX_PASSIVES, MAX_WEAPONS, MILLION, TOTAL_TIME, W, WAVES,
  laneY, textWidth, waveCfg, waveClearCoins, waveDuration, xpForLevel, type WaveCfg,
} from './balance';
import { CHARS, type CharDef } from './chars';
import { PASSIVES, PASSIVE_BY_ID, type PassiveId } from './passives';
import { NO_PERKS, PERK_COIN_COINS, PERK_FAV_REROLLS, PERK_LIKE_HP, PERK_TRIPLE_MULT, isTriple, type Perks } from './perks';
import { RELICS, RELIC_BY_ID, relicPrice, type RelicId } from './relics';
import { fanGain, multiplier, type ScoreCtx, type Tier } from './scoring';
import { NO_TECH, type TechFx } from './tech';
import { RECIPES, WEAPONS, WEAPON_BY_ID, maxLevel, partnerOf, recipeHint, recipeOf, weaponLevelText, weaponStats, type WeaponId, type WeaponStats } from './weapons';

export type Phase = 'play' | 'levelup' | 'shop' | 'over';
export type EnemyKind = 'scroll' | 'color' | 'reverse' | 'wall' | 'fixed' | 'big' | 'boss';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  vx: number;
  hp: number;
  maxHp: number;
  base: number;
  tier: Tier;
  xp: number;
  coins: number;
  color: string;
  /** Seconds alive. */
  t: number;
  /** Remaining lifetime for pinned danmaku. */
  life: number;
  shootCd: number;
  flash: number;
  starCd: number;
  /** Seconds until this danmaku can be grazed again. */
  grazeCd: number;
  /** Seconds left of the strike-through shown when 关键词 names it. */
  mark: number;
  /** Seconds of slow remaining, and the speed factor while slowed. */
  slow: number;
  slowK: number;
  dead: boolean;
  boss: 0 | 1 | 2;
  atk: number;
  angle: number;
}

export interface Bullet { x: number; y: number; vx: number; vy: number; life: number; grazed: boolean }

/** 粉丝弹幕: a defeated danmaku that changed sides. It flies back along its row, ramming enemies and soaking bullets. */
export interface Ally { text: string; x: number; y: number; w: number; h: number; scale: number; vx: number; dmg: number; hits: number; hit: number[] }

/** 置顶牌: a block standing in a row. Danmaku cannot scroll past it. */
export interface Pin { x: number; y: number; w: number; h: number; life: number; max: number; tick: number; pulse: number }

export interface Shot {
  kind: 'like' | 'triple' | 'share' | 'coin' | 'storm' | 'drone' | 'rewind' | 'glyph' | 'dart';
  /** The character a 'glyph' shot is drawn as. */
  ch?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  pierce: number;
  bounces: number;
  life: number;
  hit: number[];
  dead: boolean;
  /** Lobbed coin: start, target, progress. */
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  radius: number;
}

export interface Orb { kind: 'xp' | 'coin' | 'heart'; x: number; y: number; v: number; pull: boolean }

export interface GameEvent { t: string; x?: number; y?: number; n?: number; s?: string; b?: boolean }

export interface Choice {
  /** 'fusion' merges two owned weapons into `id`. */
  type: 'weapon' | 'passive' | 'bonus' | 'fusion';
  id: string;
  lvl: number;
  name: string;
  glyph: string;
  color: string;
  desc: string;
  /** Extra line, e.g. the fusion recipe this weapon belongs to. */
  hint?: string;
}

export interface OwnedWeapon { id: WeaponId; lvl: number; cd: number; cd2: number }

export interface Offer { id: RelicId; price: number }

export interface Stats {
  speed: number;
  magnet: number;
  cdMul: number;
  dmgMul: number;
  crit: number;
  xpMul: number;
  maxHp: number;
  addBase: number;
  addMult: number;
  mulMult: number;
  comboCap: number;
  eliteBonus: number;
  eliteMul: number;
  enemySpeed: number;
}

export interface Run {
  seed: number;
  rng: Rng;
  char: CharDef;
  /** 三连福利 active for this run. */
  perks: Perks;
  phase: Phase;
  win: boolean;
  /** Seconds of play time elapsed (pauses during level-up and shop). */
  time: number;
  wave: number;
  waveT: number;
  cfg: WaveCfg;
  player: { x: number; y: number; hp: number; iframes: number; face: number; moving: boolean };
  stats: Stats;
  enemies: Enemy[];
  bullets: Bullet[];
  shots: Shot[];
  allies: Ally[];
  pins: Pin[];
  orbs: Orb[];
  events: GameEvent[];
  fans: number;
  coins: number;
  xp: number;
  level: number;
  xpNext: number;
  pendingLevels: number;
  weapons: OwnedWeapon[];
  /** Character ultimate: charged by kills, fired by the player. */
  ult: { energy: number; need: number; uses: number };
  /** Seconds remaining on timed effects from ultimates. */
  buff: { haste: number; fans: number; freeze: number };
  /** 科技树 bonuses in force for this run. */
  tech: TechFx;
  /** 「换一批」 uses left at level-up. */
  lvRerolls: number;
  grazes: number;
  /** Kills counted towards the next 鬼畜 burst. */
  remixN: number;
  /** 憋大招 charge, in stages (fractional while charging). */
  hold: number;
  /** The character(s) 关键词 last named, and how long to keep showing them. */
  keyword: { s: string; t: number };
  bossKills: number;
  passives: Partial<Record<PassiveId, number>>;
  relics: Partial<Record<RelicId, number>>;
  combo: number;
  comboTimer: number;
  maxCombo: number;
  kills: number;
  hurtCount: number;
  dailyBonus: number;
  levelBonus: number;
  choices: Choice[] | null;
  shop: (Offer | null)[] | null;
  rerollCost: number;
  freeRerolls: number;
  /** Seconds that were left on the clock when 1,000,000 fans was reached; null if not reached. */
  millionAt: number | null;
  nextId: number;
  spawnCd: number;
  bigCd: number;
  fixedCd: number;
  spamIdx: number;
  wallTimer: number;
  /** First lane of the safe gap for the announced wall. */
  wallGap: number;
  bossSpawned: boolean;
  bossKilled: boolean;
  waveDone: boolean;
  laneBusy: number[];
}

const COLORS = ['#ffd24a', '#5fe08a', '#00aeec', '#fb7299', '#b48cff'] as const;
export const WALL_GAP = 5;
const MAX_BULLETS = 140;
const MAX_ORBS = 160;
const ULT_NEED = 40;
/** How close (px) the player must pass to a danmaku or bullet, without being hit, for a graze. */
export const GRAZE_R = 5;
const MAX_ALLIES = 14;

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const count = <K extends string>(m: Partial<Record<K, number>>, k: K): number => m[k] ?? 0;

export function createRun(seed: number, charIdx = 0, perks: Perks = NO_PERKS, tech: TechFx = NO_TECH): Run {
  const ch = CHARS[charIdx] ?? CHARS[0];
  const run: Run = {
    seed, rng: new Rng(seed), char: ch, perks: { ...perks }, phase: 'play', win: false,
    time: 0, wave: 1, waveT: 0, cfg: waveCfg(1),
    player: { x: W / 2, y: H * 0.62, hp: ch.hp, iframes: 0, face: 1, moving: false },
    stats: {
      speed: 70, magnet: 22, cdMul: 1, dmgMul: 1, crit: 0, xpMul: 1, maxHp: ch.hp,
      addBase: 0, addMult: 0, mulMult: 1, comboCap: 1, eliteBonus: 0, eliteMul: 1, enemySpeed: 1,
    },
    enemies: [], bullets: [], shots: [], allies: [], pins: [], orbs: [], events: [],
    fans: 0, coins: ch.coins + tech.coins + (perks.coin ? PERK_COIN_COINS : 0), xp: 0, level: 1, xpNext: xpForLevel(1), pendingLevels: 0,
    weapons: [ch.weapon, ...(ch.weapon2 ? [ch.weapon2] : [])].map((id, i) => ({ id, lvl: 1, cd: 0.6 + i * 0.2, cd2: 0.8 })), passives: {}, relics: {},
    ult: { energy: tech.ultStart ? ULT_NEED : 0, need: ULT_NEED, uses: 0 }, buff: { haste: 0, fans: 0, freeze: 0 },
    tech, lvRerolls: tech.lvRerolls, grazes: 0, remixN: 0, hold: 0, keyword: { s: '', t: 0 }, bossKills: 0,
    combo: 0, comboTimer: 0, maxCombo: 0, kills: 0, hurtCount: 0, dailyBonus: 0, levelBonus: 0,
    choices: null, shop: null, rerollCost: 3, freeRerolls: 0, millionAt: null, nextId: 1,
    spawnCd: 1, bigCd: 0, fixedCd: 0, spamIdx: 0, wallTimer: 0, wallGap: 0,
    bossSpawned: false, bossKilled: false, waveDone: false, laneBusy: new Array<number>(LANES).fill(0),
  };
  recalc(run);
  run.player.hp = run.stats.maxHp;
  startWave(run);
  return run;
}

export function relicCount(run: Run): number {
  let n = 0;
  for (const k in run.relics) n += run.relics[k as RelicId] ?? 0;
  return n;
}

/** Recompute everything derived from passives, relics and the character. */
export function recalc(run: Run): void {
  const p = (id: PassiveId): number => count(run.passives, id);
  const r = (id: RelicId): number => count(run.relics, id);
  const s = run.stats;
  const ch = run.char;
  const t = run.tech;
  s.speed = 70 * (1 + 0.08 * p('speed')) * ch.speed * t.speed;
  s.magnet = 22 * (1 + 0.3 * p('magnet')) * ch.magnet * t.magnet;
  s.cdMul = Math.pow(0.92, p('haste')) * t.haste;
  s.dmgMul = (1 + 0.15 * p('power')) * ch.dmg * t.dmg;
  s.crit = 0.08 * p('crit') + t.crit;
  s.xpMul = 1 + 0.15 * p('xp') + 0.3 * r('monitor');
  s.maxHp = r('allin') ? 1 : ch.hp + p('hp') + r('drumstick') + t.hp + (run.perks.like ? PERK_LIKE_HP : 0);
  s.addBase = 2 * r('title') + 5 * r('cover') + t.addBase;
  s.eliteBonus = 15 * r('trend');
  s.addMult = ch.addMult + t.addMult + (isTriple(run.perks) ? PERK_TRIPLE_MULT : 0) + 0.5 * r('manners') + r('comment') + run.dailyBonus + run.levelBonus
    + (r('badge') ? 0.2 * relicCount(run) : 0);
  s.mulMult = Math.pow(1.5, r('hot')) * Math.pow(2, r('ranking')) * Math.pow(3, r('allin')) * Math.pow(1.8, r('fast'));
  s.comboCap = r('comboMaster') ? 2 : 1;
  s.eliteMul = r('retention') ? 3 : 1;
  s.enemySpeed = 1 + 0.2 * r('fast');
  if (run.player.hp > s.maxHp) run.player.hp = s.maxHp;
}

/** Score context at this instant, including the conditional relics. */
export function scoreCtx(run: Run): ScoreCtx {
  const s = run.stats;
  let addMult = s.addMult;
  let mulMult = s.mulMult;
  if (count(run.relics, 'savings')) addMult += Math.min(3, Math.floor(run.coins / 10) * 0.1);
  if (count(run.relics, 'top100') && run.player.hp >= s.maxHp) mulMult *= 1.6;
  if (count(run.relics, 'infamy')) mulMult *= Math.pow(1.25, Math.min(6, run.hurtCount));
  return { addBase: s.addBase, addMult, mulMult, combo: run.combo, comboCap: s.comboCap, eliteBonus: s.eliteBonus, eliteMul: s.eliteMul };
}

export const currentMultiplier = (run: Run): number => multiplier(scoreCtx(run));
export const timeLeft = (run: Run): number => Math.max(0, TOTAL_TIME - run.time);

function startWave(run: Run): void {
  run.cfg = waveCfg(run.wave);
  run.waveT = 0;
  run.spawnCd = 1;
  run.bigCd = run.cfg.bigEvery * 0.6;
  run.fixedCd = run.cfg.fixedEvery * 0.5;
  run.spamIdx = 0;
  run.wallTimer = 0;
  run.bossSpawned = false;
  run.bossKilled = false;
  run.waveDone = false;
  run.laneBusy.fill(0);
  run.choices = null;
  run.shop = null;
  run.phase = 'play';
  run.player.iframes = Math.max(run.player.iframes, 1);
  run.events.push({ t: 'waveStart', n: run.wave });
}

// ---------------------------------------------------------------- geometry

export function distToBox(px: number, py: number, e: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(e.x - px, 0, px - (e.x + e.w));
  const dy = Math.max(e.y - py, 0, py - (e.y + e.h));
  return Math.hypot(dx, dy);
}

const onScreen = (e: Enemy): boolean => e.x < W - 1 && e.x + e.w > 1;

function nearest(run: Run, x: number, y: number, exclude?: number[], maxD = Infinity): Enemy | null {
  let best: Enemy | null = null;
  let bd = maxD;
  for (const e of run.enemies) {
    if (e.dead || !onScreen(e) || (exclude && exclude.includes(e.id))) continue;
    const d = distToBox(x, y, e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function aimAt(e: Enemy, x: number, y: number): [number, number] {
  const x0 = Math.max(e.x + 2, 2), x1 = Math.min(e.x + e.w - 2, W - 2);
  return [clamp(x, Math.min(x0, x1), Math.max(x0, x1)), clamp(y, e.y + 3, e.y + e.h - 3)];
}

// ---------------------------------------------------------------- spawning

function mk(run: Run, kind: EnemyKind, text: string, x: number, y: number, scale: number, vx: number, hp: number, base: number, o: Partial<Enemy> = {}): Enemy {
  const e: Enemy = {
    id: run.nextId++, kind, text, x, y, w: textWidth(text, scale), h: 12 * scale, scale, vx,
    hp, maxHp: hp, base, tier: 0, xp: 1, coins: 0, color: '#ffffff',
    t: 0, life: 0, shootCd: 0, flash: 0, starCd: 0, grazeCd: 0, mark: 0, slow: 0, slowK: 1, dead: false, boss: 0, atk: 0, angle: 0, ...o,
  };
  run.enemies.push(e);
  return e;
}

function freeLane(run: Run, span: number): number {
  const free: number[] = [];
  for (let i = 0; i + span <= LANES; i++) {
    let ok = true;
    for (let k = 0; k < span; k++) if (run.laneBusy[i + k] > run.time) ok = false;
    if (ok) free.push(i);
  }
  return free.length ? run.rng.pick(free) : run.rng.int(LANES - span + 1);
}

function spawnScroll(run: Run): void {
  const c = run.cfg, r = run.rng;
  const roll = r.next();
  const kind: EnemyKind = roll < c.pColor ? 'color' : roll < c.pColor + c.pReverse ? 'reverse' : 'scroll';
  const text = r.pick(SCROLL_TEXT);
  const w = textWidth(text);
  const lane = freeLane(run, 1);
  const sp = c.speed * r.range(0.75, 1.3) * (kind === 'color' ? 1.45 : 1);
  if (kind === 'reverse') {
    mk(run, kind, text, -w - 2, laneY(lane), 1, sp, c.hp * 1.2, c.base * 2, { xp: 2, color: '#7fd4ff' });
  } else if (kind === 'color') {
    mk(run, kind, text, W + 2, laneY(lane), 1, -sp, c.hp * 1.6, c.base * 3, { xp: 2, tier: 1, color: r.pick(COLORS), coins: r.chance(0.4) ? 1 : 0 });
  } else {
    mk(run, kind, text, W + 2, laneY(lane), 1, -sp, c.hp, c.base);
  }
  run.laneBusy[lane] = run.time + (w + 14) / sp;
}

function spawnBig(run: Run): void {
  const c = run.cfg, r = run.rng;
  const text = r.pick(BIG_TEXT);
  const lane = freeLane(run, 2);
  const sp = c.speed * 0.55;
  const e = mk(run, 'big', text, W + 2, laneY(lane) + 1, 2, -sp, c.hp * 7, c.base * 10, { xp: 6, tier: 2, coins: 4, color: '#ff8a5c' });
  run.laneBusy[lane] = run.laneBusy[lane + 1] = run.time + (e.w + 14) / sp;
}

function spawnFixed(run: Run): void {
  const c = run.cfg, r = run.rng;
  const text = r.pick(FIXED_TEXT);
  const w = textWidth(text);
  const lane = r.chance(0.5) ? r.int(3) : LANES - 1 - r.int(3);
  const x = clamp((W - w) / 2 + r.range(-24, 24), 2, W - w - 2);
  mk(run, 'fixed', text, x, laneY(lane), 1, 0, c.hp * 3, c.base * 4, { xp: 3, tier: 1, life: 6.5, shootCd: 1.6, color: '#ffd24a' });
}

function announceWall(run: Run): void {
  if (run.wallTimer > 0) return;
  // Keep the safe gap within reach of where the player is standing.
  const lane = Math.round((run.player.y - LANE_TOP) / 14) + run.rng.int(9) - 4 - Math.floor(WALL_GAP / 2);
  run.wallGap = clamp(lane, 0, LANES - WALL_GAP);
  run.wallTimer = 1.3;
  run.events.push({ t: 'warn', s: '刷屏来袭' });
}

function spawnWall(run: Run): void {
  const c = run.cfg, r = run.rng;
  const text = r.pick(SPAM_TEXT);
  const sp = 78 + 2 * run.wave;
  for (let i = 0; i < LANES; i++) {
    if (i >= run.wallGap && i < run.wallGap + WALL_GAP) continue;
    mk(run, 'wall', text, W + 2 + r.range(0, 8), laneY(i), 1, -sp, c.hp * 0.6, c.base, { xp: r.chance(0.4) ? 1 : 0, color: '#ff9ec0' });
  }
}

function spawnBoss(run: Run): void {
  const c = run.cfg;
  const which = c.boss as 1 | 2;
  const text = BOSS_NAME[which];
  const w = textWidth(text, 3);
  mk(run, 'boss', text, (W - w) / 2, LANE_TOP + 8, 3, 0, c.hp * (which === 1 ? 45 : 70), c.base * 150, {
    xp: 30, tier: 2, coins: 20, color: '#fb7299', boss: which, atk: 3,
  });
  run.bossSpawned = true;
  run.events.push({ t: 'boss', s: text });
}

function director(run: Run, dt: number): void {
  const c = run.cfg;
  run.spawnCd -= dt;
  if (run.spawnCd <= 0) {
    run.spawnCd += c.interval * (c.boss ? 1.5 : 1) * run.rng.range(0.7, 1.3);
    spawnScroll(run);
  }
  if (c.bigEvery) {
    run.bigCd -= dt;
    if (run.bigCd <= 0) { run.bigCd += c.bigEvery; spawnBig(run); }
  }
  if (c.fixedEvery) {
    run.fixedCd -= dt;
    if (run.fixedCd <= 0) { run.fixedCd += c.fixedEvery; spawnFixed(run); }
  }
  if (run.spamIdx < c.spamAt.length && run.waveT >= c.spamAt[run.spamIdx]) {
    run.spamIdx++;
    announceWall(run);
  }
  if (run.wallTimer > 0) {
    run.wallTimer -= dt;
    if (run.wallTimer <= 0) spawnWall(run);
  }
  if (c.boss && !run.bossSpawned && run.waveT >= 2) spawnBoss(run);
}

function shootBullet(run: Run, x: number, y: number, angle: number, speed: number): void {
  if (run.bullets.length >= MAX_BULLETS) return;
  run.bullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 7, grazed: false });
}

function shootFan(run: Run, x: number, y: number, n: number, spread: number, speed: number): void {
  const a = Math.atan2(run.player.y - y, run.player.x - x);
  for (let i = 0; i < n; i++) shootBullet(run, x, y, a + (i - (n - 1) / 2) * spread, speed);
}

function updateEnemies(run: Run, dt: number): void {
  const sp = run.stats.enemySpeed;
  const frozen = run.buff.freeze > 0;
  for (const e of run.enemies) {
    if (e.dead) continue;
    if (e.flash > 0) e.flash -= dt;
    if (e.starCd > 0) e.starCd -= dt;
    if (e.grazeCd > 0) e.grazeCd -= dt;
    if (e.mark > 0) e.mark -= dt;
    if (e.slow > 0) e.slow -= dt;
    if (frozen) continue; // 上热搜: nothing moves, shoots or expires
    e.t += dt;
    if (e.kind === 'fixed') {
      e.life -= dt;
      e.shootCd -= dt;
      if (e.shootCd <= 0) {
        e.shootCd = 1.5;
        shootFan(run, e.x + e.w / 2, e.y + 6, 1, 0, 46 + 2 * run.wave);
      }
      if (e.life <= 0) e.dead = true;
    } else if (e.kind === 'boss') {
      e.x = (W - e.w) / 2 + Math.sin(e.t * 0.7) * 28;
      const cx = e.x + e.w / 2, cy = e.y + e.h;
      e.atk -= dt;
      if (e.boss === 1) {
        if (e.atk <= 0) {
          e.atk = 2.8;
          if (e.angle++ % 2 === 0) shootFan(run, cx, cy, 5, 0.3, 55); else announceWall(run);
        }
      } else {
        e.shootCd -= dt;
        if (e.t % 5 < 2.6 && e.shootCd <= 0) {
          e.shootCd = 0.26;
          e.angle += 0.45;
          shootBullet(run, cx, cy, e.angle, 48);
          shootBullet(run, cx, cy, e.angle + Math.PI, 48);
        }
        if (e.atk <= 0) { e.atk = 6.5; announceWall(run); }
      }
    } else {
      e.x += e.vx * sp * (e.slow > 0 ? e.slowK : 1) * dt;
      // 置顶牌: a danmaku whose leading edge has not got past the block is held at it.
      for (const pin of run.pins) {
        if (e.y >= pin.y + pin.h || e.y + e.h <= pin.y || e.x >= pin.x + pin.w || e.x + e.w <= pin.x) continue;
        if (e.vx < 0 && e.x >= pin.x - 3) e.x = pin.x + pin.w;
        else if (e.vx > 0 && e.x + e.w <= pin.x + pin.w + 3) e.x = pin.x - e.w;
      }
      if ((e.vx < 0 && e.x + e.w < -2) || (e.vx > 0 && e.x > W + 2)) e.dead = true;
    }
  }
}

// ---------------------------------------------------------------- combat

function addFans(run: Run, gain: number): void {
  run.fans += gain;
  if (run.millionAt === null && run.fans >= MILLION) {
    run.millionAt = Math.round(timeLeft(run));
    run.events.push({ t: 'million' });
  }
}

function dropOrb(run: Run, kind: Orb['kind'], x: number, y: number, v: number): void {
  if (run.orbs.length >= MAX_ORBS) {
    // Too many on the floor: fold the value into an existing orb of the same kind.
    const o = run.orbs.find(q => q.kind === kind);
    if (o) { o.v += v; return; }
  }
  run.orbs.push({ kind, x: clamp(x, 6, W - 6), y: clamp(y, LANE_TOP + 4, H - 10), v, pull: false });
}

function kill(run: Run, e: Enemy): void {
  e.dead = true;
  run.kills++;
  run.combo++;
  run.comboTimer = 3;
  if (run.combo > run.maxCombo) run.maxCombo = run.combo;
  const cx = clamp(e.x + e.w / 2, 8, W - 8), cy = e.y + e.h / 2;
  const gain = fanGain(e.base, e.tier, scoreCtx(run)) * (run.buff.fans > 0 ? 2 : 1);
  addFans(run, gain);
  run.ult.energy = Math.min(run.ult.need, run.ult.energy + (e.tier === 2 ? 5 : 1));
  run.events.push({ t: 'kill', x: cx, y: cy, n: gain, b: e.tier === 2, s: e.color });
  if (e.xp) dropOrb(run, 'xp', cx + run.rng.range(-4, 4), cy + run.rng.range(-3, 3), e.xp);
  if (e.coins) dropOrb(run, 'coin', cx + run.rng.range(-8, 8), cy + run.rng.range(-4, 4), e.coins);
  if (e.kind === 'big' && run.rng.chance(0.08)) dropOrb(run, 'heart', cx, cy + 6, 1);
  if (e.kind === 'boss') {
    if (e.boss === 1) dropOrb(run, 'heart', cx, cy + 10, 1);
    run.bossKilled = true;
    run.bossKills++;
  }
  // 鬼畜 / 名场面: every few kills the fallen danmaku is cut into its characters.
  const rm = run.weapons.find(w => w.id === 'remix' || w.id === 'scene');
  if (rm) {
    const st = weaponStats(rm.id, rm.lvl);
    if (++run.remixN >= st.count) {
      run.remixN = 0;
      burstGlyphs(run, e, st.dmg * run.stats.dmgMul, st.pierce);
    }
  }
}

/** Fling each character of a danmaku outwards as its own projectile. */
function burstGlyphs(run: Run, e: Enemy, dmg: number, pierce: number): void {
  if (run.shots.length > 110) return;
  const chars = [...e.text].slice(0, 6);
  const cx = clamp(e.x + e.w / 2, 8, W - 8), cy = e.y + e.h / 2;
  const a0 = run.rng.range(0, Math.PI * 2);
  chars.forEach((ch, i) => {
    const s = newShot('glyph', cx, cy, a0 + (i * Math.PI * 2) / chars.length, 150, dmg);
    s.ch = ch;
    s.pierce = pierce;
    s.life = 0.75;
    s.hit.push(e.id);
    run.shots.push(s);
  });
  if (run.events.length < 240) run.events.push({ t: 'remix', x: cx, y: cy });
}

/** Damage that, if it finishes the danmaku off, brings it over as a 粉丝弹幕 (never a boss). */
function convertHit(run: Run, e: Enemy, dmg: number, ramDmg: number, rams: number): void {
  if (e.dead) return;
  damage(run, e, dmg);
  if (!e.dead || e.kind === 'boss' || run.allies.length >= MAX_ALLIES) return;
  const dir = e.vx > 0 ? -1 : e.vx < 0 ? 1 : e.x + e.w / 2 < W / 2 ? 1 : -1;
  run.allies.push({ text: e.text, x: e.x, y: e.y, w: e.w, h: e.h, scale: e.scale, vx: dir * 95, dmg: ramDmg * e.scale, hits: rams, hit: [] });
  if (run.events.length < 240) run.events.push({ t: 'convert', x: clamp(e.x + e.w / 2, 8, W - 8), y: e.y });
}

function damage(run: Run, e: Enemy, dmg: number): void {
  if (e.dead) return;
  const crit = run.stats.crit > 0 && run.rng.chance(run.stats.crit);
  e.hp -= crit ? dmg * 2 : dmg;
  e.flash = 0.1;
  if (run.events.length < 240) run.events.push({ t: 'hit', x: clamp(e.x + e.w / 2, 4, W - 4), y: e.y + e.h / 2, b: crit });
  if (e.hp <= 0) kill(run, e);
}

function areaDamage(run: Run, x: number, y: number, r: number, dmg: number): void {
  for (const e of run.enemies) if (!e.dead && distToBox(x, y, e) <= r) damage(run, e, dmg);
}

function newShot(kind: Shot['kind'], x: number, y: number, angle: number, speed: number, dmg: number): Shot {
  return {
    kind, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg,
    pierce: 0, bounces: 0, life: 1.4, hit: [], dead: false, sx: x, sy: y, tx: x, ty: y, t: 0, dur: 0, radius: 0,
  };
}

/** Where drone `i` of `n` hovers: a slow ellipse around the player. Shared with the renderer. */
export function dronePos(run: Run, i: number, n: number): [number, number] {
  const a = run.time * 1.3 + (i * Math.PI * 2) / n;
  return [clamp(run.player.x + Math.cos(a) * 18, 3, W - 3), run.player.y - 4 + Math.sin(a) * 12];
}

const targets = (run: Run): Enemy[] => run.enemies.filter(e => !e.dead && onScreen(e));

function lobCoin(run: Run, tx: number, ty: number, dmg: number, radius: number, dur = 0.45): void {
  const s = newShot('coin', run.player.x, run.player.y, 0, 0, dmg);
  s.tx = clamp(tx, 4, W - 4);
  s.ty = ty;
  s.dur = dur;
  s.radius = radius;
  run.shots.push(s);
}

function strike(run: Run, e: Enemy, dmg: number, radius: number, boom: boolean): void {
  const cx = clamp(e.x + e.w / 2, 4, W - 4), cy = e.y + e.h / 2;
  if (run.events.length < 240) run.events.push({ t: 'bolt', x: cx, y: cy });
  if (boom && run.events.length < 240) run.events.push({ t: 'boom', x: cx, y: cy, n: radius });
  areaDamage(run, cx, cy, radius, dmg);
}

/** Damage everything touching the horizontal band centred on `y`. */
function beam(run: Run, y: number, half: number, dmg: number): void {
  for (const e of run.enemies) {
    if (!e.dead && onScreen(e) && e.y < y + half && e.y + e.h > y - half) damage(run, e, dmg);
  }
  run.events.push({ t: 'beam', y, n: half });
}

function aura(run: Run, r: number, dmg: number, slow: number): void {
  const p = run.player;
  for (const e of run.enemies) {
    if (e.dead || distToBox(p.x, p.y, e) > r) continue;
    if (slow < 1) { e.slow = 0.7; e.slowK = slow; }
    damage(run, e, dmg);
  }
}

function orbit(run: Run, st: WeaponStats, dmg: number): void {
  const p = run.player;
  for (let i = 0; i < st.count; i++) {
    const a = run.time * 3.2 + (i * Math.PI * 2) / st.count;
    const sx = p.x + Math.cos(a) * st.radius, sy = p.y + Math.sin(a) * st.radius;
    for (const e of run.enemies) {
      if (e.dead || e.starCd > 0 || distToBox(sx, sy, e) > 4) continue;
      e.starCd = st.cd;
      damage(run, e, dmg);
    }
  }
}

function throwRewind(run: Run, x: number, y: number, angle: number, dmg: number): void {
  const s = newShot('rewind', x, y, angle, 190, dmg);
  s.dur = 0.45;
  s.life = 3;
  run.shots.push(s);
}

function fireBounce(run: Run, dmg: number, bounces: number): boolean {
  const p = run.player;
  const target = nearest(run, p.x, p.y);
  if (!target) return false;
  const [tx, ty] = aimAt(target, p.x, p.y);
  const s = newShot('share', p.x, p.y, Math.atan2(ty - p.y, tx - p.x), 200, dmg);
  s.bounces = bounces;
  s.life = 2.5;
  run.shots.push(s);
  return true;
}

/** 关键词: name the character(s) most danmaku on screen share and hit everything containing them. */
function keywordStrike(run: Run, st: WeaponStats, dmg: number, convert: boolean): boolean {
  const pool = targets(run);
  if (!pool.length) return false;
  const freq = new Map<string, number>();
  for (const e of pool) for (const ch of new Set(e.text)) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, st.count).map(q => q[0]);
  for (const e of pool) {
    if (!top.some(ch => e.text.includes(ch))) continue;
    e.mark = 0.6;
    if (st.slow < 1) { e.slow = 1.4; e.slowK = st.slow; }
    if (convert) convertHit(run, e, dmg, st.dmg2 * run.stats.dmgMul, st.pierce); else damage(run, e, dmg);
  }
  run.keyword = { s: top.join(''), t: 1.3 };
  run.events.push({ t: 'keyword', s: run.keyword.s });
  return true;
}

/**
 * 置顶: stand a block in the player's row, just ahead of where they are facing. If that spot is
 * taken it goes behind them, then into the rows above and below; the oldest block makes room.
 */
function placePin(run: Run, st: WeaponStats): void {
  const p = run.player;
  const lane = clamp(Math.round((p.y - 6 - LANE_TOP) / LANE_H), 0, LANES - 1);
  const w = 24;
  const ahead = p.x + p.face * 19 - w / 2, behind = p.x - p.face * 19 - w / 2;
  const spots: [number, number][] = [[ahead, lane], [behind, lane], [ahead, lane - 1], [ahead, lane + 1], [behind, lane - 1], [behind, lane + 1]];
  const taken = (x: number, y: number): boolean => run.pins.some(q => q.y === y && x < q.x + q.w && x + w > q.x);
  let x = clamp(ahead, 2, W - w - 2), y = laneY(lane);
  for (const [sx, sl] of spots) {
    if (sl < 0 || sl >= LANES) continue;
    const cx = clamp(sx, 2, W - w - 2);
    if (!taken(cx, laneY(sl))) { x = cx; y = laneY(sl); break; }
  }
  while (run.pins.length >= st.count) run.pins.shift();
  run.pins.push({ x, y, w, h: 12, life: st.dur, max: st.dur, tick: 0, pulse: st.cd2 });
  run.events.push({ t: 'pin', x: x + w / 2, y: y + 6 });
}

function updatePins(run: Run, dt: number): void {
  if (!run.pins.length) return;
  const w = run.weapons.find(q => q.id === 'pin' || q.id === 'anchor');
  const st = w ? weaponStats(w.id, w.lvl) : null;
  const dm = run.stats.dmgMul;
  for (const pin of run.pins) {
    pin.life -= dt;
    for (const b of run.bullets) if (b.x > pin.x - 2 && b.x < pin.x + pin.w + 2 && b.y > pin.y - 2 && b.y < pin.y + pin.h + 2) b.life = 0;
    if (!st) continue;
    if ((pin.tick -= dt) <= 0) {
      pin.tick = 0.4;
      for (const e of run.enemies) {
        if (!e.dead && e.x < pin.x + pin.w + 2 && e.x + e.w > pin.x - 2 && e.y < pin.y + pin.h && e.y + e.h > pin.y) damage(run, e, st.dmg * dm);
      }
    }
    if (st.cd2 > 0 && (pin.pulse -= dt) <= 0) {
      pin.pulse = st.cd2;
      const cx = pin.x + pin.w / 2, cy = pin.y + pin.h / 2;
      areaDamage(run, cx, cy, st.radius, st.dmg2 * dm);
      if (run.events.length < 240) run.events.push({ t: 'blast', x: cx, y: cy, n: st.radius });
    }
  }
  run.pins = run.pins.filter(q => q.life > 0);
}

function updateAllies(run: Run, dt: number): void {
  if (!run.allies.length) return;
  for (const a of run.allies) {
    a.x += a.vx * dt;
    if (a.x > W + 4 || a.x + a.w < -4) { a.hits = 0; continue; }
    for (const b of run.bullets) if (b.x > a.x && b.x < a.x + a.w && b.y > a.y && b.y < a.y + a.h) b.life = 0;
    for (const e of run.enemies) {
      if (e.dead || a.hit.includes(e.id) || e.x >= a.x + a.w || e.x + e.w <= a.x || e.y >= a.y + a.h || e.y + e.h <= a.y) continue;
      a.hit.push(e.id);
      damage(run, e, a.dmg);
      if (--a.hits <= 0) {
        if (run.events.length < 240) run.events.push({ t: 'pop', x: clamp(a.x + a.w / 2, 4, W - 4), y: a.y + a.h / 2, s: '#7dffb0' });
        break;
      }
    }
  }
  run.allies = run.allies.filter(a => a.hits > 0);
}

/** 憋大招: let go of whatever has been charged. */
function releaseHold(run: Run, st: WeaponStats): void {
  const stage = Math.floor(run.hold + 1e-6);
  run.hold = 0;
  if (stage < 1) return;
  const p = run.player;
  const full = stage >= st.count;
  const radius = st.radius + 9 * stage;
  areaDamage(run, p.x, p.y, radius, st.dmg * stage * (full ? 1.5 : 1) * run.stats.dmgMul);
  run.events.push({ t: 'blast', x: p.x, y: p.y, n: radius, b: full });
}

/** The player skimmed past `e` (or a bullet, when `e` is null) without being hit. */
function graze(run: Run, e: Enemy | null, x: number, y: number): void {
  const p = run.player;
  run.grazes++;
  run.ult.energy = Math.min(run.ult.need, run.ult.energy + 0.5 * run.tech.grazeEnergy);
  if (run.combo > 0) run.comboTimer = 3;
  if (run.events.length < 240) run.events.push({ t: 'graze', x: p.x, y: p.y });
  const dm = run.stats.dmgMul;
  for (const w of run.weapons) {
    if (w.id === 'graze') {
      const st = weaponStats(w.id, w.lvl);
      const used: number[] = [];
      for (let i = 0; i < st.count; i++) {
        const t = (i === 0 && e && !e.dead ? e : null) ?? nearest(run, p.x, p.y, used);
        if (!t) break;
        used.push(t.id);
        const [tx, ty] = aimAt(t, p.x, p.y);
        const s = newShot('dart', p.x, p.y, Math.atan2(ty - p.y, tx - p.x), 260, st.dmg * dm);
        s.pierce = 1;
        run.shots.push(s);
      }
    } else if (w.id === 'scene') {
      const st = weaponStats(w.id, w.lvl);
      const t = e && !e.dead ? e : nearest(run, x, y);
      if (t) { damage(run, t, st.dmg * dm); burstGlyphs(run, t, st.dmg * dm, st.pierce); }
    }
  }
}

function fire(run: Run, w: OwnedWeapon, st: WeaponStats, dmg: number): boolean {
  const p = run.player;
  if (w.id === 'charge' || w.id === 'thunder') {
    const pool = targets(run);
    if (!pool.length) return false;
    for (let i = 0; i < st.count; i++) strike(run, run.rng.pick(pool), dmg, st.radius, w.id === 'thunder');
    return true;
  }
  if (w.id === 'keyword' || w.id === 'control') return keywordStrike(run, st, dmg, w.id === 'control');
  if (w.id === 'pin' || w.id === 'anchor') { placePin(run, st); return true; }
  if (w.id === 'convert') {
    const used: number[] = [];
    for (let i = 0; i < st.count; i++) {
      const t = nearest(run, p.x, p.y, used, 120);
      if (!t) break;
      used.push(t.id);
      if (run.events.length < 240) run.events.push({ t: 'wash', x: clamp(t.x + t.w / 2, 4, W - 4), y: t.y + t.h / 2 });
      convertHit(run, t, dmg, st.dmg2 * run.stats.dmgMul, st.pierce);
    }
    return used.length > 0;
  }
  if (w.id === 'drone' || w.id === 'squad') {
    let any = false;
    for (let i = 0; i < st.count; i++) {
      const [dx, dy] = dronePos(run, i, st.count);
      const t = nearest(run, dx, dy);
      if (!t) continue;
      const [tx, ty] = aimAt(t, dx, dy);
      const a = Math.atan2(ty - dy, tx - dx);
      if (w.id === 'squad') throwRewind(run, dx, dy, a, dmg);
      else run.shots.push(newShot('drone', dx, dy, a, 220, dmg));
      any = true;
    }
    if (any) run.events.push({ t: 'shoot', s: w.id });
    return any;
  }
  const target = nearest(run, p.x, p.y);
  if (!target) return false;
  const [tx, ty] = aimAt(target, p.x, p.y);
  const a = Math.atan2(ty - p.y, tx - p.x);
  if (w.id === 'like') {
    const s = newShot('like', p.x, p.y, a, 230, dmg);
    s.pierce = st.pierce;
    run.shots.push(s);
  } else if (w.id === 'triple') {
    for (let i = 0; i < st.count; i++) run.shots.push(newShot('triple', p.x, p.y, a + (i - (st.count - 1) / 2) * 0.22, 210, dmg));
  } else if (w.id === 'storm') {
    for (let i = 0; i < st.count; i++) {
      const s = newShot('storm', p.x, p.y, a + (i - (st.count - 1) / 2) * 0.2, 240, dmg);
      s.pierce = st.pierce;
      run.shots.push(s);
    }
  } else if (w.id === 'share') {
    fireBounce(run, dmg, st.bounces);
  } else if (w.id === 'coin') {
    const pool = targets(run);
    for (let i = 0; i < st.count; i++) {
      const e = i === 0 ? target : run.rng.pick(pool);
      const [cx, cy] = i === 0 ? [tx, ty] : [e.x + e.w / 2, e.y + e.h / 2];
      lobCoin(run, cx + e.vx * 0.3, cy, dmg, st.radius);
    }
  } else if (w.id === 'report') {
    beam(run, p.y, st.radius, dmg);
  } else if (w.id === 'rewind') {
    throwRewind(run, p.x, p.y, a, dmg);
    if (st.count > 1) throwRewind(run, p.x, p.y, a + Math.PI, dmg);
  }
  run.events.push({ t: 'shoot', s: w.id });
  return true;
}

function updateWeapons(run: Run, dt: number): void {
  const p = run.player;
  const wdt = run.buff.haste > 0 ? dt * 2 : dt; // 求三连: everything cycles twice as fast
  const dm = run.stats.dmgMul, cm = run.stats.cdMul;
  for (const w of run.weapons) {
    const st = weaponStats(w.id, w.lvl);
    const dmg = st.dmg * dm;
    if (w.id === 'star' || w.id === 'chain') {
      orbit(run, st, dmg);
      if (w.id === 'chain' && (w.cd2 -= wdt) <= 0) w.cd2 = fireBounce(run, st.dmg2 * dm, st.bounces) ? st.cd2 * cm : 0.12;
      continue;
    }
    if (w.id === 'block' || w.id === 'jail') {
      if ((w.cd -= wdt) <= 0) { w.cd = st.cd; aura(run, st.radius, dmg, st.slow); }
      if (w.id === 'jail' && (w.cd2 -= wdt) <= 0) {
        w.cd2 = st.cd2 * cm;
        if (targets(run).length) for (let k = -1; k <= 1; k++) beam(run, p.y + k * LANE_H, 6, st.dmg2 * dm);
      }
      continue;
    }
    if (w.id === 'remix' || w.id === 'graze' || w.id === 'scene') continue; // fired by kills / grazes
    if (w.id === 'hold') {
      if (p.moving) {
        if (run.hold >= 1) releaseHold(run, st); else run.hold = 0;
      } else {
        run.hold = Math.min(st.count, run.hold + wdt / (st.cd * cm));
        if (run.hold >= st.count) releaseHold(run, st);
      }
      continue;
    }
    if ((w.cd -= wdt) <= 0) w.cd = fire(run, w, st, dmg) ? st.cd * cm : 0.12;
  }
}

function updateShots(run: Run, dt: number): void {
  const p = run.player;
  for (const s of run.shots) {
    if (s.kind === 'coin') {
      s.t += dt;
      if (s.t >= s.dur) {
        s.dead = true;
        run.events.push({ t: 'boom', x: s.tx, y: s.ty, n: s.radius });
        areaDamage(run, s.tx, s.ty, s.radius, s.dmg);
      }
      continue;
    }
    if (s.kind === 'rewind') {
      // Flies out for `dur`, then homes back to the player; hits everything once each way.
      s.t += dt;
      s.life -= dt;
      if (s.bounces === 0 && s.t >= s.dur) { s.bounces = 1; s.hit.length = 0; }
      if (s.bounces === 1) {
        const dx = p.x - s.x, dy = p.y - s.y;
        const d = Math.hypot(dx, dy);
        if (d < 8 || s.life <= 0) { s.dead = true; continue; }
        s.vx = (dx / d) * 230;
        s.vy = (dy / d) * 230;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      for (const e of run.enemies) {
        if (e.dead || s.hit.includes(e.id) || distToBox(s.x, s.y, e) > 4) continue;
        s.hit.push(e.id);
        damage(run, e, s.dmg);
      }
      continue;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0 || s.x < -6 || s.x > W + 6 || s.y < LANE_TOP - 10 || s.y > H + 6) { s.dead = true; continue; }
    for (const e of run.enemies) {
      if (e.dead || s.hit.includes(e.id) || distToBox(s.x, s.y, e) > 2) continue;
      damage(run, e, s.dmg);
      s.hit.push(e.id);
      if (s.kind === 'share') {
        const n = s.bounces-- > 0 ? nearest(run, s.x, s.y, s.hit, 110) : null;
        if (n) {
          const [tx, ty] = aimAt(n, s.x, s.y);
          const a = Math.atan2(ty - s.y, tx - s.x);
          s.vx = Math.cos(a) * 200;
          s.vy = Math.sin(a) * 200;
          s.life = Math.max(s.life, 0.8);
        } else s.dead = true;
      } else if (s.pierce-- <= 0) s.dead = true;
      break;
    }
  }
}

// ---------------------------------------------------------------- ultimates

export const ultReady = (run: Run): boolean => run.phase === 'play' && run.ult.energy >= run.ult.need;

/** Fire the character's exclusive skill if it is charged. */
export function useUlt(run: Run): boolean {
  if (!ultReady(run)) return false;
  const p = run.player;
  const dm = run.stats.dmgMul;
  run.ult.energy = 0;
  run.ult.uses++;
  run.ult.need = Math.min(90, ULT_NEED + 12 * run.ult.uses);
  run.events.push({ t: 'ult', s: run.char.ultName });
  switch (run.char.ult) {
    case 'haste':
      run.buff.haste = 6;
      break;
    case 'hype':
      run.buff.fans = 8;
      break;
    case 'freeze':
      run.buff.freeze = 4;
      run.bullets.length = 0;
      break;
    case 'shield':
      p.iframes = Math.max(p.iframes, 4);
      for (const o of run.orbs) o.pull = true;
      break;
    case 'rain': {
      const pool = targets(run);
      for (let i = 0; i < 10 && pool.length; i++) {
        const e = pool[i % pool.length];
        lobCoin(run, e.x + e.w / 2 + run.rng.range(-6, 6), e.y + e.h / 2, (12 + 3 * run.wave) * dm, 24, 0.35 + i * 0.05);
      }
      run.coins += 5;
      break;
    }
    case 'surge':
      for (const e of targets(run)) strike(run, e, (20 + 6 * run.wave) * dm, 6, false);
      break;
    case 'nova':
      for (const e of targets(run)) damage(run, e, (30 + 8 * run.wave) * dm);
      run.bullets.slice(0, 30).forEach(b => dropOrb(run, 'xp', b.x, b.y, 1));
      run.bullets.length = 0;
      run.events.push({ t: 'nova', x: p.x, y: p.y });
      break;
  }
  return true;
}

function hurt(run: Run): void {
  const p = run.player;
  if (p.iframes > 0) return;
  p.hp--;
  run.hurtCount++;
  run.combo = 0;
  p.iframes = 1.2;
  run.events.push({ t: 'hurt' });
  if (p.hp > 0) return;
  if (count(run.relics, 'revive') > 0) {
    run.relics.revive = 0;
    recalc(run);
    p.hp = run.stats.maxHp;
    p.iframes = 2.5;
    run.bullets.length = 0;
    run.events.push({ t: 'revive' });
  } else finish(run, false);
}

function updateThreats(run: Run, dt: number): void {
  const p = run.player;
  if (p.iframes > 0) p.iframes -= dt;
  const gw = run.weapons.find(w => w.id === 'graze' || w.id === 'scene');
  const gr = GRAZE_R + run.tech.grazeRange + (gw ? weaponStats(gw.id, gw.lvl).radius : 0);
  for (const b of run.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life > 0 && Math.abs(b.x - p.x) < 3.5 && Math.abs(b.y - p.y) < 4.5) { b.life = 0; hurt(run); }
    else if (b.life > 0 && !b.grazed && p.iframes <= 0 && Math.hypot(b.x - p.x, b.y - p.y) < gr + 4) { b.grazed = true; graze(run, null, b.x, b.y); }
    if (b.x < -4 || b.x > W + 4 || b.y < LANE_TOP - 6 || b.y > H + 4) b.life = 0;
  }
  if (p.iframes > 0 || run.phase !== 'play') return;
  for (const e of run.enemies) {
    if (e.dead) continue;
    if ((e.kind === 'fixed' && e.t < 0.9) || (e.kind === 'boss' && e.t < 1.2)) continue;
    if (p.x + 2 > e.x + 1 && p.x - 2 < e.x + e.w - 1 && p.y + 3 > e.y + 2 && p.y - 3 < e.y + e.h - 2) { hurt(run); break; }
    if (e.grazeCd <= 0 && distToBox(p.x, p.y, e) <= gr) {
      e.grazeCd = 1.2;
      graze(run, e, clamp(e.x + e.w / 2, 4, W - 4), e.y + e.h / 2);
    }
  }
}

function collect(run: Run, o: Orb): void {
  if (o.kind === 'xp') {
    run.xp += o.v * run.stats.xpMul;
    while (run.xp >= run.xpNext) {
      run.xp -= run.xpNext;
      run.level++;
      run.pendingLevels++;
      run.xpNext = xpForLevel(run.level);
      if (count(run.relics, 'monitor')) run.levelBonus += 0.1;
    }
  } else if (o.kind === 'coin') run.coins += o.v;
  else run.player.hp = Math.min(run.stats.maxHp, run.player.hp + o.v);
}

function updateOrbs(run: Run, dt: number): void {
  const p = run.player;
  let any = false;
  for (const o of run.orbs) {
    const dx = p.x - o.x, dy = p.y - o.y;
    const d = Math.hypot(dx, dy);
    if (d < run.stats.magnet) o.pull = true;
    if (o.pull && d > 0.01) {
      const v = Math.min(d, 170 * dt);
      o.x += (dx / d) * v;
      o.y += (dy / d) * v;
    }
    if (d < 7) {
      collect(run, o);
      o.v = 0;
      any = true;
      if (run.events.length < 240) run.events.push({ t: 'pick', s: o.kind });
    }
  }
  if (any) {
    run.orbs = run.orbs.filter(o => o.v > 0);
    recalc(run);
  }
}

// ---------------------------------------------------------------- flow

function finish(run: Run, win: boolean): void {
  run.phase = 'over';
  run.win = win;
  run.events.push({ t: 'over', b: win });
}

function endWave(run: Run): void {
  for (const e of run.enemies) if (!e.dead) run.events.push({ t: 'pop', x: clamp(e.x + e.w / 2, 4, W - 4), y: e.y + e.h / 2, s: e.color });
  run.enemies.length = 0;
  run.bullets.length = 0;
  run.shots.length = 0;
  run.allies.length = 0;
  run.pins.length = 0;
  run.hold = 0;
  for (const o of run.orbs) collect(run, o);
  run.orbs.length = 0;
  run.coins += waveClearCoins(run.wave) + 10 * count(run.relics, 'ad') + run.char.waveCoins + run.tech.waveCoins;
  if (count(run.relics, 'daily')) run.dailyBonus += 0.3;
  run.wallTimer = 0;
  run.waveDone = true;
  recalc(run);
  run.events.push({ t: 'waveEnd', n: run.wave });
  if (run.wave >= WAVES) { finish(run, true); return; }
  if (run.pendingLevels > 0) openLevelUp(run); else openShop(run);
}

export function stepRun(run: Run, dt: number, mx: number, my: number): void {
  if (run.phase !== 'play') return;
  run.time += dt;
  run.waveT += dt;
  const p = run.player;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  p.x = clamp(p.x + mx * run.stats.speed * dt, 5, W - 5);
  p.y = clamp(p.y + my * run.stats.speed * dt, LANE_TOP + 5, H - 10);
  p.moving = len > 0.05;
  if (Math.abs(mx) > 0.05) p.face = mx < 0 ? -1 : 1;

  const b = run.buff;
  if (b.haste > 0) b.haste -= dt;
  if (b.fans > 0) b.fans -= dt;
  if (b.freeze > 0) b.freeze -= dt; else director(run, dt);
  if (run.keyword.t > 0) run.keyword.t -= dt;
  updateEnemies(run, dt);
  updateWeapons(run, dt);
  updateShots(run, dt);
  updateAllies(run, dt);
  updatePins(run, dt);
  updateThreats(run, dt);
  if (run.phase !== 'play') return; // died
  updateOrbs(run, dt);

  run.enemies = run.enemies.filter(e => !e.dead);
  run.shots = run.shots.filter(s => !s.dead);
  run.bullets = run.bullets.filter(b => b.life > 0);
  if (run.comboTimer > 0) {
    run.comboTimer -= dt;
    if (run.comboTimer <= 0) run.combo = 0;
  }

  if (run.bossKilled || run.waveT >= waveDuration(run.wave)) endWave(run);
  else if (run.pendingLevels > 0) openLevelUp(run);
}

// ---------------------------------------------------------------- level-up

function openLevelUp(run: Run): void {
  run.choices = rollChoices(run);
  run.phase = 'levelup';
  run.events.push({ t: 'level' });
}

const FILLERS: readonly Choice[] = [
  { type: 'bonus', id: 'coins', lvl: 0, name: '恰饭', glyph: '饭', color: '#ffd24a', desc: '获得 8 硬币' },
  { type: 'bonus', id: 'heal', lvl: 0, name: '休息一下', glyph: '休', color: '#ff6b6b', desc: '回复 1 点生命' },
  { type: 'bonus', id: 'fans', lvl: 0, name: '互粉', glyph: '粉', color: '#fb7299', desc: '倍率 +0.2' },
];

/** Recipes whose two ingredients are both owned at FUSE_LEVEL or above. */
export function readyFusions(run: Run): WeaponId[] {
  const lvl = (id: WeaponId): number => run.weapons.find(w => w.id === id)?.lvl ?? 0;
  return RECIPES.filter(r => lvl(r.a) >= run.tech.fuseLevel && lvl(r.b) >= run.tech.fuseLevel).map(r => r.out);
}

export function rollChoices(run: Run): Choice[] {
  const own = (id: WeaponId): OwnedWeapon | undefined => run.weapons.find(w => w.id === id);
  const out: Choice[] = [];
  // A fusion that is ready is always on the table.
  for (const id of readyFusions(run)) {
    const d = WEAPON_BY_ID[id];
    const r = recipeOf(id)!;
    out.push({
      type: 'fusion', id, lvl: 1, name: d.name, glyph: d.glyph, color: d.color, desc: d.desc,
      hint: `${WEAPON_BY_ID[r.a].name} + ${WEAPON_BY_ID[r.b].name} 合二为一`,
    });
  }
  const bag: { c: Choice; w: number }[] = [];
  for (const d of WEAPONS) {
    const o = own(d.id);
    const partner = partnerOf(d.id);
    const fusedAway = !d.fusion && own(recipeOf(d.id)?.out ?? d.id) !== undefined && !o;
    if (o ? o.lvl >= maxLevel(d.id) : d.fusion || fusedAway || run.weapons.length >= MAX_WEAPONS) continue;
    const lvl = (o?.lvl ?? 0) + 1;
    // Steer towards completing a recipe the player has already started.
    const w = partner && own(partner) ? (o ? 2 : 3) : o ? 1.3 : 1;
    const fl = run.tech.fuseLevel;
    const hint = d.fusion || (o && o.lvl >= fl && partner && (own(partner)?.lvl ?? 0) >= fl) ? undefined : recipeHint(d.id, fl) || undefined;
    bag.push({ c: { type: 'weapon', id: d.id, lvl, name: d.name, glyph: d.glyph, color: d.color, desc: weaponLevelText(d.id, lvl), hint }, w });
  }
  const kinds = Object.keys(run.passives).length;
  for (const d of PASSIVES) {
    const lvl = count(run.passives, d.id);
    if (lvl ? lvl < MAX_LEVEL : kinds < MAX_PASSIVES) {
      bag.push({ c: { type: 'passive', id: d.id, lvl: lvl + 1, name: d.name, glyph: d.glyph, color: d.color, desc: d.desc }, w: lvl ? 1.2 : 1 });
    }
  }
  while (out.length < 3 && bag.length) {
    let roll = run.rng.next() * bag.reduce((a, b) => a + b.w, 0);
    let i = 0;
    while (i < bag.length - 1 && (roll -= bag[i].w) > 0) i++;
    out.push(bag.splice(i, 1)[0].c);
  }
  for (let i = 0; out.length < 3; i++) out.push(FILLERS[i]);
  return out.slice(0, 3);
}

/** 「换一批」 (科技树): throw the three cards back and draw again. */
export function rerollChoices(run: Run): boolean {
  if (run.phase !== 'levelup' || run.lvRerolls <= 0) return false;
  run.lvRerolls--;
  run.choices = rollChoices(run);
  run.events.push({ t: 'reroll' });
  return true;
}

export function chooseUpgrade(run: Run, i: number): boolean {
  if (run.phase !== 'levelup' || !run.choices) return false;
  const c = run.choices[i];
  if (!c) return false;
  if (c.type === 'fusion') {
    const r = recipeOf(c.id as WeaponId);
    if (!r || !readyFusions(run).includes(r.out)) return false;
    run.weapons = run.weapons.filter(w => w.id !== r.a && w.id !== r.b);
    run.weapons.push({ id: r.out, lvl: 1, cd: 0.3, cd2: 0.6 });
    run.events.push({ t: 'fuse', s: WEAPON_BY_ID[r.out].name });
  } else if (c.type === 'weapon') {
    const id = c.id as WeaponId;
    const o = run.weapons.find(w => w.id === id);
    if (o) o.lvl = Math.min(maxLevel(id), o.lvl + 1);
    else run.weapons.push({ id, lvl: 1, cd: 0.3, cd2: 0.6 });
  } else if (c.type === 'passive') {
    const id = c.id as PassiveId;
    run.passives[id] = count(run.passives, id) + 1;
    recalc(run);
    if (id === 'hp') run.player.hp = Math.min(run.stats.maxHp, run.player.hp + 1);
  } else if (c.id === 'coins') run.coins += 8;
  else if (c.id === 'heal') run.player.hp = Math.min(run.stats.maxHp, run.player.hp + 1);
  else run.levelBonus += 0.2;
  recalc(run);
  run.pendingLevels = Math.max(0, run.pendingLevels - 1);
  run.events.push({ t: 'choose' });
  if (run.pendingLevels > 0) run.choices = rollChoices(run);
  else if (run.waveDone) openShop(run);
  else { run.choices = null; run.phase = 'play'; run.player.iframes = Math.max(run.player.iframes, 0.6); }
  return true;
}

// ---------------------------------------------------------------- shop

function rollOffers(run: Run): (Offer | null)[] {
  const lucky = count(run.relics, 'lucky') > 0;
  const pool = RELICS.filter(d => d.stack || !count(run.relics, d.id))
    // A relic that only matters with spare hit points is pointless once all-in.
    .filter(d => !(count(run.relics, 'allin') && (d.id === 'drumstick' || d.id === 'infamy')));
  const price = (d: (typeof RELICS)[number]): number => Math.max(1, Math.round(relicPrice(d, count(run.relics, d.id)) * run.tech.price));
  const picked: Offer[] = [];
  const bag = pool.map(d => ({ d, w: d.kind === 'mul' ? (lucky ? 1.8 : 1) : 2.2 }));
  while (picked.length < 3 && bag.length) {
    let roll = run.rng.next() * bag.reduce((a, b) => a + b.w, 0);
    let idx = 0;
    while (idx < bag.length - 1 && (roll -= bag[idx].w) > 0) idx++;
    const { d } = bag.splice(idx, 1)[0];
    picked.push({ id: d.id, price: price(d) });
  }
  // Never show a shop where nothing is affordable if something affordable exists.
  if (picked.length && !picked.some(o => o.price <= run.coins)) {
    const cheap = bag.map(b => ({ id: b.d.id, price: price(b.d) })).filter(o => o.price <= run.coins);
    if (cheap.length) picked[picked.length - 1] = run.rng.pick(cheap);
  }
  return picked;
}

function openShop(run: Run): void {
  if (count(run.relics, 'finance')) run.coins += Math.min(10, Math.floor(run.coins / 5));
  run.choices = null;
  run.shop = rollOffers(run);
  run.rerollCost = 3;
  run.freeRerolls = (count(run.relics, 'lucky') ? 1 : 0) + (run.perks.fav ? PERK_FAV_REROLLS : 0);
  run.phase = 'shop';
  run.events.push({ t: 'shop' });
}

export function buyRelic(run: Run, i: number): boolean {
  if (run.phase !== 'shop' || !run.shop) return false;
  const o = run.shop[i];
  if (!o || run.coins < o.price) return false;
  run.coins -= o.price;
  run.relics[o.id] = count(run.relics, o.id) + 1;
  run.shop[i] = null;
  recalc(run);
  if (o.id === 'drumstick') run.player.hp = Math.min(run.stats.maxHp, run.player.hp + 2);
  run.events.push({ t: 'buy' });
  return true;
}

export function rerollShop(run: Run): boolean {
  if (run.phase !== 'shop') return false;
  if (run.freeRerolls > 0) run.freeRerolls--;
  else if (run.coins >= run.rerollCost) { run.coins -= run.rerollCost; run.rerollCost += 2; }
  else return false;
  run.shop = rollOffers(run);
  run.events.push({ t: 'reroll' });
  return true;
}

export function leaveShop(run: Run): boolean {
  if (run.phase !== 'shop') return false;
  run.wave++;
  startWave(run);
  return true;
}

export { PASSIVE_BY_ID, RELIC_BY_ID, WEAPON_BY_ID };
