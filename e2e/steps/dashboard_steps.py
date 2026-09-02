"""dashboard_smoke.feature — shared steps in common_steps.py plus the share action."""

from pytest_bdd import scenarios, when

from steps.common_steps import *  # noqa: F401,F403

scenarios("dashboard_smoke.feature")


@when("I open the invite friend panel")
def open_invite_friend_panel(page):
    # 會員中心的「我的 QR」現在是連到 /dashboard/qr 的連結（不再是對話框）。
    # 預設分頁是「邀請好友」，但深連結與記住的偏好都可能讓它停在別頁，所以
    # 這裡照樣顯式切一次——步驟要對「使用者實際會遇到的任何起點」都成立。
    page.get_by_test_id("my-qr-button").click()
    page.get_by_test_id("invite-tab").click()


@when("I click the share referral button")
def click_share_referral(page):
    # 分享鍵現在位於面板內（Radix Dialog，portal 到 body），testid 不變。
    page.get_by_test_id("share-referral-button").click()
