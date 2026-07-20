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
pytest tools/test_twid.py   # 離線單元測試（不需要環境與瀏覽器）
```

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

## M1 已知範圍界線

- `builders/payuni_sandbox_page.py` 的選擇器是**未經真 sandbox 校準**的
  第一版（候選清單設計，改版只修這一檔）；首次帶憑證執行時校準。
- `webhook` 付款備援模式（簽章注入）屬 M3，目前會拋 NotImplementedError。
- 分支的建立/刪除仍是手動（上方 CLI 指令）；M4 併入 nightly workflow。
- 30 人建樹（`orgchart.yaml` 已就緒）與六大模組 feature 屬 M2/M3。
