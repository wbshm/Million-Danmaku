/** Field geometry, run structure and per-wave tuning. All gameplay numbers that get tuned live here. */

export const W = 216;
export const H = 432;
export const LANE_TOP = 30;
export const LANE_H = 14;
export const LANES = Math.floor((H - 8 - LANE_TOP) / LANE_H);
export const laneY = (i: number): number => LANE_TOP + i * LANE_H;

export const WAVES = 20;
export const BOSS_WAVES: readonly number[] = [5, 10, 15, 20];
export const waveDuration = (w: number): number => (BOSS_WAVES.includes(w) ? 40 : 30);
export const TOTAL_TIME = Array.from({ length: WAVES }, (_, i) => waveDuration(i + 1)).reduce((a, b) => a + b, 0);

export const MILLION = 1_000_000;
/** Leaderboard scores are integers capped by the platform at 16,777,215 (fans go far beyond it: see encodeScore). */
export const SCORE_CAP = 16_777_215;

export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 4;
export const MAX_LEVEL = 5;

/** Logic-side text width: full-width glyphs are 12px, ASCII 6px (Fusion Pixel 12px metrics). */
export function textWidth(s: string, scale = 1): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0xff ? 12 : 6;
  return w * scale;
}

export interface WaveCfg {
  /** Seconds between ordinary scrolling danmaku. */
  interval: number;
  hp: number;
  speed: number;
  pColor: number;
  pReverse: number;
  /** Seconds between elite big danmaku; 0 disables. */
  bigEvery: number;
  /** Seconds between pinned top/bottom danmaku; 0 disables. */
  fixedEvery: number;
  /** Wave-relative times at which a "刷屏" wall is announced. */
  spamAt: number[];
  /** Which boss shows up this wave (0 = none). */
  boss: 0 | 1 | 2 | 3 | 4;
  /** Speed of bullets fired by pinned danmaku. */
  shot: number;
  /** Base fans for an ordinary danmaku this wave. */
  base: number;
}

/** Per-wave growth of danmaku health after wave 10. */
export const LATE_HP = 1.27;

export function waveCfg(w: number): WaveCfg {
  // Waves 1-10 ramp up steeply; 11-20 keep climbing, but gently, since the build is mostly finished by then.
  const late = Math.max(0, w - 10), early = Math.min(w, 10);
  return {
    interval: Math.max(0.17, Math.max(0.22, 0.78 - 0.056 * w) - 0.005 * late),
    hp: 4 * Math.pow(1.32, early - 1) * Math.pow(LATE_HP, late),
    speed: 26 + 3.2 * early + 1.2 * late,
    pColor: w >= 2 ? Math.min(0.35, 0.07 * (w - 1)) : 0,
    pReverse: w >= 3 ? 0.12 : 0,
    bigEvery: w >= 3 ? Math.max(5, 12 - 0.7 * w) : 0,
    fixedEvery: w >= 4 ? Math.max(4.5, 11 - 0.65 * w) : 0,
    spamAt: w >= 14 ? [7, 16, 25] : w >= 7 ? [9, 21] : w >= 4 ? [15] : [],
    boss: w === 5 ? 1 : w === 10 ? 2 : w === 15 ? 3 : w === 20 ? 4 : 0,
    shot: 46 + 2 * early + 0.8 * late,
    base: Math.round(Math.pow(w, 1.32)),
  };
}

export const xpForLevel = (level: number): number => 3 + 2 * level;
export const waveClearCoins = (w: number): number => 12 + 2 * w;
