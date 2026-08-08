"""50_withdrawal.feature 的步驟定義——提領雙視角全生命週期。"""

from __future__ import annotations

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from builders import withdrawal
from builders.login import login_admin, login_via_gui
from builders.referral_program import ensure_joined_via_gui
from builders.verification import available_points
from pages.admin_dashboard_page import AdminDashboardPage
from pages.reward_page import RewardPage
from tools import withdrawal_query

scenarios("50_withdrawal.feature")

WITHDRAWAL_TAB = "獎金提領管理"


@given(parsers.parse('"{node}" 已透過 GUI 加入推薦計畫'))
def joined_program(guarded_page, supabase_admin, run_state, node):
    ensure_joined_via_gui(guarded_page, supabase_admin, run_state.users[node])


@then("獎勵頁顯示尚未加入推薦計畫的提示")
def not_joined_hint(guarded_page):
    expect(guarded_page.get_by_text("尚未加入推薦計畫").first).to_be_visible(timeout=15_000)


@given(parsers.parse('"{node}" 當日的提領額度已解除'))
def clear_daily_withdrawal_quota(supabase_admin, run_state, node):
    withdrawal_query.backdate_todays_withdrawals(
        supabase_admin, run_state.users[node].user_id
    )


def _latest_withdrawal(supabase_admin, user_id: str) -> dict:
    # 查詢與欄位名收在 tools/withdrawal_query.py,由離線測試比對 migration
    # ——欄位打錯時在 journey-offline 軌就紅,不必等真後端回一句 400。
    return withdrawal_query.latest_withdrawal(supabase_admin, user_id)


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


@when(parsers.parse('管理員在提領管理將 "{node}" 的申請標記已匯款'))
def admin_marks_paid(guarded_page, run_state, node):
    admin_page = _open_admin_withdrawals(guarded_page, run_state)
    admin_page.mark_withdrawal_paid(run_state.users[node].name)


@when(parsers.parse('管理員在提領管理退件 "{node}" 的申請'))
def admin_rejects(guarded_page, run_state, node):
    admin_page = _open_admin_withdrawals(guarded_page, run_state)
    admin_page.reject_withdrawal(run_state.users[node].name)


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
