// 鍵盤焦點環的兩個共用字串（ui-ux-guidelines §12.12）。
// 「3px 環＋1px 間隙」與「3px 環不帶間隙」是兩種字串，e2e（test_public_touch_targets.py）
// 分別釘 RING_3PX_WITH_GAP 與 RING_3PX：抽成常數時不能合併，否則其中一邊會紅。
import { describe, expect, it } from 'vitest';
import { FOCUS_RING, FOCUS_RING_GAP } from './focusRing';

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

describe('FOCUS_RING', () => {
  it('是 3px 全不透明焦點環，且不帶間隙', () => {
    const t = tokens(FOCUS_RING);
    for (const c of [
      'focus-visible:outline-hidden',
      'focus-visible:ring-[3px]',
      'focus-visible:ring-ring',
    ]) {
      expect(t, c).toContain(c);
    }
    expect(t.some((c) => c.includes('ring-offset'))).toBe(false);
  });
});

describe('FOCUS_RING_GAP', () => {
  it('在 3px 環外留 1px 間隙，間隙色為版面底', () => {
    const t = tokens(FOCUS_RING_GAP);
    for (const c of [
      'focus-visible:outline-hidden',
      'focus-visible:ring-[3px]',
      'focus-visible:ring-ring',
      'focus-visible:ring-offset-1',
      'focus-visible:ring-offset-background',
    ]) {
      expect(t, c).toContain(c);
    }
  });

  it('兩個常數都不出現帶透明度的環色', () => {
    expect(`${FOCUS_RING} ${FOCUS_RING_GAP}`).not.toMatch(/\bring-[a-z][\w-]*\/\d+/);
  });
});
