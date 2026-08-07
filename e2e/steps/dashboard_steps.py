"""dashboard_smoke.feature — shared steps in common_steps.py plus the share action."""

from pytest_bdd import scenarios, when

from steps.common_steps import *  # noqa: F401,F403

scenarios("dashboard_smoke.feature")


@when("I open the invite friend panel")
def open_invite_friend_panel(page):
    # 會員中心的入口是「我的 QR」，開啟後預設停在「會員驗證碼」分頁
    # （出示給店家掃描的即時情境容錯低，故為預設）；分享鍵在「邀請好友」
    # 分頁裡，所以要先切分頁再按分享。
    page.get_by_test_id("my-qr-button").click()
    page.get_by_test_id("invite-tab").click()


@when("I click the share referral button")
def click_share_referral(page):
    # 分享鍵現在位於面板內（Radix Dialog，portal 到 body），testid 不變。
    page.get_by_test_id("share-referral-button").click()
