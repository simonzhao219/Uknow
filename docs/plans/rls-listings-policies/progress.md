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
| 1 | L1 結構守衛(`api/rls-policies.test.ts`):集合 + 逐條角色 + 表達式 golden + 欄位集合不變式 | ⬜ 未開始 | | |
| 2 | `classify()` 純函式(`tools/rls_probe.py` + `tools/test_rls_probe.py`) | ⬜ 未開始 | | |
| 3 | L2 讀取邊界情境(驗收 1–5,**5 條**) | ⬜ 未開始 | | |
| 4 | L2 寫入邊界情境(驗收 6–11,**6 條**) | ⬜ 未開始 | | |

情境數 28 → **39**。`MIN_FULL=20` 不動(理由見 plan.md §3)。

## 目前位置與下一步

規劃與四視角審查都已完成,**待人審**。審查結果:P0 = 0、P1 = 5、P2 = 9
(見 `./review.md`)。

下一步(順序不可換):

1. 人裁決 `review.md`〈處置〉節的 P1/P2 與規劃書 §6 的四個開放問題
2. 依裁決更新 `plan.md` 的 §1 與 §5 —— 5 條 P1 裡至少 3 條會**改變階段切分
   的內容**(新增擁有者 update 正面情境、admin 繞過情境、欄位集合比對測試),
   不先更新的話實作期必然撞牆
3. 人親自打 `/tdd-implement rls-listings-policies`

⚠️ **開工前的分支動作**(review.md 架構 P1-1):`/tdd-implement` 從 develop 切出的
`feature/rls-listings-policies` 不含 `docs/plans/rls-listings-policies/`
(它只在規劃分支上),`feature-plan-guard.py` 只看當前分支,會擋下 Stage 1 的
第一次寫入並印出誤導性的「先跑 `/plan-feature`」。切完分支第一步先把規劃檔帶過去:

```
git checkout claude/rls-listings-policies-plan-afn43h -- docs/plans/rls-listings-policies
git commit -m "docs: 帶入已審過的規劃書與審查報告"
```

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
