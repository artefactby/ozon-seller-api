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

/** Options for `requestRaw()` — {@link RequestOptions} plus raw-level overrides. */
export interface RawRequestOptions extends RequestOptions {
  /**
   * HTTP method override. Without it the method comes from the spec: GET for
   * the handful of paths served over GET, POST for everything else. Needed for
   * the one path with a template segment (`/v1/cargoes-label/file/{file_guid}`),
   * where the URL with the guid substituted no longer matches the spec literal
   * and would otherwise fall back to POST.
   */
  method?: string;
}

/**
 * Trailing arguments of `client.request()`: the body is required exactly for
 * the paths that declare one.
 */
export type RequestArgs<P extends ApiPath> = [RequestBodyOf<P>] extends [never]
  ? [body?: undefined, options?: RequestOptions]
  : [body: RequestBodyOf<P>, options?: RequestOptions];
