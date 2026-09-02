#!/usr/bin/env python3
"""docs/plans/ 只該留 friction-log.md 與明確宣告保留的檔——規劃檔生命週期的機械檢查。

存在理由:CLAUDE.md 的〈規劃檔生命週期:鷹架,不是文件〉已經寫明
「`docs/plans/` 平常只該有 `friction-log.md`」與「落檔的在 PR 前刪除」,
但沒有任何一層在執行。2026-09-01 盤點時躺著三個目錄,其中兩個的檔案裡
自己寫著「本檔可以結案」「五組全部修完,不要重做」——工作做完了,就是
收尾時沒刪。與 check-document-naming.py 的存在理由同源:訂了規則卻沒有
閘門,等於沒訂。

留著的代價不是難看。CLAUDE.md 自己講了:舊 plan 描述的是「當初想做什麼」,
會被誤當成規格——**比沒有文件更糟**。而內容刪除不等於遺失:
`git show <hash>:docs/plans/<slug>/plan.md` 永遠取得回,PR 也是紀錄。

## 為什麼需要豁免機制(這支的設計重點)

第一版沒有豁免,直接把「不是 friction-log 就是鷹架」寫死。**那個版本會刪掉
`upline-pairing-lines/rules.md`** —— 它是 M4/M6/M7(樹結構規則)在另一包 plan
誕生前的唯一落腳處,檔頭寫著「不得刪除」,friction-log 2026-08-02 還有一條
「跨包存活義務」的正式裁決(第 4 輪架構視角 P1)。一個為了防止「舊文件被
誤當成規格」而寫的閘門,第一版差點刪掉一份真正的規則單一事實來源。

所以豁免不是補丁,是這條規則本來就有的例外,只是從來沒有被寫下來。豁免用
**機器可讀的標記**而不是靠讀中文散文判斷——`.claude/rules/document-writing.md`
已經記過教訓:關鍵字比對分不出語意,硬擋只會製造假陽性。

決策邏輯放在純函式裡,好讓表格案例直接驗行為(與 check-document-naming.py、
check-workflows.py、check-test-names.py、.claude/hooks/ 的 decide() 同慣例)。
刻意不 import 任何第三方套件——framework-check 的契約是免依賴安裝。

跑法:
  python3 scripts/check-plans-scaffold.py              掃 docs/plans/
  python3 scripts/check-plans-scaffold.py --self-test  跑表格案例(驗檢查器自己)
framework-check.sh 會依序呼叫兩者。
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLANS_DIR = ROOT / "docs" / "plans"

# friction-log 是 C 級長期記憶(框架 meta 迴路的單一彙整點),不是鷹架。
ALLOWED = {"friction-log.md"}

# 宣告「這份不是施工鷹架,不要依生命週期清掉」的標記。放在檔案任一行即可,
# 冒號後面寫理由與退場條件——寫得出退場條件,才不會變成永久豁免。
KEEP_MARKER = "<!-- plans-keep:"


def has_keep_marker(text: str) -> bool:
    return KEEP_MARKER in text


def offending_entries(names: list[str], kept: set[str]) -> list[str]:
    """回傳不該留在 docs/plans/ 的項目名(已排序,穩定輸出)。

    只看**頂層**項目名:整個 <slug>/ 目錄是一個鷹架單位,逐檔報會讓一個
    未清理的規劃書噴出五六行雜訊,訊息反而變難讀。
    """
    return sorted(
        n for n in names if n not in ALLOWED and n not in kept and not n.startswith(".")
    )


CASES: list[tuple[str, list[str], set[str], list[str]]] = [
    ("只有 friction-log → 通過", ["friction-log.md"], set(), []),
    ("空目錄 → 通過", [], set(), []),
    ("殘留的 fix 鷹架 → 違規", ["friction-log.md", "fix-foo"], set(), ["fix-foo"]),
    ("宣告保留的目錄 → 通過", ["friction-log.md", "keepme"], {"keepme"}, []),
    (
        "一個宣告保留、一個沒有 → 只報沒宣告的",
        ["friction-log.md", "keepme", "stale"],
        {"keepme"},
        ["stale"],
    ),
    (
        "多個殘留 → 全部列出且排序穩定",
        ["friction-log.md", "zeta", "alpha"],
        set(),
        ["alpha", "zeta"],
    ),
    ("散落的 md 檔也算鷹架 → 違規", ["friction-log.md", "notes.md"], set(), ["notes.md"]),
    ("隱藏檔(.gitkeep 等)不管 → 通過", ["friction-log.md", ".gitkeep"], set(), []),
]

MARKER_CASES: list[tuple[str, str, bool]] = [
    ("有標記 → 認得", "前言\n<!-- plans-keep: M4/M6/M7 的唯一落腳處 -->\n內文", True),
    ("沒有標記 → 不認", "# 一般的規劃書\n\n## 1. 背景", False),
    ("只有中文散文說不要刪 → 不認(語意比對不可靠)", "> ⚠️ 本檔不得刪除", False),
]


def self_test() -> int:
    failures: list[str] = []
    for label, names, kept, want in CASES:
        got = offending_entries(names, kept)
        if got != want:
            failures.append(f"  FAIL: {label} — 預期 {want},實得 {got}")

    for label, text, want in MARKER_CASES:
        got = has_keep_marker(text)
        if got != want:
            failures.append(f"  FAIL: {label} — 預期 {want},實得 {got}")

    if failures:
        print("check-plans-scaffold 表格案例未過:")
        print("\n".join(failures))
        return 1
    total = len(CASES) + len(MARKER_CASES)
    print(f"check-plans-scaffold self-test: OK（{total} 條案例）")
    return 0


def _declares_keep(entry: Path) -> bool:
    """目錄內任一 .md(或該檔本身)帶標記,整個項目就豁免。"""
    files = entry.rglob("*.md") if entry.is_dir() else [entry]
    for f in files:
        try:
            if has_keep_marker(f.read_text(encoding="utf-8")):
                return True
        except (OSError, UnicodeDecodeError):
            continue
    return False


def scan() -> int:
    if not PLANS_DIR.is_dir():
        return 0  # 沒有 docs/plans 視為通過

    entries = sorted(PLANS_DIR.iterdir(), key=lambda p: p.name)
    kept = {e.name for e in entries if _declares_keep(e)}
    offenders = offending_entries([e.name for e in entries], kept)

    if not offenders:
        print("check-plans-scaffold: OK")
        return 0

    print("FAIL: docs/plans/ 只該留 friction-log.md,以下是未清理的施工鷹架:")
    for name in offenders:
        print(f"  docs/plans/{name}")
    print("")
    print("規劃檔是鷹架不是文件(見 CLAUDE.md〈規劃檔生命週期〉):")
    print("  1. 值得長期保存的決策**升級**進規格書／架構文件／friction-log")
    print("  2. 其餘隨 commit 刪掉——內容不會消失,")
    print("     `git show <hash>:docs/plans/<slug>/plan.md` 永遠取得回,PR 也是紀錄")
    print("留著的代價:舊 plan 描述的是「當初想做什麼」,會被誤當成規格——")
    print("那比沒有文件更糟。")
    print("")
    print(f"若這份**不是**鷹架(例如某規則在別處誕生前的唯一落腳處),在檔案裡加一行:")
    print(f"  {KEEP_MARKER} 為什麼要留、什麼條件下可以刪 -->")
    print("寫得出退場條件,豁免才不會變成永久居留。")
    return 1


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else scan())
