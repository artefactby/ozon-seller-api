/**
 * The rate-limiting contract between the client and a limiter implementation.
 * Kept apart from the path-map types on purpose: the `/limiter` entry point
 * needs only these few interfaces, and must not drag the multi-megabyte
 * generated API declarations into every consumer's type checker.
 */

/** What the client tells the limiter about a call it is about to make. */
export interface RateLimitMeta {
  /** API path, e.g. `/v5/product/info/prices`. */
  path: string;
  /** Priority from the call options, `0` when unset. */
  priority: number;
  /** Abort signal of the call, if it has one. */
  signal?: AbortSignal;
}

/** What the client tells the limiter about how a call went. */
export interface RateLimitOutcome {
  path: string;
  /** HTTP status of the response. */
  status: number;
  /** `Retry-After` from the response, in milliseconds, when present. */
  retryAfterMs?: number;
  /** Ozon answered "Circle is open" — the method is blocked for a few minutes. */
  circuitOpen: boolean;
}

/**
 * The seam for rate limiting. Implement it to plug in your own scheduler — a
 * Redis-backed one shared across instances, for example. The built-in
 * implementation lives in the `artefactby-ozon-seller-api/limiter` subpath and
 * is in-process only.
 */
export interface OzonRateLimiter {
  /** Resolves when the call may proceed; rejects to cancel it. */
  acquire(meta: RateLimitMeta): Promise<void>;
  /** Optional feedback so the limiter can back off after a 429. */
  notify?(outcome: RateLimitOutcome): void;
}
