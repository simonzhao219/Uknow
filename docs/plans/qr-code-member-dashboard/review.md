# 我的 QR 整合頁（qr-code-member-dashboard）規劃書審查報告

<!-- 由 /review-plan 彙整四個 reviewer subagent（系統/架構/UIUX/需求）的發現而成。
     聚合規則：只彙整、去重、排序，不改判——severity 一律是 reviewer 原判。
     第 1 輪：plan.md 第 1 版（方案 A）。第 2 輪：plan.md 第 3 版（方案 B，人審裁決後）。 -->

## 審查結論（第 1 輪，plan.md 第 1 版）

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 2 | 2 | API 契約（方案 A 零後端變更成立）、資料庫/RLS、外部整合（PayUni 不適用）、邊界條件 |
| 架構 | 0 | 3 | 3 | 模組邊界（除資料夾放置外）、AdminRoute/lazy 群組結構、單一入口與狀態單一來源、命名慣例、bundle 預算與 code splitting 契約 |
| UI/UX | 0 | 2 | 3 | 觸控尺寸（36→44px 是還債）、三態完備、a11y（除 icon aria-hidden 外）、BottomNav 五格契約、`?tab=scan` 非管理員靜默落回、開放問題 #2 的建議站得住 |
| 需求 | 0 | 2 | 2 | 需求溯源（無腦補斷言）、方案 A/B 解讀與預設、三類 QR 表面全數涵蓋（無第四種）、業務規則（§5/§7–§10 未牽動） |
| **合計（去重後）** | **0** | **9** | **9** | 系統 P2「§3 路由表存取層級措辭」與需求 P2 同一發現，合併計一 |

## 第 1 輪發現清單（依嚴重度排序）

### P1（實作前應補）

1. **[P1]〔系統〕〔§2 系統設計「相機生命週期」/ §7〕** `MemberVerifyScanner` 的 `useEffect` 清理沒處理「unmount 發生在 `getUserMedia()` resolve 之前」：cleanup 當下 `stream` 仍是 `null`（stop 是 no-op），promise 之後才把值指派給同一變數，`if (cancelled) return` 直接離開，新拿到的 `MediaStream` 永遠沒人 `stop()`——這正是規劃 §7 點名的「相機指示燈常亮、下次 `getUserMedia` 因裝置忙碌失敗」的根因；從「整頁導航才卸載」搬進「一點就切分頁、隨時卸載」的 Tab 後機率顯著升高，而階段 2 只寫「卸載時停止所有 track」，穩態測法會綠燈卻抓不到 → 階段 2 另加「`getUserMedia` 延後 resolve、resolve 前就 unmount」的測試，元件在 resolve 後先檢查 `cancelled`、是就當場 `stop()` 剛拿到的 stream。
2. **[P1]〔系統〕〔§4 溢版巡檢 / §5 階段 5〕** 新增的兩條 `SweepRoute` 都靠 `after_load` 切到非預設分頁後只量一次；本次真正從盲區（過去要點開 Dialog）變成可直達路由的，是「邀請好友」預設分頁（含不斷行的推薦連結與長姓名），卻是唯一沒被掃到的畫面 → 比照 `/admin` 的作法，對 `/dashboard/qr`（已加入、不帶 `?tab=`）另加一條不帶 `after_load` 的 base entry。
3. **[P1]〔架構〕〔§5 階段 1〕** `resolveMyQrTab` 簽名從 `(canInvite, preferred)` 改成 `(available, requested, preferred)`，但呼叫它的 `MyQrDialog.tsx`（第 46、51 行）要到階段 4 才刪——階段 1 落地後 `tsc` 會以 TS2554 紅燈三個階段，不是「每階段一個獨立紅綠循環」 → 階段 1 同批把 `MyQrDialog.tsx` 兩處呼叫改成新簽名（或明講與階段 4 合併）。
4. **[P1]〔架構〕〔§5 階段 1〕** `MyQrTab` 加 `'scan'` 後，`normalizeMyQrTab` 仍硬編碼只認 `invite`/`verify`，規劃未列入——漏改則管理員 `writeMyQrTab('scan')` 成功、下次 `readMyQrTab()` 卻收斂回 `invite`，且 TypeScript 攔不到（純執行期邏輯） → 階段 1 驗收明寫「`normalizeMyQrTab('scan')` 原樣保留」。
5. **[P1]〔架構〕〔§5 階段 3〕** 表格寫「子面板替身化，同 `MyQrDialog.test` 作法」，表格後的說明卻主張「以真元件斷言（e2e/README 的 A 級證據）」——mock 掉子面板不符 A 級定義；站得住的是 B 級（決策函式已測 + `MyQrPage.test` 驗決策接進元件） → 改標 B 級，或真的渲染真子元件撐起 A 級；不解決會讓實作者與 `/review-implementation` 對「偏離規劃」誤判。
6. **[P1]〔UI/UX〕〔§4 + §3〕** 「我的 QR」有兩個入口（`MemberDashboard` 與 `ReferralManagement.tsx:119` 共用 `MyQrEntry`），規劃把 `ROUTE_HIERARCHY` 寫死 `'/dashboard/qr': '/dashboard'`——今日從 `/referrals` 開對話框、關閉留在原頁（推薦樹展開與捲動位置都在）；改成頁面後從 `/referrals` 進來按返回會被送到 `/dashboard`，弄丟瀏覽情境；`/referrals` 是 BottomNav 註解明講的高頻頁，且階段 3/4 的測試矩陣都沒涵蓋這條路徑 → 返回目的地依來源而定（`Link` 帶 `state` 記住入口，`MyQrPage` 返回鈕優先讀它、無則落回 `/dashboard`），並在階段 3/4 補「從 `/referrals` 進入、返回應回 `/referrals`」的斷言。
7. **[P1]〔UI/UX〕〔§4〕** 掃描分頁現在在 `Tabs` 之下，取景框上方多了頁首**與一整條 `TabsList`**，規劃只寫「＝既有取景框版面」沒重算 ui-ux §7 那條算式（舊註解的 288px 是「頁首後直接接取景框」的前提）；更關鍵的是驗收：規劃自己承認 headless 無相機只量得到手動輸入版面——**相機真正啟動、結果疊在取景框上的版面沒有任何自動化測試量過**，而 `test_overflow_sweep.py` 的設計目的也不是抓垂直定位 → 規劃書重新列出新版面的高度算式；測試面用 Playwright fake-camera flag（`--use-fake-device-for-media-stream`）或至少列出實機驗收項目，驗證相機啟動下的第一屏定位。
8. **[P1]〔需求〕〔§1 / §5 階段 3〕** 分頁組合只枚舉「已加入／未加入／管理員」三桶，未涵蓋「**管理員且未加入推薦計畫**」（只有會員驗證碼＋掃描驗證、無邀請）——`route_guards.feature` 已把「An admin without a subscription is not locked out」列為保留情境，而 `referralProgramJoined` 以付款為前提，此類管理員大機率未加入；這是本次重構第一次讓 `isAdmin` 與 `joined` 兩個獨立布林值在同一頁交叉 → 使用者故事與 `MyQrPage.test.tsx` 矩陣加一格「管理員 ∧ 未加入」，斷言兩分頁（verify+scan，無 invite）。
9. **[P1]〔需求〕〔§3 / §5 階段 4〕** 階段 4 只為 `MyQrEntry` 的 Link 化安排 href 斷言，沒有對等安排 `AdminDashboard.tsx`「會員驗證」捷徑（`/admin/verify` → `/dashboard/qr?tab=scan`）的測試；`AdminDashboard.test.tsx` 與 `admin_dashboard.feature` 都從未斷言過這顆按鈕的連結目標，使用者故事 3 那句話目前沒有任何測試守著 → 在 `AdminDashboard.test.tsx` 比照 `MyQrEntry.test.tsx` 補一則 href 斷言。

### P2（建議）

10. **[P2]〔系統〕〔§6 開放問題 #1 變體 B〕** 增量清單寫「登入且會籍有效者可呼叫」，只提 `accountStatus`，沒提 `profiles.suspended_at`——前端 `RequireMembershipRoute` 是用獨立的 `suspendedBlocked` 擋停權會員；若端點只驗會籍兩態，「已停權但訂閱未過期」的會員可繞過前端直呼端點掃到他人真實姓名與會籍 → B 另開規劃時把「排除 `suspended_at` 不為 null 的呼叫者」明列進授權條件。
11. **[P2]〔系統＋需求，合併〕〔§3 / 規格書 §3 路由表〕** `/admin/verify` 改成裸 `<Navigate>`（無守衛）後，路由表該列「存取層級」若照抄「管理員」就失真——轉址人人可觸發，真正守門在目的地；`check-spec-drift.py` 只比對第一欄路由字串集合，不會攔到 → 該列描述改成「舊路徑，轉址至 `/dashboard/qr?tab=scan`，不再單獨守門」（比照 `/referral-reward-contract` 那列）。
12. **[P2]〔架構〕〔§3〕** `MemberVerifyScanner` 改面板後留在 `admin/`，但手足 `MemberVerifyQrTab`/`InviteFriendPanelContent` 都在 `referral/`；目前 `admin/` 下每個檔案的唯一 import 來源就是 `AdminDashboard.tsx`（或 `App.tsx` 路由），這個不變式將首次被會員區頁面 `MyQrPage` 打破，且理由只在方案 A 成立期間站得住，而開放問題 #1 尚未收斂 → 在 §6 #1 補一句「若選方案 B，此檔需搬到 `referral/`（或新資料夾）」，讓未來決策者不必重推。
13. **[P2]〔架構〕〔§5 階段 3〕** `MyQrDialog.test.tsx` 的「標題下不放總述、`aria-describedby` 為 `undefined`」是 Radix Dialog 特有斷言，守的是「不把 QR 擠出手機第一屏、不重複說明」；`MyQrPage` 無此機制，階段 3 的 7 條驗收沒有等價項目，「4 條測試搬進去」不完全準確 → 加一條對應新頁首結構的等價斷言（如「副標與分頁內說明不重複」），或明講有意捨棄與理由。
14. **[P2]〔架構〕〔§3〕** `useBackNavigation` 新增 `'/dashboard/qr': '/dashboard'` 的理由寫「前綴比對其實已能命中」——實際追蹤：對 `/dashboard/qr`，迴圈先命中既有的 `'/dashboard': '/'`（因 `startsWith('/dashboard/')` 為真），回傳的是**首頁**不是會員中心；這行是必要修正不是防禦性寫法，措辭錯了會讓人日後誤砍，而 `useBackNavigation` 沒有任何測試守著 → 改成「不加會導回首頁，是必要修正」。
15. **[P2]〔UI/UX〕〔§4〕** 「icon 在 `<sm` 隱藏」套用到所有分頁，但限制只在 3 欄（管理員）成立；多數使用者看到的是寬裕的 2 欄（≈168px/格），今日帶 icon 的兩分頁完全放得下，卻要陪管理員極限情境一起降級；「會員驗證碼」70px 也是從「獎金提領管理」線性外推、非實測（餘裕 24px，風險不高） → icon 顯示與否依「實際渲染的分頁數」決定（3 欄才隱藏）。
16. **[P2]〔UI/UX〕〔§3〕** `MyQrPage` 走獨立 `lazyNamed`，把「同頁內、零網路依賴」的 Dialog 開啟換成需新抓一個 JS chunk 的路由跳轉——最典型情境正是「店家當面等你出示驗證碼」，是全流程最不能轉圈的一刻，目標受眾又是 LINE 內建瀏覽器；規劃「效能」段只評估棘輪，沒討論這段新增的載入延遲 → `MyQrEntry` 按鈕加 `onMouseEnter`/`onTouchStart` 觸發的 `import()` 預熱，或評估與 `MemberDashboard`/`ReferralManagement` 共享 chunk。
17. **[P2]〔UI/UX〕〔§4〕** 規劃會動 `invite-tab`/`verify-tab`/`scan-tab` 三顆 icon 的 class，但這幾顆 Lucide icon（沿用自 `MyQrDialog.tsx`）沒有 `aria-hidden`；ui-ux §9「碰到的檔案順手還債」 → 順手補 `aria-hidden="true"`。
18. **[P2]〔需求〕〔§3 / §7〕** 管理員經 `/admin` 捷徑進 `/dashboard/qr?tab=scan` 後，頁面返回鍵（`useBackNavigation` 是階層表導航、非瀏覽器歷史）固定導回 `/dashboard`，不像今日 `MemberVerifyScanner` 的 `navigate('/admin')` 回管理後台——對開放問題 #3 自己陳述的「管理員平日在 `/admin` 工作」是未被承認的導覽退化（有 Navbar「平台管理」可補救、非死路） → 至少在 §7 補記，或依 `?tab=scan` 的來源決定返回目的地（與第 6 條同機制）。

### 第 1 輪 Reviewer 額外確認（非缺口）

- 〔系統〕方案 A「零後端變更」成立；非管理員時 `MemberVerifyScanner` 根本不會掛進 DOM。
- 〔架構〕`MyQrPage` 自取 UserContext 與「單一入口、狀態單一來源」一致；`/admin/verify` 轉址逐一追四種身份組合，最終落地頁與舊路徑一致；`appShell.test` 三條 code-splitting 斷言不受影響。
- 〔UI/UX〕相機權限時機技術上與獨立路由相同；`?tab=scan` 靜默落回優於報錯；開放問題 #2 的建議站得住。
- 〔需求〕全 `src/` 只有三類 QR 表面，三分頁對應三類；方案 A/B 解讀與預設站得住。

## 第 1 輪需人工裁決

1. **〔UI/UX reviewer 標記〕相機啟動時機**：切到「掃描驗證」分頁即啟動相機，還是加一道「點一下才啟動相機」的緩衝鈕？聚合者建議切到分頁即啟動。
2. 聚合者已據上述發現修訂規劃書（第 2 版），未改任何 severity。
3. plan.md §6 的三個開放問題（掃描權限 A/B、儀表板 QR 縮圖、`/admin` 捷徑去留）待人裁決。

## 處置（第 1 輪，人審後填寫）

- [x] 人審完成（2026-09-01，simonzhao219 於對話中裁決），裁決：☑ 修訂後通過
      （第 1 輪無 P0；P1/P2 已於第 2 版採納；因裁決改走方案 B，規劃書改寫為第 3 版並
      **重跑一輪四視角審查**——見下方「第 2 輪審查」）
- [x] 開放問題 #1 掃描權限：☑ **B（開放所有會籍有效的會員，不另開規劃、併入本次）**
- [x] 開放問題 #2 儀表板 QR 縮圖：☑ 不放（規劃預設）
- [x] 開放問題 #3 `/admin` 捷徑：☑ 保留並改連（規劃預設）
- [x] 需人工裁決 #1 相機啟動時機：☑ 切到分頁即啟動（建議）
- [x] 追加裁決（方案 B 連帶）：非管理員掃到的姓名 ☑ 遮罩（`maskNameByGen(name, 2)`），管理員全名

---

## 第 2 輪審查（plan.md 第 3 版，方案 B）

四個 reviewer 都先核對「第 1 輪 18 條是否真的落實」：需求視角逐條確認 18/18 到位，
架構視角確認第 3、4、5、12、14 條到位、第 13 條部分到位（見第 2 輪第 21 條），
UI/UX 視角確認第 6、15、16、17、18 條到位、第 7 條的驗收工具有缺口（見第 10 條）。

### 審查結論（第 2 輪）

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 1 | 4 | 授權狀態機一致（`deriveNodeStatus` 四態覆蓋過期／停權／從未訂閱／開通中，前端 `canScan` 的 pre-image 等於後端 `{active, expiring}`）、端點守門對等性與冪等性、RLS 與索引、外部整合不適用、空集合／時區邊界 |
| 架構 | 0 | 0 | 4 | 模組邊界（handler 內授權有 `claim-reward` 先例；`member-verify.test` 的矩陣比 admin-gate 二元守門更細）、`appShell.test` 契約、檔案搬家與命名規則、migration 版號、階段 2↔3 紅綠獨立（前後端測試完全隔離）、`canScan` 狀態單一來源 |
| UI/UX | 0 | 5 | 4 | 資訊架構（BottomNav 五格）、互動模式一致性、依來源返回在 LINE／硬體返回鍵下的行為、溢版巡檢三條路由與 mock 規劃 |
| 需求 | 0 | 2 | 2 | 需求溯源（無腦補）、業務規則 §6–§10 未觸及、驗收矩陣整體、第 1 輪 18 條落實度 |
| **合計（去重後）** | **0** | **8** | **13** | 架構第 3 條與 UI/UX 第 9 條同一發現（頁首契約「不重複」的驗收方式），合併計一 |

### 第 2 輪發現清單（依嚴重度排序）

#### P1（實作前應補）

1. **[P1]〔系統〕〔§1 不做什麼 / §7〕** 「不加掃描次數限制」只反駁了暴力猜 token；方案 B 把可呼叫 `POST /members/verify` 的母體從少數 admin 擴大到全體會籍有效會員，對「一人持多筆合法取得的他人短效碼連續批次驗證」（側拍／截圖轉發正在顯示的 QR）這種以量取勝的濫用沒有節流或異常偵測，稽核只寫 Studio、無告警 → 比照 `/auth/check-email` 已有的 `bump_rate_limit` RPC，以 `verify:${user.id}` 為 key 對每位掃描者加一道寬鬆的每分鐘上限。
2. **[P1]〔需求〕〔§1 對照規格書 / 階段 6〕** 規格書 §13.1 有「為什麼／流程／安全／稽核」四段，規劃只列了後三段；「為什麼」現況只寫業主在門市確認來客，方案 B 的「會員之間也需要當面確認對方是不是有效會員」是規劃 §0 自己的動機，不改「為什麼」就會與改寫後的「流程」段自相矛盾 → 階段 6 把「為什麼」段納入，補一句會員互掃的動機。
3. **[P1]〔需求〕〔§1 不做什麼 / §6〕** 方案 B 讓被掃的一方第一次面對「陌生會員可看到我的遮罩名與會籍」；規劃只交代不做稽核查閱介面，沒處理「被掃方能不能知道誰掃過我」，人審至今沒表態 → 列為開放問題請人裁決（即使結論是不做，也要留下決策紀錄）。
4. **[P1]〔UI/UX〕〔§4 掃描分頁「第一屏重算」/ §7〕** 規劃承諾用既有 `first_screen_position` 斷言「`scanner-viewport` 底邊在第一屏內」，但該函式（`e2e/layout_probe.py` 的 `_FIRST_SCREEN_JS`）只回傳 `top`／`visible: r.top < innerHeight`，**不算高度也不算底邊**，且 `viewportHeight` 是原始 `innerHeight`、沒扣 `BottomNav`——套在頂邊 ≈306px 的容器上 `visible` 幾乎必為真，量不到規劃真正擔心的 563px 底邊 → 幫 `layout_probe.py` 補一個回傳底邊的探針變體，斷言改成「底邊 ≤ 667−56」。
5. **[P1]〔UI/UX〕〔§4 TabsList 三分頁算式 / §7〕** 沿用 `AdminDashboard` 的 `grid grid-cols-3` 四件套，但該頁自己的 `test_admin_tab_labels_do_not_ink_overflow` 明寫：grid 下標籤放不下是 ink overflow（畫到隔壁格子），`count_rows` 與一般溢版巡檢都抓不到，只有 `ink_overflowing_children` 抓得到；規劃驗證「會員驗證碼」70px 的手段只有非實測的線性外推與一般溢版巡檢，而方案 B 後三分頁是多數會員的預設畫面 → 為 `MyQrPage` 的 `TabsList` 加一條 `ink_overflowing_children` 硬斷言，或先取得 375px 實測值。
6. **[P1]〔UI/UX〕〔§4「切到分頁即啟動相機」/ §6 裁決 #4〕** `ui/tabs.tsx` 的 `Tabs` 沒設 `activationMode`，Radix 預設 `automatic`——鍵盤方向鍵在分頁間移動焦點就自動切換面板；疊上「切到分頁即啟動相機」，鍵盤與螢幕閱讀器使用者只是瀏覽三個分頁，方向鍵掃過「掃描驗證」就會掛載掃描器、立刻跳出相機權限請求；這是掃描第一次變成 `Tabs` 底下的一格，是本規劃引入的新互動面 → 在 `MyQrPage` 的 `Tabs` 實例上加 `activationMode="manual"`（不動基底），鍵盤仍需明確按鍵才觸發相機。
7. **[P1]〔UI/UX〕〔§4 掃描結果卡「不另加已遮罩標示」〕** `maskNameByGen` 目前只出現在推薦網絡二／三代與獎勵紀錄（要已加入推薦計畫且有下線才看得到）；方案 B 開放給所有會籍有效會員（含未加入推薦計畫者），這群人會在「當面確認對方是不是有效會員」這個最需要信心的一刻第一次看到「王○明」，可能誤讀成掃錯人或系統壞掉——「○ 是既有慣例」的前提對新受眾不成立 → 結果卡補一行低調說明（如「姓名部分遮蔽以保護隱私」），或驗收加一條「未加入推薦計畫的會員也看得懂遮罩名」。
8. **[P1]〔UI/UX〕〔階段 5，承接第 1 輪 #9/#18〕** 階段 5 只為 `AdminDashboard` 捷徑安排 href 斷言；`state={{ from: '/admin' }}` 不會反映在 `href` 上，純看 href 測不出它有沒有被漏接，`/admin/verify` 轉址的 `state` 同樣沒有斷言；漏加時 `AdminDashboard.test` 仍全綠，但從 `/admin` 掃完按返回會落回 `/dashboard`，悄悄重現第 1 輪 #18 → 比照 `MyQrEntry.test`，為 `AdminDashboard` 捷徑與 `/admin/verify` 轉址各補一條 state 斷言。

#### P2（建議）

9. **[P2]〔系統〕〔§2 第 2 步〕** `403 { code, message }` 是扁平信封，既不同於同一 handler 內 token／not_found／稽核失敗分支用的 `{ success: false, error: { code, message } }`，也不同於 `requireAuth` 全站慣用的 `{ error: string }`；目前能顯示訊息是靠 `apiClient.extractApiErrorMessage` 一個沒寫進註解的第三分支兜底 → 改用與同 handler 其他分支一致的 `{ success: false, error: { code: 'verifier_not_eligible', message } }`。
10. **[P2]〔系統〕〔§2 第 6 步〕** `maskNameByGen(name, 2)` 的 `gen` 語意是推薦「第幾代」，掃描者與被掃者之間無代數關係，`2` 是「強制走遮罩分支」的魔術數字 → 具名常數或註解說明「借用遮罩樣式、與推薦代數無關」。
11. **[P2]〔系統〕〔§2 稽核表 migration〕** `admin_id → verifier_id` 是本 repo 第一次真正的 `rename column`（既有慣例是保留欄位名、加註解標記語意已變：`is_canceled`、`grace_period_end`、`registration_step`），規劃沒對照這個慣例說明為何例外 → §7 補一句取捨理由（資安稽核追溯用途，欄位名誤導的代價高於一般業務欄位）。
12. **[P2]〔系統〕〔階段 6〕** `e2e/steps/dashboard_steps.py` 的 `open_invite_friend_panel` 註解寫「預設停在會員驗證碼分頁」，與 `DEFAULT_MY_QR_TAB = 'invite'` 及規劃 §4 矛盾（能通過純因接著硬點 `invite-tab`）→ 階段 6 順手改對。
13. **[P2]〔需求〕〔§1 對照規格書 / 規格書 §5.2〕** §5.2 寫「不硬鎖會員區，停權但仍在效期內的會員可照常瀏覽會員區」，但 `RequireMembershipRoute` 現況已是硬鎖（`suspendedBlocked` 直接回「帳號已停權」畫面），既有 spec-vs-code 落差；規劃重用同一守衛掛新頁卻沒把 §5.2 列進同步範圍 → 依「以程式碼為準、同一 PR 回頭修規格書」，本次順手把 §5.2 文字改到位，或至少在風險段註記為既有落差。
14. **[P2]〔需求〕〔階段 4〕** 返回白名單有三項，驗收只顯式列了 `/referrals` 與無 state 兩種，沒列 `state.from='/admin'` → 階段 4 明確加一條「`state.from='/admin'` 時返回導向 `/admin`」。
15. **[P2]〔架構〕〔§2 部署順序 / §7〕** 只點名「程式先於 migration」那個方向會讓稽核插入失敗；「migration 先套用」的正常方向同樣有對稱視窗（舊版仍在線的程式繼續寫 `admin_id`）；結論不變（fail-closed），但措辭讓人誤以為只有反向才有風險 → §7 補一句兩個方向都有一段稽核寫入失敗視窗。
16. **[P2]〔架構〕〔§1 故事 3 / 階段 4〕** 分頁矩陣的判斷式只寫 `joined`，但既有 `canShareInvite`／`canShowCode` 都是 `joined && !!referralCode` 複合判斷；`MyQrEntry` docstring 正警告「兩份幾乎相同的判斷各自演化」是本專案踩過的坑 → 階段 4 明寫 `available.invite = joined && !!referralCode`（或抽成共用工具）。
17. **[P2]〔架構＋UI/UX，合併〕〔§3 頁首契約 / 階段 4〕** 頁首契約有兩半：副標帶 `hidden sm:block` **且**分頁內說明不與副標重複；階段 4 驗收只列了前半 → 補後半的驗收方式，或明講改由人工 review 守。
18. **[P2]〔架構〕〔階段 5–6〕** 階段 5 已把 `<Route path="/dashboard/qr">` 寫進 `App.tsx`，但規格書 §3 路由表排到階段 6 才同步；`check-spec-drift.py` 是 framework-check 軌的機械把關，階段 5 單獨 push 會紅 → 階段 5 就先補 §3 路由表的最小異動，或明寫階段 5、6 同批 push。
19. **[P2]〔UI/UX〕〔§1 故事 4 / §4〕** 「會員驗證碼」分頁沿用既有文案「出示這組碼給店家掃描」，預設驗證方是店家；方案 B 下驗證方是任何會籍有效會員 → 改成不預設身分的措辭（如「出示這組碼供對方掃描」）。
20. **[P2]〔UI/UX〕〔§4 分頁命名〕** 「掃描驗證」的動作對象不清楚，第一次接觸的一般會員可能誤讀成「掃描以驗證自己」；切到分頁立刻跳權限框放大誤點代價；94px 預算下加長標籤不是低成本選項 → 分頁內第一行說明句提前顯示，或在文件明記這是已知取捨。
21. **[P2]〔UI/UX〕〔§4 三態，403〕** 403「會籍有效的會員才能掃描驗證」被定性為「能進頁的人理論上碰不到」，但沒涵蓋停留期間狀態才改變（相機開著時本人會籍到期或被停權）；目前會落進與「驗證碼過期／無效」共用的泛用「無法驗證」橘框，現場易被誤讀成對方的問題 → 為這個錯誤碼加一點文案／視覺區隔，或至少承認不是純理論分支。

### 第 2 輪需人工裁決

1. **第 3 條（被掃方能否看到「誰掃過我」）**：純產品決定。聚合者建議本次不做、稽核維持 Studio 查閱，把決定記進規劃書。
2. 其餘 20 條均為可直接落入規劃書的修正；聚合者已據此修訂為第 4 版（plan.md「修訂紀錄」逐條對應），未改任何 severity。因無 P0，不強制再跑第 3 輪。

### 處置（第 2 輪，人審後填寫）

- [x] 第 3 條「誰掃過我」：☑ **本次不做，稽核維持後台查閱**（2026-09-02，simonzhao219 於對話中裁決；記進 plan.md §1 不做什麼與 §6）
- [x] 其餘 P1 全數採納進第 4 版：節流（第 1）、§13.1「為什麼」段（第 2）、底邊探針（第 4）、ink overflow 斷言（第 5）、`activationMode="manual"`（第 6）、遮罩名說明（第 7）、state 斷言（第 8）
- [x] P2 全數採納進第 4 版（第 9–21 條）
- [x] 人審完成，裁決：☑ 通過（2026-09-02，simonzhao219 親自執行
      `/tdd-implement qr-code-member-dashboard` 啟動實作——那道「只有人能啟動」
      的鎖就是本專案的人審通過機制，見該 skill 開頭）
