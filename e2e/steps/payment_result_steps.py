"""Steps for payment_result.feature."""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from mocks.backend_api_mock import build_payuni_response
from steps.common_steps import *  # noqa: F401,F403

scenarios("payment_result.feature")


@given(parsers.parse('trade "{trade_no}" enriches with a successful PayUni payment'))
def enrich_success(api_mock, trade_no):
    api_mock.set_payuni_result(trade_no, "completed", build_payuni_response("SUCCESS", TradeNo=trade_no))


@given(parsers.parse('trade "{trade_no}" enriches with a failed PayUni payment reason "{reason}" code "{code}"'))
def enrich_failed_with_reason(api_mock, trade_no, reason, code):
    api_mock.set_payuni_result(
        trade_no, "failed", build_payuni_response("FAILED", TradeNo=trade_no, ResCode=code, ResCodeMsg=reason)
    )


@given(parsers.parse('trade "{trade_no}" enriches with a failed PayUni payment'))
def enrich_failed(api_mock, trade_no):
    api_mock.set_payuni_result(trade_no, "failed", build_payuni_response("FAILED", TradeNo=trade_no))


@given(parsers.parse('trade "{trade_no}" has order status "{status}" with a successful PayUni payment'))
def order_status_with_success(api_mock, trade_no, status):
    api_mock.set_payuni_result(trade_no, status, build_payuni_response("SUCCESS", TradeNo=trade_no))


@given(parsers.parse('trade "{trade_no}" has order status "{status}"'))
def order_status_only(api_mock, trade_no, status):
    api_mock.set_payuni_result(trade_no, status)


@given(parsers.parse('trade "{trade_no}" resolves from "{first}" to "{second}" after one retry'))
def resolves_after_retry(api_mock, trade_no, first, second):
    api_mock.set_payuni_result_sequence(
        trade_no,
        [(first, None), (second, build_payuni_response("SUCCESS", TradeNo=trade_no))],
    )


@given(parsers.parse('trade "{trade_no}" cannot be found'))
def trade_not_found(api_mock, trade_no):
    api_mock.set_payuni_result_not_found(trade_no)


@when("I click go to dashboard")
def click_go_to_dashboard(payment_result_page):
    payment_result_page.click_go_to_dashboard()


@when("I click retry payment")
def click_retry_payment(payment_result_page):
    payment_result_page.click_retry_payment()


@when("I click contact support", target_fixture="popup")
def click_contact_support(page, payment_result_page):
    with page.expect_popup() as popup_info:
        payment_result_page.click_contact_support()
    return popup_info.value


@then(parsers.parse('I should see the payment result "{state}"'))
def should_see_payment_result(payment_result_page, state):
    expect(payment_result_page.state_container(state)).to_be_visible(timeout=6_000)


@then(parsers.parse('a new tab should open to "{url}"'))
def new_tab_opens_to(popup, url):
    expect(popup).to_have_url(url, timeout=5_000)
