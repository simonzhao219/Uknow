"""dashboard_smoke.feature — shared steps in common_steps.py plus the two invite entry points."""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from mocks.backend_api_mock import build_referral_member
from steps.common_steps import *  # noqa: F401,F403

scenarios("dashboard_smoke.feature")


@when("I open the my QR page")
def open_my_qr_page(page):
    # 會員中心的「我的 QR」在標題列右端（MyQrButton），是連到 /dashboard/qr 的
    # 連結；testid 沿用 my-qr-button。預設分頁是「邀請好友」，但深連結與記住的
    # 偏好都可能讓它停在別頁，所以這裡照樣顯式切一次——步驟要對「使用者實際
    # 會遇到的任何起點」都成立。
    page.get_by_test_id("my-qr-button").click()
    page.get_by_test_id("invite-tab").click()


@when("I click the share referral button")
def click_share_referral(page):
    # 分享鍵在「我的 QR」頁的邀請分頁裡，testid 不變。
    page.get_by_test_id("share-referral-button").click()


@when("I click the invite friend button")
def click_invite_friend(page):
    # 會員中心推薦格的「邀請好友」（InviteFriendButton）：與我的 QR 頁同一支
    # shareReferralInvite。e2e 的 Chromium 不是 in-app 瀏覽器、分享面板已拿掉，
    # 所以走最後一順位——複製整段邀請訊息並提示。
    page.get_by_test_id("invite-friend-button").click()


@given(parsers.parse("{count:d} first-generation members are about to expire"))
def first_generation_about_to_expire(api_mock, count):
    # B1 起 attention 只收「一代且即將到期」，total 是精確人數、items 最多 6 筆。
    members = [
        build_referral_member(f"到期{i}", status="expiring", daysToExpiry=5) for i in range(count)
    ]
    api_mock.set_referral_tree(
        first_generation=members,
        attention={"total": count, "items": members},
    )


@then(parsers.parse('I should see the status cards "{titles}"'))
def see_status_cards(dashboard_page, titles):
    for title in [t.strip() for t in titles.split(",")]:
        expect(dashboard_page.status_card(title)).to_be_visible()


@then(parsers.parse('the referral card shows the badge "{text}"'))
def referral_card_badge(dashboard_page, text):
    expect(dashboard_page.status_card("推薦管理").get_by_text(text)).to_be_visible()


@then("the dashboard has no attention area")
def no_attention_area(dashboard_page):
    expect(dashboard_page.heading()).to_be_visible()
    expect(dashboard_page.attention_area()).to_have_count(0)
