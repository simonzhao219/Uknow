#!/usr/bin/env python3
"""docs/ 文件命名的機械檢查——完整原則見 .claude/rules/document-naming.md。

存在理由:2026-07 盤點 `docs/` 發現三種風格並存(SCREAMING_SNAKE_CASE、
Title_Case_With_Underscore、kebab-case),與 PR #116 動手前的 workflow/測試
命名一樣——不是有人寫錯,是沒有任何一層在檢查。訂了規則卻沒有閘門,
等於沒訂。

規則(逐條對應 .claude/rules/document-naming.md):
  D1 檔名全小寫、以連字號分隔(kebab-case)
  D3 凍結例外:README.md / CLAUDE.md / SKILL.md——工具依固定檔名辨識,
     改了會靜默壞掉(掉出 GitHub 自動渲染、Claude Code 的載入機制)
  D4 文件清單完整性:docs/ 頂層每個 *.md 都要被 docs/README.md 的文件
     清單收錄,清單裡的連結也都要指向確實存在的路徑——2026-07-25 發現
     claude-code-token-best-practices.md 連續被兩個文件盤點 PR(#115、
     #124)路過卻沒收錄,盤點會找到檔案,但沒人「擁有」把它拉進索引的
     責任,直到現在都沒有機器在管

決策邏輯放在純函式裡,好讓表格案例直接驗行為(與 check-workflows.py、
check-test-names.py、.claude/hooks/ 的 decide() 同慣例)。刻意不 import
任何第三方套件——framework-check 的契約是免依賴安裝。

跑法:
  python3 scripts/check-document-naming.py              掃 docs/**/*.md
  python3 scripts/check-document-naming.py --self-test  跑表格案例(驗檢查器自己)
framework-check.sh 會依序呼叫兩者。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT / "docs"

KEBAB = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*\.md$")

# D3:工具依固定檔名辨識,改了會靜默壞掉——不受 D1 管
FROZEN_NAMES = {"README.md", "CLAUDE.md", "SKILL.md"}

# D4:比對對象只取 docs/ 頂層(glob 非 rglob),_templates/、plans/ 底下的
# D 級鷹架天生不在集合裡,不需要額外排除清單
MD_LINK = re.compile(r"\]\(([^)]+)\)")


def violations_for_name(name: str) -> list[str]:
    """單一檔名的違規訊息(空 list 表示通過)。純函式,無 I/O。"""
    if name in FROZEN_NAMES:
        return []
    if not KEBAB.match(name):
        return [
            f"{name!r} 不是 kebab-case——檔名須為全小寫、連字號分隔"
            "(例:my-doc.md),不得有底線或大寫字母"
        ]
    return []


def link_targets(section_text: str) -> set[str]:
    """一段 markdown 文字裡所有連結目標(相對路徑字串)。純函式,無 I/O。"""
    return set(MD_LINK.findall(section_text))


def missing_from_index(top_level_names: set[str], targets: set[str]) -> list[str]:
    """哪些頂層 docs/*.md 沒被文件清單的連結收錄(README.md 自己除外)。
    純函式——targets 由呼叫方(真的解析 docs/README.md)注入。"""
    indexed_basenames = {t.rsplit("/", 1)[-1] for t in targets}
    return sorted(
        name
        for name in top_level_names
        if name != "README.md" and name not in indexed_basenames
    )


def dangling_index_links(targets: set[str], existing_relpaths: set[str]) -> list[str]:
    """文件清單指到的相對路徑,有哪些不在「確實存在」清單裡。純函式——
    existing_relpaths 由呼叫方(真的走檔案系統)注入,外部連結(http/https)
    不算。"""
    return sorted(
        t
        for t in targets
        if not t.startswith(("http://", "https://")) and t not in existing_relpaths
    )


# --- 表格案例:每筆是 (標籤, 檔名, 預期違規數) ---
CASES: list[tuple[str, str, int]] = [
    ("kebab-case → 通過", "supabase-setup-checklist.md", 0),
    ("SCREAMING_SNAKE_CASE → 違規", "SUPABASE_SETUP_CHECKLIST.md", 1),
    ("Title_Case_With_Underscore → 違規", "UI_UX_Guidelines.md", 1),
    ("含底線 → 違規", "my_doc.md", 1),
    ("含大寫字母(駝峰) → 違規", "myDoc.md", 1),
    ("含空白 → 違規", "my doc.md", 1),
    ("README.md 凍結例外 → 通過", "README.md", 0),
    ("CLAUDE.md 凍結例外 → 通過", "CLAUDE.md", 0),
    ("SKILL.md 凍結例外 → 通過", "SKILL.md", 0),
    ("純小寫單字無連字號 → 通過", "readme2.md", 0),
    ("數字開頭 → 通過(規則不禁止數字)", "2026-notes.md", 0),
]


# --- 表格案例:D4 的兩個方向,各自純函式驗行為 ---
MISSING_CASES: list[tuple[str, set[str], set[str], list[str]]] = [
    ("全部收錄 → 通過", {"a.md"}, {"a.md"}, []),
    ("漏收錄 → 違規", {"a.md", "b.md"}, {"a.md"}, ["b.md"]),
    ("README.md 自己不用列 → 通過", {"README.md"}, set(), []),
    ("連結是子路徑,取檔名比對仍算收錄 → 通過", {"friction-log.md"}, {"plans/friction-log.md"}, []),
]

DANGLING_CASES: list[tuple[str, set[str], set[str], list[str]]] = [
    ("連結存在 → 通過", {"a.md"}, {"a.md"}, []),
    ("連結已刪除的檔案 → 違規", {"a.md", "b.md"}, {"a.md"}, ["b.md"]),
    ("外部連結不查存在性 → 通過", {"https://example.com/x.md"}, set(), []),
    ("子路徑連結,以相對路徑比對 → 通過", {"plans/friction-log.md"}, {"plans/friction-log.md"}, []),
]


def self_test() -> int:
    failures: list[str] = []
    for label, name, want in CASES:
        got = len(violations_for_name(name))
        if got != want:
            failures.append(f"  FAIL: {label} — 預期 {want} 筆違規,實得 {got}")

    for label, top_level, targets, want in MISSING_CASES:
        got = missing_from_index(top_level, targets)
        if got != want:
            failures.append(f"  FAIL: {label} — 預期 {want},實得 {got}")

    for label, targets, existing, want in DANGLING_CASES:
        got = dangling_index_links(targets, existing)
        if got != want:
            failures.append(f"  FAIL: {label} — 預期 {want},實得 {got}")

    total = len(CASES) + len(MISSING_CASES) + len(DANGLING_CASES)
    if failures:
        print("check-document-naming 表格案例未過:")
        print("\n".join(failures))
        return 1
    print(f"check-document-naming self-test: OK（{total} 條案例）")
    return 0


def _index_section(readme_text: str) -> str:
    """只取「文件清單」段落,避免「慣例」段落裡的說明性連結誤判成索引項。"""
    section = readme_text.split("## 文件清單", 1)[-1]
    return section.split("## 慣例", 1)[0]


def scan() -> int:
    if not DOCS_DIR.is_dir():
        return 0  # 沒有 docs 目錄視為通過

    fail = 0
    for path in sorted(DOCS_DIR.rglob("*.md")):
        for msg in violations_for_name(path.name):
            print(f"FAIL: {path.relative_to(ROOT)}: {msg}")
            fail = 1

    readme = DOCS_DIR / "README.md"
    if readme.is_file():
        section = _index_section(readme.read_text(encoding="utf-8"))
        targets = link_targets(section)
        top_level = {p.name for p in DOCS_DIR.glob("*.md")}

        for name in missing_from_index(top_level, targets):
            print(f"FAIL: docs/{name} 未被 docs/README.md 的文件清單收錄")
            fail = 1

        # 逐一以連結所在檔案(docs/README.md)為基準解析——涵蓋 ../ 上層路徑
        # 與資料夾連結(如 `_templates/`),不只 docs/ 同層檔案
        existing_relpaths = {
            t
            for t in targets
            if not t.startswith(("http://", "https://"))
            and (DOCS_DIR / t).resolve().exists()
        }
        for t in dangling_index_links(targets, existing_relpaths):
            print(f"FAIL: docs/README.md 文件清單連結 {t!r} 指向不存在的路徑")
            fail = 1

    if fail == 0:
        print("check-document-naming: OK")
    return fail


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else scan())
