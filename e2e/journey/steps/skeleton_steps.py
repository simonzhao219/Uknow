"""00_skeleton.feature 的步驟定義。"""

from __future__ import annotations

import re

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from builders import payment, registration
from builders.admin_bootstrap import ensure_admin
from pages.dashboard_page import DashboardPage
from tools import twid

scenarios("00_skeleton.feature")

REFERRAL_CODE_PATTERN = re.compile(r"^[a-z]{3}\d{6}$")  # 3 碼小寫英文 + 6 碼數字


def _user_for(run_state, node: str):
    return run_state.users.get(node) or run_state.new_user(
        node, twid.generate_for_node(run_state.run_id, node)
    )


@given("journey 測試環境已就緒")
def env_ready(journey_config, supabase_admin, dev_server):
    """把環境 fixture 串起來：缺設定 → skip；指向正式站 → 直接終止。"""


@given("管理員帳號已完成 bootstrap")
def admin_ready(supabase_admin, run_state):
    ensure_admin(supabase_admin, run_state)


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
    user = run_state.users[node]

    matches = supabase_admin.list_users_by_email_prefix(user.email)
    assert matches, f"auth.users 找不到 {user.email}"
    user.user_id = matches[0]["id"]

    subs = supabase_admin.rest_select(
        "subscriptions",
        {"select": "id,end_date,amount", "user_id": f"eq.{user.user_id}"},
    )
    assert subs, f"{node} 沒有任何訂閱列"
    assert subs[0]["amount"] == 1200, f"訂閱金額異常：{subs[0]}"

    orders = supabase_admin.rest_select(
        "payment_orders",
        {"select": "id,status", "user_id": f"eq.{user.user_id}", "status": "eq.completed"},
    )
    assert orders, f"{node} 沒有 completed 付款訂單"

    codes = supabase_admin.rest_select(
        "referral_codes",
        {"select": "code,status", "user_id": f"eq.{user.user_id}", "status": "eq.active"},
    )
    assert codes, f"{node} 沒有 active 推薦碼"
    code = codes[0]["code"]
    assert REFERRAL_CODE_PATTERN.fullmatch(code), f"推薦碼格式不符：{code}"

    user.referral_code = code
    run_state.save()
