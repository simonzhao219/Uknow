import { type SwipeDirection, swipeIntent } from './swipeIntent';

// 換篇跟手的純函式與常數。數值是手感起步值（W6-20），實機後在這裡一處調整。
// 換不換篇的門檻不在這裡定義：settle 直接呼叫 swipeIntent，避免兩份門檻漂移。
export const DRAG_LOCK_PX = 10;
export const DRAG_DAMPING = 0.5;
export const DRAG_MAX_FRACTION = 1 / 3;
export const DRAG_NO_NEIGHBOR_DAMPING = 0.25;
export const DRAG_NO_NEIGHBOR_MAX_PX = 24;
export const ENTER_OFFSET_PX = 32;
export const ENTER_MS = 220;
export const SPRING_MS = 180;

export type DragAxis = 'horizontal' | 'vertical' | null;

/** 前 DRAG_LOCK_PX 內不判定；之後以較大的一軸為準（相等視為垂直，交給瀏覽器捲動）。 */
export function lockAxis({ dx, dy }: { dx: number; dy: number }): DragAxis {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (Math.max(absX, absY) < DRAG_LOCK_PX) return null;
  return absX > absY ? 'horizontal' : 'vertical';
}

/** 內容跟手的位移（px，與手指同向）：有鄰居半阻尼、上限視窗寬 1/3；去向沒有鄰居則加重阻尼、上限 24px。 */
export function dragOffset({
  dx,
  viewportWidth,
  hasPrev,
  hasNext,
}: {
  dx: number;
  viewportWidth: number;
  hasPrev: boolean;
  hasNext: boolean;
}): number {
  if (dx === 0) return 0;
  const hasNeighbor = dx < 0 ? hasNext : hasPrev;
  const damping = hasNeighbor ? DRAG_DAMPING : DRAG_NO_NEIGHBOR_DAMPING;
  const cap = hasNeighbor ? viewportWidth * DRAG_MAX_FRACTION : DRAG_NO_NEIGHBOR_MAX_PX;
  const magnitude = Math.min(Math.abs(dx) * damping, cap);
  return dx < 0 ? -magnitude : magnitude;
}

export type SettleResult = { action: 'commit'; direction: SwipeDirection } | { action: 'cancel' };

/** 放開時：達 swipeIntent 門檻且去向有鄰居才換篇，否則彈回。 */
export function settle({
  dx,
  dy,
  startX,
  viewportWidth,
  hasPrev,
  hasNext,
}: {
  dx: number;
  dy: number;
  startX: number;
  viewportWidth: number;
  hasPrev: boolean;
  hasNext: boolean;
}): SettleResult {
  const direction = swipeIntent({ dx, dy, startX, viewportWidth });
  if (!direction) return { action: 'cancel' };
  if (direction === 'next' ? !hasNext : !hasPrev) return { action: 'cancel' };
  return { action: 'commit', direction };
}

const INTERACTIVE_SELECTOR =
  'button,a,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="button"]';

/** 起點在按鈕、連結、輸入元件上：不啟動換篇手勢。 */
export function isInteractiveStart(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
}

/**
 * 起點在「橫向可捲動祖先」內（overflow-x 為 auto／scroll 且內容真的超出）：不啟動換篇手勢。
 * 只往上走到 boundary（不含）為止，不掃整棵樹。
 */
export function startsInsideHorizontalScroller(
  target: EventTarget | null,
  boundary: Element,
): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== boundary) {
    if (node.scrollWidth > node.clientWidth) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
    node = node.parentElement;
  }
  return false;
}
