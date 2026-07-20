"""00_skeleton.feature 的步驟定義。

檔名的 f00 前綴決定收集順序：骨架（A0）→ f10 建樹（其餘 29 人，
已建置的節點冪等跳過）→ f20 帳本與樹的斷言。
"""

from __future__ import annotations

from playwright.sync_api import expect
from pytest_bdd import parsers, scenarios, then, when

from builders import payment, registration
from builders.verification import fetch_backend_landing
from pages.dashboard_page import DashboardPage
from tools import twid

scenarios("00_skeleton.feature")


def _user_for(run_state, node: str):
    return run_state.users.get(node) or run_state.new_user(
        node, twid.generate_for_node(run_state.run_id, node)
    )


@when(parsers.parse('使用者 "{node}" 走完 GUI 註冊流程'))
def register(guarded_page, supabase_admin, run_state, node):
    registration.register_via_gui(guarded_page, supabase_admin, _user_for(run_state, node))


@when(parsers.parse('使用者 "{node}" 以測試卡完成付款'))
def pay(guarded_page, journey_config, node):
    payment.pay_via_gui(guarded_page, journey_config)


@then(parsers.parse('"{node}" 可以進入會員儀表板'))
def dashboard_reachable(guarded_page, node):
    guarded_page.goto("/dashboard")
    expect(DashboardPage(guarded_page).heading()).to_be_visible(timeout=30_000)


@then(parsers.parse('後端已為 "{node}" 落地訂閱、完成訂單與 active 推薦碼'))
def backend_landed(supabase_admin, run_state, node):
    fetch_backend_landing(supabase_admin, run_state.users[node])
    run_state.save()
