import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('stub', () => {
  it('exports the package name', () => {
    expect(PACKAGE_NAME).toBe('artefactby-ozon-seller-api');
  });
});
