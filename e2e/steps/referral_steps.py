"""Steps for referral_visibility.feature."""

from pytest_bdd import given, parsers, scenarios

from mocks.backend_api_mock import build_referral_member
from mocks.fixtures import seed_stale_cache
from steps.common_steps import *  # noqa: F401,F403

scenarios("referral_visibility.feature")


def _tree_data(member_names):
    """useReferralData 快取的形狀 = GET /referrals/my-tree 回應的 data。"""
    first = [build_referral_member(name) for name in member_names]
    return {
        "userReferralCode": "MYCODE",
        "referralTree": {"firstGeneration": first, "secondGeneration": [], "thirdGeneration": []},
        "summary": {
            "firstGenCount": len(first),
            "secondGenCount": 0,
            "thirdGenCount": 0,
            "totalReferrals": len(first),
        },
    }


@given(parsers.parse('my referral tree has a first-generation member "{name}"'))
def referral_tree_with_member(api_mock, name):
    api_mock.set_referral_tree(first_generation=[build_referral_member(name)])


@given(parsers.parse('my referral tree was cached {minutes:d} minutes ago with member "{name}"'))
def referral_tree_cached(context, minutes, name):
    seed_stale_cache(context, "referralTree", _tree_data([name]), age_ms=minutes * 60 * 1000)
