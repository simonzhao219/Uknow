# PostHog 監控與錄影 實作進度

<!-- plans-keep: 與 plan.md 同為鷹架，隨 /tdd-implement 收尾刪除 -->

分支:`feature/posthog-monitoring`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 設定純函式與 key 目標 | ✅ | a017aea8 | 5c6cab3b |
| 2 | 懶載入 facade | ⬜ 未開始 | | |
| 3 | 接線與預算 | ⬜ 未開始 | | |
| 4 | 敏感欄位 block | ⬜ 未開始 | | |
| 5 | 文件與收尾 | ⬜ 未開始 | | |

## 目前位置與下一步

階段 1 綠（40 測試）。下一步：階段 2 懶載入 facade＋真實 SDK 外送驗證——第一步先驗證 rrweb 在 jsdom 可行（不可行才改第二個 dev server＋Playwright）；需先 `npm i posthog-js@1.445.5`（精確版本）。

## Blockers(逃生口紀錄)

## 框架摩擦
