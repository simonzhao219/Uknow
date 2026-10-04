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
| S1 | 工具鏈 | plan.md §5a 七階段：Vitest 4、Storybook 10.6、三 instance、主題與外殼 decorator、a11y、CI、設定收尾 | `feature/storybook-workflow` | 三段式（`/tdd-implement storybook-workflow`） | **Opus** | 中偏重（可能兩次對話） |
| S2 | 寫 stories | `src/components/ui/*`（23）＋複合元件（common／dashboard／home／notifications／task 的 ProgressBar／referral 與 reward 的純呈現元件）＋外殼（BottomNav／Navbar／Footer／MaintenanceBanner／Skeleton）；三態齊；a11y 全綠；只刪被 story 逐字取代的 jsdom 斷言 | `chore/storybook-stories` | Plan Mode（先列 story 清單與狀態矩陣給業主過目） | Sonnet | 中（>40 檔就拆成 ui／composite 兩個 PR，**依序不平行**） |
| S3 | 流程改造 | `.claude/rules/storybook.md`、`check-story-coverage.py`＋baseline、`tdd-test-guard` 擴鎖＋表格案例、plan 模板測試落點、三個 skill 與 `plan-reviewer-uiux` 指令、PR 範本、CLAUDE.md 淨增 0 行、docs/README、§8／§12.8、friction-log | `chore/storybook-workflow-rules` | Plan Mode＋`/review-plan`（inline，框架改動要四視角） | **Opus 或 Fable** | 中 |
| S4 | 部署與 AI 入口 | `deploy-storybook.yml`（GitHub Pages）、README 連結、`@storybook/addon-mcp` 在 web session 試用並記結論、可選 M1 | `ci/storybook-pages` | Plan Mode | Sonnet | 輕 |
| S5 | Claude Design 試點 | 綁 uiux S4：`/design-sync` 推 Storybook → 做 A3 提案板 → 業主裁決 → 評估記 progress | uiux S4 的分支 | 隨 uiux S4 | 依 uiux S4 | 輕（評估） |
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
照 plan.md §5a 七階段 TDD。注意：
- 階段 1 升 Vitest 4 沒有紅燈，照逃生口 1 記 progress；覆蓋率門檻若因量測法
  改變而要重校準，PR 內寫明理由。
- 階段 2 的 mobile instance 要用 isMobile＋hasTouch 讓 pointer-coarse 生效；
  vitest 的 playwright provider 讀 PLAYWRIGHT_CHROMIUM_EXECUTABLE（本容器是
  /opt/pw-browsers/chromium），確認 web 容器與 CI 都啟得動。
- 收尾**不要刪** docs/plans/storybook-workflow/（S2–S5 還要用，progress.md 有
  plans-keep 與退場條件），其餘收尾步驟照 /tdd-implement。
```

**S2**（Sonnet）：
```
讀 docs/plans/storybook-workflow/{plan,construction-plan,progress}.md 與
.storybook/ 下 S1 留下的三個 story（button／status-callout／BottomNav）當樣板。
在 chore/storybook-stories 分支上為 construction-plan §2 S2 列出的元件寫 story：
title 分組 UI/・Composite/・Shell/，Default＋全部 variant＋三態（有資料者），
互動元件的 play 至少斷言一條 role/name，tags autodocs，a11y 全綠不得降級。
用 Plan Mode 先列「元件 × 狀態」矩陣與打算刪除的 jsdom 斷言對照表給我看過再動工。
只刪被 story 逐字取代的 jsdom 斷言；頁級元件（含 fetch 的）不寫，列進基線。
stories 一律假資料。超過 40 檔就拆成 ui／composite 兩個 PR，依序。
```

**S3**（Opus 或 Fable）：
```
讀 docs/plans/storybook-workflow/{plan,construction-plan,progress}.md，重點是
plan.md §5 流程改變總表——這個 session 把那張表落成檔案。
在 chore/storybook-workflow-rules 分支上：
1. .claude/rules/storybook.md（paths: src/**/*.stories.tsx、.storybook/**）：
   story 檔必備內容、命名、play 寫法、a11y 例外標記、「寫 UI 前先讀同層 story、
   禁止腦補 props」、jsdom 元件測試退場政策。
2. scripts/check-story-coverage.py＋story-coverage-baseline.json，--self-test
   雙軌，接 framework-check 軌；baseline＝S2 之後仍沒有 story 的元件。
3. .claude/hooks/tdd-test-guard.py 紅燈鎖擴到 *.stories.tsx，scripts/test-hooks.py
   加正反案例。
4. docs/_templates/plan.md 測試落點指引、plan-feature／tdd-implement／
   review-implementation 三個 SKILL.md、.claude/agents/plan-reviewer-uiux.md、
   .github/pull_request_template.md 依總表改。
5. CLAUDE.md 淨增 0 行（200 上限）；docs/README.md、ui-ux-guidelines.md §8 與
   §12.8、friction-log 各補一段。
用 Plan Mode 列出每個檔案的改法給我看過，跑 /review-plan（inline）後再動工。
改完跑 bash scripts/framework-check.sh 與 python3 scripts/check-context-budget.py。
```

**S4**（Sonnet）：
```
讀 docs/plans/storybook-workflow/{plan,construction-plan,progress}.md。
在 ci/storybook-pages 分支上：
1. .github/workflows/deploy-storybook.yml：push develop → storybook build →
   GitHub Pages。照 .claude/rules/github-actions.md：name 英文 Title Case、
   job id kebab-case、每 job timeout 與逐 job permissions（pages: write、
   id-token: write）、每 step 中文 name、environment github-pages 必配
   cancel-in-progress: true（規則 11）。跑 python3 scripts/check-workflows.py。
2. README.md 與 docs/README.md 加 Storybook 網址（B 級現況說明）。
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
在 claude.ai/design 做 A3 的提案板（兩到三個方案）給我裁決；記下：同步花了多久、
哪些相依不支援、業主裁決是否因此更快、與手工對照頁的落差。結論寫進
docs/plans/storybook-workflow/progress.md，由它決定 Claude Design 要不要常態化。
```

## 4. 監工 SOP

照 `platform-uiux-redesign/construction-plan.md` §4 的三層（session 內自動閘門
／跨 session 看板／驗收站），本工程只補差異：

- S1 起 `npm run check` 會啟 Chromium——pre-commit 變慢是預期內，不是故障；
  dev loop 用 `npx vitest --project=unit`。
- S3 起 `check-story-coverage.py` 在 framework-check 軌盯著所有後續 session；
  新元件沒 story 直接紅，不靠人記得。
- 遺留事項只記 `progress.md`。

### 4.1 驗收站

| 驗收站 | 在哪之後 | 業主看什麼 |
|---|---|---|
| 驗收 A | S1 合併 | PR 的 CI：`unit-tests` 有跑 stories（log 裡三個 instance）、`build-bundle` 有 `storybook build`；pre-commit 時間可接受 |
| 驗收 B | S4 合併＋Pages 開通 | 手機開 Storybook 網址：隨便點三個元件，toolbar 切深色、看 375px 下各狀態；a11y 面板無紅；這一站是「元件層單一真相」成不成立的實測 |
| 驗收 C | S5 試點 | 提案板是不是用真元件、裁決有沒有比手工對照頁快；決定 Claude Design 常態化與否 |

驗收不過 → 開 `fix/*` session 修正，修完重驗才進下一站。

## 5. 業主操作步驟

1. **S0（本 PR）**：看 `plan.md` §0.1 決策與 §6 開放問題，看 `review.md` 的
   P0／P1 處置；同意就勾「處置」節、合併 PR。
2. **S1**：開 session 選 Opus，貼 §3 的 S1 prompt；它規劃已審過，會直接進
   `/tdd-implement`；等 CI 綠、合併 PR。
3. **S2–S4**：依序開 session（模型照 §2 表），貼 prompt，Plan Mode 過目後放行；
   合併後各站驗收。**S4 合併後**到 repo Settings → Pages 把 Source 設成
   GitHub Actions，再手動跑一次 Deploy Storybook workflow。
4. **S3 合併後才開 uiux 工程的 S3**（後台資訊架構）——那是第一個在新流程下
   誕生元件的 session。
5. **S5** 在 uiux S4 開工時一起做。

預估節奏：一天一個 session，S1–S4 約一週（含驗收）。
