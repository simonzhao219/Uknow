# listings RLS policy 行為驗證 實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支:`feature/rls-listings-policies`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

> 規劃本身是在 web session 的 `claude/rls-listings-policies-plan-afn43h` 分支上
> 產出的(平台預先開好,不符 `feature/*`)。**實作要另切
> `feature/rls-listings-policies`** ——PreToolUse 守衛以分支 slug 對應
> `docs/plans/<slug>/`,slug 必須是 `rls-listings-policies` 才找得到這份規劃書。

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | L1 結構守衛(`api/rls-policies.test.ts`) | ⬜ 未開始 | | |
| 2 | PostgREST 回應分類器純函式(`tools/rest_as_user.py` + `tools/test_rls_probe.py`) | ⬜ 未開始 | | |
| 3 | L2 讀取邊界情境(驗收 1–4) | ⬜ 未開始 | | |
| 4 | L2 寫入邊界情境(驗收 5–9) | ⬜ 未開始 | | |

## 目前位置與下一步

規劃已完成並待人審(`/review-plan` 報告見 `./review.md`)。
下一步:人裁決 §6 的四個開放問題 → 人親自打 `/tdd-implement rls-listings-policies`。

## Blockers(逃生口紀錄)

<!-- 三種合法分支的紀錄處:
     1. 紅燈測試一寫就綠(功能已存在)→ 記錄後跳過該階段,人審知悉
     2. 實作中發現 plan 該階段有誤 → 停手記錄,求人工裁決,禁止私改 plan
     3. 綠不了 → 記錄嘗試過什麼,求人工裁決,禁止改測試遷就實作 -->

- 階段 3、4 **本機沒有紅綠燈**(journey 不在本機跑)。這是已知體質,不是 blocker:
  紅燈證據取 `pytest --collect-only -q`,行為真值等 CI。實作時不要為了製造本機
  紅燈而繞過 hook。

## 框架摩擦

<!-- 被 hook 誤擋?規則互相矛盾?同一糾正重複兩次?
     一句話記這裡,整併時搬去 docs/plans/friction-log.md。 -->

- bash-guard 對含 `pytest.ini` 字樣的 `cat` 指令誤判為「在本機跑 journey」而擋下
  (2026-08-07 規劃期,改用 Read 工具即通過)。誤擋成本低,但關鍵字比對打到的是
  「檔名」而非「執行」,值得在整併時看一眼。
