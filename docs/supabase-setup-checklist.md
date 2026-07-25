# Uknow — Supabase Dashboard 手動設定清單

> 本清單涵蓋**程式碼與 migration 之外、必須在 Supabase 後台手動完成**的設定。
> 完成後 `api` Edge Function（PayUni 付款、Email OTP）才能正常運作。

## 適用範圍：每個環境各做一次

本專案有**兩個 Supabase 環境，各自獨立的資料庫、金鑰與 Secrets**，
兩邊都要各自跑完這份清單（Secrets 不會跨環境共用）：

| 環境 | Supabase 形態 | ref 的真相在 | 用途 |
|---|---|---|---|
| develop | 正式專案底下的 **persistent branch**（名稱 `develop`） | `config/supabaseTarget.ts` | 可安全驗證的真後端 |
| main（正式站） | **正式專案**本身 | `src/utils/supabase/info.tsx` | 正式站，部署需人工核准 |

> **develop 是「分支」不是「另一個專案」。** 它由 Supabase 的 GitHub 整合
> （Branching）從正式專案長出來，有自己的 DB／API 金鑰／Edge Function／
> Secrets，但**掛在正式專案底下**——同一個組織、同一份帳單，在儀表板上要從
> 正式專案切分支才看得到。實務上有兩個後果：
> 1. **Secrets 是逐分支獨立的，不會從母專案繼承**
>    （[Supabase 文件](https://supabase.com/docs/guides/deployment/branching/configuration)：
>    "Secrets set for one branch are not automatically available in other
>    branches"）。所以新分支一開始**一把都沒有**，這份清單的步驟 1 要在
>    develop 上**完整再做一次**——漏做的症狀是付款直接失敗
>    （`PayUni 環境變數未設定`），不是靜默打到正式站。
> 2. 對分支按 Supabase 的 **merge**，等於把它的 migration 推進正式專案。
>    本專案的晉升走 GitHub PR（develop→main），不從 Supabase 儀表板 merge。
>
> ⚠️ 真正會打到真金流的組合是**人為設錯**：develop 上把 `PAYUNI_SANDBOX`
> 設成 `false`（或刪掉），同時又存在 `PAYUNI_*` 正式憑證。這不是預設狀態，
> 但一旦發生沒有任何自動閘門會擋——develop 上這三個變數只該是 `PAYUNI_TEST_*`。

Journey 測試用的**拋棄式 preview branch** 另有自己的設定，
見 `e2e/journey/README.md`。

以下用 `<PROJECT_REF>` 代表目標環境的 ref，操作前先確認自己在哪個環境：

```
Dashboard : https://supabase.com/dashboard/project/<PROJECT_REF>
API base  : https://<PROJECT_REF>.supabase.co/functions/v1/api
```

> ⚠️ 正式站與 develop 的 PayUni 憑證**不共用，也不同變數名**：develop 用
> sandbox（`PAYUNI_SANDBOX=true` + `PAYUNI_TEST_*` 三把），正式站用正式憑證
> （`PAYUNI_SANDBOX=false` + `PAYUNI_*` 三把）。細節見下一節的表。

---

## ☑️ 步驟 1：設定 Edge Function 環境變數（Secrets）

**導覽**：Dashboard → **Project Settings**（齒輪）→ **Edge Functions** → **Secrets**
（ `https://supabase.com/dashboard/project/<PROJECT_REF>/settings/functions` ）

> Secrets 是**整個 project 共用**的，所有 Edge Function（含 `api`）都會讀到，
> 不需逐一函數設定。

**兩個環境要設的變數名不一樣**，因為 `resolvePayuniConfig()`（`api/index.ts`）
先由 `PAYUNI_SANDBOX` 決定 mode，再**只認該 mode 那一套前綴**的三把憑證：

| 環境 | `PAYUNI_SANDBOX` | 要設的三把憑證 | `FRONTEND_URL` |
|---|---|---|---|
| develop | `true` | `PAYUNI_TEST_MER_ID`／`PAYUNI_TEST_HASH_KEY`／`PAYUNI_TEST_HASH_IV` | `https://develop.uknow.pages.dev` |
| 正式站 | `false` | `PAYUNI_MER_ID`／`PAYUNI_HASH_KEY`／`PAYUNI_HASH_IV` | `https://uknow.com.tw` |

| 變數名稱 | 值 | 說明 |
|----------|-----|------|
| `PAYUNI_(TEST_)MER_ID` | （PayUni 商店代號） | PayUni 後台取得 |
| `PAYUNI_(TEST_)HASH_KEY` | （32 字元） | PayUni 後台「Hash Key」 |
| `PAYUNI_(TEST_)HASH_IV` | （16 字元） | PayUni 後台「Hash IV」 |
| `PAYUNI_SANDBOX` | `true` / `false` | develop 填 `true`；正式站填 `false` |
| `FRONTEND_URL` | 見上表 | **結尾不要加 `/`**；用於 CORS 白名單與付款完成導回頁 |

> ⚠️ **`FRONTEND_URL` 同時決定「要不要放行 Cloudflare Pages 預覽網域」**
> （`resolveCorsOrigin()`）：這個值本身是 `*.uknow.pages.dev` 時，視為預覽
> 環境，放行其他 `*.uknow.pages.dev`；是正式網域時，**只認自己**。
> 所以正式站的 `FRONTEND_URL` 必須**正好**是使用者實際造訪的網域
> （`https://uknow.com.tw`）——填錯不只是導回頁壞掉，整個前端會被 CORS 擋成
> `Failed to fetch`。改這個值前先確認線上實際用哪個網域。

> ⚠️ **三把憑證必須成套、同源，缺一角就整組失敗**（刻意的）。舊版程式對每個
> 欄位各自 `PAYUNI_TEST_X || PAYUNI_X` 逐欄回退，只要測試站憑證缺一角，正式站
> 的金鑰就會被混進 sandbox 端點，PayUni 回傳帶「(模擬)」浮水印的授權失敗。
> 現在改成缺任何一把就在建單當下明確拋錯，訊息會直接寫出缺哪個變數。
>
> 也就是說：**develop 只設 `PAYUNI_SANDBOX=true` 而沒設 `PAYUNI_TEST_*`，
> 付款會直接壞掉**（錯誤訊息：`PayUni 環境變數未設定（mode=sandbox）`）。
> 這是漏設時的預設症狀——會擋下來，不會靜默走錯環境。

> ⚠️ `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY` 由 Supabase **自動注入**，
> **不需要**手動新增。

### ⚠️ 存檔後需重新部署

Secrets 變更後，正在執行的函數實例不會立即生效。
請重新部署 `api`（Dashboard → **Edge Functions** → `api` → **Deploy**），
或推一個 commit 讓 `deploy-supabase.yml` 在 CI 綠後自動部署。

---

## ☑️ 步驟 2：設定 Email OTP 模板

註冊／登入使用 **6 位數驗證碼（OTP）**，而非點擊連結。
模板需改成顯示 `{{ .Token }}`。

**導覽**：Dashboard → **Authentication** → **Emails**（或 **Email Templates**）
（ `https://supabase.com/dashboard/project/<PROJECT_REF>/auth/templates` ）

| 模板 | 用途 | 必改內容 |
|------|------|----------|
| **Magic Link** | OTP 登入寄送 | 內文加入 `{{ .Token }}`，移除（或保留為輔助）`{{ .ConfirmationURL }}` |
| **Confirm signup** | 新用戶驗證 | 同上，改用 `{{ .Token }}` 顯示驗證碼 |
| **Reset Password** | 重設密碼 | 程式碼已走 OTP，確認模板使用 `{{ .Token }}` |

### 範例內文片段

```html
<h2>您的 Uknow 驗證碼</h2>
<p>請在 App 中輸入以下 6 位數驗證碼：</p>
<p style="font-size:28px; font-weight:bold; letter-spacing:6px;">{{ .Token }}</p>
<p>驗證碼 1 小時內有效。若非您本人操作請忽略此信。</p>
```

> 💡 確認 **Authentication → Providers → Email** 已啟用、且 **Confirm email**
> 設定符合預期（OTP 流程需要 Email 為啟用狀態）。

> ⚠️ **寄信配額**：Supabase 內建 SMTP 的預設額度極低（每小時個位數）。
> 需要大量註冊的環境（如 journey 分支）請掛 custom SMTP 或調高 Auth
> 的 email rate limit。

---

## ☑️ 步驟 3：確認 PayUni 後台設定

| 項目 | 應為 | 說明 |
|------|------|------|
| **NotifyURL（背景通知）** | `https://<PROJECT_REF>.supabase.co/functions/v1/api/webhooks/payuni/notify` | 付款成功的伺服器回調；程式已在加密參數帶入，後台若需白名單請填此網址 |
| **ReturnURL（前景導回）** | `{FRONTEND_URL}/payment/result?tradeNo=...` | 程式自動帶入；PayUni 後台若限制網域請加入你的前端網域 |
| 金額 | `1200` | 年費固定金額（後端會驗，不符即拒） |

---

## ☑️ 步驟 4：確認 `api` 函數的 JWT 設定

`api` 函數必須設為 **`verify_jwt = false`**。原因：

- PayUni 的付款回調（`/api/webhooks/payuni/notify`）**不會**帶 Supabase JWT，
  gateway 開啟 JWT 驗證會直接擋掉 → **付款永遠無法完成**。
- 函數內部已用 `requireAuth()` 對每個受保護路由自行驗證使用者 JWT，
  公開端點（`/health`、webhook）則刻意不驗。

> 重新部署後請確保 `verify_jwt` 維持 `false`
> （Dashboard → Edge Functions → `api` → Details，或 CLI/MCP 部署參數）。

---

## ☑️ 步驟 5：驗證設定是否成功

### 5-1 健康檢查（不需登入、不需金鑰）

```bash
curl https://<PROJECT_REF>.supabase.co/functions/v1/api/health
# 預期：{"ok":true,"sha":"<部署的 commit sha>", ...}
```

`sha` 應等於該分支最新的 commit——不相等代表部署沒跟上。

### 5-2 PayUni 變數是否載入

建立一次測試付款（sandbox）。若回傳 `PayUni 環境變數未設定`，
代表步驟 1 尚未生效，請重新部署 `api`。

### 5-3 Email OTP

用新 Email 走一次註冊流程，確認收到的信顯示 **6 位數驗證碼**（而非連結）。

---

## 快速檢查表（每個環境各一份）

- [ ] 步驟 1：5 個 Edge Function Secrets 已新增並 Save
- [ ] 步驟 1：**develop 用的是 `PAYUNI_TEST_*` 三把 + `PAYUNI_SANDBOX=true`**
      （develop 上不該出現 `PAYUNI_SANDBOX=false` 與 `PAYUNI_*` 正式憑證併存——
      那是唯一會讓測試付款打進真金流的組合）
- [ ] 步驟 1：**develop 的 `FRONTEND_URL` 是 `https://develop.uknow.pages.dev`**
      ——不是正式站網域，也不是 `http://localhost:3100`
      （`seed-develop-data.yml` 建樹期間會暫時改成 localhost，收尾步驟
      `if: always()` 負責設回。該 workflow 若被硬中止、收尾沒跑成，develop
      就會停在 localhost：付款導回會落到不存在的位址）
- [ ] 步驟 1：`api` 已重新部署，變數生效
- [ ] 步驟 2：Magic Link / Confirm signup / Reset Password 模板已含 `{{ .Token }}`
- [ ] 步驟 3：PayUni 後台 NotifyURL / ReturnURL 已確認，且環境與 `PAYUNI_SANDBOX` 一致
- [ ] 步驟 4：`api` 的 `verify_jwt = false`
- [ ] 步驟 5：health 的 `sha` 相符、sandbox 付款成功、收到 OTP 驗證碼信

### 兩個環境都設完後，再驗一次「沒有交叉」

分開設完不等於真的分開了——最容易漏的是**前端連到了另一組後端**。
在瀏覽器打開各自站台、開 DevTools → Network，看 API 請求打到哪個網域：

| 站台 | API 請求應該打到 | 打錯代表 |
|---|---|---|
| `https://develop.uknow.pages.dev` | `ijcxnxhrziehdtkwausy.supabase.co` | 預覽站在讀寫正式站資料 |
| `https://uknow.com.tw` | `uhtwwxtazwqnlbejhprl.supabase.co` | 正式站在讀 develop 的資料 |

打錯時的症狀現在是**明確失敗**而不是靜默成功：正式站的 Edge Function 只放行
自己的 `FRONTEND_URL`，預覽網域打過去會被 CORS 擋下（`Failed to fetch`）。
這是刻意的——環境沒分乾淨時，會動作的錯誤比會報錯的錯誤難查得多。

前端該打哪一組由 `config/supabaseTarget.ts` 依分支決定（只有 `main` 打正式站），
不由 Cloudflare 儀表板的環境變數決定——所以這張表對不上時，先看該檔與
`vite.config.ts`，不要去儀表板加變數蓋過它。

---

## 附錄：舊資源清理

重構前的舊系統遺留物。**程式碼側已清理完成**（舊 server 目錄
`src/supabase/functions/server/` 已不存在）。以下為**資料庫側**待辦，
屬破壞性操作，執行前請先備份並確認影響範圍：

- [ ] 清空 `auth.users` 的舊帳號
- [ ] 清空舊 KV 表 `kv_store_5c6718b9`
- [ ] 刪除舊 Edge Function `make-server-5c6718b9`

> 建議先做 dry-run 統計再執行。這幾項與新流程無耦合，不做也不影響運作，
> 只是佔用配額。
