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


def _fresh_gui_login(page: Page, user: JourneyUser) -> None:
    """清掉既有 session 再登入——saga 一個情境內會連續以 admin/演員多重
    身分登入同一個 guarded_page,不清的話 /login 的「已登入自動導向」
    會把第二次登入直接彈走。登入成功信號=登入表單消失(login_via_gui
    自帶);落點由會籍狀態決定,呼叫端一律自行 goto 目標頁。"""
    page.goto("/")
    page.evaluate("window.localStorage.clear(); window.sessionStorage.clear()")
    login_via_gui(page, user)


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
    _fresh_gui_login(guarded_page, run_state.users[node])
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
    _fresh_gui_login(guarded_page, run_state.users[node])
    guarded_page.goto("/payment/checkout")
    # active 的真實訊號:resolveCheckoutPageRedirect 靜默導回 /dashboard,
    # 付款頁不渲染任何訊息(第 2 輪審查 UIUX P1-1 核實)。
    guarded_page.wait_for_url("**/dashboard**", timeout=30_000)
    expect(guarded_page.get_by_text("訂閱中").first).to_be_visible(timeout=15_000)


# ===========================================================================
# 第 3 章 補繳 extend——接續原效期、每筆各發獎、失效上線照收
# ===========================================================================


@given(parsers.parse('saga 將 "{node}" 推入剛過期'))
@when(parsers.parse('saga 將 "{node}" 推入剛過期'))
def saga_push_recently_expired(saga, supabase_admin, run_state, node):
    # ch3/ch4 以 Given 用、ch6 在 When 之後以 And 用——pytest-bdd 的步驟
    # 綁定分關鍵字,兩種都要註冊(run 31154089148:ch6 走到這步才炸
    # StepDefinitionNotFound,--collect-only 抓不到這類缺口)。
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

    _fresh_gui_login(guarded_page, user)
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

    _fresh_gui_login(guarded_page, user)
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
    _fresh_gui_login(guarded_page, run_state.users[node])
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


# ===========================================================================
# 第 6 章 Q9 防線——待審提領擋 fresh,駁回退點後解封
# ===========================================================================


@given(parsers.parse('saga 種給 "{node}" {amount:d}P 種子點數'))
def saga_seed_points(supabase_admin, run_state, node, amount):
    # 「這些點怎麼賺來的」由 20_referral_rewards 覆蓋,saga 只驗封鎖
    # (人審裁決 #4);種子額列入終章對帳推導。
    seed_time_machine.seed_reward_points(
        supabase_admin, run_state.users[node].user_id, amount, run_state.run_id
    )


@when(parsers.parse('"{node}" 完成身分驗證並申請提領 {amount:d}P'))
def saga_apply_withdrawal(guarded_page, supabase_admin, run_state, node, amount):
    from builders import referral_program, withdrawal

    user = run_state.users[node]
    # 提領硬前置:profiles.referral_program_joined(推薦碼在付款時就有,
    # 但 joined 要走簽名對話框;未加入時提領按鈕直接 disabled——
    # run 31152461663 實測)。ensure_joined 自帶登入,先清 session。
    guarded_page.goto("/")
    guarded_page.evaluate("window.localStorage.clear(); window.sessionStorage.clear()")
    referral_program.ensure_joined_via_gui(guarded_page, supabase_admin, user)
    _fresh_gui_login(guarded_page, user)
    withdrawal.apply_via_gui(guarded_page, user, amount)


@then(parsers.parse('"{node}" 的付款頁新約選項因待審提領被停用'))
def fresh_blocked_by_pending_withdrawal(guarded_page, run_state, node):
    _fresh_gui_login(guarded_page, run_state.users[node])
    guarded_page.goto("/payment/checkout")
    expect(guarded_page.get_by_test_id("renewal-mode-section")).to_be_visible(timeout=30_000)
    # PaymentCheckout 的 A16 文案(hasPendingWithdrawal)。
    expect(
        guarded_page.get_by_text("請等待審核完成，或聯繫客服").first
    ).to_be_visible(timeout=15_000)


@when("管理員在管理台駁回第一筆提領")
def admin_rejects_first_withdrawal(guarded_page, run_state):
    from pages.admin_dashboard_page import AdminDashboardPage

    guarded_page.goto("/")
    guarded_page.evaluate("window.localStorage.clear(); window.sessionStorage.clear()")
    login_admin(guarded_page, run_state.users["admin"])
    admin_page = AdminDashboardPage(guarded_page)
    admin_page.open_tab("獎金提領管理")
    admin_page.reject_first_withdrawal()


@then(parsers.parse('"{node}" 的付款頁新約選項恢復可選'))
def fresh_unblocked_after_rejection(guarded_page, run_state, node):
    _fresh_gui_login(guarded_page, run_state.users[node])
    guarded_page.goto("/payment/checkout")
    expect(guarded_page.get_by_test_id("renewal-mode-section")).to_be_visible(timeout=30_000)
    expect(guarded_page.get_by_text("請等待審核完成，或聯繫客服")).to_have_count(0)
    guarded_page.get_by_test_id("renewal-mode-fresh").click()
    # 解封的正向證據:fresh 面板真的展開(揭露卡或推薦碼輸入其一可見)。
    expect(
        guarded_page.get_by_test_id("fresh-forfeit-disclosure")
        .or_(guarded_page.get_by_test_id("new-referral-code-input"))
        .first
    ).to_be_visible(timeout=15_000)


# ===========================================================================
# 第 7 章 S9 與 Q14a——填現任上代碼照樣清空,歷史桶跨清空保留
# ===========================================================================


@given(parsers.parse('saga 將 "{node}" 的任務月桶平移至上月'))
def saga_age_monthly_bucket(supabase_admin, run_state, node):
    # 平移在 fresh 清空**之前**做:W2 的配對記錄搬進歷史桶,清空只動
    # 當月桶——之後 W2 續約仍不 +1,證明的才是「跨清空保留」(Q14a),
    # 不是同月去重。
    seed_time_machine.age_monthly_bucket(
        supabase_admin, run_state.users[node].user_id, 1
    )


@when(parsers.parse('saga 快照收獎基準並將 "{node}" 推入剛過期'))
def saga_snapshot_and_expire(saga, supabase_admin, run_state, node):
    k0 = run_state.users["K0"]
    u2 = run_state.users["U2"]
    saga["marks"]["k0_points_before_w2_renewal"] = _points_sum(supabase_admin, k0.user_id)
    saga["marks"]["k0_tasks_before_w2_renewal"] = _task_monthly_count(supabase_admin, k0.user_id)
    saga["marks"]["u2_points_before_w2_renewal"] = _points_sum(supabase_admin, u2.user_id)
    seed_time_machine.enter_recently_expired(supabase_admin, run_state.users[node].user_id)


@when(parsers.parse('"{node}" 以續約完成一筆補繳'))
def saga_single_backfill(guarded_page, journey_config, supabase_admin, run_state, node):
    user = run_state.users[node]
    _fresh_gui_login(guarded_page, user)
    guarded_page.goto("/payment/checkout")
    expect(guarded_page.get_by_test_id("renewal-mode-section")).to_be_visible(timeout=30_000)
    guarded_page.get_by_test_id("renewal-mode-extend").click()
    payment.pay_backfill_installment(
        guarded_page, journey_config, supabase_admin, user, expect_more=False
    )


@then(parsers.parse('"{node}" 因 "{referee}" 的續約獎勵增量 100P 且任務不增加【DB】'))
def renewal_reward_but_no_task(saga, supabase_admin, run_state, node, referee):
    k0 = run_state.users[node]
    points_delta = (
        _points_sum(supabase_admin, k0.user_id)
        - saga["marks"]["k0_points_before_w2_renewal"]
    )
    tasks_delta = (
        _task_monthly_count(supabase_admin, k0.user_id)
        - saga["marks"]["k0_tasks_before_w2_renewal"]
    )
    assert points_delta == 100, f"{node} 續約獎增量 {points_delta} != 100(M6 每筆事件都發)"
    assert tasks_delta == 0, (
        f"{node} 任務增量 {tasks_delta} != 0——歷史桶跨清空保留失效(Q14a)"
    )


@then(parsers.parse('"{node}" 因 "{referee}" 的續約獲得第 2 代獎勵增量 100P【DB】'))
def renewal_gen2_reward_delta(saga, supabase_admin, run_state, node, referee):
    u2 = run_state.users[node]
    delta = (
        _points_sum(supabase_admin, u2.user_id)
        - saga["marks"]["u2_points_before_w2_renewal"]
    )
    assert delta == 100, f"{node} 續約 gen2 增量 {delta} != 100"


# ===========================================================================
# 第 8 章 credit 與 A8——過期不能領,補繳復活後領取改現有列且雙事件各發獎
# ===========================================================================


@given(parsers.parse('saga 依 "{node}" 的既有月桶種一張未領取的推薦王 credit'))
def saga_seed_king_credit(supabase_admin, run_state, node):
    # month_key 取自該使用者**現有**月桶 key(含 ch7 平移後的),不自行
    # 推算現在月份——與 age_monthly_bucket 同一準則(plan §2.3)。
    user = run_state.users[node]
    rows = supabase_admin.rest_select(
        "task_progress", {"select": "monthly_referrals", "user_id": f"eq.{user.user_id}"}
    )
    buckets = (rows and rows[0].get("monthly_referrals")) or {}
    assert buckets, f"{node} 沒有任何月桶,無法決定 credit 的 month_key"
    seed_time_machine.seed_unclaimed_king_credit(
        supabase_admin, user.user_id, max(buckets.keys())
    )


@then(parsers.parse('"{node}" 因會籍失效連任務中心也進不了——credit 仍未領取【DB】'))
def claim_blocked_when_expired(guarded_page, supabase_admin, run_state, node):
    user = run_state.users[node]
    _fresh_gui_login(guarded_page, user)
    guarded_page.goto("/tasks")
    # A8 的 GUI 真相:RequireMembershipRoute 把過期會員一律導回
    # /payment/checkout——過期時到不了任務中心,claim 從入口就被擋
    # (run 31156146124 實測;TaskDashboard 的「暫無法領取」文案只有
    # 非過期的封鎖態才看得到)。
    guarded_page.wait_for_url("**/payment/checkout**", timeout=30_000)
    rows = supabase_admin.rest_select(
        "referral_king_rewards",
        {"select": "status", "user_id": f"eq.{user.user_id}"},
    )
    assert rows and rows[0]["status"] == "unclaimed", f"credit 狀態異常:{rows}"


@when("saga 快照第 8 章收獎基準")
def saga_snapshot_ch8(saga, supabase_admin, run_state):
    u2 = run_state.users["U2"]
    saga["marks"]["ch8_u2_points"] = _points_sum(supabase_admin, u2.user_id)
    saga["marks"]["ch8_u2_tasks"] = _task_monthly_count(supabase_admin, u2.user_id)


@then(parsers.parse('"{node}" 因 "{referee}" 的補繳獲得第 1 代續約獎勵增量 100P【DB】'))
def ch8_backfill_gen1_delta(saga, supabase_admin, run_state, node, referee):
    delta = (
        _points_sum(supabase_admin, run_state.users[node].user_id)
        - saga["marks"]["ch8_u2_points"]
    )
    assert delta == 100, f"{node} 補繳後增量 {delta} != 100"


@when(parsers.parse('"{node}" 於任務中心領取免費續約獎勵'))
def saga_claim_king_reward(saga, guarded_page, supabase_admin, run_state, node):
    from builders import tasks

    user = run_state.users[node]
    # claim 前錨點:迄日與訂閱列數(M2 第三路徑=改現有列,不新增列)。
    saga["marks"]["ch8_k0_end_before_claim"] = _latest_end_date(supabase_admin, user.user_id)
    subs = supabase_admin.rest_select(
        "subscriptions", {"select": "id", "user_id": f"eq.{user.user_id}"}
    )
    saga["marks"]["ch8_k0_sub_rows"] = len(subs)
    _fresh_gui_login(guarded_page, user)
    tasks.open_task_center(guarded_page)
    tasks.claim_first_pending_reward(guarded_page, user)


@then(parsers.parse('"{node}" 的最新到期日因領取再延長約一年且訂閱列數不變【DB】'))
def claim_extends_year_same_rows(saga, supabase_admin, run_state, node):
    user = run_state.users[node]
    new_end = _latest_end_date(supabase_admin, user.user_id)
    days = (new_end - saga["marks"]["ch8_k0_end_before_claim"]).days
    assert 360 <= days <= 370, f"claim 後迄日延長 {days} 天,非約一年"
    subs = supabase_admin.rest_select(
        "subscriptions", {"select": "id", "user_id": f"eq.{user.user_id}"}
    )
    assert len(subs) == saga["marks"]["ch8_k0_sub_rows"], (
        f"claim 改變訂閱列數 {saga['marks']['ch8_k0_sub_rows']} → {len(subs)}"
        "(M2 第三路徑應改現有列)"
    )


@then(parsers.parse('"{node}" 因 "{referee}" 的領取獲得 claim 鍵第 1 代獎勵——兩事件合計增量 200P【DB】'))
def ch8_claim_reward_dual_event(saga, supabase_admin, run_state, node, referee):
    u2 = run_state.users[node]
    claim_rows = supabase_admin.rest_select(
        "reward_transactions",
        {"select": "amount,generation,source_claim_id",
         "user_id": f"eq.{u2.user_id}",
         "referee_user_id": f"eq.{run_state.users[referee].user_id}",
         "source_claim_id": "not.is.null"},
    )
    assert len(claim_rows) == 1, f"claim 鍵獎勵應恰一筆:{claim_rows}"
    assert int(claim_rows[0]["amount"]) == 100 and int(claim_rows[0]["generation"]) == 1, (
        f"claim 鍵獎勵內容異常:{claim_rows[0]}"
    )
    total = _points_sum(supabase_admin, u2.user_id) - saga["marks"]["ch8_u2_points"]
    assert total == 200, f"{node} 兩事件合計增量 {total} != 200(補繳與 claim 各 100)"


@then(parsers.parse('"{node}" 於第 8 章兩事件後任務進度不增加【DB】'))
def ch8_tasks_unchanged(saga, supabase_admin, run_state, node):
    now = _task_monthly_count(supabase_admin, run_state.users[node].user_id)
    assert now == saga["marks"]["ch8_u2_tasks"], (
        f"{node} 任務 {saga['marks']['ch8_u2_tasks']} → {now}"
        "(付費續約與免費續約都不該 +1)"
    )


# ===========================================================================
# 第 9 章 A10 fresh 版——不填碼的新約掛回預設推薦人,帳本清空
# ===========================================================================


@when(parsers.parse('"{node}" 開付款頁選新約且不填推薦碼、經 A15 二次確認完成付款'))
def saga_fresh_no_code(saga, guarded_page, journey_config, supabase_admin,
                       run_state, node):
    user = run_state.users[node]
    saga["marks"]["p_before_event"] = _points_sum(supabase_admin, saga["p"]["user_id"])
    _fresh_gui_login(guarded_page, user)
    guarded_page.goto("/payment/checkout")
    expect(guarded_page.get_by_test_id("renewal-mode-section")).to_be_visible(timeout=30_000)
    guarded_page.get_by_test_id("renewal-mode-fresh").click()
    # 不填碼(A10 fresh 版)。W1 雖無可清空資產,但它的原始首購被
    # renewal info 計為「本輪已付過補繳 1 筆」→ AC-15 的
    # needsFreshConfirm 仍成立、二次確認照樣彈出(run 31156146124
    # 實測),與 ch4 走同一個 pay_fresh_via_gui 序列。
    payment.pay_fresh_via_gui(guarded_page, journey_config, supabase_admin, user)


# ===========================================================================
# 第 10 章 終章對帳——分類軸、免費續約註記與推導餘額
# ===========================================================================


@then(parsers.parse('"{node}" 的獎勵明細分類軸含推薦新人、子代續約與新約重置'))
def history_axis_categories(guarded_page, run_state, node):
    _fresh_gui_login(guarded_page, run_state.users[node])
    guarded_page.goto("/rewards")
    expect(guarded_page.get_by_role("heading", name="獎勵明細")).to_be_visible(timeout=15_000)
    # REWARD_SOURCE_LABELS 的明細列 badge 全稱(rewardHistoryFilter.ts);
    # 明細單次載入 50 筆,K0 全部歷史在第一頁內。
    for label in ("獎勵-推薦新人", "獎勵-子代續約", "新約重置"):
        expect(guarded_page.get_by_text(label).first).to_be_visible(timeout=15_000)


@then(parsers.parse('"{node}" 的獎勵頁可提領餘額顯示 {amount:d}P'))
def rewards_available_balance(guarded_page, run_state, node, amount):
    _fresh_gui_login(guarded_page, run_state.users[node])
    guarded_page.goto("/rewards")
    expect(guarded_page.get_by_text("可提領").first).to_be_visible(timeout=15_000)
    # RewardStats 的餘額格式是「{n}P」無空格(如 100P)。
    expect(guarded_page.get_by_text(f"{amount}P", exact=True).first).to_be_visible(
        timeout=15_000
    )


@then(parsers.parse('"{node}" 的獎勵明細出現「任務免費續約」註記'))
def history_free_renewal_note(guarded_page, run_state, node):
    _fresh_gui_login(guarded_page, run_state.users[node])
    guarded_page.goto("/rewards")
    expect(guarded_page.get_by_role("heading", name="獎勵明細")).to_be_visible(timeout=15_000)
    # rewardHistory.ts 的 FREE_RENEWAL_NOTE:viaFreeRenewal(source_claim_id
    # 鍵)的續約獎勵列第二行註記。
    expect(guarded_page.get_by_text("任務免費續約").first).to_be_visible(timeout=15_000)
