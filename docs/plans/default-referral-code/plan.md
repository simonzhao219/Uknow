# 預設推薦人（未填推薦碼時自動綁定）規劃書

## 0. 一句話

這個 feature 讓**未填推薦碼的付費會員**自動綁定到平台指定的預設推薦人
（`asa899869`），因為平台方要讓自然流量也進入三代分潤組織，而非落在無主狀態。

## 1. 使用者需求

**對照規格書**：§7.1 推薦碼、§7.2 組織圖（換線）、§8.2 發放時機、§9.1 推薦王。

**驗收情境**（可驗證行為）：

| # | 情境 | 預期 |
|---|---|---|
| A | 未填推薦碼者完成首次付款 | 三代獎金鏈以 `asa899869` 為第 1 代起算；`profiles.referred_by_user_id` 回寫為該帳號 |
| B | 有填有效推薦碼者完成付款 | 完全不受影響，維持既有推薦人 |
| C | 已被套過預設的會員續約 | 不再重新解析，維持既有上線（no-op） |
| D | `asa899869` 本人付款／續約 | **不得**成為自己的上線；行為與現況相同（無上線） |
| E | 設定值為 `null`（停用） | 行為與現況完全相同——本 feature 等於未上線 |
| F | 設定的碼不存在或非 `active` | fallback 回「無推薦人」，寫 `system_alerts` 告警，**付款照常成功** |
| G | 預設推薦人的推薦王月任務 | 照常累計、照常發 credit（已拍板） |

**明確不做**（防範圍蔓延）：

- **不回填**既有 `referred_by_user_id is null` 的會員（已拍板）。
  連帶事實：這些會員日後續約或領任務 credit 時，仍不會產生任何三代獎金。
- **不改** UI 揭露文案（`CompleteProfile.tsx:307` 的「您未填寫推薦碼」、
  `:733` 的「推薦碼 (選填)」）與服務條款（已拍板）。
- **不改**註冊當下的寫入語意——`POST /auth/register` 與 `handle_new_user()`
  仍寫 `null`。預設只在「付款成功」時套用（理由見 §2）。
- 不動推薦王門檻、獎金額度、代數等既有業務常數。

## 2. 系統設計

### 2.1 套用點：`apply_referral_side_effects` 的 `v_referrer1 is null` 分支

`referred_by_*` 有三個寫入點（`handle_new_user()` trigger、
`POST /auth/register`、`POST /payuni/prepare` 的 fresh 換線），但**獎勵只有
一個漏斗**：`apply_referral_side_effects`（現行版本
`20260724000004`:78-83 早退）。付款、續約、`repair_orphaned_payments`
補償重放全部匯流於此。

在三個寫入點各補一次預設值，等於重演 `20260719000002` 檔頭自述的教訓
（「少同步一個字面就是一次無聲回退——本專案已踩過三次」）。**在漏斗套，
漏不掉。**

連帶結論：預設推薦人只對「有付費」的會員生效。未付費者本就不產生任何
獎勵，語意上無損；且把改動限縮在單一函數，爆炸半徑最小。

### 2.2 回寫 `profiles` 不是選配，是功能成立的前提

`pay_referral_generations`（`20260724000003`:38-42）**自己重讀
`profiles.referred_by_user_id`**，不吃呼叫端傳入的變數：

```sql
select referred_by_user_id, name into v_ref1, v_referee_name
from public.profiles where id = p_referee;
if v_ref1 is null then return v_applied; end if;
```

因此只設區域變數 `v_referrer1` 而不回寫 `profiles`，gen1 仍會早退、
一毛錢都不會發。回寫是**必要條件**，順帶解決「組織圖顯示無上線、獎勵卻
已發出」的兩份真相問題。

回寫安全性：函數頂端已對該列 `select ... for update`（:52-55），回寫落在
同一把鎖內，與併發的 `repair_orphaned_payments` 序列化。

### 2.3 執行順序（不可調換）

```
3a 建推薦碼（現況，早於 null 判斷）
└─ NEW: v_referrer1 is null → 解析預設推薦人 → 通過護欄則回寫 profiles + 設 v_referrer1
                             └─ 解析不到／踩到護欄 → 維持現況 early return
3b referral_edges（吃 v_referrer1）
3c pay_referral_generations（重讀 profiles → 吃回寫結果）
3d task +1 / reconcile_king_credits（吃 v_referrer1）
```

### 2.4 設定值：`reward_config.default_referrer_code`

```sql
alter table public.reward_config add column default_referrer_code text;  -- null = 停用
```

- **沿用既有單一真相**：`reward_config` 已是「可變業務常數」的收斂點
  （§8.1、`20260719000002`）。改推薦人／停用 = 一行 `UPDATE`，
  不必 migration、不必重新部署 Edge Function。
- **刻意不給 column default**：開啟機制要是一個可追溯的 `UPDATE` 陳述句，
  不是藏在 DDL 裡的字面量。migration 內以獨立 `update` 明確寫入 `asa899869`。
- **存 code 不存 user_id**：code 是業務語言，且解析時能一併檢查
  `referral_codes.status = 'active'`——推薦人若被停權，機制自動失效。

### 2.5 護欄

| 護欄 | 行為 | 為什麼必要 |
|---|---|---|
| 自我推薦 | 解析結果 = `p_user_id` 時跳過 | `asa899869` 本人續約必定踩到（他自己的 `referred_by_user_id` 是 null） |
| 碼失效／不存在 | fallback 回 early return + `log_system_alert('apply_referral_side_effects','warning',...)` | develop 分支的 DB 未必有這個碼；**絕不可因設定問題讓付款失敗** |
| 僅 null 才套 | 條件本身就是 `v_referrer1 is null` | 有真實推薦人者不受影響；已套過的續約自然 no-op |

環風險：預設只在 `referrer is null` 時套用，加上自我推薦檢查，無法成環。

### 2.6 API 與前端

**皆不變。** `getRewardConfig()`（`index.ts:172`）不需要讀新欄位——這是
純 SQL 側邏輯。契約（`_shared/api-contract.ts`）不動。

## 3. 架構影響

- **動到的模組**：`supabase/migrations/`（1 個新 migration）。
  `supabase/functions/api/index.ts` **不動**；`src/**` **不動**。
- **效能**：每次付款多一次 `referral_codes` 單列索引查詢，且僅在
  `referrer is null` 時觸發。可忽略。
- **安全**：`reward_config` 已 `enable row level security` 且無 policy，
  `revoke all from anon, authenticated`——新欄位自動繼承，一般使用者讀不到。
  函數是 `security definer`，回寫 `profiles` 不受 RLS 阻擋。
- **RLS**：無新增 policy 需求。

## 4. UI/UX

**無變更**（已拍板不改揭露文案）。

需記錄的既有行為連帶效果：付款完成後，`profiles.referred_by_code` 會回寫，
故 `GET /profile` 回應（`index.ts:383` 的 `referredByCode`）與推薦網絡樹
（`referral_edges` 驅動）**會顯示 `asa899869` 為上線**。這是 §2.2 資料一致性
的必然結果，非本規劃可迴避的選項。

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `reward_config.default_referrer_code` 欄位 + 未填推薦碼者付款後綁定預設推薦人、三代獎金發出、`profiles` 回寫 | `supabase/functions/api/default-referrer.test.ts`（需 DB） | 情境 A、B、E |
| 2 | 護欄：自我推薦跳過、碼失效 fallback 不阻斷金流並留告警、續約 no-op | 同上檔案追加 | 情境 C、D、F |
| 3 | 推薦王照常參與 + 規格書 §7/§8 同步 | 同上檔案追加；`python3 scripts/check-spec-drift.py` | 情境 G；drift 檢查綠 |

測試命名依 `.claude/rules/test-naming.md`：`Deno.test('<主體>：<情境> → <預期>')`，
中文敘述 ≤72 字。檔名 `*.test.ts`（碰 DB，不可用 `*.unit.test.ts`）。

## 6. 開放問題

- [ ] **`asa899869` 在各環境是否存在且 `active`？** 這是機制生效的前提。
      正式站與 develop 的 Supabase branch **各有獨立 DB**，develop 上極可能
      不存在此碼。護欄 F 保證不會出錯（只是靜默不生效 + 告警），但
      develop 上的驗證需要先建一個同名碼，否則階段 1 的測試會走到 fallback
      路徑而非主路徑。**需人確認正式站該碼狀態。**
- [ ] **規格書要不要記載這個機制？** 已拍板「不動 §7 與服務條款的**告知
      措辭**」——我的解讀是那指**面向使用者的揭露**。`docs/` 是內部工程
      文件、且 `scripts/check-spec-drift.py` 會對業務常數把關，故本規劃
      **預設在 §7/§8 記載機制本身**（不加任何面向使用者的告知語句），
      服務條款與 UI 文案一律不動。**若解讀有誤請在人審時駁回。**

## 7. 風險與回滾

| 風險 | 影響 | 處置 |
|---|---|---|
| 設定錯誤的碼 | 獎金發給錯的人 | `update reward_config set default_referrer_code = null` 立即停用；已發出的 `reward_transactions` 需人工沖銷 |
| 預期外的獎金負債 | 每個自然註冊 = 100P × 最多 3 代 + 每 8 位一張免費續約年 | 上線後觀察首月；停用是一行 UPDATE |
| 回寫改變既有組織圖 | 僅影響本 feature 上線後才付款且無推薦人者 | 不回填既有會員（已拍板），影響面可界定 |

**回滾**：`update public.reward_config set default_referrer_code = null;`
——即時生效、不必部署、不必 revert migration。已產生的推薦邊與獎勵不會
自動撤銷（與換線的既有語意一致：歷史獎勵保留）。
