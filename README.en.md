# artefactby-ozon-seller-api

[![npm version](https://img.shields.io/npm/v/artefactby-ozon-seller-api.svg)](https://www.npmjs.com/package/artefactby-ozon-seller-api)
[![npm downloads](https://img.shields.io/npm/dm/artefactby-ozon-seller-api.svg)](https://www.npmjs.com/package/artefactby-ozon-seller-api)
[![Node.js](https://img.shields.io/node/v/artefactby-ozon-seller-api.svg)](https://www.npmjs.com/package/artefactby-ozon-seller-api)
[![license](https://img.shields.io/npm/l/artefactby-ozon-seller-api.svg)](./LICENSE)
[![CI](https://github.com/artefactby/ozon-seller-api/actions/workflows/ci.yml/badge.svg)](https://github.com/artefactby/ozon-seller-api/actions/workflows/ci.yml)
[![Socket Badge](https://socket.dev/api/badge/npm/package/artefactby-ozon-seller-api)](https://socket.dev/npm/package/artefactby-ozon-seller-api)

Unofficial typed [Ozon Seller API](https://docs.ozon.ru/api/seller/) client for
TypeScript and JavaScript.

[README на русском](./README.md)

```ts
import { OzonClient } from 'artefactby-ozon-seller-api';

const client = new OzonClient({
  clientId: process.env.OZON_CLIENT_ID!,
  apiKey: process.env.OZON_API_KEY!,
});

// `items` is typed from the path literal — no generics, no casts
const { items } = await client.request('/v5/product/info/prices', {
  cursor: '',
  limit: 100,
  filter: { visibility: 'ALL' },
});
```

- **The whole API, not a curated subset.** Types are generated from the official
  OpenAPI spec (API version 2.1): 459 operations, 2089 schemas. Every path is called
  the same way, with the request body and response inferred from the path literal.
- **Zero runtime dependencies.** Native `fetch` only. Node.js >= 18, CJS and ESM.
- **A built-in rate limiter that knows Ozon's limits** — 50 rps per Client-Id plus the
  per-method rates from the spec — as a separate subpath: skip it and it costs nothing.
- **Careful retries.** Nearly every Ozon operation is a POST, so only calls rejected
  with 429 or "Circle is open" are retried: those the API demonstrably did not process.
  Retrying "just in case" is deliberately not a thing this client does.

Status: 0.x — the public API may still change between minor releases. Not affiliated
with Ozon.

## Installation

```bash
npm install artefactby-ozon-seller-api
```

One client instance is bound to one Client-Id. The package never reads credentials from
the environment on its own — pass them to the constructor explicitly.

## Rate limiting

Ozon answers 429 with `Retry-After` when a limit is exceeded and blocks a method for a
few minutes ("Circle is open") after a burst. The client honours `Retry-After` on its
own and repeats a rejected call up to `maxRetries` times (2 by default). To avoid
hitting the limits at all, install the built-in limiter — it paces calls in advance:

```ts
import { OzonClient } from 'artefactby-ozon-seller-api';
import { TokenBucketLimiter } from 'artefactby-ozon-seller-api/limiter';

const client = new OzonClient({
  clientId,
  apiKey,
  limiter: new TokenBucketLimiter({
    // The defaults are exactly what Ozon documents: 50 rps globally plus the
    // per-method rates from the spec (e.g. /v2/products/stocks — 80 per minute).
    // Add limits you have measured yourself:
    perPath: { '/v3/product/list': { limit: 20, intervalMs: 1_000 } },
    maxSize: 5_000, // reject calls once the queue is this deep
    waitTimeoutMs: 30_000, // reject calls that wait longer
    hooks: {
      onEnqueue: ({ size }) => metrics.gauge('ozon.queue', size),
      onRateLimited: ({ path, until }) => log.warn({ path, until }, 'ozon 429'),
      onCircuitOpen: ({ path, until }) => log.error({ path, until }, 'circle is open'),
    },
  }),
});
```

Calls are served by priority (`priority` in the call options, higher first), then by
arrival. A path stuck at its own limit does not block the others. Backpressure surfaces
as a typed `OzonQueueError` with a `reason` of `queue-full`, `wait-timeout`, or
`aborted`.

The limiter is in-process. Several processes sharing one Client-Id each get their own
budget — for a limit that spans instances, implement the `OzonRateLimiter` interface
over shared storage:

```ts
import type { OzonRateLimiter } from 'artefactby-ozon-seller-api';

const redisLimiter: OzonRateLimiter = {
  async acquire({ path, priority, signal }) {
    /* wait for a slot in Redis */
  },
  notify({ path, status, retryAfterMs, circuitOpen }) {
    /* record the backoff so every instance sees it */
  },
};
```

## Error handling

A non-2xx response throws an `OzonApiError`; transport failures (DNS, TLS, dropped
connections) propagate untouched — the package does not wrap them.

```ts
import { isOzonApiError } from 'artefactby-ozon-seller-api';

try {
  await client.request('/v1/product/import/prices', { prices });
} catch (error) {
  if (isOzonApiError(error)) {
    error.status; // HTTP status, e.g. 429
    error.code; // Ozon's own error code, when the response carried one
    error.retryAfterMs; // parsed Retry-After, when present
    error.body; // response payload (object, or the raw text)
  }
  throw error;
}
```

## Options

```ts
const client = new OzonClient({
  clientId,
  apiKey,
  baseUrl: 'https://api-seller.ozon.ru', // default
  fetch: customFetch, // default: the global fetch
  headers: { 'User-Agent': 'my-app/1.0' }, // sent with every request
  timeoutMs: 30_000, // off by default
});

await client.request('/v1/actions', undefined, {
  signal: controller.signal,
  timeoutMs: 5_000, // overrides the client-level timeout; 0 disables it
  headers: { 'X-Request-Id': id },
  priority: 10, // for the limiter: higher goes first
});
```

The injectable `fetch` is the seam for tests: pass your own implementation to record
and replay traffic. The package ships no mocks of its own.

## Requests beyond the types

`request()` covers the JSON operations. For everything else there is `requestRaw()` —
it returns the untouched `Response` and does not throw on a non-2xx status:

```ts
// PDF with posting labels
const response = await client.requestRaw('/v2/posting/fbs/package-label', {
  posting_number: ['0001-1'],
});
const pdf = await response.blob();

// The spec's single templated path needs an explicit method: with the guid
// substituted, the URL no longer matches the spec literal
const label = await client.requestRaw(`/v1/cargoes-label/file/${guid}`, undefined, {
  method: 'GET',
});
```

`multipart/form-data` (pass a `FormData`), binary bodies and `ReadableStream`s go
through as-is; anything else is serialized as JSON. A stream is never retried — it is
consumed by the first attempt that sends it.

## Pagination is yours

The package deliberately stops at the transport line: one call is one logical API
request. Pagination loops, dataset assembly and batch splitting are your code, and the
typed core leaves them very little to do:

```ts
const items = [];
let cursor = '';
do {
  const page = await client.request('/v5/product/info/prices', {
    cursor,
    limit: 1000,
    filter: { visibility: 'ALL' },
  });
  items.push(...(page.items ?? []));
  cursor = page.cursor ?? '';
} while (cursor !== '');
```

## Known limitations

- The types are exactly as accurate as Ozon's spec. Where it diverges from reality,
  `requestRaw()` is the way out.
- The spec is updated in the package manually — brand-new API methods may lag behind.
- The root entry's type declarations weigh about 3 MB (that is the entire spec); the
  type checker's first pass will notice. The `/limiter` subpath is free of them.
- The built-in limiter does not share its budget across processes (see above).

## License

[MIT](./LICENSE)
