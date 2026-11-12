import { decodeTech, encodeTech, mergeTech } from './tech';

/** Persistent save. Stored as ONE cloud-storage value, which the platform caps at 1024 bytes. */

export interface Save {
  v: 1;
  /** Best fans in a single run. */
  best: number;
  /** Best "seconds left when hitting a million"; -1 if never reached. */
  bestFast: number;
  runs: number;
  /** Last selected character index. */
  char: number;
  music: boolean;
  sfx: boolean;
  /** Has finished the first-run hint. */
  seenHint: boolean;
  /** Last known "follows the author" state, used while the live check is unavailable. */
  fol: boolean;
  /** Last known 三连 state as bits (like 1, coin 2, favourite 4). */
  tri: number;
  /** Total 灵感 ever earned (what is spendable = this − cost of `tech`). */
  ins: number;
  /** 科技树 levels, one digit per node. */
  tech: string;
}

export const SAVE_KEY = 'save_v1';
export const SAVE_LIMIT_BYTES = 1024;

export function defaultSave(): Save {
  return { v: 1, best: 0, bestFast: -1, runs: 0, char: 0, music: true, sfx: true, seenHint: false, fol: false, tri: 0, ins: 0, tech: encodeTech([]) };
}

const num = (v: unknown, d: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/** Parse and sanitise; anything malformed falls back to defaults rather than throwing. */
export function decodeSave(raw: string | null | undefined): Save {
  const d = defaultSave();
  if (!raw) return d;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return d;
    return {
      v: 1,
      best: num(o.best, 0, 0, Number.MAX_SAFE_INTEGER),
      bestFast: num(o.bestFast, -1, -1, 100_000),
      runs: num(o.runs, 0, 0, 1e9),
      char: num(o.char, 0, 0, 16),
      music: bool(o.music, true),
      sfx: bool(o.sfx, true),
      seenHint: bool(o.seenHint, false),
      fol: bool(o.fol, false),
      tri: num(o.tri, 0, 0, 7),
      ins: num(o.ins, 0, 0, 1e7),
      tech: encodeTech(decodeTech(o.tech)),
    };
  } catch {
    return d;
  }
}

export function encodeSave(s: Save): string {
  return JSON.stringify(s);
}

export function saveBytes(s: Save): number {
  return new TextEncoder().encode(encodeSave(s)).length;
}

/** Combine a local and a cloud copy: progress takes the max, preferences come from `prefs`. */
export function mergeSaves(prefs: Save, other: Save): Save {
  return {
    ...prefs,
    best: Math.max(prefs.best, other.best),
    bestFast: Math.max(prefs.bestFast, other.bestFast),
    runs: Math.max(prefs.runs, other.runs),
    seenHint: prefs.seenHint || other.seenHint,
    fol: prefs.fol || other.fol,
    tri: prefs.tri | other.tri,
    ins: Math.max(prefs.ins, other.ins),
    tech: encodeTech(mergeTech(decodeTech(prefs.tech), decodeTech(other.tech))),
  };
}
