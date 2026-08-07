# fresh 換線後 repair 函數回溯補發歷史事件獎金（issue #167）修復紀錄

分支:`fix/repair-retro-rewards`|重現測試(紅燈 commit):（待補）

## 1. 症狀與重現

- issue #167:原本**無推薦人**的會員,經 `/payuni/prepare` fresh 模式填一次
  真實推薦碼後,**過去所有訂閱**都會在下次載入 profile 時（
  `repairOrphanedPaymentsBestEffort`）回溯補發三代獎金給新推薦人。
- 重現測試:`api/repair-retro-rewards.test.ts`（需 DB,CI api-tests 為
  紅綠 oracle——沙箱無法起本機 supabase,沿用 renewal-backfill 慣例）。

## 2. 根因

**機制層**:兩支自癒函數的候選判準用「`profiles.referred_by_user_id`
的當下值」回答「這筆**歷史事件**當時該不該發獎」——把「現在有推薦人」
誤當成「當時有推薦人」。時間軸資訊在資料模型裡根本不存在（profiles
沒有 referred_by 的變更時間,referral_edges 會被 fresh rewire 原地覆寫),
所以候選查詢**想寫對也寫不出來**——這是資料模型缺口,不只是查詢寫錯。

**為什麼當時沒被發現**:repair 的測試都從「關係先存在、獎勵後補」的
方向寫;「關係後補、事件先發生」的反向從未入鏡。且觸發需要跨兩個
feature 的組合（fresh 換線 × 自癒重試),單一 feature 的驗收都不會撞到。

**加重因素（prepare 視窗）**:`/payuni/prepare` 的 W3 在**付款前**就寫
`profiles.referred_by_user_id`(index.ts:1825-1833/1874-1876)。因此就算
用 referral_edges 的時間當判準也堵不住——填碼與付款完成之間的視窗內,
profile 已換線、邊還沒建,期間任何一次 profile 載入都能觸發回溯補發。

## 3. 同類掃描

- 根因抽象成的 pattern:**用可變欄位的當下值回答歷史問題**（
  point-in-time 判準缺失）。
- 掃描方式:grep 全部 migration 中 `referred_by_user_id is not null` 的
  消費者;audit 三支 repair 函數的候選查詢;grep index.ts 全部
  `referred_by_user_id` 寫入點。
- 結果:☑ 找到——一併修:
  1. `repair_orphaned_payments`(20260720000001:516-)——issue 本體。
  2. `repair_orphaned_claim_rewards`(20260724000006:42)——**同病灶**:
     無推薦人時 claim 過 King reward 的會員,換線後歷史 claim（
     `source_claim_id` 冪等鍵缺列）同樣被回溯補發。本次一併修。
  3. `repair_orphaned_forfeitures`(20260802000002)——讀快照不讀當下值,
     **無此病**（快照設計正是這個 pattern 的正解,反向印證根因）。
- 記債（開放問題,不在本次修）:**prepare 在付款前變更身分狀態**本身是
  同根因的更深症狀——fresh 訂單**棄單**後推薦關係已被改走(下次任何
  付款的獎金歸新推薦人,但換線的對價「新約付款」從未發生)。此行為是
  #187 規劃（W3 改法 B）人審通過的設計取捨範圍,不在 fix 裡私改;列
  開放問題請人裁決是否另開 feature 調整（見 §7）。

## 4. 四面向審視

| 面向 | 檢視結論 |
|---|---|
| 系統 | 修法選「補時間軸 + repair 端閘門」:profiles 加 `referred_by_changed_at`,由**觸發器**維護（所有寫入點自動涵蓋,含未來新增的),兩支 repair 候選查詢加「關係變更時間 ≤ 事件時間」閘門。不動 `apply_referral_side_effects`/`pay_referral_generations`（金流熱路徑,誤傷面大）;付款當下的正常發獎不經此閘門,行為不變。 |
| 架構 | 資料模型缺口的**最小補全**,非架構重構。曾評估「W3 延後到付款成功才寫」(能同時修掉棄單殘留),但那會推翻 #187 人審通過的 W3 設計與 A16 守衛順序——超出 fix 授權,列開放問題。 |
| UIUX | 不適用（無 UI 面;使用者不會察覺,只是不再收到不該有的回溯入帳）。 |
| 需求 | 規格書 §8.2 已定義「獎勵綁下線付款**事件**」,本修法是讓實作回歸既有規格,非新規則。追認條款:legacy 列 `referred_by_changed_at` 為 null → 沿用現行為（避免誤殺既有真孤兒的自癒）;變更時間晚於事件 → **寧漏發交人工**（與 forfeitures「寧少沖」同一取向）。 |

## 5. 修法

1. Migration `202608xx_referred_by_changed_at.sql`:
   - `profiles` 加 `referred_by_changed_at timestamptz`（legacy 為 null）。
   - BEFORE INSERT/UPDATE 觸發器:`referred_by_user_id` 實際變動
     （`is distinct from`）時寫入 `now()`。同交易內 `now()` 一致,故
     「付款交易內套預設推薦碼」的 changed_at == completed_at,閘門放行。
   - `repair_orphaned_payments` 重建（基準 = 20260720000001 版,唯一差異
     = 候選查詢頂層加 `and (pr.referred_by_changed_at is null or
     pr.referred_by_changed_at <= po.completed_at)`——頂層而非只加在
     referred_by 分支,因為 (a) 缺碼分支的候選同樣會被 apply 補發獎金）。
   - `repair_orphaned_claim_rewards` 重建（基準 = 20260724000006 版,
     唯一差異 = `and (pr.referred_by_changed_at is null or
     pr.referred_by_changed_at <= rkr.claimed_at)`）。
2. 閘門語意:換線後的**新**付款（completed_at ≥ changed_at）照常可自癒;
   只有「事件早於現任關係」的組合被排除。prepare 視窗也被涵蓋（視窗內
   changed_at 已是未來式,任何歷史事件都 > 不等式右邊）。

## 6. 防線回填（為什麼沒被攔到）

- 測試缺「反向時間軸」案例 → 本次紅燈測試即防線,長駐 api-tests。
- 根因層面（可複用教訓,收尾時升級 friction-log）:**自癒/補償類函數的
  候選判準必須用事件當時的事實,不能用可變欄位的當下值;資料模型沒有
  記「當時」就先補時間軸再寫自癒**。forfeitures 的快照設計是正例。

## 7. 開放問題（求人裁決,不阻塞本 fix）

- fresh 訂單**棄單**後 `referred_by_*` 已被 prepare 改走,是否應改為
  「付款成功才生效」(W3 延後)?影響:#187 的 W3 設計、A16 守衛順序、
  `/profile` 的 isAutoReferral 顯示時機。建議另開輕量規劃討論。
