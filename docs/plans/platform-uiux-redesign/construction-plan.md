# 平台 UI/UX 全面重設計——施工計畫（工序・分工・監工）

> 搭配同目錄 `plan.md`（工項定義）與 `progress.md`（進度看板）使用。
> 額度前提：Max 20x，session 跑在 claude.ai/code（web）。

## 1. 工序總覽

```
S1 設計語言地基 ──► S2 全站色彩收斂 ──► S3 後台資訊架構 ──► S4 會員詳情
   (D1+D2)            (D3)               (A1+A2)             (A3)
                                            │
                                            └──► S5 admin 快取 ──► S6 前台門面 ──► S7 會員區收尾 ──► S8 制度化收尾
                                                 (A4)              (F1)             (F2+F3)          (G1+G2)
```

- **嚴格依序**：S1→S2 是硬依賴（沒有 token 與守門腳本，收斂就沒有依據）；
  S3 起每個 session 都建立在前面已合併的 develop 上。
- **一個 session = 一條分支 = 一個 PR**，各自合回 develop 才開下一個。
  避免平行施工：全是 UI 改動，平行必撞檔案。
- 每 2 個 session 是一個**驗收站**（見 §4），業主上 develop 環境實看。

## 2. Session 分工表

> 模型依 CLAUDE.md 分級表；「重量」是對額度的粗估（輕≈半小時內、
> 中≈1-2 小時、重≈2 小時以上的 session 長度）。Max 20x 下全表跑完
> 綽綽有餘，但仍照「實作用 Sonnet、高風險用 Opus」配置——省下的額度
> 是留給返工與計畫外狀況的緩衝。

| # | Session | 工項 | 分支 | 流程 | 模型 | 重量 |
|---|---|---|---|---|---|---|
| S1 | 設計語言地基 | D1+D2 | `feature/design-language-foundation` | 三段式落檔（動全站 token，階段 ≥3） | **Opus** 規劃/審查、Sonnet 實作 | 中 |
| S2 | 全站色彩收斂 | D3 | `fix/color-token-sweep` | 輕量 Plan Mode（機械替換，守門腳本兜底） | Sonnet | 中 |
| S3 | 後台資訊架構 | A1+A2 | `feature/admin-ia-refactor` | 三段式落檔（動後台資訊架構與存取閘門——A1 含 AdminRoute bootstrap 例外的裁決） | Sonnet（規劃審查跑 /review-plan） | 中 |
| S4 | 會員詳情重設計 | A3 | `feature/member-detail-redesign` | 三段式落檔（動作位階契約在此頁，審查必跑） | Sonnet | 中 |
| S5 | admin 資料快取 | A4 | `feature/admin-data-cache` | 三段式落檔（跨分頁資料層） | **Opus** 規劃、Sonnet 實作 | 中 |
| S6 | 前台門面 | F1 | `fix/frontend-p1-polish` | 輕量 Plan Mode | Sonnet | 輕 |
| S7 | 會員區收尾 | F2+F3 | `fix/frontend-member-polish` | 輕量 Plan Mode | Sonnet | 中 |
| S8 | 制度化收尾 | G1+G2 | `claude/uiux-program-closeout` | 輕量（改文件與 skill 模板、刪鷹架） | Sonnet | 輕 |

模型配置理由：
- **Opus 只出現在兩處**：S1（design token 是全站契約，錯了每站返工）與
  S5 的規劃段（快取層動到「資料何時算新鮮」的判斷，是本工程唯一
  容易寫出微妙 bug 的地方）。其餘都是呈現層改動，Sonnet 足夠。
- web session 無法逐段調 effort，控制粒度就是「模型選擇＋把 session
  切小」。上表已按此設計：每個 session 的範圍都小到 Sonnet 能穩定完成。

## 3. 每個 session 的開工 prompt（複製貼上即可）

> 通用規則：每個 session 開場先讀三份檔案——本目錄的 `plan.md`、
> `construction-plan.md`、`progress.md`。三段式流程的 session 規劃完
> **停等人審**（這是框架的鎖，也是監工點）；輕量流程的用 Plan Mode
> 給你過目後才動工。

**S1**（模型選 Opus 起手，規劃審過後可換 Sonnet session 實作）：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
執行 S1（工項 D1+D2）：/plan-feature design-language-foundation
規劃範圍：globals.css 語義色 token（success/warning，深淺兩版；
深色版須附 plan.md §4 第 6 點的 devtools 驗證 checklist）、
ui-ux-guidelines.md 新增「色彩與設計語言」章節（黑白極簡規範，
內容依 plan.md §4，含「非狀態計數去色」判準）、
scripts/check-color-usage.py 守門腳本接進 framework-check 軌
（比照既有 checker 的 --self-test 雙軌慣例：先自測表格案例再掃 repo）。
規劃完跑 /review-plan 後停等我審。
```

**S2**：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
執行 S2（工項 D3）：在 fix/color-token-sweep 分支上，按 plan.md §2.4
列出的位置與 §4 規範，全站收斂手刻色與漸層；Badge variant 化、
新增 StatusCallout 元件。用 Plan Mode 先列出完整替換清單給我看過再動工。
守門腳本（S1 產物）必須全綠。
```

**S3**：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
執行 S3（工項 A1+A2）：/plan-feature admin-ia-refactor
範圍與硬約束（先讀 plan.md §2.1 的兩個 ⚠️ 審查發現與 §3 A1/A2 全文）：
1) bootstrap 可達性：AdminRoute 現況把非管理員全擋在 /admin 外，
   「尚無管理員可自助宣告」畫面是不可達死路——規劃必須裁決
   「AdminRoute 例外放行」或「定案只走 API、GUI 退場」，當獨立子項審。
2) Tab 標籤縮短為二字（提領/會員/公告/告警）後才有四 Tab 單列，
   用 AdminDashboard.tsx:118-152 的量測法與
   test_admin_tab_labels_do_not_ink_overflow 驗證；不過則退 2+2 兩列。
3) AdminToolbar 只重構版面（套提領＋會員管理兩頁），CSV 鈕只在已有
   匯出邏輯的頁面渲染；icon 鈕附 aria-label；權重按頻率重排；
   CSV 收集中補忙碌態。
4) 規格書 §13 人工同步四處（無機械把關，清單見 plan.md §2.6）。
規劃完跑 /review-plan 後停等我審。
```

**S4**：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
執行 S4（工項 A3）：/plan-feature member-detail-redesign
範圍：會員詳情 Sheet 分區重設計（依 plan.md §3 A3 描述）。
ui-ux-guidelines §11 的動作位階與確認框契約原樣保留、測試不得弱化。
規劃完跑 /review-plan 後停等我審。
```

**S5**（模型選 Opus 起手）：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
執行 S5（工項 A4）：/plan-feature admin-data-cache
範圍：stale-while-revalidate 模式延伸進 admin 各分頁（切回分頁顯示
舊資料＋背景刷新），loading 統一為骨架屏。不動 API、不動請求時序、
不做預載。四條硬約束照 plan.md §3 A4 全文執行，規劃書必須交付：
(1) 記憶體內快取設計（絕不落 sessionStorage——admin 提領資料含
未遮罩 PII）；(2) 快取排除清單（即時資料與寫入確認框依據欄位）；
(3) admin 版 mutation→invalidation 對照表；(4) 對 AdminDashboard 的
DI 慣例（檔頭註解）的明確裁決。規劃完跑 /review-plan 後停等我審。
```

**S6**：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
執行 S6（工項 F1）：在 fix/frontend-p1-polish 分支上，
ServiceProviderDetail 補骨架屏、首頁與詳情頁視覺對齊新設計語言。
Plan Mode 過目後動工。
```

**S7**：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
執行 S7（工項 F2+F3）：會員區（刊登管理、推薦/任務/獎勵）視覺對齊，
全站三態完備性巡檢＋補缺，overflow sweep 過一輪。
Plan Mode 過目後動工。
```

**S8**：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
執行 S8（工項 G1+G2）：persona 框架升級進 ui-ux-guidelines、
/plan-feature 與 plan-reviewer-requirements 模板加四視角檢核、
刪除本 plan 目錄、friction-log 記錄本工程摩擦。改 hook/skill 後跑
python3 scripts/test-hooks.py 與 framework-check。
```

## 4. 監工 SOP

監工分三層，缺一不可：

### 4.1 Session 內（自動閘門，已由框架提供）

每個 session 收工前必須全過，這些是機械的、不靠自覺：

1. `npm run check` 綠（pre-commit 強制）；送 PR 前 `npm run check:full`。
2. 三段式 session：實作完跑 `/review-implementation`（四視角審 diff，
   專攔「規劃審過、實作走偏」）。輕量 session 若 diff 超出預期範圍，
   一樣補跑。
3. Push 後看 CI 到綠才算收工（紅了同 session 修）。
4. S2 起，色彩守門腳本在 CI 上盯著所有後續 session——這是 D2 存在的
   理由：監工不能靠人記得。

### 4.2 跨 session（進度看板）

- `progress.md` 是唯一的看板：每個 session **開工先讀、收工必更**
  （狀態、PR 連結、驗收站備註、遺留事項）。
- 遺留事項只能記在看板上，不准散在各 PR 留言裡——下個 session 只讀
  看板。

### 4.3 驗收站（業主人工驗收）

| 驗收站 | 在哪之後 | 業主看什麼 |
|---|---|---|
| 驗收 1 | S2 合併 | develop 環境全站走一圈：色彩是否收斂、觀感是否一致、有無改壞的地方 |
| 驗收 2 | S4 合併 | 後台：四 Tab 單列（375px 實機確認標籤不溢字不換行）、工具列、會員詳情分區——手機與桌機各實際操作一次（後台兩者並重） |
| 驗收 3 | S5 合併 | 後台切換分頁的速度感（切回不再等 loading） |
| 驗收 4 | S7 合併 | 前台四情境各走一遍（訪客找服務、刊登、推薦獎勵），手機為主 |

驗收不過 → 開 `fix/*` session 修正，修完該站重驗，才進下一個 session。

### 4.4 糾偏規則（照 CLAUDE.md 既有 SOP）

- Session 方向跑偏：Esc 中斷 → `/rewind`；同一錯誤糾正兩次仍錯 →
  `/clear` 開新 session 重述（開工 prompt 都在 §3，重開成本很低——
  這正是狀態全落檔的用意）。
- 計畫本身要改（工項增刪、順序調整）：改 `plan.md`/`construction-plan.md`
  並在 `progress.md` 記一行異動——計畫文件是活的，但只能在檔案裡活，
  不能只活在某個 session 的對話裡。

## 5. 業主操作步驟（每個 session 您要做的事）

1. **開工**：在 claude.ai/code 開新 session（repo：simonzhao219/uknow），
   按 §2 表選模型，貼上 §3 對應的 prompt。
2. **審規劃**（三段式 session）：收到規劃＋審查報告後過目，重點看
   「範圍有沒有超出工項定義」與「有沒有動到 §5 Scope out 的東西」。
   同意就回覆核准並要求繼續實作（/tdd-implement 由您觸發，這是框架的鎖）。
3. **等收工**：session 會自己跑到 CI 綠＋PR 開好。您合併 PR。
4. **驗收站**（§4.3 的四站）：上 develop 環境實際操作，過了才開下一站。
5. 全程有問題隨時中斷糾偏（§4.4）。

預估節奏：一天 1-2 個 session 的話，全程約 1-1.5 週（含驗收）。

## 6. PR 合併後的部署與達標驗證

> 本節回答兩個問題：合併之後改動怎麼上線？怎麼確認工程目的有達到？
> 部署管線是 **Cloudflare Pages（前端）＋ Supabase（後端）**，全自動、
> 不需要手動部署指令——細節以 CLAUDE.md〈開發流程細節〉為準，此處只
> 摘施工期間用得到的操作面。

### 6.1 部署管線（每個施工 PR 合併後自動發生）

1. **合進 develop 即部署到驗證環境**：Cloudflare Pages 自動建置 develop
   分支前端；Edge Function 由 deploy-supabase.yml 在 develop CI 綠之後
   自動部署到 develop 的 Supabase branch（`workflow_run` 觸發），部署後
   自動打 `/api/health` 比對 `sha` 確認線上就是這個 commit。**您不用做
   任何事，合併後幾分鐘 develop 環境就是最新版**——§4.3 四個驗收站都
   在這個環境做。
2. **正式站上線走晉升 SOP**（建議整個工程驗收完成後一次晉升，中途不上
   正式站）：開 develop→main 晉升 PR → journey-full 全套自動跑
   （30-90 分鐘，真後端拋棄式分支）→ 綠了以 merge commit 合併，合併需
   GitHub `production` 環境的人工核准 → main 收到 push 自動部署正式站。
3. 注意：**PR #278（本規劃 PR）是純文件**，合併後不改變任何線上行為；
   部署從 S1 的第一個施工 PR 起才開始有感。

### 6.2 達標驗證（業主六痛點 → 驗證方法）

每一項都有「機械把關」（CI 自動，防回歸）與「人工實測」（驗收站，
確認體感）兩層；兩層都過才算該痛點結案：

| 痛點 | 機械把關（CI） | 人工實測（在 develop 環境） |
|---|---|---|
| 全站色系不一致 | `check-color-usage.py`（S1 產物，S2 起長駐 framework-check 軌） | 驗收 1：全站走一圈看觀感是否收斂一致 |
| 後台五 Tab 換行醜 | `test_admin_tab_labels_do_not_ink_overflow`（e2e） | 驗收 2：375px 實機看四 Tab 單列不溢字不換行 |
| 提領管理控制列擠壓 | AdminToolbar 元件測試（S3 產出） | 驗收 2：手機看工具列單行、44px 可點 |
| 會員詳情沒設計感 | 元件測試守住分區結構與動作位階 | 驗收 2：開詳情 Sheet 看分區層次，手機桌機各一次 |
| 管理員設置 Tab 多餘 | 規格書 §13 人工同步（無機械把關，S3 checklist） | 驗收 2：確認 Tab 已移除、bootstrap 依 S3 裁決的方式可達 |
| 後台 loading 差一點點 | S5 規劃須附快取行為的單元測試 | 驗收 3：切分頁→切走→切回，第二次應瞬間顯示（背景刷新），並抽查一筆提領資料確認顯示值未過期 |

驗證的操作節奏已編進 §4.3 驗收站與 §5 業主步驟——不需要另外的測試
計畫文件；驗收不過就開 `fix/*` 修，該站重驗後才前進。
