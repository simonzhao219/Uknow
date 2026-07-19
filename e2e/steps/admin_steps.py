"""Steps for the admin console (`admin_dashboard.feature`). Seeds an admin
session and stubs the per-tab admin APIs (`/admin/withdrawals`,
`/admin/members`) through BackendApiMock."""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from steps.common_steps import *  # noqa: F401,F403  — I visit / see text / redirected
from mocks.fixtures import seed_authenticated_session
from mocks.backend_api_mock import build_admin_member, build_admin_withdrawal

scenarios("admin_dashboard.feature")


# --- Given -----------------------------------------------------------------


@given("I am logged in as an admin")
def logged_in_admin(context):
    seed_authenticated_session(context, registration_step=3, isAdmin=True, accountStatus="active")


@given("there are no withdrawal applications")
def no_withdrawals(api_mock):
    api_mock.set_admin_withdrawals([])


@given(parsers.parse('there is a pending withdrawal from "{name}"'))
def pending_withdrawal(api_mock, name):
    api_mock.set_admin_withdrawals([build_admin_withdrawal(status="pending", userName=name)])


@given(parsers.parse('the platform has a member named "{name}"'))
def platform_member(api_mock, name):
    api_mock.set_admin_members([build_admin_member(name=name)])


# --- When ------------------------------------------------------------------


@when(parsers.parse('I open the "{name}" tab'))
def open_tab(admin_dashboard_page, name):
    admin_dashboard_page.open_tab(name)


@when("I mark the withdrawal as paid")
def mark_withdrawal_paid(admin_dashboard_page):
    admin_dashboard_page.mark_first_withdrawal_paid()


@when("I reject the withdrawal")
def reject_withdrawal(admin_dashboard_page):
    admin_dashboard_page.reject_first_withdrawal()


# --- Then ------------------------------------------------------------------


@then(parsers.parse('I should see the "{name}" tab'))
def should_see_tab(admin_dashboard_page, name):
    expect(admin_dashboard_page.tab(name)).to_be_visible(timeout=5_000)
