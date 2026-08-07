"""推薦網絡（懶載入縮排樹）的 GUI 互動——對齊 ReferralTreeView 的契約。

UI 於 Tier B 重構後不再有「一代/二代/三代」世代區塊：root 列＝檢視者
的第一代，每列的 chevron（aria-label「展開」）載入下一代；世代 >= 3 的
節點沒有展開鈕（第四代結構性不可見）。世代人數統計改由 ReferralStats
卡片承載。舊步驟點「二代/三代」區塊標頭的作法在新 UI 上會撞
ReferralStats 的同文字節點（strict mode violation，2026-08-04 run
30944836300）——樹的互動一律收斂到這裡。
"""

from __future__ import annotations

from playwright.sync_api import Page, expect

from run_state import RunState


def wait_tree(page: Page) -> None:
    """推薦頁載入完成＝樹容器可見（檢視者有下線的情境適用）。"""
    expect(page.get_by_role("tree", name="我的推薦網絡")).to_be_visible(timeout=15_000)


def _row(page: Page, name: str):
    # NodeRow 的 aria-label 固定為「{姓名} 詳情」，姓名由 run_id 導出、全樹唯一
    return page.get_by_role("treeitem", name=f"{name} 詳情")


def expand_node(page: Page, name: str) -> None:
    row = _row(page, name)
    expect(row).to_be_visible(timeout=15_000)
    row.get_by_role("button", name="展開").click()
    # 懶載入 skeleton 消失＝子代已渲染
    expect(page.get_by_test_id("children-loading")).to_have_count(0, timeout=15_000)


def expand_ancestors(
    page: Page,
    org_nodes: dict[str, str | None],
    state: RunState,
    viewer: str,
    target: str,
) -> None:
    """把 viewer 視角下 target 的祖先鏈由淺到深逐層展開（不含兩端）。

    例：viewer=A0、target=D8 → 依 orgchart 走出 D8→C7→B3，展開 B3 再
    展開 C7，D8 即可見。"""
    chain: list[str] = []
    cur = org_nodes.get(target)
    while cur is not None and cur != viewer:
        chain.append(cur)
        cur = org_nodes.get(cur)
    for ancestor in reversed(chain):
        expand_node(page, state.users[ancestor].name)
