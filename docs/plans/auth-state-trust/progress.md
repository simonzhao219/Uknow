# 登入狀態信任（T1）實作進度

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

規劃與審查完成，等業主裁決 review.md 的 P0／P1 與 plan.md §6 開放問題；`/profile` P95 量測（plan §2.4）結果待填。

## Blockers(逃生口紀錄)

## 框架摩擦
