# 任務收藏（canonical 範例——示範填寫密度，虛構小功能）

## 0. 一句話

讓會員能收藏任務，之後從「我的收藏」快速回訪，因為任務列表每日更新、
使用者反映找不回昨天看過的任務。

## 1. 使用者需求

- 規格書 §4.2 任務瀏覽（收藏是其延伸，規格書未明文——已列開放問題 #1）
- 故事：會員在任務卡點星號 → 星號變實心；到「我的收藏」看到該任務；再點取消
- 不做：收藏數排行、收藏通知、訪客收藏（會員功能）

## 2. 系統設計

- 新表 `task_favorites (user_id, task_id, created_at)`，PK=(user_id, task_id)
  ——複合主鍵天然冪等，重複收藏不報錯
- API：`POST /tasks/:id/favorite`、`DELETE /tasks/:id/favorite`、
  `GET /favorites`（走既有 apiClient，RLS：user_id = auth.uid()）

## 3. 架構影響

- TaskDashboard 加星號按鈕；新頁 FavoritesPage 掛在會員區 lazy 群組
- 不動 appShell 契約；無多步驟流程，四契約不適用

## 4. UI/UX

- 星號沿用 lucide `Star`/`StarOff`，位置比照 UI_UX_Analysis 的卡片操作區慣例
- 空態：「還沒有收藏任務」＋回任務列表 CTA；載入態沿用置中 spinner

## 5. 階段切分

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | favorite API（含冪等） | supabase/functions/api/favorites.test.ts | 重複 POST 回 200 不重複入列 |
| 2 | 收藏狀態純函式（toggle/列表合併） | src/utils/favorites.test.ts（node） | 全情境綠 |
| 3 | 星號按鈕與收藏頁 | src/components/…test.tsx（jsdom pragma） | 點擊切換＋空態呈現 |

## 6. 開放問題

- [ ] 收藏是否計入規格書 §4.2 的「瀏覽紀錄」？（規格書未明文，影響資料表設計）

## 7. 風險與回滾

- 純加法（新表/新端點/新頁），回滾 = revert PR＋drop table，無既有行為變更
