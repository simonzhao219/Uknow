# 上線獎勵 × 直推任務：規則更新設計文件

> 狀態：**設計草案（尚未實作）**
> 建立日期：2026-07-21
> 對應分支：`claude/online-rewards-referral-analysis-rzwupj`
> 前置分析：見本文件「附錄 A：現況追蹤」與各處 migration 引用。

---

## 1. 目的與一句話總結

把目前**焊在同一段程式碼、同一個冪等鍵**的兩件事——「上線任務 +1」與「上線發 100P 獎金」——**拆成兩個獨立觸發事件**：

- **任務進度 +1** ← 只在「直推成功一位**新**下線」（新下線首次付款）時發生。
- **100P 獎金** ← 只要下線**續約**就發（付款續約 **＋ 任務成功續約**）；並且**首購也照發**（維持現況）。

背後的設計語意：**「招募新人」推進推薦王任務／免費續約 credit；「留存續約」給 100P 佣金。** 一個管拉新、一個管續命，職責分離。

---

## 2. 定案的規則（決策紀錄）

| 決策 | 選項 | 結論 |
|---|---|---|
| ① 新下線首購時上線拿不拿 100P | 1-B | **拿**。首購照發，續約也發（加法）。 |
| ② 續約的 100P 發幾代 | 2-A | **三代**（gen1/2/3 各 100P），與現行付款獎勵一致。 |
| ③ 推薦王 credit 張數 | 3-B | 當月每滿 8 位新人發一張，**可多張**（`floor(新人數/8)`）。 |
| ④ 去重強度 | 弱去重 | 綁下線**帳號 UUID**（`profiles.id`），**不**綁身分字號。 |
| ⑤ 歷史資料 | 不回溯 | 只從上線起套新規則，不回溯重算既有 `monthly_referrals` 與 king credit。 |

### 觸發矩陣（定案）

| 下線事件 | 上線任務 +1 | 上線 100P（三代） |
|---|:---:|:---:|
| 新下線**首次付款** | ✅（綁 UUID，一人一次） | ✅ |
| **付款續約** | ❌ | ✅ |
| **任務成功續約**（領免費 credit） | ❌ | ✅ **（新增，目前完全不發）** |

### 判斷鍵定義

- **「是不是新下線」** = `is_renewal = false`：本次付款**之前**該 user 是否已有任何 `subscription`（`process_successful_payment` 於插入本次訂閱前算出 `v_is_renewal`）。
- **「同一個下線」（去重）** = 下線帳號 **UUID**（`monthly_referrals[月]` 陣列存的 `p_user_id::text`）。
- **task +1 條件** = `is_renewal = false` **且** 該月陣列尚無此 UUID（第二個條件同時作為重放冪等）。
- **推薦王 credit** = 當月 distinct 新人數每滿 8 位發一張「免費續約 1 年」，可多張。

---

## 3. 現況重點（改動前）

- 唯一寫入獎勵/任務的地方是 `apply_referral_side_effects`（現行版：`supabase/migrations/20260720000001_wave4_guards.sql:172-375`）。
- 它在**每一筆成功付款**都被 `process_successful_payment` 呼叫（`wave4_guards.sql:479`）。
- gen-1 區塊把三件事**綁在一起**：發 gen1 100P、append 到 `task_progress.monthly_referrals`、判定推薦王門檻（`wave4_guards.sql:266-303`）。冪等鍵是 `(referee_user_id, generation, subscription_id)`＝**每筆付款事件**。
- `task_progress.monthly_referrals` 是 **append 不去重** 的陣列（同一人多次付款會重複計入）。
- 推薦王 credit 表 `referral_king_rewards` 有 `unique(user_id, month_key)`＝**每人每月最多一張**（`20260716000005_referral_king_rewards.sql:25`）。
- 任務成功續約 `claim_referral_king_reward`（現行版：`20260721000005_claim_blocks_suspended.sql`）**刻意完全不碰推薦鏈**——只 UPDATE 既有訂閱效期，不發任何獎金、不動 task。這是 0006 明文的設計決定。
- 前端 `MonthlyKingProgress.tsx` 已用 `completedCount = floor(total/8)` 渲染「第 N 次完成」，等於**早就假設可多張**；是後端的 `unique(user_id, month_key)` 把它擋住，造成 UI 超額承諾。3-B 正是讓後端追上前端。

---

## 4. 詳細設計（含 SQL 草稿）

> 以下 migration 檔名為**建議**（接在現有 `20260721000005` 之後）。SQL 為草稿，實作時以現行函數全文為基準做最小差異覆寫（沿用既有鎖、名字快照、warning-only 隔離等慣例）。

### 4.1 `reward_transactions` 增加 `source_claim_id`（任務續約獎勵的冪等鍵）

**問題**：付款路徑用 `subscription_id` 當「這次事件」冪等鍵；但任務成功續約（claim）是 **UPDATE 既有訂閱、沒有新 `subscription_id`**，那筆訂閱的 gen1 獎勵早在它當初付款時發過，沿用會撞鍵。

**解法**：新增事件鍵欄位，指向這次 claim 事件。

```sql
-- migration 建議：20260721000006_reward_source_claim_id.sql
alter table public.reward_transactions
  add column source_claim_id uuid
    references public.referral_king_rewards(id) on delete set null;

comment on column public.reward_transactions.source_claim_id is
  '任務成功續約（claim 免費續約 credit）觸發的推薦獎勵，指向 referral_king_rewards.id；'
  '付款觸發的獎勵此欄為 null，改用 subscription_id 當冪等鍵。';

create index idx_reward_transactions_source_claim
  on public.reward_transactions(source_claim_id)
  where source_claim_id is not null;
```

- 付款路徑的獎勵：`source_claim_id = null`，冪等鍵維持 `(referee, generation, subscription_id)`。
- 續約路徑的獎勵：`subscription_id = null`（或帶 `resulting_subscription_id` 僅供稽核），冪等鍵 `(referee, generation, source_claim_id)`。

### 4.2 `referral_king_rewards` 改為可多張（3-B）

```sql
-- migration 建議：20260721000007_referral_king_multi_credit.sql
alter table public.referral_king_rewards
  add column round_ordinal int not null default 1
    check (round_ordinal >= 1);

comment on column public.referral_king_rewards.round_ordinal is
  '當月第幾張免費續約 credit（每滿門檻人數一張）。取代 unique(user_id,month_key) 的每月一張限制。';

-- 移除每月一張的舊限制，改為「每月每輪一張」
alter table public.referral_king_rewards
  drop constraint uq_referral_king_rewards_user_month;
alter table public.referral_king_rewards
  add constraint uq_referral_king_rewards_user_month_round
    unique (user_id, month_key, round_ordinal);
```

既有列 `round_ordinal` 由 default 補為 1（符合「每人每月至多一張」的歷史事實，不回溯重算——決策⑤）。

### 4.3 `apply_referral_side_effects`：拆塊 + 新增 `p_is_renewal`

**改動要點（相對 `wave4_guards.sql` 現行版的最小差異）：**

1. **新增第 4 參數 `p_is_renewal boolean default false`**（必須先 `drop` 舊 3 參數版避免多載歧義）。
2. **100P 三代獎勵維持每筆付款發**（Block A，決策 1-B / 2-A）——與現況相同，冪等鍵 `subscription_id`。
3. **task +1 與推薦王發放移出 gen1 區塊、獨立成 Block B**，只在 `p_is_renewal = false`（首購）且**該月陣列尚無此 UUID**時執行。
4. **推薦王發放改為「補足 `floor(當月新人數 / 門檻)` 張」**（3-B）。

Block B 的核心邏輯（草稿）：

```sql
-- Block B：只在「首購」跑；task +1（UUID 去重）＋ 推薦王多張補足
if not p_is_renewal then
  v_month_key := to_char(coalesce(p_paid_at, now()) at time zone 'Asia/Taipei', 'YYYY-MM');

  -- 讀直接上線目前的月推薦陣列（referrer1 的 task_progress 已在下方 upsert 前鎖定）
  -- 去重＋重放冪等：該月已含此下線 UUID 就整段跳過。
  if not exists (
    select 1 from public.task_progress tp
    where tp.user_id = v_referrer1
      and coalesce(tp.monthly_referrals -> v_month_key, '[]'::jsonb) @> to_jsonb(p_user_id::text)
  ) then
    insert into public.task_progress (user_id, total_referrals, monthly_referrals)
    values (
      v_referrer1, 1,
      jsonb_build_object(v_month_key, jsonb_build_array(p_user_id::text))
    )
    on conflict (user_id) do update set
      total_referrals   = task_progress.total_referrals + 1,
      monthly_referrals = jsonb_set(
        task_progress.monthly_referrals,
        array[v_month_key],
        coalesce(task_progress.monthly_referrals -> v_month_key, '[]'::jsonb)
          || to_jsonb(p_user_id::text)
      ),
      updated_at = now()
    returning jsonb_array_length(monthly_referrals -> v_month_key) into v_month_count;

    -- 推薦王：補足「應有張數 = floor(當月新人數 / 門檻)」。
    -- 用 while 迴圈逐張補（round_ordinal 遞增），on conflict do nothing 保重放安全。
    v_target_credits := v_month_count / v_king_threshold;   -- 整數除法 = floor
    select count(*) into v_existing_credits
    from public.referral_king_rewards
    where user_id = v_referrer1 and month_key = v_month_key;

    while v_existing_credits < v_target_credits loop
      v_existing_credits := v_existing_credits + 1;
      insert into public.referral_king_rewards
        (user_id, month_key, round_ordinal, status, granted_at)
      values
        (v_referrer1, v_month_key, v_existing_credits, 'unclaimed', now())
      on conflict (user_id, month_key, round_ordinal) do nothing;
    end loop;
  end if;
end if;
```

- **Block A（100P 三代）維持不變**：仍在「gen1 for this subscription 不存在」的判斷內，對 gen1/2/3 各發 100P，冪等鍵 `subscription_id`。**首購與續約都會走到**（決策 1-B）。
- `p_is_renewal = true`（續約）時只跑 Block A、跳過 Block B → **續約發 100P、但不 +1 task、不進推薦王計數**。
- 因為 Block B 只在首購跑，`monthly_referrals` 陣列從此**只累積 distinct 首購 UUID**，長度即 distinct 新人數；`@>` 去重再加一層重放保險。

### 4.4 `process_successful_payment`：把 `v_is_renewal` 傳下去

```sql
-- 唯一差異：side effects 多帶 v_is_renewal（現行 wave4_guards.sql:479）
select public.apply_referral_side_effects(p_user_id, v_sub_id, v_paid_at, v_is_renewal)
  into v_side_effects;
```

`v_is_renewal` 已在 `wave4_guards.sql:426` 於插入本次訂閱**之前**算出，語意正確（本次付款前是否已有訂閱）。

### 4.5 `claim_referral_king_reward`：新增對上線發三代 100P（推翻 0006 原設計）

在「成功延展訂閱 + 標記 claimed」**之後**，補上推薦鏈發獎。**不** +1 task（續約不計）。沿用 warning-only 隔離：發獎失敗不回滾「訂閱已延展」的事實。

```sql
-- 於 update referral_king_rewards ... set status='claimed' 之後追加：
-- 領取者 = 續約的下線；受益者 = 領取者的上線鏈（gen1/2/3）。
begin
  select referral_reward_amount into v_reward_amount from public.reward_config where id = true;
  v_reward_amount := coalesce(v_reward_amount, 100);

  select referred_by_user_id, name into v_referrer1, v_claimer_name
  from public.profiles where id = p_user_id;

  if v_referrer1 is not null then
    select name into v_referrer1_name from public.profiles where id = v_referrer1;

    -- gen1：冪等鍵綁這次 claim 事件（source_claim_id = p_reward_id）
    if not exists (
      select 1 from public.reward_transactions
      where referee_user_id = p_user_id and generation = 1 and source_claim_id = p_reward_id
    ) then
      insert into public.reward_transactions
        (user_id, type, amount, generation, referee_user_id, source_claim_id,
         description, referee_name, referee_referrer_name)
      values
        (v_referrer1, 'referral_reward', v_reward_amount, 1, p_user_id, p_reward_id,
         '推薦獎勵（第 1 代・任務續約）', v_claimer_name, null);
    end if;

    -- gen2 / gen3：沿 referral_edges 往上，邏輯同 apply_referral_side_effects，
    -- 皆以 source_claim_id 當冪等鍵、type 維持 'referral_reward'。
    -- （完整 gen2/gen3 區塊實作時比照 wave4_guards.sql:314-366）
  end if;
exception when others then
  perform public.log_system_alert('claim_referral_king_reward', 'warning', sqlerrm,
    jsonb_build_object('user_id', p_user_id, 'reward_id', p_reward_id, 'step', 'referral_cascade'));
  raise warning 'claim_referral_king_reward：續約推薦獎勵處理失敗（續約本身已完成，reward_id=%）: %', p_reward_id, sqlerrm;
end;
```

- 冪等：claim 本身已對「已 claimed」提早回傳（`claim_blocks_suspended.sql:57-61`），發獎區塊只在**首次** claim 成功分支跑；再加 `source_claim_id` 冪等鍵雙保險。
- **每次任務成功續約 = 上線鏈進帳 3 × 100P = 300P**。此為成本面事實，非工程問題，已為決策 1-B/2-A 所涵蓋。

### 4.6 `repair_orphaned_payments`：帶入 `is_renewal`

候選查詢已 join `subscriptions s`；多取 `s.is_renewal` 傳入即可，讓補跑時 task/king 只對首購生效：

```sql
perform public.apply_referral_side_effects(
  v_candidate.user_id, v_candidate.subscription_id, v_candidate.paid_at, v_candidate.is_renewal);
```

**已知限制（不擴大範圍）**：若某次首購的 gen1 獎勵成功、但 task append 失敗（warning-only 隔離），現行 repair 以「gen1 缺漏」為偵測條件，抓不到「gen1 有、task 缺」的偏移。此為改動前既有性質，本次不處理；如需，另立 task-count 對帳掃描。claim 路徑發獎失敗目前亦無自癒路徑，列為選配延伸。

---

## 5. Edge / 前端改動

### Edge（`supabase/functions/api/index.ts`）
- `/tasks`、`/tasks/current-month-top`、`/tasks/pending-rewards`：計數語意由「付款筆數」變「distinct 新人數」；`referral_king_rewards` 可能多列 unclaimed，需正確列出**多張**可領 credit（現有查詢已 `order by month_key`，補 `round_ordinal` 排序即可）。
- `/tasks/claim-reward/:id`：簽名不變，但底層 RPC 現在有對外發獎副作用，確認回應語意（領取者不需看到上線進帳）。

### 前端（React）
- `src/components/task/MonthlyKingProgress.tsx`：「本月推薦列表」＝新人清單；「溢出機制說明」文案更新為「每滿 8 位新人得一張免費續約，可累積多張」——**後端追上後 UI 不再超額承諾**。
- `src/components/task/PendingRewardsSection.tsx` / `ClaimRewardDialog.tsx`：支援一次列出並逐張領取多張 credit（逐張各 +1 年、往後堆疊）。
- `src/components/reward/RewardHistory.tsx`：顯示任務續約獎勵的新 description。
- `src/components/referral/ReferralGuide.tsx`、`src/components/task/TaskGuide.tsx`：把「何時 +1 / 何時得 100P」規則講白。

---

## 6. 測試矩陣

| 測試檔 | 動作 | 說明 |
|---|---|---|
| `process-payment-reward-repeats-on-renewal.test.ts` | **不改** | 只驗「續約仍發 100P」，未驗 task；新規則下仍成立。 |
| `referral-king-reward.test.ts` | **反轉** | 現行 `:113-118` 斷言「claim 不動 reward_transactions/edges」；改為「claim 對上線發 gen1/2/3 各 100P、且冪等重放不加倍」。 |
| （新增）`task-counts-first-payment-only.test.ts` | 新增 | 首購 → task +1；同下線續約 → task **不** +1；`monthly_referrals` 該月只含一次該 UUID。 |
| （新增）`king-multi-credit.test.ts` | 新增 | 單月 8 / 16 / 24 位新人 → 分別 1 / 2 / 3 張 unclaimed credit；`round_ordinal` 遞增；重放不重複發。 |
| （新增）`claim-cascade-reward.test.ts` | 新增 | 任務續約 → 上線鏈三代各 +100P；`source_claim_id` 正確；重複 claim 冪等、不重複發獎、不 +1 task。 |
| （新增）`king-credit-stacking.test.ts` | 新增 | 連續領多張 credit → 訂閱效期逐年堆疊；併發 claim 由訂閱列鎖序列化不吃年份。 |

---

## 7. 上線與資料遷移

- **不回溯**（決策⑤）：既有 `monthly_referrals` 內的續約重複條目、既有 king credit（每月一張）維持原狀；`round_ordinal` 既有列補 1。新規則只對上線後的新事件生效。
- Migration 皆為 `create or replace function` / `alter table add column` / 調整約束，可線上套用；函數以 service_role 執行，權限維持 `revoke ... from anon, authenticated, public`。
- 建議套用順序：4.1 → 4.2 →（4.3 需 drop 舊多載後 create）→ 4.4 → 4.5 → 4.6。

---

## 8. 風險與注意事項

1. **成本面**：任務成功續約現在會讓上線鏈進帳 300P；付款續約也每年重複發三代。屬業務決策（1-B/2-A），非工程問題，但建議營運端知悉。
2. **弱去重的破口**：去重綁 UUID 不綁身分字號，`profiles.national_id` **無唯一約束**，同一自然人可用不同 email 開多帳號刷推薦王 credit。已知並接受（決策④）；若日後要收緊，改綁 `national_id` 需先處理正規化與唯一性並清歷史資料。
3. **多載歧義**：`apply_referral_side_effects` 從 3 參數改 4 參數，務必先 `drop function ... (uuid, uuid, timestamptz)` 再 create，否則帶 default 的呼叫會歧義（與 `wave4_guards.sql:170` 同一手法）。
4. **UI/後端一致性**：本次順帶消除「UI 多輪承諾 vs 後端每月一張」的既有落差；上線前需前後端同步部署，避免中間態顯示不一致。

---

## 附錄 A：現況追蹤（關鍵引用）

- 付款路徑：`process_successful_payment` → `apply_referral_side_effects`（`supabase/migrations/20260720000001_wave4_guards.sql:383-497`、`:172-375`）。
- 續約模式錨點：`renewal_mode`（`20260716000008_renewal_modes.sql`）、`/payuni/prepare`（`supabase/functions/api/index.ts:1142-1200`）。
- 任務成功續約：`claim_referral_king_reward`（`20260721000005_claim_blocks_suspended.sql`）。
- 推薦王表/門檻：`20260716000005_referral_king_rewards.sql`、`reward_config`（`20260719000002_reward_config.sql`，門檻預設 8、獎金預設 100）。
- 任務讀取/顯示：`/tasks`、`/tasks/current-month-top`（`index.ts:2319-2500`）、`MonthlyKingProgress.tsx`。
- 身分欄位：`profiles.national_id`（`20260620000007_business_rule_revision.sql:22`，無唯一約束）。
