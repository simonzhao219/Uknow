"""`ResetPasswordPage.tsx` — sets a new password. Only reachable with a valid
recovery session (established by a successful recovery `verifyOtp`); mounting
without one bounces back to /forgot-password."""

from playwright.sync_api import Page

from pages.base_page import BasePage


class ResetPasswordPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    def set_passwords(self, password: str, confirm_password: str) -> "ResetPasswordPage":
        self.page.get_by_label("新密碼", exact=True).fill(password)
        self.page.get_by_label("確認新密碼", exact=True).fill(confirm_password)
        return self

    def submit(self) -> "ResetPasswordPage":
        self.page.get_by_role("button", name="確認並重設密碼").click()
        return self
