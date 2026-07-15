"""`OTPVerificationPage.tsx` — 6-digit code, auto-submits on the 6th digit."""

from playwright.sync_api import Page

from pages.base_page import BasePage


class OtpPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    def enter_code(self, code: str) -> "OtpPage":
        # The multi-slot InputOTP is backed by a single hidden text input
        # that receives all keystrokes; typing into the wrapper drives it.
        self.page.get_by_test_id("otp-input-group").press_sequentially(code)
        return self

    def click_resend(self) -> "OtpPage":
        self.page.get_by_test_id("otp-resend-button").click()
        return self

    def click_back_to_login(self) -> "OtpPage":
        self.page.get_by_text("返回登入").click()
        return self

    def countdown_text(self):
        return self.page.get_by_role("status")
