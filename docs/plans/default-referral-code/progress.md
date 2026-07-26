# 預設推薦人（未填推薦碼時自動綁定）實作進度

分支:`claude/default-referral-code-etigue`
規劃書:`./plan.md`|審查:`./review.md`(P0 須全數處置才可開工)

> 註:本 feature 在 web session 既有的 `claude/*` 分支上開發(平台在 session
> 啟動前開好,早於任何 hook),非 `feature/*`。規劃檔守衛只認 `feature/*`,
> 故不會觸發;流程仍照三段式走。

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | `default_referrer_code` + `resolve_default_referrer`（D/E/F/H/I+正規化） | ✅ 綠 | `fe24bd9`→rebase 後 `1bcfd1e` | `3425ecc` |
| 2 | 接進 `apply_referral_side_effects` + `referred_by_is_default`（A/B/C/G/L） | ✅ 綠 | `3828710` | `52a10df` |
| 3 | fresh 換線清旗標 + claim 回歸 + 守衛釘住（J/K） | ✅ 綠 | `3593ffd` | `307be90` |
| 4 | 契約 `isAutoReferral`（buildProfileResponse + ProfileResponseSchema） | ✅ 綠 | `84cba8e` | `b27fa67` |
| 5 | 前端抑制（fetchReferrerInfo 早退 + placeholder）＋規格書 §7.4＋checklist 步驟 6 | ✅ 綠 | `8052029`（本機實測 2 failed） | `b60016a`（本機 4/4 綠） |

> 註:後端（Deno/SQL）測試本機無 supabase CLI 跑不了,紅綠證據由 CI 的
> api-tests 軌承載;前端（vitest）紅綠皆本機實測。

## 目前位置與下一步

**五個階段全部完成。** 規格書 §7.4 已記載機制、§8.1 已 cross-reference,
營運手冊已搬進 `docs/supabase-setup-checklist.md` 步驟 6（V3-5）。
`check-spec-drift` / `check-document-naming` / `check-test-names` 皆綠。

下一步:清理規劃檔（鷹架,PR 前刪除）→ push → 開 CI 驗證 → PR ready。

## Blockers(逃生口紀錄)

- **紅燈一寫即綠（合法分支 1,記錄供人審知悉）**:階段 3 的兩支——
  `reset-registration` 守衛釘住（守衛既存但從無測試保護,本 feature 的
  §2.6 依賴它）與 claim 路徑情境 K（階段 2 的回寫已讓 claim 自然吃到
  結果）。兩支的價值是回歸保護,不是新行為。
- **後端紅綠證據在 CI**:本機無 supabase CLI 且 jsr.io 被網路層擋
  （403,直連與代理皆然）,Deno 側型別檢查與 DB 測試均由 CI 把關。
  pre-commit 已自動降級並註明。

## 框架摩擦

<!-- 被 hook 誤擋?規則互相矛盾?同一糾正重複兩次?
     一句話記這裡,整併時搬去 docs/plans/friction-log.md。 -->
