"""瀏覽器內的溢字/溢版探針：量測「文字或內容超出它該待的框」。

為什麼要用真瀏覽器量：jsdom 沒有排版引擎（算不出 scrollWidth），靜態
lint 又看不懂 `cn()` 組出來的 class——只有真的把頁面畫出來、量盒子，才
知道有沒有溢出。這支模組只負責「量」，不負責判斷該怎麼修（截斷／換行／
改版面是設計決定，見 docs/ui-ux-guidelines.md）。

三種訊號，對應三類不同的壞法：

- `horizontal` — 元素內容比自己寬（`scrollWidth > clientWidth`）且
  `overflow-x: visible`：文字直接畫到框外。最常見成因是 flex/grid 子項
  少了 `min-w-0`，或不可斷的長字串（Email、網址、交易序號）。
- `vertical`   — 同理但垂直：固定高度容器（`h-8`/`h-9`/`h-10`）裡的文字
  換行後被切掉。純水平的探針抓不到這類。
- `viewport-escape` — `position: fixed` 元素的邊界超出視窗。固定定位的
  東西不會把頁面撐出捲軸，所以前兩種訊號和 document 層級的檢查都看不到
  它（toast 就是這樣長期沒被發現的）。

刻意「不」偵測的情況：`overflow` 非 visible 的元素（`overflow-hidden` 是
明示要裁切、`overflow-auto` 是明示要捲動，兩者都是有意為之），以及寬高
為 0 或 `visibility: hidden` 的元素。
"""

from typing import Any

# 規格明訂「以手機瀏覽器為主要優化目標」，但 e2e 預設跑 1280×900——
# 手機版面在 CI 幾乎沒被畫出來過。375×812 是 iPhone X~13 mini 的尺寸，
# 取這個寬度是因為它是主流機種裡最窄的一群（更窄的 320px 留給後續軸）。
MOBILE_VIEWPORT = {"width": 375, "height": 812}

# motion/react 的進場動畫是 200–300ms（ToastCard/NotificationCard）。
# 動畫途中量到的是 transform 過程中的盒子，會給出假紅——等它結束再量。
SETTLE_MS = 400

_PROBE_JS = """
() => {
  // 2px 容差。1px 是子像素排版（transform、border 的 .5px）的雜訊；2px 則
  // 多半來自刻意外掛的小裝飾（例如推薦樹頭像的 `-bottom-0.5 -right-0.5`
  // 狀態點）。真正的溢字沒有這麼小——實測最小的真案例是 3px。
  const TOL = 2;
  const vw = document.documentElement.clientWidth;
  const SKIP_TAGS = new Set(['HTML','BODY','SCRIPT','STYLE','HEAD','META','LINK','TITLE','NOSCRIPT','BR','HR']);

  const describe = (el) => {
    const parts = [];
    let cur = el;
    for (let i = 0; cur && i < 4 && cur !== document.body; i++) {
      let s = cur.tagName.toLowerCase();
      const tid = cur.getAttribute && cur.getAttribute('data-testid');
      if (tid) {
        s += '[data-testid="' + tid + '"]';
      } else if (typeof cur.className === 'string' && cur.className.trim()) {
        s += '.' + cur.className.trim().split(/\\s+/).slice(0, 3).join('.');
      }
      parts.unshift(s);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };

  const sample = (el) => (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60);

  const raw = [];
  for (const el of document.querySelectorAll('*')) {
    // SVG 子樹跳過：lucide 圖示的內部節點沒有有意義的 scrollWidth，
    // 而且 className 是 SVGAnimatedString、describe() 會拿到 [object ...]。
    if (el instanceof SVGElement) continue;
    if (SKIP_TAGS.has(el.tagName)) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') continue;

    // scrollWidth 只算 inline-end（LTR 的右）方向的溢出。`justify-center`
    // 的內容是往左右兩邊各溢一半，只看 scrollWidth 會少報一半；純往左溢
    // 出的（例如置中的長標籤被擠到左邊）則完全看不到。所以另外用內容盒
    // 邊界量「子項/文字往外跑了多遠」，三者取最大。
    const clipsX = cs.overflowX !== 'visible';
    let escape = 0;
    if (!clipsX) {
      const innerL = rect.left + (parseFloat(cs.paddingLeft) || 0);
      const innerR = rect.right - (parseFloat(cs.paddingRight) || 0);

      for (const child of el.children) {
        if (child instanceof SVGElement) continue;
        const ccs = getComputedStyle(child);
        // 絕對定位的子項幾乎都是刻意外掛的裝飾（狀態點、角標、徽章），
        // 不是「排不下的內容」——把它們算進來只會製造假紅。
        if (ccs.position === 'absolute' || ccs.position === 'fixed') continue;
        const cr = child.getBoundingClientRect();
        if (cr.width < 1 && cr.height < 1) continue;
        escape = Math.max(escape, cr.right - innerR, innerL - cr.left);
      }

      // 葉節點的文字量不到（文字節點不在 children 裡），用 Range 量它實際
      // 佔的範圍——這才抓得到「按鈕/分頁標籤裡的字比框寬」。
      if (el.childElementCount === 0 && (el.textContent || '').trim()) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const tr = range.getBoundingClientRect();
        if (tr.width > 0) {
          escape = Math.max(escape, tr.right - innerR, innerL - tr.left);
        }
      }
    }

    const hOver = Math.max(el.scrollWidth - el.clientWidth, escape);
    if (hOver > TOL && !clipsX) {
      raw.push({ el, kind: 'horizontal', by: hOver });
    }

    const vOver = el.scrollHeight - el.clientHeight;
    if (vOver > TOL && cs.overflowY === 'visible') {
      raw.push({ el, kind: 'vertical', by: vOver });
    }

    if (cs.position === 'fixed') {
      const escaped = Math.max(-rect.left, rect.right - vw);
      if (escaped > TOL) {
        raw.push({ el, kind: 'viewport-escape', by: escaped });
      }
    }
  }

  // 同一條溢出鏈上，每一層祖先都會跟著超出。只留最內層那個：它才是真正
  // 放不下的內容，也通常就是該加 min-w-0 / truncate / 改版面的那個節點。
  const kept = raw.filter(
    (f) => !raw.some((o) => o !== f && o.kind === f.kind && f.el.contains(o.el))
  );

  return {
    findings: kept
      .map((f) => ({ kind: f.kind, by: Math.round(f.by), path: describe(f.el), text: sample(f.el) }))
      .sort((a, b) => b.by - a.by),
    pageHorizontalScroll: Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ),
    viewportWidth: vw,
  };
}
"""


_CJK_METRICS_JS = """
() => {
  const probe = document.createElement('span');
  probe.textContent = '獎金提領管理';  // 6 個全形字
  probe.style.cssText =
    'position:absolute;left:-9999px;top:0;font-size:16px;white-space:nowrap;' +
    'font-family:ui-sans-serif,system-ui,sans-serif';
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width / (6 * 16);  // 真正的 CJK 字型每字寬 1em，比值應該是 1.0
}
"""


def cjk_em_ratio(page) -> float:
    """量 6 個全形字的平均字寬（以 em 為單位）。

    這是整支巡檢的地基:所有數字都建立在「中文字畫出來多寬」上，而字寬由
    執行環境的字型決定。同一份程式在不同機器上可能量出不同的溢出量，而且
    這種漂移是靜默的——測試照樣綠，只是 baseline 悄悄變得偏鬆或偏緊。

    注意這個檢查能保證的範圍:它確認「中文有以全形寬度畫出來」。至於一台
    完全沒有 CJK 字型的機器會量到什麼比值，沒有實測過——Chromium 會逐字
    回退到系統上任何可用字型，`font-family` 關不掉，所以在有字型的機器上
    模擬不出無字型的情況。因此比值除了拿來斷言，也會一併寫進報告,讓跨
    環境的差異即使在斷言通過時也看得見。
    """
    return page.evaluate(_CJK_METRICS_JS)


def settle(page) -> None:
    """等頁面靜下來再量。networkidle 拿不到就退回固定等待——這裡寧可多等
    一下也不要量到動畫中途的盒子。"""
    try:
        page.wait_for_load_state("networkidle", timeout=5_000)
    except Exception:
        pass
    page.wait_for_timeout(SETTLE_MS)


def scan_overflow(page) -> dict[str, Any]:
    """回傳 {findings, pageHorizontalScroll, viewportWidth}。純量測，不斷言。"""
    return page.evaluate(_PROBE_JS)
