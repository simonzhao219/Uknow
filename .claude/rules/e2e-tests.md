---
paths:
  - "e2e/**"
---

# E2E 測試工作守則

`e2e/` 底下是**兩套互相隔離的 Python 套件**,搞混會打到真後端:

## e2e/(主套件,全 mock)

- pytest-bdd + Playwright,`features/*.feature` + `*_steps.py`
- 網路全部 mock(Supabase/PayUni 都不真打),免 secrets
- 本機跑法:先 `npm run dev`(port 3000),再 `cd e2e && pytest`
- `pytest.ini` 的 `norecursedirs` 刻意排除 journey/——別移除這行

## 要刪 e2e 情境之前

這一層最貴,「同一行為下層已驗過」的情境值得刪——但**刪錯是把關靜默變弱,
沒有人會發現**。判準(A/B/C 三級證據、不算證據的清單、四旅程與
`route_guards.feature` 的 must-keep 清單)寫在 **`e2e/README.md` 的
「Removing a scenario」與「Must-keep end-to-end coverage」兩節**,
動手前先讀那裡,規則只寫一份、這裡只放指標。

一句話版本:**套用「決策函式已被測」這種證據時,要 `grep` 到被測情境
實際 import 的那個識別字——名字看起來像同一件事不算數。**

must-keep 那半邊**有機械把關**:`scripts/check-e2e-mustkeep.py`(接在
framework-check 軌,無路徑過濾)把 `e2e/README.md` 的必留清單逐字比對到
`features/*.feature`。刪到必留情境、或把那一節改寫成抽取不到的形狀,CI 都會紅。
A/B/C 那半邊沒有、也不該有機械把關——「證據夠不夠」是人的判斷,機器代不了。

## e2e/journey/(Journey 套件,打真後端)

- 有自己的 pytest.ini(rootdir 隔離),打**真的** Supabase 拋棄式分支,
  dev server 用 3100 埠
- **絕不在本機執行**(會產生真資料、耗分支費用;PreToolUse hook 會擋)。
  它只在 journey-nightly.yml(排程)與 workflow_dispatch 跑
- 唯二本機可跑:`cd e2e/journey && pytest tools/ -q`(離線純函式)與
  `pytest --collect-only -q`(情境收集健全性)——CI 的 journey-offline
  軌跑的就是這兩條
- 完整設計:`docs/e2e-journey-test-design.md`
