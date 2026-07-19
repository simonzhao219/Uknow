import { describe, it, expect } from 'vitest';
import { resolveDocBackTarget, INITIAL_LOCATION_KEY } from './backNavigation';

describe('resolveDocBackTarget', () => {
  it('有 in-app 導航歷史（key 非 default）時回上一頁 (-1)', () => {
    expect(resolveDocBackTarget('abc123')).toBe(-1);
    expect(resolveDocBackTarget('x7f9q2')).toBe(-1);
  });

  it('初次進入（key === default：新分頁 / 直接開網址 / 重整）時退回首頁', () => {
    expect(resolveDocBackTarget(INITIAL_LOCATION_KEY)).toBe('/');
    expect(resolveDocBackTarget('default')).toBe('/');
  });

  it('key 為 undefined（保險起見）時退回首頁', () => {
    expect(resolveDocBackTarget(undefined)).toBe('/');
  });

  it('可自訂 fallback 去處', () => {
    expect(resolveDocBackTarget('default', '/dashboard')).toBe('/dashboard');
    expect(resolveDocBackTarget(undefined, '/dashboard')).toBe('/dashboard');
    // 有歷史時仍優先 pop，不受 fallback 影響
    expect(resolveDocBackTarget('abc123', '/dashboard')).toBe(-1);
  });
});
