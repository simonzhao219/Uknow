"""Steps for listing_management.feature."""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from mocks.supabase_rest_mock import build_listing
from steps.common_steps import *  # noqa: F401,F403

scenarios("listing_management.feature")

# A user id that is NOT the logged-in DEFAULT_USER_ID, for ownership checks.
_OTHER_USER_ID = "00000000-0000-0000-0000-000000000002"


# --- Given: seed the REST layer ------------------------------------------------

@given("I have no listing yet")
def no_listing(rest_mock):
    rest_mock.set_user_listing(None)


@given(parsers.parse('I have an active listing named "{name}"'))
def active_listing(rest_mock, name):
    rest_mock.set_user_listing(build_listing(name=name))


@given(parsers.parse('my membership runs until "{date}"'))
def membership_runs_until(api_mock, date):
    api_mock.set_subscription_status(
        has_subscription=True, status="active", active_until=f"{date}T00:00:00.000Z"
    )


@given("my membership has expired")
def membership_expired(api_mock):
    api_mock.set_subscription_status(
        has_subscription=True, status="expired", active_until="2026-01-01T00:00:00.000Z"
    )


@given("the listing read fails once")
def listing_read_fails_once(rest_mock):
    # 註冊在 set_user_listing 之後：第一次讀取失敗，之後落回成功的那份（重試即成功）。
    rest_mock.fail_user_listing(times=1)


@given("there is a listing owned by another member")
def listing_owned_by_other(rest_mock):
    rest_mock.set_listing_by_id(
        build_listing(id="22222222-2222-2222-2222-222222222222", user_id=_OTHER_USER_ID)
    )


@given("photo uploads succeed")
def photo_uploads_succeed(api_mock):
    api_mock.set_upload_photo_success()


@given("photo uploads are captured until released")
def photo_uploads_deferred(api_mock):
    api_mock.set_upload_photo_deferred()


@when("I fill the listing form while photos are still uploading")
def fill_during_upload(create_service_provider_page):
    create_service_provider_page.fill_valid_form_photos_first()


@when("the photo uploads complete")
def uploads_complete(api_mock):
    api_mock.release_deferred_uploads()


@then("the create submit button should become enabled")
def submit_becomes_enabled(create_service_provider_page):
    expect(create_service_provider_page.submit_button()).to_be_enabled(timeout=5_000)


# --- When ---------------------------------------------------------------------

@when("I delete the listing")
def delete_listing(page, service_provider_management_page):
    # 刪除走 shadcn AlertDialog（全站確認彈窗的統一標準；原生 window.confirm
    # 在 LINE 等內建瀏覽器可能被抑制、樣式也與品牌脫節）。
    service_provider_management_page.click_delete()
    page.get_by_role("button", name="確認刪除").click()


@when("I fill in a valid listing and submit")
def fill_and_submit(create_service_provider_page):
    create_service_provider_page.fill_valid_form().submit()


# --- Then ---------------------------------------------------------------------

@then("I should see the create-listing action")
def see_create_action(service_provider_management_page):
    expect(service_provider_management_page.create_link()).to_be_visible(timeout=5_000)


@then("I should not see the create-listing action")
def not_see_create_action(service_provider_management_page):
    # 讀取失敗時 listing 也是 null，此時放行會讓已有刊登的人建出第二則（單一刊登模式）。
    expect(service_provider_management_page.create_link()).to_have_count(0)


@when("I retry loading the listing page")
def retry_listing_page(page, service_provider_management_page):
    # 在頁面上立一個標記：整頁重載會讓它消失，只重發請求則留著（ui-ux-guidelines §6）。
    page.evaluate("window.__e2eNoReloadMarker = 'kept'")
    service_provider_management_page.retry_button().click()


@then(parsers.parse('the listing status reads "{label}"'))
def listing_status_reads(service_provider_management_page, label):
    expect(service_provider_management_page.status_badge(label)).to_be_visible()


@then(parsers.parse('I should see the membership end date "{date}"'))
def see_membership_end_date(service_provider_management_page, date):
    expect(service_provider_management_page.member_until(date)).to_be_visible()
