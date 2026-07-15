"""`PaymentResult.tsx` — renders one of five mutually exclusive states from
either the `status` query param or a polled `/payuni/result/:tradeNo` call.
Each state has its own `data-testid` container (see the source additions)."""

from playwright.sync_api import Page

from pages.base_page import BasePage

STATE_TESTIDS = {
    "success": "payment-result-success",
    "failed": "payment-result-failed",
    "pending": "payment-result-pending",
    "unknown": "payment-result-unknown",
    "missing_tradeno": "payment-result-missing-tradeno",
}


class PaymentResultPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    def state_container(self, state: str):
        return self.page.get_by_test_id(STATE_TESTIDS[state])

    def click_go_to_dashboard(self) -> "PaymentResultPage":
        self.page.get_by_test_id("go-to-dashboard-button").click()
        return self

    def click_retry_payment(self) -> "PaymentResultPage":
        self.page.get_by_test_id("retry-payment-button").click()
        return self

    def click_contact_support(self) -> "PaymentResultPage":
        self.page.get_by_test_id("contact-support-button").click()
        return self
