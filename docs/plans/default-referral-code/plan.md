# 預設推薦人（未填推薦碼時自動綁定）規劃書

> **修訂版 v2**——依 `review.md` 的 2 個 P0、11 個 P1、3 個 P2 與人審裁決全面改寫。
> 主要變更:①「不回填」改用 `subscriptions.is_renewal` 判準(**只綁首購**);
> ② 解析改用既有 `validate_referral_code()`;③ 解析抽成獨立子函數;
> ④ 範圍擴大到前端與共用契約(啟用 `isAutoReferral` 抑制顯示)。

## 0. 一句話

這個 feature 讓**首次付款且未填推薦碼**的會員自動綁定到平台指定的預設推薦人,
因為平台方要讓自然流量也進入三代分潤組織,而非落在無主狀態。

## 1. 使用者需求

**對照規格書**:§7.1 推薦碼、§7.2 組織圖(換線)、§8.2 發放時機、§9.1 推薦王。

### 1.1 已裁決事項(人審拍板,實作不得自行更動)

| # | 決定 | 出處 |
|---|---|---|
| 1 | 預設推薦人**照常參與**推薦王月任務,不排除 | 人審 |
| 2 | **只綁首購**——既有會員(含其未來所有付款)完全排除 | 人審(`review.md` P0-2 選項一) |
| 3 | **不改**面向使用者的揭露:UI 文案、服務條款維持原樣 | 人審 |
| 4 | **啟用** `isAutoReferral` 抑制顯示,讓自動綁定不出現在使用者畫面 | 人審 |

> 決定 3 與 4 並存的意思:不主動告知,也不主動展示。內部工程文件(規格書)照記
> 機制本身,不加任何面向使用者的告知語句。

### 1.2 驗收情境

| # | 情境 | 預期 |
|---|---|---|
| A | **首次付款**且未填推薦碼 | 綁定預設推薦人;三代獎金以其為第 1 代起算;回寫欄位見 §2.6 |
| B | 有填有效推薦碼者付款 | 完全不受影響 |
| C | 已被套過預設者**續約** | 解析步驟 no-op(已非 null),但**三代 100P 照 §8.2 第 2 列照常發放** |
| D | 預設推薦人本人付款/續約 | **不得**成為自己的上線;行為同現況 |
| E | 設定值為 `null`(停用) | 行為與現況完全相同 |
| F | 設定的碼不存在/非 active | fallback 回無推薦人 + `system_alerts` 告警,**付款照常成功** |
| G | 預設推薦人的推薦王月任務 | 照常累計、照常發 credit(決定 1) |
| **H** | **預設推薦人於解析當下已被停權** | **不套用**——比照 `validate_referral_code` 既有語意(P0-1) |
| **I** | **既有會員(feature 上線前已付款、無推薦人)續約** | **不綁定**、不發獎、`referred_by_user_id` 維持 null(決定 2) |
| **J** | **被預設綁定者後續以 fresh 模式換到真推薦人** | 依 §7.2 既有換線語意:推薦邊改指新上線,預設推薦人的歷史獎勵與任務計數保留 |
| **K** | **被預設綁定者自己達推薦王門檻並領取免費續約 credit** | `claim_referral_king_reward` → `pay_referral_generations` 對其(預設)上線鏈正確發三代 |
| **L** | 預設推薦人自己也沒有上線 | gen2/gen3 不發放,行為同既有「頂層無上線使用者」(既有邏輯已正確,補此列僅為完整性) |
| **M** | 被預設綁定者在畫面上 | 續約確認卡不顯示推薦碼/推薦人;編輯資料時推薦碼欄位不顯示該碼(決定 4) |

### 1.3 明確不做

- **不回填**既有會員——含**一次性 migration** 與**未來付款的 lazy 綁定**兩者
  (決定 2;技術落實見 §2.3)。
- **不改**面向使用者的揭露文案與服務條款(決定 3)。
- **不改**註冊當下的寫入語意:`POST /auth/register` 與 `handle_new_user()`
  仍寫 `null`。預設只在付款成功時套用。
- **不改** `repair_orphaned_payments` / `repair_orphaned_claim_rewards` 的
  自癒邏輯——決定 2 的做法讓回溯路徑在源頭就不成立(§2.3),不必動自癒函數。
- 不動推薦王門檻、獎金額度、代數等既有業務常數。
- 不處理推薦網絡樹的規模問題(見 §7 風險表,列為觀察項)。

## 2. 系統設計

### 2.1 套用點:`apply_referral_side_effects` 的 `v_referrer1 is null` 分支

`referred_by_*` 有三個寫入點(`handle_new_user()` trigger、
`POST /auth/register`、`POST /payuni/prepare` 的 fresh 換線),但**寫入預設值
只需要一個地方**:`apply_referral_side_effects`(現行版
`20260724000004`:78-83 的 early return)。

> **措辭修正(P1-2)**:它是「唯一**寫入**預設值的漏斗」,不是「唯一漏斗」。
> `pay_referral_generations` 實有 **3 個**呼叫點——`apply_referral_side_effects`、
> `claim_referral_king_reward`(`20260724000005`:105)、
> `repair_orphaned_claim_rewards`(`20260724000006`:52),後兩者不經套用點。
>
> **它們依賴的不變量(必須明文記錄)**:`claim_referral_king_reward` 前置要求
> 呼叫者已有 `subscriptions` 列,而該表唯一建立入口是
> `process_successful_payment`,它必然已呼叫過 `apply_referral_side_effects`
> 一次。故能走到 claim 的人,其 `referred_by_user_id` 早已解析完成,claim 路徑
> 直接讀現值即正確。此不變量由情境 K 的測試保護。

### 2.2 解析邏輯抽成獨立子函數(P1-6)

前一個 migration(`20260724000003`)剛示範本專案降低覆寫風險的解法:把邏輯抽成
`pay_referral_generations` / `reconcile_king_credits`,主函數只留呼叫。本規劃
沿用該先例——`apply_referral_side_effects` 至今已被全量覆寫 7 次,不該再讓
第 8 次的 diff 變大。

```
resolve_default_referrer(p_user_id uuid, p_subscription_id uuid) returns uuid
```

回傳 `null` 表示「不套用」(涵蓋停用、非首購、碼失效、自我推薦全部情形),
呼叫端只需判斷 null。可獨立測試,不必透過整支金流函數。

### 2.3 首購判準:讀現成的 `subscriptions.is_renewal`(P0-2 / 決定 2)

`process_successful_payment` 在**建立訂閱之前**就算好並持久化了這件事
(`20260720000001_wave4_guards.sql:425`):

```sql
v_is_renewal := exists (select 1 from public.subscriptions where user_id = p_user_id);
```

每筆付款(不論 extend / fresh)都新增一列 `subscriptions` 並帶此欄位。
`apply_referral_side_effects` 本來就收 `p_subscription_id`,故判準只是讀該列的
`is_renewal`——**不新增欄位、不新增狀態、不額外掃表**。

**這個判準同時切斷回溯發獎鏈**(review.md P0-2 第 4 步):既有會員續約時
`is_renewal = true` → 不進綁定分支 → `referred_by_user_id` 維持 `null` →
`repair_orphaned_payments` 的候選條件 `pr.referred_by_user_id is not null`
(`20260716000006`:377)永遠不成立 → 歷史 subscription 不會被抓成候選補發。
**因此不必修改任何自癒函數**。

判準是單調的:一旦判定非首購就永遠非首購,自癒重放答案不變,天生冪等。

### 2.4 停權護欄:重用 `validate_referral_code()`(P0-1)

**不得**自行拼 `referral_codes.status = 'active'` 查詢。全庫無任何 trigger 在
`profiles.suspended_at` 被設定時連動改 `referral_codes.status`;真正擋停權推薦人
的是 `validate_referral_code()` 的查詢條件(`20260720000001`:152-160),該
migration 檔頭明寫「被停權仍繼續拉下線賺獎金是權限模型的洞」。

`resolve_default_referrer` 一律呼叫 `validate_referral_code(p_code)`——它已是
「推薦碼合法性」的單一真相,日後任何合法性規則變更自動同步。

### 2.5 設定值:`reward_config.default_referrer_code`

```sql
alter table public.reward_config add column default_referrer_code text;  -- null = 停用
comment on column public.reward_config.default_referrer_code is
  '未填推薦碼的首購會員自動綁定的推薦碼；null = 停用此機制。';   -- P2-3
```

- 沿用既有「可變業務常數」單一真相(§8.1、`20260719000002`)。停用/換人 =
  一行 `UPDATE`,不必 migration、不必重新部署。
- **刻意不給 column default**:開啟機制要是可追溯的 `UPDATE`,不是藏在 DDL 裡
  的字面量。
- 存 code 不存 user_id:code 是業務語言,且可直接餵給 `validate_referral_code()`。
- **大小寫正規化(P2-2)**:解析時一律 `lower(trim(...))` 再查,與其餘寫入點
  (`index.ts:591`、`1401-1402`)一致,避免營運人員手動 UPDATE 成混合大小寫時
  安靜失效。

### 2.6 回寫欄位清單(P1-8——原 §1/§2 與 §4 矛盾,此處為唯一定義)

套用預設時,在 `apply_referral_side_effects` 既有的 `for update` 鎖內回寫:

| 欄位 | 寫入值 | 理由 |
|---|---|---|
| `profiles.referred_by_user_id` | 解析出的 uuid | **必要條件**:`pay_referral_generations`(`20260724000003`:38-42)自己重讀此欄位,不吃呼叫端變數;不回寫則 gen1 早退、一毛不發 |
| `profiles.referred_by_code` | 正規化後的預設碼 | 不寫會讓組織圖/稽核與獎勵不一致 |
| `profiles.referred_by_is_default` | `true` | **新增欄位**,見下 |

**新增 `profiles.referred_by_is_default boolean not null default false`**:
決定 4 要求前端能分辨「這是自動綁定的」。不採「拿 `referred_by_code` 去比對
`reward_config.default_referrer_code`」的做法——營運日後換掉預設碼時,該比對會
把過去被綁定的人**全部誤判成非自動**(或反之),是會隨時間漂移的錯誤答案。
獨立欄位在寫入當下定案,永不漂移,並順帶提供「誰是自動綁定」的稽核依據。

> `referred_by_code` 的 schema 註解是「註冊當下使用的推薦碼字串(稽核用)」
> (`20260620000001`:38)。本 feature 寫入使用者未曾輸入的碼,已偏離該註解原意
> ——由 `referred_by_is_default` 承載這個區別,並在 migration 內更新該欄位註解
> 說明兩種來源。

### 2.7 執行順序與錯誤隔離(P1-1)

```
3a 建推薦碼（現況）
└─ NEW ── begin
            v_referrer1 is null → v_referrer1 := resolve_default_referrer(...)
            非 null → 回寫 §2.6 三個欄位
          exception when others →
            log_system_alert(...) + v_referrer1 := null（fallback 成無推薦人）
          end
3b referral_edges（吃 v_referrer1）
3c pay_referral_generations（重讀 profiles → 吃回寫結果）
3d task +1 / reconcile_king_credits（吃 v_referrer1）
```

**必須自包一層 `begin…exception when others`**:主函數沒有頂層例外處理,四個
既有步驟各自隔離。未捕捉的例外會一路展開到 `process_successful_payment` 的
savepoint(`20260720000001`:478-484),**把已成功的 3a 建推薦碼一併回滾**。

### 2.8 API 與契約變更

| 項目 | 變更 |
|---|---|
| `_shared/api-contract.ts` | `ProfileResponseSchema`(:113)新增 `isAutoReferral: bool()` |
| `GET /auth/profile`(`buildProfileResponse`) | 回傳 `isAutoReferral: profile.referred_by_is_default` |
| `getRewardConfig()` | **不動**——`default_referrer_code` 是純 SQL 側邏輯,前端不需要 |

> 契約是前後端共用單一真相,**兩側必須同步**,只改一邊會在 CI 型別檢查才炸。

## 3. 架構影響

**動到的模組**(原 v1 宣稱「`src/**` 不動」已因決定 4 失效):

| 層 | 檔案 |
|---|---|
| DB | 新增 migration ×3(見 §5;`supabase/README.md`:113-114 明訂不得編輯已套用的 migration) |
| 共用契約 | `supabase/functions/_shared/api-contract.ts` |
| Edge Function | `supabase/functions/api/index.ts`(`buildProfileResponse` 一處) |
| 前端 | `src/components/PaymentCheckout.tsx`、`src/components/CompleteProfile.tsx` |

- **效能**:每次付款多一次 `validate_referral_code` 單列索引查詢,且僅在
  `referrer is null` 時觸發。可忽略。
- **安全**:`reward_config` 已 `enable row level security` + 無 policy +
  `revoke all from anon, authenticated`,新欄位自動繼承。
  `profiles.referred_by_is_default` 經既有 profile RLS,只回傳給本人。
- 不新增路由,不影響 appShell 契約與路由 lazy 結構。

## 4. UI/UX

依決定 4,自動綁定不出現在使用者畫面。兩處曝光點(皆由 UI/UX 審查查出):

**4.1 續約確認卡**(`PaymentCheckout.tsx:591-603`)

```tsx
{pendingUser.referredByCode && !pendingUser.isAutoReferral && ( … )}
```

`isAutoReferral` 旗標**早已存在於此條件式,但全域從未被任何地方賦值**(死碼)。
本 feature 由 §2.8 的契約欄位為它供值,條件式本身**一字不改**即生效。

**4.2 編輯資料時的推薦碼欄位**(`CompleteProfile.tsx:91-122`)

`:108` 的 `referralCode: boundCode` 會把預設碼**預填進輸入框**,比 4.1 更直接。

⚠️ **此處不可只是清空**:該 prefill 是 load-bearing 的——檔案 `:88-90` 的註解
寫明「若編輯時把推薦碼欄位留空再送出,會**清掉**原本的推薦關係」,而
`POST /auth/register` 確實會把空值寫成 `null`(`index.ts:591`)。單純不預填會
讓使用者一次編輯就永久解除綁定,且因 §2.3 只綁首購,**再也不會被重新綁定**。

**做法**:維持 `formData.referralCode` 的值(送出行為完全不變),只在
`isAutoReferral` 時不渲染該欄位的值與「推薦人:」提示。這是純顯示層抑制,
不觸碰 `/auth/register` 的語意,爆炸半徑最小。

**4.3 既有缺陷的曝光放大(P1-11,記錄但不在本 feature 修復)**

`CompleteProfile.tsx:301` 的判斷式 `formData.referralCode.trim() && referrerName`
假設「有推薦碼」與「有推薦人姓名」同時成立,但 `/auth/profile` **從不回傳
`referrerName`**,故編輯路徑會對帶著有效推薦碼的使用者彈出「您未填寫推薦碼」。
此為既有缺陷(任何手動填碼者續約編輯時就會踩到),本 feature 會把受影響族群從
罕見邊角變成多數自然流量。

依決定 3(不改揭露文案)與最小爆炸半徑原則,**本 feature 不修**;
`isAutoReferral` 抑制後,自動綁定者看到的訊息與其畫面一致(欄位空、訊息說未填),
不產生新的矛盾。列入 §6 開放問題供人審確認。

**行動版**:兩處皆為手機/桌面共用 JSX,無 `md:hidden` 分流,不需額外處理。

## 5. 階段切分

原 v1「1 個 migration」與「三階段各自紅綠循環」互相矛盾(P1-7);
依 `supabase/README.md`:113-114 不得編輯已套用的 migration,故拆為 3 個。

| # | 階段 | migration | 測試落點 | 驗證標準 |
|---|---|---|---|---|
| 1 | `reward_config.default_referrer_code` + `resolve_default_referrer()` 子函數(含首購判準、停權護欄、大小寫正規化、自我推薦) | ①欄位+函數 | `api/default-referrer.test.ts` | 情境 D/E/F/H/I——**不經** `apply_referral_side_effects`,直接測子函數 |
| 2 | 接進 `apply_referral_side_effects`(exception 隔離 + §2.6 回寫三欄位) | ②覆寫主函數 + `profiles.referred_by_is_default` | 同上檔案追加 | 情境 A/B/C/G/L |
| 3 | 回歸:換線與 claim 路徑 | — | 同上檔案追加 | 情境 J/K(保護 §2.1 的不變量) |
| 4 | 契約 + API:`isAutoReferral` | — | `api/api-contract.test.ts` 追加 | `GET /profile` 帶正確旗標 |
| 5 | 前端抑制 + 規格書 §7/§8 同步 | — | `PaymentCheckout.test.tsx` / `CompleteProfile.test.tsx`(jsdom);`check-spec-drift.py` | 情境 M;drift 綠 |

**測試紀律(P1-9)**:階段 1、2 會改動全域單列 `reward_config`,**必須比照
`reward-config.test.ts` 檔頭的紀律**——保存原值、`finally` 還原。漏做會讓殘留的
`default_referrer_code` 污染 `task-new-downline-only.test.ts`、
`referral-king-reward.test.ts` 等「建立無推薦人頂層使用者並付款」的既有測試。

**測試不得依賴 `asa899869` 字面**:各環境 DB 獨立,測試一律自建推薦碼當預設值,
否則會走到 fallback 路徑而非主路徑,綠燈卻沒證明任何事。

命名依 `.claude/rules/test-naming.md`:`Deno.test('<主體>:<情境> → <預期>')`,
中文 ≤72 字;碰 DB 一律 `*.test.ts`(不可 `*.unit.test.ts`)。

## 6. 開放問題

- [ ] **`asa899869` 在正式站是否存在且 active、且未停權?** 機制生效前提。
      護欄(情境 F/H)保證不會出錯,只會靜默不生效 + 告警。develop 的 Supabase
      branch 有獨立 DB,極可能不存在此碼。
- [ ] **規格書 §7/§8 記載機制本身**——解讀為決定 3 只約束**面向使用者**的
      揭露(UI/服務條款),內部工程文件照記(且 `check-spec-drift.py` 對業務常數
      有 CI 硬擋)。若解讀有誤請在人審駁回。
- [ ] **§4.3 的既有缺陷本次不修**,是否接受?(修它需在編輯回填時補打
      `/referrals/validate/:code`,超出本 feature 範圍)
- [ ] **預設推薦人帳號的提領落地面**:能否/是否會實際通過 KYC 與每日上限、
      平台如何消化快速累積的點數。§7 只涵蓋發放面,落地面需商業判斷。

## 7. 風險與回滾

| 風險 | 影響 | 處置 |
|---|---|---|
| 設定錯誤的碼 | 獎金發給錯的人 | `update reward_config set default_referrer_code = null` 即時停用;已發出的 `reward_transactions` 需人工沖銷 |
| 獎金負債 | 每個自然首購 = 100P × 最多 3 代 + 每 8 位一張免費續約年 | 上線後觀察首月;停用是一行 UPDATE |
| 預設推薦人被停權卻忘了停用設定 | — | 情境 H 已擋(重用 `validate_referral_code`) |
| **推薦網絡樹規模(P1-12,觀察項)** | `GET /referrals/network/overview` 的一代 `roots` **無 limit/offset**;`selectInChunks` 以 150 筆序列化查三張表;`ReferralTreeView.tsx:655-666` 直接 `.map()` 成 DOM **無虛擬化**。預設推薦人的一代下線隨自然註冊單調成長、無自然回落,數百至數千節點時有 Edge Function 執行時限風險,行動裝置/LINE 內建瀏覽器影響更明顯 | 本 feature 不處理;上線後對該帳號的 `overview` 做效能抽測,超標則比照 search 端點為 roots 加分頁 |

**回滾**:`update public.reward_config set default_referrer_code = null;`
——即時生效、不必部署、不必 revert migration。已產生的推薦邊與獎勵不會自動撤銷
(與換線的既有語意一致:歷史獎勵保留)。
