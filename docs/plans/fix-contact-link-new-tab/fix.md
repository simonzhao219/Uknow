# 外部聯絡連結（LINE/IG/FB）在新分頁開啟而非原頁 修復紀錄

分支:`claude/uknow-tagline-revision-2ag5gp`|重現測試(紅燈 commit):`9458b12`

## 1. 症狀與重現

- 使用者回報:網站上的連結都是開新的一頁，而不是在原頁開啟；刊登詳情頁
  裡連接 LINE / IG / FB 的聯絡按鈕邏輯也都是如此。
- 重現方式:`src/utils/repoHygiene.test.ts` 新增一條掃描守門測試，對
  `src/` 內所有 `.ts`/`.tsx` 檔案做文字掃描，找出 `target="_blank"` 與
  `window.open(url, '_blank')` 兩種寫法的實際出現處（排除純註解提及的
  誤判）。紅燈時列出五個實際踩線檔案：
  - `src/components/Footer.tsx`（頁尾 LINE 客服連結）
  - `src/components/MemberDashboard.tsx`（會員資料修改說明彈窗內 LINE 連結）
  - `src/components/PaymentResult.tsx`（金流結果頁「聯絡客服」按鈕）
  - `src/components/ServiceProviderDetail.tsx`（刊登詳情頁 FB/IG/LINE 聯絡按鈕）
  - `src/components/reward/CollectionConfirmDialog.tsx`（提領客服資訊 LINE 連結）

## 2. 根因

- 機制層:`<a target="_blank">` 與 `window.open(url, '_blank')` 兩種寫法
  各自在五個檔案裡被獨立複製貼上，專案內從未存在「外部聯絡連結該如何
  導頁」的共用實作或明文慣例，工程師各自沿用了「外部連結開新分頁」這個
  常見但未經產品確認的預設習慣。
- 為什麼當時沒被發現:這是純 UX 行為差異，不是編譯錯誤、也不影響功能
  正確性，本地開發與既有測試都不會注意到分頁行為，只能靠使用者實際
  操作回報才會浮現。
- 為什麼會一再重複:沒有共用的 helper 函式可以匯入呼叫，也沒有任何
  lint 規則或測試守門檔案掃描 `target="_blank"`／`window.open`，導致
  同一寫法在不同 PR 各自獨立引入而不會互相察覺。
- 補充:專案內另有一起相關但成因不同的既有事故（見
  `src/utils/backNavigation.ts` 與 `JoinReferralProgramDialog.tsx` 註解）：
  站內文件路由曾用 `target="_blank"` 開新分頁，導致該分頁歷史只有一筆、
  文件頁的「上一頁」`navigate(-1)` 無處可回而變死鈕，後改用就地彈窗
  （LegalDialog）修復。那起事故是「站內路由的分頁歷史斷裂」，本次是
  「外部聯絡連結不符合原頁開啟的產品預期」，成因不同，但都指向同一個
  更底層的教訓:`target="_blank"` / `window.open(...,'_blank')` 在這個
  專案裡是需要謹慎評估、而非預設採用的寫法。

## 3. 同類掃描

- 根因抽象成的 pattern:`target="_blank"` 屬性、或 `window.open(url,
  '_blank')` 呼叫。
- 掃描方式:對 `src/` 下所有 `.ts`/`.tsx` 檔案做正則掃描（見
  `repoHygiene.test.ts` 新增區塊），非一次性 grep，而是常駐測試，往後
  每次 `npm run check`／CI 都會重新掃描。
- 結果:☑ 找到——五處已一併修掉（見上）。另有兩處為註解提及舊寫法
  （`backNavigation.ts`、`JoinReferralProgramDialog.tsx`），非實際使用，
  加入白名單排除、不修改。

## 4. 四面向審視

| 面向 | 檢視結論 |
|---|---|
| 系統 | 三處 JS 導頁（ServiceProviderDetail、PaymentResult）與新抽出的 `openExternalLink()` 共用同一個實作；兩處純 `<a>` 連結（Footer、MemberDashboard、CollectionConfirmDialog）不經 JS，直接移除 `target`/`rel` 屬性即可，行為與 `openExternalLink()` 一致（同分頁導頁）。不影響其他頁面對這些連結的依賴，因為呼叫方式（href/onClick）沒變，只有「開哪個分頁」變了。 |
| 架構 | 屬點狀 bug，非架構缺陷：新增 `src/utils/externalLink.ts` 作為單一共用實作，往後同類需求（新的外部聯絡連結）只需呼叫既有函式，不會再各自複製貼上。無需升級到 `/plan-feature`。 |
| UIUX | 使用者會因此離開 SPA（原分頁導頁到外部網域），瀏覽器「上一頁」可返回；相較開新分頁，避免分頁數量無謂增加、且與使用者回報的期待一致。 |
| 需求 | 專案內沒有正式規格書定義「外部聯絡連結該在原頁或新分頁開啟」；本次以使用者本人（回報者即產品決策者）在本次 bug 回報中的明確指示（原頁開啟）作為需求依據，並已寫入本檔案與 PR 說明存證。 |

## 5. 修法與驗證

- 修了什麼(綠燈 commit，隨後補上):
  1. 新增 `src/utils/externalLink.ts`：`openExternalLink(url)` 以
     `window.location.href = url` 在原分頁導頁。
  2. `ServiceProviderDetail.tsx` 的 `handleContactClick()`：
     `window.open(url, '_blank')` → `openExternalLink(url)`。
  3. `PaymentResult.tsx` 的 `handleContactSupport()`：
     `window.open(LINE_OFFICIAL_ACCOUNT_URL, '_blank')` →
     `openExternalLink(LINE_OFFICIAL_ACCOUNT_URL)`。
  4. `Footer.tsx`／`MemberDashboard.tsx`／`CollectionConfirmDialog.tsx`
     的 LINE `<a>` 連結：移除 `target="_blank"` 與
     `rel="noopener noreferrer"`（後者只在開新視窗時才有意義，一併清掉）。
- 為什麼這樣修是對的(對照根因):根因是「沒有共用實作、各自複製貼上」，
  所以修法不只是把五處的 `_blank` 逐一刪掉，而是同時建立
  `openExternalLink()` 作為 JS 導頁的單一修改點，並用常駐守門測試鎖住
  「不得再出現 `target="_blank"`／`window.open(...,'_blank')`」這條規則，
  阻斷同一 pattern 再被複製貼上的路徑。

## 6. 防線回填

- 為什麼既有閘門沒攔到:分頁開啟行為屬於瀏覽器導頁副作用，不影響型別
  檢查、不改變資料正確性，vitest 既有測試也沒有任何斷言涉及
  `window.open`／`target`，純 UX 差異只能靠人工使用才會發現。
- 處置:☑ 已補閘門：`src/utils/repoHygiene.test.ts` 新增「外部連結一律
  在原分頁開啟」掃描區塊，往後任何人／任何 PR 若再寫
  `target="_blank"` 或 `window.open(url, '_blank')`，`npm run check`
  會直接紅燈擋下，不需要等使用者回報才發現。
