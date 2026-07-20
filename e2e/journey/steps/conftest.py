"""跨 feature 共用的步驟定義。

pytest-bdd 的步驟是以 fixture 註冊的——只在定義它的模組與 conftest 鏈
上可見，「不」跨 steps 模組共享。所有被多個 feature 引用的 Given 一律
放這裡。
"""

from __future__ import annotations

from pytest_bdd import given

from builders.admin_bootstrap import ensure_admin


@given("journey 測試環境已就緒")
def env_ready(journey_config, supabase_admin, dev_server):
    """把環境 fixture 串起來：缺設定 → skip；指向正式站 → 直接終止。"""


@given("管理員帳號已完成 bootstrap")
def admin_ready(supabase_admin, run_state):
    ensure_admin(supabase_admin, run_state)
