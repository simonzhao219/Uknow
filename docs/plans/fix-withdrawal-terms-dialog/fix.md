# 提領同意款的文件連結會換頁清空整張表單 修復紀錄

分支:`fix/withdrawal-terms-dialog`|重現測試(紅燈 commit):`8aa6b3e`

## 1. 症狀與重現

提領流程步驟 3 已填銀行帳號、身分證字號、上傳身分證正反面後,點同意款的
「事業手冊」連結 → 整頁導航到 `/business-manual` → 回到提領頁時所有欄位歸零,
照片要重傳。100% 重現。

重現測試:`src/components/reward/WithdrawalProcess.test.tsx`
「點同意款的事業手冊連結時不換頁且已填欄位不流失」。

## 2. 根因

機制層:`WithdrawalProcess.tsx:844` 用的是原生 `<a href="/business-manual">`,
點擊即整頁導航;而該元件的 `amount`/`personalData`/`idCardFrontPreview`/
`idCardBackPreview`/`agreeToTerms` 全部只活在元件本地 `useState`,沒有像
`CompleteProfile` 那樣接 `utils/formDraft.ts` 的 sessionStorage 草稿。
離開本頁 = 元件卸載 = state 歸零,沒有任何一層接得住。

為什麼當時沒被發現——這才是關鍵:

- 「表單內的法遵連結必須用就地彈窗」這個結論,是修 `CompleteProfile`(換頁清空
  表單)與 `JoinReferralProgramDialog`(開新分頁導致返回鈕變死鈕)時**各自**得
  出的,但只被寫進 `LegalDialog` 的 docblock——一個要主動去讀才看得到的地方。
- 唯一相關的機械防線 `repoHygiene.test.ts`「外部連結一律在原分頁開啟」只擋
  `target="_blank"`。本 bug 的失敗模式是**同分頁導航離開表單**,不帶
  `target`,規則比實際要守的行為窄,擋不到。
- 前兩次修復都沒回頭掃「還有哪些表單裡有法遵連結」,提領頁因此漏網。

也就是同一個病灶被修過兩次、結論卻只沉澱成註解——與 friction-log 記過的
「旁註是繞道,不是修復」同型。

## 3. 同類掃描

- 根因抽象成的 pattern:**元件持有未儲存的表單 state** × **渲染會離開本頁的
  導覽連結**(`<a href="/...">` 或 `<Link to="/...">`)。
- 掃描方式:`grep -rn '<a href="/\|<Link to="/' src/ --include=*.tsx`(排除測試)。
- 結果:☑ 22 處命中,**只有 `WithdrawalProcess.tsx:844` 落在表單內**,即本 bug
  自身,無其他同病灶需一併修。其餘全在 `Navbar` / `Footer` / `MemberDashboard` /
  `ServiceProviderManagement` / `SubscriptionStatusCard` / `MobilePhotoWallCard` /
  `AdminDashboard`——那些是導覽介面,換頁正是使用者意圖而非副作用。
  (`CollectionConfirmDialog` 的 LINE 連結屬外部連結,由 `openExternalLink`
  慣例管轄,不在本 pattern。)

## 4. 四面向審視

| 面向 | 檢視結論 |
|---|---|
| 系統 | 不新增資料流、不動 API。`LegalDialog` 已被兩個流程使用、介面穩定;此處的彈窗掛在 Card 內(非巢狀於另一個 Dialog),比 `JoinReferralProgramDialog` 的情境更單純,不會有巢狀 Dialog 的焦點問題。Bundle:`businessManual` 被 vite 拆成獨立共用 chunk(55 kB / 18.4 kB gzip),`RewardDashboard` 本身只從 46.82 → 46.93 kB,首屏 entry 不受影響(`check-bundle-budget` 綠、`appShell.test.ts` 的 code splitting 契約仍成立)。獎勵頁會多平行下載該 chunk——這與 `ContentPages.tsx` docblock 已載明並接受的取捨(`termsOfService` 隨註冊流程 chunk 一起走)同型,不另立新做法。 |
| 架構 | 點狀 bug,非架構症狀——共用元件早就存在且正確,只是這個呼叫點沒用它,不需升級 `/plan-feature`。真正的結構缺口是「規則只存在於註解、沒有閘門」,由第 6 節回填。 |
| UIUX | 這是 UX 誘發的資料流失:流程要求使用者同意文件,使用者照做卻失去已填資料。改彈窗後讀完關掉即續填,與註冊、加入推薦計畫三處行為一致,使用者只需要一套心智模型。 |
| 需求 | 規格書 §10.1 只定義提領檢核順序,未定義同意款文件怎麼開;跨流程的 UI 慣例已記於 `docs/ui-ux-guidelines.md:64` 與 `docs/multi-step-flow-recovery.md:101`。本修復是讓提領頁回到既有慣例,非新規則 → 無開放問題待裁決。 |

## 5. 修法與驗證

- 修了什麼:`WithdrawalProcess.tsx` 的 `<a href="/business-manual">` 換成
  `<LegalDialog content={businessManualContent} triggerTestId="withdrawal-manual-link">`。
- 為什麼這樣修是對的(對照根因):根因是「離開本頁導致 state 歸零」,彈窗讓
  表單**始終掛載在底下**,從源頭消除卸載;而不是去補一層草稿持久化來救場
  ——後者是對著症狀修,還會多養一份要同步的狀態。

## 6. 防線回填

- 為什麼既有閘門沒攔到:見第 2 節——`repoHygiene` 的規則(禁 `target="_blank"`)
  比實際要守的行為(表單內不得有離開本頁的法遵連結)窄,而後者只寫在註解裡。
- 處置:☑ 已補閘門——`repoHygiene.test.ts` 新增「法遵文件一律就地彈窗閱讀」:
  `src/` 內指向法遵內容路由(`/terms-of-service`、`/listing-plans`、
  `/business-manual`、`/participation-contract`)的導覽連結,只允許出現在
  `Footer.tsx`(頁尾快速連結,本來就是這些頁的導覽入口)與 `App.tsx`(路由定義
  與舊 slug 轉址);其餘任何檔案要呈現法遵文件一律走 `LegalDialog`。
  下次再有人在表單裡貼法遵連結,`npm run check` 就會紅。
