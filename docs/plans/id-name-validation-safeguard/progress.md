# 註冊姓名格式防呆 實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看,不要寫只有當下
     session 才懂的簡稱。 -->

分支:`claude/id-name-validation-safeguard-dkfahy`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 前端 `validateName` 雙模式規則與分模式長度上限 | ⬜ 未開始 | | |
| 2 | 後端 `export` 姓名驗證函式,接進兩個端點 | ⬜ 未開始 | | |
| 3 | 撤銷 `profiles.name` 的 authenticated UPDATE GRANT | ⬜ 未開始 | | |
| 4 | 表單模式切換、長度連動、草稿、確認框合併 | ⬜ 未開始 | | |
| 5 | 收尾:規格書 §4.2 與 journey 姓名產生器同步 | ⬜ 未開始 | | |

## 目前位置與下一步

規劃已到 **v2**(依人審四項裁決重寫),**v2 四視角重審已完成**,結果寫在
`review.md` 的「v2 審查」節:**2 個 P0、16 個 P1、4 個 P2**。

**尚未開工,且依規則不得開工**——兩個 P0 都未處置:

1. **間隔號**:裁決「不接受標點符號」會擋掉原住民漢字音譯姓名
   (`谷辣斯·尤達卡`,身分證標準格式),這些人今天可正常註冊,實作後
   會被判非法——是規劃新增的迴歸。UI/UX 與需求兩視角獨立判 P0。
2. **`handle_new_user` INSERT 路徑**:v2 §3 的「六面向窮舉」只掃 UPDATE
   與 `.from('profiles')`,漏了註冊 trigger 從 `raw_user_meta_data` 寫入
   `profiles.name` 這條路。該路徑對外可達(公開 signup 端點、只需 anon
   key、免 OTP)且是 `security definer`,撤銷 GRANT 與 Edge Function 驗證
   對它都無效。需求視角判 P0、架構視角判 P2(理由:前端目前不帶 name
   metadata),依聚合規則不改判、併陳待裁決。

還有三項待裁決的設計取捨已列在 `review.md`「v2 處置」節的勾選清單:
切換鈕要不要有真正的強制力、外文是否接受全大寫、外文長度上限數字
(建議 50)。全部結清後才能由人親自打
`/tdd-implement id-name-validation-safeguard` 啟動階段 1。

## Blockers(逃生口紀錄)

（尚無)

## 框架摩擦

（尚無)
