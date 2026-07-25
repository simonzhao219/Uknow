# 註冊姓名格式防呆 實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看,不要寫只有當下
     session 才懂的簡稱。 -->

分支:`claude/id-name-validation-safeguard-dkfahy`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 前端姓名格式規則(`validateName`) | ⬜ 未開始 | | |
| 2 | 後端共用姓名格式驗證(`/auth/register`、`/auth/profile`) | ⬜ 未開始 | | |
| 3 | 錯誤訊息文案/互動核對(`CompleteProfile.tsx`) | ⬜ 未開始 | | |

## 目前位置與下一步

規劃書已寫完,`/review-plan` 即將執行。**尚未開工**——開放問題(規則嚴格度、
是否要二次確認互動)須由人裁決後,才能由人親自打 `/tdd-implement
id-name-validation-safeguard` 啟動階段 1。

## Blockers(逃生口紀錄)

（尚無)

## 框架摩擦

（尚無)
