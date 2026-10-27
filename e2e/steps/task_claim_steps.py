"""Steps for task_claim.feature and task_center.feature."""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from mocks.backend_api_mock import build_monthly_king_task, build_pending_free_year_reward
from steps.common_steps import *  # noqa: F401,F403

scenarios("task_claim.feature", "task_center.feature")


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
    page.get_by_role("button", name="領取獎勵").click()
    page.get_by_role("button", name="下一步").click()
    page.get_by_role("button", name="下一步").click()
    page.locator("#idNumber").fill(id_number)
    page.get_by_role("button", name="確認領取").click()


@given("the task list fails to load once")
def task_list_fails_once(api_mock):
    # 註冊在成功 mock 之後：第一次請求失敗，之後落回成功的那份（重試即成功）。
    api_mock.set_route_error("/tasks", times=1, exact=True)


@when("I retry loading the task center")
def retry_task_center(page, task_page):
    # 在頁面上立一個標記：整頁重載會讓它消失，只重發請求則留著。
    page.evaluate("window.__e2eNoReloadMarker = 'kept'")
    task_page.retry_button().click()


@then(parsers.parse('the round progress reads "{text}"'))
def round_progress_reads(task_page, text):
    expect(task_page.round_progress()).to_contain_text(text)


@then(parsers.parse('the medals are lit "{states}"'))
def medals_are_lit(task_page, states):
    expect(task_page.medals()).to_have_count(4)
    assert task_page.medal_fills() == states.split(",")


@then("I should see the claim button")
def see_claim_button(task_page):
    expect(task_page.claim_button().first).to_be_visible()


@then(parsers.parse('I should not see the text "{text}"'))
def should_not_see_text(page, text):
    expect(page.get_by_text(text)).to_have_count(0)
