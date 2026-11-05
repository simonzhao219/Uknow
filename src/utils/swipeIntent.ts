// 階段 5 stub：只求型別過，行為留空（TDD 紅燈用）。
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

export function swipeIntent(_input: SwipeInput): SwipeDirection | null {
  return null;
}
