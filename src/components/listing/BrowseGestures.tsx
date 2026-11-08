import { useEffect, useRef, type RefObject } from 'react';
import {
  dragOffset,
  isInteractiveStart,
  lockAxis,
  settle,
  startsInsideHorizontalScroller,
} from '../../utils/browseDrag';
import { springTo } from '../../utils/browseMotion';
import { browseKeyDirection } from '../../utils/browseKeys';
import { prefersReducedMotion } from '../../utils/motionPreference';
import { SWIPE_EDGE_GUARD_PX, swipeIntent } from '../../utils/swipeIntent';

export interface BrowseGesturesProps {
  /** 照片區以外的滑動由這個容器接。 */
  containerRef: RefObject<HTMLElement | null>;
  /** sprung＝手勢已自己彈回（去向沒有鄰居時），呼叫端不必再疊一段輕推。 */
  onNavigate: (direction: 'prev' | 'next', via: 'key' | 'swipe', sprung?: boolean) => void;
  /** 跟手時被位移的元素（固定 wrapper，頁首列不在其內）。 */
  dragTargetRef: RefObject<HTMLElement | null>;
  /** 去向是否有鄰居：沒有的那一側阻尼加重、放開只播報不換篇。 */
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * 換篇的鍵盤（← →）與照片區以外的左右滑（含跟手）。不渲染任何東西，只掛事件。
 * 由詳情頁動態載入、且只在有首頁脈絡時才載入——沒有脈絡的訪客（分享連結進來）不付這段成本。
 *
 * 跟手（W6-20）：水平鎖定後，dragTargetRef 的 transform 隨手指位移（半阻尼，rAF 合併寫入）；
 * 放開時 settle 以 swipeIntent 判定——換篇則位移保留到元件卸載（避免舊內容彈回再被換掉），
 * 否則 WAAPI 彈回。邊緣保護區、互動元素、輪播、橫向捲動祖先、多指、選字都不啟動；
 * touchmove 為 passive（容器 touch-pan-y 已讓瀏覽器不處理水平 pan，不需要 preventDefault）。
 * 偏好減少動態時全程不寫位移，換篇判定不變。
 *
 * 照片區內的滑動不在這裡處理（起點在 [data-carousel-scroller] 內就略過）：那裡左右滑是
 * 換照片，滑到盡頭才由 PhotoCarousel 的 onEdgeSwipe 接續換篇。
 */
export default function BrowseGestures({
  containerRef,
  onNavigate,
  dragTargetRef,
  hasPrev,
  hasNext,
}: BrowseGesturesProps) {
  const latest = useRef(onNavigate);
  latest.current = onNavigate;
  const neighbors = useRef({ hasPrev, hasNext });
  neighbors.current = { hasPrev, hasNext };

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
    type Drag = {
      x: number;
      y: number;
      axis: 'horizontal' | 'vertical' | null;
      abandoned: boolean;
    };
    let start: Drag | null = null;
    let frameId: number | null = null;
    let scheduled = false;
    let pendingOffset = 0;

    const hasSelection = () => {
      const selection = window.getSelection?.();
      return Boolean(selection && !selection.isCollapsed && selection.toString());
    };
    const cancelFrame = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      scheduled = false;
    };
    const clearTransform = () => {
      const target = dragTargetRef.current;
      if (target) target.style.transform = '';
    };
    const writeOffset = (offset: number) => {
      pendingOffset = offset;
      if (scheduled) return;
      scheduled = true;
      const id = requestAnimationFrame(() => {
        scheduled = false;
        frameId = null;
        const target = dragTargetRef.current;
        if (target) target.style.transform = `translateX(${pendingOffset}px)`;
      });
      // rAF 若同步執行（測試替身），回呼已把 scheduled 清掉，不要再記 id。
      if (scheduled) frameId = id;
    };
    const springBack = () => {
      // 快速放開時最後一幀位移可能還沒寫入：先補上，彈回才有正確的起點。
      const hadPending = scheduled;
      cancelFrame();
      const target = dragTargetRef.current;
      if (!target) return;
      if (hadPending) target.style.transform = `translateX(${pendingOffset}px)`;
      springTo(target, target.style.transform);
    };
    const abort = () => {
      start = null;
      cancelFrame();
      clearTransform();
    };

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const inCarousel =
        e.target instanceof Element && e.target.closest('[data-carousel-scroller]');
      const x = touch?.clientX ?? 0;
      // 多指（縮放）、照片區、互動元素、橫向捲動祖先、系統返回手勢區：都不算換篇手勢。
      if (
        e.touches.length !== 1 ||
        !touch ||
        inCarousel ||
        isInteractiveStart(e.target) ||
        startsInsideHorizontalScroller(e.target, el) ||
        x < SWIPE_EDGE_GUARD_PX ||
        x > window.innerWidth - SWIPE_EDGE_GUARD_PX
      ) {
        start = null;
        return;
      }
      start = { x, y: touch.clientY, axis: null, abandoned: false };
    };
    const onTouchMove = (e: TouchEvent) => {
      const from = start;
      if (!from || from.abandoned) return;
      const touch = e.touches[0];
      if (e.touches.length !== 1 || !touch) {
        from.abandoned = true;
        abort();
        start = from;
        return;
      }
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (from.axis === null) {
        from.axis = lockAxis({ dx, dy });
        if (from.axis === null) return;
        if (from.axis === 'vertical') {
          from.abandoned = true;
          return;
        }
        // 判定為水平拖曳才打斷上一段進場／彈回動畫（換篇後 220ms 內只是碰一下想捲動，不該切斷淡入）；
        // 之後跟手一律從 0 起算。
        for (const animation of dragTargetRef.current?.getAnimations?.() ?? []) animation.cancel();
      }
      if (hasSelection()) {
        from.abandoned = true;
        cancelFrame();
        clearTransform();
        return;
      }
      if (prefersReducedMotion()) return;
      writeOffset(dragOffset({ dx, viewportWidth: window.innerWidth, ...neighbors.current }));
    };
    const onTouchEnd = (e: TouchEvent) => {
      const from = start;
      start = null;
      const touch = e.changedTouches[0];
      if (!from || from.abandoned || !touch || hasSelection()) {
        springBack();
        return;
      }
      const input = {
        dx: touch.clientX - from.x,
        dy: touch.clientY - from.y,
        startX: from.x,
        viewportWidth: window.innerWidth,
      };
      const result = settle({ ...input, ...neighbors.current });
      if (result.action === 'commit') {
        // 位移保留到卸載：同步清掉會讓舊內容彈回 0 再被換掉。
        cancelFrame();
        latest.current(result.direction, 'swipe');
        return;
      }
      springBack();
      // 去向沒有鄰居：仍通知呼叫端，由它播報「已是最後一篇／第一篇」。
      const intent = swipeIntent(input);
      if (intent) latest.current(intent, 'swipe', true);
    };
    const onTouchCancel = () => abort();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') abort();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      abort();
    };
  }, [containerRef, dragTargetRef]);

  return null;
}
