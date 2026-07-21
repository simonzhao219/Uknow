"""Session-seeding helper: pre-authenticates a browser context so scenarios
that only care about *post-login* behaviour (route guards, checkout, result)
don't have to drive the full login/signup/OTP UI flow every time. Only the
auth-specific feature files exercise that UI flow directly."""

import json

from playwright.sync_api import BrowserContext

from config import DEFAULT_EMAIL, DEFAULT_USER_ID, SUPABASE_PROJECT_REF
from mocks.backend_api_mock import BackendApiMock
from mocks.supabase_auth_mock import build_session

STORAGE_KEY = f"sb-{SUPABASE_PROJECT_REF}-auth-token"


def seed_authenticated_session(
    context: BrowserContext,
    registration_step: int = 3,
    email: str = DEFAULT_EMAIL,
    user_id: str = DEFAULT_USER_ID,
    **profile_overrides,
) -> dict:
    """Write a fake Supabase session into localStorage (via an init script,
    so it's present before the app's first script runs) and stub
    `GET /auth/profile` to report the given `registrationStep`.

    Returns the mocked profile dict."""
    session = build_session(email, user_id)
    context.add_init_script(
        f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(json.dumps(session))});"
    )

    overrides = {"email": email, "id": user_id}
    overrides.update(profile_overrides)

    api_mock = BackendApiMock(context)
    profile = api_mock.set_profile(registration_step, **overrides)

    # 會籍與訂閱是同一份事實的兩個面向（後端由訂閱 end_date 推導
    # accountStatus）。多個頁面用 useSubscription() 讀 /subscriptions/status
    # （會員中心、獎勵等），只 mock profile 會讓這條請求被 block。這裡預設回
    # 一份與 accountStatus 一致的訂閱狀態，讓守衛（讀 accountStatus）與訂閱
    # 狀態天生一致；需要不同步狀態的情境（如任務延長會籍）仍可在之後呼叫
    # set_subscription_status* 覆寫（Playwright 後註冊的路由優先）。
    account_status = profile.get("accountStatus", "expired")
    api_mock.set_subscription_status(
        has_subscription=account_status == "active",
        status=account_status,
        active_until=profile.get("subscriptionEndDate"),
    )
    return profile


def seed_pending_referral(context: BrowserContext, code: str) -> None:
    """Simulate having opened an invite link (/register?ref=CODE) earlier in the
    funnel: the app persists the code in localStorage so it survives
    signup -> OTP -> complete-profile. Seeded via an init script so it's present
    before the app's first script runs on the next navigation."""
    context.add_init_script(
        f"window.localStorage.setItem('pending_referral_code', {json.dumps(code)});"
    )


def disable_native_share(context: BrowserContext) -> None:
    """Force the copy-to-clipboard fallback deterministically by removing the
    Web Share API, regardless of the headless browser's support for it."""
    context.add_init_script("try { delete navigator.share; } catch (e) {}")


def seed_stale_cache(context: BrowserContext, key: str, data, age_ms: int) -> None:
    """Pre-populate the app's sessionStorage data cache (DataCacheContext)
    with an entry whose timestamp is `age_ms` in the past. Lets TTL scenarios
    prove "expired cache is bypassed / fresh cache is served" deterministically
    without waiting out the real 5-minute window."""
    context.add_init_script(
        f"""
        (() => {{
          const KEY = 'uknow_data_cache';
          const cache = JSON.parse(window.sessionStorage.getItem(KEY) || '{{}}');
          cache[{json.dumps(key)}] = {{
            data: {json.dumps(data)},
            timestamp: Date.now() - {int(age_ms)},
          }};
          window.sessionStorage.setItem(KEY, JSON.stringify(cache));
        }})();
        """
    )
