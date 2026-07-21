"""Steps shared across every feature: session seeding, navigation, and the
generic toast/text/redirect assertions. Every other `*_steps.py` module does
`from steps.common_steps import *` before calling `scenarios(...)` so these
are available for matching there too."""

from datetime import datetime, timedelta, timezone

from playwright.sync_api import expect
from pytest_bdd import given, parsers, then, when

from config import BASE_URL
from mocks.fixtures import (
    disable_native_share,
    seed_authenticated_session,
    seed_pending_referral,
)


def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


@given("I am not logged in")
def i_am_not_logged_in():
    pass  # no session seeded — ProtectedRoute should redirect to /login


@given(parsers.parse("I am logged in with registration step {step:d}"))
def logged_in_at_step(context, step):
    seed_authenticated_session(context, registration_step=step)


@given(
    parsers.re(
        r'I am logged in with registration step (?P<step>\d+) and last trade number "(?P<trade_no>[^"]*)"'
    )
)
def logged_in_with_trade_no(context, step, trade_no):
    # parsers.re (not .parse) because the Examples table has a blank
    # trade_no cell in some rows, and parse's {name} fields require >=1 char.
    seed_authenticated_session(context, registration_step=int(step), lastTradeNo=trade_no or None)


# --- Entitlement-based sessions（RequireMembershipRoute 以 accountStatus 放行）---

@given("I am logged in as an active member")
def logged_in_active_member(context):
    seed_authenticated_session(context, registration_step=3, accountStatus="active")


@given("I am logged in as an expired former member")
def logged_in_expired_member(context):
    # 曾是會員（subscriptionEndDate 存在）但已超過寬限期 → 守衛應導去
    # /payment/checkout 續約，而不是重走註冊漏斗。過期 90 天（未滿一年，
    # 所以結帳頁仍可選「續約接續原效期」）。
    seed_authenticated_session(
        context,
        registration_step=3,
        accountStatus="expired",
        subscriptionEndDate=_iso_days_ago(90),
    )


@given("I am logged in as a long-expired former member")
def logged_in_long_expired_member(context):
    # 過期超過一年：接續原效期會「付了錢效期仍在過去」，結帳頁只能選新約。
    seed_authenticated_session(
        context,
        registration_step=3,
        accountStatus="expired",
        subscriptionEndDate=_iso_days_ago(400),
    )


@given(parsers.parse('I am logged in awaiting activation with trade number "{trade_no}"'))
def logged_in_awaiting_activation(context, trade_no):
    # 已付款（PayUni 已回 SUCCESS）但訂閱還沒建好（後端收斂中）——
    # 守衛應導去 /payment/result 的開通中畫面，絕不能送回結帳頁。
    seed_authenticated_session(
        context,
        registration_step=2,
        accountStatus="expired",
        paidAwaitingActivation=True,
        lastTradeNo=trade_no,
    )


@given(parsers.parse('I am logged in with step 2 and a failed payment for trade "{trade_no}"'))
def logged_in_step2_failed_payment(context, trade_no):
    # step 2（有 pending 訂單）但付款其實失敗了（paidAwaitingActivation
    # = false）——舊守衛把這種人困在結果頁，新守衛應送去結帳頁重新付款。
    seed_authenticated_session(
        context,
        registration_step=2,
        accountStatus="expired",
        paidAwaitingActivation=False,
        lastTradeNo=trade_no,
    )


@given("I am logged in as an admin without a subscription")
def logged_in_admin_no_subscription(context):
    seed_authenticated_session(
        context, registration_step=3, isAdmin=True, accountStatus="expired", subscriptionEndDate=None
    )


@given(parsers.parse('I am logged in with registration step {step:d} and a referral code "{referral_code}"'))
def logged_in_with_referral_code(context, api_mock, step, referral_code):
    # A profile with a referralCode models a *paid, currently-active* member —
    # membership gating now reads accountStatus (not the referralCode), and
    # MemberDashboard additionally gates showing that code behind
    # `referralProgramJoined` plus a /subscriptions/status check.
    seed_authenticated_session(
        context,
        registration_step=step,
        referralCode=referral_code,
        referralProgramJoined=True,
        accountStatus="active",
        subscriptionEndDate="2027-01-01T00:00:00.000Z",
    )
    api_mock.set_subscription_status(has_subscription=True)


@given(parsers.parse('I am logged in with registration step {step:d} referred by code "{code}" from "{name}"'))
def logged_in_referred_by(context, api_mock, step, code, name):
    seed_authenticated_session(context, registration_step=step, referredByCode=code)
    api_mock.set_referral_validate(code, name)


@given(parsers.parse('an invite link with referral code "{code}" has been opened'))
def invite_link_opened(context, code):
    seed_pending_referral(context, code)


@given("the browser has no native share sheet")
def browser_no_native_share(context):
    disable_native_share(context)


@given(parsers.parse('I visit "{path}"'))
@when(parsers.parse('I visit "{path}"'))
def visit(page, path):
    page.goto(path)


@then(parsers.parse('the pending referral code should be "{code}"'))
def pending_referral_should_be(page, code):
    stored = page.evaluate("() => window.localStorage.getItem('pending_referral_code')")
    assert stored == code, f"expected pending referral {code!r}, got {stored!r}"


@then(parsers.parse('I should be redirected to "{path}"'))
def should_be_redirected(page, path):
    page.wait_for_url(f"**{path}", timeout=10_000)


@when("I reopen the verification page in a new tab", target_fixture="reopened_page")
def reopen_verification_new_tab(context):
    # Faithfully models "closed the tab, reopened the link": a new tab shares the
    # context's localStorage (so the pending-OTP marker is visible) but has a
    # fresh history with no React Router state — the exact condition the old page
    # dead-ended on. (A same-URL page.goto/reload would preserve history.state
    # and never exercise the rehydration path.)
    new_page = context.new_page()
    new_page.goto(f"{BASE_URL}/auth/verify-otp")
    return new_page


@then(parsers.parse('the reopened tab should still be verifying "{email}"'))
def reopened_still_verifying(reopened_page, email):
    # It rehydrated the pending verification from storage instead of bouncing to
    # /login.
    reopened_page.wait_for_url("**/auth/verify-otp", timeout=10_000)
    expect(reopened_page.get_by_text(email)).to_be_visible(timeout=5_000)


@then(parsers.parse('I should see a toast containing "{message}"'))
def should_see_toast(page, message):
    expect(page.get_by_test_id("toast").filter(has_text=message).last).to_be_visible(timeout=5_000)


@then(parsers.parse('I should see a field error containing "{message}"'))
def should_see_field_error(page, message):
    expect(page.get_by_role("alert").filter(has_text=message).first).to_be_visible(timeout=5_000)


@then(parsers.parse('I should see the text "{text}"'))
def should_see_text(page, text):
    expect(page.get_by_text(text)).to_be_visible(timeout=5_000)


@then("I should see the dashboard")
def should_see_dashboard(dashboard_page):
    expect(dashboard_page.heading()).to_be_visible(timeout=5_000)
