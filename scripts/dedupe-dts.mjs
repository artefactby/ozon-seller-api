/**
 * Halves the published type declarations. tsup emits every declaration twice —
 * a .d.ts for the CJS build and an identical .d.mts for the ESM one — and the
 * generated API types weigh megabytes. An ESM declaration may re-export a
 * CommonJS one, so each entry's .d.mts is replaced with a one-line re-export
 * of its .d.ts twin, and chunk .d.mts files nothing references anymore are
 * removed. Runs after tsup as part of `npm run build`.
 */
import { readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const DIST = 'dist';
const SHIM = "export * from './index.js';\n";

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (path.endsWith('.d.mts')) files.push(path);
  }
})(DIST);

let saved = 0;
for (const file of files) {
  const before = statSync(file).size;
  if (file.split(sep).at(-1) === 'index.d.mts') {
    // An entry point: package.json points the ESM types condition here.
    writeFileSync(file, SHIM);
    saved += before - SHIM.length;
  } else {
    // A shared chunk: only ever imported from the .d.mts files shimmed above.
    rmSync(file);
    saved += before;
  }
}

console.log(`deduplicated ${files.length} .d.mts file(s), saved ${(saved / 1e6).toFixed(1)} MB`);
