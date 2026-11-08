# 後台推薦樹＋查帳資訊 實作進度

<!-- plans-keep: S3a／S3b 共用的 TDD 外部記憶；退場條件＝S3b PR 合併時隨 plan.md 一起刪（S3b 順延時由第 7 波主 session 決定） -->

分支:`feature/admin-referral-tree`（S3a）；S3b 另切分支、沿用本目錄
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | `referral_award_chain` ＋ 與發獎等價 | ✅ 綠（CI fcdf06a9 run：9 支全過） | 7aa5503d（CI api-tests：9 failed／542 passed，皆為新測試「function does not exist」） | ff41f36b |
| 2 | 樹節點／搜尋 RPC | 🟡 待 CI 確認綠（c5ecd3be 有 2 支搜尋測試仍紅，修正併在階段 3 綠燈 commit） | fcdf06a9（CI api-tests：11 failed／551 passed，皆為階段 2 新測試） | c5ecd3be＋階段 3 綠燈 commit 的 in_scope 修正 |
| 3 | 會員查帳 RPC（鏈、換線、成環） | 🟡 待 CI 確認綠 | 5c09b834（CI api-tests：階段 3 九支「function does not exist」） | （本 commit） |
| 4 | 付款查帳＋異常 RPC | ⬜ 未開始 | | |
| 5 | Edge 端點＋契約＋守門 | ⬜ 未開始 | | |
| 6 | 前端純函式 | ⬜ 未開始 | | |
| 7 | `AdminReferralTree` | ⬜ 未開始 | | |
| 8 | `ReferralAuditSheet`＋次分頁＋私密 | ⬜ 未開始 | | |
| 9 | 規格書＋e2e | ⬜ 未開始 | | |
| 10 | S3b：點數來源與對帳 RPC | ⬜ 未開始 | | |
| 11 | S3b：端點＋UI＋異常 | ⬜ 未開始 | | |

## 目前位置與下一步

業主 2026-11-08 親打 `/tdd-implement admin-referral-tree`，開工。階段 2 綠燈與階段 3 紅燈一起推（同一輪 CI 驗「2 綠、3 紅」）。

**環境限制**：本容器 `supabase start` 拉不到映像（public.ecr.aws 的 CDN 被網路政策擋），DB 測試（`*.test.ts`）不能本機跑。階段 1～4、5c、5d 的紅綠證據以 CI api-tests 軌為準：紅燈 commit 單獨 push，確認 api-tests 在該測試上紅後才寫實作。deno 已以 `npm i -g deno` 安裝，`deno task check`、unit 測試可本機跑。

## Blockers(逃生口紀錄)

- 2026-11-08 階段 2：c5ecd3be 綠燈後 CI 仍有 2 支搜尋測試紅（`ancestor_ids 由頂層到父`、`成環與超過 50 層`）。根因在實作不在測試：`admin_referral_in_scope` 漏了「有 edge 指向自己」，自己沒訂閱的子節點搜不到，違反 plan §2.2「搜尋與樹收同一群人」。已 push 的 migration 不改，修正放在階段 3 的 migration（`create or replace admin_referral_in_scope`），測試未動。

## 框架摩擦

- 雲端容器拉不到 supabase 映像（cloudfront 被擋）→ /tdd-implement 第 7 步「起一次 supabase start」做不到，DB 階段的紅綠只能靠 CI，一階段多一輪 push 等待。
