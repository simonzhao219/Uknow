"""付款步驟：從結帳頁出發，完成 NT$1,200 年費。

主模式 `sandbox`：Playwright 跟著跳轉進 PayUni sandbox 刷卡頁、填測試
卡、跟著 302 回 /payuni/return——整條金流零 mock。
備援模式 `webhook`（M3）：GUI 走到 /payuni/prepare 為止，改由 harness
以 sandbox 金鑰簽出合法 notify 直接打後端。
"""

from __future__ import annotations

from playwright.sync_api import Page, expect

from builders.payuni_sandbox_page import PayuniSandboxPage
from pages.payment_checkout_page import PaymentCheckoutPage
from pages.payment_result_page import PaymentResultPage


def pay_via_gui(page: Page, cfg) -> None:
    if cfg.payment_mode == "webhook":
        raise NotImplementedError(
            "webhook 備援模式屬 M3——目前請用 JOURNEY_PAYMENT_MODE=sandbox"
        )
    if cfg.payment_mode != "sandbox":
        raise ValueError(f"未知的 JOURNEY_PAYMENT_MODE: {cfg.payment_mode}")

    checkout = PaymentCheckoutPage(page)
    expect(checkout.pay_button()).to_be_visible(timeout=30_000)
    checkout.click_pay()

    PayuniSandboxPage(page).complete_payment(cfg.card_number, cfg.card_expiry, cfg.card_cvv)

    # PayUni 302 回 /payment/result；notify webhook 幾乎同時到後端。
    page.wait_for_url("**/payment/result**", timeout=180_000)
    assert_payment_success(page)


def assert_payment_success(page: Page) -> None:
    """成功或「開通中」（後端自癒收斂）都先接住；開通中要在時限內轉成功。"""
    result = PaymentResultPage(page)
    success = result.state_container("success")
    activating = result.state_container("activating")
    expect(success.or_(activating)).to_be_visible(timeout=60_000)
    expect(success).to_be_visible(timeout=120_000)
