"""`PaymentCheckout.tsx` — the NT$1,200 annual-fee checkout screen that
builds and submits a hidden form to PayUni's hosted payment page."""

from playwright.sync_api import Page

from pages.base_page import BasePage


class PaymentCheckoutPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    def click_pay(self) -> "PaymentCheckoutPage":
        self.page.get_by_test_id("payuni-pay-button").click()
        return self

    def click_pay_later(self) -> "PaymentCheckoutPage":
        self.pay_later_button().click()
        return self

    def pay_later_button(self):
        return self.page.get_by_test_id("cancel-payment-button")

    def click_edit(self) -> "PaymentCheckoutPage":
        self.page.get_by_test_id("edit-profile-button").click()
        return self

    def pay_button(self):
        return self.page.get_by_test_id("payuni-pay-button")

    def lock_countdown(self):
        return self.page.get_by_test_id("lock-countdown")
