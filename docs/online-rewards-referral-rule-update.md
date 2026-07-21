# 上線獎勵 × 直推任務：規則更新設計文件

> 狀態：**設計草案（尚未實作）**
> 建立日期：2026-07-21（含複審修訂）
> 對應分支：`claude/online-rewards-referral-analysis-rzwupj`
> 前置分析：見「附錄 A：現況追蹤」與各處 migration 引用。

---

## 1. 目的與一句話總結

把目前**焊在同一段程式碼、同一個冪等鍵**的兩件事——「上線任務 +1」與「上線發 100P 獎金」——**拆成兩個獨立觸發事件**：

- **任務進度 +1** ← 只在「直推成功一位**對我而言是新的**下線」時發生。
- **100P 獎金** ← 只要下線**續約**就發（付款續約 **＋ 任務成功續約**）；並且**首購也照發**（維持現況）。

背後語意：**「招募新人」推進推薦王任務／免費續約 credit；「留存續約」給 100P 佣金。** 一個管拉新、一個管續命。

---

## 2. 定案的規則（決策紀錄）

| 決策 | 選項 | 結論 |
|---|---|---|
| ① 新下線首購時上線拿不拿 100P | 1-B | **拿**。首購照發，續約也發（加法）。 |
| ② 續約的 100P 發幾代 | 2-A | **三代**（gen1/2/3 各 100P）。 |
| ③ 推薦王 credit 張數 | 3-B | 當月每滿 8 位新人發一張，**可多張**（`floor(新人數/8)`）。 |
| ④ 去重強度 | 弱去重 | 綁下線**帳號 UUID**（`profiles.id`），**不**綁身分字號。 |
| ⑤ 歷史資料 | 不回溯 | 只從上線起套新規則，不回溯重算。 |
| ⑥ 「新下線」的定義（複審修正） | pair-history | 「新」= **對這個上線而言第一次**，非全域首購。換線到全新上線**算**新下線；換回曾經的上線**不算**。 |

### 觸發矩陣（定案）

| 下線事件 | 上線任務 +1 | 上線 100P（三代） |
|---|:---:|:---:|
| 新下線**首次付款**（上線第一次得到此人） | ✅ | ✅ |
| **付款續約**（同一上線） | ❌（此人早已被此上線計過） | ✅ |
| **新約 fresh 換到全新上線** | ✅（此人對新上線是新的） | ✅ |
| **新約 fresh 換回曾經的上線** | ❌（此上線計過此人） | ✅ |
| **任務成功續約**（領免費 credit） | ❌ | ✅ **（新增，目前完全不發）** |

### 判斷鍵定義（核心）

- **task +1 條件（單一規則，涵蓋以上全部）**：
  > 令 U＝下線 R 這次付款當下的直接上線。
  > **`task +1 ⟺ R 從未出現在 U 的 `task_progress.monthly_referrals` 的任一月份陣列中`。**
  - 首購（U 首次得到 R）→ R 不在 U 歷史 → +1。
  - 同上線續約 → R 已在 U 歷史 → 不 +1。
  - 換到全新上線 C → R 不在 C 歷史 → C +1。
  - 換回舊上線 B → R 已在 B 歷史 → B 不 +1。
  - 此規則同時作為**重放冪等**：任何補償/重試因 R 已在 U 陣列而自動跳過。
- **「同一個下線」（去重身分）** = 下線帳號 **UUID**（弱去重）。
- **推薦王 credit** = 當月 distinct 新人數每滿 8 位發一張「免費續約 1 年」，可多張。

> 註：pair-history 規則使原本設想的 `p_is_renewal` 參數**變得不必要**——`is_renewal` 只在「同一上線續約」情形與本規則一致，卻在「換線」情形給錯答案。故本版**不改 `apply_referral_side_effects` 簽名**。

---

## 3. 現況重點（改動前）

- 唯一寫入獎勵/任務的地方是 `apply_referral_side_effects`（現行版：`supabase/migrations/20260720000001_wave4_guards.sql:172-375`）。
- 它在**每一筆成功付款**都被 `process_successful_payment` 呼叫（`wave4_guards.sql:479`）。
- gen-1 區塊把三件事**綁在一起**：發 gen1 100P、append 到 `task_progress.monthly_referrals`、判定推薦王門檻（`wave4_guards.sql:266-303`）。冪等鍵 `(referee, generation, subscription_id)`＝每筆付款事件。
- `task_progress.monthly_referrals` 是 **append 不去重** 的陣列。
- `referral_king_rewards` 有 `unique(user_id, month_key)`＝**每人每月最多一張**（`20260716000005:25`）。
- 任務成功續約 `claim_referral_king_reward`（現行版：`20260721000005_claim_blocks_suspended.sql`）**刻意完全不碰推薦鏈**（0006 明文設計）。
- 前端 `MonthlyKingProgress.tsx` 已用 `floor(total/8)` 渲染「第 N 次完成」，等於**早就假設可多張**，被後端 unique 擋住 → UI 超額承諾。3-B 讓後端追上前端。

---

## 4. 詳細設計（含 SQL 草稿）

> 檔名為**建議**（接在 `20260721000005` 之後）。SQL 為草稿，實作時以現行函數全文為基準做最小差異覆寫，沿用既有鎖、名字快照、warning-only 隔離等慣例。

### 4.1【複審 A】抽共用發獎函數 `pay_referral_generations`（避免邏輯複製）

**動機**：`reward_config` migration 檔頭自述這支金流函數被全量覆寫五版、「少同步一個字面就是一次無聲回退——本專案已踩過三次」。若在 `claim_referral_king_reward` 再複製一份三代發獎，等於重種同一個病。故**把三代發獎抽成單一真相**，付款路徑與 claim 路徑共用。

```sql
-- migration 建議：20260721000006_pay_referral_generations.sql
-- 沿推薦鏈往上發最多三代 referral_reward，金額由呼叫端帶入（讀 reward_config）。
-- 事件鍵二選一：付款用 p_subscription_id、任務續約用 p_claim_id；冪等鍵各自綁該欄。
create or replace function public.pay_referral_generations(
  p_referee         uuid,
  p_amount          int,
  p_subscription_id uuid default null,
  p_claim_id        uuid default null,
  p_description_tag text default ''      -- 例：''（付款）/ '・任務續約'
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref1 uuid; v_ref2 uuid; v_ref3 uuid;
  v_referee_name text; v_ref1_name text;
  v_applied text[] := '{}';
begin
  select referred_by_user_id, name into v_ref1, v_referee_name
  from public.profiles where id = p_referee;
  if v_ref1 is null then return v_applied; end if;
  select name into v_ref1_name from public.profiles where id = v_ref1;

  -- gen1（每一代各包 exception，warning-only，不互相拖累）
  if not exists (
    select 1 from public.reward_transactions
    where referee_user_id = p_referee and generation = 1
      and subscription_id is not distinct from p_subscription_id
      and source_claim_id  is not distinct from p_claim_id
  ) then
    insert into public.reward_transactions
      (user_id, type, amount, generation, referee_user_id, subscription_id, source_claim_id,
       description, referee_name, referee_referrer_name)
    values
      (v_ref1, 'referral_reward', p_amount, 1, p_referee, p_subscription_id, p_claim_id,
       '推薦獎勵（第 1 代' || p_description_tag || '）', v_referee_name, null);
    v_applied := array_append(v_applied, 'gen1');
  end if;

  -- gen2 / gen3：沿 referral_edges 往上，帶括號名字快照，冪等鍵同上。
  --（完整 gen2/gen3 區塊比照現行 wave4_guards.sql:314-366，僅事件鍵改為雙鍵）
  ...
  return v_applied;
end;
$$;
revoke execute on function public.pay_referral_generations(uuid,int,uuid,uuid,text)
  from anon, authenticated, public;
```

`apply_referral_side_effects` 與 `claim_referral_king_reward` 的三代發獎都改呼叫它；金額仍由各自讀 `reward_config` 帶入。

### 4.2 `reward_transactions` 增加 `source_claim_id`（任務續約的冪等鍵）

claim 是 **UPDATE 既有訂閱、無新 `subscription_id`**，沿用會撞原付款的 gen1。新增事件鍵：

```sql
-- migration 建議：20260721000007_reward_source_claim_id.sql
alter table public.reward_transactions
  add column source_claim_id uuid
    references public.referral_king_rewards(id) on delete set null;
create index idx_reward_transactions_source_claim
  on public.reward_transactions(source_claim_id) where source_claim_id is not null;
```

- 付款獎勵：`source_claim_id = null`，冪等鍵 `(referee, gen, subscription_id)`。
- 續約獎勵：`subscription_id = null`，冪等鍵 `(referee, gen, source_claim_id)`。

### 4.3 `referral_king_rewards` 改為可多張（3-B）＋ ordinal 由 max 推導【複審 D】

```sql
-- migration 建議：20260721000008_referral_king_multi_credit.sql
alter table public.referral_king_rewards
  add column round_ordinal int not null default 1 check (round_ordinal >= 1);
alter table public.referral_king_rewards
  drop constraint uq_referral_king_rewards_user_month;
alter table public.referral_king_rewards
  add constraint uq_referral_king_rewards_user_month_round
    unique (user_id, month_key, round_ordinal);
```

既有列 `round_ordinal` 由 default 補 1（不回溯，決策⑤）。

### 4.4 `apply_referral_side_effects`：拆塊（Block A 100P／Block B task+king）

**Block A（100P 三代，每筆付款都發，1-B/2-A）**：改呼叫 `pay_referral_generations(p_user_id, v_reward_amount, p_subscription_id => p_subscription_id)`。首購與續約都走。

**Block B（task +1 + 推薦王，pair-history 閘門，複審 B/F）**：

```sql
-- U = 本次付款當下的直接上線 v_referrer1（rewire 後的目標）
v_month_key := to_char(coalesce(p_paid_at, now()) at time zone 'Asia/Taipei', 'YYYY-MM');

-- ⑥ pair-history：R 從未被 U 計過才算「新下線」。掃 U 的整份 monthly_referrals。
if not exists (
  select 1
  from public.task_progress tp,
       lateral jsonb_each(tp.monthly_referrals) as m(k, v)
  where tp.user_id = v_referrer1
    and v @> to_jsonb(p_user_id::text)
) then
  insert into public.task_progress (user_id, total_referrals, monthly_referrals)
  values (v_referrer1, 1, jsonb_build_object(v_month_key, jsonb_build_array(p_user_id::text)))
  on conflict (user_id) do update set
    total_referrals   = task_progress.total_referrals + 1,
    monthly_referrals = jsonb_set(
      task_progress.monthly_referrals, array[v_month_key],
      coalesce(task_progress.monthly_referrals -> v_month_key, '[]'::jsonb) || to_jsonb(p_user_id::text))
    updated_at = now();
end if;

-- 【複審 B】推薦王發放：獨立於上面的 if，做「當月」冪等對帳，永遠自癒。
-- 不論這次有沒有 append，只要有 U 上下文就重算：目標張數 = floor(當月distinct / 門檻)，補足差額。
perform public.reconcile_king_credits(v_referrer1, v_month_key, v_king_threshold);
```

`reconcile_king_credits`（新輔助函數，複審 B/D）：

```sql
create or replace function public.reconcile_king_credits(
  p_user_id uuid, p_month_key text, p_threshold int)
returns void language plpgsql security definer set search_path = public as $$
declare v_count int; v_target int; v_next int;
begin
  select coalesce(jsonb_array_length(monthly_referrals -> p_month_key), 0)
    into v_count from public.task_progress where user_id = p_user_id;
  v_target := v_count / p_threshold;                       -- floor
  select coalesce(max(round_ordinal), 0) into v_next        -- 由 max 推導，防空號
    from public.referral_king_rewards where user_id = p_user_id and month_key = p_month_key;
  while v_next < v_target loop
    v_next := v_next + 1;
    insert into public.referral_king_rewards (user_id, month_key, round_ordinal, status, granted_at)
    values (p_user_id, p_month_key, v_next, 'unclaimed', now())
    on conflict (user_id, month_key, round_ordinal) do nothing;
  end loop;
end; $$;
```

- Block B 的 task append 因 pair-history 天生冪等；king 對帳獨立於 append，**即使某次 append 成功而 king 失敗，下一次任何付款都會把漏發的 credit 補上**（自癒，解決複審 B）。
- `monthly_referrals` 從此**只累積「對該上線是新」的下線**，長度即當月新人數。

### 4.5 `process_successful_payment`

**不需**再多傳 is_renewal（pair-history 不依賴它）。維持現行呼叫，`apply_referral_side_effects` 簽名不變。

### 4.6 `claim_referral_king_reward`：新增對上線發三代（複審 A 共用函數）

在「延展訂閱 + 標記 claimed」**之後**，warning-only 包一層呼叫共用函數，**不** +1 task：

```sql
begin
  select referral_reward_amount into v_reward_amount from public.reward_config where id = true;
  perform public.pay_referral_generations(
    p_referee => p_user_id,               -- 續約的下線
    p_amount  => coalesce(v_reward_amount, 100),
    p_claim_id => p_reward_id,             -- 冪等鍵綁這次 claim
    p_description_tag => '・任務續約');
exception when others then
  perform public.log_system_alert('claim_referral_king_reward', 'warning', sqlerrm,
    jsonb_build_object('user_id', p_user_id, 'reward_id', p_reward_id, 'step', 'referral_cascade'));
  raise warning 'claim 續約推薦獎勵失敗（續約已完成，reward_id=%）: %', p_reward_id, sqlerrm;
end;
```

發獎只在**首次** claim 成功分支跑（已 claimed 提早回傳），加 `source_claim_id` 冪等雙保險。**每次任務續約 = 上線鏈進帳 300P**（見風險 §8）。

### 4.7【複審 C】`repair_orphaned_payments` + claim 對帳
- 付款路徑 repair 維持，並改呼叫共用發獎函數；**不需** s.is_renewal。
- **新增 claim 對帳 pass**：找 `status='claimed'` 但缺對應 `source_claim_id` 獎勵的 credit，補呼叫 `pay_referral_generations`。補上 claim 路徑原本沒有的自癒能力。

---

## 5. Edge / 前端改動

### Edge（`supabase/functions/api/index.ts`）
- `/tasks`、`/tasks/current-month-top`、`/tasks/pending-rewards`：計數語意＝「distinct 新人數」；支援列出**多張** unclaimed credit（查詢補 `round_ordinal` 排序）。
- `/tasks/claim-reward/:id`：簽名不變，底層 RPC 現在有對外發獎副作用。

### 前端（React）
- `MonthlyKingProgress.tsx`：列表＝新人清單；「溢出機制」文案改為「每滿 8 位新人得一張、可累積多張」（後端追上，不再超額承諾）。
- **【複審 E】** `PendingRewardsSection.tsx` / `ClaimRewardDialog.tsx`：支援「**驗證一次、批次領取全部待領 credit**」，避免每張都要重跑身分證驗證；`SubscriptionStatusCard` 明確顯示「累計延展至 20XX 年」讓年份堆疊可被理解。
- `RewardHistory.tsx`：顯示任務續約獎勵新 description（第 N 代・任務續約）。
- `ReferralGuide.tsx` / `TaskGuide.tsx`：把「何時 +1 / 何時 100P」與 pair-history（換線／換回）規則講白。

---

## 6. 測試矩陣（實作時先寫，走 TDD red-first）

| 測試檔 | 動作 | 說明 |
|---|---|---|
| `process-payment-reward-repeats-on-renewal.test.ts` | **不改** | 只驗「續約仍發 100P」，未驗 task，新規則下仍成立。 |
| `referral-king-reward.test.ts` | **反轉** | 現行 `:113-118` 斷言「claim 不動 reward」；改為「claim 對上線發 gen1/2/3 各 100P、冪等重放不加倍」。 |
| （新）`task-new-downline-only.test.ts` | 新增 | 首購 +1；同上線續約不 +1；`monthly_referrals` 該月只含一次該 UUID。 |
| （新）`task-rewire-pair-history.test.ts` | 新增 | **B→C→B**：B 首購 +1、C 換線 +1、換回 B **不** +1（對應決策⑥ / 你的例子）。 |
| （新）`king-multi-credit.test.ts` | 新增 | 單月 8/16/24 新人 → 1/2/3 張；`round_ordinal` 遞增；重放不重複；append 成功但 king 首發失敗後，下一次付款自癒補上。 |
| （新）`claim-cascade-reward.test.ts` | 新增 | 任務續約 → 上線鏈三代各 +100P；`source_claim_id` 正確；重複 claim 冪等、不 +1 task；repair 能補漏發。 |
| （新）`king-credit-stacking.test.ts` | 新增 | 連續/併發領多張 → 效期逐年堆疊（訂閱列鎖序列化不吃年份）。 |

---

## 7. 上線與資料遷移
- **不回溯**（決策⑤）：既有 `monthly_referrals` 續約重複條目、既有 king credit（每月一張）維持；`round_ordinal` 補 1。
- 建議套用順序：4.1 共用函數 → 4.2 欄位 → 4.3 多張 credit →（4.4/4.6 覆寫函數）→ 4.7 repair。
- **rollout 時機**：計數語意在切換當月會是「舊 append 重複 + 新 distinct」的混合月；建議於**月初邊界**部署，或接受一個過渡月。

---

## 8. 風險與注意事項

1. **成本面（非工程）**：任務成功續約會讓上線鏈進帳 300P，但這筆續約**零營收**；付款續約也每年重複發三代。屬決策 1-B/2-A 的必然，建議營運端對此非對稱有數字預期。
2. **弱去重是安全的（複審下修）**：Block B 只在 pair-history 判定「新下線」時觸發，而首購與換線都是一筆 **1200 元真實付款**——**每個 task+1 都對應一筆 1200 付款**。多帳號刷 8 位＝花 9600 換一張價值 1200 的免費續約，經濟上不划算；整鏈自付自收仍平台淨正。故綁 UUID（決策④）足夠，不需綁身分字號。
3. **邏輯單一真相（複審 A）**：三代發獎收斂到 `pay_referral_generations`，杜絕「claim 與付款兩份複製漂移」——這正是本 repo 踩過三次的坑。
4. **pair-history 掃描成本**：每筆付款掃上線整份 `monthly_referrals` 做 `@>`。單列 jsonb，通常數 KB，可接受；若未來出現超大推薦樹，再考慮加一個扁平 `counted_referees` set 或側表加速（選配）。
5. **多載/相依**：本版**不改** `apply_referral_side_effects` 簽名（pair-history 取代 is_renewal），省去 drop-overload；但新增 `source_claim_id`、`round_ordinal`、兩支輔助函數，須按 §7 順序套用。
6. **UI/後端一致性**：順帶消除「UI 多輪承諾 vs 後端每月一張」既有落差；上線需前後端同步部署。

---

## 附錄 A：現況追蹤（關鍵引用）
- 付款路徑：`process_successful_payment` → `apply_referral_side_effects`（`20260720000001_wave4_guards.sql:383-497`、`:172-375`）。
- 續約模式錨點：`renewal_mode`（`20260716000008_renewal_modes.sql`）、`/payuni/prepare`（`index.ts:1142-1200`）。
- 任務成功續約：`claim_referral_king_reward`（`20260721000005_claim_blocks_suspended.sql`）。
- 推薦王表/門檻：`20260716000005_referral_king_rewards.sql`、`reward_config`（`20260719000002`，門檻 8、獎金 100）。
- 任務讀取/顯示：`/tasks`、`/tasks/current-month-top`（`index.ts:2319-2500`）、`MonthlyKingProgress.tsx`。
- 身分欄位：`profiles.national_id`（`20260620000007:22`，無唯一約束）。
