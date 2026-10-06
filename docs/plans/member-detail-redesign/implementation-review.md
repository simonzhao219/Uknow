# 會員詳情 Sheet 分區重設計（S4／A3）實作審查報告

<!-- plans-keep: 施工中鷹架（S4 三段式），退場條件＝/tdd-implement 收尾刪除整個 docs/plans/member-detail-redesign/ 目錄 -->

審查對象：`feature/member-detail-redesign` 相對 develop 的實作 diff（至 `e7ed7c5`，不含規劃鷹架目錄；完整 diff 由主
session 先寫進 scratchpad 交給 reviewer 讀——friction-log 2026-10-05「reviewer 沒有 Bash」的處置）。比對基準：`./plan.md`
修訂版、`./review.md`、`./progress.md` 已記錄的偏離。四個 fresh-context reviewer 平行審查；主 session 只彙整、去重、
排序，**不改判**（跨視角重複取最高嚴重度並列出所有來源）。附 Playwright 截圖（最壞資料，375px 與 1280px、深色）。

## 審查結論

| 視角 | P0 | P1 | P2 | 無缺口面向 |
|---|---|---|---|---|
| 系統 | 0 | 2 | 5 | 請求時序主流程（七個情境皆有測試）、取詳情失敗路徑、開啟焦點、API 契約與零變更、DB、日期時區、點數與 note 語意、e2e mock 不變式、f70 定位器、§11 單一路徑 |
| 架構 | 0 | 2 | 7 | §11 單一路徑、appShell／lazy、現況宣稱抽查、重構綠到綠（淨 diff 層面）、文件同步清單 |
| UI/UX | 0 | 1 | 6 | 資訊層次、三分法與確認鈕、375px／桌機版面（除長自由文字欄）、深色模式、三態（除重讀失敗顏色）、a11y 主體、資訊架構 |
| 需求 | 0 | 1 | 4 | Q1／D1–D13 全數落地、八條全數交代、需求溯源（無腦補）、不做清單、業務規則、定位器契約；既有 `MemberManagement.test.tsx` 零刪除行 |

**P0：無。** 四份都判「核心設計照 plan 落地」；P1 集中在「未記錄的偏離」與兩個實作層缺口。

## 發現清單（依嚴重度，去重後）

### P1

1. [P1]〔plan §2、§3、§5；`MemberManagement.tsx`、`MemberDetailSheet.tsx`〕未記錄的結構偏離（行為等價）：(a) plan 寫「序號遞增、比對與
   `openingIds` 移除收在一組小 helper」，實作只抽 `isLatest`，遞增與移除各自內聯；(b) `openingIds` 規劃 `Set<string>`、實作 `string[]`
   （為取最後一次點擊給 sr-only 用）；(c) 子元件多了 `onCloseAutoFocus` prop、觸發鈕多了 `data-member-detail-trigger`；(d) 錯誤框的
   `tabIndex`／ref 掛在外包 div 而非 `StatusCallout`；(e) `runAction` 的守衛不只重讀一行，動作失敗分支也守；(f) `button.tsx` 註解改動
   不在 plan §3 清單 → 補記 progress／PR 偏離說明；(a) 可抽 `bumpSeq()`／`settleOpening()` 守住原意。〔需求 P1、系統 P1-1、架構 P1-1；
   UI/UX 亦指出 (b)(d)〕
2. [P1]〔plan §2；`MemberManagement.tsx` `runAction`〕〔需人工裁決〕動作送出後立刻關面板、動作本身失敗（如 `last_admin`、
   `cannot_demote_self`）時，錯誤被序號守衛丟棄：面板已卸載、`actionError` 沒寫，admin 會以為成功；失敗分支也不重載列表 → 過期時改寫
   列表上方的 `actionError`（附會員名），或裁決接受靜默。〔系統 P1-2〕
3. [P1]〔plan §2 欄位盤點 vs §1 驗收 7／§4.1；`MemberDetailSheet.tsx` `WithdrawalItem`〕〔需人工裁決〕提領列的 `fee` 沒有呈現：plan §2
   字面寫 `fee`／`processedAt`／`completedAt`「依 D5 全部呈現」，但業主 D5 的清單與 §1／§4.1 只列匯款／完成時間；plan 內部不一致、
   progress 未記。「處理中（含手續費）」對不上列表金額時，客服無從核對 → 加「手續費 N P」一行，或依 D5 清單訂正 plan §2 並記一句。
   〔UI/UX P1、需求 P2-1〕
4. [P1]〔`MemberManagement.test.tsx` 手機 describe、`MemberCardList.tsx`、`MemberManagement.tsx`〕手機「關閉後焦點回卡片上的查看鈕」沒有
   測試守衛；契約靠字串 `data-member-detail-trigger` 散在三處、沒有共用常數 → 手機 describe 補一條，屬性名抽常數。〔架構 P1-2〕
5. [P1]（併入第 1 項）plan §5 寫「四顆鈕只呼叫 `onRequestAction`（斷言 payload）」，`MemberDetailSheet.test.tsx` 只驗暫停與撤銷；
   plan §5 階段 2 寫「桌機＋手機各補」，手機只有一條 → 補恢復／設為管理員的 payload。〔架構 P1-1(d)(e)、系統 P1-1、需求 P2-2〕

### P2

6. [P2]〔`MemberManagement.tsx` `runAction`〕`processingId` 是單值：A 動作在途時關面板、開 B 並對 B 發動作，A 結算會清掉 B 的 processing →
   結算改 `setProcessingId(p => p === target.id ? null : p)` 並補競態測試。〔系統〕
7. [P2]〔`runAction`〕〔需人工裁決〕動作在途時關面板又重開同一人：舊重讀被判過期而丟棄，重開那次若早於變更提交，面板停在舊狀態、無刷新
   → 結算時若目前面板是同一人就補讀一次，或記遺留。〔系統〕
8. [P2]〔`runAction` 的 `await list.reload()`〕列表重載期間「查看」鈕卸載，此時關面板焦點落回 body → 記遺留或重載後補還原。〔系統〕
9. [P2]〔`MemberManagement.tsx` sr-only〕讀取提示 `role="status"` 是隨文字新插入 DOM，報讀器不保證播報 → 改常駐
   `aria-live="polite"` 只換文字（不是 `role="status"`，不碰 test 121）。〔UI/UX P2-2〕
10. [P2]〔`MemberDetailSheet.tsx` `Field`〕長自由文字（證件退回理由，無長度上限）放在右對齊窄欄，多行左緣參差；同頁「退件理由」是整寬
    左對齊 → 退回理由改標籤在上、值整寬左對齊。〔UI/UX P2-3〕
11. [P2]〔`MemberDetailSheet.tsx`〕〔需人工裁決〕開啟焦點在固定身分卡標題、位於捲動容器外：純鍵盤使用者按 Space／PageDown 不捲動，
    Tab 直接跳到最底的管理鈕 → 捲動容器 `tabIndex={0}`＋`role="region"`＋`aria-label`，或明記接受。〔UI/UX P2-4〕
12. [P2]〔`MemberDetailSheet.tsx` 管理區〕〔需人工裁決〕重讀失敗（動作其實成功）與動作失敗同用紅色 `role="alert"`；§13 第 4 條規定區塊
    讀取失敗用中性錯誤字 → 重讀失敗改中性＋`role="status"`，動作失敗維持紅。〔UI/UX P2-6〕
13. [P2]〔截圖〕`s4-375-bottom.png` 不是真正的捲到底，底部留白未目視 → 補拍 `scrollTop = scrollHeight`。〔UI/UX P2-7〕
14. [P2]〔`ui/alert-dialog.tsx:124-125`、`ui/alert-dialog.test.tsx` 檔頭〕D3 之後仍寫「不可逆的破壞性確認才紅實心」，同類掃描漏網 → 改指向
    §12.11「確認鈕跟觸發鈕同類」。〔UI/UX P2-5、架構 P2-7、需求 P2-3〕
15. [P2]〔`WithdrawalStatusBadge.test.tsx`、`MemberDetailSheet.test.tsx`〕variant 斷言用子字串（`bg-warning` 也命中 `bg-warning-subtle`），
    「variant 一換就紅」不成立；`completed`＝`outline` 沒釘 → 改 `classList.contains`，補已完成。〔架構 P2-6〕
16. [P2]〔`WithdrawalStatusBadge.tsx` 檔頭、`WithdrawalManagement.tsx` 篩選 Select〕〔需人工裁決〕篩選選項仍手寫同一組標籤，與「只有這一張
    表」矛盾 → 由同一張表導出，或改檔頭措辭。〔架構 P2-3〕
17. [P2]〔`WithdrawalCardList.tsx`〕〔需人工裁決〕兄弟元件做法不一：`MemberCardList` 直接 import 徽章，`WithdrawalCardList` 仍收
    `statusBadge` render prop → 對齊成直接 import，或記為有意保留。〔架構 P2-4〕
18. [P2]〔`MemberCardList.tsx` vs `MemberStatusBadges.tsx`〕〔需人工裁決〕異常徽章順序兩處相反（卡片：管理員→已暫停；身分卡：已暫停→
    管理員）→ 卡片改同一順序，或註明刻意不同。〔架構 P2-5〕
19. [P2]〔規則只寫一份〕D3 判準句在 `actionCopy` 註解、`MemberManagement.test.tsx` 檔頭、母 progress 各完整出現一次；方向→外觀對照也
    在 `MemberDetailSheet.tsx` 註解與測試檔頭各抄一份 → 程式註解只留「見 §12.11」指標加最小事實。〔架構 P2-8〕
20. [P2]〔`MemberManagement.tsx` 請求序號 vs 母 progress「`usePagedList` 加請求序號」遺留〕〔需人工裁決〕S4 元件內手寫序號、S5 預定在
    hook 內另加，會並存兩種寫法 → 遺留記一行 S5 收斂點（例：抽 `useLatestRequest`）。〔架構 P2-9〕
21. [P2]〔`e2e/mocks/admin_console_mock.py` 最壞夾具〕近期提領 `requestedAt` 升冪，真端點是降冪 → 夾具改降冪。〔系統〕
22. [P2]〔`api/index.ts:1536` 對照新呈現的暫停時間〕〔需人工裁決〕停權端點每次覆寫 `suspended_at`（非冪等），雙分頁重按會改寫客服看到的
    暫停時間；plan 零 API 變更 → 記遺留。〔系統〕
23. [P2]〔`MemberDetailSheet.test.tsx`〕測試清單落差：匯款／完成時間只測正向、沒有反向（pending 列無匯款時間）；過期重讀的 `panelError`
    丟棄沒有釘；電話 null「—」、身分證 null「未設定」沒有斷言 → 補。〔需求 P2-2〕
24. [P2]〔`construction-plan.md` §3 S4 開工 prompt〕仍寫「會籍與金流」與舊順序（歷史 prompt，plan §8 未列）→ 加註「以 plan.md §3 A3
    為準」。〔需求 P2-3〕
25. [P2]〔progress.md 階段 5、PR 描述〕progress 階段 5 仍標未開始；PR「偏離規劃說明」需含 §4.3 三態改寫、D6、D9 與第 1 項 →
    收尾更新。〔需求、架構、系統皆提〕

## 需人工裁決

reviewer 標〔需人工裁決〕的項目（主 session 未降級或剔除任何發現）：第 2、3、7、11、12、16、17、18、20、22 項。主 session 的處置建議與業主
裁決記在下方「處置」。

## 處置（人審後填寫）

<!-- P0 的處置規則：必須修掉，或由人在此明文豁免。 -->

業主裁決（2026-10-06，session 內互動選項）：
- 第 3 項 → **每筆提領加「手續費 N P」**（零 API 變更；plan §2 與 D5 清單的落差以此收斂）。
- 第 2 項 → **面板已關時，動作失敗改印在列表上方錯誤框**（「{姓名}：{錯誤原文}」）並重載列表。
- 第 7 項 → **修**：動作結算時，目前開著的面板若是同一位會員就補讀一次。
- 其餘〔需人工裁決〕（第 11、12、16、17、18、20、22 項）→ **全部照審查建議**：能小修的修（行為變更先寫紅燈），後端相關（第 22 項）
  與 S5 收斂點（第 20 項）記遺留。

主 session 處置（不需裁決的項目照審查建議）：第 1、4、5、6、8、9、10、11、12、13、14、15、16、17、18、19、21、23、24、25 項修；
第 8、20、22 項記遺留。處置 commit 與結果見 progress.md。

- [x] 人審完成，裁決：無 P0；P1／P2 依上列處置（業主 2026-10-06 session 內裁決）
