"""Steps for complete_profile.feature."""

import re

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


@when("I open and close the terms of service")
def open_and_close_terms(complete_profile_page):
    complete_profile_page.open_terms()
    # The dialog must actually appear before we dismiss it — proves the terms
    # link opens a modal rather than navigating away.
    expect(complete_profile_page.terms_dialog()).to_be_visible(timeout=5_000)
    complete_profile_page.close_terms()


@when("I open the terms of service")
def open_terms(complete_profile_page):
    complete_profile_page.open_terms()


@when("I reload the page")
def reload_page(page):
    page.reload()


@given("I am on a mobile-sized screen")
def mobile_screen(page):
    # iPhone-12-ish portrait. The terms dialog overflow bug only shows at a
    # short viewport, so the default desktop size (1280x900) would miss it.
    page.set_viewport_size({"width": 390, "height": 844})


@then("the terms dialog should fit within the screen and its body should scroll")
def terms_dialog_fits_and_scrolls(page, complete_profile_page):
    dialog = complete_profile_page.terms_dialog()
    expect(dialog).to_be_visible(timeout=5_000)

    # 1) The whole dialog must sit within the viewport — nothing spills below
    #    the fold (where the bottom nav would otherwise hide it).
    box = dialog.bounding_box()
    viewport_h = page.viewport_size["height"]
    assert box is not None and box["y"] + box["height"] <= viewport_h + 1, (
        f"dialog spills below viewport: bottom={box['y'] + box['height'] if box else None} > {viewport_h}"
    )

    # 2) The close button stays reachable (fixed header, not scrolled away).
    expect(page.get_by_role("button", name="Close")).to_be_visible()

    # 3) The long terms text must actually be scrollable inside the body,
    #    i.e. content is taller than the clipped, bounded body.
    metrics = page.eval_on_selector(
        "[data-testid='legal-dialog-body']",
        "el => ({ scrollH: el.scrollHeight, clientH: el.clientHeight })",
    )
    assert metrics["scrollH"] > metrics["clientH"], (
        f"terms body is not scrollable: scrollHeight={metrics['scrollH']} clientHeight={metrics['clientH']}"
    )

    # 4) The card must not bleed edge-to-edge: a small side gutter keeps the
    #    card outline visible (the default DialogContent max-w-[calc(100%-2rem)]
    #    must survive the sm:max-w-2xl override on mobile).
    viewport_w = page.viewport_size["width"]
    left_gutter = box["x"]
    right_gutter = viewport_w - (box["x"] + box["width"])
    assert left_gutter >= 8 and right_gutter >= 8, (
        f"terms dialog has no side gutter: left={left_gutter} right={right_gutter}"
    )


@when("I submit the profile form")
def submit_profile_form(complete_profile_page):
    complete_profile_page.submit()


@when("I confirm the referral code warning")
def confirm_referral_warning(complete_profile_page):
    complete_profile_page.confirm_referral_warning()


@then("the profile submit button should be enabled")
def submit_enabled(page):
    expect(page.get_by_test_id("profile-submit-button")).to_be_enabled(timeout=5_000)


@then("I should still be on the complete profile page")
def still_on_complete_profile(page):
    # An invalid submit surfaces the error inline instead of navigating away.
    expect(page).to_have_url(re.compile(r"/auth/complete-profile"), timeout=5_000)


@then(parsers.parse('I should see the referral code status "{text}"'))
def referral_code_status(complete_profile_page, text):
    expect(complete_profile_page.referral_code_status()).to_have_text(text, timeout=5_000)


@then(parsers.parse('the referral code field should contain "{code}"'))
def referral_field_contains(page, code):
    expect(page.locator("#referralCode")).to_have_value(code, timeout=5_000)


@then(
    parsers.re(
        r'the profile form should still contain name "(?P<name>[^"]*)" national ID "(?P<national_id>[^"]*)"'
        r' birth date "(?P<birth_date>[^"]*)" phone "(?P<phone>[^"]*)"'
    )
)
def form_still_contains(page, name, national_id, birth_date, phone):
    # The whole point of the bug fix: reading the terms (or reloading) must not
    # wipe the half-filled form.
    expect(page.locator("#name")).to_have_value(name, timeout=5_000)
    expect(page.locator("#nationalId")).to_have_value(national_id)
    expect(page.locator("#birthDate")).to_have_value(birth_date)
    expect(page.locator("#phone")).to_have_value(phone)
