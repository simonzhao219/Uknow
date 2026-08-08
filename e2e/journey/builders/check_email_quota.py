"""check-email 每 IP 限流(10 次 / 5 分)的測試側配額管理。

**正式碼的限流不動。** 它是帳號枚舉防線(`POST /auth/check-email` 回的
`{exists}` 本身就是一個位元),把它調鬆等於在測試裡驗一個線上不存在的
系統。要處理的是測試環境的前提:整套 journey 從 runner 的**同一個 IP**
出發,那 10 次配額是**全 session 共用**的。

既有的重置有三處——`steps/conftest.py` 的 per-scenario autouse、
`org_builder` 的建樹波次之間、`f70` 的 `_ensure_actor`。它們保證的都是
「情境**開頭**有配額」,保不住「情境跑到一半用完」:`login_via_gui` 有
37 個呼叫點、一個情境內連續換身分登入好幾次是常態(f50 的完整生命週期
是 會員 → 管理員 → 會員 三次登入)。

用完之後的症狀完全指不回限流:429 在前端只變成一個**會自己消失的
toast**(`AuthPage.tsx` 的 catch → showToast),畫面停在步驟 1,於是測試
看到的是 `auth-login-button 不出現`——和「登入頁根本沒載入」「帳號不
存在」長得一模一樣。2026-08-04 run 30944836300 有 12 個情境死在這個
症狀上,首因全是 check-email 429。

所以把處理收斂到**唯一會消耗配額的動作**旁邊(見 `auth_gate.py`),
而且**只在畫面真的出現限流訊息時才重試**——盲目重試會把產品的真失敗
一起吞掉,那比紅燈更糟。
"""

from __future__ import annotations

# 前端把 429 的 body 原樣接進 toast:
# `檢查 Email 時發生錯誤：API returned 429: {"error":"請求過於頻繁，請稍後再試"}`
# 兩個標記都比對,是因為 toast 文案與後端訊息各自可能改;任一命中就算數。
RATE_LIMIT_MARKERS = ("429", "請求過於頻繁")

_admin = None


def bind(admin) -> None:
    """由 `steps/conftest.py` 的 autouse fixture 綁定 session 級的 admin。

    走模組級綁定而不是把 admin 一路傳進 `login_via_gui`:那條路上有 37 個
    呼叫點,任何一個忘了傳就退回今天這個症狀。`supabase_admin` 本來就是
    session-scoped 單例,綁定不會引入新的生命週期。
    """
    global _admin
    _admin = admin


def reset() -> None:
    """清掉 check-email 的固定窗口計數。未綁定時靜默跳過(離線測試)。"""
    if _admin is not None:
        _admin.reset_check_email_rate_limit()


def looks_rate_limited(text: str) -> bool:
    return any(marker in text for marker in RATE_LIMIT_MARKERS)
