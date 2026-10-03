import { describe, expect, it } from 'vitest';
import { getProgressBarStyle } from './userReferralFormatter';

describe('getProgressBarStyle', () => {
  it('低於 40% 維持灰階填色', () => {
    expect(getProgressBarStyle(0)).toBe('bg-muted-foreground');
    expect(getProgressBarStyle(39)).toBe('bg-muted-foreground');
  });

  it('40% 到 69% 用強調色 brand', () => {
    expect(getProgressBarStyle(40)).toBe('bg-brand');
    expect(getProgressBarStyle(69)).toBe('bg-brand');
  });

  it('70% 到 99% 用 warning（將達標）', () => {
    expect(getProgressBarStyle(70)).toBe('bg-warning');
    expect(getProgressBarStyle(99)).toBe('bg-warning');
  });

  it('達 100% 以上用 success（達標）', () => {
    expect(getProgressBarStyle(100)).toBe('bg-success');
    expect(getProgressBarStyle(130)).toBe('bg-success');
  });
});
