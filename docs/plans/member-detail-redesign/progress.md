# 會員詳情 Sheet 分區重設計 實作進度

<!-- plans-keep: 施工中鷹架（S4 三段式），退場條件＝/tdd-implement 收尾刪除整個 docs/plans/member-detail-redesign/ 目錄 -->

分支：`feature/member-detail-redesign`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）
母計畫：`docs/plans/platform-uiux-redesign/`（S4／工項 A3；收工時更新其 progress.md 的 S4 列）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 重構綠到綠：搬出 `WithdrawalStatusBadge`、搬出 `MemberStatusBadges`、純抽出 `MemberDetailSheet`（三個 commit） | ✅ 綠 | —（無紅燈） | `0b84bf2`、`8d57128`、`01e008d` |
| 2 | 「查看」回饋、請求序號（含 `runAction` 重讀，D7）、錯誤可見、焦點 | ⬜ 未開始 | | |
| 3 | 分區結構與身分卡（新欄位、Sheet 內層捲動、`MemberDetailSheet.test.tsx`、e2e 最壞夾具＋375px） | ⬜ 未開始 | | |
| 4 | 管理區三分法、確認鈕顏色（D3）、暫停文案（D6）、重讀失敗不連坐 | ⬜ 未開始 | | |
| 5 | 文件同步（規格書 §13／§14、§12.11、母計畫 plan／construction-plan／progress、PR 偏離說明） | ⬜ 未開始 | | |

## 目前位置與下一步

階段 1 完成（三個重構 commit，既有測試零修改全綠）。實作期小偏離：`WithdrawalStatusBadge` 匯出的是函式 `withdrawalStatusLabel(status)`（內含未知值 fallback）而非 plan 寫的常數 `WITHDRAWAL_STATUS_LABEL`——所有消費者原本都寫 `?? status`，收進函式才不會各寫一份；`MemberStatusBadges.tsx` 匯出 `AccountStatusBadge`／`SuspendedBadge`／`AdminBadge` 三個元件，身分卡要用的「異常在前」組合元件在階段 3 加。下一步：階段 2 紅燈（查看回饋、請求序號、錯誤可見、焦點）。

## Blockers（逃生口紀錄）

（無）

## 框架摩擦

（無）
