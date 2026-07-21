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


@given("there is a listing owned by another member")
def listing_owned_by_other(rest_mock):
    rest_mock.set_listing_by_id(
        build_listing(id="22222222-2222-2222-2222-222222222222", user_id=_OTHER_USER_ID)
    )


@given(parsers.parse('a public listing named "{name}" exists'))
def public_listing_exists(rest_mock, name):
    rest_mock.set_public_listing(
        build_listing(id="33333333-3333-3333-3333-333333333333", name=name)
    )


@given("the public listing does not exist")
def public_listing_missing(rest_mock):
    rest_mock.set_public_listing(None)


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


@then(parsers.parse('I should see the listing detail for "{name}"'))
def see_listing_detail(service_provider_detail_page, name):
    expect(service_provider_detail_page.name_heading(name)).to_be_visible(timeout=5_000)
    expect(service_provider_detail_page.description_section()).to_be_visible()
    expect(service_provider_detail_page.contact_section()).to_be_visible()
