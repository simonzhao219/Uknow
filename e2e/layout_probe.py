"""瀏覽器內的**正向版面**探針：量「該長成什麼樣」。

與 `overflow_probe.py` 的分工是刻意的，兩者問的是不同問題：

- `overflow_probe` —— 有沒有畫到框外？（缺陷偵測，掃全頁、不必事先知道
  要看哪個元素）
- `layout_probe`（本檔）—— 這個元素有沒有長成它該有的樣子？（意圖驗證，
  對指定元素量幾何）

分開的理由不只是主題不同,更是**它們的失效方式相反**:一個把五個中文分頁
擠成單行橫向捲動的 `TabsList` 在 `overflow_probe` 眼中完全乾淨——
`overflow-x: auto` 是明示要捲動，探針刻意不報——但它正是行動版要修掉的
東西。只靠缺陷偵測，這種「沒壞但也沒對」的版面永遠不會被發現。

反過來說,本檔的函式都要求呼叫端**先知道自己在找什麼**（給 selector、
給期望值），所以它們適合寫成具名的期望，不適合拿來做全站巡檢。

為什麼不寫在 jsdom（vitest）裡:jsdom 沒有排版引擎，`getBoundingClientRect`
一律回 0。在那裡唯一寫得出來的是「斷言 class 字串存在」，而那是套套邏輯
——它斷言的是實作者剛打進去的那串字，不可能為了正確的理由失敗。
"""

from typing import Any

_ROW_COUNT_JS = """
(selector) => {
  const host = document.querySelector(selector);
  if (!host) return null;
  const tops = new Set();
  for (const child of host.children) {
    const r = child.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // 取整到 1px:同一列的元素 top 可能因子像素排版差零點幾。
    tops.add(Math.round(r.top));
  }
  return tops.size;
}
"""


def count_rows(page, selector: str) -> int | None:
    """`selector` 底下的直接子元素佔了幾個視覺列（以 top 座標分群）。

    「五個分頁標籤同時可見」在 375px 下等價於「它們排成 2 列」——排成 1 列
    就代表擠在一起橫向捲動（現況），排成 5 列則代表欄數設定塌了。

    找不到元素回 `None`（而不是 0），讓呼叫端分得出「選擇器過時了」與
    「真的只有一列」——這兩件事的修法完全不同。
    """
    return page.evaluate(_ROW_COUNT_JS, selector)


_VIEWPORT_FIT_JS = """
(selector) => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  return { left: Math.round(r.left), right: Math.round(vw - r.right),
           width: Math.round(r.width), viewportWidth: vw };
}
"""


def viewport_fit(page, selector: str) -> dict[str, Any] | None:
    """量 `selector` 相對視窗左右邊界的間距（負值 = 超出視窗）。

    專為 `position: fixed` 的對話框而生:固定定位的東西**不會把頁面撐出
    捲軸**，所以「有沒有出現水平捲軸」（`scrollWidth > clientWidth`）永遠
    測不出「對話框比螢幕寬」，也測不出「對話框貼齊螢幕邊緣、安全邊距歸零」。
    只能直接量盒子。
    """
    return page.evaluate(_VIEWPORT_FIT_JS, selector)
