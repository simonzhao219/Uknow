# Email 邀請（R2）實作進度

<!-- plans-keep: 施工鷹架；退場條件＝/tdd-implement 收尾刪除整個目錄 -->

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看,不要寫只有當下
     session 才懂的簡稱。 -->

分支:`feature/referral-email-invite`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)
上游:總綱 `docs/plans/platform-growth-and-trust/plan.md` §2.3A(commit `1b9e709`)

## 開工條件(2026-10-25 核對)

| 前置 | 狀態 | 擋哪些循環 |
|---|---|---|
| check-email 修正(PR #390,`find_auth_user_by_email`) | ⬜ 未合併 | R2-1 全部(1–5) |
| R1a-3(`_shared/recruitment-copy.ts`) | ⬜ 未開工 | 4、9、11 |
| R2-0 spike 結論 | ⬜ 未貼入(外部 spike,待驗) | 不擋開工;GoTrue 主張以 plan.md 附錄 A 對照 |
| 人審 `review.md` | ⬜ 未裁決 | 全部 |

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 0 | R2-0 spike(外部,結論由監工貼入下方「R2-0 結論」) | ⬜ 未開始 | — | — |
| 1 | token 模組+`_shared` payload/TTL+spec-drift TTL 規則 | ⬜ 未開始 | | |
| 2 | purge migration(`20261025000011_purge_stale_referral_invites.sql`) | ⬜ 未開始 | | |
| 3 | 資格 helper+`rateLimitStrict`(三態)+退額度 helper | ⬜ 未開始 | | |
| 4 | `POST /referrals/invites`+契約區塊+規格書 §7.1+spec-drift 10 條 | ⬜ 未開始 | | |
| 5 | `POST /auth/invite/accept` | ⬜ 未開始 | | |
| 6 | `routeAfterVerifiedSession` 抽取(行為不變) | ⬜ 未開始 | | |
| 7 | `resolveInviteEntry`+payload 解碼 | ⬜ 未開始 | | |
| 8 | AuthPage invite 模式+`useInviteAccept`+`App.tsx` 豁免+2A 提示 | ⬜ 未開始 | | |
| 9 | InviteCard+三處入口+旗標+`maskEmail` | ⬜ 未開始 | | |
| 10 | CompleteProfile `app_metadata` 後備預填 | ⬜ 未開始 | | |
| 11 | 模板檔+模板測試+文件 | ⬜ 未開始 | | |
| R2-3 | 上線(非 TDD:業主貼模板、設 secret、開 env 與旗標;journey 在晉升 PR 跑;真機驗收) | ⬜ 未開始 | — | — |

## R2-0 結論

<!-- 由監工 session 貼入。每點對照 plan.md 附錄 A 的 G 編號;結論欄分「本機」「develop」兩欄。 -->

(尚未貼入)

## 目前位置與下一步

規劃與審查完成,停等業主裁決 `review.md` 與 plan.md §6 開放問題。裁決後由人親自打 `/tdd-implement referral-email-invite`;
R2-1 等 #390 合併才開工。

## Blockers(逃生口紀錄)

<!-- 三種合法分支的紀錄處:
     1. 紅燈測試一寫就綠(功能已存在)→ 記錄後跳過該階段,人審知悉
     2. 實作中發現 plan 該階段有誤 → 停手記錄,求人工裁決,禁止私改 plan
     3. 綠不了 → 記錄嘗試過什麼,求人工裁決,禁止改測試遷就實作 -->

## 框架摩擦

<!-- 被 hook 誤擋?規則互相矛盾?同一糾正重複兩次?
     一句話記這裡,整併時搬去 docs/plans/friction-log.md。 -->
