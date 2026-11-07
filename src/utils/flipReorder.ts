// FLIP 重排小工具：座標晚到、清單由最新序換成距離序時，讓卡片滑到新位置而不是瞬間跳動。
// 手刻 WAAPI（element.animate）而非 motion 的 layout prop——重排一生一次，
// 不值得讓數百張卡長期掛 layout 投影（W5-25）。計算與播放分開，計算可在 node 測。
export type Box = { top: number; left: number; width: number; height: number };
export type Flip = { el: Element; dx: number; dy: number };

const DURATION_MS = 220;
const MAX_FLIPS = 40;

/**
 * 挑出要動畫的卡：前後位置都有量到、位置有變、且前或後落在視窗上下各一屏內的前 max 張；
 * 其餘直接換。dx／dy＝重排前位置減重排後位置（動畫從舊位置滑向 0）。
 */
export function pickFlips(
  before: Map<Element, Box>,
  after: Map<Element, Box>,
  viewportHeight: number,
  max = MAX_FLIPS,
): Flip[] {
  const near = (b: Box) => b.top + b.height >= -viewportHeight && b.top <= viewportHeight * 2;
  const flips: Flip[] = [];
  for (const [el, to] of after) {
    const from = before.get(el);
    if (!from) continue;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (dx === 0 && dy === 0) continue;
    if (!near(from) && !near(to)) continue;
    flips.push({ el, dx, dy });
    if (flips.length >= max) break;
  }
  return flips;
}

export function playFlips(flips: Flip[]): { cancel: () => void; finished: Promise<void> } {
  const animations = flips.map(({ el, dx, dy }) =>
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
      { duration: DURATION_MS, easing: 'ease-out' },
    ),
  );
  return {
    cancel: () => {
      for (const a of animations) a.cancel();
    },
    finished: Promise.all(animations.map((a) => a.finished.catch(() => undefined))).then(
      () => undefined,
    ),
  };
}
