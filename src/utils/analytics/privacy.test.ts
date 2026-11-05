import { describe, expect, it } from 'vitest';
import { PH_BLOCK_CLASS as configClass } from './analyticsConfig';
import { PH_BLOCK_CLASS, privateClass } from './privacy';

describe('privateClass', () => {
  it('單獨使用時回傳 block class', () => {
    expect(privateClass()).toBe('ph-no-capture');
  });

  it('併入既有 className，block class 在最後', () => {
    expect(privateClass('space-y-2')).toBe('space-y-2 ph-no-capture');
  });

  it('與 analyticsConfig 的 blockClass 同源', () => {
    expect(configClass).toBe(PH_BLOCK_CLASS);
    expect(PH_BLOCK_CLASS).toBe('ph-no-capture');
  });
});
