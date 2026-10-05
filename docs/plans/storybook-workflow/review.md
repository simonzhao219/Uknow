# Storybook 導入與元件層流程改造——規劃書審查報告

<!-- 由 /review-plan 彙整四個 reviewer subagent（系統／架構／UI-UX／需求）的發現而成。
     審查對象：docs/plans/storybook-workflow/plan.md（R0，2026-10-04）。
     主 session 只彙整、去重、排序，不改判；P1 的回填寫在「處置」節，
     需要業主裁決的列「需人工裁決」。回填後的規劃是 plan.md R1。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 7 | 5 | `ci-ok` needs 不變、`storybook build` 與 bundle 預算不衝突、`tdd-unlock` 推論本身、Pages workflow 與規則 3／5／6／11 相容、`supabase/functions/` 零變更 |
| 架構 | 0 | 8 | 11 | appShell 契約與 lazy 結構、12 個 `vi.mock('../App')`、ESM-only、框架慣例（`decide()`／`--self-test`／C1／C3）、兩工程的 `plans-keep` 不衝突 |
| UI/UX | 0 | 9 | 5 | 資訊架構（無新入口、不動 BottomNav 五格契約本身）、畫面零變化的承諾 |
| 需求 | 0 | 8 | 6 | 「不做什麼」（截圖比對沒被偷渡）、業務規則零接觸、PR 範本、驗收站 A、CLAUDE.md 淨增 0 行可行 |

四個視角都沒有 P0。32 條 P1 去重後是 14 個主題，全數回填進 plan.md R1
（對應見「處置」）；27 條 P2 回填 19 條，其餘列「需人工裁決」或記為實作期驗證項。

## 發現清單（去重後，依嚴重度排序；〔〕內為原報告的規劃書章節）

### P1

1. **〔§2 測試矩陣／§5a 階段 2–3〕三個 instance 共用同一個 play，但斷言是 instance 專屬的**（系統・架構・UI-UX 三方）：Button 的 ≥44 在 desktop 必紅、`#451a03` 只在 dark 成立；per-instance 主題注入機制沒寫；computed style 回 `rgb()` 不是 hex。→ 拆成三個 project、階段 2 當 spike 先驗注入機制、`currentInstance()` 分支斷言、值先正規化。
2. **〔§5a 階段 3〕stories 寫 hex 會撞 `check-color-usage.py` C3(a)**（架構・需求）。→ 斷言比對 CSS 變數的 computed 值，stories 不得手刻色。
3. **〔§3 vitest.config〕`projects` 漏 Vitest 4 的繼承語意**（系統）：不寫 `extends: true` 既有測試整批紅，`coverage` 只能放 root。→ 補進 §3 與階段 1 驗證（`vitest list` 逐檔相同）。
4. **〔§3 容器／§7〕Chromium 路徑與 Playwright 版本處理錯**（系統・架構）：真實路徑是 `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`；`PLAYWRIGHT_CHROMIUM_EXECUTABLE` 不是 Playwright 認得的變數；e2e 已 pin 1.56.0＝build 1194。→ npm `playwright` 釘 1.56.0（D2），退路改讀 `PLAYWRIGHT_BROWSERS_PATH`。
5. **〔§3 CI〕「Chromium 快取與 e2e 同鍵」會失效**（系統・架構）：鍵只綁 `e2e/requirements.txt`，先存者永遠佔位。→ 鍵改含 `package-lock.json`。
6. **〔§2 閘門／#1／§7〕「check 納入 stories」與「無 Chromium 時 stories 只在 CI 跑」互斥，會死鎖**（系統・架構・UI-UX）。→ D1 納入＋D2 容器必須能啟 Chromium、找不到就明確失敗不降級；啟不動是階段 2 blocker。
7. **〔§3／§5a 階段 4〕`UserContext` re-export 達不到隔離目的**（系統・架構）：元件自己 `from '../App'`。→ D6 codemod 21 處 import＋12 個 `vi.mock`；同 PR 改規格書 §1.2 與 CLAUDE.md 那行（原 P2 併入）。
8. **〔§3 守衛〕S1 自己的紅燈期沒有 stories 鎖**（系統・架構）。→ D7 擴鎖提前成階段 0。
9. **〔S3 rules〕`storybook.md` 的 `paths` 不含元件檔，最需要時不在 context**（架構）。→ paths 加 `src/components/**/*.tsx`。
10. **〔§2 資料／S2 範圍〕「吃 props」判準太粗、範圍表歸錯類**（系統・架構・UI-UX・需求）：Navbar／MaintenanceBanner 內含 fetch 卻列外殼；admin 的 loader 注入元件最適合 story 卻沒列，「P4 受益最大」被高估；Skeleton 重複計。→ 元件分三類（資料 props／loader 注入／內含 fetch），S2 拆三個 PR、PR-c 專收 admin 且排在 uiux S3 前；P4 的敘述改成有條件。
11. **〔#3／§2／§4〕a11y `'error'` 的例外基線只有口號；既有 ui/ 債會讓 S2 卡死或放水；修債與「畫面零變化」衝突**（UI-UX・需求・架構）。→ 全域關頁面級規則、例外只准 per-rule＋理由、`story-health-baseline.json` 的 `a11y` 區棘輪、階段 5 先空跑產出清單；「畫面零變化」限 S1；修還是入基線列開放問題 #2。
12. **〔§4 必備內容〕story 慣例漏了準則與 friction-log 的要求**（UI-UX・需求）：44px 通則與「桌機不放大」、overlay 開啟態、鍵盤斷言、最壞但可達測資、突變驗證、斷言寫目標、§10 溢字、§13 條件按鈕、LINE 分支變體、擇一渲染兩套斷言。→ 全部寫進 §4，唯一本體在 rules。
13. **〔§5／#2〕jsdom 退場沒有「不得搬」清單；BottomNav 的 flag 契約與 token 形狀測試會失守**（UI-UX・架構）：FeatureProvider 寫死全開且 context 未 export。→ jsdom 保留清單（跨斷點 state、契約型、hook 測試、story 無法表達者）；階段 4 不處理 flag 注入、`BottomNav.test.tsx` 不動。
14. **〔§1 溯源／§5 流程表〕溯源有兩則對不上；流程表漏 `/fix-bug`、`layout_probe.py`、uiux S8 G1 的檔案衝突、uiux S3／S4 prompt 的同步；自動化範圍（§12.8「前兩步自動」）誇大；驗收 B 與 §8.1 判準不可驗**（需求・UI-UX・架構）。→ §1 改成缺口→工項對照表並移除 08-07 那則；§5 增列 fix-bug／layout_probe／規則存放三列；§4 與 §5 寫實自動／人工分工並進 PR 範本；驗收 A／B 改可勾項；§8.1 三條常態化判準；§7 約定 S3 先於 uiux S8、S3 同步 uiux prompt。

### P2（已回填）

- 覆蓋率跨 project 合併稀釋棘輪語意（系統）→ D5 只量 unit。
- `server.open: true` 與 `resolveSupabaseTarget` 副作用（系統）→ §3 `viteFinal` 關 `open`；D9 `CF_PAGES_BRANCH=storybook`（系統原列 P1「Storybook 建置會指到正式站 Supabase」，併入此處與 D9）。
- Biome 2 對 `!src/components/ui` 之後的 include 行為無證據（系統・架構）→ 階段 2 實測「故意放 lint 錯誤會紅」。
- `deploy-storybook.yml` 用 push 不等 CI 綠（系統・架構）→ D10 `workflow_run`。
- browser mode 冷啟動 dep 預打包的 reload（系統・架構）→ 階段 2 `optimizeDeps.include`＋連跑三次。
- `check-story-coverage.py` 的元件定義與排除沒寫、兩種性質混在一個 baseline（系統・架構）→ 改名 `check-story-health.py`，`debt`／`excluded`／`a11y` 三區，`--self-test` 含正反案例。
- stories 命名與 `test-naming.md` 分層沒銜接（架構）→ §4 命名一條、S3 補列。
- `vitest --project` 無 `run` 會進 watch（架構）→ D11。
- 同一規則預計寫進八處（架構）→ 唯一本體 `storybook.md`，其餘一句指標。
- 設定全放階段 7，階段 2–6 的 story 沒被 lint（架構）→ 隨階段 2 落地。
- 規格書 §1.2／CLAUDE.md「`App.tsx` 的 `UserContext`」會失真（架構・需求）→ 階段 4 同 PR 改。
- 「57 檔 jsdom」含 hook／utils 測試（需求）→ §5 改成約 45 檔元件測試、9 檔 hook 永久留 unit。
- CI 估算以檔數不以 story 數（需求）→ §7 改「story 數 × 3」。
- 開放問題 #4／#5 不是業主決策（需求）→ 移入 §0.2 的 D3／D4。
- 六支 hooks 不是五支；外部事實沒出處（需求）→ §8 補來源與查證日、更正數量。
- `repoHygiene.test.ts` 對 `.tsx` 沒有個資掃描（架構原列 P1）→ D9 新增兩條，階段 6 落地。
- 驗收 B 排在大量 story 投資之後、手機 manager 可達性未驗（UI-UX）→ 驗收 A 先由 Claude 以 iPhone 模擬截圖；直連 `iframe.html` 範例當退路。
- §13 條件按鈕與狀態卡、溢字通用斷言、LINE 分支變體、md 斷點邊界（UI-UX）→ §4 必備內容各一條；768 邊界的跨斷點切換留 jsdom 保留清單。

### P2（未回填，記為實作期驗證或留原狀）

- Vitest browser instance 是否能各自帶 Storybook `initialGlobals`（架構，離線無法查）→ 階段 2 spike 的第一件事。
- `isMobile`／`hasTouch` 是否經 Vitest 的 iframe tester 傳到頁面（系統・架構）→ 階段 2 的紅燈本身就會驗（量不到 44 就是沒傳到）。
- S1 可能兩次對話的切分點（需求）→ 開放問題 #5。
- 「Fable」不在 CLAUDE.md 分級表（需求）→ Fable 5.1 是現行可用模型（本 S0 session 即是）；分級表要不要加列，交 S3 在 CLAUDE.md 0 行預算內決定，本工程不另立項。

## 需人工裁決（已整理成 plan.md §6 開放問題 #1–#6）

- #1 深色 instance 第一期必過還是 axe 先 per-rule `'todo'`（需求 P1；UI-UX 建議納入 dark 渲染但降 axe）。
- #2 既有 a11y 債修還是進基線（UI-UX・需求・架構三方標需裁決）。
- #3 提前公開未上線 UI 到 Pages、是否 `noindex`（需求 P2）。
- #4 接受 uiux 主線卡約一週（架構 P2）。
- #5 S1 兩次對話的切分點（需求 P2）。
- 另：§0.2 的 D1–D11 是規劃者在審查後定案的設計決策，業主可在人審推翻。

## 處置（人審後填寫）

<!-- P0 的處置規則：必須改 plan 並重跑 /review-plan，或由人在此明文豁免。
     tdd-implement 開工前會檢查：存在未處置 P0 → 拒絕開工。 -->

- 無 P0。P1 ×14（去重）全數回填進 plan.md R1（§0.2 D1–D11、§1 對照表、§2、§3、§4、§5、§5a 階段 0 與 2、§7、§8）與 construction-plan.md（S2 三個 PR、S3 範圍、S1／S4／S5 prompt、驗收 A／B 可勾項）。
- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：）□ 退回重規劃
- [ ] 開放問題 #1–#5 已裁決並記入 progress.md（#6 留待 S4）
