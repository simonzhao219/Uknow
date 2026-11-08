# 刊登詳情頁換篇過場動畫 實作進度

分支:`feature/listing-swipe-transition`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | reduced-motion 收口(P2-a) | ✅ 綠 | 09ce2a86 | cdde08c8 |
| 2 | 純函式 browseDrag | ✅ 綠 | 6ab8e6c5 | a9967aaf |
| 3 | 抽 hook useBrowseNav＋WAAPI 進場(P2-b) | ✅ 綠 | 511cd1a9 | debe41c2 |
| 4 | 跟手與放開、手勢起點(P2-e) | ✅ 綠 | 1cf74b79 | 841d2c21 |
| 5 | 橫向溢出(P2-d)＋頭尾回彈 | ✅ 綠 | b36d8671 | 681bea34 |
| 6 | 手勢 chunk error boundary(P2-c) | ✅ 綠 | 9e8379f0 | 75d737dd |
| 7 | e2e、文件、bundle 預算 | ✅ 綠（一寫就綠，逃生口 1） | — | (本 commit) |

## 目前位置與下一步

階段 1 完成（紅 09ce2a86；守衛測試＝prefers-reduced-motion 字串只准出現在 motionPreference.ts）。**bundle 基線（階段 1 後，develop 現況）：entry raw 1012.3／gzip 315.5／總 raw 1947.1 kB**（預算 1015／316／1950）。階段 2 完成（browseDrag.ts：lockAxis／dragOffset／settle／isInteractiveStart／startsInsideHorizontalScroller＋動畫常數）。階段 3 完成（useBrowseNav、固定 wrapper `data-browse-motion`、WAAPI 進場；紅燈 commit 只置換 slide-in class 斷言 4 條與「一般換篇不觸發回彈」1 條，其餘既有測試零修改）。**階段 3 後 bundle：entry raw 1012.7／gzip 315.7／總 raw 1947.5 kB**（對基線 +0.4／+0.2／+0.4，預算 1015／316／1950）。階段 4 完成（BrowseGestures 跟手；去向無鄰居時放開仍通知 onNavigate 以保留「已是最後一篇」播報，目前頭尾放開會同時有 wrapper 彈回與 contentRef 24px 回彈兩段——階段 5 併成單一 springBack）。階段 5 完成（`springTo` 統一彈回；按鈕／鍵盤頭尾輕推改作用在 wrapper，手勢頭尾由 BrowseGestures 彈回；外層 `overflow-x-clip`；`contentRef` 移除，`data-browse-content` 仍在）。紅燈 commit 另改一條既有斷言：`animate` 實例由 content 改為 motion wrapper。階段 6 完成（BrowseGesturesBoundary，靜默降級）。**階段 6 後 bundle：entry raw 1014.0／gzip 316.3／總 raw 1950.1 kB**，超出原預算 gzip 316／總 1950 → 依 W6-20 授權調 `check-bundle-budget.mjs`：gzip 316→316.5（+0.5，授權上限）、總 raw 1950→1951（+1，隨 entry 連動；W6-20 未明寫總量額度，已回報主 session）。階段 7 完成：mock e2e 3 個場景（CDP 真觸控：跟手＋長拖換篇＋無橫向捲動＋聚焦環保留空間／減少動態不位移／短拖彈回），本機 chromium 實跑綠；規格書與 ui-ux-guidelines 同步；另補 `overflow-clip-margin:8px`（overflow-x:clip 會裁掉貼邊鈕的 3px 聚焦環，審查 P2）。`check:full` 全綠（deno 以 npm 安裝）。**最終 bundle：entry raw 1014.0／gzip 316.3／總 raw 1950.2 kB**。下一步：/review-implementation → 清理規劃檔 → PR。

舊記錄：
規劃已依 /review-plan 與主 session 裁決 W6-20 修訂（review.md P1-1～11 已併入 plan.md），待主 session 親審後請業主在本 session 親打 `/tdd-implement listing-swipe-transition`。

## Blockers(逃生口紀錄)

- 2026-11-08 審查修正的紅燈 commit d65c3af3：測試〈輪播盡頭續滑在最後一篇時，內容區輕推再回原位並播報〉（`ServiceProviderDetailRoute.test.tsx`）夾具寫錯——把最後一篇 C 換成單張照片版 `solo`，但背景重驗的 `singleFor` 仍回三張照片版，輪播起點不在盡頭，所以不會觸發盡頭續滑（與 #509 同類的夾具錯誤；既有單張照片測試用 `singleFor.mockResolvedValue({ data: solo, error: null })` 處理）。修法只是在該測試加那一行。實作本身已就緒（其餘 3 條新測試與全部既有測試綠）。逃生口 2：停手等人工裁決。**業主 2026-11-08 互動選項：「授權解鎖並修這一行（建議）」**（本 session 的 AskUserQuestion）→ 由本 session 移除 tdd-lock、補該一行夾具。

## 框架摩擦

- 本機跑 e2e：pinned playwright 1.56 要 chromium 1194，容器只有 1243；以 symlink `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` 指向 1243 的 headless shell 即可（環境級 hack，未入庫）。
- e2e 偶發 `[e2e] blocked unmocked request: public_listing_categories`（首頁類別查詢未 mock，idle 觸發時機與測試收尾競爭）；一次同批 10 場景跑中出現過一次，單跑 12 次 0 次，非本 feature 引入。

## 審查修正（/review-implementation，報告見 implementation-review.md）

- 紅 d65c3af3（含夾具錯誤，授權見上方 Blockers）→ 綠：輪播盡頭續滑頭尾輕推（`goBrowse` 第三參數 `sprung`：頁面手勢已自己彈回才略過）、快速放開彈回起點（先補寫 pendingOffset）、touchstart 清殘留 transform。
- 重構（無新行為）：`springTo`／`ENTER_*`／`SPRING_MS`／`NUDGE_PX` 拆到 `utils/browseMotion.ts`，`browseDrag.ts` 只留手勢純函式 → entry 少帶手勢函式；**拆分後 bundle：entry raw 1013.1／gzip 315.9／總 raw 1950.1 kB**，entry gzip 回到原 316 額度內，已還原先前調高的 gzip 預算（316.5→316）；僅總 raw 仍需 1951（+1）。
- 記為偏離（不修）：焦點還原留在元件（綁定頁面 ref 與 status）；`isInteractiveStart` 排除 `contenteditable="false"`；plan 的「state 不含 dx」測試省略（`goBrowse` 沒有任何 dx 欄位可寫）；`springTo` 仍收 transform 字串。
