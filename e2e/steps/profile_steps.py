"""Steps for complete_profile.feature."""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from steps.common_steps import *  # noqa: F401,F403

scenarios("complete_profile.feature")


@given(parsers.parse('the referral code "{code}" is valid for referrer "{name}"'))
def referral_code_valid(api_mock, code, name):
    api_mock.set_referral_code_valid(referrer_name=name)


@given(parsers.parse('the referral code "{code}" is invalid with message "{message}"'))
def referral_code_invalid(api_mock, code, message):
    api_mock.set_referral_code_invalid(message=message)


@given(parsers.parse("saving the profile succeeds with registration step {step:d}"))
def save_profile_succeeds(api_mock, step):
    api_mock.set_register_success(step)


@when(
    # parsers.re (not .parse): the Examples table has a blank name cell in
    # one row, and parse's {name} fields require at least one character.
    parsers.re(
        r'I fill the profile form with name "(?P<name>[^"]*)" national ID "(?P<national_id>[^"]*)"'
        r' birth date "(?P<birth_date>[^"]*)" phone "(?P<phone>[^"]*)"'
    )
)
def fill_profile_form(complete_profile_page, name, national_id, birth_date, phone):
    complete_profile_page.fill_form(name, national_id, birth_date, phone)


@when(parsers.parse('I fill the referral code "{code}"'))
def fill_referral_code(complete_profile_page, code):
    complete_profile_page.fill_referral_code(code)


@when("I click verify referral code")
def click_verify_referral_code(complete_profile_page):
    complete_profile_page.click_verify_referral_code()


@when("I check the terms checkbox")
def check_terms(complete_profile_page):
    complete_profile_page.check_terms()


@when("I submit the profile form")
def submit_profile_form(complete_profile_page):
    complete_profile_page.submit()


@when("I confirm the referral code warning")
def confirm_referral_warning(complete_profile_page):
    complete_profile_page.confirm_referral_warning()


@then("the profile submit button should be disabled")
def submit_disabled(page):
    expect(page.get_by_test_id("profile-submit-button")).to_be_disabled(timeout=5_000)


@then("the profile submit button should be enabled")
def submit_enabled(page):
    expect(page.get_by_test_id("profile-submit-button")).to_be_enabled(timeout=5_000)


@then(parsers.parse('I should see the referral code status "{text}"'))
def referral_code_status(complete_profile_page, text):
    expect(complete_profile_page.referral_code_status()).to_have_text(text, timeout=5_000)


@then(parsers.parse('the referral code field should contain "{code}"'))
def referral_field_contains(page, code):
    expect(page.locator("#referralCode")).to_have_value(code, timeout=5_000)
