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
