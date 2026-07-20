"""跨 feature 共用的步驟定義。

pytest-bdd 的步驟是以 fixture 註冊的——只在定義它的模組與 conftest 鏈
上可見，「不」跨 steps 模組共享。所有被多個 feature 引用的 Given 一律
放這裡。
"""

from __future__ import annotations

import pytest
from pytest_bdd import given

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
