import type { OzonRateLimiter, RateLimitMeta, RateLimitOutcome } from '../types';
import { OzonQueueError } from './errors';
import { TokenBucket } from './token-bucket';

/** A budget of `limit` requests per `intervalMs`. */
export interface RateBudget {
  limit: number;
  intervalMs: number;
}

export interface LimiterHooks {
  /** A call joined the queue. `size` is the queue depth after it did. */
  onEnqueue?: (event: { path: string; priority: number; size: number }) => void;
  /** The API answered 429. `until` is when the path becomes eligible again. */
  onRateLimited?: (event: { path: string; retryAfterMs?: number; until: number }) => void;
  /** The API answered "Circle is open" and the path is now cooling down. */
  onCircuitOpen?: (event: { path: string; until: number }) => void;
}

export interface TokenBucketLimiterOptions {
  /** Global budget for the Client ID. Defaults to Ozon's documented 50 rps. */
  global?: RateBudget;
  /**
   * Extra budgets for individual paths, applied on top of the global one.
   * Defaults to the single documented per-method limit: 80 requests per minute
   * for `/v2/products/stocks`.
   */
  perPath?: Record<string, RateBudget>;
  /** Maximum queue depth before calls are rejected. Unlimited by default. */
  maxSize?: number;
  /** Maximum time a call may sit in the queue. Unlimited by default. */
  waitTimeoutMs?: number;
  /**
   * How long a path stays on cooldown after "Circle is open", when the
   * response carries no `Retry-After`. Ozon says "a few minutes".
   */
  circuitCooldownMs?: number;
  /** Fallback cooldown after a 429 without `Retry-After`. */
  rateLimitCooldownMs?: number;
  hooks?: LimiterHooks;
}

/** 50 requests per second per Client ID, as documented by Ozon. */
export const DEFAULT_GLOBAL_BUDGET: RateBudget = { limit: 50, intervalMs: 1_000 };

/**
 * Per-method budgets Ozon documents explicitly. Only one is documented as a
 * request rate; everything else is governed by the global budget. Pass your own
 * map to add limits you have measured yourself.
 */
export const DEFAULT_PATH_BUDGETS: Readonly<Record<string, RateBudget>> = {
  '/v2/products/stocks': { limit: 80, intervalMs: 60_000 },
};

interface QueueEntry {
  meta: RateLimitMeta;
  resolve: () => void;
  reject: (error: Error) => void;
  /** Insertion order, to keep equal priorities first-in-first-out. */
  seq: number;
  dispose: () => void;
}

/**
 * The built-in limiter: a priority queue over token buckets, one global and one
 * per configured path, plus per-path cooldowns driven by what the API reports.
 *
 * It is **in-process only** — several Node processes sharing one Client ID each
 * get their own budget. Implement {@link OzonRateLimiter} over shared storage
 * if you need a limit that spans instances.
 *
 * Ordering: calls are served by priority, then by arrival. A call held back by
 * its own path budget does not block calls to other paths.
 */
export class TokenBucketLimiter implements OzonRateLimiter {
  readonly #global: TokenBucket;
  readonly #budgets: Record<string, RateBudget>;
  readonly #buckets = new Map<string, TokenBucket>();
  readonly #cooldowns = new Map<string, number>();
  readonly #queue: QueueEntry[] = [];
  readonly #maxSize: number;
  readonly #waitTimeoutMs: number;
  readonly #circuitCooldownMs: number;
  readonly #rateLimitCooldownMs: number;
  readonly #hooks: LimiterHooks;

  #seq = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: TokenBucketLimiterOptions = {}) {
    const global = options.global ?? DEFAULT_GLOBAL_BUDGET;

    this.#global = new TokenBucket(global.limit, global.intervalMs, Date.now());
    this.#budgets = { ...DEFAULT_PATH_BUDGETS, ...options.perPath };
    this.#maxSize = options.maxSize ?? Number.POSITIVE_INFINITY;
    this.#waitTimeoutMs = options.waitTimeoutMs ?? 0;
    this.#circuitCooldownMs = options.circuitCooldownMs ?? 60_000;
    this.#rateLimitCooldownMs = options.rateLimitCooldownMs ?? 1_000;
    this.#hooks = options.hooks ?? {};
  }

  /** Number of calls waiting for a slot. */
  get size(): number {
    return this.#queue.length;
  }

  /** When `path` is allowed to run again, or `undefined` if it is not cooling down. */
  cooldownUntil(path: string): number | undefined {
    const until = this.#cooldowns.get(path);
    return until !== undefined && until > Date.now() ? until : undefined;
  }

  acquire(meta: RateLimitMeta): Promise<void> {
    if (meta.signal?.aborted) {
      return Promise.reject(
        new OzonQueueError('aborted', meta.path, 'the call was aborted before it was queued'),
      );
    }
    if (this.#queue.length >= this.#maxSize) {
      return Promise.reject(
        new OzonQueueError('queue-full', meta.path, `the queue is full (${this.#maxSize})`),
      );
    }

    return new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = {
        meta,
        resolve,
        reject,
        seq: this.#seq++,
        dispose: () => {},
      };

      const drop = (error: Error) => {
        const index = this.#queue.indexOf(entry);
        if (index === -1) return;
        this.#queue.splice(index, 1);
        entry.dispose();
        reject(error);
      };

      const timer =
        this.#waitTimeoutMs > 0
          ? setTimeout(() => {
              drop(
                new OzonQueueError(
                  'wait-timeout',
                  meta.path,
                  `waited longer than ${this.#waitTimeoutMs} ms for a slot`,
                ),
              );
            }, this.#waitTimeoutMs)
          : undefined;

      const onAbort = () => {
        drop(new OzonQueueError('aborted', meta.path, 'the call was aborted while queued'));
      };
      meta.signal?.addEventListener('abort', onAbort, { once: true });

      entry.dispose = () => {
        if (timer !== undefined) clearTimeout(timer);
        meta.signal?.removeEventListener('abort', onAbort);
      };

      this.#insert(entry);
      this.#hooks.onEnqueue?.({
        path: meta.path,
        priority: meta.priority,
        size: this.#queue.length,
      });
      this.#pump();
    });
  }

  notify(outcome: RateLimitOutcome): void {
    const now = Date.now();

    if (outcome.circuitOpen) {
      const until = now + (outcome.retryAfterMs ?? this.#circuitCooldownMs);
      this.#hold(outcome.path, until);
      this.#hooks.onCircuitOpen?.({ path: outcome.path, until });
      return;
    }

    if (outcome.status === 429) {
      const until = now + (outcome.retryAfterMs ?? this.#rateLimitCooldownMs);
      this.#hold(outcome.path, until);
      this.#hooks.onRateLimited?.({
        path: outcome.path,
        ...(outcome.retryAfterMs === undefined ? {} : { retryAfterMs: outcome.retryAfterMs }),
        until,
      });
    }
  }

  #hold(path: string, until: number): void {
    const current = this.#cooldowns.get(path) ?? 0;
    if (until > current) this.#cooldowns.set(path, until);
    this.#pump();
  }

  /** Inserts by priority (higher first), keeping arrival order within a priority. */
  #insert(entry: QueueEntry): void {
    let low = 0;
    let high = this.#queue.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      const other = this.#queue[mid]!;
      const goesLater =
        other.meta.priority > entry.meta.priority ||
        (other.meta.priority === entry.meta.priority && other.seq < entry.seq);
      if (goesLater) low = mid + 1;
      else high = mid;
    }

    this.#queue.splice(low, 0, entry);
  }

  /** Milliseconds before `path` clears its own constraints, ignoring the global one. */
  #pathDelay(path: string, now: number): number {
    const cooldown = this.#cooldowns.get(path);
    const cooldownDelay = cooldown !== undefined && cooldown > now ? cooldown - now : 0;

    return Math.max(cooldownDelay, this.#bucketFor(path, now)?.delay(now) ?? 0);
  }

  #bucketFor(path: string, now: number): TokenBucket | undefined {
    const budget = this.#budgets[path];
    if (!budget) return undefined;

    let bucket = this.#buckets.get(path);
    if (!bucket) {
      bucket = new TokenBucket(budget.limit, budget.intervalMs, now);
      this.#buckets.set(path, bucket);
    }
    return bucket;
  }

  /** Dispatches everything that may run now, then sleeps until the next one can. */
  #pump = (): void => {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }

    const now = Date.now();
    let nextDelay = Number.POSITIVE_INFINITY;

    for (let index = 0; index < this.#queue.length; ) {
      // Once the global budget is spent nothing else can run this tick.
      const globalDelay = this.#global.delay(now);
      if (globalDelay > 0) {
        nextDelay = Math.min(nextDelay, globalDelay);
        break;
      }

      const entry = this.#queue[index]!;
      const delay = this.#pathDelay(entry.meta.path, now);
      if (delay > 0) {
        nextDelay = Math.min(nextDelay, delay);
        index++;
        continue;
      }

      this.#queue.splice(index, 1);
      this.#global.consume(now);
      this.#bucketFor(entry.meta.path, now)?.consume(now);
      entry.dispose();
      entry.resolve();
    }

    if (this.#queue.length > 0 && nextDelay !== Number.POSITIVE_INFINITY) {
      this.#timer = setTimeout(this.#pump, Math.max(1, nextDelay));
    }
  };
}
