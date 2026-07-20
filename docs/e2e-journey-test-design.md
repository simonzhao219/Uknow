# Uknow Journey 自動化測試設計 — 六代 30 人全功能情境

> **狀態**：設計定稿（四項關鍵決策已由產品負責人拍板，見 §0）
> **範圍**：註冊、付款、推薦、任務、刊登、提領（含管理員審核端）
> **性質**：打真後端的 Journey 級測試，與現有全 mock 的 `e2e/` 套件並存、共用 Page Object

---

## 0. 已拍板的四項決策

| 決策點 | 結論 |
|---|---|
| 測試環境 | **每次測試跑在專屬 Supabase 測試分支/專案**，測完刪整個分支＝資料保證清乾淨；`cleanup.py` 為第二道保險 |
| 金流模擬 | **真打 PayUni sandbox 刷卡頁**，使用測試卡 `4147631000000001`、有效期 `01/31`、CVV `123`；另備「簽章 webhook 注入」備援模式 |
| 30 人建置 | **全部 30 人走 Web GUI**（純黑箱），以 nightly 排程執行 |
| 跨時間情境 | **納入**：以 service-role 回填歷史資料（連續推薦達人 12 個月、訂閱即將失效/永久失效、補繳） |

---

## 1. 目標與定位

### 1.1 為什麼是新的一層，而不是擴充現有 `e2e/`

現有 `e2e/` 套件（pytest-bdd + Playwright）**攔截所有** Supabase Auth／後端 API／PayUni 請求，
`conftest.py::_block_real_network` 甚至會直接 fail 任何未 mock 的真實請求。它驗的是「前端在各種
後端回應下的行為」，不會產生真資料，也就無從驗證：

- 付款成功後，DB 內三代獎勵、訂閱、推薦邊（`referral_edges`）的**真實連動**；
- 推薦王計數、任務 claim 後訂閱效期的**真實延展**；
- 提領兩階段生命週期中，會員端與管理員端看到的**同一筆真資料**。

本設計新增 `e2e/journey/` 層級：**不 mock 任何東西**，30 個模擬使用者從註冊到提領全程走瀏覽器，
打一個專屬的 Supabase 測試分支，測完把分支刪掉。

### 1.2 測試金字塔中的位置

| 層級 | 套件 | 觸發時機 |
|---|---|---|
| 單元/元件 | `vitest`（`src/**/*.test.tsx`）、Deno（`supabase/functions/api/*.test.ts`） | 每次 PR |
| UI 行為（全 mock） | `e2e/features/*`（現有） | 每次 PR |
| **Journey（本設計）** | `e2e/journey/*` | **nightly** ＋ 發版前手動 |

---

## 2. 組織樹設計：root + 29 人、root 之下六代

依**程式碼現行規則**（與規格書文字略有出入，以程式碼為準）：

- 推薦獎勵為**三代制、每代 100P、付款當下一次發清**（`reward_config.referral_reward_amount`，預設 100）；
- **推薦王門檻＝單月直推 8 人**（`reward_config.referral_king_monthly_threshold`），獎勵為可 claim 的「免費續約一年」credit；
- 提領：最低 1,000P、須為 1,000 倍數、外加手續費 15P（檢核 `餘額 >= 提領額 + 15`），需身分驗證與證件照，狀態機 `pending → awaiting_collection → completed / rejected`；
- 推薦樹查詢（`referral_tree` SQL）只往下爬 **3 層**。

### 2.1 樹形

```
Root (A)                          ── 本次測試的主角，要能測到所有功能
├─ 第1代：B1–B8   （8 人）        ── 同一月內註冊 → 正好觸發推薦王門檻 8
│    B1 ─┬─ 第2代：C1–C3
│    B2 ─┼─ 第2代：C4–C6
│    B3 ─┴─ 第2代：C7–C8         （第2代共 8 人）
│         C1 ─┬─ 第3代：D1–D3
│         C4 ─┼─ 第3代：D4–D6
│         C7 ─┴─ 第3代：D7–D8    （第3代共 8 人）
│              D1 ── 第4代：E1–E3 （3 人）← Root 不得從此代得到任何獎勵
│                   E1 ── 第5代：F1
│                        F1 ── 第6代：G1
└─ 合計：1 + 8 + 8 + 8 + 3 + 1 + 1 = 30 人，Root 之下 6 代
```

### 2.2 這個形狀讓每個功能都有精確的預期值

| Root 驗證項 | 預期值 |
|---|---|
| 獎勵總額 | (8+8+8) × 100P = **2,400P**；第 4~6 代（E/F/G）**0 筆** |
| 獎勵明細 | 24 筆 `reward_transactions`，generation 1/2/3 各 8 筆，且被推薦人姓名快照正確 |
| 推薦樹 UI | 恰好顯示 3 代 24 人；**E1 不得出現** |
| 任務—推薦王 | B8 付款完成當下達標（8/8）；claim 後訂閱到期日 +1 年 |
| 提領（正向） | 申請 1,000 → 扣 1,015 → 餘 1,385；admin 處理 → 查收 → completed |
| 提領（負向） | 非 1,000 倍數被拒；餘 1,385 時申請 2,000（需 2,015）被拒 |
| 刊登 | 建立 → 首頁公開可見 → 「一帳號一刊登」上限被擋 |

**交叉驗證（證明獎勵是「相對每個節點」計算）**：

| 節點 | 它自己的三代 | 預期獎勵 |
|---|---|---|
| B1 | C1–C3 ／ D1–D3 ／ E1–E3 | 9 × 100 = 900P（不足 1,015，同時當提領門檻的負向樣本） |
| C1 | D1–D3 ／ E1–E3 ／ F1 | 7 × 100 = 700P |
| F1 | G1 ／ — ／ — | 100P |
| G1 | 無下線 | 0P（葉節點空狀態畫面） |

---

## 3. 測試環境策略：一次測試 = 一個 Supabase 分支

### 3.1 生命週期

```
┌─ Setup ────────────────────────────────────────────────────┐
│ 1. 由 main 專案建立 preview branch（supabase branches       │
│    create / MCP create_branch），取得分支專屬的             │
│    project_ref、anon key、service_role key、DB URL          │
│ 2. 分支自動套用全部 migrations；harness 檢核               │
│    reward_config 存在且 seed 值正確                         │
│ 3. 設定分支的 Edge Function secrets：PAYUNI_SANDBOX=true、  │
│    PayUni sandbox 商店代號/HashKey/HashIV                   │
│ 4. 產生前端連線設定（見 §3.2），啟動 Vite dev server        │
└────────────────────────────────────────────────────────────┘
┌─ Run ──────────────────────────────────────────────────────┐
│ 建樹 → 六大模組驗證 → 跨時間情境（詳 §5–§7）                │
└────────────────────────────────────────────────────────────┘
┌─ Teardown（不論成敗必跑）──────────────────────────────────┐
│ 1. cleanup.py --run-id：刪 Storage 物件 → 業務資料 →        │
│    auth users，並斷言各表殘留 = 0（第二道保險，詳 §9）      │
│ 2. 刪除整個 preview branch（第一道保險：就算 cleanup        │
│    失敗，分支刪除後資料必然不存在）                          │
└────────────────────────────────────────────────────────────┘
```

### 3.2 前置程式碼修改（唯一需要動產品碼的地方）

前端的 Supabase 連線寫死在自動產生的 `src/utils/supabase/info.tsx`
（`projectId` / `publicAnonKey` 字面值）。Journey 測試要指向分支，需其一：

- **建議**：`info.tsx` 改為 `import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "<現值>"` 的 fallback 寫法，
  journey harness 啟動 Vite 時注入分支的 ref 與 anon key（對正式建置零影響）；
- 備案：harness 在啟動前重寫 `info.tsx`、結束後還原（不動產品碼，但有殘檔風險）。

同時 `e2e/conftest.py` 的 `_block_real_network` 是 autouse fixture，journey 層的 `conftest.py`
必須以「允許分支網域、**仍然封鎖正式站 ref 與 api.payuni.com.tw 以外的 PayUni 網域**」的
guard 覆蓋——避免測試誤打正式環境，這條防線保留。

---

## 4. 金流：真打 PayUni sandbox，備援 webhook 注入

### 4.1 主模式 `JOURNEY_PAYMENT_MODE=sandbox`（預設）

每位使用者的付款步驟完全走真實路徑：

1. GUI 走到訂閱付款頁，點「前往付款」→ 前端呼叫 `/payuni/prepare`（真的，`PAYUNI_SANDBOX=true`）；
2. Playwright 跟著跳轉進 **PayUni sandbox 刷卡頁**，填測試卡：
   卡號 `4147631000000001`、有效期 `01/31`、CVV `123`，送出；
3. 跟著 302 回到 `/payuni/return`，同時 sandbox 會非同步打 `/webhooks/payuni/notify`；
4. 斷言付款結果頁顯示成功，且後端 side effects（訂閱、推薦邊、三代獎勵、推薦王計數）全部落地。

PayUni sandbox 頁面是**外部依賴**，其選擇器獨立封裝成 `pages/payuni_sandbox_page.py`，
改版時只修一個檔案。

### 4.2 備援模式 `JOURNEY_PAYMENT_MODE=webhook`

sandbox 停機或改版導致主模式紅燈時，nightly 可切此模式續跑其餘 95% 的驗證：

1. GUI 一樣走到 `/payuni/prepare`（建立 `payment_orders` pending 單）；
2. harness 攔下往 sandbox 的跳轉，改用 PayUni sandbox HashKey/HashIV **簽出合法加密的
   notify payload**（重用 `supabase/functions/api/crypto.ts` 的演算法）直接 POST
   `/webhooks/payuni/notify`；
3. 導航回 `/payuni/return` 對應的結果頁繼續斷言。

後端的付款處理、冪等、獎勵連動在兩種模式下走的是**同一段真程式碼**；差異只在「誰產生
notify」。CI 預設 sandbox 模式，連續失敗自動降級 webhook 模式重跑並標記告警。

---

## 5. 單一使用者的 GUI 建置流程（×30）

每位使用者依序完成（全程 Playwright 操作真實 UI）：

1. **Step 0** — 輸入 email 檢核（新 email → 進註冊）；
2. **Step 1** — 設定密碼 → **email OTP 驗證**：harness 以 service role 呼叫 Supabase Admin API
   `generateLink`，從回傳值取得 `email_otp`，**照樣打進 GUI 的 OTP 輸入框**——使用者操作
   路徑完全真實，只有「收信」這一步被替代，雲端分支環境同樣適用；
3. **Step 2** — 完善資料：填**上線的推薦碼**（斷言 UI 即時顯示推薦人真實姓名）、真實姓名、
   身分證字號（產生器生成，見 §8.2）、生日（>18 歲）、手機；
4. **Step 3** — 付款 $1,200（§4）；
5. 付款完成斷言：儀表板顯示訂閱中、推薦碼已產生（`3 碼小寫英文 + 6 碼數字` 格式）。

**建置順序**：以「代」為序 BFS——家長必須先完成付款成為訂閱中，其推薦碼才能給下一代用。
同一代內可用多個 Playwright context 平行（見 §11.2 的 rate limit 節流）。每人完成後把
`email / password / user_id / referral_code` 寫入 `run_state.json`，供後續模組與 cleanup 使用。

**管理員**：建樹前先以第 31 個帳號走 `/admin-setup/set-self-admin` 首次管理員流程建立
admin（管理員也是測試資料，teardown 一併刪除）。

---

## 6. 六大模組驗證情境（Gherkin feature 摘要）

沿用現有 pytest-bdd 風格，每模組一個 feature file：

### `10_org_build.feature` — 註冊與建樹
- 30 人全數建置成功（Scenario Outline 讀 `orgchart.yaml`）；
- 負向：重複 email 被導向登入、重複身分證字號被拒、未滿 18 歲被拒、
  無效/永久失效推薦碼被拒、B8 付款前推薦碼欄即時顯示「Root 真實姓名」。

### `20_referral_rewards.feature` — 推薦與獎勵
- Root 帳本 2,400P、24 筆明細、代數分佈 8/8/8；
- Root 推薦樹恰好 3 代、E1 不出現；B1=900P、C1=700P、G1=0P 交叉核對；
- Root 改真實姓名後，下線註冊頁與組織圖顯示新名（姓名同步規則）。

### `30_tasks.feature` — 任務
- B8 付款當下 Root 推薦王進度 8/8 達標；
- Root claim「免費續約一年」→ 訂閱到期日 +1 年（GUI 與 `/subscriptions/status` 雙重斷言）；
- 當月排行榜（`/tasks/current-month-top`）Root 居首。

### `40_listing.feature` — 刊登
- Root 建立刊登（含照片上傳）→ 登出後訪客在首頁搜得到、詳情頁正確；
- 一帳號第二筆刊登被擋；編輯、下架後首頁即時消失。

### `50_withdrawal.feature` — 提領（雙視角）
- Root：身分驗證＋上傳證件照 → 申請 1,000P → 狀態 pending；
- Admin GUI：提領管理看到該筆 → 處理 → awaiting_collection；
- Root：查收 → completed；餘額全程逐步斷言（2,400 → 1,385）；
- 負向：非 1,000 倍數、餘額不足；另立一筆走 rejected 路徑（點數退回）。

### `60_time_scenarios.feature` — 跨時間情境（§7）

---

## 7. 跨時間情境：service-role 時光機

無法真實等待的規則，以 `tools/seed_time_machine.py`（service role 直連分支 DB）回填，
**再從 GUI 驗證系統反應**——資料是種的，行為斷言是真的：

| 情境 | 回填方式 | GUI 斷言 |
|---|---|---|
| 連續推薦達人（連續 12 月直推） | 為 Root 種 11 個月的歷史直推紀錄，第 12 月由真實註冊觸發 | 任務頁進度 12/12、1,000P 歸戶、開啟新一輪 |
| 連續中斷歸零 | 種 5 個月後跳過 1 個月 | 進度歸零重計 |
| 即將失效（逾期 0–60 天） | 把 C7 訂閱到期日改為 30 天前 | 刊登自首頁隱藏、推薦碼仍可用、**提領被擋**、可補繳 |
| 補繳接續原週期 | C7 走 GUI 補繳（§4 流程） | 新到期日＝原到期日 +1 年（不是付款日 +1 年） |
| 永久失效（逾期 >60 天） | 把 C8 到期日改為 90 天前 | 點數/任務歸零、推薦碼標記失效、其上線組織圖顯示 Inactive 節點但**結構不斷開** |
| 年費月領排程（若 `reward_schedules` 啟用） | 把 pending 排程的應發月份改為過去 | 使用者當日首次登入後撥入，上線永久失效者顯示 Void |

回填一律以 RUN_ID 圈定範圍、寫在獨立 scenario 的 Background，避免污染 §6 的帳本斷言
（§6 先跑、§7 後跑，pytest 以 `--order` 固定順序）。

---

## 8. 測試資料管理

### 8.1 RUN_ID 標記——所有資料可辨識、可追殺

- 每次執行產生 `RUN_ID`（如 `j0720a`）；
- Email 一律 `e2e+{RUN_ID}+{node}@{測試網域}`（如 `e2e+j0720a+b3@uknow-test.example`）；
- 真實姓名一律 `測試{RUN_ID}{node}`（如 `測試j0720aB3`）——UI 斷言好認、cleanup 好圈；
- 上傳的檔名（證件照、刊登照片、簽名）一律帶 `RUN_ID` 前綴。

### 8.2 身分證字號產生器 `tools/twid.py`

`profiles` 對身分證字號有唯一性檢核，且格式含檢查碼。產生器：指定縣市字首＋性別碼＋
序號空間內依 RUN_ID 雜湊取號＋**正確檢查碼**，保證（a）通過前端/後端格式驗證、
（b）同 run 內 30 人不撞號、（c）跨 run 幾乎不撞（就算撞，分支隔離也互不影響）。

### 8.3 產出物

- `run_state.json`：30 人憑證與 ID 對照表（僅存在 CI artifact，保留 7 天）；
- 失敗時自動收 Playwright trace + screenshot + 當下 DB 關鍵表 dump（以 RUN_ID 過濾）。

---

## 9. 清理：兩道保險＋零殘留斷言

**第一道（結構保證）**：teardown 刪除整個 Supabase preview branch。分支不存在＝資料
不存在，**就算測試中途崩潰、cleanup 有 bug，也不可能殘留**。

**第二道（`tools/cleanup.py --run-id <id>`，可獨立重跑）**：供「分支刪除前想先驗證清理
邏輯」與「未來若改跑共用環境」使用。依 FK 依賴序刪除：

```
Storage 物件（id-photos / signatures / listing-photos，依 RUN_ID 前綴）
→ withdrawal_requests → reward_transactions → reward_schedules
→ referral_king_rewards → referral_edges → referral_codes
→ listings → payment_orders → subscriptions → profiles
→ auth.users（Admin API，含 admin 帳號）
```

刪完立即執行**零殘留斷言**：上述每張表以 RUN_ID 樣式查詢，筆數必須為 0，否則測試
以「清理失敗」紅燈收場——清理本身是測項，不是善後。

**Preflight**：開跑前先掃 `e2e+%` 樣式且建立超過 24h 的殘留（防前次崩潰），先清再跑。

---

## 10. 目錄結構

```
e2e/
├── conftest.py                  # 現有（全 mock 層）— 不動
├── features/ steps/ pages/ …    # 現有 — 不動；pages/ 由 journey 共用
└── journey/
    ├── conftest.py              # 分支 setup/teardown、無 mock、正式站封鎖 guard
    ├── orgchart.yaml            # 30 人樹形宣告（單一真相，§2）
    ├── run_state.py             # RUN_ID、憑證存取
    ├── builders/
    │   ├── org_builder.py       # BFS 建樹（呼叫共用 page objects）
    │   ├── payment.py           # sandbox / webhook 兩種模式
    │   └── admin_bootstrap.py
    ├── pages/
    │   └── payuni_sandbox_page.py   # 外部頁面選擇器，獨立封裝
    ├── features/                # §6 的 10_ ~ 60_ feature files
    ├── steps/
    └── tools/
        ├── cleanup.py           # --run-id，獨立可執行
        ├── seed_time_machine.py # §7 回填
        └── twid.py              # 身分證產生器
```

---

## 11. CI 架構：四軌分層，效率最大化

Journey 全套要 40 分鐘上下，**絕不能放進 PR 關鍵路徑**——會擋合併的長 gate 只會讓人
繞過 CI。設計原則：測試的「貴」花在對的觸發時機上；每一軌都有明確的時間預算與擋不擋
合併的定位。

### 11.1 四軌總覽

| 軌道 | 觸發 | 內容 | 目標牆鐘 | 擋合併？ |
|---|---|---|---|---|
| **1. PR gate** | 每次 push | typecheck/unit/knip/build＋api-tests＋mocked e2e | **< 10 分** | ✅ |
| **2. journey-smoke** | PR 動到關鍵路徑時 | 1 人版 walking skeleton（webhook 付款模式） | ~6–8 分 | ✅（僅該類 PR） |
| **3. main 合併後** | push main | 部署（現有 workflow）＋部署後 smoke | ~10 分 | —（紅燈即時通知） |
| **4. journey-full** | nightly 02:00＋手動 | 全 30 人、六模組、時光機、清理 | **~30–35 分** | ❌（紅燈自動開 issue） |

**軌道 2 是槓桿最大的一條**：skeleton（註冊→OTP→付款→獎勵落地→清理，單人）能抓到
八成的整合性壞法，卻只要 smoke 的成本。觸發條件用 paths filter：`supabase/**` 或
`src/` 的金流／推薦／訂閱模組有 diff 才跑；純 UI 或文件 PR 不付這個成本。

### 11.2 現有 `ci.yml`（軌道 1）的三個效率修正

1. **paths filter**：`docs/**`、`**/*.md` 的變更直接跳過 build/api-tests/e2e
   （本設計書自己的 PR 就跑了整套 CI——這就是漏洞本身）；
2. **拆掉序列化**：`e2e-tests` 的 `needs: build` 只是 fail-fast 訊號、不共用產物，
   改為平行後牆鐘從 build→e2e 串行的 ~14 分降到 max(各 job) ≈ 10 分
   （代價：build 紅時 e2e 白跑幾分鐘，可接受）；
3. **workflow 層級 `concurrency` + `cancel-in-progress`**：同一 PR 的新 push 淘汰舊
   run，不排隊燒 runner。

### 11.3 journey-full 內部提效：48 分 → ~30 分

| 手段 | 說明 | 省下 |
|---|---|---|
| **骨架先行** | nightly 開頭先跑 1 人 skeleton（~5 分），失敗即中止整場——不讓環境問題燒 40 分鐘才報錯 | 失敗場次 -35 分 |
| **建樹平行度 3 → 8** | 測試分支放寬 rate limit 後，六代＝6 個波次（8/8/8/3/1/1），每波 ~90 秒 | 建樹 25 分 → **10–12 分** |
| **模組驗證按狀態足跡拆 DAG** | 獎勵帳本／推薦樹斷言唯讀可全平行；刊登只動 `listings`；提領必須在獎勵斷言後（餘額需穩定）；時光機最後（改 C7/C8） | 驗證 8 分 → ~5 分 |
| **付款模式排程化** | 平日 nightly 跑 webhook 模式（快、測我們的程式碼），**週日跑全 sandbox 真刷**（測與 PayUni 的整合）——整合斷裂不是天天發生，一週驗一次夠 | 平日 -10~15 分 |
| **樹快照重用** | 建樹成功後 `pg_dump` 分支存為 artifact；`workflow_dispatch` 帶 `reuse_tree=true` 時還原快照到新分支、跳過建樹，直接跑模組斷言 | debug 迭代 40 分 → **~8 分** |
| **只重跑失敗的** | pytest `--lf` 二次通過制；sandbox 連紅自動降級 webhook 重跑 | 重跑場次大幅縮短 |

調整後的 nightly 時間預算：

| 階段 | 估時 |
|---|---|
| 分支建立＋migrations＋dev server | ~4 分 |
| 1 人 skeleton gate | ~5 分 |
| 建樹 30 人（同代平行 ×8） | ~10–12 分 |
| 模組驗證（DAG 平行） | ~5 分 |
| 跨時間情境 | ~5 分 |
| 清理＋零殘留斷言＋刪分支 | ~3 分 |
| **合計** | **~30–35 分**（週日全 sandbox 模式 +10~15 分） |

### 11.4 Rate limit 節流

`20260720000002_rate_limits.sql` 對 check-email 等端點限流。同代平行度預設 8 的前提
是測試分支放寬限流參數（以 migration 外的 seed 調整，不動產品碼）；未放寬時 builder
自動降回 3，內建 429 指數退避。

### 11.5 編排與衛生條款（`.github/workflows/journey-nightly.yml`）

- 每日 02:00（Asia/Taipei）＋`workflow_dispatch`（inputs：`JOURNEY_PAYMENT_MODE`、
  `reuse_tree`、`feature_filter` 只跑單一模組）；
- journey 的 `concurrency` group 上限 1（分支費用＋PayUni sandbox 共享狀態），
  每個 job 一律設 `timeout-minutes`；
- Secrets：Supabase access token（開分支）、PayUni sandbox 憑證、測試卡號；
- 失敗上傳 trace/screenshot/`run_state.json`/DB dump 為 artifacts，並**自動開啟或更新
  一張 nightly 追蹤 issue**（附 artifacts 連結）；綠燈沉默，不製造通知噪音；
- flaky 情境以 `@quarantine` 標記隔離統計通過率，不讓單一 flake 把整晚判紅。

---

## 12. 風險與對策

| 風險 | 對策 |
|---|---|
| PayUni sandbox 停機/改版/加驗證碼 | 選擇器獨立封裝；webhook 備援模式一鍵切換（§4.2） |
| 測試誤打正式環境 | journey guard 只放行分支網域；正式站 ref 永遠封鎖（§3.2） |
| OTP 郵件在雲端收不到 | 不依賴收信——Admin `generateLink` 取 `email_otp`（§5） |
| 同月註冊跨月界（月底跑到月初） | 推薦王斷言以「B1–B8 落在同一 `month_key`」為前提；23:30 後開跑的 run 自動延後到 00:10 |
| 平行建樹撞 rate limit | 同代平行度 3＋指數退避（§11.2） |
| 清理漏表（未來新增資料表） | 零殘留斷言以「schema 巡檢」動態列出含 user_id FK 的表，新表漏列會直接紅燈 |
| 分支費用 | 一個 run 一個分支、用完即刪；nightly 尖峰同時最多 1 個分支 |

---

## 13. 里程碑

| 里程碑 | 內容 | 產出 |
|---|---|---|
| M1 | 分支 setup/teardown、前端 env 注入（§3.2 小改）、admin bootstrap、單人全 GUI 註冊＋sandbox 付款打通 | 1 人版 walking skeleton 綠燈 |
| M2 | orgchart builder、30 人建樹、`10_`/`20_` feature（推薦＋獎勵） | 樹＋帳本斷言綠燈 |
| M3 | `30_`–`50_`（任務/刊登/提領含 admin 端）、webhook 備援模式 | 六模組全綠 |
| M4 | 時光機＋`60_`、cleanup.py＋零殘留斷言、nightly workflow | 全套 nightly 上線 |
