"""375px 下「平台管理」的**正向版面期望**（U2／U3）。

**與 `test_overflow_sweep.py` 的分工**：那支問「有沒有畫到框外」，這支問
「該長成什麼樣」。兩者不可互相取代——一個把五個中文分頁擠成單行橫向捲動的
`TabsList` **沒有任何溢出**（`overflow-x: auto` 是明示要捲動，探針刻意不報），
但它正是行動版要修掉的東西。

**為什麼不寫成 vitest**：jsdom 沒有排版引擎，量不出「排成幾列」「盒子有沒有
超出視窗」。在 jsdom 裡能寫的只有「斷言 class 字串存在」，而那是套套邏輯——
它斷言的是實作者剛打進去的那串字，不可能為了正確的理由失敗。真正的反例：
`grid-cols-3` 少了無前綴的 `grid` 時對 `display:flex` 的 `TabsList` 毫無作用，
版面完全沒變，但「class 存在」與「五個 TabsTrigger 都在文件中」照樣全綠。

**為什麼是 `xfail(strict=True)` 而不是先註解掉**：這些期望描述的是
`docs/plans/platform-admin-rwd/` 要做到的終局，今天還做不到。`strict=True`
讓它變成會自我拆除的鷹架：

- 現在：測試失敗 → 記為 xfail → CI 綠（不擋別人的 PR）
- RWD 實作完成後：測試通過 → **XPASS → CI 紅**，逼實作者回來刪掉這個 marker

也就是說，這些期望不會像註解掉的測試那樣被遺忘，也不會像 TODO 那樣沒有到期日。
刪 marker 的那一刻，期望就正式變成守衛。
"""

import pytest

from layout_probe import count_rows, viewport_fit
from overflow_probe import MOBILE_VIEWPORT, settle

# 沿用巡檢那份「最壞但可達」的 admin 測資與 mock 接線，不另外複製一份：
# 兩支都在量同一個畫面，測資一旦分岔，兩邊的結論就會開始互相矛盾。
from test_overflow_sweep import _setup_admin

# Radix 的 TabsList 掛 data-slot；DialogContent 沒有，但 Radix 會給 role=dialog
# （AlertDialog 是 role=alertdialog，不會誤中）。
TABS_LIST = '[data-slot="tabs-list"]'
DIALOG = '[role="dialog"]'

# 行動端安全邊距：dialog 原語的 base 是 `max-w-[calc(100%-2rem)]`，也就是左右
# 各 1rem。取 8px 當下限而非 16px，是不想把「怎麼留白」寫死成只有一種實作。
MIN_SAFE_MARGIN_PX = 8


@pytest.fixture
def admin_at_375(page, context, api_mock, rest_mock):
    page.set_viewport_size(MOBILE_VIEWPORT)
    _setup_admin(context, api_mock, rest_mock)
    page.goto("/admin")
    settle(page)
    return page


@pytest.mark.compatibility
@pytest.mark.xfail(
    reason="U2 未實作：TabsList 目前是 flex + overflow-x-auto，五個分頁擠成單行橫向捲動。"
    "修法見 plan §4.1（注意 class 需含無前綴 grid 與 w-full，見 review.md 的『補 F2』）",
    strict=True,
)
def test_admin_tabs_wrap_to_two_rows_at_375px(admin_at_375):
    """U2：五個分頁標籤在 375px 下同時可見（＝排成兩列，不是單行捲動）。"""
    rows = count_rows(admin_at_375, TABS_LIST)
    assert rows is not None, f"找不到 {TABS_LIST}——選擇器過時了，不是版面問題"
    assert rows == 2, (
        f"五個分頁標籤排成 {rows} 列（期望 2 列）。"
        "1 列代表仍在橫向捲動（第 4、5 個分頁看不到）；"
        "3 列以上代表欄數設定塌了。"
    )


@pytest.mark.compatibility
@pytest.mark.xfail(
    reason="U3 未實作：IdCardDialog 的 max-w-3xl 經 twMerge 蓋掉 dialog 原語的行動端護欄"
    " max-w-[calc(100%-2rem)]，安全邊距歸零、對話框貼齊螢幕邊緣。"
    "（注意：實測**沒有**溢出——w-full 在 fixed 元素上已依視窗定寬 375px，"
    "max-w-3xl 比它大所以不生效。規劃書 P5 寫的『寬 768px、左右溢出視窗』不成立，"
    "見 review.md 的 F7。）修法見 plan §4.1（P5）",
    strict=True,
)
def test_id_card_dialog_keeps_safe_margins_at_375px(admin_at_375):
    """U3：身分證對話框左右都留有安全邊距（不貼齊螢幕、更不超出）。

    這條**測不出**「頁面有沒有橫向捲軸」——`position: fixed` 的對話框不會把
    頁面撐出捲軸。必須直接量盒子相對視窗的間距。
    """
    admin_at_375.get_by_role("button", name="查看", exact=True).first.click()
    settle(admin_at_375)

    fit = viewport_fit(admin_at_375, DIALOG)
    assert fit is not None, f"找不到 {DIALOG}——對話框沒開起來，不是版面問題"
    assert fit["left"] >= MIN_SAFE_MARGIN_PX and fit["right"] >= MIN_SAFE_MARGIN_PX, (
        f"對話框寬 {fit['width']}px、視窗寬 {fit['viewportWidth']}px，"
        f"左右間距 {fit['left']}px / {fit['right']}px（期望各 ≥ {MIN_SAFE_MARGIN_PX}px）。"
        "負值代表超出視窗。"
    )


@pytest.mark.compatibility
@pytest.mark.xfail(
    reason="U3 未實作：身分證雙圖是無斷點的 grid-cols-2，375px 下每張僅約 160px 寬，"
    "看不清證件上的字。修法見 plan §4.1（P6）",
    strict=True,
)
def test_id_card_photos_stack_vertically_at_375px(admin_at_375):
    """U3：兩張身分證照片在 375px 下上下堆疊，各自佔滿可用寬度。

    刻意**不**斷言「每張圖 ≥ N px 寬」：目前雙圖並排在一個溢出到 768px 的
    對話框裡，每張其實有 ~350px，寬度門檻會因為版面壞掉而僥倖通過。
    「有沒有堆疊」才分得出修好與沒修好。
    """
    admin_at_375.get_by_role("button", name="查看", exact=True).first.click()
    settle(admin_at_375)

    photos = admin_at_375.locator(f"{DIALOG} img")
    assert photos.count() == 2, f"對話框裡有 {photos.count()} 張圖（期望正反面共 2 張）"

    front, back = photos.nth(0).bounding_box(), photos.nth(1).bounding_box()
    assert front["y"] + front["height"] <= back["y"] + 1, (
        f"兩張身分證照片並排（正面 y={front['y']:.0f} 高 {front['height']:.0f}、"
        f"反面 y={back['y']:.0f}），375px 下每張太窄、證件上的字看不清。"
    )
