import type { SwipeDirection } from './swipeIntent';

// 換篇跟手的純函式與常數（階段 2 stub：只求型別過）。
export const DRAG_LOCK_PX = 10;
export const DRAG_DAMPING = 0.5;
export const DRAG_MAX_FRACTION = 1 / 3;
export const DRAG_NO_NEIGHBOR_DAMPING = 0.25;
export const DRAG_NO_NEIGHBOR_MAX_PX = 24;
export const ENTER_OFFSET_PX = 32;
export const ENTER_MS = 220;
export const SPRING_MS = 180;

export type DragAxis = 'horizontal' | 'vertical' | null;

export function lockAxis(_input: { dx: number; dy: number }): DragAxis {
  return null;
}

export function dragOffset(_input: {
  dx: number;
  viewportWidth: number;
  hasPrev: boolean;
  hasNext: boolean;
}): number {
  return 0;
}

export type SettleResult = { action: 'commit'; direction: SwipeDirection } | { action: 'cancel' };

export function settle(_input: {
  dx: number;
  dy: number;
  startX: number;
  viewportWidth: number;
  hasPrev: boolean;
  hasNext: boolean;
}): SettleResult {
  return { action: 'cancel' };
}

export function isInteractiveStart(_target: EventTarget | null): boolean {
  return false;
}

export function startsInsideHorizontalScroller(
  _target: EventTarget | null,
  _boundary: Element,
): boolean {
  return false;
}
