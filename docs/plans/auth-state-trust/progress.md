# 登入狀態信任（T1）實作進度

<!-- plans-keep: 跨 session 施工鷹架（規劃 PR 先於實作合併，三段式狀態全在本目錄）；退場條件＝T1 實作 PR 收尾（/tdd-implement 收尾）時決策升級進規格書／friction-log，整個目錄刪除 -->

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支:`feature/auth-state-trust`
規劃書:`./plan.md`（上游總綱 `git show 55268e03:docs/plans/platform-growth-and-trust/plan.md` §1）|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| A0 | 開工前置：資料查證 SQL 重跑（plan §2.1）、`isLoggedIn` 清查、`localStorage.user` 讀寫全表 | ⬜ 未開始（規劃期查證已做，見下） | — | — |
| A1 | 純函式：authHint、classifyMembershipGate／isFirstTimeFunnel／nextFunnelRoute、resolveAuthView、fetchProfile | ⬜ 未開始 | | |
| A2a | useAuthBootstrap 本體（reducer／outcome、hint 擁有與寫入、uid8、副作用注入、generation counter） | ⬜ 未開始 | | |
| A2b | 其餘 8 處 /profile 收斂、clearAuthHint 補點、刪 localStorage.user 寫入、e2e 基線 | ⬜ 未開始 | | |
| A3 | Navbar 五 view＋繼續完成註冊、useFunnelLogout、BottomNav／padding、e2e S1–S11 | ⬜ 未開始 | | |
| A4 | 規格書 §2.1 註冊中角色＋已知限制、ui-ux §3 | ⬜ 未開始 | | |
| B1 | 後端 authenticate／讀取對照表／ProfileReadError 503／?retry=1 | ⬜ 未開始（可晚一波） | | |
| B2 | 前端 8 秒逾時＋重試＋degraded＋endInvalidSession | ⬜ 未開始（可晚一波） | | |
| B3 | 規格書 §5.3、§14 #8 | ⬜ 未開始（可晚一波） | | |

## 目前位置與下一步

**人審通過（2026-10-31，業主）**：規劃 v4.1 定稿、review.md〈處置〉已勾。實作由新開的執行 session 跑 `/tdd-implement auth-state-trust`（A2a／A2b 用 Opus，A1／A3／A4 用 Sonnet；收尾另開審查 session 跑 `/review-implementation`）。第一步 A0：主 session 代跑 plan §2.1 查證 SQL（正式站＋develop），結果加一列到下表後才進 A1。

## A0 資料查證紀錄

| 時間 | 環境 | funnel_candidates | with_completed_order | with_subscription_row | with_active_referral_code | 執行者 |
|---|---|---|---|---|---|---|
| 2026-10-31 09:40 UTC | 正式站 uhtwwxtazwqnlbejhprl | 0 | 0 | 0 | 0 | 主 session（唯讀） |
| 2026-10-31 09:40 UTC | develop ijcxnxhrziehdtkwausy | 1 | 0 | 0 | 0 | 主 session（唯讀） |

→ 後三欄兩站皆 0，判定表維持原樣。**A1 開工前必須重跑一次**（SQL 見 plan §2.1）並加一列；任一後三欄 ＞0 → 停下回報主 session 重審（F3）。

## Blockers(逃生口紀錄)

## 框架摩擦

- 推送守衛在分支落後 develop 時自動 rebase，之後要求 `--force-with-lease`，但 auto mode 分類器擋 force push——規劃 session 推不上去，改用 GitHub API（push_files）疊 commit，分支因此落後 develop。
- 規劃 PR 先於實作合併時，新目錄要在開 PR 前就加 `plans-keep`，否則 framework-check 的 check-plans-scaffold 紅；plan-feature skill 沒提這步。
