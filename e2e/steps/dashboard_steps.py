"""dashboard_smoke.feature — shared steps in common_steps.py plus the share action."""

from pytest_bdd import scenarios, when

from steps.common_steps import *  # noqa: F401,F403

scenarios("dashboard_smoke.feature")


@when("I click the share referral button")
def click_share_referral(page):
    page.get_by_test_id("share-referral-button").click()
