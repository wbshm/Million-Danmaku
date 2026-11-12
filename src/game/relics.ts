/**
 * Shop relics: the "百万" number engine. Three flavours:
 *  - add:  flat fans or additive multiplier terms (cheap, linear)
 *  - mul:  multiplicative terms (expensive, exponential)
 *  - util: economy / survival
 * Their numeric effects are applied in run.ts (recalc / scoreCtx / hooks).
 */
export type RelicId =
  | 'title' | 'cover' | 'trend'
  | 'manners' | 'comment' | 'daily' | 'badge' | 'savings' | 'monitor'
  | 'hot' | 'ranking' | 'allin' | 'comboMaster' | 'top100' | 'infamy' | 'retention' | 'fast'
  | 'ad' | 'finance' | 'drumstick' | 'revive' | 'lucky';

export type RelicKind = 'add' | 'mul' | 'util';

export interface RelicDef {
  id: RelicId;
  name: string;
  kind: RelicKind;
  price: number;
  /** Can be bought more than once (price rises 50% per copy owned). */
  stack: boolean;
  desc: string;
}

export const RELICS: readonly RelicDef[] = [
  { id: 'title', name: '标题党', kind: 'add', price: 8, stack: true, desc: '每次涨粉的基础值 +2' },
  { id: 'cover', name: '封面精修', kind: 'add', price: 16, stack: true, desc: '每次涨粉的基础值 +5' },
  { id: 'trend', name: '蹭热点', kind: 'add', price: 14, stack: false, desc: '彩色、大字弹幕和 Boss 基础值 +15' },
  { id: 'manners', name: '弹幕礼仪', kind: 'add', price: 10, stack: true, desc: '倍率 +0.5' },
  { id: 'comment', name: '高质量评论', kind: 'add', price: 18, stack: true, desc: '倍率 +1' },
  { id: 'daily', name: '日更', kind: 'add', price: 20, stack: false, desc: '每打完一波，倍率永久 +0.3' },
  { id: 'badge', name: '粉丝牌', kind: 'add', price: 22, stack: false, desc: '每持有一件遗物，倍率 +0.2' },
  { id: 'savings', name: '小金库', kind: 'add', price: 15, stack: false, desc: '每持有 10 硬币，倍率 +0.1（最多 +3）' },
  { id: 'monitor', name: '课代表', kind: 'add', price: 18, stack: false, desc: '经验 +30%；每次升级，倍率 +0.1' },
  { id: 'hot', name: '上热门', kind: 'mul', price: 25, stack: true, desc: '倍率 ×1.5' },
  { id: 'ranking', name: '全站排行', kind: 'mul', price: 45, stack: true, desc: '倍率 ×2' },
  { id: 'allin', name: '孤注一掷', kind: 'mul', price: 30, stack: false, desc: '生命上限变为 1，倍率 ×3' },
  { id: 'comboMaster', name: '连击达人', kind: 'mul', price: 20, stack: false, desc: '连击加成的上限翻倍（×2→×3）' },
  { id: 'top100', name: '百大UP', kind: 'mul', price: 28, stack: false, desc: '满血时倍率 ×1.6' },
  { id: 'infamy', name: '黑红也是红', kind: 'mul', price: 22, stack: false, desc: '本局每受伤一次，倍率 ×1.25（最多 6 次）' },
  { id: 'retention', name: '完播率', kind: 'mul', price: 24, stack: false, desc: '大字弹幕和 Boss 的涨粉 ×3' },
  { id: 'fast', name: '二倍速', kind: 'mul', price: 26, stack: false, desc: '弹幕飞行速度 +20%，倍率 ×1.8' },
  { id: 'ad', name: '广告商单', kind: 'util', price: 12, stack: true, desc: '每波结束额外 +10 硬币' },
  { id: 'finance', name: '理财', kind: 'util', price: 14, stack: false, desc: '进入商店时，每 5 硬币得 1 硬币利息（最多 10）' },
  { id: 'drumstick', name: '加鸡腿', kind: 'util', price: 12, stack: true, desc: '生命上限 +1，并回复 2 点生命' },
  { id: 'revive', name: '复活币', kind: 'util', price: 35, stack: false, desc: '生命归零时满血复活一次' },
  { id: 'lucky', name: '欧皇', kind: 'util', price: 15, stack: false, desc: '每次商店免费刷新一次，稀有遗物更常出现' },
];

export const RELIC_BY_ID: Record<RelicId, RelicDef> = Object.fromEntries(RELICS.map(r => [r.id, r])) as Record<RelicId, RelicDef>;

export function relicPrice(def: RelicDef, owned: number): number {
  return Math.round(def.price * (1 + 0.5 * owned));
}
