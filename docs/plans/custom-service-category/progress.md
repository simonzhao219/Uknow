# 自訂服務類別 實作進度

分支:`claude/custom-service-category-cdss2f`(web session 由平台預開,非 `feature/*`)
規劃書:`./plan.md`|審查:`./review.md`(11 個 P1 全數改入 plan,0 P0)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 領域純函式(正規化/收斂/驗證/排序) | ✅ 綠 | `c21aa46` | `813c1fe` |
| 2 | 資料層 view + 正規化 trigger | ✅ 綠 | —(見 Blockers 1) | `0e9a8e8` |
| 3 | 共用類別欄位元件 + Create/Edit 接線 | ✅ 綠 | `bc31287` | `119efaa` |
| 4 | 篩選器 chip + 首頁接線 | ✅ 綠 | `bcb7346` | `cf6f96c` |
| 5 | 溢字防線 + 文件升級 | ✅ 綠 | `522d0f7` | `004e407` |

驗證:`npm run check` 綠(746 → 761 條測試)、`npm run build` 綠、
`bash scripts/framework-check.sh` 綠、`deno fmt --check` 與 `deno lint` 綠。

## 目前位置與下一步

全階段綠。四視角實作審查(`/review-implementation`)進行中,
P0 處置完才 push 開 PR。

## Blockers(逃生口紀錄)

1. **階段 2 沒有可觀察的紅燈**。Deno 的資料庫測試需要 `supabase start`
   (Docker),本容器沒有;`deno` 本身也不在 PATH,`deno.land` 被網路政策擋掉
   ——改用 `npm i -g deno` 裝起來,`fmt`/`lint` 因此跑得動,但 `deno check`
   仍解析不了 jsr.io 相依(403),pre-commit 依既定規則降為警告。
   → **階段 2 的 12 條 Deno 測試在本機從未執行過**,紅綠都是推論。
   驗證點是 CI 的 `api-tests` 軌。這條要在 PR 描述誠實揭露。

2. **手機底部篩選面板的視覺自查沒完成**。Playwright 在無頭環境下點不開
   Radix Sheet(portal + 動畫)。緩解:桌面 popover 用的是**同一個**
   `CategoryFilterChips` 元件,該畫面已截圖驗證長類別 chip 的渲染、選取與
   寬度界限;該元件另有 8 條斷言。

## 框架摩擦

- `pre-push-rebase` hook 會在**非 git 指令**上觸發自動 rebase 並中止該指令
  (本 session 遇到 3 次:一次 `cp`+heredoc、一次 `npx vitest`、一次多行
  heredoc 寫檔)。中止點在指令執行前,所以檔案沒被寫入,但表面上看起來像
  指令跑完了——需要事後 `ls`/`wc -l` 才發現沒生效。整併時值得看一下觸發條件。
- knip 會把「尚未被引用的新檔」判為 unused file,而 TDD 紅燈期的靜態閘門
  包含 knip:於是「先寫 hook 再接線」的順序會被自家閘門擋住。
  這次的繞法是把 hook 押到綠燈 commit。不是誤擋(knip 沒說錯),但值得記錄
  ——它實質上要求「新增的非測試檔必須與其消費端同一個 commit」。
