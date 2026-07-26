# 會員身分核身 QR（member-verify-qr）實作進度

分支：`feature/member-verify-qr`（基底 develop）
規劃書：`./plan.md`｜審查：兩輪四視角 review-plan（inline，前輪 4 個 P0 全數處置，v2.1 收斂）

## 階段狀態

| # | 階段 | 狀態 | 紅燈 commit | 綠燈 commit |
|---|---|---|---|---|
| 1 | `member-token.ts` 簽/驗純函式 + unit test | ⬜ 未開始 | | |
| 2 | migration 稽核表 + 兩端點 + api-contract | ⬜ 未開始 | | |
| 3 | 會員端「我的 QR」雙分頁 + useMemberVerifyToken | ⬜ 未開始 | | |
| 4 | admin 獨立掃碼核身頁 /admin/verify（@zxing） | ⬜ 未開始 | | |
| 5 | 寫回規格書 §13 + §3 路由表 | ⬜ 未開始 | | |

## 目前位置與下一步

規劃已落檔、通過兩輪四視角審查、業主決策全定。下一步：階段 1，寫 `member-token.ts` 與其 unit test。

## 環境備註（給下一個 session）

- 本沙箱：Deno 由 `npm i -g deno` 安裝（deno.land 被代理擋）；`deno fmt` 可用、`deno task check`/unit test 因 jsr.io 403 無法本機跑 → 交 CI api-tests 軌。DB 整合測試需 supabase start（無 Docker）→ 亦交 CI。
- 後端 commit：pre-commit 對 registry 不可達會把 `deno task check` 降為警告放行，`deno fmt --check` 仍須綠。
- 新 secret `MEMBER_TOKEN_SECRET` 需在 develop（與日後 main）Supabase 分支各設一把，否則核身端點 500。

## Blockers（逃生口紀錄）

（無）

## 框架摩擦

（無）
