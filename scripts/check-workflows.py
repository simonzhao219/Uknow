#!/usr/bin/env python3
"""CI workflow 設定的機械檢查——目前只驗一條規則。

存在理由(2026-07-25 bug 的防線回填):`.github/workflows/` 是 YAML 設定,
既有閘門對它只有「GitHub 願不願意跑」這一層——語意錯誤(設定寫了但不生效)
沒有任何一層會紅。那次的 bug 正是這樣漏網的:`changes` job 的負向 pattern
從加入起就沒作用,而 CI 全綠、沒有任何訊號。

規則 1:dorny/paths-filter 的負向 pattern 必須搭 predicate-quantifier: every
  該 action 的 predicate-quantifier 預設是 `some`——語意是「檔案符合**任一**
  pattern 即視為命中」。於是 `- '**'` 這種全域 pattern 一旦存在,後面的
  `- '!docs/**'` 永遠不會被考慮,filter 對任何變更都回 true。要讓負向排除
  生效,必須明確設 `predicate-quantifier: every`(要求所有 pattern 都成立)。
  這是 dorny 官方文件記載的 exclusion 慣用法。

決策邏輯放在純函式 violations() 裡,好讓表格案例直接驗行為(與 .claude/hooks/
的 decide() 同慣例)。刻意用純文字掃描而不 import yaml——framework-check 的
契約是免依賴安裝,不能假設 runner 上有 PyYAML。

跑法:
  python3 scripts/check-workflows.py              掃 .github/workflows/*.yml
  python3 scripts/check-workflows.py --self-test  跑表格案例(驗檢查器自己)
framework-check.sh 會依序呼叫兩者。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_DIR = ROOT / ".github" / "workflows"

# step 的起點:`- uses:` 或 `- name:`
STEP_START = re.compile(r"^(\s*)-\s+(uses|name)\s*:")
# 負向 pattern:list item 的值以 ! 開頭(引號可有可無)
NEGATED = re.compile(r"""^\s*-\s*['"]?!""")
QUANTIFIER = re.compile(r"""^\s*predicate-quantifier\s*:\s*['"]?([A-Za-z]+)""")


def _steps(text: str) -> list[str]:
    """把 workflow 文字切成 step 區塊。

    區塊自 `- uses:`/`- name:` 起,止於下一個同縮排的 step 或任何縮排更淺的
    非空行(job 邊界)——不切 job 邊界會把下一個 job 的內容誤算進來。
    """
    lines = text.splitlines()
    blocks: list[str] = []
    current: list[str] | None = None
    indent = 0

    for line in lines:
        m = STEP_START.match(line)
        if m:
            if current is not None:
                blocks.append("\n".join(current))
            current, indent = [line], len(m.group(1))
            continue
        if current is not None:
            stripped = line.strip()
            if stripped and (len(line) - len(line.lstrip())) < indent:
                blocks.append("\n".join(current))
                current = None
                continue
            current.append(line)

    if current is not None:
        blocks.append("\n".join(current))
    return blocks


def violations(text: str) -> list[str]:
    """回傳違規訊息清單(空 list 表示通過)。純函式,無 I/O。"""
    found: list[str] = []

    for block in _steps(text):
        if "dorny/paths-filter" not in block:
            continue

        negated = [ln.strip() for ln in block.splitlines() if NEGATED.match(ln)]
        if not negated:
            continue  # 沒用負向 pattern,quantifier 不影響結果

        quantifier = None
        for ln in block.splitlines():
            m = QUANTIFIER.match(ln)
            if m:
                quantifier = m.group(1)

        if quantifier != "every":
            actual = f"predicate-quantifier: {quantifier}" if quantifier else "未設(預設 some)"
            found.append(
                f"dorny/paths-filter 用了負向 pattern({', '.join(negated)})但 {actual}"
                "——預設的 some 語意是「符合任一 pattern 即命中」,全域 pattern"
                "(如 '**')會先成立,負向排除永遠不被考慮、filter 對任何變更都回"
                " true。修法:在同一個 with: 下加 predicate-quantifier: every。"
            )

    return found


# --- 表格案例:每筆是 (標籤, workflow 片段, 預期違規數) ---
CASES: list[tuple[str, str, int]] = [
    (
        "負向 pattern + 未設 quantifier → 違規（本次 bug 的形態）",
        """
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            code:
              - '**'
              - '!docs/**'
""",
        1,
    ),
    (
        "負向 pattern + predicate-quantifier: every → 通過",
        """
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          predicate-quantifier: every
          filters: |
            code:
              - '**'
              - '!docs/**'
""",
        0,
    ),
    (
        "負向 pattern + 明確寫 some → 仍違規（明確寫錯也要擋）",
        """
      - uses: dorny/paths-filter@v3
        with:
          predicate-quantifier: 'some'
          filters: |
            code:
              - '**'
              - '!docs/**'
""",
        1,
    ),
    (
        "無負向 pattern → 通過（quantifier 不影響結果）",
        """
      - uses: dorny/paths-filter@v3
        with:
          filters: |
            code:
              - 'src/**'
""",
        0,
    ),
    (
        "不含 paths-filter 的 step → 通過",
        """
      - uses: actions/checkout@v4
      - run: npm ci
""",
        0,
    ),
    (
        "負向 pattern 屬於下一個 job 的 paths-filter，不可跨 job 誤判",
        """
  changes:
    steps:
      - uses: dorny/paths-filter@v3
        with:
          predicate-quantifier: every
          filters: |
            code:
              - '**'
              - '!docs/**'

  build:
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
""",
        0,
    ),
]


def self_test() -> int:
    failures: list[str] = []
    for label, snippet, want in CASES:
        got = len(violations(snippet))
        if got != want:
            failures.append(f"  FAIL: {label} — 預期 {want} 筆違規,實得 {got}")

    if failures:
        print("check-workflows 表格案例未過:")
        print("\n".join(failures))
        return 1
    print(f"check-workflows self-test: OK（{len(CASES)} 條案例）")
    return 0


def scan() -> int:
    if not WORKFLOW_DIR.is_dir():
        return 0  # 沒有 workflow 目錄視為通過

    fail = 0
    for path in sorted(WORKFLOW_DIR.glob("*.yml")) + sorted(WORKFLOW_DIR.glob("*.yaml")):
        for msg in violations(path.read_text(encoding="utf-8")):
            print(f"FAIL: {path.relative_to(ROOT)}: {msg}")
            fail = 1

    if fail == 0:
        print("check-workflows: OK")
    return fail


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else scan())
