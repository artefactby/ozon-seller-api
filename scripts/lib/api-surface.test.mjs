import { describe, expect, it } from 'vitest';
import { buildSurface, diffSurfaces, serializeManifest, signature } from './api-surface.mjs';

describe('signature', () => {
  it('folds primitives with their format', () => {
    expect(signature({ type: 'string' })).toBe('string');
    expect(signature({ type: 'integer', format: 'int64' })).toBe('integer:int64');
  });

  it('marks nullable schemas', () => {
    expect(signature({ type: 'string', nullable: true })).toBe('string?');
  });

  it('references other schemas by name without expanding them', () => {
    expect(signature({ $ref: '#/components/schemas/ProductInfo' })).toBe('ref:ProductInfo');
  });

  it('sorts enum values so reordering is not a change', () => {
    expect(signature({ type: 'string', enum: ['B', 'A'] })).toBe('enum(A|B)&string');
    expect(signature({ type: 'string', enum: ['A', 'B'] })).toBe('enum(A|B)&string');
  });

  it('folds arrays recursively', () => {
    expect(signature({ type: 'array', items: { $ref: '#/x/Item' } })).toBe('array<ref:Item>');
  });

  it('folds inline objects with required markers', () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' }, note: { type: 'string' } },
    };
    expect(signature(schema)).toBe('object{id!:string,note:string}');
  });

  it('folds additionalProperties into a map segment', () => {
    expect(signature({ type: 'object', additionalProperties: { type: 'integer' } })).toBe(
      'object{}+map<integer>',
    );
  });

  it('folds compositions member by member', () => {
    const schema = { allOf: [{ $ref: '#/x/A' }, { type: 'object', properties: {} }] };
    expect(signature(schema)).toBe('allOf(ref:A|object{})');
  });

  it('handles OpenAPI 3.1 type arrays deterministically', () => {
    expect(signature({ type: ['null', 'string'] })).toBe('null|string');
    expect(signature({ type: ['string', 'null'] })).toBe('null|string');
  });

  it('falls back to stable placeholders for exotic input', () => {
    expect(signature(true)).toBe('any');
    expect(signature(undefined)).toBe('unknown');
    expect(signature({})).toBe('unknown');
  });
});

describe('buildSurface', () => {
  const spec = {
    paths: {
      '/v1/a': { post: {}, parameters: [], servers: [] },
      '/v1/b': { get: {} },
    },
    components: {
      schemas: {
        Request: {
          type: 'object',
          required: ['sku'],
          properties: { sku: { type: 'string' }, limit: { type: 'integer' } },
        },
        Status: { type: 'string', enum: ['NEW', 'DONE'] },
      },
    },
  };

  it('maps each path to its methods, ignoring non-method keys', () => {
    expect(buildSurface(spec).paths).toEqual({ '/v1/a': 'post', '/v1/b': 'get' });
  });

  it('breaks plain object schemas down to fields', () => {
    expect(buildSurface(spec).schemas.Request).toEqual({
      required: ['sku'],
      fields: { limit: 'integer', sku: 'string' },
    });
  });

  it('collapses non-object schemas into a signature string', () => {
    expect(buildSurface(spec).schemas.Status).toBe('enum(DONE|NEW)&string');
  });

  it('tolerates an empty spec', () => {
    expect(buildSurface({})).toEqual({ paths: {}, schemas: {} });
  });
});

describe('diffSurfaces', () => {
  const base = {
    paths: { '/v1/a': 'post', '/v1/b': 'get' },
    schemas: {
      Request: { required: ['sku'], fields: { sku: 'string', limit: 'integer' } },
      Status: 'enum(DONE|NEW)&string',
    },
  };

  it('reports no breaking signals for purely additive changes', () => {
    const next = structuredClone(base);
    next.paths['/v1/c'] = 'post';
    next.schemas.Request.fields.note = 'string';
    next.schemas.Extra = 'string';

    const diff = diffSurfaces(base, next);
    expect(diff.breaking).toBe(false);
    expect(diff.pathsAdded).toEqual(['/v1/c']);
    expect(diff.schemasAdded).toEqual(['Extra']);
    expect(diff.fieldsAdded).toEqual(['Request.note']);
  });

  it('flags removed paths and method switches as breaking', () => {
    const next = structuredClone(base);
    delete next.paths['/v1/a'];
    next.paths['/v1/b'] = 'post';

    const diff = diffSurfaces(base, next);
    expect(diff.breaking).toBe(true);
    expect(diff.pathsRemoved).toEqual(['/v1/a']);
    expect(diff.methodChanged).toEqual(['/v1/b: get → post']);
  });

  it('flags removed schemas and changed signature-only schemas', () => {
    const next = structuredClone(base);
    delete next.schemas.Request;
    next.schemas.Status = 'enum(DONE)&string';

    const diff = diffSurfaces(base, next);
    expect(diff.breaking).toBe(true);
    expect(diff.schemasRemoved).toEqual(['Request']);
    expect(diff.schemasChanged).toEqual(['Status']);
  });

  it('flags removed fields, type changes and required flips', () => {
    const next = structuredClone(base);
    delete next.schemas.Request.fields.limit;
    next.schemas.Request.fields.sku = 'integer';
    next.schemas.Request.required = [];

    const diff = diffSurfaces(base, next);
    expect(diff.breaking).toBe(true);
    expect(diff.fieldsRemoved).toEqual(['Request.limit']);
    expect(diff.fieldsChanged).toEqual(['Request.sku: string → integer, -required']);
  });

  it('flags a schema switching between object and signature form', () => {
    const next = structuredClone(base);
    next.schemas.Status = { fields: { value: 'string' } };

    const diff = diffSurfaces(base, next);
    expect(diff.schemasChanged).toEqual(['Status']);
    expect(diff.breaking).toBe(true);
  });
});

describe('serializeManifest', () => {
  const surface = {
    paths: { '/v1/b': 'get', '/v1/a': 'post' },
    schemas: {
      Zeta: 'string',
      Alpha: { required: ['id'], fields: { id: 'string' } },
    },
  };

  it('produces JSON that parses back to the same surface', () => {
    expect(JSON.parse(serializeManifest(surface))).toEqual(surface);
  });

  it('sorts keys and keeps one schema per line', () => {
    const text = serializeManifest(surface);
    expect(text.indexOf('"/v1/a"')).toBeLessThan(text.indexOf('"/v1/b"'));
    expect(text.indexOf('"Alpha"')).toBeLessThan(text.indexOf('"Zeta"'));
    const alphaLine = text.split('\n').find((line) => line.includes('"Alpha"'));
    expect(alphaLine).toBe('    "Alpha": {"required":["id"],"fields":{"id":"string"}},');
  });

  it('is stable across key insertion order', () => {
    const reordered = {
      paths: { '/v1/a': 'post', '/v1/b': 'get' },
      schemas: {
        Alpha: { required: ['id'], fields: { id: 'string' } },
        Zeta: 'string',
      },
    };
    expect(serializeManifest(reordered)).toBe(serializeManifest(surface));
  });
});
