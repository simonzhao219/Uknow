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
