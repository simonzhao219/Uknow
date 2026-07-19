"""Steps for otp_verification.feature."""

from pytest_bdd import given, parsers, scenarios, when

from steps.common_steps import *  # noqa: F401,F403

scenarios("otp_verification.feature")


@given(parsers.parse('I have just signed up with email "{email}"'))
def just_signed_up(page, auth_page, auth_mock, api_mock, email):
    api_mock.set_check_email(False)
    auth_mock.mock_signup_success(email)
    auth_page.goto("/register")
    auth_page.fill_email(email)
    auth_page.submit_email()
    auth_page.fill_signup_passwords("Passw0rd!", "Passw0rd!")
    auth_page.submit_signup()
    page.wait_for_url("**/auth/verify-otp", timeout=10_000)


@given(parsers.parse("verifying the code succeeds with registration step {step:d}"))
def verify_succeeds(auth_mock, api_mock, step):
    auth_mock.mock_verify_otp_success()
    api_mock.set_profile(step)


@given("verifying the code always fails")
def verify_fails(auth_mock):
    auth_mock.mock_verify_otp_invalid()


@given("verifying the code succeeds but no profile exists yet")
def verify_ok_no_profile(auth_mock, api_mock):
    # A brand-new verified user has no profile row yet: the post-verify profile
    # fetch 404s, and the page must route to complete-profile (not dead-end).
    auth_mock.mock_verify_otp_success()
    api_mock.set_profile_error(404)


@given("verifying the code succeeds but the session is rejected as unauthorized")
def verify_ok_profile_unauthorized(auth_mock, api_mock):
    # verifyOtp succeeds but the follow-up profile call is 401 — the page must
    # not proceed silently; it surfaces the anomaly and returns to login.
    auth_mock.mock_verify_otp_success()
    auth_mock.mock_signout()
    api_mock.set_profile_error(401)


@given("3 minutes and 1 second have passed")
def fast_forward_otp_window(page):
    # Real time, not a scheduled setTimeout — the countdown compares
    # Date.now() against a stored expiry, so it must be the clock that moves.
    page.clock.install()
    page.clock.fast_forward(181_000)


@given("resending the code succeeds")
def resend_succeeds(auth_mock):
    auth_mock.mock_resend_success()


@when(parsers.parse('I enter the OTP code "{code}"'))
def enter_otp_code(otp_page, code):
    otp_page.enter_code(code)


@when("I click resend")
def click_resend(otp_page):
    otp_page.click_resend()
