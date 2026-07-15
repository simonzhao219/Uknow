"""`AuthPage.tsx` — a single component driving both /login and /register.
Step 1 collects an email; step 2 becomes either a login form (existing user)
or a signup form (new user) depending on the mocked `check-email` response."""

from playwright.sync_api import Page

from pages.base_page import BasePage


class AuthPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    # Step 1: email -----------------------------------------------------
    def fill_email(self, email: str) -> "AuthPage":
        self.page.get_by_label("Email", exact=True).fill(email)
        return self

    def submit_email(self) -> "AuthPage":
        self.page.get_by_test_id("auth-continue-button").click()
        return self

    # Step 2A: login (existing user) ------------------------------------
    def fill_login_password(self, password: str) -> "AuthPage":
        self.page.get_by_label("密碼", exact=True).fill(password)
        return self

    def submit_login(self) -> "AuthPage":
        self.page.get_by_test_id("auth-login-button").click()
        return self

    def click_forgot_password(self) -> "AuthPage":
        self.page.get_by_test_id("forgot-password-link").click()
        return self

    # Step 2B: signup (new user) -----------------------------------------
    def fill_signup_passwords(self, password: str, confirm_password: str) -> "AuthPage":
        self.page.get_by_label("設定密碼", exact=True).fill(password)
        self.page.get_by_label("確認密碼", exact=True).fill(confirm_password)
        return self

    def submit_signup(self) -> "AuthPage":
        self.page.get_by_test_id("auth-signup-button").click()
        return self

    def click_back(self) -> "AuthPage":
        self.page.get_by_test_id("auth-back-button").click()
        return self

    # State ---------------------------------------------------------------
    def email_field_error(self):
        return self.page.locator("#email-error")

    def is_on_login_step(self) -> bool:
        return self.page.get_by_test_id("auth-login-button").is_visible()

    def is_on_signup_step(self) -> bool:
        return self.page.get_by_test_id("auth-signup-button").is_visible()
