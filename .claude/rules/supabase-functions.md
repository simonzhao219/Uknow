---
paths:
  - "supabase/functions/**"
---

# Supabase Edge Functions(Deno)工作守則

這裡是 **Deno runtime**,與前端的 node/vite 世界完全隔離:

- 格式與 lint 由 `supabase/functions/deno.json` 定義(單一事實來源,
  勿在此抄寫具體值)。提交前:`cd supabase/functions && deno fmt && deno lint`
- 型別檢查:`deno task check`(秒級、免網路——內迴路隨時可跑)
- 測試:`deno task test` **需要 `supabase start`**(本地 Postgres,分鐘級)。
  粒度是 per-phase 不是 per-edit:每個 TDD 階段起一次 supabase、跑該階段
  測試確認紅/綠即可,不要每次編輯都跑。日常靜態驗證靠 `deno task check`,
  完整測試由 CI 的 api-tests 軌兜底
- 測試檔放 `api/*.test.ts`,跟被測程式同層
- import 用 URL/jsr 慣例(看鄰近檔案),沒有 node_modules
  (`nodeModulesDir: "none"`)
- pre-commit 在 functions 有改動時會自動跑 `deno fmt --check` +
  `deno task check`,本機沒裝 deno 會擋 commit 並附安裝指引
