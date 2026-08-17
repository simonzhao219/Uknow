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
| `MEMBER_TOKEN_SECRET` | 自行產生的隨機字串 | 會員驗證碼的簽章密鑰，見下方說明 |

> **`MEMBER_TOKEN_SECRET`**（會員驗證 QR，規格書 §13.1）不是跟誰申請的憑證，
> 是**你自己產生**的隨機字串——後端用它對驗證碼做 HMAC 簽章與驗章，等同「防偽
> 印章」。產生方式：`openssl rand -base64 32`，把輸出貼進來即可。
>
> **develop 與正式站各設一把、且值要不同**：這樣 develop 的密鑰外流也偽造不了
> 正式站的碼。缺這把時驗證端點一律回 500（fail-closed）——刻意不以空字串當
> 密鑰硬跑，否則任何人都能自算出「合法」的碼，等於完全沒有防偽。
> 密鑰可隨時更換；換掉當下未被掃描的碼會失效，但驗證碼壽命只有 90 秒，
> 實務影響幾乎為零，這也是外流時最簡單的補救。

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

### 完整對照：Edge Function 到底讀哪些變數

以下是**唯一權威清單**，來源是 `api/index.ts` 裡實際的 `Deno.env.get()`
與 `read()` 呼叫。2026-07-26 盤點時，正式站的 Secrets 有一半是舊系統遺留、
從未被任何程式讀過——沒有這張表就分不出「不敢刪」與「不必留」。

| 變數 | 誰負責設 | 說明 |
|---|---|---|
| `SUPABASE_URL` | Supabase 自動注入 | 別手動新增 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 自動注入 | 同上 |
| `SUPABASE_DB_URL` | Supabase 自動注入 | 同上 |
| `DEPLOY_SHA` | `deploy-supabase.yml` 自動寫入 | 供 `/health` 回報線上版本 |
| `FRONTEND_URL` | **你** | 導回頁 + CORS 白名單（見上方警告） |
| `PAYUNI_SANDBOX` | **你** | 決定用哪一套憑證與端點 |
| `PAYUNI_(TEST_)MER_ID` / `_HASH_KEY` / `_HASH_IV` | **你** | 依 mode 擇一套，成套或整組失敗 |
| `MEMBER_TOKEN_SECRET` | **你** | 會員驗證碼（§13.1）的簽章密鑰；缺了驗證端點一律 500 |
| `RECONCILE_SECRET` | **你（僅正式站）** | 對帳排程的門票；排程只打正式站 |
| `RECONCILE_THRESHOLD_MINUTES` | 選用 | 未設時預設 20 |
| `DEV_CORS` | 選用 | 開發旗標，放行 localhost |

**不在這張表上的變數，程式一律讀不到。** 盤點時發現的遺留物包括
`DATABASE_URL`（程式讀的是自動注入的 `SUPABASE_DB_URL`）、`PAYUNI_API_URL`
（端點在 `resolvePayuniConfig()` 內依 mode 寫死）、`VITE_PAYUNI_PAYMENT_URL`
（`VITE_` 是前端建置期前綴，放在這裡不會被任何人讀到）、
`PASSWORD_ENCRYPTION_KEY`、`RESEND_API_KEY`（零引用，git 歷史裡也從未出現）。

> 💡 **寄信憑證不在這裡。** 掛 custom SMTP 時帳密是填進 **Authentication →
> Emails → SMTP Settings**（步驟 2-1），不是 Edge Function Secrets——
> Auth 服務不讀這裡的變數。上面那個零引用的 `RESEND_API_KEY` 就是誤填在
> 此處的遺留物，設了也不會有任何效果。

### ⚠️ 存檔後需重新部署

Secrets 變更後，正在執行的函數實例不會立即生效。
請重新部署 `api`（Dashboard → **Edge Functions** → `api` → **Deploy**），
或推一個 commit 讓 `deploy-supabase.yml` 在 CI 綠後自動部署。

---

## ☑️ 步驟 2：設定寄信（寄件信箱 ＋ OTP 模板）

信**不是** `api` Edge Function 寄的——是 Supabase Auth（GoTrue）寄的。
所以「改寄件者」改的是本步驟的 Dashboard 設定，**不是程式碼**；
步驟 1 的 Secrets 也與寄信無關（Auth 服務不讀 Edge Function 的變數）。

### 2-1 寄件信箱：掛 Custom SMTP

**沒掛 custom SMTP＝真實用戶收不到驗證碼。** 內建寄信服務有兩個限制，
第一個是硬阻斷、不是配額問題：

1. **只寄得到專案 organization 的團隊成員信箱**，其他一律失敗並回
   `Email address not authorized`（[官方文件](https://supabase.com/docs/guides/auth/auth-smtp)）。
   也就是說沒掛之前，只有你自己收得到信，外部註冊者一個都收不到。
2. 每小時個位數配額、且**明示無 SLA**，官方定位是「試玩與團隊內部測試用」。

本專案寄件身分用官方帳號 `admin@uknow.com.tw`（Google Workspace），
走 Google 自己的 SMTP。

**先決條件（Google 側，做一次即可，非逐環境）**

| 順序 | 在哪 | 做什麼 |
|---|---|---|
| 1 | Admin console → **安全性 → 驗證 → 兩步驟驗證** | 確認「**允許使用者產生應用程式密碼**」為開啟 |
| 2 | `admin@uknow.com.tw` 本人 → `myaccount.google.com` | 該帳號**開啟兩步驟驗證**（沒開就產不出應用程式密碼） |
| 3 | `myaccount.google.com/apppasswords` | 產生應用程式密碼，名稱填 `Supabase SMTP`，得到 **16 碼** |

> ⚠️ 2025 年起 Google 已不接受用帳號登入密碼對 `smtp.gmail.com` 驗證，
> 「低安全性應用程式存取」選項也已移除。**只有應用程式密碼或 OAuth 2.0 可行**，
> 填錯的症狀是 Supabase 測試寄信回 `535 Username and Password not accepted`。

**Supabase 側（⚠️ 兩個環境各做一次，分支不繼承母專案的 SMTP 設定）**

**導覽**：Dashboard → **Authentication** → **Emails** → **SMTP Settings**
（ `https://supabase.com/dashboard/project/<PROJECT_REF>/auth/smtp` ）

| 欄位 | 值 |
|---|---|
| Enable Custom SMTP | 開 |
| Sender email | `admin@uknow.com.tw` |
| Sender name | `Uknow` |
| Host | `smtp.gmail.com` |
| Port | `587`（STARTTLS；用 `465` 則是 SSL，兩者皆可） |
| Username | `admin@uknow.com.tw`（**完整位址**，不是 `admin`） |
| Password | 上面產生的 **16 碼應用程式密碼**（不是 Google 登入密碼） |

> ⚠️ **存檔後一定要接著調限流**，否則會從「幾乎不能寄」換成「每小時只能寄 30 封」：
> Supabase 對新掛上的 custom SMTP 一律先壓到 **30 封／小時**保護寄件信譽。
> 到 **Authentication → Rate Limits**
> （ `https://supabase.com/dashboard/project/<PROJECT_REF>/auth/rate-limits` ）
> 把 *Rate limit for sending emails* 調到符合實際註冊量。漏調的症狀是註冊
> 尖峰時段部分用戶收不到信，且**只在 Auth logs 看得到**，前端只會顯示逾時。

**DNS（Cloudflare，做一次即可，非逐環境）**

**Dashboard 設對了不代表信到得了。** SMTP 那頁只決定「用誰的伺服器寄」，
收信方要不要採信是 DNS 說的。這四筆缺任何一筆，Supabase 側全綠、
Auth logs 也乾淨，信照樣進垃圾桶。

| 記錄 | 值 | 怎麼確認 |
|---|---|---|
| SPF（`uknow.com.tw` TXT） | `v=spf1 include:_spf.google.com ~all` | **全網域只能有一筆 SPF**；已有第三方就併進同一筆加 `include`，不要新增第二筆（兩筆＝SPF 直接失效） |
| DKIM（`google._domainkey` TXT） | Admin console → **應用程式 → Google Workspace → Gmail → 驗證電子郵件**，金鑰長度 2048，產生後貼上 | 產完要回 Admin console 按**開始驗證**，只加 DNS 不算完成 |
| DMARC（`_dmarc` TXT） | `v=DMARC1; p=quarantine; rua=mailto:admin@uknow.com.tw` | policy 比 `p=none` 嚴時，SPF/DKIM 不是建議而是**前提**；`rua` 要指向自己收得到的信箱 |
| MX（`uknow.com.tw`） | `smtp.google.com`，priority `1` | 與寄信無關，但**沒有 MX 就收不到退信通知**——見下方 |

四筆都要 **DNS only**（Cloudflare 的雲要灰色）。MX 與 TXT 本來就不能走 proxy。

> ⚠️ **沒有 MX 的真正代價是失去回饋管道，不是收不到信。** 寄信透過
> `smtp.gmail.com` 不查 MX，所以缺 MX 不會讓任何一封信寄不出去。但退信
> 通知（bounce）是寄回寄件者信箱的——沒有 MX，這些通知全部蒸發。於是
> 「使用者收不到驗證碼」不會產生任何可觀測訊號：前端只是停在等待輸入、
> Auth logs 顯示寄送成功、寄件信箱收不到退信。**「沒有人反映問題」在這個
> 狀態下不是證據**，因為唯一會反映問題的那條線被斷掉了。

> ⚠️ 2026-08-17 盤點：這四筆當時**一筆都不存在**（僅有 `_dmarc` 與一筆
> `google-site-verification`），而正式站的 custom SMTP 早已啟用、寄件者
> 已是 `admin@uknow.com.tw`。也就是說 DMARC 一直在 fail，而上面說的
> 三重靜默讓它完全不可見。**改寄件者之前先把 DNS 補齊**，順序顛倒的症狀
> 是「改完之後所有人收不到驗證碼」，且會被誤判成 Supabase 設錯。

> ⚠️ 若該網域同時開了 **Cloudflare Email Routing**，它會自行接管 MX 並插入
> 自己的 SPF——與 Google Workspace 併用時先確認 MX 仍指向 Google，
> 且 SPF 沒有被改寫成只認 Cloudflare。

**驗證方式**（Supabase 那頁按 Save 不算驗證）：

1. `nslookup -type=MX uknow.com.tw`、`-type=TXT uknow.com.tw`、
   `-type=TXT google._domainkey.uknow.com.tw`、`-type=TXT _dmarc.uknow.com.tw`
   四個都要有值
2. [Google Admin Toolbox CheckMX](https://toolbox.googleapps.com/apps/checkmx/)
   無紅字（Google 用自己的標準檢查自己的服務）
3. 從 `admin@uknow.com.tw` 寄一封到 [mail-tester.com](https://www.mail-tester.com/)，
   **SPF / DKIM / DMARC 三個都要 pass**
4. 最後看一封**真實的**驗證碼信的 `Authentication-Results` 標頭
   （收信方用 **Outlook 或 Yahoo**，不要用 Gmail——Google 寄給 Google
   走內部路由會放寬，可能照樣進收件匣，把問題遮掉）

**寄送額度**：`smtp.gmail.com` 在 Google Workspace 是**每日 2,000 封**。
撞到上限時改走 SMTP relay：Admin console → **應用程式 → Google Workspace →
Gmail → 路由 → SMTP 中繼服務**，開啟並選「需要 SMTP 驗證」，
Supabase 的 Host 改成 `smtp-relay.gmail.com`（同樣 587／應用程式密碼），
額度提升到每日 10,000 封。Supabase 出口 IP 非固定，**不要**用 IP 允許清單。

### 2-2 Email OTP 模板

註冊／登入使用 **6 位數驗證碼（OTP）**，而非點擊連結。
模板需改成顯示 `{{ .Token }}`。

**導覽**：Dashboard → **Authentication** → **Emails**（或 **Email Templates**）
（ `https://supabase.com/dashboard/project/<PROJECT_REF>/auth/templates` ）

現成模板已在 repo 內，直接複製貼上即可，不要在 Dashboard 手寫：
`supabase/email-templates/confirm-signup.html`、`reset-password.html`。
改動請改 repo 這兩份再貼上去，Dashboard 那份沒有版本控制。

| 模板 | 用途 | 必改內容 |
|------|------|----------|
| **Magic Link** | OTP 登入寄送 | 內文加入 `{{ .Token }}`，移除（或保留為輔助）`{{ .ConfirmationURL }}` |
| **Confirm signup** | 新用戶驗證 | 同上，改用 `{{ .Token }}` 顯示驗證碼 |
| **Reset Password** | 重設密碼 | 程式碼已走 OTP，確認模板使用 `{{ .Token }}` |

唯一不可缺的變數是 `{{ .Token }}`（6 位數驗證碼本體）。模板漏了它，
信會照常寄出但內容沒有驗證碼，前端只會停在「等待輸入」——查起來很費工。

> 💡 確認 **Authentication → Providers → Email** 已啟用、且 **Confirm email**
> 設定符合預期（OTP 流程需要 Email 為啟用狀態）。

> 💡 journey 的拋棄式分支**刻意不走這條**：它用 pg-functions send-email hook
> 把寄信導進 no-op sink，繞開內建 mailer 的保留網域檢查與限流
> （見 `.github/workflows/journey.yml`）。OTP 由 Admin `generate_link` 取得，
> 信件內容無所謂，所以拋棄式分支不需要設 SMTP。

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
```

| 欄位 | develop 應為 | 正式站應為 |
|---|---|---|
| `sha` | 該分支最新 commit | 同左（不相等代表部署沒跟上） |
| `payuniMode` | `sandbox` | `production`（**正式站開放後**；開放前是 `sandbox`） |
| `payuniConfigured` | `true` | `true` |
| `memberTokenConfigured` | `true` | `true` |

`memberTokenConfigured` 是同一個道理的延伸：`MEMBER_TOKEN_SECRET` 設了沒也
**沒有外顯訊號**——Secrets 頁只看得到 digest，而缺了要等到有人真的掃一次驗證碼、
吃到 500 才會發現。它同樣只回布林值、不回傳金鑰內容。**Secrets 逐分支獨立、
不從母專案繼承**，所以 develop 與正式站要各自 curl 確認一次，別假設設了一邊
另一邊就有。

`payuniMode` 存在的理由：這個設定**沒有任何外顯訊號**。憑證與端點一致時
PayUni 不會回「(模擬)」浮水印、程式不報錯、儀表板只看得到 secrets 的
SHA256 digest。2026-07-26 發現正式站當時跑在 sandbox——帳面 20 筆完成訂單、
NT$24,000，實際入帳 0 元——是靠人工反推 digest 才看出來的，那不是可重複的
流程。現在一個 curl 就能回答。

`payuniConfigured` 是布林值、不回傳任何憑證內容；`false` 代表當下 mode
需要的三把憑證沒齊，付款會在建單當下失敗。

> **正式站開放時**：把 `PAYUNI_SANDBOX` 設為 `false`，並把
> `deploy-supabase.yml` 裡的 `EXPECT_PRODUCTION_PAYUNI` 改成 `true`。
> 之後任何 main 部署若偵測到 `payuniMode != production` 會直接紅燈，
> 不再只是警告。

### 5-2 PayUni 變數是否載入

先看上面的 `payuniConfigured`。若為 `true` 但付款仍失敗，再建立一次測試付款
（sandbox）看實際錯誤；回傳 `PayUni 環境變數未設定` 代表步驟 1 尚未生效，
請重新部署 `api`。

### 5-3 Email OTP

用新 Email 走一次註冊流程，確認收到的信顯示 **6 位數驗證碼**（而非連結）。

---

## ☑️ 步驟 6：建立預設推薦人帳號與推薦碼（啟用自動綁定機制時才需要）

規格書 §7.4：未填推薦碼的**首購**會員自動綁定平台指定的預設推薦人。
機制預設**停用**（`reward_config.default_referrer_code` 為 `null`），
要啟用需在**每個環境**各做一次以下三步（帳號 uuid 逐環境不同，
所以是營運動作、不是 migration）：

1. **建立專用平台帳號**：走正常註冊 + 付款流程（不要用個人帳號——它會
   出現在所有自然流量會員的上線位置並累積大量點數，帳務分開較乾淨）。
   付款成功會自動產生一個隨機推薦碼。
2. **把推薦碼改成指定值**（SQL Editor，service role）：

   ```sql
   update public.referral_codes
   set code = 'asa899869'          -- 平台指定的碼
   where user_id = '<該帳號 uuid>' and status = 'active';
   ```

   ⚠️ 僅在該帳號**尚無下線**時執行才乾淨——`profiles.referred_by_code`
   存字串快照，已用舊碼註冊者的稽核欄位會指向不存在的碼。
3. **啟用機制**：

   ```sql
   update public.reward_config set default_referrer_code = 'asa899869';
   ```

**順序不可顛倒**（先有碼再啟用）。先啟用而碼不存在不會出錯——機制安全地
靜默不生效並寫 `system_alerts`（`default_referrer_code_invalid`）；
推薦人被停權則寫 `default_referrer_suspended`。漏做一個環境不會無聲失敗，
告警可在後台系統告警看到。

**停用/回滾**：`update public.reward_config set default_referrer_code = null;`
——即時生效、不必部署。已產生的推薦邊與獎勵不會自動撤銷（與換線語意一致）。

**提領注意**：發獎不檢查上線會籍（§8.2），此帳號不需有效會籍即可累積點數；
但**提領**需通過 §10.1 完整檢核（加入推薦計畫、未停權、**會籍在效期內**、
KYC 身分證照片、金額門檻、當日一次）——要能領出點數，帳號需持續續約並完成
KYC。稽核查詢（誰被自動綁定）：`select id from profiles where referred_by_is_default`，
走 SQL、不建 admin UI。

## 快速檢查表（每個環境各一份）

- [ ] 步驟 1：6 個 Edge Function Secrets 已新增並 Save
- [ ] 步驟 1：**`MEMBER_TOKEN_SECRET` 已設**（develop 與正式站各一把、值不同）
- [ ] 步驟 1：**develop 用的是 `PAYUNI_TEST_*` 三把 + `PAYUNI_SANDBOX=true`**
      （develop 上不該出現 `PAYUNI_SANDBOX=false` 與 `PAYUNI_*` 正式憑證併存——
      那是唯一會讓測試付款打進真金流的組合）
- [ ] 步驟 1：**develop 的 `FRONTEND_URL` 是 `https://develop.uknow.pages.dev`**
      ——不是正式站網域，也不是 `http://localhost:3100`
      （落到 localhost 的話，付款導回會導去一個不存在的位址）
- [ ] 步驟 1：`api` 已重新部署，變數生效
- [ ] 步驟 2-1：Custom SMTP 已啟用，寄件者為 `admin@uknow.com.tw`
- [ ] 步驟 2-1：**Auth 的寄信限流已從預設 30 封／小時調高**（掛上 SMTP 後才准調）
- [ ] 步驟 2-1（全網域一次）：SPF / DKIM / DMARC / MX 四筆齊全，且
      mail-tester 上 SPF、DKIM、DMARC **三個都 pass**（不是「Supabase 存檔成功」）
- [ ] 步驟 2-2：Magic Link / Confirm signup / Reset Password 模板已含 `{{ .Token }}`
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
