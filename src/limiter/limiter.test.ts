import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isOzonQueueError, OzonQueueError } from './errors';
import { TokenBucketLimiter } from './limiter';
import type { RateLimitMeta } from '../types';

function meta(path: string, overrides: Partial<RateLimitMeta> = {}): RateLimitMeta {
  return { path, priority: 0, ...overrides };
}

/** Resolves once all pending microtasks have run. */
const settle = () => Promise.resolve();

describe('TokenBucketLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lets a burst through up to the global budget, then paces the rest', async () => {
    const limiter = new TokenBucketLimiter({ global: { limit: 3, intervalMs: 1_000 } });
    const done: number[] = [];

    for (let i = 0; i < 5; i++) {
      void limiter.acquire(meta('/v1/seller/info')).then(() => done.push(i));
    }
    await settle();

    expect(done).toEqual([0, 1, 2]);
    expect(limiter.size).toBe(2);

    // A token is refilled every intervalMs / limit ms.
    await vi.advanceTimersByTimeAsync(334);
    expect(done).toEqual([0, 1, 2, 3]);

    await vi.advanceTimersByTimeAsync(334);
    expect(done).toEqual([0, 1, 2, 3, 4]);
    expect(limiter.size).toBe(0);
  });

  it('applies the per-path budget on top of the global one', async () => {
    const limiter = new TokenBucketLimiter({
      global: { limit: 100, intervalMs: 1_000 },
      perPath: { '/v2/products/stocks': { limit: 2, intervalMs: 60_000 } },
    });
    const done: string[] = [];

    for (let i = 0; i < 3; i++) {
      void limiter.acquire(meta('/v2/products/stocks')).then(() => done.push(`stocks-${i}`));
    }
    void limiter.acquire(meta('/v1/seller/info')).then(() => done.push('info'));
    await settle();

    // The third stocks call is held back; the unrelated path is not.
    expect(done).toEqual(['stocks-0', 'stocks-1', 'info']);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(done).toContain('stocks-2');
  });

  it('serves higher priority first and keeps arrival order within a priority', async () => {
    const limiter = new TokenBucketLimiter({ global: { limit: 1, intervalMs: 1_000 } });
    const done: string[] = [];

    void limiter.acquire(meta('/a')).then(() => done.push('first-through'));
    await settle();

    void limiter.acquire(meta('/b', { priority: 0 })).then(() => done.push('low-1'));
    void limiter.acquire(meta('/c', { priority: 10 })).then(() => done.push('high-1'));
    void limiter.acquire(meta('/d', { priority: 0 })).then(() => done.push('low-2'));
    void limiter.acquire(meta('/e', { priority: 10 })).then(() => done.push('high-2'));

    await vi.advanceTimersByTimeAsync(5_000);

    expect(done).toEqual(['first-through', 'high-1', 'high-2', 'low-1', 'low-2']);
  });

  it('holds a path back after a 429 and honours Retry-After', async () => {
    const limiter = new TokenBucketLimiter({ global: { limit: 100, intervalMs: 1_000 } });
    let released = false;

    limiter.notify({ path: '/v1/seller/info', status: 429, retryAfterMs: 5_000, circuitOpen: false });
    void limiter.acquire(meta('/v1/seller/info')).then(() => {
      released = true;
    });
    await settle();

    expect(released).toBe(false);
    expect(limiter.cooldownUntil('/v1/seller/info')).toBeDefined();

    await vi.advanceTimersByTimeAsync(4_999);
    expect(released).toBe(false);

    await vi.advanceTimersByTimeAsync(2);
    expect(released).toBe(true);
    expect(limiter.cooldownUntil('/v1/seller/info')).toBeUndefined();
  });

  it('cools a path down after "Circle is open" without blocking other paths', async () => {
    const limiter = new TokenBucketLimiter({
      global: { limit: 100, intervalMs: 1_000 },
      circuitCooldownMs: 120_000,
    });
    const done: string[] = [];

    limiter.notify({ path: '/v1/blocked', status: 400, circuitOpen: true });

    void limiter.acquire(meta('/v1/blocked')).then(() => done.push('blocked'));
    void limiter.acquire(meta('/v1/other')).then(() => done.push('other'));
    await settle();

    expect(done).toEqual(['other']);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(done).toEqual(['other', 'blocked']);
  });

  it('reports backpressure through hooks', async () => {
    const onEnqueue = vi.fn();
    const onRateLimited = vi.fn();
    const onCircuitOpen = vi.fn();
    const limiter = new TokenBucketLimiter({
      global: { limit: 1, intervalMs: 1_000 },
      hooks: { onEnqueue, onRateLimited, onCircuitOpen },
    });

    void limiter.acquire(meta('/v1/a'));
    void limiter.acquire(meta('/v1/b', { priority: 3 }));
    await settle();

    expect(onEnqueue).toHaveBeenCalledTimes(2);
    expect(onEnqueue).toHaveBeenLastCalledWith({ path: '/v1/b', priority: 3, size: 1 });

    limiter.notify({ path: '/v1/a', status: 429, retryAfterMs: 2_000, circuitOpen: false });
    expect(onRateLimited).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/v1/a', retryAfterMs: 2_000 }),
    );

    limiter.notify({ path: '/v1/a', status: 400, circuitOpen: true });
    expect(onCircuitOpen).toHaveBeenCalledWith(expect.objectContaining({ path: '/v1/a' }));

    await vi.advanceTimersByTimeAsync(120_000);
  });

  it('rejects once the queue is full', async () => {
    const limiter = new TokenBucketLimiter({
      global: { limit: 1, intervalMs: 60_000 },
      maxSize: 1,
    });

    await limiter.acquire(meta('/v1/a'));
    void limiter.acquire(meta('/v1/b'));

    const rejected = await limiter.acquire(meta('/v1/c')).catch((error: unknown) => error);

    expect(isOzonQueueError(rejected)).toBe(true);
    expect((rejected as OzonQueueError).reason).toBe('queue-full');
    expect((rejected as OzonQueueError).path).toBe('/v1/c');
  });

  it('rejects a call that waited longer than waitTimeoutMs', async () => {
    const limiter = new TokenBucketLimiter({
      global: { limit: 1, intervalMs: 60_000 },
      waitTimeoutMs: 1_000,
    });

    await limiter.acquire(meta('/v1/a'));
    const pending = limiter.acquire(meta('/v1/b')).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(1_000);
    const rejected = await pending;

    expect((rejected as OzonQueueError).reason).toBe('wait-timeout');
    expect(limiter.size).toBe(0);
  });

  it('drops a queued call when its signal aborts', async () => {
    const limiter = new TokenBucketLimiter({ global: { limit: 1, intervalMs: 60_000 } });
    const controller = new AbortController();

    await limiter.acquire(meta('/v1/a'));
    const pending = limiter
      .acquire(meta('/v1/b', { signal: controller.signal }))
      .catch((error: unknown) => error);

    controller.abort();
    const rejected = await pending;

    expect((rejected as OzonQueueError).reason).toBe('aborted');
    expect(limiter.size).toBe(0);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const limiter = new TokenBucketLimiter();
    const rejected = await limiter
      .acquire(meta('/v1/a', { signal: AbortSignal.abort() }))
      .catch((error: unknown) => error);

    expect((rejected as OzonQueueError).reason).toBe('aborted');
  });

  it('defaults to the documented budgets', async () => {
    const limiter = new TokenBucketLimiter();
    const done: number[] = [];

    // 50 rps globally: the 51st call has to wait.
    for (let i = 0; i < 51; i++) {
      void limiter.acquire(meta('/v1/seller/info')).then(() => done.push(i));
    }
    await settle();
    expect(done).toHaveLength(50);

    await vi.advanceTimersByTimeAsync(20);
    expect(done).toHaveLength(51);

    // 80 per minute on the stocks path, regardless of the global budget.
    const stocks = new TokenBucketLimiter();
    const stocksDone: number[] = [];
    for (let i = 0; i < 100; i++) {
      void stocks.acquire(meta('/v2/products/stocks')).then(() => stocksDone.push(i));
    }
    await settle();
    expect(stocksDone).toHaveLength(50); // the global budget bites first

    // A second later the global budget has refilled, but the path's own budget
    // (80 per minute, refilling ~1.3 tokens per second) is now the binding one.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(stocksDone).toHaveLength(81);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(stocksDone).toHaveLength(100);
  });
});
