/**
 * Balance check: play many headless runs with each bot policy and print the score distribution.
 *   npm run sim            (200 runs per policy)
 *   npm run sim -- 500     (500 runs per policy)
 *   npm run sim -- 200 max (with the whole 科技树 bought)
 */
import { playBot, type Policy } from '../src/game/bot';
import { MILLION, SCORE_CAP } from '../src/game/balance';
import { CHARS } from '../src/game/chars';
import { RECIPES } from '../src/game/weapons';
import { maxTech, noTech, runInsight, techFx } from '../src/game/tech';

const n = Number(process.argv[2]) || 200;
const tech = techFx(process.argv[3] === 'max' ? maxTech() : noTech());
const fusions = new Set(RECIPES.map(r => r.out));
const pct = (a: number[], p: number): number => a[Math.min(a.length - 1, Math.floor(a.length * p))];
const fmt = (v: number): string => (v >= 1e4 ? `${(v / 1e4).toFixed(1)}万` : String(Math.round(v))).padStart(9);

for (const policy of ['random', 'smart'] as Policy[]) {
  for (let ch = 0; ch < CHARS.length; ch++) {
    const fans: number[] = [];
    const waves = new Array<number>(11).fill(0);
    let wins = 0, million = 0, capped = 0, levels = 0, fused = 0, ins = 0, grazes = 0;
    for (let i = 0; i < n; i++) {
      const r = playBot(1000 + i * 7919, policy, ch, 1 / 30, tech);
      if (r.weapons.some(w => fusions.has(w.id))) fused++;
      ins += runInsight(r);
      grazes += r.grazes;
      fans.push(r.fans);
      waves[r.wave]++;
      levels += r.level;
      if (r.win) wins++;
      if (r.millionAt !== null) million++;
      if (r.fans >= SCORE_CAP) capped++;
    }
    fans.sort((a, b) => a - b);
    console.log(
      `${policy.padEnd(6)} ${CHARS[ch].name.padEnd(5)} p10${fmt(pct(fans, 0.1))} p50${fmt(pct(fans, 0.5))} p90${fmt(pct(fans, 0.9))} max${fmt(fans[fans.length - 1])}` +
      `  通关 ${((wins / n) * 100).toFixed(0)}%  百万 ${((million / n) * 100).toFixed(0)}% (≥${MILLION})  爆表 ${capped}  平均等级 ${(levels / n).toFixed(1)}  合成 ${((fused / n) * 100).toFixed(0)}%  灵感 ${(ins / n).toFixed(1)}  擦弹 ${(grazes / n).toFixed(0)}` +
      `  阵亡波次 ${waves.slice(1).join('/')}`,
    );
  }
}
