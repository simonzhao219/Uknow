# 會員身分核身 QR（member-verify-qr）規劃書 — Phase 1

<!-- 本規劃已經過兩輪四視角審查（review-plan），前輪 4 個 P0 全數處置，
     v2.1 收斂所有機械修正與業主決策。決策來源：與業主的問答（見下）。 -->

## 0. 一句話

這個 feature 讓 **admin 在線下用相機掃會員出示的動態短效碼**，當場確認「這是哪位會員 + 會籍是否有效」，因為業主要能在實體場景核對會員身分，且此需求無法安全地共用既有推薦 QR（推薦碼是公開可分享的，綁身分＝可冒充）。

## 1. 使用者需求

- 對照規格書：`docs/uknow-software-specification.md` 目前**無**會員核身章節（§13 管理後台、§5 帳號狀態最相關）→ 階段 5 補寫（見下）。
- 使用者故事：
  - 身為**會員**，我在會員中心「我的 QR」出示一組**動態短效**核身碼給 admin 掃。
  - 身為 **admin**，我掃會員的碼後，當場看到**會員姓名 + 會籍狀態（四態）**，且每次核身留下稽核紀錄。
- 業主敲定決策：掃的人＝**只有 admin**（不做店員角色）；**只讀核身 + 最小稽核寫入** `(admin_id, member_id, verified_at)`；admin 畫面顯示**完整姓名**；掃碼用**第三方跨平台掃碼庫 @zxing/browser**（裝置不確定/含 iOS，原生 BarcodeDetector 在 iOS 不支援故不採用）；稽核寫入失敗 → **fail-closed**（擋下核身）；會員**不另行告知**核身被記錄（業主接受，暫不更新條款）。
- 整合＝B（UI 層）：會員中心「我的 QR」**一個入口、兩分頁**——預設「會員核身碼」（新）＋「邀請好友」（現有推薦 QR，重用內容）。推薦管理頁維持現有 `InviteFriendButton` 不變。
- 安全紅線：身分**不綁**公開推薦碼；QR 內容是**簽章短效 token**（payload 僅隨機 UUID member_id + exp，無姓名/電話/身分證）；解析需 admin 授權；只回顯示名 + 會籍狀態。
- **不做什麼**（Phase 1 排除）：店員角色/帳號；token 單次失效與防截圖轉發（短效 90 秒緩解，延後）；離線核身；**稽核查閱前端介面**（本期只寫入，查閱走 Supabase Studio 直查）；會員名冊匯出；優惠核銷/扣點/入場計數；核身誤掃勘誤/撤銷機制（稽核不可竄改，以時間相近多筆佐證）。

## 2. 系統設計

- 資料流：會員登入 → `GET /members/verify-token`（`requireAuth`）取簽章短效 token → 前端畫成 QR。admin 掃到 token → `POST /admin/members/verify`（`requireAuth` + `isAdminUser`）驗簽 + 驗到期 → 讀 `profiles.name` + 四態會籍 → 寫一筆稽核 → 回 `{ displayName, status, activeUntil }`。
- token：新檔 `supabase/functions/api/member-token.ts`，`signMemberToken`/`verifyMemberToken`（HMAC-SHA256、base64url、`crypto.subtle.verify` 常數時間、缺 `MEMBER_TOKEN_SECRET` fail-closed 拋錯）。短效 90 秒；經 **header** 傳遞（POST body/自訂 header，不進 query log）。
- 端點（**POST**，因為有稽核寫入；GET 會被自動重試而重複寫入）：
  - `GET /members/verify-token`：`requireAuth` → `{ token, expiresAt }`。
  - `POST /admin/members/verify`：**手貼** `requireAuth` + `isAdminUser`（本專案無 `/admin/*` middleware，逐路由手貼）**並加入 `admin-gate.test.ts` 的 `ADMIN_ROUTES` 清單**（該清單是權限回歸的單一權威）。驗簽失敗/到期/查無會員各有**明確且互相區分**的錯誤（token 過期 ≠ 會籍 expired）；缺 secret → 500「系統設定錯誤」。
- 會籍狀態：重用既有 `deriveNodeStatus`（index.ts，讀 `user_account_status.status/end_date` + `profiles.suspended_at`）→ 四態 `active/expiring/expired/suspended`，與 api-contract `ReferralNodeFields` 一致。
- migration：新增 `member_verify_logs(id, admin_id, member_id, verified_at, result)`。
  - FK `admin_id`/`member_id` → `profiles(id)` **`on delete set null`**（刪帳號不得清空稽核，比照 `announcements.created_by`）。
  - **`enable row level security` + `revoke all ... from anon, authenticated`**（比照 `system_alerts`；全走 service role + app 層 `isAdminUser`）。
  - 預留索引 `(member_id, verified_at)`。
- 稽核寫入失敗 → **fail-closed**：整個 `/admin/members/verify` 回 5xx 要求重試，保證每次成功核身都有紀錄。
- 契約：兩端點 request/response schema 同步進 `_shared/api-contract.ts` + 補 `api-contract.test.ts`。

## 3. 架構影響

- 後端：端點加進 `index.ts`（會員自取端點鄰近 `/subscriptions/status`；admin 端點在 admin 區並登記 `ADMIN_ROUTES`）。`member-token.ts` 獨立於 PayUni 專屬的 `crypto.ts`。
- 前端：
  - 會員中心 `MemberDashboard`：新「我的 QR」`Dialog + ui/tabs`，**預設分頁「核身碼」**。「邀請好友」分頁重用裸的 `InviteFriendPanelContent`（`InviteFriendDialog` 外殼不動，仍供推薦管理頁）。核身碼分頁對**所有登入會員**可用；邀請好友分頁未加入推薦計畫時顯示**可點擊**的加入引導（重用 `JoinReferralProgramDialog`），不空白。
  - admin 掃碼頁：**獨立 lazy 路由 `/admin/verify`**（相機全螢幕不適合塞進 `AdminDashboard` 固定 5 欄 Tabs），並在 `AdminDashboard`（會員管理分頁）加一顆**可達入口**連過去（不做孤兒路由）。判準寫進 §13：「需全螢幕/裝置權限的即時互動走獨立路由，資料管理類走 Tabs」。
  - `@zxing/browser` 為新前端依賴，**lazy 載入**於掃碼元件（避免拖慢 admin 其他頁）。
- 效能/安全：token header 傳遞防留痕；四態會籍避免停權者誤顯示有效；稽核 fail-closed。

## 4. UI/UX

- 會員中心「我的 QR」：Tabs 預設「核身碼」；兩分頁用**不同圖示/顏色**差異化（不只文字）。核身碼分頁：呼叫取 token → QRCodeCanvas（純 token，零個資文字）＋ 90 秒倒數；**sliding-window 到期前自動靜默換發**下一組（畫面在前景＝正在出示，倒數不歸零、店家不會掃到過期碼）＋「重新產生」備援。會員自己在此分頁**同步看到自身會籍狀態**（比照 `SubscriptionStatusCard` 中性文案），避免被 admin 當面掃出才得知 expired/suspended。
- admin 掃碼頁：相機區 + 掃到後結果大卡。狀態**顏色＋文字＋圖示**三者並存（比照 `SubscriptionStatusCard.STATUS_MAP`），四態 active/expiring/expired/suspended，外加**第五類錯誤態「碼已過期/無效」**（與會籍 expired 明確區分）。結果容器 `aria-live="polite"`。掃完可「繼續掃描」下一位（不必退回上一頁）。`@zxing` 掃碼；`'BarcodeDetector' in window` 之類能力偵測失敗或無相機權限（含 `detectInAppBrowser` 的 in-app 情境）時退**手動輸入**。
- 手機優先（16px、Dialog 近滿版）。

## 5. 階段切分（每階段 = 一個 TDD 紅綠循環）

| # | 階段 | 測試落點 | 驗證標準 |
|---|---|---|---|
| 1 | `member-token.ts` 簽/驗純函式 | `api/member-token.unit.test.ts`（Deno，不碰 DB） | 簽發可驗；竄改 payload→bad_signature；逾時→expired；格式錯→malformed；缺 secret→拋錯（fail-closed）；驗章常數時間（用 crypto.subtle.verify） |
| 2 | migration 稽核表 + 兩端點 + api-contract | `api/member-verify.test.ts`（Deno，需 DB，CI api-tests 軌）+ `api-contract.test.ts` | 非 admin→403；過期 token→明確錯（≠會籍 expired）；suspended 會員→status=suspended；成功核身寫入一筆稽核；稽核寫入失敗→5xx（fail-closed）；回應形狀比對契約；`admin-gate.test` ADMIN_ROUTES 含新端點 |
| 3 | 會員端「我的 QR」雙分頁 + `useMemberVerifyToken` | vitest + jsdom（元件行為）+ e2e | 預設核身碼分頁；核身碼分頁顯示 QR + 倒數 + 自身會籍狀態；邀請好友分頁未加入顯示可點擊加入引導；到期自動換發 |
| 4 | admin 獨立掃碼核身頁 `/admin/verify` | e2e（手動輸入路徑可測；相機 getUserMedia 無法 jsdom 測，掃碼元件 lazy 包一層）+ vitest（結果卡狀態映射純函式） | 手動輸入 token→顯示會員+四態徽章（色+字+圖）；碼過期→第五類錯誤態；AdminDashboard 有可達入口；§3 路由表同步（本 commit 內，否則 check-spec-drift 紅） |
| 5 | 寫回規格書 | check-spec-drift（§3 路由表機械比對）+ 人讀 | §13 新增「會員核身」小節（註明獨立路由、非 Tab）+ 判準一句話；含 user story 式業務理由；§3 路由表已於階段 4 同步 |

<!-- 階段 2 的 DB 整合測試需 supabase start，本機沙箱無 Docker/Supabase CLL→交 CI api-tests 軌；
     階段 1 純函式與階段 3/4 前端可本機驗。 -->

## 6. 開放問題（可暫定值，不阻擋開工）

- [ ] 短效期 90 秒是否足夠現場出示→掃描（先寫定 90，依實測調整；集中為常數）。
- [ ] `member_verify_logs.result` 欄記錄什麼（成功/過期/查無）與保存期限（暫定：隨帳號存續、不主動清除）。
- [ ] 目標作業裝置最終分布（影響 @zxing vs 未來原生的取捨；本期 @zxing 跨平台已涵蓋）。

## 7. 風險與回滾

- 寫入僅限稽核表（append-only），不動既有資料/金流 → 回滾＝移除端點/前端入口 + drop 稽核表 migration + 移除 @zxing 依賴。
- 個資風險集中在 `POST /admin/members/verify`：admin 授權 + 回最小欄位 + token 短效 header 傳遞防重放/留痕 + 稽核 fail-closed。
- 缺 `MEMBER_TOKEN_SECRET` fail-closed；此 secret **逐分支獨立設定**（develop/main 各一把，比照 PayUni secrets），漏設症狀＝核身端點 500。
