# Storybook 導入——施工計畫（工序・分工・監工）

> 搭配同目錄 `plan.md`（設計與決策）與 `progress.md`（進度看板）使用。
> 額度前提：Max 20x，session 主要跑在 claude.ai/code（web）。
> 與 `platform-uiux-redesign` 的關係：**本工程 S1–S3 排在該工程 S3 開工之前**；
> S4 可與該工程 S3 交錯；S5 綁該工程 S4。

## 1. 工序總覽

```
S1 工具鏈 ──► S2 寫 stories ──► S3 流程改造 ──► S4 部署與 AI 入口 ──► S5 Claude Design 試點
 (Vitest 4＋SB 10    (ui/＋複合元件     (rules／守衛／模板    (GitHub Pages／MCP     (綁 uiux S4，
  ＋三 instance       ＋a11y 全綠)        ／CLAUDE.md 0 行)     ／可選 M1 mod)         試一次再決定)
  ＋外殼 decorator)
                                            ▲
                                            └── uiux 工程的 S3 後台資訊架構在這之後才開工
```

- S1→S2→S3 是硬依賴：沒有 project 與 instance 就沒地方跑 story；沒有 stories
  就沒有覆蓋基線可以棘輪；沒有 rules 與守衛，S2 寫完的慣例在下一個 session 就漂。
- **一個 session = 一條分支 = 一個 PR**，合回 develop 才開下一個。
- S1 是**三段式落檔**（本目錄就是它的規劃書，分支 `feature/storybook-workflow`
  與目錄 slug 相同，守衛會放行）；其餘走 Plan Mode。

## 2. Session 分工表

> 模型依 CLAUDE.md 分級表：跨層設定／動到所有測試／改 hook 用 Opus，機械性
> 大量產出用 Sonnet。web session 不能逐段調 effort，粒度就是「選模型＋切小」。

| # | Session | 範圍 | 分支 | 流程 | 模型 | 重量 |
|---|---|---|---|---|---|---|
| S0 | 規劃與審查 | plan／construction-plan／progress＋四視角審查 | `claude/*`（本 PR） | 落檔＋`/review-plan` | Fable | 輕 |
| S1 | 工具鏈 | plan.md §5a 階段 0–7：守衛擴鎖、Vitest 4、Storybook 10.6＋三個 `sb-*` project（階段 2 是 spike）、主題與外殼 decorator＋`UserContext` codemod、a11y 空跑清單、CI、收尾 | `feature/storybook-workflow` | 三段式（`/tdd-implement storybook-workflow`） | **Opus** | 中偏重（可能兩次對話） |
| S2 | 寫 stories（三個 PR，依序不平行） | **PR-a `ui/`**：23 個原語（Skeleton 在此、不重複計）；**PR-b 複合與外殼**：資料 props 類（common 的 CategoryBadge／FilterChip／FilterCountBadge／GenderBadge、dashboard 兩個、home 三個、notifications 的 ToastCard／NotificationCard、task 的 ProgressBar、referral／reward 的純呈現元件、BottomNav／Footer）；**PR-c `Admin/`**：loader 注入類（MemberManagement／WithdrawalManagement／IdReviewQueue／兩個 CardList／CardOverflowMenu／WithdrawalFundingFields，用假 async 函式）——**排在 uiux S3 之前**。內含 fetch 的（Navbar／MaintenanceBanner／ThreeStepDialog／IdNumberInput／RewardHistory／SystemAlerts／SystemNotifications／AdminSetup／頁級）進 `excluded` 清單，第一期不寫。每個 PR：三態齊、最壞但可達測資、a11y 依開放問題 #2 裁決、只刪有等價證據的 jsdom 斷言（保留清單不動） | `chore/storybook-stories-{ui,composite,admin}` | Plan Mode（每個 PR 先列「元件 × 狀態」矩陣與 jsdom 刪除對照表給業主過目） | Sonnet | 中×3 |
| S3 | 流程改造 | `.claude/rules/storybook.md`（唯一本體；paths 含 `src/components/**/*.tsx`）、`check-story-health.py`＋baseline（`debt`／`excluded`／`a11y` 三區）、plan 模板與 `fix.md` 測試落點、**四個** skill（plan-feature／tdd-implement／review-implementation／fix-bug）與 `plan-reviewer-uiux` 的一句指標、`test-naming.md` 加 storybook 列、PR 範本兩條、CLAUDE.md 淨增 0 行、docs/README、§8／§12.8 只改做法、friction-log、**同步 uiux 工程 S3／S4 的驗證表與 prompt 測試落點**（並約定 uiux S8 的 G1 基於本 session 結果） | `chore/storybook-workflow-rules` | Plan Mode＋`/review-plan`（inline，框架改動要四視角） | **Opus 或 Fable** | 中 |
| S4 | 部署與 AI 入口 | `deploy-storybook.yml`（`workflow_run` CI 綠後 → GitHub Pages，`noindex` 依開放問題 #3）、README 連結與 `iframe.html?…&globals=theme:dark` 直連範例、`@storybook/addon-mcp` 在 web session 試用並記結論、可選 M1 | `ci/storybook-pages` | Plan Mode | Sonnet | 輕 |
| S5 | Claude Design 試點 | 綁 uiux S4：`/design-sync` 推 Storybook → 做 A3 提案板 → 業主裁決 → 以 plan.md §8.1 三條判準評估記 progress；失敗不阻擋 uiux S4 | uiux S4 的分支 | 隨 uiux S4 | 依 uiux S4 | 輕（評估） |
| M1 | （可選）storybook-status mod | `/stories` 指令＋橫幅；僅當業主在 Desktop／終端機工作 | `chore/storybook-status-mod` | Plan Mode | Sonnet | 輕 |

## 3. 每個 session 的開工 prompt（複製貼上即可）

> 通用規則：開場先讀本目錄三份檔案。三段式 session 規劃完**停等人審**；
> Plan Mode 的用 Plan Mode 給業主過目後才動工。收工必更新 `progress.md`。

**S1**（Opus）：
```
讀 docs/plans/storybook-workflow/{plan,construction-plan,progress}.md。
先 git checkout -B feature/storybook-workflow origin/develop
（web session 預設生在 claude/* 分支，三段式守衛只認 feature/<slug>）。
review.md 的處置節已勾人審通過，直接 /tdd-implement storybook-workflow，
照 plan.md §5a 階段 0–7 TDD，並遵守 §0.2 的 D1–D11。注意：
- 階段 0 先擴 tdd-test-guard 的鎖到 *.stories.tsx（含 test-hooks.py 案例）。
- 階段 1 升 Vitest 4 沒有紅燈，照逃生口 1 記 progress；每個 project 要
  extends: true；coverage 只量 unit；npm playwright 釘 1.56.0（與 e2e 同版，
  本容器 /opt/pw-browsers/chromium-1194 就是這版）。覆蓋率門檻若因 v8 重新
  映射要重校準，PR 內寫明理由，並依開放問題 #5 先停下來給業主看數字。
- 階段 2 是 spike：先驗 per-project 主題注入與 isMobile＋hasTouch 能否讓
  pointer: coarse 成立，寫 currentInstance()；tsconfig／biome／coverage exclude
  在這一階段一起落地；冷啟動連跑三次。啟不動 Chromium 就是 blocker，求裁決。
- 階段 3 的斷言比對 CSS 變數的 computed 值，不寫 hex（check-color-usage 會紅）。
- 階段 4 的 UserContext 用 codemod 改 21 處 import 與 12 個 vi.mock，同 PR 改
  規格書 §1.2 與 CLAUDE.md〈架構事實〉那一行。
- 階段 5 把全部 ui/ 原語以 'todo' 空跑 axe，違規清單寫進 progress.md 給開放
  問題 #2 裁決。
- 收尾**不要刪** docs/plans/storybook-workflow/（S2–S5 還要用，progress.md 有
  plans-keep 與退場條件），其餘收尾步驟照 /tdd-implement。
```

**S2**（Sonnet）：
```
讀 docs/plans/storybook-workflow/{plan,construction-plan,progress}.md 與
.storybook/ 下 S1 留下的三個 story（button／status-callout／BottomNav）當樣板。
這是 S2 的第 N 個 PR（a=ui／b=composite／c=admin，依 construction-plan §2 S2 的
分類），分支 chore/storybook-stories-<N>。照 plan.md §4 的必備內容寫 story
（最壞但可達測資、斷言寫目標、每支新 play 做一次突變驗證並記在 PR、overlay 開啟態、
觸控目標通則、擇一渲染元件兩套斷言、鍵盤斷言）。a11y 依 progress.md 記的開放
問題 #2 裁決處理，例外只准 per-rule＋理由。
用 Plan Mode 先列「元件 × 狀態」矩陣與 jsdom 刪除對照表（逐條附等價證據，
保留清單不動）給我看過再動工。內含 fetch 的元件不寫、留在 excluded 清單。
stories 一律假資料（hygiene 測試會擋身分證／手機格式與真 supabase client）。
```

**S3**（Opus 或 Fable）：
```
讀 docs/plans/storybook-workflow/{plan,construction-plan,progress}.md，重點是
plan.md §5 流程改變總表——這個 session 把那張表落成檔案。
在 chore/storybook-workflow-rules 分支上：
1. .claude/rules/storybook.md（paths: src/components/**/*.tsx、src/**/*.stories.tsx、
   .storybook/**）——**唯一本體**：plan.md §4 的必備內容與 jsdom 保留清單、命名
   分層（export 英文、name/step 中文）、a11y per-rule 例外格式、「寫 UI 前先讀同層
   story、禁止腦補 props」、指令一律 npx vitest run --project=…。
2. scripts/check-story-health.py＋story-health-baseline.json（debt／excluded／a11y
   三區，excluded 附理由），--self-test 雙軌（含「測試檔與 figma/ 不算元件」的
   正反案例），接 framework-check 軌。
3. docs/_templates/plan.md 與 fix.md 的測試落點、plan-feature／tdd-implement／
   review-implementation／fix-bug 四個 SKILL.md、.claude/agents/plan-reviewer-uiux.md、
   .github/pull_request_template.md（兩條）、.claude/rules/test-naming.md 加一列
   ——全部只放一句指標，規則不複寫。
4. CLAUDE.md 淨增 0 行（200 上限）；docs/README.md、ui-ux-guidelines.md §8 與
   §12.8（只改 checklist 做法，明寫哪些自動哪些人工）、friction-log 各補一段。
5. 同步 docs/plans/platform-uiux-redesign/construction-plan.md 的 S3／S4 驗證表與
   prompt 測試落點，並在其 progress.md 記一行「S8 的 G1 基於 storybook S3 結果」。
用 Plan Mode 列出每個檔案的改法給我看過，跑 /review-plan（inline）後再動工。
改完跑 bash scripts/framework-check.sh 與 python3 scripts/check-context-budget.py。
```

**S4**（Sonnet）：
```
讀 docs/plans/storybook-workflow/{plan,construction-plan,progress}.md。
在 ci/storybook-pages 分支上：
1. .github/workflows/deploy-storybook.yml：workflow_run（CI 綠、branches: [develop]）
   → storybook build → GitHub Pages，檔頭寫明為何與 deploy-supabase 同用 workflow_run；
   noindex 依開放問題 #3。照 .claude/rules/github-actions.md：name 英文 Title Case、
   job id kebab-case、每 job timeout 與逐 job permissions（pages: write、
   id-token: write）、每 step 中文 name、environment github-pages 必配
   cancel-in-progress: true（規則 11）。跑 python3 scripts/check-workflows.py。
2. README.md 與 docs/README.md 加 Storybook 網址（B 級現況說明）與
   iframe.html?id=…&globals=theme:dark 直連範例（手機不依賴 toolbar 的退路）。
3. 試 @storybook/addon-mcp：裝 addon、.mcp.json 指 http://localhost:6006/mcp，
   在本 session 背景起 npm run storybook，驗 docs-list／test-run 接不接得上；
   接不上就記 progress 並維持 rules 的退路（讀 story＋跑 vitest）。
用 Plan Mode 給我看過再動工。合併後提醒我去 Settings → Pages 把 Source 設成
GitHub Actions（這一步只有業主能做）。
```

**S5**（隨 uiux 工程 S4 的 session）：
```
開 uiux S4「會員詳情重設計」規劃前，先讀 docs/plans/storybook-workflow/plan.md §8.1。
在規劃階段用 /design-sync 把 Storybook 推成 Claude Design 的設計系統專案，
在 claude.ai/design 做 A3 的提案板（兩到三個方案）給我裁決；對照 plan.md §8.1 的
三條判準記下：不支援的相依有幾個、同步到第一份可裁決提案板花了多久、實作後
有沒有「看過實品才改向」的修正。結論寫進 docs/plans/storybook-workflow/progress.md，
由它決定 Claude Design 要不要常態化。試點失敗就退回手工對照頁，不阻擋 S4。
```

## 4. 監工 SOP

照 `platform-uiux-redesign/construction-plan.md` §4 的三層（session 內自動閘門
／跨 session 看板／驗收站），本工程只補差異：

- S1 起 `npm run check` 會啟 Chromium——pre-commit 變慢是預期內，不是故障；
  dev loop 用 `npx vitest --project=unit`。
- S3 起 `check-story-health.py` 在 framework-check 軌盯著所有後續 session；
  新元件沒 story 直接紅，不靠人記得；「修改 `debt` 內元件要同 PR 補 story」由
  `/review-implementation` 與 PR 範本把關（守衛看不到修改）。
- 遺留事項只記 `progress.md`。

### 4.1 驗收站

| 驗收站 | 在哪之後 | 業主看什麼 |
|---|---|---|
| 驗收 A | S1 合併 | 可勾項：CI 的 `unit-tests` log 有三個 `sb-*` project、`build-bundle` 有 `storybook build`；`unit-tests` 牆鐘實測值 ≤ `e2e-tests`；pre-commit 增加的秒數可接受；PR 附 Claude 以 iPhone 模擬打開 `storybook-static` manager 的截圖（toolbar 的 theme／a11y 在手機版面可達，不可達則 S4 的直連範例是正式入口） |
| 驗收 B | S4 合併＋Pages 開通 | 可勾項：用 LINE 內建瀏覽器開網址，點 Button／Badge／StatusCallout 三個元件看 375px 各狀態；切深色（toolbar 或直連）；a11y 面板零紅；`story-health-baseline.json` 的 `debt` 筆數 ≤ S2 收尾時記的數字 |
| 驗收 C | S5 試點 | plan.md §8.1 的三條判準逐條勾；決定 Claude Design 常態化與否 |

驗收不過 → 開 `fix/*` session 修正，修完重驗才進下一站。

## 5. 業主操作步驟

1. **S0（本 PR）**：看 `plan.md` §0.1 決策與 §6 開放問題，看 `review.md` 的
   P0／P1 處置；同意就勾「處置」節、合併 PR。
2. **S1**：開 session 選 Opus，貼 §3 的 S1 prompt；它規劃已審過，會直接進
   `/tdd-implement`；階段 2 之後若切成第二次對話，開新 session 貼同一段 prompt
   即可（狀態在 progress.md）；等 CI 綠、合併 PR。階段 5 的 a11y 違規清單出來後
   裁決開放問題 #2。
3. **S2（三個 PR）–S4**：依序開 session（模型照 §2 表），貼 prompt，Plan Mode 過目後放行；
   合併後各站驗收。**S4 合併後**到 repo Settings → Pages 把 Source 設成
   GitHub Actions，再手動跑一次 Deploy Storybook workflow。
4. **S3 合併後才開 uiux 工程的 S3**（後台資訊架構）——那是第一個在新流程下
   誕生元件的 session。
5. **S5** 在 uiux S4 開工時一起做。

預估節奏：一天一個 session，S1–S4 約一週半（S2 有三個 PR；含驗收）。uiux 主線在這段期間暫停（開放問題 #4）。
