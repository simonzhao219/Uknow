"""既有會員的 GUI 登入——20_ 之後的斷言情境以各節點身分看自己的頁面。"""

from __future__ import annotations

from playwright.sync_api import Page, expect

from pages.auth_page import AuthPage
from run_state import JourneyUser


def login_via_gui(page: Page, user: JourneyUser, wait_for: str | None = "會員中心") -> None:
    auth = AuthPage(page)
    page.goto("/login")
    auth.fill_email(user.email)
    auth.submit_email()
    expect(page.get_by_test_id("auth-login-button")).to_be_visible()
    auth.fill_login_password(user.password)
    auth.submit_login()
    if wait_for:
        expect(page.get_by_role("heading", name=wait_for)).to_be_visible(timeout=30_000)
    else:
        # 未完成付款的帳號（如管理員）登入後不會落在會員中心——只等
        # 登入表單消失，落點交給呼叫端。
        expect(page.get_by_test_id("auth-login-button")).to_be_hidden(timeout=30_000)


def login_admin(page: Page, admin_user: JourneyUser) -> None:
    """管理員登入並進入 /admin（AdminRoute 只驗 is_admin，不擋未付款）。"""
    login_via_gui(page, admin_user, wait_for=None)
    page.goto("/admin")
    expect(page.get_by_role("heading", name="平台管理")).to_be_visible(timeout=30_000)
