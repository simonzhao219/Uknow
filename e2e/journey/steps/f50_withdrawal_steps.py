"""50_withdrawal.feature 的步驟定義——提領雙視角全生命週期。"""

from __future__ import annotations

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from builders import withdrawal
from builders.login import login_admin, login_via_gui
from builders.verification import available_points
from pages.admin_dashboard_page import AdminDashboardPage
from pages.reward_page import RewardPage

scenarios("50_withdrawal.feature")

WITHDRAWAL_TAB = "獎金提領管理"


def _latest_withdrawal(supabase_admin, user_id: str) -> dict:
    rows = supabase_admin.rest_select(
        "withdrawals",
        {"select": "id,status,amount", "user_id": f"eq.{user_id}",
         "order": "created_at.desc", "limit": "1"},
    )
    assert rows, "沒有提領紀錄"
    return rows[0]


@when(parsers.parse('"{node}" 登入並開啟獎勵頁'))
def open_rewards(guarded_page, run_state, node):
    login_via_gui(guarded_page, run_state.users[node])
    withdrawal.open_rewards(guarded_page)


@then("獎勵頁顯示可提領Point不足的提示")
def insufficient_hint(guarded_page):
    expect(guarded_page.get_by_text("可提領Point不足").first).to_be_visible(timeout=15_000)


@when(parsers.parse('"{node}" 開始提領申請'))
def start_withdrawal(guarded_page, node):
    RewardPage(guarded_page).start_withdrawal()


@then(parsers.parse('金額 "{amount}" 被拒且顯示最低提領限制'))
def amount_below_min(guarded_page, amount):
    withdrawal.expect_amount_error(
        guarded_page, RewardPage(guarded_page), amount, "最低提領Point為"
    )


@then(parsers.parse('金額 "{amount}" 被拒且顯示須為 1000 的倍數'))
def amount_not_multiple(guarded_page, amount):
    withdrawal.expect_amount_error(
        guarded_page, RewardPage(guarded_page), amount, "必須為 1000 的倍數"
    )


@then(parsers.parse('金額 "{amount}" 被拒且顯示超過可提領上限'))
def amount_above_max(guarded_page, amount):
    withdrawal.expect_amount_error(
        guarded_page, RewardPage(guarded_page), amount, "提領Point不能超過"
    )


@given(parsers.parse('記下 "{node}" 的可提領點數'))
def memo_points(supabase_admin, run_state, scenario_memo, node):
    scenario_memo["points"] = available_points(supabase_admin, run_state.users[node])


@when(parsers.parse('"{node}" 透過 GUI 申請提領 {amount:d} 點'))
def apply_withdrawal(guarded_page, run_state, node, amount):
    user = run_state.users[node]
    login_via_gui(guarded_page, user)
    withdrawal.apply_via_gui(guarded_page, user, amount)


@then(parsers.parse('"{node}" 的可提領點數減少 {delta:d}'))
def points_decreased(supabase_admin, run_state, scenario_memo, node, delta):
    now = available_points(supabase_admin, run_state.users[node])
    expected = scenario_memo["points"] - delta
    assert now == expected, f"可提領 {now}P ≠ {scenario_memo['points']} - {delta}"


@when("管理員在提領管理將第一筆申請標記已匯款")
def admin_marks_paid(guarded_page, run_state):
    admin_page = _open_admin_withdrawals(guarded_page, run_state)
    admin_page.mark_first_withdrawal_paid()


@when("管理員在提領管理退件第一筆申請")
def admin_rejects(guarded_page, run_state):
    admin_page = _open_admin_withdrawals(guarded_page, run_state)
    admin_page.reject_first_withdrawal()


def _open_admin_withdrawals(page, run_state) -> AdminDashboardPage:
    login_admin(page, run_state.users["admin"])
    admin_page = AdminDashboardPage(page)
    admin_page.open_tab(WITHDRAWAL_TAB)
    return admin_page


@when(parsers.parse('"{node}" 透過 GUI 完成查收'))
def collect(guarded_page, run_state, node):
    user = run_state.users[node]
    login_via_gui(guarded_page, user)
    withdrawal.collect_via_gui(guarded_page, user)


@then(parsers.parse('資料庫中 "{node}" 最新一筆提領狀態為 "{status}"'))
def withdrawal_status(supabase_admin, run_state, node, status):
    row = _latest_withdrawal(supabase_admin, run_state.users[node].user_id)
    assert row["status"] == status, f"最新提領狀態 {row['status']} ≠ {status}（{row}）"


@then("\"A0\" 的可提領點數恢復為記下的數值")
def points_restored(supabase_admin, run_state, scenario_memo):
    now = available_points(supabase_admin, run_state.users["A0"])
    assert now == scenario_memo["points"], (
        f"退件後可提領 {now}P，未恢復為 {scenario_memo['points']}P——點數未退回"
    )
