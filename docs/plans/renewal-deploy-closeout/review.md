# 新約與部署收尾（第 6 波 S6）規劃書審查報告

<!-- plans-keep: 跨 session 施工鷹架；退場條件＝/tdd-implement 收尾時刪除 -->

審查對象：`plan.md` v1（bf501623）。四個 fresh-context reviewer 平行審；本檔只彙整、去重、排序，不改判。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 2 | 4 | 鎖序不變；現任＝預設時 0d 寫回同一人無副作用（changed_at／edges 皆不動）；D 延後判斷正確；step 位置與 timeout 算式 |
| 架構 | 0 | 3 | 3 | 單一 Edge 邊界；規則 14 編號與註冊慣例；階段 1～4 測試落點 |
| UI/UX | 0 | 3 | 3 | 行動版；確認鈕規則；用語 |
| 需求 | 0 | 3 | 4 | A、B、C、E 皆可溯源；「不做」清單明確；A1～A3、C1 可測 |

## 發現清單（依嚴重度排序；同題合併並標來源）

### P1

1. **〔§2.5 E 比對範圍〕全量比對「repo 每支 migration 都在遠端」可能讓部署永久紅**（系統、架構、需求三方皆提）。正式站歷史有手動套用後改檔的漂移（`journey.yml:88-117`、`friction-log.md:2296-2310`）；develop 是 replay 出來的，develop 綠不代表正式站綠，第一次 main 部署才會爆。→ 開工前唯讀實查兩環境 `schema_migrations` 與 repo 差異；腳本加基線截斷（只比某版本之後）或明示豁免清單（附退場條件）；PR 未驗項列「正式站首次部署」。
2. **〔§2.5 E／階段 5〕輪詢與錯誤分類寫在 bash，`--self-test` 測不到，卻宣稱 E1～E3 以表格覆蓋**（架構、需求）。→ 由 Python 負責 fetch、分類（讀不到／缺版本／齊）、重試、退出碼，fetch 與 sleep 可注入；表格案例含 401、5xx、格式不符、第二輪才齊；workflow 只呼叫一次。
3. **〔§2.2 B Q1-a〕0d 改驗單上碼缺三件事**（系統）：① `fresh_referrer_code` 為 null 的 default 單會被誤判 `fresh_referrer_invalid`，要定處置；② a 案下 `referred_by_code` 寫舊預設碼，規格書 §7.4 要寫明；③ 告警分句多讀 `reward_config` 在子交易 `exception when others` 內，讀失敗會被吞成 `fresh_rewire_failed`，B2 不成立。另補「預設碼被清空（unset）時在途單仍綁舊預設推薦人」案例，Q1 要讓業主知情。
4. **〔§1.1 A／§2.1〕第三態本身等於揭露「你的推薦人是不是預設推薦人」**（UI/UX）。知道自己推薦人碼的會員可反推預設推薦人身分；規格書 §7.4（`:503-504`）寫「機制對使用者不揭露」，範圍比 plan 的「不出現姓名或碼」寬。〔需人工裁決〕W5-63 的「不揭露」是否只管姓名與碼；是 → 寫進 §7.4；否 → 改中性句。
5. **〔§2.1 placeholder〕第三態仍顯示「目前：碼」與同頁 `PaymentCheckout.tsx:362`、`:975` 的隱藏規則衝突**，且付款後 `referred_by_is_default` 翻 true 就不再顯示；該碼恰是預設碼的實際值（UI/UX）。→ 第三態一律不顯示「目前：碼」，或裁決並在 §2.1 列三處判斷表。
6. **〔§2.1 後端〕新增的 `profiles` 讀取用 `must()`，失敗整支 500，一行文案的讀取可卡死整個續費結帳**（UI/UX）。〔需人工裁決〕降級成 `undefined`（走 A3 今日文案）或維持 #360 的整支 500 並在 §4 補錯誤態。
7. **〔§2.1 末段／§7〕「填碼者剛好填到預設推薦人」付款後 `referred_by_is_default` 變 true，結帳頁不再顯示「目前：碼」——使用者可見、W5-63 未要求、§7.4 未涵蓋**（需求）。→ 列開放問題請業主確認，或改成只在推薦人實際改變時才設旗標，並補驗收情境。
8. **〔§2.1／§3〕前端 `renewal` 回應型別的來源檔沒列進動點**（架構）：`freshRenewalCopy.ts` 不 import Deno 側契約，A3 的不回歸承諾缺型別落點。→ 查 `src/` 內 `RenewalInfo`／`@contract` 型別來源並列入 §3。

### P2

9. 〔§2.5〕job 層 `environment: production` 的核准在 job 之前，新 step 的結果要核准後才出現，不能取代核准前的 4a；4a 保留為核准前確認，新 step 是第二道防線（系統）。
10. 〔§2.5〕`journey.yml` 只打 `/branches`、`/config/auth`，未打 `database/migrations`，回應形狀未確認 → 腳本驗 schema、版本一律轉字串、self-test 加數字型別與分頁；退用 `database/query` 時「唯讀」不成立，Q4 要註明（系統）。
11. 〔§5 階段 4〕要改的測試逐支列：`renewal-referrer-intent.test.ts:240-250`（LEGACY）、`:499-512`（權限）、`prepare-payment-order.test.ts:35`、`:180`（三參數 raw SQL）、`duplicate-payment.test.ts:275`；`referral-pair-history.test.ts` 已是六參數不用動（系統）。
12. 〔§1.3〕status 讀到「現任＝預設」後、prepare 前後台換預設碼 → prepare 綁新預設推薦人、確認框已寫「維持不變」；與 #514 P2-3 同類，註明在同一個不處理視窗並寫進規格書（系統）。
13. 〔§2.4〕wrapper 退場條件只寫在 `supabase/README.md`，不回頭改已套用的 `20261115000001` 註解（避免與遠端語句漂移）；C 也不動 `20261113000002` 原文（架構）。
14. 〔§2.2／§2.3〕B、C 定案分兩支：`20261117000001`＝B、`20261117000002`＝C（架構）。
15. 〔§2.5〕寫明輪詢期間新 push 會因 `cancel-in-progress: true` 取消本次部署，屬預期語意（架構）。
16. 〔§2.1 文案〕寫出三態各自完整的 hint 與 placeholder 字串供逐字斷言；第三態 hint 刪掉「請填入他的推薦碼」，並處理「重新建立推薦關係」與「維持」的語意落差（UI/UX）。
17. 〔§7〕部署空窗（新前端、舊後端）時現任＝預設的會員仍看到「將改變」，風險段寫明（UI/UX）。
18. 〔§2.1 a11y〕`fresh-code-hint` 沒被輸入框 `aria-describedby` 指到（`PaymentCheckout.tsx:1237`、`:1284`），順手補（UI/UX）。
19. 〔§3 文件〕規格書 §7.4 `:487-488`「不填碼不等於維持原狀」與第三態矛盾，應無條件更新；`:504` 用語順修；§6.2 `:316-318` 句型清單與 `freshDefaultReferrerAvailable` 敘述要改（UI/UX、需求）。
20. 〔§2.2 Q1-a〕告警分句與 `current_default_code` 出自 R5 的「或」選項，B1／B2 驗收要等 Q1 裁決後才定稿（需求）。
21. 〔§2.5〕規則 14、`check-workflows.py`、timeout 15→25 是 W5-62 未要求的機械把關，請業主認可或列選配（需求）。
22. 〔§2.5〕W5-62 原 4a 還要求確認六參數 prepare 與 `referral_would_cycle` 存在；明寫 4a 退場範圍只限版本比對，或補函式存在檢查（需求）。
23. 〔§0／§1.1 D〕若 Q2 選 b，要補 D1 驗收情境（wrapper 不存在、heal 路徑不受影響）（需求）。

## 需人工裁決

- 第 4 項（第三態是否算揭露）、第 6 項（status 讀取失敗降級或 500）、第 7 項（`referred_by_is_default` 副作用）——業主題。
- 系統 reviewer 沒有 Bash，標〔需人工裁決〕「main 的 Edge 是否已用六參數版」：規劃者已用 `git show origin/main:supabase/functions/api/index.ts` 核對，`:2242` 有 `p_referrer_source`（main `f5a1ed8`）。此為事實補充，不改判；線上 `/health` sha 仍請主 session 確認。
- 需求 reviewer 讀不到主 session 分支，無法核對 W6-14 是否屬 S6：規劃者已讀 `origin/claude/uknow-wave-6-lead-xb4hqg:docs/plans/launch-wave-6/plan.md` W6-14 列與 §2 S6 列，W6-14 交 S6 屬實。

## 處置（人審後填寫）

- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：） □ 退回重規劃
