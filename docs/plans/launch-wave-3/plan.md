# 第 3 波：T1 登入狀態信任＋條款十之一（目標 2026-11-10 晉升）

<!-- plans-keep: 跨 session 鷹架（第 3 波主／執行／審查 session 的共同事實來源）；退場條件＝第 3 波審查 session 結案後，值得長留的升級進規格書／friction-log，其餘隨 commit 刪除 -->

寫給**全新的第 3 波主 session**看：它開局只有 repo 與這份檔，沒有對話記憶。本檔只是第 2 波主 session 的交接；
開局後由你把它擴寫成本波完整的 plan（裁決表、工作分解、名冊、進度表，格式比照 `docs/plans/launch-wave-2/plan.md`）。
三種 session 分工與凍結規則見 `docs/README.md`〈慣例〉。

## 0. 上游

- `docs/plans/launch-wave-2/plan.md`：§0 裁決 W2-1～26、§3 執行環境須知（**全部仍適用**，派工 prompt 照抄）、§5 第 3 波候選、§6 業主待辦、§8 進度。
- `docs/plans/launch-wave-2/review.md`：第 2 波審查（P0 0／P1 0／P2 15），§5 待辦、§6「升級進長期文件」表＝launch-wave-2/ 退場依據。
- 現況（2026-10-31 交接時）：main＝5b6a790（第 2 波晉升 #463，正式站 build-sha 相符）；develop 領先 main 的只有 docs 與 #464（deploy-smoke 收緊）。

## 1. 本波工項（交接時的建議，開局後與業主確認）

| # | 工項 | 狀態／分支 | 建議模型 | 備註 |
|---|---|---|---|---|
| T1 | 登入狀態信任（頁首不閃、註冊中只留登出） | `feature/auth-state-trust`，PR #466（draft，規劃定稿 v4.1，業主三輪裁決 W2-23） | Opus | 業主在**新 session**（該分支）親打 `/tdd-implement auth-state-trust`。PR-A（三態＋提示＋W2-22）11/10 必上；PR-B（degraded、/profile 8 秒逾時）可晚一波。A1 開工前重跑 A0 SQL（在 `progress.md`；主 session 代跑），後三欄 >0 就停下回報。順手併入審查 P2-5（`SIGNED_OUT` 呼叫 `resetHomeListingsCache`）。Q6–Q8 小題在 A3 實機截圖時問業主 |
| C | 條款十之一（照片保留期與清理） | `feature/listing-photo-retention`，PR #453（draft，實作完成 head fc8aab4b 之後） | Opus 審 | **會實刪資料**：主 session 合併前親審全 diff，rebase 後 CI 綠才合。上線步驟見第 2 波 plan §6 第 5 項（dry-run、`RECONCILE_SECRET`、11/13 前業主核對候選清單、`PHOTO_PURGE_LIVE`） |
| A | 後台會員列表加推薦碼欄位 | 未開（`fix/admin-member-referral-cols`） | Sonnet | W2-2 納入、W2-26 順延 |
| L | 點 logo／導覽列回首頁不還原篩選（只有返回才還原） | 未開 | Sonnet | W2-24；`useNavigationType() === 'POP'`，見審查 P2-6 |
| K | 告警管線四縫＋reconcile curl 重試 | 未開 | Sonnet | 審查 P2-1～4；可與 L 以外的小工項並行 |
| — | issue #467 npm audit | Dependabot 週一批次後複查 | — | vitest／vite 大版本另開 PR |

其餘候選見第 2 波 plan §5，由本波主 session 與業主排序。

## 2. 新增的環境須知（第 2 波後段）

- **推送守衛會自動 rebase 到最新 develop**（`.claude/hooks/pre-push-rebase.sh`，主 repo 的目前分支），之後必須 `--force-with-lease`；
  auto mode 分類器會擋**改寫既有遠端分支**的 force push（T1 session 與主 session 都被擋過）。不想請業主放行時的做法：
  以 plumbing 在遠端分支頂端疊一個**快轉** commit（`git read-tree` → `update-index --cacheinfo` → `commit-tree -p origin/<branch>` → 一般 push），不改寫歷史。
  合併前真要 rebase 時，由主 session 在 worktree 做並 `--force-with-lease`，被擋就請業主決定是否加權限規則。
- 子 session 要查正式站資料：把唯讀 SQL `send_message` 給主 session 代跑（第 2 波 §3 已寫，R2、T1 都照做順利）。

## 3. 業主待辦（交接時）

1. 手動刪 GitHub 暫存分支 `claude/auth-state-trust-v41`、`claude/auth-state-trust-v41b`（T1 規劃過程的暫存，內容已疊進 PR #466）。
2. 在新 session 親打 `/tdd-implement auth-state-trust`（時間由業主定；主 session 開局後提醒）。
3. 11/10 晉升後核准 `production` 部署；之後條款十之一上線步驟（第 2 波 plan §6 第 5 項）。

## 4. 第 2 波目錄退場

由**第 3 波審查 session** 依 `docs/plans/launch-wave-2/review.md` §6 升級後 `git rm -r docs/plans/launch-wave-2/`（第 1 波目錄就是這樣由第 2 波審查 session 退場的，#468）。
