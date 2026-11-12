/**
 * The only place that talks to the B站 Toy SDK (window.toy).
 *
 * Rules from the SDK doc that this file enforces:
 *  - every capability is probed with isSupport first; Web lacks share / container APIs
 *  - cloud storage is a save file, written only at settlement, one batched call
 *  - leaderboard results are cached; refresh only when the player asks
 *  - rate-limit errors (http_error 307044) back off exponentially instead of retrying at once
 *  - navigate must run inside a user gesture, so its support flag is resolved ahead of time
 *  - follow / like / coin / favourite state is read-only and only for the Toy author's own videos
 * Outside B站 (local dev, file://) window.toy is missing or unusable: everything falls back to
 * localStorage / no-ops, and no call may ever throw into the game or hang it.
 */
import { clampScore } from '../game/scoring';
import { SAVE_KEY, decodeSave, defaultSave, encodeSave, mergeSaves, type Save } from '../game/save';

export type Period = 'all' | 'month' | 'week' | 'day';
export interface RankItem { rank: number; score: number; nickname: string; avatar: string }
export interface MyRank { ranked: boolean; rank: number; score: number }
export interface ContainerState {
  viewport?: { width: number; height: number };
  safeArea?: { top: number; right: number; bottom: number; left: number };
}

interface ToySdk {
  isSupport(ability: string): Promise<boolean>;
  share(req: { path: string }): Promise<void>;
  getQrCode(req?: { path?: string; size?: number }): Promise<{ base64: string; url: string }>;
  getCloudStorage(keys?: string[]): Promise<Record<string, string>>;
  setCloudStorage(items: Record<string, string>): Promise<void>;
  submitScore(req: { board?: number; score: number }): Promise<{ score: number }>;
  getRankList(req?: { board?: number; period?: Period; limit?: number }): Promise<RankItem[]>;
  getMyRank(req?: { board?: number; period?: Period }): Promise<MyRank>;
  onContainerChange(listener: (state: ContainerState) => void): () => void;
  navigate(req: { type: string; id: string; extra?: Record<string, string> }): Promise<void>;
  getAuthorProfile(): Promise<{ status?: string; data?: { nickname?: string; mid?: string | number } }>;
  getAuthorRelation(): Promise<{ status?: string; data?: { isFollowing?: boolean } }>;
  getVideoUserActions(req: { videos: { bvid: string }[] }): Promise<{
    items?: { status?: string; liked?: boolean; coinCount?: number; favorited?: boolean }[];
  }>;
}

/** What we know about the player's relationship with the Toy's author. */
export interface Social {
  /** The follow check succeeded (logged in, inside B站). */
  known: boolean;
  following: boolean;
  /** The like / coin / favourite check succeeded. */
  tripleKnown: boolean;
  like: boolean;
  coin: boolean;
  fav: boolean;
}

declare global {
  interface Window { toy?: ToySdk }
}

export const BOARD_FANS = 1;
export const BOARD_SPEED = 2;
const LOCAL_KEY = 'million-danmaku.save_v1';
const RATE_LIMIT = 307044;

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('[platform] timeout')), ms);
    p.then(v => { clearTimeout(id); resolve(v); }, e => { clearTimeout(id); reject(e); });
  });
}

function isRateLimit(e: unknown): boolean {
  const o = e as { type?: string; code?: number } | null;
  return !!o && o.type === 'http_error' && o.code === RATE_LIMIT;
}

/** Run an SDK call; on a rate-limit error wait 0.8s, 1.6s, … before trying again. */
export async function withBackoff<T>(fn: () => Promise<T>, tries = 3, baseMs = 800): Promise<T> {
  let delay = baseMs;
  for (let i = 0; ; i++) {
    try {
      return await timeout(fn(), 6000);
    } catch (e) {
      if (!isRateLimit(e) || i >= tries - 1) throw e;
      await sleep(delay);
      delay *= 2;
    }
  }
}

const support = new Map<string, Promise<boolean>>();

function can(ability: string): Promise<boolean> {
  let p = support.get(ability);
  if (!p) {
    const sdk = window.toy;
    p = sdk && typeof sdk.isSupport === 'function'
      ? timeout(Promise.resolve().then(() => sdk.isSupport(ability)), 2500).then(Boolean, () => false)
      : Promise.resolve(false);
    support.set(ability, p);
  }
  return p;
}

function readLocal(): Save {
  try { return decodeSave(localStorage.getItem(LOCAL_KEY)); } catch { return defaultSave(); }
}

function writeLocal(s: Save): void {
  try { localStorage.setItem(LOCAL_KEY, encodeSave(s)); } catch { /* private mode / blocked */ }
}

export type ShareMode = 'share' | 'qr' | 'none';
export type SubmitResult = 'ok' | 'offline' | 'fail';

interface RankData { list: RankItem[]; mine: MyRank | null }
const rankCache = new Map<string, RankData>();

let socialFlight: Promise<Social> | null = null;

export const platform = {
  shareMode: 'none' as ShareMode,
  hasRank: false,
  /** Resolved at boot so navigate() can be called synchronously from a tap. */
  canNavigate: false,
  /** The follow / 三连 checks exist in this environment at all. */
  hasSocial: false,
  social: { known: false, following: false, tripleKnown: false, like: false, coin: false, fav: false } as Social,
  /** Author's public nickname and uid, when the platform tells us. */
  author: { nickname: '', mid: '' },

  /** Probe capabilities once at boot. */
  async init(): Promise<void> {
    const [share, qr, rank, nav, rel] = await Promise.all([can('share'), can('getQrCode'), can('getRankList'), can('navigate'), can('getAuthorRelation')]);
    this.shareMode = share ? 'share' : qr ? 'qr' : 'none';
    this.hasRank = rank;
    this.canNavigate = nav;
    this.hasSocial = rel;
  },

  /** Author nickname (and uid if exposed); one call per page load, failure is fine. */
  async loadAuthor(): Promise<void> {
    if (!(await can('getAuthorProfile'))) return;
    try {
      const r = await withBackoff(() => window.toy!.getAuthorProfile());
      if (r && r.status === 'ok' && r.data) {
        this.author.nickname = typeof r.data.nickname === 'string' ? r.data.nickname : '';
        this.author.mid = r.data.mid !== undefined && r.data.mid !== null ? String(r.data.mid) : '';
      }
    } catch { /* optional */ }
  },

  /**
   * Re-read "is following the author" and, when `bvid` is set, the like / coin / favourite state
   * for that video. Concurrent calls share one request. A failed check leaves `known` false so
   * callers fall back to the last state they saved.
   */
  refreshSocial(bvid: string): Promise<Social> {
    if (socialFlight) return socialFlight;
    const run = async (): Promise<Social> => {
      const s = this.social;
      if (await can('getAuthorRelation')) {
        try {
          const r = await withBackoff(() => window.toy!.getAuthorRelation());
          if (r && r.status === 'ok' && r.data) { s.known = true; s.following = !!r.data.isFollowing; }
        } catch { /* not logged in / outside B站 */ }
      }
      if (bvid && (await can('getVideoUserActions'))) {
        try {
          const r = await withBackoff(() => window.toy!.getVideoUserActions({ videos: [{ bvid }] }));
          const it = r && Array.isArray(r.items) ? r.items[0] : undefined;
          if (it && it.status === 'ok') {
            s.tripleKnown = true;
            s.like = !!it.liked;
            s.coin = (it.coinCount ?? 0) > 0;
            s.fav = !!it.favorited;
          }
        } catch { /* same */ }
      }
      return s;
    };
    socialFlight = run().finally(() => { socialFlight = null; });
    return socialFlight;
  },

  /** Open a B站 page. Call directly from a tap handler; returns false if unsupported here. */
  navigate(type: 'video' | 'space', id: string): boolean {
    if (!this.canNavigate || !id || !window.toy) return false;
    try {
      void Promise.resolve(window.toy.navigate({ type, id, extra: { from: 'toy' } })).catch(() => {});
      return true;
    } catch {
      return false;
    }
  },

  /** The copy in localStorage: instant, used to show the title screen without waiting. */
  loadLocal(): Save {
    return readLocal();
  },

  /**
   * One cloud read per page load, merged over `local` (local preferences win, progress takes the
   * max). Resolves to null when there is nothing to merge: outside B站 the SDK call never settles,
   * so this must never be awaited on the boot path.
   */
  async loadCloud(local: Save): Promise<Save | null> {
    if (!(await can('getCloudStorage'))) return null;
    try {
      const got = await withBackoff(() => window.toy!.getCloudStorage([SAVE_KEY]));
      return got && got[SAVE_KEY] ? mergeSaves(local, decodeSave(got[SAVE_KEY])) : null;
    } catch {
      return null; // not logged in, offline, not inside B站 …
    }
  },

  /** Always saves locally; writes the cloud copy only when `cloud` is set (settlement). */
  async writeSave(s: Save, cloud: boolean): Promise<void> {
    writeLocal(s);
    if (!cloud || !(await can('setCloudStorage'))) return;
    try {
      await withBackoff(() => window.toy!.setCloudStorage({ [SAVE_KEY]: encodeSave(s) }));
    } catch { /* keep the local copy; next settlement tries again */ }
  },

  /** Report one finished run. Board 1: fans. Board 2: seconds left when a million was reached. */
  async submit(fans: number, millionAt: number | null): Promise<SubmitResult> {
    if (!(await can('submitScore'))) return 'offline';
    try {
      await withBackoff(() => window.toy!.submitScore({ board: BOARD_FANS, score: clampScore(fans) }));
      if (millionAt !== null) await withBackoff(() => window.toy!.submitScore({ board: BOARD_SPEED, score: clampScore(millionAt) }));
      rankCache.clear();
      return 'ok';
    } catch {
      return 'fail';
    }
  },

  /** Cached per board+period; pass force=true only from an explicit "refresh" tap. */
  async rank(board: number, period: Period, force = false): Promise<RankData | null> {
    const key = `${board}:${period}`;
    if (!force && rankCache.has(key)) return rankCache.get(key)!;
    if (!(await can('getRankList'))) return null;
    try {
      const list = await withBackoff(() => window.toy!.getRankList({ board, period, limit: 20 }));
      let mine: MyRank | null = null;
      if (await can('getMyRank')) {
        try { mine = await withBackoff(() => window.toy!.getMyRank({ board, period })); } catch { /* guest */ }
      }
      const data: RankData = { list: Array.isArray(list) ? list : [], mine };
      rankCache.set(key, data);
      return data;
    } catch {
      return null;
    }
  },

  /**
   * Share the Toy. In the app this opens the share sheet; on Web it returns a QR code image
   * (data URL) for the caller to display. Must be called from a user gesture.
   */
  async share(score: number): Promise<{ qr: string } | null> {
    const path = `index.html?s=${clampScore(score)}`;
    try {
      if (this.shareMode === 'share') { await timeout(window.toy!.share({ path }), 8000); return null; }
      if (this.shareMode === 'qr') {
        const r = await withBackoff(() => window.toy!.getQrCode({ path, size: 320 }));
        return r && r.base64 ? { qr: r.base64 } : null;
      }
    } catch { /* cancelled or unsupported */ }
    return null;
  },

  /** Follow container size / safe-area changes (App only). Returns an unsubscribe function. */
  async watchContainer(cb: (s: ContainerState) => void): Promise<() => void> {
    if (!(await can('onContainerChange'))) return () => {};
    try { return window.toy!.onContainerChange(cb); } catch { return () => {}; }
  },
};
