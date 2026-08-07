# e2e 情境去重 實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支:`claude/e2e-scenario-dedup-owwsip`(web session 由平台預開,非 `feature/*`)
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 刪 admin_dashboard 4 條 + rewards_withdrawal 4 條(10.4s,→165 passed) | ⬜ 未開始 | — | |
| 2 | 刪 payment_result 2 + payment_checkout 2 + home_listings 1(7.5s,→160 passed) | ⬜ 未開始 | — | |
| 3 | 刪 renewal_backfill 2 條(1.5s,→158 passed) | ⬜ 未開始 | — | |
| 4 | 回填 ci.yml 檔頭量測(情境數 182→158、計費分 ~7→實測 5–7)與 friction-log | ⬜ 未開始 | — | |
| 5 | 刪除本規劃檔,原則升級進 e2e/README.md 與 friction-log | ⬜ 未開始 | — | |

> 階段表已依 `review.md` 的審查結果重排(初版 3 個刪除階段共 29 條 →
> 現為 15 條)。route_guards 與 line_browser 已整檔移出刪除清單。

> 本任務是純刪除,沒有一般意義的紅燈相位。各階段的「紅燈等價物」是
> **刪除後下層證據測試仍全綠**——驗證標準見 plan.md §5,不是 commit hash。

## 目前位置與下一步

規劃 + 四視角審查都已完成,`review.md` 已寫入。**現在停在人審。**

審查揪出 **2 個 P0 + 6 個 P1 + 7 個 P2**,全部是「證據等級標錯」:
初版 29 條候刪裡有 **14 條經不起查證**,已全數移出刪除清單
(3 條改「留」、11 條改「存疑」)。修訂後刪 15 條 / 19.37s / 10.3%。

**人審要裁決的事(依重要性)**:

1. **Q13 / P0-1** —— `resolveMembershipRedirect`(RequireMembershipRoute)
   六個分支全 repo 零測試覆蓋,route_guards.feature 是唯一防線,已全留。
   這個缺口守的是「不能把已付款的人送回結帳頁重複付款」,值得獨立處理。
2. **Q11 / P0-2** —— 系統與架構視角對 payment_checkout 3 條有歧見
   (B 級成立 vs 缺 wiring 證明),需人裁定採哪一方。
3. **Q1** —— 實得已從 ≈450–600 分/月 下修到 **≈300 分/月**,離目標
   700–1,000 分更遠。要不要接受、或另開任務動固定開銷/重審 xdist。
4. **Q9 / Q10 / Q12** —— C 級證據地位、手機版覆蓋權衡、line_browser。
5. 是否要求對修訂後的規劃**重跑 `/review-plan`**(修訂只移出候刪、
   不新增,方向嚴格保守,故未自行再燒一輪)。

尚未動任何 `e2e/` 檔案。

## Blockers(逃生口紀錄)

- **P0-1、P0-2 未裁決前不進入階段 1**。依 `/tdd-implement` 規則,
  存在未處置 P0 會被拒絕開工——處置方式已在 `review.md`「處置」節列成
  勾選項,人審勾完才算處置完成。
- **Q1 未裁決前不進入階段 1**:若人審選擇「(c) 重新檢視 xdist 否決」,
  整個刪除清單的優先順序會變(那是另一條更大的槓桿)。

## 盤點副產品:兩個覆蓋缺口(不在本任務修,但別忘了)

1. `resolveMembershipRedirect`(`src/components/RequireMembershipRoute.tsx:29`)
   六分支決策表零測試覆蓋;三個 route guard 元件也沒有任何元件測試 render 過。
2. auth 錯誤訊息映射硬編在 `AuthPage.tsx` / `ResetPasswordPage.tsx`,無單元測試
   (已註冊 / 密碼外洩 / rate limit / 舊密碼相同,共 8 條 e2e 是唯一防線)。

## 框架摩擦

- ci.yml 檔頭的 e2e 數字(「~7 計費分」「182 個情境」)與 2026-08-07 實測
  不符(5–7 計費分、173 個情境)。檔頭是本任務的授權來源,授權來源自己
  帶著過期數字——階段 4 回填,並考慮是否值得為「情境數」加一條機械把關
  (`scripts/check-workflows.py` 已有先例)。
- 本機 python 是 3.11,CI 與 CLAUDE.md 前置寫 3.12;e2e 套件在 3.11 下
  173 passed 全綠,沒有版本相依問題,但兩邊不一致值得記一筆。
