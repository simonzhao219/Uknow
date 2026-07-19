"""Steps for forgot_password.feature — the full recovery flow across
ForgotPasswordPage, OTPVerificationPage (recovery mode) and ResetPasswordPage.

OTP-related step wording here is deliberately distinct from otp_steps.py
("recovery code" / "reset code window") so the two feature modules never share
step definitions."""

from pytest_bdd import given, parsers, scenarios, when

from steps.common_steps import *  # noqa: F401,F403

scenarios("forgot_password.feature")


# --- Given -------------------------------------------------------------------


@given(parsers.parse('the account "{email}" can receive a reset code'))
def account_can_receive_reset_code(auth_mock, email):
    # Mocks GoTrue /recover for both the initial send and any later resend.
    auth_mock.mock_recover_success()


@given("sending the reset code fails")
def sending_reset_code_fails(auth_mock):
    auth_mock.mock_recover_error()


@given("the recovery code verifies successfully")
def recovery_code_verifies(auth_mock):
    # A successful recovery verifyOtp persists a session, which is what lets
    # ResetPasswordPage's getSession() guard pass.
    auth_mock.mock_verify_otp_success()


@given("the recovery code is incorrect or expired")
def recovery_code_invalid(auth_mock):
    auth_mock.mock_verify_otp_invalid()


@given("updating the password succeeds")
def updating_password_succeeds(auth_mock):
    auth_mock.mock_update_user_success()


@given("updating the password fails")
def updating_password_fails(auth_mock):
    # A generic, unclassified server failure → ResetPasswordPage shows its
    # fallback message. (Kept non-specific so the specific same-password /
    # breached-password branches below are exercised by their own Givens.)
    auth_mock.mock_update_user_error(
        message="Internal Server Error", code="unexpected_failure", status=500
    )


@given("updating the password fails because it matches the old password")
def updating_password_same(auth_mock):
    # GoTrue's `same_password` — the new password equals the current one.
    auth_mock.mock_update_user_error()


@given("updating the password fails because the password was found in a breach")
def updating_password_weak(auth_mock):
    auth_mock.mock_update_user_error(
        message="Password is known to be weak and easy to guess, please use a different one.",
        code="weak_password",
    )


# --- When --------------------------------------------------------------------


@when(parsers.parse('I request a password reset for "{email}"'))
def request_password_reset(page, forgot_password_page, email):
    forgot_password_page.goto("/forgot-password")
    forgot_password_page.fill_email(email)
    forgot_password_page.submit()
    page.wait_for_url("**/auth/verify-otp", timeout=10_000)


@when(parsers.parse('I submit the reset request for "{email}"'))
def submit_reset_request(forgot_password_page, email):
    # Used for cases that stay on the page (invalid email, send failure);
    # assumes we're already on /forgot-password via an "I visit" step.
    forgot_password_page.fill_email(email)
    forgot_password_page.submit()


@when(parsers.parse('I enter the recovery code "{code}"'))
def enter_recovery_code(otp_page, code):
    otp_page.enter_code(code)


@when("the reset code window expires")
def reset_code_window_expires(page):
    # The countdown compares Date.now() against a stored expiry, so the clock
    # itself must advance past the 3-minute (180s) window.
    page.clock.install()
    page.clock.fast_forward(181_000)


@when("I request the recovery code again")
def request_recovery_code_again(otp_page):
    otp_page.click_resend()


@when(parsers.parse('I set the new password "{password}" and confirmation "{confirm}"'))
def set_new_password(page, reset_password_page, password, confirm):
    # A successful recovery verify auto-navigates here; the auto-waiting
    # locators inside set_passwords absorb that transition.
    page.wait_for_url("**/auth/reset-password", timeout=10_000)
    reset_password_page.set_passwords(password, confirm)
    reset_password_page.submit()
