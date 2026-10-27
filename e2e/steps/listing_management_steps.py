"""Steps for listing_management.feature."""

import base64

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from pages.create_service_provider_page import PHOTO_FIXTURE
from mocks.fixtures import block_crop_chunk, fail_first_photo_upload, record_photo_uploads
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


@given("the listing deletion API succeeds")
def listing_deletion_succeeds(api_mock, rest_mock):
    api_mock.set_delete_listing(on_call=lambda: rest_mock.set_user_listing(None))


@given("the listing deletion API fails with a server error")
def listing_deletion_fails(api_mock):
    api_mock.set_delete_listing(
        status=500,
        body={"success": False, "error": {"code": "delete_failed", "message": "刪除失敗"}},
    )


@given("the listing deletion route is not deployed yet")
def listing_deletion_route_missing(api_mock):
    # 前端（Cloudflare）可能先於 Edge 上線：裸 404（沒有 not_found 標記）不是「已刪除」。
    api_mock.set_delete_listing(status=404, body={"error": "Not Found"})


@given("the listing was already deleted on the server")
def listing_already_deleted(api_mock, rest_mock):
    api_mock.set_delete_listing(
        status=404,
        body={"success": False, "error": {"code": "not_found", "message": "刊登不存在"}},
        on_call=lambda: rest_mock.set_user_listing(None),
    )


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


@given("photo uploads are recorded", target_fixture="photo_recorder")
def photo_uploads_recorded(context):
    return record_photo_uploads(context)


@given("the first photo upload fails")
def first_photo_upload_fails(context):
    fail_first_photo_upload(context)


@given("the crop tool chunk fails to load", target_fixture="crop_gate")
def crop_chunk_fails(context):
    return block_crop_chunk(context)


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


@when("I pick the first listing photo")
def pick_first_photo(create_service_provider_page):
    # 只選檔、不按「完成」（後續步驟要檢查對話框或失敗面板）
    create_service_provider_page.photo_input().set_input_files(
        PHOTO_FIXTURE
    )


@when("I retry photo 1")
def retry_photo_one(page):
    page.get_by_role("button", name="重試第 1 張").click()


@then("I should see the retry action for photo 1")
def see_retry_one(page):
    expect(page.get_by_role("button", name="重試第 1 張")).to_be_visible(timeout=15_000)
    # 另兩張不受影響
    expect(page.get_by_role("button", name="調整第 2 張範圍")).to_be_visible(timeout=15_000)
    expect(page.get_by_role("button", name="調整第 3 張範圍")).to_be_visible(timeout=15_000)


@then("all three photos finish uploading")
def all_photos_uploaded(create_service_provider_page):
    create_service_provider_page.wait_photos_uploaded()


@then("the crop dialog Cancel and Done buttons are fully inside the viewport")
def crop_buttons_in_viewport(page, create_service_provider_page):
    dialog = create_service_provider_page.crop_dialog(1)
    expect(dialog).to_be_visible(timeout=15_000)
    viewport = page.viewport_size
    for name in ("取消", "完成"):
        button = dialog.get_by_role("button", name=name, exact=True)
        expect(button).to_be_visible()
        box = button.bounding_box()
        assert box is not None, f"{name} has no bounding box"
        assert box["x"] >= 0 and box["x"] + box["width"] <= viewport["width"], (
            f"「{name}」水平超出 {viewport['width']}px 視窗：{box}"
        )
        assert box["y"] >= 0 and box["y"] + box["height"] <= viewport["height"], (
            f"「{name}」垂直超出 {viewport['height']}px 視窗：{box}"
        )


@then(parsers.parse('I should see an alert containing "{text}"'))
def see_alert(page, text):
    expect(page.get_by_role("alert").filter(has_text=text)).to_be_visible(timeout=15_000)


@then("the create submit button should be disabled")
def submit_disabled(create_service_provider_page):
    expect(create_service_provider_page.submit_button()).to_be_disabled()


@then("I should see the refresh page action")
def see_refresh_action(page):
    expect(page.get_by_role("button", name="重新整理頁面")).to_be_visible()


@when("the crop tool chunk loads again")
def crop_chunk_loads_again(crop_gate):
    assert crop_gate.attempts >= 1, "the crop chunk was never requested"
    crop_gate.release()


@when("I refresh the page from the alert")
def refresh_from_alert(page):
    # 重新整理會丟掉頁面狀態：用 window 上的標記確認這次真的是整頁重載
    page.evaluate("window.__e2eBeforeRefresh = true")
    with page.expect_navigation(wait_until="load"):
        page.get_by_role("button", name="重新整理頁面").click()
    assert page.evaluate("window.__e2eBeforeRefresh === undefined"), "page was not reloaded"
    expect(page.locator('input[type="file"]')).to_be_enabled(timeout=15_000)


@then("I can finish framing photo 1")
def finish_framing(page, create_service_provider_page):
    dialog = create_service_provider_page.crop_dialog(1)
    expect(dialog).to_be_visible(timeout=15_000)
    done = dialog.get_by_role("button", name="完成")
    expect(done).to_be_enabled(timeout=15_000)
    done.click()
    expect(dialog).to_be_hidden(timeout=10_000)
    expect(page.get_by_role("button", name="調整第 1 張範圍")).to_be_visible(timeout=15_000)


def _has_exif(jpeg: bytes) -> bool:
    """走 JPEG marker 段，找 APP1（0xFFE1，EXIF／XMP 都在這）。"""
    i = 2
    while i + 4 <= len(jpeg) and jpeg[i] == 0xFF:
        marker = jpeg[i + 1]
        if marker == 0xE1:
            return True
        if marker == 0xDA:  # SOS：之後是影像資料
            return False
        i += 2 + int.from_bytes(jpeg[i + 2 : i + 4], "big")
    return False


def _decode_in_browser(page, jpeg: bytes) -> dict:
    """用真瀏覽器解碼：回尺寸與中央區塊的平均 RGB。"""
    return page.evaluate(
        """async (b64) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
          const canvas = document.createElement('canvas');
          canvas.width = bmp.width; canvas.height = bmp.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(bmp, 0, 0);
          const w = Math.max(1, Math.floor(bmp.width / 2)), h = Math.max(1, Math.floor(bmp.height / 2));
          const data = ctx.getImageData(Math.floor(bmp.width / 4), Math.floor(bmp.height / 4), w, h).data;
          let r = 0, g = 0, b = 0;
          for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
          const n = data.length / 4;
          return { width: bmp.width, height: bmp.height, r: r / n, g: g / n, b: b / n };
        }""",
        base64.b64encode(jpeg).decode(),
    )


@then("every uploaded photo is a square JPEG within 1600px without EXIF")
def uploads_square_no_exif(page, photo_recorder):
    payloads = photo_recorder.jpeg_payloads()
    assert len(payloads) == 3, f"expected 3 uploads, got {len(payloads)}"
    for jpeg in payloads:
        assert not _has_exif(jpeg), "uploaded JPEG still carries an APP1 (EXIF) segment"
        size = _decode_in_browser(page, jpeg)
        assert size["width"] == size["height"], f"not square: {size}"
        assert size["width"] <= 1600, f"longer than 1600px: {size}"


@then("every uploaded photo is dominantly the framed blue stripe")
def uploads_dominantly_blue(page, photo_recorder):
    for jpeg in photo_recorder.jpeg_payloads():
        px = _decode_in_browser(page, jpeg)
        assert px["b"] > 150 and px["r"] < 90 and px["g"] < 120, f"center is not the blue stripe: {px}"
