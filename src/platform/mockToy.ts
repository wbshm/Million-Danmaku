/**
 * Development-only stand-in for window.toy, enabled with ?mocktoy=1 (see main.ts; stripped from
 * production builds). ?mocktoy=limit makes the first cloud write hit the rate limit so the
 * back-off path can be exercised. ?mocktoy=fan starts already following with 三连 done; otherwise
 * the first navigate() call flips those on, as if the player went and did it. Calls are recorded
 * on window.__toyLog.
 */
import type { MyRank, Period, RankItem } from './toy';

export function installMockToy(mode: string): void {
  const store: Record<string, string> = {};
  const scores: Record<number, number> = {};
  const log: string[] = [];
  let limitLeft = mode === 'limit' ? 1 : 0;
  const fan = mode === 'fan';
  const me = { following: fan, liked: fan, coins: fan ? 2 : 0, favorited: fan };
  const names = ['弹幕大师', '百万UP本人', '一键三连', '下次一定', '火钳刘明', '前排围观', '硬币富翁', '鸽子王', '课代表', '路过的萌新'];
  const board = (b: number): RankItem[] => {
    const rows = names.map((nickname, i) => ({ nickname, score: b === 2 ? 150 - i * 13 : Math.round(9_000_000 / (i + 1) ** 1.6), avatar: '' }));
    if (scores[b] !== undefined) rows.push({ nickname: '我（模拟）', score: scores[b], avatar: '' });
    return rows.sort((a, c) => c.score - a.score).map((r, i) => ({ ...r, rank: i + 1 }));
  };
  const sdk = {
    isSupport: async (a: string) => ['share', 'getQrCode', 'getCloudStorage', 'setCloudStorage', 'submitScore', 'getRankList', 'getMyRank', 'onContainerChange', 'navigate', 'getAuthorProfile', 'getAuthorRelation', 'getVideoUserActions'].includes(a) && !(a === 'share' && mode !== 'app'),
    share: async (req: { path: string }) => { log.push(`share ${req.path}`); },
    navigate: async (req: { type: string; id: string }) => {
      log.push(`navigate ${req.type} ${req.id}`);
      me.following = true;
      if (req.type === 'video') { me.liked = true; me.coins = 2; me.favorited = true; }
    },
    getAuthorProfile: async () => { log.push('getAuthorProfile'); return { status: 'ok', data: { nickname: '模拟UP主', follower: 12345 } }; },
    getAuthorRelation: async () => { log.push('getAuthorRelation'); return { status: 'ok', data: { isFollowing: me.following, hasFanMedal: false } }; },
    getVideoUserActions: async (req: { videos: { bvid: string }[] }) => {
      log.push(`getVideoUserActions ${req.videos.map(v => v.bvid).join(',')}`);
      return { items: req.videos.map(v => ({ aid: 1, bvid: v.bvid, status: 'ok', liked: me.liked, coinCount: me.coins, favorited: me.favorited })) };
    },
    getQrCode: async (req?: { path?: string }) => {
      log.push(`getQrCode ${req?.path ?? ''}`);
      const c = document.createElement('canvas');
      c.width = c.height = 58;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 58, 58);
      g.fillStyle = '#000';
      for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) if ((x * 7 + y * 13 + x * y) % 3 === 0) g.fillRect(4 + x * 2, 4 + y * 2, 2, 2);
      return { base64: c.toDataURL('image/png'), url: `https://www.bilibili.com/toy/mock/${req?.path ?? ''}` };
    },
    getCloudStorage: async (keys?: string[]) => {
      log.push(`getCloudStorage ${keys?.join(',') ?? '*'}`);
      return Object.fromEntries(Object.entries(store).filter(([k]) => !keys || !keys.length || keys.includes(k)));
    },
    setCloudStorage: async (items: Record<string, string>) => {
      if (limitLeft > 0) {
        limitLeft--;
        log.push('setCloudStorage RATE-LIMITED');
        throw Object.assign(new Error('[ToySDK] 请求过于频繁，请稍后再试'), { type: 'http_error', code: 307044 });
      }
      for (const [k, v] of Object.entries(items)) {
        if (new TextEncoder().encode(v).length > 1024) throw Object.assign(new Error('[ToySDK] value too large'), { type: 'invalid_param' });
        store[k] = v;
      }
      log.push(`setCloudStorage ${Object.keys(items).join(',')}`);
    },
    submitScore: async (req: { board?: number; score: number }) => {
      const b = req.board ?? 1;
      if (!Number.isInteger(req.score) || req.score > 16777215 || req.score < -16777216) throw Object.assign(new Error('[ToySDK] bad score'), { type: 'invalid_param' });
      scores[b] = Math.max(scores[b] ?? -Infinity, req.score);
      log.push(`submitScore board=${b} score=${req.score}`);
      return { score: scores[b] };
    },
    getRankList: async (req?: { board?: number; period?: Period; limit?: number }) => {
      log.push(`getRankList board=${req?.board ?? 1} period=${req?.period ?? 'all'}`);
      return board(req?.board ?? 1).slice(0, req?.limit ?? 100);
    },
    getMyRank: async (req?: { board?: number }): Promise<MyRank> => {
      const b = req?.board ?? 1;
      const me = board(b).find(r => r.nickname === '我（模拟）');
      return me ? { ranked: true, rank: me.rank, score: me.score } : { ranked: false, rank: 0, score: 0 };
    },
    onContainerChange: (listener: (s: unknown) => void) => {
      listener({ viewport: { width: innerWidth, height: innerHeight }, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, changedFields: [] });
      return () => {};
    },
  };
  (window as unknown as { toy: unknown; __toyLog: string[] }).toy = sdk;
  (window as unknown as { __toyLog: string[] }).__toyLog = log;
}
