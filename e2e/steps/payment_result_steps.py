"""Steps for payment_result.feature."""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from mocks.backend_api_mock import build_payuni_response, build_profile
from steps.common_steps import *  # noqa: F401,F403

scenarios("payment_result.feature")


@given(parsers.parse('the profile activates while polling for trade "{trade_no}"'))
def profile_activates_while_polling(api_mock, trade_no):
    # 模擬後端自癒收斂中：App bootstrap 與最初幾次輪詢都拿到「已付款、
    # 待開通」的 profile，之後轉為有效會員——PaymentResult 應顯示開通中
    # 畫面並在轉 active 時自動進會員中心。多放幾格 awaiting，讓
    # 「開通中」畫面有穩定可斷言的存在時間，避免與自動導頁互相競速。
    awaiting = build_profile(
        2, accountStatus="expired", paidAwaitingActivation=True, lastTradeNo=trade_no
    )
    active = build_profile(3)
    api_mock.set_profile_sequence([awaiting, awaiting, awaiting, active])


@given(parsers.parse('the profile never activates for trade "{trade_no}"'))
def profile_never_activates(api_mock, trade_no):
    # 收斂不了的卡單（例如金額不符待人工）——輪詢有界，逾時後交給客服。
    api_mock.set_profile(
        2, accountStatus="expired", paidAwaitingActivation=True, lastTradeNo=trade_no
    )


@given("the activation clock is controllable")
def install_clock(page):
    # 開通輪詢是 15 次 × 3 秒 ≈ 45 秒的有界等待；用 Playwright 的假時鐘
    # 快轉，測試不用真的等。必須在導頁前 install。
    page.clock.install()


@when("I fast-forward through the activation polling window")
def fast_forward_activation_window(page):
    # 每輪輪詢 = setTimeout(3s) → await fetch → 排下一個 setTimeout。
    # fetch 在假時鐘之外真實解析，所以要「快轉一格、讓 fetch 落地、再
    # 快轉」地逐格推進，直到 15 次上限用完（20 × 3.5s > 45s）。
    for _ in range(20):
        page.clock.fast_forward(3_500)
        page.wait_for_timeout(100)  # 讓被觸發的 fetch/microtask 真實解析


@when("I click retry activation")
def click_retry_activation(payment_result_page):
    payment_result_page.click_retry_activation()


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
