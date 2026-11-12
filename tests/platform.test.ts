import { describe, expect, it, vi } from 'vitest';

// toy.ts touches `window` only inside functions; give it a bare global for import.
vi.stubGlobal('window', {});
const { withBackoff } = await import('../src/platform/toy');

const limited = (): Error => Object.assign(new Error('[ToySDK] 请求过于频繁'), { type: 'http_error', code: 307044 });

describe('rate-limit back-off', () => {
  it('retries after a rate-limit error, waiting longer each time', async () => {
    vi.useFakeTimers();
    const fn = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(limited())
      .mockRejectedValueOnce(limited())
      .mockResolvedValue('ok');
    const p = withBackoff(fn, 3, 800);
    await vi.advanceTimersByTimeAsync(799);
    expect(fn).toHaveBeenCalledTimes(1); // not retried immediately
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1599);
    expect(fn).toHaveBeenCalledTimes(2); // second wait is twice as long
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
  it('does not retry other errors', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(Object.assign(new Error('not logged in'), { type: 'http_error', code: -101 }));
    await expect(withBackoff(fn, 3, 1)).rejects.toThrow('not logged in');
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('gives up after the allowed number of tries', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(limited());
    await expect(withBackoff(fn, 3, 1)).rejects.toThrow('频繁');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
