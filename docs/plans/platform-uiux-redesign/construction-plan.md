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
- **S2b（2026-10-03 追加）**：驗收站 1 之後業主裁決加強調色與語義色升亮（plan.md §0 第 6 列、§3 D4）。插在 S2 之後、S3 之前（追加時 S3 尚未開工）；它只動 token 與幾個原語，不碰 S3 的檔案。
- **S2c（2026-10-03 追加，同日改向）**：推薦樹世代配色（plan.md §0 第 7 列、§3 D5、§4 第 8 點），排在 S2b 之後，S3 之前或之後皆可。原案「頭像綁訂閱狀態」經業主看過預覽後撤回，改為維持世代表示、把 `--tree-gen-*` 三階灰換成三個專用色相；只動 token、對應測試與文件，不碰 `supabase/functions/`，與 S3 的後台檔案不重疊。
- **S2d（2026-10-03 追加）**：會員中心狀態總覽（plan.md §0 第 8 列、§3 F4），排在 S2c 之後（原本需要 S2c 加進 overview 的 `statusCounts`，⚠️ S2c 改向後該欄位不存在，此依賴待業主裁決，見 progress.md 遺留事項）；只動會員中心與推薦統計兩個前端檔，不碰 S3。

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
| S3 | 後台資訊架構 | A1+A2 | `feature/admin-ia-refactor` | 三段式落檔（動後台資訊架構與存取閘門——A1 含 AdminRoute bootstrap 例外的裁決） | Sonnet（規劃審查跑 /review-plan） | 中 |
| S4 | 會員詳情重設計 | A3 | `feature/member-detail-redesign` | 三段式落檔（動作位階契約在此頁，審查必跑） | Sonnet | 中 |
| S5 | admin 資料快取 | A4 | `feature/admin-data-cache` | 三段式落檔（跨分頁資料層） | **Opus** 規劃、Sonnet 實作 | 中 |
| S6 | 前台門面 | F1 | `fix/frontend-p1-polish` | 輕量 Plan Mode | Sonnet | 輕 |
| S7 | 會員區資訊層次 | F2+F3 | `fix/frontend-member-hierarchy` | 輕量 Plan Mode（照 §13 三條通則與 F4 的樣板） | Sonnet | 中 |
| S8 | 制度化收尾 | G1+G2 | `claude/uiux-program-closeout` | 輕量（改文件與 skill 模板、刪鷹架） | Sonnet | 輕 |

※ **S1 重量異動（2026-09-14）**：兩輪四視角審查回填後範圍變大（C3 原始色值
規則、`--destructive` 兩組 token、對比斷言翻倍、灰階對照表 39 處、G1 完整性
檢查、色盲 checklist）。裁決**不拆 session**——S2 同時依賴 token 與守門腳本，
拆開只是把依賴從 session 之間搬到 PR 之間。實作仍用 Sonnet，但**可能需要兩次
對話**（中途 `/clear` 續作屬預期內，狀態在
`docs/plans/design-language-foundation/progress.md`）。

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
      （帶狀態過濾）、待查收提領 N 筆 → /rewards、刊登審核退件 → /service-providers。
      資料：overview.attention（既有）、useRewardData 的提領狀態、useUserListing。
   2) 四張狀態卡，每張一個主數字或主狀態，整張可點（Link 包卡，鍵盤可達、
      aria-label 完整），右側 chevron，不再放重複標題的按鈕：
      刊登：刊登名稱＋狀態徽章（上架中 success-subtle／審核中 warning-subtle／
            已隱藏 secondary）＋「會籍至 yyyy/mm/dd」；沒有刊登時才出現唯一的
            黑色主按鈕「立即刊登」（三態邏輯沿用檔內既有註解）。
      推薦網絡：下線總數主數字＋ statusCounts 的四顆 chip（與 S2c 樹同一組樣式）。
      本月任務：進行中任務的 x / y 主數字＋ brand 進度條；全部達標時顯示
            success-subtle「本月已達標」。
      可提領點數：主數字（P）＋待查收 N 筆 warning-subtle 徽章；有可提領額度時
            顯示黑色主按鈕「申請提領」（整頁只有這一顆主按鈕）。
   3) SubscriptionStatusCard 與 MyQrEntry 維持，位置依 Plan Mode 提案。
二、ReferralManagement 的 ReferralStats：四個等大數字改成「一個主數字（下線總數）
   ＋ statusCounts chip（點了過濾樹，與 S2c 同一套狀態）＋ 一行小字『一代 7 ·
   二代 4 · 三代 1』」。
三、數字一律 --foreground 黑（§12.5），語義由徽章承擔；brand 只用在連結、進度
   填色、選中態；主按鈕黑且整頁至多一顆。載入中用 Skeleton 占位（不閃「0」），
   讀取失敗該卡顯示中性錯誤態，不整頁報錯。
四、ui-ux-guidelines.md 新增「§13 資訊層次」三條通則（規則只寫一份，S7 照此）：
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

**S4**：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
先 git checkout -B feature/member-detail-redesign origin/develop
（web session 預設生在 claude/* 分支，三段式守衛只認 feature/<slug>）。
執行 S4（工項 A3）：/plan-feature member-detail-redesign
範圍：會員詳情 Sheet 分區重設計（依 plan.md §3 A3 描述）。
ui-ux-guidelines §11 的動作位階與確認框契約原樣保留、測試不得弱化。
規劃完跑 /review-plan 後停等我審。
```

**S5**（模型選 Opus 起手）：
```
讀 docs/plans/platform-uiux-redesign/{plan,construction-plan,progress}.md。
先 git checkout -B feature/admin-data-cache origin/develop
（web session 預設生在 claude/* 分支，三段式守衛只認 feature/<slug>）。
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
執行 S7（工項 F2+F3）：在 fix/frontend-member-hierarchy 分支上，照
ui-ux-guidelines §13 的三條通則與 S2d 做好的會員中心樣板，重做任務中心、
獎勵回饋、刊登管理三頁的資訊層次：每頁一個主數字或主狀態（獎勵＝可提領
點數、任務＝進行中任務進度、刊登＝刊登狀態），其餘降級；達標／已完成的
卡收起、進行中排前面；主行動一顆黑、次行動 brand；會籍失效狀態的呈現
（續約 banner、功能導向提示、獎勵頁例外可讀）是一級對象。接著 F3：全站
三態完備性巡檢＋補缺、既有 text-destructive 裸字若仍有殘留一併收掉、
overflow sweep 過一輪。Plan Mode 先列每頁的主數字與降級清單給我看過再動工。
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
| 驗收 1 | S2 合併 | develop 環境全站走一圈：色彩是否收斂、觀感是否一致、有無改壞的地方；**含**深色模式下推薦樹的世代頭像灰是否與「已失效」狀態點的灰混淆（S1 design-language-foundation 二審 R2-UIUX-1 的裁決——世代色去色走灰階三階，業主可在此站推翻；已於 2026-10-03 推翻，見 S2c） |
| 驗收 1b | S2b 合併 | 快速走一輪（不必全站）：連結／選中分頁／進度條／輸入框焦點是否出現靛藍且只出現在這些地方；成功／警示／危險的實心徽章與危險按鈕是否為亮底黑字且讀得清楚；devtools `.dark` 看一次同樣幾處 |
| 驗收 1c | S2c 合併 | 推薦網絡頁：一代／二代／三代的頭像是否一眼分得出（teal／violet／pink）；詳情徽章與連接線是否與頭像同色相；右下角狀態小點與列右側文字沒有被新顏色干擾；devtools `.dark` 看一次三色頭像與徽章 |
| 驗收 1d | S2d 合併 | 會員中心：不滑動就看得到「需要注意」與四個主數字；每張卡一眼知道狀態；整頁只有一顆黑色主按鈕；推薦管理統計一眼看出訂閱中／快到期各幾位；375px 與 devtools `.dark` 各看一次 |
| 驗收 2 | S4 合併 | 後台：四 Tab 單列（375px 實機確認標籤不溢字不換行）、工具列、會員詳情分區——手機與桌機各實際操作一次（後台兩者並重） |
| 驗收 3 | S5 合併 | 後台切換分頁的速度感（切回不再等 loading） |
| 驗收 4 | S7 合併 | 前台四情境各走一遍（訪客找服務、刊登、推薦獎勵），手機為主；任務／獎勵／刊登三頁各自的主數字是否一眼就看到、達標的卡有沒有收起、會籍失效狀態的 banner 與提示是否正確 |

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
