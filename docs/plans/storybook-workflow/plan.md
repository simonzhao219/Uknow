# Storybook 導入與元件層開發流程改造——規劃書

> **文件定位**：D 級鷹架，本工程的單一事實來源。跨多個 session 施工，
> 全部完工後由收尾 session 刪除，值得長期保存的規則升級進
> `.claude/rules/storybook.md`（唯一本體）、`docs/ui-ux-guidelines.md` 與 friction-log。
> 施工順序與分工見同目錄 `construction-plan.md`，進度看板見 `progress.md`，
> 四視角審查與處置見 `review.md`（R1 回填版，2026-10-04）。
> 本工程與 `platform-uiux-redesign` 並行存在：**S1–S3 排在該工程 S3 開工之前**
> （讓後台重設計的新元件直接在新流程下誕生），S4 可交錯，S5 綁該工程 S4。

## 0. 一句話

讓 Storybook 成為**元件層的單一真相**：每個元件的狀態（手機／桌機、淺／深色、
空／載入／錯誤）都有一個 story，story 同時是文件、是真瀏覽器測試、是業主與
AI 看元件的入口——因為本 repo 的元件層驗證目前只剩 jsdom：量不到版面
（friction-log 2026-08-08）、深色 token 沒有任何執行期驗證管道
（`ui-ux-guidelines.md` §12.8）、a11y 只靠人記得（§9）。

### 0.1 已與業主核對的決策（2026-10-04）

| 決策點 | 結論 |
|---|---|
| 角色定位 | **元件層的單一真相**：文件＋真瀏覽器測試落點。新增／修改元件一律先寫 story；jsdom 元件測試逐步退場、只留純邏輯與「保留清單」（§4）；e2e 保留頁級流程 |
| 托管與視覺回歸 | develop 的 Storybook 部署到 **GitHub Pages**（public repo 免費、免 secret）；**截圖比對第一期不做**，先上 a11y 與 play 測試 |
| Claude Design | **第二期試點**：Storybook 站穩後，用 uiux 工程的 S4「會員詳情重設計」做一次 `/design-sync` → Claude Design 提案板，試過再決定常態化（§8.1） |
| Claude Code mods | 依官方比較表：既有 settings hooks 保留；第一期不寫 mod；留一個有觸發條件的可選項（§8.2） |

### 0.2 規劃者定案的設計決策（審查後從開放問題移入；業主可在人審推翻）

| # | 決策 | 依據 |
|---|---|---|
| D1 | `npm run check` 的 `vitest run` **納入 stories** | `scripts/tdd-unlock.sh` 只看 `npm run check`；不納入則 UI 階段的紅燈解得掉鎖，jsdom 退場期也會出現沒有閘門的真空窗（系統／UI-UX 兩視角一致）。代價：pre-commit 每次約 +40–60 秒 |
| D2 | 容器**必須**能啟 Chromium，`check` 找不到瀏覽器時以明確錯誤失敗並指路，**不降級** | 降級會讓「宣稱綠」與「真的綠」出現縫隙；做法是把 npm `playwright` 釘成與 `e2e/requirements.txt` 相同的 `1.56.0`（本容器已裝 build 1194＝1.56.0，CI 快取可共用），退路只剩「讀 `PLAYWRIGHT_BROWSERS_PATH` 下的 `chromium-*/chrome-linux/chrome`」。啟不動＝S1 階段 2 的 blocker，求裁決，不是「stories 只在 CI 跑」 |
| D3 | stories 併入 CI 的 `unit-tests` 軌，**不開新 job** | 規則 8a：固定開銷（Chromium 安裝）>40 秒；實測後若 `unit-tests` 牆鐘超過 `e2e-tests`（約 4 分鐘）才拆軌 |
| D4 | Vitest **4.1**，不上 5 | 5 需 Vite ≥6.4，`vite` 鎖 6.3.5；升 Vite 另案 |
| D5 | 覆蓋率棘輪**只量 `unit` project**（`test:coverage` 帶 `--project=unit`） | `vitest.config.ts` 註解寫明 lines 門檻量的是「單元測試面」；stories 渲染會灌高分子、掩蓋 unit 退步 |
| D6 | `UserContext` 搬家採 **codemod**：21 處 `from '../App'` 改指 `src/contexts/UserContext`，12 個 `vi.mock('../App')` 同步改，`App.tsx` 不再是 context 來源 | re-export 達不到「story 不拉進 App」的目的（元件自己 import App）。規格書 §1.2 與 CLAUDE.md〈架構事實〉的「`App.tsx` 的 `UserContext`」同 PR 改 |
| D7 | `tdd-test-guard.py` 紅燈鎖擴到 `*.stories.tsx` **提前到 S1 階段 2 之前**（含 `test-hooks.py` 正反案例、docstring） | S1 階段 2–5 的紅燈就是 stories，沒鎖等於自己示範「改測試遷就實作」 |
| D8 | stories 的斷言**不寫 hex**：比對 `getComputedStyle(documentElement).getPropertyValue('--token')` 與元素 computed 值（兩邊都正規化成 rgb） | `check-color-usage.py` C3(a) 掃全部 `src/**/*.ts(x)`，stories 寫 hex 直接紅；也不走 `EXCLUDED_PATHS` |
| D9 | Storybook／vitest storybook project 的環境固定帶 `CF_PAGES_BRANCH=storybook`，preview 把 `utils/supabase/client` alias 成 stub；`repoHygiene.test.ts` 新增兩條：`*.stories.tsx` 不得 import 真 supabase client、不得含身分證／手機格式 | `config/supabaseTarget.ts` 在 GitHub Actions 回 `null` → 沿用正式專案 id，是該檔檔頭記載過的事故形狀；現行 hygiene 對 `.tsx` 沒有個資掃描 |
| D10 | `deploy-storybook.yml` 用 `workflow_run`（CI 綠後）觸發，不用 push | 與 `deploy-supabase.yml` 同慣例；play／a11y 紅時不該部署 |
| D11 | 所有規則與 skill 文字一律寫 `npx vitest run --project=storybook`（有 `run`） | 無 `run` 會在非互動環境進 watch；`settings.json` allowlist 也只有 `npx vitest run:*` |

## 1. 使用者需求

- **對照規格書**：本工程**不改任何業務規則**，`docs/uknow-software-specification.md`
  §2–§14 零變更；**唯一改動是 §1.2 一行**（`UserContext` 位置，D6）。溯源對象是
  開發流程文件，缺口與工項的對應：

  | 缺口（出處） | 對應工項 |
  |---|---|
  | jsdom 量不到版面幾何，只能靠 Playwright（friction-log 2026-08-08 L1704–1735） | §5a 階段 2（真瀏覽器、`pointer: coarse` 下的 44px）；該則的三條收斂寫進 story 慣例（§4） |
  | 深色 token 從未被套用、無執行期驗證管道（`ui-ux-guidelines.md` §12.8 L424） | §5a 階段 3（theme decorator＋`mobile-dark` instance） |
  | a11y 債只靠人記得（§9；biome a11y 規則降為 warn） | §5a 階段 5（axe 進測試）＋ a11y baseline 棘輪（§2） |
  | 「守門抓不到 token 用錯形狀」（`platform-uiux-redesign/progress.md` 遺留事項，**不在 friction-log**） | 只**部分**覆蓋：axe 驗對比數字，驗不到形狀語意；C4 靜態規則仍由 uiux S7 評估，本工程不接手 |

  （初版引用的 friction-log 2026-08-07「被 e2e 斷言的 UI 文案缺 vitest 防線」講的是
  文案常數漂移，與本工程無關，已移除。）
- **使用者故事（開發流程的使用者是業主與 Claude）**：
  1. 業主開 GitHub Pages 的 Storybook，用手機看任一元件的各狀態與深色版，
     不必登入 develop 環境也不必等某個頁面「剛好」出現那個狀態。
  2. Claude 開 UI session 時，寫任何元件前先讀該元件的 story（或 MCP 的
     元件文件），不腦補 props；寫完跑 `npx vitest run --project=storybook`，
     紅燈即不准收工。
  3. `/tdd-implement` 與 `/fix-bug` 的 UI 階段，紅燈是 story 的 play 斷言在
     Chromium 裡失敗，不是 jsdom 的 class 字串比對。
  4. 四視角審查看得到 story：UI/UX 視角審「狀態齊不齊、a11y 過不過」有物證。
- **四種使用者視角（uiux 工程 §1 的需求羅盤）**：P1–P4 都不直接接觸 Storybook；
  他們得到的是「深色／窄版／鍵盤可達」從此有閘門。P4 後台的受益**取決於 S2
  第三個 PR**（admin 的 loader 注入元件，見 construction-plan §2）——沒有它，
  第一期的覆蓋只有純呈現元件，不能宣稱 P4 受益最大。
- **不做什麼**：不做截圖比對（Chromatic／VRT 外掛，第一期）；不改任何產品行為
  （例外見開放問題 #2 的 a11y 債）；不動 `supabase/functions/`；不把 Storybook
  放進正式站網域；不改 e2e 套件的範圍（頁級流程、全路由溢字巡檢、既有
  `layout_probe.py` 八支探針**都不遷移**；新的元件級幾何期望從此寫在 story）；
  不引入 MSW（內含 fetch 的元件列第二期）。

## 2. 系統設計

- **工具鏈（版本依 2026-10-04 npm registry 查證）**：Storybook **10.6**
  （`storybook` + `@storybook/react-vite` + `@storybook/addon-vitest` +
  `@storybook/addon-a11y` + `@storybook/addon-docs`）；**Vitest 3.2 → 4.1**（D4）；
  `@vitest/browser-playwright` 4.1；`playwright` **釘 1.56.0**（D2）。Vite 6.3.5、
  React 18、TS 5.7、Node 22（CI 24）全部相容，不動。
- **測試矩陣（一個 story 自動跑幾次）**：vitest 的 `storybook` 這一組拆成
  **三個 project**——`sb-mobile`（375×667、`isMobile`＋`hasTouch`，讓
  `pointer: coarse` 成立）、`sb-mobile-dark`（同上＋主題 dark）、`sb-desktop`
  （1280×800）。主題的注入機制在**階段 2 當 spike 先驗**：首選 addon-vitest 的
  per-project `initialGlobals`（Storybook 10.5 起），退路是 project 各帶
  `define` 讓 preview 讀取。**play 斷言要能分辨自己在哪個 instance**：
  `.storybook/test-utils.ts` 提供 `currentInstance()`（讀
  `matchMedia('(pointer: coarse)')` 與 `documentElement.classList.contains('dark')`，
  不用 stub），擇一渲染與觸控目標類的斷言依此分支。
- **a11y**：`parameters.a11y.test = 'error'`，違規＝測試紅。配套三件：
  (1) 全域關閉頁面級規則（`region`、`landmark-one-main`、`page-has-heading-one`）
  ——元件 story 不是頁面；(2) 例外**只准 per-rule**（`parameters.a11y.options.rules`
  ＋一行理由），不准整個 story `'todo'`；(3) 例外筆數進
  `scripts/story-health-baseline.json` 的 `a11y` 區，只准縮（§2 守門腳本）。
  S1 階段 5 先把全部 ui/ 原語以 `'todo'` 空跑一次產出違規清單，S2 才不會邊寫邊撞。
- **主題與外殼**：`.storybook/preview.ts` 匯入 `src/styles/globals.css`，
  toolbar global `theme` 切 `<html class="dark">`——深色 token **第一條執行期
  驗證管道**。外殼 decorator 提供 `MemoryRouter`、`UserContext`、`FeatureProvider`、
  `NotificationProvider`、`DataCacheProvider`，story 以 `parameters.user`
  （訪客／會員／管理員）選身分。`FeatureProvider` 目前寫死全開且 context 未
  export——階段 4 **不**處理 flag 注入，`BottomNav.test.tsx` 的契約 3／4 留在
  jsdom 保留清單（§4）。
- **資料——元件分三類**：(a) **資料 props**（Badge、StatusCallout、
  DashboardStatCard…）→ S2 直接寫；(b) **loader／fetcher 注入**（`MemberManagement`、
  `WithdrawalManagement`、`IdReviewQueue`、兩個 CardList、`CardOverflowMenu`、
  `WithdrawalFundingFields`，與 `AdminDashboard.tsx` 檔頭 DI 慣例一致）→ 用假
  async 函式寫，S2 第三個 PR；(c) **內含 fetch**（`Navbar`、`MaintenanceBanner`、
  `ThreeStepDialog`、`IdNumberInput`、`RewardHistory`、`SystemAlerts`、
  `SystemNotifications`、`AdminSetup`、所有頁級元件）→ 進「刻意不寫」清單，
  第二期決定 MSW 或 fetcher 注入。第一期不攔網路。
- **閘門**：`npm run check` 納入 stories（D1）；`test:coverage` 只量 unit（D5）。
- **新守門腳本** `scripts/check-story-health.py`（framework-check 軌，`--self-test`
  雙軌）兩個區：**覆蓋**——`src/components/**/*.tsx` 的元件檔（排除 `*.test.tsx`、
  `*.stories.tsx`、`figma/`、context／util 檔）沒有同層 `*.stories.tsx` 就必須在
  baseline 的 `debt` 清單或 `excluded` 清單（刻意不寫，附理由，比照
  `check-color-usage.py` 的 `EXCLUDED_PATHS`）；**修改 `debt` 內元件的 PR 必須同
  PR 補 story 並移出**（守衛只看新增檔攔不到修改，這條由 `/review-implementation`
  與 PR 範本把關）；**a11y 例外**——per-rule 例外筆數。兩個棘輪都只准縮、孤兒紅、
  無 `--update` 旗標。
- **部署**：`deploy-storybook.yml`，`workflow_run`（CI 綠）→ `storybook build` →
  GitHub Pages（`actions/deploy-pages`）。無 secret；`environment: github-pages`
  必配 `cancel-in-progress: true`（規則 11）；`<meta name="robots" content="noindex">`
  視開放問題 #3。
- **AI 入口**：`@storybook/addon-mcp`（preview，React 完整支援）在 S4 試用：
  `.mcp.json` 指向 `http://localhost:6006/mcp`，提供 `docs-list`／`docs-show`／
  `stories-find-by-component`／`test-run`。退路（不依賴 MCP）：rules 要求寫 UI 前
  讀同層 `*.stories.tsx`、寫完跑 `npx vitest run --project=storybook`。

## 3. 架構影響

- `vitest.config.ts` 改成 `test.projects`：`unit`（現行 node＋jsdom pragma，
  include 不變）＋三個 `sb-*`。**每個 project 都 `extends: true`** 才繼承
  react-swc 與 `@`／`@contract`／`@name-cases` alias；`include/exclude`（含
  `supabase`、`e2e` 排除）逐 project 重寫；`coverage`／`thresholds` 留 root。
  階段 1 驗證加一條：`vitest list` 的檔案集與升級前逐檔相同。
- `vite.config.ts` 的 `server.open: true` 與 `resolveSupabaseTarget` 副作用：
  Storybook 以 `viteFinal` 關 `open`；`CF_PAGES_BRANCH=storybook`（D9）。版本化
  alias（`lucide-react@0.487.0` 等 16 檔）在 browser mode 的 dep 預打包要在階段 2
  驗：冷啟動連跑三次皆綠，必要時補 `optimizeDeps.include`。
- `UserContext` → `src/contexts/UserContext.tsx`（D6 codemod）。`appShell.test.ts`
  只對 `App.tsx` 做 regex，不受影響。
- 設定**隨階段 2 一起落地**（不是階段 7）：`tsconfig.json` include 加 `.storybook`
  與 `types` 補 `vitest/browser`；`biome.json` includes 加 `.storybook/**` 與
  `src/components/ui/*.stories.tsx`（ui/ 整層被排除，Biome 2 能否撈回要**實測**：
  故意放一個 lint 錯誤確認會紅）；coverage exclude 加 `src/**/*.stories.tsx`；
  knip 的 Storybook plugin 自動啟用。階段 7 只剩 `.gitignore`、npm scripts。
- CI：`unit-tests` 軌多一步安裝 Playwright Chromium，快取鍵改成
  `hashFiles('package-lock.json', 'e2e/requirements.txt')`（現行只綁
  `e2e/requirements.txt`，npm 與 pip 版本不同時先存者永遠佔位）；`build-bundle`
  在預算檢查**之後**加 `storybook build`。`ci-ok` needs 不變。
- 守衛：`tdd-test-guard.py` 擴鎖（D7）。`.claude/rules/storybook.md` 的 `paths:`
  必須含 **`src/components/**/*.tsx`**——「寫 UI 前先讀 story、禁止腦補 props、
  新元件必須有 story」在動元件檔的那一刻才最需要在 context 裡；此時多半還沒有
  story，只掛 `*.stories.tsx` 等於不會載入。path-scoped 不吃啟動預算
  （4.5k／10k）。CLAUDE.md 已 200/200 行——**淨增 0 行**：改寫「vitest 預設 node
  環境…jsdom」那行為新分層，指令表合併一列塞 `npm run storybook`。
- 效能：pre-commit 多跑 Chromium（估 +40–60 秒）；dev loop 用
  `npx vitest run --project=unit` 或 `--project=sb-mobile` 擇一。
- 安全：GitHub Pages 公開；stories 一律假資料，由 D9 的 hygiene 測試機械把關。

## 4. UI/UX

- 本工程**畫面零變化**——範圍限 S1（純重構）。S2 若為了 a11y 綠而改 ui/ 原語的
  DOM／aria，是產品改動，走開放問題 #2 的裁決與 `/review-implementation`。
- **story 必備內容**（唯一本體寫在 `.claude/rules/storybook.md`，這裡是摘要）：
  - `title` 分組（`UI/`、`Composite/`、`Shell/`、`Admin/`、`Page/`）；`Default` 必有；
    有 variant 的列全部 variant；有資料的補空態／載入態／錯誤態（§6）；
    `tags: ['autodocs']`。
  - **測資取「最壞但可達」**（長中文名、長 URL、jsonb 原文、空清單；缺欄位會讓
    條件渲染整塊消失——friction-log 2026-08-08 收斂 ②）；`sb-mobile` 下通用斷言
    `documentElement.scrollWidth <= innerWidth`（§10 溢字）。
  - **斷言寫目標、不寫現值**（收斂 ③）；**每支新 play 斷言做一次突變驗證**
    （故意改壞元件確認會紅，記在 PR；收斂 ①）。
  - 互動元件：play 至少一條 role／name 斷言（§8）＋一條鍵盤斷言
    （`userEvent.tab`／Esc 關閉／焦點回到觸發鈕，§9）；**overlay 類（Dialog／
    AlertDialog／Sheet／Popover／DropdownMenu／Select）至少一個開啟態 story**
    ——關閉態幾乎沒有 DOM，axe 掃不到東西。
  - **觸控目標通則**：ui/ 所有可聚焦元件（button／input／select／textarea／
    BottomNav 項目 56px）在 `sb-mobile` 斷言 `≥44`，在 `sb-desktop` 斷言**沒被放大**
    （§1「不是把桌面尺寸一起放大」）。
  - **擇一渲染元件**（`useMediaQuery`）：手機斷言卡片樹在、表格不在，桌機相反；
    跨越 768 的 state 處置（§7）**留在 jsdom**，story 不表達。
  - 條件按鈕（§13「只有現在能做的事才出現按鈕」）：真／假各一個 story 斷言
    按鈕在／不在；狀態卡 story 斷言有狀態文字（「卡片不得零資訊」）。主數字
    層次是人工目視，不假裝自動。
  - LINE 內建瀏覽器分支（`InviteFriendPanelContent`、`browserDetection`）要有
    注入偵測結果的變體 story。
  - 命名：export 是英文識別字（`Default`、`Loading`），`name:`／`step()` 敘述中文
    ——與 `test-naming.md` 的分層一致，S3 在該檔補一列。
- **jsdom 保留清單**（退場政策的白名單，寫進 rules）：跨斷點 state 處置
  （`WithdrawalManagement.test`／`MemberManagement.test` 的 R7）；契約型測試
  （`BottomNav.test.tsx` 的 flag 契約、`button.test.tsx`／`badge.test.tsx` 的 token
  形狀）；hook 測試（`renderHook`，約 9 檔，永久留 unit）；story 無法表達者
  （附理由）。S2 的刪除對照表要逐條附等價證據，這兩檔原則上不刪。
- **§12.8 checklist 的分工要寫實**：CI 新增的是「深色渲染不崩＋play 斷言＋axe
  對比數字」；**語意層目視（卡片與背景有無層次、badge 是否只靠顏色、窄版換行／
  截斷後狀態文字仍讀得到）與色盲模擬仍是常設人工步驟**，只是從「devtools
  逐頁」改成「Storybook 逐 story（toolbar theme＋a11y addon 的 vision simulator）」。
  觸發點寫進 PR 範本（「本 PR 動了狀態視覺 → 已在 Storybook 跑色盲模擬」）。
  可量化的一條補成 play：`sb-mobile-dark` 下卡片 computed background ≠ 頁面背景
  （§2 的 0.145→0.205 規則）。
- 行動版優先落在測試矩陣本身：`sb-mobile` 第一個跑、也是 a11y 的判定基準；
  桌機是第二驗收情境。業主入口的退路：README 放
  `iframe.html?id=…&globals=theme:dark` 直連範例，重要元件固定一個明示的 `Dark`
  story——manager 在手機與 LINE 內建瀏覽器上的可達性要在驗收 A 先由 Claude 用
  iPhone 模擬截圖驗一次，不等 S4。

## 5. 流程改變總表（Before → After）

| 環節 | 現在 | 導入後 |
|---|---|---|
| 元件的完成定義 | 有 jsdom 測試（或沒有） | **有 story**（§4 必備內容）＋ play 綠 ＋ a11y 綠，`check-story-health.py` 機械把關；修改 `debt` 內元件要同 PR 補 story |
| 元件層分工（friction-log 2026-08-08 的「jsdom 管互動與資訊在不在、幾何交 Playwright」） | 兩層 | **story 同時管兩者**（真瀏覽器）；jsdom 只剩保留清單；頁級幾何仍是 e2e 探針 |
| `/plan-feature` UI 章節 | 列頁面／元件變更 | 另列**新增／變更的 stories 與狀態** |
| 規劃模板的測試落點 | 純函式→node；元件→jsdom；流程→e2e | 純函式→node；**元件呈現／互動／幾何／主題→story play**；頁級流程→e2e；jsdom 僅限保留清單並寫理由 |
| `/tdd-implement` 紅燈 | jsdom 斷言紅 | UI 階段：story play 紅（`npx vitest run --project=storybook`）；`tdd-test-guard` 鎖 `*.stories.tsx` |
| `/fix-bug` 步驟 1 紅燈與步驟 6 防線回填 | 「CLAUDE.md 測試版圖」（已懸空） | 元件級 UI bug → story play；頁級 → e2e；`docs/_templates/fix.md` 同步 |
| `/tdd-implement` 收尾自查 | dev server＋Playwright 截整頁 | 對 story 截圖（375px／深色各一），貼 PR |
| `/review-plan`、`/review-implementation` UI/UX 視角 | 讀規劃書／diff | 加審 stories：新元件有 story？狀態齊？a11y？`debt` 清單有沒有該移出的？ |
| 驗收站 | 業主上 develop 環境走頁面 | 加 **Storybook 站**（GitHub Pages）：先看元件狀態，再走頁面 |
| Claude 寫 UI 前 | 憑記憶或 grep 元件原始碼 | 先讀同層 `*.stories.tsx`（或 MCP `docs-show`），**禁止腦補 props**（rules 在動元件檔時就載入） |
| §12.8 checklist | devtools 手動逐頁 | 逐 story：深色＋axe 在 CI；語意層目視與色盲模擬在 Storybook，PR 範本有勾選項 |
| `layout_probe.py` 元件級探針 | e2e 唯一的幾何量測 | 既有八支不遷移；**新的元件級幾何期望寫 story**，頁級（第一屏放得下兩筆）仍寫探針 |
| jsdom 元件測試 | 元件層主力 | 新元件不得新增（純邏輯與保留清單除外）；既有的碰到時搬到 story（童子軍）；約 45 檔元件測試是搬遷母體，9 檔 hook 測試不算 |
| PR 範本檢查清單 | 四條 | 加兩條：新增／變更元件有 story 且 a11y 綠；動了狀態視覺已跑色盲模擬 |
| 規則存放 | — | **唯一本體 `.claude/rules/storybook.md`**；plan 模板、skill、reviewer、PR 範本、§8／§12.8 只放一句指標（「規則只寫一份」） |

## 5a. 階段切分（S1 工具鏈，`feature/storybook-workflow`，每階段一個紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 0 | `tdd-test-guard.py` 擴鎖到 `*.stories.tsx`（D7） | `scripts/test-hooks.py` 正反案例 | framework-check 綠 |
| 1 | Vitest 3.2→4.1（`projects`＋`extends: true`、coverage 只量 unit、`playwright` 釘 1.56.0） | 既有 94 個測試檔；無新測試（逃生口 1 的變體，記入 progress） | `npm run check` 全綠；`vitest list` 檔案集逐檔相同；`test:coverage --project=unit` 四項 ≥ 現行門檻（v8 重新映射導致下降要在 PR 寫明並重新校準） |
| 2 | **spike＋落地**：裝 Storybook 10.6、三個 `sb-*` project（主題注入機制在此驗）、`currentInstance()`、設定隨之落地（tsconfig／biome／coverage exclude）、`viteFinal` 關 `open`、第一個 story | `src/components/ui/button.stories.tsx` play：`sb-mobile` 高度 `≥44`、`sb-desktop` 等於 36 | 紅：instance 未設 `isMobile`/`hasTouch` 時 mobile 量到 36；綠：三個 project 全過；`storybook build` 成功；web 容器與 CI 都啟得動 Chromium（D2）；冷啟動連跑三次皆綠；biome 對 ui/ 的 story 會抓錯 |
| 3 | 主題 decorator＋per-project 主題 | `src/components/ui/status-callout.stories.tsx` play：`sb-mobile-dark` 下 warning 的 computed background 等於 `--warning-subtle` 的 computed 值（D8，不寫 hex） | 紅→綠；`sb-mobile` 下等於淺色 token 值 |
| 4 | 外殼 decorators＋`UserContext` codemod（D6）＋規格書 §1.2／CLAUDE.md 那行 | `src/components/BottomNav.stories.tsx` play：會員身分、`sb-mobile` 下五格順序固定；`sb-desktop` 下不渲染（`md:hidden`） | 紅（缺 Router／Context 拋錯）→綠；`BottomNav.test.tsx` 不動 |
| 5 | a11y addon `'error'`＋頁面級規則全域關閉＋**全 ui/ 以 `'todo'` 空跑產出違規清單**（記 progress，交開放問題 #2） | 前三個 story 的 axe 檢查 | 三個 story 綠；清單產出；`'error'` 不降級 |
| 6 | CI：`unit-tests` 裝 Chromium（快取鍵改）、`build-bundle` 加 `storybook build`、D9 的 hygiene 測試 | `scripts/check-workflows.py`＋本 PR 的 CI run＋`repoHygiene.test.ts` 新案例 | check-workflows 綠；CI 全綠；`unit-tests` 牆鐘 ≤ `e2e-tests`（記實測值） |
| 7 | 收尾：`.gitignore`、npm scripts（`storybook`、`build-storybook`、`test:stories`、`test:unit`）、knip | `npm run check:full` | 全綠；`check-context-budget.py` 綠；手機 manager 可達性截圖（驗收 A） |

S2–S5 走 Plan Mode，範圍與驗證標準見 `construction-plan.md`。

## 6. 開放問題（真正需要業主裁決的；其餘已移入 §0.2）

- [ ] **#1 深色 instance 第一期要不要「必過」**：使用者目前碰不到深色（無切換入口，
  §12.8 L424），但 `sb-mobile-dark` 每個 story 都跑、axe `'error'`，pre-commit 與
  CI 都付成本。建議：**跑渲染＋play，axe 對 dark 先 per-rule `'todo'`＋baseline**，
  等深色切換入口排上日程再升 `'error'`。替代：全部必過（最嚴、最貴）／不跑 dark。
- [ ] **#2 既有 a11y 債：修還是進基線**：階段 5 的空跑清單出來後才知道規模。修＝
  S2 會改 ui/ 原語的 DOM／aria（產品改動、影響 e2e 與既有 test、走
  `/review-implementation`）；基線＝per-rule `'todo'`＋理由，棘輪只准縮。建議：
  **對比／label／role 類低風險的修，結構類進基線**，由清單逐條裁決。
- [ ] **#3 提前公開未上線 UI**：develop 的 Storybook 會比正式站早看到重設計畫面，
  且可被索引。建議：Pages 加 `noindex`，接受提前可見（repo 本就 public）。
- [ ] **#4 uiux 主線卡約一週**：S1–S3 排在 uiux S3 之前。建議接受；替代是 uiux S3
  先走舊流程、事後補 story（代價：再搬一次）。
- [ ] **#5 S1 兩次對話的切分點**：建議在階段 2（spike）完成後切；若階段 1 的 Vitest
  升級讓覆蓋率棘輪需重校準，先停下來給業主看數字再進階段 2。
- [ ] **#6 MCP 要不要常駐**：S4 試用後再定；CLAUDE.md 的 MCP 原則是「CLI 優先、
  按需開」，addon-mcp 需要 dev server 常駐。

## 7. 風險與回滾

- **Vitest 4 升級把既有測試弄紅**：階段 1 獨立 commit，可單獨 revert；逐條照
  官方 migration（`workspace`→`projects`、瀏覽器 provider 拆包、mock 還原語意；
  47 個測試檔用 `vi.*`）。
- **覆蓋率數字因 v8 重新映射而掉**：棘輪例外條款是「PR 內寫明理由」；校準後門檻
  仍要貼著實測值；D5 讓 stories 不干擾這組數字。
- **CI 牆鐘**：以「story 數 × 3 instance」估，不以檔數估；階段 6 記實測，超過
  e2e 的 4 分鐘才拆軌（D3）。
- **瀏覽器測試偶發紅**：不設 retry（「flake 不是根因」）；冷啟動 dep 預打包的
  reload 在階段 2 用 `optimizeDeps.include` 消掉並連跑三次驗。
- **web 容器啟不動 Chromium**：D2——釘 1.56.0 後與容器 build 1194 一致；仍不行
  是階段 2 的 blocker，求裁決，記 friction-log。
- **GitHub Pages 公開**：假資料由 D9 機械把關；`noindex` 看 #3。
- **兩個工程改同一批檔**：uiux S8 的 G1 也改 `/plan-feature` 與 reviewer 模板——
  約定 **S3 先、S8 基於 S3 的結果 rebase**；S3 同時同步 uiux 的 S3／S4 驗證表與
  prompt 的測試落點（construction-plan §2 S3）。
- **回滾**：S1 是純加法（新 project、新 config、新 story）＋一個 codemod，revert PR
  即回到 Vitest 3；S3 的守衛與 rules 可逐檔 revert；Pages 可在 Settings 關閉。

## 8. 評估：Claude Design 與 Claude Code mods

> 外部事實查證日 2026-10-04。來源：Claude Design 入門與設計系統設定（
> support.claude.com 文章 14604416、14604397）；mods 總覽與比較表
> （code.claude.com/docs/en/plugins/mods/overview）；Storybook AI／MCP 文件
> （storybook.js.org/docs/ai，本容器需經 GitHub 原始檔讀取）。

### 8.1 Claude Design（claude.ai/design，beta；Max 方案可用）

- **是什麼**：用對話產設計／原型／一頁式提案，並把組織的設計系統套在每個
  產出上。`/design-sync`（Claude Code 指令）把 React 元件庫推成 Claude Design 的
  設計系統專案，**輸入是 React 套件的 dist 或 Storybook**（官方推薦 Storybook 當
  單一來源；僅 React；單向 code→design，沒有拉回程式碼的路徑）。
- **對本 repo 的價值**：現行「做對照頁給業主裁決」（S2b 配色比較板、S2c 推薦樹
  預覽、S2d 會員中心對照頁）已證明有價值，但那些是手工 HTML——顏色對、元件
  不對。同步 Storybook 之後，提案板用的是真 `Button`／`Badge`／`StatusCallout`
  與真 token。
- **裁決**：第二期試點（S5）。觸發條件＝S1–S4 完成且 uiux 工程 S4 開工。
  **常態化的判準預先定義**：(1) `/design-sync` 對本 repo 相依（Tailwind v4、
  版本化 alias）零不支援；(2) 從同步到第一份可裁決的提案板 ≤ 半個工作天；
  (3) 業主在提案板上做出的裁決，實作後**不需要**再出「看過實品才改向」的
  修正 PR（S2c 的改向就是沒有真元件預覽的代價）。手工對照頁沒有耗時紀錄，
  所以 (2) 是絕對值不是相對值。三條有一條不成立就不常態化；**S5 失敗不得阻擋
  uiux S4**（退回手工對照頁即可）。

### 8.2 Claude Code mods（GA，v2.1.287+）

- **官方怎麼說**：mod 是跑在 Claude Code 行程內的函式，獨有能力是**畫介面**
  （面板／橫幅／指令）與**改寫事件**；比較表寫明「有現成腳本要擋／放行／記錄 →
  用 settings hook；要面板、橫幅、自訂指令或改寫事件 → 才用 mod」。面板只在
  終端機與 Desktop app 的 Code tab 畫得出來；cloud session 只跑 hook、不畫。
- **對本 repo**：六支 Python hooks（settings.json 註冊五支＋Stop 的
  `deletion-residue-check.py`）正是「現成腳本在擋／記錄」，有 `test-hooks.py`
  表格測試與 metrics 落檔——改寫成 mod 是純重寫、零行為收益，還得在
  framework-check 補 JS 側驗證。業主主要在 claude.ai/code web session 工作。
- **裁決**：第一期不寫 mod、不遷移。可選項 **M1**（S4 之後、且業主在 Desktop／
  終端機工作 ≥1 週時才做）：repo 內 `.claude/plugins/storybook-status/` 一個 mod，
  提供 `/stories` 指令與一條橫幅——顯示 `debt` 清單剩幾筆、上一次
  `npx vitest run --project=storybook` 的結果；用官方「Test a mod」離線測試驗；
  `--plugin-dir` 載入。它不擋任何事（擋的事留給 settings hooks），兩套機制不重疊。
