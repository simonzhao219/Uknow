import { describe, expect, it } from 'vitest';
import { swipeIntent } from './swipeIntent';

const base = { startX: 200, viewportWidth: 400 };

describe('swipeIntent', () => {
  it('向左滑超過門檻＝下一篇', () => {
    expect(swipeIntent({ ...base, dx: -90, dy: 5 })).toBe('next');
  });

  it('向右滑超過門檻＝上一篇', () => {
    expect(swipeIntent({ ...base, dx: 90, dy: -5 })).toBe('prev');
  });

  it('水平位移不足 60px 不算', () => {
    expect(swipeIntent({ ...base, dx: -59, dy: 0 })).toBeNull();
    expect(swipeIntent({ ...base, dx: -60, dy: 0 })).toBe('next');
  });

  it('斜向滑（水平位移不到垂直的 1.5 倍）不算', () => {
    expect(swipeIntent({ ...base, dx: -90, dy: 61 })).toBeNull();
    expect(swipeIntent({ ...base, dx: -90, dy: 60 })).toBe('next');
  });

  it('垂直位移達 80px 以上一律不算（垂直捲動不被誤判）', () => {
    expect(swipeIntent({ ...base, dx: -300, dy: 80 })).toBeNull();
    expect(swipeIntent({ ...base, dx: -300, dy: -120 })).toBeNull();
  });

  it('起點在左右 24px 內（系統返回手勢區）不算', () => {
    expect(swipeIntent({ dx: 100, dy: 0, startX: 10, viewportWidth: 400 })).toBeNull();
    expect(swipeIntent({ dx: -100, dy: 0, startX: 390, viewportWidth: 400 })).toBeNull();
    expect(swipeIntent({ dx: 100, dy: 0, startX: 24, viewportWidth: 400 })).toBe('prev');
  });

  it('保護區寬度可調（LINE 內建瀏覽器用更寬的值）', () => {
    expect(
      swipeIntent({ dx: 100, dy: 0, startX: 30, viewportWidth: 400, edgeGuardPx: 32 }),
    ).toBeNull();
    expect(swipeIntent({ dx: 100, dy: 0, startX: 32, viewportWidth: 400, edgeGuardPx: 32 })).toBe(
      'prev',
    );
  });

  it('沒有位移不算', () => {
    expect(swipeIntent({ ...base, dx: 0, dy: 0 })).toBeNull();
  });
});
