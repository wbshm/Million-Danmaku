import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { BOSS_WAVES, H, LANES, MILLION, SCORE_CAP, TOTAL_TIME, W, WAVES, textWidth, waveCfg, waveDuration } from '../src/game/balance';
import { playBot } from '../src/game/bot';
import { CHARS, unlockedChars } from '../src/game/chars';
import { NO_PERKS, isTriple, perkCount, perksFromBits, perksToBits, type Perks } from '../src/game/perks';
import { RELICS, relicPrice, RELIC_BY_ID } from '../src/game/relics';
import { PIN_VULN, buyRelic, chooseUpgrade, createRun, currentMultiplier, damageShares, dronePos, leaveShop, readyFusions, recalc, rerollChoices, rerollShop, rollChoices, scoreCtx, stepRun, ultReady, useUlt, type Enemy, type Run } from '../src/game/run';
import { TECHS, TIERS, buyTech, canBuyTech, decodeTech, encodeTech, maxTech, mergeTech, noTech, runInsight, techCost, techFx, techLeft, techOpen, techSpent } from '../src/game/tech';
import { clampScore, comboMult, decodeScore, encodeScore, fanGain, multiplier, type ScoreCtx } from '../src/game/scoring';
import { FUSE_LEVEL, RECIPES, WEAPONS, WEAPON_BY_ID, maxLevel, partnerOf, recipeHint, weaponStats, type WeaponId } from '../src/game/weapons';

const ctx = (o: Partial<ScoreCtx> = {}): ScoreCtx => ({ addBase: 0, addMult: 0, mulMult: 1, combo: 0, comboCap: 1, eliteBonus: 0, eliteMul: 1, ...o });

/** Put a stationary danmaku on the field. */
function dummy(run: Run, x: number, y: number, hp = 1e9): Enemy {
  const e: Enemy = {
    id: run.nextId++, kind: 'scroll', text: '草', x, y, w: 12, h: 12, scale: 1, vx: 0, hp, maxHp: hp, base: 1, tier: 0, xp: 0, coins: 0,
    color: '#ffffff', t: 5, life: 0, shootCd: 0, flash: 0, starCd: 0, grazeCd: 0, mark: 0, held: 0, slow: 0, slowK: 1, dead: false, boss: 0, atk: 0, angle: 0, mode: 0, modeT: 0, ty: 0, homeY: y, vy: 0, n: 0,
  };
  run.enemies.push(e);
  return e;
}

/** A run with exactly these weapons and nothing spawning on its own for a while. */
function lab(weapons: [WeaponId, number][], charIdx = 0): Run {
  const run = createRun(5, charIdx);
  run.weapons = weapons.map(([id, lvl]) => ({ id, lvl, cd: 0.05, cd2: 0.05 }));
  run.spawnCd = 1e9;
  run.player.iframes = 1e9;
  return run;
}

const tick = (run: Run, seconds: number): void => {
  for (let i = 0; i < seconds * 60 && run.phase === 'play'; i++) stepRun(run, 1 / 60, 0, 0);
};

/** Advance a fresh run until the first shop opens, taking the first upgrade each time. */
function toShop(seed: number, perks: Perks = NO_PERKS): Run {
  const run = createRun(seed, 0, perks);
  run.player.hp = run.stats.maxHp = 99; // can't die on the way
  for (let i = 0; i < 100_000 && run.phase !== 'shop'; i++) {
    if (run.phase === 'play') { stepRun(run, 1 / 30, 0, 0); run.player.hp = 99; }
    else if (run.phase === 'levelup') chooseUpgrade(run, 0);
    else break;
  }
  return run;
}

describe('rng', () => {
  it('is reproducible from the seed and stays in [0,1)', () => {
    const a = new Rng(42), b = new Rng(42), c = new Rng(43);
    const xs = Array.from({ length: 200 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 200 }, () => b.next()));
    expect(xs).not.toEqual(Array.from({ length: 200 }, () => c.next()));
    expect(xs.every(v => v >= 0 && v < 1)).toBe(true);
  });
});

describe('scoring', () => {
  it('multiplier = (1 + additive) × multiplicative × combo', () => {
    expect(multiplier(ctx())).toBe(1);
    expect(multiplier(ctx({ addMult: 1.5, mulMult: 3 }))).toBeCloseTo(7.5);
    expect(multiplier(ctx({ addMult: 1, mulMult: 2, combo: 25 }))).toBeCloseTo(2 * 2 * 1.5);
  });
  it('additive terms are summed before the multiplicative ones apply', () => {
    // (1 + 0.5 + 0.5) × 1.5 × 1.5 = 4.5, not 1 × 1.5 × 1.5 + 1
    expect(multiplier(ctx({ addMult: 1, mulMult: 2.25 }))).toBeCloseTo(4.5);
  });
  it('combo bonus is capped', () => {
    expect(comboMult(50, 1)).toBe(2);
    expect(comboMult(5000, 1)).toBe(2);
    expect(comboMult(5000, 2)).toBe(3);
  });
  it('fan gain floors, never drops below 1, and applies tier bonuses', () => {
    expect(fanGain(1, 0, ctx())).toBe(1);
    expect(fanGain(3, 0, ctx({ addBase: 2, addMult: 0.5 }))).toBe(7); // (3+2)×1.5 = 7.5
    const c = ctx({ eliteBonus: 15, eliteMul: 3 });
    expect(fanGain(10, 0, c)).toBe(10);
    expect(fanGain(10, 1, c)).toBe(25);
    expect(fanGain(10, 2, c)).toBe(75);
  });
  it('clamps to the leaderboard range', () => {
    expect(clampScore(123.9)).toBe(123);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(1e12)).toBe(SCORE_CAP);
    expect(clampScore(Infinity)).toBe(SCORE_CAP);
    expect(clampScore(NaN)).toBe(0);
    expect(SCORE_CAP).toBe(16_777_215);
    expect(MILLION).toBeLessThan(SCORE_CAP);
  });
});

describe('waves', () => {
  it('get harder every wave', () => {
    for (let w = 2; w <= WAVES; w++) {
      const a = waveCfg(w - 1), b = waveCfg(w);
      expect(b.hp).toBeGreaterThan(a.hp);
      expect(b.interval).toBeLessThanOrEqual(a.interval);
      expect(b.speed).toBeGreaterThan(a.speed);
      expect(b.base).toBeGreaterThanOrEqual(a.base);
    }
  });
  it('has a different boss every fifth wave of twenty', () => {
    expect(WAVES).toBe(20);
    expect(BOSS_WAVES).toEqual([5, 10, 15, 20]);
    expect(BOSS_WAVES.map(w => waveCfg(w).boss)).toEqual([1, 2, 3, 4]);
    expect(waveCfg(4).boss).toBe(0);
    expect(TOTAL_TIME).toBe(16 * 30 + 4 * 40);
    // The second half keeps getting harder, but far more gently than the first.
    expect(waveCfg(20).hp / waveCfg(10).hp).toBeLessThan(waveCfg(10).hp / waveCfg(1).hp);
    expect(waveDuration(5)).toBe(40);
  });
  it('codes any score into the leaderboard range without changing the order', () => {
    for (const n of [0, 1, 9999, 999_999]) expect(encodeScore(n)).toBe(n);
    const xs = [0, 5, 999_999, 1_000_000, 1_000_009, 1_000_010, 16_777_215, 18_000_000, 123_456_789, 9.9e9, 7.62e10, 1e15];
    for (let i = 1; i < xs.length; i++) expect(encodeScore(xs[i])).toBeGreaterThanOrEqual(encodeScore(xs[i - 1]));
    expect(encodeScore(18_000_000)).toBeGreaterThan(encodeScore(16_777_215));
    for (const n of xs) {
      expect(encodeScore(n)).toBeLessThanOrEqual(SCORE_CAP);
      expect(Number.isInteger(encodeScore(n))).toBe(true);
      // Six significant digits survive the round trip.
      expect(Math.abs(decodeScore(encodeScore(n)) - n)).toBeLessThanOrEqual(n * 1e-5);
    }
    expect(decodeScore(encodeScore(18_345_678))).toBe(18_345_600);
    expect(encodeScore(Infinity)).toBe(SCORE_CAP);
    expect(encodeScore(NaN)).toBe(0);
  });
  it('measures text the way the font does', () => {
    expect(textWidth('草')).toBe(12);
    expect(textWidth('awsl')).toBe(24);
    expect(textWidth('就这？', 2)).toBe(72);
    expect(LANES).toBeGreaterThan(20);
  });
});

describe('data tables', () => {
  it('relic and weapon ids are unique and numbers are sane', () => {
    expect(new Set(RELICS.map(r => r.id)).size).toBe(RELICS.length);
    expect(RELICS.length).toBeGreaterThanOrEqual(20);
    for (const r of RELICS) {
      expect(r.price).toBeGreaterThan(0);
      expect(relicPrice(r, 1)).toBeGreaterThan(relicPrice(r, 0));
    }
    for (const w of WEAPONS) {
      for (let l = 2; l <= maxLevel(w.id); l++) expect(weaponStats(w.id, l).dmg).toBeGreaterThan(weaponStats(w.id, l - 1).dmg);
    }
  });
  it('characters unlock by best score or by following the author', () => {
    const ids = (flags: boolean[]): string[] => CHARS.filter((_, i) => flags[i]).map(c => c.id);
    expect(ids(unlockedChars(0))).toEqual(['newbie']);
    expect(ids(unlockedChars(10_000))).toEqual(['newbie', 'rich']);
    expect(ids(unlockedChars(0, true))).toEqual(['newbie', 'fan', 'charger']);
    expect(ids(unlockedChars(1_000_000, false))).toEqual(['newbie', 'rich', 'combo', 'sharer', 'top']);
    expect(unlockedChars(1_000_000, true).every(Boolean)).toBe(true);
    // Following is the only way into the follow-gated characters.
    expect(unlockedChars(Number.MAX_SAFE_INTEGER, false)[CHARS.findIndex(c => c.id === 'fan')]).toBe(false);
    expect(new Set(CHARS.map(c => c.id)).size).toBe(CHARS.length);
    expect(CHARS[0].unlock).toBe(0);
    expect(CHARS[0].follow).toBe(false);
  });
  it('character traits apply to the run', () => {
    const idx = (id: string): number => CHARS.findIndex(c => c.id === id);
    const base = createRun(1, idx('newbie'));
    const fan = createRun(1, idx('fan'));
    expect(fan.stats.magnet).toBeCloseTo(base.stats.magnet * 1.5);
    expect(fan.weapons.map(w => w.id)).toEqual(['convert', 'star']);
    expect(CHARS[idx('charger')].waveCoins).toBeGreaterThan(0);
    expect(createRun(1, idx('charger')).weapons.map(w => w.id)).toEqual(['charge']);
    expect(createRun(1, idx('sharer')).stats.speed).toBeCloseTo(base.stats.speed * 1.15);
    const top = createRun(1, idx('top'));
    expect(top.weapons.map(w => w.id)).toEqual(['like', 'triple']);
    expect(currentMultiplier(top)).toBeCloseTo(1);
    expect(createRun(1, idx('rich')).coins).toBe(15);
  });
});

describe('三连福利', () => {
  it('each action grants its own start-of-run bonus', () => {
    const none = createRun(1);
    expect(createRun(1, 0, { like: true, coin: false, fav: false }).stats.maxHp).toBe(none.stats.maxHp + 1);
    expect(createRun(1, 0, { like: true, coin: false, fav: false }).player.hp).toBe(none.player.hp + 1);
    expect(createRun(1, 0, { like: false, coin: true, fav: false }).coins).toBe(none.coins + 10);
    expect(currentMultiplier(createRun(1, 0, { like: true, coin: true, fav: false }))).toBeCloseTo(1);
    expect(currentMultiplier(createRun(1, 0, { like: true, coin: true, fav: true }))).toBeCloseTo(1.3);
  });
  it('favourite gives a free reroll in every shop', () => {
    const run = toShop(11, { like: false, coin: false, fav: true });
    expect(run.freeRerolls).toBe(1);
    const coins = run.coins;
    expect(rerollShop(run)).toBe(true);
    expect(run.coins).toBe(coins);
    expect(run.freeRerolls).toBe(0);
  });
  it('round-trips through the save bitmask', () => {
    for (let bits = 0; bits < 8; bits++) expect(perksToBits(perksFromBits(bits))).toBe(bits);
    expect(perksFromBits(5)).toEqual({ like: true, coin: false, fav: true });
    expect(isTriple(perksFromBits(7))).toBe(true);
    expect(isTriple(perksFromBits(6))).toBe(false);
    expect(perkCount(perksFromBits(6))).toBe(2);
  });
  it('all-in still caps max hp at 1 with the like bonus', () => {
    const run = createRun(1, 0, { like: true, coin: false, fav: false });
    run.relics = { allin: 1 };
    recalc(run);
    expect(run.stats.maxHp).toBe(1);
  });
});

describe('relic effects', () => {
  it('stack additively and multiplicatively in the right order', () => {
    const run = createRun(1);
    run.relics = { manners: 2, comment: 1, hot: 2, ranking: 1 };
    recalc(run);
    // (1 + 0.5×2 + 1) × 1.5² × 2 = 13.5
    expect(currentMultiplier(run)).toBeCloseTo(13.5);
    run.relics.title = 2;
    run.relics.cover = 1;
    recalc(run);
    expect(scoreCtx(run).addBase).toBe(9);
  });
  it('all-in sets max hp to 1 and triples the multiplier', () => {
    const run = createRun(1);
    run.relics = { allin: 1 };
    recalc(run);
    expect(run.stats.maxHp).toBe(1);
    expect(run.player.hp).toBe(1);
    expect(currentMultiplier(run)).toBeCloseTo(3);
  });
  it('conditional relics react to the live state', () => {
    const run = createRun(1);
    run.relics = { top100: 1, savings: 1, infamy: 1 };
    recalc(run);
    expect(currentMultiplier(run)).toBeCloseTo(1.6);
    run.player.hp -= 1;
    run.hurtCount = 2;
    expect(currentMultiplier(run)).toBeCloseTo(1.25 * 1.25);
    run.coins = 1000;
    expect(scoreCtx(run).addMult).toBeCloseTo(3); // capped
  });
  it('badge counts every relic owned', () => {
    const run = createRun(1);
    run.relics = { badge: 1, title: 3 };
    recalc(run);
    expect(run.stats.addMult).toBeCloseTo(0.2 * 4);
  });
});

describe('run flow', () => {
  it('level-up offers three distinct choices and applies the pick', () => {
    const run = createRun(7);
    const cs = rollChoices(run);
    expect(cs).toHaveLength(3);
    expect(new Set(cs.map(c => c.type + c.id)).size).toBe(3);
    run.phase = 'levelup';
    run.choices = cs;
    run.pendingLevels = 1;
    expect(chooseUpgrade(run, 0)).toBe(true);
    expect(run.phase).toBe('play');
    expect(chooseUpgrade(run, 0)).toBe(false);
  });
  it('reaches the shop after wave 1 with something affordable, and buying works', () => {
    const run = toShop(11);
    expect(run.phase).toBe('shop');
    expect(run.wave).toBe(1);
    expect(run.enemies).toHaveLength(0);
    const offers = run.shop!;
    expect(offers).toHaveLength(3);
    const i = offers.findIndex(o => o && o.price <= run.coins);
    expect(i).toBeGreaterThanOrEqual(0);
    const { id, price } = offers[i]!;
    const coins = run.coins;
    expect(buyRelic(run, i)).toBe(true);
    expect(run.coins).toBe(coins - price);
    expect(run.relics[id]).toBe(1);
    expect(run.shop![i]).toBeNull();
    expect(buyRelic(run, i)).toBe(false);
    run.coins = 0;
    expect(rerollShop(run)).toBe(false);
    run.coins = 3;
    expect(rerollShop(run)).toBe(true);
    expect(run.coins).toBe(0);
    expect(leaveShop(run)).toBe(true);
    expect(run.wave).toBe(2);
    expect(run.phase).toBe('play');
  });
  it('stackable relics cost more each time; uniques are not offered twice', () => {
    expect(relicPrice(RELIC_BY_ID.hot, 0)).toBe(25);
    expect(relicPrice(RELIC_BY_ID.hot, 2)).toBe(50);
    const run = toShop(5);
    for (const d of RELICS) if (!d.stack) run.relics[d.id] = 1;
    run.coins = 0;
    for (let k = 0; k < 20; k++) {
      run.freeRerolls = 1;
      rerollShop(run);
      for (const o of run.shop!) if (o) expect(RELIC_BY_ID[o.id].stack).toBe(true);
    }
  });
  it('taking a hit costs one life, resets the combo, and grants invulnerability', () => {
    const run = createRun(3);
    run.player.iframes = 0;
    run.combo = 10;
    dummy(run, run.player.x - 6, run.player.y - 6);
    const hp = run.player.hp;
    stepRun(run, 1 / 60, 0, 0);
    expect(run.player.hp).toBe(hp - 1);
    expect(run.combo).toBe(0);
    stepRun(run, 1 / 60, 0, 0);
    expect(run.player.hp).toBe(hp - 1);
  });
  it('a revive coin saves the run exactly once', () => {
    const run = createRun(3);
    run.relics.revive = 1;
    run.player.hp = 1;
    run.player.iframes = 0;
    dummy(run, run.player.x - 6, run.player.y - 6);
    stepRun(run, 1 / 60, 0, 0);
    expect(run.phase).toBe('play');
    expect(run.player.hp).toBe(run.stats.maxHp);
    expect(run.relics.revive).toBe(0);
    run.player.hp = 1;
    run.player.iframes = 0;
    stepRun(run, 1 / 60, 0, 0);
    expect(run.phase).toBe('over');
    expect(run.win).toBe(false);
  });
});

describe('weapons', () => {
  it('every weapon damages a danmaku standing next to the player', () => {
    // 鬼畜 / 极限走位 / 名场面 only react to kills and grazes; they have their own tests below.
    for (const d of WEAPONS.filter(w => !['remix', 'graze', 'scene'].includes(w.id))) {
      const run = lab([[d.id, 1]]);
      const e = dummy(run, run.player.x + 14, run.player.y - 6, 1e6);
      tick(run, 4);
      expect(e.hp, d.name).toBeLessThan(1e6);
    }
  });
  it('举报 sweeps the whole row but not other rows', () => {
    const run = lab([['report', 1]]);
    const far = dummy(run, 4, run.player.y - 6, 1e6);
    const other = dummy(run, run.player.x + 20, run.player.y - 80, 1e6);
    tick(run, 1);
    expect(far.hp).toBeLessThan(1e6);
    expect(other.hp).toBe(1e6);
  });
  it('屏蔽 slows from level 3 and only inside its radius', () => {
    const run = lab([['block', 3]]);
    const near = dummy(run, run.player.x + 10, run.player.y - 6, 1e6);
    const away = dummy(run, run.player.x + 90, run.player.y - 6, 1e6);
    near.vx = away.vx = -1;
    tick(run, 1);
    expect(near.slow).toBeGreaterThan(0);
    expect(near.slowK).toBeCloseTo(0.7);
    expect(away.slow).toBeLessThanOrEqual(0);
    expect(away.hp).toBe(1e6);
  });
  it('拖进度条 comes back and hits on both passes', () => {
    const run = lab([['rewind', 1]]);
    const e = dummy(run, run.player.x + 30, run.player.y - 6, 1e6);
    tick(run, 1.2);
    expect(1e6 - e.hp).toBeCloseTo(2 * weaponStats('rewind', 1).dmg);
    expect(run.shots.filter(s => s.kind === 'rewind')).toHaveLength(0);
  });
  it('drones hover near the player', () => {
    const run = createRun(1);
    for (let i = 0; i < 3; i++) {
      const [x, y] = dronePos(run, i, 3);
      expect(Math.hypot(x - run.player.x, y - run.player.y)).toBeLessThan(26);
    }
  });
});

describe('trick weapons', () => {
  const texted = (run: Run, text: string, x: number, y: number, hp = 1e6): Enemy => {
    const e = dummy(run, x, y, hp);
    e.text = text;
    e.w = textWidth(text);
    return e;
  };
  it('关键词 names the most common character and hits every danmaku containing it', () => {
    const run = lab([['keyword', 1]]);
    const a = texted(run, '哈哈哈', 4, 60), b = texted(run, '笑哈了', 150, 380), c = texted(run, '草', 100, 100);
    tick(run, 0.2);
    expect(run.keyword.s).toBe('哈');
    expect(1e6 - a.hp).toBeCloseTo(weaponStats('keyword', 1).dmg);
    expect(b.hp).toBe(a.hp);
    expect(c.hp).toBe(1e6);
    expect(a.mark).toBeGreaterThan(0);
    expect(c.mark).toBe(0);
  });
  it('洗白 turns what it defeats into an ally that rams its row and soaks bullets', () => {
    const run = lab([['convert', 1]]);
    const y = run.player.y - 6;
    const victim = texted(run, '就这？', run.player.x + 12, y, 1);
    victim.vx = -1;
    const other = dummy(run, 176, y, 1e6);
    run.bullets.push({ x: 164, y: y + 6, vx: 0, vy: 0, life: 5, grazed: false });
    tick(run, 0.1);
    expect(victim.dead).toBe(true);
    expect(run.kills).toBe(1);
    expect(run.allies).toHaveLength(1);
    expect(run.allies[0].text).toBe('就这？');
    expect(run.allies[0].vx).toBeGreaterThan(0);
    tick(run, 0.7);
    expect(run.bullets).toHaveLength(0);
    expect(1e6 - other.hp).toBeCloseTo(weaponStats('convert', 1).dmg2);
  });
  it('a boss is never converted', () => {
    const run = lab([['convert', 1]]);
    const e = dummy(run, run.player.x + 12, run.player.y - 6, 1);
    e.kind = 'boss';
    tick(run, 0.2);
    expect(e.dead).toBe(true);
    expect(run.allies).toHaveLength(0);
  });
  it('killing the last boss announces it before the run is over, so the view can stage the ending', () => {
    const run = lab([['like', 1]]);
    run.wave = WAVES;
    const e = dummy(run, run.player.x + 12, run.player.y - 6, 1);
    e.kind = 'boss';
    e.boss = 1;
    e.atk = 99;
    tick(run, 0.5);
    const names = run.events.map(ev => ev.t);
    expect(run.phase).toBe('over');
    expect(run.win).toBe(true);
    expect(names).toContain('bossDown');
    expect(names.indexOf('bossDown')).toBeLessThan(names.indexOf('over'));
    expect(run.events.find(ev => ev.t === 'bossDown')?.s).toBe(e.text);
  });
  it('credits every point of damage to the weapon that dealt it', () => {
    const run = lab([['like', 1], ['star', 1]]);
    dummy(run, run.player.x + 30, run.player.y - 6);
    tick(run, 3);
    const total = Object.values(run.dmgBy).reduce((a, b) => a + b, 0);
    expect(run.dmgBy.like).toBeGreaterThan(0);
    const shares = damageShares(run);
    expect(shares[0].id).toBe('like');
    expect(shares.reduce((a, q) => a + q.pct, 0)).toBeCloseTo(1);
    expect(shares.every(q => q.name.length > 0)).toBe(true);
    // Overkill is not counted: a 1-hp danmaku adds at most 1.
    const weak = dummy(run, run.player.x + 20, run.player.y - 6, 1);
    tick(run, 1);
    expect(weak.dead).toBe(true);
    expect(Object.values(run.dmgBy).reduce((a, b) => a + b, 0) - total).toBeLessThan(weaponStats('like', 1).dmg * 8);
  });
  it('the exclusive skill gets its own line in the damage table', () => {
    const run = lab([['like', 1]], 6);
    dummy(run, 40, 60);
    run.ult.energy = run.ult.need;
    expect(useUlt(run)).toBe(true);
    expect(run.dmgBy.ult).toBeGreaterThan(0);
    expect(damageShares(run).find(q => q.id === 'ult')?.name).toContain(run.char.ultName);
  });
  it('bosses move: 高能预警 follows the player and drops on them after a warning', () => {
    const run = lab([]);
    run.wave = 5;
    const e = dummy(run, 10, 38);
    Object.assign(e, { kind: 'boss', boss: 1, w: 96, h: 24, scale: 2, atk: 99, homeY: 38 });
    run.player.x = 180;
    tick(run, 1);
    expect(e.x).toBeGreaterThan(30); // shadowing the player
    e.n = 1;
    e.atk = 0;
    tick(run, 0.2);
    expect(e.mode).toBe(1); // warning: has not moved yet
    expect(e.y).toBe(38);
    const landing = e.ty;
    expect(landing).toBeGreaterThan(60);
    tick(run, 1.6);
    expect(e.mode).toBeGreaterThanOrEqual(3);
    expect(run.bullets.length).toBeGreaterThan(0); // the landing throws a ring
    tick(run, 6);
    expect(e.mode).toBe(0);
    expect(e.y).toBe(38);
  });
  it('bosses move: 直播事故 bounces around the upper half and 弹幕护体 weaves', () => {
    for (const which of [2, 3] as const) {
      const run = lab([]);
      run.wave = which * 5;
      const e = dummy(run, 60, 60);
      Object.assign(e, { kind: 'boss', boss: which, w: 96, h: 24, scale: 2, atk: 2 });
      const xs = new Set<number>(), ys = new Set<number>();
      for (let i = 0; i < 20; i++) {
        tick(run, 0.5);
        xs.add(Math.round(e.x / 10));
        ys.add(Math.round(e.y / 10));
        expect(e.x).toBeGreaterThanOrEqual(0);
        expect(e.x + e.w).toBeLessThanOrEqual(W + 1);
        expect(e.y).toBeLessThan(H * 0.5 + 8);
      }
      expect(xs.size).toBeGreaterThan(3);
      expect(ys.size).toBeGreaterThan(2);
    }
  });
  it('鬼畜 cuts every few kills into one projectile per character', () => {
    const run = lab([['like', 5], ['remix', 1]]);
    const need = weaponStats('remix', 1).count;
    for (let i = 0; i < need; i++) texted(run, '哈哈哈哈', run.player.x + 10, run.player.y - 6 - i * 14, 1);
    let most = 0;
    for (let i = 0; i < 240; i++) {
      stepRun(run, 1 / 60, 0, 0);
      most = Math.max(most, run.shots.filter(s => s.kind === 'glyph').length);
    }
    expect(run.kills).toBe(need);
    expect(most).toBe(4);
  });
  it('置顶 holds danmaku in its row, hurts them and blocks bullets', () => {
    const run = lab([['pin', 1]]);
    tick(run, 0.1);
    expect(run.pins).toHaveLength(1);
    const pin = run.pins[0];
    const e = dummy(run, pin.x + pin.w + 30, pin.y, 1e6);
    e.vx = -60;
    const free = dummy(run, pin.x + pin.w + 30, pin.y + 28, 1e6);
    free.vx = -60;
    run.bullets.push({ x: pin.x + 4, y: pin.y + 4, vx: 0, vy: 0, life: 5, grazed: false });
    tick(run, 1.5);
    expect(e.x).toBe(pin.x + pin.w);
    expect(e.hp).toBeLessThan(1e6);
    expect(free.x).toBeLessThan(pin.x);
    expect(free.hp).toBe(1e6);
    expect(run.bullets).toHaveLength(0);
    expect(e.held).toBeGreaterThan(0);
    expect(free.held).toBeLessThanOrEqual(0);
    tick(run, 3);
    expect(run.pins).toHaveLength(0);
  });
  it('置顶 makes what it holds take more damage, and blows up when its time is up', () => {
    const st = weaponStats('pin', 1);
    const run = lab([['pin', 1]]);
    tick(run, 0.1);
    const pin = run.pins[0];
    const held = dummy(run, pin.x + pin.w + 20, pin.y, 1e6);
    held.vx = -200;
    const near = dummy(run, pin.x + 4, pin.y + 20, 1e6); // other row, inside the blast
    const far = dummy(run, pin.x + 4, pin.y + 120, 1e6);
    tick(run, 0.5);
    expect(held.held).toBeGreaterThan(0);
    // Ticks hit the held one at 1.5x.
    const ticked = 1e6 - held.hp;
    expect(ticked / (st.dmg * PIN_VULN)).toBeCloseTo(Math.round(ticked / (st.dmg * PIN_VULN)));
    expect(near.hp).toBe(1e6);
    tick(run, st.dur);
    expect(run.pins).toHaveLength(0);
    expect(1e6 - near.hp).toBeCloseTo(st.dmg2);
    expect(far.hp).toBe(1e6);
  });
  it('憋大招 charges while standing still and fires on moving, or by itself when full', () => {
    const run = lab([['hold', 1]]);
    const st = weaponStats('hold', 1);
    const e = dummy(run, run.player.x + 20, run.player.y - 6, 1e6);
    tick(run, 0.3);
    stepRun(run, 1 / 60, 1, 0); // too early: nothing charged yet
    expect(e.hp).toBe(1e6);
    expect(run.hold).toBe(0);
    tick(run, st.cd + 0.1);
    expect(e.hp).toBe(1e6);
    stepRun(run, 1 / 60, 1, 0);
    expect(1e6 - e.hp).toBeCloseTo(st.dmg);
    e.hp = 1e6;
    tick(run, st.cd * st.count + 0.1);
    expect(1e6 - e.hp).toBeCloseTo(st.dmg * st.count * 1.5);
    expect(run.hold).toBeLessThan(1);
  });
});

describe('graze', () => {
  /** A danmaku 4 px above the player's hit box: close enough to graze, not to hit. */
  const above = (run: Run): Enemy => dummy(run, run.player.x - 6, run.player.y - 16, 1e6);
  const open = (weapons: [WeaponId, number][] = []): Run => {
    const run = lab(weapons);
    run.player.iframes = 0;
    return run;
  };
  it('skimming past a danmaku charges the skill once per pass and costs no life', () => {
    const run = open();
    above(run);
    stepRun(run, 1 / 60, 0, 0);
    expect(run.grazes).toBe(1);
    expect(run.ult.energy).toBe(0.5);
    expect(run.player.hp).toBe(run.stats.maxHp);
    tick(run, 1);
    expect(run.grazes).toBe(1);
    tick(run, 0.5);
    expect(run.grazes).toBe(2);
  });
  it('a bullet can be grazed once; nothing counts while invulnerable', () => {
    const run = open();
    run.bullets.push({ x: run.player.x + 7, y: run.player.y, vx: 0, vy: 0, life: 5, grazed: false });
    tick(run, 0.5);
    expect(run.grazes).toBe(1);
    const safe = lab([]);
    above(safe);
    tick(safe, 0.5);
    expect(safe.grazes).toBe(0);
  });
  it('keeps a combo alive', () => {
    const run = open();
    run.combo = 7;
    run.comboTimer = 0.2;
    above(run);
    stepRun(run, 1 / 60, 0, 0);
    expect(run.comboTimer).toBeGreaterThan(2.9);
  });
  it('极限走位 answers every graze with a dart', () => {
    const run = open([['graze', 1]]);
    const e = above(run);
    stepRun(run, 1 / 60, 0, 0);
    expect(run.shots.filter(s => s.kind === 'dart')).toHaveLength(1);
    tick(run, 0.3);
    expect(1e6 - e.hp).toBeCloseTo(weaponStats('graze', 1).dmg);
  });
  it('名场面 blows the grazed danmaku into its characters', () => {
    const run = open([['scene', 1]]);
    const e = above(run);
    e.text = '名场面';
    stepRun(run, 1 / 60, 0, 0);
    expect(run.shots.filter(s => s.kind === 'glyph').map(s => s.ch).join('')).toBe('名场面');
    expect(1e6 - e.hp).toBeCloseTo(weaponStats('scene', 1).dmg);
  });
  it('擦弹大师 widens the range and speeds up the charge', () => {
    const levels = noTech();
    levels[12] = 2;
    const run = createRun(5, 0, NO_PERKS, techFx(levels));
    run.spawnCd = 1e9;
    run.player.iframes = 0;
    dummy(run, run.player.x - 6, run.player.y - 18, 1e6); // 6 px away: out of the base range
    stepRun(run, 1 / 60, 0, 0);
    expect(run.grazes).toBe(1);
    expect(run.ult.energy).toBe(1);
  });
});

describe('tech tree', () => {
  it('nodes open top-down and cost what the table says', () => {
    const levels = noTech();
    expect(TECHS).toHaveLength(3 * TIERS);
    expect(techOpen(0, levels)).toBe(true);
    expect(techOpen(1, levels)).toBe(false);
    expect(canBuyTech(1, levels, 999)).toBe(false);
    expect(canBuyTech(0, levels, 1)).toBe(false);
    expect(buyTech(0, levels, 2)).toBe(true);
    expect(levels[0]).toBe(1);
    expect(techLeft(2, levels)).toBe(0);
    expect(buyTech(0, levels, 2)).toBe(false);
    expect(techOpen(1, levels)).toBe(true);
    expect(techOpen(TIERS, levels)).toBe(true); // first node of the next branch
    const all = maxTech();
    expect(techSpent(all)).toBe(321);
    TECHS.forEach((_, i) => expect(techCost(i, all)).toBeNull());
    expect(buyTech(3, all, 9999)).toBe(false);
    expect(techLeft(10, all)).toBe(0);
  });
  it('round-trips as one digit per node and survives garbage', () => {
    const levels = noTech();
    levels[0] = 3; levels[1] = 1; levels[5] = 2; levels[14] = 1;
    expect(encodeTech(levels)).toHaveLength(TECHS.length);
    expect(decodeTech(encodeTech(levels))).toEqual(levels);
    expect(decodeTech(undefined)).toEqual(noTech());
    expect(decodeTech('xyz')).toEqual(noTech());
    expect(decodeTech('9'.repeat(40))).toEqual(maxTech());
  });
  it('merging two copies never leaves more to spend than was earned', () => {
    const a = noTech(), b = noTech();
    a[0] = 3; b[5] = 3; // 12 灵感 each, bought on two devices from the same 12 earned
    const m = mergeTech(a, b);
    expect(m[0]).toBe(3);
    expect(m[5]).toBe(3);
    expect(techLeft(12, m)).toBe(0);
  });
  it('applies its bonuses to a run', () => {
    const plain = createRun(3);
    const run = createRun(3, 0, NO_PERKS, techFx(maxTech()));
    expect(run.stats.dmgMul).toBeCloseTo(1.12);
    expect(run.stats.cdMul).toBeCloseTo(Math.pow(0.97, 3));
    expect(run.stats.crit).toBeCloseTo(0.09);
    expect(run.stats.speed).toBeCloseTo(plain.stats.speed * 1.09);
    expect(run.stats.magnet).toBeCloseTo(plain.stats.magnet * 1.36);
    expect(run.stats.maxHp).toBe(plain.stats.maxHp + 1);
    expect(run.player.hp).toBe(run.stats.maxHp);
    expect(run.coins).toBe(plain.coins + 6);
    expect(run.stats.addBase).toBe(1);
    expect(run.stats.addMult).toBeCloseTo(plain.stats.addMult + 0.3);
    expect(ultReady(run)).toBe(true);
    expect(ultReady(plain)).toBe(false);
    expect(run.lvRerolls).toBe(2);
  });
  it('独家秘方 lets recipes fuse one level earlier', () => {
    const levels = noTech();
    levels[4] = 1;
    const run = createRun(5, 0, NO_PERKS, techFx(levels));
    run.weapons = [{ id: 'like', lvl: FUSE_LEVEL - 1, cd: 1, cd2: 1 }, { id: 'triple', lvl: FUSE_LEVEL - 1, cd: 1, cd2: 1 }];
    expect(readyFusions(run)).toEqual(['storm']);
    expect(readyFusions(lab([['like', FUSE_LEVEL - 1], ['triple', FUSE_LEVEL - 1]]))).toEqual([]);
  });
  it('选题会 redraws the level-up cards a limited number of times', () => {
    const levels = noTech();
    levels[3] = 1;
    const run = createRun(8, 0, NO_PERKS, techFx(levels));
    expect(rerollChoices(run)).toBe(false); // not levelling up
    run.phase = 'levelup';
    run.pendingLevels = 1;
    run.choices = rollChoices(run);
    expect(rerollChoices(run)).toBe(true);
    expect(run.choices).toHaveLength(3);
    expect(run.lvRerolls).toBe(0);
    expect(rerollChoices(run)).toBe(false);
    expect(chooseUpgrade(run, 0)).toBe(true);
  });
  it('砍价 lowers shop prices and 长期商单 pays every wave', () => {
    const run = toShop(3);
    run.tech = { ...run.tech, price: 0.5 };
    run.freeRerolls = 1;
    expect(rerollShop(run)).toBe(true);
    for (const o of run.shop ?? []) {
      if (o) expect(o.price).toBe(Math.max(1, Math.round(relicPrice(RELIC_BY_ID[o.id], run.relics[o.id] ?? 0) * 0.5)));
    }
  });
  it('a run pays out more 灵感 the further it gets', () => {
    expect(runInsight({ wave: 1, win: false, fans: 0, bossKills: 0 })).toBe(2);
    expect(runInsight({ wave: 4, win: false, fans: 5000, bossKills: 0 })).toBe(6);
    expect(runInsight({ wave: 11, win: false, fans: 1_200_000, bossKills: 2 })).toBe(25);
    expect(runInsight({ wave: 20, win: true, fans: 3e8, bossKills: 4 })).toBe(2 + 20 + 20 + 8);
    const r = playBot(77, 'smart');
    expect(runInsight(r)).toBeGreaterThanOrEqual(2);
    expect(r.bossKills).toBeLessThanOrEqual(4);
  });
});

describe('fusion', () => {
  it('every base weapon belongs to exactly one recipe', () => {
    const base = WEAPONS.filter(w => !w.fusion);
    expect(base).toHaveLength(16);
    expect(base.filter(w => w.trick)).toHaveLength(6);
    expect(WEAPONS.filter(w => w.fusion)).toHaveLength(RECIPES.length);
    for (const w of base) {
      expect(RECIPES.filter(r => r.a === w.id || r.b === w.id)).toHaveLength(1);
      expect(partnerOf(partnerOf(w.id)!)).toBe(w.id);
      expect(recipeHint(w.id)).toContain(`Lv${FUSE_LEVEL}`);
    }
    for (const r of RECIPES) expect(WEAPON_BY_ID[r.out].fusion).toBe(true);
    expect(maxLevel('like')).toBe(5);
    expect(maxLevel('storm')).toBe(3);
  });
  it('is offered once both ingredients reach the fuse level, and merges them', () => {
    const run = lab([['like', FUSE_LEVEL], ['triple', FUSE_LEVEL - 1], ['coin', 1]]);
    expect(readyFusions(run)).toEqual([]);
    expect(rollChoices(run).some(c => c.type === 'fusion')).toBe(false);
    run.weapons[1].lvl = FUSE_LEVEL;
    expect(readyFusions(run)).toEqual(['storm']);
    const cs = rollChoices(run);
    expect(cs[0].type).toBe('fusion');
    expect(cs[0].id).toBe('storm');
    run.phase = 'levelup';
    run.choices = cs;
    run.pendingLevels = 1;
    expect(chooseUpgrade(run, 0)).toBe(true);
    expect(run.weapons.map(w => w.id).sort()).toEqual(['coin', 'storm']);
    expect(run.weapons.find(w => w.id === 'storm')!.lvl).toBe(1);
  });
  it('ingredients are not offered again after fusing, but the fusion can level up', () => {
    const run = lab([['storm', 1]]);
    const seen = new Set<string>();
    for (let k = 0; k < 300; k++) for (const c of rollChoices(run)) seen.add(c.id);
    expect(seen.has('like')).toBe(false);
    expect(seen.has('triple')).toBe(false);
    expect(seen.has('storm')).toBe(true);
    expect(seen.has('coin')).toBe(true);
    run.weapons[0].lvl = 3;
    for (let k = 0; k < 100; k++) expect(rollChoices(run).some(c => c.id === 'storm')).toBe(false);
  });
  it('a fusion card cannot be taken if the ingredients are gone', () => {
    const run = lab([['like', 5], ['triple', 5]]);
    run.phase = 'levelup';
    run.choices = rollChoices(run);
    run.pendingLevels = 1;
    run.weapons = run.weapons.filter(w => w.id !== 'like');
    expect(chooseUpgrade(run, 0)).toBe(false);
  });
  it('the partner of an owned weapon shows up more often', () => {
    const tally = (weapons: [WeaponId, number][]): number => {
      const run = lab(weapons);
      let n = 0;
      for (let k = 0; k < 600; k++) if (rollChoices(run).some(c => c.id === 'triple')) n++;
      return n;
    };
    expect(tally([['like', 1]])).toBeGreaterThan(tally([['coin', 1]]) * 1.5);
  });
});

describe('exclusive skills', () => {
  const idx = (id: string): number => CHARS.findIndex(c => c.id === id);
  it('every character has its own skill', () => {
    expect(new Set(CHARS.map(c => c.ult)).size).toBe(CHARS.length);
    for (const c of CHARS) expect(c.ultName.length).toBeGreaterThan(0);
  });
  it('charges from kills and cannot be used early; each use costs more', () => {
    const run = lab([['like', 5]]);
    expect(ultReady(run)).toBe(false);
    expect(useUlt(run)).toBe(false);
    for (let i = 0; i < 60 && !ultReady(run); i++) { dummy(run, run.player.x + 20, run.player.y - 6, 1); tick(run, 0.5); }
    expect(ultReady(run)).toBe(true);
    const need = run.ult.need;
    expect(useUlt(run)).toBe(true);
    expect(run.ult.energy).toBe(0);
    expect(run.ult.need).toBeGreaterThan(need);
    expect(useUlt(run)).toBe(false);
  });
  const charged = (id: string): Run => {
    const run = lab([['like', 1]], idx(id));
    run.weapons = [];
    run.ult.energy = run.ult.need;
    return run;
  };
  it('求三连 doubles weapon speed for a while', () => {
    const run = charged('newbie');
    useUlt(run);
    expect(run.buff.haste).toBeGreaterThan(5);
    tick(run, 7);
    expect(run.buff.haste).toBeLessThanOrEqual(0);
  });
  it('撒币 bombs the field and pays out', () => {
    const run = charged('rich');
    const e = dummy(run, 30, 100, 1e6);
    const coins = run.coins;
    useUlt(run);
    expect(run.coins).toBe(coins + 5);
    tick(run, 1.5);
    expect(e.hp).toBeLessThan(1e6);
  });
  it('粉丝护体 makes the player untouchable and pulls every drop in', () => {
    const run = charged('fan');
    run.player.iframes = 0;
    run.orbs.push({ kind: 'coin', x: 10, y: 60, v: 3, pull: false });
    useUlt(run);
    dummy(run, run.player.x - 6, run.player.y - 6);
    const hp = run.player.hp;
    tick(run, 3);
    expect(run.player.hp).toBe(hp);
    expect(run.orbs).toHaveLength(0);
  });
  it('满电 and 百大光环 hit everything on screen', () => {
    for (const id of ['charger', 'top']) {
      const run = charged(id);
      const a = dummy(run, 10, 60, 1e6), b = dummy(run, 190, 400, 1e6);
      useUlt(run);
      expect(a.hp, id).toBeLessThan(1e6);
      expect(b.hp, id).toBeLessThan(1e6);
    }
  });
  it('百大光环 turns enemy bullets into experience', () => {
    const run = charged('top');
    run.bullets.push({ x: 50, y: 200, vx: 0, vy: 0, life: 5, grazed: false }, { x: 60, y: 210, vx: 0, vy: 0, life: 5, grazed: false });
    useUlt(run);
    expect(run.bullets).toHaveLength(0);
    expect(run.orbs.filter(o => o.kind === 'xp')).toHaveLength(2);
  });
  it('三连暴击 doubles fans gained', () => {
    const gain = (ult: boolean): number => {
      const run = lab([['like', 5]], idx('combo'));
      if (ult) { run.ult.energy = run.ult.need; useUlt(run); }
      dummy(run, run.player.x + 20, run.player.y - 6, 1);
      tick(run, 1);
      return run.fans;
    };
    expect(gain(true)).toBe(gain(false) * 2);
  });
  it('上热搜 clears bullets and freezes danmaku in place', () => {
    const run = charged('sharer');
    const e = dummy(run, 100, 100);
    e.vx = -40;
    run.bullets.push({ x: 50, y: 200, vx: 0, vy: 0, life: 5, grazed: false });
    useUlt(run);
    expect(run.bullets).toHaveLength(0);
    tick(run, 2);
    expect(e.x).toBe(100);
    tick(run, 3);
    expect(e.x).toBeLessThan(100);
  });
});

describe('whole runs (headless bot)', () => {
  it('is deterministic for a given seed', () => {
    const a = playBot(2024, 'smart'), b = playBot(2024, 'smart');
    expect(a.fans).toBe(b.fans);
    expect(a.kills).toBe(b.kills);
    expect(a.time).toBe(b.time);
    expect(playBot(2025, 'smart').fans).not.toBe(a.fans);
  });
  it('always terminates in a consistent end state', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = playBot(seed * 97, seed % 2 ? 'random' : 'smart', seed % CHARS.length);
      expect(r.phase).toBe('over');
      expect(r.wave).toBeGreaterThanOrEqual(1);
      expect(r.wave).toBeLessThanOrEqual(WAVES);
      expect(r.fans).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.fans)).toBe(true);
      expect(r.time).toBeLessThanOrEqual(TOTAL_TIME + 1);
      if (r.win) expect(r.wave).toBe(WAVES);
      if (r.millionAt !== null) expect(r.fans).toBeGreaterThanOrEqual(MILLION);
      expect(clampScore(r.fans)).toBeLessThanOrEqual(SCORE_CAP);
    }
  });
});
