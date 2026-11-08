// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  DRAG_LOCK_PX,
  DRAG_NO_NEIGHBOR_MAX_PX,
  dragOffset,
  isInteractiveStart,
  lockAxis,
  settle,
  startsInsideHorizontalScroller,
} from './browseDrag';
import { swipeIntent } from './swipeIntent';

const VW = 400;

describe('lockAxis', () => {
  it('位移未達鎖定距離時尚未判定', () => {
    expect(lockAxis({ dx: DRAG_LOCK_PX - 1, dy: 2 })).toBeNull();
  });

  it('水平為主時鎖定水平', () => {
    expect(lockAxis({ dx: -14, dy: 4 })).toBe('horizontal');
  });

  it('垂直為主時鎖定垂直（放棄跟手）', () => {
    expect(lockAxis({ dx: 3, dy: 16 })).toBe('vertical');
  });

  it('斜向以較大的一軸為準', () => {
    expect(lockAxis({ dx: 12, dy: 13 })).toBe('vertical');
    expect(lockAxis({ dx: -13, dy: 12 })).toBe('horizontal');
  });
});

describe('dragOffset', () => {
  const both = { viewportWidth: VW, hasPrev: true, hasNext: true };

  it('有鄰居時位移為手指位移的一半', () => {
    expect(dragOffset({ ...both, dx: -60 })).toBe(-30);
    expect(dragOffset({ ...both, dx: 40 })).toBe(20);
  });

  it('位移上限為視窗寬的三分之一', () => {
    expect(dragOffset({ ...both, dx: -1000 })).toBeCloseTo(-VW / 3);
    expect(dragOffset({ ...both, dx: 1000 })).toBeCloseTo(VW / 3);
  });

  it('去向沒有鄰居時阻尼加重且上限 24px', () => {
    const atEnd = { viewportWidth: VW, hasPrev: true, hasNext: false };
    const free = Math.abs(dragOffset({ ...both, dx: -60 }));
    const blocked = Math.abs(dragOffset({ ...atEnd, dx: -60 }));
    expect(blocked).toBeLessThan(free);
    expect(Math.abs(dragOffset({ ...atEnd, dx: -1000 }))).toBe(DRAG_NO_NEIGHBOR_MAX_PX);
    const atStart = { viewportWidth: VW, hasPrev: false, hasNext: true };
    expect(dragOffset({ ...atStart, dx: 1000 })).toBe(DRAG_NO_NEIGHBOR_MAX_PX);
  });

  it('位移方向與手指同向', () => {
    expect(dragOffset({ ...both, dx: -20 })).toBeLessThan(0);
    expect(dragOffset({ ...both, dx: 20 })).toBeGreaterThan(0);
    expect(dragOffset({ ...both, dx: 0 })).toBe(0);
  });
});

describe('settle', () => {
  const base = { startX: 200, viewportWidth: VW, hasPrev: true, hasNext: true };

  it('向左滑超過門檻且有下一篇時換下一篇', () => {
    expect(settle({ ...base, dx: -90, dy: 5 })).toEqual({ action: 'commit', direction: 'next' });
  });

  it('向右滑超過門檻且有上一篇時換上一篇', () => {
    expect(settle({ ...base, dx: 90, dy: -5 })).toEqual({ action: 'commit', direction: 'prev' });
  });

  it('未達門檻時彈回', () => {
    expect(settle({ ...base, dx: -30, dy: 0 })).toEqual({ action: 'cancel' });
  });

  it('去向沒有鄰居時彈回', () => {
    expect(settle({ ...base, hasNext: false, dx: -90, dy: 0 })).toEqual({ action: 'cancel' });
    expect(settle({ ...base, hasPrev: false, dx: 90, dy: 0 })).toEqual({ action: 'cancel' });
  });

  it('起點在邊緣保護區時彈回', () => {
    expect(settle({ ...base, startX: 10, dx: -90, dy: 0 })).toEqual({ action: 'cancel' });
  });

  it('與 swipeIntent 對同組輸入結論一致', () => {
    const inputs = [
      { dx: -90, dy: 5 },
      { dx: 90, dy: -5 },
      { dx: -59, dy: 0 },
      { dx: -100, dy: 70 },
      { dx: 80, dy: 90 },
    ];
    for (const { dx, dy } of inputs) {
      const intent = swipeIntent({ dx, dy, startX: base.startX, viewportWidth: VW });
      const result = settle({ ...base, dx, dy });
      expect(result.action === 'commit' ? result.direction : null).toBe(intent);
    }
  });
});

describe('isInteractiveStart', () => {
  it('起點在按鈕、連結、輸入框內時為 true', () => {
    document.body.innerHTML =
      '<button id="b"><span id="s">x</span></button><a id="a" href="#">l</a><input id="i"><div id="d">t</div>';
    expect(isInteractiveStart(document.getElementById('s'))).toBe(true);
    expect(isInteractiveStart(document.getElementById('a'))).toBe(true);
    expect(isInteractiveStart(document.getElementById('i'))).toBe(true);
    expect(isInteractiveStart(document.getElementById('d'))).toBe(false);
    expect(isInteractiveStart(null)).toBe(false);
  });
});

describe('startsInsideHorizontalScroller', () => {
  const scroller = (overflowX: string, scrollWidth: number, clientWidth: number) => {
    document.body.innerHTML =
      '<div id="boundary"><div id="wrap"><div id="inner"><span id="t">x</span></div></div></div>';
    const wrap = document.getElementById('wrap') as HTMLElement;
    wrap.style.overflowX = overflowX;
    Object.defineProperty(wrap, 'scrollWidth', { value: scrollWidth, configurable: true });
    Object.defineProperty(wrap, 'clientWidth', { value: clientWidth, configurable: true });
    return {
      target: document.getElementById('t'),
      boundary: document.getElementById('boundary') as HTMLElement,
    };
  };

  it('祖先可橫向捲動且內容超出時為 true', () => {
    const { target, boundary } = scroller('auto', 600, 300);
    expect(startsInsideHorizontalScroller(target, boundary)).toBe(true);
  });

  it('祖先沒有超出內容時為 false', () => {
    const { target, boundary } = scroller('auto', 300, 300);
    expect(startsInsideHorizontalScroller(target, boundary)).toBe(false);
  });

  it('祖先 overflow-x 不是 auto／scroll 時為 false', () => {
    const { target, boundary } = scroller('visible', 600, 300);
    expect(startsInsideHorizontalScroller(target, boundary)).toBe(false);
  });

  it('只往上找到 boundary 為止', () => {
    const { target } = scroller('auto', 600, 300);
    const inner = document.getElementById('wrap') as HTMLElement;
    expect(startsInsideHorizontalScroller(target, inner)).toBe(false);
  });
});
