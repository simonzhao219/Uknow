"""Steps for auth_login.feature and auth_signup.feature."""

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


@given(parsers.parse('the email "{email}" is not yet registered'))
def email_not_registered(api_mock, email):
    api_mock.set_check_email(False)


@given(parsers.parse('signing up with password "{password}" succeeds'))
def signup_succeeds(auth_mock, password):
    auth_mock.mock_signup_success()


@given("signing up fails because the email is already registered")
def signup_fails_existing(auth_mock):
    auth_mock.mock_signup_error("email address already registered", code="user_already_exists")


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
