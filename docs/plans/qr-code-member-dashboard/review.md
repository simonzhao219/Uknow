# 我的 QR 整合頁（qr-code-member-dashboard）規劃書審查報告

<!-- 由 /review-plan 彙整四個 reviewer subagent（系統/架構/UIUX/需求）的發現而成。
     聚合規則：只彙整、去重、排序，不改判——severity 一律是 reviewer 原判。
     審查對象：docs/plans/qr-code-member-dashboard/plan.md（2026-09-01 第一版）。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 2 | 2 | API 契約（方案 A 零後端變更成立）、資料庫/RLS、外部整合（PayUni 不適用）、邊界條件 |
| 架構 | 0 | 3 | 3 | 模組邊界（除資料夾放置外）、AdminRoute/lazy 群組結構、單一入口與狀態單一來源、命名慣例、bundle 預算與 code splitting 契約 |
| UI/UX | 0 | 2 | 3 | 觸控尺寸（36→44px 是還債）、三態完備、a11y（除 icon aria-hidden 外）、BottomNav 五格契約、`?tab=scan` 非管理員靜默落回、開放問題 #2 的建議站得住 |
| 需求 | 0 | 2 | 2 | 需求溯源（無腦補斷言）、方案 A/B 解讀與預設、三類 QR 表面全數涵蓋（無第四種）、業務規則（§5/§7–§10 未牽動） |
| **合計（去重後）** | **0** | **9** | **9** | 系統 P2「§3 路由表存取層級措辭」與需求 P2 同一發現，合併計一 |

## 發現清單（依嚴重度排序）

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

### Reviewer 額外確認（非缺口，供人審對照）

- 〔系統〕方案 A「零後端變更」成立：`resolveMembershipRedirect` 的 `isAdmin → null` 與舊 `AdminRoute` 在「管理員無會籍也放行」上等價；兩個端點的守門不看呼叫方外殼；`admin-gate.test` 與 `member-verify.test` 維持有效；`member_verify_logs` 已 RLS + revoke。非管理員時 `MemberVerifyScanner` 根本不會掛進 DOM。
- 〔架構〕`MyQrPage` 自取 UserContext 與「單一入口、狀態單一來源」一致（路由層元件連 props 都沒有，比 `MyQrEntry` 更難走偏）；`/admin/verify` 轉址逐一追四種身份組合，最終落地頁與舊路徑一致；`appShell.test` 三條 code-splitting 斷言不受影響。
- 〔UI/UX〕相機權限時機（切到分頁即 mount）技術上與獨立路由相同，權限是 origin 級記憶；`?tab=scan` 靜默落回優於報錯；開放問題 #2 的建議站得住。
- 〔需求〕全 `src/` 搜尋 QR 相關表面只有三類（邀請 QR／驗證碼 QR／掃描），三分頁對應三類，無第四種被漏掉；方案 A/B 解讀與預設站得住，開放問題 #1 的資訊足以裁決。

## 需人工裁決

1. **〔UI/UX reviewer 標記〕相機啟動時機**：切到「掃描驗證」分頁即啟動相機（原生權限框會跳出），還是加一道「點一下才啟動相機」的緩衝鈕？純產品取捨，不是必修缺口。聚合者建議：**切到分頁即啟動**——管理員點「掃描驗證」的意圖明確，`/admin` 捷徑深連結到此就是要立刻掃，櫃檯現場多一個點擊是純摩擦；權限被拒的退路（手動輸入）已存在。
2. **聚合者已據上述發現修訂規劃書（plan.md 末段「修訂紀錄」逐條對應）**，未改任何 severity；因無 P0，依 skill 規則不強制重跑 `/review-plan`——是否要對修訂版再跑一輪，由人決定。
3. **plan.md §6 的三個開放問題（掃描權限 A/B、儀表板 QR 縮圖、`/admin` 捷徑去留）仍待人裁決**；修訂版已把第 6/18 條的「依來源返回」設計納入，使開放問題 #3 的「保留捷徑」選項不再帶導覽退化。

## 處置（人審後填寫）

<!-- P0 的處置規則：必須改 plan 並重跑 /review-plan，或由人在此明文豁免。
     tdd-implement 開工前會檢查：存在未處置 P0 → 拒絕開工。本次 P0 = 0。 -->

- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：） □ 退回重規劃
- [ ] 開放問題 #1 掃描權限：□ A（僅管理員，規劃預設） □ B（開放會員，另開規劃）
- [ ] 開放問題 #2 儀表板 QR 縮圖：□ 不放（規劃預設） □ 放邀請 QR 縮圖
- [ ] 開放問題 #3 `/admin` 捷徑：□ 保留並改連（規劃預設） □ 移除
- [ ] 需人工裁決 #1 相機啟動時機：□ 切到分頁即啟動（建議） □ 加啟動鈕
