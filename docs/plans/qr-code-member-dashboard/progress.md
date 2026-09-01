# 我的 QR 整合頁（qr-code-member-dashboard）實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看,不要寫只有當下
     session 才懂的簡稱。 -->

分支:`claude/qr-code-member-dashboard-qs36st`（web session 由平台開的分支，
非 `feature/*`，規劃書守衛不啟動；規劃仍照三段式走）
規劃書:`./plan.md`（第 3 版，方案 B）|審查:`./review.md`(P0 須全數處置才可開工)
PR:#300（草稿轉 ready-for-review，目前只含規劃鷹架）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 分頁決策純函式（`myQrTabPreference` 加 `scan`、URL 優先序、同批改 `MyQrDialog` 呼叫） | ⬜ 未開始 | | |
| 2 | 後端 `POST /members/verify` 取代 admin 端點（授權矩陣、遮罩、稽核 `verifier_id`）＋ migration 改名；**紅綠以 CI api-tests 軌為準（本機無 deno）** | ⬜ 未開始 | | |
| 3 | 掃描面板搬到 `referral/`、去頁首、端點改路徑、卸載停相機（含競態） | ⬜ 未開始 | | |
| 4 | `MyQrPage` 新頁（`joined × canScan` 矩陣、深連結、偏好寫回、依來源返回） | ⬜ 未開始 | | |
| 5 | 接線（`MyQrEntry` 改 Link＋預熱、刪 `MyQrDialog`、路由與轉址、`/admin` 捷徑、返回層級表） | ⬜ 未開始 | | |
| 6 | 文件與 e2e 同步（規格書 §2.1／§3／§13.1／§13 註、ui-ux §7 路徑、溢版巡檢三條、fake camera 第一屏斷言） | ⬜ 未開始 | | |

## 目前位置與下一步

2026-09-01：人審裁決五題（掃描開放會員＝方案 B、不放縮圖、保留 `/admin` 捷徑、
切到分頁即啟動相機、非管理員看遮罩名），規劃書改寫為第 3 版；依人審要求對第 3 版
**重跑一輪四視角審查**，結果附在 `./review.md`「第 2 輪審查」。
**開工條件**：第 2 輪無未處置 P0 → 由人親自 `/tdd-implement qr-code-member-dashboard`。

## Blockers(逃生口紀錄)

<!-- 三種合法分支的紀錄處:
     1. 紅燈測試一寫就綠(功能已存在)→ 記錄後跳過該階段,人審知悉
     2. 實作中發現 plan 該階段有誤 → 停手記錄,求人工裁決,禁止私改 plan
     3. 綠不了 → 記錄嘗試過什麼,求人工裁決,禁止改測試遷就實作 -->

- 階段 2 的 Deno 測試在本容器跑不了（無 deno、無 supabase CLI）：紅燈 commit 以
  「測試檔已改、CI api-tests 軌紅」為證據，綠燈同理。實作時把該軌的 run 連結記在
  這裡。

## 框架摩擦

<!-- 被 hook 誤擋?規則互相矛盾?同一糾正重複兩次?
     一句話記這裡,整併時搬去 docs/plans/friction-log.md。 -->

- bash-guard 把純讀取的 `git config core.hooksPath`（用來確認 hook 有掛上）當成
  覆寫擋下——守衛比對的是字面而非「有沒有帶值」。誤擋率低、改法明確（比對
  `core.hooksPath` 後面是否跟著值），整併時再處理。
- `pre-push-rebase.sh` 在 settings.json 裡掛在 `matcher: "Bash"` 下、靠 `"if":
  "Bash(git push*)"` 篩選，但本 web session 的 harness 沒有尊重 `if`——一條純等待用
  的 `grep`/`sleep` 迴圈也觸發了它：origin/develop 剛好前進一個 commit（#292），
  hook 就把本分支 rebase（實際是 fast-forward，無 commit 可丟）並以「push 會被拒」
  的理由擋掉那條**不是 push** 的指令。症狀輕（重跑即過、訊息誤導），但表示
  「只在 push 前 rebase」這條契約的觸發條件不可靠；整併時考慮把 `git push` 的
  判斷搬進腳本本身（讀 `tool_input.command`），不依賴 `if`。
- 同一支 hook 的 `had_remote_branch` 是看**本機追蹤 ref**（`git rev-parse origin/<branch>`），
  不是看遠端。web session 由平台預建的 `origin/claude/*` 追蹤 ref 指著開局的 develop
  head，但 GitHub 上根本沒有這條分支（`git ls-remote --heads` 為空）——於是第一次
  push 被以「遠端已有舊歷史、會 non-fast-forward」擋下並要求 `--force-with-lease`，
  而裸的 `--force-with-lease` 又因追蹤 ref 與遠端不符回 `stale info`。解法是
  `git ls-remote` 取真實遠端值後 `--force-with-lease=<branch>:<值或空>`；整併時
  hook 應改用 `git ls-remote --heads origin <branch>` 判斷遠端分支是否存在。
