# 平台 UI/UX 全面重設計——進度看板

<!-- plans-keep: 進行中的跨 session 施工鷹架（S1–S8 尚未完工，工序見 construction-plan.md）；退場條件＝S8（G2）收尾時整個目錄刪除 -->

> 每個 session 開工先讀本檔，收工必更新。遺留事項只准記在這裡。

## Session 狀態

| # | Session | 工項 | 狀態 | PR | 備註 |
|---|---|---|---|---|---|
| S0 | 總綱與施工計畫 | — | ✅ 完成 | （本 PR） | 四個方向決策已與業主核對（plan.md §0）；四視角審查完成、P0×2/P1×7/P2×7 全數回填（review.md） |
| S1 | 設計語言地基 | D1+D2 | ✅ 已合併 | [#321](https://github.com/simonzhao219/Uknow/pull/321) | 五階段 TDD 紅綠循環全過；`/review-implementation` 四視角 P0×0/P1×3/P2×5 全數修掉；規劃檔已隨收尾清理，值得保存的決策已升級進 `construction-plan.md` §4.3、`ui-ux-guidelines.md` §12、`globals.css` 註解 |
| S2 | 全站色彩收斂 | D3 | ✅ 已合併，驗收站 1 通過（2026-09-18） | [#325](https://github.com/simonzhao219/Uknow/pull/325) | 53 個 baseline 檔案（含開工時漏列的 `TaskDashboard.tsx`，收尾核對時補上）全數收斂到 0，僅留 4 個已核准例外（品牌 icon 色、QR 功能色；canvas 專用檔已收進 `EXCLUDED_PATHS`）；Badge 新增 5 個 variant、新增 `StatusCallout` 元件（含 `action`/`titleAs` slot）；四視角 `/review-implementation` 跑完，P1 全數修掉（見下方異動記錄）；`npm run check`／`framework-check.sh`／`npm run build` 全綠。驗收站 1 業主於 develop 環境實測通過（含公告橫幅依嚴重度對應三態色的確認），可進 S3 |
| S2b | 強調色與語義色升亮 | D4 | ✅ 已合併（驗收站 1b 待業主） | [#331](https://github.com/simonzhao219/Uknow/pull/331) | 業主裁決配色 A（2026-10-03）；驗收站 1b。`--brand` 五 token＋`--ring`＋語義色實心層亮底黑字落地；連帶收斂 13 檔約 21 行裸 `text-destructive`（遺留事項第 1 條結案）；連結範圍含 4 處手刻連結（`Button variant="link"` 全站僅 1 處使用）。驗收站 1b 待業主，請目視：後台操作錯誤框改走 `StatusCallout` 後略有視覺差異（標題字重、無 icon）。業主裁決（PR 留言）已補：進度填色一律 brand、焦點環全不透明、段落內連結一律底線。預建待消費：`--brand-subtle`／`--brand-subtle-foreground` 已由 S2c 消費（推薦樹的選中列與「新」tag）；`Button variant="brand"` 仍零消費者（次要行動鈕），S2d／S3 若沒用到應移除 |
| S2c | 推薦樹狀態視覺化 | D5 | 🔄 Draft PR 待業主 review | （待回填） | 業主裁決（2026-10-03）；驗收站 1c。頭像底色綁訂閱狀態（訂閱中 success／即將到期 warning／已失效 muted／已停權 destructive，亮底黑字），右下角小點移除；世代退到縮排＋連接線（`--muted-foreground` 兩階透明度 100%／80%）＋灰色徽章，`--tree-gen-*` 八個 token 退場；列右側每個非訂閱中的狀態都有文字（剩 N 天到期／已失效／⊘ 已停權），即將到期整列 `warning-subtle`、選中列 `brand-subtle`；樹上方四顆狀態 chip（兼圖例、點選過濾），計數由 overview 新增的 `summary.statusCounts` 提供（本工程唯一動到 `supabase/functions/` 之處，DB 整合測試 `network-endpoints.test.ts` 只有 CI 的 api-tests 軌會跑）；30 天內加入顯示「新」tag。**實作期偏離 S2c prompt 三處，業主可在 PR 留言推翻**：連接線 100%／80%（非範例的 80／55／35）、已失效／已停權只淡化頭像與名字（狀態文字不淡化）、已失效 chip 與 pill 用 `text-foreground`——理由見異動記錄。過濾語意採「只隱藏確定沒有符合者」。驗收站 1c 待業主，請目視：不看圖例能否分出狀態、chip 過濾是否符合直覺、375px 列右側文字不換行、devtools `.dark` 看頭像四色與淡黃列 |
| S2d | 會員中心狀態總覽 | F4 | ⬜ 未開工 | — | 業主裁決（2026-10-03）；S2c 合併後才開；驗收站 1d |
| S3 | 後台資訊架構 | A1+A2 | ⬜ 未開工 | — | |
| S4 | 會員詳情重設計 | A3 | ⬜ 未開工 | — | 驗收站 2 |
| S5 | admin 資料快取 | A4 | ⬜ 未開工 | — | 驗收站 3 |
| S6 | 前台門面 | F1 | ⬜ 未開工 | — | |
| S7 | 會員區資訊層次 | F2+F3 | ⬜ 未開工 | — | 驗收站 4；F2 已由「視覺對齊」改寫為「資訊層次重設計」（2026-10-03） |
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
| 2026-10-03 | 追加工項 D4／session S2b「強調色與語義色升亮」：業主驗收站 1 後覺得整體太黯淡，比較「現況／A 墨黑＋靛藍／B 墨黑＋青碧／C 暖墨＋紫羅蘭」四組後裁決 **A**。新增 `--brand` 系列 token、`--ring` 改指 brand、語義色實心層改亮底黑字；淺深兩版對比度已預先算過全數過門檻（文字 4.5:1、邊框 3:1）。插在 S2 與 S3 之間 | 黯淡的根因是三件事疊加：冷灰低彩度、語義色用 700 階深土色、全站無強調色。方案只動後兩項，黑白骨架與主按鈕不變。比較板：https://claude.ai/artifact/2gDFw89N4X5GtRnahvzTGg |
| 2026-10-03 | 追加工項 D5／session S2c「推薦樹狀態視覺化」：頭像底色由世代改綁訂閱狀態、世代只留縮排與連接線、狀態計數 chip 兼圖例與過濾、即將到期列整列淡黃；`--tree-gen-*` 八個 token 退場 | 業主要求推薦樹「用顏色一目了然」。三代獎勵同額（§8.1），世代不影響收入而狀態直接等於收入，現況卻把最大面積的顏色給了世代、狀態只剩 11px 小點。與 §12.5 (c)／§12.7 相容、不新增色相；對照頁：https://claude.ai/artifact/CP9ay4KMZ6v7rND5r4NKPP |
| 2026-10-03 | S2b 業主裁決三項（PR #331 留言）：(1) `getProgressBarStyle` 移除、任務頁進度填色一律 `bg-brand`（亮底 success/warning 對淺軌道 1.3／1.8:1，狀態由 `x / y` 數字承擔）；(2) 8 個原語 `ring-ring/50` → `ring-ring`（brand/50 對白底 2.3:1）；(3) 段落內連結一律底線，`Button variant="link"` 常駐底線、`LegalMarkdown` 內文連結補底線（獨立成行的忘記密碼連結不加）。規則寫進 §12.3／§12.5 | 深色 brand 對內文僅 2.86:1 不足 1.4.1，不能只靠顏色 |
| 2026-10-03 | S2b 落地時兩項擴範圍（業主於 Plan Mode 逐題核准）：(1) `--destructive` 改亮紅後，裸 `text-destructive` 淺色對比 5.25→2.77:1，S2b 一併把 13 檔約 21 行收斂到 `*-subtle-foreground`／`*-border`（原排 S7）；(2) 連結改 brand 的範圍加 4 處手刻連結。另：`*-border` token 不能再重用 A 色（新 A 色對 subtle 底僅 1.6–2.5:1）；`ui-ux-guidelines.md` §12.3 標題、§12.5 三條與 §11 一處與新規範矛盾，同 PR 修正。實作期偏離一項：12.8 色盲實測發現深色選中分頁的 `dark:bg-input/30` 與軌道同色，文字改 brand 後選中態在 achromatopsia 下分不出（§12.7），故刪掉該覆寫、深色 pill 沿用 `bg-card`（brand 字對它 6.01:1）。童子軍：只還行為中性的 8 條 biome warning，`useExhaustiveDependencies` ×10、`noExplicitAny` ×8、`useSemanticElements` ×1 未動 | 純色彩 PR 不夾帶 effect 依賴與型別重構；其餘依實算對比度（與測試同公式）而非估值 |
| 2026-10-03 | 追加工項 F4／session S2d「會員中心狀態總覽」（需要注意區＋四張狀態卡、ReferralStats 改主數字＋狀態分解、`ui-ux-guidelines.md` 新增 §13 資訊層次三條通則）；S7 的 F2 由「會員區視覺對齊」改寫為「會員區資訊層次重設計」，分支改 `fix/frontend-member-hierarchy`，驗收 4 補主數字檢查 | 業主看了會員中心與推薦樹截圖，覺得「一片黑白、看不到重點」。根因不是色票：四張卡零資訊、與底部導覽重複，顏色沒有地方附著；資料（useUserListing／useReferralData／useTaskData／useRewardData）都在，只是沒拿出來放。S2b/S2c 解「有重點但看不見」，S2d/S7 解「根本沒有重點」。對照頁：https://claude.ai/artifact/4ckevNaHQv3JF217sjZive |
| 2026-10-03 | S2d prompt 補第六條：`StatusCallout` 依 variant 給預設狀態圖示，順手修 `TaskGuide` 領取說明（灰底配 ⚠）與 `SubscriptionStatusCard`（destructive 配 ⚠） | 業主指出領取說明的驚嘆號失去警示效果。內容是操作說明不是警告，灰底正確、⚠ 是舊藍框留下的錯配，S2 只換色沒重審圖示；全站掃過只有這一處明確錯配，但「只換色不換圖示」會再發生，所以把一致性收進元件 |
| 2026-10-03 | S2c 落地（Draft PR）：頭像底色由世代改綁訂閱狀態，世代退到連接線與徽章，`--tree-gen-*` 八個 token 退場，狀態 chip＋過濾，「新」tag；overview 新增 `summary.statusCounts`。**「世代灰與已失效灰互撞」的疑慮因頭像不再表示世代而消失**——它在本檔「遺留事項」章節本來就沒有條目，只出現在 construction-plan §4.3 驗收 1 與 `ui-ux-guidelines.md` §12.5(c)，後者已改寫成「同一個視覺編碼面不得同時承擔結構與狀態」 | 依 construction-plan §3 的 S2c prompt。實作期偏離三處：(1) 連接線用 100%／80%，不用範例的 80／55／35——55% 在淺色只有 2.1:1、深色 3.0:1，低於專案現行的非文字 3:1（以 `globals.test.ts` 同一公式實測，並新增對應斷言取代 tree-gen 對比測試）；(2) 已失效／已停權的 `opacity-55` 只套頭像與名字，不套狀態文字——整列套用會把「已失效」稀釋到 2.13:1、「已停權」3.02:1（皆 <4.5:1），而這兩段字正是 §12.7 的色盲防線、§12.8 第 3 步也明列要防 opacity 稀釋；(3) 已失效的 chip 與 pill 用 `bg-muted text-foreground`——`text-muted-foreground` 疊 `bg-muted` 只有 4.06:1（見遺留事項）。另：過濾採「只隱藏確定沒有符合者」（樹是懶載入，符合者的祖先與子代尚未載入的節點都保留，並顯示靜態提示，避免 chip 說有 N 位、畫面卻找不到人）；後端段（契約＋handler）另經獨立複審並回填四條（`deriveNodeStatus` 注入 now 並補邊界測試、狀態值單一來源 `NETWORK_NODE_STATUSES`、roots 缺節點改為 throw、e2e mock 預設值與不變式一致）。`e2e/test_overflow_sweep.py` 的 `/referrals` 測資補成「最壞但可達」（舊測資一代全是 active、沒有 chip 與狀態文字，量出來是假乾淨；「新」只配 active 與 suspended，因年費制下 30 天內加入者不可能剩 30 天到期）；journey f60 的 `get_by_text("已失效").first` 會被新 chip（計數 0 也渲染）變成恆真，改為收窄到該節點那一列（journey 不能本機跑，只做語法檢查） |

## 遺留事項

- **守門抓不到「token 用錯形狀」仍是結構性缺口**：`check-color-usage.py` 的 C1–C3 只抓
  調色盤 class，抓不到「A 形狀配寫死白字」「A 色當裸字/邊框」這類 token 誤用。S2b 已把
  當時既有的裸 `text-destructive`（約 21 行）全數收掉，並用 `button.test.tsx`／
  `badge.test.tsx` 釘住原語端；之後是否在 `check-color-usage.py` 加 C4 規則（A 形狀 bg
  與裸 `text-destructive` 的靜態檢查）可於 S7 評估。深色模式目前無切換入口所以無實際影響。
- **灰字疊在灰／淺色底上的文字對比不足，`globals.test.ts` 沒有這組斷言**：`text-muted-foreground` 疊 `bg-muted` 只有 4.06:1（淺色；深色 5.86），`bg-brand-subtle` 選中列上的灰色小字 3.89:1，皆低於文字 4.5:1。S2c 新增的文字已避開（已失效 chip／pill 用 `text-foreground`），但世代徽章依業主指定仍用 `bg-muted text-muted-foreground`，`ReferralTreeView` 的「N 位直接下線」徽章與選中列的灰字也是既有組合。S7 的 F3 巡檢時評估：調深 `--muted-foreground`，或這幾處改用 `text-foreground`，並補對比斷言。
- **`awaiting_collection`（待查收）狀態在 admin 與會員兩處顏色語意不一致**：`WithdrawalManagement.tsx`（admin 視角）用 `variant="warning"`（醒目黃，規劃當時就是這樣寫），`WithdrawalSection.tsx`（會員視角，本次 S2 業主核准的政策 13）用 `variant="secondary"`（中性灰）。需求視角 review 指出：業務流程上真正「需要動作」的其實是會員（要去確認收款），admin 端反而是等待中，兩邊的顏色安排恰好相反。兩處目前都各自忠實反映了規劃書的逐字指示，不是實作錯誤，但業主應在下一次接觸這兩個檔案時確認是否要拉平（同一狀態、同一注意力層級），或維持現狀（admin 用醒目色提醒「這筆在等會員」、會員視角用中性色標示「這是流程正常的一步」也是站得住腳的設計理由，需業主定調）。
