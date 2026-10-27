"""Session-seeding helper: pre-authenticates a browser context so scenarios
that only care about *post-login* behaviour (route guards, checkout, result)
don't have to drive the full login/signup/OTP UI flow every time. Only the
auth-specific feature files exercise that UI flow directly."""

import json
import re

from playwright.sync_api import BrowserContext

from config import API_BASE, DEFAULT_EMAIL, DEFAULT_USER_ID, SUPABASE_PROJECT_REF
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
    # renewal 契約（renewal-backfill）：結帳頁掛 useSubscription() 讀補繳
    # 資訊，預設回一份形狀正確的固定值（曾訂閱才有；從未訂閱 = null）。
    # 需要精確數字的情境自行呼叫 set_subscription_status 覆寫。
    end_date = profile.get("subscriptionEndDate")
    renewal = None
    if end_date:
        expired = account_status != "active"
        renewal = {
            "extendAnchorDate": "2026-04-03",
            "extendEndDate": "2027-04-02",
            "backfillCount": 1 if expired else 0,
            "backfillAmount": 1200 if expired else 0,
            "backfillFinalEndDate": "2027-04-02",
            "expiredForMonths": 3 if expired else 0,
            "hasPaidAnyBackfill": False,
            "paidBackfillCount": 0,
            "paidBackfillAmount": 0,
            "freshForfeitPoints": 0,
            "freshForfeitReferrals": 0,
        }
    api_mock.set_subscription_status(
        has_subscription=account_status == "active",
        status=account_status,
        active_until=end_date,
        renewal=renewal,
        hasPendingWithdrawal=False,
    )
    # 會員中心是登入後的落點，會讀推薦／任務／獎勵；同理預設回空資料（可覆寫）。
    api_mock.set_member_area_defaults()
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
    Web Share API, regardless of the headless browser's support for it.

    `share` lives on Navigator.prototype, so `delete navigator.share` (an own
    property that never existed) is a no-op wherever Web Share ships -- shadow
    it on the prototype instead. The app feature-detects with
    `typeof navigator.share === 'function'`, which undefined fails."""
    context.add_init_script(
        "try { Object.defineProperty(Navigator.prototype, 'share', "
        "{ value: undefined, configurable: true, writable: true }); } catch (e) {}"
    )


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


# --- 刊登照片管線（裁切＋上傳）------------------------------------------------
# 照片上傳的「成功」mock 在 BackendApiMock.set_upload_photo_success；下面三個是
# 照片管線專屬的情境輔助，後註冊的 route 優先，所以放在 Given「photo uploads
# succeed」之後呼叫即可覆蓋。

_UPLOAD_PATH = f"{API_BASE}/listings/upload-photo**"


class PhotoUploadRecorder:
    """記下每一次 /listings/upload-photo 的 multipart 請求本體，並回成功。

    驗收 7（輸出最長邊／無 EXIF／主色）要看「真正離開瀏覽器的位元組」，所以
    直接從請求本體切出 JPEG；只靠 UI 狀態看不到它。"""

    def __init__(self, context: BrowserContext, photo_url: str):
        self.bodies: list[bytes] = []
        self.content_types: list[str] = []
        self._photo_url = photo_url
        context.route(_UPLOAD_PATH, self._handle)

    def _handle(self, route) -> None:
        request = route.request
        self.bodies.append(request.post_data_buffer or b"")
        self.content_types.append(request.headers.get("content-type", ""))
        route.fulfill(
            status=200,
            content_type="application/json",
            headers={"Access-Control-Allow-Origin": "*"},
            body=json.dumps({"photoUrl": self._photo_url}),
        )

    def jpeg_payloads(self) -> list[bytes]:
        """每次上傳本體裡的 JPEG 位元組（SOI…EOI）。"""
        payloads = []
        for body in self.bodies:
            start = body.find(b"\xff\xd8\xff")
            end = body.rfind(b"\xff\xd9")
            assert start != -1 and end > start, "upload body contains no JPEG"
            payloads.append(body[start : end + 2])
        return payloads


def record_photo_uploads(
    context: BrowserContext, photo_url: str = "https://example.com/uploaded.jpg"
) -> PhotoUploadRecorder:
    return PhotoUploadRecorder(context, photo_url)


def fail_first_photo_upload(
    context: BrowserContext, photo_url: str = "https://example.com/uploaded.jpg"
) -> None:
    """第一次上傳回 500，之後的上傳（含「重試」）都成功。"""
    state = {"failed": False}

    def handler(route) -> None:
        headers = {"Access-Control-Allow-Origin": "*"}
        if not state["failed"]:
            state["failed"] = True
            route.fulfill(
                status=500,
                content_type="application/json",
                headers=headers,
                body=json.dumps({"error": "伺服器暫時無法處理"}),
            )
            return
        route.fulfill(
            status=200,
            content_type="application/json",
            headers=headers,
            body=json.dumps({"photoUrl": photo_url}),
        )

    context.route(_UPLOAD_PATH, handler)


class CropChunkGate:
    """讓裁切工具的動態 chunk 請求失敗，直到 `release()`。

    dev server 下動態 import 取的是 PhotoCropDialog 模組與其依賴
    react-easy-crop；兩者任一被 abort，`import()` 都會 reject。"""

    def __init__(self, context: BrowserContext):
        self.blocked = True
        self.attempts = 0
        context.route(re.compile(r"PhotoCropDialog|react-easy-crop"), self._handle)

    def _handle(self, route) -> None:
        if self.blocked:
            self.attempts += 1
            route.abort()
        else:
            route.continue_()

    def release(self) -> None:
        self.blocked = False


def block_crop_chunk(context: BrowserContext) -> CropChunkGate:
    return CropChunkGate(context)
