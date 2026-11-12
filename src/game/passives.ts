export type PassiveId = 'speed' | 'magnet' | 'haste' | 'power' | 'hp' | 'crit' | 'xp';

export interface PassiveDef {
  id: PassiveId;
  name: string;
  glyph: string;
  color: string;
  desc: string;
}

export const PASSIVES: readonly PassiveDef[] = [
  { id: 'speed', name: '走位', glyph: '走', color: '#7fd4ff', desc: '移动速度 +8%' },
  { id: 'magnet', name: '吸粉体质', glyph: '吸', color: '#ff9ec0', desc: '拾取范围 +30%' },
  { id: 'haste', name: '高产', glyph: '产', color: '#9be88f', desc: '攻击间隔 -8%' },
  { id: 'power', name: '流量', glyph: '流', color: '#ffb35a', desc: '伤害 +15%' },
  { id: 'hp', name: '大心脏', glyph: '心', color: '#ff6b6b', desc: '生命上限 +1，并回复 1 点' },
  { id: 'crit', name: '欧气', glyph: '欧', color: '#ffe680', desc: '暴击率 +8%（暴击伤害翻倍）' },
  { id: 'xp', name: '好学', glyph: '学', color: '#c9a6ff', desc: '获得经验 +15%' },
];

export const PASSIVE_BY_ID: Record<PassiveId, PassiveDef> = Object.fromEntries(PASSIVES.map(p => [p.id, p])) as Record<PassiveId, PassiveDef>;
