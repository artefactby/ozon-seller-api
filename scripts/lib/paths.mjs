/**
 * Repository paths shared by the codegen and sync scripts.
 *
 * The values are deliberately hardcoded. An earlier iteration read them from a
 * gitignored .env, but two knobs do not justify the extra machinery: plain
 * constants keep the scripts dependency-free, trivially auditable, and
 * runnable on any Node version the repository supports.
 */
export const SPEC = 'temp/swagger.json';
export const REPORT = 'temp/api-sync-report.md';
export const GENERATED = 'src/generated';
export const TYPES = `${GENERATED}/types.ts`;
export const HTTP_METHODS = `${GENERATED}/http-methods.ts`;
export const MANIFEST = `${GENERATED}/manifest.json`;
