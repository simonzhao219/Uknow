# Uknow 軟體規格書

> **文件定位**：本文件是**需求與業務規則的單一事實來源**。`/plan-feature` 的規劃書、
> `plan-reviewer-requirements` 的審查都以此為溯源對象——規劃書對不到本文件章節、
> 又沒列入「開放問題」的功能斷言，一律視為腦補需求。
>
> **與程式碼的分工**：本文件描述「規則是什麼」；程式碼與測試描述「怎麼做到」。
> 兩者衝突時**以程式碼為準並回頭修本文件**——文件失真比沒有文件更糟。
> 各節標註 `〔實作〕` 的行給出對應檔案，供查證與回填。
>
> **會變的數字不寫死在文件**：獎金額度與推薦王門檻的執行期真相是資料表
> `reward_config`（見 §8.1）。本文件寫出的是**現值**，調參時以資料表為準。
>
> **本文件有機械把關**：`scripts/check-spec-drift.py`（接在 framework-check 軌）
> 會把可驗證的事實與程式碼逐條對上——業務常數、§3 路由表、狀態機與分類列舉、
> 以及本文件引用的檔案路徑。改了程式碼沒同步這裡，CI 會紅；**改這裡的措辭
> 導致檢查器抽不到值，CI 也會紅**（抽不到就當通過，等於閘門靜默失效）。
> 調整相關段落的寫法時，請一併更新該腳本的抽取式。

---

## 1. 專案概述

### 1.1 產品定位

Uknow 是**專業服務媒合平台**：訪客可公開瀏覽、搜尋服務提供者；使用者註冊、
完善個資、支付年費成為會員後，可刊登自己的服務、參與三代推薦獎勵、完成任務
累積點數並申請提領。含管理後台與金流串接。

### 1.2 技術棧

| 層 | 技術 |
|---|---|
| 前端 | React 18 + Vite + TypeScript、Tailwind v4、shadcn/ui（Radix）、React Router |
| 狀態管理 | React Context（`App.tsx` 的 `UserContext`），無 Redux/Zustand |
| 後端 API | 單一 Supabase Edge Function（Deno + Hono）`supabase/functions/api/index.ts` |
| 資料庫 / 認證 / 儲存 | Supabase（PostgreSQL + Auth + Storage） |
| 金流 | **PayUni（統一金流）** |
| 前端部署 | Cloudflare Pages |

### 1.3 設計原則

- **行動優先**：使用者幾乎都在手機上（LINE 內建瀏覽器佔比高），手機瀏覽器
  是主要優化目標；桌面為次要但完整支援。
- **單一真相來源（SSOT）**：每個事實只存一次，能算出來的即時算，不另存快取
  欄位（詳見 `supabase/README.md`）。
- **響應式 + 觸控友善**：設計準則見 `docs/ui-ux-guidelines.md`。

---

## 2. 系統架構

### 2.1 使用者角色

| 角色 | 能做什麼 |
|---|---|
| **訪客** | 瀏覽/搜尋服務提供者、查看詳情、註冊登入、閱讀條款與規則頁 |
| **會員（會籍有效）** | 刊登管理、推薦系統、任務、獎勵與提領 |
| **會員（會籍失效）** | 可登入，但會籍限定功能被導向續約；刊登隱藏、不可提領 |
| **管理員** | 會員管理、提領審核、系統公告 |

### 2.2 前後端分工（混合模式）

- **瀏覽 / 讀取**（公開刊登、個人資料、餘額）→ 前端 supabase-js 直連，RLS 保護。
- **複雜寫入**（付款、發獎勵、對帳補償）→ Edge Function 以 service_role 執行。
- **認證 / Session** → 交給 supabase-js 內建（自動 refresh token）。
- 前端所有 API 呼叫一律走 `src/utils/apiClient.ts`（自動附 token、處理 session 過期）。

---

## 3. 路由與存取控制

〔實作〕`src/App.tsx`、`src/components/{ProtectedRoute,RequireMembershipRoute,AdminRoute}.tsx`

| 路由 | 頁面 | 存取層級 |
|---|---|---|
| `/` | 首頁 / 服務提供者目錄 | 公開 |
| `/service-providers/:id` | 服務提供者詳情 | 公開 |
| `/login`、`/register` | 登入 / 註冊 | 公開 |
| `/auth/verify-otp` | OTP 驗證碼 | 公開（流程中） |
| `/forgot-password`、`/auth/reset-password` | 忘記 / 重設密碼 | 公開 |
| `/terms-of-service`、`/listing-plans`、`/referral-reward-rules`、`/referral-reward-contract` | 條款 / 方案 / 規則內容頁 | 公開 |
| `/auth/complete-profile` | 完善個資 | 登入 |
| `/payment/checkout`、`/payment/result` | 結帳 / 付款結果 | 登入 |
| `/dashboard` | 會員儀表板 | 登入 + 會籍 |
| `/service-providers` | 刊登管理 | 登入 + 會籍 + featureFlag |
| `/service-providers/create` | 新增刊登 | 登入 + 會籍 + featureFlag |
| `/service-providers/edit/:id` | 編輯刊登 | 登入 + 會籍 + featureFlag |
| `/referrals` | 推薦網絡 | 登入 + 會籍 + featureFlag |
| `/tasks` | 任務中心 | 登入 + 會籍 + featureFlag |
| `/rewards` | 獎勵回饋 / 提領 | 登入 + 會籍 + featureFlag |
| `/admin` | 管理後台 | 管理員 |
| `/admin/verify` | 會員驗證（會員身分） | 管理員 |
| `*` | 未匹配路由導回首頁 | — |

> 本表的第一欄由 `scripts/check-spec-drift.py` 與 `src/App.tsx` 的
> `<Route path>` 做**集合對照**——多一條、少一條、拼錯都會讓 framework-check
> 變紅。因此路由請逐條列出，不要用「（+ /create、/edit/:id）」這類簡寫。

**守衛語意**

- `ProtectedRoute`：未登入導向 `/login`；可帶 `featureRequired` 檢查功能旗標。
- `RequireMembershipRoute`：只放行 `active`；`expired` 導向 `/payment/checkout` 續約，
  付款開通中導向 `/payment/result`。
- `AdminRoute`：非管理員擋下。
- `FeatureContext`：功能旗標，**目前為前端全開啟 stub**，尚無後端來源。

> 路由命名為 kebab-case（`/service-providers`）。

---

## 4. 會員與註冊系統

### 4.1 註冊流程（四步）

進度由後端即時算出的 `registrationStep`（0→3）驅動，不存在前端記憶體。
〔實作〕`effective_registration_step`、`src/utils/registrationFlow.ts`

| Step | 名稱 | 內容 |
|---|---|---|
| **0** | Email 檢核 | 輸入 Email，`/auth/check-email` 只回 `{ exists }`。已存在導向登入；不存在進 Step 1 |
| **1** | 帳號建立 | 設定密碼 → 寄送 **6 位數 Email 驗證碼（OTP）**，驗證通過才算建立 |
| **2** | 資料完善 | 填寫身分資料與（選填）推薦碼 |
| **3** | 支付年費 | 跳轉 **PayUni** 支付 **$1,200**；付款成功**不允許退款** |

完成註冊當下即時更新：推薦關係、組織圖、任務計數、獎勵入帳、訂閱效期。

### 4.2 Step 2 的欄位規則

| 欄位 | 規則 |
|---|---|
| 推薦碼（選填） | 驗證存在且推薦人未停權；前端即時查詢並顯示推薦人**真實姓名** |
| 真實姓名 | 用於提領時**人工**核對身分（`request_withdrawal` 只驗身分證字號，不比對姓名）；修改時連動所有顯示介面。**格式驗證**分兩模式，預設中文：中文模式限中文字元＋恰好 0 或 1 個半形空格（兩邊各至少 2 字）、上限 10 字；外文模式限英文字母＋單字間單一半形空格、每字首字母大寫、上限 50 字。兩模式皆不接受標點與數字——身分證上的間隔號（原住民漢字音譯、新住民歸化漢名）在輸入當下自動轉為半形空格。前端依切換鈕嚴格把關、後端採兩模式聯集（模式旗標無安全價值，見〔實作〕）。寫入路徑收斂到 Edge Function（`profiles.name` 的 authenticated 自助 GRANT 已撤銷，`handle_new_user` 不從 metadata 帶入） |
| 身分證字號 | `profiles.national_id`。⚠️ **唯一性檢核尚未實作**（見 §14 已知落差） |
| 生日 | 限 18 歲以上 |
| 手機號碼 | 格式驗證 |

### 4.3 可恢復性要求

註冊、付款、重設密碼、提領皆屬「連續多步流程」，必須滿足
`docs/multi-step-flow-recovery.md` 的**四條可恢復性契約**（狀態可查詢、
每步可重入、錯誤分可復原與否、有副作用的復原需身分證明）。新增多步流程
的 PR 逐條對照確認。

---

## 5. 帳號狀態與權限

會籍狀態為**兩態**，由訂閱日期即時算出（`user_account_status`），
不存狀態欄位。**無寬限期**——到期即失效。
〔實作〕`supabase/migrations/20260721000001_remove_grace_status.sql`

| 狀態 | 觸發條件 | 刊登顯示 | 推薦功能 | 獎勵收益 | 提領 | 任務 |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **訂閱中 (active)** | 付款成功且 `now() <= end_date` | ✅ 顯示 | ✅ 可推廣 | ✅ 正常領取 | ✅ 可提領 | ✅ 持續進行 |
| **完全失效 (expired)** | `now() > end_date` | ❌ 隱藏 | ✅ 碼仍有效 | ✅ 保留不歸零 | ❌ 不可 | 保留不歸零 |

一次性年費、無自動續扣，因此沒有「續扣」可停——不續約即到期失效。

### 5.1 失效狀態的詳細語意

- **允許登入**，僅會籍限定功能被導向續約。
- **點數與任務進度保留、不歸零**——僅「不可提領」。續訂恢復 active 後即可再提領。
  刻意的溫和設計：不銷毀已賺點數，利於稽核與信任。
- **失效期間仍持續入帳**：推薦獎勵綁「下線付款事件」、不檢查上線狀態，
  故失效上線在下線付款時仍照常獲得獎勵。累積點數在恢復 active 前不可提領
  ——這也構成續訂誘因。
- **推薦碼不作廢、仍可被使用**：失效不改變 `referral_codes.status`，該碼仍可被
  新用戶驗證、推薦關係照常建立。組織圖節點保留（標記 Inactive），下線不斷開。
- 續費雙模式（§6.2）**不因過期多久而改變**：續約（extend）永遠可選——
  一筆一年從原到期日隔天接續，過期越久需補繳的筆數越多；新約（fresh）
  從付款日起算、可換推薦人，但會**清空帳本**（沖銷列見 §8.4、任務歸零
  見 §9.2）——「保留不歸零」說的是失效狀態本身，選新約是使用者主動
  放棄原帳本的例外。

### 5.2 停權（suspended）是正交的第二軸

`suspended` 是 admin 手動設定的 `profiles.suspended_at`，與會籍狀態
（由訂閱日期算）是**正交兩軸**——會籍本體仍只有 active/expired 兩態。

- **效果**：凍結金錢／福利相關動作——刊登可見、提領、領取免費續約 credit 皆擋。
- **不硬鎖會員區**：`RequireMembershipRoute` 只看 `accountStatus`，停權但仍在
  效期內的會員可照常瀏覽會員區。此為刻意取捨（凍結價值出口即可，不必全站封鎖）；
  若日後需硬鎖定，於守衛加一道 `suspended` 判斷即可。
- 停權會員的**推薦碼不得通過驗證**（`validate_referral_code` 排除停權推薦人）。

### 5.3 守衛順序（三處逐字對齊）

提領（`request_withdrawal`）、領取免費續約 credit（`claim_referral_king_reward`）、
刊登可見（`has_active_subscription`）用**同一把尺**，且守衛順序一致：

1. **停權優先擋** → `error_code 'suspended'`（API 403）
2. **到期再擋** → `error_code 'subscription_invalid'`（API 403）

免費續約 credit 在兩種情形皆維持 `unclaimed`，待解除停權／續訂恢復 active 後
仍可領取；已在 active 狀態領取過的 credit 冪等成功，不因日後停權或到期而翻案。

**一般原則：閘門擋的是「已知不合格」，不是「尚未確認」。** 提領的證件審核守衛
（§10.1 #5a）只擋 `rejected` 而不擋 `pending`，同一條理由——把「還沒輪到審核」
當成不合格，會讓等待本身變成懲罰，而真正的關卡在後面那道人工動作上。

---

## 6. 訂閱系統

### 6.1 方案

- **年繳 $1,200**（唯一方案，`YEARLY_PRICE`），**一次性付款、不自動續扣**。
- **續約提醒**：會員中心於**到期前 30 天起**顯示倒數 banner 與「立即續訂」CTA。
  〔實作〕`src/utils/subscriptionNotice.ts`
  到期前 Email 提醒**尚未實作**（見 §14）。

### 6.2 續約雙模式

〔實作〕`20260716000008_renewal_modes.sql`、`/payuni/prepare`、
`20260802000002_fresh_ledger_forfeit.sql`（fresh 清空）、
`backfillPlan()`（`api/tw-dates.ts` / `src/utils/twDate.ts`，
案例表 `_shared/backfill-cases.ts`）

| 模式 | 適用 | 效期錨點 | 推薦人 | 帳本 |
|---|---|---|---|---|
| **續約（extend）** | 曾訂閱者**永遠可選**，不因過期多久而消失 | 接續**前一筆訂閱到期日的隔天**，一筆一年 | 不變 | 全數保留 |
| **新約（fresh）** | 首購或續費 | 從**付款日**起算 | 換線；**未填碼＝綁平台預設推薦人**（§7.4） | **清空**（§8.4 `ledger_reset` 沖銷、§9.2 任務歸零） |

**補繳**：extend 的效期算術是字面接續、不做「至少從今天起算」的補救——
算出的效期仍在過去也照給，使用者連續補繳（一筆 NT$1,200 = 一年）直到
迄日回到未來才恢復 active，原週年日因此保留。每一筆補繳各自成一列
`subscriptions`（不做合併訂單），且**每一筆都照常發放三代獎勵**（§8.2）；
任務計數不因老下線補繳 +1（§9.2 pair-history）。結帳頁事前揭露需補繳的
筆數、總額、補完到期日與已過期時長；付款中途離開後從任何入口回來，
都以 `/subscriptions/status` 的 `renewal` 契約（`RenewalInfoSchema`）
接續顯示進度，前端不留自己的進度副本。

**fresh 的護欄**：存在審核中（`pending`）提領時不可選 fresh（§10.1，
建單 400）；選 fresh 前結帳頁揭露將清空的具體數字（點數、累積推薦
人數），送出付款前需二次確認——補繳中途改選 fresh 時另列「已付款項
不退還、效期不保留」警語。

模式由建單時寫入 `payment_orders.renewal_mode`，付款成功當下才據以決定效期
——**不信任前端傳入的日期**。

---

## 7. 推薦與組織系統

### 7.1 推薦碼

- **綁定對象**：會員（User），而非刊登。
- **編碼格式**：3 碼小寫英文 + 6 碼數字（例：`abc123456`）。
- 同時僅一個 `active` 碼；續約／補償沿用既有碼，完全沒有時才產生新碼。

### 7.2 組織圖

- 只記錄**直接上線一層**（`referral_edges`），三代樹由 `referral_tree()` 即時爬出。
  查詢**只往下爬 3 層**。
- 上線失效時節點仍存在（標記 Inactive），下線不斷開，組織結構完整。
- **換線（rewire）**：新約模式驗證新推薦碼後更新上線，推薦邊即時改指；
  舊上線的歷史獎勵與任務計數保留（獎勵本就 per-payment-event），未來付款
  的獎勵歸新上線。
- **姓名同步**：組織圖姓名一律透過 User ID 關聯查詢，確保顯示最新真實姓名。
  第二、三代顯示名已**遮罩**（`陳○華`）。

### 7.3 推薦網絡的排序與搜尋

`/referrals` 推薦網絡樹（`ReferralTreeView`）的行為規格。

**排序鍵：節點自身的加入時間**

- 四種排序：`updated_asc`（最早加入）、`updated_desc`（最新加入）、
  `name_asc`（姓名 A→Z）、`name_desc`（姓名 Z→A）。
- `updated_*` 的排序鍵是**節點自身的 `joinedAt`**，每一代各自排序。
  子樹中有新下線加入**不會**改變上層節點的位置。
- 排序一律在伺服器端計算。`name_*` 必須留在伺服器——二、三代顯示名已遮罩，
  前端沒有可正確排序的真名；`updated_*` 的鍵雖然前端也拿得到，仍不下放，
  避免兩套排序邏輯產生兩份真相。
- 同鍵時以真名（`Intl.Collator('zh-Hant')`）再以 userId 決勝，確保順序穩定。

> **歷史沿革（勿改回）**：排序鍵曾是「自身與可見子樹中最新的加入時間」
> （欄位 `subtreeLatestJoinedAt`）。該設計下**任何一位下線加入，都會把其所有
> 上線一起推到列表頂端**，使用者看到的是「整條鏈重新洗牌」而非「新人加入」。
> 該欄位已一併移除。

**預設排序：`updated_asc`（最早加入）**

- **理由（需求方裁決，勿逕自改回）**：組織圖以加入先後呈現穩定的歷史順序，
  使用者每次開啟看到的排列一致，不因近期是否有新人加入而變動。
- 單一事實來源為 `supabase/functions/_shared/api-contract.ts` 的
  `DEFAULT_NETWORK_SORT`，前後端皆從此處讀取，不得各自寫死字面量。
- 前端以 localStorage 記憶使用者上次選擇；**未曾選過**才套用預設。
- 排序下拉選單的排列順序與預設一致（預設項置頂）。

**搜尋：符合條件者必須全部可及**

- 搜尋於伺服器端比對**真名**（前端只有遮罩名），輸入後 debounce 300ms 送出。
- 回應含 `total`（全部命中數，不受分頁影響）與該頁 `matches`；UI 顯示
  「已顯示 X / Y 筆記錄」，命中多於一頁時提供「加載更多」。
- **不得靜默截斷**：只回傳前 N 筆而不揭露總數，會讓使用者以為
  「找不到」等於「不存在」。

**載入回饋**：切換排序時伺服器需重算，此期間清單仍是舊順序；樹以降透明度 +
`aria-busy` 標示重新驗證中，避免看似無回應的空窗。

### 7.4 預設推薦人（未填推薦碼時的自動綁定）

- 兩條路徑未填推薦碼都綁定至 `reward_config.default_referrer_code` 指定的
  推薦人（`null` = 停用，是可調參數；啟用/停用一律人工 `UPDATE`，部署
  步驟見 `docs/supabase-setup-checklist.md`）：
  - **首次付款**（`subscriptions.is_renewal = false`）：付款成功時由
    `resolve_default_referrer` 套用。
  - **續費選新約（fresh）且未填碼**：建單時由 `/payuni/prepare` 套用——
    選新約 = 離開原本的樹，不填碼不等於維持原狀；要留在原上代必須主動
    填回原推薦碼。
- 碼合法性重用 `validate_referral_code()`（`active` 且推薦人未停權），另有
  自我推薦護欄；解析失敗時**不阻斷金流**（建單/付款照常成功），僅寫
  `system_alerts`（首購路徑 `default_referrer_code_invalid` /
  `default_referrer_suspended`；fresh 路徑
  `default_referrer_unavailable_on_fresh`），此時 fresh 者維持原上代不變。
- **可用性可見**（不能只靠事後告警）：`/health` 回報 `defaultReferrer`
  三態 `ok`／`unset`／`invalid`——部署 SOP 打 `/health` 比對 `sha` 時
  一併看見。
- 此推薦人**正常參與** §9 推薦王；獎勵發放與換線規則（§7.2、§8.2）完全比照
  一般推薦人，不特殊處理。
- 自動綁定以 `profiles.referred_by_is_default` 標記（fresh 未填碼路徑也設
  `true`）；換線到使用者親自填的推薦碼時由 `/payuni/prepare` 重置為
  `false`。機制對使用者不揭露（前端據 `isAutoReferral` 契約欄位抑制顯示
  與資料擷取；續約文案只說「留空表示不指定推薦人」）。

〔實作〕`20260726000101`～`20260726000102`、`resolve_default_referrer`、
`/payuni/prepare` 的 fresh 未填碼分支

---

## 8. 獎勵系統

### 8.1 點數規則

- **單位**：1 Point = 1 TWD。
- **層級**：三代制（直推 / 代推 / 深推）。
- **發放金額**：每代 **100 P**，**付款當下一次發清**，直接入流水帳。

> **金額是可調參數**：現值 100 P 存於 `reward_config.referral_reward_amount`，
> SQL 函數、Edge Function、前端皆從此處讀取，不得各自硬編。
> 未填推薦碼時的預設推薦人同樣是可調參數，見 §7.4。
> 〔實作〕`20260719000002_reward_config.sql`

### 8.2 發放時機：拉新與續約都發

三代 100 P 綁「下線的付款/續約事件」，**不**檢查上線狀態：

| 下線事件 | 上線任務 +1 | 上線 100 P（三代） |
|---|:---:|:---:|
| 新下線**首次付款** | ✅ | ✅ |
| **付款續約**（同一上線） | ❌ | ✅ |
| **新約 fresh 換到全新上線** | ✅ | ✅ |
| **新約 fresh 換回曾經的上線** | ❌ | ✅ |
| **任務成功續約**（領免費 credit） | ❌ | ✅ |

語意：**「招募新人」推進任務；「留存續約」給佣金。** 一個管拉新、一個管續命。

〔實作〕三代發獎收斂為單一函數 `pay_referral_generations`，付款路徑
（`apply_referral_side_effects`）與任務續約路徑（`claim_referral_king_reward`）
共用，杜絕兩份複製漂移。`20260724000003`～`20260724000005`

### 8.3 冪等鍵

| 觸發來源 | `subscription_id` | `source_claim_id` | 冪等鍵 |
|---|---|---|---|
| 付款 | 有值 | null | `(referee, generation, subscription_id)` |
| 任務免費續約 | null | 有值 | `(referee, generation, source_claim_id)` |

每一代各自包一層例外隔離（warning-only）：gen2/gen3 失敗不拖累 gen1，
只留 `system_alerts` 紀錄。兩條路徑各有自癒補償
（`repair_orphaned_payments` / `repair_orphaned_claim_rewards`）。

### 8.4 獎勵明細的來源分類

分類軸是**「拉新／續約」加「帳本事件」**（使用者想分辨的事），不是冪等鍵
（實作細節）。
〔實作〕`REWARD_SOURCE_CATEGORIES`（`_shared/api-contract.ts`）、
`20260725000002_reward_source_lifecycle.sql`、
`20260802000002_fresh_ledger_forfeit.sql`

| 分類 | 語意 |
|---|---|
| `referral_signup` | 這位被推薦人**第一次**替我帶來獎勵（**配對視角**，非全域首購） |
| `referral_renewal` | 同一位被推薦人的後續獎勵——付款續約與任務免費續約皆是 |
| `withdrawal` | 點數提領扣款 |
| `withdrawal_refund` | 提領退件退還 |
| `adjustment_manual` | 人工調整（目前無端點產生） |
| `ledger_reset` | 新約重置——選 fresh 續約時清空帳本的負額沖銷列（明細封存，帳本只增不刪） |

付款續約 vs 任務免費續約的差別由 `viaFreeRenewal` 旗標承載（明細第二行註記
「・任務免費續約」），不另佔一個分類。

**新約重置的機制**：續費選 fresh 的付款**成功當下**（絕不在建單時——
建單後可能棄單）插入一筆負額沖銷列，金額 = 當下可提領餘額；帳本只增
不刪，原明細全數封存可稽核。冪等鍵綁本次訂閱 id（webhook 重放不重複
沖銷）；首購 fresh 無沖銷列。沖銷走周邊隔離：失敗不回滾付款，告警
（source＝fresh_ledger_forfeit）帶失敗當下的**金額快照**；自癒函數
repair_orphaned_forfeitures 補沖時以快照為準——不用補沖當下餘額，
失敗後下線新繳的合法點數不被追溯沒收；快照遺失則沖 0 並升級告警交人工。
〔實作〕migration 20260802000002_fresh_ledger_forfeit.sql

### 8.5 餘額

`reward_balances` View 由流水帳即時加總，不存快取欄位：
`total_earned`（歷史總入帳）、`available`（可提領淨額）、`withdrawn`（已提領）。

---

## 9. 任務系統

目前只有一個任務：推薦王。

### 9.1 推薦王

- **條件**：當月**新下線**累積滿 **8 位**（`reward_config.referral_king_monthly_threshold`）。
- **獎勵**：一張可領取的**「免費續約 1 年」credit**（`unclaimed` 狀態），
  非點數。需使用者主動領取才延展會籍。
- **可多張**：當月每滿 8 位發一張，張數 = `floor(當月新人數 / 門檻)`，
  以 `round_ordinal` 區分。〔實作〕`20260724000002_referral_king_multi_credit.sql`
- **月份 key** 錨定**付款時間**（非執行時間），時區 `Asia/Taipei`。
- **計數自癒**：credit 發放獨立於計數 append，每次付款都重新對帳補足差額
  （`reconcile_king_credits`），漏發會被下一筆付款補上。

### 9.2 「新下線」的判準：pair-history

> **`task +1 ⟺ 被推薦人 R 從未出現在上線 U 的 `task_progress.monthly_referrals`
> 任一月份陣列中`**（＝對 U 而言第一次）。

一條規則涵蓋全部情形，並天生具備重放冪等：

- 首購（U 首次得到 R）→ R 不在 U 歷史 → **+1**
- 同上線續約 → R 已在 U 歷史 → **不 +1**
- 換到全新上線 C → R 不在 C 歷史 → **C +1**
- 換回曾經的上線 B → R 已在 B 歷史 → **B 不 +1**

**去重身分 = 下線帳號 UUID**（弱去重，不綁身分證字號）。安全性論證：
每個 task +1 都對應一筆 1,200 元真實付款，多帳號刷 8 位＝花 9,600 換一張
價值 1,200 的免費續約，經濟上不划算。

**fresh 清空與 pair-history 的關係**：選 fresh 清空帳本時，
`total_referrals` 歸 0、**當月**桶刪除（月份 key 沿用付款時點的同一運算
式），但**歷史月份桶永久保留**——歷史桶就是 pair-history 本體，跨清空
保留才能擋「換新約重刷推薦王」：清空後老下線再付款，上線照領 100 P
（§8.2），任務**不 +1**。

### 9.3 領取（claim）

- 守衛與提領逐字對齊（§5.3）：停權擋 → 到期擋，兩者皆維持 `unclaimed`。
- 領取後：訂閱效期**接續延展一年**，credit 標記 `claimed`。
- 領取同時**對領取者的上線鏈發三代 100 P**（§8.2 最後一列）——
  任務續約也算「下線續約」。發獎失敗不回滾「訂閱已延展」的事實。

---

## 10. 提領系統

〔實作〕`request_withdrawal`（`20260720000001_wave4_guards.sql`）

### 10.1 檢核（依實際守衛順序）

| # | 檢核 | `error_code` |
|---|---|---|
| 1 | 帳號未被停權 | `suspended` |
| 2 | 已加入推薦計畫（手寫簽名） | `not_joined` |
| 3 | 金額 ≥ **1,000**、為 **1,000 的倍數**、≤ **單日上限 8,000** | `invalid_amount` |
| 4 | 會籍在效期內 | `subscription_invalid` |
| 5a | 證件審核**未被退回**（`id_verification_status <> 'rejected'`） | `id_rejected` |
| 5b | 已上傳身分證正反面照片 | `missing_id_photos` |
| 6 | 當日（台灣日曆日）尚未申請過——**含被退件的申請** | `already_withdrawn_today` |
| 7 | 餘額 ≥ 提領金額 + 手續費 | `insufficient_balance` |

**5a 只擋 `rejected`，不擋 `pending`。** 真正的關卡是**匯款**不是申請——admin
本來就不會在沒核對證件的情況下轉帳。在申請端擋「還沒輪到審核」的人不增加實質
保護，只讓每個新會員的首次提領多等三個工作天。被退回的人則必須先重新上傳，
否則他會一直重送同一份資料。`none`／`pending`／`approved` 一律落到 5b。

### 10.2 手續費：外加制

每筆固定 **15 P**，檢核公式 **餘額 ≥ (提領金額 + 手續費)**。

**扣款範例**

1. 帳戶餘額 3,000 P
2. 申請提領 1,000 P
3. 判斷：3,000 ≥ (1,000 + 15) → 允許
4. 系統扣除 **1,015 P**（原子寫入：提領單 + 帳本同時落地）
5. 銀行實收 **$1,000 NTD**
6. 餘額 **1,985 P**

### 10.3 狀態機

`pending` → `awaiting_collection` → `completed`／`rejected`

| 狀態 | 語意 |
|---|---|
| **處理中 (pending)** | 申請已送出，等待 admin 處理 |
| **待查收 (awaiting_collection)** | Admin 已匯款，等待用戶確認查收 |
| **已完成 (completed)** | 用戶已確認查收 |
| **已拒絕 (rejected)** | 申請被 admin 拒絕，點數與手續費退還（`withdrawal_refund`） |

**每次轉換寫一筆 `withdrawal_events`**（狀態前後、操作者、說明、交易序號、
匯款日期）。理由是主表只有一個 `note` 欄位，第二次轉換會把第一次的理由覆寫掉
——退件理由與匯款備註是兩件事，不能共用一格。`withdrawals.note` 自此不再寫入
（vestigial，語意記在該欄位的 column comment）。

`awaiting_collection` **不回頭轉 `rejected`**：錢已經匯出去了，退件會把點數退還
而錢收不回來。逾期未查收由 admin **代為結案**（轉 `completed`），會員端明示
「管理員代為結案」而非讓他以為自己按過查收。

存在 **`pending`** 提領時，續費不可選新約（fresh 建單 400，§6.2）——
fresh 會清空帳本，而 pending 之後可能被退件、退款會落進已清空的帳本。
只擋 `pending`：`awaiting_collection` 依上表不可再轉 `rejected`（錢已
核准匯出），無此風險（比照 §9.3 對 §5.3 的守衛對齊寫法，前後端共用
同一個 `hasPendingWithdrawal` 判準）。

### 10.4 隱私取捨

銀行資訊申請成功後留存於 `profiles`（下次自動帶入）；**身分證字號刻意不儲存
於提領流程草稿**。多步 dialog 關閉會遺失當次草稿（金額/步驟），但不構成死巷
——餘額即時重算、證件照可由 `/rewards/id-photos` 復原、送出後狀態在後端。

---

## 11. 刊登系統

- **一個付款帳號對應一個刊登內容**（1:1）。
- **可見性**由 `has_active_subscription` 即時決定——會籍失效即隱藏，
  不存 `isActive` 欄位。訪客走 `public_listings` View。
- 欄位限制〔實作〕`src/utils/constants.ts`：

| 項目 | 限制 |
|---|---|
| 名稱長度 | 最多 10 字（手機首頁顯示截至 8 字，桌面 10 字） |
| 服務介紹 | 最多 200 字 |
| 照片 | 最多 3 張，單張 ≤ 5 MB，格式 jpeg / png / webp |

---

## 12. 服務類別與地區

〔實作〕`src/utils/constants.ts` 的 `SERVICE_CATEGORIES` / `TAIWAN_CITIES` /
`TAIWAN_REGIONS`——**該檔為唯一真相**，本節為分組說明。

### 12.1 服務類別（30 項）

| 群組 | 類別 |
|---|---|
| 美容美髮類 | 美髮、美容、按摩、熱蠟、睫毛、美甲、紋繡、刺青、採耳 |
| 專業服務類 | 保險、傳銷、房仲、汽車、財務顧問、法律顧問、平面設計師、室內設計師、攝影師、工程師、會計師、水電、居家服務 |
| 教育運動類 | 健身教練、各項運動教練、各類音樂老師、身心靈老師 |
| 其他類別 | 上班族、學生、退休、其他 |

### 12.2 地區

支援全台 22 縣市，每個縣市細分至**區/鄉鎮**層級。

---

## 13. 管理後台

`/admin`，`AdminRoute` 守衛。

| 模組 | 元件 | 功能 |
|---|---|---|
| **會員管理** | `MemberManagement` | 會員列表（全站統計／狀態篩選／排序）、會員詳情（含近期提領記錄，身分證與銀行帳號遮罩）、管理員授予／撤銷、**停權/解除停權**（§5.2）；次分頁「證件審核」＝身分證照片的通過／退回流程 |
| **提領管理** | `WithdrawalManagement` | 同屏匯款作業面板（帳號一鍵複製）、標記已匯款／退件／代為結案、批次標記已匯款、事件歷史、CSV 匯出（上限 2,000 筆，超過明示拒絕） |
| **系統通知** | `SystemNotifications` | 系統公告發布與管理（`announcements`） |
| **系統告警** | `SystemAlerts` | 檢視/處理背景失敗告警（`system_alerts`）——金流函數的 warning-only 隔離都落在這裡 |
| **管理員設定** | `AdminSetup` | 初次指派管理員 |

所有 `/admin/**` 路由統一守門：`requireAuth` + `profiles.is_admin`。

**但 middleware 不是唯一防線**：PostgREST 的 `rpc/` 端點繞過它，所以每個
`security definer` 的 admin 函數都必須 `revoke execute from anon, authenticated,
public`。少了那一行，一般會員直呼 `admin_set_member_admin` 就能把自己變成管理員。

管理員授予／撤銷有兩道守衛：`cannot_demote_self`（不能撤銷自己）與 `last_admin`
（撤銷後不得歸零）。**兩者可達性不對稱**——經由端點時 `last_admin` 到不了（只有
管理員能呼叫，系統只剩一位時他唯一能撤的就是自己，先撞 `cannot_demote_self`）；
它守的是呼叫者與目標不同人的路徑。

管理後台入口在導覽列本身（不藏在頭像下拉），帶待處理提領筆數的 badge。

### 13.1 會員驗證（會員身分）

**為什麼**：業主需要在線下（門市/活動）當場確認「來的人是不是會員、會籍還有沒有效」。
推薦碼是公開可分享的，拿它當身分等於誰都能冒充，因此身分驗證自成一套。

**流程**：會員在會員中心「我的 QR → 會員驗證碼」出示**動態短效碼**（90 秒，到期前
自動換發）→ admin 在 `/admin/verify`（**獨立路由**，非 `AdminDashboard` 的 Tab）用相機
掃描 → 後端驗簽後回**會員姓名 + 會籍四態**（`active`/`expiring`/`expired`/`suspended`，
與推薦網絡節點同一套 `deriveNodeStatus`）。

**安全**：QR 內容是 HMAC 簽章的不透明 token（payload 僅隨機 UUID + 到期，無姓名/電話/
身分證），一律後端解析；解析端點 `POST /admin/members/verify` 需管理員權限；缺
`MEMBER_TOKEN_SECRET` 一律 fail-closed（不以空金鑰簽發或驗證）。「驗證碼過期」與
「會籍過期」是不同語意，前端分別呈現。

**稽核**：每次成功驗證寫一筆 `member_verify_logs`（admin、會員、時間），寫入失敗即
擋下驗證（fail-closed）。查閱走 Supabase Studio，目前無前端介面。

> **admin 功能放哪的判準**：需要全螢幕或裝置權限的即時互動（如相機掃碼）走**獨立路由**；
> 資料管理類走 `AdminDashboard` 的 **Tabs**（桌面版是釘死的 5 欄 grid，硬加會壞版面）。

---

## 14. 已知落差與未實作項目

本節是規格與實作**刻意記錄的差距**，避免被反覆「重新發現」。
落差消除時請一併刪除該列；不必另外解釋「為什麼沒有」——規則見
`.claude/rules/document-writing.md`。

| # | 項目 | 現況 |
|---|---|---|
| 1 | 身分證字號唯一性檢核（§4.2） | `profiles.national_id` 無唯一約束、`/auth/register` 未檢查 |
| 2 | 到期前 Email 提醒（§6.1） | 未實作；目前只有站內倒數 banner |
| 3 | 推薦王 credit 的過期機制 | 無過期設計，credit 永久有效 |
| 4 | `FeatureContext` 功能旗標（§3） | **兩側都是 stub 且未接線**：`src/contexts/FeatureContext.tsx` 回傳硬編全 true、`refreshFeatures` 是 no-op；後端 `/admin/features` 也回硬編全 true，且無人呼叫。因此 `ProtectedRoute` 的「功能停用」UI 路徑目前不可達、無 e2e 情境 |
| 5 | 姓名格式規則的兩項未結清查證（§4.2） | ①`HAN_RANGE`（`㐀-鿿`＋`豈-﫿`）不含擴充 B 區以上與造字區，即戶政「缺字」問題——該正則原本只決定遮罩樣式，改當註冊關卡後同一落差的後果變成「完全無法註冊」。目前僅以「罕用字請聯繫客服」的錯誤訊息當逃生口，**未以既有 `profiles.name` 樣本查證實際族群規模**。②純羅馬拼音登記姓名（依《姓名條例》部分原住民族可單獨以羅馬拼音登記法定姓名）的分隔慣例未查證；外文模式目前只允許英文字母與單一半形空格，若官方轉寫慣例另有分隔符號則會誤擋 |
| 6 | 端點命名 `/tasks/current-month-top`（§9.1） | 語意是個人當月推薦進度，命名待改為 `/tasks/current-month-progress`；牽動前端呼叫點與 `supabase/functions/_shared/api-contract.ts` 常數，尚未執行 |

---

## 附錄：關鍵實作索引

| 主題 | 檔案 |
|---|---|
| 業務常數（金額/門檻） | `supabase/migrations/20260719000002_reward_config.sql` |
| 三代發獎 | `20260724000003_pay_referral_generations.sql` |
| 新下線判準（pair-history） | `20260724000004_apply_referral_side_effects_pair_history.sql` |
| 推薦王多張 credit | `20260724000002_referral_king_multi_credit.sql` |
| 任務續約連動發獎 | `20260724000005_claim_cascade_reward.sql` |
| 獎勵來源分類 | `20260725000002_reward_source_lifecycle.sql` |
| 提領守衛 | `20260720000001_wave4_guards.sql` |
| 會籍兩態 | `20260721000001_remove_grace_status.sql` |
| 續約雙模式 | `20260716000008_renewal_modes.sql` |
| 付款完成 user 層級鎖 | `20260802000001_payment_user_lock.sql` |
| fresh 清空帳本（ledger_reset + 補沖自癒） | `20260802000002_fresh_ledger_forfeit.sql` |
| 補繳計畫（backfillPlan 雙副本＋共用案例表） | `supabase/functions/api/tw-dates.ts`、`src/utils/twDate.ts`、`_shared/backfill-cases.ts` |
| 預設推薦人 | `20260726000101`～`20260726000102`、`/payuni/prepare` fresh 未填碼分支 |
| 前端業務常數 | `src/utils/constants.ts` |
| 前後端共享契約 | `supabase/functions/_shared/api-contract.ts` |
