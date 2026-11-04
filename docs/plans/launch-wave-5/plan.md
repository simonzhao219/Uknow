# 第 5 波：交接（第 4 波主 session 寫，2026-11-04）

<!-- plans-keep: 跨 session 鷹架（第 5 波主／執行／審查 session 的共同事實來源）；退場條件＝第 5 波審查 session 結案後，值得長留的升級進規格書／friction-log，其餘隨 commit 刪除 -->

寫給**全新的第 5 波主 session**：開局只有 repo 和這份檔，沒有對話記憶。本檔只是第 4 波主 session 的交接。
開局後請擴寫成本波完整的 plan（裁決表、工作分解、名冊、進度表），格式比照 `docs/plans/launch-wave-4/plan.md`。
三種 session 的分工、凍結規則、雲端執行環境須知在 `docs/README.md`〈慣例〉；派工 prompt 的共用開頭照抄
`docs/plans/launch-wave-4/dispatch-prompts.md`，再補本檔 §2。

## 0. 上游與現況

**要讀的上游檔**

- `docs/plans/launch-wave-4/plan.md`：§0 裁決 W4-1～37（仍有效）、§5 第 5 波候選、§8 進度。
- `docs/plans/launch-wave-4/review.md`：第 4 波審查（R4，P0 0／P1 0／P2 17）。§5 是待辦；§6 升級表是 `launch-wave-4/` 退場的依據。
- `docs/plans/launch-wave-4/audit-{pay,ref,auth,ops}.md`：W4-30 全面稽核，四份報告，皆以 main `f88bae5` 為準。
  各份的 P0／P1 列「潛伏／現役」與觸發期限；第 4 波已修的見下方「現況」。

**現況**（2026-11-04 交接時）

- main＝`26c5ae8`（hotfix 晉升 #502）。本波期間正式站上了三次：
  - 第 4 波晉升 #490（`f88bae5`）
  - H1 hotfix #496（`4f974fc`）：邀請推薦碼暫存加 7 天期限＋登出／已註冊者登入時清除
  - H2 hotfix #502：drop `referral_tree`；`effective_registration_step` 只留 service_role；新增 security definer 授權白名單測試
- H2 的 migration 已由 Supabase 整合套用。主 session 在正式站唯讀查證：`referral_tree` 不存在；`effective_registration_step` 對 anon／authenticated 都是 false。
- **交接時 #502 的 Edge Function 部署 run 41706804315 仍等業主核准**。H2 只動 DB，函式碼與上一版相同；核准後要驗 `/health` sha＝`26c5ae8`，再 dispatch deploy-smoke（ref=main）。開局先看這筆是否已完成。
- `deploy-supabase.yml` 只認本 repo 的 push 觸發（#495，稽核 ops P0-1）。合進 develop 當下就生效，#502 的 PR 觸發部署已確認被 skip。
- 正式站資料（11/03～04 唯讀）：
  - 訂閱 15 筆全部 active，最早到期 2027-10-27；第一筆真付款 11/03 10:22Z
  - withdrawals 0 筆；reward_transactions 21 列，無重複
  - 無人有兩筆以上 completed 訂單或兩筆以上訂閱
  - 稽核列的換線錯綁／成環／自領獎金，佐證查詢皆 0 列
- 開著的 PR：無。open issue：#467、#395、#384、#383。

## 1. 本波工項（交接時的建議，開局後要和業主確認）

| # | 工項 | 來源 | 建議模型／流程 | 備註 |
|---|---|---|---|---|
| S1 | **對帳與照片清理改 Supabase pg_cron 觸發**，GitHub workflow 留作手動觸發與告警 | W4-25（**必上**）；R4 §5-6 | Opus，三段式 | GitHub 排程大量跳過：reconcile 24h 只跑 3 次、purge 晚 6h20m。對帳延遲直接影響付了錢的人 |
| S2 | **同人兩分頁重複付款**（pay P1-2）＋**register 查推薦碼錯誤被吞**（auth P0-1／P1-2：停權推薦人、查無碼照存） | W4-33（**第一優先**） | Opus，三段式（金流＋推薦） | 兩條都是現役、低機率；正式站目前 0 例。register 改走 `validate_referral_code`，error→503、查無／停權→400 同形 |
| S3 | **暫時性錯誤被當定論**：R4 P2-1（cancel-signup 401）、P2-4（CompleteProfile 冷載失去 8 秒逾時）、P2-5（閘道 404 判成帳號異常），併 T1-B 未修的 getSession retryable 仍導 /login | R4 §5-2（**必上**） | Sonnet，`/fix-bug` | R4 建議併成一個工項；P2-5 一旦 Edge 部署壞掉，全體會看到「帳號異常」 |
| S4 | **PostHog EU 監控＋錄影** | W4-35～37 | Sonnet，三段式（新功能） | 照 W4-37 遮罩清單施工；敏感欄位 block 要有測試釘住。不改條款（業主接受） |
| S5 | **提領 CSV 銀行代號／帳號前導 0 與 15 位截斷** | ops P1-1＝ref P1-9 | Sonnet，`/fix-bug` | 第一筆提領前必修（目前 0 筆）。照匯款清單匯會打錯帳號 |
| S6 | **續約路徑潛伏組**：fresh 棄單後改付 extend 仍換線／發獎（ref P0-1＝pay P0-1）、推薦成環（ref P0-2）、續費者走首購路徑（pay P1-1＝auth P1-1，prepare 應拒已有訂閱者 `renewalMode=null`）、續費者卡單被送回結帳頁（pay P1-4） | 稽核；**觸發期限 2027-10-27** | Opus，三段式 | 本波或第 6 波都可，但不能讓它跟著候選清單漂流。建議本波至少完成規劃 |
| S7 | 開局問業主 W4-34 的 4 條規格缺口 | W4-34 | 主 session | ①停權者能否續費（pay P2-9＝auth P2-1）②網絡搜尋比對真名可還原遮罩（ref P1-4，§7.3 與 §7.2 衝突）③新約二次確認是否無條件跳出（pay P2-10）④新約清空對推薦王 credit 與當月下線紀錄的語意（ref P2-2／P2-3）。附程式證據與建議 |

其他候選：

- 稽核其餘 P1：
  - ref P1-2：`repair_orphaned_claim_rewards` 無鎖，`reward_transactions` 也沒有唯一索引，並行會重複發獎。正式站目前無重複
  - ref P1-3：推薦網絡超過 1000 列時 PostgREST 靜默截斷
  - ref P1-5、P1-6：錯誤被吞成 200
  - ref P1-7：`withdrawalBankData` 鍵不綁 uid
  - pay P1-3：未知 TradeStatus 第 4 天靜默標 expired
  - pay P1-5：pendingUser 不綁 uid
  - auth P1-3：後端不驗 18 歲／手機／身分證
  - auth P1-4：cancel-signup 無鎖
  - auth P1-5：重設密碼後不登出
  - ops P1-2：upload-photo 無限流／不要求會籍
  - ops P1-3：對帳 queryErrors 全滅時排程仍綠
- 其餘 P2 以各報告為準。
- `launch-wave-4/plan.md` §5 全部候選，其中要記得的：
  - Playwright 升級、journey-suite 改回 `ubuntu-latest`（W4-23 退場條件）
  - vitest／vite 大版本（#467 拆出）
  - `otpSession` 存 email、共用裝置可能預填前一人 email（H1 未處理）
- R4 `review.md` §6 指定給第 5 波的升級：「裁決編號只由主 session 發」、「hash 以 PR 內文為準」寫進〈慣例〉或 plan 範本（P2-16、P2-17）；「F1 草稿在 session 失效時也清」寫進 `docs/multi-step-flow-recovery.md`（P2-12）。

## 2. 第 4 波新增的環境須知（派工 prompt 照抄）

- **合併其中一支 PR 讓 base 前進後，其他 PR 的 `ci-ok` 會變成 expected、無法合併**。同時交件的多支 docs PR，改由主 session PR 逐字帶入一次跑 CI，比逐支 rebase 重跑快。第 4 波稽核 #498～#500 就是這樣處理的。
- **雲端容器連不到 `*.supabase.co` 與 `*.pages.dev`**（proxy 403）。正式站 `/health` 只能看 deploy-supabase 的煙霧測試步驟，或 dispatch deploy-smoke。
- **晉升 PR 開著時不合任何 PR 進 develop**。主 session 自己的紀錄 PR 也一樣，等晉升合進 main 再合。
- **紀錄分支合併後 head 會被自動刪除**，再推前要 `git fetch --prune`，否則 `--force-with-lease` 會報 stale info。
- 首輪 CI 偶發：`PhotoPicker.test.tsx`〈取消與 Esc 都只取消當張〉在 #495 紅過一次，重跑即綠。若再出現，列 E 類補診斷，不要跳過。

## 3. 業主待辦（交接時）

1. **核准 #502 的 production 部署**（run 41706804315）。若開局時仍在 waiting，主 session 先提醒。
2. 實機確認：
   - H1：曾開過邀請連結的瀏覽器，新註冊不會被帶入推薦碼；帶 `?ref=` 的訪客仍會帶入
   - `uknow.pages.dev` 根網址、深層路徑、query＋hash 都導向 `uknow.com.tw`；`develop.uknow.pages.dev` 不導向
   - 正式站實際登入一次
3. PayUni 商店後台確認第一筆付款（11/03）的發票已開立。
4. GitHub 設定（補強，非必須）：
   - Settings → Actions → General → Fork pull request workflows 設「Require approval for all external contributors」
   - Settings → Environments → develop 加 required reviewer

## 4. 第 4 波目錄退場

由**第 5 波審查 session** 依 `launch-wave-4/review.md` §6 升級後，`git rm -r docs/plans/launch-wave-4/`。
四份 `audit-*.md` 一併退場：未修項目應已收進本波 plan 或規格書 §14；刪除前確認沒有只存在稽核報告裡的待辦。
