"""20_referral_rewards.feature 的步驟定義——帳本與推薦樹斷言。"""

from __future__ import annotations

from playwright.sync_api import expect
from pytest_bdd import parsers, scenarios, then, when

from builders import referral_tree
from builders.login import login_via_gui
from tools import orgchart

scenarios("20_referral_rewards.feature")

# 「組織樹已建置完成」與 org_nodes / reward_amount fixtures 定義於
# steps/conftest.py（f30/f40/f50 共用）。


def _ledger(supabase_admin, user_id: str) -> list[dict]:
    return supabase_admin.rest_select(
        "reward_transactions",
        {"select": "amount,generation,type", "user_id": f"eq.{user_id}"},
    )


@then(parsers.parse('資料庫中 "{node}" 的獎勵代數分佈為 8/8/8'))
def ledger_distribution(supabase_admin, run_state, node):
    rows = _ledger(supabase_admin, run_state.users[node].user_id)
    by_gen = {g: sum(1 for r in rows if r.get("generation") == g) for g in (1, 2, 3)}
    assert by_gen == {1: 8, 2: 8, 3: 8}, f"{node} 代數分佈異常：{by_gen}"
    beyond = [r for r in rows if (r.get("generation") or 0) > 3]
    assert not beyond, f"{node} 出現第 4 代以上的獎勵：{beyond}"


@then(parsers.parse('資料庫中 "{node}" 的獎勵總點數等於其三代下線數乘以單代獎金'))
def ledger_total(supabase_admin, run_state, org_nodes, reward_amount, node):
    expected = orgchart.expected_reward_count(org_nodes, node) * reward_amount
    rows = _ledger(supabase_admin, run_state.users[node].user_id)
    total = sum(int(r["amount"]) for r in rows)
    assert total == expected, (
        f"{node} 帳本總額 {total}P ≠ 預期 {expected}P"
        f"（{orgchart.expected_reward_count(org_nodes, node)} 筆 × {reward_amount}P，"
        f"rows={rows}）"
    )


@when(parsers.parse('"{node}" 登入並開啟獎勵頁'))
def open_rewards(guarded_page, run_state, node):
    login_via_gui(guarded_page, run_state.users[node])
    guarded_page.goto("/rewards")
    expect(guarded_page.get_by_role("heading", name="獎勵回饋")).to_be_visible()


@then(parsers.parse('獎勵頁顯示的可提領點數等於 "{node}" 的預期總額'))
def rewards_page_balance(guarded_page, run_state, org_nodes, reward_amount, node):
    expected = orgchart.expected_reward_count(org_nodes, node) * reward_amount
    # RewardStats 的「總累積」「可提領」卡片皆以 `{n}P` 呈現；尚未提領時
    # 兩者同值——至少一張卡要出現正確數字。
    expect(guarded_page.get_by_text(f"{expected}P", exact=True).first).to_be_visible(
        timeout=15_000
    )


@when(parsers.parse('"{node}" 登入並開啟推薦頁'))
def open_referrals(guarded_page, run_state, scenario_memo, node):
    login_via_gui(guarded_page, run_state.users[node])
    guarded_page.goto("/referrals")
    referral_tree.wait_tree(guarded_page)
    scenario_memo["viewer"] = node


@then("推薦樹三個世代區塊各顯示 8 人")
def tree_generation_counts(guarded_page):
    # UI 改版後世代人數由 ReferralStats 桌面卡片承載（journey 跑桌面
    # viewport）：一代/二代/三代各一張卡，數值即該代人數。
    for label in ("一代", "二代", "三代"):
        card = guarded_page.locator('[data-slot="card"]').filter(
            has=guarded_page.locator('[data-slot="card-title"]', has_text=label)
        )
        expect(card.locator('[data-slot="card-content"]')).to_have_text("8", timeout=15_000)


@then(parsers.parse('展開全部世代後名單包含 "{node}" 的姓名'))
def tree_contains(guarded_page, run_state, org_nodes, scenario_memo, node):
    viewer = scenario_memo["viewer"]
    referral_tree.expand_ancestors(guarded_page, org_nodes, run_state, viewer, node)
    referral_tree.expect_node(guarded_page, org_nodes, run_state, viewer, node)


@then("推薦樹沒有第四代節點")
def tree_stops_at_the_third_generation(guarded_page):
    referral_tree.expect_three_generation_ceiling(guarded_page)
