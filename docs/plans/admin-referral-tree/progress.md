# 後台推薦樹＋查帳資訊 實作進度

<!-- plans-keep: S3a／S3b 共用的 TDD 外部記憶；退場條件＝S3b PR 合併時隨 plan.md 一起刪（S3b 順延時由第 7 波主 session 決定） -->

分支:`feature/admin-referral-tree`（S3a #521 已合併；S3b 以同名分支從 develop 重開，PR #525）
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | `referral_award_chain` ＋ 與發獎等價 | ✅ 綠（CI fcdf06a9 run：9 支全過） | 7aa5503d（CI api-tests：9 failed／542 passed，皆為新測試「function does not exist」） | ff41f36b |
| 2 | 樹節點／搜尋 RPC | ✅ 綠（CI 3437af9b：含 in_scope 修正後全過） | fcdf06a9（CI api-tests：11 failed／551 passed，皆為階段 2 新測試） | c5ecd3be＋階段 3 綠燈 commit 的 in_scope 修正 |
| 3 | 會員查帳 RPC（鏈、換線、成環） | ✅ 綠（CI 3437af9b） | 5c09b834（CI api-tests：階段 3 九支「function does not exist」） | a9dbcdb9 |
| 4 | 付款查帳＋異常 RPC | ✅ 綠（CI ae25f1be） | 3437af9b（CI api-tests：9 failed／571 passed，皆為階段 4 新測試） | 3a91e5e9 |
| 5 | Edge 端點＋契約＋守門（5a～5d） | ✅ 綠（CI 682de3fb：api-tests、unit-tests、build-bundle 全過；static-checks 的 deno lint 由 3ad5764a 修） | ae25f1be（本機 unit：5a／5b 17 failed；CI api-tests：只有 5c 一支紅、581 passed） | d404f520（＋682de3fb 契約分檔，修 bundle 預算） |
| 6 | 前端純函式 | ✅ 綠（本機 vitest 17 passed） | 894d070e（本機 vitest 16 failed／1 passed——「沒有說明」一支 stub 回 null 碰巧綠） | 96484797 |
| 7 | `AdminReferralTree` | ✅ 綠（本機 vitest 12 passed） | 0222ab8b（本機 vitest 12 failed） | 2b1dc9ff |
| 8 | `ReferralAuditSheet`＋次分頁＋私密 | ✅ 綠（本機 vitest admin＋analytics 690 passed） | 19d6c5a3（本機 vitest src/components/admin：17 failed／574 passed，皆新測試） | 299e6f0a |
| 9 | 規格書＋e2e | ✅ 綠（本機 e2e：admin_steps＋overflow sweep＋admin mobile layout 77 passed） | 不適用（逃生口 1，見 Blockers） | （本 commit） |
| — | #521 獨立審查補強（P0 成環、P1×2、P2×6、W6-26） | ✅ 本機 vitest 綠；DB 待 CI | 666b6e0e（CI api-tests：2 failed／586 passed，皆新測試；unit 紅為前端新測試） | （本 commit） |
| 10 | S3b：點數來源與對帳 RPC | 🟡 綠燈待 CI 證明（本機無 DB） | 4b6bbda5 | （本 commit） |
| 11 | S3b：端點＋UI＋異常 | ✅ 本機 Deno unit 14 passed、vitest admin 614 passed；DB 端點待 CI | 9b7a4d2e（本機 Deno unit 2 failed、vitest 6 failed，皆新測試） | （本 commit） |

## 目前位置與下一步

業主 2026-11-08 親打 `/tdd-implement admin-referral-tree`，開工。S3a 九個階段全綠；/review-implementation 已跑完（`./implementation-review.md`），P0 與能小修的 P1／P2 已修，測試先寫、確認 8 支紅之後才實作。下一步：PR 內文、CI 綠後轉 ready。

**環境限制**：本容器 `supabase start` 拉不到映像（public.ecr.aws 的 CDN 被網路政策擋），DB 測試（`*.test.ts`）不能本機跑。階段 1～4、5c、5d 的紅綠證據以 CI api-tests 軌為準：紅燈 commit 單獨 push，確認 api-tests 在該測試上紅後才寫實作。deno 已以 `npm i -g deno` 安裝，`deno task check`、unit 測試可本機跑。

## Blockers(逃生口紀錄)

- 2026-11-08 #521 獨立審查補強（逃生口 2；業主 2026-11-08 在本 session 授權只修下列兩支、由 Claude 刪鎖）：紅燈 666b6e0e 有兩支測試本身寫錯，實作無法也不該讓它們綠：
  1. `AdminReferralTree.test.tsx`「搜尋載入更多在途時停用…」：mock 寫成 `search(_q, offset)`，但實際呼叫是 `search({ q, limit, offset })`，offset 永遠讀不到，第二頁永遠立即回第一頁的資料。修法：mock 改讀 `params.offset`。
  2. `ReferralAuditSheet.test.tsx`「自癒提示只對付款的第 1 代缺漏」：前提來自獨立審查 P2-1，但現行 `repair_orphaned_payments`（20260807000001）在付款的任一代缺漏都會重跑發獎；只有任務續約要第 1 代缺漏才會補。實作依現行函式；測試要改成「付款第 2 代缺漏 → 自癒提示；任務續約只缺第 2 代 → 請回報」。
  另：`節點列只寫到期日` 依 W6-26「已到期、停權用徽章」解讀為訂閱中與即將到期不再顯示狀態徽章（搜尋結果列不變）。

- 2026-11-08 階段 9（逃生口 1）：e2e 情境與 overflow sweep 路由是在元件完成後才寫的驗收層，寫入即綠（本機 77 passed）。e2e 的 overflow sweep 只支援 375px（`MOBILE_VIEWPORT`），規劃 §4 寫的 1024／1280 寬度未另加 e2e 掃描——Sheet 內一律卡片、不靠視窗斷點，桌面寬度不會改變 Sheet 版面；記為偏離。

- 2026-11-08 階段 5d（逃生口 1）：覆蓋斷言與補齊後的 ADMIN_ROUTES 同一個紅燈 commit 寫入，寫入即綠——4 條漏列端點若不在同 commit 補進清單，綠燈階段就得改測試檔，違反紅燈期鎖測試。新端點未註冊時守門 middleware 照樣回 401／403，所以 5d 沒有可紅的部分；5c（admin-referral-tree.test.ts）才是本階段 DB 側的紅燈。
- 2026-11-08 階段 5a：`active 但沒有 end_date` 一支在 stub 下碰巧綠（stub 回 active／null），其餘 5 支紅。

- 2026-11-08 階段 2：c5ecd3be 綠燈後 CI 仍有 2 支搜尋測試紅（`ancestor_ids 由頂層到父`、`成環與超過 50 層`）。根因在實作不在測試：`admin_referral_in_scope` 漏了「有 edge 指向自己」，自己沒訂閱的子節點搜不到，違反 plan §2.2「搜尋與樹收同一群人」。已 push 的 migration 不改，修正放在階段 3 的 migration（`create or replace admin_referral_in_scope`），測試未動。

## 偏離規劃（實作審查後補記）

- 搜尋結果：點姓名開查帳詳情，另一顆「在樹上展開到〇〇」按鈕負責展開——plan 寫「點結果展開到樹上」。分開是為了讓只想看帳的管理員不被帶到樹上。
- MemberDetailSheet：分頁被鎖（從推薦樹開啟）時「在推薦樹中查看」直接隱藏，不做 disabled＋說明。
- 沒用 `usePagedList`：每層要支援 pinned（ensureId），且 pinned 不重複渲染、不計入 X，單一 offset 模型裝不下。
- migration 0004 把 `admin_referral_member_audit` 改名為 `admin_referral_member_audit_base`，外面包一層同名函式加上付款摘要；回滾要兩支一起刪。
- 新增 `loaders.ts`（不在 plan 檔案清單）：資料載入的注入點，讓元件測試不碰 apiClient。
- 320px 三分頁未驗證：e2e overflow sweep 只支援 375px。
- 效能備註（不修）：`unplaceable_ids` 線性掃描；`tree_node` 呼叫 upline、payment_events 各兩次。

## 框架摩擦

- `normalizeCode`（推薦碼正規化）現在有 4 份：`admin-referral-tree.ts` 的 `normalizeCode`＋`index.ts` 三處內嵌 `.normalize('NFKC').toLowerCase().trim()`，值得收進 `_shared`。

- pre-commit 對 supabase/functions 只跑 deno fmt＋deno task check，不跑 deno lint；未用的 import 要到 CI static-checks 才紅（682de3fb）。
- 本機 e2e：requirements 釘 playwright==1.56.0（chromium 1194），容器預裝的是 1243；以 sudo 把 1194 的 headless_shell 路徑 symlink 到 1243 才跑得動（只動拋棄式容器）。

- `profile-transient.unit.test.ts` 以 `requireAuth(` 出現次數守 index.ts 的呼叫點總數；新端點的第二道守門若在 index.ts 直接呼叫會讓它紅。改比照 referral-invite 傳函式參照（`adminAuthorizer(requireAuth, isAdminUser)`），計數不變。這類「計數式守衛」對新增端點不友善，值得在 friction-log 討論改成白名單。

- 雲端容器拉不到 supabase 映像（cloudfront 被擋）→ /tdd-implement 第 7 步「起一次 supabase start」做不到，DB 階段的紅綠只能靠 CI，一階段多一輪 push 等待。
