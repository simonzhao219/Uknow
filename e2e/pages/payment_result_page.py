"""`PaymentResult.tsx` — renders one of several mutually exclusive states from
the `status` query param, a polled `/payuni/result/:tradeNo` call, and (for
successful payments) whether the member entitlement has activated yet. Each
state has its own `data-testid` container (see the source additions)."""

from playwright.sync_api import Page

from pages.base_page import BasePage

STATE_TESTIDS = {
    "success": "payment-result-success",
    "failed": "payment-result-failed",
    "pending": "payment-result-pending",
    "unknown": "payment-result-unknown",
    "missing_tradeno": "payment-result-missing-tradeno",
    # 付款成功但會籍尚未生效（後端自癒收斂中）的開通中/逾時畫面
    "activating": "payment-result-activating",
    "activation_timeout": "payment-result-activation-timeout",
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

    def click_retry_activation(self) -> "PaymentResultPage":
        self.page.get_by_test_id("retry-activation-button").click()
        return self

    def click_contact_support(self) -> "PaymentResultPage":
        self.page.get_by_test_id("contact-support-button").click()
        return self
