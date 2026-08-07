"""既有會員的 GUI 登入——20_ 之後的斷言情境以各節點身分看自己的頁面。"""

from __future__ import annotations

from playwright.sync_api import Page, expect

from pages.auth_page import AuthPage
from run_state import JourneyUser


def login_via_gui(page: Page, user: JourneyUser) -> None:
    """登入並在「登入成功」後返回；落點交給呼叫端自行 goto／斷言。

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
