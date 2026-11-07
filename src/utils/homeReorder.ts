// 首頁座標晚到重排的 DOM 銜接：量測卡片位置、維持錨點、播 FLIP、動畫期間擋點擊。
import { type Box, pickFlips, playFlips } from './flipReorder';
import { prefersReducedMotion } from './motionPreference';

/** 冷載入等待定位的截止時間（自掛載起算）。 */
export const GEO_WAIT_MS = 1500;
/** 動畫播完的逾時保險：超過就恢復清單點擊。 */
const CLICK_BLOCK_FALLBACK_MS = 300;

export type ReorderSnapshot = {
  boxes: Map<Element, Box>;
  /** 視窗內第一張可見卡與它重排前的 top。 */
  anchor: { el: Element; top: number } | null;
};

function measure(list: HTMLElement): Map<Element, Box> {
  const boxes = new Map<Element, Box>();
  for (const el of list.querySelectorAll('[data-listing-id]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) {
      boxes.set(el, { top: r.top, left: r.left, width: r.width, height: r.height });
    }
  }
  return boxes;
}

export function takeReorderSnapshot(list: HTMLElement): ReorderSnapshot {
  const boxes = measure(list);
  let anchor: ReorderSnapshot['anchor'] = null;
  for (const [el, b] of boxes) {
    if (b.top + b.height > 0 && b.top < window.innerHeight) {
      anchor = { el, top: b.top };
      break;
    }
  }
  return { boxes, anchor };
}

/** 新順序已套用到 DOM 後呼叫：補償 scrollY 讓錨點不動，再播 FLIP。回傳可取消的控制柄。 */
export function runReorder(list: HTMLElement, snapshot: ReorderSnapshot): { cancel: () => void } {
  const { anchor } = snapshot;
  if (anchor && anchor.el.isConnected && window.scrollY > 0) {
    const delta = anchor.el.getBoundingClientRect().top - anchor.top;
    if (delta !== 0) window.scrollBy(0, delta);
  }
  if (prefersReducedMotion()) return { cancel() {} };

  const flips = pickFlips(snapshot.boxes, measure(list), window.innerHeight);
  if (flips.length === 0) return { cancel() {} };

  list.setAttribute('data-reordering', 'true');
  const handle = playFlips(flips);
  const release = () => list.removeAttribute('data-reordering');
  const timer = setTimeout(release, CLICK_BLOCK_FALLBACK_MS);
  handle.finished.then(() => {
    clearTimeout(timer);
    release();
  });
  return {
    cancel: () => {
      clearTimeout(timer);
      handle.cancel();
      release();
    },
  };
}
