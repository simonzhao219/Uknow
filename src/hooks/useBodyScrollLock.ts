import { useEffect } from 'react';

/**
 * 彈窗開啟期間鎖住背景頁面的捲動。
 *
 * 為什麼不是只加 `overflow: hidden`：iOS Safari 對 body 的 `overflow: hidden`
 * 幾乎無效，手指仍能把整頁拖動並觸發橡皮筋回彈。唯一穩定的做法是把 body
 * 改成 `position: fixed` 並用負的 top 補回原本的捲動位置，讓頁面在版面上
 * 「沒有可捲動的內容」；關閉時再還原並 scrollTo 回去，使用者感覺不到跳動。
 *
 * 這件事在本站特別重要：頁面一旦被拖動，iOS Safari 會跟著收合／展開網址列，
 * 版面視窗高度（vh）當場改變，於是 `fixed inset-0 + items-center` 置中的彈窗
 * 會整個上下彈跳 —— 也就是使用者回報「簽名時版面一直上下滑動」的來源。
 * Android Chrome 沒這問題，所以同一份程式在 Pixel 上重現不出來。
 *
 * 巢狀彈窗安全：Radix Dialog（LegalDialog）自己的 react-remove-scroll 只動
 * body 的 overflow / padding-right，與這裡動的 position / top / width 不重疊，
 * 兩者同時生效也不會互相還原掉對方的值。
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    if (typeof document === 'undefined') return;

    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      // 還原捲動位置。用 'instant'（而非預設的 CSS scroll-behavior）避免
      // 全站若啟用 smooth scrolling 時，關閉彈窗後畫面會慢慢滑回去。
      window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
    };
  }, [locked]);
}
