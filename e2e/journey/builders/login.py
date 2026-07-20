"""既有會員的 GUI 登入——20_ 之後的斷言情境以各節點身分看自己的頁面。"""

from __future__ import annotations

from playwright.sync_api import Page, expect

from pages.auth_page import AuthPage
from run_state import JourneyUser


def login_via_gui(page: Page, user: JourneyUser) -> None:
    auth = AuthPage(page)
    page.goto("/login")
    auth.fill_email(user.email)
    auth.submit_email()
    expect(page.get_by_test_id("auth-login-button")).to_be_visible()
    auth.fill_login_password(user.password)
    auth.submit_login()
    expect(page.get_by_role("heading", name="會員中心")).to_be_visible(timeout=30_000)
