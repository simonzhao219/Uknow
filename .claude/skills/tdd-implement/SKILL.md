---
name: tdd-implement
description: 依已審核的規劃書進行 TDD 實作（紅→綠、相位鎖、階段制）
argument-hint: [feature-slug]
disable-model-invocation: true
---

# /tdd-implement — 實作階段

依 `docs/plans/$ARGUMENTS/plan.md` 的階段切分逐階段 TDD。
**只有人可以啟動本 skill**——這是「人審通過才實作」的機制保證。

**本階段可在全新 session 執行**,rehydrate 全靠檔案(刻意不用動態注入
glob——多 feature 並存時會吃進別案狀態):

## 0. Rehydrate(每次進入本 skill 都做)

1. Read `docs/plans/$ARGUMENTS/plan.md`、`review.md`、`progress.md`
2. `git log --oneline -8` 對照 progress.md 的階段狀態表,確認實際位置
3. **開工前置檢查**(不過就停):
   - review.md 存在未處置 P0 → 拒絕開工,提示回 `/review-plan` 流程
   - review.md「處置」節未勾人審裁決 → 拒絕開工
   - `.claude/tdd-lock` 殘留但最後 commit 非 `test(red)` → 先跑
     `scripts/tdd-unlock.sh` 校驗清鎖
4. 分支:不在 `feature/$ARGUMENTS` 就從 develop 切出
   (`git checkout -b feature/$ARGUMENTS develop`)

## 每階段的紅綠循環

**紅**(紅燈 = 編譯過、斷言失敗——typecheck 紅不叫紅燈,叫還沒寫完):
1. 受測 API 不存在時先建最小 stub(只求型別過,行為留空)
2. 依 plan 該階段的測試落點寫測試(vitest node / jsdom pragma / deno test
   ——落點已在規劃時定案,不要臨場改層)
3. 跑測試**確認紅**,而且是斷言紅不是編譯紅
4. `touch .claude/tdd-lock`(先建鎖再 commit——pre-commit 靠鎖走紅燈通道,
   順序反了 commit 會被自家 hook 擋死)
5. Commit:`test(red): <階段> 紅燈`,把 hash 記入 progress.md

**綠**:
6. 實作至測試綠。紅燈期鎖著 `*.test.*`(hook 強制)——測試錯了不是繞,
   是走逃生口 2
7. 後端階段:起一次 `supabase start` 跑 `deno task test` 確認該階段真綠
   (一階段一次,不是每次編輯;見 rules/supabase-functions.md)
8. `scripts/tdd-unlock.sh`——check 全綠才會放行刪鎖;紅著就繼續修實作
9. Commit(`feat:`/`fix:`),更新 progress.md(狀態、綠燈 hash、下一步)

**逃生口**(都是合法路徑,硬凹才是違規):
1. 測試一寫就綠(功能已存在)→ 記入 progress.md Blockers,跳過該階段
2. 實作中發現 plan 該階段有誤 → 停手,記 Blockers,求人工裁決;
   **禁止私改 plan 或改測試遷就實作**
3. 綠不了 → 記下嘗試過什麼,求人工裁決

## 收尾(全階段綠之後)

1. `npm run check:full`(含 build 與 Deno 型別檢查)
2. UI 有改動:啟動 dev server 用 Playwright 截圖自查關鍵畫面(視覺迴路)
3. **跑 `/review-implementation $ARGUMENTS`**——四視角審實作 diff,重點是
   「有沒有偏離當初審核通過的 plan」。CI 證明不了這件事,只有獨立視角能。
   P0 修掉(或人工豁免並記錄)才可 push
4. Push:`git push -u origin feature/$ARGUMENTS`,開 PR → **develop**
   (照 PR 範本填:規劃書連結、審查報告、紅燈 hashes、CI run)
5. `gh pr checks --watch` 盯到綠;紅了同 session 修——CI 訊號沒有回來
   之前,任務不算完
