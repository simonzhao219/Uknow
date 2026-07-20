"""10_org_build.feature 的步驟定義——30 人建樹與推薦邊驗證。"""

from __future__ import annotations

import pytest
from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from builders import org_builder
from pages.auth_page import AuthPage
from tools import orgchart

scenarios("10_org_build.feature")

# 「journey 測試環境已就緒」「管理員帳號已完成 bootstrap」是共用步驟，
# 定義於 steps/conftest.py（pytest-bdd 步驟不跨模組共享，只認 conftest 鏈）。


@given(parsers.parse('節點 "{node}" 已完成建置'))
def node_built(run_state, node):
    user = run_state.users.get(node)
    if not (user and user.referral_code):
        pytest.skip(f"{node} 尚未建置——請先跑 00_skeleton / 10_org_build 的建樹情境")


@when("依 orgchart 逐代以 GUI 建置組織樹")
def build_tree(journey_config, supabase_admin, run_state, dev_server):
    org_builder.build_tree(journey_config, supabase_admin, run_state)


@then("30 個節點全數擁有 active 推薦碼")
def all_nodes_built(run_state):
    nodes = orgchart.load_nodes()
    assert len(nodes) == 30
    missing = [
        n for n in nodes
        if not run_state.users.get(n) or not run_state.users[n].referral_code
    ]
    assert not missing, f"缺推薦碼的節點：{missing}"


@then("每個節點的推薦邊都指向 orgchart 宣告的上線")
def edges_match(supabase_admin, run_state):
    org_builder.verify_edges(supabase_admin, run_state)


@when(parsers.parse('訪客在註冊入口輸入 "{node}" 的 email'))
def visitor_enters_existing_email(guarded_page, run_state, node):
    auth = AuthPage(guarded_page)
    guarded_page.goto("/register")
    auth.fill_email(run_state.users[node].email)
    auth.submit_email()


@then("畫面切換為登入表單")
def shows_login_form(guarded_page):
    expect(guarded_page.get_by_test_id("auth-login-button")).to_be_visible()
