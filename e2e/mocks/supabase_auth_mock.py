"""Intercepts Supabase Auth REST calls (`supabase-js` talks straight to
`*.supabase.co`, not through our backend) so no test ever creates a real
account, sends a real email, or depends on real OTP delivery."""

import json
import time

from playwright.sync_api import BrowserContext

from config import DEFAULT_EMAIL, DEFAULT_USER_ID, SUPABASE_AUTH_BASE


def build_session(email: str = DEFAULT_EMAIL, user_id: str = DEFAULT_USER_ID, access_token: str = "e2e-fake-access-token") -> dict:
    now = int(time.time())
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 3600,
        "expires_at": now + 3600,
        "refresh_token": "e2e-fake-refresh-token",
        "user": {
            "id": user_id,
            "aud": "authenticated",
            "role": "authenticated",
            "email": email,
            "email_confirmed_at": "2026-01-01T00:00:00Z",
            "app_metadata": {"provider": "email", "providers": ["email"]},
            "user_metadata": {},
            "created_at": "2026-01-01T00:00:00Z",
        },
    }


def _fulfill_json(route, body: dict, status: int = 200):
    route.fulfill(status=status, content_type="application/json", body=json.dumps(body))


class SupabaseAuthMock:
    """One instance per test (see the `auth_mock` fixture in conftest.py)."""

    def __init__(self, context: BrowserContext):
        self._context = context

    def mock_login_success(self, email: str, user_id: str = DEFAULT_USER_ID, access_token: str = "e2e-fake-access-token") -> dict:
        session = build_session(email, user_id, access_token)
        self._context.route(f"{SUPABASE_AUTH_BASE}/token**", lambda route: _fulfill_json(route, session))
        return session

    def mock_login_invalid_credentials(self):
        body = {"error": "invalid_grant", "error_description": "Invalid login credentials"}
        self._context.route(f"{SUPABASE_AUTH_BASE}/token**", lambda route: _fulfill_json(route, body, status=400))

    def mock_login_email_not_confirmed(self):
        # GoTrue rejects password login for an account whose email was never
        # verified with this specific error — the "abandoned signup" incident.
        # The old UI collapsed it into "wrong password"; the app must instead
        # recognise it as a recoverable, mid-flow state and resume verification.
        body = {"code": 400, "error_code": "email_not_confirmed", "msg": "Email not confirmed"}
        self._context.route(f"{SUPABASE_AUTH_BASE}/token**", lambda route: _fulfill_json(route, body, status=400))

    def mock_signup_success(self, email: str = DEFAULT_EMAIL, user_id: str = DEFAULT_USER_ID) -> dict:
        session = build_session(email, user_id)
        self._context.route(f"{SUPABASE_AUTH_BASE}/signup**", lambda route: _fulfill_json(route, session))
        return session

    def mock_signup_error(self, message: str, code: str = "user_already_exists", status: int = 422):
        body = {"error_code": code, "msg": message}
        self._context.route(f"{SUPABASE_AUTH_BASE}/signup**", lambda route: _fulfill_json(route, body, status=status))

    def mock_verify_otp_success(self, email: str = DEFAULT_EMAIL, user_id: str = DEFAULT_USER_ID) -> dict:
        session = build_session(email, user_id)
        self._context.route(f"{SUPABASE_AUTH_BASE}/verify**", lambda route: _fulfill_json(route, session))
        return session

    def mock_verify_otp_invalid(self):
        body = {"error_code": "otp_expired", "msg": "Token has expired or is invalid"}
        self._context.route(f"{SUPABASE_AUTH_BASE}/verify**", lambda route: _fulfill_json(route, body, status=403))

    def mock_resend_success(self):
        self._context.route(f"{SUPABASE_AUTH_BASE}/resend**", lambda route: _fulfill_json(route, {}))

    def mock_recover_success(self):
        # `supabase.auth.resetPasswordForEmail()` posts to GoTrue's /recover and
        # (to avoid leaking whether an account exists) always returns 200 {}.
        # Reused for the initial send and for "resend" in the recovery flow.
        self._context.route(f"{SUPABASE_AUTH_BASE}/recover**", lambda route: _fulfill_json(route, {}))

    def mock_recover_error(self, message: str = "Email rate limit exceeded", code: str = "over_email_send_rate_limit", status: int = 429):
        body = {"code": status, "error_code": code, "msg": message}
        self._context.route(f"{SUPABASE_AUTH_BASE}/recover**", lambda route: _fulfill_json(route, body, status=status))

    def mock_update_user_success(self, email: str = DEFAULT_EMAIL, user_id: str = DEFAULT_USER_ID) -> dict:
        # `supabase.auth.updateUser({ password })` issues PUT /user and expects
        # the updated User object back.
        user = build_session(email, user_id)["user"]
        self._context.route(f"{SUPABASE_AUTH_BASE}/user**", lambda route: _fulfill_json(route, user))
        return user

    def mock_update_user_error(self, message: str = "New password should be different from the old password.", code: str = "same_password", status: int = 422):
        body = {"error_code": code, "msg": message}
        self._context.route(f"{SUPABASE_AUTH_BASE}/user**", lambda route: _fulfill_json(route, body, status=status))

    def mock_signout(self):
        self._context.route(
            f"{SUPABASE_AUTH_BASE}/logout**",
            lambda route: route.fulfill(status=204, content_type="application/json", body=""),
        )
