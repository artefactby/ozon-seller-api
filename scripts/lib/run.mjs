/**
 * Cross-platform child-process runner for the repository scripts.
 *
 * On Windows, npm and other node_modules/.bin entries are .cmd shims that are
 * only reachable through a shell; git and node are real executables and never
 * need one. Arguments here are simple words (script names, branch names), so
 * the shell path is safe from quoting issues — callers passing multi-line
 * arguments (e.g. commit messages) must bypass the shell, see api-sync.mjs.
 */
import { spawnSync } from 'node:child_process';

/**
 * Runs a command with inherited stdio. On failure invokes `onFail` (a hook
 * for recovery hints), prints the failed command, and exits the process.
 */
export function run(command, args, { onFail } = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    onFail?.();
    const detail = result.error ? ` (${result.error.message})` : '';
    console.error(`\`${command} ${args.join(' ')}\` failed${detail}.`);
    process.exit(typeof result.status === 'number' ? result.status : 1);
  }
}
