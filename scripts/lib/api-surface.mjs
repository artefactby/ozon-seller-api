/**
 * The API surface: a compact, deterministic projection of an OpenAPI spec
 * used to compare two spec snapshots without storing the specs themselves.
 *
 * The spec snapshot is local-only, so the previous state must be recoverable
 * from the repository. Codegen commits the surface as
 * `src/generated/manifest.json`; the sync script rebuilds the surface of the
 * fresh snapshot and diffs it against the one committed at HEAD. The manifest
 * is a generator artifact for this comparison only — it is not part of the
 * published package (`files` in package.json ships `dist/` alone), so its
 * size has zero effect on what consumers install.
 *
 * Field signatures are structural, not semantic: any deterministic folding of
 * a schema subtree into a string works, because the diff only ever compares
 * signatures for equality. A changed signature is reported as a breaking
 * signal; deciding whether the change narrows or widens the type is the
 * reviewer's call.
 */

/** Folds a schema subtree into a deterministic signature string. */
export function signature(schema) {
  if (schema === true) return 'any';
  if (!schema || typeof schema !== 'object') return 'unknown';
  if (schema.$ref) return `ref:${String(schema.$ref).split('/').at(-1)}`;

  const parts = [];
  for (const keyword of ['allOf', 'oneOf', 'anyOf']) {
    if (Array.isArray(schema[keyword])) {
      parts.push(`${keyword}(${schema[keyword].map(signature).join('|')})`);
    }
  }
  if (Array.isArray(schema.enum)) {
    parts.push(`enum(${schema.enum.map(String).sort().join('|')})`);
  }

  // OpenAPI 3.1 allows `type` to be an array (e.g. ["string", "null"]).
  const type = Array.isArray(schema.type) ? [...schema.type].sort().join('|') : schema.type;
  if (type === 'array') {
    parts.push(`array<${signature(schema.items)}>`);
  } else if (type === 'object' || (!type && (schema.properties || schema.additionalProperties))) {
    const required = new Set(schema.required ?? []);
    const fields = Object.keys(schema.properties ?? {})
      .sort()
      .map((name) => `${name}${required.has(name) ? '!' : ''}:${signature(schema.properties[name])}`);
    let objectSignature = `object{${fields.join(',')}}`;
    if (schema.additionalProperties) {
      objectSignature += `+map<${signature(schema.additionalProperties)}>`;
    }
    parts.push(objectSignature);
  } else if (type) {
    parts.push(schema.format ? `${type}:${schema.format}` : String(type));
  }

  if (parts.length === 0) return 'unknown';
  return schema.nullable === true ? `${parts.join('&')}?` : parts.join('&');
}

/**
 * A schema's manifest entry. Plain objects with own properties get a
 * field-by-field breakdown (so the diff can name the exact field that
 * changed); everything else — enums, aliases, compositions — collapses into
 * a single signature string.
 */
function schemaEntry(schema) {
  const isPlainObject =
    schema &&
    typeof schema === 'object' &&
    schema.properties &&
    !schema.$ref &&
    !schema.allOf &&
    !schema.oneOf &&
    !schema.anyOf;
  if (!isPlainObject) return signature(schema);

  const entry = {};
  const required = [...(schema.required ?? [])].sort();
  if (required.length > 0) entry.required = required;
  entry.fields = {};
  for (const name of Object.keys(schema.properties).sort()) {
    entry.fields[name] = signature(schema.properties[name]);
  }
  return entry;
}

/** Builds the surface of a parsed OpenAPI spec. */
export function buildSurface(spec) {
  const paths = {};
  for (const [path, item] of Object.entries(spec?.paths ?? {})) {
    const methods = Object.keys(item ?? {})
      .filter((key) => key !== 'parameters' && key !== 'servers')
      .sort();
    paths[path] = methods.join(',');
  }

  const schemas = {};
  for (const [name, schema] of Object.entries(spec?.components?.schemas ?? {})) {
    schemas[name] = schemaEntry(schema);
  }

  return { paths, schemas };
}

/**
 * Compares two surfaces. Entries use a language-neutral notation ready for
 * the sync report: `path: get → post`, `Schema.field: string → integer`,
 * `Schema.field: +required`.
 */
export function diffSurfaces(previous, next) {
  const oldPaths = previous.paths ?? {};
  const newPaths = next.paths ?? {};
  const oldSchemas = previous.schemas ?? {};
  const newSchemas = next.schemas ?? {};

  const diff = {
    pathsAdded: Object.keys(newPaths).filter((path) => !(path in oldPaths)),
    pathsRemoved: Object.keys(oldPaths).filter((path) => !(path in newPaths)),
    methodChanged: [],
    schemasAdded: Object.keys(newSchemas).filter((name) => !(name in oldSchemas)),
    schemasRemoved: Object.keys(oldSchemas).filter((name) => !(name in newSchemas)),
    schemasChanged: [],
    fieldsAdded: [],
    fieldsRemoved: [],
    fieldsChanged: [],
  };

  for (const [path, oldMethod] of Object.entries(oldPaths)) {
    if (path in newPaths && newPaths[path] !== oldMethod) {
      diff.methodChanged.push(`${path}: ${oldMethod} → ${newPaths[path]}`);
    }
  }

  for (const [name, oldEntry] of Object.entries(oldSchemas)) {
    const newEntry = newSchemas[name];
    if (newEntry === undefined) continue;

    // A signature-only entry on either side: compare the entries wholesale.
    if (typeof oldEntry === 'string' || typeof newEntry === 'string') {
      if (JSON.stringify(oldEntry) !== JSON.stringify(newEntry)) {
        diff.schemasChanged.push(name);
      }
      continue;
    }

    const oldFields = oldEntry.fields ?? {};
    const newFields = newEntry.fields ?? {};
    const oldRequired = new Set(oldEntry.required ?? []);
    const newRequired = new Set(newEntry.required ?? []);

    for (const field of Object.keys(newFields)) {
      if (!(field in oldFields)) diff.fieldsAdded.push(`${name}.${field}`);
    }
    for (const field of Object.keys(oldFields)) {
      if (!(field in newFields)) {
        diff.fieldsRemoved.push(`${name}.${field}`);
        continue;
      }
      const changes = [];
      if (oldFields[field] !== newFields[field]) {
        changes.push(`${oldFields[field]} → ${newFields[field]}`);
      }
      if (oldRequired.has(field) !== newRequired.has(field)) {
        changes.push(newRequired.has(field) ? '+required' : '-required');
      }
      if (changes.length > 0) {
        diff.fieldsChanged.push(`${name}.${field}: ${changes.join(', ')}`);
      }
    }
  }

  for (const entries of Object.values(diff)) entries.sort();

  diff.breaking =
    diff.pathsRemoved.length > 0 ||
    diff.methodChanged.length > 0 ||
    diff.schemasRemoved.length > 0 ||
    diff.schemasChanged.length > 0 ||
    diff.fieldsRemoved.length > 0 ||
    diff.fieldsChanged.length > 0;

  return diff;
}

/**
 * Serializes a surface with stable key order, one path and one schema per
 * line — git diffs of the manifest stay reviewable.
 */
export function serializeManifest(surface) {
  const entryLines = (record, render) => {
    const keys = Object.keys(record).sort();
    return keys.map(
      (key, index) =>
        `    ${JSON.stringify(key)}: ${render(record[key])}${index < keys.length - 1 ? ',' : ''}`,
    );
  };

  const renderSchema = (entry) => {
    if (typeof entry === 'string') return JSON.stringify(entry);
    const ordered = {};
    if (entry.required) ordered.required = entry.required;
    ordered.fields = entry.fields ?? {};
    return JSON.stringify(ordered);
  };

  return [
    '{',
    '  "paths": {',
    ...entryLines(surface.paths, (method) => JSON.stringify(method)),
    '  },',
    '  "schemas": {',
    ...entryLines(surface.schemas, renderSchema),
    '  }',
    '}',
    '',
  ].join('\n');
}
