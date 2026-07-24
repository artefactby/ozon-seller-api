/** Error payload the API returns alongside a non-2xx status. */
export interface OzonErrorBody {
  code?: number;
  message?: string;
  details?: unknown[];
}

/**
 * Thrown when the API answers with a non-2xx status.
 *
 * Transport failures (DNS, TLS, aborted requests) are not wrapped — they
 * propagate as whatever the underlying `fetch` threw.
 */
export class OzonApiError extends Error {
  override readonly name = 'OzonApiError';

  /** HTTP status of the response. */
  readonly status: number;

  /** Path that was called, e.g. `/v5/product/info/prices`. */
  readonly path: string;

  /** Ozon's own error code, when the response carried one. */
  readonly code: number | undefined;

  /** Additional error information, when the response carried any. */
  readonly details: unknown[] | undefined;

  /** Parsed response body — an object for JSON errors, a string otherwise. */
  readonly body: unknown;

  /** Response headers, kept for `Retry-After` and tracing. */
  readonly headers: Headers;

  constructor(init: {
    status: number;
    path: string;
    body: unknown;
    headers: Headers;
    message?: string;
  }) {
    const parsed = isErrorBody(init.body) ? init.body : undefined;
    const message =
      init.message ??
      parsed?.message ??
      (typeof init.body === 'string' && init.body !== '' ? init.body : undefined) ??
      `Request failed with status ${init.status}`;

    super(`Ozon API ${init.path}: ${message}`);

    this.status = init.status;
    this.path = init.path;
    this.body = init.body;
    this.headers = init.headers;
    this.code = parsed?.code;
    this.details = parsed?.details;
  }

  /** Builds the error from a failed response, consuming its body. */
  static async fromResponse(response: Response, path: string): Promise<OzonApiError> {
    return new OzonApiError({
      status: response.status,
      path,
      body: await readBody(response),
      headers: response.headers,
    });
  }

  /** `Retry-After` in milliseconds, when the response asked us to wait. */
  get retryAfterMs(): number | undefined {
    return parseRetryAfter(this.headers.get('retry-after'));
  }
}

/**
 * Type guard for {@link OzonApiError}. Prefer it over `instanceof`: a project
 * that ends up with both the CJS and the ESM build loaded has two distinct
 * classes, and `instanceof` fails across them.
 */
export function isOzonApiError(value: unknown): value is OzonApiError {
  return value instanceof Error && value.name === 'OzonApiError' && 'status' in value;
}

function isErrorBody(body: unknown): body is OzonErrorBody {
  return typeof body === 'object' && body !== null;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Parses a `Retry-After` header, which is either a delay in seconds or an
 * HTTP date. Returns `undefined` for a missing or unparseable value, and never
 * a negative delay.
 */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (value === null) return undefined;

  const trimmed = value.trim();
  if (trimmed === '') return undefined;

  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;

  return Math.max(0, date - now);
}
