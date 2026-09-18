# 平台 UI/UX 全面重設計——進度看板

<!-- plans-keep: 進行中的跨 session 施工鷹架（S1–S8 尚未完工，工序見 construction-plan.md）；退場條件＝S8（G2）收尾時整個目錄刪除 -->

> 每個 session 開工先讀本檔，收工必更新。遺留事項只准記在這裡。

## Session 狀態

| # | Session | 工項 | 狀態 | PR | 備註 |
|---|---|---|---|---|---|
| S0 | 總綱與施工計畫 | — | ✅ 完成 | （本 PR） | 四個方向決策已與業主核對（plan.md §0）；四視角審查完成、P0×2/P1×7/P2×7 全數回填（review.md） |
| S1 | 設計語言地基 | D1+D2 | ✅ 已合併 | [#321](https://github.com/simonzhao219/Uknow/pull/321) | 五階段 TDD 紅綠循環全過；`/review-implementation` 四視角 P0×0/P1×3/P2×5 全數修掉；規劃檔已隨收尾清理，值得保存的決策已升級進 `construction-plan.md` §4.3、`ui-ux-guidelines.md` §12、`globals.css` 註解 |
| S2 | 全站色彩收斂 | D3 | ✅ 已合併（驗收站 1 進行中） | [#325](https://github.com/simonzhao219/Uknow/pull/325) | 53 個 baseline 檔案（含開工時漏列的 `TaskDashboard.tsx`，收尾核對時補上）全數收斂到 0，僅留 4 個已核准例外（品牌 icon 色、QR 功能色；canvas 專用檔已收進 `EXCLUDED_PATHS`）；Badge 新增 5 個 variant、新增 `StatusCallout` 元件（含 `action`/`titleAs` slot）；四視角 `/review-implementation` 跑完，P1 全數修掉（見下方異動記錄）；`npm run check`／`framework-check.sh`／`npm run build` 全綠。人工實測（驗收站 1：全站走一圈看觀感、深色模式與色盲模擬 checklist）待 PR 合併到 develop 後進行 |
| S3 | 後台資訊架構 | A1+A2 | ⬜ 未開工 | — | |
| S4 | 會員詳情重設計 | A3 | ⬜ 未開工 | — | 驗收站 2 |
| S5 | admin 資料快取 | A4 | ⬜ 未開工 | — | 驗收站 3 |
| S6 | 前台門面 | F1 | ⬜ 未開工 | — | |
| S7 | 會員區收尾 | F2+F3 | ⬜ 未開工 | — | 驗收站 4 |
| S8 | 制度化收尾 | G1+G2 | ⬜ 未開工 | — | 完工後刪除本目錄 |

## 計畫異動記錄

| 日期 | 異動 | 原因 |
|---|---|---|
| 2026-08-09 | 初版計畫建立 | — |
| 2026-08-09 | 四視角審查回填：A1 增 bootstrap 可達性裁決與標籤縮短、A2 界定為版面重構、A4 增四條硬約束（記憶體快取/排除清單/invalidation 表/DI 裁決）、F2 增會籍失效狀態、§2.6 改為人工同步規格書 | 審查發現兩個 P0 與七個 P1，詳見 review.md |
| 2026-09-01 | construction-plan 增 §6「PR 合併後的部署與達標驗證」：部署管線摘要（Cloudflare Pages＋Supabase 自動部署、晉升 SOP）與六痛點對應的機械/人工雙層驗證表 | 業主要求明文化「合併後怎麼上線、怎麼確認達標」 |
| 2026-09-14 | rebase 到 develop（#310–#313 之後）並重新評估：計畫內容不受影響（Footer 精簡/聯絡改純文字/推薦碼改數字流水號皆不與工項重疊），僅更新四處行號引用（規格書 §13 兩處、`api/index.ts` PII 兩處） | develop 前進造成引用位移；週期性重評估 |
| 2026-09-14 | S1/S3/S4/S5 開工 prompt 補「先切 `feature/<slug>` 分支」一行 | web session 預設生在 `claude/*` 分支，三段式守衛只認 `feature/<slug>`，prompt 不該依賴 session 記得讀 CLAUDE.md 那段 |
| 2026-09-14 | S1 重量由「中」調整為「中偏重」，實作模型維持 Sonnet；施工中的 session 可能需兩次對話（中途 `/clear` 續作），狀態靠 `docs/plans/design-language-foundation/progress.md` 接續 | S1 兩輪四視角審查共回填 P1×12 / P2×13，新增 C3 原始色值規則、`--destructive` 兩組 token、對比斷言翻倍（border 3:1、裸字對兩底色）、灰階對照表（39 處/15 檔）與 G1 完整性檢查、色盲 checklist。依 construction-plan §4.4「計畫要改就在 progress.md 記一行異動」 |
| 2026-09-17 | S1 合併後對照檢查的兩處收尾：plan.md D2 列措辭由「白名單」改為實際交付的「棘輪 baseline」；`check-color-usage.py` 新增掃描排除清單，`globals.test.ts`（對比度公式錨定測試）不再計入 baseline | 前者是 S1 規劃書 P2-8 記錄的刻意偏離，規劃書刪除後上游未同步；後者是 WCAG 參考值被當成色彩債，S2 收斂到最後會永遠剩這一筆 |
| 2026-09-18 | S2 新增 `--tree-gen-avatar-1/2/3`、`--tree-gen-badge-1/2/3`（+ 對應 foreground）共 8 個 token，僅供 `ReferralTreeView.tsx` 的世代色使用；avatar（實心底配白字）與 badge/line（淺底提示框）需求相反、無法共用同一組灰階，且都要與既有失效狀態灰（`--muted-foreground`）保持可辨識距離，`globals.test.ts` 新增對比度與亮度差斷言驗證 | plan.md §4 第 5 點已預留「S2 逐案判斷，必要時提報新增灰階 token」的空間；此為 S1 二審 R2-UIUX-1 點名、留給 S2 落地的項目，具體配色仍待驗收站 1 業主用深色模式實機確認 |
| 2026-09-18 | 業主逐一核准 15 項規則字面未說死的收斂判準（資訊/進行中類統一走純灰階、金額正負色例外保留語義色、`RewardHistory` 來源分類與 `gender.ts` 身分標記去色、品牌 icon 色維持等），詳見本次 PR 描述 | 53 個檔案、655 處手刻色跨多種語境，機械規則無法窮盡所有分類判斷，Plan Mode 階段以互動問答方式逐一收斂成可執行決策，避免實作階段各自詮釋 |
| 2026-09-18 | `/review-implementation` 四視角回填並修掉 P1：(1) `ReferralTreeView.tsx` 的 `GEN_LINE` 誤借用淺底 badge token 當邊框色，淺色模式對比僅約 1:1，改借用 avatar 深階（≥3:1），`globals.test.ts` 補上 border-vs-背景斷言；(2) `ProgressBar.tsx` 外層容器與軌道同用 `bg-muted` 導致「未完成」部分視覺消失，軌道改用 `bg-muted-foreground/20`；(3) 多處把 A 形狀（實心底）token 直接當裸字/裸圖示/邊框色用（`RewardHistory.tsx` 金額正負色、`WithdrawalProcess.tsx`/`WithdrawalSection.tsx` 提領狀態、`IdNumberInput.tsx` 表單驗證態等 8 檔約 16 處），深色模式對比可低至 1.79:1，全數改用 `*-subtle-foreground`/`*-border`；(4) `StatusCallout` 新增 `action` slot（互動元素不再被 `description` 的 `opacity-90` 包住）與 `titleAs` prop（復原 4 處被替換掉的真標題語意：`RequireMembershipRoute.tsx` h2、`AdminSetup.tsx`/`MonthlyKingProgress.tsx` h3、`CollectionConfirmDialog.tsx` h4）；(5) `CollectionConfirmDialog.tsx` 補做原本只做一半的 `StatusCallout` 轉換；(6) `ReferralStats.tsx` 圖示色拉平為 `text-muted-foreground`（政策 6 一致性）；(7) `check-color-usage.py` 補上 plan 原本要求但漏做的 `EXCLUDED_PATHS`——`SignaturePad.tsx`/`inviteCardImage.ts` 兩個窄範圍純繪圖檔收進去，`InviteFriendPanelContent.tsx`/`MemberVerifyQrTab.tsx` 判斷是一般頁面元件、整檔排除會失去對其餘部分的棘輪保護，改維持留在 baseline（這點與 plan 原文字面「多數應收進 EXCLUDED_PATHS」不同，是實作期依風險重新評估後的收斂，非疏漏）；`ServiceProviderDetail.tsx` 補上品牌色例外的行內註解 | 四個 reviewer（系統/架構/UIUX/需求）各自獨立發現 GEN_LINE 對比度問題並交叉確認；ProgressBar、A 形狀裸用兩項由 UIUX/需求視角實測數值抓到；StatusCallout slot 缺失由架構視角發現並擴散到 5+ 處消費站；其餘為各自視角抽查命中。這批修正沒有一項是「規劃審過、實作走偏」——多數源自 plan.md 本身措辭模稜兩可（例如「`--success`（或 `-subtle-foreground` 裸字）」把 A/C 兩種形狀並列成等價選項），照 review 契約「規劃本身有洞」與「實作走偏」都算審查職責，一併回填 |
| 2026-09-18 | S2 合併後對照檢查：業主核准的 15 項判準中可複用的 6 條沉澱進 `ui-ux-guidelines.md` §12.5，§12.3 補「B 形狀走 `StatusCallout`／`Badge` variant、不手刻三件組」；既有 `text-destructive` 裸字記入遺留事項 | 判準原本只存在 PR #325 描述裡，S3 起的 session 讀 §12 看不到，同型情境會重新裁決一次；元件化的規則沒進 §12，後續 session 很可能又手刻三件組 |
| 2026-09-18 | `MaintenanceBanner.tsx` 刻意不套用 `StatusCallout`（只換色票），因為該橫幅有獨立關閉鈕與置中版面契約，`MaintenanceBanner.test.tsx` 逐條釘住版面結構，硬套會拆版面；理由已寫在程式碼註解裡，這裡補記一筆讓它也出現在異動記錄，不只留在程式碼裡 | 架構視角 review 指出這個偏離只留在程式碼註解、未出現在 progress.md，依契約「未記錄的偏離」要處置 |

## 遺留事項

- **既有的 `text-destructive` 裸字約 19 處守門抓不到**（`formHelpers.tsx`、
  `WithdrawalManagement.tsx:781`、`MemberManagement.tsx` 多處、
  `OTPVerificationPage.tsx` 等，幾乎全是表單/載入錯誤態）：§12.3 要求裸字走
  `*-subtle-foreground`，淺色模式 `#d4183d` 對白底約 4.9:1 過關，深色模式
  `#82181a` 對深底只有約 1.7:1。這些不是 S2 造成（S2 只修了自己引入的 16 處），
  而且 `check-color-usage.py` 的 C1–C3 只抓調色盤 class、**抓不到「token 用錯
  形狀」**。深色模式目前無切換入口所以無實際影響；排進 S7 的 F3 三態巡檢
  一併處理（它們就是錯誤態）。
- **`awaiting_collection`（待查收）狀態在 admin 與會員兩處顏色語意不一致**：`WithdrawalManagement.tsx`（admin 視角）用 `variant="warning"`（醒目黃，規劃當時就是這樣寫），`WithdrawalSection.tsx`（會員視角，本次 S2 業主核准的政策 13）用 `variant="secondary"`（中性灰）。需求視角 review 指出：業務流程上真正「需要動作」的其實是會員（要去確認收款），admin 端反而是等待中，兩邊的顏色安排恰好相反。兩處目前都各自忠實反映了規劃書的逐字指示，不是實作錯誤，但業主應在下一次接觸這兩個檔案時確認是否要拉平（同一狀態、同一注意力層級），或維持現狀（admin 用醒目色提醒「這筆在等會員」、會員視角用中性色標示「這是流程正常的一步」也是站得住腳的設計理由，需業主定調）。
