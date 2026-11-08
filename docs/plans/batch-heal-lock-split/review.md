# 批次自癒與線上付款互鎖 規劃書審查報告

<!-- plans-keep: 第 6 波 S1 施工鷹架；退場條件＝/tdd-implement 收尾、PR 合併前刪除 -->

審查對象：`./plan.md`（commit 5c23282）。四個 fresh-context reviewer 平行審查；本檔只彙整、去重、排序，severity 照 reviewer 原判。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 3 | 5 | §2.1 子交易／procedure／PostgREST 敘述正確；§2.4 新舊 Edge × 新舊 migration 四組合相容；§2.7 cron drop＋create 安全；冪等與重複開通 |
| 架構 | 0 | 4 | 4 | 方案 A 模組邊界；與 S6 撞檔面積；無前端 |
| UI/UX | 0 | 3 | 2 | 無畫面；會員端 `/payuni/result`、`/profile` 無可見變化（多 1～2 次往返） |
| 需求 | 0 | 3 | 4 | 必答四項都答到；無腦補；§8～§9 規則未改壞；不做清單明確 |

## 發現清單（依嚴重度排序）

### P1

1. [P1]〔§2.2 單筆函式〕（系統）`uknow.rewire_try_lock` 的設／清歸屬沒定義：照搬「結尾清旗標」會讓 wrapper 第 2 筆起改走阻塞等鎖（舊 Edge 期間重現 W5-61）；單筆 RPC 不設旗標則與「維持 skipped_locked」矛盾 → 單筆函式開頭一律設 on、結尾不清；測試覆蓋「wrapper 多筆時第 2 筆仍 try」。
2. [P1]〔§2.2〕（系統）單筆函式沒有 `lock_timeout`，Edge 迴圈總時間無上界，會吃掉 pg_net 150 秒與租約 → 單筆內 `lock_timeout` 3s、`55P03` 記 `skipped_locked`；`healPaidPendingOrders` 加整體時間預算。
3. [P1]〔§5 階段 1〕（系統）紅燈用 `complete_paid_pending_orders(null)` 全域掃描，會吃到其他測試殘留的待開通單 → 隔離資料、或 list 加測試用使用者過濾、或序列執行＋清理。
4. [P1]〔§2.5／§3〕（架構）`apply_referral_side_effects` 的基準沒寫；最新定義在 `20261113000003:481` → migration 檔頭逐支列「基準＝X，唯一差異＝Y」（pay_referral_generations＝`000001`；apply／complete_paid_pending_orders＝`000003`；scheduler_health／invoke_internal_endpoint＝`20261112000001`）；並寫明 S6 動 `process_successful_payment` 的基準是 `000003`。
5. [P1]〔§2.6／階段 4〕（架構）`scheduler_health()` 是兩個 job 共用迴圈，streak 的「連續」定義未寫（排除哪些 error_code、只算 pg_cron 否、掃描上限、舊列缺 `heal` 鍵算不算中斷）；purge-photos 為 null 或不出現；fixture 共 10 檔不只 shape.json；測試應放既有 `scheduler-health.test.ts` → 補四點定義與分檔。
6. [P1]〔§2.6／Q2(b)〕（架構）看門狗新規則與 `decide_reconcile` 結構不合：heal 連續出問題不該觸發補跑；沒有規則編號與 self-test 情境；與 `alertOnce` 可能重複推 → 定規則編號（如 R5b）、「補跑＝否、LINE＝是」、self-test 兩列；只讓一層負責「整支失敗」。〔需人工裁決：重複告警分工〕
7. [P1]〔§2.2／§2.6／階段 3〕（架構）`handleReconcile` 的 `heal` dep 契約改變，影響面沒列全（`reconcile-outcome.unit.test.ts:77` mock、`ReconcileSummary` 型別、alertOnce 去重鍵）→ 寫明新 dep 簽章、型別、list 失敗時的回傳形狀與要同步的測試。
8. [P1]〔§2.5〕（UI/UX）告警訊息沒有「下一步」，也沒定前 200 字放什麼；trade_no／收獎者在 context，LINE 上看不到 → 補訊息範本（第幾代、收獎推薦人、單號、下一步），測試斷言前 200 字含「下一步」。
9. [P1]〔§2.5〕（UI/UX，系統 P2-e 同源）訊息承諾「會員下次載入個人頁會自動補發」未核實；`repair_orphaned_payments` 依付款人補，付款人可能久不上線 → 核實補償路徑與時限，否則改「請人工確認」。〔需人工裁決〕
10. [P1]〔Q2／§2.6〕（UI/UX）看門狗 streak LINE 的 body、下一步、節流未定義；`skippedLocked` 連續不推 LINE，若代表卡單則無告警 → 補範本與節流；〔需人工裁決：skippedLocked 連續要不要推〕
11. [P1]〔§2.6 對 Q2〕（需求）Q2 未裁，§2.6 卻已把 heal 整支失敗 alertOnce 寫成定案 → 改「依 Q2」，最小集與增量分開寫。
12. [P1]〔§2.6／上游 P2-8〕（需求）`healSkippedStreak`、看門狗 LINE、推翻 W5-18 都超出 P2-8 原文 → 明列為擴張範圍，Q2 加「只做 P2-8 原文（summary＋healIssueStreak、不加 LINE）」選項。
13. [P1]〔§2.2 後半〕（需求）per-user 路徑（`/payuni/result`、`/profile`）改逐筆 RPC 是行為變更，無驗收、理由是推演（系統 P2-b 指出推演本身不成立）→ 補驗收（同一人兩張單、單筆失敗不拖累、`data.heal` 同形）與延遲說明，或切成 Q。

### P2

14. [P2]〔§2.3〕（系統）跨人鎖清單不完整：3b `referral_edges`、3d `referral_pair_history`／`task_progress`、0d 的 profiles／edges 寫入也對推薦人取 KEY SHARE → 照實列出，補不變式「跨人鎖只往推薦人方向取」。
15. [P2]〔§2.2 末段〕（系統）per-user 成環例子推導不成立（R 會先被擋在 `profiles(R)`）→ 理由改「一致性與縮短持鎖」。
16. [P2]〔§2.2〕（系統）兩支新 definer 函式的授權寫法要明確（revoke anon／authenticated／public＋grant service_role）→ 寫明並加 anon 不可呼叫的斷言。
17. [P2]〔§5〕（系統）死鎖受害者不固定 → 紅燈斷言「兩筆第 1 代缺一筆＋出現 40P01」；輪詢用 `pg_blocking_pids`；明設 `deadlock_timeout`。
18. [P2]〔§2.7／階段 5〕（架構）改簽章要同步 `security-definer-grants.test.ts`／`rls-policies.test.ts` 類清單，兩支新函式也要過 → 階段 5 一併驗。
19. [P2]〔§5 階段 1〕（架構）雙連線 helper 複用 `payment-user-lock.test.ts`／`process-payment-concurrency.test.ts` 做法；測試名照 T1/T2；CI 時間敏感度要寬鬆上限。〔需人工裁決：flaky 風險〕
20. [P2]〔§2.5／階段 6〕（架構）規格書 §8.3 L549 以外、`supabase/README.md` 三處引用也要同步；check-spec-drift 不涵蓋這段，靠人 → 階段 6 明列。
21. [P2]〔§2.2／§3〕（架構）`paid-pending-heal.ts` 的 `rpc` 用最小介面型別；`healPaidPendingOrdersBestEffort` 留 index.ts 或搬出要定案。
22. [P2]〔§2.4〕（架構）wrapper 註解寫退場條件（哪一波可 drop）。
23. [P2]〔§2.5〕（UI/UX）一筆付款三代可能各推一則 → 確認去重鍵（trade_no＋代數）。
24. [P2]〔§4〕（UI/UX）用語只寫「照 W5-53」，規劃內文用了「上線」→ §4 列告警範本，測試斷言不含禁用詞。
25. [P2]〔§1 驗收 5／階段 5〕（需求）沒驗 manual 不刷新 `lastPgCronCompletedAt` → 階段 5 加斷言。
26. [P2]〔§7〕（需求）正式站查詢沒編進開放問題 → 列 Q4（誰、何時代跑）。
27. [P2]〔§2.6〕（需求）streak 門檻、上限、小時桶等營運參數要有單一出處。
28. [P2]〔§2.5／Q1〕（需求）「所有非預期錯誤」可能因資料問題每次付款都推 → Q1 補預期量與去重方式。

## 需人工裁決

- Q1～Q3（plan §6）及新增：#6 重複告警分工、#9 補發承諾措辭、#10 skippedLocked 連續要不要推 LINE、#19 死鎖測試 flaky 風險。
- 系統 reviewer 另提：金額不符的卡單永遠 pending、會讓 `healIssueStreak` 無限累積並佔 limit 50 的前段（既有問題，加 streak／LINE 後會變「永遠警報」）→ Q2 裁決時一併決定是否排除 `amount_mismatch`。
- 需求 reviewer 未能讀主 session 分支上的 W6-8 原文（無 Bash），W6-8 逐字比對由人做一次（規劃 session 已讀過，plan §0 依據即該段）。

## 處置（人審後填寫）

- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：） □ 退回重規劃
