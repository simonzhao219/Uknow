import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import type { BrowseVia } from '../components/listing/BrowseNav';
import { ENTER_MS, ENTER_OFFSET_PX, NUDGE_PX, springTo } from '../utils/browseMotion';
import type { BrowseNeighbors } from '../utils/browseContext';
import { setLastViewedId } from '../utils/homeListingsCache';
import { prefersReducedMotion } from '../utils/motionPreference';

type BrowseRouteState = { dir?: 'prev' | 'next'; via?: BrowseVia } | null;

/**
 * 詳情頁換篇（W5-20～22、27、W6-20）：換篇＝replace 成新的 id（歷史只留一筆），state 沿用
 * browseFrom／ctx，另記 dir／via 給新實例還原焦點與進場方向用。
 *
 * 動畫：新實例（key={id} 重掛）在 layout effect 裡對固定 wrapper（motionRef）跑一次進場——
 * 從去向的對側 ENTER_OFFSET_PX 處淡入滑入。layout effect 在繪製前執行，不會先閃一幀原位。
 * 舊 DOM 在 navigate 的同一 commit 就消失，所以沒有退場動畫；不傳放開位移，state 也就沒有殘留問題。
 * 頭尾再換篇：按鈕、鍵盤、輪播盡頭續滑對 wrapper 輕推再回原位；頁面手勢由 BrowseGestures 從拖曳位移彈回（sprung）；兩者共用 springTo。
 */
export function useBrowseNav({
  neighbors,
  onBrowseNotice,
}: {
  neighbors: BrowseNeighbors | null;
  /** 頭尾再換篇時的播報（「已是最後一篇」），由路由層的 live 區唱出。 */
  onBrowseNotice?: (message: string) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const routeState = location.state as BrowseRouteState;
  const arrivedByBrowse = neighbors && navigationType === 'REPLACE' ? routeState?.via : undefined;

  const motionRef = useRef<HTMLDivElement>(null);

  // 換篇後新頁一律從頂端開始；新內容從來的那一側滑入（只有「換篇重掛」才有）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在換篇重掛時做一次
  useLayoutEffect(() => {
    if (!arrivedByBrowse) return;
    window.scrollTo(0, 0);
    const el = motionRef.current;
    if (!el || prefersReducedMotion() || typeof el.animate !== 'function') return;
    const from = routeState?.dir === 'prev' ? -ENTER_OFFSET_PX : ENTER_OFFSET_PX;
    const animation = el.animate(
      [
        { transform: `translateX(${from}px)`, opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      { duration: ENTER_MS, easing: 'ease-out' },
    );
    return () => animation?.cancel?.();
  }, []);

  const goBrowse = (direction: 'prev' | 'next', via: BrowseVia, sprung = false) => {
    if (!neighbors) return;
    const target = direction === 'next' ? neighbors.nextId : neighbors.prevId;
    if (!target) {
      onBrowseNotice?.(direction === 'next' ? '已是最後一篇' : '已是第一篇');
      // 頁面手勢已由 BrowseGestures 從拖曳位移彈回（sprung）；其餘（按鈕、鍵盤、輪播盡頭續滑）
      // 在這裡輕推 NUDGE_PX 再回原位。
      const el = motionRef.current;
      if (!sprung && el) {
        springTo(el, `translateX(${direction === 'next' ? -NUDGE_PX : NUDGE_PX}px)`);
      }
      return;
    }
    setLastViewedId(target);
    navigate(`/service-providers/${target}`, {
      replace: true,
      state: { ...(location.state as object | null), dir: direction, via },
    });
  };

  return { motionRef, goBrowse, arrivedByBrowse, dir: routeState?.dir };
}
