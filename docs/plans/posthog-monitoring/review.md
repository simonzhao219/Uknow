# PostHog 監控與錄影 規劃書審查報告（第二輪，針對 plan v2）

<!-- plans-keep: 與 plan.md 同為鷹架，隨 /tdd-implement 收尾刪除 -->

第一輪見 `review-v1.md`（P0 1、P1 13、P2 8）。本輪四位 reviewer 原判彙整，未改判。系統視角已讀 `posthog-js@1.445.5` 原始碼驗證。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 7 | 4 | DB／RLS／後端、金流冪等、`reset(true)` 語意、recorder 版本鎖定 |
| 架構 | 0 | 3 | 3 | appShell 守衛、模組邊界、階段順序、v1 預算矛盾已解 |
| UI/UX | 0 | 1 | 3 | a11y（純 div 群組）、三態、BottomNav、選擇器 |
| 需求 | 0 | 2 | 3 | W5-35／W5-36／W4-37 逐項對應、無未標示腦補、v1 需求項全處置 |

**v1 的 P0 已降為 P1 級缺陷（系統視角原判），不再阻擋。**

## 發現清單（依嚴重度；括號為 plan v2.1 處置位置）

### P1
1. 〔系統 N1〕`before_send` 看不到 DOM 屬性：`compress_events` 預設 true，FullSnapshot／Mutation 先被 gzip；v2「雙層清」前提不成立，只剩 `maskAttributeFn` → 改白名單、測試解壓 snapshot 逐屬性斷言（§2.3、Q9）。〔需人工裁決〕白名單 vs `maskAllElementAttributes:true`。
2. 〔系統 N2〕`maskCapturedNetworkRequestFn: () => null` 會丟掉 Meta／`$pageview`／`$url_changed`，弄壞 replay → 改為剝 query／hash（§2.2）。
3. 〔系統 N3〕「不開」＝`undefined` 會被 PostHog 專案端遠端開啟（exceptions、console、canvas、dead clicks、heatmaps）→ client 端全部明確 false，階段 1 改斷言值為 false（§2.2、驗收 5、Q8）。
4. 〔系統 N4〕錄影啟動依賴遠端設定與專案端 Session replay；離線測試需 mock `/array/<key>/config`、recorder 腳本名可被覆寫、須斷言收到 recorder 請求；加 `advanced_disable_feature_flags`（§2.5、§2.2、階段 2、Q8）。
5. 〔系統 N5〕SPA 進入禁錄路由時 stop 晚於 DOM 掛載；admin 根容器原本沒有 block → `useLayoutEffect`、admin／付款根容器皆帶 `ph-no-capture`、補 SPA 導入測試（§2.5、階段 2）。
6. 〔系統 N6＋架構 P1-a〕執行期用 `VITE_SUPABASE_PROJECT_ID` 判斷 journey 不可行（develop／預覽建置該值必有）→ 刪執行期判斷，改建置期 `explicitSupabaseProject`（§2.1）。
7. 〔系統 N7〕SDK 未載入時 reset 為 no-op，之後沿用舊身分 → 待重置旗標＋移除 localStorage 鍵（§2.4）。
8. 〔架構 P1-b〕「e2e 假 key 建置」與現有 e2e 架構不符（共用 dev server、約 22 個 feature、`E2E_SKIP_DEV_SERVER`）→ 階段 2 主要改 vitest jsdom 真 SDK＋stub fetch，不可行才開第二個 dev server（階段 2）。
9. 〔架構 P1-c〕`VITE_POSTHOG_KEY` 覆寫優先序未定義 → 僅接受 `phc_test_` 前綴，其他在 CF 建置下忽略，測試釘住（§2.1）。
10. 〔UIUX N1〕`display:contents` wrapper 讓父層 `space-y-*` 間距塌陷（CompleteProfile、CollectionVerifyDialog 實證），jsdom 抓不到 → 預設把 class 併入既有欄位群組根容器，`IdNumberInput` 根 div 自帶（§4）。
11. 〔需求 1〕`$geoip_disable` 只是輔助，W5-36③ 靠專案端 Discard IP；驗收措辭須更正 → 已改（驗收 4、§2.2）。
12. 〔需求 2〕Q7（外部 recorder 的供應鏈風險）是需人裁決的信任問題，應阻擋階段 2 開工 → 已標（§2.6、Q7）。

### P2
13. 〔系統 N8〕`before_send` 不要深走壓縮批次 → 只處理 Meta／Custom（§2.3）。
14. 〔系統 N9〕同 11。
15. 〔系統 N10＋架構〕entry +1.0 kB 偏緊 → sanitize 等放動態 chunk，entry 只留 facade（§3）。
16. 〔系統 N11〕`startSessionRecording()` 不得傳 `true` 繞過抽樣 → 已寫（§2.5）。
17. 〔架構 P2-a〕〔需人工裁決〕`config/posthogTarget.ts` 在 knip 範圍外（既有 `supabaseTarget.ts` 同）；`analyticsConfig.ts` 匯出在階段 1 就跑 `npm run check` 確認。
18. 〔架構 P2-b〕預算分帳僅人工紀律 → `BUDGET` 註解寫分項（§3）。
19. 〔架構 P2-c〕`main.tsx` 排程不可測 → 抽 `scheduleAnalytics` 純函式（§3）。
20. 〔UIUX N2〕`inputMode` 目標屬性表，身分證不得設 numeric／tel（§4）。
21. 〔UIUX N3〕〔需人工裁決〕放量退化數值門檻 → Q10。
22. 〔UIUX N4〕CollectionVerifyDialog 實為自製覆蓋層非 portal；逐一確認 dialog 型態（§4）。
23. 〔需求 3〕「出錯必錄」本波連帶不做，記為對 W4-36 第二處偏離（§1）。
24. 〔需求 4〕新環境變數與回滾手段於階段 5 登記文件（階段 5）。
25. 〔需求 5〕驗收 7 補驗證方式（驗收 7）。

## 需人工裁決（待主 session／業主）

- **Q7** recorder 載入 A／B（建議 A；需業主承認供應鏈風險；阻擋階段 2 開工）。
- **Q9** DOM 屬性：`maskAttributeFn` 白名單（建議）vs `maskAllElementAttributes:true`（保守）vs `compress_events:false`。
- **Q10** 放量退化門檻數值，或僅人工看第一批錄影。
- Q8 專案端設定（業主操作，已列清單）。

## 處置(人審後填寫)

<!-- P0 的處置規則:必須改 plan 並重跑 /review-plan,或由人在此明文豁免。
     tdd-implement 開工前會檢查:存在未處置 P0 → 拒絕開工。 -->

- 本輪 **P0＝0**。plan v2.1 已吸收上列 P1／P2；**v2.1 修訂未再跑第三輪審查**（主 session 親審時請一併檢視 §2.2、§2.3、§4 的新內容）。
- [x] 人審完成,裁決:☑ 修訂後通過（主 session 親審 plan v2.1 通過，裁決 W5-37／38／39；業主 2026-11-05 在本 session 親打 `/tdd-implement posthog-monitoring` 啟動實作）
