// 詳情頁換篇的鍵盤判定（純函式）：← 上一篇、→ 下一篇，但這兩個鍵在很多地方本來就有別的意思，
// 一律讓路——輸入欄的游標移動、輪播捲動容器（← → 是換照片，W5-28）、滑桿／分頁籤／選單等
// 自帶方向鍵語意的元件、任何開啟中的對話框。帶修飾鍵（瀏覽器與輔助科技的快捷鍵）也不攔。
export interface BrowseKeyEvent {
  key: string;
  target: EventTarget | null;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
  repeat?: boolean;
}

const TEXT_FIELDS = 'input,textarea,select,[contenteditable=""],[contenteditable="true"]';
const OWNS_ARROW_KEYS = [
  '[data-carousel-scroller]',
  '[role="slider"]',
  '[role="tab"]',
  '[role="tablist"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="listbox"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
  '[role="radiogroup"]',
].join(',');
const OPEN_DIALOG = '[role="dialog"],[role="alertdialog"],[aria-modal="true"]';

export function browseKeyDirection(event: BrowseKeyEvent): 'prev' | 'next' | null {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return null;
  if (event.repeat) return null; // 按住不放不連續換篇
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.defaultPrevented) {
    return null;
  }
  if (document.querySelector(OPEN_DIALOG)) return null;
  const target = event.target instanceof Element ? event.target : null;
  if (target && (target.closest(TEXT_FIELDS) || target.closest(OWNS_ARROW_KEYS))) return null;
  return event.key === 'ArrowLeft' ? 'prev' : 'next';
}
