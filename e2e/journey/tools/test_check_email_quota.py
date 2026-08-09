"""check-email 限流自癒的離線守衛。

## 在防什麼

`builders/auth_gate.py` 只在**畫面上真的出現限流訊息**時才重置配額並重試
——刻意不盲目重試,否則產品的真失敗會被一起吞掉。代價是這條自癒鏈有
三個環節,任何一環悄悄改掉都會讓它靜默失效,而症狀退回「auth-login-button
不出現」這種指不出原因的逾時:

1. 後端 429 的訊息文字(`index.ts` 的 check-email 限流分支)
2. 前端把狀態碼與 body 接進 toast(`AuthPage.tsx` 的 catch)
3. `check_email_quota.RATE_LIMIT_MARKERS` 要對得上前兩者

「靜默失效」正是這個專案反覆吃虧的形狀,所以三環都在這裡釘住:**不抄
常數,直接讀來源比對**(同 `test_listing_name.py` 讀 `NAME_MAX_LENGTH`、
`test_name_mask.py` 讀 `index.ts` 的做法)。

## 為什麼是原始碼檢查

行為驗證需要真的把配額打爆,那只在 CI 的拋棄式分支上跑得動(見
`.claude/rules/e2e-tests.md`),紅燈要等 30-90 分鐘。這三件事都是靜態
看得出來的性質,與 `test_login_session_isolation.py` 同一個取捨。
"""

from __future__ import annotations

import re
from pathlib import Path

from builders import check_email_quota

REPO_ROOT = Path(__file__).resolve().parents[3]
API_INDEX = REPO_ROOT / "supabase" / "functions" / "api" / "index.ts"
AUTH_PAGE = REPO_ROOT / "src" / "components" / "AuthPage.tsx"
JOURNEY_ROOT = Path(__file__).resolve().parents[1]
LOGIN_BUILDER = JOURNEY_ROOT / "builders" / "login.py"
REGISTRATION_BUILDER = JOURNEY_ROOT / "builders" / "registration.py"

GATE_CALL = "submit_email_and_expect"


def _check_email_handler() -> str:
    """截出 `POST /auth/check-email` 的處理函式原始碼。

    必須先切出這一段再找 429——`index.ts` 裡不只一個限流分支,整檔搜尋
    會抓到別的端點的訊息,那時這支測試看起來仍然綠,卻在保護錯的字串。
    """
    source = API_INDEX.read_text(encoding="utf-8")
    start = source.index("app.post('/auth/check-email'")
    end = source.index("app.", start + 1)
    return source[start:end]


def test_handler_extraction_finds_the_rate_limit_branch():
    """先證明抽取有效——抽不到東西時下面兩條會空轉成假綠。"""
    handler = _check_email_handler()
    assert "bump_rate_limit" in handler, (
        "抽出來的 check-email 處理函式裡沒有 bump_rate_limit——"
        "端點結構變了,這支測試的抽取式要跟著改"
    )
    assert "429" in handler


def test_markers_match_the_backend_429_message():
    """後端 429 的訊息必須被 RATE_LIMIT_MARKERS 認得。"""
    handler = _check_email_handler()
    message = re.search(r"error:\s*'([^']+)'\s*\}\s*,\s*429", handler)
    assert message, f"找不到 check-email 的 429 訊息字面值：\n{handler[-400:]}"

    text = message.group(1)
    assert check_email_quota.looks_rate_limited(text), (
        f"後端限流訊息「{text}」不再被 RATE_LIMIT_MARKERS "
        f"{check_email_quota.RATE_LIMIT_MARKERS} 認出——"
        "auth_gate 的自癒會靜默失效,退回讀不出死因的逾時"
    )


def test_frontend_toast_carries_the_status_code():
    """前端必須把 HTTP 狀態碼帶進 toast,`429` 這個標記才成立。

    後端訊息可能被改寫成不含關鍵字的文案;狀態碼是另一半防線,兩個標記
    任一命中即可。少了它,標記就只剩單點。
    """
    source = AUTH_PAGE.read_text(encoding="utf-8")
    assert "API returned ${response.status}" in source, (
        "AuthPage 的 check-email 失敗路徑不再把 response.status 帶進錯誤訊息"
        "——RATE_LIMIT_MARKERS 的 '429' 這一半失效了"
    )


def test_login_and_registration_share_one_step2_gate():
    """登入與註冊的步驟 1→2 等待只能有一個實作。

    兩邊各寫一次的話,補在一邊的防線另一邊不會有——交接文件記的
    「兩份做同一件事的東西默默分岔」就是這個形狀(f60 用 pay_via_gui、
    f70 用 pay_fresh_via_gui 那次)。
    """
    for builder in (LOGIN_BUILDER, REGISTRATION_BUILDER):
        source = builder.read_text(encoding="utf-8")
        assert GATE_CALL in source, (
            f"{builder.name} 沒有走 {GATE_CALL}——步驟 1 的送出與等待又分岔了"
        )
        assert "auth.submit_email()" not in source, (
            f"{builder.name} 自己呼叫了 auth.submit_email()——"
            f"送出 email 這件事只該經過 {GATE_CALL},否則限流自癒繞不到"
        )
