# 金流收尾（payment-closeout）規劃書審查報告

<!-- plans-keep: 第 7 波 S4 施工鷹架；退場條件＝/tdd-implement 收尾、PR 合併前刪除 -->

輸出契約與聚合規則見 `docs/_templates/review.md`。本檔只彙整、去重、排序，不改判。

## 第 1 輪（plan r1）

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 1 | 4 | 4 | migration 回滾、RLS／grant、雙向部署相容、Q3 判斷 |
| 架構 | 0 | 3 | 4 | 模組邊界、單一 Edge 慣例、新函式 vs 擴充、部署相容、測試落點 |
| UI/UX | 0 | 2 | 4 | 三態、BottomNav、行動版、a11y（無前端）；單號完整落在前 60 字 |
| 需求 | 0 | 3 | 6 | 溯源、驗收可測、不做清單、Q1／Q2／Q4 確需裁決 |

### 發現清單（依嚴重度；括號內為提出視角，重複者合併）

**P0**

1. 〔§7、§2.2〕（系統）§7 前提錯：`process_successful_payment` 已把 `apply_referral_side_effects` 包在自己的 `when others`（`20261117000001:333-339`），
   新告警函式在 3b／3d handler 內擲錯不會讓付款回滾，而是**整個 `apply_referral_side_effects` 子交易回滾**——3c 三代獎金與 3a～3d 一起靜默消失、只剩 warning，
   違反驗收 #2。`log_system_alert` 本身已吞錯（`20260716000004:58-59`），真正會擲錯的是新函式自己的拼接（`||` 遇 null → message null → not null 違反被吞 → 告警靜默遺失）
   → 重寫 §7；新函式每段 coalesce、整個本體包 `exception when others`；測試涵蓋「反查失敗／null 參數仍寫告警」「新函式擲錯時 3c 獎金仍在」。

**P1**

2. 〔§2.2〕（系統）3b／3d error 沒去重：`/profile` 每次載入跑 repair，持續失敗會每次一筆 LINE → 以 source＋step＋subscription_id＋`resolved_at is null` 去重。
3. 〔§2.4〕（系統）單筆開通失敗告警沒去重，heal 每輪重試即每輪一則 LINE；source 與金額不符共用，去重鍵要能區分（context 加 `kind`）；回查 `payment_orders` 包子交易＋coalesce。
4. 〔§2.1〕（系統、需求 P2-3、需求 P2-6）drop 前提只引 reconcile 217 輪，未證 `/profile` heal 與 notify／return 也是新 Edge；README:72 退場條件是 `/health` sha
   → 以兩環境 `/health` sha 為 gate 寫進 PR；`track_functions` 未開時 `pg_stat_user_functions` 回空不能當證據，改以全庫 grep＋`pg_depend`／`cron.job` 內文補強。
5. 〔§2.1、§5 階段 1〕（架構）測試呼叫點的行號與數量不準（`renewal-referrer-intent` 實為 683／697／729、`referral-reward-failure-alert` 為 256、`subscription-period` 為 192、
   `complete-paid-pending-orders` 約 9 處）；註解清單漏 `test-helpers.ts:82` 等 → 以測試名定位、分「呼叫／source 字串／註解」三類列完整清單。
6. 〔§2.3、§5 階段 4〕（架構、系統）未列出以 null 呼叫 repair 的既有測試；三支 `create or replace` 要照抄 security definer／search_path／grant；
   guard 放迴圈前；Edge 側 `userId` 為空時 supabase-js 會省略參數＝null → 加 guard 或測一條。
7. 〔§2.2〕（架構）防線只靠被呼叫端；呼叫端 handler 內再包一層 `begin…exception … raise warning` 作雙保險；測「`log_system_alert` 擲錯時付款與 3c 仍完成」。
8. 〔§2.2、§2.4 文案〕（UI/UX）前 60 字只靠人工數 → 測試斷言 `message.slice(0,60)` 同時含 trade_no 全文與「請開 Claude」，含「查無單號」分支。
9. 〔§2.2、§2.4 手冊〕（UI/UX、架構 P2）文案引用的三個 README 小節現不存在、標題是跨文件契約 → 階段 5 加測試比對標題存在；
   每節固定寫「何時看到（附前 60 字範例）、先讀哪些 context 鍵、完成後怎麼確認、哪些步驟動資料要先回報業主」。
10. 〔§2.2 手冊、Q2〕（需求）「任務 +1 不會自癒」與 §9.2 不符：3d 子交易回滾時 pair-history 也回滾，R 下次付款會以較晚月份補計 → 手冊先查 `referral_pair_history` 與當月
    `monthly_referrals`，已有就不補，避免雙計與多發推薦王 credit；Q2 理由改寫。
11. 〔§2.2〕（需求）未寫新告警的 source／step：沿用 `apply_referral_side_effects` 會混進〈補發漏發獎金〉第 1 步的撈取；`system-alerts.test.ts:45-46` 釘 `task_king`
    → 明寫 source、step 沿用，README 第 1 步分流。
12. 〔§2.5、§1 不做〕（需求）規格書 993 行「含批次自癒期間」與後台 `LedgerAuditSection.tsx:147`（`ReferralAuditSheet.test.tsx:675-688` 釘字）在 drop 後失真，與 P2-8 同源，
    但 §1 寫「不做任何前端」→ 補列並由業主裁順修或留第 8 波；規格書沒有 3b／3d 的描述，是新增不是同步；§9.1「計數自癒」措辭對齊。

**P2**

13. 〔§2.3〕（系統）無環論證的前提是推薦資料本身無環；守衛只在發獎時擋 → 寫成明確前提；`claim_rewards` 的 `order by` 註解在關全量後成死碼，檔頭註明。
14. 〔§2.2〕（系統）step 值必須沿用 `referral_edge`／`task_king`。
15. 〔§2.2 文案〕（系統）推薦碼要以 `v_referrer1` 反查，不是付款人自己的 `v_code_id`。
16. 〔§2.5〕（系統）規格書 severity 實際 grep 並記錄結果。
17. 〔§2.1〕（架構）source 歷史名也寫進 README 告警來源處，不只檔頭。
18. 〔§2〕（架構）與 S2 先約定 migration 版號區間。
19. 〔Q1～Q3〕（架構）Q3 若採納，§1／§2.2／手冊都要擴；Q 標預設值、階段標依賴哪個 Q。
20. 〔§2.2、§2.4 文案〕（UI/UX）前 60 字在 3b／3d 把後果句擠掉（3b 斷在「一代二」）→ 縮短後果句或調整前綴。〔需人工裁決〕
21. 〔文案〕（UI/UX）三則 message 與 README 新節做 W5-53 禁詞掃描。
22. 〔§4〕（UI/UX）後台告警頁對 120～160 字 message 的顯示，實作時目視確認。
23. 〔Q3〕（UI/UX）若升 3a-bis，補同格式文案與前 60 字斷言。
24. 〔Q3 理由〕（需求）§7.4：fresh 續約未填碼也會套預設推薦人，不是「永久」→ 改「要到下一次 fresh 續約才可能補上」；並寫明這是派工範圍外的追加。
25. 〔Q1〕（需求）A 案偏離派工字面「改逐筆」，PR 內文明講；Q1 加一句「A 不改變單人多筆同交易」。
26. 〔§2.2 文案〕（需求）兩句新標題是新造的使用者文案，列入業主審。
27. 〔§1 驗收 #2、#4〕（需求）明定「無 sqlerrm」是整則 message；`<reason>` 取固定分類字串。

### 需人工裁決

- （架構）§2.3「單人路徑不成環」——架構視角未獨立驗證，系統視角判「大致成立」（見 13）。
- （系統）P0-1 處置方向：新函式內加防護（規劃採用），或改在 handler 外延後寫告警（結構保證但改動大）。
- （UI/UX）20：前 60 字放「請開 Claude」與放後果句的取捨（W6-24 原意是放行動）。
- （需求）沙箱讀不到 wave-7 dispatch-prompts，S4 段由主 session 對一次——規劃 session 已讀過正本，r2 §1 以其為準。

### 第 1 輪處置

P0 1 與 P1 2～12 全數修進 plan r2（見 plan 各節「r2」標記），P2 13～27 除需裁決者外一併修。重跑 /review-plan（第 2 輪）。

## 第 2 輪（plan r2）

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 4 | 6 | P0 三層防線已真正處理；repair guard、鎖序（前提資料無環）、前 60 字重算、部署相容、回滾 |
| 架構 | 0 | 1 | 3 | 第 1 輪 P1-5／6／7／9 已處理；模組邊界、部署相容、版號約定、階段依賴、文件生命週期 |
| UI/UX | 0 | 0 | 3 | 第 1 輪 P1 已處理；四則文案前 60 字實算 58／55／58／59 全吻合、無禁詞 |
| 需求 | 0 | 1 | 3 | 第 1 輪需求面 P1 全處理；範圍、溯源、可測性、開放問題品質 |

**P1**

1. 〔§2.2〕（系統）新函式沒寫 revoke：security definer 預設 EXECUTE 給 PUBLIC，任何人可灌 error 推 LINE → 明寫 revoke＋anon 被拒測試。
2. 〔§2.4-1〕（系統）「例外早於 v_row 時回查」會踩 55000（record 未指派）被吞＝告警遺失 → handler 一律以 `p_order_id` 回查，測「select 就擲錯」。
3. 〔§2.4〕（系統）open_failed 對暫時性失敗永不自動 resolve，業主會去查已開通的單 → 成功開通時自動標處理，或手冊先查 pending。〔需人工裁決〕
4. 〔§2.1 gate ②、Q4〕（系統）`pg_depend` 不登記 plpgsql 本體呼叫 → 加 `pg_proc.prosrc` 檢查。
5. 〔§2.4、檔頭慣例〕（架構）§2.4 改兩處，「唯一差異」名不符實；未寫明基準之後無重定義；缺舊格式金額不符告警的相容測試 → 檔頭編號列差異、實作第一步 rg 掃重定義、補測試。
6. 〔§1、Q3、§5〕（需求）Q3 預設「升」把範圍外的 3a-bis 帶進來卻無驗收／測試／文件承載 → 預設改不升，或採升時補齊。〔需人工裁決〕

**P2**

7. （系統）`when others` 不捕 57014／assert_failure，「永不擲錯」措辭過頭 → 記為已知殘餘。
8. （系統）去重鍵 subscription_id 為 null 時失效 → `is not distinct from`／退回 user_id。
9. （系統）金額不符去重 `coalesce(kind,'amount_mismatch')` 會把舊開通失敗列誤歸類 → 改 `kind='amount_mismatch' or context ? 'trade_amt'`。
10. （系統）同單並發 heal 可能偶發雙推 → 接受（heal 每輪序列）。
11. （系統）去重只留第一次 sqlerrm → 手冊寫取當下錯誤的方法。
12. （系統）repair guard 其餘無缺口（記錄性）。
13. （架構）README 標題測試不需 DB，拆 `*.unit.test.ts`、路徑以 `import.meta.url` 解析、整行比對。
14. （架構）Q5 不採時階段 5 整段刪；與規格書同句放同一 commit。
15. （架構）分類字串兩處實作 → 抽共用小函式。
16. （UI/UX）階段 3 也要斷言 `slice(0,60)` 含「請開 Claude」與後果、含查無單號分支。
17. （UI/UX）3d 多半核對後只需標處理 → 手冊與 Q2 講清楚。〔需人工裁決：Q2 已交業主〕
18. （UI/UX）Q5 刪半句注意標點殘留與測試名。
19. （需求）手冊 `reconcile_king_credits` 門檻從 `reward_config` 取。
20. （需求）§2.5「§2.2 的新段」歧義 → 寫明規格書 §8.3。
21. （需求）Q6 預設依賴手算字數，由測試兜底（備註，不需改）。

**需人工裁決**：3（→ plan Q7）、6（→ Q3 預設已改「未明確回覆則不升」，建議仍為升）、17（→ Q2）；架構仍未獨立驗證 §2.3 單人不成環（系統兩輪皆判成立）。
第 1 輪的 20（前 60 字取捨）已由 r2 改寫文案消解（行動與後果都在 60 字內），非裁決。

### 第 2 輪處置

無 P0，依 skill 停等人審。P1 1～6 與 P2 7～9、11、13～16、18～20 已直接修進 plan r3（小幅、未改設計方向）；10、12、21 不改。未重跑第 3 輪：r3 只收斂細節、無 P0，交人審時一併看。

## 處置（人審後填寫）

- [x] 人審完成，裁決：□ 通過 ☑ 修訂後通過（業主 2026-11-25 於本 session 親打 `/tdd-implement payment-closeout` 後，互動選項：「修訂後通過」——r3 收斂第 2 輪 P1、未重跑第 3 輪由業主知悉接受；Q1～Q7 依 W7-9／W7-10／W7-12） □ 退回重規劃
