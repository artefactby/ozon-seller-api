/** Why a queued call never got its turn. */
export type QueueRejection =
  /** The queue was already at `maxSize`. */
  | 'queue-full'
  /** The call sat in the queue longer than `waitTimeoutMs`. */
  | 'wait-timeout'
  /** The caller's `AbortSignal` fired while the call was queued. */
  | 'aborted';

/**
 * Thrown by the built-in limiter when a call is turned away before it ever
 * reached the API — the backpressure signal for the caller.
 */
export class OzonQueueError extends Error {
  override readonly name = 'OzonQueueError';

  readonly reason: QueueRejection;
  readonly path: string;

  constructor(reason: QueueRejection, path: string, detail: string) {
    super(`Ozon rate limiter ${path}: ${detail}`);
    this.reason = reason;
    this.path = path;
  }
}

/**
 * Type guard for {@link OzonQueueError}. Prefer it over `instanceof`, which
 * fails when both the CJS and the ESM build end up loaded.
 */
export function isOzonQueueError(value: unknown): value is OzonQueueError {
  return value instanceof Error && value.name === 'OzonQueueError' && 'reason' in value;
}
