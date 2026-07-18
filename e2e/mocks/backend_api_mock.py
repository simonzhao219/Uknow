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
from typing import Optional

from playwright.sync_api import BrowserContext

from config import API_BASE, BASE_URL, DEFAULT_EMAIL, DEFAULT_USER_ID, MOCK_PAYUNI_GATEWAY


def build_profile(registration_step: int = 3, **overrides) -> dict:
    # A real step-0 user hasn't filled in their profile yet. Several
    # components (App.tsx, CompleteProfile.tsx, PaymentCheckout.tsx) derive
    # "is this profile complete?" from name/phone/birthDate being present —
    # leaving them populated at step 0 makes those components disagree with
    # registrationStep and redirect-loop against each other.
    has_profile = registration_step > 0
    # RequireMembershipRoute gates on accountStatus (active/grace pass),
    # not registrationStep — the defaults keep the intuitive mapping
    # (step 3 = active member, everything else = not a member yet) so
    # older scenarios keep working; entitlement-specific scenarios
    # override these explicitly.
    is_member = registration_step >= 3
    profile = {
        "id": DEFAULT_USER_ID,
        "email": DEFAULT_EMAIL,
        "name": "測試用戶" if has_profile else None,
        "phone": "0912345678" if has_profile else None,
        "nationalId": "A123456789" if has_profile else None,
        "birthDate": "1990-01-01" if has_profile else None,
        "registrationStep": registration_step,
        "referredByCode": None,
        "referrerName": None,
        "referralCode": None,
        "lastTradeNo": None,
        "isAdmin": False,
        "accountStatus": "active" if is_member else "expired",
        "subscriptionEndDate": "2027-01-01T00:00:00.000Z" if is_member else None,
        "paidAwaitingActivation": False,
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
        # The backend serves the same handler at both /profile (used by
        # App.tsx's global session bootstrap) and /auth/profile (used by
        # AuthPage/CompleteProfile/PaymentCheckout's own re-checks).
        profile = build_profile(registration_step, **overrides)
        self._route("/profile", lambda route: _fulfill_json(route, profile))
        self._route("/auth/profile", lambda route: _fulfill_json(route, profile))
        return profile

    def set_profile_sequence(self, profiles: list):
        """`profiles` is a list of profile dicts (see build_profile). Each
        successive profile request — regardless of whether it hits /profile
        (App bootstrap, refreshUser polling) or /auth/profile — advances to
        the next entry, staying on the last. Used to model "the backend
        activates the membership while the page is polling" (PaymentResult's
        activation self-heal)."""
        state = {"call_count": 0}

        def handler(route):
            index = min(state["call_count"], len(profiles) - 1)
            state["call_count"] += 1
            _fulfill_json(route, profiles[index])

        self._route("/profile", handler)
        self._route("/auth/profile", handler)

    def set_check_email(self, exists: bool):
        self._route("/auth/check-email", lambda route: _fulfill_json(route, {"exists": exists}))

    def set_subscription_status(
        self,
        has_subscription: bool = True,
        status: str = "active",
        active_until: Optional[str] = None,
        **extra,
    ):
        data = {"hasSubscription": has_subscription, "status": status, "activeUntil": active_until}
        data.update(extra)
        body = {"success": True, "data": data}
        self._route("/subscriptions/status", lambda route: _fulfill_json(route, body))

    def set_subscription_status_sequence(self, responses: list):
        """`responses` is a list of `data` dicts for /subscriptions/status.
        Each successive request advances (staying on the last) — used to model
        "the claim extended the membership": the claim dialog's preview reads
        the pre-claim state, the dashboard visit after claiming reads the
        post-claim state (its cache was invalidated by handleClaimReward)."""
        state = {"call_count": 0}

        def handler(route):
            index = min(state["call_count"], len(responses) - 1)
            state["call_count"] += 1
            _fulfill_json(route, {"success": True, "data": responses[index]})

        self._route("/subscriptions/status", handler)

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

    def mock_prepare_and_redirect(self, trade_no: str, status: str, activate_profile: Optional[dict] = None):
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
            # Model "the backend processed the payment during the gateway
            # round-trip": before redirecting back, swap /profile to the
            # activated member profile (later-registered routes win in
            # Playwright). Without this the new PaymentResult would sit in
            # its "activating" polling state — a paid user whose profile
            # never activates is the incident case, not the happy path.
            if activate_profile is not None:
                self.set_profile(**activate_profile)
            route.fulfill(status=302, headers={"Location": redirect_url}, body="")

        self._context.route(f"{MOCK_PAYUNI_GATEWAY}**", gateway_handler)

    def mock_prepare_that_never_resolves(self):
        """Leaves POST /payuni/prepare permanently pending (no fulfill/abort)
        so the checkout page stays mounted with its post-click `isLoading`
        disabled state — used to test the button lock without ever reaching
        a real navigation.

        Deliberately targets /payuni/prepare (a plain fetch) rather than the
        PayUni gateway redirect: hanging the *gateway* leaves the page mid
        top-level-navigation, and Chromium stops servicing further CDP
        commands (including our own assertions) until that navigation
        settles — so nothing downstream can be observed. A pending ordinary
        fetch has no such effect. A blocking `time.sleep()` here would have
        the same problem as hanging the navigation: it freezes Playwright's
        driver thread and starves the very assertion checking the button, so
        we simply never respond instead of delaying the response."""
        self._context.route(f"{API_BASE}/payuni/prepare**", lambda route: None)
        self._context.route(f"{MOCK_PAYUNI_GATEWAY}**", lambda route: None)

    def set_prepare_error(self, message: str, code: Optional[str] = None, status: int = 400):
        body = {"success": False, "error": {"message": message, "code": code}}
        self._route("/payuni/prepare", lambda route: _fulfill_json(route, body, status=status))

    def set_referral_tree(
        self,
        first_generation: Optional[list] = None,
        second_generation: Optional[list] = None,
        third_generation: Optional[list] = None,
        user_referral_code: str = "MYCODE",
    ):
        first = first_generation or []
        second = second_generation or []
        third = third_generation or []
        body = {
            "success": True,
            "data": {
                "userReferralCode": user_referral_code,
                "referralTree": {
                    "firstGeneration": first,
                    "secondGeneration": second,
                    "thirdGeneration": third,
                },
                "summary": {
                    "firstGenCount": len(first),
                    "secondGenCount": len(second),
                    "thirdGenCount": len(third),
                    "totalReferrals": len(first) + len(second) + len(third),
                },
            },
        }
        self._route("/referrals/my-tree", lambda route: _fulfill_json(route, body))

    def set_task_center(self, tasks: Optional[list] = None, pending_rewards: Optional[list] = None):
        # Registration order matters: later-registered routes win in
        # Playwright, and `/tasks**` also matches `/tasks/pending-rewards` —
        # so the broad /tasks route must be registered *first*.
        tasks_body = {"success": True, "data": {"tasks": tasks or []}}
        self._route("/tasks", lambda route: _fulfill_json(route, tasks_body))
        pending_body = {"success": True, "data": pending_rewards or []}
        self._route("/tasks/pending-rewards", lambda route: _fulfill_json(route, pending_body))

    def set_claim_reward_success(self, reward_id: str):
        # Must be called after set_task_center for the same glob-precedence
        # reason documented there.
        body = {"success": True, "data": {"subscriptionId": "sub-e2e", "activeUntil": None}}
        self._route(f"/tasks/claim-reward/{reward_id}", lambda route: _fulfill_json(route, body))

    def set_upload_photo_success(self, photo_url: str = "https://example.com/uploaded.jpg"):
        # CreateServiceProvider/EditServiceProvider POST each photo to
        # /listings/upload-photo and read back { photoUrl }.
        self._route("/listings/upload-photo", lambda route: _fulfill_json(route, {"photoUrl": photo_url}))

    def set_verify_id_success(self):
        # ThreeStepDialog 第三步（IdNumberInput）在啟用確認按鈕前，會先
        # POST /rewards/verify-id 驗證身分證字號與註冊資料一致。
        self._route("/rewards/verify-id", lambda route: _fulfill_json(route, {"success": True}))


def build_referral_member(name: str, **overrides) -> dict:
    member = {
        "userId": f"member-{name}",
        "userName": name,
        "userReferralCode": None,
        "listingId": None,
        "listingName": None,
        "serviceType": None,
        "city": None,
        "activeUntil": "2027-01-01T00:00:00.000Z",
        "isActive": True,
        "referrer": None,
        "createdAt": "2026-07-16T00:00:00.000Z",
    }
    member.update(overrides)
    return member


def build_monthly_king_task(current: int = 0, **overrides) -> dict:
    task = {
        "id": "task_monthly_king",
        "type": "monthly_king",
        "title": "推薦王",
        "description": "單月推薦滿 10 人，獲得免費續約 1 年",
        "target": 10,
        "current": current,
        "completed": current >= 10,
        "reward": {"type": "free_renewal_year", "label": "免費續約 1 年"},
        "progress": min(current / 10, 1),
        "hasUnclaimedReward": False,
        "unclaimedRewardCount": 0,
        "details": {
            "currentMonth": "2026-07",
            "historyCount": 0,
            "completedMonths": 0,
            "currentMonthCredit": False,
        },
    }
    task.update(overrides)
    return task


def build_pending_free_year_reward(reward_id: str = "reward-e2e-1", **overrides) -> dict:
    reward = {
        "id": reward_id,
        "type": "monthly_king",
        "rewardType": "free_renewal_year",
        "amount": 0,
        "achievedAt": "2026-07-01T00:00:00.000Z",
        "status": "pending",
        "description": "推薦王：單月推薦滿 10 人",
        "details": {"monthKey": "2026-07"},
    }
    reward.update(overrides)
    return reward
