# artefactby-ozon-seller-api

Unofficial typed TypeScript client for the [Ozon Seller API](https://docs.ozon.ru/api/seller/).
Every path in the API is callable and typed from day one — the request body and the
result are inferred from the path literal.

Zero runtime dependencies. Node.js >= 18 (uses the native `fetch`).

> **Status: 0.x.** The public API may still change between minor releases. Unofficial —
> not affiliated with Ozon.

## Usage

```ts
import { OzonClient } from 'artefactby-ozon-seller-api';

const client = new OzonClient({
  clientId: process.env.OZON_CLIENT_ID!,
  apiKey: process.env.OZON_API_KEY!,
});

// `items` is typed from the path — no casts, no generics to pass.
const { items } = await client.request('/v5/product/info/prices', {
  cursor: '',
  limit: 100,
  filter: { visibility: 'ALL' },
});
```

One client instance is bound to one Client ID. Credentials are never read from the
environment by the package itself — pass them explicitly.

### Errors

A non-2xx response throws an `OzonApiError`; transport failures propagate untouched.

```ts
import { isOzonApiError } from 'artefactby-ozon-seller-api';

try {
  await client.request('/v1/product/import/prices', { prices });
} catch (error) {
  if (isOzonApiError(error)) {
    error.status; // 429
    error.code; // Ozon's error code, when present
    error.message; // 'Ozon API /v1/product/import/prices: ...'
    error.retryAfterMs; // parsed Retry-After, when present
    error.body; // parsed payload (object, or the raw text)
  }
  throw error;
}
```

### Options

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
});
```

The injectable `fetch` is the seam for tests: pass your own implementation to record and
replay traffic. The package ships no mocks of its own.

### Rate limiting

Ozon allows 50 requests per second per Client ID, answers 429 with `Retry-After`, and
blocks a method for a few minutes with "Circle is open" when it sees a burst. The client
honours `Retry-After` on its own — a call rejected with 429 or "Circle is open" is
retried up to `maxRetries` times (2 by default). Nothing else is ever retried: the API
may already have acted on it.

To pace calls *before* they are rejected, install the built-in limiter:

```ts
import { OzonClient } from 'artefactby-ozon-seller-api';
import { TokenBucketLimiter } from 'artefactby-ozon-seller-api/limiter';

const client = new OzonClient({
  clientId,
  apiKey,
  limiter: new TokenBucketLimiter({
    global: { limit: 50, intervalMs: 1_000 }, // default: Ozon's documented 50 rps
    // Merged over DEFAULT_PATH_BUDGETS — every per-method rate the spec documents
    // (e.g. /v2/products/stocks 80/min, /v1/product/placement-zone/info 10 rps).
    // Add limits you have measured yourself:
    perPath: { '/v3/product/list': { limit: 20, intervalMs: 1_000 } },
    maxSize: 5_000, // reject once the queue is this deep
    waitTimeoutMs: 30_000, // reject calls that wait longer than this
    hooks: {
      onEnqueue: ({ path, size }) => metrics.gauge('ozon.queue', size),
      onRateLimited: ({ path, until }) => log.warn({ path, until }, 'ozon 429'),
      onCircuitOpen: ({ path, until }) => log.error({ path, until }, 'circle is open'),
    },
  }),
});
```

Calls are served by priority (higher first, `priority` in the call options), then by
arrival. A call held back by its own path budget does not block calls to other paths.
Backpressure surfaces as a typed `OzonQueueError` with `reason` of `queue-full`,
`wait-timeout`, or `aborted`.

**The built-in limiter is in-process.** Several Node processes sharing one Client ID
each get their own budget. For a limit that spans instances, implement the
`OzonRateLimiter` interface over shared storage:

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

### Escape hatch

`client.request()` covers the JSON operations. For the handful that return a PDF or a
PNG, upload `multipart/form-data`, or that the spec describes inaccurately, use
`requestRaw()` — it returns the untouched `Response` and does not throw on a non-2xx
status.

```ts
const response = await client.requestRaw('/v2/posting/fbs/package-label', {
  posting_number: ['0001-1'],
});
```

## What is typed

Types are generated from the official OpenAPI spec (API version 2.1): 458 operations,
2083 schemas. Helper types are exported for building your own signatures:

```ts
import type { ApiPath, RequestBodyOf, ResponseOf, components } from 'artefactby-ozon-seller-api';

type Prices = ResponseOf<'/v5/product/info/prices'>;
type PriceItem = components['schemas']['productv5GetProductInfoPricesV5Item'];
```

## Scope: transport only

The package deliberately stops at the transport line: one call is one logical API
request (a 429 / "Circle is open" retry re-sends the same request, so it stays inside).
Anything that issues several requests and merges their results — pagination loops,
dataset assembly, batch splitting — belongs to your code, where the typed core keeps it
to a few lines:

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

## License

[GPL-3.0](./LICENSE)
