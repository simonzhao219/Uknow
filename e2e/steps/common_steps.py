"""Steps shared across every feature: session seeding, navigation, and the
generic toast/text/redirect assertions. Every other `*_steps.py` module does
`from steps.common_steps import *` before calling `scenarios(...)` so these
are available for matching there too."""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, then, when

from mocks.fixtures import seed_authenticated_session


@given("I am not logged in")
def i_am_not_logged_in():
    pass  # no session seeded — ProtectedRoute should redirect to /login


@given(parsers.parse("I am logged in with registration step {step:d}"))
def logged_in_at_step(context, step):
    seed_authenticated_session(context, registration_step=step)


@given(parsers.parse('I am logged in with registration step {step:d} and last trade number "{trade_no}"'))
def logged_in_with_trade_no(context, step, trade_no):
    seed_authenticated_session(context, registration_step=step, lastTradeNo=trade_no or None)


@given(parsers.parse('I am logged in with registration step {step:d} and a referral code "{referral_code}"'))
def logged_in_with_referral_code(context, step, referral_code):
    seed_authenticated_session(context, registration_step=step, referralCode=referral_code)


@given(parsers.parse('I am logged in with registration step {step:d} referred by code "{code}" from "{name}"'))
def logged_in_referred_by(context, api_mock, step, code, name):
    seed_authenticated_session(context, registration_step=step, referredByCode=code)
    api_mock.set_referral_validate(code, name)


@given(parsers.parse('I visit "{path}"'))
@when(parsers.parse('I visit "{path}"'))
def visit(page, path):
    page.goto(path)


@then(parsers.parse('I should be redirected to "{path}"'))
def should_be_redirected(page, path):
    page.wait_for_url(f"**{path}", timeout=10_000)


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
