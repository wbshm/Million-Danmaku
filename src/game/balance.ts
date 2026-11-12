/** Field geometry, run structure and per-wave tuning. All gameplay numbers that get tuned live here. */

export const W = 216;
export const H = 432;
export const LANE_TOP = 30;
export const LANE_H = 14;
export const LANES = Math.floor((H - 8 - LANE_TOP) / LANE_H);
export const laneY = (i: number): number => LANE_TOP + i * LANE_H;

export const WAVES = 10;
export const BOSS_WAVES: readonly number[] = [5, 10];
export const waveDuration = (w: number): number => (BOSS_WAVES.includes(w) ? 40 : 30);
export const TOTAL_TIME = Array.from({ length: WAVES }, (_, i) => waveDuration(i + 1)).reduce((a, b) => a + b, 0);

export const MILLION = 1_000_000;
/** Leaderboard scores are integers capped by the platform at 16,777,215. */
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
  boss: 0 | 1 | 2;
  /** Base fans for an ordinary danmaku this wave. */
  base: number;
}

export function waveCfg(w: number): WaveCfg {
  return {
    interval: Math.max(0.22, 0.78 - 0.056 * w),
    hp: 4 * Math.pow(1.32, w - 1),
    speed: 26 + 3.2 * w,
    pColor: w >= 2 ? Math.min(0.35, 0.07 * (w - 1)) : 0,
    pReverse: w >= 3 ? 0.12 : 0,
    bigEvery: w >= 3 ? Math.max(5, 12 - 0.7 * w) : 0,
    fixedEvery: w >= 4 ? Math.max(4.5, 11 - 0.65 * w) : 0,
    spamAt: w >= 7 ? [9, 21] : w >= 4 ? [15] : [],
    boss: w === 5 ? 1 : w === 10 ? 2 : 0,
    base: Math.round(Math.pow(w, 1.32)),
  };
}

export const xpForLevel = (level: number): number => 3 + 2 * level;
export const waveClearCoins = (w: number): number => 12 + 2 * w;
