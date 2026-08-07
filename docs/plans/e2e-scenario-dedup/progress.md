# e2e 情境去重 實作進度

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點。 -->

分支:`claude/e2e-scenario-dedup-owwsip`(web session 由平台預開,非 `feature/*`)
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | 刪 admin_dashboard 4 條 + rewards_withdrawal 4 條(10.4s,→165 passed) | ⬜ 未開始 | — | |
| 2 | 刪 payment_result 2 + payment_checkout 2 + home_listings 1(7.5s,→160 passed) | ⬜ 未開始 | — | |
| 3 | 刪 renewal_backfill 2 + listing_management 2 + forgot_password 1(5.1s,→155 passed) | ⬜ 未開始 | — | |
| 4 | 回填 ci.yml 檔頭量測(情境數 182→155、計費分 ~7→實測 5–7)與 friction-log | ⬜ 未開始 | — | |
| 5 | 刪除本規劃檔,原則升級進 e2e/README.md 與 friction-log | ⬜ 未開始 | — | |

> 階段表歷經兩次重排:初版 29 條 → 審查移出 14 條剩 15 → 人審 Q9 裁定
> C 級(收窄後)算證據,放回 3 條 = **18 條**。
> route_guards 與 line_browser 已整檔移出刪除清單。

> 本任務是純刪除,沒有一般意義的紅燈相位。各階段的「紅燈等價物」是
> **刪除後下層證據測試仍全綠**——驗證標準見 plan.md §5,不是 commit hash。

## 目前位置與下一步

規劃、四視角審查、**人審裁決**都已完成(2026-08-07,裁決「照建議走」)。
`review.md`「處置」節已勾完,**2 個 P0 皆已處置,無未處置 P0**。

**下一步:由人親自打 `/tdd-implement e2e-scenario-dedup` 開工。**
(那道鎖不能自動觸發——它就是「人審通過才實作」的保證。)

最終範圍:**刪 18 條 / 18 case / 22.98s / 12.2%**,173 → **155 passed**,
CI 約 -28~-40s ≈ 0.6 計費分/run ≈ **360 分/月**。
四旅程端到端全數保留,無任何把關被移除。

裁決重點:P0-1(route_guards 全留)、P0-2(採架構視角,payment_checkout
3 條全留)、Q9(C 級算證據但**收窄為「同元件同路徑、只有 mock 資料不同」**,
放回 3 條)、Q10(手機 4 條全留,不以手機版覆蓋換 3.23s)、
Q1(接受實得 ≈360 分/月,另開固定開銷任務;明確記錄「要達標 700–1,000
必須放寬三條硬約束之一」)、重跑 `/review-plan` **已明文豁免**。

尚未動任何 `e2e/` 檔案。

## Blockers(逃生口紀錄)

- 無。P0 已全數處置,開放問題已全數裁決,可進實作。
- 實作時注意 C 級那兩組(Q9 放回的 3 條)在階段 3:刪除後**必須確認接手方
  仍在**——`pytest -k "service_provider_detail"` 應 2 passed、
  `pytest -k "otp_verification and resend"` 應 1 passed。C 級的接手方是
  另一條 e2e 情境,不像 A/B 級有下層測試兜底,這是它唯一的脆弱點。

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
