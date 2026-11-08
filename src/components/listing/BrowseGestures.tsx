import { useEffect, useRef, type RefObject } from 'react';
import { browseKeyDirection } from '../../utils/browseKeys';
import { swipeIntent } from '../../utils/swipeIntent';

export interface BrowseGesturesProps {
  /** 照片區以外的滑動由這個容器接。 */
  containerRef: RefObject<HTMLElement | null>;
  onNavigate: (direction: 'prev' | 'next', via: 'key' | 'swipe') => void;
  /** 跟手時被位移的元素（固定 wrapper，頁首列不在其內）。 */
  dragTargetRef: RefObject<HTMLElement | null>;
  /** 去向是否有鄰居：沒有的那一側阻尼加重、放開只播報不換篇。 */
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * 換篇的鍵盤（← →）與照片區以外的左右滑。不渲染任何東西，只掛事件。
 * 由詳情頁動態載入、且只在有首頁脈絡時才載入——沒有脈絡的訪客（分享連結進來）不付這段成本。
 *
 * 照片區內的滑動不在這裡處理（起點在 [data-carousel-scroller] 內就略過）：那裡左右滑是
 * 換照片，滑到盡頭才由 PhotoCarousel 的 onEdgeSwipe 接續換篇。
 */
export default function BrowseGestures({
  containerRef,
  onNavigate,
  // 階段 3 stub：跟手尚未實作，先收下 props 讓型別過。
  dragTargetRef: _dragTargetRef,
  hasPrev: _hasPrev,
  hasNext: _hasNext,
}: BrowseGesturesProps) {
  const latest = useRef(onNavigate);
  latest.current = onNavigate;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const direction = browseKeyDirection(e);
      if (!direction) return;
      e.preventDefault();
      latest.current(direction, 'key');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let start: { x: number; y: number } | null = null;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const inCarousel =
        e.target instanceof Element && e.target.closest('[data-carousel-scroller]');
      // 多指（縮放）、起點在照片區：都不算換篇手勢。
      start =
        e.touches.length === 1 && touch && !inCarousel
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const from = start;
      start = null;
      const touch = e.changedTouches[0];
      if (!from || !touch) return;
      // 長按選字後的拖曳不算。
      const selection = window.getSelection?.();
      if (selection && !selection.isCollapsed && selection.toString()) return;
      const direction = swipeIntent({
        dx: touch.clientX - from.x,
        dy: touch.clientY - from.y,
        startX: from.x,
        viewportWidth: window.innerWidth,
      });
      if (direction) latest.current(direction, 'swipe');
    };
    const onTouchCancel = () => {
      start = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [containerRef]);

  return null;
}
