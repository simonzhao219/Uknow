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

規劃書與四視角審查(`review.md`)皆已完成。**尚未開工**——審查有 1 個 P0
(`profiles.name` 的既有 DB GRANT 讓規劃的 Edge Function 防線可被直接
繞過)、8 個 P1、4 個 P2、1 項需人工裁決,依規則 P0 未處置前不得開工。
須由人裁決 P0 的處置方式(三選一:撤銷 GRANT / 加 DB 層防線 / 明文接受
殘留風險)與開放問題(規則嚴格度含原住民羅馬拼音姓名、是否要二次確認
互動、既有錯誤資料規模清點),裁決後才能由人親自打 `/tdd-implement
id-name-validation-safeguard` 啟動階段 1。

## Blockers(逃生口紀錄)

（尚無)

## 框架摩擦

（尚無)
