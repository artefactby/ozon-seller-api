# artefactby-ozon-seller-api

Unofficial typed TypeScript client for the [Ozon Seller API](https://docs.ozon.ru/api/seller/).

> **Status: early development.** The 0.0.x line is a pre-release placeholder — nothing
> here is ready for use yet. The first usable release will be 0.1.x.

## Planned

- Fully typed request core covering every Ozon Seller API operation
  (`client.request('/v5/product/info/prices', body)`), with request/response types
  generated from the OpenAPI spec
- Zero runtime dependencies; native `fetch` (Node.js >= 18)
- Injectable transport and a typed `OzonApiError`
- Built-in rate limiter (token bucket, 429/`Retry-After` retries, "Circle is open"
  cooldown) as a separate `artefactby-ozon-seller-api/limiter` subpath export
- Ergonomic per-tag wrapper modules for common operations (pagination, chunking)

## License

[GPL-3.0](./LICENSE)
