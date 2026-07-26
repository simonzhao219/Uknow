# 註冊姓名格式防呆 實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看,不要寫只有當下
     session 才懂的簡稱。 -->

分支:`claude/id-name-validation-safeguard-dkfahy`
規劃書:`./plan.md`(v4)|審查:`./review.md`(三輪;v3 已無 P0)

## 階段狀態

<!-- 階段定義以 plan.md §5 為準,本表只追蹤狀態。 -->

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 前端 `validateName` 依模式驗證 + 分模式長度 + `ProfileFormValues` 型別 | ⬜ 未開始 | | |
| 2 | 後端 `export` 驗證函式(聯集、重用 `HAN_RANGE`、型別防禦)+ `maskNameByGen` export + 常數搬家 | ⬜ 未開始 | | |
| 3 | 前置:anon key + PostgREST helper + `createTestUser` 改 service_role 直寫;主體:migration 撤 GRANT + 改 `handle_new_user` | ⬜ 未開始 | | |
| 4 | 表單切換鈕、長度與計數器警示態、間隔號主動轉換、兩條 prefill 模式還原、草稿 allow-list、確認框合併與旗標重置 | ⬜ 未開始 | | |
| 5 | 收尾:規格書 §4.2、journey 姓名產生器 + 新增 `tools/` 離線測試、後台 `IdCardDialog` 說明 | ⬜ 未開始 | | |

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

規劃 PR #133(v3 + v1/v2 審查)已合併進 develop,規劃檔因此可跨 session
取用。**v3 的 10 個 P1 與 7 個 P2 已全數折入 plan v4**(逐項對應表見
`review.md` 的「v3 處置」節)。

**規劃已無開工阻擋項。** 下一步是由人親自打
`/tdd-implement id-name-validation-safeguard` 啟動階段 1。

### 開工前仍須結清的兩項查證(§6,可與實作並行,但須在階段 1 定案規則前完成)

1. **`HAN_RANGE` 缺字族群的規模**——該正則不含擴充 B 區以上與造字區,
   對應戶政「缺字」問題。它過去只決定遮罩樣式(不匹配僅是樣式不精準),
   這是第一次被當註冊關卡,同一落差的後果變成「完全無法註冊」。以既有
   `profiles.name` 樣本查證是否為真實會撞到的族群。
2. **純羅馬拼音登記姓名的分隔慣例**——外文模式僅允許 `A-Z`/`a-z` 與單一
   半形空格。若官方轉寫慣例本就用空格則非問題;若另有分隔符號慣例,
   外文模式需延伸相同容許。

### v4 相對 v3 的關鍵變更(實作時最容易踩的三處)

1. **§2.5(b) 已補「基準版本 + 唯一差異」的明文指示**——
   `create or replace function` 是整段覆蓋,漏抄推薦碼解析邏輯會靜默清空
   日後所有新註冊使用者的 `referred_by_user_id`。階段 3 已加一條專門的
   防漏抄驗證。
2. **§2.6 已拍板 `createTestUser` 採 service_role 直寫**(不是二選一)
   ——走 `/auth/register` 會讓測試使用者的 `registration_step` 從 0 變 1,
   打壞 `registration-step-contract.test.ts`;該 helper 有 132 處呼叫。
3. **階段 5 的測試落點已改為新增 `e2e/journey/tools/` 下的離線測試**——
   原本填的 `pytest tools/` 根本不覆蓋 `run_state.py`,照字面執行會全綠
   卻什麼都沒驗到。

## Blockers(逃生口紀錄)

（尚無)

## 框架摩擦

（尚無)
