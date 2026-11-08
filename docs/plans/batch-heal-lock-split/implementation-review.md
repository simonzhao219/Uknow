# 批次自癒與線上付款互鎖 實作審查報告

審查對象：`origin/develop...e0b15546` 的實作 diff（四視角平行，fresh context）；對照 `plan.md` r3、`progress.md`。只彙整、不改判。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 1 | 4 | 鎖序與子交易、lock_timeout 範圍與還原、冪等、wrapper、handler 內查詢安全、streak SQL、invoke drop＋create、可重跑性、Edge 錯誤路徑 |
| 架構 | 0 | 2 | 2 | migration「基準＝X、唯一差異＝Y」逐支屬實、無回退；模組切分；測試命名分層；fixture 10 檔；文件同步；S6 介面 |
| UI/UX | 0 | 4 | 1 | 前 200 字內容、用語、與 W6-12 一致、severity、原因對照 |
| 需求 | 0 | 1 | 7 | 驗收 1～6 皆有測試、五條裁決落實、§8.3 改寫正確、無範圍蔓延 |

## 發現清單（依嚴重度）

### P1
1. （系統、架構、UI/UX、需求同指）告警 message 多附原始 `sqlerrm`，plan 範本沒有、未記錄；LINE 是外部通道 → 拿掉或記錄。
2. （UI/UX、需求）3c 整批告警沒有推薦碼與點數，下一步沒寫「三代」，與 plan 不同。
3. （架構、UI/UX、需求）階段 3(d)「36 字元單號、前 200 字含下一步」沒有測試；3c 路徑沒有訊息測試。
4. （UI/UX）README〈補發漏發獎金〉照做會卡：缺找告警 SQL、整批的補法、完整 insert 欄位、resolve SQL；context 缺 `amount`。
5. （架構、需求）未記錄的偏離：抽出 `log_referral_reward_failure`、migration 版本號、`UnknownReason` 方向、測試落點、未知 outcome 記 failed、`healLedgerSummary` null 即 error。

### P2
6. （系統、需求）`skipped` 與 `skipped_locked` 混計使 `healSkippedStreak` 偶爾虛高，README 未寫。
7. （系統）反查失敗措辭「查無單號」與 plan §7「查詢失敗」不同。
8. （需求）`heal-lock-split` 未斷言三筆單都 completed。
9. （需求）per-user 回傳布林未直接斷言。
10. （需求、架構）階段 6「manual 不刷新 lastPgCronCompletedAt」「預設 → pg_cron」未新增斷言。
11. （架構）`UNKNOWN_REASONS` 執行期沒用到，`unknownByReason` 初始化仍手寫四鍵。
12. （需求）W6-14 交接與 3b／3d 仍 warning 的發現要寫進 PR 給主 session。
13. （UI/UX）「通知工程人員」沒說通知誰〔需人工裁決：是否補聯絡窗口〕。

## 需人工裁決
- #13 聯絡窗口（營運慣例，不在本案範圍）。

## 處置

| # | 處置 |
|---|---|
| 1、2、3 | 修：紅燈 `d5ca6f57`（gen2 改 36 字元單號、斷言訊息不含原始錯誤與 context.amount、新增 3c 整批測試）→ 綠燈下一個 commit（sqlerrm 只進 context、加 amount、3c 訊息補第 1 代推薦碼／每代點數／「核對三代」） |
| 4 | 修：README runbook 補四段 SQL、整批與任務續約的補法 |
| 5 | 記：`progress.md`〈偏離規劃說明〉1～9，PR 內文照抄 |
| 6 | 修：README 的 streak 說明寫明混計 |
| 7 | 記（偏離 7） |
| 8 | 修：`heal-lock-split` 加三筆 completed 斷言（隨 d5ca6f57） |
| 9、10、11 | 記（偏離 9）；9 由「另一張開通→同一回應 active」間接覆蓋，11 不改（初始化型別仍由 `Record<UnknownReason, number>` 編譯期擋缺鍵） |
| 12 | PR 內文與回報主 session |
| 13 | 留主 session／業主 |
