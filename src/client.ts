import { GET_PATHS } from './generated/http-methods';
import { isCircuitOpen, OzonApiError, parseRetryAfter } from './errors';
import type { OzonRateLimiter, RateLimitMeta, RateLimitOutcome } from './rate-limit';
import type {
  ApiPath,
  RawRequestOptions,
  RequestArgs,
  RequestOptions,
  ResponseOf,
} from './types';

const DEFAULT_BASE_URL = 'https://api-seller.ozon.ru';

/** Used between retries when no limiter is installed and no `Retry-After` came back. */
const DEFAULT_RETRY_DELAY_MS = 1_000;

/** The subset of `fetch` the client relies on. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Body shapes passed to `fetch` untouched. Derived from `RequestInit` rather
 * than spelled out, so it matches whichever lib (DOM or Node) is in play.
 */
type RawBody = NonNullable<RequestInit['body']>;

export interface OzonClientOptions {
  /** Client ID from the seller account. One client instance, one Client ID. */
  clientId: string;
  /** API key from the seller account. */
  apiKey: string;
  /** Defaults to `https://api-seller.ozon.ru`. */
  baseUrl?: string;
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Headers added to every request, e.g. a `User-Agent`. */
  headers?: Record<string, string>;
  /** Aborts requests that take longer than this. Off by default. */
  timeoutMs?: number;
  /**
   * Schedules outgoing calls and absorbs the API's backoff signals. The
   * built-in one lives in `artefactby-ozon-seller-api/limiter`; without it the
   * client still honours `Retry-After`, it just cannot pace calls in advance.
   */
  limiter?: OzonRateLimiter;
  /**
   * How many times a call rejected with 429 or "Circle is open" is repeated.
   * Defaults to 2. Only rejected calls are retried — never ones the API may
   * have already acted on.
   */
  maxRetries?: number;
}

/**
 * Typed client for the Ozon Seller API.
 *
 * ```ts
 * const client = new OzonClient({ clientId, apiKey });
 * const { items } = await client.request('/v5/product/info/prices', {
 *   cursor: '',
 *   limit: 100,
 *   filter: { visibility: 'ALL' },
 * });
 * ```
 *
 * Every path in the spec is callable this way; the request body and the result
 * are typed from the path literal.
 */
export class OzonClient {
  readonly #clientId: string;
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #headers: Record<string, string>;
  readonly #timeoutMs: number;
  readonly #limiter: OzonRateLimiter | undefined;
  readonly #maxRetries: number;

  constructor(options: OzonClientOptions) {
    if (!options?.clientId) throw new TypeError('OzonClient: clientId is required');
    if (!options.apiKey) throw new TypeError('OzonClient: apiKey is required');

    const fetchImpl =
      options.fetch ?? (globalThis.fetch?.bind(globalThis) as FetchLike | undefined);
    if (!fetchImpl) {
      throw new TypeError(
        'OzonClient: no fetch available. Use Node.js 18+ or pass a fetch implementation.',
      );
    }

    this.#clientId = options.clientId;
    this.#apiKey = options.apiKey;
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#fetch = fetchImpl;
    this.#headers = { ...options.headers };
    this.#timeoutMs = options.timeoutMs ?? 0;
    this.#limiter = options.limiter;
    this.#maxRetries = options.maxRetries ?? 2;
  }

  /**
   * Calls an API path and returns its typed payload, throwing
   * {@link OzonApiError} on a non-2xx status.
   */
  async request<P extends ApiPath>(path: P, ...args: RequestArgs<P>): Promise<ResponseOf<P>> {
    const [body, options] = args;
    const response = await this.requestRaw(path, body, options);

    if (!response.ok) throw await OzonApiError.fromResponse(response, path);

    return (await readPayload(response)) as ResponseOf<P>;
  }

  /**
   * Escape hatch returning the untouched `Response`: streaming, binary
   * downloads, `multipart/form-data` uploads, or anything the spec describes
   * inaccurately. Unlike {@link request}, it does not throw on a non-2xx
   * status — inspect `response.ok` yourself.
   *
   * A `body` that fetch already understands (`FormData`, `Blob`, a
   * `ReadableStream`, string, …) is passed through untouched; anything else is
   * serialized as JSON. A stream body is never retried — it is consumed by the
   * attempt that sends it.
   *
   * The method comes from the spec (GET for the few GET paths, POST otherwise);
   * pass `options.method` to override it, e.g. for a templated path whose
   * substituted URL no longer matches the spec literal.
   */
  async requestRaw(path: string, body?: unknown, options?: RawRequestOptions): Promise<Response> {
    // Auth headers go last: a client instance is bound to one Client ID, so
    // per-call headers must not be able to swap credentials underneath it.
    const headers = mergeHeaders(
      { Accept: 'application/json' },
      this.#headers,
      options?.headers,
      { 'Client-Id': this.#clientId, 'Api-Key': this.#apiKey },
    );

    let payload: RawBody | undefined;
    if (isRawBody(body)) {
      payload = body;
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      if (!Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json';
      }
    }

    const method = options?.method ?? (GET_PATHS.has(path) ? 'GET' : 'POST');
    // A stream is consumed by the attempt that sends it, so it cannot be re-sent.
    const oneShotBody = payload !== undefined && isStreamBody(payload);
    const meta: RateLimitMeta = {
      path,
      priority: options?.priority ?? 0,
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
    };

    for (let attempt = 0; ; attempt++) {
      await this.#limiter?.acquire(meta);

      const response = await this.#send(path, method, headers, payload, options);
      if (response.ok) return response;

      const outcome = await inspectFailure(response, path);
      this.#limiter?.notify?.(outcome);

      // Only a rejected request is safe to repeat: the API did not process it.
      // Anything else — including 5xx on these non-idempotent POSTs — is the
      // caller's to decide about.
      const retriable = (outcome.status === 429 || outcome.circuitOpen) && !oneShotBody;
      if (!retriable || attempt >= this.#maxRetries) return response;

      // A limiter that accepts notify() will hold the path back on the next
      // acquire(); with no limiter, or one that cannot be told, wait here.
      if (!this.#limiter?.notify) {
        await delay(outcome.retryAfterMs ?? DEFAULT_RETRY_DELAY_MS, options?.signal);
      }
    }
  }

  async #send(
    path: string,
    method: string,
    headers: Record<string, string>,
    payload: RawBody | undefined,
    options: RequestOptions | undefined,
  ): Promise<Response> {
    const timeout = withTimeout(options?.signal, options?.timeoutMs ?? this.#timeoutMs, path);

    try {
      return await this.#fetch(`${this.#baseUrl}${path}`, {
        method,
        headers,
        ...(payload === undefined ? {} : { body: payload }),
        // Node's fetch refuses a stream body unless half-duplex is declared.
        ...(payload !== undefined && isStreamBody(payload) ? { duplex: 'half' as const } : {}),
        ...(timeout.signal === undefined ? {} : { signal: timeout.signal }),
      });
    } catch (cause) {
      // fetch reports an aborted request as its own AbortError and buries the
      // reason in `cause`. Surface the timeout directly instead.
      if (timeout.expired) throw timeout.error(cause);
      throw cause;
    } finally {
      timeout.dispose();
    }
  }
}

/**
 * Reads a failed response through a clone, so the caller still receives an
 * untouched body, and reports what the limiter needs to know.
 */
async function inspectFailure(response: Response, path: string): Promise<RateLimitOutcome> {
  const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
  const text = await response
    .clone()
    .text()
    .catch(() => '');

  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON — the raw text is what we have */
  }

  return {
    path,
    status: response.status,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    circuitOpen: isCircuitOpen(body),
  };
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(finish, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('aborted'));
    };

    function finish() {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }

    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) return response.json();
  if (contentType !== '' && !contentType.startsWith('text/')) return response.blob();

  const text = await response.text();
  if (text === '') return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRawBody(body: unknown): body is RawBody {
  return (
    typeof body === 'string' ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
    isStreamBody(body)
  );
}

function isStreamBody(body: unknown): body is ReadableStream {
  return typeof ReadableStream !== 'undefined' && body instanceof ReadableStream;
}

/**
 * Merges header records left to right, treating names case-insensitively: a
 * later source replaces an earlier header instead of adding a case-variant
 * duplicate, which fetch would join into one comma-separated value.
 */
function mergeHeaders(
  ...sources: ReadonlyArray<Record<string, string> | undefined>
): Record<string, string> {
  const merged: Record<string, string> = {};
  const names = new Map<string, string>();

  for (const source of sources) {
    for (const [name, value] of Object.entries(source ?? {})) {
      const previous = names.get(name.toLowerCase());
      if (previous !== undefined && previous !== name) delete merged[previous];
      names.set(name.toLowerCase(), name);
      merged[name] = value;
    }
  }

  return merged;
}

interface Timeout {
  signal: AbortSignal | undefined;
  /** Whether this timeout — rather than the caller — aborted the request. */
  readonly expired: boolean;
  error: (cause: unknown) => Error;
  dispose: () => void;
}

/**
 * Combines the caller's signal with a timeout. Written by hand rather than
 * with `AbortSignal.any`, which needs Node.js 20.
 */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number, path: string): Timeout {
  const error = (cause: unknown) =>
    new Error(`Ozon API ${path}: timed out after ${timeoutMs} ms`, { cause });

  if (timeoutMs <= 0) {
    return { signal, expired: false, error, dispose: () => {} };
  }

  let expired = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    expired = true;
    controller.abort(error(undefined));
  }, timeoutMs);

  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    get expired() {
      return expired;
    },
    error,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}
