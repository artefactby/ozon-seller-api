import { describe, expect, it, vi } from 'vitest';
import { OzonClient, type FetchLike } from './client';
import { isOzonApiError, OzonApiError } from './errors';

const CREDENTIALS = { clientId: 'test-client-id', apiKey: 'test-api-key' };

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

/** A fetch stub that answers every call with the same response. */
function stubFetch(response: Response | (() => Response | Promise<Response>)) {
  return vi.fn<FetchLike>(async () => (typeof response === 'function' ? response() : response));
}

function clientWith(fetchImpl: ReturnType<typeof stubFetch>) {
  return new OzonClient({ ...CREDENTIALS, fetch: fetchImpl });
}

describe('constructor', () => {
  it('rejects missing credentials', () => {
    expect(() => new OzonClient({ clientId: '', apiKey: 'k' })).toThrow(/clientId is required/);
    expect(() => new OzonClient({ clientId: 'c', apiKey: '' })).toThrow(/apiKey is required/);
  });

  it('trims trailing slashes off a custom base URL', async () => {
    const fetchImpl = stubFetch(jsonResponse({}));
    const client = new OzonClient({
      ...CREDENTIALS,
      fetch: fetchImpl,
      baseUrl: 'http://localhost:3000/',
    });

    await client.request('/v1/seller/info');

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://localhost:3000/v1/seller/info');
  });
});

describe('request', () => {
  it('posts a JSON body to the default base URL with auth headers', async () => {
    const fetchImpl = stubFetch(jsonResponse({ items: [], total: 0 }));
    const client = clientWith(fetchImpl);

    const result = await client.request('/v5/product/info/prices', {
      cursor: '',
      limit: 100,
      filter: { visibility: 'ALL' },
    });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api-seller.ozon.ru/v5/product/info/prices');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Client-Id': 'test-client-id',
      'Api-Key': 'test-api-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      cursor: '',
      limit: 100,
      filter: { visibility: 'ALL' },
    });
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('sends GET without a body for the paths the spec serves over GET', async () => {
    const fetchImpl = stubFetch(jsonResponse({ result: { actions: [] } }));

    await clientWith(fetchImpl).request('/v1/actions');

    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
  });

  it('omits the body for POST operations that take none', async () => {
    const fetchImpl = stubFetch(jsonResponse({ name: 'seller' }));

    await clientWith(fetchImpl).request('/v1/seller/info');

    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
  });

  it('merges custom headers but keeps credentials fixed', async () => {
    const fetchImpl = stubFetch(jsonResponse({}));
    const client = new OzonClient({
      ...CREDENTIALS,
      fetch: fetchImpl,
      headers: { 'User-Agent': 'example-app/1.0' },
    });

    await client.request('/v1/seller/info', undefined, {
      headers: { 'X-Trace': 'abc', 'Client-Id': 'spoofed' },
    });

    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({
      'User-Agent': 'example-app/1.0',
      'X-Trace': 'abc',
      'Client-Id': 'test-client-id',
    });
  });

  it('resolves to undefined when the API answers with an empty body', async () => {
    const fetchImpl = stubFetch(new Response(null, { status: 204 }));

    await expect(
      clientWith(fetchImpl).request('/v1/notification/delete', { id: 1 }),
    ).resolves.toBeUndefined();
  });

  it('resolves to a Blob for binary responses', async () => {
    const fetchImpl = stubFetch(
      new Response('%PDF-1.7', { status: 200, headers: { 'content-type': 'application/pdf' } }),
    );

    const label = await clientWith(fetchImpl).request('/v2/posting/fbs/package-label', {
      posting_number: ['0001-1'],
    });

    expect(label).toBeInstanceOf(Blob);
    expect(await (label as Blob).text()).toBe('%PDF-1.7');
  });
});

describe('error handling', () => {
  it('throws OzonApiError carrying status, code and message', async () => {
    const fetchImpl = stubFetch(
      jsonResponse({ code: 7, message: 'Invalid offer_id', details: [{ reason: 'not found' }] }, {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const error = await clientWith(fetchImpl)
      .request('/v1/seller/info')
      .catch((caught: unknown) => caught);

    expect(isOzonApiError(error)).toBe(true);
    expect(error).toBeInstanceOf(OzonApiError);

    const apiError = error as OzonApiError;
    expect(apiError.status).toBe(404);
    expect(apiError.code).toBe(7);
    expect(apiError.path).toBe('/v1/seller/info');
    expect(apiError.details).toEqual([{ reason: 'not found' }]);
    expect(apiError.message).toBe('Ozon API /v1/seller/info: Invalid offer_id');
  });

  it('keeps a non-JSON error body as text and exposes Retry-After', async () => {
    const fetchImpl = stubFetch(
      new Response('Circle is open', {
        status: 429,
        headers: { 'content-type': 'text/plain', 'retry-after': '30' },
      }),
    );

    const error = (await clientWith(fetchImpl)
      .request('/v1/seller/info')
      .catch((caught: unknown) => caught)) as OzonApiError;

    expect(error.status).toBe(429);
    expect(error.body).toBe('Circle is open');
    expect(error.code).toBeUndefined();
    expect(error.retryAfterMs).toBe(30_000);
  });

  it('lets transport failures through untouched', async () => {
    const failure = new TypeError('fetch failed');
    const fetchImpl = stubFetch(() => Promise.reject(failure));

    await expect(clientWith(fetchImpl).request('/v1/seller/info')).rejects.toBe(failure);
  });
});

describe('cancellation', () => {
  it('passes the caller signal through', async () => {
    const controller = new AbortController();
    const fetchImpl = stubFetch(jsonResponse({}));

    await clientWith(fetchImpl).request('/v1/seller/info', undefined, {
      signal: controller.signal,
    });

    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('aborts once the timeout elapses', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn<FetchLike>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      );
      const client = new OzonClient({ ...CREDENTIALS, fetch: fetchImpl, timeoutMs: 5_000 });

      const pending = client.request('/v1/seller/info');
      const assertion = expect(pending).rejects.toThrow(/timed out after 5000 ms/);
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a timeout even when fetch hides the reason behind its own AbortError', async () => {
    vi.useFakeTimers();
    try {
      // undici rejects with a generic AbortError and keeps the abort reason in
      // `cause`, so the client cannot rely on the reason reaching it.
      const fetchImpl = vi.fn<FetchLike>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
            });
          }),
      );
      const client = new OzonClient({ ...CREDENTIALS, fetch: fetchImpl, timeoutMs: 1_000 });

      const pending = client.request('/v1/seller/info');
      const assertion = expect(pending).rejects.toThrow(
        'Ozon API /v1/seller/info: timed out after 1000 ms',
      );
      await vi.advanceTimersByTimeAsync(1_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates the caller reason when both a signal and a timeout are set', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<FetchLike>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const client = new OzonClient({ ...CREDENTIALS, fetch: fetchImpl, timeoutMs: 60_000 });

    const pending = client.request('/v1/seller/info', undefined, { signal: controller.signal });
    controller.abort(new Error('caller changed their mind'));

    await expect(pending).rejects.toThrow(/caller changed their mind/);
  });
});

describe('requestRaw', () => {
  it('returns the response without throwing on a non-2xx status', async () => {
    const fetchImpl = stubFetch(new Response('nope', { status: 500 }));

    const response = await clientWith(fetchImpl).requestRaw('/v1/seller/info');

    expect(response.status).toBe(500);
  });

  it('passes a FormData body through without JSON serialization', async () => {
    const fetchImpl = stubFetch(jsonResponse({}));
    const form = new FormData();
    form.set('name', 'certificate.pdf');

    await clientWith(fetchImpl).requestRaw('/v1/product/certificate/create', form);

    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(init?.body).toBe(form);
    expect(init?.headers).not.toHaveProperty('Content-Type');
  });
});
