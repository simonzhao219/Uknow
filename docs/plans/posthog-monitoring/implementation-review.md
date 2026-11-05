# PostHog 監控與錄影 實作審查報告

<!-- plans-keep: 與 plan.md 同為鷹架，隨 /tdd-implement 收尾刪除；結論摘要貼進 PR 內文 -->

四視角審查實作 diff（`git diff origin/develop...HEAD`，審查時 HEAD＝`6e1a7da1` 加工作樹的階段 5 文件）。原判彙整，未改判。

| 視角 | P0 | P1 | P2 |
|---|---|---|---|
| 系統 | 0 | 3 | 3 |
| 架構 | 0 | 1 | 4 |
| UI/UX | 0 | 1 | 2 |
| 需求 | 0 | 1 | 4 |

## 發現與處置

### P1
1. 〔系統〕`trackPageview`／`reset` 的 client 呼叫沒有 try/catch，SDK 拋錯會讓 App 白屏或讓登出中斷 → **已修**：兩處各包 try/catch；新增 `analyticsFaultIsolation.test.ts`（先紅後綠）。
2. 〔系統〕缺「SPA 導入 `/payment/result`」測試（plan 階段 2 驗證標準）→ **已補** `analyticsPrivacyPaymentSpa.test.ts`（真實 SDK）。
3. 〔系統〕`/flags` 與遠端設定請求沒有被真實測試涵蓋，「不得含 token」可能空過 → **查證**：jsdom 實測整輪只有 `/e/` 與 `/s/`，沒有 `/flags`；測試預載遠端設定所以 `/array/<key>/config` 也未請求。**驗證缺口已記入 progress.md 與 PR 內文**，列入 develop 上線後人工清單（Network 面板確認這兩類請求的網址與本文不含 token）。同時更正 plan §2.2「少一支外送請求」的說法。
4. 〔架構、UI/UX、需求，三方同判〕plan 的 `PrivateField`／`privateProps()` 實作為 `privateClass()`＋路由層 `PrivateRegion`，未記錄偏離 → **已記錄**於 progress.md Blockers 與 PR「偏離規劃說明」；新增 `analyticsPrivacyBlock.test.ts` 以真實 SDK 證明 `ph-no-capture` 容器（含 `display:contents` 形態）底下的子樹不外送。

### P2
5. 〔系統〕`$initial_utm_*`／`$initial_gclid` 等 person-property 追蹤鍵未清 → **已修**（`cleanBag` 去 `$initial_` 前綴後比對；測試在 `analyticsFaultIsolation.test.ts`）。
6. 〔系統、需求〕`entryRawKB` 1000→1002 無 plan 授權 → 已記入 progress.md 與 PR 內文（實測 raw +1.9 kB，gzip +0.8 kB 在 +1.0 內）。
7. 〔系統〕〔需人工裁決〕`PrivateRegion` 在 develop 預覽肉眼檢查 `/payment/*`、`/admin` 版面 → 列入上線後清單（UI/UX 視角已分析其父層 `<main>` 無 `space-y`／`gap` 規則，判無缺口）。
8. 〔架構〕appShell 守衛只認單引號、不直接斷言 entry 圖不含 posthogClient → 接受；硬防線是 `check-bundle-budget.mjs`，已在 PR 說明。
9. 〔架構〕預算分帳：註解寫 S7 另有 gzip +3 專用額度但 `entryGzipKB` 只含 S4；totalRaw 餘裕僅 32 kB → 接受，後合併者在 PR 寫合計值（plan §3 已規定）。
10. 〔架構〕`clearAccountLocalState` 檔頭註解未提及監控重置 → **已修**。
11. 〔架構〕`analyticsPrivacyHarness.ts` 進覆蓋率分母、`export { PH_BLOCK_CLASS }` 再匯出可能被 knip 質疑 → 以 `check:full`（覆蓋率棘輪＋knip）結果為準，見 PR。
12. 〔UI/UX〕ui-ux-guidelines 未提 `PrivateRegion` 用法與證件照區塊 → **已補**。
13. 〔需求〕規格書 §15「不開的功能」段落有記錄「沒有」的傾向 → **已改**為描述性寫法（明確寫死的選項）。
14. 〔需求〕`/admin/verify` 已是轉址到 `/dashboard/qr?tab=scan`，落地頁不在禁錄路徑 → **〔需人工裁決〕**，記入 PR：QR 掃描頁是否會顯示他人個資（掃描結果卡），若會需另行 block。
15. 〔需求〕progress.md 階段 5 過期 → 已更新。

## 需人工裁決
- 發現 14：`/dashboard/qr` 掃描頁是否需要 block。
- 手機欄位 `autoComplete`：reviewer 指出 `tel` 搭配 `maxLength=10` 時，通訊錄 `+886…` 自動填入會被截斷；已改為 `tel-national`（並讓 catch-all 同步涵蓋 `tel-` 前綴），真機行為未驗證，列入上線後人工清單。
- `ClaimRewardDialog`／`WithdrawalFundingFields`：前者經 `ThreeStepDialog` 與 `IdNumberInput` 受保護、後者在後台（整段不錄）；內容未逐項人工確認，併入上線第一天抽看錄影。

## 處置(人審後填寫)

- P0＝0，不阻擋。主 session 親審時請看 PR 內文「偏離規劃說明」。
