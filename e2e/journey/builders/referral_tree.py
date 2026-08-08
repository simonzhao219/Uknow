"""推薦網絡（懶載入縮排樹）的 GUI 互動——對齊 ReferralTreeView 的契約。

UI 於 Tier B 重構後不再有「一代/二代/三代」世代區塊：root 列＝檢視者
的第一代，每列的 chevron（aria-label「展開」）載入下一代；世代 >= 3 的
節點沒有展開鈕（第四代結構性不可見）。世代人數統計改由 ReferralStats
卡片承載。舊步驟點「二代/三代」區塊標頭的作法在新 UI 上會撞
ReferralStats 的同文字節點（strict mode violation，2026-08-04 run
30944836300）——樹的互動一律收斂到這裡。

**節點一律用「顯示名 + 代數」兩把鑰匙定位，不是用真名。** 兩者缺一不可：

- 顯示名：`/referrals/network/*` 對 gen >= 2 的姓名做隱私遮罩
  （`maskNameByGen`），拿真名去比對 `aria-label` 永遠對不上，會以 15 秒
  逾時收場（2026-08-08 run 31235468231 的 f20/f60 兩敗即此因）；
- 代數：遮罩只留首尾字，journey 的姓名尾字是節點編號，於是 C7 與 D7
  遮成同一個字串。只用顯示名會撞上 Playwright 的 strict mode。
  `aria-level` 把範圍收斂到單一代，而同一代之內遮罩後仍唯一
  （`tools/test_name_mask.py` 鎖住這個不變式）。
"""

from __future__ import annotations

from playwright.sync_api import Locator, Page, expect

from run_state import RunState
from tools import orgchart
from tools.name_mask import masked_name

TREE_TIMEOUT_MS = 15_000


def wait_tree(page: Page) -> None:
    """推薦頁載入完成＝樹容器可見（檢視者有下線的情境適用）。"""
    expect(page.get_by_role("tree", name="我的推薦網絡")).to_be_visible(timeout=TREE_TIMEOUT_MS)


def tree_row(page: Page, real_name: str, gen: int) -> Locator:
    """真名為 `real_name`、位於第 `gen` 代的那一列（見模組 docstring 的兩把鑰匙）。"""
    # NodeRow 的 aria-label 固定為「{顯示名} 詳情」，aria-level 固定為代數。
    return page.get_by_role("treeitem", name=f"{masked_name(real_name, gen)} 詳情").and_(
        page.locator(f'[aria-level="{gen}"]')
    )


def expand_node(page: Page, real_name: str, gen: int) -> None:
    row = tree_row(page, real_name, gen)
    expect(row).to_be_visible(timeout=TREE_TIMEOUT_MS)
    row.get_by_role("button", name="展開").click()
    # 懶載入 skeleton 消失＝子代已渲染
    expect(page.get_by_test_id("children-loading")).to_have_count(0, timeout=TREE_TIMEOUT_MS)


def expand_ancestors(
    page: Page,
    org_nodes: dict[str, str | None],
    state: RunState,
    viewer: str,
    target: str,
) -> None:
    """把 viewer 視角下 target 的祖先鏈由淺到深逐層展開（不含兩端）。

    例：viewer=A0、target=D8 → 依 orgchart 走出 [B3, C7]，展開 B3 再展開
    C7，D8 即可見。"""
    for gen, ancestor in enumerate(orgchart.ancestor_chain(org_nodes, viewer, target), start=1):
        expand_node(page, state.users[ancestor].name, gen)


def expect_node(
    page: Page,
    org_nodes: dict[str, str | None],
    state: RunState,
    viewer: str,
    target: str,
) -> None:
    """target 以「該代應有的顯示名」出現在樹上的正確層級。

    刻意不用 `get_by_text(真名)`：那既比對錯字串，也分不清樹上的列與
    AttentionBanner 裡的同名 chip。"""
    gen = orgchart.generation_of(org_nodes, viewer, target)
    expect(tree_row(page, state.users[target].name, gen)).to_be_visible(timeout=TREE_TIMEOUT_MS)


def expect_three_generation_ceiling(page: Page) -> None:
    """三代邊界：第三代已渲染、沒有第四代列、第三代也沒有展開鈕。

    **先斷言第三代「存在過」再斷言第四代「不存在」**——樹根本沒展開時
    「沒有第四代」同樣會通過，那是空洞斷言。這裡取代的舊斷言（「頁面上不出現
    E1 的姓名」）正是空洞的：E1 是第四代，姓名遮罩之後它的**原名**本來就
    永遠不會出現，第四代真的漏出來時它也照樣綠。

    第三個斷言（沒有展開鈕）把「此刻沒有第四代」升級成「第四代到不了」：
    ReferralTreeView 的 `expandable = generation < 3 && childCount > 0`。
    """
    third = page.locator('[role="treeitem"][aria-level="3"]')
    expect(third.first).to_be_visible(timeout=TREE_TIMEOUT_MS)
    expect(page.locator('[role="treeitem"][aria-level="4"]')).to_have_count(0)
    expect(third.get_by_role("button", name="展開")).to_have_count(0)
