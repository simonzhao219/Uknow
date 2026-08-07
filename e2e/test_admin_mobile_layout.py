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

from layout_probe import (
    count_rows,
    hit_area,
    hit_areas_overlap,
    ink_overflowing_children,
    pointer_is_coarse,
    viewport_fit,
)
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


# --- 觸控目標（P13） ---------------------------------------------------------
#
# 這一組刻意跑在**觸控 context** 底下（見下方 `browser_context_args`）。
# 沒有觸控，`(pointer: coarse)` 不成立，`pointer-coarse:` 的 class 全是死的
# ——會量到一台不存在的裝置：375px 寬、用滑鼠。

SELECT_ALL_CHECKBOX = '[aria-label="全選本頁的提領記錄"]'
ROW_CHECKBOX = '[aria-label^="選取 "]'

# ui-ux-guidelines.md §1：觸控目標 ≥44px（Apple HIG / Material 同一個數字）。
MIN_TOUCH_TARGET_PX = 44


@pytest.fixture
def browser_context_args(browser_context_args):
    """本模組專用：375px ＋ **觸控**。

    conftest 的預設 context 是 1280×900、無觸控。這裡覆寫成行動裝置該有的
    樣子——一份叫做「admin mobile layout」的測試跑在滑鼠裝置上，量出來的
    版面不是使用者會看到的那個。
    """
    return {**browser_context_args, "viewport": MOBILE_VIEWPORT, "has_touch": True}


def test_e2e_context_reports_a_coarse_pointer(admin_at_375):
    """量測前提：瀏覽器必須回報粗指標，否則下面兩條測的是別的東西。

    這條**不受任何 xfail 保護**——它壞掉代表量測工具失效，而工具失效時
    報告不該裝作有效（同 `test_overflow_sweep.py` 的中文字寬硬失敗）。
    """
    assert pointer_is_coarse(admin_at_375), (
        "browser context 沒有回報 (pointer: coarse)，所有 pointer-coarse: 的 class "
        "都不會生效。檢查本模組的 browser_context_args 是否仍帶 has_touch=True。"
    )


@pytest.mark.compatibility
@pytest.mark.xfail(
    reason="P13 未實作：ui/checkbox.tsx 目前只有 size-4（16px），沒有任何觸控目標規則。"
    "修法見 plan §4.1「觸控」——opt-in 的 touchTarget=\"expanded\" variant，"
    "用透明 before: 偽元素撐熱區、可見方框維持 16px。"
    "注意 class 必須含 before:content-['']，否則 ::before 不生成渲染盒、整個熱區是 no-op",
    strict=True,
)
def test_admin_checkbox_hit_area_reaches_44px_on_touch(admin_at_375):
    """P13：提領勾選框在觸控裝置上的**實際可點區**要到 44×44。

    量的是命中而不是盒子——熱區由偽元素撐出來時 getBoundingClientRect 看不見
    （見 layout_probe 的說明）。
    """
    area = hit_area(admin_at_375, SELECT_ALL_CHECKBOX)
    assert area is not None, f"找不到 {SELECT_ALL_CHECKBOX}——選擇器過時了，不是版面問題"
    assert not area.get("offscreen"), f"checkbox 捲不進視窗（{area}）——量測壞了，不是熱區太小"
    assert not area.get("centerMiss"), (
        "連 checkbox 中心都點不到——被別的元素蓋住或它不可見，這是量測壞了，不是熱區太小"
    )
    assert area["width"] >= MIN_TOUCH_TARGET_PX and area["height"] >= MIN_TOUCH_TARGET_PX, (
        f"可點區只有 {area['width']}×{area['height']}px（期望 ≥{MIN_TOUCH_TARGET_PX}px）。"
        f"可見方框是 {area['boxWidth']}×{area['boxHeight']}px——"
        "兩者相等代表熱區完全沒有被撐開。"
    )


def test_admin_checkbox_hit_areas_do_not_overlap(admin_at_375):
    """相鄰勾選框的熱區不得相交。

    今天就該綠（熱區還沒撐開），它守的是**明天**：熱區一旦撐到 44px，
    表頭全選與第一列的間距就不再有餘裕，而點錯的下游是不可回退的批次匯款。
    現況的不重疊是「每列剛好有兩顆撐高的按鈕」這個副作用，不是被釘住的
    不變量——這條測試就是把它變成不變量。
    """
    r = hit_areas_overlap(admin_at_375, SELECT_ALL_CHECKBOX, ROW_CHECKBOX)
    assert r is not None, "找不到勾選框——選擇器過時了"
    assert not r.get("offscreen"), "勾選框捲不進視窗，量測壞了"
    assert not r.get("centerMiss"), "勾選框中心點不到，量測壞了"
    assert not r["overlap"], (
        f"表頭全選與第一列的熱區相交：全選 {r['a']}、第一列 {r['b']}。"
        "點在交界帶會命中哪一個由繪製順序決定，使用者不會收到任何錯誤訊息。"
    )


def test_admin_tab_labels_do_not_ink_overflow(admin_at_375):
    """分頁標籤不得畫到隔壁格子上。

    今天就該綠（現況是 flex，格子被內容撐開）。它守的是 §4.1 改成
    `grid-cols-3` 之後：grid 的 `minmax(0, 1fr)` 會把格子寬度鎖死，
    標籤放不下時是 ink overflow——`count_rows` 照樣回報兩列、溢版巡檢
    也不報，只有比對 scrollWidth 與 clientWidth 抓得到。實測餘裕只有
    10.3px（可放文字 94.3px vs 最長標籤 84px），不厚。
    """
    overflowing = ink_overflowing_children(admin_at_375, TABS_LIST)
    assert overflowing is not None, f"找不到 {TABS_LIST}——選擇器過時了"
    assert overflowing == [], "分頁標籤的內容超出自己的格子：" + "；".join(
        f"「{c['text']}」超出 {c['by']}px" for c in overflowing
    )
