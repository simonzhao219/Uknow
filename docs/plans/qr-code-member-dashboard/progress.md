# 我的 QR 整合頁（qr-code-member-dashboard）實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看,不要寫只有當下
     session 才懂的簡稱。 -->

分支:`claude/qr-code-member-dashboard-qs36st`（web session 由平台開的分支，
非 `feature/*`，規劃書守衛不啟動；規劃仍照三段式走）
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 分頁決策純函式（`myQrTabPreference` 加 `scan` 與 URL 優先序） | ⬜ 未開始 | | |
| 2 | 掃描頁改面板（`admin/MemberVerifyScanner` 去頁首、卸載停相機） | ⬜ 未開始 | | |
| 3 | `MyQrPage` 新頁（分頁組合、深連結、偏好寫回） | ⬜ 未開始 | | |
| 4 | 接線（`MyQrEntry` 改 Link、刪 `MyQrDialog`、路由與轉址、`/admin` 捷徑、返回層級表） | ⬜ 未開始 | | |
| 5 | 文件與 e2e 同步（規格書 §3／§13.1、溢版巡檢路由與 mock、步驟註解） | ⬜ 未開始 | | |

## 目前位置與下一步

規劃書已寫、`/review-plan` 四視角已跑完（`./review.md`：P0 0／P1 9／P2 9），
規劃書已依審查修訂（plan.md 末段「修訂紀錄」逐條對應 review.md 的編號）。
**待人審裁決**：review.md「處置」節的勾選項（含開放問題 #1–#3 與相機啟動時機）。
人審通過後由人親自 `/tdd-implement qr-code-member-dashboard` 啟動實作；
若人要求，對修訂版重跑 `/review-plan`（因無 P0，非強制）。

## Blockers(逃生口紀錄)

<!-- 三種合法分支的紀錄處:
     1. 紅燈測試一寫就綠(功能已存在)→ 記錄後跳過該階段,人審知悉
     2. 實作中發現 plan 該階段有誤 → 停手記錄,求人工裁決,禁止私改 plan
     3. 綠不了 → 記錄嘗試過什麼,求人工裁決,禁止改測試遷就實作 -->

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
