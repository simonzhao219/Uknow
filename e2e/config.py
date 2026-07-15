"""Shared constants for the E2E suite: target app URL and the third-party
domains that every test must mock instead of touching for real."""

import os

BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:3000")

SUPABASE_PROJECT_REF = os.environ.get("E2E_SUPABASE_PROJECT_REF", "uhtwwxtazwqnlbejhprl")
SUPABASE_AUTH_BASE = f"https://{SUPABASE_PROJECT_REF}.supabase.co/auth/v1"
API_BASE = f"https://{SUPABASE_PROJECT_REF}.supabase.co/functions/v1/api"

# Never a real domain: PayUni's checkout page is simulated entirely through
# route interception, so no test ever leaves the mocked network sandbox.
MOCK_PAYUNI_GATEWAY = "https://mock-payuni.e2e.test/pay"

DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_EMAIL = "e2e-user@example.com"
