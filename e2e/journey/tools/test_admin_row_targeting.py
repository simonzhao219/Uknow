"""管理台提領動作的鎖定與後置條件——離線的原始碼結構守衛。

## 在防什麼

**同一個假設已經咬過兩次**:

1. 最早是 `.first`(清單第一列)。2026-08-08 run 31235468231 破在 f70 第 6 章
   ——退件退到了別人的申請,K0 那筆還留著 pending,fresh 選項沒解封。
2. 改成「以會員鎖定」之後又破一次。run 31265631149:同一個會員在這張表上
   本來就會有好幾列(申請過幾次就有幾列),前一個情境留下一筆 pending,
   下一個情境再申請一筆 → 兩列都可退件 → strict mode violation。

兩次都是**假設某個鍵唯一,而沒有任何東西保證它唯一**。修法是補一把結構性的
第二鑰匙(「該列真的提供這個動作」),與 S1 給推薦樹補 `aria-level` 同形。

另一半是**後置條件**:送出動作後不確認產品的完成回報,後端把轉換擋掉時會
靜默通過,紅燈落到下游看不出關聯的斷言上(run 31263854444 的「點數未退回」
就有這個可能)。

## 為什麼是原始碼檢查

行為驗證要跑 journey,只在 CI 的拋棄式分支上跑得動(見
`.claude/rules/e2e-tests.md`),紅燈要等 30-90 分鐘。「有沒有用位置選取」與
「有沒有等完成回報」都是靜態看得出來的性質,與
`test_login_session_isolation.py` 同一個取捨。
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
ADMIN_PAGE = REPO_ROOT / "e2e" / "pages" / "admin_dashboard_page.py"
WITHDRAWAL_UI = REPO_ROOT / "src" / "components" / "admin" / "WithdrawalManagement.tsx"

# 金錢狀態轉換:送出之後必須確認它真的落地。
MONEY_ACTIONS = ("mark_withdrawal_paid", "reject_withdrawal")
LANDED_CHECK = "_expect_action_landed"

# 位置選取——正是這支守衛要擋掉的東西。
POSITIONAL = re.compile(r"\.(first|last)\b|\.nth\(")


def _method(name: str) -> str:
    tree = ast.parse(ADMIN_PAGE.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return ast.get_source_segment(ADMIN_PAGE.read_text(encoding="utf-8"), node)
    raise AssertionError(f"admin_dashboard_page.py 沒有 {name}——守衛的抽取式要跟著改")


def test_money_actions_exist():
    """先證明抽取有效——抽不到方法時下面兩條會空轉成假綠。"""
    for name in MONEY_ACTIONS:
        assert "def " in _method(name)


def test_money_actions_do_not_select_rows_by_position():
    for name in MONEY_ACTIONS:
        source = _method(name)
        assert not POSITIONAL.search(source), (
            f"{name} 用了位置選取(.first/.last/.nth)——同一個會員在提領管理上"
            "會有好幾列,位置不是可靠的鍵。用 _actionable_row_of 的兩把鑰匙"
            "(會員 + 該列真的提供這個動作)"
        )


def test_money_actions_wait_for_the_products_own_confirmation():
    for name in MONEY_ACTIONS:
        source = _method(name)
        assert LANDED_CHECK in source, (
            f"{name} 送出後沒有確認動作落地——後端擋掉這次轉換時會靜默通過,"
            "紅燈會落到下游看不出關聯的斷言上"
        )


def test_landed_labels_match_the_product():
    """後置條件比對的字串必須真的是產品會顯示的那一串。

    它是 `WithdrawalManagement.tsx` 的 `ACTION_DONE`。改了文案而這裡沒跟上,
    後置條件會從「確認落地」退化成「必定逾時」——一樣是紅的,但要等 30-90
    分鐘才知道,而且死因指向錯的地方。
    """
    ui = WITHDRAWAL_UI.read_text(encoding="utf-8")
    block = re.search(r"const ACTION_DONE[^=]*=\s*\{(.+?)\}", ui, re.S)
    assert block, "WithdrawalManagement.tsx 找不到 ACTION_DONE——抽取式要跟著改"
    labels = set(re.findall(r"'([^']+)'", block.group(1)))
    assert labels, f"ACTION_DONE 抽不出任何文案：{block.group(1)[:200]}"

    page_source = ADMIN_PAGE.read_text(encoding="utf-8")
    for name, expected in (
        ("mark_withdrawal_paid", "已標記匯款完成"),
        ("reject_withdrawal", "已退件"),
    ):
        assert expected in labels, (
            f"ACTION_DONE 已經沒有「{expected}」這串文案（現有：{sorted(labels)}）"
            f"——{name} 的後置條件對不上產品了"
        )
        assert expected in page_source, (
            f"admin_dashboard_page.py 沒有用「{expected}」比對 {name} 的完成回報"
        )


# --- 列表載入完成的等待 ---------------------------------------------------
#
# 2026-09-26 排程 run 36269079479 的 f50:管理台提領列表是**掛載時一次性**
# 抓取(WithdrawalManagement 的 fetchWithdrawals),載入中顯示骨架。`_actionable_row_of`
# 舊版直接對 0 列的表格套 5 秒的 expect 預設逾時——同一份 log 的下一個情境
# (暖機後)也是輪詢 6 次、約 3 秒才看到列,5 秒的餘裕本來就薄;第一次(冷)
# 超過就紅,而且畫面是「骨架還在」「抓取失敗」「真的空」中的哪一個,舊訊息
# 一個字都沒留下。

LIST_SETTLE = "_wait_list_settled"


def test_actionable_row_waits_for_the_list_to_settle():
    source = _method("_actionable_row_of")
    assert LIST_SETTLE in source, (
        "_actionable_row_of 沒有先等列表載入完成——列表是掛載時一次性抓取,"
        "對還在顯示骨架的表格套 5 秒預設逾時,冷啟動時必紅"
    )


def test_list_state_labels_match_the_product():
    """列表三態(載入中／失敗／空)的辨識字串必須是產品真的會顯示的。

    對不上時 `_wait_list_settled` 會退化成「骨架永遠找不到 → 立刻放行」或
    「空狀態永遠等不到 → 必定逾時」,兩種都比沒有這道等待更難讀。
    """
    ui = WITHDRAWAL_UI.read_text(encoding="utf-8")
    page_source = ADMIN_PAGE.read_text(encoding="utf-8")
    for label in ("載入提領申請中", "目前沒有提領申請", "重試"):
        assert label in ui, f"WithdrawalManagement.tsx 已經沒有「{label}」——等待條件對不上產品了"
        assert label in page_source, f"admin_dashboard_page.py 沒有用「{label}」辨識列表狀態"


# --- 背景更新（S5） -------------------------------------------------------
#
# S5 之後切回分頁與寫入後的重讀是**背景更新**：表格留在畫面上、骨架不出現，列表區
# （`<section aria-label="提領申請列表">`）帶 `aria-busy`。只等骨架消失的話會在更新途中
# 放行，對著即將被換掉的列動作。行為由 `e2e/test_admin_dashboard_page.py` 在 mock 下
# 驗；這裡守住兩端的字串對得上——對不上時等待會退化成「找不到列表區 → 立刻放行」。

LIST_REGION = "提領申請列表"


def test_list_settle_waits_out_background_refreshes():
    source = _method(LIST_SETTLE)
    assert "aria-busy" in source, (
        "_wait_list_settled 沒有等列表區的 aria-busy——背景更新時表格留著、骨架不出現,"
        "只等骨架會在更新途中放行"
    )


def test_list_region_name_matches_the_product():
    ui = WITHDRAWAL_UI.read_text(encoding="utf-8")
    page_source = ADMIN_PAGE.read_text(encoding="utf-8")
    assert f'aria-label="{LIST_REGION}"' in ui, (
        f"WithdrawalManagement.tsx 的列表區已經不叫「{LIST_REGION}」——等待條件對不上產品了"
    )
    assert LIST_REGION in page_source, f"admin_dashboard_page.py 沒有以「{LIST_REGION}」找列表區"
