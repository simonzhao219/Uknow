"""單一使用者的 GUI 註冊流程（Step 0 → OTP → 完善資料 → 停在付款頁）。

全程操作真實 UI、打真實分支；唯一被替代的是「收信」——OTP 由
Admin generate_link 取得後照樣敲進 GUI 的輸入框。
"""

from __future__ import annotations

from playwright.sync_api import Page, expect

from pages.auth_page import AuthPage
from pages.complete_profile_page import CompleteProfilePage
from pages.otp_page import OtpPage
from run_state import JourneyUser
from tools.supa import SupabaseAdmin

BIRTH_DATE = "1990-01-01"  # 固定成年生日：18 歲門檻的正向樣本


def register_account_via_gui(page: Page, admin: SupabaseAdmin, user: JourneyUser) -> None:
    """Step 0 + Step 1 + OTP：結束時停在「完善資料」頁。

    獨立成子流程，讓負向情境（15_registration_negative）能建一個
    走到資料完善頁的臨時帳號，在表單上驗證邊界。"""
    auth = AuthPage(page)
    page.goto("/register")

    # Step 0：email 檢核 → 新帳號進入設定密碼
    auth.fill_email(user.email)
    auth.submit_email()
    expect(page.get_by_test_id("auth-signup-button")).to_be_visible()

    # Step 1：設定密碼 → email OTP
    auth.fill_signup_passwords(user.password, user.password)
    auth.submit_signup()
    expect(page.get_by_test_id("otp-input-group")).to_be_visible(timeout=30_000)

    otp_code = admin.fetch_signup_otp(user.email, user.password)
    OtpPage(page).enter_code(otp_code)

    # verifyOtp 成功後導向 CompleteProfile
    expect(page.locator("#name")).to_be_visible(timeout=30_000)


def register_via_gui(
    page: Page,
    admin: SupabaseAdmin,
    user: JourneyUser,
    referral_code: str | None = None,
    referrer_name: str | None = None,
) -> None:
    """走完註冊三步，結束時停在付款結帳頁。"""
    register_account_via_gui(page, admin, user)

    # Step 2：完善資料
    profile = CompleteProfilePage(page)
    profile.fill_form(user.name, user.national_id, BIRTH_DATE, user.phone)

    if referral_code:
        profile.fill_referral_code(referral_code)
        profile.click_verify_referral_code()
        # 規格：輸入推薦碼後 UI 必須即時顯示推薦人「當下的真實姓名」
        status = profile.referral_code_status()
        expect(status).to_be_visible()
        if referrer_name:
            expect(status).to_contain_text(referrer_name)

    profile.check_terms()
    profile.submit()
    profile.confirm_referral_warning()

    # Step 3 入口：付款結帳頁
    expect(page.get_by_test_id("payuni-pay-button")).to_be_visible(timeout=30_000)
