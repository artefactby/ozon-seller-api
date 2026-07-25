# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

`artefactby-ozon-seller-api` — an unofficial typed TypeScript client for the
[Ozon Seller API](https://docs.ozon.ru/api/seller/), published to npm. Zero runtime
dependencies; Node.js >= 18 (relies on native `fetch`).

## Commands

- `npm run typecheck` — strict `tsc --noEmit`
- `npm test` / `npm run test:watch` — vitest
- `npm run build` — tsup (CJS + ESM + `.d.ts` into `dist/`), then
  `scripts/dedupe-dts.mjs` replaces each `.d.mts` with a one-line re-export of its
  `.d.ts` twin (the generated types weigh ~3 MB; shipping them twice doubled the
  package). `npm run dev` is tsup only — dev output keeps the duplicates.
- `prepublishOnly` chains typecheck + test + build automatically

## Layout

```
src/
  index.ts          public exports
  client.ts         OzonClient: transport, headers, timeouts, retries, decoding
  errors.ts         OzonApiError, isOzonApiError, parseRetryAfter, isCircuitOpen
  types.ts          public type helpers over the generated path map
  rate-limit.ts     the OzonRateLimiter contract (no generated imports)
  generated/        codegen output — never edit by hand
  limiter/          built-in limiter, published as the /limiter subpath
```

The two entry points share no runtime code, so the limiter costs nothing to consumers
who bring their own. `src/rate-limit.ts` holds the `OzonRateLimiter` contract (the
client option references it) while `src/limiter/` holds the implementation. The
contract lives apart from `src/types.ts` deliberately: the `/limiter` declarations
must not pull the multi-megabyte generated types into consumers' type checkers —
keep `rate-limit.ts` free of imports from `generated/`.

README.md (Russian, the default — the audience is Russian-speaking) and README.en.md
(English) are translations of each other; edit both or neither.

## Architecture

1. **Typed core**: `client.request('/v5/product/info/prices', body)` — the path is a
   literal type; request/response types are inferred from a generated path map
   (openapi-fetch-style pattern). This covers every API operation. `requestRaw()` is the
   escape hatch returning the raw `Response` (binary payloads, multipart uploads,
   operations the spec describes inaccurately).
2. **Transport**: injectable `fetch` (defaults to the global one), `Client-Id`/`Api-Key`
   auth headers. One client instance == one Client ID.
3. **Errors**: typed `OzonApiError` (code + response body). The client returns typed
   data or throws — no envelope wrapping.
4. **Rate limiter**: separate subpath export (`artefactby-ozon-seller-api/limiter`) —
   token bucket (global + per-path budgets), per-path cooldowns fed by what the API
   reports, backpressure, `AbortSignal`, priorities; swappable via the `OzonRateLimiter`
   interface. The built-in limiter is in-process only. The retry *loop* lives in the
   client (only it can re-send); the limiter owns the *policy* — `notify()` records a
   cooldown, and the next `acquire()` blocks for as long as it lasts.

The limiter's defaults are exactly the limits Ozon documents and nothing else: 50 rps
per Client ID globally, plus the per-method rates stated in the spec's own operation
descriptions — five paths today, each quoted at its entry in `DEFAULT_PATH_BUDGETS`
(`src/limiter/limiter.ts`). Resist adding limits that cannot be pointed at in the docs.
On every spec update, rescan the operation descriptions for new rate statements (the
wording varies: «не больше N запросов в секунду», «до N запросов в минуту», «N раз в
минуту»). Retries are restricted to 429 and "Circle is open" because only a rejected
request is safe to repeat; almost every operation is a POST.

**The package is transport-only — a settled decision, not an interim state.** One call
owns one logical request; a 429/"Circle is open" retry re-sends that same request, so it
stays inside the client. Anything that issues several requests and merges their results
— pagination loops, dataset assembly, chunked writes, per-tag convenience modules — is
the consumer's layer and must not be added to this package.

## Generated types

`src/generated/types.ts` is produced by `npm run codegen` (openapi-typescript) from a
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

`scripts/emit-http-methods.mjs` (part of `npm run codegen`) emits the runtime method map
the type system cannot provide. It fails loudly if a spec update introduces a method
other than GET/POST, or more than one method per path — both assumptions the client
relies on. It also warns about templated paths (see below); if new ones appear, update
the README's escape-hatch section.

Facts about the spec worth knowing before touching the type helpers: no operation
declares path or query parameters, but one deprecated path carries a template segment
in the path string itself (`/v1/cargoes-label/file/{file_guid}`, GET, shutdown
announced for 2026-04-10) — the typed `request()` cannot substitute it, and the
substituted URL misses the `GET_PATHS` lookup, so consumers call it via `requestRaw`
with `method: 'GET'`. 415 operations answer with JSON, 35 with an empty
body, 8 with a PDF or a PNG; 30 take no request body; two take `multipart/form-data`.
Beware that `never` vacuously satisfies any `extends` check — in `ResponseOf` the
empty-body case must be tested before the JSON one, or every void response silently
becomes `unknown`.

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
- The dev toolchain (vitest 4 / vite 7) requires Node >= 20.19, while the package
  itself supports Node >= 18. CI therefore tests on 20/22/24 and separately verifies
  the Node 18 claim by running `scripts/runtime-smoke.mjs` (dependency-free, exercises
  the built `dist/`) on Node 18. Keep that script free of devDependency imports.

## Code style

- Strict TypeScript (`strict`, `noUncheckedIndexedAccess`); keep the public API fully
  typed — no `any` in exported signatures.
- Tests are colocated: `src/**/*.test.ts` (vitest).
- Follow existing formatting; keep modules small and dependency-free.
