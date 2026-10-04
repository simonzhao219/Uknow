# Storybook 導入與元件層開發流程改造——規劃書

> **文件定位**：D 級鷹架，本工程的單一事實來源。跨多個 session 施工，
> 全部完工後由收尾 session 刪除，值得長期保存的規則升級進
> `.claude/rules/storybook.md`、`docs/ui-ux-guidelines.md` 與 friction-log。
> 施工順序與分工見同目錄 `construction-plan.md`，進度看板見 `progress.md`。
> 本工程與 `platform-uiux-redesign` 並行存在：**S1–S3 排在該工程 S3 開工之前**
> （讓後台重設計的新元件直接在新流程下誕生），其餘可交錯。

## 0. 一句話

讓 Storybook 成為**元件層的單一真相**：每個元件的狀態（手機／桌機、淺／深色、
空／載入／錯誤）都有一個 story，story 同時是文件、是真瀏覽器測試、是業主與
AI 看元件的入口——因為本 repo 的元件層驗證目前只剩 jsdom（量不到版面、
看不到深色、a11y 靠人記得），而這些缺口 friction-log 已經記了三次。

### 0.1 已與業主核對的決策（2026-10-04）

| 決策點 | 結論 |
|---|---|
| 角色定位 | **元件層的單一真相**：文件＋真瀏覽器測試落點。新增／修改元件一律先寫 story；jsdom 元件測試逐步退場、只留純邏輯；e2e 保留頁級流程 |
| 托管與視覺回歸 | develop 的 Storybook 部署到 **GitHub Pages**（public repo 免費、免 secret）；**截圖比對第一期不做**，先上 a11y 與 play 測試 |
| Claude Design | **第二期試點**：Storybook 站穩後，用 uiux 工程的 S4「會員詳情重設計」做一次 `/design-sync` → Claude Design 提案板，試過再決定常態化（§8.1） |
| Claude Code mods | 依官方比較表：既有 settings hooks 保留；第一期不寫 mod；留一個有觸發條件的可選項（§8.2） |

## 1. 使用者需求

- **對照規格書**：本工程**不改任何業務規則**，`docs/uknow-software-specification.md`
  §1–§14 零變更；它改的是開發流程與驗證層，溯源對象是 CLAUDE.md〈動手之前〉、
  `ui-ux-guidelines.md` §8（可測試性）／§12.8（深色與色盲 checklist）與
  friction-log 三則（2026-08-08「量不到的東西，寫幾條測試都是同義反覆」、
  2026-08-07「被 e2e 斷言的 UI 文案缺 vitest 防線」、uiux 看板遺留「守門抓不到
  token 用錯形狀」）。
- **使用者故事（開發流程的使用者是業主與 Claude）**：
  1. 業主開 GitHub Pages 的 Storybook，用手機看任一元件的各狀態與深色版，
     不必登入 develop 環境也不必等某個頁面「剛好」出現那個狀態。
  2. Claude 開 UI session 時，寫任何元件前先讀該元件的 story（或 MCP 的
     元件文件），不腦補 props；寫完跑 `vitest --project=storybook`，紅燈即
     不准收工。
  3. `/tdd-implement` 的 UI 階段，紅燈是 story 的 play 斷言在 Chromium 裡
     失敗，不是 jsdom 的 class 字串比對。
  4. 四視角審查看得到 story：UI/UX 視角審「狀態齊不齊、a11y 過不過」有物證。
- **四種使用者視角（uiux 工程 §1 的需求羅盤）**：P1–P4 都不直接接觸 Storybook；
  他們得到的是「深色／窄版／鍵盤可達」這些以前沒有閘門的性質從此有閘門。
  P4 後台（手機與桌機並重）受益最大：story 同時在 375px 與桌機跑。
- **不做什麼**：不做截圖比對（Chromatic／VRT 外掛，第一期）；不改任何產品行為；
  不動 `supabase/functions/`；不把 Storybook 放進正式站網域；不改 e2e 套件的
  範圍（頁級流程與全路由溢字巡檢照舊）；不引入 MSW（頁級 story 列第二期）。

## 2. 系統設計

- **工具鏈（版本依 2026-10-04 npm registry 查證）**：Storybook **10.6**
  （`storybook` + `@storybook/react-vite` + `@storybook/addon-vitest` +
  `@storybook/addon-a11y` + `@storybook/addon-docs`）；**Vitest 3.2 → 4.1**
  （addon-vitest 的瀏覽器提供者 `@vitest/browser-playwright` 只有 4+；Vitest 5
  需 Vite ≥6.4，本 repo 鎖 6.3.5，升 Vite 另案）；`playwright` npm 套件＋
  Chromium。Vite 6.3.5、React 18、TS 5.7、Node 22（CI 24）全部相容，不動。
- **測試矩陣（一個 story 自動跑幾次）**：vitest 的 `storybook` project 定義
  三個 Chromium instance——`mobile`（375×667、`isMobile`＋`hasTouch`，讓
  `pointer-coarse:` 生效）、`mobile-dark`（同上＋ `initialGlobals.theme = dark`）、
  `desktop`（1280×800）。每個 story 先做煙霧渲染，有 `play` 就跑斷言；a11y
  addon 以 `parameters.a11y.test = 'error'` 把 axe 違規算成測試紅。
- **主題與外殼**：`.storybook/preview.ts` 匯入 `src/styles/globals.css`，
  toolbar global `theme` 切 `<html class="dark">`——這是深色 token **第一條
  執行期驗證管道**（§12.8 目前只能靠 devtools 手動）。外殼 decorator 提供
  `MemoryRouter`、`UserContext`、`FeatureProvider`、`NotificationProvider`、
  `DataCacheProvider`，story 以 `parameters.user`（訪客／會員／管理員）選身分。
- **資料**：第一期只寫**吃 props 的元件**（與 `AdminDashboard.tsx` 檔頭的 DI
  慣例一致——取數在外、畫面吃 props），不攔網路；頁級元件（HomePage、
  MemberDashboard 等 hook 內含 fetch 者）留在 story 覆蓋基線裡，第二期再決定
  MSW 或 fetcher 注入。
- **閘門**：`npm run check` 的 `vitest run` 跑全部 project（含 stories）——
  `scripts/tdd-unlock.sh` 靠它判綠，stories 若不在裡面，UI 階段的紅燈就解得掉鎖
  （見開放問題 #1）。CI 的 `unit-tests` 軌改跑 Playwright Chromium，覆蓋率
  跨 project 合併，棘輪照舊只准往上。
- **新守門腳本** `scripts/check-story-coverage.py`（framework-check 軌）：
  `src/components/**/*.tsx` 的元件檔沒有同層 `*.stories.tsx` 就必須在
  `scripts/story-coverage-baseline.json` 裡；baseline 只准縮、孤兒條目紅、
  不提供 `--update` 旗標——與 `check-color-usage.py` 同一套棘輪哲學。
- **部署**：`deploy-storybook.yml`，push develop → `storybook build` →
  GitHub Pages（`actions/deploy-pages`）。無 schedule、無 secret；
  `environment: github-pages` 必配 `cancel-in-progress: true`（規則 11）。
- **AI 入口**：`@storybook/addon-mcp`（preview，React 完整支援）在 S4 試用：
  `.mcp.json` 指向 `http://localhost:6006/mcp`，提供 `docs-list`／`docs-show`／
  `stories-find-by-component`／`test-run`。退路（不依賴 MCP）：rules 要求寫 UI 前
  讀同層 `*.stories.tsx`、寫完跑 `vitest --project=storybook`。

## 3. 架構影響

- `vitest.config.ts` 改成 `test.projects`（Vitest 4 已移除 workspace）：`unit`
  （現行 node＋jsdom pragma，include 不變）與 `storybook`（browser mode）。
  `supabase/**` 仍絕不納入。
- `UserContext` 從 `App.tsx` 抽到 `src/contexts/UserContext.tsx`，`App.tsx`
  re-export 維持 21 處 `from '../App'` 不變——否則 preview 一 import `App.tsx`
  就把 `BrowserRouter`、supabase client 全拉進來。
- `tsconfig.json` include 加 `.storybook`；`biome.json` includes 加 `.storybook/**`
  與 `src/components/ui/*.stories.tsx`（ui/ 目前整層排除，stories 要補回，注意
  Biome 2 的 includes 順序）；coverage exclude 加 `src/**/*.stories.tsx`；
  `.gitignore` 加 `storybook-static/`；knip 的 Storybook plugin 自動啟用。
- CI：`unit-tests` 軌多一步安裝 Playwright Chromium（快取 `~/.cache/ms-playwright`，
  與 e2e 軌同鍵）；`build-bundle` 軌加 `storybook build`（壞掉的 story／MDX 在這
  裡紅）。依規則 8a **不開新 job**：固定開銷 >40 秒、而 stories 跑完仍在 e2e 的
  4 分鐘牆鐘之內；`ci-ok` needs 不變。
- claude.ai/code 容器：Chromium 在 `/opt/pw-browsers/chromium`，`playwright` 套件
  版本與瀏覽器建置號可能不對——vitest 的 playwright provider 要讀
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE`（有值用它，沒值走預設），否則 web session
  跑不了 stories。
- 守衛：`tdd-test-guard.py` 的紅燈鎖範圍從 `*.test.ts(x)` 擴到 `*.stories.tsx`
  （stories 是測試落點，紅燈期改它就是「改測試遷就實作」）；`test-hooks.py`
  加表格案例。CLAUDE.md 已 200/200 行——**淨增 0 行**：改寫「vitest 預設 node
  環境…jsdom」那行為新分層，指令表合併一列塞 `npm run storybook`；規則本體放
  path-scoped `.claude/rules/storybook.md`（啟動固定成本 4.5k/10k，不吃預算）。
- 效能：pre-commit 多跑一次 Chromium（估 +40–60 秒）；dev loop 用
  `npx vitest --project=unit` 或 `--project=storybook` 擇一。
- 安全：GitHub Pages 公開；stories 只能用假資料（與 e2e mock 同規矩，
  `repoHygiene.test.ts` 的個資禁令延伸到 `*.stories.tsx`）。

## 4. UI/UX

- 本工程**畫面零變化**（除 `UserContext` 搬家這種純重構）。
- 每個 story 檔的必備內容寫進 `.claude/rules/storybook.md`：`title` 分組
  （`UI/`、`Composite/`、`Shell/`、`Page/`）；`Default` 必有；有 variant 的列
  全部 variant；有資料的補空態／載入態／錯誤態（§6 三態完備）；互動元件的
  `play` 至少斷言一條「§8 可測試性」要求的 role／name；`tags: ['autodocs']`。
- `ui-ux-guidelines.md` §12.8 的 checklist 改在 Storybook 跑：深色用 toolbar
  `theme`（每個 story 一鍵）、色盲用 a11y addon 的 vision simulator、對比用
  a11y 報告——三步都從「devtools 逐頁」變成「逐 story」，且前兩步在 CI 自動跑
  （深色＋axe）。人工步驟只剩色盲模擬的目視，仍是常設規範。
- 行動版優先落在測試矩陣本身：`mobile` instance 是第一個跑的、也是 a11y 的
  判定基準；桌機是第二驗收情境（§7 的推論）。

## 5. 流程改變總表（Before → After）

| 環節 | 現在 | 導入後 |
|---|---|---|
| 元件的完成定義 | 有 jsdom 測試（或沒有） | **有 story**（狀態齊）＋ play 測試綠 ＋ a11y 綠，`check-story-coverage.py` 機械把關 |
| `/plan-feature` UI 章節 | 列頁面／元件變更 | 另列**新增／變更的 stories 與狀態** |
| 規劃模板的測試落點 | 純函式→node；元件→jsdom；流程→e2e | 純函式→node；**元件呈現／互動／版面／主題→story play（Chromium）**；頁級流程→e2e；jsdom 僅限 story 無法表達者，須寫理由 |
| `/tdd-implement` 紅燈 | jsdom 斷言紅 | UI 階段：story 的 play 斷言紅（`vitest --project=storybook`）；`tdd-test-guard` 鎖 `*.stories.tsx` |
| `/tdd-implement` 收尾自查 | dev server＋Playwright 截整頁 | 對 story 截圖（375px／深色各一），貼 PR |
| `/review-plan`、`/review-implementation` UI/UX 視角 | 讀規劃書／diff | 加審 stories：新元件有 story？狀態齊？a11y？ |
| 驗收站 | 業主上 develop 環境走頁面 | 加 **Storybook 站**（GitHub Pages）：先看元件狀態，再走頁面 |
| Claude 寫 UI 前 | 憑記憶或 grep 元件原始碼 | 先讀同層 `*.stories.tsx`（或 MCP `docs-show`），**禁止腦補 props** |
| 深色／色盲 checklist（§12.8） | devtools 手動逐頁 | 逐 story：深色與 axe 在 CI 自動跑；色盲模擬在 Storybook 目視 |
| jsdom 元件測試 | 元件層主力 | 新元件不得新增（純邏輯除外）；既有的碰到時搬到 story（童子軍） |
| PR 範本檢查清單 | 四條 | 加一條：新增／變更元件有 story 且 a11y 綠 |

## 5a. 階段切分（S1 工具鏈，`feature/storybook-workflow`，每階段一個紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | Vitest 3.2→4.1（含 `@vitest/coverage-v8`、`projects` 改寫、依官方 migration 逐條對照） | 既有 94 個測試檔；無新測試（逃生口 1 的變體：升級階段沒有紅燈，記入 progress） | `npm run check` 全綠；`test:coverage` 四項 ≥ 現行門檻，量測法改變導致下降要在 PR 寫明並重新校準 |
| 2 | 裝 Storybook 10.6＋`storybook` project（三個 instance）＋第一個 story | `src/components/ui/button.stories.tsx` play：`mobile` 下 `getBoundingClientRect().height ≥ 44` | 紅：instance 未設 `isMobile`/`hasTouch` 時量到 36px；綠：`npx vitest --project=storybook` 過；`storybook build` 成功；web 容器與 CI 都啟得動 Chromium |
| 3 | 主題 decorator＋`initialGlobals` | `src/components/ui/status-callout.stories.tsx` play：`mobile-dark` 下 warning 的 computed background 等於 `.dark` 的 `--warning-subtle`（`#451a03`） | 紅→綠；淺色 instance 仍是 `#fffbeb` |
| 4 | 外殼 decorators＋`UserContext` 抽檔 | `src/components/BottomNav.stories.tsx` play：會員身分下五格、順序固定（對照 `BottomNav.test.tsx` 檔頭契約） | 紅（缺 Router／Context 拋錯）→綠；21 處既有 import 不改 |
| 5 | a11y addon `test: 'error'` | 前三個 story 的 axe 檢查 | 紅（若有違規）→修元件至綠；不准把 `'error'` 降級 |
| 6 | CI：`unit-tests` 裝 Chromium、`build-bundle` 加 `storybook build` | `scripts/check-workflows.py`＋本 PR 的 CI run | check-workflows 綠；CI 全綠；`unit-tests` 牆鐘 ≤ `e2e-tests` |
| 7 | 設定收尾：tsconfig／biome／knip／coverage exclude／`.gitignore`／npm scripts（`storybook`、`build-storybook`、`test:stories`、`test:unit`） | `npm run check:full` | 全綠；`check-context-budget.py` 綠 |

S2（寫 stories）、S3（流程改造）、S4（部署與 AI）、S5（Claude Design 試點）
的範圍與驗證標準見 `construction-plan.md` §2–§3——它們走 Plan Mode，不另立
TDD 階段表。

## 6. 開放問題（逃生口——等人裁決）

- [ ] **#1 `npm run check` 是否納入 stories**：建議納入（否則 `tdd-unlock.sh`
  對 UI 階段形同虛設），代價是 pre-commit 每次 +40–60 秒。替代案：`check`
  只跑 `unit`、`tdd-unlock.sh` 另加 `test:stories`——兩處定義會漂，不建議。
- [ ] **#2 既有 jsdom 元件測試的退場速度**：建議「碰到才搬」（童子軍），S2 只刪
  被 story 逐字取代的斷言（PR 列對照表）；替代案：S2 一次搬完 57 檔，PR 太大。
- [ ] **#3 a11y 門檻**：建議一律 `'error'`，例外要在 story 寫 `a11y.test: 'todo'`
  ＋一行理由並列入 baseline（棘輪）；替代案：`'todo'` 起步、S3 再升級。
- [ ] **#4 CI 併軌**：建議併入 `unit-tests`（規則 8a）；替代案：獨立 `component-tests`
  job——只有在 stories 跑超過 e2e 牆鐘時才值得。
- [ ] **#5 Vitest 4 還是 5**：建議 4（5 需 Vite ≥6.4，`vite` 鎖 6.3.5 的原因
  要先查 git log 才能決定要不要一起升）。
- [ ] **#6 MCP 要不要常駐**：S4 試用後再定；CLAUDE.md 的 MCP 原則是「CLI 優先、
  按需開」，addon-mcp 需要 dev server 常駐，web session 未必接得上。

## 7. 風險與回滾

- **Vitest 4 升級把既有測試弄紅**：階段 1 獨立 commit，可單獨 revert；逐條照
  官方 migration（`workspace`→`projects`、瀏覽器 provider 拆包、mock 還原語意）。
- **覆蓋率數字因量測法改變而掉**：棘輪規則「只准往上」的例外條款是「PR 內寫明
  理由」——這正是那種情況；校準後門檻仍要貼著實測值。
- **CI 牆鐘**：stories 第一期不到 40 個，估 1–2 分鐘；超過 e2e 的 4 分鐘才拆軌。
- **瀏覽器測試偶發紅**：不設 retry（「flake 不是根因」），紅了當真的查。
- **web 容器啟不動 Chromium**：`PLAYWRIGHT_CHROMIUM_EXECUTABLE` 退路；還是不行
  就 stories 只在 CI 跑，session 內用 `storybook build` 驗語法——記 friction-log。
- **GitHub Pages 公開**：stories 用假資料；`repoHygiene.test.ts` 的個資禁令延伸。
- **回滾**：S1 是純加法（新 project、新 config、新 story），revert PR 即回到
  Vitest 3；S3 的守衛與 rules 可逐檔 revert；Pages 可在 Settings 關閉。

## 8. 評估：Claude Design 與 Claude Code mods

### 8.1 Claude Design（claude.ai/design，beta；Max 方案可用）

- **是什麼**：用對話產設計／原型／一頁式提案，並把組織的設計系統套在每個
  產出上。`/design-sync`（Claude Code 指令）把 React 元件庫推成 Claude Design 的
  設計系統專案，**輸入就是 Storybook**（官方推薦的單一來源；僅 React；單向
  code→design，沒有拉回程式碼的路徑）。
- **對本 repo 的價值**：現行「做對照頁給業主裁決」（S2b 配色比較板、S2c 推薦樹
  預覽、S2d 會員中心對照頁）已證明有價值，但那些是手工 HTML——顏色對、元件
  不對。同步 Storybook 之後，提案板用的是真 `Button`／`Badge`／`StatusCallout`
  與真 token，業主看到的就是會上線的樣子。
- **裁決**：第二期試點（S5）。觸發條件＝S1–S4 完成且 uiux 工程的 S4「會員
  詳情重設計」開工時；試點產出＝一份 A3 提案板＋評估（花了多久、業主裁決
  有沒有因此更快、與手工對照頁相比的落差），記在 progress.md 後再決定常態化。
- **不做的理由只有一個會成立**：beta 期 `/design-sync` 不支援本 repo 的某個相依
  （Tailwind v4、`@radix-ui` 版本化 alias）——試點時第一件事就是驗這個。

### 8.2 Claude Code mods（GA，v2.1.287+）

- **官方怎麼說**：mod 是跑在 Claude Code 行程內的函式，獨有能力是**畫介面**
  （面板／橫幅／指令）與**改寫事件**；官方比較表寫明「有現成腳本要擋／放行／
  記錄 → 用 settings hook；要面板、橫幅、自訂指令或改寫事件 → 才用 mod」。
  面板只在終端機與 Desktop app 的 Code tab 畫得出來；cloud session 只跑 hook。
- **對本 repo**：五支 Python hooks 正是「現成腳本在擋／記錄」，而且有
  `test-hooks.py` 表格測試與 metrics 落檔——改寫成 mod 是純重寫、零行為收益，
  還得在 framework-check 補一套 JS 側驗證。業主主要在 claude.ai/code web
  session 工作，面板畫不出來。
- **裁決**：第一期不寫 mod、不遷移。保留一個可選項 **M1**（S4 之後、且業主在
  Desktop／終端機工作時才做）：repo 內 `.claude/plugins/storybook-status/` 一個
  mod，提供 `/stories` 指令與一條橫幅——顯示 story 覆蓋基線剩幾筆、上一次
  `vitest --project=storybook` 的結果；用官方「Test a mod」的離線測試驗；
  `--plugin-dir` 載入。它不擋任何事（擋的事留給 settings hooks），所以兩套機制
  不重疊。
