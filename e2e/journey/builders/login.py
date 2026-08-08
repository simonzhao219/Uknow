"""既有會員的 GUI 登入——20_ 之後的斷言情境以各節點身分看自己的頁面。"""

from __future__ import annotations

from playwright.sync_api import Page, expect

from pages.auth_page import AuthPage
from run_state import JourneyUser


def login_via_gui(page: Page, user: JourneyUser) -> None:
    """清掉既有 session 後登入；落點交給呼叫端自行 goto／斷言。

    **一定要先清 session。** `page` fixture 是 function-scoped，跨情境會換
    新 context（乾淨），但**情境內是同一個 context**——而多個情境會在一個
    情境裡以不同身分連續登入（f50 的「完整生命週期」是 會員申請 → 管理員
    標記已匯款 → 會員查收，三次登入共用同一個 guarded_page）。不清的話，
    第二次的 `goto("/login")` 會被前端的「已登入自動導向」彈走，
    `auth-login-button` 永遠不出現，測試停在 timeout。

    這件事 f70 最早撞到並就地寫了 `_fresh_gui_login`，但那個認知留在私有
    helper 裡沒有推廣回這裡，於是 f15/f50/f60 繼續逾時（2026-08-07 的
    journey-full：19 failed 裡有 4 條直接死在 auth-login-button，其餘多為
    下游連鎖）。修法放在這裡而不是各呼叫端，是因為 37 個呼叫點只要有一個
    忘記，就會重演同一件事。結構守衛見 `tools/test_login_session_isolation.py`。

    登入成功的**唯一通用信號＝登入表單消失**（auth-login-button
    hidden）。刻意不硬等「會員中心」heading：登入後的落點由會籍狀態
    決定，不是所有人都落會員中心——

      - active 會員        → 會員中心
      - 曾有訂閱、已過期    → /payment/checkout（續約，見前端
                             resolveMembershipRedirect）
      - 未付款 / 管理員     → 付款頁 / 完善資料 / 直接放行

    舊版預設硬等「會員中心」heading，對被時光機推過期的會員必然
    30 秒逾時（2026-08-07 run 31138743448：f60/f50 共 8 個情境全死
    在這——check-email 限流修好後才第一次走到登入之後，暴露這個
    一直被掩蓋的落點假設錯誤）。
    """
    # 先落到同源頁面才碰得到 storage（about:blank 上 localStorage 會擲例外），
    # 再清、再導去 /login——順序顛倒等於沒清：導頁當下就已經被彈走了。
    page.goto("/")
    page.evaluate("window.localStorage.clear(); window.sessionStorage.clear()")

    auth = AuthPage(page)
    page.goto("/login")
    auth.fill_email(user.email)
    auth.submit_email()
    expect(page.get_by_test_id("auth-login-button")).to_be_visible()
    auth.fill_login_password(user.password)
    auth.submit_login()
    expect(page.get_by_test_id("auth-login-button")).to_be_hidden(timeout=30_000)


def login_admin(page: Page, admin_user: JourneyUser) -> None:
    """管理員登入並進入 /admin（AdminRoute 只驗 is_admin，不擋未付款）。"""
    login_via_gui(page, admin_user)
    page.goto("/admin")
    expect(page.get_by_role("heading", name="平台管理")).to_be_visible(timeout=30_000)
