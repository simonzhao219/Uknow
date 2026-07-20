"""30_tasks.feature 的步驟定義——推薦王達標與領取。"""

from __future__ import annotations

from datetime import datetime

from pytest_bdd import given, parsers, scenarios, then, when

from builders import tasks
from builders.login import login_via_gui

scenarios("30_tasks.feature")


def _king_rewards(supabase_admin, user_id: str) -> list[dict]:
    return supabase_admin.rest_select(
        "referral_king_rewards",
        {"select": "id,status,month_key,resulting_subscription_id", "user_id": f"eq.{user_id}"},
    )


def _latest_end_date(supabase_admin, user_id: str) -> datetime:
    rows = supabase_admin.rest_select(
        "subscriptions",
        {"select": "end_date", "user_id": f"eq.{user_id}",
         "order": "end_date.desc", "limit": "1"},
    )
    assert rows, "沒有訂閱列"
    return datetime.fromisoformat(rows[0]["end_date"].replace("Z", "+00:00"))


@then(parsers.parse('資料庫中 "{node}" 有一筆未領取的推薦王獎勵'))
def king_reward_pending(supabase_admin, run_state, node):
    rows = _king_rewards(supabase_admin, run_state.users[node].user_id)
    unclaimed = [r for r in rows if r["status"] == "unclaimed"]
    assert unclaimed, f"{node} 沒有未領取的推薦王獎勵（rows={rows}）"


@given(parsers.parse('記下 "{node}" 目前的最晚訂閱到期日'))
def memo_end_date(supabase_admin, run_state, scenario_memo, node):
    scenario_memo["end_date"] = _latest_end_date(supabase_admin, run_state.users[node].user_id)


@when(parsers.parse('"{node}" 登入並於任務中心領取免費續約獎勵'))
def claim_king_reward(guarded_page, run_state, node):
    user = run_state.users[node]
    login_via_gui(guarded_page, user)
    tasks.open_task_center(guarded_page)
    tasks.claim_first_pending_reward(guarded_page, user)


@then(parsers.parse('"{node}" 的最晚訂閱到期日比領取前延長約一年'))
def end_date_extended(supabase_admin, run_state, scenario_memo, node):
    before = scenario_memo["end_date"]
    after = _latest_end_date(supabase_admin, run_state.users[node].user_id)
    delta_days = (after - before).days
    # 效期接續 + 台灣日領域的「一年」：容許 360–370 天的實作細節差異
    assert 360 <= delta_days <= 370, f"到期日只延長了 {delta_days} 天（{before} → {after}）"


@then("資料庫中該筆推薦王獎勵狀態為已領取且關聯新訂閱")
def king_reward_claimed(supabase_admin, run_state):
    rows = _king_rewards(supabase_admin, run_state.users["A0"].user_id)
    claimed = [r for r in rows if r["status"] == "claimed"]
    assert claimed, f"沒有已領取的推薦王獎勵（rows={rows}）"
    assert claimed[0]["resulting_subscription_id"], "claimed 獎勵未關聯新訂閱"
