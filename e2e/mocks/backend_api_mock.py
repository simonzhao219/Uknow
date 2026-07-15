"""Intercepts the app's own backend (`buildApiUrl()` -> `/functions/v1/api/*`)
so each scenario can drive `registrationStep` / payment state directly,
instead of walking the full signup -> profile -> payment round trip through
the UI for every test.

`mock_prepare_and_redirect()` is the key technique for payment_checkout.feature:
it makes `/payuni/prepare` return a fake gateway URL that is *itself*
intercepted to immediately answer with a redirect back into the app. This lets
a test click the real "前往統一金流付款" button — exercising the actual
hidden-form-submit code in PaymentCheckout.tsx — and land on a real
PaymentResult screen without ever resolving api.payuni.com.tw.
"""

import json
import time
from typing import Optional

from playwright.sync_api import BrowserContext

from config import API_BASE, BASE_URL, DEFAULT_EMAIL, DEFAULT_USER_ID, MOCK_PAYUNI_GATEWAY


def build_profile(registration_step: int = 3, **overrides) -> dict:
    profile = {
        "id": DEFAULT_USER_ID,
        "email": DEFAULT_EMAIL,
        "name": "測試用戶",
        "phone": "0912345678",
        "nationalId": "A123456789",
        "birthDate": "1990-01-01",
        "registrationStep": registration_step,
        "referredByCode": None,
        "referrerName": None,
        "referralCode": None,
        "lastTradeNo": None,
    }
    profile.update(overrides)
    return profile


def build_payuni_response(status: str = "SUCCESS", **overrides) -> dict:
    response = {
        "Status": status,
        "TradeNo": "PU00000001",
        "AuthAmt": "1,200",
        "PayerName": "測試用戶",
        "PayerPhone": "0912345678",
        "PayerEmail": DEFAULT_EMAIL,
        "Card6No": "123456",
        "Card4No": "7890",
        "CardExpired": "1230",
        "AuthBankName": "測試銀行",
        "Message": None,
        "ResCode": None,
        "ResCodeMsg": None,
    }
    response.update(overrides)
    return response


def _fulfill_json(route, body: dict, status: int = 200):
    route.fulfill(status=status, content_type="application/json", body=json.dumps(body))


class BackendApiMock:
    """One instance per test (see the `api_mock` fixture in conftest.py)."""

    def __init__(self, context: BrowserContext):
        self._context = context

    def _route(self, path: str, handler):
        self._context.route(f"{API_BASE}{path}**", handler)

    def set_profile(self, registration_step: int = 3, **overrides) -> dict:
        profile = build_profile(registration_step, **overrides)
        self._route("/auth/profile", lambda route: _fulfill_json(route, profile))
        return profile

    def set_check_email(self, exists: bool):
        self._route("/auth/check-email", lambda route: _fulfill_json(route, {"exists": exists}))

    def set_register_success(self, registration_step: int = 1, **overrides) -> dict:
        profile = build_profile(registration_step, **overrides)
        self._route("/auth/register", lambda route: _fulfill_json(route, profile))
        return profile

    def set_register_error(self, message: str, status: int = 400):
        self._route("/auth/register", lambda route: _fulfill_json(route, {"error": message}, status=status))

    def set_reset_registration_success(self):
        self._route("/auth/reset-registration", lambda route: _fulfill_json(route, {"success": True}))

    def set_referral_code_valid(self, referrer_name: str = "推薦人測試"):
        body = {"valid": True, "referrerName": referrer_name}
        self._route("/listings/verify-referral-code", lambda route: _fulfill_json(route, body))

    def set_referral_code_invalid(self, message: str = "推薦碼無效"):
        body = {"valid": False, "error": {"message": message}}
        self._route("/listings/verify-referral-code", lambda route: _fulfill_json(route, body))

    def set_referral_validate(self, code: str, referrer_name: str):
        body = {"valid": True, "referrer": {"userName": referrer_name}}
        self._route(f"/referrals/validate/{code}", lambda route: _fulfill_json(route, body))

    def set_payuni_result(
        self,
        trade_no: str,
        order_status: str,
        payuni_response: Optional[dict] = None,
        completed_at: Optional[str] = None,
    ):
        body = {
            "success": True,
            "data": {"orderStatus": order_status, "completedAt": completed_at, "payuni": payuni_response},
        }
        self._route(f"/payuni/result/{trade_no}", lambda route: _fulfill_json(route, body))

    def set_payuni_result_sequence(self, trade_no: str, responses: list):
        """`responses` is a list of (order_status, payuni_response) tuples.
        Each successive request against this tradeNo advances to the next
        entry (staying on the last one) — used to exercise PaymentResult's
        pending -> terminal retry loop deterministically."""
        state = {"call_count": 0}

        def handler(route):
            index = min(state["call_count"], len(responses) - 1)
            order_status, payuni_response = responses[index]
            state["call_count"] += 1
            _fulfill_json(
                route,
                {"success": True, "data": {"orderStatus": order_status, "completedAt": None, "payuni": payuni_response}},
            )

        self._route(f"/payuni/result/{trade_no}", handler)

    def set_payuni_result_not_found(self, trade_no: str):
        body = {"success": False, "error": "訂單不存在"}
        self._route(f"/payuni/result/{trade_no}", lambda route: _fulfill_json(route, body, status=404))

    def mock_prepare_and_redirect(self, trade_no: str, status: str):
        prepare_body = {
            "success": True,
            "data": {
                "MerID": "E2ETEST",
                "Version": "UPP",
                "EncryptInfo": "e2e-encrypted-payload",
                "HashInfo": "E2EHASH",
                "apiUrl": MOCK_PAYUNI_GATEWAY,
                "tradeNo": trade_no,
            },
        }
        self._route("/payuni/prepare", lambda route: _fulfill_json(route, prepare_body))

        redirect_url = f"{BASE_URL}/payment/result?tradeNo={trade_no}&status={status}"
        self._context.route(
            f"{MOCK_PAYUNI_GATEWAY}**",
            lambda route: route.fulfill(status=302, headers={"Location": redirect_url}, body=""),
        )

    def mock_prepare_with_delayed_redirect(self, trade_no: str, status: str, delay_seconds: float = 2.0):
        """Same as `mock_prepare_and_redirect`, but the gateway response is
        delayed so the checkout page stays mounted long enough to observe
        its post-click locked/counting-down button before navigation."""
        prepare_body = {
            "success": True,
            "data": {
                "MerID": "E2ETEST",
                "Version": "UPP",
                "EncryptInfo": "e2e-encrypted-payload",
                "HashInfo": "E2EHASH",
                "apiUrl": MOCK_PAYUNI_GATEWAY,
                "tradeNo": trade_no,
            },
        }
        self._route("/payuni/prepare", lambda route: _fulfill_json(route, prepare_body))

        redirect_url = f"{BASE_URL}/payment/result?tradeNo={trade_no}&status={status}"

        def gateway_handler(route):
            time.sleep(delay_seconds)
            route.fulfill(status=302, headers={"Location": redirect_url}, body="")

        self._context.route(f"{MOCK_PAYUNI_GATEWAY}**", gateway_handler)

    def set_prepare_error(self, message: str, code: Optional[str] = None, status: int = 400):
        body = {"success": False, "error": {"message": message, "code": code}}
        self._route("/payuni/prepare", lambda route: _fulfill_json(route, body, status=status))
