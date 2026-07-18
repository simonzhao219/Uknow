# Uknow E2E suite (pytest-bdd + Playwright)

Browser-level regression tests for the web app, built with pytest-bdd
(Gherkin feature files) and Playwright, following the Page Object Model.

## Why everything is mocked

Login/signup depend on real Supabase Auth (including email OTP delivery),
and checkout redirects to a real PayUni payment page. Neither is something a
test suite should touch for real. Every scenario here intercepts:

- Supabase Auth (`https://<project>.supabase.co/auth/v1/*`)
- The app's own backend (`https://<project>.supabase.co/functions/v1/api/*`)
- The PayUni gateway redirect itself, via a mocked `apiUrl` returned from
  `/payuni/prepare` that immediately answers with a redirect back into the
  app (see `mocks/backend_api_mock.py::mock_prepare_and_redirect`)

A safety-net route (`conftest.py::_block_real_network`) fails any request to
Supabase or `api.payuni.com.tw` that a scenario forgot to mock, so a gap in
mocking shows up as a clear test failure instead of a silent real request.

## Setup

```bash
cd e2e
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
playwright install chromium
```

## Running

```bash
pytest                          # full suite, headless (run from inside e2e/)
pytest -m smoke                 # fast subset first, to validate the harness
pytest --headed --slowmo 500    # watch a run in a real browser window
pytest -k payment_result        # run one feature's scenarios by keyword
```

By default the session-scoped `dev_server` fixture (see `conftest.py`) runs
`npm run dev` for you and waits for `http://localhost:3000`. If you already
have the dev server running (or it's started separately in CI), set
`E2E_SKIP_DEV_SERVER=1` and the fixture is a no-op.

## Layout

```
config.py         # BASE_URL / Supabase project ref / mock PayUni domain
conftest.py       # dev-server bootstrap, browser/base_url wiring, mock + page-object fixtures
mocks/            # SupabaseAuthMock, BackendApiMock, session-seeding helper
pages/            # Page Object Model — one class per route/component
features/         # Gherkin feature files (English)
steps/            # step definitions; common_steps.py holds shared Given/When/Then
```

## Adding a scenario

1. Add the `Scenario`/`Scenario Outline` to the relevant `.feature` file.
2. If it needs a new step phrase, add a `given`/`when`/`then` to that
   feature's `steps/*_steps.py` (or `common_steps.py` if it's reusable).
3. If it needs a new backend response shape, add a method to
   `mocks/backend_api_mock.py` or `mocks/supabase_auth_mock.py` rather than
   registering a route inline in a step — keeps mock shapes in one place.
4. If it needs a new selector, prefer `get_by_role`/`get_by_label` on the
   page object; only add a `data-testid` to the source component when the
   text/role is ambiguous or state-dependent.

## Recently added coverage

- The **public directory** — the app's front door — is now covered:
  `home_listings.feature` drives the `/` listing grid, the keyword search
  (match / no-match + clear), the two empty states, and card→detail
  navigation; `service_provider_detail.feature` drives the public
  `/service-providers/:id` page (found + `找不到此服務者` not-found). Both read
  the `public_listings` view through `SupabaseRestMock.set_public_listings`
  (list) / `set_public_listing` (single).

## Known gaps (by design, for this first pass)

- Real Supabase/PayUni integration is out of scope here — see the Deno tests
  under `supabase/functions/api/*.test.ts` for that layer.
- The `FeatureContext` feature-flag system is currently a hardcoded
  all-enabled stub client-side, so the "disabled feature" UI path in
  `ProtectedRoute` isn't reachable yet and has no scenario.
- Dashboard and admin pages only have smoke-level (or no) coverage — expand
  `features/` as those flows stabilize.
- The reward-points and withdrawal flows (獎勵回饋, `/rewards`) — the value a
  member unlocks *after paying*: referral-earned points, eligibility
  guardrails, the withdrawal application, and the 查收 collection step — are
  covered in `rewards_withdrawal.feature`. ID-photo *upload* is skipped by
  pre-seeding `GET /rewards/id-photos`; driving the real file-chooser upload
  path is still open.
