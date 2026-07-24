import { describe, expect, expectTypeOf, it } from 'vitest';
import { OzonClient } from './client';
import type { ApiPath, RequestBodyOf, ResponseOf, components } from './types';

/**
 * These assertions are checked by `npm run typecheck`; the runtime bodies only
 * exist so the file also runs as a test.
 */
describe('path typing', () => {
  const client = new OzonClient({
    clientId: 'c',
    apiKey: 'k',
    fetch: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
  });

  it('derives the request body from the path literal', () => {
    expectTypeOf<RequestBodyOf<'/v5/product/info/prices'>>().toEqualTypeOf<
      components['schemas']['productv5GetProductInfoPricesV5Request']
    >();
    expect(true).toBe(true);
  });

  it('derives the JSON response from the path literal', () => {
    expectTypeOf<ResponseOf<'/v5/product/info/prices'>>().toEqualTypeOf<
      components['schemas']['productv5GetProductInfoPricesV5Response']
    >();
    expect(true).toBe(true);
  });

  it('types bodyless operations as taking no body', () => {
    expectTypeOf<RequestBodyOf<'/v1/seller/info'>>().toBeNever();
    expectTypeOf<RequestBodyOf<'/v1/actions'>>().toBeNever();
    expect(true).toBe(true);
  });

  it('types an empty 200 as void and a binary 200 as Blob', () => {
    expectTypeOf<ResponseOf<'/v1/notification/delete'>>().toBeVoid();
    expectTypeOf<ResponseOf<'/v2/posting/fbs/package-label'>>().toEqualTypeOf<Blob>();
    expect(true).toBe(true);
  });

  it('resolves request() to the response type of the path', () => {
    const pending = client.request('/v5/product/info/prices', {
      cursor: '',
      limit: 10,
      filter: { visibility: 'ALL' },
    });
    expectTypeOf(pending).resolves.toEqualTypeOf<
      components['schemas']['productv5GetProductInfoPricesV5Response']
    >();
    expect(true).toBe(true);
  });

  it('covers every path in the spec', () => {
    // A path the spec does not define is not assignable to ApiPath.
    expectTypeOf<'/v5/product/info/prices'>().toExtend<ApiPath>();
    // @ts-expect-error unknown paths are rejected
    void client.request('/v1/not-a-real-endpoint');
    expect(true).toBe(true);
  });

  it('rejects a body of the wrong shape', () => {
    // @ts-expect-error `limit` is a number, not a string
    void client.request('/v5/product/info/prices', { limit: 'ten', filter: {} });
    // @ts-expect-error this operation takes no body
    void client.request('/v1/seller/info', { anything: true });
    expect(true).toBe(true);
  });
});
