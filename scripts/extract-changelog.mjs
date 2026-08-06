/**
 * Prints the CHANGELOG.md section for one version to stdout; the release
 * workflow (.github/workflows/release.yml) feeds it to the GitHub Release
 * body. Fails loudly when the section is missing, so a release is never
 * published without notes.
 */
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('usage: node scripts/extract-changelog.mjs <version>');
  process.exit(1);
}

const lines = readFileSync('CHANGELOG.md', 'utf8').split('\n');
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start === -1) {
  console.error(`extract-changelog: CHANGELOG.md has no "## [${version}]" section.`);
  process.exit(1);
}
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i].startsWith('## ')) {
    end = i;
    break;
  }
}

process.stdout.write(`${lines.slice(start + 1, end).join('\n').trim()}\n`);
