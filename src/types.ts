import type { paths } from './generated/types';

export type { paths, components, operations } from './generated/types';

/** Any path exposed by the Ozon Seller API. */
export type ApiPath = keyof paths;

type Present<T> = T extends undefined ? never : T;

/**
 * The operation behind a path. The spec declares exactly one method per path,
 * so whichever of `get`/`post` is present is the operation.
 */
type OperationOf<P extends ApiPath> = [Present<paths[P]['post']>] extends [never]
  ? Present<paths[P]['get']>
  : Present<paths[P]['post']>;

type OkContent<P extends ApiPath> = OperationOf<P> extends {
  responses: { 200: { content: infer C } };
}
  ? C
  : never;

/**
 * The JSON request body a path expects, or `never` for the operations that
 * take no body.
 */
export type RequestBodyOf<P extends ApiPath> = OperationOf<P> extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;

/**
 * What a successful call resolves to: the parsed JSON payload, `void` for the
 * operations that answer with an empty body, or a `Blob` for the few that
 * return a PDF or a PNG.
 */
// The empty-body case has to be tested first: `never` vacuously satisfies the
// JSON check and would infer `unknown` as the payload.
export type ResponseOf<P extends ApiPath> = [OkContent<P>] extends [never]
  ? void
  : OkContent<P> extends { 'application/json': infer R }
    ? R
    : Blob;

/** Paths whose operation takes a JSON request body. */
export type PathWithBody = {
  [P in ApiPath]: [RequestBodyOf<P>] extends [never] ? never : P;
}[ApiPath];

/** Paths whose operation takes no request body. */
export type PathWithoutBody = Exclude<ApiPath, PathWithBody>;

/** Per-call options. */
export interface RequestOptions {
  /** Aborts the request. Combined with the client-level timeout, if any. */
  signal?: AbortSignal;
  /** Extra headers for this call, merged over the client-level ones. */
  headers?: Record<string, string>;
  /** Overrides the client-level timeout for this call. `0` disables it. */
  timeoutMs?: number;
  /**
   * Scheduling priority handed to the rate limiter: higher goes first, calls
   * of equal priority keep their order. Defaults to `0`. What the numbers mean
   * is entirely up to you — the package only orders by them.
   */
  priority?: number;
}

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

/**
 * Trailing arguments of `client.request()`: the body is required exactly for
 * the paths that declare one.
 */
export type RequestArgs<P extends ApiPath> = [RequestBodyOf<P>] extends [never]
  ? [body?: undefined, options?: RequestOptions]
  : [body: RequestBodyOf<P>, options?: RequestOptions];
