# 第 7 波：交接（第 6 波主 session 寫，2026-11-20）

<!-- plans-keep: 跨 session 鷹架（第 7 波主／執行／審查 session 的共同事實來源）；退場條件＝第 7 波審查 session 結案後，值得長留的升級進規格書／friction-log，其餘隨 commit 刪除 -->

寫給**全新的第 7 波主 session**：開局只有 repo 和這份檔，沒有對話記憶。本檔只是第 6 波主 session 的交接。
開局後請擴寫成本波完整的 plan（裁決表、工作分解、名冊、進度表），格式比照 `docs/plans/launch-wave-6/plan.md`。
三種 session 的分工、凍結規則、雲端執行環境須知在 `docs/README.md`〈慣例〉；派工 prompt 的共用開頭照抄
`docs/plans/launch-wave-6/dispatch-prompts.md`（把「第 6 波」「主 session id」「分支」換成本波的），再補本檔 §1。

## 0. 上游與現況

**要讀的上游檔**

- `docs/plans/launch-wave-6/plan.md`：§0 裁決 W6-1～38（仍有效）、§4 晉升清單（4a 人工核對保留＝W6-38）、§5 第 7 波候選（含〈承接第 5 波〉）、§8 進度（含上線後現場數字）。
- `docs/plans/launch-wave-6/review.md`：第 6 波審查 R6（P0 0／P1 1／P2 12）。§1.2 P1-1、§1.3 P2 表、§3.2 QUERY03001 工項、§5 待辦、§6 升級表（`launch-wave-6/` 退場依據，由本波審查 R7 執行）。
- `docs/plans/friction-log.md` 的第 6 波節（R6 寫）。
- 第 5 波原文：`git show 252ebc6:docs/plans/launch-wave-5/{plan,review}.md`；第 4 波稽核：`git show 3a7f506:docs/plans/launch-wave-4/audit-*.md`。

**現況**（2026-11-20 交接時）

- main＝`653e31e`（第 6 波晉升 #527，7 支程式 PR：#520 S5、#522 S2、#523 S4、#524 S1、#521 S3a、#525 S3b、#526 S6）；develop＝`f302284`（含 #519 紀錄、#528 R6）。
- 正式站部署 run 42534091645 成功：部署前「確認 migration 已套用」步驟（S6 新增）首次在正式站實跑通過、`/health` sha 比對過；乙段 pg_cron 與人工 `invoke_internal_endpoint('reconcile','manual')` 皆 succeeded。
- 上線後 9 天：reconcile 217 輪、purge-photos 9 輪全 succeeded；照片清理實刪已生效（W6-4 結案）；無 5xx。
- **PayUni 單筆查詢**：自 11/12 起每張 pending 單都回 `QUERY03001`（官方＝查無符合訂單資料）→ 4 張棄單被標 expired 並各推一則 error（W6-36 第 7 波處理）。**正式站查詢路徑從未有過一次成功樣本**（R6 §3.3 Q1），所以正控是第一步。
- PayUni sandbox `sandbox-api.payuni.com.tw/api/upp` 偶發 403（11/09、11/11、11/14），deploy-smoke 每次推 LINE [P1]、下一輪自癒（R6 P2-12）。
- 前端首屏預算：entry gzip 316.2／316.5 kB（W6-25 業主授權後的上限），**再動 entry 的 PR 幾乎必撞**。
- 開著的 PR：無。open issue：#467、#395、#384、#383。

## 1. 本波工項（交接時的建議，開局後要和業主確認）

| # | 工項 | 來源 | 建議模型／流程 | 備註 |
|---|---|---|---|---|
| S1 | **結帳頁導頁迴圈＋碼欄文案**：「已有有效訂閱」等三處導 `/dashboard` 前先 `ingestProfile`／`refreshUser`（測試要經 `RequireMembershipRoute`）；新約碼欄填自己的碼顯示專屬文案；keeps_same 的 placeholder／確認框改成與 keeps 同一句 | R6 P1-1、P2-2、P2-3 | Sonnet，`/fix-bug` | R6 建議第一批；不動金流 |
| S2 | **PayUni 查詢正控＋`QUERY03001` 改判**：①每日正控查一張正式站 completed 單（須 SUCCESS＋TradeStatus=1，失敗推 P1）②正控通過後 `QUERY03001`＝確認查無、滿 4 天靜默 expired、summary 另計 `notFound` ③已存 `payuni_response` 的單回 03001 仍寫 error；④deploy-smoke sandbox 403 單次不推 P1 | W6-36、R6 §3.2、P2-12 | Opus，`/fix-bug`（動對帳段） | 順序不能倒：正控先上線並看到成功樣本，才合 ② |
| S3 | **摺疊手機展開態與平板版面**＋**首頁卡片外框對齊** | 業主 11/09（截圖兩則，見 W6 plan §5） | Sonnet，三段式（UX） | 卡片初判：桌面 `ServiceProviderCard` 外層 `<Card>` 缺 `h-full`、`ListingLink` 要撐滿格；詳情頁展開態封面佔滿首屏 → 雙欄／照片高度上限；**注意 entry gzip 已頂上限** |
| S4 | **金流收尾**：drop `complete_paid_pending_orders` wrapper（W6-14→W6-30，正式站已跑 S1 Edge 多輪）；`apply_referral_side_effects` 3b／3d 失敗升 error（連結漏寫會讓之後二三代靜默漏發）；`repair_orphaned_*` 單交易迴圈；單筆開通失敗告警 message 不含原始 sqlerrm；順修檔頭 R6 P2-7／P2-8；README〈補發漏發獎金〉改以 `referral_award_chain` 為準（P2-9） | W6-30、S1 #524 發現、R6 P2-7～9 | Opus，三段式（金流＋推薦） | 合併前派獨立審查員 |
| S5 | **後台推薦樹第二輪**：換線實際寫入時點（P2-4）、`fresh_events` 未換線標示（P2-5）、規模效能（P2-6＋頂層 unplaceable）、後台 portal 遮罩（P2-10＋W6-21）、完整換線事件表（W6-16） | R6 P2-4～6、P2-10；W6-16、W6-21 | Opus，三段式 | 會員 24→數十，效能不急；P2-4 會誤導補發，優先 |
| S6 | **Playwright 升版＋journey-suite 改回 `ubuntu-latest`** | W4-23 退場條件（不可遺失，見 `journey.yml:62-65`） | Sonnet | 改 workflow 有機械把關 |
| R7 | 第 7 波審查；兼做 `launch-wave-6/` 退場（依 R6 §6） | — | Opus，審查 session | 晉升後開；W6-35 的做法：上線滿 48 小時、主 session 量完現場再開 |

其他候選以 W6 plan §5（含〈承接第 5 波〉）與 R6 §5／§6.3 為準，重點：稽核其餘 P1（ref P1-3／5／6／7／8、auth P1-3／5、ops P1-2）、journey f70 缺章（W5-60）、
vitest／vite 大版本（#467）、後台刪帳號工具、unknown 單手動開通入口（W5-44③）、S4 焦點還原搬進 useBrowseNav（W6-22）。

## 2. 業主待辦（從第 6 波帶過來）

| # | 事 | 狀態 |
|---|---|---|
| 1 | PayUni 商店後台查 `202611121258381GSCF7`、`20261114175042776H9S`（兩位會員只有這一張單）是否實付；另兩張 `BRI1XE`、`HSZTIE` 已確定是重試前的棄單。沒實付就把 4 筆 error 告警標已處理 | 待回報 |
| 2 | develop 後台推薦樹三個分頁在 320px 手機寬實看 | 待回報 |
| 3 | 詢問 PayUni：sandbox UPP 端點對 GitHub runner 偶發 403 是否有 WAF／維護窗 | 可選 |
| 4 | 實機確認（第 4 波起）：H1 邀請連結、`uknow.pages.dev` 導向、正式站登入；PayUni 第一筆付款（11/03）發票；PostHog 專案端勾選與 Network 面板抽看、`tel-national` 真機；GitHub 設定補強 | 待回報 |

## 3. 業主溝通慣例（第 5、6 波累積）

- 每個決策用互動選項（題目、選項、說明、建議），回覆用繁體中文；開工前先推薦模型與分工。
- 對業主**不用「下線／上線」**（W5-53）：一律「推薦人／您推薦的會員／一代二代三代」。
- 業主常用手機操作：步驟以手機瀏覽器可完成為準；密鑰原值永遠不貼進對話，用 SHA-256 指紋（Supabase Secrets 頁的 Digest）核對。
- 雲端主 session 可直接跑 Supabase MCP 唯讀 SQL（執行 session 不行，交主 session 代跑）；雲端容器連不到 `*.pages.dev`、`uknow.com.tw`、`*.supabase.co`。
- 第 6 波經驗：金流／後台 PR 合併前派獨立 Opus 審查員，7 支裡 5 支抓到 P0／P1；告警走 LINE 只取前 60 字（W6-24），行動要放最前面；
  worker 重啟會吃掉排好的查詢，排程到點要先確認真的跑了。
