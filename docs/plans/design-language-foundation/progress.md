# 設計語言地基（D1+D2）實作進度

<!-- plans-keep: 上游 platform-uiux-redesign 工程的 S1 施工鷹架，跨 session
     （Opus 規劃／Sonnet 實作）需要 git 當唯一通道；退場條件＝S1 的
     /tdd-implement 收尾時連同整個目錄刪除（規則已升級進
     docs/ui-ux-guidelines.md 的色彩章節，不靠本目錄存活）。 -->

<!-- 外部記憶：每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支：`feature/design-language-foundation`
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）
上游：`docs/plans/platform-uiux-redesign/`（S1 = 工項 D1+D2）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 語義色 token 進 globals.css（三處齊備） | ⬜ 未開始 | | |
| 2 | 對比度門檻（淺/深各 ≥4.5:1） | ⬜ 未開始 | | |
| 3 | check-color-usage.py 判定邏輯（--self-test） | ⬜ 未開始 | | |
| 4 | baseline 產生 + 接進 framework-check | ⬜ 未開始 | | |
| 5 | ui-ux-guidelines 色彩章節 + devtools checklist | ⬜ 未開始 | | |

## 目前位置與下一步

規劃已產出，`/review-plan` 四視角審查完成（見 `./review.md`），**停在等人審**。
結果：**P0 × 0、P1 × 9、P2 × 10**，無阻擋項。

待業主裁決的有兩組：
1. 規劃書自列的開放問題 **Q1–Q5**（`plan.md` §6）——其中 Q2/Q5 依審查 P2-9
   實為「請確認」而非「請裁決」。
2. 審查新增的 **P1-9**：`plans-keep` 標記與 friction-log 2026-09-02 的明文判定
   相牴觸（該條說「用它等於說謊」），本 session 沿用了上游的同一做法。

Q1（destructive 補不補 subtle）、Q4（藍色是否全面退場）、P1-9 會改變
P1-2/P1-3/P1-6/P1-8 的回填內容，所以**回填 P1 要等這三項裁決之後**，
回填完重跑一次 `/review-plan`。

下一步由**業主親自打 `/tdd-implement design-language-foundation`** 啟動實作
（那道鎖是「人審通過才實作」的唯一保證）。

## Blockers（逃生口紀錄）

（無）

## 框架摩擦

1. web session 預設生在 `claude/*` 分支，三段式守衛只認 `feature/<slug>`——
   已由上游 construction-plan §3 的開工 prompt 補一行 `git checkout -B` 處理，
   本 session 照做無摩擦。（已知項，不需再記 friction-log。）
2. **`plans-keep` 被當成三段式流程的通行證**（審查 P1-9）——friction-log
   2026-09-02 已記過同一件事並把修法留給整併（改判準：draft PR／progress 全綠／
   分支有無產品 commit），至今未做，於是每個照三段式走的 feature 都會再撞一次、
   再貼一次標記。這是**第二次**踩到同一個坑，整併時應優先處理。
3. `model-effort-advisor` hook 在本 session 誤報三次：關鍵字（金流/會籍/獎勵/
   migration/payuni）命中的是**審查報告引用的上游 persona 描述與檔名**，
   不是本次改動的性質（本 session 全程只寫 markdown）。建議整併時讓它看
   改動的檔案路徑而非提示詞字面——與 P1-9 同形：hook 判斷用的訊號不是它想問的那件事。
