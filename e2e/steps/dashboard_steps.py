"""dashboard_smoke.feature — shared steps in common_steps.py plus the share action."""

from pytest_bdd import scenarios, when

from steps.common_steps import *  # noqa: F401,F403

scenarios("dashboard_smoke.feature")


@when("I open the invite friend panel")
def open_invite_friend_panel(page):
    # 分享收斂進「邀請好友」面板：先開面板，面板內才有分享鍵。
    page.get_by_test_id("invite-friend-button").click()


@when("I click the share referral button")
def click_share_referral(page):
    # 分享鍵現在位於面板內（Radix Dialog，portal 到 body），testid 不變。
    page.get_by_test_id("share-referral-button").click()
