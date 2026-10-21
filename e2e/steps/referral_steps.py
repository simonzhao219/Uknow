"""Steps for referral_visibility.feature and referral_attention.feature."""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from mocks.backend_api_mock import build_network_overview, build_referral_member
from mocks.fixtures import seed_stale_cache
from steps.common_steps import *  # noqa: F401,F403

scenarios("referral_visibility.feature", "referral_attention.feature")


def _overview_data(member_names):
    """useReferralData 快取的形狀 = GET /referrals/network/overview 的 data。"""
    return build_network_overview([build_referral_member(name) for name in member_names])


@given(parsers.parse('my referral tree has a first-generation member "{name}"'))
def referral_tree_with_member(api_mock, name):
    api_mock.set_referral_tree(first_generation=[build_referral_member(name)])


@given(parsers.parse('my referral tree was cached {minutes:d} minutes ago with member "{name}"'))
def referral_tree_cached(context, minutes, name):
    seed_stale_cache(context, "referralNetwork", _overview_data([name]), age_ms=minutes * 60 * 1000)


@given("the referral network fails to load once")
def referral_network_fails_once(api_mock):
    # 註冊在成功 mock 之後：第一次請求失敗，之後落回成功的那份（重試即成功）。
    api_mock.set_route_error("/referrals/network/overview", times=1)


@when("I open the full expiring list")
def open_full_expiring_list(referral_page):
    referral_page.show_all_button().click()


@when("I load more expiring members")
def load_more_expiring(referral_page):
    referral_page.load_more_button().click()


@when("I return to the referral tree")
def return_to_tree(referral_page):
    referral_page.back_to_tree_button().click()


@when("I retry loading the referral page")
def retry_referral_page(page, referral_page):
    # 在頁面上立一個標記：整頁重載會讓它消失，只重發請求則留著（ui-ux-guidelines §6）。
    page.evaluate("window.__e2eNoReloadMarker = 'kept'")
    referral_page.retry_button().click()


@then(parsers.parse("I should see {shown:d} of {total:d} expiring members shown"))
def see_expiring_shown(referral_page, shown, total):
    expect(referral_page.shown_count(shown, total)).to_be_visible()


@then("I should see the referral tree")
def see_referral_tree(referral_page):
    expect(referral_page.tree()).to_be_visible()
