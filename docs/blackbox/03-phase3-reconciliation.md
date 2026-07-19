# Phase 3 — 黑箱假設 vs 真實系統 對照與自動化完成報告

> **版本**：v1（Phase 3）
> **前置**：`01-spec.md`（黑箱規格 v2）、`02-test-plan.md`（黑箱測試計畫 v2）
> **目的**：把 Phase 1–2 的純黑箱推定與真實系統對照，記錄落差、修正測試計畫方向，並完成自動化。

---

## 1. 最重要的黑箱發現：領域完全猜錯

Phase 1 依「僅有產品名稱 Uknow」推定為 **線上多人 UNO 卡牌遊戲**。Phase 3 對照真實系統後確認：**這是錯的**。

| 項目 | Phase 1 黑箱推定 | 真實系統 |
|---|---|---|
| 產品類型 | 多人即時卡牌遊戲 (UNO) | **服務商目錄 + 付費會員 + 推薦獎勵 + 任務/獎勵 + 金流平台** |
| 核心流程 | 出牌 / 抽牌 / 勝負 | 瀏覽服務者 → 註冊/OTP → 完善資料 → 付費開通會員 → 刊登管理 / 推薦 / 任務 / 獎勵提領 |
| 前端 | 遊戲畫布 | React + Vite + TypeScript + Radix UI + Tailwind（Figma 匯出） |
| 後端 | 權威遊戲伺服器 + WebSocket | Supabase（Auth / PostgREST）＋ Hono on Cloudflare Workers 後端 API；PayUni 金流 |
| 即時同步 | 高度需求 | 幾乎無（一般 CRUD + 輪詢付款結果） |

### 這代表什麼（黑箱測試的教訓）
- **只憑名稱、不觀察執行中的系統，黑箱規格可以 100% 走偏。** 名稱諧音（Uknow→UNO）具高度誤導性。
- 真正的黑箱測試 = 觀察「執行中的系統行為」而非猜測。本專案在 Phase 3 取得可觀察對象後（路由、UI、Cloudflare 部署預覽），才得以修正。
- Phase 1–2 的 UNO 規格/測試計畫**予以保留**，作為「name-only 黑箱」的過程記錄與反例；**不作為自動化依據**。真正的自動化依據是下述真實系統測試計畫（已具現為可執行的 `e2e/` 套件）。

---

## 2. 真實系統規格（黑箱・使用者視角，依可觀察路由與行為）

### 2.1 產品定位
Uknow 是一個**服務者媒合平台**：一般訪客可公開瀏覽/搜尋服務者；使用者註冊、完善個資、付費成為會員後，可刊登自己的服務、參與推薦獎勵、完成任務累積回饋點數並申請提領。含管理後台與金流串接（PayUni）。

### 2.2 路由地圖（真實）
| 路由 | 頁面 | 存取層級 |
|---|---|---|
| `/` | 服務者目錄首頁（清單、關鍵字搜尋、篩選、距離排序） | 公開 |
| `/service-providers/:id` | 服務者詳情 | 公開 |
| `/login`, `/register` | 登入 / 註冊 | 公開 |
| `/auth/verify-otp` | OTP 驗證 | 公開（流程中） |
| `/auth/complete-profile` | 完善個資 | 登入 |
| `/forgot-password`, `/auth/reset-password` | 忘記/重設密碼 | 公開 |
| `/dashboard` | 會員儀表板 | 登入 + 會籍 |
| `/service-providers`（+ `/create`, `/edit/:id`） | 刊登管理 | 登入 + 會籍 + featureFlag |
| `/referrals` | 推薦管理 | 登入 + 會籍 + featureFlag |
| `/tasks` | 任務中心 | 登入 + 會籍 + featureFlag |
| `/rewards` | 獎勵回饋 / 提領 | 登入 + 會籍 + featureFlag |
| `/payment/checkout`, `/payment/result` | 結帳 / 付款結果 | 登入 |
| `/admin` | 管理後台 | 管理員 |
| `/terms-of-service`, `/listing-plans`, `/referral-reward-rules`, `/referral-reward-contract` | 條款/方案/規則內容頁 | 公開 |

### 2.3 存取控制（真實觀察）
- `ProtectedRoute`：未登入導向 `/login`。
- `RequireMembershipRoute`：以 `accountStatus`（active / grace / expired）決定放行；過期導向 `/payment/checkout` 續約，付款開通中導向 `/payment/result`。
- `AdminRoute`：非管理員擋下。
- `FeatureContext`：功能旗標（目前為前端全開啟 stub）。

---

## 3. Phase 2 黑箱測試計畫哪些「精神」在真實系統仍成立

雖然領域猜錯，Phase 2 測試計畫的**測試面向框架**完全可轉移到真實系統，且真實 `e2e/` 套件正是這些面向的具現：

| Phase 2 面向 | 在真實系統的對應（已具現於 e2e/） |
|---|---|
| Functional / Positive | 登入、註冊、OTP、完善個資、刊登 CRUD、結帳成功、領獎、提領 |
| Negative | 錯誤密碼、OTP 錯誤、查無服務者、非法輸入、付款失敗原因 |
| Boundary | 註冊步驟邊界、訂閱過期/寬限/長期過期、金額/效期邊界 |
| Exception / 復原 | 付款 pending 輪詢、開通逾時重試、session 過期導頁 |
| Security / 越權 | 路由守衛（未登入/非會員/非管理員）、in-app browser 不被封鎖 |
| 可測試性 | 全面 mock（Supabase Auth / PostgREST / 後端 API / PayUni），阻擋真實網路 |

→ 結論：**測試面向清單（第 2 部產出）作為「標準」仍有效**，只是「測項內容」需綁定真實功能。真實系統已有一套高品質 pytest-bdd + Playwright E2E 實作它們。

---

## 4. 既有自動化現況（Phase 3 進場時）

`e2e/`：pytest-bdd（Gherkin）+ Playwright + Page Object，全面 mock 第三方。進場基線：

- 14 個 feature 檔、105 個 scenario。
- 執行結果：**104 passed / 1 failed**。

### 已存在覆蓋
auth（login/signup/OTP/forgot-password/complete-profile）、payment（checkout/result）、listing 管理、referral、rewards/withdrawal、route guards、in-app browser、dashboard smoke。

### 進場即發現的缺口
1. **公開首頁 `/`（服務者目錄：清單、搜尋、空狀態、進詳情）完全無 feature 覆蓋** — 這是整個產品的門面。
2. **公開詳情 `/service-providers/:id`** 僅有 page object，無 feature 驅動（找到 / 找不到）。
3. 1 個既有測試不穩定（見下）。
4. README 自述的其他 gap：feature-flag 停用路徑、dashboard/admin 深度覆蓋、ID 照片實體上傳。

---

## 5. Phase 3 對自動化做的事（完成自動化）

### 5.1 修復不穩定測試
- **`payment_result`：「Contact support opens the LINE link」** 原本 `expect(popup).to_have_url("https://line.me/ti/p/@Uknow")` 等待**真實外部導頁**。此與整套「mock 一切、阻擋真實網路」的設計相矛盾，且 line.me 實際會 302 轉址、沙箱又無外網 → 非決定性失敗（`chrome-error`）。
- 修法：在點擊前以 route 攔截 `https://line.me/**` 回一個 200 stub，讓新分頁確定性地停在目標深連結，斷言「開對了 LINE URL」而不離開 mock 沙箱。

### 5.2 補齊最大缺口：公開服務者目錄
新增（對照 §4 缺口 1、2）：
- `mocks/supabase_rest_mock.py`：擴充 `public_listings` 的**列表**讀取支援（`set_public_listings` + `build_public_listing`），原本僅支援詳情的 `.single()`。
- `pages/home_page.py`：HomePage 頁面物件（搜尋框、卡片 `:visible` 定位、空狀態、清除鈕）。
- `features/home_listings.feature`（5 scenario）：清單渲染、空目錄空狀態、關鍵字搜尋命中、無命中空狀態＋清除還原、點卡片進詳情。涵蓋 functional / positive / negative / navigation。
- `features/service_provider_detail.feature`（2 scenario）：詳情渲染（服務介紹/聯絡方式）、查無服務者 `找不到此服務者`。涵蓋 positive / negative。
- `steps/home_steps.py`：上述步驟定義，重用 `common_steps` 的 `I visit` / `I should see the text`。
- `conftest.py`：註冊 `home_page` fixture。

### 5.3 可重現性與工程修正
- `requirements.txt`：`playwright>=1.45` → **`playwright==1.56.0`**（浮動版本會抓到與環境不符的 Chromium build 而啟動失敗；1.56.0 對應 build 1194）。
- `pytest.ini`：新增 `negative` marker（`--strict-markers` 下需宣告）。

### 5.4 結果
- 全套件：**112 passed / 0 failed**（105 − 1 修復後全綠 + 7 新 scenario）。
- 執行方式：`cd e2e && pip install -r requirements.txt && pytest`（或 `pytest -m smoke` 先驗 harness）。本環境已預裝 Chromium，勿執行 `playwright install`。

---

## 6. Backlog 狀態（對照 Phase 2 面向）

| 缺口 | 面向 | 狀態 |
|---|---|---|
| Admin 後台（提領/會員管理、tab 導覽、越權阻擋） | Functional / 越權 | ✅ 已完成（round 2，見 §7） |
| Admin 提領審核動作（已匯款 / 退件） | Functional / 動作 | ✅ 已完成（round 3，見 §8） |
| 首頁距離排序（geolocation 授權後由近到遠） | Functional / 邊界 | ✅ 已完成（round 2） |
| 手機響應式卡片（mobile grid） | 相容性 | ✅ 已完成（round 2） |
| ID 照片實體上傳（file chooser） | Functional / 邊界 | ✅ 已完成（round 3，見 §8） |
| Feature-flag 停用路徑（ProtectedRoute 擋 featureRequired） | Negative / 授權 | ⏸ 仍開放：`FeatureContext` 為前端全開 stub，停用路徑不可達；需**產品先提供可控旗標**（動 app 行為）才可測，非測試層可自足。 |
| 後端規則層（Supabase functions） | 安全 / 契約 | ⏸ 仍開放：屬 Deno 測試層（`supabase/functions/api/*.test.ts`），與 UI 層互補、另一條 toolchain。 |

---

## 7. Backlog round 2（本輪續作）

### 7.1 新增自動化
- **首頁距離排序**（`home_listings.feature` +2）：以 `context.set_geolocation` 授權定位後，目錄依「使用者→服務者城市距離」由近到遠排序；未授權時維持最新（插入）順序。對照 HomePage 的 Haversine 排序邏輯。
- **首頁手機響應式**（+1）：375px viewport 下 mobile 卡片網格正確渲染（卡片 `:visible` 定位涵蓋 desktop/mobile 兩種格線）。
- **Admin 後台**（新 `admin_dashboard.feature`，5 scenario）：非管理員訪問 `/admin` 被導向 `/dashboard`（越權）、管理員看到四個管理分頁、提領空狀態、待處理提領顯示申請人與「待處理」徽章、切到「會員管理」分頁列出會員。新增 `AdminDashboardPage` 頁面物件、`BackendApiMock` 的 admin 端點（withdrawals/members/announcements/admin-setup）與 `build_admin_withdrawal` / `build_admin_member` 建構子；`pytest.ini` 補 `compatibility` marker。

### 7.2 黑箱測試找出的真實產品 bug（已修）
- **`AdminRoute` 冷啟動彈出 bug**：`ProtectedRoute` 會等待 session 解析（`isLoadingUser && !user` 顯示 loading），但 `AdminRoute` 未比照——直接進 `/admin`（管理員書籤、整頁重新載入、金流導回）時，載入瞬間 `user=null` 被判未登入而導去 `/login`，登入頁再把「已登入」的管理員彈到 `/dashboard`，導致管理員**看不到後台**。修法：`AdminRoute` 比照 `ProtectedRoute` 加上載入中 spinner 守衛。新增的越權/渲染 admin 測試同時證明並鎖定此修正。

### 7.3 結果
- 全 E2E 套件：**124 passed / 0 failed**；`tsc --noEmit` 通過；vitest 單元 **86 passed**。

---

## 8. Backlog round 3（本輪續作）

### 8.1 新增自動化
- **Admin 提領審核動作**（`admin_dashboard.feature` +2）：對待處理提領按「已匯款」→ 成功卡片「已標記匯款完成」；按「退件」→ 確認對話框 →「已退件」。補齊上一輪只鋪了 mock（POST `/status`）卻未驅動的動作路徑；`AdminDashboardPage` 加 `mark_first_withdrawal_paid` / `reject_first_withdrawal`。（實作插曲：成功回饋走的是置中 `NotificationCard` modal 而非角落 toast，斷言改用文字定位。）
- **ID 照片實體上傳**（`rewards_withdrawal.feature` +1）：不預先塞照片，改以 Playwright `set_input_files`（記憶體 1×1 PNG，不需磁碟檔）驅動兩個 `input[type=file]` 走真實上傳路徑 → POST `/rewards/upload-id-photos` → 送出提領成功。新增 `RewardPage.upload_id_photos`（先設背面、再設正面以避開選檔後 input 抽換造成的 reindex）與 `BackendApiMock.set_upload_id_photos_success`（原有 `set_upload_photo_success` 只涵蓋刊登照片 `/listings/upload-photo`，非 ID 照片端點）。

### 8.2 結果
- 全 E2E 套件：**127 passed / 0 failed**（本輪僅動 e2e，`src` 未變動，故 typecheck / vitest 不受影響）。

> 剩餘 ⏸ 兩項：**feature-flag 停用路徑**需產品先提供可控旗標（`FeatureContext` 目前前端全開，動它屬產品架構決策，非測試層可自足）；**後端 Supabase functions Deno 測試層**屬另一條 toolchain。兩者各有前置條件，非單純測試補齊。
