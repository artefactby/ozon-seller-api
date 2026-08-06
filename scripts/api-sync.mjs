/**
 * Prepares an API-sync branch from a fresh spec snapshot.
 *
 * Reads the local spec snapshot (downloaded manually — docs.ozon.ru is
 * bot-protected), cuts an api-sync/YYYY-MM-DD branch off up-to-date main,
 * regenerates the types, runs the full check suite, writes a review report,
 * commits the generated diff, and pushes the branch. The report doubles as
 * the commit body, which the PR workflow lifts into the pull request
 * description (.github/workflows/create-pr.yml). The CHANGELOG entry and the
 * version bump are added on top by the reviewer — see MAINTAINER.md.
 *
 * Breaking changes are detected deterministically by diffing the API-surface
 * manifest committed at HEAD against the surface of the fresh snapshot:
 * paths, HTTP methods, schemas, fields, field signatures and required flags
 * (see lib/api-surface.mjs). The version decision on a breaking change stays
 * with a human.
 *
 * Flags: --no-push (prepare the branch and the report, skip the push).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSurface, diffSurfaces } from './lib/api-surface.mjs';
import { GENERATED, MANIFEST, REPORT, SPEC } from './lib/paths.mjs';
import { run } from './lib/run.mjs';

const noPush = process.argv.includes('--no-push');

function fail(message) {
  console.error(`api-sync: ${message}`);
  process.exit(1);
}

/** Captures a git command's output. */
function git(...args) {
  // The manifest read via `git show` can approach the 1 MB default maxBuffer.
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trimEnd();
}

function branchExists(name) {
  try {
    git('rev-parse', '--verify', '--quiet', `refs/heads/${name}`);
    return true;
  } catch {
    return false;
  }
}

// --- The fresh snapshot ---

let spec;
try {
  spec = JSON.parse(readFileSync(SPEC, 'utf8'));
} catch (error) {
  fail(
    `${SPEC} is missing or not valid JSON (${error.message}). ` +
      'Download https://docs.ozon.ru/api/seller/swagger.json manually first.',
  );
}
const surface = buildSurface(spec);
if (Object.keys(surface.paths).length === 0) {
  fail(`${SPEC} declares no paths; is it the right file?`);
}

// --- Git preconditions ---

if (git('status', '--porcelain') !== '') {
  fail('the working tree is not clean; commit or stash before syncing.');
}
const currentBranch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (currentBranch !== 'main') fail(`expected to start from main, found ${currentBranch}.`);
run('git', ['pull', '--ff-only', 'origin', 'main']);

// --- The previous surface, from the manifest committed at HEAD ---

let previousSurface;
try {
  previousSurface = JSON.parse(git('show', `HEAD:${MANIFEST}`));
} catch {
  fail(
    `HEAD carries no readable ${MANIFEST}. Bootstrap it first: run \`npm run codegen\` ` +
      'on the snapshot matching HEAD and commit the manifest to main.',
  );
}

// --- Branch, codegen, checks ---

const now = new Date();
const today = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');

let branch = `api-sync/${today}`;
for (let n = 2; branchExists(branch); n++) branch = `api-sync/${today}-${n}`;

// On a failure past the branch creation, nothing is cleaned up automatically:
// the branch and the regenerated files stay in place for diagnostics, and the
// exact rollback commands are printed instead.
function printRecovery() {
  console.error(
    [
      `api-sync: the branch ${branch} and the regenerated files are left in place for diagnostics.`,
      'To roll back:',
      `  git restore ${GENERATED}`,
      '  git switch main',
      `  git branch -D ${branch}`,
    ].join('\n'),
  );
}
const step = (command, args) => run(command, args, { onFail: printRecovery });

run('git', ['switch', '-c', branch]);
step('npm', ['run', 'codegen']);

if (git('status', '--porcelain', '--', GENERATED) === '') {
  run('git', ['switch', 'main']);
  run('git', ['branch', '-d', branch]);
  console.log('api-sync: the snapshot does not change the generated types; nothing to release.');
  process.exit(0);
}

step('npm', ['run', 'typecheck']);
step('npm', ['run', 'test']);
step('npm', ['run', 'build']);

// --- Diff analysis ---

const diff = diffSurfaces(previousSurface, surface);

// --- Report ---

const list = (entries) => entries.map((entry) => `- \`${entry}\``).join('\n');
const section = (title, entries) =>
  entries.length > 0 ? ['', `## ${title} (${entries.length})`, '', list(entries)] : [];

const oldPathCount = Object.keys(previousSurface.paths ?? {}).length;
const oldSchemaCount = Object.keys(previousSurface.schemas ?? {}).length;

const report = [
  `# Отчёт синхронизации API — ${today}`,
  '',
  `Ветка: \`${branch}\`. Снимок: \`${SPEC}\`.`,
  '',
  '## Сводка',
  '',
  `- Пути: ${oldPathCount} → ${Object.keys(surface.paths).length}` +
    ` (+${diff.pathsAdded.length} / −${diff.pathsRemoved.length})`,
  `- Схемы: ${oldSchemaCount} → ${Object.keys(surface.schemas).length}` +
    ` (+${diff.schemasAdded.length} / −${diff.schemasRemoved.length})`,
  `- Новые поля в существующих схемах: ${diff.fieldsAdded.length}`,
  '- Проверки: typecheck, test, build — пройдены',
  diff.breaking
    ? '- Breaking changes: обнаружены — версию выбирает человек, см. ниже'
    : '- Breaking changes: не обнаружены',
  '',
  'Детерминированная проверка покрывает пути, HTTP-методы, схемы, поля,',
  'подписи типов и флаги required. Семантику изменившихся подписей (сужение',
  'или расширение) оценивает ревьюер по диффу `src/generated/`.',
  ...section('Добавленные пути', diff.pathsAdded),
  ...section('Удалённые пути — breaking change', diff.pathsRemoved),
  ...section('Смена HTTP-метода — breaking change', diff.methodChanged),
  ...section('Удалённые схемы — breaking change', diff.schemasRemoved),
  ...section('Изменённые схемы — breaking change', diff.schemasChanged),
  ...section('Удалённые поля — breaking change', diff.fieldsRemoved),
  ...section('Изменённые поля — breaking change', diff.fieldsChanged),
  '',
  '## Дальше',
  '',
  '1. Мини-ревью `/api-sync-release` в Cursor (процедура — в MAINTAINER.md, раздел',
  '   «Мини-ревью релиза»). Данные об обновлении Ozon — текст release notes,',
  '   уведомление из Telegram, скриншот, любой формат — прикладываются при наличии',
  '   как дополнительный слой сверки; их отсутствие мини-ревью не блокирует.',
  '2. Merge PR — публикация в npm, тег и GitHub Release произойдут автоматически.',
  '',
].join('\n');

writeFileSync(REPORT, report);

// --- Commit and push ---

step('git', ['add', GENERATED]);

// The report rides along as the commit body; a multi-line argument must not
// go through a Windows shell (see lib/run.mjs), hence execFileSync directly.
const subject = `feat(types): sync OpenAPI with Seller API updates (${today})`;
try {
  execFileSync('git', ['commit', '-m', subject, '-m', report], { stdio: 'inherit' });
} catch {
  printRecovery();
  process.exit(1);
}

if (noPush) {
  console.log(`api-sync: branch ${branch} is ready (push skipped, --no-push).`);
} else {
  run('git', ['push', '-u', 'origin', branch], {
    onFail: () =>
      console.error(
        `api-sync: the commit is in place; retry with \`git push -u origin ${branch}\`.`,
      ),
  });
  console.log(`api-sync: branch ${branch} is pushed; CI opens the pull request.`);
}
console.log(`api-sync: report written to ${REPORT}.`);
if (diff.breaking) {
  console.warn(
    'api-sync: breaking changes detected (see the report); the version decision is yours.',
  );
}
