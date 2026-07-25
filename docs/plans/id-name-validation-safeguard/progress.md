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

規劃已到 **v3**(經兩輪人審共九項裁決)。**三輪四視角審查全部完成**,
結果依序記在 `review.md` 的 v3 / v2 / v1 三節(新的在上)。

- v1:1 P0、8 P1、4 P2 → 人審四項裁決 → v2
- v2:2 P0、16 P1、4 P2 → 人審五項裁決 → v3
- **v3:0 P0、10 P1、7 P2、1 項需人工裁決**

**v3 無 P0,不再有開工阻擋項。** 四個視角都先逐項核實 v1/v2 的處置為真實
處置(逐行核對程式碼行號),非文字循環。v3 的 10 個 P1 幾乎全是「設計是
對的、後果沒寫完」型——補幾句話、把一個二選一拍板、補一個測試探針——
不需要推翻設計重來。

規劃 PR #133 已合併進 develop(規劃檔因此可跨 session 取用)。**v3 的
發現尚未折入規劃書**,那是下一步:把 10 個 P1 寫成 v4(多為文字增補),
再由人親自打 `/tdd-implement id-name-validation-safeguard` 啟動階段 1。

開工前最值得知道的三項(完整清單見 `review.md` v3 節):

1. **§2.5(b) 必須補完整 SQL**——`create or replace function` 是整段覆蓋,
   規劃只摘錄了要改的那一行,實作者漏抄推薦碼解析邏輯就會靜默清空日後
   所有新註冊使用者的 `referred_by_user_id`。
2. **`createTestUser` 的二選一要拍板成 service_role 直寫**——走
   `/auth/register` 會讓測試使用者的 `registration_step` 從 0 變 1,打壞
   `registration-step-contract.test.ts`;該 helper 有 132 處呼叫。
3. **`/auth/register` 身兼新註冊與編輯**——舊帳號(含刻意不清洗的髒姓名
   族群)按「編輯」只想改手機,也會因整份表單重驗而被新規則擋死,牴觸
   §1/§7「不回溯校驗」的框架陳述。

## Blockers(逃生口紀錄)

（尚無)

## 框架摩擦

（尚無)
