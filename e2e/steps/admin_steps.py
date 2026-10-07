"""Steps for the admin console (`admin_dashboard.feature`). Seeds an admin
session and stubs the per-tab admin APIs (`/admin/withdrawals`,
`/admin/members`) through BackendApiMock."""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from steps.common_steps import *  # noqa: F401,F403  — I visit / see text / redirected
from mocks.fixtures import seed_authenticated_session
from mocks.backend_api_mock import build_admin_member, build_admin_withdrawal, build_system_alert

scenarios("admin_dashboard.feature")


# --- Given -----------------------------------------------------------------


@given("I am logged in as an admin")
def logged_in_admin(context):
    seed_authenticated_session(context, registration_step=3, isAdmin=True, accountStatus="active")


@given(parsers.parse('there is an unresolved system alert "{message}"'))
def unresolved_system_alert(api_mock, message):
    api_mock.set_system_alerts([build_system_alert(message=message)])


@when("I resolve the first system alert")
def resolve_first_alert(page):
    page.get_by_role("button", name="標記已處理").first.click()


@given("there are no withdrawal applications")
def no_withdrawals(api_mock):
    api_mock.set_admin_withdrawals([])


@given(parsers.parse('the platform has a member named "{name}"'))
def platform_member(api_mock, name):
    api_mock.set_admin_members([build_admin_member(name=name)])


@given(parsers.parse('there is a pending withdrawal from "{name}"'))
def pending_withdrawal(api_mock, name):
    api_mock.set_admin_withdrawals([build_admin_withdrawal(status="pending", userName=name)])


# --- When ------------------------------------------------------------------


@when(parsers.parse('I open the "{name}" tab'))
def open_tab(admin_dashboard_page, name):
    admin_dashboard_page.open_tab(name)


# 背景更新只有「扣住列表讀取」才看得到：快網路下它在一個 frame 內就結束了。只扣
# GET /admin/withdrawals 本身（路徑完全相符），寫入與 /summary 照常回應。
@when("the withdrawal list stops responding")
def withdrawal_list_stops_responding(api_mock):
    api_mock.hold_admin_withdrawal_list()


@when("the withdrawal list responds again")
def withdrawal_list_responds_again(api_mock):
    api_mock.release_admin_withdrawal_list()


# 走 journey 共用的 page object：它的列表等待原本只有晉升 PR 的 journey 跑得到。
@when(parsers.parse('I reject the withdrawal from "{name}"'))
def reject_withdrawal(admin_dashboard_page, name):
    admin_dashboard_page.reject_withdrawal(name)


# --- Then ------------------------------------------------------------------


@then(parsers.parse('I should see the "{name}" tab'))
def should_see_tab(admin_dashboard_page, name):
    expect(admin_dashboard_page.tab(name)).to_be_visible(timeout=5_000)


@then(parsers.parse('the withdrawal list shows "{name}" without a loading skeleton'))
def withdrawal_list_shows_without_skeleton(admin_dashboard_page, name):
    expect(admin_dashboard_page.withdrawal_list()).to_contain_text(name, timeout=5_000)
    expect(admin_dashboard_page.withdrawal_skeleton()).to_have_count(0)


@then("the withdrawal list is refreshing")
def withdrawal_list_refreshing(admin_dashboard_page):
    expect(admin_dashboard_page.withdrawal_list()).to_have_attribute("aria-busy", "true")


@then("the withdrawal list is no longer refreshing")
def withdrawal_list_settled(admin_dashboard_page):
    expect(admin_dashboard_page.withdrawal_list()).not_to_have_attribute(
        "aria-busy", "true", timeout=5_000
    )
