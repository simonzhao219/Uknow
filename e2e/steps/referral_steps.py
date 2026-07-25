"""Steps for referral_visibility.feature."""

from pytest_bdd import given, parsers, scenarios

from mocks.backend_api_mock import build_network_overview, build_referral_member
from mocks.fixtures import seed_stale_cache
from steps.common_steps import *  # noqa: F401,F403

scenarios("referral_visibility.feature")


def _overview_data(member_names):
    """useReferralData 快取的形狀 = GET /referrals/network/overview 的 data。"""
    return build_network_overview([build_referral_member(name) for name in member_names])


@given(parsers.parse('my referral tree has a first-generation member "{name}"'))
def referral_tree_with_member(api_mock, name):
    api_mock.set_referral_tree(first_generation=[build_referral_member(name)])


@given(parsers.parse('my referral tree was cached {minutes:d} minutes ago with member "{name}"'))
def referral_tree_cached(context, minutes, name):
    seed_stale_cache(context, "referralNetwork", _overview_data([name]), age_ms=minutes * 60 * 1000)
