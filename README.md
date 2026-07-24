# artefactby-ozon-seller-api

Unofficial typed TypeScript client for the [Ozon Seller API](https://docs.ozon.ru/api/seller/).
Every path in the API is callable and typed from day one — the request body and the
result are inferred from the path literal.

Zero runtime dependencies. Node.js >= 18 (uses the native `fetch`).

> **Status: early development (0.0.x).** The core is in place, but the package is not
> published yet and the API may still change. Not affiliated with Ozon.

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

## Planned

- Built-in rate limiter as a subpath export (`artefactby-ozon-seller-api/limiter`):
  token bucket, 429/`Retry-After` retries, "Circle is open" cooldown, swappable via an
  `OzonRateLimiter` interface
- Ergonomic per-tag wrapper modules (pagination, chunking) over the typed core

## License

[GPL-3.0](./LICENSE)
