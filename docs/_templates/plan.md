# [Feature 名稱] 規劃書

<!-- 由 /plan-feature 從本模板實例化到 docs/plans/<feature>/plan.md -->

## 0. 一句話

這個 feature 讓〔誰〕能〔做什麼〕,因為〔為什麼值得做〕。

## 1. 使用者需求

- 對照規格書章節:`docs/uknow-software-specification.md#…`
- 使用者故事 / 驗收情境(可驗證的行為,不是實作描述)
- 不做什麼(明確排除,防範圍蔓延)

## 2. 系統設計

- 資料流:誰呼叫誰、資料從哪來到哪去
- API 變更(端點/參數/回應;冪等性與錯誤路徑)
- 資料庫變更(migration?RLS?)

## 3. 架構影響

- 動到哪些既有模組;與 appShell/路由 lazy 結構的關係
- 與 multi-step-flow 四契約的關係(若涉及多步驟流程)
- 效能/安全考量

## 4. UI/UX

- 頁面/元件變更;對照 `docs/ui-ux-guidelines.md` 的既有模式
- 行動版行為(本專案以行動版為主)
- 空態/錯誤態/載入態

## 5. 階段切分(每階段 = 一個 TDD 紅綠循環)

| # | 階段 | 測試落點(vitest / deno test / e2e) | 驗證標準 |
|---|---|---|---|
| 1 | | | |

<!-- 測試落點指引:純函式 → vitest node;元件行為 → vitest + jsdom pragma;
     後端 API → supabase/functions/api/*.test.ts;跨頁流程 → e2e .feature(CI 驗證) -->

## 6. 開放問題(逃生口——留白是合格產出)

<!-- 規格書模糊、兩案難決、需要商業判斷的,列在這裡等人裁決,禁止腦補硬編。 -->

- [ ] …

## 7. 風險與回滾

- 最壞情況是什麼;怎麼回滾
