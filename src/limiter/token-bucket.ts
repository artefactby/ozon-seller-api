/**
 * A token bucket: `limit` tokens per `intervalMs`, refilled continuously
 * rather than in steps, so a burst is allowed up to the bucket's capacity and
 * the sustained rate settles at the configured one.
 */
export class TokenBucket {
  readonly limit: number;
  readonly intervalMs: number;

  #tokens: number;
  #updatedAt: number;

  constructor(limit: number, intervalMs: number, now: number) {
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new RangeError(`TokenBucket: limit must be a positive number, got ${limit}`);
    }
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new RangeError(`TokenBucket: intervalMs must be a positive number, got ${intervalMs}`);
    }

    this.limit = limit;
    this.intervalMs = intervalMs;
    this.#tokens = limit;
    this.#updatedAt = now;
  }

  /** Milliseconds until a token is free. `0` means one is free right now. */
  delay(now: number): number {
    this.#refill(now);
    if (this.#tokens >= 1) return 0;
    return Math.ceil(((1 - this.#tokens) * this.intervalMs) / this.limit);
  }

  /** Spends a token. Call only after {@link delay} returned `0`. */
  consume(now: number): void {
    this.#refill(now);
    this.#tokens -= 1;
  }

  #refill(now: number): void {
    const elapsed = now - this.#updatedAt;
    if (elapsed <= 0) return;

    this.#tokens = Math.min(this.limit, this.#tokens + (elapsed * this.limit) / this.intervalMs);
    this.#updatedAt = now;
  }
}
