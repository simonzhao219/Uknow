// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayBackClose } from './useOverlayBackClose';

describe('useOverlayBackClose', () => {
  let push: ReturnType<typeof vi.spyOn>;
  let back: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    push = vi.spyOn(window.history, 'pushState');
    back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('開啟時推一個歷史項，沿用目前的 history.state（路由器不當成換頁）', () => {
    window.history.replaceState({ idx: 4, key: 'k' }, '');
    renderHook(() => useOverlayBackClose(true, vi.fn()));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toEqual({ idx: 4, key: 'k' });
  });

  it('沒開啟時什麼都不做', () => {
    renderHook(() => useOverlayBackClose(false, vi.fn()));
    expect(push).not.toHaveBeenCalled();
  });

  it('按返回（popstate）→ 呼叫 onClose 一次，並同步重新武裝（再推一個歷史項）', () => {
    const onClose = vi.fn();
    renderHook(() => useOverlayBackClose(true, onClose));
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(2);
    expect(back).not.toHaveBeenCalled();
  });

  it('疊層常駐期間連按兩次返回 → 各呼叫 onClose 一次，整段 history.back 只在卸載時呼叫一次', () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useOverlayBackClose(true, onClose));
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledTimes(3);
    expect(back).not.toHaveBeenCalled();
    unmount();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('疊層由 UI 自己關掉（open 變 false）→ 吃掉多推的歷史項，不呼叫 onClose', () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ open }) => useOverlayBackClose(open, onClose), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    expect(back).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('疊層開著時卸載 → 同樣吃掉多推的歷史項', () => {
    const { unmount } = renderHook(() => useOverlayBackClose(true, vi.fn()));
    unmount();
    expect(back).toHaveBeenCalledTimes(1);
  });
});
