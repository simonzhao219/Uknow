#!/usr/bin/env python3
"""色彩守門腳本——完整設計見 docs/plans/design-language-foundation/plan.md §2.4。

存在理由:上游 platform-uiux-redesign 的診斷是「方向本來就對(--primary:
#030213 與 logo 相符),但沒人守門」——沒有 token 與守門腳本,S2 色彩收斂
完必然再漂。這支腳本就是那道守門。

三條規則,各自獨立計數(不合併,見 P2-7):

  C1 具名調色盤 class:
     (text|bg|border|from|via|to|ring|fill|stroke|divide|shadow|outline|
      decoration|accent|caret)-<Tailwind 官方 22 色相>-<階>
     變體前綴(hover: dark: md: focus-visible: …)一律照抓,不管有幾層。
  C2 裝飾性漸層:bg-gradient-to-* / bg-linear-to-*(Tailwind v4 兩種寫法)。
  C3 原始色值——色值的表達形式換一種就繞過閘門,等於沒有閘門:
     (a) JS/TS 字串字面量裡的 hex(`'#16a34a'`、3 位簡寫 `'#000'` 皆算)。
         非色彩用途的 hex-like 字串(`href="#a1b2c3"` 錨點)不誤報。
     (b) Tailwind 任意值色彩語法(`bg-[#16a34a]`、`text-[rgb(...)]`)。

棘輪 baseline:`scripts/color-usage-baseline.json`,`{相對路徑: {c1,c2,c3}}`。
四條判定(見 evaluate()):新債紅、命中數變多紅、命中數變少也紅(棘輪的牙齒,
訊息印出可貼上的 JSON)、baseline 孤兒條目紅。刻意不提供 --update-baseline
與行內豁免標記——自動更新是棘輪腐爛的標準路徑,豁免會變成壓力下最方便的
逃逸路徑。真的出現例外時再加(比照 plans-keep 的「機器可讀標記＋寫得出
退場條件」慣例)。

決策邏輯放在純函式裡,好讓表格案例直接驗行為(與 check-ime-safe-inputs.py
同慣例)。刻意不 import 任何第三方套件——framework-check 的契約是免依賴
安裝。

跑法:
  python3 scripts/check-color-usage.py              掃 src/**，比對 baseline
  python3 scripts/check-color-usage.py --self-test  跑表格案例(驗檢查器自己)
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BASELINE_PATH = ROOT / "scripts" / "color-usage-baseline.json"
GUIDELINES_PATH = ROOT / "docs" / "ui-ux-guidelines.md"

# Tailwind 官方 22 色相全表(§7:「不挑選」)——5 個灰階家族 + 17 個彩色家族。
TAILWIND_HUES = [
    "slate", "gray", "zinc", "neutral", "stone",
    "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
    "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
]
GRAY_HUES = {"slate", "gray", "zinc", "neutral", "stone"}

# 會接色相的 Tailwind utility 前綴（§2.4 C1 列舉）。
UTILITY_PREFIXES = [
    "text", "bg", "border", "from", "via", "to", "ring", "fill", "stroke",
    "divide", "shadow", "outline", "decoration", "accent", "caret",
]

SHADES = "50|100|200|300|400|500|600|700|800|900|950"

# C1:變體前綴(`hover:` `dark:` `md:` `focus-visible:` …)一律照抓——
# `(?:[\w-]+:)*` 允許零到多層，`(?<![\w-])`/`(?![\w-])` 確保不是更長識別字的一部分。
C1_PATTERN = re.compile(
    r"(?<![\w-])(?:[\w-]+:)*"
    r"(?:" + "|".join(UTILITY_PREFIXES) + r")-"
    r"(?:" + "|".join(TAILWIND_HUES) + r")-"
    r"(?:" + SHADES + r")(?![\w-])"
)

# C2:Tailwind v4 兩種寫法皆算（`bg-gradient-to-*` 是舊名的相容別名）。
C2_PATTERN = re.compile(r"(?<![\w-])bg-(?:gradient|linear)-to-(?:t|tr|r|br|b|bl|l|tl)(?![\w-])")

# C3(a):JS/TS 字串字面量裡的 hex 色值，3/6 位皆算。
# `(?<![\w#])` 防止匹配到更長 hex 序列或 `##` 的中段。
C3_HEX_LITERAL = re.compile(r"(?<![\w#])(['\"`])#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\1")
# 排除非色彩用途：`href="#a1b2c3"` 這類錨點。看字面量前面最近 20 個字元
# 是否以 `href=`（可接 `{`）收尾——這是本 repo 唯一會產生 hex-like 字串
# 但語意不是色彩的形狀（§7 風險表：C3 誤抓非色彩用途的 hex-like 字串）。
HREF_PRECEDING = re.compile(r"href\s*=\s*\{?\s*$", re.IGNORECASE)

# C3(b):Tailwind 任意值色彩語法，`bg-[#16a34a]` / `text-[rgb(...)]` 等。
C3_ARBITRARY = re.compile(
    r"(?<![\w-])(?:" + "|".join(UTILITY_PREFIXES) + r")-\["
    r"(?:#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|rgba?\([^\]\n]*\)|hsla?\([^\]\n]*\))"
    r"\]"
)

Hit = tuple[int, str]  # (1-indexed 行號, 命中片段)


def _line_of(source: str, index: int) -> int:
    return source.count("\n", 0, index) + 1


def find_c1(source: str) -> list[Hit]:
    return [(_line_of(source, m.start()), m.group(0)) for m in C1_PATTERN.finditer(source)]


def find_c2(source: str) -> list[Hit]:
    return [(_line_of(source, m.start()), m.group(0)) for m in C2_PATTERN.finditer(source)]


def find_c3(source: str) -> list[Hit]:
    hits: list[Hit] = []
    for m in C3_HEX_LITERAL.finditer(source):
        prefix = source[max(0, m.start() - 20) : m.start()]
        if HREF_PRECEDING.search(prefix):
            continue
        hits.append((_line_of(source, m.start()), m.group(0)))
    for m in C3_ARBITRARY.finditer(source):
        hits.append((_line_of(source, m.start()), m.group(0)))
    return hits


def scan_source(source: str) -> dict[str, list[Hit]]:
    """回傳這份原始碼在 C1/C2/C3 三條規則各自的命中清單（含行號）。"""
    return {"c1": find_c1(source), "c2": find_c2(source), "c3": find_c3(source)}


def counts_of(hits: dict[str, list[Hit]]) -> dict[str, int]:
    return {rule: len(items) for rule, items in hits.items()}


def gray_classes_used(source: str) -> set[str]:
    """G1（ui-ux-guidelines.md §12 灰階對照表完整性）用：C1 命中裡屬於灰階家族的
    `<hue>-<階>` 組合（不含變體前綴與 utility 前綴，只留調色盤本身）。"""
    found: set[str] = set()
    for _line, snippet in find_c1(source):
        m = re.search(r"(?:" + "|".join(TAILWIND_HUES) + r")-(?:" + SHADES + r")$", snippet)
        if not m:
            continue
        hue = m.group(0).rsplit("-", 1)[0]
        if hue in GRAY_HUES:
            found.add(m.group(0))
    return found


# ---------------------------------------------------------------------------
# G1（灰階對照表完整性，二審回填 R2-架構-1）：C1–C3 之外的第二類檢查——
# 驗「文件與程式碼一致」，不是掃違規，不進 baseline。
# ---------------------------------------------------------------------------

# ui-ux-guidelines.md §12.2 的灰階對照表用 `| \`gray-50\` | ... |` 這種列，
# 第一欄反引號內容就是已登記的 class。
DOCUMENTED_GRAY_ROW = re.compile(
    r"^\|\s*`((?:" + "|".join(sorted(GRAY_HUES)) + r")-(?:" + SHADES + r"))`\s*\|", re.MULTILINE
)


def parse_documented_gray_classes(markdown_text: str) -> set[str]:
    return {m.group(1) for m in DOCUMENTED_GRAY_ROW.finditer(markdown_text)}


def missing_gray_rows(used: set[str], documented: set[str]) -> list[str]:
    missing = sorted(used - documented)
    if not missing:
        return []
    return [
        "G1: docs/ui-ux-guidelines.md §12 灰階對照表缺列（掃到但表格沒有對應列）："
        + "、".join(f"`{c}`" for c in missing)
    ]


# ---------------------------------------------------------------------------
# Baseline 判定（四條，見 plan.md §2.4「判定」表）。
# ---------------------------------------------------------------------------


def evaluate(
    current: dict[str, dict[str, int]],
    baseline: dict[str, dict[str, int]],
    existing_paths: set[str],
) -> list[str]:
    """回傳所有判定為紅的訊息；空 list = 全綠。

    `current`：本次掃描「有命中」的檔案（稀疊，零命中的檔案不會出現）。
    `existing_paths`：本次掃描範圍內「檔案本身是否還存在」的完整集合——
    與 current 分開傳，才能分辨「命中歸零」（合法，S2 收斂的常態）跟
    「檔案被刪除/改名」（孤兒條目，P2-2）這兩種同樣會讓 current 沒有該路徑
    的情況。
    """
    problems: list[str] = []

    for path, base in sorted(baseline.items()):
        if path not in existing_paths:
            problems.append(
                f"{path}: 孤兒條目——baseline 有紀錄但檔案已不存在"
                "（刪除或 rename 後 baseline 要跟著更新；rename 時舊 key 要一併改名）"
            )
            continue
        cur = current.get(path, {"c1": 0, "c2": 0, "c3": 0})
        for rule in ("c1", "c2", "c3"):
            cur_n = cur.get(rule, 0)
            base_n = base.get(rule, 0)
            if cur_n > base_n:
                problems.append(f"{path}: {rule} 命中數 {cur_n} 超過 baseline {base_n}（新債）")
            elif cur_n < base_n:
                new_entry = json.dumps(
                    {"c1": cur.get("c1", 0), "c2": cur.get("c2", 0), "c3": cur.get("c3", 0)},
                    ensure_ascii=False,
                )
                problems.append(
                    f"{path}: {rule} 命中數 {cur_n} 低於 baseline {base_n}——棘輪只准收緊，"
                    f'把這行改成 "{path}": {new_entry}'
                )

    for path, cur in sorted(current.items()):
        if path not in baseline and any(cur.get(rule, 0) > 0 for rule in ("c1", "c2", "c3")):
            problems.append(f"{path}: 不在 baseline 的檔出現命中 {cur}（新債）")

    return problems


# ---------------------------------------------------------------------------
# 全 repo 掃描。
# ---------------------------------------------------------------------------


def scan_repo() -> tuple[dict[str, dict[str, int]], set[str], set[str]]:
    """回傳 (current 稀疊命中表, 本次掃描範圍內所有檔案的相對路徑集合,
    掃到的灰階 class 聯集)。

    業主裁決 Q3：掃描範圍含 `.test.*`——色不只住在 JSX 裡，測試檔也可能
    直接斷言 class string 或是回傳 class 的純函式。
    """
    current: dict[str, dict[str, int]] = {}
    existing: set[str] = set()
    grays: set[str] = set()
    files = sorted(SRC.rglob("*.ts")) + sorted(SRC.rglob("*.tsx"))
    for path in sorted(set(files)):
        rel = str(path.relative_to(ROOT))
        existing.add(rel)
        source = path.read_text(encoding="utf-8")
        hits = scan_source(source)
        counts = counts_of(hits)
        if any(counts.values()):
            current[rel] = counts
        grays |= gray_classes_used(source)
    return current, existing, grays


def load_baseline() -> dict[str, dict[str, int]]:
    if not BASELINE_PATH.exists():
        return {}
    return json.loads(BASELINE_PATH.read_text(encoding="utf-8"))


def scan() -> int:
    current, existing, used_gray = scan_repo()
    baseline = load_baseline()
    problems = evaluate(current, baseline, existing)

    guidelines_text = GUIDELINES_PATH.read_text(encoding="utf-8") if GUIDELINES_PATH.exists() else ""
    g1_problems = missing_gray_rows(used_gray, parse_documented_gray_classes(guidelines_text))

    ok = True
    if problems:
        ok = False
        print("check-color-usage 發現問題:")
        print("\n".join(f"  {p}" for p in problems))
        print(
            "\n修法:新增/超出的命中改用語義色 token（見 docs/ui-ux-guidelines.md §12）；"
            "\n收緊/孤兒的 baseline 項目照訊息把 scripts/color-usage-baseline.json 對應行改掉。"
            "\n刻意不提供 --update-baseline 與行內豁免——收緊要看得見改了什麼。"
        )
    if g1_problems:
        ok = False
        print("check-color-usage G1（灰階對照表完整性）發現問題:")
        print("\n".join(f"  {p}" for p in g1_problems))
        print("\n修法:在 docs/ui-ux-guidelines.md §12.2 的灰階對照表補上缺列的 class。")

    if not ok:
        return 1
    print(
        f"check-color-usage: OK（{len(current)} 個檔案有命中，全數在 baseline 內；"
        f"{len(used_gray)} 個灰階 class，對照表全數涵蓋）"
    )
    return 0


# ---------------------------------------------------------------------------
# --self-test 表格案例
# ---------------------------------------------------------------------------

# (標籤, 原始碼片段, 預期 {c1, c2, c3})
SCAN_CASES: list[tuple[str, str, dict[str, int]]] = [
    (
        "純 token 通過",
        '<div className="bg-success text-success-foreground border-success-border" />',
        {"c1": 0, "c2": 0, "c3": 0},
    ),
    (
        "text-blue-600 違規",
        '<span className="text-blue-600">A</span>',
        {"c1": 1, "c2": 0, "c3": 0},
    ),
    (
        "hover:/dark:/md: 變體被抓",
        '<button className="hover:bg-blue-600 dark:bg-blue-800 md:text-blue-500" />',
        {"c1": 3, "c2": 0, "c3": 0},
    ),
    (
        "裝飾漸層違規（bg-gradient-to-r + 兩個具名色停靠點）",
        '<div className="bg-gradient-to-r from-blue-500 to-purple-500" />',
        {"c1": 2, "c2": 1, "c3": 0},
    ),
    (
        "bg-linear-to-* 一樣算 C2（Tailwind v4 新寫法）",
        '<div className="bg-linear-to-b from-slate-50 to-slate-100" />',
        {"c1": 2, "c2": 1, "c3": 0},
    ),
    (
        "bg-[#16a34a] 任意值違規",
        '<div className="bg-[#16a34a]" />',
        {"c1": 0, "c2": 0, "c3": 1},
    ),
    (
        "text-[rgb(...)] 任意值違規",
        '<span className="text-[rgb(22,163,74)]" />',
        {"c1": 0, "c2": 0, "c3": 1},
    ),
    (
        ".ts 內 hex 字面值違規",
        "const GEN_AVATAR = { first: '#16a34a', second: '#7c3aed' };",
        {"c1": 0, "c2": 0, "c3": 2},
    ),
    (
        "3 位數簡寫 '#000' 也違規",
        "ctx.strokeStyle = '#000';",
        {"c1": 0, "c2": 0, "c3": 1},
    ),
    (
        "非色彩用途的 hex-like 字串不誤報（href 錨點）",
        '<a href="#a1b2c3">錨點</a>',
        {"c1": 0, "c2": 0, "c3": 0},
    ),
    (
        "JSX 屬性 href 用 JS 表達式包一層也不誤報",
        "<a href={'#a1b2c3'}>錨點</a>",
        {"c1": 0, "c2": 0, "c3": 0},
    ),
]

# baseline 判定案例：(標籤, current, baseline, existing_paths, 預期問題數)
EVAL_CASES: list[tuple[str, dict, dict, set[str], int]] = [
    (
        "baseline 內不報",
        {"a.tsx": {"c1": 2, "c2": 0, "c3": 0}},
        {"a.tsx": {"c1": 2, "c2": 0, "c3": 0}},
        {"a.tsx"},
        0,
    ),
    (
        "超出報",
        {"a.tsx": {"c1": 3, "c2": 0, "c3": 0}},
        {"a.tsx": {"c1": 2, "c2": 0, "c3": 0}},
        {"a.tsx"},
        1,
    ),
    (
        "低於報「請收緊」",
        {"a.tsx": {"c1": 1, "c2": 0, "c3": 0}},
        {"a.tsx": {"c1": 2, "c2": 0, "c3": 0}},
        {"a.tsx"},
        1,
    ),
    (
        "不在 baseline 的檔出現命中 → 新債",
        {"new.tsx": {"c1": 1, "c2": 0, "c3": 0}},
        {},
        {"new.tsx"},
        1,
    ),
    (
        "孤兒條目報（baseline 有但檔案已不存在）",
        {},
        {"deleted.tsx": {"c1": 1, "c2": 0, "c3": 0}},
        set(),
        1,
    ),
    (
        "命中歸零（S2 收斂完）不是孤兒，是「低於」——檔案仍存在",
        {},
        {"cleaned.tsx": {"c1": 1, "c2": 0, "c3": 0}},
        {"cleaned.tsx"},
        1,
    ),
    (
        "C1 減一、C2 加一，淨數不變仍各自報（依規則類型分列才抓得到，P2-7）",
        {"a.tsx": {"c1": 1, "c2": 1, "c3": 0}},
        {"a.tsx": {"c1": 2, "c2": 0, "c3": 0}},
        {"a.tsx"},
        2,
    ),
]

# G1 案例：(標籤, 掃到的灰階 class 集合, 文件裡的 markdown 表格片段, 預期問題數)
G1_CASES: list[tuple[str, set[str], str, int]] = [
    (
        "對照表涵蓋掃到的所有灰階 class → 無問題",
        {"gray-50", "gray-900"},
        "| 現況 class | 對照 token |\n|---|---|\n| `gray-50` | `--background` |\n"
        "| `gray-900` | `--foreground` |\n",
        0,
    ),
    (
        "對照表缺一列 → 報",
        {"gray-50", "gray-400"},
        "| 現況 class | 對照 token |\n|---|---|\n| `gray-50` | `--background` |\n",
        1,
    ),
    (
        "沒有掃到任何灰階 class → 無問題（不倒著要求表格是空的）",
        set(),
        "| 現況 class | 對照 token |\n|---|---|\n| `gray-50` | `--background` |\n",
        0,
    ),
]


def self_test() -> int:
    failures: list[str] = []

    for label, snippet, want in SCAN_CASES:
        got = counts_of(scan_source(snippet))
        if got != want:
            failures.append(f"  FAIL(scan): {label} — 預期 {want}，實得 {got}")

    for label, current, baseline, existing, want_n in EVAL_CASES:
        got = evaluate(current, baseline, existing)
        if len(got) != want_n:
            failures.append(
                f"  FAIL(evaluate): {label} — 預期 {want_n} 筆問題，實得 {len(got)}：{got}"
            )

    for label, used, markdown_text, want_n in G1_CASES:
        got = missing_gray_rows(used, parse_documented_gray_classes(markdown_text))
        if len(got) != want_n:
            failures.append(f"  FAIL(G1): {label} — 預期 {want_n} 筆問題，實得 {len(got)}：{got}")

    if failures:
        print("check-color-usage 表格案例未過:")
        print("\n".join(failures))
        return 1
    print(
        f"check-color-usage self-test: OK（{len(SCAN_CASES)} 條掃描案例 + "
        f"{len(EVAL_CASES)} 條判定案例 + {len(G1_CASES)} 條 G1 案例）"
    )
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else scan())
