"""375px 下「平台管理」的**正向版面期望**（U2／U3）。

**與 `test_overflow_sweep.py` 的分工**：那支問「有沒有畫到框外」，這支問
「該長成什麼樣」。兩者不可互相取代——一個把一排中文分頁擠成單行橫向捲動的
`TabsList` **沒有任何溢出**（`overflow-x: auto` 是明示要捲動，探針刻意不報），
但它正是行動版要修掉的東西。

**為什麼不寫成 vitest**：jsdom 沒有排版引擎，量不出「排成幾列」「盒子有沒有
超出視窗」。在 jsdom 裡能寫的只有「斷言 class 字串存在」，而那是套套邏輯——
它斷言的是實作者剛打進去的那串字，不可能為了正確的理由失敗。真正的反例：
`grid-cols-3` 少了無前綴的 `grid` 時對 `display:flex` 的 `TabsList` 毫無作用，
版面完全沒變，但「class 存在」與「所有 TabsTrigger 都在文件中」照樣全綠。

**為什麼是 `xfail(strict=True)` 而不是先註解掉**：這些期望描述的是
`docs/plans/platform-admin-rwd/` 要做到的終局，今天還做不到。`strict=True`
讓它變成會自我拆除的鷹架：

- 現在：測試失敗 → 記為 xfail → CI 綠（不擋別人的 PR）
- RWD 實作完成後：測試通過 → **XPASS → CI 紅**，逼實作者回來刪掉這個 marker

也就是說，這些期望不會像註解掉的測試那樣被遺忘，也不會像 TODO 那樣沒有到期日。
刪 marker 的那一刻，期望就正式變成守衛。
"""

import pytest
from playwright.sync_api import expect

from layout_probe import (
    card_density,
    count_rows,
    first_screen_position,
    hit_area,
    hit_areas_overlap,
    ink_overflowing_children,
    pointer_is_coarse,
    viewport_fit,
)
from overflow_probe import MOBILE_VIEWPORT, settle

# 沿用巡檢那份「最壞但可達」的 admin 測資與 mock 接線，不另外複製一份：
# 兩支都在量同一個畫面，測資一旦分岔，兩邊的結論就會開始互相矛盾。
from mocks.admin_console_mock import build_admin_member_detail, route_admin_member_detail
from mocks.backend_api_mock import build_admin_member, build_admin_withdrawal
from test_overflow_sweep import (
    LONG_EMAIL,
    NAME_CJK_10,
    _open_id_card_dialog,
    _open_member_detail_sheet,
    _open_tab,
    _setup_admin,
)

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
def test_admin_tabs_fit_one_row_at_375px(admin_at_375):
    """U2：四個分頁在 375px 排成一列，四個都看得到。

    一列成立的前提是可見標籤只有二字（提領／會員／公告／告警，ui-ux-guidelines §3）。
    「一列」本身分不出「四欄 grid」與「單行橫向捲動」——後者第 4 個分頁會被
    捲到框外，所以另外斷言每個分頁都完整落在 TabsList 的可視範圍內。
    """
    rows = count_rows(admin_at_375, TABS_LIST)
    assert rows is not None, f"找不到 {TABS_LIST}——選擇器過時了，不是版面問題"
    assert rows == 1, (
        f"四個分頁排成 {rows} 列（期望 1 列）。"
        "2 列代表欄數設定退回了兩列版面。可見標籤放不下時的退路是 2+2"
        "（grid-cols-2 md:grid-cols-4），這條斷言要一起改成 2。"
    )
    clipped = _clipped_tabs(admin_at_375)
    assert clipped == [], f"這些分頁超出分頁列的可視範圍（在橫向捲動）：{clipped}"


def _clipped_tabs(page):
    """超出分頁列可視範圍的分頁（一列分不出「四欄 grid」與「單行橫向捲動」）。"""
    return page.evaluate(
        """(sel) => {
          const list = document.querySelector(sel);
          const box = list.getBoundingClientRect();
          return [...list.querySelectorAll('[role="tab"]')]
            .map((t) => ({ text: t.textContent, r: t.getBoundingClientRect() }))
            .filter(({ r }) => r.left < box.left - 0.5 || r.right > box.right + 0.5)
            .map(({ text }) => text);
        }""",
        TABS_LIST,
    )


@pytest.mark.compatibility
def test_admin_tabs_fit_one_row_at_320px(page, context, api_mock, rest_mock):
    """最窄的常見手機（320px）也要一列、標籤不溢字——375px 的餘裕不代表 320px 也有。"""
    page.set_viewport_size({"width": 320, "height": 640})
    _setup_admin(context, api_mock, rest_mock)
    page.goto("/admin")
    settle(page)
    assert count_rows(page, TABS_LIST) == 1, "320px 下四個分頁不在同一列"
    assert _clipped_tabs(page) == [], "320px 下有分頁被捲到分頁列外"
    overflowing = ink_overflowing_children(page, TABS_LIST)
    assert overflowing == [], "320px 下分頁標籤超出自己的格子：" + "；".join(
        f"「{c['text']}」超出 {c['by']}px" for c in overflowing
    )


def test_admin_tabs_are_equal_width_on_desktop(page, context, api_mock, rest_mock):
    """桌機四欄等寬：二字標籤不得讓 grid 退回依內容撐寬的 flex。"""
    page.set_viewport_size({"width": 1280, "height": 800})
    _setup_admin(context, api_mock, rest_mock)
    page.goto("/admin")
    settle(page)
    widths = page.evaluate(
        """(sel) => [...document.querySelectorAll(sel + ' > [role="tab"]')]
              .map((t) => t.getBoundingClientRect().width)""",
        TABS_LIST,
    )
    assert len(widths) == 4, f"桌機應有 4 個分頁，實際 {len(widths)}"
    assert max(widths) - min(widths) <= 1, f"四個分頁寬度不一致：{widths}"


@pytest.mark.compatibility
def test_id_card_dialog_keeps_safe_margins_at_375px(admin_at_375):
    """U3：身分證對話框左右都留有安全邊距（不貼齊螢幕、更不超出）。

    這條**測不出**「頁面有沒有橫向捲軸」——`position: fixed` 的對話框不會把
    頁面撐出捲軸。必須直接量盒子相對視窗的間距。
    """
    # 查看證件已依 ui-ux-guidelines §11 規則 3 收進手機卡片的溢出選單
    # （唯讀、罕用、無時效性）。桌面表格仍是直接的按鈕。
    _open_id_card_dialog(admin_at_375)
    settle(admin_at_375)

    fit = viewport_fit(admin_at_375, DIALOG)
    assert fit is not None, f"找不到 {DIALOG}——對話框沒開起來，不是版面問題"
    assert fit["left"] >= MIN_SAFE_MARGIN_PX and fit["right"] >= MIN_SAFE_MARGIN_PX, (
        f"對話框寬 {fit['width']}px、視窗寬 {fit['viewportWidth']}px，"
        f"左右間距 {fit['left']}px / {fit['right']}px（期望各 ≥ {MIN_SAFE_MARGIN_PX}px）。"
        "負值代表超出視窗。"
    )


@pytest.mark.compatibility
def test_id_card_photos_stack_vertically_at_375px(admin_at_375):
    """U3：兩張身分證照片在 375px 下上下堆疊，各自佔滿可用寬度。

    刻意**不**斷言「每張圖 ≥ N px 寬」：目前雙圖並排在一個溢出到 768px 的
    對話框裡，每張其實有 ~350px，寬度門檻會因為版面壞掉而僥倖通過。
    「有沒有堆疊」才分得出修好與沒修好。
    """
    # 查看證件已依 ui-ux-guidelines §11 規則 3 收進手機卡片的溢出選單
    # （唯讀、罕用、無時效性）。桌面表格仍是直接的按鈕。
    _open_id_card_dialog(admin_at_375)
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

# 觸控平板:768x1024。**刻意不是 375px**——Q2 裁決「勾選只在 isDesktop 下
# 渲染」，而 isDesktop 是 `(min-width: 768px)`，所以手機上根本不會有這個
# 勾選框（階段 2 之後手機是卡片、沒有表格）。P13 實際適用的是**寬度判為
# 桌面、輸入方式卻是觸控**的那批裝置——iPad 直向正好是 768px。
# 在 375px 量它，量的是一個做完 RWD 就會消失的東西。
TABLET_TOUCH_VIEWPORT = {"width": 768, "height": 1024}

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


@pytest.fixture
def admin_tablet_touch(page, context, api_mock, rest_mock):
    """觸控平板：768px（isDesktop 為真、桌面表格會渲染）＋ 粗指標。"""
    page.set_viewport_size(TABLET_TOUCH_VIEWPORT)
    _setup_admin(context, api_mock, rest_mock)
    page.goto("/admin")
    settle(page)
    return page


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
def test_admin_checkbox_hit_area_reaches_44px_on_touch(admin_tablet_touch):
    """P13：提領勾選框在觸控裝置上的**實際可點區**要到 44×44。

    量的是命中而不是盒子——熱區由偽元素撐出來時 getBoundingClientRect 看不見
    （見 layout_probe 的說明）。
    """
    area = hit_area(admin_tablet_touch, SELECT_ALL_CHECKBOX)
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


def test_admin_checkbox_hit_areas_do_not_overlap(admin_tablet_touch):
    """相鄰勾選框的熱區不得相交。

    今天就該綠（熱區還沒撐開），它守的是**明天**：熱區一旦撐到 44px，
    表頭全選與第一列的間距就不再有餘裕，而點錯的下游是不可回退的批次匯款。
    現況的不重疊是「每列剛好有兩顆撐高的按鈕」這個副作用，不是被釘住的
    不變量——這條測試就是把它變成不變量。
    """
    r = hit_areas_overlap(admin_tablet_touch, SELECT_ALL_CHECKBOX, ROW_CHECKBOX)
    assert r is not None, "找不到勾選框——選擇器過時了"
    assert not r.get("offscreen"), "勾選框捲不進視窗，量測壞了"
    assert not r.get("centerMiss"), "勾選框中心點不到，量測壞了"
    assert not r["overlap"], (
        f"表頭全選與第一列的熱區相交：全選 {r['a']}、第一列 {r['b']}。"
        "點在交界帶會命中哪一個由繪製順序決定，使用者不會收到任何錯誤訊息。"
    )


def test_admin_tab_labels_do_not_ink_overflow(admin_at_375):
    """分頁標籤不得畫到隔壁格子上。

    grid 的 `minmax(0, 1fr)` 會把格子寬度鎖死，標籤放不下時是 ink
    overflow——`count_rows` 照樣回報一列、溢版巡檢也不報，只有比對
    scrollWidth 與 clientWidth 抓得到。四欄時每格可放文字約 66px，二字
    可見標籤約 28px；sr-only 補字（無障礙名稱）不得撐出 scrollWidth。
    """
    overflowing = ink_overflowing_children(admin_at_375, TABS_LIST)
    assert overflowing is not None, f"找不到 {TABS_LIST}——選擇器過時了"
    assert overflowing == [], "分頁標籤的內容超出自己的格子：" + "；".join(
        f"「{c['text']}」超出 {c['by']}px" for c in overflowing
    )


@pytest.mark.compatibility
def test_admin_tabs_reach_44px_touch_target(admin_at_375):
    """四個分頁標籤在觸控裝置上都要有 ≥44px 的可點高度（§1）。

    分頁列是 admin 手機版**最上層的導覽**——每一次要換分頁都得先按到它，
    頻率高於卡片上的任何一顆按鈕。原語 `ui/tabs.tsx` 的 base 是
    `py-1` ＋ `text-sm`（行高 20px）＋ 1px 邊框 ＝ 30px，而
    `TabsList` 在 admin 被改成 `h-auto`（為了讓 grid 由內容決定高度），
    所以格子高度由內容決定、沒有任何一處把它撐到 44px。

    **寬度不測**：`grid-cols-4` 下每格 84px，本來就遠超過 44px，
    寫進斷言只會製造一條永遠為真的條件。

    量的是命中而不是盒子（同 checkbox 那條的理由）——真正決定使用者按不按
    得到的是 `elementFromPoint`，不是 `getBoundingClientRect`。
    """
    too_small = []
    for i in range(1, 5):
        selector = f'{TABS_LIST} > [role="tab"]:nth-child({i})'
        area = hit_area(admin_at_375, selector)
        assert area is not None, f"找不到第 {i} 個分頁（{selector}）——選擇器過時了，不是版面問題"
        assert not area.get("offscreen"), f"第 {i} 個分頁捲不進視窗（{area}）——量測壞了"
        assert not area.get("centerMiss"), f"連第 {i} 個分頁的中心都點不到（{area}）——量測壞了"
        if area["height"] < MIN_TOUCH_TARGET_PX:
            too_small.append((i, area))

    assert not too_small, "分頁標籤的可點高度不足 " + f"{MIN_TOUCH_TARGET_PX}px：" + "；".join(
        f"第 {i} 個只有 {a['height']}px（可見方框 {a['boxHeight']}px）" for i, a in too_small
    )


# --- 第一屏可工作（階段 6） --------------------------------------------------
#
# 前面幾條測的是「版面有沒有壞」。這一組測的是「好不好用」——打開就能開始
# 做事，還是要先滑過一整屏的儀表板。admin 在外面接到電話用手機開後台，
# 要的是那一筆記錄，不是統計數字。
#
# 這個失效模式**溢版巡檢完全報不出來**:版面沒有任何一處畫到框外，
# 它只是把工作內容推到第一屏之外。

FIRST_WITHDRAWAL_CARD = '[role="group"][aria-label$="的提領記錄"]'
FIRST_MEMBER_CARD = '[role="group"][aria-label$="的會員資料"]'


def test_first_withdrawal_record_is_reachable_without_scrolling(admin_at_375):
    """375px 打開提領管理，第一筆記錄要在第一屏內。"""
    pos = first_screen_position(admin_at_375, FIRST_WITHDRAWAL_CARD)
    assert pos is not None, f"找不到 {FIRST_WITHDRAWAL_CARD}——選擇器過時了"
    assert pos["visible"], (
        f"第一筆提領記錄在 y={pos['top']}px，第一屏只有 {pos['viewportHeight']}px"
        f"——還差 {pos['below']}px。打開後要先滑過統計卡才看得到工作內容。"
    )


def test_first_member_is_reachable_without_scrolling(admin_at_375):
    """375px 切到會員管理，第一位會員要在第一屏內。"""
    _open_tab("會員管理")(admin_at_375)
    settle(admin_at_375)
    pos = first_screen_position(admin_at_375, FIRST_MEMBER_CARD)
    assert pos is not None, f"找不到 {FIRST_MEMBER_CARD}——選擇器過時了"
    assert pos["visible"], (
        f"第一位會員在 y={pos['top']}px，第一屏只有 {pos['viewportHeight']}px"
        f"——還差 {pos['below']}px。"
    )


# --- 掃視成本（階段 6） ------------------------------------------------------
#
# 人審看完 375px 實機截圖的三點意見:「所有資訊都呈現，所以畫面很長」、
# 「按鈕卡片很多，都擠在一起」、「三格統計在手機變成上面兩格下面一格」。
# 前兩點的根因是同一個:**沒有做漸進揭露**——每張卡把所有欄位與所有動作
# 都攤平，於是一屏放不下兩筆，而且每一筆都要重新掃一次按鈕列。
#
# 收合態的高度預算。**這個數字沒有餘裕**（實測提領卡正好 150），留著只是
# 擋「卡片變胖」的下界，不是「一屏兩筆」的代理——後者現在直接量，見下方。
MAX_COLLAPSED_CARD_PX = 150
# 上限 3 而不是 2:`ui-ux-guidelines.md` §11 明列**時效性動作不得收進溢出
# 選單**（並直接引用「退件與代為完成不鎖——那是客服接到電話當下就該能處理
# 的事」），所以提領卡至少是「主要動作 ＋ 時效性動作 ＋ 選單」三顆。
# 這個數字是準則推導出來的，不是視覺偏好——把它壓到 2 只能靠違反 §11 達成。
# 逐列表分開給:會員卡改「一個人的狀態」的動作全在詳情面板（§11.1），只剩一顆。
MAX_VISIBLE_BUTTONS = {"提領": 3, "會員": 1}


def _assert_scannable(cards, kind: str):
    assert cards is not None, f"找不到{kind}卡片——選擇器過時了"
    assert len(cards) >= 2, (
        f"{kind}測資只有 {len(cards)} 筆——「一屏看得完兩筆」在單筆測資下"
        "**結構上量不到**，請補 _setup_admin 的測資"
    )
    limit = MAX_VISIBLE_BUTTONS[kind]
    for i, c in enumerate(cards):
        assert c["height"] <= MAX_COLLAPSED_CARD_PX, (
            f"第 {i + 1} 張{kind}卡收合態高 {c['height']}px（上限 {MAX_COLLAPSED_CARD_PX}px）"
        )
        assert len(c["visibleButtons"]) <= limit, (
            f"第 {i + 1} 張{kind}卡有 {len(c['visibleButtons'])} 顆可見按鈕"
            f"{c['visibleButtons']}（上限 {limit}）——次要動作應收進「更多」選單"
            "，改「一個人的狀態」的動作應移進詳情面板（§11.1）。"
        )


def _assert_two_fit_first_screen(page, selector: str, kind: str):
    """第一屏看得完兩筆——直接量，不用高度上限當代理。

    ⚠️ **不要改用「第二張卡 visible」**:第二張卡只露 25px 也算 visible，
    那量的是「有沒有露出來」，不是「看得完」。
    """
    pos = first_screen_position(page, selector)
    cards = card_density(page, selector)
    assert pos is not None and cards, f"找不到{kind}卡片——選擇器過時了"
    need = 2 * cards[0]["height"]
    have = pos["viewportHeight"] - pos["top"]
    assert have >= need, (
        f"第一屏放不下兩筆{kind}:第一張卡從 y={pos['top']} 開始，"
        f"視窗 {pos['viewportHeight']}px 只剩 {have}px，兩筆需要 {need}px（差 {need - have}px）。"
        "卡片本身已經壓到極限，要再省得從它**上方**下手——"
        "統計區塊是最大的一塊。"
    )


def test_withdrawal_cards_are_scannable(admin_at_375):
    """提領卡收合態要夠矮、按鈕夠少，一屏掃得完兩筆。"""
    _assert_scannable(card_density(admin_at_375, FIRST_WITHDRAWAL_CARD), "提領")


def test_member_cards_are_scannable(admin_at_375):
    """會員卡同理。"""
    _open_tab("會員管理")(admin_at_375)
    settle(admin_at_375)
    _assert_scannable(card_density(admin_at_375, FIRST_MEMBER_CARD), "會員")


def test_two_withdrawals_fit_the_first_screen(admin_at_375):
    """打開提領管理，第一屏要看得完**兩筆**，不是勉強露出第一筆。

    這條是階段 6 的真正目標。先前用「卡片高度 ≤150px」當代理，而那個代理的
    推導寫錯了（註解說第一屏剩 470px，實測只剩 187px），於是門檻全綠、
    失敗訊息「一屏放不下兩筆」卻仍然為真——數字看起來被把關了，被把關的
    卻不是那件事。
    """
    _assert_two_fit_first_screen(admin_at_375, FIRST_WITHDRAWAL_CARD, "提領")


def test_two_members_fit_the_first_screen(admin_at_375):
    """會員管理同理。"""
    _open_tab("會員管理")(admin_at_375)
    settle(admin_at_375)
    _assert_two_fit_first_screen(admin_at_375, FIRST_MEMBER_CARD, "會員")


# --- 工具列（S3 A2） ----------------------------------------------------------
#
# 改版前提領頁的「狀態篩選＋重新整理＋下載CSV」靠 flex-wrap 任其換行，
# 375px 下擠成兩行、斷點附近忽一行忽兩行。AdminToolbar 把它收成一行：
# 篩選吃剩餘寬度、兩顆 icon 鈕在觸控裝置上 44px。

TOOLBAR = '[data-slot="admin-toolbar"]'


def _toolbar_buttons(page):
    return page.evaluate(
        """(sel) => [...document.querySelector(sel).querySelectorAll(':scope > button')]
              .map((b, i) => `${sel} > button:nth-of-type(${i + 1})`)""",
        TOOLBAR,
    )


def _assert_toolbar_one_row(page, kind: str):
    rows = count_rows(page, TOOLBAR)
    assert rows is not None, f"找不到 {TOOLBAR}——{kind}沒有用 AdminToolbar"
    assert rows == 1, f"{kind}工具列在 375px 排成 {rows} 行（期望 1 行）"
    fit = viewport_fit(page, TOOLBAR)
    assert fit["left"] >= 0 and fit["right"] >= 0, f"{kind}工具列超出視窗：{fit}"
    too_small = []
    for selector in _toolbar_buttons(page):
        area = hit_area(page, selector)
        assert area is not None and not area.get("centerMiss"), f"{selector} 量不到（{area}）"
        if area["height"] < MIN_TOUCH_TARGET_PX or area["width"] < MIN_TOUCH_TARGET_PX:
            too_small.append((selector, area))
    assert not too_small, f"{kind}工具列按鈕可點範圍不足 44px：{too_small}"
    gaps = page.evaluate(
        """(sel) => {
          const r = [...document.querySelector(sel).children].map((c) => c.getBoundingClientRect());
          return r.slice(1).map((b, i) => Math.round(b.left - r[i].right));
        }""",
        TOOLBAR,
    )
    assert all(g >= 8 for g in gaps), f"{kind}工具列相鄰元件間距不足 8px（防誤觸）：{gaps}"


def test_withdrawal_toolbar_is_one_row_at_375px(admin_at_375):
    _assert_toolbar_one_row(admin_at_375, "提領管理")


def test_member_toolbar_is_one_row_at_375px(admin_at_375):
    _open_tab("會員管理")(admin_at_375)
    settle(admin_at_375)
    _assert_toolbar_one_row(admin_at_375, "會員管理")


def test_member_search_submit_reaches_44px_on_touch(admin_at_375):
    """內嵌在搜尋框裡的放大鏡是手機上看得到的送出入口（鍵盤的 Enter 常被收起）。"""
    _open_tab("會員管理")(admin_at_375)
    settle(admin_at_375)
    area = hit_area(admin_at_375, 'form button[type="submit"][aria-label="搜尋"]')
    assert area is not None and not area.get("centerMiss"), f"量不到放大鏡送出鈕（{area}）"
    assert area["width"] >= MIN_TOUCH_TARGET_PX and area["height"] >= MIN_TOUCH_TARGET_PX, (
        f"放大鏡送出鈕可點範圍 {area['width']}×{area['height']}px，不足 44px"
    )


def test_member_search_placeholder_is_not_truncated_at_375px(admin_at_375):
    """搜尋框放進工具列後被兩顆鈕夾著——placeholder 被截斷就是在說「這裡能搜什麼」只說一半。"""
    _open_tab("會員管理")(admin_at_375)
    settle(admin_at_375)
    fit = admin_at_375.evaluate(
        """() => {
          const input = document.querySelector('input[type="search"]');
          if (!input) return null;
          const cs = getComputedStyle(input);
          const ctx = document.createElement('canvas').getContext('2d');
          ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const text = ctx.measureText(input.placeholder).width;
          const room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          return { text: Math.ceil(text), room: Math.floor(room) };
        }"""
    )
    assert fit is not None, "找不到會員搜尋框"
    assert fit["text"] <= fit["room"], f"placeholder 要 {fit['text']}px，框內只有 {fit['room']}px"


# --- 工具列：真瀏覽器的名稱、桌機與觸控平板 -------------------------------------
#
# 按鈕的名稱跟 CSS 有關（sr-only、aria-labelledby），jsdom 算的跟 Chromium
# 不一樣（ui-ux-guidelines §9）——名稱斷言要在真瀏覽器上各斷點跑一次。

TOOLBAR_BUTTON_NAMES = ["重新整理", "下載 CSV（含身分證與帳號）"]


def _assert_toolbar_button_names(page, where: str):
    for name in TOOLBAR_BUTTON_NAMES:
        count = page.get_by_role("button", name=name, exact=True).count()
        assert count == 1, f"{where}找不到名稱恰為「{name}」的按鈕（{count} 個）"


def test_toolbar_button_names_at_375px(admin_at_375):
    _assert_toolbar_button_names(admin_at_375, "375px ")


def test_toolbar_is_one_labeled_row_on_desktop(page, context, api_mock, rest_mock):
    page.set_viewport_size({"width": 1280, "height": 800})
    _setup_admin(context, api_mock, rest_mock)
    page.goto("/admin")
    settle(page)
    _assert_toolbar_button_names(page, "1280px ")
    assert count_rows(page, TOOLBAR) == 1, "桌機工具列不在同一行"
    assert page.get_by_text("下載 CSV", exact=True).is_visible(), "桌機的 CSV 鈕應帶可見文字"


def test_toolbar_labels_are_not_squeezed_on_touch_tablet(admin_tablet_touch):
    """768px 觸控：`size="icon"` 的觸控 44px 寬會蓋掉 md 的 w-auto——帶文字的鈕不得被擠回 44px。"""
    page = admin_tablet_touch
    assert count_rows(page, TOOLBAR) == 1, "平板工具列不在同一行"
    squeezed = page.evaluate(
        """(sel) => [...document.querySelector(sel).querySelectorAll(':scope > button')]
              .filter((b) => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().height < 44)
              .map((b) => b.textContent)""",
        TOOLBAR,
    )
    assert squeezed == [], f"平板觸控下這些工具列按鈕被擠壓或不足 44px 高：{squeezed}"


# --- 會員詳情 Sheet（S4／A3） ------------------------------------------------
#
# 375px 下 Sheet 全螢幕、身分卡固定在上、分區內文捲動。測資是 `_setup_admin` 的
# 最壞資料（50 字無空白外文姓名、無空白長 Email、停權＋管理員、10 筆提領含長備註、
# 證件退回長理由）——短測資下「間距 0」「沒有橫向溢出」在改版前就是綠的。

MEMBER_SHEET_SECTIONS = ("帳號", "點數", "近期提領", "推薦關係", "敏感資料", "管理")

# 身分卡固定在上、不捲動，高度直接從內文的可視範圍扣掉（業主裁決 C：≤ 視窗 25%）。
MAX_IDENTITY_CARD_RATIO = 0.25

# 標題文字的實際右緣。h2 是區塊元素，盒子右緣只是內距邊界、永遠在關閉鈕左邊——量盒子
# 量不到「字有沒有鑽到關閉鈕底下」，要量文字本身（Range 的每一行）。
_TITLE_TEXT_RIGHT = """(sel) => {
  const title = document.querySelector(sel)?.querySelector('h2');
  if (!title) return null;
  const range = document.createRange();
  range.selectNodeContents(title);
  const rects = [...range.getClientRects()];
  return { right: Math.max(...rects.map((r) => r.right)), lines: new Set(rects.map((r) => Math.round(r.top))).size };
}"""


def _assert_title_clears_close_button(page):
    dialog = page.locator(DIALOG)
    text = page.evaluate(_TITLE_TEXT_RIGHT, DIALOG)
    close = dialog.get_by_role("button", name="關閉", exact=True).bounding_box()
    assert text is not None and close is not None, "量不到標題文字或關閉鈕"
    assert text["right"] <= close["x"], (
        f"標題文字右緣 {text['right']:.0f}px 超過關閉鈕左緣 {close['x']:.0f}px"
    )
    return text


def _assert_identity_card_fits(page):
    measured = page.evaluate(
        """(sel) => {
          const header = document.querySelector(sel)?.querySelector('[data-slot="sheet-header"]');
          return header ? { height: header.getBoundingClientRect().height, viewport: window.innerHeight } : null;
        }""",
        DIALOG,
    )
    assert measured is not None, "找不到身分卡（sheet-header）"
    limit = measured["viewport"] * MAX_IDENTITY_CARD_RATIO
    assert measured["height"] <= limit, (
        f"身分卡高 {measured['height']:.0f}px，超過視窗 {measured['viewport']}px 的 "
        f"{MAX_IDENTITY_CARD_RATIO:.0%}（{limit:.0f}px）"
    )


@pytest.fixture
def member_sheet_at_375(admin_at_375):
    _open_member_detail_sheet(admin_at_375)
    expect(admin_at_375.locator(DIALOG)).to_be_visible()
    settle(admin_at_375)
    return admin_at_375


@pytest.mark.compatibility
def test_member_detail_sheet_fills_the_screen_at_375px(member_sheet_at_375):
    fit = viewport_fit(member_sheet_at_375, DIALOG)
    assert fit is not None, f"找不到 {DIALOG}——Sheet 沒開起來，不是版面問題"
    assert fit["left"] == 0 and fit["right"] == 0, (
        f"Sheet 寬 {fit['width']}px、視窗寬 {fit['viewportWidth']}px，"
        f"左右間距 {fit['left']}px / {fit['right']}px（手機應全螢幕）"
    )


@pytest.mark.compatibility
def test_member_detail_sheet_section_headings_are_all_present_at_375px(member_sheet_at_375):
    """六個分區標題都在，而且內文有左右留白（Sheet 原語沒有內距，改版前貼邊）。

    `exact=True` 不可省：「帳號」「管理」以子字串比對會誤中其他字。
    """
    dialog = member_sheet_at_375.locator(DIALOG)
    for name in MEMBER_SHEET_SECTIONS:
        heading = dialog.get_by_role("heading", name=name, exact=True)
        expect(heading).to_be_visible()
        box = heading.bounding_box()
        assert box is not None and box["x"] >= MIN_SAFE_MARGIN_PX, (
            f"分區標題「{name}」離視窗左緣只有 {box and box['x']}px（期望 ≥ {MIN_SAFE_MARGIN_PX}px）"
        )


@pytest.mark.compatibility
def test_member_detail_sheet_has_no_horizontal_overflow_at_375px(member_sheet_at_375):
    """Sheet 與它裡面的捲動容器都不得橫向捲動——長 Email、長退件理由要換行，不是撐寬。"""
    overflowing = member_sheet_at_375.evaluate(
        """(sel) => {
          const root = document.querySelector(sel);
          if (!root) return null;
          return [root, ...root.querySelectorAll('*')]
            .filter((el) => {
              const ox = getComputedStyle(el).overflowX;
              return el === root || ox === 'auto' || ox === 'scroll';
            })
            .filter((el) => el.scrollWidth > el.clientWidth + 1)
            .map((el) => `${el.tagName.toLowerCase()} ${el.scrollWidth}>${el.clientWidth}`);
        }""",
        DIALOG,
    )
    assert overflowing is not None, f"找不到 {DIALOG}"
    assert overflowing == [], f"Sheet 內有橫向溢出的容器：{overflowing}"


@pytest.mark.compatibility
def test_member_detail_sheet_title_clears_the_close_button_at_375px(member_sheet_at_375):
    """長姓名不得鑽到右上角關閉鈕底下（關閉鈕實占右緣約 12–62px）。

    前提是姓名真的長到要折行——不折行時這條量不到 `wrap-anywhere` 與 `pr-16`。
    """
    text = _assert_title_clears_close_button(member_sheet_at_375)
    assert text["lines"] >= 2, "測資姓名沒有折行，量不到長姓名的避讓"


@pytest.mark.compatibility
def test_member_detail_identity_card_stays_within_a_quarter_of_the_screen_at_375px(
    member_sheet_at_375,
):
    """身分卡固定不捲，最壞資料下也不得吃掉超過視窗 25%（業主裁決 C）。"""
    _assert_identity_card_fits(member_sheet_at_375)


@pytest.mark.compatibility
def test_member_detail_sheet_close_button_stays_put_when_scrolled_at_375px(member_sheet_at_375):
    """內文捲到底，關閉鈕與身分卡仍在畫面上——做完管理動作不用捲回頂端才能關。"""
    page = member_sheet_at_375
    dialog = page.locator(DIALOG)
    manage = dialog.get_by_role("heading", name="管理", exact=True)
    manage.scroll_into_view_if_needed()
    settle(page)
    scrolled = page.evaluate(
        """(sel) => document.querySelector(sel)?.querySelector('section[aria-label="詳情內容"]')?.scrollTop ?? null""",
        DIALOG,
    )
    assert scrolled is not None and scrolled > 0, (
        f"內文沒有捲動（scrollTop={scrolled}）——測資不夠長，這條量不到東西"
    )
    close = dialog.get_by_role("button", name="關閉", exact=True).bounding_box()
    title = dialog.get_by_role("heading", level=2).bounding_box()
    heading = manage.bounding_box()
    viewport_height = page.evaluate("() => window.innerHeight")
    assert close is not None and close["y"] >= 0, f"捲到底後關閉鈕被捲出畫面（{close}）"
    assert title is not None and title["y"] >= 0, f"捲到底後身分卡被捲出畫面（{title}）"
    assert heading is not None and heading["y"] + heading["height"] <= viewport_height, (
        f"捲動後「管理」標題底緣 {heading and heading['y'] + heading['height']:.0f}px "
        f"仍在視窗 {viewport_height}px 之外"
    )


# 沒有姓名的會員：profiles.name 是 `not null default ''`，註冊 Step 2 之前是空字串。
# 標題改用 Email——無空白長 Email 要在關閉鈕左邊折行，身分卡仍要守 25%。
@pytest.fixture
def nameless_member_sheet_at_375(page, context, api_mock, rest_mock):
    page.set_viewport_size(MOBILE_VIEWPORT)
    _setup_admin(context, api_mock, rest_mock)
    # 覆寫列表後要重掛要點開的那位的詳情（列表的尾綴 glob 也吃得下詳情 URL，後掛的贏）。
    api_mock.set_admin_members(
        [
            build_admin_member(name=NAME_CJK_10, email="first@example.com", listingCount=3),
            build_admin_member(name="", email=LONG_EMAIL, id="mem-admin-2"),
        ]
    )
    route_admin_member_detail(
        context,
        "mem-admin-2",
        build_admin_member_detail(id="mem-admin-2", name="", email=LONG_EMAIL),
    )
    page.goto("/admin")
    settle(page)
    page.get_by_role("tab", name="會員管理").click()
    settle(page)
    page.get_by_role("button", name=f"查看 {LONG_EMAIL} 的詳情").click()
    expect(page.locator(DIALOG)).to_be_visible()
    settle(page)
    return page


@pytest.mark.compatibility
def test_nameless_member_sheet_titles_with_the_email_at_375px(nameless_member_sheet_at_375):
    """無名會員的標題就是 Email，文字不鑽到關閉鈕底下，身分卡守 25%。"""
    page = nameless_member_sheet_at_375
    title = page.locator(DIALOG).get_by_role("heading", level=2)
    expect(title).to_have_text(LONG_EMAIL)
    _assert_title_clears_close_button(page)
    _assert_identity_card_fits(page)


# --- 統計區的骨架（S5 階段 8，中途對照 P2-20） ------------------------------------
#
# 統計切回時是骨架、本次讀取確認後才出數字（業主裁決 A）。手機的摘要是一行 dl，換行
# 與否看寬度：375px 一行（46px）、320px 兩行（70px）。舊骨架是固定 h-14（56px），兩邊
# 都差 10–14px——數字落地那一刻，下面的作業面板與列表整個跳一下。jsdom 量不出高度，
# 只能在真瀏覽器裡比。提領與會員兩區同一個形狀（同類掃描漏掉會員區，實作審查補上）。

# 統計區的 aria-label → (所在分頁、列表骨架的名稱、扣住／放行列表的 mock 方法名)。
_STATS_SECTIONS = {
    "提領彙總": (None, "載入提領申請中", "admin_withdrawal_list"),
    "會員統計": ("會員管理", "載入會員列表中", "admin_member_list"),
}


def _summary_child_height(page, section: str) -> float:
    return page.evaluate(
        """(label) => {
          const child = document.querySelector(`section[aria-label="${label}"] > *`);
          return child ? child.getBoundingClientRect().height : -1;
        }""",
        section,
    )


@pytest.mark.compatibility
@pytest.mark.parametrize("section", list(_STATS_SECTIONS))
@pytest.mark.parametrize("width", [375, 320])
def test_admin_stats_skeleton_matches_the_summary_height(
    page, context, api_mock, rest_mock, width, section
):
    """手機統計區的骨架與確認後的摘要同高：數字落地時版面不跳。"""
    tab, skeleton_name, list_mock = _STATS_SECTIONS[section]
    page.set_viewport_size({"width": width, "height": 812})
    _setup_admin(context, api_mock, rest_mock)
    getattr(api_mock, f"hold_{list_mock}")()
    page.goto("/admin")
    if tab:
        _open_tab(tab)(page)
    expect(page.get_by_role("status", name=skeleton_name)).to_be_visible()
    skeleton = _summary_child_height(page, section)

    getattr(api_mock, f"release_{list_mock}")()
    expect(page.locator(f'section[aria-label="{section}"] > dl')).to_be_visible()
    summary = _summary_child_height(page, section)

    assert abs(skeleton - summary) <= 1, (
        f"{width}px 下「{section}」骨架 {skeleton}px、確認後的摘要 {summary}px——數字落地時"
        f"下面的內容跳 {abs(skeleton - summary)}px。骨架要跟摘要同形（同一個 dl、同樣會換行）。"
    )


# 佔位字取典型寬度（六位數待匯款）；七位數時摘要可能多換一行（業主 R7：補量測，若多換行就把佔位放寬到同高）。
@pytest.mark.compatibility
@pytest.mark.parametrize("width", [375, 320])
def test_admin_stats_skeleton_matches_a_seven_digit_summary(
    page, context, api_mock, rest_mock, width
):
    """待匯款總額到七位數時，手機統計骨架仍與摘要同高。"""
    page.set_viewport_size({"width": width, "height": 812})
    _setup_admin(context, api_mock, rest_mock)
    api_mock.set_admin_withdrawals([build_admin_withdrawal(status="pending", amount=1_234_567)])
    api_mock.hold_admin_withdrawal_list()
    page.goto("/admin")
    expect(page.get_by_role("status", name="載入提領申請中")).to_be_visible()
    skeleton = _summary_child_height(page, "提領彙總")

    api_mock.release_admin_withdrawal_list()
    summary_row = page.locator('section[aria-label="提領彙總"] > dl')
    expect(summary_row).to_contain_text("1,234,567")
    summary = _summary_child_height(page, "提領彙總")

    assert abs(skeleton - summary) <= 1, (
        f"{width}px 下七位數待匯款：骨架 {skeleton}px、摘要 {summary}px——數字落地時下面的內容跳 "
        f"{abs(skeleton - summary)}px。佔位字要放寬到七位數也同高。"
    )
