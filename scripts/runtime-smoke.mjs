/**
 * Dependency-free smoke test of the built package (dist/) against a local HTTP
 * server. Exists to verify the oldest supported runtime: the dev toolchain
 * (vitest 4 / vite 7) requires Node >= 20, while the package itself claims
 * Node >= 18 — so CI builds on a modern Node and runs this file on 18.
 *
 * Uses only node: builtins and the global fetch. Run: node scripts/runtime-smoke.mjs
 */
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const esmRoot = await import(new URL('../dist/index.mjs', import.meta.url).href);
const esmLimiter = await import(new URL('../dist/limiter/index.mjs', import.meta.url).href);

// The CJS builds of both entry points load too.
const require = createRequire(import.meta.url);
const cjsRoot = require('../dist/index.js');
const cjsLimiter = require('../dist/limiter/index.js');
assert.equal(typeof cjsRoot.OzonClient, 'function');
assert.equal(typeof cjsLimiter.TokenBucketLimiter, 'function');

const { OzonClient, isOzonApiError } = esmRoot;
const { TokenBucketLimiter } = esmLimiter;

const seen = [];
let rateLimitedOnce = false;

const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    seen.push({
      method: req.method,
      url: req.url,
      clientId: req.headers['client-id'],
      apiKey: req.headers['api-key'],
      body: Buffer.concat(chunks).toString() || null,
    });

    if (req.url === '/v1/seller/info' && !rateLimitedOnce) {
      // First call is rejected so the retry path gets exercised.
      rateLimitedOnce = true;
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' });
      res.end(JSON.stringify({ code: 8, message: 'You have reached request rate limit' }));
    } else if (req.url === '/v1/seller/info') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ name: 'Example seller' }));
    } else if (req.url === '/v1/actions') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ result: [] }));
    } else if (req.url === '/v1/notification/delete') {
      res.writeHead(204);
      res.end();
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 5, message: 'Not found' }));
    }
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const events = [];
const client = new OzonClient({
  clientId: 'smoke-client',
  apiKey: 'smoke-key',
  baseUrl: `http://127.0.0.1:${server.address().port}`,
  limiter: new TokenBucketLimiter({
    hooks: { onRateLimited: (event) => events.push(`rate-limited:${event.path}`) },
  }),
});

// 429 -> cooldown -> retry -> success, with auth headers on every attempt.
const info = await client.request('/v1/seller/info');
assert.deepEqual(info, { name: 'Example seller' });
assert.equal(seen.length, 2, 'expected one retry after the 429');
assert.ok(seen.every((r) => r.clientId === 'smoke-client' && r.apiKey === 'smoke-key'));
assert.deepEqual(events, ['rate-limited:/v1/seller/info']);

// GET paths go over GET, without a body.
await client.request('/v1/actions');
assert.equal(seen.at(-1).method, 'GET');
assert.equal(seen.at(-1).body, null);

// An empty 204 resolves to undefined.
assert.equal(await client.request('/v1/notification/delete', { id: 1 }), undefined);

// A non-2xx response throws a typed error the guard recognizes.
const error = await client.request('/v4/product/info/limit').catch((caught) => caught);
assert.ok(isOzonApiError(error), 'expected an OzonApiError');
assert.equal(error.status, 404);
assert.equal(error.code, 5);

// The caller's AbortSignal cancels the call.
const controller = new AbortController();
const pending = client.request('/v1/actions', undefined, { signal: controller.signal });
controller.abort();
const aborted = await pending.then(
  () => null,
  (caught) => caught,
);
assert.ok(aborted instanceof Error, 'expected the aborted call to reject');

server.close();
console.log(`runtime smoke passed on Node ${process.version}`);
