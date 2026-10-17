"""訪客兩頁的**觸控熱區**與**鍵盤焦點環**（S6，P2-9）。

jsdom 裡的「class 字串存在」是套套邏輯（見 `test_admin_mobile_layout.py` 檔頭）：
`pointer-coarse:` 沒生效、焦點環被祖先的 `overflow` 裁掉、或 ring 色帶了透明度，
class 照樣在。這裡在真瀏覽器量：

- **熱區**：`hit_area` 量實際點得到的範圍（不是盒子），ui-ux-guidelines §1 的 44px。
  本模組的 context 帶 `has_touch`——沒有觸控，`(pointer: coarse)` 不成立，量到的是
  一台不存在的裝置（375px 寬、用滑鼠）。
- **焦點環**：鍵盤焦點下讀計算後的 `box-shadow`，釘住「3px 全不透明 `--sel`」與
  （選中態本身是 `--sel` 的元件）「外加 1px 間隙」——§12.12。
"""

import pytest
from playwright.sync_api import expect

from layout_probe import hit_area, pointer_is_coarse
from mocks.supabase_rest_mock import build_public_listing
from overflow_probe import MOBILE_VIEWPORT

MIN_TOUCH_TARGET_PX = 44

# --sel ＝ --muted-foreground ＝ #646478（淺色）。全不透明：rgb()，不是 rgba()。
SEL_RGB = "rgb(100, 100, 120)"
RING_3PX = f"{SEL_RGB} 0px 0px 0px 3px"
# ring-offset-1：1px 間隙（版面底）＋3px 環，box-shadow 外圈的 spread 是 4px
RING_3PX_WITH_GAP = f"{SEL_RGB} 0px 0px 0px 4px"

LISTINGS = [
    build_public_listing(listing_id=f"11111111-1111-1111-1111-11111111110{i}", name=f"服務者{i}號")
    for i in range(1, 4)
]
DETAIL = build_public_listing(
    photos=["https://example.com/1.jpg", "https://example.com/2.jpg", "https://example.com/3.jpg"]
)


@pytest.fixture
def browser_context_args(browser_context_args):
    """本模組專用：375px ＋ 觸控（同 `test_admin_mobile_layout.py`）。"""
    return {**browser_context_args, "viewport": MOBILE_VIEWPORT, "has_touch": True}


@pytest.fixture
def home(page, rest_mock):
    rest_mock.set_public_listings(LISTINGS)
    page.goto("/")
    expect(page.get_by_text(f"找到 {len(LISTINGS)} 位服務者")).to_be_visible()
    assert pointer_is_coarse(page), (
        "browser context 沒有回報 (pointer: coarse)——pointer-coarse: 的 class 不會生效，"
        "下面量的是滑鼠裝置。檢查本模組的 browser_context_args 是否仍帶 has_touch=True。"
    )
    return page


def _assert_reaches_44px(page, selector: str) -> None:
    area = hit_area(page, selector)
    assert area is not None, f"找不到 {selector}——選擇器過時了，不是版面問題"
    assert not area.get("offscreen"), f"{selector} 捲不進視窗（{area}）——量測壞了"
    assert not area.get("centerMiss"), f"{selector} 連中心都點不到——被蓋住或不可見，量測壞了"
    assert area["width"] >= MIN_TOUCH_TARGET_PX and area["height"] >= MIN_TOUCH_TARGET_PX, (
        f"{selector} 可點區只有 {area['width']}×{area['height']}px（期望 ≥{MIN_TOUCH_TARGET_PX}px），"
        f"盒子 {area['boxWidth']}×{area['boxHeight']}px"
    )


def test_home_view_toggle_hit_area_reaches_44px_on_touch(home):
    """檢視切換兩顆鈕在觸控裝置上可點區 ≥44px（滑鼠下維持 36px 高）。"""
    _assert_reaches_44px(home, 'button[aria-label="照片檢視"]')
    _assert_reaches_44px(home, 'button[aria-label="詳細檢視"]')


def test_filter_chip_hit_area_reaches_44px_on_touch(home):
    """篩選面板裡的 chip 在觸控裝置上可點區 ≥44px。"""
    home.get_by_role("button", name="展開搜尋與篩選").click()
    home.get_by_role("button", name="篩選", exact=True).click()
    expect(home.get_by_role("dialog", name="篩選")).to_be_visible()
    _assert_reaches_44px(home, 'button[aria-pressed][title="台北市"]')


def _keyboard_focus_shadow(page, locator, expected: str) -> str:
    """以鍵盤模態聚焦（先按一次 Tab，之後的程式聚焦才算 :focus-visible），回傳 box-shadow。

    有些元件帶 transition（例如 `transition-all`），聚焦當下讀到的是半途的值：等到環
    出現（或 2 秒逾時）再讀，逾時就把最後讀到的值交給呼叫端的斷言訊息。
    """
    page.keyboard.press("Tab")
    locator.focus()
    assert locator.evaluate("el => el.matches(':focus-visible')"), "沒有進入 :focus-visible"
    try:
        locator.evaluate(
            """(el, expected) => new Promise((resolve, reject) => {
              const until = Date.now() + 2000;
              const tick = () => {
                if (getComputedStyle(el).boxShadow.includes(expected)) return resolve();
                if (Date.now() > until) return reject(new Error('timeout'));
                requestAnimationFrame(tick);
              };
              tick();
            })""",
            expected,
        )
    except Exception:
        pass
    return locator.evaluate("el => getComputedStyle(el).boxShadow")


def test_view_toggle_focus_ring_is_3px_opaque_with_a_gap(home):
    """分段切換：3px 全不透明 --sel 環，與選中底色之間 1px 間隙（S2e 審查遺留）。"""
    shadow = _keyboard_focus_shadow(
        home, home.get_by_role("button", name="照片檢視"), RING_3PX_WITH_GAP
    )
    assert RING_3PX_WITH_GAP in shadow, f"焦點環不是 3px＋1px 間隙的全不透明 --sel：{shadow}"


def test_floating_search_button_focus_ring_is_3px_opaque(home):
    """浮動搜尋鈕（原生 button，TOOLBAR_FOCUS）：3px 全不透明 --sel 環。"""
    shadow = _keyboard_focus_shadow(
        home, home.get_by_role("button", name="展開搜尋與篩選"), RING_3PX
    )
    assert RING_3PX in shadow, f"焦點環不是 3px 全不透明 --sel：{shadow}"


def test_detail_thumbnail_focus_ring_is_3px_opaque_with_a_gap_and_unclipped(page, rest_mock):
    """詳情頁縮圖（THUMB_FOCUS）：3px＋1px 間隙，且沒有祖先把環裁掉。"""
    rest_mock.set_public_listing(DETAIL)
    page.goto(f"/service-providers/{DETAIL['id']}")
    thumb = page.get_by_role("button", name="縮圖 1")
    expect(thumb).to_be_visible()

    shadow = _keyboard_focus_shadow(page, thumb, RING_3PX_WITH_GAP)
    assert RING_3PX_WITH_GAP in shadow, f"焦點環不是 3px＋1px 間隙的全不透明 --sel：{shadow}"

    clipping = thumb.evaluate(
        """el => {
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
              const pr = p.getBoundingClientRect(), r = el.getBoundingClientRect();
              if (r.left - 4 < pr.left || r.top - 4 < pr.top
                  || r.right + 4 > pr.right || r.bottom + 4 > pr.bottom) {
                return p.className;
              }
            }
          }
          return null;
        }"""
    )
    assert clipping is None, f"縮圖外 4px（環＋間隙）被這個會裁切的祖先擋住：{clipping}"
