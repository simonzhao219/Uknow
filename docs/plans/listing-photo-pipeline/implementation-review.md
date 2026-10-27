# 刊登照片上傳管線 PR 1（後端清理）實作審查報告

<!-- 由 /review-implementation 彙整四個 reviewer subagent 的發現。只彙整、去重、排序，不改判。
     審查範圍：feature/listing-photo-pipeline 相對 develop 的 PR 1 實作（plan.md §2.1／§2.2／§5 的 1-1～1-5）。
     注意：UI/UX、架構、需求三位 reviewer 沒有 Bash，未能跑 git diff，改以讀現況檔案比對；後端整合測試
     （listing-photos.test.ts）本機無 supabase CLI 未跑，交 CI api-tests。 -->

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 1 | 1 | 授權與前綴、跨使用者引用檢查與 fail-closed、刪刊登流程、路由順序、錯誤碼、無 migration |
| 架構 | 0 | 1 | 1 | 模組邊界、路由順序與原文測試、bucket 單一常數、apiClient 使用、knip、測試分層 |
| UI/UX | 0 | 0 | 2 | 刪除流程回饋（成功／失敗／已刪除冪等）、Edit 存檔後清理、e2e 可證偽性、BottomNav |
| 需求 | 0 | 3 | 1 | 規格書 §11／§14 忠實度、範圍、驗收 2／3／4／6 |

三位 reviewer 重複回報同一項（未刪項），合併計一項。合計 **P0=0、P1=3、P2=5**（含 1 項〔需人工裁決〕）。

## 發現清單（依嚴重度排序）

### P1
1. [P1]〔系統＋架構＋需求｜plan §2.1〕「Storage `remove` 部分成功 → 200 並列出未刪項」未實作，也沒記入 progress.md 偏離；`remove` 只回傳實際刪到的物件，不存在的檔與刪失敗無法分辨 → 補實作加測試，或在偏離節與 PR 描述明記「不回報未刪項」。
2. [P1]〔需求｜驗收 5／§5 1-2〕「upload-photo 實際回傳的 URL 必能被引用檢查命中」沒有可證偽的測試：unit 的 `publicUrlOf` 是假函式，整合測試沒有上傳後驗引用；upload-photo 與清理各自呼叫 `getPublicUrl` 只靠人眼確認一致 → 補測試，或把兩處抽成同一個函式。
3. [P1]〔需求｜驗收 3〕「>10 筆」「重複項」是否各自被驗證，reviewer 看測試名稱未逐條核對斷言〔需人工裁決〕。

### P2
4. [P2]〔系統｜§2.1 限流順序〕429 檢查排在 body 驗證前，格式錯誤的請求也耗額度；plan 未規定順序，記錄即可。
5. [P2]〔架構｜EditServiceProvider.tsx 註解〕既有長註解仍寫「與 ServiceProviderManagement 的刪除路徑同一種機制」，管理頁已改走後端，這句失實 → 改掉或刪掉。
6. [P2]〔UI/UX｜§2.2 刪除鈕 pending〕刪除期間只有 `disabled={isDeleting}`，無「刪除中…」文字或 spinner 與播報；plan 寫「pending／disabled」。
7. [P2]〔UI/UX｜既有缺口〕刪除成功後刊登卡片消失，焦點掉回 body（非本 PR 新增）→ 依 ui-ux §9 焦點後備，之後順手補。
8. [P2]〔需求｜驗收 1〕Edit 測試只證呼叫時機，未驗「移除一張」時傳入的 before／after；diff 邏輯由 `removedPaths` 單測覆蓋，鏈路拼起來可接受。

## 處置紀錄（彙整者註記，非改判）

- #1：不補實作（`remove` 不回傳不存在的檔，列出「未刪項」會把冪等的已不存在誤報成失敗）；已在 progress.md「偏離規劃」節記錄，PR 描述同步。
- #2：已修——upload-photo 與清理的 URL 改由同一函式 `listingPhotoPublicUrl` 產生，並在 `listing-photos.test.ts` 加一條測試釘住格式。
- #3：彙整者核對 `listing-photos.unit.test.ts`：`validateDeletePathsBody` 的「超量 `MAX_DELETE_PATHS+1`」「重複」各為獨立 case，且有「恰好上限仍合法」；請人確認。
- #5：已修（Edit 註解更正）。
- #4、#6、#7、#8：未修，不影響正確性；#6 若業主要求可在 PR 2 順手補。

## 需人工裁決

1. #3 的覆蓋是否足夠（彙整者已核對如上）。
2. #6 刪除鈕是否要補「刪除中…」文字。
3. progress.md「目前位置」措辭重複（UI/UX reviewer 提出，純文件）。

## 處置（人審後填寫）

- [ ] 人審完成，裁決：□ 通過 □ 修訂後通過（豁免理由：） □ 退回
