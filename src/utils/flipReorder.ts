// FLIP 重排小工具（階段 3）。紅燈期最小 stub，實作見綠燈 commit。
export type Box = { top: number; left: number; width: number; height: number };
export type Flip = { el: Element; dx: number; dy: number };

export function pickFlips(
  _before: Map<Element, Box>,
  _after: Map<Element, Box>,
  _viewportHeight: number,
  _max = 40,
): Flip[] {
  return [];
}

export function playFlips(_flips: Flip[]): { cancel: () => void; finished: Promise<void> } {
  return { cancel() {}, finished: Promise.resolve() };
}
