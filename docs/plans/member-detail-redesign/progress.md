# 會員詳情 Sheet 分區重設計 實作進度

<!-- plans-keep: 施工中鷹架（S4 三段式），退場條件＝/tdd-implement 收尾刪除整個 docs/plans/member-detail-redesign/ 目錄 -->

分支：`feature/member-detail-redesign`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）
母計畫：`docs/plans/platform-uiux-redesign/`（S4／工項 A3；收工時更新其 progress.md 的 S4 列）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 重構綠到綠：搬出 `WithdrawalStatusBadge`、搬出 `MemberStatusBadges`、純抽出 `MemberDetailSheet`（三個 commit） | ⬜ 未開始 | —（無紅燈） | |
| 2 | 「查看」回饋、請求序號（含 `runAction` 重讀，D7）、錯誤可見、焦點 | ⬜ 未開始 | | |
| 3 | 分區結構與身分卡（新欄位、Sheet 內層捲動、`MemberDetailSheet.test.tsx`、e2e 最壞夾具＋375px） | ⬜ 未開始 | | |
| 4 | 管理區三分法、確認鈕顏色（D3）、暫停文案（D6）、重讀失敗不連坐 | ⬜ 未開始 | | |
| 5 | 文件同步（規格書 §13／§14、§12.11、母計畫 plan／construction-plan／progress、PR 偏離說明） | ⬜ 未開始 | | |

## 目前位置與下一步

規劃修訂版完成：四視角審查（review.md：P0×0、P1×10、P2×23）全數處置，業主裁決 Q1 與 D1–D13 已回填 plan.md，review.md 勾「修訂後通過」。下一步：業主親自打 `/tdd-implement member-detail-redesign`，從階段 1（重構綠到綠）開始。實作完跑 `/review-implementation`，PR 描述改成實作版後通知主 session 對照。

## Blockers（逃生口紀錄）

（無）

## 框架摩擦

（無）
