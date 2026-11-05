// 單指水平滑動的意圖判定（純函式）。門檻集中在這裡，實機可調：
// - 水平位移 ≥ 60px、且 ≥ 垂直位移的 1.5 倍（約 ±34° 內），垂直位移 < 80px——擋掉垂直捲動與斜向捲動；
// - 起點在螢幕左右 24px 內不算——那是 iOS／Android 的系統返回手勢區（LINE 內建瀏覽器可傳更寬的值）。
export type SwipeDirection = 'prev' | 'next';

export const SWIPE_MIN_DX = 60;
export const SWIPE_DIRECTION_RATIO = 1.5;
export const SWIPE_MAX_DY = 80;
export const SWIPE_EDGE_GUARD_PX = 24;

export interface SwipeInput {
  /** 結束點 x 減起點 x（向左滑為負）。 */
  dx: number;
  /** 結束點 y 減起點 y。 */
  dy: number;
  /** 起點 x（相對視窗左緣）。 */
  startX: number;
  viewportWidth: number;
  /** 左右系統返回手勢保護區寬度。 */
  edgeGuardPx?: number;
}

export function swipeIntent({
  dx,
  dy,
  startX,
  viewportWidth,
  edgeGuardPx = SWIPE_EDGE_GUARD_PX,
}: SwipeInput): SwipeDirection | null {
  if (startX < edgeGuardPx || startX > viewportWidth - edgeGuardPx) return null;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < SWIPE_MIN_DX || absY >= SWIPE_MAX_DY || absX < SWIPE_DIRECTION_RATIO * absY) {
    return null;
  }
  return dx < 0 ? 'next' : 'prev';
}
