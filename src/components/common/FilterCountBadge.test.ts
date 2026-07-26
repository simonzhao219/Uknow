import { describe, it, expect } from 'vitest';
import { shouldRenderCountBadge } from './FilterCountBadge';

describe('shouldRenderCountBadge', () => {
  it('正整數才渲染徽章', () => {
    expect(shouldRenderCountBadge(1)).toBe(true);
    expect(shouldRenderCountBadge(2)).toBe(true);
    expect(shouldRenderCountBadge(99)).toBe(true);
  });

  it('0 不渲染，避免出現空徽章', () => {
    expect(shouldRenderCountBadge(0)).toBe(false);
  });

  it('負數不渲染', () => {
    expect(shouldRenderCountBadge(-1)).toBe(false);
  });

  it('非有限值（NaN／Infinity）不渲染', () => {
    expect(shouldRenderCountBadge(Number.NaN)).toBe(false);
    expect(shouldRenderCountBadge(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
