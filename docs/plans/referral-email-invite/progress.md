# Email 邀請（R2）實作進度

<!-- plans-keep: 施工鷹架；退場條件＝/tdd-implement 收尾刪除整個目錄 -->

<!-- 外部記憶:每個紅綠循環結束即更新。全新 session 的 rehydrate 起點
     ——寫給「完全沒有對話記憶的下一個 session」看,不要寫只有當下
     session 才懂的簡稱。 -->

分支:`feature/referral-email-invite`
規劃書:`./plan.md`(v2,2026-10-26 依業主裁決 A～T 修訂)|審查:`./review.md`(P0 0;處置:修訂後通過)
上游:總綱 `docs/plans/platform-growth-and-trust/plan.md` §2.3A(commit `e8c6080`)

## 開工條件(2026-10-26 核對;裁決 F)

| 前置 | 狀態 | 擋哪些循環 |
|---|---|---|
| check-email 修正(PR #390,`find_auth_user_by_email`) | ⬜ 未合併 | 4a、4b、5 |
| R1a-3(PR #394,`_shared/recruitment-copy.ts`) | ⬜ 未合併 | 4a、4b、9、11 |
| R2-0 spike 結論 | ⬜ 未貼入 | 不擋(裁決 E);標「待 R2-0」的循環先以原始碼核對結果實作,結論與規劃矛盾時由監工更新 plan.md 再續 |
| 人審 `review.md` | ✅ 修訂後通過(2026-10-26) | — |

## 階段狀態

| # | 階段 | 狀態 | 待 R2-0 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|---|
| 0 | R2-0 spike(外部,結論貼入下方「R2-0 結論」) | ⬜ 未開始 | — | — | — |
| 1 | token 模組+`_shared/referral-invite-payload.ts`+spec-drift TTL 規則 | ⬜ 未開始 | — | | |
| 2 | 兩支 migration(`20261025000011` purge+audit 清理、`20261025000012` refund)+spec-drift purge 規則 | ⬜ 未開始 | 第 6 點 | | |
| 3 | `api/rate-limit-strict.ts`(三態、refund)+資格 helper | ⬜ 未開始 | — | | |
| 4a | invites 前半(disabled、資格、body、姓名、per-user 兩窗、401)+invites 契約段+spec-drift 4 條 | ⬜ 未開始(擋:#390、B) | — | | |
| 4b | invites 後半(lookup、target／global、寄送、GoTrue 對映、對帳、補償、退額度矩陣)+spec-drift 6 條 | ⬜ 未開始(擋:#390、B) | 第 1、2、7、9 點 | | |
| 5 | `POST /auth/invite/accept`+accept 契約段 | ⬜ 未開始(擋:#390) | 第 3、4、5 點 | | |
| 6 | `routeAfterVerifiedSession` 抽取(行為不變) | ⬜ 未開始 | — | | |
| 7 | `registrationFlow.ts` 三個純函式 | ⬜ 未開始 | — | | |
| 8 | AuthPage invite 模式+`useInviteAccept`+`App.tsx`+2A 提示+`sessionStorage` | ⬜ 未開始 | — | | |
| 9 | InviteCard+三處入口+旗標+`ui/dialog` 關閉鈕+`backendConstants.ts` | ⬜ 未開始(擋:B) | — | | |
| 10 | CompleteProfile `app_metadata` 後備預填 | ⬜ 未開始 | — | | |
| 11 | 模板檔+模板測試+文件 | ⬜ 未開始(擋:B) | 第 1、11 點 | | |
| R2-3a | journey 情境+`journey.yml` secret 注入(非 TDD,分支內驗形) | ⬜ 未開始 | — | — | — |
| R2-3b | 合併後業主操作(plan.md §5 R2-3b 十二步) | ⬜ 未開始 | 第 5、10 點 | — | — |

可先做(不受前置擋):1、2、3、6、7、10;7 依賴 1,8 依賴 5、6、7,9 依賴 4a。

## R2-0 結論

<!-- 由監工 session 貼入。每點對照 plan.md 附錄 A 的 G 編號;結論欄分「本機」「develop」兩欄。 -->

(尚未貼入)

## 目前位置與下一步

規劃 v2 已依業主裁決修訂並推上 PR #393,等業主合併後親自打 `/tdd-implement referral-email-invite`。
開工從不受前置擋的循環 1 起(依賴順序 1 → 2 → 3,6、10 可插空;7 等 1)。

## Blockers(逃生口紀錄)

<!-- 三種合法分支的紀錄處:
     1. 紅燈測試一寫就綠(功能已存在)→ 記錄後跳過該階段,人審知悉
     2. 實作中發現 plan 該階段有誤 → 停手記錄,求人工裁決,禁止私改 plan
     3. 綠不了 → 記錄嘗試過什麼,求人工裁決,禁止改測試遷就實作 -->

## 框架摩擦

<!-- 被 hook 誤擋?規則互相矛盾?同一糾正重複兩次?
     一句話記這裡,整併時搬去 docs/plans/friction-log.md。 -->
