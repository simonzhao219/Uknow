# 四視角審查彙整（2026-08-09，對象：plan.md + construction-plan.md 初稿）

> 四個 plan-reviewer subagent（需求/UIUX/架構/系統）平行審查的結論與處置。
> 「已回填」= 已修進 plan.md / construction-plan.md 對應段落。

## P0（阻擋級，均已回填）

| # | 視角 | 發現 | 處置 |
|---|---|---|---|
| P0-1 | 系統 | **A4 快取會把未遮罩 PII 寫進 sessionStorage**：`GET /admin/withdrawals` 回傳未遮罩的身分證字號與完整銀行帳號（供匯款核對，`api/index.ts:1150,1155`），目前只存在元件記憶體；`DataCacheContext` 會整包序列化進 sessionStorage——照字面延伸等於新增一條 PII 落地管道（XSS/擴充功能/devtools 可讀） | A4 改為**記憶體內快取、不落 sessionStorage**（admin 快取一律不 persist），並在 S5 prompt 釘死，不留給實作自行判斷 |
| P0-2 | 需求＋UIUX＋系統（三視角同時命中） | **「保留 bootstrap 條件式引導」的前提不成立**：`AdminRoute.tsx:24-26` 對非管理員一律導回 `/dashboard`，而「系統尚無管理員、可自助宣告」畫面正是給非管理員看的——這條 GUI 路徑現況**不可達**（journey 測試是直接打 API bootstrap 的）；照原描述施工會「搬移一個死畫面」還以為完成承諾 | A1 重寫：S3 必須先查證並裁決可達路徑（建議方案：`AdminRoute` 在「系統尚無管理員」時例外放行），並在 §5 明列為**本工程唯一的存取控制行為變更**，S3 的 /plan-feature 把它當獨立子項審 |

## P1（重要，均已回填）

| # | 視角 | 發現 | 處置 |
|---|---|---|---|
| P1-1 | UIUX＋需求 | **「四 Tab 單列放得下」是錯誤斷言**：按 `AdminDashboard.tsx:118-152` 既有真瀏覽器量測法推算，四欄每欄僅約 66px 可放文字，最長標籤「獎金提領管理」實測需 84px——會 ink overflow | §2.1/A1 改寫：單列的前提是**縮短標籤**（如「提領/會員/公告/告警」），且 S3 必須以既有量測法＋`test_admin_tab_labels_do_not_ink_overflow` 驗證，不成立的退路寫明 |
| P1-2 | 架構＋需求 | **規格書 §13 同步「由 check-spec-drift.py 把關」是誤植安全感**：該腳本抓不到 §13 元件表的裸元件名，也抓不到 §13.1「5 欄 grid」措辭 | §2.6 改寫為「需人工同步、無機械把關」，S3 prompt 明列四處：§13 AdminSetup 表列、§13.1「5 欄」句、`AdminDashboard.tsx:109-110` 與 `App.tsx:71` 的註解 |
| P1-3 | 架構 | **A4 與 admin 現行 DI 慣例衝突**：admin 是「AdminDashboard 持有 fetch、元件吃 props」（有明文理由：元件測試不必替身網路層），與會員區「hook 內含 fetch＋快取」相反；「直接延伸」有 (a) 破壞 DI 改走 hook、(b) 保留 DI 另造注入式 fetcher 快取 hook 兩條路 | A4/S5 prompt 補：先讀 `AdminDashboard.tsx` 開頭 DI 註解，S5 規劃必須明確裁決 (a)/(b)，並涵蓋新 CacheKey 與 mutation 對照表設計 |
| P1-4 | 系統 | **A4 缺「不可快取清單」**：P4 persona 自己寫了「告警、待審佇列要即時」；寫入確認框（核可/退件/停權）依據的資料顯示 stale 會導致對過期狀態做決定 | A4 補快取排除清單原則：即時性資料與寫入動作依據的資料不進 SWR，或開寫入介面時強制同步 revalidate |
| P1-5 | 系統 | **A4 缺 invalidation 設計**：`DataCacheContext` 自己的註解就警告過「手動清快取容易漏」才做 `MUTATION_GROUPS`；admin 寫入動作若不接 invalidate，切分頁會看到假新鮮的舊資料 | A4/S5 prompt 補：admin 版 mutation→cache key 對照表為規劃必交付物 |
| P1-6 | 系統 | **A2「其他列表頁比照」會被誤讀成複製 CSV 匯出功能**：會員管理現無匯出；複製匯出=新增會員資料大量匯出路徑，超出「呈現層改動」邊界 | A2 改寫：比照的是**工具列版面**；CSV 鈕只在已具匯出邏輯的頁面渲染；擴大匯出能力明列為 scope out |
| P1-7 | 需求 | **四人格漏了規格書 §5/§5.1 的「會籍失效」狀態**（續約提示 banner、刊登隱藏、獎勵頁例外可讀），F2/F3 也沒把它列入巡檢 | §1 P2 補失效狀態需求；F2 明列續約 banner 與失效狀態呈現為套用對象 |

## P2（次要，均已回填進工項描述）

- **A2**：icon 鈕一律補 `aria-label`；「重新整理/下載CSV」視覺權重按使用頻率重排（現況倒置）；CSV 多頁收集期間補忙碌/停用態（UIUX＋系統）。
- **A3**：點「查看」到 Sheet 出現之間無 loading 回饋，重設計時補觸發鈕 loading/disabled（UIUX）。
- **D1**：深色模式 token 目前無任何驗證管道（`.dark` 從未被套用），補 devtools 手動掛 `.dark` 的驗證 checklist（UIUX）；非狀態語義的計數（如「管理員人數」）一律去色走純黑的判準（UIUX）。
- **D2**：守門腳本比照既有 checker 的 `--self-test` 雙軌慣例（架構）。
- **S3 分工表**：「動路由級結構」措辭改為「動後台資訊架構與存取閘門」（架構；因 P0-2 後 S3 確實會碰 AdminRoute）。
- **A2 範圍時機**：「比照」明確定義為 S3 內的提領＋會員管理兩頁工具列；公告/告警現況無複雜控制列，發現不一致記進度看板（架構）。
- ~~sessionStorage 配額風險~~（系統）：隨 P0-1 改記憶體快取後自然消解。

## 審查確認無缺口的面向

- 業主六痛點全數對應到工項（需求）；業務規則/金流常數零觸碰（需求）；
- session 嚴格序列化正確且必要——S2/S3/S4 確實反覆觸碰同批檔案（架構）；
- 分支命名與 feature 守衛/流程選擇相容（架構）；
- A1 的後端端點既存、無 API 變更需求；無 schema 變更（系統）；
- BottomNav 契約、觸控目標、響應式策略judgment均不受影響（UIUX）。
