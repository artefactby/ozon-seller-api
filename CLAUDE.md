# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

`artefactby-ozon-seller-api` — an unofficial typed TypeScript client for the
[Ozon Seller API](https://docs.ozon.ru/api/seller/), published to npm. Zero runtime
dependencies; Node.js >= 18 (relies on native `fetch`).

## Commands

- `npm run typecheck` — strict `tsc --noEmit`
- `npm test` / `npm run test:watch` — vitest
- `npm run build` / `npm run dev` — tsup (CJS + ESM + `.d.ts` into `dist/`)
- `prepublishOnly` chains typecheck + test + build automatically

## Architecture

1. **Typed core**: `client.request('/v5/product/info/prices', body)` — the path is a
   literal type; request/response types are inferred from a generated path map
   (openapi-fetch-style pattern). This covers every API operation.
2. **Tag-based wrapper modules** (e.g. `client.prices.getPrices(...)`) add ergonomics
   (pagination, chunking, progress) on top of the core; full coverage via wrappers is a
   non-goal — the core already provides it.
3. **Transport**: injectable `fetch` (defaults to the global one), `Client-Id`/`Api-Key`
   auth headers. One client instance == one Client ID.
4. **Errors**: typed `OzonApiError` (code + response body). The client returns typed
   data or throws — no envelope wrapping.
5. **Rate limiter**: separate subpath export (`artefactby-ozon-seller-api/limiter`) —
   token bucket (global + per-method budgets), reactive 429/`Retry-After` retries,
   "Circle is open" detection with per-method cooldown, backpressure, `AbortSignal`,
   priorities; swappable via the `OzonRateLimiter` interface. The built-in limiter is
   in-process only.

## Generated types

`src/types/generated.ts` is produced by `npm run codegen` (openapi-typescript) from a
local copy of the Ozon Seller API OpenAPI spec. The spec itself is a generator input
(`temp/swagger.json`, gitignored) and is not part of the repository — only the generated
output is committed. It is large (~70k lines: 458 operations, 2083 schemas), so treat it
as an opaque artifact: never edit it by hand, and review API updates as a regenerated
diff. Do not try to fetch docs.ozon.ru automatically — it is bot-protected; spec updates
are manual.

The generated shape is standard openapi-typescript v7: `paths` maps a path to its
method, each pointing at an entry in `operations`, where the request body lives at
`requestBody.content["application/json"]` and the response at
`responses[200].content["application/json"]`. Every operation also declares `Client-Id`
and `Api-Key` header parameters — the client supplies those, so they must never surface
in the public call signature.

## Rules

- **Zero runtime dependencies.** Anything added to `dependencies` needs a very good
  reason and explicit maintainer sign-off.
- **No mocks inside the package.** Test/mock scenarios are the consumer's concern; the
  injectable transport enables record/replay externally.
- **Credentials only via the client constructor** — never defaulted, never hardcoded.
  No real Client IDs, API keys, `offer_id`s, or production response data anywhere in
  the repo, including tests and fixtures.
- Business-level throttling rules (deduplication and the like) do not belong in the
  package — only transport-level limits do.
- `typescript` stays pinned to 5.x for now: the TS 7 native compiler breaks tsup's
  `.d.ts` build (rollup-plugin-dts).

## Code style

- Strict TypeScript (`strict`, `noUncheckedIndexedAccess`); keep the public API fully
  typed — no `any` in exported signatures.
- Tests are colocated: `src/**/*.test.ts` (vitest).
- Follow existing formatting; keep modules small and dependency-free.
