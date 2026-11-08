# 新約與部署收尾（第 6 波 S6）實作進度

<!-- plans-keep: 跨 session 施工鷹架；退場條件＝/tdd-implement 收尾時刪除 -->

分支:`feature/renewal-deploy-closeout`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | A 後端：status 第三態＋契約 | ✅ 綠（CI api-tests 紅→綠） | 86db5361 | 475409a9 |
| 2 | A 前端：文案第三態 | ✅ 綠（本機 vitest 紅 6→綠） | 18605717 | 799ccfb7 |
| 3 | B：0d 驗單上碼＋告警分句 | 🔴 紅燈中（本機 PG16 情境已驗紅，等 CI） | 256c5941 | |
| 4 | C：drop 三參數 prepare | ⬜ 未開始 | | |
| 5 | E：部署前確認 migration | ⬜ 未開始 | | |
| 6 | 文件同步＋收尾 | ⬜ 未開始 | | |

## 目前位置與下一步

業主 11/08 18:23 修訂後通過；主 session 親審通過並定 W6-31（接受 R2-9）。PR #526（draft）。第 3 階段紅燈等 CI，綠燈 migration 草稿已在本機 PG16 驗過 B1～B4、B6。第 5 階段要用 develop ref 實打 Management API 驗回應形狀（主 session 提醒）。階段 4 開工前以互動選項請業主授權改 5 處既有測試。

## Blockers(逃生口紀錄)

## 框架摩擦

- 雲端容器無 docker daemon、無 supabase CLI：D 層紅綠靠 PR 的 api-tests；SQL 行為另以本機 PG16＋shim（scratchpad）驗。
- CI unit-tests 一次因 setup-deno 下載 504 失敗（非本 PR）。
