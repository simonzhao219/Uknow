"""Steps for renewal_backfill_recovery.feature.

補繳制的四契約回歸（docs/multi-step-flow-recovery.md）：狀態在後端
（renewal 契約）、每一步可重入、中斷後從任何入口回來都接得上進度。
"""

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from mocks.backend_api_mock import build_payuni_response
from mocks.fixtures import seed_authenticated_session
from steps.common_steps import *  # noqa: F401,F403
from steps.common_steps import _iso_days_ago

scenarios("renewal_backfill_recovery.feature")

# 已付 1 筆補繳後的契約狀態：錨點前進一年、還差 2 筆。
MID_BACKFILL_RENEWAL = {
    "extendAnchorDate": "2025-04-03",
    "extendEndDate": "2026-04-02",
    "backfillCount": 2,
    "backfillAmount": 2400,
    "backfillFinalEndDate": "2027-04-02",
    "expiredForMonths": 25,
    "hasPaidAnyBackfill": True,
    "paidBackfillCount": 1,
    "paidBackfillAmount": 1200,
    "freshForfeitPoints": 0,
    "freshForfeitReferrals": 0,
}


@given("I am logged in as an expired member mid-backfill")
def logged_in_mid_backfill(context, api_mock):
    # 契約 1：進度狀態全在後端——renewal 由 /subscriptions/status 提供，
    # 前端不留自己的進度副本（localStorage 的 pendingUser 只有舊到期日）。
    seed_authenticated_session(
        context,
        registration_step=3,
        accountStatus="expired",
        subscriptionEndDate=_iso_days_ago(430),  # noqa: F405
    )
    api_mock.set_subscription_status(
        has_subscription=False,
        status="expired",
        renewal=MID_BACKFILL_RENEWAL,
        hasPendingWithdrawal=False,
    )


@given(parsers.parse('trade "{trade_no}" completes a backfill installment leaving 2 to go'))
def trade_completes_backfill(api_mock, trade_no):
    api_mock.set_payuni_result(
        trade_no,
        "completed",
        build_payuni_response("SUCCESS", TradeNo=trade_no),
        renewal={
            "backfillCount": 2,
            "backfillAmount": 2400,
            "extendAnchorDate": "2025-04-03",
            "extendEndDate": "2026-04-02",
        },
    )


@then(parsers.parse('I should see the payment result "{state}"'))
def should_see_payment_result(payment_result_page, state):
    expect(payment_result_page.state_container(state)).to_be_visible(timeout=6000)
