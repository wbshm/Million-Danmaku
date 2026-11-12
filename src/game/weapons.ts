/**
 * Weapons. Sixteen base weapons (levels 1–5) and eight fusion weapons (levels 1–3).
 * Ten of the base weapons simply fire on a timer; the six "trick" weapons (机制武器) each hang off
 * something else: the text of the danmaku, turning enemies into allies, kills, a placed barrier,
 * standing still, or grazing.
 * A fusion is offered at level-up once both of its ingredients are at FUSE_LEVEL or above; taking
 * it replaces the two ingredients with the fusion weapon, which frees a weapon slot.
 */
export type WeaponId =
  | 'like' | 'coin' | 'star' | 'triple' | 'share' | 'charge' | 'report' | 'block' | 'drone' | 'rewind'
  | 'keyword' | 'convert' | 'remix' | 'pin' | 'hold' | 'graze'
  | 'storm' | 'thunder' | 'chain' | 'jail' | 'squad' | 'control' | 'scene' | 'anchor';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Single character shown on the icon tile. */
  glyph: string;
  color: string;
  desc: string;
  fusion: boolean;
  /** 机制武器: triggered by something other than a plain timer. */
  trick?: boolean;
}

export const BASE_MAX = 5;
export const FUSION_MAX = 3;
/** Both ingredients must be at least this level before the fusion is offered. */
export const FUSE_LEVEL = 4;

export const WEAPONS: readonly WeaponDef[] = [
  { id: 'like', name: '点赞', glyph: '赞', color: '#fb7299', fusion: false, desc: '向最近的弹幕直射，高等级可穿透' },
  { id: 'coin', name: '投币', glyph: '币', color: '#ffd24a', fusion: false, desc: '抛出硬币，落地范围爆炸' },
  { id: 'star', name: '收藏', glyph: '藏', color: '#ffe680', fusion: false, desc: '星星环绕自身，碰到就伤害' },
  { id: 'triple', name: '一键三连', glyph: '连', color: '#5fe08a', fusion: false, desc: '朝目标扇形连发三枚' },
  { id: 'share', name: '转发', glyph: '转', color: '#00aeec', fusion: false, desc: '命中后在弹幕之间弹射' },
  { id: 'charge', name: '充电', glyph: '电', color: '#b48cff', fusion: false, desc: '闪电随机劈中屏幕上的弹幕' },
  { id: 'report', name: '举报', glyph: '举', color: '#ff7a5c', fusion: false, desc: '横扫自己所在的一整行' },
  { id: 'block', name: '屏蔽', glyph: '屏', color: '#aab4ff', fusion: false, desc: '身边一圈持续伤害，高等级减速' },
  { id: 'drone', name: '应援', glyph: '援', color: '#ff9ec0', fusion: false, desc: '应援灯牌跟着你，自动射击' },
  { id: 'rewind', name: '拖进度条', glyph: '拖', color: '#3fd6c6', fusion: false, desc: '飞出去再飞回来，沿途全部穿透' },
  { id: 'keyword', name: '关键词', glyph: '词', color: '#ff8fb8', fusion: false, trick: true, desc: '找出满屏弹幕里最常见的字，带这个字的全部受伤' },
  { id: 'convert', name: '洗白', glyph: '洗', color: '#7dffb0', fusion: false, trick: true, desc: '被它打败的弹幕变成粉丝弹幕，掉头撞向同行，还能挡子弹' },
  { id: 'remix', name: '鬼畜', glyph: '鬼', color: '#ffb347', fusion: false, trick: true, desc: '每打败几个弹幕，就把它剪成单字四散飞射' },
  { id: 'pin', name: '置顶', glyph: '顶', color: '#ffe14a', fusion: false, trick: true, desc: '在面朝方向的身前放一块置顶牌，拦住这一行的弹幕并持续伤害，还能挡子弹' },
  { id: 'hold', name: '憋大招', glyph: '憋', color: '#ff6b5c', fusion: false, trick: true, desc: '站着不动蓄力（最多三段），一动就放出冲击波；蓄满威力 +50%' },
  { id: 'graze', name: '极限走位', glyph: '极', color: '#9fe8ff', fusion: false, trick: true, desc: '每次擦弹（贴着弹幕或子弹掠过）都向附近弹幕射出反击镖' },
  { id: 'storm', name: '弹幕风暴', glyph: '暴', color: '#ff5fa2', fusion: true, desc: '七向穿透弹幕，高速连发' },
  { id: 'thunder', name: '氪金雷暴', glyph: '雷', color: '#ffc21a', fusion: true, desc: '多道落雷，每道都会大范围爆炸' },
  { id: 'chain', name: '星链', glyph: '链', color: '#fff0a0', fusion: true, desc: '五颗星星大圈环绕，并不断射出弹射星' },
  { id: 'jail', name: '小黑屋', glyph: '黑', color: '#8f9bff', fusion: true, desc: '大范围减速力场，并同时横扫三行' },
  { id: 'squad', name: '应援团', glyph: '团', color: '#ff7ab8', fusion: true, desc: '三块灯牌一起扔回旋进度条' },
  { id: 'control', name: '控评', glyph: '控', color: '#5dffa0', fusion: true, desc: '一次点名两个关键字并减速，被打败的全部倒戈成粉丝弹幕' },
  { id: 'scene', name: '名场面', glyph: '名', color: '#ffc46b', fusion: true, desc: '每次擦弹都把那条弹幕炸成单字，每打败两个弹幕再炸一次' },
  { id: 'anchor', name: '镇站之宝', glyph: '镇', color: '#fff27a', fusion: true, desc: '同时放三块置顶牌，每块都不断放出冲击波' },
];

export const WEAPON_BY_ID: Record<WeaponId, WeaponDef> = Object.fromEntries(WEAPONS.map(w => [w.id, w])) as Record<WeaponId, WeaponDef>;

export interface Recipe { a: WeaponId; b: WeaponId; out: WeaponId }

export const RECIPES: readonly Recipe[] = [
  { a: 'like', b: 'triple', out: 'storm' },
  { a: 'coin', b: 'charge', out: 'thunder' },
  { a: 'star', b: 'share', out: 'chain' },
  { a: 'report', b: 'block', out: 'jail' },
  { a: 'drone', b: 'rewind', out: 'squad' },
  { a: 'keyword', b: 'convert', out: 'control' },
  { a: 'remix', b: 'graze', out: 'scene' },
  { a: 'pin', b: 'hold', out: 'anchor' },
];

export const maxLevel = (id: WeaponId): number => (WEAPON_BY_ID[id].fusion ? FUSION_MAX : BASE_MAX);
export const recipeOf = (id: WeaponId): Recipe | undefined => RECIPES.find(r => r.a === id || r.b === id || r.out === id);
export const partnerOf = (id: WeaponId): WeaponId | undefined => {
  const r = RECIPES.find(q => q.a === id || q.b === id);
  return r ? (r.a === id ? r.b : r.a) : undefined;
};

export interface WeaponStats {
  dmg: number;
  /** Seconds between activations (before haste). For orbiting stars: per-enemy hit cooldown. */
  cd: number;
  /**
   * Projectiles / stars / strikes / drones per activation. Also: keywords picked (关键词), kills per
   * burst (鬼畜), blocks on the field (置顶), charge stages (憋大招), darts per graze (极限走位).
   */
  count: number;
  pierce: number;
  /**
   * Explosion, orbit, aura or strike radius; for beams the half-height of the row band; for
   * 极限走位 the extra graze range.
   */
  radius: number;
  bounces: number;
  /** Speed multiplier applied to enemies inside an aura (1 = none). */
  slow: number;
  /** Secondary attack of a fusion weapon. */
  dmg2: number;
  cd2: number;
  /** Seconds a placed block lasts. */
  dur: number;
}

const S = (o: Partial<WeaponStats>): WeaponStats => ({ dmg: 0, cd: 1, count: 1, pierce: 0, radius: 0, bounces: 0, slow: 1, dmg2: 0, cd2: 0, dur: 0, ...o });

export function weaponStats(id: WeaponId, lvl: number): WeaponStats {
  const l = lvl - 1;
  switch (id) {
    case 'like': return S({ dmg: 3 + 1.5 * l, cd: 0.5 * Math.pow(0.92, l), pierce: lvl >= 5 ? 2 : lvl >= 3 ? 1 : 0 });
    case 'triple': return S({ dmg: 2 + l, cd: 0.95 * Math.pow(0.94, l), count: lvl >= 4 ? 5 : 3 });
    case 'coin': return S({ dmg: 6 + 3 * l, cd: 1.6 * Math.pow(0.93, l), count: lvl >= 4 ? 2 : 1, radius: 20 + 3 * l });
    case 'star': return S({ dmg: 2 + l, cd: 0.45, count: 2 + (lvl >= 2 ? 1 : 0) + (lvl >= 4 ? 1 : 0), radius: 26 + 2 * l });
    case 'share': return S({ dmg: 4 + 1.5 * l, cd: 1.05 * Math.pow(0.93, l), bounces: 2 + lvl });
    case 'charge': return S({ dmg: 8 + 4 * l, cd: 2.2 * Math.pow(0.92, l), count: 1 + Math.floor(lvl / 2), radius: 14 });
    case 'report': return S({ dmg: 5 + 2.5 * l, cd: 2.3 * Math.pow(0.93, l), radius: lvl >= 5 ? 13 : lvl >= 3 ? 10 : 7 });
    case 'block': return S({ dmg: 1.5 + 0.8 * l, cd: 0.5, radius: 24 + 3 * l, slow: lvl >= 3 ? 0.7 : 1 });
    case 'drone': return S({ dmg: 2 + l, cd: 0.8 * Math.pow(0.93, l), count: 1 + (lvl >= 3 ? 1 : 0) + (lvl >= 5 ? 1 : 0) });
    case 'rewind': return S({ dmg: 4 + 2 * l, cd: 1.8 * Math.pow(0.93, l), count: lvl >= 4 ? 2 : 1 });
    // 关键词: dmg to every danmaku containing the picked character(s).
    case 'keyword': return S({ dmg: 4 + 2 * l, cd: 2.8 * Math.pow(0.93, l), count: lvl >= 5 ? 2 : 1, slow: lvl >= 3 ? 0.6 : 1 });
    // 洗白: dmg2 / pierce are the ram damage and the number of rams of the ally it leaves behind.
    case 'convert': return S({ dmg: 6 + 3 * l, cd: 1.0 * Math.pow(0.93, l), count: lvl >= 3 ? 2 : 1, dmg2: 5 + 2.5 * l, pierce: 3 + lvl });
    case 'remix': return S({ dmg: 3 + 1.5 * l, count: lvl >= 5 ? 2 : lvl >= 3 ? 3 : 4, pierce: lvl >= 4 ? 1 : 0 });
    // 置顶: dmg per 0.4 s tick to whatever is held against the block.
    case 'pin': return S({ dmg: 2 + l, cd: 5.5 * Math.pow(0.95, l), count: lvl >= 4 ? 2 : 1, dur: 4 + 0.5 * l });
    // 憋大招: dmg per charged stage, cd = seconds per stage, radius grows 9 px per stage.
    case 'hold': return S({ dmg: 7 + 3.5 * l, cd: 0.7, count: 3, radius: 24 + 2 * l });
    case 'graze': return S({ dmg: 5 + 2.5 * l, count: 1 + (lvl >= 3 ? 1 : 0) + (lvl >= 5 ? 1 : 0), radius: 1 + Math.floor(l / 2) });
    case 'storm': return S({ dmg: 7 + 3 * l, cd: 0.42, count: lvl >= 3 ? 9 : 7, pierce: 2 });
    case 'thunder': return S({ dmg: 16 + 7 * l, cd: 1.5, count: 3 + lvl, radius: 24 });
    case 'chain': return S({ dmg: 5 + 2 * l, cd: 0.35, count: lvl >= 3 ? 6 : 5, radius: 40, bounces: 8, dmg2: 11 + 4 * l, cd2: 0.6 });
    case 'jail': return S({ dmg: 4 + 2 * l, cd: 0.5, radius: 44, slow: 0.5, dmg2: 12 + 5 * l, cd2: 1.9, count: 3 });
    case 'squad': return S({ dmg: 8 + 3 * l, cd: 1.2, count: lvl >= 3 ? 4 : 3 });
    case 'control': return S({ dmg: 9 + 4 * l, cd: 2.1, count: 2, slow: 0.6, dmg2: 8 + 3 * l, pierce: 6 });
    case 'scene': return S({ dmg: 8 + 3 * l, count: 2, pierce: 1, radius: 3 });
    case 'anchor': return S({ dmg: 4 + 2 * l, cd: 3.2, count: 3, dur: 7, dmg2: 10 + 4 * l, cd2: 1.3, radius: 30 });
  }
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** One-line description of what the given level adds, for the level-up card. */
export function weaponLevelText(id: WeaponId, lvl: number): string {
  if (lvl === 1) return WEAPON_BY_ID[id].desc;
  const s = weaponStats(id, lvl);
  const p = weaponStats(id, lvl - 1);
  const parts: string[] = [`伤害 ${fmt(p.dmg)}→${fmt(s.dmg)}`];
  if (s.count < p.count) parts.push('触发更频繁');
  else if (s.count > p.count) parts.push(`数量 +${s.count - p.count}`);
  if (s.dur !== p.dur) parts.push('持续更久');
  if (s.pierce !== p.pierce) parts.push('穿透 +1');
  if (s.bounces !== p.bounces) parts.push('弹射 +1');
  if (s.radius !== p.radius) parts.push('范围扩大');
  if (s.slow !== p.slow) parts.push('附带减速');
  if (s.cd !== p.cd) parts.push('攻速提升');
  if (s.dmg2 !== p.dmg2) parts.push('副攻击增强');
  return parts.join('，');
}

/** "合成 一键三连Lv4 → 弹幕风暴" for a base weapon that has a recipe. */
export function recipeHint(id: WeaponId, fuseLevel = FUSE_LEVEL): string {
  const partner = partnerOf(id);
  const r = recipeOf(id);
  if (!partner || !r) return '';
  return `合成 ${WEAPON_BY_ID[partner].name}Lv${fuseLevel} → ${WEAPON_BY_ID[r.out].name}`;
}
