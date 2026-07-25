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


def self_test() -> int:
    failures: list[str] = []
    for label, name, want in CASES:
        got = len(violations_for_name(name))
        if got != want:
            failures.append(f"  FAIL: {label} — 預期 {want} 筆違規,實得 {got}")

    if failures:
        print("check-document-naming 表格案例未過:")
        print("\n".join(failures))
        return 1
    print(f"check-document-naming self-test: OK（{len(CASES)} 條案例）")
    return 0


def scan() -> int:
    if not DOCS_DIR.is_dir():
        return 0  # 沒有 docs 目錄視為通過

    fail = 0
    for path in sorted(DOCS_DIR.rglob("*.md")):
        for msg in violations_for_name(path.name):
            print(f"FAIL: {path.relative_to(ROOT)}: {msg}")
            fail = 1

    if fail == 0:
        print("check-document-naming: OK")
    return fail


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else scan())
