"""`CompleteProfile.tsx` — post-signup profile form (name, national ID,
birth date, phone, optional referral code) gating access to /payment/checkout."""

from playwright.sync_api import Page, expect

from pages.base_page import BasePage


class CompleteProfilePage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    def fill_form(self, name: str, national_id: str, birth_date: str, phone: str) -> "CompleteProfilePage":
        self.page.locator("#name").fill(name)
        self.page.locator("#nationalId").fill(national_id)
        self.page.locator("#birthDate").fill(birth_date)
        self.page.locator("#phone").fill(phone)
        return self

    def fill_referral_code(self, code: str) -> "CompleteProfilePage":
        self.page.locator("#referralCode").fill(code)
        return self

    def click_verify_referral_code(self) -> "CompleteProfilePage":
        self.page.get_by_role("button", name="驗證", exact=True).click()
        return self

    def check_terms(self) -> "CompleteProfilePage":
        self.page.locator("#terms").click()
        return self

    def open_terms(self) -> "CompleteProfilePage":
        """Open the terms-of-service dialog. It is an in-page modal (not a route
        change), so opening it must not unmount the form or clear typed input."""
        self.page.get_by_test_id("terms-link").click()
        return self

    def close_terms(self) -> "CompleteProfilePage":
        """Dismiss the terms dialog via its close button and wait for it to go."""
        self.page.keyboard.press("Escape")
        expect(self.terms_dialog()).to_be_hidden()
        return self

    def terms_dialog(self):
        return self.page.get_by_role("dialog")

    def field_value(self, field_id: str) -> str:
        return self.page.locator(f"#{field_id}").input_value()

    def submit(self) -> "CompleteProfilePage":
        self.page.get_by_test_id("profile-submit-button").click()
        return self

    def confirm_referral_warning(self) -> "CompleteProfilePage":
        """The blocking confirm dialog shown on every submit, reminding the
        user the referral code is permanent once set."""
        self.confirmation_dialog_button("確認無誤，繼續").click()
        return self

    def referral_code_status(self):
        return self.page.get_by_test_id("referral-code-status")
