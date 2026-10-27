// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
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

  it('按返回（popstate）→ 呼叫 onClose 一次，且不再 history.back()', () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useOverlayBackClose(true, onClose));
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(back).not.toHaveBeenCalled();
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

  it('連續兩張：前一張關閉造成的 back（非同步 popstate）不可誤取消下一張', async () => {
    // 真瀏覽器的 history.back() 是非同步的：popstate 在下一個 task 才觸發。
    back.mockImplementation(() => {
      setTimeout(() => window.dispatchEvent(new PopStateEvent('popstate')), 0);
    });
    const onCloseA = vi.fn();
    const onCloseB = vi.fn();
    const a = renderHook(() => useOverlayBackClose(true, onCloseA));
    // 同一個 commit：舊疊層卸載、新疊層掛載（PhotoPicker 以 slotId 為 key 重掛）
    act(() => {
      a.unmount();
      renderHook(() => useOverlayBackClose(true, onCloseB));
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(onCloseA).not.toHaveBeenCalled();
    expect(onCloseB).not.toHaveBeenCalled();
    // 之後使用者真的按返回，才關第二張
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(onCloseB).toHaveBeenCalledTimes(1);
  });

  it('自己造成的 back 只吞一次：之後的返回鍵照常關疊層', async () => {
    back.mockImplementation(() => {
      setTimeout(() => window.dispatchEvent(new PopStateEvent('popstate')), 0);
    });
    const first = renderHook(() => useOverlayBackClose(true, vi.fn()));
    first.unmount();
    await new Promise((r) => setTimeout(r, 10));
    const onClose = vi.fn();
    renderHook(() => useOverlayBackClose(true, onClose));
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
