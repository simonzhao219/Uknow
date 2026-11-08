import { prefersReducedMotion } from './motionPreference';

// 換篇動畫的時序與位移常數，加上共用的「彈回」。手感數值是起步值（W6-20），實機後在這裡一處調整。
// 與 browseDrag.ts 分開：這裡會被 entry 的 useBrowseNav 用到，手勢才用的純函式（軸向鎖定、
// 阻尼、放開判定、起點排除）留在 browseDrag.ts，隨手勢動態 chunk 載入，不進 entry。
export const ENTER_OFFSET_PX = 32;
export const ENTER_MS = 220;
export const SPRING_MS = 180;
/** 按鈕、鍵盤在頭尾再換篇時，內容輕推再回原位的距離。 */
export const NUDGE_PX = 24;

/**
 * 從目前位移（from，例如 'translateX(-30px)'）彈回 0：先清掉 inline transform，再用 WAAPI 補一段
 * 動畫。拖曳放開未換篇、頭尾再換篇的回彈都走這一個實作。減少動態或沒有位移時只清不動。
 */
export function springTo(el: HTMLElement, from: string): void {
  el.style.transform = '';
  if (!from || prefersReducedMotion() || typeof el.animate !== 'function') return;
  el.animate([{ transform: from }, { transform: 'translateX(0)' }], {
    duration: SPRING_MS,
    easing: 'ease-out',
  });
}
