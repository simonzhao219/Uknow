# 我的 QR 整合頁（qr-code-member-dashboard）實作審查報告

<!-- 由 /review-implementation 彙整四個 reviewer subagent 審**實作 diff** 的發現。
     聚合規則同 docs/_templates/review.md：只彙整、去重、排序，不改判。
     審查對象：claude/qr-code-member-dashboard-qs36st 相對 origin/develop 的 diff
     （38 檔、+2376/−682），對照 plan.md 第 4 版與 progress.md 的偏離紀錄。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 未記錄的偏離 |
|---|---|---|---|---|
| 系統 | 0 | 0 | 2 | 無 |
| 架構 | 0 | 1 | 3 | 無 |
| UI/UX | 0 | 1 | 1 | **有 1 項**（h1 內嵌 icon） |
| 需求 | 0 | 0 | 1 | 無 |
| **合計（去重後）** | **0** | **2** | **6** | 1 項（已處置） |

需求與架構視角報的 P1 是同一條（`MyQrEntry.test.tsx` 的恆真斷言），合併計一。

## 發現與處置

### P1

1. **〔需求＋架構〕`src/components/referral/MyQrEntry.test.tsx`** `MyQrDialog` 刪除後，
   「由推薦碼欄位的 CTA 開加入流程時同時關掉面板」仍斷言
   `queryByTestId('my-qr-dialog')` 為 null——那個 testid 已不可能出現在任何程式路徑
   下，斷言恆真，註解還講著已不存在的「Radix portal vs 手刻遮罩疊加」風險；檔頭
   註解也還寫著「MyQrDialog 也替身掉」。knip 只查檔案層級的孤兒，抓不到檔案**內**
   的孤兒斷言。
   → **已修（`90fcf50`）**：刪掉該斷言、改寫兩處註解。

2. **〔UI/UX〕`src/components/MyQrPage.tsx`** 頁首 h1 內嵌 `QrCode` icon，
   規劃只寫「沿用 `MemberDashboard` 模式」，而全站每一個頁面級 h1
   （`MemberDashboard` / `TaskDashboard` / `RewardDashboard` / `ReferralManagement` /
   `AdminDashboard` / `ServiceProviderManagement`）都是純文字——這是實作時發明的新
   模式，且沒有記進 progress.md 的偏離清單。
   → **已修**：拿掉 icon。補記偏離不如回到既有慣例——這個 icon 沒有任何理由，
   只是順手加的。

### P2

3. **〔系統〕migration `20260902000001`** 只改了欄位與索引名，隱式 FK 約束仍叫
   `member_verify_logs_admin_id_fkey`，`\d member_verify_logs` 與 Studio 上照樣看得到
   `admin_id` 字樣——而「查表的人不該把一般會員的掃描讀成管理員行為」正是這支
   migration 的動機。→ **已修（`90fcf50`）**：補 `rename constraint`。
4. **〔系統〕`member-verify.test.ts`** 九格授權矩陣沒有「掃描者會籍 `expiring` 仍
   放行」那一格。`!== 'active' && !== 'expiring'` 讀起來正確，但正是日後最容易被
   簡化成只判 `!== 'active'` 的地方，那一改會悄悄擋掉快到期但仍有效的會員，而其餘
   八格一格都不會紅。→ **已修（`90fcf50`）**：補第十格。
5. **〔架構〕`src/components/admin/`** 「只被 `AdminDashboard` 組裝」的不變式本次
   搬遷後恢復為真，但沒有任何測試守著。→ **已修（`90fcf50`）**：補進
   `appShell.test.ts`。**第一版是假的**——正則只認 `components/admin/`，漏掉
   `src/components/` 底下最可能發生的 `./admin/Foo`；突變驗證（拿掉 `AdminDashboard`
   的排除看它會不會紅）才照出來，改成比對解析後的路徑才真的守得住。
6. **〔架構〕`src/components/referral/MyQrEntry.test.tsx:9-10`** 檔頭註解過時。
   → **已修（`90fcf50`）**，與第 1 項同批。
7. **〔UI/UX〕`MemberVerifyScanner`** 正方形準星只以容器高度為準，前提是「4:3 下寬
   永遠大於高」；但取景框還有 `min-h-[16rem]` 這道下限，視窗窄到取景框實際寬度低於
   約 224px 時高度會被撐開、反過來大於寬度，準星就會溢出取景框左右。
   → **已修**：加 `max-w-[calc(100%-2rem)]`——正常情況不會生效（`h−32 < 4h/3` 恆
   成立），極窄時讓準星退化成放得進去的長方形而不是溢出。
8. **〔架構〕commit 紀律（觀察項，不處置）** 九個功能性 commit 裡只有 `d8c935d`
   （取景框準星改正方形）沒有 `test(red)` 前導。它的斷言只有真瀏覽器量得到
   （jsdom 無排版引擎，`aspect-square` 量出來是 0×0），本機無法示範紅燈；
   progress.md 已揭露這是人親自要求的偏離。建議日後同類「僅真瀏覽器可測」的視覺
   調整在 commit message 註明以 e2e run 而非本地紅燈驗證。

## Reviewer 明確確認為「無缺口」的面向

- **系統**：授權順序與 `deriveNodeStatus` 的四態涵蓋（從未訂閱／付款開通中都落在
  `expired`）、前後端放行集合的 pre-image 相符、節流鍵與 fail-open 語意與
  `/auth/check-email` 一致、稽核 fail-closed 與 `verifier_id` 正確、migration 部署
  順序兩個方向都是 fail-closed、`api-contract` 三端一致、`admin-gate.test` 移除該列
  安全（`member-verify.test` 的覆蓋更細）、`apiClient` 改動對既有 9 個呼叫端是純加法。
- **架構**：`admin/` 不變式恢復、`MyQrPage` 的 lazy 與 code-splitting 契約、
  `availableMyQrTabs` 確實是單一事實來源（全 `src/` 無第三份 `joined && referralCode`）、
  `MyQrDialog` 無檔案層殘留、`apiErrorFromBody` 的抽法位置、`useBackNavigation` 測試
  命名與位置、e2e 新檔與既有巡檢的分工、六階段紅綠配對完整。
- **UI/UX**：BottomNav 五格契約未受影響、三態完備、a11y（`activationMode="manual"`
  比 Radix 預設更貼近 WAI-ARIA APG 對高成本分頁的建議）、行動版優先、模式一致性
  （除已修的 h1）、頁首契約的「說明不重複」逐句核對成立、三條 e2e 斷言都守得住
  宣稱的東西。
- **需求**：八條使用者故事逐條有測試對應、「不做什麼」清單無突破（token TTL／邀請卡／
  儀表板縮圖／稽核查閱介面都沒被動）、六項人審裁決逐項落地且「誰掃過我」確認沒有
  偷做、規格書五處改動與程式碼逐句相符且不違反 `document-writing.md`、§5.2 的
  「以程式碼為準」訂正經實讀 `RequireMembershipRoute` 確認正確。

## 偏離規劃的結論

progress.md 記錄的四項偏離（正方形準星、`useBackNavigation` 提前、
`apiErrorFromBody`/`extractApiErrorCode` 新增、驗證碼分頁文案補做）四個視角都逐一
核實**屬實且描述準確**。唯一未記錄的偏離是 h1 的 icon（UI/UX 視角抓到），已以「回到
既有慣例」處置，不需補記。

一項邊界案例：假相機的 `browser_type_launch_args` 放在 `conftest.py` 全域而非
plan §4 字面舉例的模組層覆寫——架構視角判斷保留了技術意圖（session scope 不該靠
測試執行順序決定生效與否）且 progress.md 階段 6 敘述已提及，不構成隱藏偏離。

## 需人工裁決

無。八項發現裡七項已處置，第 8 項是觀察建議，都不涉及需要產品或架構判斷的取捨。
