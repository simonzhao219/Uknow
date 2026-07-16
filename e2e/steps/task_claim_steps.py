"""Steps for task_claim.feature."""

from pytest_bdd import given, parsers, scenarios, when

from mocks.backend_api_mock import build_monthly_king_task, build_pending_free_year_reward
from steps.common_steps import *  # noqa: F401,F403

scenarios("task_claim.feature")


@given(parsers.parse("my task center shows {count:d} referrals this month"))
def task_center_progress(api_mock, count):
    api_mock.set_task_center(tasks=[build_monthly_king_task(current=count)])


@given(parsers.parse('my task center has an unclaimed free-renewal-year reward "{reward_id}"'))
def task_center_with_reward(api_mock, reward_id):
    api_mock.set_task_center(
        tasks=[build_monthly_king_task(current=10, hasUnclaimedReward=True, unclaimedRewardCount=1)],
        pending_rewards=[build_pending_free_year_reward(reward_id)],
    )
    api_mock.set_claim_reward_success(reward_id)
    api_mock.set_verify_id_success()


@given(parsers.parse('my subscription extends from "{before}" to "{after}" when claimed'))
def subscription_extends_on_claim(api_mock, before, after):
    # 第 1 次請求（領取對話框的預覽）回領取前的效期；之後的請求（領取
    # 完成、快取被 handleClaimReward 失效後，儀表板重新抓）回延長後的
    # 效期——模擬後端 claim_referral_king_reward 把 end_date + 1 年。
    def data(end):
        return {
            "hasSubscription": True,
            "status": "active",
            "activeUntil": f"{end}T00:00:00.000Z",
            "currentPeriodStart": "2026-01-01T00:00:00.000Z",
            "currentPeriodEnd": f"{end}T00:00:00.000Z",
        }

    api_mock.set_subscription_status_sequence([data(before), data(after)])


@when(parsers.parse('I claim the pending reward with id number "{id_number}"'))
def claim_pending_reward(page, id_number):
    # 走真實的三步驟領取對話框（PendingRewardsSection → ThreeStepDialog）：
    # 確認 → 預覽（讀 /subscriptions/status）→ 身分證驗證 → 確認領取。
    page.get_by_role("button", name="立即領取").click()
    page.get_by_role("button", name="下一步").click()
    page.get_by_role("button", name="下一步").click()
    page.locator("#idNumber").fill(id_number)
    page.get_by_role("button", name="確認領取").click()
