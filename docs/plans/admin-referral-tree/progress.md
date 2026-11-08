# 後台推薦樹＋查帳資訊 實作進度

<!-- plans-keep: S3a／S3b 共用的 TDD 外部記憶；退場條件＝S3b PR 合併時隨 plan.md 一起刪（S3b 順延時由第 7 波主 session 決定） -->

分支:`feature/admin-referral-tree`（S3a）；S3b 另切分支、沿用本目錄
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | `referral_award_chain` ＋ 與發獎等價 | ⬜ 未開始 | | |
| 2 | 樹節點／搜尋 RPC | ⬜ 未開始 | | |
| 3 | 會員查帳 RPC（鏈、換線、成環） | ⬜ 未開始 | | |
| 4 | 付款查帳＋異常 RPC | ⬜ 未開始 | | |
| 5 | Edge 端點＋契約＋守門 | ⬜ 未開始 | | |
| 6 | 前端純函式 | ⬜ 未開始 | | |
| 7 | `AdminReferralTree` | ⬜ 未開始 | | |
| 8 | `ReferralAuditSheet`＋次分頁＋私密 | ⬜ 未開始 | | |
| 9 | 規格書＋e2e | ⬜ 未開始 | | |
| 10 | S3b：點數來源與對帳 RPC | ⬜ 未開始 | | |
| 11 | S3b：端點＋UI＋異常 | ⬜ 未開始 | | |

## 目前位置與下一步

規劃完成、/review-plan 中；等業主審規劃與 §6 開放問題，親打 `/tdd-implement admin-referral-tree`。

## Blockers(逃生口紀錄)

## 框架摩擦
