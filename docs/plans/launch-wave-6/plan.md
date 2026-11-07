# 第 6 波：交接（第 5 波主 session 寫，2026-11-07）

<!-- plans-keep: 跨 session 鷹架（第 6 波主／執行／審查 session 的共同事實來源）；退場條件＝第 6 波審查 session 結案後，值得長留的升級進規格書／friction-log，其餘隨 commit 刪除 -->

寫給**全新的第 6 波主 session**：開局只有 repo 和這份檔，沒有對話記憶。本檔只是第 5 波主 session 的交接。
開局後請擴寫成本波完整的 plan（裁決表、工作分解、名冊、進度表），格式比照 `docs/plans/launch-wave-5/plan.md`。
三種 session 的分工、凍結規則、雲端執行環境須知在 `docs/README.md`〈慣例〉；派工 prompt 的共用開頭照抄
`docs/plans/launch-wave-5/dispatch-prompts.md`（把「第 5 波」「主 session id」「分支」換成本波的），再補本檔 §1。

## 0. 上游與現況

**要讀的上游檔**

- `docs/plans/launch-wave-5/plan.md`：§0 裁決 W5-1～73（仍有效）、§4 晉升清單（含 W5-62）、§5 第 6 波候選、§8 進度。
- `docs/plans/launch-wave-5/review.md`：第 5 波審查（R5，P0 0／P1 0／P2 9）。§1.3 P2 表、§5 待辦、§6.3 候選補遺（含第 4 波四份稽核
  未修 P2 的完整清單；稽核原文 `git show 3a7f506:docs/plans/launch-wave-4/audit-*.md`）；§6.1／6.2 升級表是 `launch-wave-5/` 退場依據（由本波 R6 執行）。
- `docs/plans/friction-log.md` 的 2026-11-07 節（R5 寫）。

**現況**（2026-11-07 交接時）

- main＝`f5a1ed8`（第 5 波晉升 #516，9 支程式 PR：S1～S8＋#515）。正式站部署 run 42365227288 成功（`/health` sha 比對過）、
  deploy-smoke 42366062154 綠。7 支 migration（`20261111000001～3`、`20261112000001`、`20261113000001～3`）已套。
- 排程已改 Supabase pg_cron（S1）：正式站 Vault 兩筆已建；`invoke_internal_endpoint('reconcile')` 200；pg_cron 對帳首輪
  11:07 UTC succeeded；部署後 system_alerts 0 列；配對名單 18／18 差集 0。GitHub 兩支 workflow 改看門狗。
- RECONCILE_SECRET 已整組換新（W5-67）：GitHub、正式站／develop Edge、develop／正式站 Vault 五處同值。
- PostHog：只有正式站一個 project（W5-68，免費方案限 1 個），develop／預覽不注入。業主已完成 onboarding（只留 Product analytics＋
  Session replay），錄影抽查文字與輸入已遮蔽；照片空白屬預期（W5-73）。
- **交接時未完成的驗證**：照片清理 pg_cron 首輪（每日 19:17 UTC）的 `scheduled_job_runs.summary->>'dryRun'` 應為 `false`，用來佐證
  正式站 `PHOTO_PURGE_LIVE=true`。第 5 波主 session 排了 11/07 19:25 UTC 檢查並記進 #518；若 #518 已合但 §8 沒有這筆，開局先查。
- 開著的 PR：#518（第 5 波收尾紀錄）若尚未合併由第 5 波主 session 收。open issue：#467、#395、#384、#383。

## 1. 本波工項（交接時的建議，開局後要和業主確認）

| # | 工項 | 來源 | 建議模型／流程 | 備註 |
|---|---|---|---|---|
| S1 | **批次自癒與線上付款互鎖**：批次改每筆獨立交易或不再持本人列鎖；`pay_referral_generations` 遇 40P01／40001 改 error 告警 | W5-72（**業主裁定優先**）、R5 P2-5 | Opus，三段式（金流＋推薦） | W5-61 同處。可併 R5 P2-8（heal 摘要進帳本）、P2-7（unknownByReason）、P2-9（`invoke_internal_endpoint` 加 `p_trigger`） |
| S2 | **結帳頁送單錯誤分支**：自己的碼／碼失效 400、非 JSON／斷網、已有有效訂閱不導走；新約確認框 portal 包 `privateClass` | W5-71、R5 P2-1～4 | Sonnet，`/fix-bug` | 業主已裁定合成一支 |
| S3 | **後台完整推薦樹＋查帳資訊** | W5-70（業主新增） | Opus，三段式（新功能） | 規劃前先和業主確認：節點欄位、最常查的情境、大樹的瀏覽方式（搜尋展開／匯出）、要不要自動標異常（成環、自領、付款未發獎） |
| S4 | **換篇過場動畫**，併 S7 P2 五項（reduced-motion 未併 `motionPreference`、抽 hook、手勢 chunk 缺 error boundary、slide-in、手勢起點） | W5-69（業主新增） | Sonnet，三段式（UX） | 業主正式站實測：換篇順，但「突然」 |
| S5 | **屏東「南鄉」→「南州鄉」**：改 `TAIWAN_REGIONS`＋migration 轉換既有資料；座標表別名一併拿掉 | W5-65 | Sonnet，`/fix-bug` | 動資料，要正式站唯讀預查筆數 |
| S6 | **新約與部署收尾**：確認框第三態「預設推薦人即現任」（W5-63）；0d 驗單上的碼（R5 P2-6）；drop 三參數版 `prepare_payment_order`；`deploy-supabase.yml` 部署前自動確認 migration 已套（W5-62） | W5-62、W5-63、R5 P2-6 | Opus，三段式 | W5-62 自動化上線後，晉升清單那一步可退場 |
| S7 | **journey f70 缺章**（新約後三代獎金、任務、自領停發、ch7 credit、ch9 墨黑鈕） | W5-60 | Sonnet | 目前由 Deno 整合測試與 mock e2e 涵蓋 |
| R6 | 第 6 波審查；兼做 `launch-wave-5/` 退場（依 R5 §6） | — | Opus，審查 session | 晉升後開 |

其他候選以 `launch-wave-5/plan.md` §5 與 `review.md` §6.3 為準，重點：Playwright 升版＋journey-suite 改回 `ubuntu-latest`（**W4-23 退場條件**）、
vitest／vite 大版本（#467）、稽核其餘 P1（ref P1-3／5／6／7、pay P1-5、auth P1-3／5、ops P1-2）、R4 未收 P2、後台刪帳號工具、unknown 單手動開通入口（W5-44③）。

## 2. 業主待辦（從第 5 波帶過來）

| # | 事 | 狀態 |
|---|---|---|
| 1 | 實機確認：H1 曾開邀請連結的瀏覽器新註冊不帶推薦碼、帶 `?ref=` 仍帶入；`uknow.pages.dev` 各種網址導向 `uknow.com.tw`、`develop.uknow.pages.dev` 不導；正式站實際登入一次 | 待回報 |
| 2 | PayUni 商店後台確認第一筆付款（11/03）發票已開立 | 待回報 |
| 3 | GitHub 設定（補強，非必須）：Fork PR workflows 設「Require approval for all external contributors」；Environments → develop 加 required reviewer | 待回報 |

## 3. 業主溝通慣例（第 5 波累積）

- 每個決策用互動選項（題目、選項、說明、建議），回覆用繁體中文；開工前先推薦模型與分工。
- 對業主**不用「下線／上線」**（W5-53，`src/terminologyGuard.test.ts` 機械把關使用者可見字串）：一律「推薦人／您推薦的會員／一代二代三代」。
- 業主常用手機操作：給步驟時以手機瀏覽器可完成為準，不假設有電腦；密鑰原值永遠不貼進對話，用 SHA-256 指紋核對。
- 雲端主 session 可直接跑 Supabase MCP 唯讀 SQL（執行 session 不行，要交主 session 代跑）；雲端容器連不到 `*.pages.dev`、`uknow.com.tw`。
