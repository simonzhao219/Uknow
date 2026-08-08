"""GUI 登入必須先清掉既有 session——離線的原始碼結構守衛。

## 這支守衛在防什麼

journey 有多個情境會在**同一個情境內以不同身分連續登入**：f50 的
「完整生命週期」是 會員申請 → 管理員標記已匯款 → 會員查收，三次登入共用
同一個 `guarded_page`。而 `page` fixture 是 function-scoped，**跨情境**會換
新 context（乾淨），**情境內**則是同一個 context——localStorage 裡的 session
會留到下一次登入。

此時 `login_via_gui` 的 `page.goto("/login")` 會被前端的「已登入自動導向」
彈走，`auth-login-button` 永遠不出現，測試停在 timeout。症狀是登入逾時，
根因是 session 沒清。

## 為什麼需要機械守衛而不是靠記得

這個修法**曾經被做出來過又沒有推廣**：f70 最早撞到，就地寫了
`_fresh_gui_login`（清 storage 再登入），docstring 甚至把機制講得很清楚
（「不清的話 /login 的『已登入自動導向』會把第二次登入直接彈走」），
但那個認知留在 f70 的私有 helper 裡，共用的 `builders/login.py` 沒有跟著改。
於是 f15/f50/f60 繼續用不清 session 的版本，繼續逾時。

**「同一個 bug 修過一次卻又發生」的成本，遠高於一支結構守衛。**

## 為什麼是原始碼檢查而不是行為測試

行為測試要跑 journey，而 journey 只在 CI 的拋棄式分支上跑（見
`.claude/rules/e2e-tests.md`）——本機驗不了，紅燈也要等 30–90 分鐘。
「登入前有沒有清 session」是**靜態看得出來的結構性質**，適合用原始碼守衛，
與 `scripts/check-ime-safe-inputs.py` 同一個取捨。
"""

from __future__ import annotations

import re
from pathlib import Path

JOURNEY_ROOT = Path(__file__).resolve().parent.parent
LOGIN_BUILDER = JOURNEY_ROOT / "builders" / "login.py"
STEPS_DIR = JOURNEY_ROOT / "steps"

# 清 session 的兩種寫法都認（清哪個 storage 都算）。
CLEARS_SESSION = re.compile(r"(localStorage|sessionStorage)\s*\.\s*clear\s*\(\s*\)")
GOTO_LOGIN = re.compile(r"""goto\(\s*["']/login["']\s*\)""")


def _login_via_gui_source() -> str:
    """挖出 login_via_gui 的函式本體（到下一個 top-level def 為止）。"""
    source = LOGIN_BUILDER.read_text(encoding="utf-8")
    start = source.index("def login_via_gui(")
    rest = source[start + 1 :]
    match = re.search(r"^def ", rest, re.MULTILINE)
    return rest[: match.start()] if match else rest


def test_login_via_gui_clears_session_before_navigating_to_login():
    """共用登入 builder 必須自己清 session——不能把責任推給呼叫端。

    這條是本守衛的核心。放在 builder 裡，37 個呼叫點就一次到位；
    放在呼叫端，就會像 2026-08-07 那樣只有 f70 記得做。
    """
    body = _login_via_gui_source()
    assert CLEARS_SESSION.search(body), (
        "login_via_gui 沒有清掉既有 session。同一情境內第二次登入時，"
        "/login 會因『已登入自動導向』把使用者彈走，auth-login-button "
        "永遠不出現，測試停在 timeout。"
    )


def test_session_is_cleared_before_goto_login_not_after():
    """順序不能顛倒：先清再導頁。

    反過來寫（先 goto /login 再清）沒有意義——導頁當下就已經被彈走了，
    清完 storage 也回不到登入頁。這條抓的是「看起來有做」的假修法。
    """
    body = _login_via_gui_source()
    clear_at = CLEARS_SESSION.search(body)
    goto_at = GOTO_LOGIN.search(body)
    assert clear_at and goto_at, "login_via_gui 應同時有清 session 與 goto('/login')"
    assert clear_at.start() < goto_at.start(), (
        "清 session 必須在 goto('/login') 之前——順序反了等於沒做。"
    )


def test_no_step_file_reimplements_its_own_clear_then_login():
    """步驟檔不得自己再寫一份「清 session 再登入」。

    2026-08-07 的根因就是這個形狀:f70 有私有版本、共用 builder 沒有，
    兩邊行為不一致而沒有人發現。修好之後責任在 builder 一處,步驟檔再
    出現同樣的組合就是又要開始漂了。
    """
    offenders = []
    for path in sorted(STEPS_DIR.glob("*.py")):
        source = path.read_text(encoding="utf-8")
        if CLEARS_SESSION.search(source):
            offenders.append(path.name)
    assert not offenders, (
        f"這些步驟檔自己清了 session：{offenders}。"
        "清 session 的責任在 builders/login.py 的 login_via_gui 一處——"
        "步驟檔各自實作會重演『只有一個檔案記得做』的漂移。"
    )
