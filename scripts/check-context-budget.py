#!/usr/bin/env python3
"""Context 預算與讀取成本的機械檢查。

存在理由:既有的四支 canary(workflows / test-names / spec-drift /
document-naming)都在驗「設定寫對了沒」,沒有一支在驗「這個 repo 對 agent
來說貴不貴」。而 `framework-check` 唯一的 context 經濟指標是 CLAUDE.md 的
200 行上限——它只管一個檔案,管不到:

1. 啟動固定成本(CLAUDE.md + 無 paths 的 rules,每個 session 都付)
2. 單檔讀取成本(`api/index.ts` 兩週長 204 行,沒有任何訊號)
3. rule 的 paths 有沒有真的匹配到東西(匹配不到 = 宣告了但永遠不載入)

第 3 條與 2026-07-25 的 `changes` 路徑過濾是**同一類 bug**:設定寫了、
語意不生效、CI 全綠所以沒人發現。那次的教訓寫在 friction-log:「宣稱有的
治理若不生效,比沒有治理更貴」。

## 三條規則

**C1 啟動固定成本上限** —— CLAUDE.md 加上所有「無 `paths:`」的 rules,
每個 session 都會全量載入。超過上限就該把內容搬進 path-scoped rule 或 skill。

**C2 單檔讀取成本(軟警戒,不擋)** —— 超過閾值的檔案警告一次,建議補導航
或拆分。刻意**不擋**:硬擋會在錯誤的時機逼人重構,而重構的時機該由人選。
本規則要達成的是「別讓它默默長大」,不是「立刻變小」。

**C3 rule 的 paths 必須匹配到檔案** —— 匹配不到代表這條 rule 永遠不會載入,
是死設定。硬擋:這正是「宣稱有的治理不生效」那一類。

## token 估算

沒有 Anthropic API key,所以無法做真實 tokenizer 計數。改用 CJK 感知估算:
CJK 字元約 1 token,其餘約 4 字元 1 token。相較於常見的 `bytes/4`,本
repo 實測差 +6%(程式碼檔)到 +16%(中文為主的文件)——因為 CJK 在 UTF-8
是 3 bytes,`bytes/4` 會把它算成 0.75 token。

**這仍是估算,不是真值。** 因此 C1/C2 的閾值都留了寬裕,不做精算式判斷;
真正需要精確數字時看 Claude Code 的 `/context`。

決策邏輯放純函式裡,好讓 `--self-test` 用表格案例驗行為(與 .claude/hooks
的 decide() 及其他 canary 同慣例)。

跑法:
  python3 scripts/check-context-budget.py              掃本 repo
  python3 scripts/check-context-budget.py --self-test  跑表格案例
framework-check.sh 會依序呼叫兩者。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Claude 的 context window(本規則用來換算比例,不是硬編碼上限)
WINDOW = 200_000

# C1:每個 session 都付的固定成本上限。取 window 的 5%——超過就代表
# 「還沒開始工作就先花掉 1/20」,該把內容改成條件載入。
STARTUP_BUDGET = int(WINDOW * 0.05)  # 10,000

# C2:單檔軟警戒。取 window 的 10%——也是「工作集預算 40%」的 1/4,
# 意思是單一檔案不該吃掉工作集的四分之一以上。
LARGE_FILE_WARN = int(WINDOW * 0.10)  # 20,000

# 掃描範圍:排除不會被當成原始碼讀的東西(lockfile 已在 permissions.deny)
SCAN_GLOBS = ("src/**/*", "supabase/**/*", "e2e/**/*", "scripts/**/*", "docs/**/*")
SKIP_PARTS = {"node_modules", ".git", "dist", "build", "test-results", "__pycache__"}
SKIP_NAMES = {"package-lock.json", "deno.lock"}

CJK = re.compile(r"[　-〿㐀-䶿一-鿿＀-￯]")
FRONTMATTER_PATHS = re.compile(r"^---\s*\n(.*?)^---\s*\n", re.DOTALL | re.MULTILINE)


def estimate_tokens(text: str) -> int:
    """CJK 感知的 token 估算。純函式,無 I/O。

    CJK 約 1 token/字元;其餘約 4 字元/token。刻意保守而非精算——
    它的用途是「跨檔案比較大小」與「跨時間偵測長大」,不是計費。
    """
    cjk = len(CJK.findall(text))
    return cjk + (len(text) - cjk) // 4


def _rule_paths(text: str) -> list[str]:
    """從 rule 的 YAML frontmatter 取出 paths 清單。不 import yaml——
    framework-check 的契約是免依賴安裝。"""
    m = FRONTMATTER_PATHS.search(text)
    if not m:
        return []
    block = m.group(1)
    if not re.search(r"^paths:\s*$", block, re.MULTILINE):
        return []
    out = []
    in_paths = False
    for line in block.splitlines():
        if re.match(r"^paths:\s*$", line):
            in_paths = True
            continue
        if in_paths:
            item = re.match(r"^\s+-\s*['\"]?([^'\"]+?)['\"]?\s*$", line)
            if item:
                out.append(item.group(1))
            elif line.strip() and not line.startswith((" ", "\t")):
                break
    return out


def startup_violations(entries: list[tuple[str, int]]) -> list[str]:
    """C1:每 session 固定成本。entries 是 (檔名, tokens)。純函式。"""
    total = sum(t for _, t in entries)
    if total <= STARTUP_BUDGET:
        return []
    detail = "、".join(f"{n} {t:,}" for n, t in sorted(entries, key=lambda e: -e[1])[:5])
    return [
        f"啟動固定成本 {total:,} tokens 超過上限 {STARTUP_BUDGET:,}"
        f"（window 的 5%）。最大宗:{detail}。"
        f"把只在特定路徑相關的內容改成 .claude/rules + paths:,"
        f"多步驟流程改成 skill——兩者都是按需載入。"
    ]


def large_file_warnings(files: list[tuple[str, int]]) -> list[str]:
    """C2:單檔軟警戒。回傳警告字串(呼叫端不得據此 fail)。純函式。"""
    out = []
    for name, tok in sorted(files, key=lambda f: -f[1]):
        if tok > LARGE_FILE_WARN:
            out.append(
                f"{name}:約 {tok:,} tokens（≈ context window 的 {tok / WINDOW:.0%}）"
                f"——單次讀取即吃掉工作集預算的 {tok / (WINDOW * 0.4):.0%}。"
                f"確認它有導航（.claude/rules 內的區段表）或考慮拆分。"
            )
    return out


def dead_rule_violations(rules: list[tuple[str, list[str], list[bool]]]) -> list[str]:
    """C3:rule 的 paths 匹配不到任何檔案 = 死設定。

    rules 是 (檔名, patterns, 每個 pattern 是否命中)。純函式——是否命中
    由呼叫端查檔案系統後注入,這樣表格案例不必造真實目錄。
    """
    out = []
    for name, patterns, hits in rules:
        dead = [p for p, h in zip(patterns, hits) if not h]
        if dead and not any(hits):
            out.append(
                f"{name}:paths 的所有 pattern 都匹配不到檔案（{', '.join(dead)}）"
                f"——這條 rule 永遠不會載入,是死設定。"
                f"修正 pattern,或若該路徑尚未建立就先移除這條 rule。"
            )
    return out


# ----------------------------------------------------------------- 實際掃描
def _iter_files():
    for pattern in SCAN_GLOBS:
        for p in ROOT.glob(pattern):
            if not p.is_file():
                continue
            if SKIP_PARTS & set(p.parts) or p.name in SKIP_NAMES:
                continue
            yield p


def _pattern_hits(pattern: str) -> bool:
    """該 pattern 是否至少匹配到一個檔案。`foo/**` 補成 `foo/**/*`——
    Python 的 glob 對前者只回目錄。"""
    pat = pattern + "/*" if pattern.endswith("/**") else pattern
    try:
        return any(p.is_file() for p in ROOT.glob(pat))
    except (ValueError, OSError):
        return False


def scan() -> int:
    fail = 0

    # C1 啟動固定成本:CLAUDE.md + 無 paths 的 rules
    startup: list[tuple[str, int]] = []
    claude_md = ROOT / "CLAUDE.md"
    if claude_md.exists():
        startup.append(("CLAUDE.md", estimate_tokens(claude_md.read_text(encoding="utf-8"))))

    rules: list[tuple[str, list[str], list[bool]]] = []
    for rule in sorted((ROOT / ".claude" / "rules").glob("*.md")):
        text = rule.read_text(encoding="utf-8")
        patterns = _rule_paths(text)
        rel = str(rule.relative_to(ROOT))
        if patterns:
            rules.append((rel, patterns, [_pattern_hits(p) for p in patterns]))
        else:
            startup.append((rel, estimate_tokens(text)))

    for msg in startup_violations(startup):
        print(f"FAIL: {msg}")
        fail = 1

    for msg in dead_rule_violations(rules):
        print(f"FAIL: {msg}")
        fail = 1

    # C2 軟警戒——警告不擋
    files = [(str(p.relative_to(ROOT)), estimate_tokens(p.read_text(encoding="utf-8", errors="ignore"))) for p in _iter_files()]
    warnings = large_file_warnings(files)
    for msg in warnings:
        print(f"WARN: {msg}")

    if fail == 0:
        total = sum(t for _, t in startup)
        print(
            f"check-context-budget: OK"
            f"（啟動固定成本 ≈{total:,} tokens / 上限 {STARTUP_BUDGET:,}"
            f"；{len(warnings)} 個大檔警告）"
        )
    return fail


# ------------------------------------------------------------- 表格案例
STARTUP_CASES = [
    ("遠低於上限", [("CLAUDE.md", 3000)], 0),
    ("剛好在上限", [("CLAUDE.md", STARTUP_BUDGET)], 0),
    ("超過上限", [("CLAUDE.md", STARTUP_BUDGET + 1)], 1),
    ("多個來源加總超過", [("CLAUDE.md", 6000), (".claude/rules/a.md", 5000)], 1),
    ("空的", [], 0),
]

LARGE_FILE_CASES = [
    ("剛好在閾值上不警告", [("a.ts", LARGE_FILE_WARN)], 0),
    ("超過閾值警告", [("a.ts", LARGE_FILE_WARN + 1)], 1),
    ("多個超過各警告一次", [("a.ts", 30000), ("b.ts", 25000), ("c.ts", 10)], 2),
]

DEAD_RULE_CASES = [
    ("全部命中", [("r.md", ["src/**"], [True])], 0),
    ("全部落空 = 死設定", [("r.md", ["nope/**"], [False])], 1),
    ("部分命中不算死", [("r.md", ["src/**", "nope/**"], [True, False])], 0),
    ("無 paths 的 rule 不進此檢查", [], 0),
]

FRONTMATTER_CASES = [
    ("標準 paths", '---\npaths:\n  - "src/**"\n  - "e2e/**"\n---\n# x', ["src/**", "e2e/**"]),
    ("無引號", "---\npaths:\n  - src/**\n---\n# x", ["src/**"]),
    ("無 frontmatter", "# x", []),
    ("有 frontmatter 但無 paths", "---\nname: x\n---\n# y", []),
]

TOKEN_CASES = [
    ("純 ASCII 約 4 字元 1 token", "a" * 400, 100),
    ("純中文約 1 字元 1 token", "測" * 100, 100),
    ("空字串", "", 0),
]


def self_test() -> int:
    failures: list[str] = []
    n = 0

    for label, text, want in TOKEN_CASES:
        n += 1
        if estimate_tokens(text) != want:
            failures.append(f"estimate_tokens[{label}]: 預期 {want},實得 {estimate_tokens(text)}")

    for label, text, want in FRONTMATTER_CASES:
        n += 1
        if _rule_paths(text) != want:
            failures.append(f"_rule_paths[{label}]: 預期 {want},實得 {_rule_paths(text)}")

    for label, entries, want in STARTUP_CASES:
        n += 1
        if len(startup_violations(entries)) != want:
            failures.append(f"startup[{label}]: 預期 {want} 筆")

    for label, files, want in LARGE_FILE_CASES:
        n += 1
        if len(large_file_warnings(files)) != want:
            failures.append(f"large_file[{label}]: 預期 {want} 筆")

    for label, rules, want in DEAD_RULE_CASES:
        n += 1
        if len(dead_rule_violations(rules)) != want:
            failures.append(f"dead_rule[{label}]: 預期 {want} 筆")

    if failures:
        print("check-context-budget 表格案例未過:")
        print("\n".join(f"  FAIL: {f}" for f in failures))
        return 1
    print(f"check-context-budget self-test: OK（{n} 條案例）")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else scan())
