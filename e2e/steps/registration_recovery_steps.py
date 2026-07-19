"""Steps for registration_recovery.feature.

Covers the "abandoned signup" incident: an account that exists but never
finished email verification must resume the OTP step, never dead-end on the
login form. Reuses the generic redirect/toast assertions from common_steps.
"""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from steps.common_steps import *  # noqa: F401,F403

scenarios("registration_recovery.feature")


# --- Given -------------------------------------------------------------------


@given(parsers.parse('a monitored member "{email}" who exists but is not verified'))
def monitored_unverified_member(auth_mock, api_mock, email):
    # The account exists; we watch the verification-email endpoint so the test
    # can prove that entering the email alone (no password) sends nothing.
    api_mock.set_check_email(True)
    auth_mock.spy_resend()


@given(
    parsers.parse(
        'the login form is reachable for "{email}" but the password login is rejected as unverified'
    )
)
def login_form_then_unverified(auth_mock, api_mock, email):
    # Recovery path: the account exists (login form renders), and GoTrue — the
    # source of truth — rejects the *correct* password with email_not_confirmed.
    # The handler must resume verification instead of dead-ending on "wrong
    # password". GoTrue checks the password first, so this state is only ever
    # reached with the right password.
    api_mock.set_check_email(True)
    auth_mock.mock_login_email_not_confirmed()


@given(parsers.parse('a registered member "{email}" whose login always fails'))
def member_login_fails(auth_mock, api_mock, email):
    api_mock.set_check_email(True)
    auth_mock.mock_login_invalid_credentials()


@given("resending the verification code succeeds")
def resend_verification_succeeds(auth_mock):
    auth_mock.mock_resend_success()


# --- When --------------------------------------------------------------------


@when(parsers.parse('I enter email "{email}" and continue'))
def enter_email_and_continue(auth_page, email):
    auth_page.fill_email(email)
    auth_page.submit_email()


@when(parsers.parse('I log in as "{email}" with password "{password}"'))
def log_in(auth_page, email, password):
    auth_page.goto("/login")
    auth_page.fill_email(email)
    auth_page.submit_email()
    auth_page.fill_login_password(password)
    auth_page.submit_login()


# --- Then --------------------------------------------------------------------


@then("I should be on the login step")
def on_login_step(auth_page):
    # The password form is shown — we did NOT jump to /auth/verify-otp on email
    # alone.
    expect(auth_page.page.get_by_test_id("auth-login-button")).to_be_visible(timeout=5_000)


@then("no verification email was sent")
def no_verification_email(auth_page, auth_mock):
    # Give any (erroneous) resend a chance to fire before asserting it didn't.
    auth_page.page.wait_for_timeout(500)
    assert auth_mock.resend_calls == [], (
        f"a verification email was sent without a password: {auth_mock.resend_calls}"
    )
