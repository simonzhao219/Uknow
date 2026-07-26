"""90_develop_seed.feature 的步驟定義——把示範資料種進 develop 分支。

與 f10（測試用的 30 人建樹）刻意分開而不是加參數：兩者的**生命週期相反**
——測試樹跑完必須清乾淨（cleanup + 零殘留斷言），種子樹必須留著給人看。
把兩種意圖塞進同一個情境，早晚會有人在拋棄式分支上種資料、或在 develop
上把種好的資料清掉。分成兩個檔案，讀的人第一眼就知道自己在跑哪一種。
"""

from __future__ import annotations

import os

import pytest
from pytest_bdd import given, scenarios, then, when

from builders import org_builder
from tools import orgchart

scenarios("90_develop_seed.feature")

# 「journey 測試環境已就緒」定義於 steps/conftest.py（pytest-bdd 步驟不跨
# 模組共享，只認 conftest 鏈）。


@given("已確認這是刻意的種資料執行")
def seeding_is_intentional():
    """第二道保險（第一道是 pytest.ini 的 `-m "not seed"`）。

    種資料會在目標環境留下 45 個帳號、上千點數與多張免費續約券，且
    JOURNEY_KEEP_DATA=1 讓 session 收尾不清理——誤觸的代價是要人工善後。
    兩道保險都是「明確表態才會跑」，而且分屬不同機制（marker 與環境變數），
    不會被同一個手滑同時關掉。
    """
    if os.environ.get("JOURNEY_SEED") != "1":
        pytest.skip("種資料需要 JOURNEY_SEED=1 明確表態（見 seed-develop-data.yml）")
    if not os.environ.get("JOURNEY_ORGCHART_PATH"):
        pytest.fail(
            "JOURNEY_SEED=1 但沒設 JOURNEY_ORGCHART_PATH——"
            "那會把測試用的 30 人樹種進去，不是示範資料樹",
            pytrace=False,
        )


@when("依示範資料樹逐代以 GUI 建置組織樹")
def build_seed_tree(journey_config, supabase_admin, run_state, dev_server):
    org_builder.build_tree(journey_config, supabase_admin, run_state)


@then("示範資料樹的每個節點都擁有 active 推薦碼")
def all_seed_nodes_built(run_state):
    nodes = orgchart.load_nodes()
    missing = [
        n
        for n in nodes
        if not (run_state.users.get(n) and run_state.users[n].referral_code)
    ]
    assert not missing, f"未取得推薦碼的節點：{missing}"


@then("示範資料樹的推薦邊都指向宣告的上線")
def seed_edges_match(supabase_admin, run_state):
    org_builder.verify_edges(supabase_admin, run_state)
