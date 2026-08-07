# e2e 情境去重 規劃書審查報告

<!-- 由 /review-plan 彙整四個 reviewer subagent 的發現而成。
     聚合規則:只彙整、去重、排序,不改判。降級/剔除須列入「需人工裁決」附理由。 -->

審查對象:`docs/plans/e2e-scenario-dedup/plan.md`(commit 8a49c8f)
審查日期:2026-08-07

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 1 | 0 | 2 | §4 其餘 25 條刪除證據逐條 grep 核對成立;§3.3 宣稱成立;§1.1/§1.2/§1.3 算術複驗吻合;四旅程保留;Deno 層接手 PayUni/提領狀態機/registrationStep;multi-step 四契約識別正確;無 DB/migration/RLS 影響 |
| 架構 | 2 | 2 | 2 | pytest marker 無一被刪到 0(`--strict-markers` 與 `-m <marker>` 跑法不受影響);與 test-naming / e2e-tests / README 既有規則無衝突;appShell 契約不受動搖;CI 結構未觸碰;階段可獨立 commit/revert;孤兒 step 的手動 grep 機制本身**無缺口** |
| UI/UX | 0 | 3 | 0 | 不引入新 UI 模式;a11y(除 §4.4 外)證據等級合理;資訊架構/BottomNav 不動;§4.1–4.3、4.5–4.10 的證據不涉及 CSS/viewport,判斷合理 |
| 需求 | 0 | 1 | 3 | 硬約束 2/3/4 全數滿足;約 30 筆「檔案::測試名」引用**全部逐字命中**,無杜撰;§2「不做什麼」邊界清楚;§6 開放問題性質正確;業務規則面無影響 |
| **合計(去重後)** | **2** | **6** | **7** | |

**四個視角一致確認的正面事實**:§4 引用的下層測試檔與測試名**全部真實存在且斷言相符**,
沒有任何一筆杜撰;§1 的量化數字複驗吻合;硬約束 2(四旅程)、3(不動 CI 結構)、
4(逐情境表)確實滿足。問題全部集中在**判準的套用**,不在判準本身或資料。

---

## 發現清單(依嚴重度排序)

### P0-1〔§4.6 route_guards.feature〕 — 系統 + 架構**雙視角獨立發現**

`[P0]〔§4.6〕route_guards 的 4 個候刪 test case 引用的「B級證據」
`registrationFlow.test.ts` 測的是 `resolveCheckoutPageRedirect`,而
route_guards 情境實際走的是 `RequireMembershipRoute.tsx:29` 裡**另一個獨立
決策函式** `resolveMembershipRedirect`——該函式全 repo **零測試覆蓋**,
刪除後其 `paidAwaitingActivation` 分支(「絕不能把已付款的人送回結帳頁造成
重複付款」的金流路由不變式)在四層測試裡都不再被驗證 → 建議這 4 個 case
改列「留」,或先補 `resolveMembershipRedirect` 的單元/元件測試再刪。`

**主 session 已獨立複驗**:`grep -rn "resolveMembershipRedirect" src supabase`
除定義處與同檔呼叫處外零命中;`/dashboard` 由 `ProtectedRoute` +
`RequireMembershipRoute` 包覆(`App.tsx:301-307`);
`registrationFlow.test.ts:190` 的 describe 名為
`resolveCheckoutPageRedirect — PaymentCheckout 頁的守衛`,確為另一函式。
**發現成立。**

### P0-2〔§4.5 payment_checkout.feature〕 — 架構視角

`[P0]〔§4.5〕3 條 redirect 情境補寫的「C級 route_guards 保留了 guard 接線」
不成立——`App.tsx:371-375` 顯示 `/payment/checkout` **只包 `ProtectedRoute`**,
不包 `RequireMembershipRoute`,route_guards 測的接線根本不在此路由上執行;
驅動這 3 條的是 `PaymentCheckout.tsx:94-104 / 154-164` 自己的兩個 useEffect,
而 `PaymentCheckout.test.tsx` 的 21 個 it() 全是卡片/推薦碼渲染,沒有任何一條
測「mount 時依 profile 自動 redirect」 → 建議補 A 級 wiring 測試,或保留 1-2 條。`

**主 session 已獨立複驗**:`/payment/checkout` 確實只有 `ProtectedRoute`。
**發現成立。**

> ⚠️ **部分歧見(依聚合規則不改判,原樣呈報,見「需人工裁決」第 1 項)**:
> 系統視角讀過 `PaymentCheckout.tsx:94-104, 154-163` 後認為這 3 條的
> **主要 B 級證據獨立成立**(`resolveCheckoutPageRedirect` 確實在該頁 mount
> 時被呼叫並驅動同一個 navigate),**只有 C 級 backup 失效**,故未判 P0。
> 架構視角則以「§3.3 自己立的『決策函式有測 ≠ 決策被接進畫面』標準」為由判 P0。

### P1-1〔§4.4 home_listings〕 — UI/UX 視角

`[P1]〔§4.4〕4 條手機檢視情境驗的是 `HomePage.tsx` 用 `block md:hidden` /
`hidden md:grid` 決定「真實瀏覽器在 375px 下渲染哪一組 DOM」,但 vitest 元件
測試**不載入任何編譯後 CSS**,jsdom 結構性地無法評估 media query;引用的
三支替代測試分別只測孤立 toggle 元件、孤立卡片元件、裸 localStorage 函式,
**沒有任何測試 render `HomePage` 本身** → 建議 4 條移出候刪(改列存疑),
或至少保留「switch between views」與「preference remembered across reloads」
這兩條接線/初始化行為。`

### P1-2〔§4.4 overflow 證據描述〕 — UI/UX 視角

`[P1]〔§4.4〕被刪情境的 `the directory has no horizontal overflow` 是會擋 CI
的硬斷言,但引用的替代 `test_overflow_sweep.py[/]` 因 `E2E_OVERFLOW_STRICT`
未設而是 **report-only(不擋 CI)**;規劃書寫「涵蓋且更嚴格」掩蓋了「從硬闖關
降級成報告」這個事實,且 overflow sweep 只偵測有無溢出、不驗證欄數(變 2 欄
不會觸發任何 finding) → 建議如實標註為 report-only 降級。`

**主 session 已獨立複驗**:`test_overflow_sweep.py:43` `STRICT = os.environ.get(
"E2E_OVERFLOW_STRICT") == "1"`;`grep E2E_OVERFLOW_STRICT .github/workflows/*.yml`
零命中。**「更嚴格」的措辭確為錯誤。**

### P1-3〔行動版優先〕 — UI/UX 視角

`[P1]〔§4.4 對照 §1〕全庫「會擋 CI 的手機視窗情境」`grep "I am on a
mobile-sized screen"` 只有 5 處,其中 4 處就是本次要刪的 home_listings;
刪後首頁的手機版檢視在瀏覽器層將完全沒有會擋 CI 的迴歸防線,只剩
report-only 掃描。首頁是 LINE 導流的第一入口,規劃書未討論這一點 →
建議至少保留操作/持久化那兩條。`

### P1-4〔§3.1 vs §4.8/§4.10〕 — 需求視角

`[P1]〔§3.1 + §4.8 + §4.10〕§3.1 明文「只有 A、B 級可以刪」,但 §4.8 兩條與
§4.10 一條的刪除依據**唯一或主要**是 C 級(e2e 內部跨檔重複),且 §0/§2 對
「下層」的定義是「vitest 或 api-tests」,不含同層另一個 e2e 情境——這 3 條
實質不滿足硬約束 1 → 建議改列「留」/「存疑」,或把「C 級是否足以刪除」
明確列進開放問題交人裁決;規劃書不能自行放寬剛定義的判準且不留紀錄。`

### P1-5〔§4.9 line_browser〕 — 架構視角

`[P1]〔§4.9〕Outline 刪除引用「偵測結果確實接到了渲染決策」,但全 src grep
`detectInAppBrowser` 只命中 `referralInvite.ts` 與 `InviteFriendPanelContent.tsx`,
App.tsx / 路由層皆不再引用——該 wiring 看來已整個移除,`browserDetection.test.ts`
驗的是分類邏輯而非渲染決策,證據等級標錯;且刪後 Android WebView(非 LINE)
UA 家族不再有任何 e2e 覆蓋(保留的 3 條全綁 LINE UA) → 建議改寫證據為真實
理由,並考慮單獨保留 Android WebView 那一列。`

### P1-6〔§5 階段 2 驗證標準〕 — 架構視角

`[P1]〔§5〕階段 2 的 `npx vitest run` 清單漏了 `src/utils/registrationFlow.test.ts`,
但 §4.5 的 3 條刪除全都引用它當 B 級證據——照現行指令跑完並不會重新確認
這 3 條的證據測試仍全綠(階段 3 有正確納入,僅階段 2 漏) → 建議補上。`

### P2 清單

| # | 視角 | 發現 |
|---|---|---|
| P2-1 | 系統 | 〔§3.3/§4.5〕規劃書引用的函式名 `resolveCheckoutAction`、`resolveMembershipAction` **在 codebase 不存在**(實為 `resolveCheckoutPageRedirect`、`resolveMembershipRedirect`)→ 改用實際識別字;**這個命名漂移很可能就是 P0-1 誤判的成因** |
| P2-2 | 系統 | 〔§1.2〕run 2 的固定開銷 50s + pytest 330s = 380 ≠ 385s(缺 post 步驟 5s);run 1 的 57s 亦應為 53s(53+233+4=290)→ 修正表格,不影響結論 |
| P2-3 | 需求 | 〔§1.3〕「月省 ≈ 0.8 × 600 ≈ 450–600 分」與前段「0.7–0.9 計費分/run」不一致(0.7×600=420、0.9×600=540)→ 修正區間端點或註明區間怎麼來,Q1 裁決要靠這個數字 |
| P2-4 | 需求 | 〔§6 Q1〕選項 (b)「playwright `--with-deps` 納入 cache、npm ci 換 `--prefer-offline`」未量化 → 至少做一次快速量測附上數字,人裁決才有依據 |
| P2-5 | 需求 | 〔§7〕四旅程保留清單目前只靠文件(`e2e/README.md`),無機械擋 → 建議仿 `check-workflows.py` 加一支輕量腳本斷言 §3.2 那 8 條標題必須存在(可列為後續補強) |
| P2-6 | 架構 | 〔§5/§7〕孤兒 step 手動 grep **機制本身無缺口**(repo 無任何 Python 靜態分析工具,各階段收尾 grep 能正確處理跨階段共用片語),但無機械化保障,漏做不會被擋 → 規模擴大時再評估加腳本 |
| P2-7 | 架構 | 〔§5 階段 5〕未指定原則放進 `e2e/README.md` 的哪個章節 → 建議新增對稱於「Adding a scenario」的「Removing a scenario」放三級判準,四旅程清單併入「Coverage」或另立「Must-keep end-to-end coverage」 |

---

## 需人工裁決

1. **P0-2 的嚴重度有跨視角歧見**(架構判 P0、系統判「主要證據成立、僅 C 級
   backup 失效」)。依聚合規則不改判,**保留架構的 P0 原判**呈報。請人裁決
   採哪一方——這決定 §4.5 那 3 條是「全部改留」還是「刪除但拿掉失效的
   C 級 backup 描述」。

2. **P0-1 的處置路徑與 §2「不做什麼」直接衝突**(系統視角明確指出):要保留
   這 4 個 case 的刪除量,必須先補 `resolveMembershipRedirect` 的測試,而
   規劃書 §2 已明文排除「補下層測試再刪」。系統視角建議與 Q1 一併一次裁決:
   是否把「補測試」納入本任務,或單純把這 4 條改列「留」結案。

3. **P1-4 同屬「判準要不要放寬」的政策問題**:C 級(e2e 內部跨檔重複)是否
   算合格的刪除證據。硬約束 1 的字面是「在更便宜的層被斷言」,C 級不滿足;
   但 e2e 內部重複確實是真重複。請一次裁定 C 級的地位(這會連動 §4.8/§4.10
   共 3 條)。

---

## 主 session 已據此修訂規劃(修訂只**移出**候刪,不新增)

為免帶著 P0 進入實作,已把 P0-1、P0-2、P1-1、P1-3、P1-4、P1-5 點名的情境
**全部移出候刪清單**(改列「存疑」並標註本報告的發現編號),並修正
P1-2、P1-6、P2-1、P2-2、P2-3 的事實錯誤。修訂後:

| | 修訂前 | **修訂後** |
|---|---|---|
| 刪 | 29 情境 / 31 case / 31.83s | **15 情境 / 15 case / 19.37s** |
| 存疑 | 16 / 16 / 18.53s | **27 / 28 / 28.63s**(+11) |
| 留 | 102 / 126 / 138.1s | **105 / 130 / 140.46s**(+3,route_guards 全留) |
| 佔全套件 | 16.9% | **10.3%** |
| 測試數 | 173 → 142 | 173 → **158** |
| 月省估計 | 450–600 分 | **≈300 分** |

三欄加總複驗:15+27+105 = 147 情境、15+28+130 = 173 case、
19.37+28.63+140.46 = 188.46s ≈ §1.1 實測的 188.5s。

修訂**只把情境從「刪」移到「存疑」**,不新增任何刪除、不放寬任何判準,
方向嚴格保守。因此未再燒一輪四視角審查——**是否要求重跑 `/review-plan`
是人審的裁量**,列在下方處置節。

---

## 處置(人審後填寫)

<!-- P0 的處置規則:必須改 plan 並重跑 /review-plan,或由人在此明文豁免。
     tdd-implement 開工前會檢查:存在未處置 P0 → 拒絕開工。 -->

**裁決日期:2026-08-07|裁決人:simonzhao219(「照建議走」)**

- [x] **P0-1 / Q13** 已處置:☑ **接受「route_guards 4 個 case 全改留」的修訂**。
      理由:刪除值僅 2.36s(≈0.02 計費分),而 `resolveMembershipRedirect`
      零覆蓋是付款安全問題,應獨立處理而非搭車在省錢 PR 上。
      → 缺口另開任務(見下方「衍生任務」1)。
- [x] **P0-2 / Q11** 已處置:☑ **採架構視角(3 條全改留,已修訂)**。
      理由:判準一致性——§3.3 已用「決策有測 ≠ 決策被接進畫面」保住 route
      guard,對 `PaymentCheckout` 的 mount-time useEffect 套較鬆標準會變雙標。
      系統視角的部分歧見(B 級獨立成立)已知悉,但一致的判準優先於 1.96s。
- [x] **需人工裁決 3 / Q9**:C 級證據的地位 → ☑ **算證據,但收窄**。
      收窄條件:限「**同一元件、同一段程式碼路徑,只有被 mock 的資料不同**」;
      僅「看起來結果一樣」不算。三條皆符合,**恢復刪除**(§4.8 兩條為同一個
      公開詳情頁、其中一條斷言字串完全相同;§4.10 一條為同一個
      `OTPVerificationPage` 的同一段倒數計時,只差 `otpType`)。
      **此項為硬約束 1 的修訂**,已明文記錄於 plan.md §3.1。
- [x] **Q1**(規劃書 §6):☑ **(a) 接受實得 + (b) 另開任務處理固定開銷**。
      納入 Q9 後實得為 **≈360 分/月**。明確記錄:目標 700–1,000 分/月
      ≈ 每 run 要砍 70–100s,刪重複(24–34s)+ 固定開銷樂觀(15–25s)
      合計 40–60s ≈ 420–600 分/月,**要真的達標必須放寬三條硬約束之一**
      (並行 / 抽樣 / 改 CI 結構)。未選 (c) 重新檢視 xdist。
      → 固定開銷任務**動手前先實測** `--with-deps` 秒差(審查 P2-4)。
- [x] 是否要求對修訂後的規劃重跑 `/review-plan`:☑ **不要(明文豁免)**。
      豁免理由:修訂只把情境**移出**刪除清單、不新增任何刪除、不放寬判準
      (Q9 的放寬是人審裁決而非規劃自行放寬),方向嚴格保守,結構上不可能
      引入新 P0;重跑需再派四個 subagent 換取近乎零資訊。
- [x] 其餘開放問題:Q2(admin 分頁切換)☑ 留;Q6(payment_checkout 2 條)
      ☑ 留;Q10(home 手機 4 條)☑ **(a) 全留**——全庫會擋 CI 的手機視窗
      情境只有 5 條而其中 4 條是這些,產品規格明訂手機優先,不以手機版覆蓋
      換 3.23s;Q4 / Q5 / Q7(rewards 5 條、payment_result 7 條)☑ 先留,
      待有人本來就在改那些元件時順手補元件測試再回頭刪;Q12(line_browser)
      ☑ 先不動,另開小清查(見「衍生任務」4)。
- [x] **人審完成,裁決:☑ 修訂後通過**。
      可進實作——但 `/tdd-implement e2e-scenario-dedup` 仍須由人親自啟動。

### 裁決後的最終範圍

| | 情境 | test case | 本機秒 | 佔比 |
|---|---|---|---|---|
| **刪** | **18** | **18** | **22.98** | **12.2%** |
| 存疑(不在本任務動) | 24 | 25 | 25.02 | 13.3% |
| 留 | 105 | 130 | 140.46 | 74.5% |

173 → **155 個 test case**;CI 約 **-28~-40s ≈ 0.6 計費分/run ≈ 360 分/月**。
四旅程端到端全數保留,無任何把關被移除。

### 衍生任務(不在本任務內,建議另開)

1. **補 `RequireMembershipRoute` 測試** —— `resolveMembershipRedirect` 六分支
   零覆蓋;三個 route guard 元件無任何元件測試 render 過。守的是「絕不能把
   已付款的人送回結帳頁造成重複付款」。**優先度最高**(付款安全)。
2. **抽出 auth 錯誤訊息映射 + vitest** —— 硬編在 `AuthPage.tsx` /
   `ResetPasswordPage.tsx`,8 條 e2e 是唯一防線。副作用:之後那 8 條才具備
   刪除條件(≈6s)。
3. **補 `SystemAlerts.test.tsx`**(Q3)—— 目前無元件測試。
4. **line_browser 整檔清查**(Q12)—— `detectInAppBrowser` 已不在渲染路徑,
   若屬實則該檔前提(擋頁 vs 全 app)可能整個過時,應整檔重看而非挑一條刪。
5. **CI 固定開銷任務**(Q1(b))—— 先實測 `playwright install --with-deps`、
   `npm ci`、pip、cache restore 各佔幾秒,再決定動哪個。
6. **四旅程保留清單的機械把關**(P2-5)—— 仿 `check-workflows.py`,斷言
   §3.2 那 8 條情境標題必須存在於對應 `.feature`。
