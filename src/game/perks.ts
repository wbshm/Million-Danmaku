/**
 * 三连福利: start-of-run bonuses for having liked / coined / favourited the author's video.
 * Pure data here; the platform layer decides which flags are set.
 */
export interface Perks {
  like: boolean;
  coin: boolean;
  fav: boolean;
}

export const NO_PERKS: Perks = { like: false, coin: false, fav: false };

export const PERK_LIKE_HP = 1;
export const PERK_COIN_COINS = 10;
export const PERK_FAV_REROLLS = 1;
export const PERK_TRIPLE_MULT = 0.3;

export const PERK_ROWS: readonly { key: keyof Perks; name: string; desc: string }[] = [
  { key: 'like', name: '点赞', desc: `生命上限 +${PERK_LIKE_HP}` },
  { key: 'coin', name: '投币', desc: `开局 +${PERK_COIN_COINS} 硬币` },
  { key: 'fav', name: '收藏', desc: '每次商店免费刷新 1 次' },
];

export const isTriple = (p: Perks): boolean => p.like && p.coin && p.fav;
export const perkCount = (p: Perks): number => Number(p.like) + Number(p.coin) + Number(p.fav);

/** Compact form for the save file: like = 1, coin = 2, fav = 4. */
export function perksToBits(p: Perks): number {
  return (p.like ? 1 : 0) | (p.coin ? 2 : 0) | (p.fav ? 4 : 0);
}

export function perksFromBits(bits: number): Perks {
  return { like: (bits & 1) !== 0, coin: (bits & 2) !== 0, fav: (bits & 4) !== 0 };
}
