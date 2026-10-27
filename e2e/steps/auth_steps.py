"""Steps for auth_login.feature and auth_signup.feature."""

import base64
import json
import re

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from steps.common_steps import *  # noqa: F401,F403

scenarios("auth_login.feature", "auth_signup.feature")


# --- Given -------------------------------------------------------------------


@given(parsers.parse('a registered member "{email}" with password "{password}" and registration step {step:d}'))
def registered_member(auth_mock, api_mock, email, password, step):
    api_mock.set_check_email(True)
    auth_mock.mock_login_success(email)
    api_mock.set_profile(step, email=email)


@given(parsers.parse('a registered member "{email}" whose login always fails'))
def member_login_fails(auth_mock, api_mock, email):
    api_mock.set_check_email(True)
    auth_mock.mock_login_invalid_credentials()


@given(parsers.parse('a registered member "{email}" whose account was deleted'))
def member_account_deleted(auth_mock, api_mock, email):
    # Password login succeeds, but the profile fetch reports the account is
    # gone (410) — AuthPage must sign out, explain, and return to step 1 rather
    # than throwing a generic "login failed".
    api_mock.set_check_email(True)
    auth_mock.mock_login_success(email)
    auth_mock.mock_signout()
    api_mock.set_profile_error(410)


@given(parsers.parse('the email "{email}" is not yet registered'))
def email_not_registered(api_mock, email):
    api_mock.set_check_email(False)


@given(parsers.parse('signing up with password "{password}" succeeds'))
def signup_succeeds(auth_mock, password):
    auth_mock.mock_signup_success()


@given("signing up fails because the email is already registered")
def signup_fails_existing(auth_mock):
    auth_mock.mock_signup_error("email address already registered", code="user_already_exists")


@given("signing up fails because the password was found in a breach")
def signup_fails_weak_password(auth_mock):
    auth_mock.mock_signup_error(
        "Password is known to be weak and easy to guess, please use a different one.",
        code="weak_password",
    )


@given("signing up fails because of the email rate limit")
def signup_fails_rate_limit(auth_mock):
    auth_mock.mock_signup_error(
        "email rate limit exceeded", code="over_email_send_rate_limit", status=429
    )


@given("checking whether the email exists fails")
def check_email_fails(api_mock):
    api_mock.set_check_email_error()


# --- When --------------------------------------------------------------------


@when(parsers.parse('I enter email "{email}" and continue'))
def enter_email_and_continue(auth_page, email):
    auth_page.fill_email(email)
    auth_page.submit_email()


@when(parsers.parse('I log in as "{email}" with password "{password}"'))
def log_in(auth_page, email, password):
    auth_page.fill_email(email)
    auth_page.submit_email()
    auth_page.fill_login_password(password)
    auth_page.submit_login()


@when("I click forgot password")
def click_forgot_password(auth_page):
    auth_page.click_forgot_password()


@when(parsers.parse('I set password "{password}" and confirm "{confirm}"'))
def set_signup_passwords(auth_page, password, confirm):
    auth_page.fill_signup_passwords(password, confirm)


@when("I submit signup")
def submit_signup(auth_page):
    auth_page.submit_signup()


# --- Then ----------------------------------------------------------------------


@then("I should be on the signup step")
def on_signup_step(auth_page):
    expect(auth_page.page.get_by_test_id("auth-signup-button")).to_be_visible(timeout=5_000)


@then(parsers.parse('I should see the email field error "{message}"'))
def email_field_error(auth_page, message):
    expect(auth_page.email_field_error()).to_have_text(message, timeout=5_000)


# --- Email 邀請（R2） -------------------------------------------------------------


def _b64url(raw: str) -> str:
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def invite_token(email: str, code: str) -> str:
    """前端只解碼、不驗簽（簽章由 accept 端點驗），所以測試不必算 HMAC。"""
    payload = {"v": 1, "e": email, "c": code, "x": 4102444800}
    return f"{_b64url(json.dumps(payload))}.e2e-signature"


@given(parsers.parse('the invite accept succeeds for "{email}" at registration step {step:d}'))
def invite_accept_succeeds(auth_mock, api_mock, request, email, step):
    api_mock.mock_invite_accept(200)
    request.node.password_logins = auth_mock.spy_password_login(email)
    api_mock.set_profile(step, email=email)


@given(parsers.parse('the invite accept fails with status {status:d} and code "{code}"'))
def invite_accept_fails(api_mock, status, code):
    api_mock.mock_invite_accept(status, code)


@when(parsers.parse('I open an invite link for "{email}" with referral code "{code}"'))
def open_invite_link(page, email, code):
    page.goto(f"/register?invite={invite_token(email, code)}")


@then("the invite token should be gone from the address bar")
def invite_token_cleared(page):
    expect(page).not_to_have_url(re.compile(r"invite="), timeout=5_000)


@then(parsers.parse('the password login used "{email}" and "{password}"'))
def password_login_used(request, email, password):
    calls = request.node.password_logins
    assert calls, "expected a password login after accepting the invite"
    assert calls[-1].get("email") == email and calls[-1].get("password") == password, calls[-1]


@then(parsers.parse('the profile referral code field should contain "{code}"'))
def profile_referral_field(page, code):
    expect(page.locator("#referralCode")).to_have_value(code, timeout=5_000)


@then(parsers.parse('the profile referral code status should read "{text}"'))
def profile_referral_status(page, text):
    expect(page.get_by_text(text, exact=True)).to_be_visible(timeout=5_000)


@then("I should be on the login step")
def on_login_step(auth_page):
    expect(auth_page.page.get_by_test_id("auth-login-button")).to_be_visible(timeout=5_000)


@then(parsers.parse('I should see the alert "{text}"'))
def see_alert(page, text):
    expect(page.get_by_role("alert").filter(has_text=text)).to_be_visible(timeout=5_000)


@then("the login password field should be empty")
def login_password_empty(page):
    expect(page.get_by_label("密碼", exact=True)).to_have_value("", timeout=5_000)


@given(parsers.parse('the referral code "{code}" is valid for referrer "{name}"'))
def referral_code_valid_for_invite(api_mock, code, name):
    api_mock.set_referral_validate(code, name)


@then(parsers.parse('I should not see the text "{text}"'))
def should_not_see_text(page, text):
    expect(page.get_by_text(text)).to_have_count(0)


@given("the invite accept succeeds but the password login fails")
def invite_accept_then_login_fails(auth_mock, api_mock):
    api_mock.mock_invite_accept(200)
    auth_mock.mock_login_invalid_credentials()
