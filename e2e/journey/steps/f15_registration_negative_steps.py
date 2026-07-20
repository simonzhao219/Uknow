"""15_registration_negative.feature 的步驟定義。"""

from __future__ import annotations

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from builders.login import login_via_gui
from builders.registration import register_account_via_gui
from pages.complete_profile_page import CompleteProfilePage
from tools import twid

scenarios("15_registration_negative.feature")

UNDERAGE_BIRTH_DATE = "2015-06-15"


@given(parsers.parse('臨時使用者 "{node}" 已走到資料完善頁'))
def scratch_user_on_profile(guarded_page, supabase_admin, run_state, node):
    user = run_state.users.get(node)
    if user is None:
        # 首個情境：完整走 Step 0/1 + OTP。臨時帳號一樣吃 check-email
        # 限流窗口，先重置分支計數器。
        supabase_admin.reset_check_email_rate_limit()
        user = run_state.new_user(node, twid.generate_for_node(run_state.run_id, node))
        register_account_via_gui(guarded_page, supabase_admin, user)
    else:
        # 後續情境：已有帳號但未完成資料——登入後被 ProtectedRoute 帶回
        # 完善資料頁。
        login_via_gui(guarded_page, user, wait_for=None)
        guarded_page.goto("/complete-profile")
        expect(guarded_page.locator("#name")).to_be_visible(timeout=30_000)


@when(parsers.parse('"{node}" 以未滿 18 歲的生日填寫並送出資料'))
def submit_underage(guarded_page, run_state, node):
    user = run_state.users[node]
    profile = CompleteProfilePage(guarded_page)
    profile.fill_form(user.name, user.national_id, UNDERAGE_BIRTH_DATE, user.phone)
    profile.check_terms()
    profile.submit()


@then("生日欄顯示需年滿 18 歲的錯誤")
def underage_error(guarded_page):
    # 「註冊用戶需年滿 18 歲」平時就以欄位提示存在一份；驗證失敗時
    # FieldError 再渲染一份同文案——恰好兩份即證明錯誤狀態成立。
    expect(guarded_page.get_by_text("註冊用戶需年滿 18 歲")).to_have_count(2)


@when(parsers.parse('"{node}" 在推薦碼欄輸入 "{code}" 並點驗證'))
def verify_bogus_code(guarded_page, node, code):
    profile = CompleteProfilePage(guarded_page)
    profile.fill_referral_code(code)
    profile.click_verify_referral_code()


@then("推薦碼欄顯示無效提示")
def referral_code_invalid_hint(guarded_page):
    expect(guarded_page.get_by_test_id("referral-code-hint")).to_be_visible(timeout=10_000)
