# 會員詳情 Sheet 分區重設計 實作進度

<!-- plans-keep: 施工中鷹架（S4 三段式），退場條件＝/tdd-implement 收尾刪除整個 docs/plans/member-detail-redesign/ 目錄 -->

分支：`feature/member-detail-redesign`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）
母計畫：`docs/plans/platform-uiux-redesign/`（S4／工項 A3；收工時更新其 progress.md 的 S4 列）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 重構綠到綠：搬出 `WithdrawalStatusBadge`、搬出 `MemberStatusBadges`、純抽出 `MemberDetailSheet`（三個 commit） | ✅ 綠 | —（無紅燈） | `0b84bf2`、`8d57128`、`01e008d` |
| 2 | 「查看」回饋、請求序號（含 `runAction` 重讀，D7）、錯誤可見、焦點 | ✅ 綠 | `53bb426` | `e27c612` |
| 3 | 分區結構與身分卡（新欄位、Sheet 內層捲動、`MemberDetailSheet.test.tsx`、e2e 最壞夾具＋375px） | ✅ 綠 | `feef265` | `9005047` |
| 4 | 管理區三分法、確認鈕顏色（D3）、暫停文案（D6）、重讀失敗不連坐 | ✅ 綠 | `7170968` | `4df87f2` |
| 5 | 文件同步（規格書 §13／§14、§12.11、母計畫 plan／construction-plan／progress、PR 偏離說明） | ✅ 綠 | — | `e7ed7c5` |
| 審 | 實作審查回填（implementation-review.md：P0×0；業主裁決 4 題） | ✅ 綠 | `db75ca1` | `80d031e`（守衛）、`c7d761c`（重構）、`f34d384`（行為）、`272f6e0`（樣式與文件） |

## 目前位置與下一步

階段 1、2 完成。階段 1 實作期小偏離：`WithdrawalStatusBadge` 匯出函式 `withdrawalStatusLabel(status)`（內含未知值 fallback）而非 plan 寫的常數 `WITHDRAWAL_STATUS_LABEL`——所有消費者原本都寫 `?? status`；`MemberStatusBadges.tsx` 匯出 `AccountStatusBadge`／`SuspendedBadge`／`AdminBadge`，身分卡的「異常在前」組合在階段 3 加。階段 2 實作期小偏離：關閉後的焦點還給「開出面板的那顆查看鈕」（記觸發時的 id），不是 `detail.id`——兩者在真資料上相同，但回應的 id 不該決定焦點去向；sr-only 讀取提示只在在途時渲染（常駐的 `role="status"` 會讓既有 test 121「載入後無 status」誤紅）。 階段 3 完成：e2e 375px 五條中「全螢幕」「無橫向溢出」兩條在改版前就綠（留作回歸守衛，其餘三條紅→綠）；本機跑 admin 相關 e2e 42 條、溢版巡檢會員兩路由全過。下一步：階段 4 紅燈（管理區三分法、確認鈕顏色 D3、暫停文案 D6、重讀失敗不連坐）。 階段 4 完成：8 條新測試中 4 條紅→綠（紅框字、兩個紅實心確認、暫停文案），4 條是寫下即綠的守衛（次要外觀、零實心鈕、確認授予墨黑、重讀失敗只在管理區——後者在階段 3 搬版面時已成立）。下一步：階段 5 文件同步與收尾。

階段 5 與實作審查回填完成。**實作期偏離總表**（寫進 PR「偏離規劃說明」）：(1) `withdrawalStatusLabel()` 函式取代常數；(2) `openingIds` 用 `string[]`（取最後一次點擊給讀取提示）；(3) 子元件多 `onCloseAutoFocus` prop、觸發鈕標記收成 `memberDetailTriggerProps`；(4) 錯誤框的焦點掛在外包 div；(5) `runAction` 的序號守衛不只重讀一行——動作失敗也守，面板已關時改印列表上方（業主裁決）、同一人重開時補讀（業主裁決）、processingId 只清自己的；(6) 讀取提示改常駐 `aria-live`（不是 `role="status"`，避開列表載入態）；(7) 重讀失敗改中性 `role="status"`；(8) 捲動區是可聚焦的 `<section aria-label="詳情內容">`；(9) 每筆提領加手續費（plan §2 與 D5 清單的落差，業主裁決顯示）；(10) 手機卡片徽章改已暫停在前；(11) `WithdrawalCardList` 改直接 import 徽章、篩選選單從同一張表取；(12) §4.3 三態改寫（已列）、D6 文案修正、D9 既有落差修正。下一步：清理規劃檔、push、PR 描述改實作版。

## Blockers（逃生口紀錄）

（無）

## 框架摩擦

- Stop hook 要 push 與 `/review-implementation`「P0 清掉才 push」衝突；Tailwind class 子字串斷言——兩條已寫進 `docs/plans/friction-log.md`（2026-10-06）。
