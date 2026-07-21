"""60_time_scenarios.feature 的步驟定義——時光機與會籍狀態機。

刊登建立/搜尋/查無結果的步驟重用 f40 的片語（pytest-bdd 步驟不跨
模組共享，所以在這裡以同片語再綁一次到共用 builder 邏輯）。
"""

from __future__ import annotations

from datetime import datetime, timezone

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from builders import payment
from builders.login import login_via_gui
from builders.registration import register_account_via_gui
from pages.complete_profile_page import CompleteProfilePage
from pages.create_service_provider_page import CreateServiceProviderPage
from pages.home_page import HomePage
from pages.payment_checkout_page import PaymentCheckoutPage
from pages.service_provider_management_page import ServiceProviderManagementPage
from tools import seed_time_machine, twid

scenarios("60_time_scenarios.feature")


def _listing_name(run_state, node: str) -> str:
    return f"服務{run_state.run_id}{node}"


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _latest_end_date(supabase_admin, user_id: str) -> datetime:
    rows = supabase_admin.rest_select(
        "subscriptions",
        {"select": "end_date", "user_id": f"eq.{user_id}",
         "order": "end_date.desc", "limit": "1"},
    )
    assert rows, "沒有訂閱列"
    return _parse_ts(rows[0]["end_date"])


# --- 刊登可見性（片語同 f40，綁定到相同行為）-------------------------------


@when(parsers.parse('"{node}" 登入並建立自己的刊登'))
def create_listing(guarded_page, run_state, node):
    login_via_gui(guarded_page, run_state.users[node])
    guarded_page.goto("/service-providers")
    management = ServiceProviderManagementPage(guarded_page)
    expect(management.heading()).to_be_visible(timeout=15_000)
    management.create_link().click()
    form = CreateServiceProviderPage(guarded_page)
    form.fill_valid_form(name=_listing_name(run_state, node))
    form.submit()
    expect(guarded_page.get_by_text(_listing_name(run_state, node))).to_be_visible(
        timeout=30_000
    )


@when(parsers.parse('訪客在首頁搜尋 "{node}" 的刊登名稱'))
def visitor_search(guarded_page, run_state, node):
    home = HomePage(guarded_page)
    home.open()
    home.search(_listing_name(run_state, node))


@then("搜尋結果出現該刊登卡片")
def card_visible(guarded_page):
    expect(HomePage(guarded_page).cards().first).to_be_visible(timeout=15_000)


@then("首頁顯示查無結果")
def no_results(guarded_page):
    expect(HomePage(guarded_page).no_results_message()).to_be_visible(timeout=15_000)


# --- 時光機 ----------------------------------------------------------------


@when(parsers.parse('時光機將 "{node}" 推入剛過期（未滿一年）'))
@given(parsers.parse('時光機將 "{node}" 推入剛過期（未滿一年）'))
def push_to_recently_expired(supabase_admin, run_state, node):
    seed_time_machine.enter_recently_expired(supabase_admin, run_state.users[node].user_id)


@when(parsers.parse('時光機將 "{node}" 推入完全失效'))
def push_to_expired(supabase_admin, run_state, node):
    seed_time_machine.enter_expired(supabase_admin, run_state.users[node].user_id)


@given(parsers.parse('時光機將 "{node}" 推入剛過期（未滿一年）並記下接續錨點'))
def push_to_recently_expired_with_anchor(supabase_admin, run_state, scenario_memo, node):
    row = seed_time_machine.enter_recently_expired(supabase_admin, run_state.users[node].user_id)
    scenario_memo["anchor_end"] = _parse_ts(row["end_date"])
    scenario_memo["seeded_at"] = datetime.now(timezone.utc)


# --- 過期會員推薦碼仍可推廣 ---------------------------------------------------


@when(parsers.parse('臨時使用者 "{scratch}" 在完善資料頁驗證 "{node}" 的推薦碼'))
def scratch_verifies_code(guarded_page, supabase_admin, run_state, scratch, node):
    user = run_state.users.get(scratch)
    if user is None:
        supabase_admin.reset_check_email_rate_limit()
        user = run_state.new_user(scratch, twid.generate_for_node(run_state.run_id, scratch))
        register_account_via_gui(guarded_page, supabase_admin, user)
    else:
        login_via_gui(guarded_page, user, wait_for=None)
        guarded_page.goto("/complete-profile")
        expect(guarded_page.locator("#name")).to_be_visible(timeout=30_000)

    profile = CompleteProfilePage(guarded_page)
    profile.fill_referral_code(run_state.users[node].referral_code)
    profile.click_verify_referral_code()


@then(parsers.parse('推薦碼欄即時顯示 "{node}" 的真實姓名'))
def code_shows_referrer_name(guarded_page, run_state, node):
    status = CompleteProfilePage(guarded_page).referral_code_status()
    expect(status).to_be_visible(timeout=10_000)
    expect(status).to_contain_text(run_state.users[node].name)


# --- 過期會員（未滿一年）續約 extend ----------------------------------------


@when(parsers.parse('"{node}" 登入並以「續約（接續原效期）」完成補繳'))
def renew_extend(guarded_page, journey_config, supabase_admin, run_state, node):
    user = run_state.users[node]
    login_via_gui(guarded_page, user)
    guarded_page.goto("/payment/checkout")
    expect(PaymentCheckoutPage(guarded_page).pay_button()).to_be_visible(timeout=30_000)
    # 續費雙模式的單選：過期未滿一年 canExtend=true，預設即為續約——
    # 仍顯式點選，避免依賴預設值。
    guarded_page.get_by_text("續約（接續原效期）").first.click()
    payment.pay_via_gui(guarded_page, journey_config, supabase_admin, user)


@then(parsers.parse('"{node}" 的新到期日接續原到期日約一年'))
def end_date_anchored(supabase_admin, run_state, scenario_memo, node):
    new_end = _latest_end_date(supabase_admin, run_state.users[node].user_id)
    anchor = scenario_memo["anchor_end"]
    delta = (new_end - anchor).days
    assert 360 <= delta <= 370, (
        f"新到期日 {new_end} 距接續錨點 {anchor} 為 {delta} 天，非約一年"
    )


@then(parsers.parse('"{node}" 的新到期日早於「從付款日起算一年」'))
def end_date_not_payment_anchored(supabase_admin, run_state, scenario_memo, node):
    # 錨點被回填為 30 天前——若實作誤從付款日起算，新到期日會落在
    # 付款日 +一年（比接續制晚約 30 天）。
    new_end = _latest_end_date(supabase_admin, run_state.users[node].user_id)
    days_from_payment = (new_end - scenario_memo["seeded_at"]).days
    assert days_from_payment <= 350, (
        f"新到期日距付款日 {days_from_payment} 天——看起來是從付款日起算，"
        "未接續原週期"
    )
