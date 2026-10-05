# 會員詳情 Sheet 分區重設計 實作進度

<!-- plans-keep: 施工中鷹架（S4 三段式），退場條件＝/tdd-implement 收尾刪除整個 docs/plans/member-detail-redesign/ 目錄 -->

分支：`feature/member-detail-redesign`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）
母計畫：`docs/plans/platform-uiux-redesign/`（S4／工項 A3；收工時更新其 progress.md 的 S4 列）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 「查看」觸發回饋（loading／disabled、同列不重送、最後點擊勝出） | ⬜ 未開始 | | |
| 2 | 分區結構與身分卡（抽 `MemberDetailSheet`、提領狀態同源、e2e mock 補欄位、375px e2e） | ⬜ 未開始 | | |
| 3 | 管理區三分法（暫停／撤銷紅框字、其餘次要、零實心鈕） | ⬜ 未開始 | | |
| 4 | 文件同步（規格書 §13、§12.11 依 Q3、驗收 2 S4 清單、母計畫 progress） | ⬜ 未開始 | | |

## 目前位置與下一步

四視角審查完成（review.md：P0×0、P1×10、P2×23）；等業主裁決 Q1–Q5 與 review.md「需人工裁決」A–K，主 session 回填 plan.md 後，由業主親自打 `/tdd-implement member-detail-redesign`。

## Blockers（逃生口紀錄）

（無）

## 框架摩擦

（無）
