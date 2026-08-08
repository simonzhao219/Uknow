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


# --- 觸控目標 ---------------------------------------------------------------
#
# 為什麼不能用 `viewport_fit`／`getBoundingClientRect` 量觸控目標：
# 熱區可以由**偽元素**撐出來（`before:absolute before:-inset-[14px]`），而
# 偽元素不在 DOM 樹裡（`querySelector` 選不到），`position:absolute` 的東西
# 也不會撐大宿主自己的 border box。拿盒子去量，永遠只量到那個 16px 的可見
# 方框——**宣稱在量熱區、實際在量別的東西**。
#
# 所以這裡改問「這個點按得到嗎」：`elementFromPoint` 回的是最上層的**真實
# 元素**，而偽元素在命中測試裡算作它的宿主。這個問法對「class 寫錯導致熱區
# 根本沒生成」也免疫——寫錯就是按不到，測試就紅。


_POINTER_COARSE_JS = "() => window.matchMedia('(pointer: coarse)').matches"


def pointer_is_coarse(page) -> bool:
    """瀏覽器是不是回報粗指標（＝ Tailwind 的 `pointer-coarse:` 會生效）。

    Playwright 的預設 context **沒有觸控**，`(pointer: coarse)` 不成立，
    所有 `pointer-coarse:` 前綴的 class 都是死的。量觸控目標之前必須先確認
    這件事，否則會量到一台不存在的裝置（375px 寬、用滑鼠）。
    """
    return page.evaluate(_POINTER_COARSE_JS)


_HIT_AREA_JS = """
(args) => {
  const { selector, maxReach } = args;
  const el = document.querySelector(selector);
  if (!el) return null;

  // elementFromPoint 只吃**視窗座標**，元素捲出畫面時一律回 null。admin 的
  // 提領表格在 375px 下位在 y≈1250（第一屏之外），不先捲進來就會量成
  // 「連中心都點不到」——那是量測失效，不是熱區太小，兩者的修法完全不同。
  // 捲動也正是使用者要按到它必經的一步，所以這不算作弊。
  el.scrollIntoView({ block: 'center', inline: 'center' });

  const r = el.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight
      || r.right < 0 || r.left > window.innerWidth) {
    return { offscreen: true, top: Math.round(r.top), left: Math.round(r.left) };
  }
  const cx = Math.round(r.left + r.width / 2);
  const cy = Math.round(r.top + r.height / 2);

  // 命中 = 該點最上層的元素就是它、或是它的後代（Radix 會在裡面放
  // Indicator/svg，點在圖示上仍然算點到 checkbox）。
  const hits = (x, y) => {
    const t = document.elementFromPoint(x, y);
    return !!t && (t === el || el.contains(t));
  };
  if (!hits(cx, cy)) return { centerMiss: true };

  // 從中心逐格往外探，回報「還按得到」的最遠距離。逐格而非二分：熱區可能
  // 被別的元素從中間截斷（相鄰熱區重疊就是這樣），二分會跳過缺口、量出
  // 一個連續但其實不連續的範圍。
  const reach = (dx, dy) => {
    let n = 0;
    for (let i = 1; i <= maxReach; i += 1) {
      if (!hits(cx + dx * i, cy + dy * i)) break;
      n = i;
    }
    return n;
  };
  const left = reach(-1, 0), right = reach(1, 0);
  const up = reach(0, -1), down = reach(0, 1);

  return {
    width: left + right + 1,
    height: up + down + 1,
    bounds: { left: cx - left, right: cx + right, top: cy - up, bottom: cy + down },
    boxWidth: Math.round(r.width),
    boxHeight: Math.round(r.height),
  };
}
"""


def hit_area(page, selector: str, max_reach: int = 60) -> dict[str, Any] | None:
    """量 `selector` 的**實際可點區**（不是它的 border box）。

    量之前會先 `scrollIntoView`——`elementFromPoint` 只吃視窗座標，捲出畫面
    的元素一律點不到。

    三種「量測失效」與「熱區太小」分開回報，因為修法完全不同：
    `None` = 選擇器過時（找不到元素）；`{"offscreen": True}` = 捲了還是不在
    視窗內；`{"centerMiss": True}` = 在視窗內但中心點不到（被別的東西蓋住，
    或元素本身不可見）。

    `max_reach` 是單邊探測上限（預設 60px，夠涵蓋 44px 目標還有餘裕）。
    """
    return page.evaluate(_HIT_AREA_JS, {"selector": selector, "maxReach": max_reach})


_HIT_OVERLAP_JS = """
(args) => {
  const { selectorA, selectorB } = args;
  const a = document.querySelector(selectorA);
  const b = document.querySelector(selectorB);
  if (!a || !b) return null;

  a.scrollIntoView({ block: 'center', inline: 'center' });

  const inView = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom >= 0 && r.top <= window.innerHeight
        && r.right >= 0 && r.left <= window.innerWidth;
  };
  if (!inView(a) || !inView(b)) return { offscreen: true };

  // 量**宣告熱區**（::before 的計算樣式），不是「有效命中領地」。
  //
  // 為什麼改:elementFromPoint 對每個座標只回一個最上層元素，所以兩個熱區
  // 真的重疊時，命中歸屬是**平面的分割**——回報的兩個矩形必然相鄰而永不
  // 相交。這支測試量的那一對（表頭全選與第一列）x 中心完全相同（都是 73，
  // 同屬第一欄、同一組 pointer-coarse:pl-6），是軸向共線的最壞情況:實測
  // 注入 25px 真重疊仍回 overlap:false，而現況餘裕只有 15px——docstring
  // 自稱要守的回歸（列高掉回 40px）整段都在漏抓區間內。
  const declared = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el, '::before');
    // 沒有偽元素熱區時退回元素自己的盒子。
    if (!cs || cs.content === 'none' || !cs.content) {
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, source: 'box' };
    }
    const px = (v) => (v && v.endsWith('px') ? parseFloat(v) : 0);
    // ::before 是 absolute、參考宿主的 padding box。
    const bl = px(getComputedStyle(el).borderLeftWidth);
    const bt = px(getComputedStyle(el).borderTopWidth);
    const left = r.left + bl + px(cs.left);
    const top = r.top + bt + px(cs.top);
    return {
      left, top,
      right: left + px(cs.width),
      bottom: top + px(cs.height),
      source: 'pseudo',
    };
  };

  const ra = declared(a), rb = declared(b);
  const overlap = !(ra.right <= rb.left || rb.right <= ra.left
                 || ra.bottom <= rb.top || rb.bottom <= ra.top);
  return {
    overlap,
    a: { left: Math.round(ra.left), right: Math.round(ra.right),
         top: Math.round(ra.top), bottom: Math.round(ra.bottom), source: ra.source },
    b: { left: Math.round(rb.left), right: Math.round(rb.right),
         top: Math.round(rb.top), bottom: Math.round(rb.bottom), source: rb.source },
  };
}
"""


def hit_areas_overlap(page, selector_a: str, selector_b: str):
    """兩個元素的**宣告熱區**在畫面上是否相交。

    相鄰的勾選框各自把熱區撐到 44×44 時很容易吃到對方的地盤——點下去命中誰
    由繪製順序決定，使用者只會看到「勾錯了」而沒有任何錯誤訊息。

    量的是 `::before` 的計算樣式而不是 `elementFromPoint` 的命中領地:後者是
    平面的分割，兩個熱區真重疊時回報的矩形反而必然相鄰、永不相交（軸向共線
    時尤其明顯，而這支測的正是那種情況）。

    回 `None` = 選擇器過時；`{"offscreen": True}` = 捲了還是不在視窗內；
    否則回 `{"overlap": bool, "a": {...}, "b": {...}}`，其中 `source` 標明
    量到的是 `pseudo`（偽元素熱區）還是 `box`（沒有偽元素時的元素盒子）。
    """
    return page.evaluate(
        _HIT_OVERLAP_JS, {"selectorA": selector_a, "selectorB": selector_b}
    )


_INK_OVERFLOW_JS = """
(selector) => {
  const root = document.querySelector(selector);
  if (!root) return null;
  return [...root.children]
    .map((el) => ({
      text: (el.textContent || '').trim().slice(0, 20),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      by: el.scrollWidth - el.clientWidth,
    }))
    .filter((c) => c.by > 0);
}
"""


def ink_overflowing_children(page, selector: str) -> list[dict[str, Any]] | None:
    """`selector` 底下有哪些直接子元素的內容超出自己的格子。

    專為 grid 而生：`grid-cols-N` 底層是 `repeat(N, minmax(0, 1fr))`，格子
    寬度被鎖在 track 寬、**不會被內容撐開**，所以標籤放不下時是 ink
    overflow——畫到隔壁格子上，但元素自己的 `getBoundingClientRect()` 完全
    正常。`count_rows` 照樣回報「兩列」，溢版巡檢也不報（沒有畫出頁面外）。
    只有比對 `scrollWidth` 與 `clientWidth` 抓得到。
    """
    return page.evaluate(_INK_OVERFLOW_JS, selector)


_FIRST_SCREEN_JS = """
(selector) => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // 量的是「不捲動時看不看得到」，所以用文件座標扣掉目前捲動位置——
  // 呼叫端保證是剛載入、尚未捲動的狀態。
  return {
    top: Math.round(r.top),
    viewportHeight: window.innerHeight,
    visible: r.top < window.innerHeight,
    // 距離第一屏底部還差多少（負值 = 已經在第一屏內）
    below: Math.round(r.top - window.innerHeight),
  };
}
"""


def first_screen_position(page, selector: str) -> dict[str, Any] | None:
    """`selector` 在**不捲動**的情況下是否落在第一屏內。

    這條問的是「打開就能開始做事嗎」——admin 打開手機是為了處理事情，不是
    看儀表板。統計卡、頁首、說明文字都可能把真正的工作內容推到第一屏之外，
    而那不會被溢版巡檢報成任何問題:版面完全沒有壞，只是**不好用**。
    """
    return page.evaluate(_FIRST_SCREEN_JS, selector)


_CARD_DENSITY_JS = """
(selector) => {
  const cards = [...document.querySelectorAll(selector)];
  if (!cards.length) return null;
  return cards.map((c) => ({
    height: Math.round(c.getBoundingClientRect().height),
    // 只算看得見的:收進選單裡的項目不佔畫面，也不參與掃視成本。
    // **圖示按鈕要算**——它一樣佔位、一樣是一個要判斷的目標。用 textContent
    // 過濾會把「⋯」這種只有 aria-label 的按鈕靜默排除，量出偏低的數字。
    visibleButtons: [...c.querySelectorAll('button')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => (b.textContent || '').trim() || b.getAttribute('aria-label') || '(無名稱按鈕)'),
  }));
}
"""


def card_density(page, selector: str) -> list[dict[str, Any]] | None:
    """列表卡片的**掃視成本**:每張多高、直接可見幾顆按鈕。

    「所有資訊都攤平呈現」不會被溢版巡檢報成任何問題——版面完全正確，
    只是每張卡都很高、每張卡都有一排按鈕，於是一屏放不下兩筆、
    而且每一筆都要重新讀一次按鈕列。這條把那個成本變成數字。
    """
    return page.evaluate(_CARD_DENSITY_JS, selector)
