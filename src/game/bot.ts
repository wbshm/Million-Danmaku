/**
 * Headless players used by the tests and by scripts/sim.ts for balance checks.
 *  - 'random': dodges, but picks upgrades and relics at random (a first-time player)
 *  - 'smart':  dodges and builds for the multiplier (a player who understands the game)
 */
import { Rng } from '../engine/rng';
import { H, LANE_TOP, W } from './balance';
import { RELIC_BY_ID } from './relics';
import { WALL_GAP, buyRelic, chooseUpgrade, createRun, distToBox, leaveShop, rerollShop, stepRun, ultReady, useUlt, type Run } from './run';
import { NO_PERKS } from './perks';
import { NO_TECH, type TechFx } from './tech';
import { partnerOf, type WeaponId } from './weapons';

export type Policy = 'random' | 'smart';

export function botMove(run: Run): [number, number] {
  const p = run.player;
  let fx = 0, fy = 0;
  for (const e of run.enemies) {
    if (e.dead) continue;
    // Look a little ahead of where the danmaku is now.
    const lead = run.buff.freeze > 0 ? 0 : e.vx * 0.35;
    const box = { x: e.x + lead, y: e.y, w: e.w, h: e.h };
    const d = distToBox(p.x, p.y, box);
    if (d > 30) continue;
    const cx = Math.max(box.x, Math.min(p.x, box.x + box.w));
    const cy = Math.max(box.y, Math.min(p.y, box.y + box.h));
    let dx = p.x - cx, dy = p.y - cy;
    if (d < 0.5) { dx = 0; dy = p.y < box.y + box.h / 2 ? -1 : 1; }
    const k = (30 - d) / 30 / Math.max(0.5, Math.hypot(dx, dy));
    // Danmaku travel sideways, so stepping out of the lane is what actually dodges.
    fx += dx * k;
    fy += dy * k * 3;
  }
  for (const b of run.bullets) {
    const dx = p.x - b.x, dy = p.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d > 24 || d < 0.01) continue;
    const k = ((24 - d) / 24) * 3 / d;
    fx += dx * k;
    fy += dy * k;
  }
  const wallComing = run.wallTimer > 0 || run.enemies.some(e => e.kind === 'wall' && e.x > p.x - 20);
  if (wallComing) {
    const gapY = LANE_TOP + (run.wallGap + WALL_GAP / 2) * 14;
    fy += Math.max(-1, Math.min(1, (gapY - p.y) / 8)) * 4;
  } else if (Math.hypot(fx, fy) < 0.6) {
    let best = null as null | { x: number; y: number };
    let bd = 90;
    for (const o of run.orbs) {
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) { fx += (best.x - p.x) / bd; fy += (best.y - p.y) / bd; }
  }
  fx += ((W * 0.42 - p.x) / W) * 0.6;
  fy += ((H * 0.55 - p.y) / H) * 0.6;
  const len = Math.hypot(fx, fy);
  return len > 0.15 ? [fx / len, fy / len] : [0, 0];
}

function botChoose(run: Run, policy: Policy, rng: Rng): void {
  const cs = run.choices ?? [];
  let i = rng.int(Math.max(1, cs.length));
  if (policy === 'smart') {
    const score = (k: number): number => {
      const c = cs[k];
      if (c.type === 'fusion') return 10;
      if (c.type === 'weapon') {
        const partner = partnerOf(c.id as WeaponId);
        return partner && run.weapons.some(w => w.id === partner) ? 6.5 : c.lvl === 1 ? 6 : 5;
      }
      if (c.type === 'passive') return c.id === 'power' || c.id === 'haste' ? 5.5 : c.id === 'hp' ? 4.5 : 3;
      return 1;
    };
    i = cs.map((_, k) => k).sort((a, b) => score(b) - score(a))[0] ?? 0;
  }
  chooseUpgrade(run, i);
}

function botShop(run: Run, policy: Policy, rng: Rng): void {
  for (let guard = 0; guard < 12; guard++) {
    const offers = run.shop ?? [];
    const idx = offers.map((o, k) => (o && o.price <= run.coins ? k : -1)).filter(k => k >= 0);
    if (!idx.length) {
      if (policy === 'smart' && guard < 2 && run.coins >= run.rerollCost + 25 && rerollShop(run)) continue;
      break;
    }
    if (policy === 'random') {
      if (rng.chance(0.25)) break;
      buyRelic(run, rng.pick(idx));
      continue;
    }
    const value = (k: number): number => {
      const d = RELIC_BY_ID[offers[k]!.id];
      if (d.id === 'allin') return -1;
      return (d.kind === 'mul' ? 10 : d.kind === 'add' ? 5 : d.id === 'ad' || d.id === 'finance' ? 6 - run.wave : 2) / Math.pow(offers[k]!.price, 0.3);
    };
    const best = idx.sort((a, b) => value(b) - value(a))[0];
    if (value(best) < 0) break;
    buyRelic(run, best);
  }
  leaveShop(run);
}

/** Play one whole run headlessly and return the final state. */
export function playBot(seed: number, policy: Policy, charIdx = 0, dt = 1 / 30, tech: TechFx = NO_TECH): Run {
  const run = createRun(seed, charIdx, NO_PERKS, tech);
  const rng = new Rng(seed ^ 0x9e3779b9);
  for (let guard = 0; guard < 400_000 && run.phase !== 'over'; guard++) {
    if (run.phase === 'play') {
      const [mx, my] = botMove(run);
      // Save the skill for when there is something on screen worth using it on.
      if (ultReady(run) && run.enemies.length >= 4) useUlt(run);
      stepRun(run, dt, mx, my);
    } else if (run.phase === 'levelup') botChoose(run, policy, rng);
    else if (run.phase === 'shop') botShop(run, policy, rng);
    run.events.length = 0;
  }
  return run;
}
