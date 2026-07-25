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

## e2e/journey/(Journey 套件,打真後端)

- 有自己的 pytest.ini(rootdir 隔離),打**真的** Supabase 拋棄式分支,
  dev server 用 3100 埠
- **絕不在本機執行**(會產生真資料、耗分支費用;PreToolUse hook 會擋)。
  它只在 journey-nightly.yml(排程)與 workflow_dispatch 跑
- 唯二本機可跑:`cd e2e/journey && pytest tools/ -q`(離線純函式)與
  `pytest --collect-only -q`(情境收集健全性)——CI 的 journey-offline
  軌跑的就是這兩條
- 完整設計:`docs/e2e-journey-test-design.md`
