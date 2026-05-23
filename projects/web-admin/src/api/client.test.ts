import { describe, expect, it } from 'vitest';
import { ApiRequestError, unwrap } from './client';

describe('unwrap', () => {
  it('returns data when success', () => {
    const data = unwrap({ success: true, code: 0, message: 'ok', data: { a: 1 } });
    expect(data).toEqual({ a: 1 });
  });

  it('throws ApiRequestError when success=false', () => {
    expect(() => unwrap({ success: false, code: 40000, message: 'bad', data: null })).toThrow(ApiRequestError);
  });
});
