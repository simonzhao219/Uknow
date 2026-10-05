# 後台資訊架構重構（S3）規劃書審查報告

<!-- plans-keep: S3 施工中的三段式鷹架（審查已回填，待人審）；退場條件＝/tdd-implement 收尾、PR 合併前整個 docs/plans/admin-ia-refactor/ 刪除 -->

> 審查對象：`./plan.md`（定稿版，commit 於 #359）。四個 fresh-context reviewer 平行審查，2026-10-05。
> 聚合規則：只彙整、去重、排序，不改判；重複發現以最高嚴重度保留並標出來源。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 3 | 3 | API 無變更、端點與 journey bootstrap 路徑保留、DB/RLS/金流不涉及 |
| 架構 | 0 | 2 | 4 | 模組邊界（純呈現＋props 注入）、擇一渲染慣例、階段依賴順序、knip 無死碼、規格書靠人工清單屬實 |
| UI/UX | 0 | 4 | 4 | BottomNav 契約不受影響、AdminSetup 退場的 IA、三態沿用、筆數提示移位符合 §5、tone=secondary 符合 §12.11 |
| 需求 | 0 | 2 | 3 | 四條硬約束全覆蓋、Q1–Q3 落實、無範圍蔓延 |

去重後：**P0×0、P1×9、P2×9**。

## 發現清單（依嚴重度排序）

### P1

1. **[P1]〔§3 跨層契約／§5 階段 1〕「會員」與會員頁內層分頁「會員列表」撞名**（系統＋架構）——
   `MemberManagement.tsx:236` 的 `會員列表` 也是 role=tab；Playwright name 子字串比對下 `name="會員"`
   會同時命中兩者 → strict-mode violation，mock e2e 可能綠、journey 才炸。
   → `AdminDashboardPage.tab()`（`e2e/pages/admin_dashboard_page.py:31`）、`_open_tab`（`test_overflow_sweep.py:404`）、
   `test_overflow_sweep.py:393/451`、`f70_renewal_saga_steps.py:151` 一律 `exact=True`，並在 §3 把撞名案例寫明。
2. **[P1]〔§2 A1-a／§1 驗收 5〕bootstrap checklist 步驟內容未定義**（系統＋需求）——GUI 退場後這段文件是唯一人類入口。
   須寫明：前置（先完成前台註冊並補完 profile，否則 RPC 回 `not_found` 也轉 403——
   `migrations/20260718000102_admin_members_announcements.sql:158-161`、`api/index.ts:1742-1743`）；
   取得 access token 的可複製方法；完整 URL（develop／正式站 ref 不同）；預期回應與 403 的兩種意義；
   自驗（`GET /admin-setup/check` 看 `isAdmin:true`）；提醒新環境部署後盡快宣告（第一個呼叫者即成為管理員）；
   編號進 `:498-518` 快速檢查表、各環境各做一次。→ 驗收 5 改為「逐步照做能得到 `is_admin=true`」。
3. **[P1]〔§2 A2／§5 階段 3〕CSV 重入與篩選一致性**（系統）——`setIsExporting(true)` 要等 re-render 才 disabled，
   同 tick 連按會跑兩輪收集、下載兩份；收集迴圈閉包取舊 `statusFilter`，期間切篩選／重新整理會下載與畫面不一致的檔。
   → `useRef` 旗標入口同步守門；匯出期間一併 disable 篩選 Select 與重新整理（或明定以按下當下的篩選為準）；
   `try/finally` 包整個函式本體（含 blob 與 `link.click()`）；測試加「連點兩次只一輪 load 序列」「收集 reject 後復原＋顯示錯誤」。
4. **[P1]〔§4 AdminToolbar〕`aria-label` 一律存在違反 WCAG 2.5.3、蓋掉可見的「匯出中…」**（UI/UX）——
   且名稱由「下載CSV」改「下載 CSV」會打破 `WithdrawalManagement.test.tsx:181/193` 的查詢，未列入清單。
   → 文字用 `<span className="sr-only md:not-sr-only">` 承擔名稱、icon `aria-hidden`、不設 aria-label；
   或只在 icon-only 斷點設 aria-label 並在階段 3 明列測試名稱同步。
5. **[P1]〔§4 CSV 忙碌態〕自刻忙碌態，未沿用 `ui/button.tsx:189` 的 `loading` prop；焦點與完成回饋未處理**（UI/UX）——
   → 用 `loading={isExporting}`（loading 時不渲染 Download icon 免雙 icon）；`sr-only role="status"`「匯出中」；
   完成後 `setActionMessage` 回報「已匯出 N 筆」（LINE 內建瀏覽器下載常無聲）；確認上限拒絕訊息（`:340`）在手機視線內並入測試。
6. **[P1]〔§4 會員頁 filter slot〕Input＋送出鈕＋重新整理三件在 375px 未量測**（UI/UX；架構 P2 同點）——
   估算 Input 剩約 140–150px，placeholder「搜尋姓名 / Email / 電話」約 170px 會截斷（`MemberManagement.tsx:500` 已記錄 P8 擠壓）。
   → 二選一：移除搜尋送出鈕靠 Enter，或改緊湊內距 `px-3`；縮短 placeholder；e2e 斷言「375px 同列、無橫向溢出、placeholder 完整」；
   順補送出鈕 aria-label（`:521` 現無）；AdminToolbar 兩顆鈕明確 `type="button"`（放進 form 才不會變 submit）。
7. **[P1]〔§4 icon 鈕尺寸〕`size-11`＋`md:` 是新發明的尺寸／斷點模式**（UI/UX；架構 P2 同點）——
   既有慣例是 `size="icon"`（`size-9 pointer-coarse:size-[44px]`，`button.tsx:62`），44px 靠 `pointer-coarse:` 而非寬度；
   自訂 `size-11` 與 `size="sm"` 的 `h-8` 有 tailwind-merge 衝突。→ 以 `size="icon"`／`size="sm"` 為基底並寫明覆寫哪些 class，
   或明說刻意偏離的理由。
8. **[P1]〔§5 階段 4 vs 母計畫 §2.6〕母計畫列的 `App.tsx:71` 同措辭註解未交代**（需求）——實查 `App.tsx` 已無「5 欄」措辭，行號過時。
   → 階段 4 加「核對 `App.tsx` 無殘留（母計畫行號已失效）」，§3「App.tsx 不動」改「經核對無需改動」。〔需人工裁決：可降 P2〕
9. **[P1]〔§5 階段 1 清單〕漏列 `src/components/AdminDashboard.test.tsx`**（架構）——`:28` `TAB_LABELS`、`:39` 註解、`:69` 以長度斷言。
   → 明列進清單，斷言「無管理員設置、tab 總數＝4」。

（原 P1 合計 3＋2＋4＋2＝11，第 1、2 條各合併兩個 P1 → 9 條；第 6、7 條另併入架構的同點 P2，以 P1 保留。）

### P2

10. **[P2]〔§5 階段 3〕重新整理忙碌態來源不一致**（系統＋架構）——提領頁用本地 `isLoading`、會員頁用 `list.isLoading`；
    `loadMore` 進行中按 reload 會把舊頁尾接到新列表（`usePagedList.ts:64-77`）。→ prop 名定為 `isRefreshing`（呼叫端傳 isLoading），
    `isLoadingMore` 時也 disable；註明沿用整列骨架行為（S5 再做 SWR）；測試驗重新整理後保留搜尋字串。
11. **[P2]〔§2 A1-a〕文件措辭別寫成「已定案不提供」旁白**（系統）——規格書補句只寫最小事實（`document-writing.md`）。
12. **[P2]〔§7〕收尾 grep 範本漏「系統告警」與 `AdminSetup|admin-setup`**（系統＋需求）→ 補上，只允許後端與 journey builder 殘留。
13. **[P2]〔§1 驗收 1〕「桌機四欄等寬」無測試落點**（需求）→ 補桌機 viewport 斷言或明說不測。
14. **[P2]〔§1 看板遺留項〕`--brand-subtle` 結案沒落在階段**（需求）→ 加進階段 4 清單。
15. **[P2]〔§4 CSV 位置〕CSV 改成最右 44px 純 icon 後誤觸成本變低，而它會下載身分證與帳號**（UI/UX）→ 鈕距 ≥8px、tooltip／sr-only 註明含敏感資料。〔需人工裁決是否值得做〕
16. **[P2]〔§4 分頁標籤〕可改「視覺二字、sr-only 保留完整名稱」**（UI/UX）——e2e/journey 舊名稱不必改，晉升紅風險大減。〔需人工裁決〕
17. **[P2]〔§4 量測法〕只量 375px**（UI/UX）→ e2e 加 320px 一組。
18. **[P2]〔§3 範圍〕`SystemAlerts.tsx:73-84` 第三套自刻重新整理鈕未套 AdminToolbar**（UI/UX）→ 在不做清單寫明理由與退場條件，或確認版面本來就不同。

（架構 P2「`supabase-setup-checklist.md:461`／`e2e-journey-test-design.md:186` 確認不用改」併入第 12 條的收尾核對，不另列。）

## 需人工裁決

1. **分頁可及名稱**（第 16 條）：視覺二字＋sr-only 完整名稱（e2e/journey 不必改、撞名問題第 1 條也消失），vs 名稱就是二字（字面「同一套字串」）。
   業主 Q2 裁決的是「看到的字」，此方案不違背；但它也讓第 1 條的 `exact=True` 修正變成非必要。
2. **會員頁搜尋送出鈕去留**（第 6 條）：保留＝輸入框更窄；移除＝手機靠鍵盤 Enter。
3. **CSV 防誤觸**（第 15 條）：要不要加 tooltip／sr-only 敏感資料提示。
4. **第 8 條降級**：`App.tsx:71` 行號已失效，是否降為 P2。
5. 系統視角提醒：刪「管理員設置」SweepRoute 前確認不在 `e2e/README.md` 必留清單（`check-e2e-mustkeep.py`）；reviewer 未逐字核對。

## 處置(人審後填寫)

<!-- P0 的處置規則:必須改 plan 並重跑 /review-plan,或由人在此明文豁免。
     tdd-implement 開工前會檢查:存在未處置 P0 → 拒絕開工。 -->

**需人工裁決**（業主 2026-10-05，#359 留言）：R1 a（追加：公告完整名稱改「系統公告」）、R2 a（含修正：放大鏡內嵌輸入框右側當 submit）、R3 a、R4 a；第 5 項已核對（不在必留清單）。

**P0**：無。

**P1 回填對照**（全數寫進 plan.md）：

| # | 處置 | plan.md 落點 |
|---|---|---|
| 1 撞名 | R1：sr-only 補字讓名稱維持現名，e2e／journey 不改名；`AdminDashboardPage.tab()` 仍加 `exact=True` | §3、§5 階段 1 清單 |
| 2 bootstrap checklist | 六項必備內容（前置／token／URL／兩種 403／自驗／時機）＋快速檢查表；驗收 5 改為可檢核 | §1 驗收 5、§2 A1-a |
| 3 CSV 重入與一致性 | `useRef` 同步守門、`try/finally` 包整段、匯出期間停用篩選與重新整理、測試連按／reject／上限 | §2、§5 階段 3 |
| 4 aria-label | 不設 aria-label；`sr-only md:not-sr-only` 承擔名稱；既有測試 `:181/193` 名稱查詢列入改動 | §4、§5 階段 3 |
| 5 忙碌態 | 沿用 `Button loading`、sr-only `role="status"`、完成「已匯出 N 筆」、錯誤位置確認 | §2、§4 |
| 6 會員頁 375px | R2：拿掉獨立送出鈕、內嵌放大鏡 submit（aria-label「搜尋」）、placeholder「搜尋會員」；e2e 斷言同列無溢出、placeholder 完整；兩鈕 `type="button"` | §4、§5 階段 3 |
| 7 icon 尺寸 | 以 `size="icon"` 為基底、`md:` 覆寫 `w-auto px-3` | §3 |
| 8 App.tsx | R4：降 P2，已核對無殘留 | §3、§5 階段 4 清單 |
| 9 AdminDashboard.test | 明列 `:28/:39/:51-69` | §5 階段 1 清單 |

**P2 採納**：10（`isRefreshing` 來源與 loadMore 停用）、11（措辭最小事實）、12（收尾 grep 補齊）、13（桌機等寬斷言）、
14（`--brand-subtle` 結案入階段 4）、15（R3）、16（R1）、17（320px 斷言）、18（SystemAlerts 列入不做並附理由）——全數採納。

- [x] 人審完成,裁決:■ 通過 □ 修訂後通過(豁免理由:) □ 退回重規劃（業主 2026-10-05，P0×0、P1×9 全數回填，未重跑審查）
