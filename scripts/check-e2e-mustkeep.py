#!/usr/bin/env python3
"""e2e 必留情境的機械把關——「刪」有規則了,「必留」還只是一段文字。

存在理由(2026-08-07,e2e 情境去重的防線回填):那次刪了 18 條 e2e 情境,
並在 `e2e/README.md` 立了兩條規則——刪一條要什麼證據(A/B/C 三級),以及
四條使用者關鍵旅程各自至少保留一條端到端情境。**前者有審查會看,後者
只是一段散文**:下一次去重的人可以完全誠實地照 A/B/C 舉證,然後把註冊
那條唯一的端到端情境刪掉——因為「下層確實有覆蓋」在單條情境的層次上
永遠成立,而「這條線要從頭串到尾」是**跨情境**的性質,逐條審查看不見。

失效是靜默的:刪掉之後 CI 全綠、覆蓋率數字只降一點點,沒有任何一層會紅。
等到有人在正式站走完一次註冊才發現中間斷了——那正是 e2e 唯一能證、
而其他三層結構性證不到的東西。

**清單不寫在本檔**:唯一事實來源是 `e2e/README.md` 的 Must-keep 節,本檔
從那裡抽取(與 check-spec-drift.py 同慣例)。理由是規則只寫一份——寫兩份
就會漂,而漂掉的那份通常是沒人讀的那份。代價是「改寫那一節的措辭會讓
抽取失配而變紅」,那是刻意的:閘門不容許靜默失效,寧可紅一次讓人回來對齊。

規則:

  K1 具名情境必須存在 —— 表格裡的每個情境名都要在 e2e/features/*.feature
     找得到逐字相同的 `Scenario:` / `Scenario Outline:` 行。

  K2 整檔保留的檔案不得縮水 —— 標記「整檔保留(目前 N 條)」的 feature
     檔,情境數不得低於 N。**只准增不准減**:實際多於 N 時通過(新增情境
     不必回頭改文件),少於 N 才紅。

  K3 抽取必須有結果 —— 表格抽不到任何情境名,代表那一節被改寫成本檔認不得
     的形狀。此時**視為違規**而非「沒事可查」:一個永遠通過的閘門比沒有
     閘門更糟,它會讓人以為有人在看。

放在 framework-check 軌(而非 e2e 軌)是刻意的:framework-check 永遠執行、
不設路徑過濾,而 e2e 軌有路徑過濾——刪情境的那個 PR 若同時動到別的東西,
路徑過濾的邊角就是這道閘門的漏洞。

註:規劃階段原本想把這條掛進 check-workflows.py,那是誤配——那支檢查的是
`.github/workflows/` 的設定語意,與 feature 檔無關。一個檢查器一個主題。

跑法:
  python3 scripts/check-e2e-mustkeep.py              比對 README 與 features/
  python3 scripts/check-e2e-mustkeep.py --self-test  跑表格案例(驗檢查器自己)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
README = ROOT / "e2e" / "README.md"
FEATURES_DIR = ROOT / "e2e" / "features"

SECTION_HEADING = "## Must-keep end-to-end coverage"
# 表格列(| 開頭)裡的反引號片段才是情境名。散文段落也有反引號(識別字、
# 檔名),不能一起抓——所以先鎖定表格列,再抽反引號。
BACKTICKED = re.compile(r"`([^`]+)`")
# 「整檔保留」的棘輪。全形/半形括號與逗號都收——文件是人寫的,不該為了
# 遷就檢查器而規定標點。
WHOLE_FILE = re.compile(
    r"`(?P<file>[\w./-]+\.feature)`\s*\*\*整檔保留[(（]目前\s*(?P<count>\d+)\s*條",
)
SCENARIO_LINE = re.compile(r"^\s*Scenario(?:\s+Outline)?:\s*(?P<name>.+?)\s*$", re.MULTILINE)


def extract_requirements(readme: str) -> tuple[list[str], list[tuple[str, int]]]:
    """從 README 抽出 (具名情境清單, [(整檔保留的檔名, 最低情境數)])。純函式。"""
    lines = readme.splitlines()
    try:
        start = next(i for i, line in enumerate(lines) if line.strip() == SECTION_HEADING)
    except StopIteration:
        return [], []

    section: list[str] = []
    for line in lines[start + 1 :]:
        if line.startswith("## "):
            break
        section.append(line)

    scenarios: list[str] = []
    for line in section:
        stripped = line.strip()
        if not stripped.startswith("|") or set(stripped) <= set("|-: "):
            continue  # 非表格列、或表頭下面那條分隔線
        cells = stripped.strip("|").split("|")
        for cell in cells[1:]:  # 第一欄是旅程名稱(純文字),情境名在其後
            scenarios.extend(BACKTICKED.findall(cell))

    whole_files = [(m.group("file"), int(m.group("count"))) for m in WHOLE_FILE.finditer("\n".join(section))]
    return scenarios, whole_files


def check(
    scenarios: list[str],
    whole_files: list[tuple[str, int]],
    features: dict[str, str],
) -> list[str]:
    """回傳違規訊息清單。features:檔名 → 檔案內容。純函式,無 I/O。"""
    violations: list[str] = []

    # K3:抽不到東西 = 那一節被改寫成認不得的形狀,不是「沒事可查」。
    if not scenarios:
        violations.append(
            f"K3 從 e2e/README.md 的「{SECTION_HEADING}」抽不到任何情境名"
            "(該節被改寫、被刪除、或表格形狀變了)。"
            "閘門抽不到東西時一律視為違規——永遠通過的閘門比沒有閘門更糟。"
        )
        return violations

    present: dict[str, str] = {}
    for filename, text in features.items():
        for match in SCENARIO_LINE.finditer(text):
            present[match.group("name")] = filename

    # K1:具名情境逐字存在。
    for name in scenarios:
        if name not in present:
            violations.append(
                f"K1 必留情境不存在於任何 feature 檔:`{name}`"
                "(被刪除、被改名,或 README 的字串與 .feature 不再逐字相同)"
            )

    # K2:整檔保留的棘輪。
    for filename, minimum in whole_files:
        text = features.get(filename)
        if text is None:
            violations.append(f"K2 整檔保留的 {filename} 不存在(整個檔案被刪除了)")
            continue
        actual = len(SCENARIO_LINE.findall(text))
        if actual < minimum:
            violations.append(
                f"K2 {filename} 只剩 {actual} 條情境,低於 README 記錄的 {minimum} 條"
                "(整檔保留 = 只准增不准減)"
            )

    return violations


def _fix_hint(violations: list[str]) -> str:
    """依實際觸發的規則給修法。誤導性的修法提示比沒有提示更糟——
    K3(抽取失配)要修的是文件形狀,叫人去「還原被刪的情境」只會把人帶偏。"""
    if any(v.startswith("K3") for v in violations):
        return (
            "修法:把 e2e/README.md 的該節改回本檔認得的形狀"
            "(`## Must-keep end-to-end coverage` 標題 + 情境名寫在表格列的反引號裡),"
            "\n或連同本檔的抽取規則一起改。抽取式閘門的失配是刻意設計成紅燈的——"
            "\n它比「靜靜地不再檢查任何東西」誠實。"
        )
    return (
        "修法:情境被刪或改名 → 還原,或先在 e2e/README.md 的 Must-keep 節"
        "\n改用新的情境名(那是一個需要說明理由的決定,不是順手改)。"
        "\n該節的四條旅程刻意不受 A/B/C 三級證據判準約束——下層覆蓋在單條情境的"
        "\n層次上永遠成立,但『整條線串起來』是跨情境的性質,逐條審查看不見。"
    )


def scan() -> int:
    if not README.is_file() or not FEATURES_DIR.is_dir():
        print("check-e2e-mustkeep: 找不到 e2e/README.md 或 e2e/features/,跳過")
        return 0

    scenarios, whole_files = extract_requirements(README.read_text(encoding="utf-8"))
    features = {p.name: p.read_text(encoding="utf-8") for p in sorted(FEATURES_DIR.glob("*.feature"))}
    violations = check(scenarios, whole_files, features)

    if violations:
        print("check-e2e-mustkeep 發現違規:")
        print("\n".join(f"  {v}" for v in violations))
        print("\n" + _fix_hint(violations))
        return 1

    print(
        f"check-e2e-mustkeep: OK（{len(scenarios)} 條必留情境、"
        f"{len(whole_files)} 個整檔保留的 feature）"
    )
    return 0


# (標籤, 情境清單, 整檔保留, features, 預期違規數)
CASES: list[tuple[str, list[str], list[tuple[str, int]], dict[str, str], int]] = [
    (
        "情境都在 → 通過",
        ["A signs up", "B pays"],
        [],
        {"auth.feature": "  Scenario: A signs up\n", "pay.feature": "  Scenario: B pays\n"},
        0,
    ),
    (
        "情境被刪 → 違規",
        ["A signs up"],
        [],
        {"auth.feature": "  Scenario: Something else\n"},
        1,
    ),
    (
        "兩條都被刪 → 兩條違規(逐條指名,不合併成一句)",
        ["A signs up", "B pays"],
        [],
        {"auth.feature": "  Scenario: Something else\n"},
        2,
    ),
    (
        "Scenario Outline 也算數",
        ["The funnel routes by step"],
        [],
        {"guards.feature": "  Scenario Outline: The funnel routes by step\n"},
        0,
    ),
    (
        "只差尾綴 → 違規(逐字比對,不做前綴寬容)",
        ["A success status renders the success screen"],
        [],
        {"pay.feature": "  Scenario: A success status renders the success screen with details\n"},
        1,
    ),
    (
        "整檔保留:情境數持平 → 通過",
        ["X"],
        [("guards.feature", 2)],
        {"guards.feature": "  Scenario: X\n  Scenario: Y\n"},
        0,
    ),
    (
        "整檔保留:多了一條 → 通過(只准增不准減,不必回頭改文件)",
        ["X"],
        [("guards.feature", 2)],
        {"guards.feature": "  Scenario: X\n  Scenario: Y\n  Scenario: Z\n"},
        0,
    ),
    (
        "整檔保留:少了一條 → 違規",
        ["X"],
        [("guards.feature", 3)],
        {"guards.feature": "  Scenario: X\n  Scenario: Y\n"},
        1,
    ),
    (
        "整檔保留:整個檔案被刪 → 違規",
        ["X"],
        [("guards.feature", 2)],
        {"other.feature": "  Scenario: X\n"},
        1,
    ),
    (
        "抽不到情境名 → 違規(K3:永遠通過的閘門比沒有閘門更糟)",
        [],
        [],
        {"auth.feature": "  Scenario: A signs up\n"},
        1,
    ),
    (
        "抽不到情境名時不再往下查,不會連帶噴 K2",
        [],
        [("guards.feature", 99)],
        {},
        1,
    ),
]

# (標籤, README 片段, 預期情境數, 預期整檔保留數)
EXTRACT_CASES: list[tuple[str, str, int, int]] = [
    (
        "表格列抽得到,散文的反引號不抽",
        f"{SECTION_HEADING}\n\n說明裡的 `identifier` 不算。\n\n"
        "| 旅程 | 保留的情境 |\n|---|---|\n| 註冊 | `A` → `B` |\n| 付款 | `C`、`D` |\n",
        4,
        0,
    ),
    (
        "整檔保留的棘輪抽得到(全形括號)",
        f"{SECTION_HEADING}\n\n| 旅程 | 情境 |\n|---|---|\n| 註冊 | `A` |\n\n"
        "另外 `route_guards.feature` **整檔保留（目前 8 條，只准增不准減）**:理由……\n",
        1,
        1,
    ),
    (
        "整檔保留的棘輪抽得到(半形括號)",
        f"{SECTION_HEADING}\n\n| 旅程 | 情境 |\n|---|---|\n| 註冊 | `A` |\n\n"
        "另外 `route_guards.feature` **整檔保留(目前 8 條,只准增不准減)**:理由……\n",
        1,
        1,
    ),
    (
        "下一個 ## 標題之後的內容不納入",
        f"{SECTION_HEADING}\n\n| 旅程 | 情境 |\n|---|---|\n| 註冊 | `A` |\n\n"
        "## 別節\n\n| x | y |\n|---|---|\n| z | `NOT_MINE` |\n",
        1,
        0,
    ),
    ("找不到該節 → 抽出空的(交給 K3 判違規)", "# 別的文件\n\n沒有那一節。\n", 0, 0),
]


def self_test() -> int:
    failures: list[str] = []

    for label, scenarios, whole_files, features, want in CASES:
        got = len(check(scenarios, whole_files, features))
        if got != want:
            failures.append(f"  FAIL: {label} — 預期 {want} 筆違規,實得 {got}")

    for label, readme, want_scenarios, want_files in EXTRACT_CASES:
        scenarios, whole_files = extract_requirements(readme)
        if len(scenarios) != want_scenarios or len(whole_files) != want_files:
            failures.append(
                f"  FAIL: {label} — 預期抽出 {want_scenarios} 條情境／{want_files} 個整檔保留,"
                f"實得 {len(scenarios)}／{len(whole_files)}"
            )

    if failures:
        print("check-e2e-mustkeep 表格案例未過:")
        print("\n".join(failures))
        return 1
    print(f"check-e2e-mustkeep self-test: OK（{len(CASES) + len(EXTRACT_CASES)} 條案例）")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else scan())
