---
paths:
  - "docs/**/*.md"
---

# 文件命名守則

由 `scripts/check-document-naming.py` 機械把關(framework-check 軌)。
規則編號與該檔的函式一一對應,它自己也有表格案例(`--self-test`)。

## 為什麼統一

盤點 `docs/` 發現三種風格並存:`SUPABASE_SETUP_CHECKLIST.md`
(SCREAMING_SNAKE_CASE)、`UI_UX_Guidelines.md`(Title_Case_With_Underscore)、
`e2e-journey-test-design.md`(kebab-case)——沒有任何一層在檢查,和 PR #116
盤點 workflow/測試命名前的狀態一樣:不是有人寫錯,是沒人守門。

選 **kebab-case** 當唯一風格,不是隨機挑一種:它已是既有多數(整理前 8/11 個
檔案),是 GitHub 官方文件與多數開源專案 `docs/` 的預設慣例,且全小寫在
大小寫不敏感的檔案系統(macOS/Windows 預設)上不會與其他命名撞名——
`SUPABASE_SETUP_CHECKLIST.md` 與 `supabase_setup_checklist.md` 在這類檔案系統
上是同一個檔案,SCREAMING_SNAKE_CASE 沒有這個保證。

## 規則

**D1 檔名全小寫、以連字號分隔** —— 形如 `[a-z0-9]+(-[a-z0-9]+)*\.md`。
不得有底線、大寫字母、空格。

**D2 識別字英文** —— 檔名是路徑的一部分,和 job id、端點同類,一律英文
(與 PR #116 訂的「識別字英文、敘述分層固定」原則一致;檔案*內容*的敘述
語言不受此限,規格書/準則本來就是中文)。

**D3 凍結例外**(改了會壞掉,不受 D1 管):

| 檔名 | 為什麼凍結 |
|---|---|
| `README.md` | GitHub 與多數工具依**固定檔名**自動渲染成目錄首頁,改成小寫就失去這個行為 |
| `CLAUDE.md` | Claude Code 依固定檔名載入專案指示。不在 `docs/` 內,一併記錄避免有人「順手」改名 |
| `SKILL.md` | Claude Code skill loader 依固定檔名辨識(`.claude/skills/*/SKILL.md`),不在 `docs/` 內,一併記錄 |

**D4 文件清單完整性** —— `docs/` 頂層每一個 `*.md`(`_templates/`、
`plans/` 除外,那兩處是 D 級鷹架,索引只描述資料夾層級,不逐檔收錄)都
必須被 `docs/README.md` 的文件清單收錄;文件清單裡的連結也都要指向
確實存在的路徑,兩個方向都查。2026-07-25 發現
`claude-code-token-best-practices.md` 連續被兩個文件盤點 PR(#115 的
docs cleanup、#124 的命名規則盤點)路過卻沒被收錄——盤點會找到檔案,
但在這條規則機械化之前,沒有任何一層在管「找到了要不要收進索引」。

**D5 文件清單不得重複收錄** —— 同一份文件在 `docs/README.md` 的文件清單裡
只該有一列。2026-07-25 發現 `claude-code-token-best-practices.md` 被兩個
不同來源各加了一列(一列描述「採用現況與缺口」、一列描述「分層架構」),
而 D4 的兩個方向都通過——**完整性不等於唯一性**。重複的代價不只是難看:
兩列會讓讀者以為是兩份文件,而且改其中一列時另一列會靜默過期。

實作上要注意 `link_targets()` 回的是 `set`,重複在進入檢查前就被吃掉了,
所以唯一性必須另外拿原始 list 來查。

## 新增文件時

1. 檔名 kebab-case,內容語言不受此限
2. 加進 `docs/README.md` 的文件清單,標明權威性分級(A 規範 / B 現況說明 /
   C 長期記憶 / D 鷹架——見該檔開頭的分級表)
3. `python3 scripts/check-document-naming.py` 必須綠(`npm run check` 之外,
   framework-check 軌每次 CI 都會跑)
