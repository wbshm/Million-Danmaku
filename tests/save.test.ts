import { describe, expect, it } from 'vitest';
import { SAVE_LIMIT_BYTES, decodeSave, defaultSave, encodeSave, mergeSaves, saveBytes, type Save } from '../src/game/save';

describe('save', () => {
  it('round-trips', () => {
    const s: Save = { v: 1, best: 1234567, bestFast: 42, runs: 9, char: 2, music: false, sfx: true, seenHint: true, fol: true, tri: 5, ins: 321, tech: '310002000000001' };
    expect(decodeSave(encodeSave(s))).toEqual(s);
  });
  it('fits in one cloud-storage value even at extreme values', () => {
    const s: Save = { v: 1, best: Number.MAX_SAFE_INTEGER, bestFast: 100000, runs: 1e9, char: 16, music: false, sfx: false, seenHint: false, fol: true, tri: 7, ins: 1e7, tech: '333213332133311' };
    expect(saveBytes(s)).toBeLessThanOrEqual(SAVE_LIMIT_BYTES);
    expect(saveBytes(s)).toBeLessThan(200);
  });
  it('falls back to defaults on garbage and sanitises fields', () => {
    expect(decodeSave(null)).toEqual(defaultSave());
    expect(decodeSave('')).toEqual(defaultSave());
    expect(decodeSave('{not json')).toEqual(defaultSave());
    expect(decodeSave('[1,2]')).toEqual(defaultSave());
    const s = decodeSave('{"best":-5,"runs":"7","char":99,"music":"no","bestFast":3.9}');
    expect(s.best).toBe(0);
    expect(s.runs).toBe(0);
    expect(s.char).toBe(16);
    expect(s.music).toBe(true);
    expect(s.bestFast).toBe(3);
    expect(decodeSave('{"tri":99,"fol":1}').tri).toBe(7);
    expect(decodeSave('{"tri":99,"fol":1}').fol).toBe(false);
    expect(decodeSave('{"ins":-3,"tech":"99"}').ins).toBe(0);
    expect(decodeSave('{"ins":-3,"tech":"99"}').tech).toBe('330000000000000');
    expect(decodeSave('{"best":5}').tech).toBe('000000000000000'); // a save from before the tech tree
  });
  it('merge keeps the best progress and the local preferences', () => {
    const local: Save = { ...defaultSave(), best: 100, runs: 3, music: false, char: 1 };
    const cloud: Save = { ...defaultSave(), best: 5000, bestFast: 20, runs: 2, music: true, char: 2, seenHint: true, fol: true, tri: 2 };
    expect(mergeSaves({ ...local, tri: 1, ins: 40, tech: '300000000000000' }, { ...cloud, ins: 25, tech: '120000000000000' }))
      .toEqual({ v: 1, best: 5000, bestFast: 20, runs: 3, char: 1, music: false, sfx: true, seenHint: true, fol: true, tri: 3, ins: 40, tech: '320000000000000' });
  });
});
