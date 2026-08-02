# 管理後台強化（會員管理 + 提領管理）實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看,不要寫只有當下
     session 才懂的簡稱。 -->

分支：`claude/admin-dashboard-members-withdrawal-xnqajy`
（web session 由平台預先開好，非 `feature/*`；規劃檔守衛因此不生效，
三段式流程是自願遵守的，見 CLAUDE.md「已知例外」段）

規劃書：`./plan.md`｜審查：`./review.md`（P0 須全數處置才可開工）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | CSV 欄位跳脫純函式（`src/utils/csv.ts`） | ⬜ 未開始 | | |
| 2 | 提領狀態機擴充：admin 代為完成 + `processed_by`/`completed_by` | ⬜ 未開始 | | |
| 3 | 退件／代為完成理由必填，且會員看得到 | ⬜ 未開始 | | |
| 4 | 提領列表分頁契約 + 彙總 + 篩選 | ⬜ 未開始 | | |
| 5 | 會員列表：全站 `stats` + 篩選 + 排序 + `endDate` | ⬜ 未開始 | | |
| 6 | 會員詳情 `GET /admin/members/:id` | ⬜ 未開始 | | |
| 7 | 管理員授予／撤銷 `POST /admin/members/:id/admin` | ⬜ 未開始 | | |
| 8 | 提領前端改版 | ⬜ 未開始 | | |
| 9 | 會員前端改版 | ⬜ 未開始 | | |
| 10 | 會員端提領記錄顯示退件理由 | ⬜ 未開始 | | |
| 11 | 規格書同步（§10.3 / §13 / §14） | ⬜ 未開始 | | |

## 目前位置與下一步

規劃書已完成，**尚未開工**。下一步是跑 `/review-plan admin-dashboard-members-withdrawal`
取得四視角審查報告，然後停下等人審。實作只能由人親自打
`/tdd-implement admin-dashboard-members-withdrawal` 啟動。

plan.md 第 6 節有 6 個開放問題待裁決，其中 **#1（代為完成是否強制填理由）**
與 **#4（詳情面板是否遮罩身分證/銀行帳號）** 會直接改變階段 2、3、6 的測試斷言，
開工前必須有答案。

## Blockers（逃生口紀錄）

<!-- 三種合法分支的紀錄處:
     1. 紅燈測試一寫就綠(功能已存在)→ 記錄後跳過該階段,人審知悉
     2. 實作中發現 plan 該階段有誤 → 停手記錄,求人工裁決,禁止私改 plan
     3. 綠不了 → 記錄嘗試過什麼,求人工裁決,禁止改測試遷就實作 -->

（無）

## 框架摩擦

<!-- 被 hook 誤擋?規則互相矛盾?同一糾正重複兩次?
     一句話記這裡,整併時搬去 docs/plans/friction-log.md。 -->

- web session 的預設分支是 `claude/*`，與 CLAUDE.md「真的要走三段式流程時，
  自己切一個 `feature/<slug>` 分支」相衝——本 session 被平台綁定推送分支，
  切 `feature/*` 會推不上去。三段式因此在 `claude/*` 上執行，規劃檔守衛全程
  不生效（流程靠自律而非機械把關）。
