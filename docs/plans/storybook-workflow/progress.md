# Storybook 導入——進度看板

<!-- plans-keep: 進行中的跨 session 施工鷹架（S1–S5 尚未完工，工序見 construction-plan.md）；退場條件＝S4 合併且 S5 試點結論記入本檔後，整個目錄刪除（plans-keep 的判準衝突已記 friction-log 2026-09-14，整併時一併處理） -->

> 每個 session 開工先讀本檔，收工必更新。遺留事項只准記在這裡。

分支：S1 `feature/storybook-workflow`（其餘見 construction-plan §2）
規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## Session 狀態

| # | Session | 範圍 | 狀態 | PR | 備註 |
|---|---|---|---|---|---|
| S0 | 規劃與審查 | plan／construction-plan／progress＋四視角審查 | 🟡 待人審 | （本 PR） | 四個方向決策已與業主核對（plan.md §0.1）；四視角 P0×0／P1×32（去重 14 主題）／P2×27，P1 全數回填成 R1（review.md）；規劃者定案 D1–D11（§0.2）；開放問題 #1–#5 等業主裁決 |
| S1 | 工具鏈 | plan.md §5a 七階段 | ⬜ 未開工 | — | Opus；驗收 A |
| S2 | 寫 stories | 三個 PR：ui／composite／admin | ⬜ 未開工 | — | Sonnet；PR-c（admin）排在 uiux S3 前 |
| S3 | 流程改造 | rules／守衛／模板／CLAUDE.md 0 行 | ⬜ 未開工 | — | Opus 或 Fable；合併後才開 uiux 工程 S3 |
| S4 | 部署與 AI 入口 | GitHub Pages／MCP 試用／可選 M1 | ⬜ 未開工 | — | Sonnet；驗收 B；合併後業主設 Pages Source |
| S5 | Claude Design 試點 | 綁 uiux 工程 S4 | ⬜ 未開工 | — | 驗收 C；結論決定是否常態化 |

## S1 階段狀態（三段式）

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 0 | `tdd-test-guard` 擴鎖到 `*.stories.tsx` | ⬜ 未開始 | | |
| 1 | Vitest 3.2→4.1（`extends: true`、coverage 只量 unit、playwright 釘 1.56.0） | ⬜ 未開始 | （無紅燈，逃生口 1） | |
| 2 | spike：Storybook 10.6＋三個 `sb-*` project＋`currentInstance()`＋設定落地＋Button story | ⬜ 未開始 | | |
| 3 | 主題 decorator＋per-project 主題（斷言比 CSS 變數不寫 hex） | ⬜ 未開始 | | |
| 4 | 外殼 decorators＋UserContext codemod＋規格書 §1.2／CLAUDE.md 一行 | ⬜ 未開始 | | |
| 5 | a11y addon `'error'`＋頁面級規則關閉＋全 ui/ 空跑清單 | ⬜ 未開始 | | |
| 6 | CI（快取鍵改）＋hygiene 兩條 | ⬜ 未開始 | | |
| 7 | 設定收尾 | ⬜ 未開始 | | |

## 目前位置與下一步

S0 規劃完成、四視角審查已跑並回填成 R1（見 review.md）。下一步：業主看 plan.md
§0.2 的 D1–D11（可推翻）、裁決開放問題 #1–#5 並勾 review.md 處置節 → 合併本 PR
→ 開 S1 session（Opus）。

## 計畫異動記錄

| 日期 | 異動 | 原因 |
|---|---|---|
| 2026-10-04 | 初版計畫建立；四個方向決策（角色定位／托管／Claude Design／mods）與業主核對 | — |
| 2026-10-04 | 四視角審查回填（R1）：三個 `sb-*` project＋`currentInstance()`、斷言比 CSS 變數、Vitest `extends: true`、playwright 釘 1.56.0、check 納入 stories 且容器必須能啟 Chromium、`UserContext` codemod、守衛擴鎖提前成階段 0、rules paths 含元件檔、元件三分類與 S2 三個 PR、a11y per-rule 例外與 `story-health-baseline.json`、jsdom 保留清單、story 必備內容補十項、流程表補 fix-bug／layout_probe／規則存放、§12.8 自動／人工分工寫實、驗收 A／B 可勾項、§8.1 常態化判準、與 uiux S8 的順序約定 | review.md P1×14（去重）、P2×19 |

## Blockers（逃生口紀錄）

<!-- 1. 紅燈一寫就綠 → 記錄後跳過；2. plan 有誤 → 停手求裁決，禁止私改；3. 綠不了 → 記嘗試過什麼 -->

## 遺留事項

- （無）

## 框架摩擦

- 本目錄沿用 `plans-keep` 標記讓 `check-plans-scaffold.py` 綠——與 friction-log
  2026-09-14「plans-keep 正在變成三段式流程的萬用通行證」同一個衝突（第三次）；
  不在本工程修，整併時改判準。
