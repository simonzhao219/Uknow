# 金流與推薦的並行防線 規劃書審查報告

<!-- plans-keep: S2 施工期鷹架，draft PR 期間需在 CI 中存在；退場條件＝/tdd-implement 收尾以 chore(plans) commit 刪除整個目錄 -->

<!-- /review-plan 彙整四個 fresh-context reviewer（系統／架構／UIUX／需求）。只去重排序、不改判；
     合併的重複項標出各 reviewer 原判，取最高者排序。輸出契約見 docs/_templates/review.md。 -->

審查對象：`./plan.md`（commit `aefaf90`）。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 3 | 4 | §2.1 主鎖序無環（逐對推演）、§2.2 判準不誤判補繳／寬限／claim、§2.4 四組索引與現有寫入路徑不衝突、B 區 register、cancel_signup 刪 auth.users 可行 |
| 架構 | 0 | 3 | 4 | migration 基準與現況屬實、區段歸屬、測試命名、階段 1／2／3／7 測試可紅、apiClient／appShell 無衝突 |
| UI/UX | 0 | 4 | 3 | BottomNav 不受影響、四契約方向、503 不走 continueAfterSaved |
| 需求 | 0 | 5 | 3 | 稽核編號全對應、不做清單、無硬編參數、Q1–Q3 品質 |

去重後：**P0 0、P1 13、P2 11**（合併 3 組重複，見各項標註）。

## 發現清單（依嚴重度排序）

### P1

1. 〔§2.5 D〕**4 天窗判準太寬且時間基準不一**：「任一非 completed 訂單」含 failed／cancelled／expired 終態（`payment_orders_status_check` 五值，`20260720000001:21`），這些單 PayUni 頁已不可付，卻讓人 4 天刪不了帳號；`now() - 4 days` 與 PayUni ExpireDate（建單台北日＋3 天）基準不同，臨界時可能 cancel 放行而 PayUni 頁仍可付 → 限定 `status = 'pending'`、窗改「建單台北日＋4 天」曆日邊界，補邊界測試；被擋 4 天內的自助出口寫清楚。（系統 P1、需求 P1、架構 P2 合併）
2. 〔§2.2 A〕**重複偵測與告警在 `process_successful_payment` 關鍵路徑**，最外層 `exception … raise` 會讓告警失敗回滾整筆付款（錢收了不開通）→ `log_system_alert` 包進自己的 `begin…exception … raise warning`；階段 7 加「告警寫入失敗時付款仍 completed」。（系統）
3. 〔§2.2、§2.6、§5 階段 5〕**`prepare_payment_order` 介面未定義完整**：active 判準要與 `readAccountStatus`／`user_account_status` 同源；回傳值→HTTP 對照表（active→400 原文案、not_found→404、duplicate_trade_no→Edge 重產 tradeNo 重試一次，保留「加密前定案」語意）；RPC 要帶齊 amount／payment_method／transaction_id／renewal_mode；階段 5 補四個回傳值與「prepare×cancel 並行無孤兒訂單」測試；fresh 換線的 profiles 寫入在 RPC 鎖外，列為已知限制交 S6。（系統 P1、架構 P1 合併）
4. 〔§2.2、§6〕**重複付款第二筆仍照發三代 100P 是業務裁決，未列問題**；客服退款時獎勵不會撤回 → 列 Q4（照發／暫不發交客服），告警 context 帶該筆發出的獎勵列。（需求 P1、系統 P2 合併）
5. 〔§5 階段 4〕**「既有 8 條照綠」不成立**：三條 fail-closed 測試靠攔截 Edge 對 REST 表的 fetch 注入失敗，改走 RPC 後注入點消失 → 明列改寫：注入改為 `rpc/cancel_signup` 失敗一條、三條逐表測試合併或刪除並說明理由；〈pending 訂單沒有 SUCCESS 仍可刪除〉反轉。（架構）
6. 〔§2.7、§5 階段 1〕**「加進 `security-definer-grants.test.ts` 清單」是錯誤指示**：`ALLOWED` 是允許 anon／authenticated 執行的白名單，加進去反而授權 → 改為 migration revoke、該測試不改、保持綠；revoke 驗證落點移到新函式誕生的階段 4／5。（架構）
7. 〔§1 E、§2.6〕**已建單、付款途中才被停權**的 notify 到達時照常開通發獎，規劃與規格都未定義 → 寫明行為（照開通＋告警，或擋）、列開放問題、補測試。（需求）
8. 〔§3 規格書同步〕**少列 §5.3**：該段寫「/auth/register 回 503＝資料已寫入」，新 `REFERRAL_CHECK_UNAVAILABLE`（未寫入）與之衝突 → 同步清單加 §5.3，並同改 `api-contract.ts:839-841` 註解為「看 code 判斷」。（需求 P1；架構 P2 的契約註解併入）
9. 〔§2.3、§4〕**register 503 的 toast 會顯示 `[object Object]`**：`CompleteProfile` 是 `throw new Error(errorData.error)`，新信封的 error 是物件 → 用 `extractApiErrorMessage`、在 PROFILE_UNAVAILABLE 旁加分支；V 測試斷言實際文字。（UIUX）
10. 〔§4〕**register 400 時欄位仍顯示「驗證成功＋推薦人姓名」**，與 toast 矛盾、會重複撞 400 → 400 分支 `setCodeError`、清 `codeVerified`／`verifiedReferralCode`／`referrerName`、`focusFirstError`，補 V 測試；「不能使用自己的推薦碼」同路徑。（UIUX）
11. 〔§4 稍後註冊〕**`payment_in_progress` 只有會消失的 toast、沒有出口** → 文案補「想先離開請用右上角『登出』，資料會保留」，並與既有確認框文案一致；〔需人工裁決〕toast 或持久訊息。（UIUX）
12. 〔§2.6、§4〕**結帳頁停權三態缺口**：profile 載入中是否閃付款鈕、localStorage 分支停權者會先看到付款鈕、403 切卡時要清 loading → 載入中不渲染付款鈕；localStorage 分支以 `/profile` 覆蓋；403 切卡清處理中狀態；V 測試涵蓋。（UIUX）
13. 〔§4、§5〕**UI 驗收缺測試**：稍後註冊 `payment_in_progress`（不登出、停原頁）、register 400 欄位標錯都沒有 V／E 測試 → 階段 3、4 各補 V。（需求）

### P2

14. 〔§2.1〕鎖序表漏列 `pay_referral_generations` INSERT 對上線 profiles 取 FOR KEY SHARE 的隱性等待，無環前提是推薦鏈無環（DB 無約束；ref P0-2 成環屬 S6）→ 表中註明。（系統）
15. 〔§2.4〕`repair_orphaned_claim_rewards` 允許 `p_user_id = null`，全域執行逐一鎖多人可能死結 → 候選 `order by claimer_id` 或拒 null。（系統）
16. 〔§2.4、§5 階段 1〕既有 D 測試／e2e／journey seed 可能重複插入同一事件的獎勵列，索引上線後 23505 → 階段 1 先 grep 全部 `insert into reward_transactions` 一併修。（系統）
17. 〔§2.2〕偵測用 `v_paid_at`、prepare 用 `now()`，對帳延遲開通時口徑不同 → 寫明理由，階段 7 補「paid_at 早於前一筆 end_date」案例。（架構）
18. 〔§5〕單一 migration 跨 7 階段，與 S1／S6 並行時基準可能漂移 → 每階段一支 migration，或明寫每階段開工與 rebase 後重驗基準。（架構）
19. 〔§3、§5 階段 6〕e2e mock `e2e/mocks/backend_api_mock.py` 需能回 `suspended: true` 與 prepare 403；與 S3 同檔 `PaymentCheckout.tsx` 建議指定 S3 先合。（架構）
20. 〔§4〕停權卡沿用 `handleCancel` 會出現「稍後付款」語意 → 按鈕改「登出」／「回首頁」；確認「客服」有具體聯絡管道。（UIUX）
21. 〔§2.6〕停權文案與 `RequireMembershipRoute` 不一致 → 抽共用常數或元件。（UIUX）
22. 〔§4〕停權卡 `role="alert"`／toast `aria-live` 未提 → 階段 6 加 `getByRole('alert')` 斷言。（UIUX）
23. 〔§1 B、§5 階段 2〕「三者同形」測試缺 inactive 碼案例 → 補。（需求）
24. 〔§5 階段 7〕稽核建議的「prepare 已有未逾期 pending 單時的行為」沒有特徵測試 → 補一條釘住現況，讓 S6 改動看得見。（需求）
25. 〔§2.5〕「4 天」在 cancel_signup 與對帳各寫字面量 → 抽單一常數或 SQL 函式。（需求）

## 需人工裁決

- **#11** `payment_in_progress` 用 toast 還是持久訊息（UIUX 偏持久）。
- **#4** 重複付款第二筆的三代獎勵照發或暫不發（併入業主 Q4）。
- **#7** 付款途中被停權：照開通＋告警，或擋。
- **需求 reviewer 無法讀取派工原文**（沒有 git，讀不到 `origin/claude/quirky-pasteur-hjb0pv` 上的 dispatch-prompts S2 段與 W5-4／W5-5／W5-9）。規劃者已對照：派工 S2 段五條＝plan §1 A–E 逐一對應；派工「規劃必答」三題＝§2.1（鎖序）、§2.7（migration 對正式站）、§5（D／V／E 層級）。請主 session 複核。
- 系統 reviewer 問「訂單狀態有無終態」：有，五值 `pending/completed/failed/cancelled/expired`（架構 reviewer 已查證），併入 #1。

## 處置（人審後填寫）

<!-- P0 的處置規則：必須改 plan 並重跑 /review-plan，或由人在此明文豁免。
     tdd-implement 開工前會檢查：存在未處置 P0 → 拒絕開工。 -->

- 業主裁決（2026-11-04，主 session 互動選項代收）：W5-11（Q1 不加確認框）、W5-12（稍後註冊改登出、cancel-signup 退場）、W5-13（重複付款接續效期、獎金照發、告警附獎金列）、W5-14（付款途中停權照開通＋error 告警）。
- 主 session 裁定：13 條 P1 修進 plan r2 即可，不重跑整輪 /review-plan；D 段縮小後與 D 有關的 P1（#1、#5、#11、#13 稍後註冊部分）作廢。逐條處置見 plan.md §8。
- [x] 人審完成，裁決：通過（主 session 親審，2026-11-05；r2 @e3732c8）。實作備註（P2，不改 plan）：停權卡出口與 `RequireMembershipRoute` 一致，抽 `SuspendedNotice` 時一併處理；「註冊中要刪帳號找客服」目前無後台刪帳號工具，PR「未處理」列一行（第 6 波候選）。
