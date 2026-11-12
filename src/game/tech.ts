/**
 * 科技树: permanent upgrades bought between runs with 灵感 (earned at every settlement).
 * Three branches of five tiers; a node opens once the node above it has at least one level.
 *
 * Only two things are saved: the total 灵感 ever earned and the level of every node. What is left
 * to spend is derived (earned − cost of what is owned), so merging a local and a cloud copy can
 * never mint currency.
 */
import { WAVES } from './balance';
import { FUSE_LEVEL } from './weapons';

export interface TechDef {
  id: string;
  name: string;
  glyph: string;
  /** Cost of each level, in order; its length is the node's maximum level. */
  costs: readonly number[];
  /** Effect of one level. */
  desc: string;
}

export const BRANCHES: readonly { name: string; color: string; hint: string }[] = [
  { name: '内容', color: '#fb7299', hint: '打得更疼' },
  { name: '运营', color: '#ffd24a', hint: '赚得更多' },
  { name: '体质', color: '#5fe08a', hint: '活得更久' },
];
export const TIERS = 5;

const T1 = [2, 4, 6], T2 = [4, 6, 9], T3 = [6, 9, 12], T4 = [10, 16], T5 = [25];

/** Index = branch * TIERS + tier. */
export const TECHS: readonly TechDef[] = [
  { id: 'edit', name: '剪辑功底', glyph: '剪', costs: T1, desc: '所有伤害 +4%' },
  { id: 'output', name: '稳定更新', glyph: '更', costs: T2, desc: '攻击间隔 -3%' },
  { id: 'viral', name: '爆款体质', glyph: '爆', costs: T3, desc: '暴击率 +3%' },
  { id: 'topics', name: '选题会', glyph: '选', costs: T4, desc: '每局升级时可以「换一批」1 次' },
  { id: 'secret', name: '独家秘方', glyph: '秘', costs: T5, desc: '合成只需要两把武器都到 Lv3' },

  { id: 'fund', name: '启动资金', glyph: '资', costs: T1, desc: '开局硬币 +2' },
  { id: 'sponsor', name: '长期商单', glyph: '单', costs: T2, desc: '每打完一波多得 1 硬币' },
  { id: 'base', name: '粉丝基础', glyph: '基', costs: T3, desc: '开局倍率 +0.1' },
  { id: 'haggle', name: '砍价', glyph: '砍', costs: T4, desc: '商店价格 -5%' },
  { id: 'algo', name: '流量密码', glyph: '码', costs: T5, desc: '每次涨粉的基础值 +1' },

  { id: 'apm', name: '手速', glyph: '手', costs: T1, desc: '移动速度 +3%' },
  { id: 'pull', name: '路人缘', glyph: '缘', costs: T2, desc: '拾取范围 +12%' },
  { id: 'graze', name: '擦弹大师', glyph: '擦', costs: T3, desc: '擦弹范围 +1，擦弹充能 +50%' },
  { id: 'night', name: '熬夜冠军', glyph: '熬', costs: [20], desc: '生命上限 +1' },
  { id: 'opener', name: '开场高能', glyph: '高', costs: T5, desc: '开局专属技能直接充满' },
];

export const noTech = (): number[] => new Array<number>(TECHS.length).fill(0);

/** What the bought levels do inside a run. */
export interface TechFx {
  dmg: number;
  /** Multiplier on weapon cooldowns. */
  haste: number;
  crit: number;
  lvRerolls: number;
  fuseLevel: number;
  coins: number;
  waveCoins: number;
  addMult: number;
  /** Multiplier on shop prices. */
  price: number;
  addBase: number;
  speed: number;
  magnet: number;
  grazeRange: number;
  grazeEnergy: number;
  hp: number;
  ultStart: boolean;
}

export function techFx(levels: readonly number[]): TechFx {
  const l = (i: number): number => levels[i] ?? 0;
  return {
    dmg: 1 + 0.04 * l(0), haste: Math.pow(0.97, l(1)), crit: 0.03 * l(2), lvRerolls: l(3), fuseLevel: FUSE_LEVEL - Math.min(1, l(4)),
    coins: 2 * l(5), waveCoins: l(6), addMult: 0.1 * l(7), price: 1 - 0.05 * l(8), addBase: l(9),
    speed: 1 + 0.03 * l(10), magnet: 1 + 0.12 * l(11), grazeRange: l(12), grazeEnergy: 1 + 0.5 * l(12), hp: l(13), ultStart: l(14) > 0,
  };
}

export const NO_TECH: TechFx = techFx(noTech());
export const maxTech = (): number[] => TECHS.map(t => t.costs.length);

/** 灵感 already spent on the given levels. */
export function techSpent(levels: readonly number[]): number {
  let n = 0;
  TECHS.forEach((t, i) => { for (let k = 0; k < (levels[i] ?? 0) && k < t.costs.length; k++) n += t.costs[k]; });
  return n;
}

export const techLeft = (earned: number, levels: readonly number[]): number => Math.max(0, earned - techSpent(levels));

/** Price of the next level, or null when the node is maxed. */
export function techCost(i: number, levels: readonly number[]): number | null {
  const t = TECHS[i];
  const lvl = levels[i] ?? 0;
  return t && lvl < t.costs.length ? t.costs[lvl] : null;
}

/** The node above it in the branch has been bought (tier 0 is always open). */
export const techOpen = (i: number, levels: readonly number[]): boolean => i % TIERS === 0 || (levels[i - 1] ?? 0) > 0;

export function canBuyTech(i: number, levels: readonly number[], earned: number): boolean {
  const cost = techCost(i, levels);
  return cost !== null && techOpen(i, levels) && techLeft(earned, levels) >= cost;
}

/** Buy one level in place; returns false (and changes nothing) if it is locked, maxed or unaffordable. */
export function buyTech(i: number, levels: number[], earned: number): boolean {
  if (!canBuyTech(i, levels, earned)) return false;
  levels[i] = (levels[i] ?? 0) + 1;
  return true;
}

export const anyTechAffordable = (levels: readonly number[], earned: number): boolean => TECHS.some((_, i) => canBuyTech(i, levels, earned));

/** One digit per node. */
export const encodeTech = (levels: readonly number[]): string => TECHS.map((_, i) => String(levels[i] ?? 0)).join('');

export function decodeTech(raw: unknown): number[] {
  const out = noTech();
  if (typeof raw !== 'string') return out;
  TECHS.forEach((t, i) => {
    const v = raw.charCodeAt(i) - 48;
    if (v >= 0 && v <= 9) out[i] = Math.min(t.costs.length, v);
  });
  return out;
}

export const mergeTech = (a: readonly number[], b: readonly number[]): number[] => TECHS.map((_, i) => Math.max(a[i] ?? 0, b[i] ?? 0));

/** 灵感 earned by one finished run: something for showing up, more for going further. */
export function runInsight(r: { wave: number; win: boolean; fans: number; bossKills: number }): number {
  const cleared = r.win ? WAVES : Math.max(0, r.wave - 1);
  const f = r.fans;
  const tier = f >= 5e6 ? 12 : f >= 1e6 ? 9 : f >= 3e5 ? 6 : f >= 1e5 ? 4 : f >= 1e4 ? 2 : f >= 1e3 ? 1 : 0;
  return 2 + cleared + tier + 2 * r.bossKills;
}
