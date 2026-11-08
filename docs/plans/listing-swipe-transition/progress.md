# 刊登詳情頁換篇過場動畫 實作進度

分支:`feature/listing-swipe-transition`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | reduced-motion 收口(P2-a) | ✅ 綠 | 09ce2a86 | cdde08c8 |
| 2 | 純函式 browseDrag | ✅ 綠 | 6ab8e6c5 | a9967aaf |
| 3 | 抽 hook useBrowseNav＋WAAPI 進場(P2-b) | ✅ 綠 | 511cd1a9 | debe41c2 |
| 4 | 跟手與放開、手勢起點(P2-e) | ✅ 綠 | 1cf74b79 | (本 commit) |
| 5 | 橫向溢出(P2-d)＋頭尾回彈 | ⬜ 未開始 | | |
| 6 | 手勢 chunk error boundary(P2-c) | ⬜ 未開始 | | |
| 7 | e2e、文件、bundle 預算 | ⬜ 未開始 | | |

## 目前位置與下一步

階段 1 完成（紅 09ce2a86；守衛測試＝prefers-reduced-motion 字串只准出現在 motionPreference.ts）。**bundle 基線（階段 1 後，develop 現況）：entry raw 1012.3／gzip 315.5／總 raw 1947.1 kB**（預算 1015／316／1950）。階段 2 完成（browseDrag.ts：lockAxis／dragOffset／settle／isInteractiveStart／startsInsideHorizontalScroller＋動畫常數）。階段 3 完成（useBrowseNav、固定 wrapper `data-browse-motion`、WAAPI 進場；紅燈 commit 只置換 slide-in class 斷言 4 條與「一般換篇不觸發回彈」1 條，其餘既有測試零修改）。**階段 3 後 bundle：entry raw 1012.7／gzip 315.7／總 raw 1947.5 kB**（對基線 +0.4／+0.2／+0.4，預算 1015／316／1950）。階段 4 完成（BrowseGestures 跟手；去向無鄰居時放開仍通知 onNavigate 以保留「已是最後一篇」播報，目前頭尾放開會同時有 wrapper 彈回與 contentRef 24px 回彈兩段——階段 5 併成單一 springBack）。下一步：階段 5 橫向溢出（overflow-x:clip）＋頭尾彈回統一。

舊記錄：
規劃已依 /review-plan 與主 session 裁決 W6-20 修訂（review.md P1-1～11 已併入 plan.md），待主 session 親審後請業主在本 session 親打 `/tdd-implement listing-swipe-transition`。

## Blockers(逃生口紀錄)

## 框架摩擦
