import { SCORE_CAP } from './balance';

export interface ScoreCtx {
  /** Flat fans added to every kill's base. */
  addBase: number;
  /** Sum of additive multiplier terms. */
  addMult: number;
  /** Product of multiplicative terms. */
  mulMult: number;
  combo: number;
  /** Maximum extra multiplier combo can grant (1 => up to ×2). */
  comboCap: number;
  /** Extra flat fans for elite/boss/colour kills. */
  eliteBonus: number;
  /** Multiplier applied only to elite/boss kills. */
  eliteMul: number;
}

export const COMBO_STEP = 0.02;

export function comboMult(combo: number, cap: number): number {
  return 1 + Math.min(cap, combo * COMBO_STEP);
}

/** multiplier = (1 + additive terms) × multiplicative terms × combo bonus */
export function multiplier(c: ScoreCtx): number {
  return (1 + c.addMult) * c.mulMult * comboMult(c.combo, c.comboCap);
}

/** 0 = ordinary danmaku, 1 = coloured (gets eliteBonus), 2 = big/boss (gets eliteBonus and eliteMul). */
export type Tier = 0 | 1 | 2;

/** fans gained for one kill = (base + flat bonuses) × multiplier, floored, never below 1. */
export function fanGain(base: number, tier: Tier, c: ScoreCtx): number {
  const flat = base + c.addBase + (tier >= 1 ? c.eliteBonus : 0);
  return Math.max(1, Math.floor(flat * multiplier(c) * (tier === 2 ? c.eliteMul : 1)));
}

/** Clamp to what the platform leaderboard accepts. */
export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return n > 0 ? SCORE_CAP : 0;
  return Math.max(0, Math.min(SCORE_CAP, Math.floor(n)));
}
