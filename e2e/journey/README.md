# Uknow Journey 套件（六代 30 人全功能情境）

打**真的拋棄式 Supabase 測試分支**的 Journey 級測試——與上層全 mock 的
`e2e/` 套件互補。完整設計見 `docs/e2e-journey-test-design.md`。

## 與上層套件的邊界

- 本目錄有自己的 `pytest.ini`（rootdir 停在這裡），上層的網路封鎖
  guard／3000 埠 dev server **不會**載入；上層跑 `pytest` 也因
  `norecursedirs = journey` 不會誤收本套件。
- Page Object 重用上層 `e2e/pages/`。
- Vite dev server 用 **3100 埠**（`--strictPort`），兩套可同時開。

## 前置：開一個測試分支

```bash
# 用 Supabase CLI 對正式專案開 preview branch（或建獨立測試專案）
supabase branches create journey-$(date +%m%d) --project-ref <正式 ref>
# 取分支的 ref / anon key / service_role key，並在分支上設定
# Edge Function secrets：PAYUNI_SANDBOX=true 與 PayUni sandbox 憑證
```

⚠️ **絕不可指向正式專案**：conftest 會讀 `src/utils/supabase/info.tsx`
的正式 ref，`JOURNEY_SUPABASE_PROJECT_REF` 等於它時直接 `pytest.exit`；
瀏覽器層另外封鎖正式站 Supabase / PayUni 網域，雙保險。

## 執行

```bash
cd e2e/journey
pip install -r requirements.txt

export JOURNEY_SUPABASE_PROJECT_REF=<分支 ref>
export JOURNEY_SUPABASE_ANON_KEY=<分支 anon key>
export JOURNEY_SUPABASE_SERVICE_ROLE_KEY=<分支 service role key>

pytest -m skeleton          # M1 walking skeleton（單人全流程）
pytest                      # 全套：骨架 → 30 人建樹 → 樹/帳本斷言（依檔名 f00→f10→f20 定序）
pytest -m orgbuild          # 只跑 30 人建樹（A0 未建置時會由 builder 一併補建）
pytest -m rewards           # 只跑樹/帳本斷言（樹未建置時整批 skip 並提示）
pytest tools/               # 離線單元測試（twid、orgchart——不需環境與瀏覽器）
```

**建樹的平行度**：`JOURNEY_BUILD_PARALLELISM`（預設 3）。同一代內的
節點以「執行緒 × 各自的 headless Chromium」平行；每一波開始前 harness
會用 service role 重置分支上的 `check-email` 限流計數（拋棄式分支限定
的基礎設施操作，正式碼與正式環境都不動）。

⚠️ **GoTrue email 發送限流**：GUI signUp 會觸發 OTP 郵件發送，Supabase
內建 SMTP 的預設額度極低（每小時個位數），30 人建樹必撞。分支設定需
擇一：掛 custom SMTP（收不收得到無所謂，OTP 是用 Admin API 取的）或在
Auth 設定把 email rate limit 調到 ≥60/hr。M4 會把這一步併入分支建立
自動化。

未設定 `JOURNEY_*` 時，需要環境的情境整批 skip、離線測試照跑——
所以上層 CI 收錄本目錄也不會誤打真網路。

### 環境變數一覽

| 變數 | 預設 | 說明 |
|---|---|---|
| `JOURNEY_SUPABASE_PROJECT_REF` | —（必填） | 測試分支 ref |
| `JOURNEY_SUPABASE_ANON_KEY` | —（必填） | 分支 anon key |
| `JOURNEY_SUPABASE_SERVICE_ROLE_KEY` | —（必填） | 分支 service role key（OTP 取碼、清理、DB 斷言） |
| `JOURNEY_BASE_URL` | `http://localhost:3100` | 前端位址；埠取自這裡 |
| `JOURNEY_PAYMENT_MODE` | `sandbox` | `sandbox`＝真打 PayUni sandbox；`webhook`＝簽章注入（M3） |
| `JOURNEY_TEST_CARD_NUMBER` | `4147631000000001` | PayUni sandbox 測試卡 |
| `JOURNEY_TEST_CARD_EXPIRY` | `0131` | 測試卡有效期（MMYY） |
| `JOURNEY_TEST_CARD_CVV` | `123` | 測試卡 CVV |
| `JOURNEY_RUN_ID` | 自動（`jMMDDHHMM`） | 所有測試資料的標記；重跑同 ID 可冪等清理 |
| `JOURNEY_EMAIL_DOMAIN` | `uknow-journey.test` | 測試帳號 email 網域 |
| `JOURNEY_SKIP_DEV_SERVER` | — | `1`＝沿用已啟動的前端 |
| `JOURNEY_KEEP_DATA` | — | `1`＝session 結束不清資料（除錯用，記得手動清） |

### OTP 怎麼過

Supabase Admin API `generate_link` 會回傳 `email_otp`，harness 拿到後
**照樣敲進 GUI 的 OTP 輸入框**——使用者操作路徑完全真實，被替代的只有
收信這一步。

## 清理（兩道保險）

1. **第一道**：測完把整個 preview branch 刪掉（CI 於 M4 自動化）——
   分支不存在＝資料不存在。
2. **第二道**：session finalizer 自動執行 `tools/cleanup.py` 的邏輯並做
   **零殘留斷言**（逐表查 run 的 user id，任何殘留即紅燈）。也可手動：

```bash
python tools/cleanup.py --run-id j07211030 [--dry-run]
```

執行期憑證對照存在 `.run/<run_id>.json`（gitignored）。

## 目前進度與範圍界線（M4 止）

已落地：
- **M1**：單人 walking skeleton（`00_skeleton.feature`）。
- **M2**：30 人六代建樹（`10_org_build.feature`，逐代 BFS、同代平行、
  同 RUN_ID 失敗續建的冪等設計）＋樹/帳本斷言（`20_referral_rewards.feature`：
  root 代數分佈 8/8/8、第 4 代零貢獻、獎勵頁與推薦樹 GUI、B1/B2/C1/F1/G1
  交叉帳本——金額一律以 reward_config 現值計算，調參不改測試）。
- **M3**：
  - `15_registration_negative`：未滿 18、無效推薦碼（臨時帳號 X1）；
  - `30_tasks`：推薦王達標（B8 付款當下）→ GUI 領取「免費續約 1 年」→
    到期日延長約一年＋獎勵標記 claimed；
  - `40_listing`：建立（真照片上傳）→ 訪客首頁搜尋/詳情 → 一帳號一
    刊登 → 下架後首頁消失；
  - `50_withdrawal`：B1 資格不足、金額三重負向（下限/倍數/上限）、
    完整生命週期（申請→admin 已匯款→查收→completed）與退件退款——
    餘額斷言一律打 GET /rewards（與前端同一 SSOT）；
  - `webhook` 付款備援模式：`tools/payuni_crypto.py` 以分支的
    `PAYUNI_TEST_*` 金鑰簽出合法 notify 打真後端（設
    `JOURNEY_PAYMENT_MODE=webhook` + `JOURNEY_PAYUNI_HASH_KEY/_IV`）。

- **M4**：
  - `60_time_scenarios`：時光機（`tools/seed_time_machine.py`，service
    role 回填 subscriptions 的 end_date）——會籍兩態（見 0721 移除寬限
    期）：刊登可見性隨 active→expired 變化（到期即隱藏）、過期會員推薦碼
    仍可推廣、**補繳接續原到期日而非付款日**（雙向斷言：距錨點約一年＋
    距付款日明顯少於一年）；
  - 提領前置補齊：`builders/referral_program.py`——GUI 簽名加入推薦
    計畫（`request_withdrawal` 的第一道檢核），f50 各情境冪等引用；
  - CI 四軌落地：`ci.yml` 加 paths-ignore／workflow 級 concurrency／
    拆掉 e2e 對 build 的 needs／新增 `journey-offline` job（純函數＋
    收集健全性）；`journey-nightly.yml` 一鍵開分支→設 secrets→跑套件
    →傳 artifacts→**always() 刪分支**（schedule 依 repo 慣例先註解，
    workflow_dispatch 首跑校準通過後打開）。

**已知產品落差（測試設計過程發現，均已寫入對應 feature 檔頭）**：
1. 規格 §5.1 獎勵 120P/代 vs 實作 `reward_config` 預設 100P/代
   （測試以現值計算，不受影響）；
2. 規格 §1.1 身分證字號唯一性檢核——`profiles.national_id` 無唯一
   約束、`/auth/register` 未檢查；
3. 規格 §7.1 連續推薦達人（連續 12 個月）——後端未實作，`/tasks`
   只有推薦王；
4. 規格 §2 永久失效「舊碼作廢」——沒有機制把 `referral_codes.status`
   改掉，失效會員的碼仍驗證成功；
5. 規格 §2 即將失效「刊登隱藏」——實作 `has_active_subscription` 在
   寬限期內回 true，刊登照常公開（60_ 以現況斷言並標記）。

尚未落地（首跑校準對象）：
- `builders/payuni_sandbox_page.py`（sandbox 刷卡頁）、任務 claim 對話
  框按鈕序、加入推薦計畫對話框送出鈕、`journey-nightly.yml` 的分支
  CLI 欄位名——皆為候選清單/註記設計，首次帶憑證執行時校準。
- 當月排行榜、刊登編輯流程、`reuse_tree` 快照重用。
