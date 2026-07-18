"""`ForgotPasswordPage.tsx` — collects an email and triggers a recovery OTP.
Reached directly at /forgot-password (email input shown) or from the login
page with the email prefilled (read-only block + "更改 Email")."""

from playwright.sync_api import Locator, Page

from pages.base_page import BasePage


class ForgotPasswordPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    def fill_email(self, email: str) -> "ForgotPasswordPage":
        self.page.get_by_label("Email", exact=True).fill(email)
        return self

    def submit(self) -> "ForgotPasswordPage":
        self.page.get_by_role("button", name="發送驗證碼").click()
        return self

    def email_field_error(self) -> Locator:
        return self.page.locator("#forgot-email-error")
