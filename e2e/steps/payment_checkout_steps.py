"""Steps for payment_checkout.feature."""

import re

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from mocks.backend_api_mock import build_payuni_response
from steps.common_steps import *  # noqa: F401,F403

scenarios("payment_checkout.feature")


@given(parsers.parse('PayUni will report a successful payment for trade number "{trade_no}"'))
def payuni_success(api_mock, trade_no):
    # activate_profile：付款成功導回時，profile 也切換成有效會員——
    # 否則新版 PaymentResult 會停在「開通中」輪詢（付款成功但 profile
    # 永遠不轉 active 是事故情境，不是快樂路徑）。
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


@given("PayUni's prepare call never resolves")
def payuni_prepare_hangs(api_mock):
    api_mock.mock_prepare_that_never_resolves()


@given(parsers.parse('PayUni preparation fails with "{message}"'))
def payuni_prepare_fails(api_mock, message):
    api_mock.set_prepare_error(message, code="DUPLICATE_SUBSCRIPTION")


@given("logging out succeeds")
def logout_succeeds(auth_mock):
    auth_mock.mock_signout()


@given("resetting registration succeeds")
def reset_registration_succeeds(api_mock):
    api_mock.set_reset_registration_success()


@when("I click pay")
def click_pay(payment_checkout_page):
    payment_checkout_page.click_pay()


@when("I click pay later")
def click_pay_later(payment_checkout_page):
    payment_checkout_page.click_pay_later()


@when("I click edit")
def click_edit(payment_checkout_page):
    payment_checkout_page.click_edit()


@then(parsers.parse('I should see the payment result "{state}"'))
def should_see_payment_result(payment_result_page, state):
    expect(payment_result_page.state_container(state)).to_be_visible(timeout=10_000)


@then("the pay button should be disabled")
def pay_button_disabled(payment_checkout_page):
    expect(payment_checkout_page.pay_button()).to_be_disabled(timeout=5_000)


@then("I should remain on the complete profile page")
def remain_on_complete_profile(page):
    # The bug this guards: clicking edit landed on /auth/complete-profile and
    # then bounced straight back to /payment/checkout. Wait past the profile
    # re-fetch that used to trigger the bounce, then assert we're still here and
    # the form actually rendered.
    page.wait_for_timeout(1500)
    expect(page).to_have_url(re.compile(r"/auth/complete-profile"))
    expect(page.get_by_text("完善個人資料")).to_be_visible(timeout=5_000)


@then(parsers.parse('the name field should contain "{value}"'))
def name_field_contains(page, value):
    expect(page.locator("#name")).to_have_value(value, timeout=5_000)


@then(parsers.parse('the phone field should contain "{value}"'))
def phone_field_contains(page, value):
    expect(page.locator("#phone")).to_have_value(value, timeout=5_000)
