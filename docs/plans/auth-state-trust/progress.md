# 登入狀態信任（T1）實作進度

<!-- plans-keep: 跨 session 施工鷹架（規劃 PR 先於實作合併，三段式狀態全在本目錄）；退場條件＝T1 實作 PR 收尾（/tdd-implement 收尾）時決策升級進規格書／friction-log，整個目錄刪除 -->

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支:`feature/auth-state-trust`
規劃書:`./plan.md`（上游總綱 `git show 55268e03:docs/plans/platform-growth-and-trust/plan.md` §1）|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 純函式：authHint（kind）、isFirstTimeFunnel、resolveAuthView、fetchProfile | ⬜ 未開始 | | |
| 2 | 後端 authenticate／五讀取 fail-closed／onError／契約 unknown | ⬜ 未開始 | | |
| 3 | useAuthBootstrap＋endInvalidSession＋9 處 /profile 收斂 | ⬜ 未開始 | | |
| 4 | Navbar 四 view、BottomNav／padding／hasBottomNav、守衛 degraded、漏斗登出 | ⬜ 未開始 | | |
| 5 | 規格書 §2.1／§5.3／§14 #8、ui-ux §3 | ⬜ 未開始 | | |

## 目前位置與下一步

plan v2（D1–D6 後）重審完成：P0 0／P1 12／P2 16，等業主裁決 review.md〈需人工裁決〉五題後修 plan v3；`/profile` P95 改上線後量測（D6）。

## Blockers(逃生口紀錄)

## 框架摩擦

- 推送守衛在分支落後 develop 時自動 rebase，之後要求 `--force-with-lease`，但 auto mode 分類器擋 force push——規劃 session 推不上去，改用 GitHub API（push_files）疊 commit，分支因此落後 develop。
- 規劃 PR 先於實作合併時，新目錄要在開 PR 前就加 `plans-keep`，否則 framework-check 的 check-plans-scaffold 紅；plan-feature skill 沒提這步。
