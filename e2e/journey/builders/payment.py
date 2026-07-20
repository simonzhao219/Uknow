"""付款步驟：從結帳頁出發，完成 NT$1,200 年費。

主模式 `sandbox`：Playwright 跟著跳轉進 PayUni sandbox 刷卡頁、填測試
卡、跟著 302 回 /payuni/return——整條金流零 mock。

備援模式 `webhook`：GUI 一樣走到 /payuni/prepare（真的建 pending 訂單），
但攔下往 sandbox 的跳轉；harness 用分支的 PAYUNI_TEST_* 金鑰簽出合法的
notify 直接打 /webhooks/payuni/notify——後端的解密、驗簽、process_
successful_payment、獎勵連動全走同一段真程式碼，差別只在「誰產生
notify」。sandbox 停機/改版時 nightly 以此模式續跑。
"""

from __future__ import annotations

import requests
from playwright.sync_api import Page, expect

from builders.payuni_sandbox_page import SANDBOX_URL_GLOB, PayuniSandboxPage
from pages.payment_checkout_page import PaymentCheckoutPage
from pages.payment_result_page import PaymentResultPage
from run_state import JourneyUser
from tools import payuni_crypto
from tools.supa import SupabaseAdmin


def pay_via_gui(page: Page, cfg, admin: SupabaseAdmin, user: JourneyUser) -> None:
    checkout = PaymentCheckoutPage(page)
    expect(checkout.pay_button()).to_be_visible(timeout=30_000)

    if cfg.payment_mode == "sandbox":
        checkout.click_pay()
        PayuniSandboxPage(page).complete_payment(cfg.card_number, cfg.card_expiry, cfg.card_cvv)
    elif cfg.payment_mode == "webhook":
        _arm_webhook_gateway(page, cfg, admin, user)
        checkout.click_pay()
    else:
        raise ValueError(f"未知的 JOURNEY_PAYMENT_MODE: {cfg.payment_mode}")

    # sandbox：PayUni 302 回 /payment/result；webhook：攔截 handler 302 過去。
    page.wait_for_url("**/payment/result**", timeout=180_000)
    assert_payment_success(page)


def _arm_webhook_gateway(page: Page, cfg, admin: SupabaseAdmin, user: JourneyUser) -> None:
    """把「往 sandbox 的跳轉」換成：簽章 notify 打後端 → 302 回結果頁。"""
    if not (cfg.payuni_hash_key and cfg.payuni_hash_iv):
        raise RuntimeError(
            "webhook 模式需要 JOURNEY_PAYUNI_HASH_KEY / JOURNEY_PAYUNI_HASH_IV"
            "（＝分支的 PAYUNI_TEST_HASH_KEY / _IV）"
        )

    def gateway(route):
        trade_no = _latest_pending_trade_no(admin, user)
        form = payuni_crypto.build_notify_form(trade_no, cfg.payuni_hash_key, cfg.payuni_hash_iv)
        resp = requests.post(
            f"{admin.base_url}/functions/v1/api/webhooks/payuni/notify",
            data=form,
            headers={"apikey": cfg.anon_key_public},
            timeout=60,
        )
        body = resp.json()
        assert body.get("Status") == "SUCCESS", f"notify 被後端拒絕：{body}"
        route.fulfill(
            status=302,
            headers={"Location": f"{cfg.base_url}/payment/result?tradeNo={trade_no}&status=SUCCESS"},
            body="",
        )

    page.context.route(SANDBOX_URL_GLOB, gateway)


def _latest_pending_trade_no(admin: SupabaseAdmin, user: JourneyUser) -> str:
    matches = admin.list_users_by_email_prefix(user.email)
    assert matches, f"auth.users 找不到 {user.email}"
    orders = admin.rest_select(
        "payment_orders",
        {
            "select": "transaction_id",
            "user_id": f"eq.{matches[0]['id']}",
            "status": "eq.pending",
            "order": "created_at.desc",
            "limit": "1",
        },
    )
    assert orders, f"{user.node} 沒有 pending 訂單——/payuni/prepare 未成功？"
    return orders[0]["transaction_id"]


def assert_payment_success(page: Page) -> None:
    """成功或「開通中」（後端自癒收斂）都先接住；開通中要在時限內轉成功。"""
    result = PaymentResultPage(page)
    success = result.state_container("success")
    activating = result.state_container("activating")
    expect(success.or_(activating)).to_be_visible(timeout=60_000)
    expect(success).to_be_visible(timeout=120_000)
