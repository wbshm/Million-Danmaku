import type { WeaponId } from './weapons';

export type UltId = 'haste' | 'rain' | 'shield' | 'surge' | 'hype' | 'freeze' | 'nova';

export interface CharDef {
  id: string;
  name: string;
  weapon: WeaponId;
  /** Optional second starting weapon. */
  weapon2?: WeaponId;
  hp: number;
  coins: number;
  /** Added to the additive multiplier terms. */
  addMult: number;
  /** Multipliers on move speed, pickup range and damage (1 = no change). */
  speed: number;
  magnet: number;
  dmg: number;
  /** Extra coins at the end of every wave. */
  waveCoins: number;
  /** Best score needed to unlock; 0 = no score requirement. */
  unlock: number;
  /** Unlocked by following the Toy's author instead of by score. */
  follow: boolean;
  desc: string;
  /** Exclusive skill: charged by kills, fired with the skill button / Space. */
  ult: UltId;
  ultName: string;
  ultGlyph: string;
  ultDesc: string;
  /** Sprite palette swap. */
  shirt: string;
  hair: string;
  phones: string;
}

const base = { hp: 3, coins: 0, addMult: 0, speed: 1, magnet: 1, dmg: 1, waveCoins: 0, unlock: 0, follow: false };

export const CHARS: readonly CharDef[] = [
  { ...base, ult: 'haste', ultName: '求三连', ultGlyph: '求', ultDesc: '6 秒内所有武器攻速翻倍', id: 'newbie', name: '萌新UP', weapon: 'like', desc: '起手「点赞」，3 点生命', shirt: '#fb7299', hair: '#5b4a8a', phones: '#00aeec' },
  { ...base, ult: 'rain', ultName: '撒币', ultGlyph: '撒', ultDesc: '向 10 个弹幕扔硬币炸弹，并得 5 硬币', id: 'rich', name: '硬币富翁', weapon: 'coin', coins: 15, unlock: 10_000, desc: '起手「投币」，自带 15 硬币', shirt: '#ffd24a', hair: '#7a4a2a', phones: '#f4f4f4' },
  { ...base, ult: 'shield', ultName: '粉丝护体', ultGlyph: '护', ultDesc: '4 秒无敌，并吸来全场掉落', id: 'fan', name: '铁粉', weapon: 'convert', weapon2: 'star', magnet: 1.5, follow: true, desc: '起手「洗白」和「收藏」，拾取范围 +50%', shirt: '#00aeec', hair: '#2b2b45', phones: '#fb7299' },
  { ...base, ult: 'surge', ultName: '满电', ultGlyph: '满', ultDesc: '闪电劈中屏幕上每一个弹幕', id: 'charger', name: '充电大佬', weapon: 'charge', waveCoins: 4, follow: true, desc: '起手「充电」，每波多得 4 硬币', shirt: '#b48cff', hair: '#ffe680', phones: '#ffd24a' },
  { ...base, ult: 'hype', ultName: '三连暴击', ultGlyph: '暴', ultDesc: '8 秒内涨粉翻倍', id: 'combo', name: '三连仙人', weapon: 'triple', hp: 2, addMult: 0.5, unlock: 100_000, desc: '起手「一键三连」，倍率 +0.5，仅 2 点生命', shirt: '#5fe08a', hair: '#2a6a8a', phones: '#f4f4f4' },
  { ...base, ult: 'freeze', ultName: '上热搜', ultGlyph: '热', ultDesc: '清空敌方子弹，全场弹幕定身 4 秒', id: 'sharer', name: '转发达人', weapon: 'share', weapon2: 'graze', speed: 1.15, addMult: 0.3, unlock: 300_000, desc: '起手「转发」和「极限走位」，移速 +15%，倍率 +0.3', shirt: '#ff8a5c', hair: '#3a2a2a', phones: '#5fe08a' },
  { ...base, ult: 'nova', ultName: '百大光环', ultGlyph: '百', ultDesc: '冲击波重创全屏弹幕，敌方子弹变经验', id: 'top', name: '百大UP', weapon: 'like', weapon2: 'triple', unlock: 1_000_000, desc: '起手「点赞」和「一键三连」，正好是一对合成配方', shirt: '#f4f4f4', hair: '#c0392b', phones: '#ffd24a' },
];

/** `following`: whether the player currently follows the Toy's author. */
export function unlockedChars(best: number, following = false): boolean[] {
  return CHARS.map(c => (c.follow ? following : best >= c.unlock));
}
