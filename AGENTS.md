# AGENTS.md

Source of truth for AI coding agents working in this repository.

This file contains implementation guidance for agents, not the maintainer's
operational handbook. Repository workflow, release steps, and publisher setup
live in `MAINTAINER.md`.

## Project identity

- Package: `artefactby-ozon-seller-api`
- Purpose: unofficial typed TypeScript client for the Ozon Seller API
- Runtime contract: zero runtime dependencies; package itself supports Node.js `>= 18`
- Dev toolchain: Node.js `>= 20.19`

## Validation commands

- `npm run typecheck` — strict `tsc --noEmit`
- `npm test` / `npm run test:watch` — vitest
- `npm run build` — tsup, then `scripts/dedupe-dts.mjs`
- `npm run codegen` — regenerate `src/generated/` from the local OpenAPI snapshot
- `npm run api-sync` — maintainer helper for spec-sync branches; see `MAINTAINER.md`

After substantive edits, run the smallest relevant verification set. For release-
critical changes, prefer `typecheck` + `test` + `build`.

## Repository layout

```text
src/
  index.ts          public exports
  client.ts         OzonClient: transport, headers, timeouts, retries, decoding
  errors.ts         OzonApiError, isOzonApiError, parseRetryAfter, isCircuitOpen
  types.ts          public type helpers over the generated path map
  rate-limit.ts     OzonRateLimiter contract (no generated imports)
  generated/        codegen output — never edit by hand
  limiter/          built-in limiter, published as the /limiter subpath
scripts/
  codegen.mjs       regenerates src/generated/: types, http-methods, manifest
  emit-http-methods.mjs
  dedupe-dts.mjs
  runtime-smoke.mjs
  api-sync.mjs      prepares an api-sync branch from a fresh spec snapshot
  extract-changelog.mjs
  lib/              shared helpers: paths, run, api-surface (manifest + diff)
```

## Architectural constraints

1. **Transport-only boundary.** One call owns one logical API request. Do not add
   pagination loops, dataset assemblers, chunked writers, or convenience modules
   that issue multiple requests.
2. **Typed core.** `client.request('/path', body)` infers request/response types
   from the generated path map. `requestRaw()` is the escape hatch for binary
   payloads, multipart uploads, and spec mismatches.
3. **Auth model.** Credentials enter only through the client constructor. Never
   hardcode or default `Client-Id`, API keys, or production data.
4. **Rate limiting split.** Retry transport stays in the client; policy lives in
   the limiter via the `OzonRateLimiter` interface.

## Generated-types rules

- `src/generated/types.ts` is produced from a local OpenAPI snapshot; never edit
  it by hand.
- The input snapshot is local-only (`temp/swagger.json` by default). Do not try to
  fetch docs.ozon.ru automatically; the site is bot-protected and the workflow is
  intentionally manual.
- Runtime HTTP methods are emitted by `scripts/emit-http-methods.mjs`. It must fail
  loudly if the spec introduces anything other than exactly one GET or POST method
  per path.
- `src/generated/manifest.json` is the API-surface manifest emitted by codegen:
  paths with methods plus per-field schema signatures. `api-sync` diffs it against
  the copy committed at HEAD to detect breaking changes, so it must stay committed.
  Never edit it by hand. It is not published to npm (`files` whitelists `dist/`),
  so it has no effect on the installed package size.
- The generated shape follows openapi-typescript v7:
  - `paths[path][method] -> operations[...]`
  - request body: `requestBody.content["application/json"]`
  - response body: `responses[200].content["application/json"]`
- One deprecated templated path exists in the spec:
  `/v1/cargoes-label/file/{file_guid}`. It must go through `requestRaw()` with
  `method: 'GET'`.

## Important repository facts

- README policy: `README.md` (Russian) and `README.en.md` (English) are paired
  translations. Update both or neither.
- The `/limiter` entry point must stay free of imports from `src/generated/`,
  otherwise consumers would pull the multi-megabyte generated declarations into
  unrelated type checks.
- The default limiter budgets must only encode limits explicitly documented by
  Ozon. Do not invent undocumented per-path limits.
- The package is currently `0.x`: breaking changes are allowed between minor
  versions, but agents must not choose a breaking version bump on their own.

## Hard constraints for code changes

- Zero runtime dependencies. Adding anything to `dependencies` requires strong
  justification and explicit maintainer approval.
- No built-in mocks. Testing seams come from injectable transport.
- Keep public exported types fully typed; no `any` in exported signatures.
- Keep modules small and dependency-free where possible.
- Follow existing formatting and colocate tests as `src/**/*.test.ts`.

## Node/version nuances

- The package runtime supports Node 18 because it only relies on native `fetch`.
- The dev toolchain (vitest 4 / vite 7) requires Node `>= 20.19`.
- CI therefore tests 20/22/24 and separately smoke-tests the built output on Node 18.
- Keep `scripts/runtime-smoke.mjs` free of devDependency imports.

## Documentation split

- End-user package docs belong in `README.md` and `README.en.md`.
- Maintainer and release workflow belongs in `MAINTAINER.md`.
- Agent-specific instructions belong here.
