"""375px 下「我的 QR」頁的正向版面期望。

**與 `test_overflow_sweep.py` 的分工**：那支問「有沒有畫到框外」，這支問
「該長成什麼樣」。兩者不可互相取代，這一頁剛好兩種失效模式都會踩：

1. **分頁標籤的 ink overflow**：`TabsList` 是 `grid-cols-3`，格子寬度被
   `minmax(0, 1fr)` 鎖死、不會被內容撐開，所以標籤放不下時是**畫到隔壁格子
   上**——元素自己的 `getBoundingClientRect()` 完全正常，溢版巡檢不報。實測
   餘裕只有約 2px（可放文字 94px、「會員驗證碼」＋圖示約 92px），這正是
   三分頁時把圖示藏起來的理由；沒有這條斷言，那個判斷改錯不會有人發現。

2. **取景框把結果擠出第一屏**：掃描分頁的結果卡疊在取景框上，前提是整個取景
   框留在第一屏內。頁首與分頁列比舊的獨立頁多吃約 18px，算式仍有餘裕但沒有
   餘裕到可以不量。**headless 沒有相機時元件會退到手動輸入模式、取景框根本
   不存在**，所以假相機是這條斷言成立的前提（見 conftest 的
   `browser_type_launch_args`）。
"""

import pytest

from layout_probe import first_screen_position, ink_overflowing_children
from overflow_probe import MOBILE_VIEWPORT, settle

# 沿用巡檢那份測資與 mock 接線，不另外複製一份：兩支在量同一個畫面，
# 測資一旦分岔，兩邊的結論就會開始互相矛盾。
from test_overflow_sweep import _setup_my_qr

TABS_LIST = '[data-slot="tabs-list"]'
SCANNER_VIEWPORT = '[data-testid="scanner-viewport"]'
BOTTOM_NAV = 'nav[aria-label="主要導覽"]'


@pytest.fixture
def my_qr_at_375(page, context, api_mock, rest_mock):
    page.set_viewport_size(MOBILE_VIEWPORT)
    _setup_my_qr(context, api_mock, rest_mock)
    return page


def test_my_qr_tab_labels_do_not_ink_overflow(my_qr_at_375):
    """三個分頁標籤不得畫到隔壁格子上。"""
    my_qr_at_375.goto("/dashboard/qr")
    settle(my_qr_at_375)

    tabs = my_qr_at_375.get_by_role("tab")
    assert tabs.count() == 3, f"預期三個分頁（已加入＋會籍有效），實際 {tabs.count()}"

    overflowing = ink_overflowing_children(my_qr_at_375, TABS_LIST)
    assert overflowing is not None, f"找不到 {TABS_LIST}——選擇器過時了"
    assert overflowing == [], "分頁標籤的內容超出自己的格子：" + "；".join(
        f"「{c['text']}」超出 {c['by']}px" for c in overflowing
    )


def test_scanner_viewport_fits_above_bottom_nav(my_qr_at_375):
    """相機取景框整個落在底部導覽之上——結果卡疊在它身上，看得到才有意義。"""
    my_qr_at_375.goto("/dashboard/qr?tab=scan")
    settle(my_qr_at_375)

    viewport = first_screen_position(my_qr_at_375, SCANNER_VIEWPORT)
    assert viewport is not None, (
        "找不到取景框——假相機沒生效的話元件會退到手動輸入模式，"
        "這條斷言就量到了另一個版面（見 conftest 的 browser_type_launch_args）"
    )

    nav = first_screen_position(my_qr_at_375, BOTTOM_NAV)
    assert nav is not None, f"找不到底部導覽 {BOTTOM_NAV}——它在 375px 下應該可見"

    # 對照的是導覽列實際量到的位置，不寫死 56px：那個高度由 min-h 與安全區
    # 內距共同決定，寫死會在裝置安全區改變時變成假綠。
    assert viewport["bottom"] <= nav["top"], (
        f"取景框底邊在 {viewport['bottom']}px，已被底部導覽（頂邊 {nav['top']}px）遮住"
    )
