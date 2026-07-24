import { GET_PATHS } from './generated/http-methods';
import { OzonApiError } from './errors';
import type { ApiPath, RequestArgs, RequestOptions, ResponseOf } from './types';

const DEFAULT_BASE_URL = 'https://api-seller.ozon.ru';

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
   * A `body` that fetch already understands (`FormData`, `Blob`, string, …) is
   * passed through untouched; anything else is serialized as JSON.
   */
  async requestRaw(path: string, body?: unknown, options?: RequestOptions): Promise<Response> {
    // Auth headers go last: a client instance is bound to one Client ID, so
    // per-call headers must not be able to swap credentials underneath it.
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.#headers,
      ...options?.headers,
      'Client-Id': this.#clientId,
      'Api-Key': this.#apiKey,
    };

    let payload: RawBody | undefined;
    if (isRawBody(body)) {
      payload = body;
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['Content-Type'] ??= 'application/json';
    }

    const method = GET_PATHS.has(path) ? 'GET' : 'POST';
    const timeout = withTimeout(options?.signal, options?.timeoutMs ?? this.#timeoutMs, path);

    try {
      return await this.#fetch(`${this.#baseUrl}${path}`, {
        method,
        headers,
        ...(payload === undefined ? {} : { body: payload }),
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
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams)
  );
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
