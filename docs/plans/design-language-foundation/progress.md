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
| 1 | 語義色 token 進 globals.css（三處齊備） | ✅ 完成 | bddc4ba | d862878 |
| 2 | 對比度門檻（淺/深各 ≥4.5:1） | ✅ 完成 | 57e2681 | 90e78b7 |
| 3 | check-color-usage.py 判定邏輯（--self-test） | ✅ 完成 | bc4bfc0 | 7a41f64 |
| 4 | baseline 產生 + 接進 framework-check | ✅ 完成 |（非 TDD 相位——接線與文件，驗證靠既有閘門）| 71fef3e |
| 5 | ui-ux-guidelines 色彩章節 + devtools checklist | ✅ 完成 | 04a985b | （待填） |

## 目前位置與下一步

`/review-plan` 跑了**兩輪**，結果都無阻擋項：

| 輪次 | 對象 | P0 | P1 | P2 | 處置 |
|---|---|---|---|---|---|
| 1 | 修訂 1 | 0 | 9 | 10 | 全數回填 → 修訂 2 |
| 2 | 修訂 2 | 0 | 3 | 3 | 全數回填 → 修訂 3 |

第 2 輪的四位 reviewer 逐項核實第 1 輪的 19 條發現，**全部確認回填正確**，
無一是「寫了但沒真的解決」；需求視角另確認**回填未造成範圍蔓延**
（§3.1 動到的檔案表零元件檔案，未侵入 D3/S2）。

業主裁決共六項（第 1 輪四項、第 2 輪兩項），見 `./review.md`〈處置〉節。

**現在：停等人審**。核准後由**業主親自打
`/tdd-implement design-language-foundation`** 啟動實作。

### 實作者必讀（相對原始開工 prompt 的增量）

開工 prompt 只講了四件交付物，兩輪審查把它們的內部細節補完了。動工前先看這幾點：

- **階段 1** 多驗一件事：`@theme inline` 的**值指向**，不只 key 存在〔P1-7〕
- **階段 2** 斷言數約翻倍：border 走 3:1（非 4.5:1）〔P1-2〕、裸字對
  `--background` 與 `--card` 各驗〔P1-3〕，淺深兩版各自跑；並含
  `.dark` 的 `--destructive` **與 `--destructive-foreground`** 兩個 oklch→hex 轉換〔P1-8、R2-系統-1〕
- **階段 3** 的 **C3 規則**（原始 hex 字面值 + 任意值語法）與 baseline 的
  `{c1,c2,c3}` 分列，是審查新增、原規劃沒有的〔P1-1、P2-7〕；
  正則要涵蓋 **3 位數簡寫**（`'#000'` 實際存在）且不誤抓非色彩 hex-like 字串〔R2-系統-2、R2-需求-1〕
- **階段 5** 新增 **G1 段**：灰階對照表的完整性由腳本把關，缺列即紅〔R2-架構-1〕
- 灰階對照表本身（39 處 / 15 檔）是 S1 的額外交付物〔P1-6〕

### 重量異動

〔R2-架構-2，業主裁決〕回填後 S1 明顯增重（上游原標「重量：中」）。
**不拆 session／分支／PR**——S2 同時依賴 token 與守門腳本，拆開只是把依賴從
session 之間搬到 PR 之間。**實作仍用 Sonnet**，但
**實作可能需要兩次對話、中途 `/clear` 續作屬預期內**——框架本來就為此而設，
本檔就是 rehydrate 起點。

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

以上第 2、3 條已於 2026-09-14 整併進 `docs/plans/friction-log.md`。
