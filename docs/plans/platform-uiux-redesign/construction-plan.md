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
  避免平行施工：全是 UI 改動，平行必撞檔案（例外：S5 與 S6，見下方 2026-10-06 裁決）。
- 每 2 個 session 是一個**驗收站**（見 §4），業主上 develop 環境實看。驗收站 2–4
  自 2026-10-06 起延到 S7 合併後一次驗（見下方）。
- **S2b（2026-10-03 追加）**：驗收站 1 之後業主裁決加強調色與語義色升亮（plan.md §0 第 6 列、§3 D4）。插在 S2 之後、S3 之前（追加時 S3 尚未開工）；它只動 token 與幾個原語，不碰 S3 的檔案。
- **S2c（2026-10-03 追加，同日改向）**：推薦樹世代配色（plan.md §0 第 7 列、§3 D5、§4 第 8 點），排在 S2b 之後，S3 之前或之後皆可。原案「頭像綁訂閱狀態」經業主看過預覽後撤回，改為維持世代表示、把 `--tree-gen-*` 三階灰換成三個專用色相；只動 token、對應測試與文件，不碰 `supabase/functions/`，與 S3 的後台檔案不重疊。
- **S2d（2026-10-03 追加）**：會員中心狀態總覽（plan.md §0 第 8 列、§3 F4），排在 S2c 之後；資料全用既有 API（`overview.attention` 等），不新增後端（業主 2026-10-03 於 PR #335 裁決）；只動會員中心與推薦統計兩個前端檔，不碰 S3。

- **S2e（2026-10-05 追加）**：設計定案落地（plan.md §0 第 9 列、§3 D6、§4 第 9–14 點），排在 S2d 之後、S3 之前；只動 `globals.css`、ui 原語（Button／Checkbox／Badge／Tabs／InputOTP）、全站文案 sweep 與 `ui-ux-guidelines.md`，不碰 S3 的後台檔案；任務中心徽章與會員區頁面改動留給 S7。

- **2026-10-06 業主裁決（S4 合併後）**：
  - **驗收站 2–4 延到最後**：S5、S6、S7 做完、S7 合併後，S8 開工前一次驗完三站（§4.3）。
    延後期間不以驗收擋下一個 session，每個 PR 照常以 CI（含 e2e）把關；S8 要等三站都過才開工。
  - **S5 與 S6 平行施工**：S5 只動後台（`src/components/admin/**` 與 admin 資料層），S6 只動
    前台的服務詳情頁與首頁，兩者不撞檔。共用的只有母 `progress.md`（可能還有 `ui/skeleton.tsx`），
    後合併的 PR 自己 rebase。
  - **S7 等 S5、S6 都合併後開工**（2026-10-07 S5 裁決 D8）。S5 沒有動 `DataCacheProvider`，但改了
    共用的 `usePagedList`（有資料時 `reload` 改背景重讀、失敗保留舊列），S7 的推薦橫幅「全部 N 位」
    會用它；開工前 rebase 到含 S5 的 develop。

- **B1（2026-10-05 追加）**：S7 依賴的後端工項（attention 改一代即將到期＋分頁端點、後端回 UI 的「下線」字串、`/subscriptions/status` 查詢失敗回 5xx），與 S3 平行施工——B1 只動 `supabase/functions/`、api-contract 與兩處前端文案，S3 只動後台前端，不撞檔。任務等級門檻（0／1／4／8 → 2／4／6／8）經盤點只存在前端 `TaskBadge.tsx`，後端與規格書 §9 無等級定義，歸 S7 做徽章時處理，不在 B1。

## 2. Session 分工表

> 模型依 CLAUDE.md 分級表；「重量」是對額度的粗估（輕≈半小時內、
> 中≈1-2 小時、重≈2 小時以上的 session 長度）。Max 20x 下全表跑完
> 綽綽有餘，但仍照「實作用 Sonnet、高風險用 Opus」配置——省下的額度
> 是留給返工與計畫外狀況的緩衝。

| # | Session | 工項 | 分支 | 流程 | 模型 | 重量 |
|---|---|---|---|---|---|---|
| S1 | 設計語言地基 | D1+D2 | `feature/design-language-foundation` | 三段式落檔（動全站 token，階段 ≥3） | **Opus** 規劃/審查、Sonnet 實作 | 中偏重 ※ |
| S2 | 全站色彩收斂 | D3 | `fix/color-token-sweep` | 輕量 Plan Mode（機械替換，守門腳本兜底） | Sonnet | 中 |
| S2b | 強調色與語義色升亮 | D4 | `fix/brand-accent` | 輕量 Plan Mode（token 值已由業主定案，session 只做落地與消費點替換） | Sonnet | 輕 |
| S2c | 推薦樹世代配色 | D5 | `fix/referral-tree-gen-colors` | 輕量 Plan Mode（設計已由業主定案；原案撤回改向） | Sonnet | 輕 |
| S2d | 會員中心狀態總覽 | F4 | `fix/dashboard-status-overview` | 輕量 Plan Mode（設計已由業主定案） | Sonnet | 中 |
| S2e | 設計定案落地 | D6 | `fix/design-decisions-2026-10` | 輕量 Plan Mode（token 值與規則已由畫面稿定案，session 只做落地） | **Opus** 規劃（token 與 Button 原語是全站契約）、Sonnet 實作 | 中 |
| B1 | S7 依賴的後端工項 | attention 口徑＋分頁端點、後端用語、/subscriptions/status 5xx | `fix/referral-attention-backend` | 輕量 Plan Mode（口徑已定案）；可與 S3 平行（只動 `supabase/functions/`、api-contract 與兩處前端文案，不碰 `src/components/admin/`） | Sonnet | 輕 |
| S3 | 後台資訊架構 | A1+A2 | `feature/admin-ia-refactor` | 三段式落檔（動後台資訊架構與存取閘門——A1 含 AdminRoute bootstrap 例外的裁決） | Sonnet（規劃審查跑 /review-plan） | 中 |
| S4 | 會員詳情重設計 | A3 | `feature/member-detail-redesign` | 三段式落檔（動作位階契約在此頁，審查必跑） | Sonnet | 中 |
| S5 | admin 資料快取 | A4 | `feature/admin-data-cache` | 三段式落檔（跨分頁資料層） | **Opus** 規劃、Sonnet 實作 | 重 ※S5 |
| S6 | 前台門面 | F1 | `fix/frontend-p1-polish` | 輕量 Plan Mode | Sonnet | 輕 |
| S7 | 會員區資訊層次 | F2+F3＋S2d 審查遺留 | `fix/frontend-member-hierarchy` | 輕量 Plan Mode（照 §13 通則與 F4 的樣板） | Sonnet | 中 |
| S8 | 制度化收尾 | G1+G2 | `claude/uiux-program-closeout` | 輕量（改文件與 skill 模板、刪鷹架） | Sonnet | 輕 |

※ **S1 重量異動（2026-09-14）**：兩輪四視角審查回填後範圍變大（C3 原始色值
規則、`--destructive` 兩組 token、對比斷言翻倍、灰階對照表 39 處、G1 完整性
檢查、色盲 checklist）。裁決**不拆 session**——S2 同時依賴 token 與守門腳本，
拆開只是把依賴從 session 之間搬到 PR 之間。實作仍用 Sonnet，但**可能需要兩次
對話**（中途 `/clear` 續作屬預期內，狀態在
`docs/plans/design-language-foundation/progress.md`）。

※S5 **重量異動（2026-10-07）**：三輪規劃審查與業主兩輪裁決後是十三個 TDD 階段（hooks、快取、提領頁三段、
會員、證件審核、公告與告警、殼層、e2e、文件）。裁決**單一 PR 不拆**（K8：快取要到殼層階段才在正式畫面啟用，
拆開的第一個 PR 驗不到「切回瞬間顯示」）；實作分兩到三次對話，4c 綠燈後停下讓主 session 做金流部分的中途對照。
過程紀錄在 PR #371（規劃鷹架已隨收尾刪除）。

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
先 git checkout -B feature/design-language-foundation origin/develop
（web session 預設生在 claude/* 分支，三段式守衛只認 feature/<slug>）。
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

**S2b**（Sonnet；token 值已定案，不需要再提方案）：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
執行 S2b（工項 D4）：在 fix/brand-accent 分支上落地業主裁決的配色 A
（plan.md §0 第 6 列、§4 第 7 點）。用 Plan Mode 先列出替換清單給我看過再動工，
守門腳本必須全綠，globals.test.ts 的對比度測試必須擴到新 token。

一、globals.css 新增 brand 系列（三處齊備：:root／.dark／@theme inline；
   名字不能用 --accent，那是 shadcn 既有的 hover 灰）：
   淺色 --brand #4f46e5、--brand-hover #4338ca、--brand-foreground #ffffff、
         --brand-subtle #e0e7ff、--brand-subtle-foreground #3730a3
   深色 --brand #818cf8、--brand-hover #a5b4fc、--brand-foreground #0a0a0a、
         --brand-subtle #1e1b4b、--brand-subtle-foreground #c7d2fe
   --ring 淺深兩版都改成 var(--brand)（焦點框跟著變）。
二、語義色實心層改亮底黑字（淺深兩版同值；淺底 B 與裸字 C 的 token 不動）：
   --success #22c55e／--success-foreground #0a0a0a
   --warning #fbbf24／--warning-foreground #0a0a0a
   --destructive #f87171／--destructive-foreground #0a0a0a
   連帶必改：ui/badge.tsx 與 ui/button.tsx 的 destructive variant 把寫死的
   text-white 換成 text-destructive-foreground，並拿掉 dark:bg-destructive/60
   （六成透明的淺紅配黑字過不了對比）；aria-invalid:border-destructive 這類
   表單錯誤邊框改用 border-destructive-border（#f87171 當邊框對白底只有 2.5:1）。
三、消費點改指 brand（只有這些，不擴散）：
   ui/button.tsx link variant text-primary → text-brand；新增 brand variant
   （bg-brand text-brand-foreground hover:bg-brand-hover）給次要行動鈕用；
   ui/tabs.tsx 選中分頁 data-[state=active] 加 text-brand（底線或底色擇一，
   量測法不變、不得讓四 Tab 換行）；task/ProgressBar.tsx 填色與
   utils/userReferralFormatter.ts getProgressBarStyle 的 40–69% 段
   bg-muted-foreground → bg-brand。checkbox/switch 的選取態維持 primary 黑。
四、測試：globals.test.ts 的三處齊備與 @theme 值字面檢查納入 brand 五個 token；
   對比斷言新增 brand 字對 --background 與 --card ≥4.5:1、brand 當邊框 ≥3:1、
   brand-subtle-foreground 對 brand-subtle ≥4.5:1，淺深各一輪；既有 A 形狀
   字/底斷言自動覆蓋新值。既有元件測試若斷言 text-white 字串，同步更新。
五、ui-ux-guidelines.md §12：12.3 新增「強調色」段——--brand 的用途清單
   （連結、選中分頁、進度填色、焦點框、次要行動鈕）、「強調色 ≠ 資訊狀態色，
   資訊/進行中仍走灰階」、A 形狀改亮底黑字的理由；12.5 的「CTA／連結可用
   --primary」改為「主行動用 --primary 黑，次要行動與連結用 --brand」。
   12.8 的 devtools checklist 不變，實作完自己跑一次深色與色盲。
六、收尾更新 progress.md（S2b 列、異動記錄）；PR 描述附淺深兩版對比度表。
```

**S2c**（Sonnet；S2b 合併後才開。**原案已撤回，以下是改向後的實際內容**——原 prompt 是「頭像綁訂閱狀態＋狀態 chip＋`summary.statusCounts`」，業主看過預覽後於 PR #334 留言撤回；原文可由 `git show bd97675:docs/plans/platform-uiux-redesign/construction-plan.md` 取回）：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
執行 S2c（工項 D5，改向後）：在 fix/referral-tree-gen-colors 分支上，把推薦樹的世代色
由三階灰換成三個專用色相（plan.md §0 第 7 列、§4 第 8 點）。只動 globals.css 的
--tree-gen-*（保留、只換值；徽章字色拆成 -1/-2/-3）、globals.test.ts、ReferralTreeView.tsx
的 GEN_BADGE 與註解、ui-ux-guidelines.md §12.5 (c)，以及這三份計畫檔；不動
supabase/functions/，版面維持原樣（頭像＋右下狀態小點＋名字＋右側「剩 N 天到期／N 位」）。
色票（淺／深）：一代 teal #0f766e／#2dd4bf、二代 violet #7c3aed／#a78bfa、三代 pink
#be185d／#f472b6；avatar-foreground #ffffff／#0a0a0a；徽章底 #ccfbf1／#ede9fe／#fce7f3
（深 #042f2e／#2e1065／#500724）、徽章字 #115e59／#5b21b6／#9d174d（深 #5eead4／#c4b5fd／#f9a8d4）。
globals.test.ts 改驗新值：三處齊備、字對底 ≥4.5:1、連接線對 bg／card ≥3:1；刪掉「亮度
遞增」與「與已失效灰亮度差」（三代現在靠色相分辨）。守門腳本與 e2e overflow sweep 必須全綠。
收尾更新 progress.md（S2c 列、異動記錄）。
```

**S2d**（Sonnet；S2c 合併後才開）：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
執行 S2d（工項 F4）：在 fix/dashboard-status-overview 分支上把會員中心從導覽
選單改成狀態總覽（plan.md §0 第 8 列、§3 F4）。用 Plan Mode 先列出版面與資料
對應給我看過再動工；守門腳本、既有元件測試、e2e overflow sweep 必須全綠。

一、MemberDashboard.tsx 版面（由上到下）：
   1) 「需要注意」區：有事才渲染，用 StatusCallout variant="warning"（titleAs 依
      頁面標題層級）列出每條一個動作連結（brand）：即將到期的下線 N 位 → /referrals
      （該頁上方的需要關注橫幅就列出這些人；樹沒有狀態過濾）、待查收提領 N 筆 → /rewards。
      只列後端真的有的狀態：listings 表沒有審核／退件欄位（規格書 §11，可見性
      由 has_active_subscription 即時推導、不存 isActive），所以沒有「審核退件」這條。
      資料：overview.attention.items（既有，伺服器已依緊急度排序、即將到期在前，
      最多 6 筆＋total）、useRewardData 的提領狀態、useUserListing。
   2) 四張狀態卡，每張一個主數字或主狀態，整張可點（Link 包卡，鍵盤可達、
      aria-label 完整），右側 chevron，不再放重複標題的按鈕：
      刊登：刊登名稱＋「會籍至 yyyy/mm/dd」；可見性只有後端真有的兩種——會籍有效
            ＝上架中（不另加徽章，正常態不上色）、會籍失效＝「已隱藏」secondary 徽章
            （由 useSubscription 推導，與規格書 §11 一致；不存在「審核中」「退件」）；
            沒有刊登時才出現唯一的黑色主按鈕「立即刊登」（三態邏輯沿用檔內既有註解）。
      推薦網絡：下線總數主數字（summary.totalReferrals）＋「N 位即將到期」徽章
            （N = attention.items 中 status === 'expiring' 的筆數，warning-subtle，
            N 為 0 時不顯示；items 全是即將到期且 total 更大時顯示「至少 N 位」——
            業主 2026-10-04 於 Plan Mode 裁決只算即將到期，不用 attention.total、
            不寫「需關注」）；點卡片到 /referrals。不做依狀態的四顆 chip。
      本月任務：x / y 主數字＋ brand 進度條（後端 /tasks 目前只有「推薦王」一個
            任務，x = current、y = target，用既有 useTaskData）；completed 為真時顯示
            success-subtle「本月已達標」。
      可提領點數：主數字（P）＋待查收 N 筆 warning-subtle 徽章；有可提領額度時
            顯示黑色主按鈕「申請提領」（整頁只有這一顆主按鈕）。
   3) SubscriptionStatusCard 與 MyQrEntry 維持，位置依 Plan Mode 提案。
二、ReferralManagement 的 ReferralStats：四個等大數字改成「一個主數字（下線總數）
   ＋ 一行小字『一代 7 · 二代 4 · 三代 1』」；需要關注的人數已由同頁既有的
   需要關注橫幅承擔，統計區不重複。不做狀態 chip、不做過濾。
三、數字一律 --foreground 黑（§12.5），語義由徽章承擔；brand 只用在連結、進度
   填色、選中態；主按鈕黑且整頁至多一顆。載入中用 Skeleton 占位（不閃「0」），
   讀取失敗該卡顯示中性錯誤態，不整頁報錯。
四、ui-ux-guidelines.md 新增「§13 資訊層次」三條通則（規則只寫一份，S7 照此；審查後補第 4 條「單區塊失敗中性錯誤態」，第 1 條改寫成判準）：
   (1) 每頁一個主數字或主狀態，字級明顯大於其他，其餘數字降級；
   (2) 卡片不得零資訊——至少回答「現在什麼狀態」；純導覽入口交給導覽列不做成卡片；
       整張卡可點時不另放重複標題的按鈕；只有「現在就能做的事」才出現按鈕，
       主行動黑、次行動 brand；
   (3) 需要注意的事集中放最上面，warning 淺底框，每條帶一個可點的動作。
   §3 導覽段補一句：會員中心是儀表板不是選單，任務／推薦／獎勵的入口在 BottomNav。
五、測試：MemberDashboard 補四張卡的狀態渲染（三態）、需要注意區有事才出現、
   主按鈕至多一顆；ReferralStats 測試更新；375px overflow sweep。
六、StatusCallout 狀態圖示跟著 variant 走（業主 2026-10-03 指出任務中心
   「領取說明」是灰底配 ⚠——S2 只換色沒換圖示，S2 之前就是藍底配 ⚠）：
   元件依 variant 給預設圖示 success→CircleCheck、warning→TriangleAlert、
   destructive→CircleAlert、neutral→Info，呼叫端不傳 icon 就自動一致，只有
   非狀態圖示（Shield、UserCog 這類）才自訂；status-callout 測試補四個預設。
   順手修兩處：task/TaskGuide.tsx 領取說明拿掉 icon={AlertTriangle}（內容是
   操作說明，neutral＋ⓘ 正確）；subscription/SubscriptionStatusCard.tsx
   destructive 用 ⚠ 改走預設。§12.3 補一句「狀態圖示跟著 variant 走，不另傳」。
   收尾更新 progress.md（S2d 列、異動記錄）。
```

**S2e**（S2d 合併後才開；模型選 Opus 起手，Plan Mode 列完清單後可換 Sonnet 實作）：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md 與
全站畫面稿 https://claude.ai/artifact/RzXCDXTrHetn8Ua4xkXor3（定案載體，淺深兩版都看）。
執行 S2e（工項 D6）：在 fix/design-decisions-2026-10 分支上把 plan.md §4
第 9–14 點的定案落到 token 與 ui 原語。用 Plan Mode 先列 token 對照表、原語
改動清單、消費點清單給我看過再動工；globals.test.ts、守門腳本、既有元件
測試、e2e overflow sweep 必須全綠。只動 globals.css、src/components/ui/、
全站文案 sweep 與 ui-ux-guidelines.md；任務中心徽章與會員區頁面是 S7。

一、globals.css 換成新五層色表（plan.md §4 第 12 點，淺深兩版）：
   墨色五層對應 --background／--secondary／--border／--muted-foreground／
   --foreground，--primary 與 --foreground 同值（#121223，深 #f2f2f7）；
   success／warning／destructive 各自的 A（600）／B（50 淡底＋300 框線＋800 字）／
   C（裸字＝800）；--brand 系列換成蔚藍（600 實色、50／100 淡底、300 框線、800
   淡底字，深色一組）；--tree-gen-* 對齊 700 階。globals.test.ts 以同一公式重驗
   每一組（文字 4.5、框線 3），數字以測試為準、plan.md 的值若不過就改值並回填。
二、新 token：--sel（＝--muted-foreground）與 --sel-foreground（＝--background），
   供選取／聚焦；--medal-gradient（brand-300 → brand，淺深各一）供任務徽章；
   --ring 改指 --sel。§12.4 開一條例外「任務徽章填色可用 --medal-gradient」，
   check-color-usage.py 的 C2 把徽章元件（S7 會建）列入 baseline 例外的機制先備好。
三、Button（src/components/ui/button.tsx）：default 維持黑（流程主要動作），新增
   tone="guide"（bg-brand text-brand-foreground，只給續訂／加入推薦計畫／確認收款）
   與 tone="secondary"（白底、容器色外框與字；黑白卡片＝border text-foreground）；
   brand variant 併入 guide、link variant 改墨色底線；destructive 維持紅框字、實心紅
   只在不可逆確認框。focus-visible 只保留 3px 淡環（ring-sel/30），其餘單圈。
   〔#365 裁決 D3：實心紅的判準改為「確認鈕跟觸發鈕同類」——看破壞性、不看可逆性，
   規則以 ui-ux-guidelines §12.11 為準，這句保留為歷史〕
   〔#354 裁決 D1：改全不透明 ring-ring（＝--sel），/30 對白底 1.54:1 不過 1.4.11〕
   位置規則不進 Button，寫進 §12 的「按鈕」一節供頁面套用。
四、選取／聚焦改走 --sel（plan.md §4 第 9 點第三條）：Tabs 選中格、chip／Badge 的
   選中 variant、縮圖與方案框的選中框線（2px --sel）、InputOTP 目前格；Checkbox
   未勾白底框線、已勾 --primary 不動；BottomNav 目前頁墨黑不動；首頁搜尋 FAB
   維持白底框線陰影（main 現行）。方案框選中不加勾號。
五、全站文案 sweep（plan.md §4 第 10 點「文案」）：
   (1) 流程鈕去箭頭：WithdrawalProcess 三顆、CollectionPreviewDialog 兩顆、
       CollectionVerifyDialog 一顆、IdNumberVerification 手刻 SVG 箭頭、
       ForgotPasswordPage「返回登入」改連結；
   (2) 中間步驟一律「下一步」：AuthPage 步驟 1「繼續」、WithdrawalProcess 步驟 2
       「確認並繼續」；最後一步的動詞（註冊／送出驗證碼／提交申請／建立刊登／
       確認領取／確認並前往付款）不動；
   (3) 行為一致的續訂鈕統一「續訂」（立即續訂／續訂 / 重新訂閱 都到
       /payment/checkout），「開始訂閱」只給從未訂閱者；SubscriptionStatusCard
       會籍已失效框改 warning；
   (4) 「上線／下線」改「推薦人／一代／二代／三代」，相對子代寫「N 位」或「直接推薦
       N 位」；事業手冊、參加契約、刊登方案三份 LegalMarkdown 內容不改（7b）。
六、ui-ux-guidelines.md 以程式碼為準同 PR 改寫：§12.3 強調色一節改成「品牌色蔚藍
   只出現在引導鈕與重點淡底」、A 形狀依新色表（綠紅 600 配白字、琥珀 600 配黑字）、
   §12.5 的「次要行動與連結用 brand」改成三分法、§12.4 補徽章漸層例外、新增
   「按鈕三分法與位置」「選取與聚焦」「文案」三節（規則只寫一份，寫在這裡，
   plan.md §4 第 9–14 點在 S8 刪鷹架時隨目錄消失）；§13 第 2 條的「主行動黑、
   次行動 brand」改成三分法的措辭。規格書 §9 等級門檻改 2／4／6／8 與後端
   TaskBadge 同步**不在 S2e**（屬 supabase/functions/，S7 前另開後端工項）。
七、測試：button.test.tsx 補 tone 三種；globals.test.ts 新色表全組；Tabs／OTP／
   Checkbox 選中態快照；文案 sweep 的 e2e 文字斷言同步改（grep 「繼續」「確認並繼續」
   「下線」「上線」）。375px overflow sweep 與 devtools .dark 各看一輪。
八、按鈕 tone 消費點 sweep（2026-10-05 補，原語改了語意就要同 PR 改消費點，
   不留給 S7）：引導鈕掛 tone="guide" 只有三處——續訂（SubscriptionStatusCard、
   RequireMembershipRoute、PaymentCheckout 之外凡是到 /payment/checkout 的續訂鈕）、
   加入推薦計畫（MyQrEntry 卡上那顆；對話框裡的送出是流程鈕維持黑）、確認收款
   （WithdrawalSection 提領申請列）。目前是黑色主鈕或 variant="brand" 但三分法歸
   次要的改 tone="secondary"：會員中心與 WithdrawalSection 的「申請提領」、
   會員中心與刊登管理的「立即刊登／刊登新服務」、任務中心的「領取獎勵」「查看本月
   推薦詳情」、刊登卡的「查看」「編輯」、我的 QR 的「分享」「邀請好友」。流程鈕
   （繼續／登入／註冊／下一步／前往付款／建立刊登／儲存變更／提交申請／確認領取／
   確認查收、後台通過／標記已匯款／確認匯款／發布公告／確認授予——S4 裁決 D4：面板裡的設為管理員切換鈕是流程起點、屬次要）維持 default 黑。
   grep variant="brand" 與 <Button> 無 variant 的用法逐一歸類，清單放進 Plan Mode。
   §13 第 2 條「主行動黑、次行動 brand」同 PR 改成三分法措辭（六已列）。
   收尾更新 progress.md（S2e 列、異動記錄）。
```

**B1**（後端工項，與 S3 **平行**；Sonnet；只動 `supabase/functions/`、api-contract 與兩處前端消費點的文案）：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md、supabase/README.md、
docs/uknow-software-specification.md §7.2 與 §10。
先 git checkout -B fix/referral-attention-backend origin/develop。
執行 B1（S7 依賴的後端工項）：三件事，用 Plan Mode 先列契約差異與消費點給我看過再動工；
Deno 測試（supabase/functions/api/*.test.ts）先紅後綠，前端 npm run check、e2e mock 同步全綠。
一、/referrals/network/overview 的 attention 改口徑（plan.md §4 第 11 點，業主 2026-10-04 定案）：
   只算「一代且即將到期」——supabase/functions/api/index.ts 約 3626–3650 行的 attentionAll
   改為 generation === 1 && status === 'expiring'，依剩餘天數升冪；total 即精確人數；
   items 仍取前 ATTENTION_LIMIT（6）筆（前端目前依 items 數即將到期、total > items 時顯示
   「至少 N 位」，改口徑後兩者相等，截斷文案自然消失）。規格書 §7.2 補下線四態
   （active／expiring／expired／suspended）與 expiring＝會籍 ≤30 天的定義（目前只在後端註解）。
二、新增分頁清單端點 GET /referrals/network/attention?page=&size=（預設 50、上限 200，
   與搜尋分頁同慣例；total 永遠是全部命中數），回傳同一組「一代即將到期」節點，
   供 S7 的推薦管理橫幅「全部 N 位 ›」。授權與 overview 相同；加 network-endpoints.test.ts
   的案例（空、單頁、跨頁、非一代與非 expiring 不入列）。api-contract（@contract 別名）
   補型別與路由表，docs/api 若有端點清單一併補。
三、後端回給 UI 的字串改用語（plan.md §4 第 14 點）：index.ts:3691「載入下線失敗」→
   「載入推薦資料失敗」；grep 整個 supabase/functions/ 的字串常值（不含註解）裡的
   「上線／下線」，有回到 UI 的一律改「推薦人／一代／二代／三代」。
四、既有遺留順手收：/subscriptions/status（index.ts 約 2706 行）查 user_account_status
   失敗時回 'expired' 而非 5xx——改回 500，前端 useSubscription 的 lastFetchFailed 路徑
   已能承接；subscriptions-status.test.ts 補案例。
五、前端只做最小同步，不重做版面（版面是 S7）：ReferralTreeView 橫幅文案
   「N 位需要關注」→「N 位一代即將到期」（口徑變了文案不能留）、e2e 與 vitest 的
   overview mock 依新口徑改資料、MemberDashboard 的 countExpiring／formatExpiringCount
   不動（邏輯仍成立）。不碰 src/components/admin/（S3 在改）。
六、會員中心摘要端點（一個聚合 API 取代五 hook 扇出）**不在 B1**：效能議題，S7 看完
   實際載入狀況再決定要不要開。收尾更新 progress.md（B1 列、異動記錄、遺留事項改寫）。
```

**S3**：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
先 git checkout -B feature/admin-ia-refactor origin/develop
（web session 預設生在 claude/* 分支，三段式守衛只認 feature/<slug>）。
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

**S4**（2026-10-05 依 S3 收尾狀態改寫為八條；2026-10-06 註：區塊命名與順序已依業主裁決 Q1／D2 調整，以 plan.md §3 A3 為準）：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md
（母計畫；S4 列、遺留事項、plan.md §2.3 與 §3 A3 尤其要看）。
先 git checkout -B feature/member-detail-redesign origin/develop
（web session 預設生在 claude/* 分支，三段式守衛只認 feature/<slug>）。
執行 S4（工項 A3）：/plan-feature member-detail-redesign
範圍：會員詳情 Sheet 分區重設計，三段式落檔。規劃書必須交代下列八條：
1) 分區結構：頂部身分卡（姓名＋狀態 Badge＋會籍與到期）→ 分組區塊
   （帳號／會籍與金流／推薦關係／敏感資料／近期提領）→ 底部管理動作區。
   資訊層次照 ui-ux-guidelines §13：每區一個主狀態、區塊各自三態且失敗
   不連坐、空態是一般文字不借錯誤態樣式。資料只用現有 AdminMemberDetail
   契約欄位（_shared/api-contract.ts:753）；本 PR supabase/functions 零變更
   ——缺欄位記遺留，不擴 API。
2) 動作位階與確認框契約（ui-ux-guidelines §11）原樣保留：停權／恢復／
   授予／撤銷仍共用同一個 MemberAction、同一個確認框與執行器，逐方向的
   確認規則不變；MemberManagement.test.tsx 既有測試只能增不能弱化，改到
   任何現有 it 的理由寫進偏離說明。管理動作區按鈕依三分法（§12.11）：
   停權與撤銷 tone="destructive" 紅框字、其餘 secondary；後台沒有引導鈕
   不用品牌色；面板內至多一顆實心鈕（可以零顆）。
3) 「查看」→Sheet 出現之間補回饋：觸發鈕用 Button 的 loading prop 並
   disabled，同列不得重複觸發；詳情取失敗維持現在的錯誤態路徑
   （test 367 行「詳情取不到時顯示錯誤，不留一個空面板」）。
4) 手機：375px Sheet 全螢幕、分區標題建立層次；桌機維持 sm:max-w-lg
   側欄。補 e2e/test_admin_mobile_layout.py 一條 375px 正向版面斷言
   （開詳情後分區標題全部可見、無橫向溢出）。Sheet 的浮起表面
   （--raised）業主已裁決留給 S7，本 PR 不碰。
5) 敏感資料區：身分證與收款帳號仍是後端遮罩值（test 190 行）；分區
   標題要讓人一眼知道這區是敏感資料；不得加任何前端「顯示完整」。
6) 近期提領區的狀態：現況是 WITHDRAWAL_STATUS_LABEL 純文字。若改成
   Badge，顏色對應必須與 WithdrawalManagement 的 getStatusBadge 同源
   （遺留事項「awaiting_collection 兩處顏色語意不一致」在此裁決，或
   維持純文字並記錄理由）。
7) 定位器契約（S3 的教訓，friction-log 2026-10-05「漏網」）：journey
   f70（e2e/journey/steps/f70_renewal_saga_steps.py:159-166）靠按鈕名稱
   「查看 {name} 的詳情」與 Sheet 內 get_by_text("推薦人", exact=True)
   定位。改任何 dt 標籤、按鈕名稱、aria-label 之前，先對 e2e/（含
   journey/）與 src/**/*.test.tsx grep 舊字串；journey 只在晉升 PR 跑，
   漏掉要到那時才紅。規劃書列出會動到的字串與對應的定位器。
8) 文件：規格書 §13 會員管理列（uknow-software-specification.md:653）
   敘述若因分區改變要同步；ui-ux-guidelines §11〔實作〕指向不變；
   construction-plan §4.3 驗收 2 的「S4 部分」補成可勾的清單（手機、
   桌機各一組）；progress S4 列。收尾前刪 docs/plans/member-detail-redesign/
   （/tdd-implement 收尾負責）。
模型 Sonnet。規劃完跑 /review-plan 後停等我審。
```

**S5**（模型選 Opus 起手；2026-10-06 依 S3／S4 收尾狀態改寫為九條）：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md
（母計畫；plan.md §2.5 根因與 §3 A4 四條硬約束、progress 遺留事項
「S3 審查遺留 → S5」與「S4 遺留」尤其要看）。
先 git checkout -B feature/admin-data-cache origin/develop
（web session 預設生在 claude/* 分支，三段式守衛只認 feature/<slug>）。
執行 S5（工項 A4）：/plan-feature admin-data-cache
範圍：stale-while-revalidate 模式延伸進 admin 四個分頁（切回分頁瞬間
顯示舊資料＋背景刷新），loading 統一為骨架屏；不動 API、不動請求時序、
不做預載；supabase/functions 零變更。與 S6 平行施工：只動
src/components/admin/** 與 admin 資料層（S6 動前台詳情頁與首頁），
後合併的 PR 自己 rebase。規劃書必須交代下列九條：
1) A4 四條硬約束逐條落地：(a) 記憶體內快取，絕不落 sessionStorage／
   localStorage——admin 提領資料含未遮罩身分證與帳號；附一條守衛測試
   （grep 或 vitest）釘住。(b) 快取排除清單：系統告警、待審佇列數等
   即時資料，與寫入確認框依據的欄位（退件／標記已匯款的金額與帳號、
   停權／授予的現況）——不快取，或開確認框時強制同步 revalidate。
   (c) admin 版 mutation→invalidation 對照表（比照 DataCacheContext 的
   MUTATION_GROUPS，不手動散清）：提領狀態變更、批次匯款、停權／授予
   ／撤銷、證件審核、公告 CRUD、告警處理各自失效哪些 key。(d) 先讀
   AdminDashboard.tsx 檔頭的 DI 慣例（取數走 AdminDashboard、畫面只吃
   props），明確裁決「注入式 fetcher 的快取 hook」還是「hook 內含 fetch」，
   寫清楚取捨與元件測試的替身方式，不默默打破。
2) 快取生命週期：登出、切換帳號、離開 /admin 時清空（PII 不留在記憶體
   超過 session）；DataCacheContext 現有 scope 與清除時機可否直接沿用，
   不行就說明為何另設。
3) 切回分頁的行為：Radix Tabs 非 active 不掛載（plan.md §2.5）——維持
   不掛載＋快取水合，或改 forceMount？裁決並說明對首進請求數與記憶體的
   影響；背景刷新的觸發條件（stale 時間或每次切回）。
4) 骨架屏統一：四個分頁 loading 都用與內容同形的 Skeleton（§5）；首進
   才有骨架，切回有舊資料就不換骨架；手動「重新整理」改成背景刷新＋
   狀態宣告（承接遺留：AdminToolbar 重新整理焦點掉 body、無狀態宣告；
   SystemAlerts 自刻的重新整理鈕收進 AdminToolbar）。
5) 承接遺留逐條裁決「本 PR 做／不做（留給誰）」：請求序號收斂成一個
   hook（usePagedList 加序號、MemberManagement 的 detailSeq 併入，含
   「重開在途」補讀窗口）；匯出中切分頁雙下載（匯出旗標提升到分頁殼層
   或匯出期間停用切換）；會員頁載入更多中送搜尋的競態；CSV 匯出失敗改
   獨立狀態；list.reload() 期間關面板焦點掉 body（SWR 後應自然消失，
   收尾確認）；「已匯出 N 筆」位移。
6) 測試：快取行為單元測試（切回命中、stale 背景刷新、mutation 失效、
   登出清空、排除清單不快取）；e2e 一條「切分頁→切走→切回，第二次不
   出現骨架」（驗收 3 的機械版）；既有 admin 各分頁測試只增不減。
7) 定位器契約（S3／S4 的教訓）：先 grep e2e/（含 journey/ 的 admin
   步驟）與 src/**/*.test.tsx 用 role="status"、骨架、「載入中」定位的
   地方；骨架與 loading 文案改動要列出會動到的定位器。
8) 文件：規格書 §13 若描述 loading 行為要同步；ui-ux-guidelines §5 補
   admin SWR 規則一句、不重複 §13 第 4 條；construction-plan §4.3 驗收 3
   補可勾清單（含前置條件）；progress S5 列與遺留事項結案；收尾刪
   docs/plans/admin-data-cache/。
9) 風險：PII 在記憶體的曝險面（devtools 可讀）與現狀相同、不新增；
   快取讓 admin 看到過期的寫入依據——排除清單是防線，舉一個反例說明
   為何那個欄位不能快取。
規劃用 Opus，實作可切 Sonnet。規劃完跑 /review-plan 後停等我審。
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
執行 S7（工項 F2+F3）：在 fix/frontend-member-hierarchy 分支上，照
ui-ux-guidelines §13 的通則與 S2d 做好的會員中心樣板，重做任務中心、
獎勵回饋、刊登管理三頁的資訊層次：每頁一個主數字或主狀態（獎勵＝可提領
點數、任務＝進行中任務進度、刊登＝刊登狀態），其餘降級；達標／已完成的
卡收起、進行中排前面；主行動一顆黑、次行動 brand；會籍失效狀態的呈現
（續約 banner、功能導向提示、獎勵頁例外可讀）是一級對象。接著 F3：全站
三態完備性巡檢＋補缺、既有 text-destructive 裸字若仍有殘留一併收掉、
overflow sweep 過一輪。另外承接 progress.md 遺留事項「S2d 審查遺留」那條的前端
項目（withdrawalBlockReason 收斂、dashboardSummary 搬 utils/、DataCacheProvider
單一 commit＋provider 測試、adoptShared 共用化、canWithdraw 等會籍 settled、
mutation 後 refetch 繞過 join、需要注意區位移、span 畫按鈕語意、Badge 截斷
sweep 盲點、§3 桌機入口補句、ReferralStats 手機高度、點數寫法統一、推薦頁
橫幅口徑拉齊、MyQrEntry／SubscriptionStatusCard 的黑鈕納入 §13）；後端項
（attention.expiringTotal、/subscriptions/status 查詢失敗回 5xx、會員中心摘要
端點）與規格書 §7.2 下線四態定義不在 S7，另開工項。Plan Mode 先列每頁的
主數字與降級清單給我看過再動工。
另外承接 2026-10-04～05 畫面稿定案中屬於頁面層的項目（S2e 只做 token 與原語）：
(1) 會員中心：四卡標題改目的頁名（刊登管理／推薦管理／任務中心／獎勵回饋）、
    推薦卡只留總數＋狀態徽章、**拿掉「需要注意」區**（§13 第 3 條在會員中心不適用，
    規則措辭同 PR 改）；
(2) 推薦管理橫幅：只算一代且即將到期，標題「N 位一代即將到期」、無副標、chip 不帶
    小圓點、只列最緊急 3 位＋「全部 N 位 ›」（分頁清單端點與 attention 改
    generation===1 && status==='expiring' 是後端工項，S7 開工前要先合併；若未就緒，
    橫幅先用 items 過濾一代即將到期並顯示「至少 N 位」）；
(3) 任務中心：四顆徽章放進「本月已推薦」淡底卡取代進度條（plan.md §4 第 13 點：
    一顆 2 人、奇數半亮、偶數全亮、--medal-gradient 填色、徽章下只放名稱），
    等級小標籤、人數、鼓勵文案拿掉；「任務獎勵」框改 neutral；等級門檻 2／4／6／8
    依賴後端 TaskBadge 工項先合併；徽章元件建好後把路徑登記到
    scripts/check-color-usage.py 的 APPROVED_GRADIENT_FILES（理由＋退場條件，S2e #354 備好的機制），
    有色容器裡的按鈕用 Button 的 container（黃框續訂 tone="guide" container="warning"、
    綠框領取獎勵 tone="secondary" container="success"，ui-ux-guidelines §12.11）；
(4) 獎勵回饋：可提領卡為該頁唯一淡底主區、「申請提領」外框在卡內；提領申請列
    「待查收」黃徽章＋「確認收款」引導鈕靠右；明細的世代 chip 用世代色、負項紅字；
    待查收徽章在 admin 與會員兩處統一 warning（遺留事項最後一條就此結案）；
(5) 全站提到「代」的地方（推薦詳情、明細、後台會員詳情）用世代 chip／小圓點元件，
    會員中心卡片不放世代。
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

**2026-10-06 業主裁決：驗收 2–4 延到 S7 合併後一次驗**（S8 開工前）。下表「在哪之後」改讀成
「這一站的內容從哪個 session 起可驗」，不再是驗收時點；延後期間每個 PR 照常以 CI（含 e2e）把關。

| 驗收站 | 在哪之後 | 業主看什麼 |
|---|---|---|
| 驗收 1 | S2 合併 | develop 環境全站走一圈：色彩是否收斂、觀感是否一致、有無改壞的地方；**含**深色模式下推薦樹的世代頭像灰是否與「已失效」狀態點的灰混淆（S1 design-language-foundation 二審 R2-UIUX-1 的裁決——世代色去色走灰階三階，業主可在此站推翻；已於 2026-10-03 推翻，見 S2c） |
| 驗收 1b | S2b 合併 | 快速走一輪（不必全站）：連結／選中分頁／進度條／輸入框焦點是否出現靛藍且只出現在這些地方；成功／警示／危險的實心徽章與危險按鈕是否為亮底黑字且讀得清楚；devtools `.dark` 看一次同樣幾處 |
| 驗收 1c | S2c 合併 | 推薦網絡頁：一代／二代／三代的頭像是否一眼分得出（teal／violet／pink）；詳情徽章與連接線是否與頭像同色相；右下角狀態小點與列右側文字沒有被新顏色干擾；devtools `.dark` 看一次三色頭像與徽章 |
| 驗收 1d | S2d 合併 | **用「已加入推薦計畫、會籍非 30 天內到期」的帳號驗**（新會員會同時看到「立即刊登」與 MyQrEntry 的「加入推薦計畫」兩顆黑鈕，是 §13 已知的共用元件例外，不是缺陷）。會員中心：不滑動就看得到「需要注意」與四個主數字（LINE 內瀏覽器首屏高度只能人眼驗）；每張卡一眼知道狀態；卡片區只有一顆黑色主按鈕；本月任務卡顯示本輪 x / y 與「本月已完成 N 次」，與任務中心數字一致；推薦管理統計一眼看出下線總數與一／二／三代各幾位（不是訂閱中／快到期——那是已撤回的 statusCounts 案）；推薦網絡卡與需要注意區寫的是「N 位即將到期」，不是「需關注」；**StatusCallout 全站改走預設圖示**（46 處用法、約 30 處原本沒圖示）——付款結果頁、付款頁、領獎與查收對話框、後台錯誤框各看一眼圖示與色框是否相稱（業主 2026-10-04 裁決接受，不加關閉出口）；375px 與 devtools `.dark` 各看一次 |
| 驗收 1e | S2e 合併 | **帳號條件**（引導鈕三種要分帳號看）：**會籍已失效**——只驗獎勵頁橫幅的續訂（黃底黃實心鈕），此時同頁的確認收款讓位成白底外框；失效會員進不了會員中心（`/dashboard` 守衛會導去結帳頁），所以我的訂閱卡的「已失效」與「開始訂閱」兩態在實作上沒有可見畫面。**會籍有效且 30 天內到期**——我的訂閱卡只有「會籍即將到期」倒數框、**沒有續訂鈕**，倒數文字說明到期後怎麼續（到期前續訂走不通，業主 2026-10-05 裁決先藏鈕、UI/UX 改版完成後再修，規格書 §14 第 7 列）；同頁 MyQrEntry 的加入推薦計畫照常是蔚藍。**未加入推薦計畫**——驗 MyQrEntry 的加入推薦計畫（蔚藍）。**有待查收提領**——驗獎勵頁的確認收款，多筆時只有最早一筆是蔚藍。後台用 admin 帳號（分頁選中、提領台退件：桌機表格與手機卡片都是紅框字，確認退件紅實心）。**其餘目視項**：對照全站畫面稿（https://claude.ai/artifact/RzXCDXTrHetn8Ua4xkXor3）——版面底是白、流程鈕黑、次要鈕白底框線；chip／分頁／OTP 目前格的選中是灰字；Tab 鍵盤操作才看到 3px 全不透明灰字焦點環，分頁與 chip 的環和選中底色之間有 1px 間隙；錯誤欄位聚焦是紅色單圈；輸入格、下拉、勾選框的框線一眼看得出（E1）；列內刪除／退件紅框字、按下後確認框紅實心，結帳選新約的二次確認也是紅實心；登入步驟 1 與提領步驟 2 叫「下一步」且沒有箭頭；查收完成／失敗提示是「收款確認成功／失敗」；訪客導覽列「立即刊登」是黑（唯一例外）；產品 UI 找不到「上線／下線」（法規三份與後端錯誤字串「載入下線失敗」除外，後者併入 S7 前的後端工項）。**深色**：devtools 掛 `.dark` 看一次，首頁浮動搜尋鈕與工具列要看得出浮起來（底色比頁面亮一階）。375px 與桌機各走一輪 |
| 驗收 2 | S4 合併 | 後台，手機與桌機各實際操作一次（後台兩者並重）。**S3 部分**：(1) 375px 四分頁（提領／會員／公告／告警）一列、字完整、不橫捲；(2) 375px 提領頁工具列一行、篩選吃剩餘寬度、兩顆 icon 鈕分開好點，按 CSV 後鈕忙碌且篩選、重新整理、列上動作與載入更多都停用，完成顯示「已匯出 N 筆」——**用 LINE 內建瀏覽器再按一次**，確認看到的是「已產生 N 筆，若沒收到檔案請用外部瀏覽器開啟」；(3) 375px 會員頁搜尋框 placeholder「搜尋會員」完整、框內放大鏡可送出、有重新整理、沒有 CSV；(4) 桌機四欄等寬、兩頁工具列帶文字、滑過 CSV 鈕看到「含身分證與帳號」、會員頁搜尋框寬度（比改版前寬）是否合適、放大鏡的鍵盤焦點環與 `type="search"` 原生清除鈕不打架；(5) 平板觸控（約 768px）兩顆鈕高 ≥44px 且文字沒被擠壓；(6) 新環境 bootstrap：以 `supabase-setup-checklist.md` 步驟 7 對照程式碼為驗收（業主裁決不開拋棄式分支演練）。**S5 追加**：證件審核卡「退回」在左、「通過」在右，手機兩顆等寬；通過沒有確認框——留意誤觸（S5 裁決 C）。**S4 部分**：見下方「驗收 2・S4 清單」 |
| 驗收 3 | S5 合併 | 後台切換分頁的速度感：切回先顯示剛才的列表、背景更新，匯款依據不比沒有快取時更舊。清單見下方「驗收 3・S5 清單」 |
| 驗收 4 | S7 合併 | 前台四情境各走一遍（訪客找服務、刊登、推薦獎勵），手機為主；任務／獎勵／刊登三頁各自的主數字是否一眼就看到、達標的卡有沒有收起、會籍失效狀態的 banner 與提示是否正確 |

**驗收 2・S4 清單**（會員詳情分區，PR #365；手機與桌機各走一次）：

前置：在 develop 挑出（或準備）這幾種會員——停權者、管理員、證件被退回者、沒有姓名者（註冊 Step 2 前的帳號）、
近期提領滿 10 筆且四種狀態都有者。**確認框只看、按「取消」**：develop 是共用的真後端，按下確認就會改資料。標
「Slow 3G」的項目在快網路下肉眼看不到，用 devtools Network 節流看。

- 手機（375px，建議 LINE 內建瀏覽器）：
  - [ ] （Slow 3G）點「查看」到 Sheet 出現前，那顆鈕在轉圈、連點不會開兩次
  - [ ] （devtools 斷網後按「查看」）列表上方出現錯誤框並捲進畫面，那顆鈕恢復、可以再點
  - [ ] Sheet 全螢幕；身分卡固定在上，看得到姓名、徽章（停權者「已暫停」在最前、管理員有「管理員」）、「會籍到期…」或
        「已於…到期」；身分卡不超過畫面約 1/4 高（e2e 以最壞資料量 ≤ 25%）
  - [ ] 往下依序是帳號／點數／近期提領／推薦關係／敏感資料／管理，內文左右有留白、不貼邊；捲到底關閉鈕仍在右上
  - [ ] 帳號區有電話、註冊日、刊登數；停權者多一行「暫停時間」，非停權者沒有
  - [ ] 近期提領每筆看得到金額、狀態徽章、申請時間；手續費只在非退件的列（退件時點數與手續費都已退還）；待查收有匯款時間、
        已完成有完成時間；退件的列有紅字「退件理由」，其他狀態的備註是灰字「備註」；徽章顏色與提領管理頁同一筆一致；
        有 10 筆時底下寫「最多列出最近 10 筆」；沒有提領時寫「尚無提領記錄」
  - [ ] 點數區：可提領是大字；「處理中 N P（含手續費）」「已提領 N P（含手續費）」是灰色小字，窄螢幕可以折成兩行，
        但不從數字中間斷開
  - [ ] 敏感資料區有鎖頭與「只顯示部分碼」說明，身分證與帳號只顯示部分碼，沒有任何「顯示完整」；證件被退回時看得到退回理由
  - [ ] 管理區：暫停／撤銷管理員紅框字，恢復／設為管理員白底灰框，鈕高好按（44px）；按暫停或撤銷跳出的確認鈕是紅實心、
        按設為管理員跳出的確認鈕是黑（只看、按取消）；暫停一般會員的確認框寫「也無法進入會員區」，暫停管理員的沒有這句
  - [ ] 長姓名不會鑽到右上關閉鈕底下；無名會員的標題是 Email 且不重複印第二次，列表上那張卡也以 Email 稱呼
- 桌機：
  - [ ] Sheet 是右側欄（約 512px 寬），分區順序與手機相同
  - [ ] （Slow 3G）表格列的「查看」同樣有轉圈回饋
  - [ ] 鍵盤：Tab 到「查看」按 Enter，Sheet 開啟後焦點在姓名標題；再按 Tab 停在分區內文的捲動區，方向鍵能捲；
        Tab 到「暫停」按 Enter 開確認框、按「取消」，焦點回到「暫停」；按 Esc 關閉 Sheet 後焦點回到那顆「查看」
  - [ ] 管理區按鈕外觀與確認鈕顏色同手機；面板內沒有任何實心鈕
  - [ ] devtools `.dark` 看一次分區標題與分隔線的層次

不列人工項、以 vitest 為準的（手動做不出來或要真的改資料）：動作送出後面板已關或換人才失敗——斷網時 fetch 毫秒內就
失敗，錯誤會印在還開著的面板（`MemberManagement.test.tsx` 的「晚到的動作失敗」與「動作送出後關掉面板、動作失敗時…」）；
確認後焦點落在管理區標題、送出中被按的鈕轉圈（「送出中的管理區」）。

**驗收 3・S5 清單**（後台資料快取，PR #371；手機與桌機各走一次）：

前置：admin 帳號；develop 上至少一筆待處理、一筆待查收提領、幾位會員、**至少一則公告**（提領總數 > 50 筆才驗得到匯出進度，
不足就跳過那一項）；第二個瀏覽器（或無痕視窗）登入同一個 admin，用來製造無害的變更；手機項目用桌機 devtools 的裝置模擬
（375px）——LINE 內建瀏覽器沒有 devtools，只用一般網速驗一次切回手感；標「Slow 3G」的項目先在 devtools 設好節流再操作，
標「載入前節流」的項目設好後從別頁進 `/admin`；確認框只看、按「取消」（develop 是共用的真後端；斷網時按確認不會送出任何資料）
——唯一例外是選驗的報讀器項要真的退件一筆，先備一筆可犧牲的待處理測試提領。

- 手機（375px）：
  - [ ] （載入前節流）首次進 `/admin`：統計摘要與卡片列表是骨架，沒有先閃 $0／0 筆
  - [ ] 提領篩「待處理」→ 會員 → 提領：回到「待處理」，卡片立即出現、沒有骨架；統計摘要是骨架，更新完才出數字
  - [ ] （Slow 3G）切回提領：約 0.3 秒後卡片變淡、狀態行寫「更新中，暫停匯款相關操作」；**退件與代為完成照樣可按**；⋯ 選單裡
        只有「查看證件」是灰的；更新完自動恢復，展開一張卡寫「資料更新於…」
  - [ ] 會員 → 證件審核 → 提領 → 會員：回到「證件審核」，證件審核照舊出骨架；切到「會員列表」立即出現
  - [ ] （Offline）切回提領：卡片保留（過期樣式）、上方寫「更新失敗，以下是 N 分鐘前的資料」與原因、卡片上的匯款金額是
        「已隱藏」、展開卡寫「資料未確認，暫停顯示」、扣點照常；恢復網路按重試，卡片不消失、更新完恢復
  - [ ] （Offline，本次登入還沒開過公告分頁）切到公告：顯示錯誤與重試，不是「尚無公告」
  - [ ] 告警分頁：工具列的重新整理鈕靠右、好點（≥44px），按下後列表不換骨架
  - [ ] （Offline）展開一筆待處理、按「退件」填理由後按確認：失敗回報完整出現在導覽列下方、焦點在上面
  - [ ] （提領 > 50 筆、Slow 3G）按 CSV：其他三個分頁按不到，分頁列下方寫「匯出中（已收集 N / M 筆）…離開此頁會中止」（窄螢幕折行
        可接受）；完成後恢復
- 桌機：
  - [ ] （載入前節流）首次進 `/admin`：統計四卡、匯款作業面板、表格都是骨架
  - [ ] （Slow 3G）切回提領：表格約 0.3 秒後變淡；標記已匯款、勾選、CSV、查看證件按不下去並看得到原因；退件、代為完成、
        查看歷史照常可按；統計四卡與匯款作業面板是骨架
  - [ ] （Slow 3G）切回提領、更新完成前打開一筆的「查看歷史」：可以開，對話框寫「資料更新於…」
  - [ ] （Slow 3G）證偽「顯示值未過期」：在公告分頁載完後切到會員；第二個瀏覽器發布一則測試公告；切回公告時先看到舊列表
        （變淡），更新完那則公告才出現；最後用第二個瀏覽器刪掉它
  - [ ] （Slow 3G）發布一則測試公告：送出到回應之間其他分頁按不動，超過約 0.3 秒時分頁列下方寫「處理中，完成前無法切換
        分頁」；完成後刪掉它
  - [ ] 作業面板寫「資料更新於 N 分鐘前」，停在頁面上會自己更新；超過 10 分鐘改成提示先重新整理；開「標記已匯款」確認框
        也看得到同一句（按取消）
  - [ ] （Slow 3G）按重新整理：鍵盤焦點留在鈕上（再按 Tab 不從頁首開始），列表不換骨架，工具列下方寫「正在更新」→
        「已更新 HH:mm」
  - [ ] （提領 > 50 筆、Slow 3G）按 CSV：其他三個分頁按不到、說明行顯示；完成後恢復，「已匯出 N 筆」在工具列下方、工具列沒有被往下推
  - [ ] （Slow 3G）登出再登入、進 `/admin`：重新出骨架；devtools → Application → Session Storage／Local Storage 沒有任何
        **他人**的姓名、身分證字號、收款帳號或 Email（自己的登入資料 `user`、`sb-*` 是既有的，不算）
  - [ ] （選驗，需報讀器）手動重新整理念「正在更新」「已更新」；退件後念得出「已退件：王小明」（焦點移到下一列的播報沒有
        把它吃掉）。沒有報讀器時用 devtools Elements 看狀態文字的變化

以 vitest／e2e 為準、不列人工項：寫入後的失效與 fence、被拒補讀的上限、請求序號與舊閉包、重開在途補讀、卸載後停止匯出、
匯出完成核對、403 清空、15 秒慢更新、批次框快照、寫入在途鎖分頁的時序。

驗收不過 → 開 `fix/*` session 修正，修完該站重驗，才進下一個 session。驗收 2–4 延到 S7 合併後
一次驗（2026-10-06 裁決）：在那之前不以驗收擋 session，S8 要等三站都過才開工。

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
4. **驗收站**（§4.3 的四站）：上 develop 環境實際操作，過了才開下一站。驗收 2–4 延到 S7 合併後
   一次驗（2026-10-06 裁決），三站都過才開 S8。
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
   ⚠️ 前端（Pages）隨 push 即部署、Edge Function 要等 CI 綠才部署，兩者之間有
   新前端配舊後端的窗口（B1 #360 的 attention 口徑就會在窗口內算錯）：**合併後
   立刻核准 Edge Function 部署；驗收一律先以 `/api/health` 的 sha 確認後端已換版**。
   PR 預覽站吃的是舊的 develop 後端，不作驗收依據。
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
| 後台 loading 差一點點 | `useAdminList`／`adminCache`／`AdminConsole` 的單元測試（切回種子、fence、確認閘門、403 清空、不落 Storage）＋ e2e「切回先顯示剛才的列表」三情境 | 驗收 3：切分頁→切走→切回，第二次應瞬間顯示（背景刷新）；「顯示值未過期」用證偽做——切走期間用第二個瀏覽器改資料，切回時先看到舊列表、更新完才出現變更（見驗收 3・S5 清單） |

驗證的操作節奏已編進 §4.3 驗收站與 §5 業主步驟——不需要另外的測試
計畫文件；驗收不過就開 `fix/*` 修，該站重驗後才前進（驗收 2–4 延到 S7 合併後一次驗，見 §4.3）。
