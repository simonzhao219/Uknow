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
    return api_mock.set_profile(registration_step, **overrides)


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
