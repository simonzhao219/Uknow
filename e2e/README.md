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
overflow_probe.py # 瀏覽器內的溢字/溢版量測探針（給下面那支巡檢用）
test_overflow_sweep.py  # 375px 全路由溢字巡檢（非 BDD，見下節）
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

## Removing a scenario

這一層最貴（一個情境約 0.8–1.7 秒，整套約佔 CI 牆鐘的最長那一軌），所以
「同一個行為已經在更便宜的層被驗過」的情境值得刪。但**刪錯的代價是把關
靜默變弱、沒有人會發現**，所以要有證據，分三級：

| 級 | 定義 | 例 |
|---|---|---|
| **A** | 下層測試 render 真元件、驅動同一組互動、斷言同一串文字 | `WithdrawalProcess.test.tsx` 的 `renderAndGoToStep3()` 完整重演 e2e 的四步 |
| **B** | 下層測試斷言同一個**決策函式**的輸出，而該決策在 e2e 只是被顯示出來 | `withdrawalValidation.test.ts` 產出的正是 e2e 斷言的 `最低提領Point為 1,000P` |
| **C** | 同一段程式碼路徑在 e2e 內部被兩個情境重複驗——**限「同元件、同路徑，只有被 mock 的資料不同」** | `listing_management` 與 `service_provider_detail` 都驗同一個公開詳情頁 |

**不算證據**（這幾條擋掉的假重複比真重複還多）：

- 字串在下層檔案出現過 ≠ 被斷言過（測資裡的人名到處都是）。
- 後端有 API 測試 ≠ 前端有接上——e2e 的獨特價值正是這條接線。
- 決策函式有測 ≠ 決策被接進 router / 元件。
- **名字看起來像同一件事 ≠ 是同一件事。套用 B 級必須 `grep` 到被測情境
  實際 import 的那個識別字**——`RequireMembershipRoute` 有自己的
  `resolveMembershipRedirect`，與 `registrationFlow.ts` 的
  `resolveCheckoutPageRedirect` 是兩張獨立決策表，從無互相 import。
- 替代品若是 **report-only、不擋 CI**（如 `test_overflow_sweep.py` 在未設
  `E2E_OVERFLOW_STRICT` 時），那是降級不是接手。
- **jsdom 沒有版面引擎、也不載入編譯後 CSS**：任何依賴 media query、實際
  尺寸、捲動、溢版的斷言，元件測試結構性地接不住。

刪完要做的兩件事：**（1）**清掉只被該情境使用的孤兒 step——`knip` 不掃
Python，得手動 `grep` 步驟片語確認 `features/` 內無其他引用；**page object
不要動**，`journey/` 會 import `e2e/pages/`。**（2）**實跑一次被指名的下層
測試，確認接手方真的還在（C 級尤其重要，它沒有下層兜底）。

## Must-keep end-to-end coverage

以下四條使用者關鍵旅程**各自至少保留一條端到端情境**，不論下層覆蓋到什麼
程度都不刪——e2e 的獨特價值是「整條線串起來」，那不屬於重複：

| 旅程 | 保留的情境 |
|---|---|
| 註冊 | `Successful signup navigates to OTP verification` → `Correct code verifies and proceeds` → `A fully valid submission proceeds to checkout` |
| 付款 | `Clicking pay redirects through a simulated successful PayUni payment`、`A success status in the URL renders the success screen` |
| 會籍 | `An expired former member is sent to checkout to renew`、`A paid arrival not yet activated shows the activating screen, then auto-advances` |
| 提領 | `An eligible member can submit a withdrawal application end to end`、`A member confirms collection of an approved withdrawal` |

另外 `route_guards.feature` **整檔保留**：`ProtectedRoute` /
`RequireMembershipRoute` / `AdminRoute` 沒有任何元件測試 render 過，
`resolveMembershipRedirect` 的六個分支在其他三層都不存在——其中
`paidAwaitingActivation` 分支守的是「絕不能把已付款的人送回結帳頁造成
重複付款」。

## 溢字/溢版巡檢（`test_overflow_sweep.py`）

規格明訂「以手機瀏覽器為主要優化目標」，但這套 suite 預設跑
1280×900（`conftest.py` 的 `browser_context_args`），手機版面在 CI 幾乎
沒被畫出來過。這支巡檢補上那一軸：把每條路由在 **375px** 下載入、量一次
盒子，找出文字或內容跑出容器的地方。

```bash
pytest test_overflow_sweep.py --browser chromium     # 跑巡檢
E2E_OVERFLOW_STRICT=1 pytest test_overflow_sweep.py  # 轉成硬失敗
```

- **預設 report-only**：結果寫進 `test-results/overflow-report.{md,json}`
  （CI 已經會把整個目錄當 artifact 上傳），不會讓 CI 變紅。一上線就硬
  失敗的閘門會被關掉；先讓紅色 baseline 變成看得見的證據，等清乾淨了再
  設 `E2E_OVERFLOW_STRICT=1` 轉成硬失敗。ratchet 機制已內建，屆時不必
  改測試。
- **唯一會失敗的情況**是路由守衛把巡檢導去別的頁面——那代表這條沒掃到
  目標頁面，是巡檢本身壞了，必須修 setup 的登入/會籍狀態。
- **不是 `.feature`**：其他測試描述使用者行為，這支是橫切面巡檢，硬套
  Gherkin 只會得到沒人想讀的假場景。走 `pytest.ini` 已允許的 `test_*.py`。
- **測資是「最壞但可達」**：每個欄位取產品實際允許的極端值（名稱 10 字
  上限、清單裡最長的類別、使用者貼上的原始 FB 網址），不是憑空的長字串
  ——超出產品約束的假資料會做出假紅，讓報告不可信。
- **盲區**：只做被動載入，掃不到 toast、對話框、下拉等需要互動才出現的
  東西；目前也只跑 375px 單一軸。每次報告的文末都會列出來。
- **需要中文字型**:全站文案是中文,所有溢出數字都建立在中文字寬上。
  巡檢會先量一次字寬,不是全形就硬失敗(這條不受 report-only 影響——
  量測工具壞掉時報告不該裝作有效)。量到的比值也會寫進報告開頭,跨環境
  比對 baseline 時先確認這個值一致,再比發現數量。
  Debian/Ubuntu 缺字型時裝 `fonts-wqy-zenhei` 或 `fonts-noto-cjk`。

新增路由時記得把它加進 `ROUTES`；需要特殊登入/會籍狀態的，寫一個
`_setup_*` 函式並沿用 `mocks/` 既有的 helper。

## Coverage

- **Public directory** (the app's front door): `home_listings.feature` drives
  the `/` listing grid, keyword search (match / no-match + clear), the two
  empty states, and card→detail navigation; `service_provider_detail.feature`
  drives the public `/service-providers/:id` page (found + `找不到此服務者`
  not-found). Both read the `public_listings` view through
  `SupabaseRestMock.set_public_listings` (list) / `set_public_listing` (single).
- **Registration recovery**: `registration_recovery.feature` is the template
  for the four recoverability contracts — see
  `docs/multi-step-flow-recovery.md`. Any new multi-step flow adds its own
  "leave mid-flow, come back through a different entry" scenario here.
- **Rewards and withdrawal** (`/rewards`) — the value a member unlocks *after*
  paying: referral-earned points, eligibility guardrails, the withdrawal
  application, and the 查收 collection step — `rewards_withdrawal.feature`.

## Known gaps (by design)

- Real Supabase/PayUni integration is out of scope here — see the Deno tests
  under `supabase/functions/api/*.test.ts` for that layer, and `journey/` for
  full-stack coverage against a real branch.
- The `FeatureContext` feature-flag system is currently a hardcoded
  all-enabled stub client-side, so the "disabled feature" UI path in
  `ProtectedRoute` isn't reachable yet and has no scenario.
- Dashboard and admin pages only have smoke-level (or no) coverage — expand
  `features/` as those flows stabilize.
- ID-photo *upload* is skipped by pre-seeding `GET /rewards/id-photos`;
  driving the real file-chooser upload path is still open.
