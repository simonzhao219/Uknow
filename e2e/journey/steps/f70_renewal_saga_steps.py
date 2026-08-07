"""70_renewal_saga.feature 的步驟定義——「阿凱的七年」章節劇本。

cast 獨立於 30 人主樹:orgchart-saga.yaml 不走 tools/orgchart.load_nodes()
的單根管線,由本檔自帶載入;只共用 registration/payment builder 層與
page objects(f60 的 scratch 使用者已有同型先例)。預設推薦人 P0 由
saga 自備:P0 首購後,harness 把它的推薦碼寫入分支的
reward_config.default_referrer_code(僅拋棄式分支的 seed 調整,人審
2026-08-07 裁決)。對 P0 的獎勵斷言一律用事件前後 delta。
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
import yaml
from playwright.sync_api import Page, expect
from pytest_bdd import given, parsers, scenarios, then, when

from datetime import datetime, timezone

from builders import payment
from builders.login import login_admin, login_via_gui
from builders.org_builder import _build_one
from pages.payment_checkout_page import PaymentCheckoutPage
from run_state import JourneyUser
from tools import seed_time_machine, twid

scenarios("70_renewal_saga.feature")

SAGA_CHART_PATH = Path(__file__).resolve().parent.parent / "orgchart-saga.yaml"


@pytest.fixture(scope="session")
def saga():
    """saga 級跨情境狀態:名冊、P0 身分、點數快照(marks)。

    P0 身分在「名冊就緒」Given 裡回填(要先建 P0 才有身分可解析)。"""
    nodes = yaml.safe_load(SAGA_CHART_PATH.read_text(encoding="utf-8"))["nodes"]
    return {"nodes": nodes, "p": None, "marks": {}}


def _points_sum(admin, user_id: str) -> int:
    rows = admin.rest_select(
        "reward_transactions", {"select": "amount", "user_id": f"eq.{user_id}"}
    )
    return sum(int(r["amount"]) for r in rows)


def _task_monthly_count(admin, user_id: str) -> int:
    """task_progress.monthly_referrals 全月桶的配對總數(saga 在同月內跑,
    足以偵測「任務有沒有 +1」)。"""
    rows = admin.rest_select(
        "task_progress", {"select": "monthly_referrals", "user_id": f"eq.{user_id}"}
    )
    if not rows:
        return 0
    buckets = rows[0].get("monthly_referrals") or {}
    return sum(len(v or []) for v in buckets.values())


def _latest_end_date(admin, user_id: str) -> datetime:
    rows = admin.rest_select(
        "subscriptions",
        {"select": "end_date", "user_id": f"eq.{user_id}",
         "order": "end_date.desc", "limit": "1"},
    )
    assert rows, f"user {user_id} 沒有訂閱列"
    return datetime.fromisoformat(rows[0]["end_date"].replace("Z", "+00:00"))


def _ensure_actor(cfg, admin, run_state, node,
                  referral_code=None, referrer_name=None):
    """演員首次登場時經 GUI 建置(註冊三步+付款);已建置(有推薦碼)
    則跳過——與 org_builder 同一冪等原則,--lf 重跑不重建。

    _build_one 必須丟 worker thread:pytest-playwright 的 sync API 讓
    主執行緒帶著 asyncio loop,主執行緒再開 sync_playwright() 會炸
    「Sync API inside asyncio loop」(run 31147957094 實測;10_org 的
    ThreadPoolExecutor 是同一個理由)。"""
    user = run_state.users.get(node)
    if user and user.referral_code:
        return user
    admin.reset_check_email_rate_limit()
    if user is None:
        user = run_state.new_user(node, twid.generate_for_node(run_state.run_id, node))
    with ThreadPoolExecutor(max_workers=1) as pool:
        pool.submit(_build_one, cfg, admin, user, referral_code, referrer_name).result()
    run_state.save()
    return user


def _fresh_gui_login(page: Page, user: JourneyUser, wait_for: str | None) -> None:
    """清掉既有 session 再登入——saga 一個情境內會連續以 admin/演員多重
    身分登入同一個 guarded_page,不清的話 /login 的「已登入自動導向」
    會把第二次登入直接彈走。"""
    page.goto("/")
    page.evaluate("window.localStorage.clear(); window.sessionStorage.clear()")
    login_via_gui(page, user, wait_for=wait_for)


@given("saga 演員名冊與預設推薦人 P0 已就緒")
def saga_roster_ready(saga, journey_config, supabase_admin, run_state):
    # P0 必須先於預設碼設定完成首購(此刻分支上還沒有預設碼,P0 自然
    # 無上代);之後把 P0 的碼接上 reward_config,再解析身分自檢閉環。
    p0 = _ensure_actor(journey_config, supabase_admin, run_state, "P0")
    seed_time_machine.set_default_referrer_code(supabase_admin, p0.referral_code)
    identity = seed_time_machine.resolve_default_referrer_identity(supabase_admin)
    assert identity["user_id"] == p0.user_id, (
        f"預設碼解析到 {identity},不是 P0({p0.user_id})"
    )
    saga["p"] = identity
    # P0 的點數基準:在任何 saga 事件之前快照一次(setdefault 讓後續
    # 章節的 Background 不會覆蓋)。
    saga["marks"].setdefault(
        "saga_start", _points_sum(supabase_admin, identity["user_id"])
    )


@when(parsers.parse('saga 演員 "{node}" 不填推薦碼完成首購'))
def saga_purchase_without_code(saga, journey_config, supabase_admin, run_state, node):
    assert node in saga["nodes"], f"{node} 不在 orgchart-saga.yaml 名冊中"
    saga["marks"]["p_before_event"] = _points_sum(supabase_admin, saga["p"]["user_id"])
    _ensure_actor(journey_config, supabase_admin, run_state, node)


@when(parsers.parse('saga 演員 "{node}" 以 "{referrer}" 的推薦碼完成首購'))
def saga_purchase_with_code(saga, journey_config, supabase_admin, run_state, node, referrer):
    assert node in saga["nodes"], f"{node} 不在 orgchart-saga.yaml 名冊中"
    ref = run_state.users[referrer]
    saga["marks"]["p_before_event"] = _points_sum(supabase_admin, saga["p"]["user_id"])
    _ensure_actor(journey_config, supabase_admin, run_state, node,
                  referral_code=ref.referral_code, referrer_name=ref.name)


@then(parsers.parse('"{node}" 的上代在管理台會員詳情顯示為預設推薦人'))
def admin_detail_shows_default_referrer(guarded_page, run_state, saga, node):
    member = run_state.users[node]
    guarded_page.goto("/")
    guarded_page.evaluate("window.localStorage.clear(); window.sessionStorage.clear()")
    login_admin(guarded_page, run_state.users["admin"])
    guarded_page.get_by_role("tab", name="會員管理").click()
    search = guarded_page.get_by_placeholder("搜尋姓名 / Email / 電話")
    expect(search).to_be_visible(timeout=15_000)
    search.fill(member.email)
    search.press("Enter")
    detail_btn = guarded_page.get_by_role(
        "button", name=f"查看 {member.name} 的詳情"
    )
    expect(detail_btn).to_be_visible(timeout=15_000)
    detail_btn.click()
    expect(guarded_page.get_by_text("推薦人", exact=True)).to_be_visible(timeout=15_000)
    # 詳情 Sheet 內的「推薦人」dd 顯示 P0 的真實姓名(P0 名帶 run_id,
    # 不會與畫面其他文字撞名)。
    expect(guarded_page.get_by_text(saga["p"]["name"], exact=True).first).to_be_visible()


@then(parsers.parse('"{node}" 的預設推薦標記已寫入【DB】'))
def default_flag_written(supabase_admin, run_state, node):
    rows = supabase_admin.rest_select(
        "profiles",
        {"select": "referred_by_is_default", "id": f"eq.{run_state.users[node].user_id}"},
    )
    assert rows, f"{node} 沒有 profiles 列"
    assert rows[0]["referred_by_is_default"] is True, (
        f"{node} 的 referred_by_is_default 應為 true:{rows[0]}"
    )


@then(parsers.parse('"{node}" 的推薦邊指向 "{referrer}"【DB】'))
def edge_points_to(supabase_admin, run_state, node, referrer):
    edges = supabase_admin.rest_select(
        "referral_edges",
        {"select": "referrer_user_id",
         "referee_user_id": f"eq.{run_state.users[node].user_id}"},
    )
    assert edges, f"{node} 沒有推薦邊"
    expected = run_state.users[referrer].user_id
    assert edges[0]["referrer_user_id"] == expected, (
        f"{node} 的推薦邊指向 {edges[0]['referrer_user_id']},應為 {referrer}"
    )


@then(parsers.parse('"{referrer}" 因 "{node}" 的首購獲得第 {gen:d} 代獎勵【DB】'))
def referrer_rewarded_at_generation(supabase_admin, run_state, reward_amount,
                                    referrer, node, gen):
    rows = supabase_admin.rest_select(
        "reward_transactions",
        {"select": "amount,generation",
         "user_id": f"eq.{run_state.users[referrer].user_id}",
         "referee_user_id": f"eq.{run_state.users[node].user_id}",
         "generation": f"eq.{gen}"},
    )
    assert rows, f"{referrer} 沒有因 {node} 的第 {gen} 代獎勵"
    assert int(rows[0]["amount"]) == reward_amount, f"獎勵金額異常:{rows[0]}"


@then(parsers.parse('"{node}" 的任務卡顯示進度 {count:d}/8'))
def task_card_shows_progress(guarded_page, supabase_admin, run_state, node, count):
    # feature 寫死 /8;若分支 reward_config 門檻被調參,這裡先炸出設定
    # 漂移,而不是讓字串斷言神祕失敗。
    threshold = int(supabase_admin.reward_config()["referral_king_monthly_threshold"])
    assert threshold == 8, f"推薦王門檻是 {threshold},與 feature 寫死的 8 不符"
    _fresh_gui_login(guarded_page, run_state.users[node], "會員中心")
    guarded_page.goto("/tasks")
    expect(guarded_page.get_by_role("heading", name="任務中心")).to_be_visible(
        timeout=15_000
    )
    expect(guarded_page.get_by_text(f"{count} / {threshold}").first).to_be_visible(
        timeout=15_000
    )


@then(parsers.parse('預設推薦人本章的點數增量合計 {amount:d}P【DB】'))
def p_delta_since_saga_start(saga, supabase_admin, amount):
    now = _points_sum(supabase_admin, saga["p"]["user_id"])
    delta = now - saga["marks"]["saga_start"]
    assert delta == amount, f"P0 自 saga 開始的點數增量 {delta} != {amount}"


@then(parsers.parse('預設推薦人本次事件的點數增量為 {amount:d}P【DB】'))
def p_delta_last_event(saga, supabase_admin, amount):
    now = _points_sum(supabase_admin, saga["p"]["user_id"])
    delta = now - saga["marks"]["p_before_event"]
    assert delta == amount, f"P0 本次事件的點數增量 {delta} != {amount}"


@then(parsers.parse('"{node}" 於 active 期間開啟付款頁被導回儀表板並顯示訂閱中'))
def active_checkout_redirects_to_dashboard(guarded_page, run_state, node):
    _fresh_gui_login(guarded_page, run_state.users[node], "會員中心")
    guarded_page.goto("/payment/checkout")
    # active 的真實訊號:resolveCheckoutPageRedirect 靜默導回 /dashboard,
    # 付款頁不渲染任何訊息(第 2 輪審查 UIUX P1-1 核實)。
    guarded_page.wait_for_url("**/dashboard**", timeout=30_000)
    expect(guarded_page.get_by_text("訂閱中").first).to_be_visible(timeout=15_000)


# ===========================================================================
# 第 3 章 補繳 extend——接續原效期、每筆各發獎、失效上線照收
# ===========================================================================


@given(parsers.parse('saga 將 "{node}" 推入剛過期'))
def saga_push_recently_expired(saga, supabase_admin, run_state, node):
    seed_time_machine.enter_recently_expired(supabase_admin, run_state.users[node].user_id)


@given(parsers.parse('saga 將 "{node}" 推入過期超過一年並記下接續錨點'))
def saga_push_expired_over_year(saga, supabase_admin, run_state, node):
    row = seed_time_machine.enter_expired_over_a_year(supabase_admin, run_state.users[node].user_id)
    saga["marks"]["k0_anchor_end"] = datetime.fromisoformat(
        row["end_date"].replace("Z", "+00:00")
    )


@when(parsers.parse('"{node}" 開付款頁並以續約逐筆補繳 2 筆'))
def saga_backfill_two_installments(saga, guarded_page, journey_config, supabase_admin,
                                   run_state, node):
    user = run_state.users[node]
    # U1 是收獎方,補繳前快照它的點數與任務數,供「+200」與「任務不增」斷言。
    u1 = run_state.users["U1"]
    saga["marks"]["u1_points_before_backfill"] = _points_sum(supabase_admin, u1.user_id)
    saga["marks"]["u1_tasks_before_backfill"] = _task_monthly_count(supabase_admin, u1.user_id)

    # 過期會員登入落點由 resolveMembershipRedirect 決定(不是會員中心),
    # 故 wait_for=None 後顯式導向付款頁。
    _fresh_gui_login(guarded_page, user, None)
    guarded_page.goto("/payment/checkout")
    expect(guarded_page.get_by_test_id("renewal-mode-section")).to_be_visible(timeout=30_000)
    guarded_page.get_by_test_id("renewal-mode-extend").click()
    # A1 揭露:過期超過一年,補繳筆數/總額卡應可見。
    expect(guarded_page.get_by_test_id("backfill-disclosure")).to_be_visible()

    # 第一筆:仍未補到 active → backfill_progress;點「繼續補繳」回結帳頁。
    payment.pay_backfill_installment(
        guarded_page, journey_config, supabase_admin, user, expect_more=True
    )
    guarded_page.get_by_test_id("continue-backfill-button").click()
    expect(guarded_page.get_by_test_id("renewal-mode-section")).to_be_visible(timeout=30_000)
    guarded_page.get_by_test_id("renewal-mode-extend").click()
    # 第二筆:補到 active → success。
    payment.pay_backfill_installment(
        guarded_page, journey_config, supabase_admin, user, expect_more=False
    )
    saga["marks"]["u1_points_after_backfill"] = _points_sum(supabase_admin, u1.user_id)
    saga["marks"]["u1_tasks_after_backfill"] = _task_monthly_count(supabase_admin, u1.user_id)


@then(parsers.parse('"{node}" 的最新到期日接續原錨點約兩年【DB】'))
def end_date_extends_two_years(saga, supabase_admin, run_state, node):
    new_end = _latest_end_date(supabase_admin, run_state.users[node].user_id)
    anchor = saga["marks"]["k0_anchor_end"]
    days = (new_end - anchor).days
    # 兩筆接續 = 錨點 +2 年(閏年容差);且必須落在未來(補到 active)。
    assert 725 <= days <= 733, f"接續兩年迄日距錨點 {days} 天,非約兩年"
    assert new_end > datetime.now(timezone.utc), "補繳後仍未 active"


@then(parsers.parse('"{node}" 的上代仍為 "{referrer}"【DB】'))
def upline_unchanged(supabase_admin, run_state, node, referrer):
    edges = supabase_admin.rest_select(
        "referral_edges",
        {"select": "referrer_user_id",
         "referee_user_id": f"eq.{run_state.users[node].user_id}"},
    )
    assert edges and edges[0]["referrer_user_id"] == run_state.users[referrer].user_id, (
        f"{node} 的上代不是 {referrer}:{edges}"
    )


@then(parsers.parse('"{referrer}" 因 "{node}" 的補繳獲得續約獎勵合計 200P——失效上線照收【DB】'))
def backfill_renewal_reward_200(saga, supabase_admin, run_state, referrer, node):
    before = saga["marks"]["u1_points_before_backfill"]
    after = saga["marks"]["u1_points_after_backfill"]
    assert after - before == 200, f"{referrer} 補繳續約獎增量 {after - before} != 200"


@then(parsers.parse('"{referrer}" 因 "{node}" 的補繳任務進度不增加【DB】'))
def backfill_task_unchanged(saga, supabase_admin, run_state, referrer, node):
    before = saga["marks"]["u1_tasks_before_backfill"]
    after = saga["marks"]["u1_tasks_after_backfill"]
    assert after == before, f"{referrer} 補繳後任務數變了:{before} → {after}(續約不該 +1)"


# ===========================================================================
# 第 4 章 fresh 換樹清空——A14 揭露、A15 二次確認、U2 首次配對
# ===========================================================================


@when(parsers.parse('"{node}" 開付款頁選新約、填 "{referrer}" 的碼、經 A14 揭露與 A15 二次確認完成付款'))
def saga_fresh_switch_tree(saga, guarded_page, journey_config, supabase_admin,
                           run_state, node, referrer):
    user = run_state.users[node]
    new_ref = run_state.users[referrer]
    # U2 是新配對收獎方,快照供 gen1 +100 與任務 1/8 斷言。
    saga["marks"]["u2_points_before_fresh"] = _points_sum(supabase_admin, new_ref.user_id)

    _fresh_gui_login(guarded_page, user, None)
    guarded_page.goto("/payment/checkout")
    expect(guarded_page.get_by_test_id("renewal-mode-section")).to_be_visible(timeout=30_000)
    guarded_page.get_by_test_id("renewal-mode-fresh").click()
    code_input = guarded_page.get_by_test_id("new-referral-code-input")
    code_input.fill(new_ref.referral_code)
    code_input.blur()
    expect(guarded_page.get_by_test_id("new-referrer-name")).to_contain_text(
        new_ref.name, timeout=10_000
    )
    # A14:清空揭露卡應可見(K0 帳上有 W1 帶來的 100P,forfeit 子句會唸出)。
    expect(guarded_page.get_by_test_id("fresh-forfeit-disclosure")).to_be_visible()
    # A15 二次確認在 pay_fresh_via_gui 內斷言對話框後確認。
    payment.pay_fresh_via_gui(guarded_page, journey_config, supabase_admin, user)


@then(parsers.parse('"{node}" 的上代已改為 "{referrer}"【DB】'))
def upline_switched(supabase_admin, run_state, node, referrer):
    edges = supabase_admin.rest_select(
        "referral_edges",
        {"select": "referrer_user_id",
         "referee_user_id": f"eq.{run_state.users[node].user_id}"},
    )
    assert edges and edges[0]["referrer_user_id"] == run_state.users[referrer].user_id, (
        f"{node} 的上代未 rewire 到 {referrer}:{edges}"
    )


@then(parsers.parse('"{node}" 的可提領點數已歸零【DB】'))
def ledger_zeroed(supabase_admin, run_state, node):
    # fresh 清空:ledger_reset 沖銷列讓帳本總和歸零(明細封存不刪,只增列)。
    total = _points_sum(supabase_admin, run_state.users[node].user_id)
    assert total == 0, f"{node} 帳本清空後總和應為 0,實為 {total}"


@then(parsers.parse('"{node}" 的獎勵明細出現「新約重置」列'))
def reward_history_shows_ledger_reset(guarded_page, run_state, node):
    _fresh_gui_login(guarded_page, run_state.users[node], None)
    guarded_page.goto("/rewards")
    expect(guarded_page.get_by_role("heading", name="獎勵明細")).to_be_visible(timeout=15_000)
    # rewardHistoryFilter.ts:REWARD_SOURCE_LABELS.ledger_reset = '新約重置'
    expect(guarded_page.get_by_text("新約重置").first).to_be_visible(timeout=15_000)


@then(parsers.parse('"{referrer}" 因 "{node}" 的新約獲得第 {gen:d} 代獎勵【DB】'))
def fresh_referrer_rewarded(supabase_admin, run_state, reward_amount, referrer, node, gen):
    rows = supabase_admin.rest_select(
        "reward_transactions",
        {"select": "amount,generation",
         "user_id": f"eq.{run_state.users[referrer].user_id}",
         "referee_user_id": f"eq.{run_state.users[node].user_id}",
         "generation": f"eq.{gen}"},
    )
    assert rows, f"{referrer} 沒有因 {node} 的新約第 {gen} 代獎勵"
    assert int(rows[0]["amount"]) == reward_amount, f"獎勵金額異常:{rows[0]}"
