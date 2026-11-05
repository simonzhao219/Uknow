# 金流與推薦的並行防線 實作審查報告

<!-- plans-keep: S2 施工期鷹架；退場條件＝/tdd-implement 收尾以 chore(plans) commit 刪除整個目錄 -->

<!-- /review-implementation 彙整四個 fresh-context reviewer 對實作 diff（origin/develop...2170b4f，排除 docs/plans）
     的發現；只去重排序、不改判。合併的重複項標出各 reviewer 原判。處置欄記 37524b9 的修正。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 0 | 3 | 三支 migration 與基準「唯一差異」逐行屬實、鎖序無環、重複偵測邊界、告警隔離、prepare_payment_order 回傳對應、register 驗碼、cancel-signup 移除 |
| 架構 | 0 | 3 | 4 | 模組邊界、@contract 沿用、useFunnelLogout 重用、migration 切分、appShell 契約處置、S1／S6 撞檔 |
| UI/UX | 0 | 1 | 2 | register 400／503 呈現、稍後註冊（無確認框、secondary）、結帳頁三態、BottomNav、行動版 |
| 需求 | 0 | 4 | 3 | 驗收 A–E 對應、規格書同步、不做清單未越界 |

去重後：**P0 0、P1 6、P2 9**。

## 發現清單與處置

### P1

| # | 發現 | 原判 | 處置 |
|---|---|---|---|
| 1 | 停權卡出口偏離 plan（plan：首購者「登出」、續費者「回首頁」；實作一律「回首頁」，且共用元件讓會員區多一顆鈕）；未記錄 | 架構 P1、UIUX P1、需求 P1 | **已改回照 plan**（37524b9）：`SuspendedNotice` 收 `action`，結帳頁首購者給「登出」（useFunnelLogout）、續費者給「回首頁」，會員區不放按鈕。補測試 |
| 2 | 停權說明文案改為「會員功能、付款與刊登已暫停」，plan 階段 6 寫「文案不變」且無測試守 | 需求 P1（架構併提） | **保留新文案並記偏離**：規格書 §5.2 已把付款列為凍結項，會員區文案隨之正確；補 `RequireMembershipRoute.test.tsx` 斷言 |
| 3 | `api-contract` 多兩個拒絕文案常數、前端以訊息字串判別 400；未記錄 | 架構 P1 | **記偏離並接受取捨**：400 回應須與 prepare fresh、`/referrals/validate` 同形（不洩漏碼是否存在），不加 code；三處後端改引用同一常數，機械綁定（37524b9） |
| 4 | e2e mock 未加 prepare 403；未記錄 | 架構 P1 | **記偏離**：新 E 情境不經 prepare；「送單收到 403 切停權卡」由 V 層測試涵蓋 |
| 5 | 缺 plan 列的 V 測試「載入中無付款鈕」 | 需求 P1 | **已補**（37524b9） |
| 6 | 未列於 plan 的產品碼改動：`scrollIntoView?.()`、一般錯誤路徑改用 `extractApiErrorMessage`；未記錄 | 需求 P1（架構 P2 併提） | **記偏離**：前者為 jsdom 無此 API 的防禦性寫法（瀏覽器行為不變）；後者修 `[object Object]`（UIUX 規劃審查 #9） |

### P2

| # | 發現 | 原判 | 處置 |
|---|---|---|---|
| 7 | cancel-signup 殘跡：rules 區段表、profile-transient 測試措辭與 fake URL、formDraft 註解 | 系統 P2×2、架構 P2 | 已修（37524b9） |
| 8 | prepare fresh 與 `/referrals/validate` 拒絕字串手寫 | 架構 P2 | 已改用常數（37524b9） |
| 9 | 告警隔離測試走不到外層隔離（log_system_alert 自己吞錯） | 需求 P2 | 已改為讓 `log_system_alert` 本身擲錯（37524b9；本機驗證付款仍 completed） |
| 10 | `pay_referral_generations` 的 `when unique_violation then null` 會吞任何唯一鍵衝突 | 系統 P2 | **〔需人工裁決〕** 維持：表上唯一約束只有本 PR 的四組；改用 constraint_name 比對增加維護面 |
| 11 | 四組索引只有 gen1 一組實測 23505，其餘只驗存在 | 需求（併入 C 對照） | 記偏離：索引存在＋定義條件已由 pg_indexes 斷言；行為面同構 |
| 12 | `suspensionPending` 期間付款鈕灰掉無說明 | UIUX P2 | 未改：通常 < 1 秒（force 讀取、8 秒逾時）；列第 6 波候選 |
| 13 | 停權卡 `role="status"`（polite），403 切卡不主動插播 | UIUX P2 | 未改：沿用共用 `StatusCallout`；記偏離（plan 寫 alert，階段 6 確認後為 status） |
| 14 | 「稍後註冊不清草稿」以 mock useFunnelLogout 間接守 | 需求 P2 | 未改：`useFunnelLogout` 本身不碰草稿（檔頭 D3），其測試另守 |
| 15 | 規格書 §2.1「註冊中沒有自助刪除帳號的入口」違反 document-writing | 需求 P2 | 已改（37524b9） |

## 需人工裁決

- #10 `unique_violation` 吞錯範圍（建議維持）。
- 系統 reviewer 提醒：fresh 換線的 profiles 寫入在建單 RPC 之前（RPC 回 active／suspended 時不回復）——plan §1 已列為已知限制交 S6。
- 9 支既有「同一人 active 時再付一次」測試的行為改變：以 CI 全綠為準（37524b9 的 run）。
