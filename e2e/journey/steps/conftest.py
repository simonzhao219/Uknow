"""跨 feature 共用的步驟定義。

pytest-bdd 的步驟是以 fixture 註冊的——只在定義它的模組與 conftest 鏈
上可見，「不」跨 steps 模組共享。所有被多個 feature 引用的 Given 一律
放這裡。
"""

from __future__ import annotations

import pytest
from pytest_bdd import given

from builders import check_email_quota
from builders.admin_bootstrap import ensure_admin
from tools import orgchart


@given("journey 測試環境已就緒")
def env_ready(journey_config, supabase_admin, dev_server):
    """把環境 fixture 串起來：缺設定 → skip；指向正式站 → 直接終止。"""


@given("管理員帳號已完成 bootstrap")
def admin_ready(supabase_admin, run_state):
    ensure_admin(supabase_admin, run_state)


@given("組織樹已建置完成")
def tree_ready(run_state, org_nodes):
    missing = [
        n for n in org_nodes
        if not run_state.users.get(n) or not run_state.users[n].referral_code
    ]
    if missing:
        pytest.skip(f"組織樹未建置完成（缺 {len(missing)} 節點）——請先跑 10_org_build")


# --- 共用 fixtures ----------------------------------------------------------


@pytest.fixture(autouse=True)
def _fresh_check_email_quota(supabase_admin):
    """每個情境開跑前重置 check-email 的 per-IP 限流計數。

    正式碼的限流（10 次/5 分/IP，帳號枚舉防線）不動；但整套 journey
    從 runner 同一個 IP 出發，30 人建樹之後跨情境反覆重新登入，幾個
    情境就會撞滿——2026-08-04 run 30944836300 有 12 個情境死在
    「登入按鈕不出現」，首因全是 check-email 429。builder 只在建樹
    波次之間重置；這裡把同一個基礎設施操作擴大到每個情境的起點。

    **起點重置擋不住情境內用完。** 一個情境裡連續換身分登入好幾次是
    常態（f50 的完整生命週期是 會員 → 管理員 → 會員），10 次配額在
    情境中途就會見底，症狀與這裡要修的一模一樣。所以同時把 admin 綁給
    `builders.check_email_quota`，讓真正消耗配額的那一步（auth_gate）
    在撞到限流時能自己重置——這裡負責起點，那裡負責中途。
    """
    supabase_admin.reset_check_email_rate_limit()
    check_email_quota.bind(supabase_admin)


@pytest.fixture(scope="session")
def org_nodes():
    return orgchart.load_nodes()


@pytest.fixture(scope="session")
def reward_amount(supabase_admin):
    """單代獎金讀 reward_config 現值——金額調參不改測試。"""
    return int(supabase_admin.reward_config()["referral_reward_amount"])


@pytest.fixture
def scenario_memo():
    """單一情境內跨步驟傳遞小狀態（如「領取前的到期日」）。"""
    return {}
