"""Steps for payment_checkout.feature."""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from mocks.backend_api_mock import build_payuni_response
from steps.common_steps import *  # noqa: F401,F403

scenarios("payment_checkout.feature")


@given(parsers.parse('PayUni will report a successful payment for trade number "{trade_no}"'))
def payuni_success(api_mock, trade_no):
    api_mock.mock_prepare_and_redirect(trade_no, "SUCCESS")
    api_mock.set_payuni_result(trade_no, "completed", build_payuni_response("SUCCESS", TradeNo=trade_no))


@given(parsers.parse('PayUni will report a failed payment for trade number "{trade_no}"'))
def payuni_failed(api_mock, trade_no):
    api_mock.mock_prepare_and_redirect(trade_no, "FAILED")
    api_mock.set_payuni_result(
        trade_no,
        "failed",
        build_payuni_response("FAILED", TradeNo=trade_no, ResCode="51", ResCodeMsg="卡片額度不足"),
    )


@given(parsers.parse('PayUni\'s redirect will be slow for trade number "{trade_no}"'))
def payuni_slow(api_mock, trade_no):
    api_mock.mock_prepare_with_delayed_redirect(trade_no, "SUCCESS", delay_seconds=2.0)
    api_mock.set_payuni_result(trade_no, "pending")


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


@then("I should see the lock countdown")
def should_see_lock_countdown(payment_checkout_page):
    expect(payment_checkout_page.lock_countdown()).to_be_visible(timeout=5_000)
