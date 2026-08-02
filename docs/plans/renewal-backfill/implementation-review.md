# renewal-backfill 實作 diff 審查報告(/review-implementation)

<!-- 由 /review-implementation 彙整四個 reviewer subagent 的發現而成。
     聚合規則:只彙整、去重、排序,不改判。輸出契約見 docs/_templates/review.md。 -->

審查對象:`feature/renewal-backfill` @ `0f6826c` 相對 `origin/develop` 的
完整 diff(44 檔,+5543/−131),對照 plan.md 第 7 版、review.md 四輪紀錄、
progress.md 已記錄偏離。四視角同訊息平行派出、同步等待。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 1 | 1 | 鎖序、沖銷/自癒冪等與快照補沖、migration 基準比對、prepare 守衛順序(A16 在 W3 前)、backfillPlan 雙副本一致、RLS |
| 架構 | 0 | 1 | 1 | migration 基準/唯一差異紀律、helper 單一真相、月份 key 單一運算式、alias 模式、測試分層命名、appShell 契約 |
| UI/UX | 0 | 5 | 2 | 模式一致性(aria-pressed 卡片、AlertDialog 沿用)、資訊架構/BottomNav、稍後再說導首頁、補繳中間筆跳輪詢主邏輯 |
| 需求 | 0 | 2 | 2 | A1-A16/AC-1~17 逐條溯源(見原始報告表格)、無腦補需求、「不做什麼」清單被遵守 |

三個視角(架構、UI/UX、需求)獨立命中同一缺口(四狀態表第 4 列),
兩個視角(系統、需求)獨立命中 AC-15 對話框缺口——去重後 **P1 共 6 項、
P2 共 5 項,P0 為 0**。所有 P1 均屬「未記錄於 progress.md 的實作偏離」,
依審查契約至少 P1;全部可小修。

## 發現清單(去重後,依嚴重度排序)

**[P1-A]〔plan §4 四狀態判準表第 4 列〕**(架構+UI/UX+需求三視角獨立命中)
`useSubscription()` 未曝露「背景 revalidate 失敗」訊號(`hasDataRef` 是內部
ref),`PaymentCheckout.tsx` 用單一 `!renewal` 判準,把「載入中」「初次抓取
失敗」混成同一錯誤畫面,且「曾有資料、本次重整失敗 + `hasPaidAnyBackfill`」
時靜默沿用舊資料——plan 第 4 輪專門回填的一列完全未落地
→ hook 曝露失敗訊號(catch 設、成功清),Checkout 讀 `isLoading` 走
skeleton、背景失敗且 `hasPaidAnyBackfill` 時顯示「進度暫時無法讀取」+
重試,補測試。

**[P1-B]〔plan §4 AC-15 / §5 階段 11〕**(系統+需求雙視角獨立命中)
fresh 二次確認對話框未揭露「本輪已付筆數與金額」(範本:「你已為『接續
原效期』付款 2 筆(NT$2,400)」),且 `RenewalInfoSchema` 結構上就沒有
已付筆數/金額欄位,前端算不出來;測試只斷言「已付」「退還」字面,攔不住
→ 契約補已付欄位、`/subscriptions/status` 計算、對話框補具體數字、測試
斷言數字。

**[P1-C]〔plan §4 揭露卡片 / AC-2〕**(UI/UX)
fresh 選項只寫「效期自付款日起算一年」,未顯示 AC-2 要求的具體效期日
(「新約:NT$1,200,效期至 2027-05-01」),測試也沒斷言
→ 前端以今天為錨自算一年減一天並 `formatTwDate` 顯示,補斷言。

**[P1-D]〔plan §4 揭露卡片退化分支〕**(UI/UX)
`hasPaidAnyBackfill===false && backfillCount===1`(最常見的「剛過期」情境)
plan 明訂不得出現「補繳」字樣,實作對 count===1 一樣顯示「需補繳 1 筆」
→ 依條件切換為一般續約措辭,補文案測試。

**[P1-E]〔plan §4 Q11 裁決文案〕**(UI/UX)
plan 逐字裁決「選擇新約會重新建立推薦關係。若要留在原本的推薦人底下,
請填入他的推薦碼;不填則不會有推薦人。」,實作寫成通用首購式說明,
丟失「這是變更、會離開原上代」的關鍵警示(R7 緩解失效);測試只驗
「不包含」沒驗「應包含」→ 換回 plan 文案,補正向斷言。

**[P1-F]〔plan §4 A16 情境 a11y〕**(UI/UX)
fresh 停用時只有 `disabled`+`aria-disabled`,缺 plan 明訂的
`aria-describedby` 錨定提領審核說明 → 說明段落加 `id`,按鈕補
`aria-describedby`,補斷言。

**[P2-1]〔§2 API 變更 /payuni/result〕**(系統)`PayuniResultRenewalSchema`
定義後兩端都沒引用(後端 `Record<string, unknown>`、前端自宣告 interface、
無 shape 測試),型別會靜默漂移 → 後端標型別、前端 `import type`、補
shape 斷言。

**[P2-2]〔PaymentResult.tsx 日期格式〕**(UI/UX)「已補至」印原始 ISO
字串,與 Checkout 的 `formatTwDate` 不一致 → 改走 `formatTwDate`。

**[P2-3]〔A14/A15 零值組合〕**(UI/UX)沒收揭露在其中一項為 0 時仍並列
顯示(「0 點」贅句)→ 依各自 >0 決定子句。

**[P2-4]〔fresh-default-referrer.test.ts / A11〕**(需求)W3 第五分支
`profile_update_failed` 無測試覆蓋 → 補測或在 progress.md 記錄為刻意不測。

**[P2-5]〔plan §4 狀態表「載入中」〕**(需求;與 P1-A 同源)載入中與初次
失敗合併成同一視覺狀態 →〔需人工裁決〕是否值得獨立狀態;實務上併入
P1-A 的 `isLoading` skeleton 即解。

## 需人工裁決

1. **`paidUpToDay = twDayPlusYears(extendEndDate, -1)` 反推公式的閏日精度**
   (需求視角提出)。主 session 手算核驗:僅當補繳鏈的最後到期日落在
   02-29(錨點 2024-02-29 → extendEndDate 2025-02-28 → 反推 2024-02-28,
   實際已補至 2024-02-29)時少報 1 天,方向保守(少報不多報),其餘案例
   精確。處置:Checkout 端手上有 `extendAnchorDate`,改用錨點減 1 天即
   精確;Result 端把 `extendAnchorDate` 加進精簡契約一併修(併入 P2-1 的
   接線)。此為「修掉」而非「撤銷」,留待人審追認。
2. P2-5 是否需要獨立的「初次失敗」視覺狀態(reviewer 自標可能只是極短暫
   閃現)——已按 P1-A 的 skeleton 方案處理,留待人審追認。

## 處置(人審後填寫)

主 session 依「P1/P2 能小修就修」原則已全數處置(P0×0,無豁免需求);
使用者已明文授權自主作業。修正 commit 見 progress.md 收尾紀錄與 PR 描述。

- [x] 裁決:修訂後通過(P0×0;P1×6 全數修復;P2×5 修 4 記 1——
  P2-4 記錄為刻意不測的低機率邊界)

原始報告全文:四個 subagent 輸出未逐字收錄(本檔為聚合契約產物),
發現原文已 1:1 對應上表,無降級、無剔除。
