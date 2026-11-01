# 第 4 波：交接（第 3 波主 session 寫，2026-11-01）

<!-- plans-keep: 跨 session 鷹架（第 4 波主／執行／審查 session 的共同事實來源）；退場條件＝第 4 波審查 session 結案後，值得長留的升級進規格書／friction-log，其餘隨 commit 刪除 -->

寫給**全新的第 4 波主 session**：它開局時只有 repo 和這份檔，沒有對話記憶。本檔只是第 3 波主 session 的交接。
開局後，請你把它擴寫成本波完整的 plan，包括裁決表、工作分解、名冊、進度表，格式比照 `docs/plans/launch-wave-3/plan.md`。
三種 session 的分工、凍結規則、雲端執行環境須知，都寫在 `docs/README.md`〈慣例〉。派工 prompt 的共用開頭，照抄第 3 波的
`docs/plans/launch-wave-3/dispatch-prompts.md`，再補上本檔 §2。

## 0. 上游與現況

**要讀的上游檔**

- `docs/plans/launch-wave-3/plan.md`：§0 裁決 W3-1～15、§5 候選、§8 進度。
- `docs/plans/launch-wave-3/review.md`：第 3 波審查（R3），P0 0、P1 0、P2 22。其中 §5 是待辦，§6 的升級表是 `launch-wave-3/` 退場的依據。
  這份檔由 #480 合進 develop。開局時若 #480 還沒合，就用 `git show origin/docs/wave3-review:docs/plans/launch-wave-3/review.md` 讀。

**現況**（2026-11-01 交接時）

- main＝`1f61e68`：第 3 波晉升 #477，業主已核准 production。正式站 `/health` sha、build-sha 都相符，兩支 migration 都已套用。
- develop 領先 main 的只有 docs：#478 第 3 波紀錄、#479 第 2 波退場、#480 R3 報告。
- 條款十之一照片清理已全面上線：
  - `PHOTO_PURGE_LIVE=true`，每日台北 03:17 跑一次。
  - 11/01 的候選是 0。第一次實刪排程在 11/02 03:17，結果寫在 R3 報告 §3.2。
- `RECONCILE_SECRET` 已在 11/01 輪換：GitHub、正式站、develop 三處同值，業主存在密碼管理器。之後換 secret，三處要一起改，
  而且 GitHub 這一處最容易漏掉（11/01 就是 GitHub 沒存上，對帳推了一則 P1）。

## 1. 本波工項（交接時的建議，開局後要和業主確認）

| # | 工項 | 來源 | 建議模型／流程 | 備註 |
|---|---|---|---|---|
| F1 | 共用 Button 的 `aria-disabled` 樣式（`pointer-events-none`＋`opacity-50`）讓後台重新整理鈕在自動更新時變灰、點不到，違反 K5；另外三件一併收進同一支小 PR：登出、換帳號、cancel-signup 的 P2，以及提領銀行帳號 `withdrawalBankData` 存在 localStorage、登出時不清 | W3-15（業主：第 4 波優先）；R3 P2-1～5 | Sonnet，`/fix-bug`，一支 PR | **本波第一項**。細節以 R3 `review.md` 為準 |
| T1-B | T1 PR-B：暫時性故障不登出，包括 degraded 狀態、`/profile` 8 秒逾時＋重試、後端 503 | W3-1 順延 | Opus，三段式 | 規劃原檔：`git show b4b5bdcb:docs/plans/auth-state-trust/plan.md` §2.3／§5 PR-B。要重新落檔成 `feature/<slug>` 的 plan 並重跑審查，由業主親打 `/tdd-implement` |
| E | e2e 偶發補診斷：`registration.py` 的 OTP→完善資料頁步驟、`task_card_shows_progress`，失敗時補 `dump_page` | 晉升 #477 的 journey 第一輪紅了兩條，重跑後綠 | Sonnet，小 PR | 下次偶發才看得出卡在哪一頁 |
| D | issue #467 npm audit（critical 2、high 10） | 第 2 波審查 | Sonnet | 先看 Dependabot 週一批次。`vitest`／`vite` 大版本另開 PR |

其他候選見 `launch-wave-3/plan.md` §5 與 R3 `review.md` §5，由主 session 和業主排序。

## 2. 第 3 波新增的環境須知（派工 prompt 照抄）

- **合併後 GitHub 會自動刪 head 分支**。主 session 的紀錄分支合併後也會消失，再推之前要先從 develop 重建：
  `git checkout -B <分支> origin/develop`。
- **推送守衛（`pre-push-rebase.sh`）在指令執行前就會攔下**，先 rebase，再要求 `--force-with-lease`。
  所以「改檔＋commit＋push」寫在同一個 Bash 指令裡時，**連前面的改檔與 commit 都不會執行**。commit 和 push 要分成兩次呼叫。
- **一個分支只能由一方 rebase**。第 3 波 C 的分支被主 session 和執行 session 各 rebase 一次，互相覆蓋。開工時就要講定由誰負責。
- **執行 session 不一定收得到 CI 事件**：C 在 CI 綠了之後沒轉 ready。主 session 要自己查 check runs。
  rebase 後的 diff 若與審過的版本逐位元組相同，可以直接合併。
- **子 session 對正式站的唯讀 SQL，會被權限分類器擋下**（Production Reads，R3 遇過）。一律交主 session 代跑。
- **晉升時 journey-full 若偶發紅**：照規則只重跑一次。重跑綠、而且執行 session 對照程式路徑後判定與本波改動無關，才合併，並在晉升 PR 留言記錄。
- **雲端 worker 常重啟**。重啟後先讀 notifications，再看 `git status` 與 plan §8，不要憑記憶判斷進度。
- **send_later／ScheduleWakeup 不能當成唯一的事件來源**：PR 事件會叫醒 session，自設的提醒只當保險。

## 3. 業主待辦（交接時）

目前沒有未完成的。持續關注的有兩件：
1. 每日照片清理排程失敗時會自動開 issue，標題是「[production] 刊登照片孤兒清理失敗」。
2. 第一筆正式站真付款完成後，確認發票有開立，`system_alerts` 也沒有誤報。

**給第 4 波主 session（開局即做）**：核對 `purge-listing-photos.yml` 首輪實刪排程（台北 11/02 03:17＝UTC 11/01 19:17）那個 run 的
step summary：確認綠燈，`candidateCount`／`removed` 數合理（基線預期 0，見第 3 波 review §3.2）；紅了照自動開的 issue 處理。
結果記進本檔進度表，並補進第 3 波 review §2 未驗項的結論。

## 4. 第 3 波目錄退場

由**第 4 波審查 session** 依 `launch-wave-3/review.md` §6 升級後，`git rm -r docs/plans/launch-wave-3/`。
這是第 2 波（#479）、第 1 波（#468）的同一套做法。
