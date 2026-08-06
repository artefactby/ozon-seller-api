/**
 * Regenerates the OpenAPI-derived artifacts from the local spec snapshot:
 * the type declarations (openapi-typescript), the runtime HTTP-method map
 * (emit-http-methods.mjs), and the API-surface manifest that the sync script
 * diffs against to detect breaking changes (see lib/api-surface.mjs).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSurface, serializeManifest } from './lib/api-surface.mjs';
import { MANIFEST, SPEC, TYPES } from './lib/paths.mjs';
import { run } from './lib/run.mjs';

run('openapi-typescript', [SPEC, '-o', TYPES]);
run('node', ['scripts/emit-http-methods.mjs']);

const spec = JSON.parse(readFileSync(SPEC, 'utf8'));
writeFileSync(MANIFEST, serializeManifest(buildSurface(spec)));
console.log(`${SPEC} → ${MANIFEST}`);
