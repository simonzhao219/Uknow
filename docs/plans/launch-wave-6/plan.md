# 第 6 波：批次自癒互鎖＋結帳頁錯誤分支＋後台推薦樹（11/22 收件）

<!-- plans-keep: 跨 session 鷹架（第 6 波主／執行／審查 session 的共同事實來源）；退場條件＝第 6 波審查 session 結案後，值得長留的升級進規格書／friction-log，其餘隨 commit 刪除 -->

寫給**本波任何新開的 session**：開局只有 repo 和這份檔，沒有對話記憶。三種 session 的分工與凍結規則見 `docs/README.md`〈慣例〉；
派工 prompt 在同目錄的 `dispatch-prompts.md`。主 session 是 `session_01MQovbB1d9N9q9cZsGnZ1Wh`，分支 `claude/uknow-wave-6-lead-xb4hqg`。
行號一律現算。第 5 波主 session 寫的交接原文：`git show 7fc07d0:docs/plans/launch-wave-6/plan.md`。

## 0. 上游與裁決

**上游**

- `docs/plans/launch-wave-5/plan.md`：§0 裁決 W5-1～73（仍有效）、§4 晉升清單（含 W5-62）、§5 候選、§8 進度。
- `docs/plans/launch-wave-5/review.md`：R5（P0 0／P1 0／P2 9）。§1.3 P2 表、§5 待辦、§6.3 候選補遺；§6.1／6.2 升級表是
  `launch-wave-5/` 退場依據（由本波 R6 執行）。第 4 波稽核原文 `git show 3a7f506:docs/plans/launch-wave-4/audit-*.md`。
- `docs/plans/friction-log.md` 的 2026-11-07 節。

**開局現況**（11/08 台北）

- main＝`f5a1ed8`（第 5 波晉升 #516）；develop＝`7fc07d0`（#518 第 5 波收尾紀錄已合）。
- **照片清理首輪 dryRun＝true**（主 session 唯讀查正式站 `scheduled_job_runs` id 11，2026-11-07 19:17 UTC，pg_cron，succeeded；
  `totalObjects 45`、`orphanTotal 0`、`candidateCount 0`、`removed 0`）。代表正式站 Edge 讀到的 `PHOTO_PURGE_LIVE` 不是 `true`
  （`listing-photos.ts` 的 pg_cron 路徑：`env('PHOTO_PURGE_LIVE') !== 'true'` 就 dry-run）。這輪本來就沒有孤兒照片，影響為零。→ W6-4。
- 正式站 `listings` 15 筆，`districts` 含「南鄉」0 筆、含「南州鄉」0 筆（S5 預查）。
- 正式站會員 24、`referral_pair_history` 18 列（S3 規模參考）。
- open issue：#467、#395、#384、#383。

**目標**：S1、S2、S3a、S5 四項全部合進 develop 就晉升。S3b、S4、S6 有完成才上，沒完成順延第 7 波；S7 留候選。
收件截止 11/22（日）22:00。

**裁決（AskUserQuestion，業主 2026-11-08）**

| # | 題 | 裁決 |
|---|---|---|
| W6-1 | 本波範圍 | **S1、S2、S3、S5 必上**；S4、S6 有完成才上；S7 留候選（被推翻：S1～S6 全必上；只做 S1＋S2＋S3；S1～S7 全必上）。S3 依 W6-6 拆成 S3a（必上）／S3b（看進度） |
| W6-2 | 派工順序 | **首批四個並行**：S1 規劃（Opus）、S3 規劃（Opus）、S2、S5（Sonnet `/fix-bug`）。S4 等首批有一支合併後開；S6 等 S1 合併後開（同碰批次自癒／0d 換線的 migration 函式）（被推翻：全部同時開；一次一項） |
| W6-3 | 晉升時點 | **必上全合就晉升，11/22（日）22:00 收件**，沒合的順延第 7 波（被推翻：11/29；不設截止） |
| W6-4 | 照片清理 dryRun＝true | **業主用手機補設正式站 Edge Secret `PHOTO_PURGE_LIVE=true`**；GitHub repo variable `PHOTO_PURGE_LIVE` 也須為 `true`（不一致會推 LINE P2）。主 session 看下一輪 19:17 UTC 的 `summary.dryRun`（被推翻：已設過請再查；維持 dry-run） |
| W6-5 | W5-70 推薦樹需求 | **節點欄位**：身分與會籍（姓名、推薦碼、第幾代、會籍狀態、到期日、推薦計畫與否）＋**加入推薦計畫的時間**、獎金與點數（各代獲得、餘額、累計）、任務與提領（進度、審核中／已匯款）、換線紀錄（`referral_pair_history`）——全選。**查帳情境**：某筆付款獎金有沒有發對、某會員的整條線、提領前核對點數來源、會員來問為什麼沒獎金——全選。**大樹瀏覽**：搜尋＋逐層展開（被推翻：加匯出 CSV；一次展開整棵）。**自動標異常**：付款未發獎、成環與自領、點數對不上帳（未選：先不要標） |
| W6-6 | W5-70 分段 | **切兩段、同一份規劃書、兩支 PR**。S3a（必上）：樹＋搜尋逐層展開＋全部節點欄位＋付款查三代獎金＋換線紀錄＋標「付款未發獎」「成環／自領」。S3b（看進度）：點數對帳（餘額 ≠ 獲得 − 提領）＋點數來源明細（被推翻：一支做完全部必上；S3b 延第 7 波） |
| W6-7 | W5-70 預設入口 | **搜尋會員看整條線**：預設畫面是搜尋框＋頂層樹，其他情境都從「先找到一個人」進入（被推翻：異常清單；依訂單查獎金） |

**主 session 定的**

| # | 題 | 定案 |
|---|---|---|
| W6-8 | S1 併入範圍 | R5 P2-7（summary 加 `unknownByReason`）、P2-8（heal 摘要寫進帳本 summary＝pay P2-14）、P2-9（`invoke_internal_endpoint` 加 `p_trigger text default 'pg_cron'`）**全併 S1**：同在 `reconcile-handler.ts`／`scheduled_job_runs` 一區，拆開會三支 PR 互相 rebase。P2-9 上線前，人工乙段驗證照 R5 建議在 §8 註明「此列是人工驗證」 |
| W6-9 | S5 資料轉換 | 正式站 0 筆含「南鄉」，migration 仍要寫（develop 與日後資料），以 `array_replace` 冪等轉換；不需要停機或業主核准窗口 |

## 1. 時程

| 時點（台北） | 事 |
|---|---|
| 11/08 | 本檔落檔；開 S1 規劃、S3 規劃（Opus）、S2、S5（Sonnet） |
| 業主時間 | 審 S1、S3 規劃與 `/review-plan` 報告 → 在各自 session 親打 `/tdd-implement <slug>` |
| 首批第一支合併後 | 開 S4（Sonnet，三段式） |
| S1 合併後 | 開 S6 規劃（Opus） |
| **11/22（日）22:00** | 收件截止：沒合進 develop 的順延第 7 波 |
| 必上四項合併後 | 開晉升 PR（develop→main，標題 `chore(release): 晉升 develop → main——第 6 波`）→ journey-full 綠 → merge commit → W5-62 確認 migration 已套 → 業主核准 `production` → `/health` sha 對上 |
| 晉升後 24～48 小時 | 主 session 跑上線後現場查詢（W4-26） |
| 晉升後 | 開 R6 第 6 波審查 session（兼做 `launch-wave-5/` 退場，依 R5 §6） |

## 2. 工作分解

在途上限：**程式碼工項同時最多 3 個**；三段式工項在規劃期不佔名額，進實作才佔。

| ID | 工項 | 流程／分支 | 模型 | 主要動到 | 撞檔 |
|---|---|---|---|---|---|
| S1 | **批次自癒與線上付款互鎖**（W5-72、R5 P2-5）：批次自癒改每筆獨立交易，或每筆結束後不再持本人列鎖；`pay_referral_generations` 遇 40P01／40001 改寫 error 告警（推得到 LINE）。併 W6-8：P2-7、P2-8、P2-9 | 三段式，`feature/batch-heal-lock-split` | Opus | 新 migration（`complete_paid_pending_orders`、`pay_referral_generations`、`invoke_internal_endpoint`）、`reconcile-handler.ts`、`index.ts` 對帳段、`supabase/README.md` | 與 S6 同碰 `20261113000003` 的函式 → S6 等 S1 合併 |
| S2 | **結帳頁送單錯誤分支**（W5-71、R5 P2-1～4）：自己的碼／碼失效 400 改欄位 invalid＋聚焦（比照 `CompleteProfile.tsx`）、後端 validate 帶 token 時擋本人；非 JSON／斷網一律友善文案；「已有有效訂閱」重抓會員資料後導 `/dashboard`；新約確認框 `AlertDialogContent` 加 `privateClass()` 並列入 `SENSITIVE_PORTALS` | `/fix-bug`，`fix/checkout-submit-errors` | Sonnet | `PaymentCheckout.tsx`、`index.ts`（`/referrals/validate`）、`analyticsConfig.ts` | `index.ts` 只動 validate 一段 |
| S3a | **後台推薦樹＋查帳資訊（第一段）**（W5-70、W6-5～7） | 三段式，`feature/admin-referral-tree`（S3a、S3b 共用一份規劃書） | Opus | 新 `/admin/referral-tree*` 端點、新 admin 元件、`AdminConsole.tsx`、規格書後台段 | 與 S2 都動 `index.ts`，不同區 |
| S3b | **推薦樹第二段**：點數對帳（餘額 ≠ 獲得 − 提領）＋點數來源明細 | 同上規劃書，第二支 PR | Opus | 同上 | S3a 合併後 |
| S4 | **換篇過場動畫**（W5-69），併 S7（#509）P2 五項：reduced-motion 未併 `motionPreference`、抽 hook、手勢 chunk 缺 error boundary、slide-in、手勢起點 | 三段式，`feature/listing-swipe-transition` | Sonnet | `ServiceProviderDetail.tsx`、`listing/*`、`docs/ui-ux-guidelines.md` | 純前端 |
| S5 | **屏東「南鄉」→「南州鄉」**（W5-65、W6-9）：`TAIWAN_REGIONS` 改名、migration 冪等轉換 `listings.districts`、`districtCentroids.ts` 別名拿掉 | `/fix-bug`，`fix/nanzhou-township` | Sonnet | `src/utils/constants.ts`、`districtCentroids.ts`（含產生腳本別名表）、新 migration | 無 |
| S6 | **新約與部署收尾**：確認框第三態「預設推薦人即現任」（W5-63）；0d 驗單上的碼（R5 P2-6）；drop 三參數版 `prepare_payment_order`；`deploy-supabase.yml` 部署前自動確認 migration 已套（W5-62，上線後 §4 第 4a 步退場） | 三段式，`feature/renewal-deploy-closeout` | Opus | migration、`PaymentCheckout.tsx`、`deploy-supabase.yml` | S1 合併後才開 |
| R6 | 第 6 波審查；兼做 `launch-wave-5/` 退場（依 R5 §6） | 審查 session；報告 `docs/plans/launch-wave-6/review.md` | Opus | — | — |

主 session 自己做：本檔 §7、§8；審每支 PR（金流 PR 另派獨立 Opus 審查員）；合併後 dispatch 驗證；代跑唯讀 SQL；上線後現場查詢（W4-26）。

## 3. 執行環境須知（寫進每個派工 prompt）

`docs/README.md`〈慣例〉的「雲端 session 的執行環境須知」全部適用；`launch-wave-5/plan.md` §3 各條仍有效（合併後自動刪 head 分支、
commit 與 push 分兩次呼叫、一個分支只能由一方 rebase、子 session 不跑正式站 SQL、晉升 PR 開著時不合任何 PR、worker 常重啟、
裁決編號只由主 session 發、hash 以 PR 內文為準）。

## 4. 晉升清單（主 session）

沿用 `launch-wave-5/plan.md` §4 的 1、2、4a（W5-62）、6；S6 的 W5-62 自動化若本波上線，4a 改為看 workflow 步驟結果。
本波新增：S1 的 migration 套用後，正式站 `invoke_internal_endpoint` 有 `p_trigger` 參數；人工乙段帶 `'manual'`。

## 5. 第 7 波候選

以 `launch-wave-5/plan.md` §5 與 `review.md` §6.3 為準（本波已收的：W5-62／63／65／69／70／71／72、R5 P2-1～9）。另：S7 journey f70 缺章（W5-60）。

## 6. 業主待辦

| # | 事 | 狀態 |
|---|---|---|
| 1 | **W6-4**：正式站 Edge Secret 補設 `PHOTO_PURGE_LIVE=true`；確認 GitHub repo variable `PHOTO_PURGE_LIVE` 也是 `true` | 待做 |
| 2 | 審 S1、S3 規劃與 `/review-plan` 報告，通過後在各自 session 親打 `/tdd-implement` | 等規劃 |
| 3 | 實機確認（第 4 波起帶過來）：H1 邀請連結、`uknow.pages.dev` 導向、正式站實際登入一次 | 待回報 |
| 4 | PayUni 商店後台確認第一筆付款（11/03）發票已開立 | 待回報 |
| 5 | PostHog 專案端勾選回報、Network 面板抽看、`tel-national` 真機（R5 §2） | 待回報 |
| 6 | GitHub 設定補強（非必須）：Fork PR approval、develop environment reviewer | 待回報 |
| 7 | 晉升合進 main 後核准 `production` 部署 | 等晉升 |

## 7. 執行 session 名冊（主 session 維護）

| ID | session | 模型 | 分支 | PR | 狀態 |
|---|---|---|---|---|---|
| S1 | `session_01MQovbBq9dk32CFiREagU13` | Opus | `feature/batch-heal-lock-split` | —（規劃已推） | 規劃交件，等業主裁決 |
| S2 | `session_01MQovbE65NjXBrCYcNbkpbN` | Sonnet | `fix/checkout-submit-errors` | #522 ✅ e778f75 | 收工 |
| S3 | `session_01MQovbCWrpnXL42sUb5RfCx` | Opus | `feature/admin-referral-tree` | #521（規劃，draft） | 規劃交件，等業主裁決 |
| S5 | `session_01MQovbEEkWHJXdbQtSQf4iH` | Sonnet | `fix/nanzhou-township` | #520 ✅ ea6ff64 | 收工 |

## 8. 進度與異動紀錄（主 session 每次被事件喚醒記一列；hash 以 PR 內文為準）

| 時間（台北） | 事件 | 下一步 |
|---|---|---|
| 11/08 | 主 session 開局：讀交接、第 5 波 plan／review、〈慣例〉。正式站照片清理首輪 dryRun＝**true**（id 11，19:17 UTC，0 孤兒）→ W6-4。S5 預查：正式站 listings 含「南鄉」0 筆。業主裁 **W6-1～7**；主 session 定 W6-8、W6-9。本檔擴寫、落 `dispatch-prompts.md` | 開 S1、S2、S3、S5；業主補設 PHOTO_PURGE_LIVE |
| 11/08 09:15 | 開 #519（本檔，draft，已訂閱）。開 S1、S3（Opus，規劃）與 S2、S5（Sonnet，`/fix-bug`），tag `uknow-wave-6`；prompt 只放指標，正本是本分支的 `dispatch-prompts.md` | 等各 session 回報；S1、S3 規劃交業主審；業主補設 PHOTO_PURGE_LIVE（W6-4） |
| 11/08 09:35 | S5 交 **#520**：常數、座標表、產生腳本別名退場、migration `20261114000001`（array_replace）。主 session 審：無 P0／P1；P2：同列已含「南州鄉」會產生重複 → S5 改成 case＋array_remove。偏離：紅綠同 commit。CI 綠（Supabase Preview migration 成功）→ **#520 合進 develop（ea6ff64）** | — |
| 11/08 09:35 | S1 交規劃（`feature/batch-heal-lock-split`，/review-plan P0 0、P1 13、P2 15）：Edge 端逐筆呼叫單筆 RPC、舊批次函式留 wrapper；Q1～Q5 待業主。主 session 代跑正式站：pending＋PayUni SUCCESS 0 筆、近 30 天 system_alerts 0 列（不需人工補發） | 收業主裁決 |
| 11/08 09:35 | S3 交規劃（#521 draft，/review-plan P0 0、P1 16、P2 16）。發現：停權／到期／未加入推薦計畫現行照發獎金（只是不能提領）；「自領停發」在程式裡是成環停發；`referral_pair_history` 不是換線紀錄。Q1～Q5、Q8 待業主；Q6（S3a 不動發獎函式、等價測試）、Q7（admin-gate 自動列舉路由，順修 ops P2-4）主 session 同意 | 收業主裁決 |
| 11/08 09:50 | S2 交 **#522**：P2-1～4，同類掃描另修 `/auth/reset-registration` 的 `.json()` 容錯。主 session 審：無 P0／P1；P2：自己的碼應回專屬文案「不能使用自己的推薦碼」→ S2 已改。偏離：未走紅綠燈相位（PR 內文寫明）。CI 綠 → **#522 合進 develop（e778f75）**。首批已有合併 → 照 W6-2 開 **S4** | 等 S4 規劃；S1、S3 收業主裁決 |
