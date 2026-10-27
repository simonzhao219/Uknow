"""Steps for referral_email_invite.feature (InviteCard, mocked /referrals/invites)."""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from steps.common_steps import *  # noqa: F401,F403

scenarios("referral_email_invite.feature")


def _card(page):
    return page.get_by_role("dialog", name="邀請好友")


@given("sending email invites is accepted")
def invites_accepted(api_mock, request):
    request.node.invite_calls = api_mock.spy_invites(202)


@given(parsers.parse('sending email invites fails with status {status:d} and code "{code}"'))
def invites_fail(api_mock, request, status, code):
    request.node.invite_calls = api_mock.spy_invites(status, code)


@when("I click the invite friend button")
def click_invite_friend(page):
    page.get_by_test_id("invite-friend-button").click()
    expect(_card(page)).to_be_visible(timeout=5_000)


@when(parsers.parse('I fill the invite email "{email}" and agree to the consent'))
def fill_invite_email(page, email):
    card = _card(page)
    card.get_by_label("對方的 Email（選填）").fill(email)
    card.get_by_role("checkbox").click()


@when("I send the email invite")
def send_invite(page):
    _card(page).get_by_test_id("invite-card-submit").click()


@then(parsers.parse('the invite card should say "{text}"'))
def card_says(page, text):
    expect(_card(page).get_by_test_id("invite-card-live")).to_contain_text(text, timeout=5_000)


@then(parsers.parse('the invite request carried "{email}" with consent'))
def request_carried(request, email):
    calls = request.node.invite_calls
    assert calls and calls[-1] == {"email": email, "consent": True}, calls


@then(parsers.parse('the invite card main button should read "{label}"'))
def main_button_reads(page, label):
    expect(_card(page).get_by_test_id("invite-card-submit")).to_have_text(label, timeout=5_000)


@then("the invite card should have no email field")
def no_email_field(page):
    expect(_card(page).get_by_label("對方的 Email（選填）")).to_have_count(0)
