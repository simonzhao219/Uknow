# 平台 UI/UX 全面重設計——進度看板

<!-- plans-keep: 進行中的跨 session 施工鷹架（S1–S8 尚未完工，工序見 construction-plan.md）；退場條件＝S8（G2）收尾時整個目錄刪除 -->

> 每個 session 開工先讀本檔，收工必更新。遺留事項只准記在這裡。

## Session 狀態

| # | Session | 工項 | 狀態 | PR | 備註 |
|---|---|---|---|---|---|
| S0 | 總綱與施工計畫 | — | ✅ 完成 | （本 PR） | 四個方向決策已與業主核對（plan.md §0）；四視角審查完成、P0×2/P1×7/P2×7 全數回填（review.md） |
| S1 | 設計語言地基 | D1+D2 | 🟡 規劃完成，停等人審 | [#316](https://github.com/simonzhao219/Uknow/pull/316) | 兩輪 `/review-plan` 皆無 P0；業主裁決六項。規劃書在 `docs/plans/design-language-foundation/`，實作由業主打 `/tdd-implement` 啟動 |
| S2 | 全站色彩收斂 | D3 | ⬜ 未開工 | — | 驗收站 1 |
| S3 | 後台資訊架構 | A1+A2 | ⬜ 未開工 | — | |
| S4 | 會員詳情重設計 | A3 | ⬜ 未開工 | — | 驗收站 2 |
| S5 | admin 資料快取 | A4 | ⬜ 未開工 | — | 驗收站 3 |
| S6 | 前台門面 | F1 | ⬜ 未開工 | — | |
| S7 | 會員區收尾 | F2+F3 | ⬜ 未開工 | — | 驗收站 4 |
| S8 | 制度化收尾 | G1+G2 | ⬜ 未開工 | — | 完工後刪除本目錄 |

## 計畫異動記錄

| 日期 | 異動 | 原因 |
|---|---|---|
| 2026-08-09 | 初版計畫建立 | — |
| 2026-08-09 | 四視角審查回填：A1 增 bootstrap 可達性裁決與標籤縮短、A2 界定為版面重構、A4 增四條硬約束（記憶體快取/排除清單/invalidation 表/DI 裁決）、F2 增會籍失效狀態、§2.6 改為人工同步規格書 | 審查發現兩個 P0 與七個 P1，詳見 review.md |
| 2026-09-01 | construction-plan 增 §6「PR 合併後的部署與達標驗證」：部署管線摘要（Cloudflare Pages＋Supabase 自動部署、晉升 SOP）與六痛點對應的機械/人工雙層驗證表 | 業主要求明文化「合併後怎麼上線、怎麼確認達標」 |
| 2026-09-14 | rebase 到 develop（#310–#313 之後）並重新評估：計畫內容不受影響（Footer 精簡/聯絡改純文字/推薦碼改數字流水號皆不與工項重疊），僅更新四處行號引用（規格書 §13 兩處、`api/index.ts` PII 兩處） | develop 前進造成引用位移；週期性重評估 |
| 2026-09-14 | S1/S3/S4/S5 開工 prompt 補「先切 `feature/<slug>` 分支」一行 | web session 預設生在 `claude/*` 分支，三段式守衛只認 `feature/<slug>`，prompt 不該依賴 session 記得讀 CLAUDE.md 那段 |
| 2026-09-14 | S1 重量由「中」調整為「中偏重」，實作模型維持 Sonnet；施工中的 session 可能需兩次對話（中途 `/clear` 續作），狀態靠 `docs/plans/design-language-foundation/progress.md` 接續 | S1 兩輪四視角審查共回填 P1×12 / P2×13，新增 C3 原始色值規則、`--destructive` 兩組 token、對比斷言翻倍（border 3:1、裸字對兩底色）、灰階對照表（39 處/15 檔）與 G1 完整性檢查、色盲 checklist。依 construction-plan §4.4「計畫要改就在 progress.md 記一行異動」 |

## 遺留事項

（無）
