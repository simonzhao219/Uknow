import { describe, it, expect } from 'vitest';
import { shouldRenderCountBadge } from './FilterCountBadge';

describe('shouldRenderCountBadge', () => {
  it('renders when count is a positive integer', () => {
    expect(shouldRenderCountBadge(1)).toBe(true);
    expect(shouldRenderCountBadge(2)).toBe(true);
    expect(shouldRenderCountBadge(99)).toBe(true);
  });

  it('does not render for zero so no empty badge is shown', () => {
    expect(shouldRenderCountBadge(0)).toBe(false);
  });

  it('does not render for negative counts', () => {
    expect(shouldRenderCountBadge(-1)).toBe(false);
  });

  it('does not render for non-finite values (NaN / Infinity)', () => {
    expect(shouldRenderCountBadge(Number.NaN)).toBe(false);
    expect(shouldRenderCountBadge(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
