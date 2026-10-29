# 第 1 波：正式上線（2026-10-27）與大量註冊前窗口（10/27–10/28）

<!-- plans-keep: 跨 session 鷹架（主／執行／審查三種 session 的共同事實來源）；退場條件＝第 1 波審查 session 結案（10/31 凍結期結束、審查報告回填 §8）後，值得長留的升級進 docs/operations.md／規格書／friction-log，其餘隨 commit 刪除 -->

寫給**全新的主 session**看：它開局只有 repo 與這份檔，沒有對話記憶。所有裁決都在 §0，
所有事實都附來源；行號一律現算（引用的行號是 2026-10-27 develop `b861133`（#398）時的）。

## 0. 業主目標與裁決（2026-10-27 00:30–02:00 台北，監工 session 核對）

**六個目標**

1. 階段性收尾 → 晉升 develop→main → 清空正式站資料 → **10/27 12:00 開放正式註冊收費**。
2. 10/27 中午到 10/28：盡量把重要功能上去，減少 10/29–10/31 大量註冊後的劇烈變動。
3. 接著排維運、資安計畫；之後每週固定晉升一次。
4. 為 10/29–10/31 的大量註冊做評估與衡量。
5. 分工盡量平行展開；**衝突由主 session 自行修正**（這句就是主 session push 他人分支做 rebase／解衝突的授權）。
6. **每一波更新三種 session**：新的主 session 做規劃與監工、執行 session 分工施工、獨立審查 session 審該波全部變動。主 session 不跨波。

**八題裁決（AskUserQuestion，2026-10-27 01:50–02:00）**

| # | 題 | 裁決 |
|---|---|---|
| 1 | 12:00 與 R2 的關係 | **12:00 必須含 R2（Email 邀請）開啟**；R2 沒好就把開放時間往後延。被推翻的建議：分段上線（12:00 先用現有推薦方式）。R2 規劃書 R2-3b 的順序仍有效（裁決 S：正式站後端先開、curl 收信核對通過才開前端旗標），只是全部壓縮到開放前；R2-3b 第 2–5 步（develop 側演練）略過，develop 的旗標與 secret 由窗口期補。 |
| 2 | 部署通道壞掉（ECR 匿名拉映像限流） | **改 workflow 不經 Docker**（`--use-api`）——PR #402，本波第一個要合的 PR。 |
| 3 | 清資料範圍 | **全清含管理員**：全部會員、訂單、上傳照片、刊登、管理員與平台預設推薦人帳號都刪；之後業主重新註冊、以正式金流付 NT$1,200 成為第一個付款帳號拿到 8048876、設 `default_referrer_code`、`set-self-admin`。 |
| 4 | PayUni 正式金流 | **晉升後切換**（`PAYUNI_SANDBOX=false`＋正式三把憑證＋重部署），**從台灣網路真付款一次**驗通；同時出小 PR 把 `EXPECT_PRODUCTION_PAYUNI` 改 `'true'`（順序：secrets 先翻，PR 後合）。 |
| 5 | 10/27–10/28 窗口功能 | **照建議排**：T1 登入不閃（R2 合併後才開，共檔 AuthPage）、P1a 照片裁切、R1a-2 og＋lang、issue #395 PayUni 靜默 expired 改告警、寄信失敗告警、告警送到人（LINE／Email）。S7b、L1-1、P1b 排 10/31 後。 |
| 6 | 誰清資料 | **新主 session 用 Supabase MCP 執行**：先在 develop 分支 DB 演練，再對正式站乾跑列計數、互動問題給業主確認後才刪。前提：業主先在 Dashboard 確認有備份（Backups／PITR）。 |
| 7 | 10/29–31 預估量 | **100–500 人，部分在活動現場**（同一 Wi-Fi 共用 IP）→ 放寬 check-email 每 IP 限流、確認寄信上限、排現場尖峰小時的監看。 |
| 8 | 凍結規則 | **10/29–10/31 凍結，只許 hotfix**：不上新功能、不上 migration、不動註冊／付款／登入主幹；hotfix 走晉升＋業主核准。每週晉升從 11/3 起。 |
| 9 | 夜間授權（業主 10/27 02:15–10:15 睡眠，無法回覆） | **主 session 可以**：審過後合併 PR 進 develop（#399、R2 前端、窗口小項）；開晉升 PR，journey-full 綠後以 merge commit 合進 main（migration 會自動套到正式站 DB；函式部署停在等業主核准，舊函式不呼叫新函式、視窗安全）；用 Claude Code Remote 的 `create_session` 自己開執行 session（繼承環境與 auto 權限模式）。**主 session 不做**：正式站部署核准、Dashboard secrets、PayUni 切換、清資料、付款——全部等業主醒來，§7 已拆成「睡前」與「醒來後」。 |

**主 session 追加裁決（AskUserQuestion，2026-10-27 14:15）**

| # | 題 | 裁決 |
|---|---|---|
| 10 | 12:00 錯過後的開放時間 | **今晚 23:00 前後**（被推翻的建議：10/28 12:00）。任何一步紅就自動順延到 10/28，主 session 在 §8 記並給新時間 |
| 11 | R2 前端模型 | **Opus** |
| 12 | 窗口工項派工時機 | **現在全派**：R1a-2、P1a（只規劃）、告警送到人先派；#399 合併後派容量 hotfix＋寄信失敗告警（合成一個 session）、#395。晉升 PR 合進 main 前一律不合進 develop |
| 13 | 10/29–31 量測排程 | **允許**主 session 建排程任務（每 2 小時、只在 10/29–31） |
| 14 | P1a 範圍（PR #404 規劃審出 P0：apiRequest 寫死 JSON Content-Type） | **拆兩個 PR，後端清理先上**：PR 1＝`DELETE /listings/photos`＋刪刊登走 Edge 清理；PR 2＝前端裁切管線（P0 選 a：apiRequest 遇 FormData 不設 header），趕不上 10/28 就留 11/3 |
| 15 | P1a Q-A 刪刊登清理 | **走後端**（總綱 §3.2C 原案） |
| 16 | 寄信失敗告警（盤點：後端無寄信路徑，攔 429 需新公開端點＋改 AuthPage 等三檔，與 R2／T1 共檔） | **本波不做程式**，靠 Dashboard 寄信上限 600＋§5 每小時漏斗監看；端點留第 2 波 |
| 17 | 清資料演練的刪除段（MCP 破壞性語句確認視窗到不了業主，兩次 cancelled） | **業主在 Dashboard SQL Editor 貼**（演練分支與今晚正式站都這樣做；主 session 負責乾跑與零殘留檢查） |
| 18 | P1a Q-D 裁切元件載入失敗 | **保守：不可送出、不降級**；Q3-3 無例外。按鈕語意 10/28 01:30 由主 session 改為「重新整理頁面」（瀏覽器把失敗的 module fetch 記成 null，原地重試永遠失敗，見 §8） |
| 19 | P1a Q-F 原檔上限 | **原檔 ≤20 MB、上傳檔 ≤5 MB**；規格書 §11 界定 5 MB 是上傳檔 |
| 20 | P1a Q-G 條款十之一 | **記入規格書已知落差，第 2 波在 30 日窗口內補齊**（帳號刪除 cascade、`/auth/cancel-signup`、歷史孤兒），列第 2 波必做 |
| 21 | PITR add-on | **先不開，第 2 波再評估**；每日 PHYSICAL 備份（UTC 22:44）已確認存在 |
| 22 | journey sandbox 紅（PayUni 測試站改版）後的開放時間 | **今晚繼續，開放改 00:00 前後**；晉升閘門暫走 webhook 備援（#413，規則 13 到期 11/03）；journey-full webhook 仍紅或真付款失敗就改明天 |
| 23 | 官方 icon 與 SEO／AEO／GEO（業主 19:55 提出） | **兩段**：基礎進窗口（favicon 全套、manifest、og-image 1200×630、品牌名統一「Uknow」、description／canonical、robots.txt＋sitemap.xml、私密頁 noindex、JSON-LD Organization／WebSite）目標 10/28 第二次晉升；進階（AEO：FAQ／服務者頁 JSON-LD；GEO：llms.txt、公開頁預渲染、服務者動態 sitemap）第 2 波三段式 |
| 24 | 站內 logo（業主 20:05 修正） | **需要正方形的地方用黑底白字 Uk**（favicon、手機捷徑、manifest、正方形縮圖）；**顯示全名的地方照舊**——業主確認目前網頁與手機頁的 logo 顯示正確，不動 |
| 25 | 邀請信改版（業主 19:35） | 版型照 `confirm-signup.html`（黑底 UKNOW、卡片、小標＋大標＋一句＋按鈕、頁尾、卡片外 ©）；主體只表達邀請，保留推薦人揭露句；**拿掉**年費句、服務條款／事業手冊連結、複製網址段；**個資告知九要素保留但縮成卡片外灰色小字**（個資法第九條間接蒐集告知必須在第一次接觸）。派 R2 前端 session 開小 PR，業主等新版合進 main 再貼模板 |
| 26 | PayUni 切換時點（業主 20:15） | `PAYUNI_SANDBOX=false` 留到其他都確認沒問題再改；§7 順序改為清 bucket → 清資料 → 註冊＋admin → R2 實寄 → Cloudflare 旗標 → 最後切 PayUni → 真付款 → 宣布 |
| 27 | 第二次晉升提前（業主 20:20） | 原定 10/28 的第二次晉升改今晚開（PR #417）：開放時 favicon／SEO 在線上、邀請信新版只貼一次。PR 開後 develop 凍結到合進 main |
| 28 | CI e2e 上限（業主 22:00） | 慢鏡像站連續弄紅 e2e 五次、#417 的 run 卡死不給重跑 → 破例在晉升 PR 開著時合一支 CI-only PR（#418，e2e timeout 15→25）進 develop；#417 改指新 head、journey 重跑 |
| 29 | 清資料與 PayUni 切正式延後（業主 23:00） | 兩者都等 P1a PR 2 上線後再做（10/28 晚）；活動前要完成。主 session 已提醒：PayUni 留 sandbox 期間無人能真付款、測試資料留在站上 |
| 30 | P1a PR 2 提前（業主 23:15） | 照片裁切＋定位（前端管線）提前到第 1 波：10/28 下午合 develop、傍晚第三次晉升；10/28 不凍結。SEO 進階與 journey harness 仍 11/3 第 2 波。PR 2 由原 P1a session 做，業主親打 /tdd-implement 才開工 |
| 31 | Email 邀請前端旗標寫進 git（業主 10/28 00:20） | Cloudflare 儀表板的 `VITE_REFERRAL_EMAIL_INVITE` Retry 兩次仍未進建置（正式站主檔 `index-CWyrVOvQ.js` ＝ 本機無旗標建置；repo 有 `wrangler.toml` 含 `pages_build_output_dir`，Pages 以它為唯一設定來源）。改加 `.env.production`（與 `.env.development` 對稱），主 session 自己做（設定一行＋文件）、fix PR 合進 develop；**等 P1a PR 2 一起第三次晉升**，不另開晉升。Email 實寄核對順延到該次核准後 |
| 32 | 會員中心刊登卡對齊推薦卡版式（業主 10/28 02:30） | 刊登卡改四行：標題／小標「我的刊登」／主字（「尚未刊登」或主題，單行截斷）／第四行走 `action` 插槽（未刊登＝「立即刊登」鈕，已刊登＝`CategoryBadge` 類別徽章）；拿掉「會籍至」（我的訂閱卡已有週期）；注意溢字。新開 Sonnet session、Plan Mode、`fix/member-center-listing-card`，**跟 PR 2 與旗標一起第三次晉升** |
| 33 | 夜間授權第二段（業主 10/28 02:45，休息 6 小時至約 08:45） | 主 session 不等業主：#421、刊登卡 PR、#415 審完合 develop → 開第三次晉升 PR → journey-full 綠 → **合進 main**。只有 production 部署核准是業主的（GitHub `production` 環境 required reviewer），醒來按核准 → `/health` sha 核對 → 業主手動測一輪 → 才開始清資料與 PayUni 切正式。執行 session 的 tdd-lock 解鎖沿用 P1a 概括授權；分類器擋下的事主 session 記 §8 等業主 |
| 34 | 取景框等於整個方框（業主 10/28 04:10，正式站實測） | react-easy-crop 預設把 crop area 算成媒體 contain 後的尺寸，直式照片左右留灰、上下溢出；改量容器邊長傳 `cropSize`＋`objectFit=cover`。P1a 小 PR |
| 35 | 照片格改版（業主 10/28 04:20） | 格內不再有「調整範圍」「移除」文字鈕：移除＝縮圖右上角叉叉（aria 不變）、點縮圖進入調整（僅本次新增且完成的格；舊圖標示不能重新取景）、失敗格留「重試」；微調步距 10→4px。併同 34 一個 PR（#425） |
| 36 | 刊登詳情頁照片改版（業主 10/28 06:05，正式站實測） | 「既然已經都強制裁剪成正方形了，顯示就用正方形。不要外面長方、裡面正方，照片不用有縮圖，用跟 Instagram 一樣的滑動設計。」追問定案：正方形全寬、CSS scroll-snap 左右滑、底部圓點＋右上角「1/3」計數、桌機另加左右箭頭；跟第 1 波，第五次晉升。`fix/listing-photo-carousel`，Sonnet 執行 session |
| 37 | 邀請好友卡手機版難搆到輸入框（業主 10/28 06:20） | 現在：拿掉釘頂端、改垂直置中＋`index.html` viewport 加 `interactive-widget=resizes-content`（鍵盤升起視窗縮小、對話框重新置中）；跟第五次晉升。第 2 波：依 Instagram／Threads 的設計哲學整體重調邀請相關體驗（底部面板等），記 §6 |
| 38 | 刊登照片 bucket 改名（業主 10/28 07:45） | `make-5c6718b9-listings-photos` → `listings-photos`。bucket id 不可改名：新 migration 建新 bucket＋前後端常數換名，不搬舊照片（清資料後舊 URL 不存在），舊 bucket 由業主在 Dashboard 刪。跟第 1 波，第六次晉升；清資料不等它（資料列與 bucket 無關） |
| 39 | 付款成功頁「信用卡銀行」顯示的是收單行（業主 10/28 16:50 真付款後發現） | PayUni 的 `AuthBankName` 是收單行，`CardBank` 才是發卡行代碼且無名稱。拿掉「信用卡銀行」列，只留遮罩卡號與到期日；不引進銀行代碼表（第 2 波評估）。#438，隨第七次晉升 |

較早的裁決仍有效：服務條款／參加契約／事業手冊／推廣獎勵規章已律師定案不可改；使用者可見文案一律「推薦人」；
admin 提領資料含未遮罩身分證與銀行帳號，任何快取不得持久化；R2 的 A～T 裁決見 `docs/plans/referral-email-invite/plan.md` 附錄 C。

## 1. 時間事實與關鍵路徑

- 核對時刻：2026-10-27 02:00 台北（UTC 18:00 10/26）。時程一律以台北時間寫。
- main `67a27ec6`（2026-10-06）→ develop `b861133`（#398；PR #402 head `ea777f0` 待合併，本檔隨 #402 進 develop）：20 個 PR、204 commits、**5 支 migration**（`20261017000001` pg_cron＋prune_rate_limits、`000002` validate_referral_code 收權、`000003` profiles 自改收權、`000004` register_profile 列鎖、`20261025000001` find_auth_user_by_email）。R2 後端（PR #399）再加兩支（`20261025000011` purge、`000012` refund）。
- 晉升 PR 的 journey-full 是 30–90 分鐘（最近一次 sandbox full 成功 23 分鐘，2026-10-17）；正式站部署需業主在 GitHub `production` 環境核准；migration 由 Supabase GitHub 整合在 push main 時自動套用（整合是否連著：用 Supabase MCP `list_branches` 看最新 PR 有沒有自動長出 preview branch，有就是連著；2026-10-26 的 PR 有）。

**關鍵路徑（串行，全部順利的估計）**

| 步 | 誰 | 估時 | 內容 |
|---|---|---|---|
| K1 | 業主 | 5 分 | 回答 R2 session（`session_015dFtMVsyqYU5gijDBa6yCp`）卡住的問題（中間層 429 無錯誤碼：建議「不改」）；合併 PR #402；看 develop 的 deploy run「部署 Edge Function」step 綠 |
| K2 | R2 後端 session | 1 小時 | `npm run check:full` → `/review-implementation` → #399 轉 ready → 業主合併 |
| K3 | 執行 session（R2 前端） | 3–4 小時 | 循環 6–11（見 `docs/plans/referral-email-invite/progress.md`）＋ R2-3a UI 步驟 → PR → 審查 → 合併 |
| K4 | 主 session | 0.5 小時＋journey 0.5–1.5 小時 | 開晉升 PR（develop→main）；journey-full 綠；業主以 merge commit 合併 |
| K5 | 業主 | 0.5 小時 | 核准 production 部署；`/health` 的 `sha` 對上；Dashboard 翻 PayUni 正式＋R2 的兩把 secret＋貼 Invite 模板；重部署；清三個 bucket（Cloudflare 旗標留到 K7 實寄核對後，裁決 S） |
| K6 | 主 session＋業主 | 0.5 小時 | 清資料：乾跑 → 業主確認 → 執行 → 零殘留檢查 |
| K7 | 業主（台灣網路） | 1 小時 | 註冊第一個帳號＋完善資料、`set-self-admin`、真付款 NT$1,200、拿到 8048876、加入推薦計畫、curl 實寄核對、開 Cloudflare 旗標並重建、UI 走一次邀請卡 |
| K8 | 業主 | — | 宣布開放 |

**誠實的估計**：K1 起算 7–9 小時；業主 02:15 睡到 10:15（裁決 9），夜裡主 session 把 K2–K4 做到「main 已合併、等核准」，業主醒來後做 K5–K7 約 1.5–2 小時，**最早台北 12:00 前後可開放**、沒有緩衝；任何一步紅（journey-full 第一次在 hosted 跑 #390／#394 的後端、`--use-api` 對 `_shared` import 的相容性、R2 正式站實寄）都會讓 12:00 往後。業主裁決 1 已接受「R2 沒好就延」。主 session 每小時在本檔 §8 記一列進度，延誤超過 2 小時就用互動問題給業主新的開放時間。

## 2. 三種 session（目標 6 的落地）

| 角色 | 職責 | 不做 | 交接物 |
|---|---|---|---|
| **主 session**（每波一個，開局 prompt 在 `dispatch-prompts.md` §A） | 讀本檔；派工（寫執行 prompt）；監工各 PR（CI、審查、裁決收集、PR 留言）；**rebase 與解衝突**（可 push 任何執行分支，裁決 5）；開晉升 PR；清資料（裁決 6）；維護本檔 §8 與總綱 §8.1；波結束時開審查 session、收審查報告、刪鷹架 | 不自己寫產品程式碼（例外：≤10 行的 CI／文件修補）；不跨波 | 本檔、`dispatch-prompts.md`、各 PR 留言、總綱 §13 一列 |
| **執行 session**（一工項一個） | 照 prompt 施工：`/fix-bug`／Plan Mode／`/tdd-implement`；自己的 PR 自己推到 CI 綠；回報主 session（PR 號、偏離、未驗項） | 不改別人分支；不裁決（問主 session 或業主） | PR（內文照 `.github/pull_request_template.md`） |
| **審查 session**（每波一個，prompt 在 §C） | 波結束（凍結期結束）後審「本波合進 main 的全部變動」：四視角＋事實核對＋上線後 system_alerts／issue 盤點；報告寫 `docs/plans/launch-wave-1/review.md` | 不改碼；P0 回主 session 開 hotfix | `review.md`；升級進 friction-log 的原則 |

規矩本體寫在 CLAUDE.md「開發流程細節」與 `docs/README.md`〈慣例〉（本波一併落檔）。
主 session 開局必讀：本檔、`docs/plans/platform-growth-and-trust/plan.md` §0／§8、`docs/plans/referral-email-invite/{plan,progress}.md`、`docs/supabase-setup-checklist.md`、`CLAUDE.md`。

## 3. 工作分解與平行度

### 3.1 上線前（K1–K7，串行為主）

| Lane | 工項 | session | 分支／PR | 狀態 2026-10-27 02:00 |
|---|---|---|---|---|
| A | 部署改 `--use-api` | 監工 session（已做） | PR #402 | 待業主合併；合併後第一個 develop push 的 deploy run 是證據 |
| B | R2 後端 | `session_015dFtMVsyqYU5gijDBa6yCp`（Opus） | `claude/referral-email-invite-vygu7r`，PR #399 draft | 循環 1–5＋R2-3a API 版綠；卡在等業主回答 |
| C | R2 前端循環 6–11＋R2-3a UI 步驟 | 新執行 session（**建議 Opus**：時間緊、動 AuthPage 主幹；業主先前裁 Sonnet，由主 session 再問一次） | #399 合併後從 develop 切；prompt §B | 未開始 |
| D | 清資料腳本（乾跑→確認→執行） | 主 session 自己（Supabase MCP） | 不進產品碼；腳本與乾跑結果記本檔 §4 | 未開始；§4 是規格 |
| E | 晉升 PR | 主 session | develop→main | 等 B、C 合併 |
| F | 業主正式站操作 | 業主 | — | §7 清單 |

### 3.2 窗口（10/27 開放後 → 10/28 24:00，平行）

| 工項 | 流程／模型 | 動到 | 撞檔與順序 | 風險 |
|---|---|---|---|---|
| **R1a-2** og 預覽＋`lang` | Plan Mode `fix/*`，Sonnet | `index.html` 一檔＋vitest 讀檔 | 零撞檔，**最先開** | none |
| **寄信失敗告警** | Plan Mode `fix/*`，Sonnet | `index.ts` system_alerts 來源 | 與 #395 同檔不同區段；排在 #395 後或同一 PR | low |
| **issue #395** PayUni 查詢層非 SUCCESS 告警、expired 前先告警 | Plan Mode `fix/*`，**Opus**（金流相鄰） | `index.ts` `queryPayUniTradeStatus`、reconcile 迴圈；`reconcile-payments.yml` | 等 #399 合併後切（同檔） | medium |
| **告警送到人** | 輕量 Plan Mode，Sonnet；**新建** `.github/actions/notify`（composite；設計見 PR #379 分支的 `docs/plans/launch-readiness/plan.md` C 列：LINE push＋Gmail SMTP，Secrets `LINE_CHANNEL_TOKEN`／`LINE_ALERT_TO`／`ALERT_SMTP_*`，目前 repo 沒有這個 action） | `deploy-supabase.yml`、`reconcile-payments.yml`、`deploy-smoke.yml`、新 composite action | 與 #402 同檔但 #402 先合 | low |
| **容量 hotfix** | Plan Mode `fix/*`，Sonnet | `index.ts` `CHECK_EMAIL_RATE_MAX` 10→**60**／5 分（現場共用 IP）＋ log 一行記下解析到的 IP 來源 header；**新增** `check-spec-drift` 規則與規格書 §4.1 一句（目前兩者都沒有這個限流值） | 同檔 index.ts，小段 | low |
| **P1a** 照片裁切管線 | 三段式 `feature/listing-photo-pipeline`，Sonnet（規劃在總綱 §3.2A／C） | `EditServiceProvider`、新 `imagePipeline.ts`、`index.ts` DELETE /listings/photos | 與其他項不撞；最大的一項，**10/27 開放後立刻開** | low |
| **T1** 登入狀態信任（不閃、暫時故障不登出） | 三段式 `feature/auth-state-trust`，**Opus 規劃**（總綱 §1） | `App.tsx`、`AuthPage.tsx`、`apiClient.ts`、`Navbar`、`BottomNav` | **R2 前端合併後才切分支**；與 P1a 不撞 | high：若 10/28 24:00 前沒綠，**不上**，留到 11/3 |

每項開工前主 session 先查 `docs/plans/platform-growth-and-trust/plan.md` §8.2 撞檔矩陣；同檔者串行、不同檔者平行。衝突時主 session 自己 rebase（`git fetch origin develop && git rebase origin/develop && git push --force-with-lease`），解不開的才問執行 session。

### 3.3 10/29–10/31 凍結（裁決 8）

只許 hotfix：營運中發現、定義明確、不動註冊／付款／登入主幹、無 migration；每個 hotfix 都走晉升 PR＋業主核准。
窗口內沒做完的（T1、S7b、L1-1、P1b、A1a…）全部等 11/3 的第 2 波。

## 4. 清資料 SOP（裁決 3、6）

**原則**：先乾跑列計數、業主確認後才刪；刪的順序照 `e2e/journey/tools/cleanup.py`（先 Storage 物件，再 `auth.users` 讓業務表 cascade）；DB 部分用 Supabase MCP `execute_sql` 對正式專案 `uhtwwxtazwqnlbejhprl`。**Storage 物件不能用 SQL 刪**（直接刪 `storage.objects` 列只會留下孤兒實體，之後也無法再從 Dashboard 清）：由業主在 Dashboard → Storage 的三個 bucket（`id-cards`、`referral-signatures`、`listings-photos`；裁決 38 改名前叫 `make-5c6718b9-listings-photos`）全選刪除，乾跑看到 `storage.objects` 各 bucket 為 0 才進 SQL 段。

**前提（業主）**：Dashboard → Project Settings → Database → Backups 確認今天有可還原的備份（或 PITR 開著），截圖回報。沒有備份不執行。

**演練**：**不在 develop 上演練**（develop 的管理員、預設推薦人與測試帳號還要給窗口工項的真機驗收用）。用 Supabase MCP `create_branch` 從正式專案開一條拋棄式分支，對它跑乾跑與刪除段，確認每句 SQL 都能執行、零殘留查詢正確，然後 `delete_branch`。分支沒有資料，演練驗的是語法與權限，不是計數；**用同一個 `execute_sql` 呼叫跑含 `begin;`／`commit;` 的整段**，被拒或要求確認時改成單一多語句呼叫，再不行就由業主在 Dashboard SQL Editor 貼同一段。

**乾跑（唯讀）**：

```sql
select 'auth.users' t, count(*) from auth.users
union all select 'profiles', count(*) from public.profiles
union all select 'profiles.is_admin', count(*) from public.profiles where is_admin
union all select 'listings', count(*) from public.listings
union all select 'payment_orders', count(*) from public.payment_orders
union all select 'payment_orders.completed', count(*) from public.payment_orders where status='completed'
union all select 'subscriptions', count(*) from public.subscriptions
union all select 'withdrawals', count(*) from public.withdrawals
union all select 'withdrawal_events.bank_ref', count(*) from public.withdrawal_events where bank_ref is not null
union all select 'reward_transactions', count(*) from public.reward_transactions
union all select 'referral_codes', count(*) from public.referral_codes
union all select 'referral_edges', count(*) from public.referral_edges
union all select 'task_progress', count(*) from public.task_progress
union all select 'referral_king_rewards', count(*) from public.referral_king_rewards
union all select 'system_alerts', count(*) from public.system_alerts
union all select 'announcements', count(*) from public.announcements
union all select 'rate_limits', count(*) from public.rate_limits
union all select 'member_verify_logs', count(*) from public.member_verify_logs
union all select 'auth.audit_log_entries', count(*) from auth.audit_log_entries
union all select 'storage.objects:'||bucket_id, count(*) from storage.objects group by bucket_id;
select last_value, is_called from public.referral_code_seq;
select default_referrer_code from public.reward_config;
select to_regclass('public.kv_store_5c6718b9');   -- 舊 KV 表若仍存在（checklist 附錄），一併列計數並刪
```

把結果整段貼進互動問題給業主確認（特別標出：`withdrawal_events.bank_ref` 非 0 代表曾有真匯款；`payment_orders.completed` 若有 `PAYUNI_SANDBOX=false` 期間的單代表真錢——目前證據是正式站一直 sandbox，PR #372）。

**執行（業主確認後，整段在單一交易內；執行前看 `reconcile-payments.yml` 沒有 in_progress 的 run 即可，排程看不到半刪狀態）**：

```sql
begin;
-- storage.objects 已由業主在 Dashboard 清空（乾跑各 bucket 為 0），這裡不碰
delete from auth.users;                      -- profiles 與全部業務表 cascade（20260620000001:20 起）
delete from auth.audit_log_entries;          -- 含 email，無 cascade，個資清理
delete from public.system_alerts;
delete from public.rate_limits;
delete from public.member_verify_logs;
delete from public.announcements;            -- 業主若有上線公告要留，先問
alter sequence public.referral_code_seq restart with 8048876;   -- 裁決 3 全清＝checklist「整批測試資料一起清掉」的例外（checklist:486-494）；乾跑的 referral_codes 必為 0
commit;
```

不碰：`public.reward_config`（單列）。乾跑若看到 `default_referrer_code = '8048876'` 就維持，業主付款拿到 8048876 後自動對上；若是 null 或別的值，業主付款後執行 `update public.reward_config set default_referrer_code = '8048876';`（checklist 步驟 6 的順序：先付款、後設定）、`storage.buckets` 列、`cron.job`、`supabase_migrations.schema_migrations`。

**零殘留檢查**：再跑一次乾跑，除 `reward_config` 外全部為 0；`select last_value, is_called from public.referral_code_seq` 應為 `8048876, false`。

**之後（業主，§7 第 9–10 步）**：註冊 → 真付款 → `/health` 的 `defaultReferrer` 應為 `ok`（第一個付款帳號拿到 8048876 且與 `reward_config` 相符）→ `POST /admin-setup/set-self-admin`。

## 5. 10/29–10/31 評估與衡量（目標 4，裁決 7）

**容量事實（來源：掃描 2026-10-27）**

| 環節 | 上限 | 100–500 人、部分現場的判斷 |
|---|---|---|
| 驗證碼信 | Supabase Auth 寄信 300 封／小時（文件值，Dashboard 現值待業主讀）；Google Workspace 2,000 封／日 | 尖峰小時 100 人註冊約 150 封（含重寄）：300／小時夠但緊，**業主在 Dashboard 調到 600／小時**；2,000／日夠（單日最多約 750 封）。relay 不必先換，備案在 checklist:330-334 |
| `/auth/check-email` | 每 IP 10 次／5 分鐘，IP 取 `cf-connecting-ip`→`x-forwarded-for`→`unknown` 共用桶 | 現場同一 Wi-Fi 第 11 人起被 429 → **窗口 hotfix 改 60／5 分**。真實 IP 有到（develop 的 `rate_limits` 已有 `check-email:49.216.167.190` 這類列，不是 `unknown` 桶）；主 session 可用 Supabase MCP `execute_sql` 對 develop 查 `select key, count, window_start from public.rate_limits where key like 'check-email:%'` 再確認一次，不必打端點 |
| 推薦碼驗證 | 每人 10 次／5 分、50 次／日 | 夠 |
| 結帳頁輪詢 `/profile` | 每 5 秒一次、不收斂 | 50 人同時停在結帳頁 ＝ 10 req/s 的 6 查詢端點；可接受，不改（T1 會收斂） |
| PayUni | 正式端點是否擋海外來源未確認；NotifyURL 必須打得到 `*.supabase.co` | 台灣真付款驗證（裁決 4）同時驗這兩點 |
| 對帳排程 | GitHub cron 名義每小時、實測中位 1.7 小時；批次 50 | 夠；#395 上去後靜默 expired 會變告警 |

**量測（主 session 在 10/28 前準備成一支 SQL 檔放 scratchpad，10/29–31 每 2 小時跑一次，結果記本檔 §8）**

1. 每小時註冊漏斗：`auth.users` 依 `date_trunc('hour', created_at)` 的 建立數／`email_confirmed_at` 非空數（完成率 <80% 或整點斷崖 ＝ 寄信額度）。
2. 重寄比：`confirmation_sent_at` 更新次數無法直讀，改看 Auth logs 的 send 事件數／註冊數，>1.3 代表送達問題。
3. 步驟分布：`select public.effective_registration_step(id) as step, count(*) from public.profiles group by 1`（函式，0 基本資料未填／1 無訂單／2 有 pending 訂單／3 有 completed 訂單；`profiles.registration_step` 欄已棄用、不要讀）。
4. 訂單：`payment_orders` 每小時各狀態數；`pending` 且無 `payuni_response` 超過 20 分鐘的數；`pending` 且 `payuni_response->>'Status'='SUCCESS'` 的數（目標 0）。
5. `system_alerts` 未解決數依 source／severity。
6. 限流壓力：`rate_limits` 中 `key like 'check-email:%'` 且 `count >= 上限` 的列數、`check-email:unknown` 的 count。
7. `/health` 每次都看：`ok`、`sha`、`payuniMode=production`、`defaultReferrer=ok`（主 session 的容器打不到 `*.supabase.co`：由業主貼，或請執行 session 從它的容器 curl）。
8. 客服回報分類計數：沒收到驗證碼／付了未開通／推薦碼無效／請求過於頻繁。
9. R2 邀請：`auth.users` 中 `raw_app_meta_data ? 'referral_invite'` 的數、其中 `email_confirmed_at is null` 且 `issued_at` 超過 8 天的數（應為 0，purge 失效的訊號）、`system_alerts` 的 R2 來源（接手 R2 規劃書 R2-3b 第 12 點，該規劃書在前端合併後會刪）。

**監看分工**：告警送到人（窗口工項）上去前，業主每 2 小時看 `/admin` 的系統告警與 GitHub issues；上去後由 LINE 推播。主 session 在凍結期沒有 PR 事件就不會醒：10/29–31 的每 2 小時量測需要一個排程任務（Claude Code Remote `create_trigger`，cron 每 2 小時、只到 10/31）——業主醒來後裁決是否允許（列在 §8 待辦），未允許前由業主手動喚醒主 session。

## 6. 第 2 波起：維運與資安（目標 3）

每週晉升：第一次 11/3（週二）台北 10:00 開晉升 PR、journey-full 綠、業主核准；之後每週同一天。第 2 波主 session 從這張表挑（大小是掃描估計）：

| 項 | 大小 | 內容 |
|---|---|---|
| PR #379 launch-readiness ①–④ | 中 | 告警到人（本波先做最小版）、每日 AI 維運任務＋runbook、Supabase 安全強化（search_path、revoke、索引）、備份還原演練與金流切換演練；分支落後 develop 117 commits，先 rebase 再分拆 |
| 備份／PITR 與日誌保留 | XS | 文件化方案層級、PITR、log drain；本波只要業主確認備份存在 |
| 安全標頭 | S | `public/_headers` 加 HSTS、X-Content-Type-Options、Referrer-Policy、frame-ancestors；CSP 另案 |
| 伺服器端密碼規則 | XS | Dashboard 最小長度 8＋外洩密碼檢查，記進 checklist |
| `handle_new_user` 不讀 metadata、`national_id` 唯一 | S–M | A1b-1b；先唯讀掃重複 |
| 私有 bucket 釘測試 | XS | Deno DB 測試斷言 `storage.buckets.public=false`、`storage.objects` 零 policy |
| Deno 相依掃描 | XS | security.yml 加一步 |
| 後台稽核軌跡 | M | A1b-2/3（總綱 §6） |
| 既有 issue 收斂 | XS | 全部同標題「Edge Function 部署失敗」issue（2026-10-26 時點 13 張，#337–#400）、#288、#280、#279 一次清；順手把 checklist 的號源重設句改成「已開始發碼後絕不執行」 |
| SEO 進階（AEO／GEO） | M | FAQ 與服務者頁 JSON-LD、llms.txt、公開頁預渲染（建置流程變更，三段式）、服務者動態 sitemap（後端產生）；基礎版在窗口 PR `fix/brand-icons-seo` |
| journey harness 配合 PayUni sandbox 新表單 | S | `payuni_sandbox_page.py` 重新定位卡號欄與送出鍵；11/03 前把 ci.yml journey-full 改回 sandbox（規則 13 到期自動紅） |
| 窗口沒做完的 | — | T1、S7b、L1-1、P1b、A1a、A2 照總綱 §8 順序 |
| 框架修訂（第 1 波 friction-log 2026-10-26～27 兩節） | S | `tdd-test-guard` 擴到 Bash 寫 `*.test.*`（bash-guard 新類）；bash-guard 的 journey 判準只看 `pytest` 在指令位置；ci.yml e2e 的 apt 步驟獨立＋規則 12 退避、api-tests `supabase start` 加退避並把規則 12 擴到它；`/tdd-implement` 紅燈步驟加「逐條讀失敗原因」；dispatch-prompts 逃生口 2 改成「業主親自到執行 session 貼授權句」；e2e/requirements 釘 `playwright==1.63.0` |
| `lazyWithRetry` 重試一次無效＋表單草稿保存 | S | 失敗的 module fetch 被瀏覽器記成 null（HTML 規格），同 URL 再 import() 立刻失敗，`importWithRetry` 的第一段重試形同虛設，第 2 波驗證後簡化為直接重載；Create／Edit 表單加草稿保存（`docs/multi-step-flow-recovery.md` 四契約），重新整理不掉已填文字 |
| PR 2 審查記債（#421 第 2 波） | S–M | 送出中 picker 未凍結、preparing／chunk 載入無逾時、5xx 固定文案、Edit 取消孤兒入 §14、預覽縮圖用原檔、滑桿 aria-valuetext 與微調鈕命名、封面徽章、窄格溢出（真機）、內建瀏覽器 unsupported 分流、spinner、驗收 8 e2e、驗收 14 e2e 斷言、§11 格式欄、e2e 上傳 mock 歸位 BackendApiMock、常數命名與 UPLOAD_TIMEOUT_MS 歸位、`useBrowserListingPhotos` 收斂 Create／Edit 重複、`initialUrls` 二選一、微調／重設／滑桿行為測試與 PhotoCropDialog 同名測試檔、401 不登出、「重設」鈕與 60 秒逾時待業主確認 |
| 詳情頁輪播 P2（#430 自審遺留） | S | 箭頭首尾 disabled 時鍵盤焦點掉回 body；計數 `aria-live` 只唸「2/3」缺語境；未選中圓點對比未量測；捲動容器 `tabIndex=0` 無名稱；箭頭桌機顯示／手機隱藏沒有 e2e；單張刊登時 e2e 探針因沒有圓點列會丟例外 |
| PayUni 商店級錯誤要進告警 | S | 非 SUCCESS 回應若狀態碼屬商店／設定類（`DEF01006` 等）或同一小時內多個不同使用者連續非 SUCCESS，用 `logSystemAlertOnce` 寫 error 告警（去重），建單階段被拒也納入；10/28 商店停用讓每個人都付不了卻零告警 |
| 成功頁是否顯示發卡行 | XS | PayUni 只給 `CardBank` 代碼不給名稱；要顯示得維護一張銀行代碼表，評估值不值得；裁決 39 第 1 波只拿掉收單行列 |
| 正式站前端部署失敗零訊號（10/29 事故） | S | Cloudflare Pages 的 main 建置失敗沒有任何通知，正式站停在舊版 18 小時才被人眼發現。候選：(a) 建置時把 commit sha 埋進 index.html（`<meta name="build-sha">`），`scripts/check-deployed-assets.py` 對正式站比對 main HEAD，deploy-smoke 每 6 小時自然會叫；(b) Cloudflare 通知（Notifications → Pages build failure）送 email／webhook。(a) 治本且與現有 smoke 同軌，優先 |
| 會員管理顯示推薦碼與是否加入推薦計畫（業主 10/28 20:20） | S | `admin_list_members`／`admin_member_detail` 目前都不回推薦碼與 `referral_program_joined`，後台看不出誰有碼、誰簽了規章；列表加「推薦碼」「推薦計畫」兩欄（可篩選），詳情加加入時間與簽名檔連結 |
| 邀請體驗整體重調（裁決 37 第二段） | M | 依 Instagram／Threads 的設計哲學重看「邀請好友」整段：底部面板（visualViewport 跟鍵盤墊高）、Email 與快速分享的層次、結果回饋；第 1 波只做置中＋viewport |
| 第 1 波收尾（主 session 交接） | XS | `docs/plans/launch-wave-1/` 鷹架在 §5 評估（10/31）結束後清掉，值得留的升級進規格書／checklist／friction-log；#415 併入 develop；Cloudflare 儀表板的 `VITE_REFERRAL_EMAIL_INVITE` 變數可刪（旗標已在 git）|

## 7. 業主操作清單（按順序；每步做完回主 session 一句）

**睡前（10/27 02:15 前）**

1. 回答 R2 session 卡住的問題（建議「不改」）。
2. PR #402 轉 ready → 合併（merge commit；內含本檔、三種 session 的 prompt、CLAUDE.md／README 修訂）。
3. 開新的主 session（Opus），貼 `dispatch-prompts.md` §A；它會自己開 R2 前端與窗口工項的執行 session。你醒著時它每問一次裁決都會停在互動問題等你核准，上線日請保持可即時回覆。
4. 睡。夜裡不會有任何互動問題等你；主 session 把要你決定的事列在本檔 §8 的「醒來後待辦」。

**醒來後（約 10:15 起，順序照做；先看本檔 §8 最後幾列與「醒來後待辦」表）**

5. 若晉升 PR 已合進 main：到 Actions 核准 `production` 部署；`curl https://uhtwwxtazwqnlbejhprl.supabase.co/functions/v1/api/health` 看 `sha` 對上 main 的 merge commit。若還沒合進 main：看 §8 的原因，先做主 session 列出的那件事。
6. Supabase Dashboard（正式專案）：確認備份存在（Project Settings → Database → Backups，截圖回主 session）；Authentication → Rate Limits 的寄信上限調到 600／小時並記下現值；Authentication → Email Templates 貼 R2 的 Invite user 模板與主旨（`supabase/email-templates/referral-invite.html`，R2 前端 PR 合併後才有這個檔，PR 內文有貼法）；Edge Function Secrets 加 `REFERRAL_INVITE_SECRET`（`openssl rand -hex 32`）、`REFERRAL_EMAIL_INVITE_ENABLED=true`。
7. Secrets 翻 PayUni 正式：`PAYUNI_SANDBOX=false`、`PAYUNI_MER_ID`／`PAYUNI_HASH_KEY`／`PAYUNI_HASH_IV`；確認 `FRONTEND_URL=https://uknow.com.tw`；Dashboard 重部署 `api`；`/health` 的 `payuniMode=production`、`payuniConfigured=true`。PayUni 商店後台確認 NotifyURL／ReturnURL 網域。告訴主 session「已翻」，它才合 `EXPECT_PRODUCTION_PAYUNI` 的 PR。
8. ~~Storage：Dashboard → Storage → `id-cards`、`referral-signatures`、`listings-photos`（舊名 `make-5c6718b9-listings-photos`）三個 bucket~~ 10/28 08:00 已清、兩個舊遺留 bucket 已刪；第六次晉升後再刪舊 `make-5c6718b9-listings-photos` bucket 各自全選刪除物件（bucket 本身留著）。
9. 回答主 session 的清資料乾跑確認（它會貼 §4 的計數；`storage.objects` 各 bucket 必須已是 0）。
10. 清完後，從台灣網路：註冊第一個帳號＋完善資料 → `GET /admin-setup/check`（`hasExistingAdmin=false`）→ `POST /admin-setup/set-self-admin`（checklist 步驟 7；**先做這步再付款**，端點對第一個完成資料的人開放、不要留空窗）→ 真付款 NT$1,200 → `/health` 的 `defaultReferrer=ok`（`reward_config` 不是 `'8048876'` 時先 `update`，見 §4）→ 加入推薦計畫（簽規章）。
11. R2 實寄核對（R2 規劃書 R2-3b 第 8–10 步，裁決 S 的順序：後端先開、收信核對通過才開前端旗標）：用自己的 token `curl -X POST …/api/referrals/invites` 寄到第二個信箱 → 收到信、主旨、揭露句、連結正確 → 點連結設密碼 → 完善資料頁帶推薦碼 → 回報主 session；主 session 跑 `purge_stale_referral_invites(p_email := '<第二個信箱>')` 清掉測試空殼（或你再註冊完它）。同一步順便驗 R2-0 沒做過的兩件 hosted 行為：同信箱第二次寄（重寄）信內連結是新的；purge 後主 session 用 SQL 確認該帳號的 `auth.audit_log_entries` 列已被刪（`delete_auth_audit_for_users` 對 hosted payload 形狀有效）。兩件都過才做第 12 步。
12. ~~Cloudflare Pages 儀表板設 `VITE_REFERRAL_EMAIL_INVITE=true` 後 Retry~~ 實測無效（裁決 31）：旗標改寫進 git 的 `.env.production`（fix PR → develop → 隨第三次晉升上 main）。上 main 後開 https://uknow.com.tw，用已加入推薦計畫的帳號按「邀請好友」確認邀請卡有 Email 欄。儀表板那個變數可刪可留（git 的值優先且相同）。
13. **（10/28 醒來，裁決 33）** GitHub → Actions → `deploy-supabase` 最新一筆（main d21f6ca 第五次晉升；8b1b8abf、66c2cf0 兩筆已核准並部署綠）→ Review deployments → 核准 `production` → 等綠 → 開 https://uknow.com.tw/api/health 確認 `sha` 為 `d21f6ca`（開頭）。接著手動測：(a) 刊登管理建立／編輯頁選 3 張照片 → 每張取景 → 完成 → 上傳 → 送出，手機上試返回鍵只關取景；(b) 會員中心刊登卡與推薦卡同高、未刊登時「立即刊登」與「邀請好友」同一排；(c) 已加入推薦計畫的帳號按「邀請好友」出現 Email 邀請卡（旗標已在 git），寄到第二信箱、連結落在設定密碼頁、再寄一次連結不同。測完回主 session 一句，再進清 bucket／清資料（§4）→ 註冊＋set-self-admin → PayUni 切正式 → 真付款 → 宣布。
13. 宣布開放。之後每 2 小時看一次 `/admin` 系統告警與 GitHub issues，直到告警送到人上線（它需要你在 GitHub Secrets 放 LINE token，主 session 會列在待辦）。

## 8. 進度與異動紀錄（主 session 每小時一列）

| 時間（台北） | 事件 | 下一步 |
|---|---|---|
| 10/27 02:00 | 監工 session 完成目標核對（§0）、掃描、PR #402；本檔與 `dispatch-prompts.md` 落檔 | 業主做 §7 睡前 1–3 步 |
| 10/27 02:15 | 業主裁決 9（夜間授權）後入睡到 10:15 | 主 session 接手；夜裡的紀錄一律寫在本表 |
| 10/27 13:45 | **主 session 開局**（夜間沒有主 session 運作，夜間授權未使用）。現況：#402 於 13:43 由業主合併，develop CI run 40456919943 進行中，「部署 Edge Function」step（`--use-api` 首次）待它綠後的 deploy run 判定；#399 已轉 ready，R2 後端 session 閒置在等審查，**沒有卡在 AskUserQuestion**（K1 的「回答問題」已不需要）；#399、#401 因 #402 改了 `.claude/rules/github-actions.md` 規則 12 而 conflict、CI 未跑。open issues 未變（部署失敗 issue 群待 §6 收斂）。**12:00 開放已錯過** | rebase #399／#401、五 lane 審 #399、問業主新開放時間 |
| 10/27 13:55 | 依目標 5 授權 rebase＋force-push：#401 → `f6a0d4b`、#399 → `c3be852`（規則 12 段落解成兩邊都留；#399 的移植段與 #401 逐字相同，#401 合併後 no-op）。本機 check／check-workflows／spec-drift／migration-versions 綠。已 send_message 通知 R2 後端 session 先 reset 再動 | #399 五 lane 審查進行中；CI 綠後合 #401 → #399 |
| 10/27 14:10 | develop deploy run 40457604933（`--use-api` 首次）**綠**——K1 完成。#399 五 lane 審查完成：無擋合併的 P0／P1（需求 lane 的「沒有前端」是既定分工），追蹤項留言在 #399、轉進 dispatch §I 與 §7 第 11 步 | 業主裁決 10–13（見 §0）|
| 10/27 14:20 | 派工 prompt D～I 落檔；開 R1a-2、P1a（規劃）、告警送到人三個執行 session | #399／#401 CI 綠 → 合併 → 開 R2 前端（§B＋§I）、G、H |
| 10/27 14:05 | 首批三個 session 用 create_session 不帶 source_url 開出 → 容器沒有 repo、add_repo 被分類器擋，三個都卡住（已改帶 `source_url` 重開；舊的 `session_01MQovbDCdjDsSfdjR573frP`、`session_01MQovbEWLNfqLFHrSzGLdsx` 封存被權限擋，請業主手動封存）。**教訓：create_session 一律帶 source_url＋source_revision=develop** | — |
| 10/27 14:06 | **#399 合併**（`5364205`，head `58b38c1` CI 綠）；#401 內容已逐字隨 #399 進 develop → 留言後關閉。建 10/29–31 量測排程 `trig_01KmMD7RYZFDjNiLWHrNDhx3` | 等各執行 session 回報 |
| 10/27 14:15 | 開 #403（本分支的文件 PR，晉升前合）。六個執行 session 全部在跑（名冊見下）。清資料演練（§4）：Supabase MCP `create_branch` 需要業主確認分支費用，MCP 等不到回答逾時——**待業主在互動視窗核准後重試**。`measure.sql` 落檔（§5 的 SQL 項） | 等執行 session 回報；業主核准分支費用 |
| 10/27 14:20–14:30 | 執行 session 回報：R1a-2 → PR #405（CI 綠、ready）；告警送到人 → PR #406（CI 綠、draft）；#395 → PR #407（draft，等 CI）；P1a 規劃 → PR #404（1 P0／15 P1，待裁決）；容量 hotfix 工作樹完成但 pre-commit 要 deno、容器裝不了 curl\|sh → 指示改試 `npm install -g deno`；R2 前端循環 6、7 綠、8 施工中，核准其一條紅燈測試字面修正（斷言改以「密碼需包含：」開頭） | 審 #405／#406／#407（三個 agent 進行中） |
| 10/27 14:30 | 演練分支 `wave1-cleanup-rehearsal`（`ykaxvdxtswhtqohwhlss`，業主在 Dashboard 開的；MCP create_branch 的費用確認視窗兩次都到不了業主）：乾跑 SQL 全部可執行、權限 OK（第一次因分支 migration 尚未套完而找不到 `referral_code_seq`，數秒後即存在——**今晚對正式站不會有這個問題**）。刪除段透過 MCP 兩次 `cancelled` → 裁決 17。business decisions 14–17 落 §0 | 業主在 SQL Editor 貼刪除段 → 主 session 跑零殘留檢查 → 刪分支 |
| 10/27 14:40 | #405 審過可合併（等晉升）；og 圖開 issue #408。#406／#407 第一輪審查 agent 無 shell 取不到 diff → 以有 shell 的 agent 重審中。容量 hotfix session 連 `npm install -g deno` 也被分類器擋 → 交棒：它把 patch 以 send_message 傳給 #395 session（唯一有 deno＋本機 Supabase 的執行 session），由後者在 #407 ready 後另開 `fix/peak-capacity-hotfix` PR | 等 #406／#407 審查結果、R2 前端 PR、業主貼演練刪除段 |
| 10/27 14:55 | #407 審過：P0 無、5 點需修（去重鍵加 payuniMessage、未付款不寫 info、payuni-query 升 error、fallback 條件、零告警斷言）；開放問題裁決「本 PR 不動轉移條件，#395 留 open 等 sandbox 碼表」。#406 審過：P0 無、1 P1 必修（`actions: read` 缺 → 窗口靜默退化 70 分）＋4 P2。P1a 第二版 #404 剩 Q-D／Q-F／Q-G → 業主裁決 18–20，執行 session 跑第三輪 /review-plan。容量 hotfix patch 已交 #395 session | 等 #406／#407 修完、R2 前端 PR、業主貼演練刪除段 |
| 10/27 15:45 | R2 前端開 draft PR #409（循環 6–8＋文件＋R2-3a UI 驗形；本機 check:full 綠、mocked e2e 290 passed）；已訂閱、預審 6–8 | 循環 9–11 推完後五 lane 完整審查 → 合併 → 開晉升 PR |
| 10/27 15:47 | 容量 hotfix 交棒成功 → PR #410（#395 session 本機 supabase 實跑紅燈證據；另順手改 journey docstring 與 index.ts 註解的舊數字）| 審 #410 |
| 10/27 15:52 | #410 審過可合併（P0／P1 無，3 條 P2 記債）。P1a #404 第三輪 0 P0／3 P1（已處置）／7 P2，裁決 18–20 已落 plan；**待業主審 #404 後親打 /tdd-implement**（PR 1 後端清理先做） | 業主審 #404；等 #409 循環 9–11 |
| 10/27 16:00 | #409 預審（循環 6–8）：P0 無、2 P1（SIGNED_OUT 清掉使用中 token；T1 撞檔面要記交接）已交 R2 session 在循環 11 前修。#406 P1 已修（`9da630f`）複核通過、ready；#410 CI 綠、ready；#407 五點已修（`4978574`）複核中 | 等 #409 循環 9–11；窗口 PR #405／#406／#410（#407 待複核）全部等晉升後合 |
| 10/27 16:40 | 業主在演練分支 SQL Editor 跑完 §4 刪除段（`8048876, false`）；主 session 跑零殘留檢查後刪分支。業主審過 #404、已在 P1a session 打 /tdd-implement（PR 1 後端清理先做）；兩個空 session 已封存。**今晚正式站清資料的實際路徑確定：乾跑與零殘留由主 session 用 MCP 跑，刪除段由業主在 SQL Editor 貼** | 等 #409 循環 9–11 |
| 10/27 16:50 | 零殘留檢查全 0、`reward_config` 1 列、序列 `8048876,false` → 演練分支已刪。業主確認正式站每日 PHYSICAL 備份（最新 10/26 22:44 UTC＝10/27 06:44 台北），Storage 物件不在備份內（§4 已知）；裁決 21 PITR 不開。手把手步驟（寄信上限 600、SMTP 確認、LINE channel 與兩把 Secret）已交業主 | 等業主回 4b／4c／5；等 #409 |
| 10/27 17:05 | 業主完成：寄信上限調 600／小時（Rate Limits 頁；原值待業主補）；自訂 SMTP 確認（`admin@uknow.com.tw` 經 `smtp.gmail.com:587`，Dashboard 的「personal provider」黃色警告是制式提醒，§5 已算入 2,000 封／日）；LINE Messaging API 綁在既有官方帳號「Simon」（@693hcfug，輕用量 200 則／月）、Provider「Uknow」，兩把 Secret `LINE_CHANNEL_TOKEN`／`LINE_ALERT_TO` 已放 GitHub；其他 Auth 限流（sign-up 300／5 分／IP、OTP 300／5 分／IP）對現場共用 IP 足夠，不動 | 推播實測（curl 或 #406 合併後 workflow_dispatch） |
| 10/27 17:12–17:40 | R2 前端 #409 完成（循環 6–11、R2-3a UI、實作審查與預審處置、規劃目錄已刪；head `eae1213` CI 綠）。五 lane 審查：P0 無；P1 兩條經反駁只剩 `expired` 文案一條成立（第 8 天才踩到、首批邀請 11/3 到期）→ follow-up `fix/invite-expired-notice`（R2 session，目標 10/28 第二次晉升）；模板保存期限句為裁決 N，維持。事實核對全綠。**#409 合併（`1471912`）** | 開晉升 PR |
| 10/27 17:45 | **晉升 PR #411 開出**（develop→main，23 個 PR、7 支 migration；#403 主 session 文件 PR 因 ready 後 ci-ok 要重跑、不值得佔關鍵路徑，排除在本次晉升外、晉升後再合）。dispatch `journey-scheduled.yml`（develop，`pytest_expr=orgbuild or invite`）先驗 R2 的 hosted 行為，與 #411 的 journey-full 平行 | 等 journey 子集（~10–20 分）與 journey-full（30–90 分）；綠就以 merge commit 合進 main → 業主核准 production 部署 |
| 10/27 18:26–18:45 | **journey 子集（sandbox）紅**：拋棄式分支、migration、`--use-api` 部署、signup 探測全綠；pytest 在 PayUni sandbox 刷卡頁「確認送出」後 45 秒表單仍在、卡號欄只剩末四碼（run 40472945048）。史料：10/17 sandbox full 綠（run 39063973420）、10/24 排程紅在拉映像（未到 pytest）→ 今天是 10/17 後第一次碰 PayUni sandbox 頁，判定 PayUni 測試站改版，非本波程式問題。#411 的 journey-full（sandbox）必同樣紅。處置：(a) 重 dispatch 子集改 `payment_mode=webhook`（run 40473648265）驗 R2 hosted 行為；(b) 主 session 依 ≤10 行 CI 例外開 **PR #413**：ci.yml journey-full 暫改 webhook、規則 13 標「暫時至 2026-11-03」；PayUni 邊界由今晚真付款驗（裁決 4）。#413 合進 develop 後 #411 自動跟上重跑 journey-full（webhook，約 30–60 分） | 等 webhook 子集結果 → 合 #413 → 等 #411 journey-full |
| 10/27 18:50 | **webhook 子集綠**（run 40473648265：30 節點建樹＋Email 邀請 GUI 情境在 hosted 分支通過＝R2 hosted 行為已驗）。#413 CI 只剩 e2e-tests。R2 follow-up PR #412 開出（draft，4 項都做，目標 10/28 晉升）。業主：LINE token 貼成 Channel secret，已指正；裁決 22 | #413 綠 → 合併 → #411 journey-full（webhook）重跑 |
| 10/27 19:00 | 業主 LINE 推播實測通（curl 回 `{}`、手機收到）；Secret 已更正為長效 Channel access token。#412 審過可合併（P2 順手刪 useRef）。#413 只剩 e2e-tests | #413 綠 → 合併 → #411 journey-full（webhook）|
| 10/27 19:47 | **#413 合併**（`5779d16`）：develop 的 journey-full 閘門暫走 webhook 至 11/03。#411 head 隨之更新、CI 含 journey-full（webhook、full 30 節點）重跑 | journey-full 綠 → merge commit 合進 main → 叫業主核准 production 部署 |
| 10/27 19:55 | 業主提出官方 icon（黑底白字 Uk）、搜尋引擎可見、SEO／AEO／GEO 準備 → 裁決 23／24。原檔已放 `fix/brand-icons-seo` 分支 `public/brand/`（54d06bc）；派工 prompt §J；開 Sonnet 執行 session | 等 #411 journey-full |
| 10/27 20:13 | **#411 journey-full（webhook，full 30 節點）綠，24.7 分鐘**（run 40475965034）；ci-ok 綠 → 以 merge commit 合進 main。brand/SEO 執行 session 開出 PR #414（審查中；Navbar 改動要還原） | 業主核准 production 部署（§7 第 5 步）→ /health sha 比對 |
| 10/27 20:35 | main CI 綠（b4f9bb3，push 軌只跑 guards）→ deploy-supabase run 283（40479159452）停在 `waiting`＝等 production 核准（REST 顯示 head_branch=develop 是 workflow_run 以預設分支為上下文的已知顯示法，環境判定用 payload 的 main）。#403 ci-ok 綠 → 合進 develop（91d4a1e，develop 解凍後第一支）；本分支改從 develop 重切，後續 §8 另開 PR。給業主 §7 第 5 步核准＋sha 比對說明 | 業主核准 → 貼 /health 輸出；接著 #405 rebase |
| 10/27 20:50 | #405 rebase 到 develop（e02e3a2）CI 中；#414 兩項修正（fa861dd Navbar 還原、88d7c67 sitemap）CI 綠，疊在 #405 上等它合後 rebase；#412 ready 綠等 rebase。**#404（P1a PR 1）四 lane 審查**：無 P0；P1 ×5（整合測試補真 overlaps＋Storage 移除案例、public URL base 不靠 `publicUrlOf('')`、§14 第 14 列補齊孤兒來源、刪除中回饋、PR 內文失準兩處＋部署順序）已交執行 session；URL 新舊形狀一致（不誤刪）與撞檔（merge-tree 全乾淨）皆核對通過。PR 2 裁示留 11/3 第 2 波同 session 接手。架構 lane 另查出 #407 對 develop 的 friction-log 會衝突，輪到它時 rebase 處理 | #405 綠 → 合；#404 修完 → 複核 |
| 10/27 21:05 | 停車 PR 依序合進 develop：#405（0c5c11b）→ #410（140fecb）→ #406（0786b61），每支 rebase＋ci-ok 綠後 merge commit。#404 五項 P1 修完（60a411d）CI 全綠含新整合測試，最後再 rebase 合。#407 rebase 時 friction-log 衝突（#395 條目的償還段 vs R2 施工摩擦節）兩邊都留、推 4b92157 等 CI。業主尚未回覆 production 核准 | #407 綠 → 合 → #412 → #414 → #404 |
| 10/27 22:00 | #407（69b1520）、#412（a4960f0）合進 develop。CI 誤紅三次（#407、#415、#412）同一根因：Azure apt 鏡像站 44 kB/s，`playwright install --with-deps` 裝字型 10 分鐘，e2e job 15 分鐘上限取消；各重跑一次即綠。再發生就開小 PR 把 e2e `timeout-minutes` 15→25，波末記 friction-log。#414 rebase（重複的 #405 commit 自動去掉，本機 check 綠，3594ff9）與 #404 rebase（5629ff8，守衛三綠）同時推上去跑 CI，先綠先合、另一支再 rebase 一次 | #414／#404 CI → 轉 ready → 合；業主 production 核准仍未回 |
| 10/27 22:20 | **停車 PR 全部合進 develop**：#404（8266e11，轉 ready 後合）→ #414 再 rebase 一次（228902a）綠 → 合（ae61955）。develop 現含 10/28 第二次晉升全部內容：og+lang、容量 hotfix、告警 LINE、PayUni 查詢告警、邀請 follow-up、P1a 後端清理、品牌 icon+SEO 基礎。業主 19:10 問 develop 預覽與 Email 邀請：裁決照原規劃（正式站實寄核對後才開旗標，develop 不另設） | 業主核准 production → /health；第二次晉升 PR 待業主 §7 第 5–12 步完成後開 |
| 10/27 19:18 | **業主核准 production 部署，`/health` sha=b4f9bb3 對上**（payuniMode=sandbox、referralInviteConfigured=false 為預期：第 6、7 步未做；defaultReferrer=ok）。§7 第 5 步 ✅。已給第 6–8 步逐步指示（模板 raw 連結、兩把 secret、PayUni 三把＋SANDBOX=false、清三 bucket） | 業主回報第 6 步 → curl 看 referralInvite 兩旗標 |
| 10/27 19:35 | 業主看了邀請信模板：要簡化、版型對齊驗證碼信、問「兩個按鈕」（Dashboard 預覽不處理 `{{ if }}/{{ else }}` 兩分支都顯示，實寄只一個）。裁決 25（告知段縮小字、不刪）。派 R2 前端 session 開 `fix/referral-invite-email-restyle`。§7 第 6 步的貼模板改為等新版合進 main 後做；兩把 secret 與第 7、8 步不受影響 | 業主做第 6 步 secret、第 7、8 步；模板 PR 回報 |
| 10/27 20:05 | 邀請信改版 PR #416（c9c8ff6）CI 綠 → 轉 ready → 合進 develop。四條小偏離（告知小字 #6b6b75、© 不帶年份、拿掉 24 小時一封句、拿掉純文字網址段）接受。新版模板隨第二次晉升上 main 後業主再貼（正式站與 develop 各一次） | 業主第 6 步 secret、第 7、8 步 |
| 10/27 20:10 | 業主第 6 步兩把 secret 完成，`/health` referralInviteConfigured／Enabled 皆 true。裁決 26（PayUni 最後切）、27（第二次晉升今晚）。**開晉升 PR #417**（develop 3392d05 → main，無 migration，9 支 PR）；journey-full 約 25 分鐘。#415 等 #417 合進 main 後才合 | #417 綠 → 合 → 業主核准 production → 貼新版模板；業主同時做第 8 步清 bucket |
| 10/27 21:40–22:05 | #417 journey-full（真後端 18 分鐘）**綠**；e2e-tests 第 5 次被慢 apt 鏡像站拖過 15 分鐘上限取消；run 40510447867 卡在 in_progress，rerun／cancel 皆 403／409。另發現 develop push 3392d05 的 CI 同因紅 → develop 的 Edge Function 停在 ae61955（#416 無後端變動，無影響）。裁決 28 → 開 #418（ci.yml e2e timeout 25，check-workflows OK） | #418 綠 → 合 → #417 新 head CI（journey 重跑）→ 合 → 核准 production |
| 10/27 22:16 | 卡住的 run 14:08Z 自己收尾 → 重跑 e2e（這次鏡像站正常，7 分鐘綠）→ ci-ok 綠 → **#417 合進 main（f076866）**，journey 不必重跑；#418 同時綠 → 合進 develop（77efb63）。第二次晉升完成，等業主核准 production 部署 | 業主核准 → /health sha=f076866 → 貼新版 Invite 模板 → 第 8 步 |
| 10/27 22:45–23:20 | 業主核准 production，`/health` sha=f076866 對上（referralInvite 兩旗標 true、PayUni sandbox）；新版 Invite 模板已貼。裁決 29、30。通知 P1a session 準備 PR 2 循環清單、等業主 /tdd-implement。今晚收工；10/28 順序：PR 2 → 第三次晉升 → 清 bucket／清資料 → 註冊＋admin → R2 實寄 → 旗標 → PayUni 切正式 → 真付款 → 宣布 | 業主 10/28 早上到 P1a session 打 /tdd-implement |
| 10/27 23:30–10/28 00:25 | 業主在 Cloudflare 設 Production 變數並 Retry 兩次，正式站仍是分享選單；pages.dev 預覽網址登不進（Auth 回跳綁 uknow.com.tw，不追）。以主檔 hash 核對：正式站 `index-CWyrVOvQ.js` ＝ 本機**無旗標**建置 → 儀表板變數沒進建置。裁決 31 → 主 session 開 `fix/email-invite-flag-in-git`（`.env.production` ＋ checklist 措辭）。#415 api-tests 重跑綠。P1a 於 2-2 卡住：分類器拒絕「轉述的核准」移除 tdd-lock，業主已親自在該 session 貼授權句 | fix PR CI 綠 → 合進 develop；P1a 續 2-2 綠燈→2-3；第三次晉升等 PR 2 |
| 10/28 00:30–00:45 | #419 CI 綠 → 轉 ready → **合進 develop（53dd585）**；旗標隨第三次晉升上 main。P1a 經業主親貼授權後解鎖：紅燈修正 `e04a0824`、實作還原 29 測試綠，續 2-2 綠燈 commit。波末 8 條摩擦寫進 friction-log（95557df）。§4 乾跑唯讀計數先跑一次做基準（見 todo #3：無真匯款、completed 13 單皆 sandbox 金額） | P1a 2-3…2-6；10/28 下午審 PR 2；業主清 bucket 後重跑乾跑 |
| 10/28 00:45–01:10 | P1a 回報 2-1～2-4a 全綠、2-4b 實作完（wip 94dd83c7）卡 3 個測試（既有 `fillCompleteForm` 走舊流程、新 describe 缺 cleanup）；主 session 審過核准修法（mock `useListingPhotos` 三張 done＋`afterEach(cleanup)`）。業主問「為何 P1a 常要我回應」：TDD 守衛要人裁決紅燈測試修正（裁決已由主 session 代行）＋分類器只認業主親打的解鎖授權；業主選擇在 P1a 貼一次**概括授權**（PR 2 剩餘循環，主 session 轉來的核准視同本人）。用 P1a 的介面摘要開 2-5 e2e session（Sonnet） | P1a 2-4b 綠 → 2-6；e2e PR 綠 → P1a fast-forward；10/28 下午審 PR 2 |
| 10/28 01:15–01:20 | 業主在 P1a 貼概括授權，P1a 2-4b 綠燈 head 18a83944。首開的 e2e session 容器沒有 repo（create_session 未帶 source_url，add_repo 被分類器擋）→ 封存，重開 session_01MQovbErnhEXgHjQQjw9XvG 帶 `source_url`＋`source_revision=feature/listing-photo-pipeline`。教訓記 friction-log：create_session 一律帶 source_url | P1a 2-6；e2e PR |
| 10/28 01:25–01:35 | e2e session 本機綠（page object 新流程、真 JPEG fixture、375px、上傳失敗重試），journey 共用 page object 免改；發現驗收 14 做不到：失敗的 module fetch 依 HTML 規格被記成 null，同 URL 原地重試永遠失敗。主 session 裁決：失敗面板改「請重新整理頁面」＋按鈕「重新整理頁面」→ `location.reload()`，不自動重載、不套 `importWithRetry`（會無預警清掉表單）；P1a 走小紅綠循環改，e2e 情境 14 改為重載後重走流程。遺留第 2 波：`lazyWithRetry` 的重試一次同因無效、Create／Edit 無草稿保存 | P1a 改完傳 head 給 e2e；e2e 開 draft PR |
| 10/28 01:35–01:50 | P1a 自跑四視角實作審查：0 P0、約 8 P1（返回鍵時序、送出鈕原因、封面播報、對話框焦點、單一 live region、手機摺線、上傳逾時、bitmap 釋放）＋2 測試缺口＋jsdom `createObjectURL` 防呆；主 session 核准返回鍵改「對話框佇列期間常駐」並改寫兩個紅燈（概括授權）。P1a 推新 head 8831f9d。e2e session 開 **#420**（base P1a 分支，head f9ad041）：18 情境本機綠、tools/ 89 綠；偏離：fixture 改 192×64 三色帶、情境 14 照裁決 | #420 CI 綠 → P1a fast-forward；P1a 修完 P1 開 PR 2 → 主 session 審 |
| 10/28 01:50–01:55 | 發現 ci.yml 只對 base main／develop 觸發，#420（base feature 分支）不會有 CI → 改流程：P1a 直接 ff 併入 e2e commit，e2e 由 PR 2 的 CI 驗；已通知兩個 session | P1a 併入後開 PR 2 |
| 10/28 02:05–02:40 | **PR 2 = #421**（head 由 b3c12932 → ef49434 → 050b8fa5：守門修正——file input I2 啟發式、canvas 白底色值列掃描排除）。主 session 四視角審查（Sonnet 四 lane，worktree wt-421）：0 P0；必修 ≈16 條已核實後分三批轉給 P1a——系統：decode 回 bitmap 實際尺寸、adjust 重解失敗偏離補記＋播報、晚到 bitmap 釋放；UI/UX：**返回鍵在佇列第二張起失效會離頁**（常駐改法的新問題，走紅綠）、載入失敗文案死路、NETWORK_ERROR 英文原文、重試後焦點、重複失敗不播報；需求：規格書 §14 第 14 列過時、PR 內文綠燈 hash、兩個空轉測試；架構：Edit diff 刪偏離補記、懸空 plan 連結、死碼、60 秒只寫一份。約 20 條 P2 記第 2 波。#415 api-tests 再中映像限流，重跑一次 | P1a 修完推 → CI 綠 → 主 session 抽查 U1 → 轉 ready → 合 develop → 開第三次晉升 |
| 10/28 02:40 | 業主補裁決 32（刊登卡版式對齊推薦卡、拿掉會籍至、跟第三次晉升）。P1a 推 36f946a（守門＋系統視角三項）。開刊登卡 Sonnet session | P1a 其餘三批；刊登卡 PR；#415 CI |
| 10/28 02:45 | 業主休息 6 小時，裁決 33：主 session 自主推進到合進 main，production 核准留給業主醒來按；之後業主手動測一輪再清資料、切 PayUni | #421 三批修補 → 審 → 合；刊登卡 PR → 審 → 合；#415 合；開第三次晉升 PR → 合 main |
| 10/28 02:45–03:15 | P1a 三批修補完成（head a584f0d：U1 返回鍵紅 dfd0c4c8→綠 85749d4、U2–U6、R1–R3、A1–A4），主 session 抽查返回鍵 hook 正確；a584f0d CI 全綠（含 e2e 新情境）。刊登卡 **#422**（紅 87f5bb2→綠 f4fa795）主 session 審過、CI 綠 → **合進 develop（0146f8a）**，session 封存。#421 由主 session rebase 到 0146f8a → head ab2d09a，等 CI。#421 36f946a 那輪 api-tests 映像限流（今晚第三次）已留 PR 說明 | #421 CI 綠 → 合；#415 rebase → 合；開第三次晉升 PR |
| 10/28 03:15–03:35 | #421 rebase 後 head ab2d09a CI 全綠 → 轉 ready → **合進 develop（e0b286f）**，P1a 收工。develop 現含 #419 旗標、#422 刊登卡、#421 照片管線。主 session 開**第三次晉升 PR**（develop e0b286f → main）；#415 改為晉升後再合（docs，不擋上線） | 晉升 PR journey-full 綠 → 合進 main → 業主醒來核准 production |
| 10/28 03:35–04:05 | **#423 journey-full（真後端 26 分鐘）＋全軌綠 → 轉 ready → 合進 main（66c2cf0）**。正式站 Edge Function 部署在 GitHub `production` 環境等業主核准；Cloudflare 會自動建 main 的前端。#415 已 rebase（333dff6，CI 綠）等這則紀錄推上後再合。業主醒來清單見 §7 第 13 步 | 業主核准 production → `/health` sha=66c2cf0 → 手動測 → 清 bucket／清資料 → PayUni |
| 10/28 04:05–05:10 | 業主醒來在正式站實測，提出裁決 34、35（取景框填滿、縮圖叉叉／點縮圖調整／微調 4px）→ P1a 開 **#425**（紅 bcd4b7a7、f29aa302）→ 主 session 審 diff → CI 綠 → **合進 develop（98b9d95）**。業主另一 session 合入 **#424**（e2e 改跑官方 Playwright image，develop CI 綠 11 分鐘）。#415 的 api-tests 兩度映像限流＋job 20 分鐘上限（supabase start 17 分鐘），改 rebase 到新 develop 重跑。開**第四次晉升 PR**（develop 98b9d95 → main，含 #424、#425） | 第四次晉升 journey-full 綠 → 合 main → 業主核准 production（核准最新那筆）；#415 晉升後再合 |
| 10/28 05:10–05:40 | **#426 journey-full 綠（26 分鐘）＋全軌綠 → 合進 main（8b1b8abf）**；正式站 Edge Function 部署 run 40588572586 停在 `production` 等核准（workflow_run 觸發的 run 在 API 上顯示的 head 是預設分支 develop，不是 main——找 run 看建立時間緊跟 main 的 CI push run）。#415 合進 develop（21707dc），session 分支重切自 develop。發現 be05672f 把 worktree 的 `node_modules` 符號連結 commit 進 develop（已隨晉升進 main，無害但是垃圾）：本 PR `git rm` 並把 `.gitignore` 改成 `node_modules`（去斜線），friction-log 記了。第 2 波 friction 補兩條：api-tests job 20 分鐘上限（`supabase start` 拉映像 17 分鐘）、#424 後 e2e 11 分鐘 | 業主核准 production → `/health` sha 開頭 8b1b8ab → §7 第 13 步手動測 → 清 bucket／清資料（§4）→ 註冊＋set-self-admin → PayUni 切正式 |
| 10/28 05:40–06:10 | #428（docs）e2e 紅：**pytest 9.2.0 於 05:30 發布改名 `_arg2fixturedefs`，pytest-bdd 9.0.0 整套炸掉**，develop 自己的 push run 同時紅 → 開 **#429**（`pytest>=8.0,<9.2`），同 commit 搬進 #428。業主實測詳情頁提出**裁決 36**（正方形＋Instagram 式滑動、無縮圖）→ 開 Sonnet 執行 session `session_01MQovbCBPJ46qTpVQvhbuA5`（`fix/listing-photo-carousel`） | #429 綠 → 合 develop；#428 綠 → 合；輪播 PR → 審 → 合 → 第五次晉升（含 #429 pin） |
| 10/28 06:10–06:40 | #428、#429 CI 綠 → **#428 合進 develop（9b4694b，含 pytest pin）**，#429 重複關閉。業主裁決 37（邀請卡置中＋viewport）→ 主 session 依 ≤10 行例外自己改（`fix/invite-card-center`：1 個 class、1 個 meta）。詳情輪播 session 施工中 | 置中 PR CI 綠 → 合；輪播 PR → 審 → 合 → 第五次晉升 |
| 10/28 06:40–07:40 | #431 置中合進 develop（0610210）。輪播 session 回報 **#430**（紅燈 0899732，自審 P1 兩項已修：圓點 44px 熱區、0 張 fallback）→ 主 session 審 diff 無 P0／P1 → 合進 develop（c1b462f）。開**第五次晉升 PR #432**（develop c1b462f → main）→ journey-full 20 分鐘綠＋全軌綠 → **合進 main（d21f6ca）**。正式站 Edge Function 部署等業主核准（找建立時間緊跟 main CI push run 的那筆） | 業主核准 production → `/health` sha 開頭 d21f6ca → 正式站看輪播、邀請卡置中 → 清 bucket／清資料 → PayUni |
| 10/28 07:40–08:45 | 業主手測 OK；確認簽名存 `referral-signatures`、身分證存 `id-cards`（提領時才有）；業主清空三個 bucket 並刪兩個舊遺留 bucket。裁決 38 → Sonnet session `session_01MQovbBMcgZg4iWLZEghRDN` 開 **#434**（migration `20261028000001` 建 `listings-photos`＋常數換名）。**08:10 清資料**：乾跑（帳號 20、刊登 7、訂單 28／完成 14 全 sandbox、真匯款 0、Storage 0、reconcile 無進行中 run）→ 業主確認 → 單一交易執行 §4 刪除段 → 零殘留全 0、`referral_code_seq` 8048876／is_called false、`reward_config` 8048876 未動。#434 審過合 develop（62dcf8c）→ **第六次晉升 #435 journey-full 綠 → 合進 main（88a677d）** | 業主核准 production → `/health` → 刪舊 bucket → 註冊＋set-self-admin → PayUni 切正式 → 真付款 |
| 10/28 08:45–18:50 | 業主核准 88a677d 部署、刪舊 bucket。PayUni 第一次真付款失敗：原商店「網路商店停用」回 `DEF01006 商店狀態不符合`（兩筆 failed）；業主換成啟用中的新商店並重設 Secrets、後台 Notify／Return URL 指向後端。**16:48 第一筆真付款成功**（1,200，訂閱至 2027-10-27，推薦碼 8048876＝預設推薦人）。成功頁顯示收單行 → 裁決 39 → Sonnet session `session_01MQovbAfjpYTNuVLdi9WDs9` 走 `/fix-bug` 開 **#438**（紅 cc8ec42）→ 審過合 develop（eb2eafe）→ 第七次晉升 **#439**。#437（`EXPECT_PRODUCTION_PAYUNI=true`）合 develop。期間依業主指示刪掉一個測試帳號（pending 單一併）。**#439 journey-full 兩次（含唯一一次重跑）都在部署拋棄式分支時被 Supabase API 打包服務撞 jsr.io 逾時擋住**，pytest 沒跑；Supabase Preview 整合同樣 `failed to bundle`。業主裁決：管理員繞過 ruleset 合併（純前端修正、後端與線上相同）。PayUni 商店級錯誤沒有 LINE 告警 → 記 §6 | 見下一列 |
| 10/28 18:50–19:30 | docs **#440**（裁決 39、§8、§6、checklist ReturnURL、friction-log）合 develop（6a5735b）→ #439 head 更新自動重跑，**Supabase 打包服務已恢復，journey-full 整場綠**（19:24）→ 不必繞過，主 session 以 merge commit 正常合併 **#439 → main 52039ca**（19:28）。main CI push run 綠；deploy-supabase run 323 停在 `production` 核准 | 業主核准 52039ca 部署（這次多驗 `EXPECT_PRODUCTION_PAYUNI`）→ `/health` sha 對上 → 管理員宣告（is_admin 仍 0）、加入推薦計畫、建第一個刊登 → 宣布開放 |
| 10/29 12:18 量測 #1 | 排程 trig_01KmMD7RYZFDjNiLWHrNDhx3 前 6 次觸發（10/29 00:20–10:18）都在主 session 讀完提示後被 worker 重啟打斷，沒跑到 SQL；這次是第一筆真量測。§5 第 1 項：24 小時內註冊 5、驗證 5（100%，每小時 1 人，無斷崖）；第 3 項：profiles 6 人全在 step 3（已付款）；第 4 項：24 小時訂單 completed 6、failed 1（10/28 16 時那筆商店停用），卡住 pending 0、pending 但 PayUni SUCCESS 0；第 5 項：未解決告警 0；第 6 項：check-email 近 15 分鐘 1 桶、無打滿、unknown 桶 0；第 9 項：R2 邀請 0、逾期未驗證 0。另看：is_admin 2（管理員已宣告）、加入推薦計畫 5、active 推薦碼 6、刊登 2。第 2 項（寄信比）略過——5 人全數完成驗證；第 7 項 `/health` 本容器打不到，以 10/28 20:42 部署煙霧測試為準；第 8 項客服回報 0 | 無異常，不打擾業主；下次 14:18 |
| 10/29 12:20–12:50 | 業主回報正式站成功頁仍顯示「信用卡銀行」。查證：main 52039ca 程式正確、後端已上線，但 **Cloudflare Pages 的 main 52039ca Production 建置在 10/28 19:28 於 clone repo 階段失敗**（`RPC failed; curl 16 Error in the HTTP2 framing layer`／`early EOF`，拉 5 分 19 秒放棄，build 未開始），正式站停在 88a677d 整整 18 小時，**沒有任何管道通知**（deploy-smoke 只驗資產完整不驗版本；GitHub 收不到 Cloudflare 的部署事件）。主 session 用一次性 workflow（`claude/diag-prod-bundle`）從 runner 抓線上 bundle 比對：正式站 `index-C_LWZwJ9.js` 含「信用卡銀行」1 次＝本機建 88a677d 的檔名；develop 預覽 0 次。業主 Retry deployment → 12:46 Production 轉綠 52039ca | 重抓線上 bundle 確認歸零 → 刪診斷分支 → §6 記「正式站前端部署失敗零訊號」 |
| 10/29 22:45 量測 #2 | 14:17／16:17／18:17／20:17 四次觸發又被 worker 重啟打斷，22:17 這次延遲 28 分才跑到。§5 第 1 項：24 小時內註冊 7、驗證 7（100%）；第 3 項：profiles 10 人全在 step 3；第 4 項：24 小時訂單 completed 7、無 failed，累計 13 筆／completed 10，卡住 pending 0、pending 但 SUCCESS 0；第 5 項：未解決告警 0；第 6 項：check-email 近 15 分鐘 0 桶；第 9 項：R2 邀請 0。另看：is_admin 2、加入推薦計畫 9／10、active 推薦碼 10、刊登 7（業主已建）。第 2、7、8 項同 #1 | 無異常，不打擾業主。排程觸發被 worker 重啟吃掉的比率太高（10 次只跑成 2 次），記 friction-log |

**執行 session 名冊**（主 session 維護）

| 工項 | session | 模型 | 分支 | PR | 狀態 |
|---|---|---|---|---|---|
| R2 前端 | `session_01MQovbDDZ3ai3vEKXRrHPEe` | Opus | `feature/referral-email-invite` → `fix/invite-expired-notice` | #409 ✅、#412 ✅ 已合併 | 收工 |
| R1a-2 og＋lang | `session_01MQovbEo7gaDGV4zL74C89U` | Sonnet | `fix/og-preview-lang` | #405 ✅ 已合併 | 收工 |
| P1a | `session_01MQovbCmtDUFsDFhE3Ei39S` | Sonnet | `feature/listing-photo-pipeline` | #404 ✅（PR 1）；**#421 ✅ 03:30 合進 develop（PR 2）**，收工：2-1 95fbf626→3e224b45、2-2 50d840fc→65bf76c4（替身修正 e13bda5d）、2-3 8813f249→c37483c1、2-4a aae5adce→37870890（測試修正 b68da1b0）、2-4b 紅 db928aae、wip 94dd83c7 | 收工；#425（裁決 34、35）亦由此 session 完成，留著不封存以接照片管線回饋 |
| P1a-e2e | `session_01MQovbErnhEXgHjQQjw9XvG`（首開 `…EJErP6…` 未帶 repo，已封存） | Sonnet | `feature/listing-photo-pipeline-e2e`（PR base 是 P1a 分支） | 2-5 e2e／journey 同步，10/28 00:50 開 | PR 綠 → P1a fast-forward 進自己分支 |
| 刊登卡 | `session_01MQovbBaaYSmpxZoDwfmXj2` | Sonnet | `fix/member-center-listing-card` | 裁決 32；#422 ✅ 03:10 合進 develop，session 已封存 | — |
| 詳情輪播 | `session_01MQovbCBPJ46qTpVQvhbuA5` | Sonnet | `fix/listing-photo-carousel` | 裁決 36；#430 ✅ 07:15 合進 develop，隨第五次晉升上 main | 收工，留著接正式站回饋 |
| 告警送到人 | `session_01MQovbAiZV42jJLPRAqLhY5` | Sonnet | `fix/ops-alert-routing` | #406 ✅ 已合併 | 收工 |
| 容量 hotfix（寄信告警依裁決 16 不做） | `session_01MQovbDWjfcnq21M6T5cDBf` → 交棒 `session_01MQovbEHzitj2bAVNdriREc` | Sonnet → Opus | `fix/peak-capacity-hotfix` | #410 ✅ 已合併 | 收工 |
| #395 | `session_01MQovbEHzitj2bAVNdriREc` | Opus | `fix/payuni-query-alert` | #407 ✅ 已合併 | 收工（#395 方向 3 sandbox 實打留 issue） |
| R2 後端（收工） | `session_015dFtMVsyqYU5gijDBa6yCp` | Opus | — | #399 ✅ | 已合併，可封存 |

**醒來後待辦**（主 session 維護；業主 10:15 起照順序做，做完刪該列）

| # | 事 | 狀態 |
|---|---|---|
| 1 | ~~核准 production 部署~~ 19:18 完成，sha 對上 | ✅ |
| 2 | §7 第 6–8 步：~~備份確認、寄信上限 600、SMTP 確認、R2 兩把 secret、新版模板與主旨~~ ✅；清三個 bucket 與 PayUni 正式依裁決 29 於 10/28 晚 PR 2 上線後做 | ◐ |
| 3 | ~~清資料乾跑確認~~ 10/28 08:10 已執行，零殘留全 0（§8） | ✅ |
| 10 | ~~審 #404、親打 /tdd-implement~~ 16:40 已做 | ✅ |
| 4 | ~~LINE channel 與兩把 Secret~~ 17:05 完成（Email 通道的 `ALERT_SMTP_*` 依 #406 最小版不做，留第 2 波） | ✅ |
| 5 | ~~是否允許排程任務~~ 已裁決允許（§0 第 13 題） | ✅ |
| 8 | ~~核准建拋棄式分支~~ 業主自己在 Dashboard 開了、演練完成 | ✅ |
| 12 | ~~8b1b8abf、d21f6ca、88a677d~~ 已核准、舊 bucket 已刪；**再核准一次：main 52039ca（第七次晉升，純前端＋部署閘門驗 PayUni 正式模式）** → `/health` 綠 → 再建刊登 | ◐ |
| 9 | 雲端環境 setup script 預裝 deno 與 supabase CLI：session 標題列的雲端環境選單 → Edit → Setup script，加 `curl -fsSL https://deno.land/install.sh \| sh && export PATH=$HOME/.deno/bin:$PATH` 與 `npm install -g supabase`（setup script 不受 auto-mode 分類器限制；今天三個執行 session 都因容器無 deno 而被 pre-commit 擋下或得交棒）。新 session 才會生效 | ⬜ |
| 7 | ~~手動封存兩個空 session~~ | ✅ |
| 6 | ~~寄信上限與 SMTP 確認~~ 17:05 完成 | ✅ |
| 11 | 第 2 波：修 journey harness `payuni_sandbox_page.py` 配合 PayUni sandbox 新表單（或向 PayUni 確認改版），11/03 前把 ci.yml journey-full 改回 `sandbox`（規則 13 到期會自動紅） | ⬜ |
