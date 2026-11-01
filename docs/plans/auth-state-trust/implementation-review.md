# 登入狀態信任（T1）實作審查報告——PR-A（PR #466）

<!-- /review-implementation 彙整四個 fresh-context reviewer 的發現。只彙整、去重、排序，不改判。
     輸出契約見 docs/_templates/review.md。審查對象：feature/auth-state-trust HEAD 75506d59 相對 origin/develop 的實作 diff
     （43 檔、+4095／−362）；對照 ./plan.md v4.1、./review.md、./progress.md（A2b／A3 補記、Blockers）。
     範圍只有 PR-A（A0–A4）；PR-B（B1–B3）未做為預期，不列偏離。審查日 2026-11-01，第 3 波 T1 審查 session（唯讀）。
     本檔由實作 session 依審查 session 傳來的全文寫入（審查 session 唯讀），並依其補充訊息改三處裁決狀態。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 0 | 3 | `isFirstTimeFunnel`／gate 判定、reducer outcome 表與 transient、single-flight 鍵與 `clearInflight`、generation counter、主要登出路徑清提示 |
| 架構 | 0 | 0 | 3 | context 形狀與所有 consumer 回落、appShell import 邊界守衛、`redirectForGate` 薄包裝、`FUNNEL_ROUTES` 比對（逃生口 2 放寬未削弱語意）、`localStorage.user` 零寫入 |
| UI/UX | 0 | 3 | 5 | 五 view 結構、E4 文案依目的地、BottomNav／padding／`hasBottomNav`、`useFunnelLogout` toast 與導頁、同 DOM 節點、placeholder `aria-hidden`、member-pending `aria-busy` |
| 需求 | 0 | 0 | 6 | §0.1 裁決溯源、`isFirstTimeFunnel` 忠實 D1＝A、範圍無蔓延、A4 規格書 §2.1／ui-ux §3 與程式一致、§14 #8 未動 |

去重後：**P0 0／P1 3／P2 14**。未記錄偏離升 P1 的只有 1 項（S9 CLS 缺情境）。

CI（75506d59）：guards、static-checks、unit-tests、api-tests、build-bundle、journey-offline、Cloudflare Pages 綠；**e2e-tests 審查時仍在跑**；journey-full skipped（非晉升 PR，預期）。

### 主 session 指定五個重點的結論

1. **`isFirstTimeFunnel` 誤判有效會員**：不會。admin、`accountStatus==='active'` 在 `classifyMembershipGate` 先短路；`suspended`、有 `subscriptionEndDate`（續約，含續約待開通）、`accountStatus==='unknown'` 直接回 false；後端只回 `acct?.status ?? 'expired'`，無 `subscriptionEndDate` 的 expired 即從未訂閱者（四位 reviewer 一致；系統、需求逐格核對）。唯一邊角是 F1 來源（資料未齊）不經 gate——見〈需人工裁決〉1。
2. **登出路徑清 `uknow:auth-hint`（S11）**：SIGNED_OUT、bootstrap 401／404／410、Navbar 會員登出、`useFunnelLogout`、apiClient 過期、CompleteProfile 兩處皆清；Navbar 與 `useFunnelLogout` 失敗補 `scope:'local'`。AuthPage 三處只靠間接清除——P2（系統 P2-2）。
3. **冷啟動 `/profile` 恰一次**：bootstrap＋AuthPage 同掛載在請求仍在飛時合併為一次；但合併只涵蓋 in-flight，bootstrap 先回來時 AuthPage 會補打第二次——「恰一次」是機率性的，影響請求量不影響正確性——P2（系統 P2-1）。
4. **context 形狀波及所有 consumer**：無缺口。新欄位皆 optional，讀 `authView` 的三處都有 `isLoggedIn` 回落，`ingestProfile` 走 optional 呼叫並有「未提供」測試；`RequireMembershipRoute.test.tsx` 未改。
5. **e2e S1–S11 是否真的驗到**：大致是，但 **S9 CLS 只掛在 S1 與 S3**（S4、S3′、記憶漏斗提示三情境沒有 `the header layout never shifted`）——P1；BottomNav「首繪即存在」、S5 時限、S8 容差、OTP 驗證後等斷言較 plan 弱——P2。

## 發現清單（依嚴重度排序）

### P1

- **[P1]〔§1.1 S9、§4.1〕S9 要求 S1、S3、S4 頁首 CLS=0，e2e 只在 S1（`route_guards.feature:103`）與 S3 Outline（`:119`）斷言；S4「無提示進漏斗頁、placeholder 轉登出鈕」（`:146`，最容易位移的一格）、OTP 驗證前（`:139`）、記憶漏斗提示（`:127`）都沒斷言；progress.md 未記錄（UI/UX；未記錄偏離）→ 三情境補 `And the header layout never shifted`。**
  - 彙整註記：需求 reviewer 寫「S9 掛在 S1、S3、S4」與此不符；彙整者已以 `grep -n "never shifted" e2e/features/route_guards.feature` 核對，只命中 103、119 兩行，依 UI/UX 原判。
- **[P1]〔§4.3 第 3 點、ui-ux-guidelines.md 停用外觀〕`aria-disabled` 無任何停用外觀：`src/components/ui/button.tsx:24` 只有 `disabled:` 樣式；`Navbar.tsx:157`（無 tradeNo 時的「查看開通進度」）與 `:169`（登出中）只加屬性，使用者看到正常 primary／ghost 鈕、點了沒反應；`signOut` 無逾時，網路卡住時像凍結（UI/UX）→ 補 `aria-disabled:` 停用樣式（如 opacity＋pointer-events）。**
- **[P1]〔§4.2、Q7〕完善資料頁「稍後註冊」（`CompleteProfile.tsx:963–971`，全寬 secondary 醒目鈕）呼叫 `DELETE /auth/cancel-signup` 不可逆刪帳號並清草稿（`:614–644`），無確認框；toast「您可以稍後再完成註冊」（`:647`）暗示可接續；本 PR 在同頁頁首新增 ghost「登出」（真正保留資料的出口），兩個語意相反的出口並存、手機上視覺權重壓過頁首（UI/UX）〔已裁決 W3-12：本 PR 補 AlertDialog 確認框，施工中〕。**
  - 依指示只評估風險、不提修法；業主裁決中。plan §4.2 的緩解（確認框加一句導向「登出」）因確認框不存在而整句未落地——已記錄於 progress.md。

### P2

**系統**
- [P2]〔§2.4／§5 A2b「恰一次」〕single-flight 只合併 in-flight（`fetchProfile.ts:34`）；AuthPage 登入（`AuthPage.tsx:364`）與冷啟動直進 `/login`（`:189`）若 bootstrap 請求已先回來會多打一次 → 加請求計數斷言；若驗收要求嚴格為 1，讓 AuthPage 吃 bootstrap 結果或短暫快取已完成結果。
- [P2]〔S11〕AuthPage catch 路徑（`AuthPage.tsx:212–220`）與 401／404／410 路徑（`:196–201`、`:374`）未顯式 `clearAuthHint()`，靠 SIGNED_OUT／bootstrap 間接清；catch 且 global `signOut` 網路失敗時 SIGNED_OUT 不發、提示殘留 → 三處補 `clearAuthHint()`。
- [P2]〔§2.2／S11〕bootstrap unauthorized 的 `await supabase.auth.signOut()`（`useAuthBootstrap.ts:177–179`）無 try/catch、無 `scope:'local'` 補償：丟例外成未處理 rejection；網路失敗時殘留 session 讓每次冷啟動重打 401（提示本身有清，S11 未破）→ 比照 Navbar／`useFunnelLogout`；若刻意留 PR-B `endInvalidSession`，progress 註明。
- （附記，系統 reviewer 未定級）reducer `setUser` 分支（`useAuthBootstrap.ts:116`）不做資料完整度分流，靠 `isFirstTimeFunnel(user)` 的 `profile` gate 補上，結果一致，建議註解註明不對稱。

**架構**
- [P2]〔§2.5 consumer 回落〕`authView ?? (isLoggedIn ? 'member' : 'guest')` 手抄三份（`BottomNav.tsx:36`、`HomePage.tsx:465`、`Navbar.tsx:38`），`resolveAuthView` 已有同規則 → 在 `authView.ts` 匯出共用回落函式。
- [P2]〔§2.5 Import 邊界〕`appShell.test.ts:147` 只認單引號 static import（漏動態 `import('../App')`）；`:131` `onSignedOut[\s\S]*?\n {4}\}` 依賴縮排 → 補動態 import 分支、改以區段錨點比對。
- [P2]〔§2.5 hook 介面〕實作多回 `isFunnel`／`nextFunnelRoute`／`hintVerified`／`sessionStalled`，`clearInflight` 改為注入（`App.tsx:163`）而非 hook 直呼；後兩者 progress 有記，注入與回傳欄位增加未記 → PR「偏離規劃說明」補一句。

**UI/UX**
- [P2]〔S1〕BottomNav「首繪即存在」以 `to_have_count(1, timeout=5000)`（`route_guard_steps.py:263–266`）驗，自動重試，只證明「profile 扣住期間存在」；observer 只記 header 文字 → observer 一併記 `nav[aria-label="主要導覽"]` 首現時點並與 `/profile` 放行比較。
- [P2]〔S5、§4.1〕開通換版時限 plan 5 秒、step 為 `timeout=10_000`（`:226`）；plan 要求 A3 手機實測 BottomNav 是否在導頁前遮住結果頁，無斷言也無紀錄 → 改回 5 秒或註明原因，補檢查或記實測。
- [P2]〔S8〕`tops` 容差 12px（`:338`，plan「top 相同」）、高度容 64／65；icon-only 登出「觸控 ≥44px」無斷言（實作有 `min-h-11 min-w-11`）→ 收緊或記錄理由，補觸控尺寸斷言。
- [P2]〔a11y〕member-pending 選單的 `<p role="status">` 放在 `role=menu` 內（`Navbar.tsx:228`），`forceMount` 關閉時是否隱藏未驗〔需人工裁決〕→ 螢幕閱讀器確認不誤報。
- [P2]〔§4.1／A3〕A3 逐頁載入指示確認、Q6 登出鈕樣式截圖定案，diff 與 progress 皆無證據〔需人工裁決〕→ progress 補記。

**需求**
- [P2]〔§2.1 `nextFunnelRoute`〕實作先判 `!isProfileComplete(p)` → `/auth/complete-profile` 再呼叫 `redirectForGate`，plan 只寫「F2 → `redirectForGate(p)`」；實務等價（只影響「待開通但資料未齊」罕見組合）→ progress 補一句或判定表補一格。
- [P2]〔§5 A3 member-pending〕plan 寫「選單 aria-disabled」，實作是頂端「載入中…」`role=status`、登出項可用；更友善但未記 → progress A3 補記。
- [P2]〔S1〕「從 PayUni 返回」無獨立情境（只測冷啟動進 `/`）→ 補一案或註明由 reload 情境涵蓋。
- [P2]〔S3〕OTP「驗證後」頁首只有登出無 e2e（UI/UX 同列，去重）；現只有 S3′（驗證前）與 `authView.test` 純函式 → 補一格 vitest 或 e2e，或 progress 註明由 vitest 取代。
- [P2]〔A4、F5〕PR 描述是否列三種已知限制，reviewer 無法從 diff 驗證 → 送審前核對 PR #466 描述。
- [P2]〔§2.5／§5 A3〕「漏斗路由主體載入態逐頁確認」只有一句結論，未說明可讀性（文字或 `role=status`）是否逐頁確認（與 UI/UX P2 同源，保留各自表述）→ progress 補逐頁紀錄。

## 需人工裁決

1. **F1 的 `isFunnel` 不經 gate**（系統）：reducer `profile` 分支把資料未齊一律放進 `funnelProfile`，`isFunnel = !!state.funnelProfile`（`useAuthBootstrap.ts:103–106`、`:285`），不看 `isAdmin`／`accountStatus`。admin 或 active 會員若 `name`／`phone`／`birthDate` 缺（例如 admin-setup 建的舊帳號）頁首會是「只有登出」。plan §2.1 F1 表即如此定義，**非偏離**；且現況 `ProtectedRoute` 不放行、`shouldRedirectToCompleteProfile` 本就把這類人從任何路由導去完善資料頁，行為未變壞。請業主確認是否為期望（`authView` 另有 `isFunnel && !isAdmin` 雙保險，admin 實際會畫什麼建議實作 session 核對一次）。
2. **已裁決 W3-12、施工中——Q7 嚴重度**（UI/UX 判 P1，需求列需人工裁決）：不可逆＋零確認＋toast 誤導；非本 PR 引入，但本 PR 讓安全出口與破壞性出口同頁並存、對比更突顯。另：`cancel-signup` 失敗被吞（`CompleteProfile.tsx:625–630` 只 log），前端仍清本機並登出，使用者以為已刪實則仍在（較安全的方向，但畫面不一致）；規格書 §2.1 新列「登出不刪帳號、不清草稿」只針對頁首登出，未區分兩個出口。依指示不提修法。
3. member-pending 選單 `role=status` 位置（UI/UX P2）。
4. A3 載入態逐頁確認與 Q6 截圖證據是否已完成（UI/UX、需求 P2）；Q6 已裁決維持 ghost。
5. 本彙整**未降級、未剔除**任何發現；唯一的事實衝突（S9 掛載範圍，需求 vs UI/UX）已以 grep 核對並依 UI/UX 原判，見 P1 第一條註記。

## 已記錄偏離的確認

- A1 逃生口 2（業主裁決放寬比對）：架構確認放寬只是 JSX 空白容忍（`<Route\s+path=`），仍能抓「路徑不在路由表」，另有 `/payment/result/` 與 `/payment/result-x` 兩格，語意未削弱。
- Q7：見上。
- Navbar 會員登出 `startTransition` 降級：plan §5 A3 允許；不可降級項（`clearAuthHint()`、失敗補 `scope:'local'`）已做（`Navbar.tsx:71`、`:83`）。

## 處置（人審後填寫）

<!-- P0 的處置規則：必須修掉再 push，或由人在此明文豁免。 -->

- [x] P0：無。
- [x] P1 三項處置（主 session 2026-11-01 指示全修，紅 `cb402eff`／綠 `6038efe5`；Q7 紅 `d76df44f`／綠 `927b6854`）：
  - S9 CLS：■ 修——無提示進漏斗頁、OTP 驗證前、記住的註冊中三情境補 `the header layout never shifted`。
  - `aria-disabled` 停用外觀：■ 修——`button.tsx` 加 `aria-disabled:opacity-50`／`pointer-events-none`；另 `signOutWithFallback`
    給 global 登出 5 秒逾時，逾時走 `scope:'local'`（`useFunnelLogout`、Navbar 會員登出、bootstrap 401 共用）。
  - Q7：■ 依業主裁決 W3-12——AlertDialog 確認框；觸發鈕改破壞性紅框字；cancel-signup 失敗／斷線時顯示原因、停在原頁、
    不清本機不登出；成功 toast 改「已刪除帳號資料，之後可以用同一個 Email 重新註冊」；規格書 §2.1 區分兩個出口。
- [x] P2：已修——AuthPage 三處 `clearAuthHint()`、bootstrap 401 後 signOut 失敗補 local（不再未處理例外）、
  `authViewOrFallback` 取代三份手抄回落、appShell 守衛涵蓋動態 import 與區段錨點、reducer `setUser` 註解不對稱。
  記債（寫進 PR #466「偏離規劃說明」）：「恰一次」只合併 in-flight；hook 回傳欄位與 `clearInflight` 注入；BottomNav 首現
  時點未與 `/profile` 放行比較；S5 時限 10 秒（PaymentResult 3 秒輪詢＋開通回應，5 秒會在慢 runner 抖）；S8 容差與
  icon 觸控尺寸未斷言；member-pending 的 `role=status` 位置；`nextFunnelRoute` 先判資料未齊；從 PayUni 返回由 reload
  情境涵蓋；OTP 驗證後由 `authView.test` 純函式涵蓋；載入態逐頁只確認有 spinner／表單。
- [ ] 〈需人工裁決〉1（F1 資料未齊的 admin／active 舊帳號頁首只剩登出）：主 session 詢問業主中，本 PR 未動。
- [x] 人審完成,裁決:■ 修訂後通過（主 session 2026-11-01：P1 全修、P2 小修＋記債後收尾轉 ready）
