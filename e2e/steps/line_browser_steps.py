"""Steps for line_browser.feature.

The app used to replace itself with an InAppBrowserWarning whenever
`detectInAppBrowser()` recognised a built-in browser. That block is gone, so
these scenarios prove the opposite: under a LINE / Facebook / Instagram /
WeChat / WebView user agent, the real app renders and the LINE user can sign
up and pay.

We fake the in-app browser by overriding `navigator.userAgent` via an init
script — it runs before the app's first script on every navigation, exactly
where `detectInAppBrowser()` (and PaymentCheckout's reopen-in-same-window
logic) reads it. Playwright's own Chromium is unchanged, so the payment path
behaves identically to payment_checkout.feature; the payment steps below mirror
that feature's (pytest-bdd resolves steps per test module, so they are
redeclared here rather than imported).
"""

import json

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from mocks.backend_api_mock import build_payuni_response
from steps.common_steps import *  # noqa: F401,F403

scenarios("line_browser.feature")


# Representative real user-agent strings for each in-app browser surface.
IN_APP_USER_AGENTS = {
    "LINE (iOS)": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.5.0"
    ),
    "LINE (Android)": (
        "Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Version/4.0 Chrome/114.0.0.0 Mobile Safari/537.36 Line/13.5.0/IAB"
    ),
    "Facebook": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/430.0.0]"
    ),
    "Instagram": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.29.110"
    ),
    "WeChat": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.34(0x18002234)"
    ),
    "Android WebView": (
        "Mozilla/5.0 (Linux; Android 13; SM-S908B; wv) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Version/4.0 Chrome/114.0.0.0 Mobile Safari/537.36"
    ),
}


# --- In-app browser simulation ------------------------------------------------


@given(parsers.parse('I am browsing inside the "{platform}" in-app browser'))
def browsing_in_app_browser(page, platform):
    ua = IN_APP_USER_AGENTS[platform]
    page.add_init_script(
        "Object.defineProperty(navigator, 'userAgent', {"
        f"get: () => {json.dumps(ua)}, configurable: true"
        "});"
    )


@given("the LINE LIFF SDK global is present")
def line_liff_global_present(page):
    # detectInAppBrowser() also treats a defined window.liff as LINE, regardless
    # of the UA — assert that path no longer blocks either.
    page.add_init_script("window.liff = {};")


# --- Render / navigation assertions -------------------------------------------


@then("the full app should render")
def full_app_should_render(page):
    # Reaching the real app (not the block page): the navbar's "立即刊登" signup
    # entry is visible, and no platform's "…內建瀏覽器無法正常使用" warning title
    # is present anywhere on the page.
    expect(page.get_by_role("link", name="立即刊登")).to_be_visible(timeout=10_000)
    expect(page.get_by_text("內建瀏覽器無法正常使用")).to_have_count(0)


@then("I should see the signup email step")
def should_see_signup_email_step(page):
    expect(page.get_by_test_id("auth-continue-button")).to_be_visible(timeout=10_000)


# --- Payment path (mirrors payment_checkout.feature) --------------------------


@given(parsers.parse('PayUni will report a successful payment for trade number "{trade_no}"'))
def payuni_success(api_mock, trade_no):
    api_mock.mock_prepare_and_redirect(trade_no, "SUCCESS", activate_profile={"registration_step": 3})
    api_mock.set_payuni_result(trade_no, "completed", build_payuni_response("SUCCESS", TradeNo=trade_no))


@given(parsers.parse('PayUni will report a failed payment for trade number "{trade_no}"'))
def payuni_failed(api_mock, trade_no):
    api_mock.mock_prepare_and_redirect(trade_no, "FAILED")
    api_mock.set_payuni_result(
        trade_no,
        "failed",
        build_payuni_response("FAILED", TradeNo=trade_no, ResCode="51", ResCodeMsg="卡片額度不足"),
    )


@when("I click pay")
def click_pay(payment_checkout_page):
    payment_checkout_page.click_pay()


@then(parsers.parse('I should see the payment result "{state}"'))
def should_see_payment_result(payment_result_page, state):
    expect(payment_result_page.state_container(state)).to_be_visible(timeout=10_000)
