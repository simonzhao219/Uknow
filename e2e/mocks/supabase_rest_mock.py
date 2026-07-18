"""Intercepts Supabase PostgREST (`/rest/v1/*`) for the listing feature.

The listing components talk to the `listings` and `public_listings` tables
directly through supabase-js (`supabase.from('listings')...`), NOT through the
backend API — so `BackendApiMock` (which only covers `/functions/v1/api`) can't
reach them, and `conftest._block_real_network` would otherwise abort these
requests. This mock adds the missing `/rest/v1` interception.

supabase-js read semantics this mock honours (postgrest-js 2.x):
- `.single()`   → sends `Accept: application/vnd.pgrst.object+json`; expects a
                  single JSON **object**, or 406/`PGRST116` when no row matches.
- `.maybeSingle()` / `.select()` → no object Accept header; expects a JSON
                  **array** (client takes `[0]` or `null`).
Writes here are issued without `.select()`, so the component reads only `error`;
success is a bodiless 201 (insert) / 204 (update, delete).
"""

import json

from playwright.sync_api import BrowserContext

from config import DEFAULT_USER_ID, REST_BASE

_OBJECT_ACCEPT = "application/vnd.pgrst.object+json"


def build_listing(user_id: str = DEFAULT_USER_ID, **overrides) -> dict:
    """A listing row shaped like what the components read back. `activeUntil`
    drives the 活躍中 / 已過期 badge in ServiceProviderManagement."""
    listing = {
        "id": "11111111-1111-1111-1111-111111111111",
        "user_id": user_id,
        "name": "測試服務者",
        "category": "美髮",
        "gender": "女",
        "city": "台北市",
        "districts": ["全區"],
        "description": "這是一段測試用的服務介紹。",
        "photos": [
            "https://example.com/photo1.jpg",
            "https://example.com/photo2.jpg",
            "https://example.com/photo3.jpg",
        ],
        "contacts": {"instagram": "test_ig", "line": "", "facebook": ""},
        "activeUntil": "2099-01-01T00:00:00.000Z",
    }
    listing.update(overrides)
    return listing


def _fulfill_json(route, body, status: int = 200):
    route.fulfill(status=status, content_type="application/json", body=json.dumps(body))


def _fulfill_empty(route, status: int):
    route.fulfill(status=status, content_type="application/json", body="")


def _not_found_406(route):
    # What PostgREST returns for `.single()` against zero rows; postgrest-js
    # surfaces it as a query error (data === null).
    body = {
        "code": "PGRST116",
        "details": "Results contain 0 rows",
        "hint": None,
        "message": "JSON object requested, multiple (or no) rows returned",
    }
    _fulfill_json(route, body, status=406)


class SupabaseRestMock:
    """One instance per test (see the `rest_mock` fixture in conftest.py).

    Routes are registered lazily on the first `set_*` call (mirroring
    BackendApiMock), so they land AFTER the autouse network guard and win by
    Playwright's last-registered-wins precedence."""

    def __init__(self, context: BrowserContext):
        self._context = context
        self._user_listing = None      # maybeSingle GET /listings  (Management, Create existing-check)
        self._listing_by_id = None     # single GET /listings by id  (Edit read)
        self._public_listing = None    # single GET /public_listings (Detail)
        self._write_error = None       # (status, body) to fail insert/update/delete
        self._routed = False

    # --- setup -------------------------------------------------------------

    def _ensure_routes(self):
        if self._routed:
            return
        self._routed = True
        self._context.route(f"{REST_BASE}/listings**", self._handle_listings)
        self._context.route(f"{REST_BASE}/public_listings**", self._handle_public_listings)

    def set_user_listing(self, listing):
        """The row returned by `.maybeSingle()` — pass a dict for "has a
        listing", or None for "no listing yet" (empty array)."""
        self._user_listing = listing
        self._ensure_routes()
        return listing

    def set_listing_by_id(self, listing):
        """The row returned by Edit's `.single()` read (ownership is then
        checked client-side against the logged-in user)."""
        self._listing_by_id = listing
        self._ensure_routes()
        return listing

    def set_public_listing(self, listing):
        """The row returned by Detail's `.single()` on `public_listings`; None
        models "not found" (406)."""
        self._public_listing = listing
        self._ensure_routes()
        return listing

    def fail_writes(self, message: str = "操作失敗", status: int = 400):
        self._write_error = (status, {"message": message, "code": "", "details": "", "hint": ""})
        self._ensure_routes()

    # --- handlers ----------------------------------------------------------

    def _handle_listings(self, route):
        method = route.request.method
        if method == "GET":
            accept = (route.request.headers.get("accept") or "").lower()
            if _OBJECT_ACCEPT in accept:
                # `.single()` by id — Edit read.
                if self._listing_by_id is None:
                    return _not_found_406(route)
                return _fulfill_json(route, self._listing_by_id)
            # `.maybeSingle()` — Management / Create existing-check.
            return _fulfill_json(route, [self._user_listing] if self._user_listing else [])

        if method in ("POST", "PATCH", "DELETE"):
            if self._write_error:
                status, body = self._write_error
                return _fulfill_json(route, body, status=status)
            if method == "DELETE":
                # so the component's post-delete refetch lands on the empty state
                self._user_listing = None
            return _fulfill_empty(route, status=201 if method == "POST" else 204)

        return _fulfill_empty(route, status=204)

    def _handle_public_listings(self, route):
        if route.request.method == "GET":
            if self._public_listing is None:
                return _not_found_406(route)
            return _fulfill_json(route, self._public_listing)
        return _fulfill_empty(route, status=204)
