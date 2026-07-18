"""Steps for registration_recovery.feature.

Covers the "abandoned signup" incident: an account that exists but never
finished email verification must resume the OTP step, never dead-end on the
login form. Reuses the generic redirect/toast assertions from common_steps.
"""

from pytest_bdd import given, parsers, scenarios, when

from steps.common_steps import *  # noqa: F401,F403

scenarios("registration_recovery.feature")


# --- Given -------------------------------------------------------------------


@given(parsers.parse('the email "{email}" exists but is not verified'))
def email_exists_unverified(api_mock, email):
    # Guard A: check-email reports the account as unconfirmed, so step 1 routes
    # straight to verification and the login form is never shown.
    api_mock.set_check_email(True, confirmed=False)


@given(
    parsers.parse(
        'the login form is reachable for "{email}" but the password login is rejected as unverified'
    )
)
def login_form_then_unverified(auth_mock, api_mock, email):
    # Guard B (safety net): check-email's `confirmed` heuristic says confirmed
    # (so the login form renders), but GoTrue — the source of truth — rejects
    # the password login with email_not_confirmed. The handler must still
    # resume verification rather than dead-end on "wrong password".
    api_mock.set_check_email(True, confirmed=True)
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
