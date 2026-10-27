#!/usr/bin/env python3
"""CI 的 Playwright Docker image 版本與 pip pin 一致性的機械檢查。

存在理由(2026-10-27):e2e-tests 改跑在官方 image
`mcr.microsoft.com/playwright/python:v<X>-noble` 裡,把每次 9 分多鐘的
`playwright install --with-deps`(apt 裝系統函式庫與字型)換成 image 拉取。
代價是出現了**兩處必須相等的版本號**:

  - workflow 的 image tag —— 決定 /ms-playwright 裡烤了哪一版 Chromium build
  - e2e/requirements.txt 的 `playwright==<X>` —— 決定 pip 裝的套件去找哪一版 build

兩者不等時的症狀是 pytest 一起跑就 "Executable doesn't exist",而且**只在
CI 出現**(本機沒有 image,各自 `playwright install` 永遠自洽)。升級
playwright 時改了 pin 忘了 tag、或反過來,都會中。這支檢查器把「兩處同步」
從註解提醒變成閘門。

規則:

  P1 每個宣告 playwright image 的 workflow,其 tag 版本必須等於
     e2e/requirements.txt 的 `playwright==` pin。
  P2 有 workflow 用了 playwright image 時,e2e/requirements.txt 必須有
     **精確** pin(`playwright==X.Y.Z`)——開區間(`>=`)會靜默漂到 image
     沒有的 Chromium build。
  P3 image tag 必須是 `v<X.Y.Z>-noble` 這種帶明確版本與 distro 的形式——
     `latest`、純 `v1.56.0`(distro 隨官方預設漂移)都擋。

決策邏輯放在純函式裡,好讓表格案例直接驗行為(與 check-workflows.py、
check-migration-versions.py 同慣例)。刻意不 import 第三方套件——
framework-check 的契約是免依賴安裝。

跑法:
  python3 scripts/check-playwright-image.py              掃 .github/workflows/ 與 e2e/requirements.txt
  python3 scripts/check-playwright-image.py --self-test  跑表格案例(驗檢查器自己)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS_DIR = ROOT / ".github" / "workflows"
REQUIREMENTS = ROOT / "e2e" / "requirements.txt"

# 只看未被註解的 image 行;tag 整段抓起來,格式交給 P3 判。
IMAGE_LINE = re.compile(
    r"^\s*(?:-\s*)?image:\s*['\"]?mcr\.microsoft\.com/playwright/python:([^\s'\"#]+)",
    re.MULTILINE,
)
STRICT_TAG = re.compile(r"^v(\d+\.\d+\.\d+)-noble$")
EXACT_PIN = re.compile(r"^\s*playwright\s*==\s*(\d+\.\d+\.\d+)\s*(?:#.*)?$", re.MULTILINE)
ANY_PIN = re.compile(r"^\s*playwright\s*[<>=!~]", re.MULTILINE)


def image_tags(workflow_text: str) -> list[str]:
    """抽出 workflow 內所有 playwright python image 的 tag(忽略註解行)。"""
    tags: list[str] = []
    for line in workflow_text.splitlines():
        if line.lstrip().startswith("#"):
            continue
        match = IMAGE_LINE.match(line)
        if match:
            tags.append(match.group(1))
    return tags


def pinned_version(requirements_text: str) -> str | None:
    """requirements.txt 內 `playwright==X.Y.Z` 的 X.Y.Z;沒有精確 pin 回 None。"""
    match = EXACT_PIN.search(requirements_text)
    return match.group(1) if match else None


def check(workflows: dict[str, str], requirements_text: str) -> list[str]:
    """回傳違規訊息清單。純函式,無 I/O。

    workflows:{檔名: 內容}。沒有任何 workflow 用 image 時不做任何要求——
    這支檢查器只在「兩處版本號同時存在」時才有事可管。
    """
    violations: list[str] = []
    found = {name: image_tags(text) for name, text in workflows.items()}
    if not any(found.values()):
        return violations

    pin = pinned_version(requirements_text)
    if pin is None:
        hint = "開區間會靜默漂到 image 沒有的 Chromium build" if ANY_PIN.search(requirements_text) else "完全沒有 pin"
        violations.append(
            f"P2 e2e/requirements.txt 沒有精確 pin `playwright==X.Y.Z`({hint});"
            "有 workflow 跑在 playwright image 裡時,pip 版本必須與 image tag 綁死"
        )

    for name, tags in sorted(found.items()):
        for tag in tags:
            strict = STRICT_TAG.match(tag)
            if strict is None:
                violations.append(
                    f"P3 {name} 的 image tag `{tag}` 不是 `v<X.Y.Z>-noble` 形式"
                    "(latest / 無 distro 後綴都會隨官方預設漂移)"
                )
                continue
            if pin is not None and strict.group(1) != pin:
                violations.append(
                    f"P1 {name} 的 image 版本 {strict.group(1)} ≠ e2e/requirements.txt 的 "
                    f"playwright=={pin}(pip 裝的 playwright 會去 /ms-playwright 找它那一版的"
                    " Chromium build,找不到就是 \"Executable doesn't exist\")"
                )
    return violations


# --- 表格案例:每筆是 (標籤, workflows, requirements, 預期違規前綴清單) ---
GOOD_WF = "jobs:\n  e2e-tests:\n    container:\n      image: mcr.microsoft.com/playwright/python:v1.56.0-noble\n"
GOOD_REQ = "pytest>=8.0\nplaywright==1.56.0\n"
CASES: list[tuple[str, dict[str, str], str, list[str]]] = [
    ("tag 與 pin 一致 → 通過", {"ci.yml": GOOD_WF}, GOOD_REQ, []),
    (
        "tag 1.57 pin 1.56 → P1",
        {"ci.yml": GOOD_WF.replace("1.56.0", "1.57.0")},
        GOOD_REQ,
        ["P1"],
    ),
    (
        "pin 升了 tag 沒升 → P1",
        {"ci.yml": GOOD_WF},
        GOOD_REQ.replace("1.56.0", "1.57.0"),
        ["P1"],
    ),
    ("開區間 pin → P2", {"ci.yml": GOOD_WF}, "playwright>=1.56\n", ["P2"]),
    ("完全沒 pin → P2", {"ci.yml": GOOD_WF}, "pytest>=8.0\n", ["P2"]),
    (
        "tag 是 latest → P3",
        {"ci.yml": GOOD_WF.replace("v1.56.0-noble", "latest")},
        GOOD_REQ,
        ["P3"],
    ),
    (
        "tag 缺 distro 後綴 → P3",
        {"ci.yml": GOOD_WF.replace("v1.56.0-noble", "v1.56.0")},
        GOOD_REQ,
        ["P3"],
    ),
    (
        "兩個 workflow 一個對一個錯 → 只報錯的那個",
        {"ci.yml": GOOD_WF, "journey.yml": GOOD_WF.replace("1.56.0", "1.55.0")},
        GOOD_REQ,
        ["P1"],
    ),
    (
        "image 行被註解掉 → 不算使用,通過",
        {"ci.yml": GOOD_WF.replace("      image:", "      # image:")},
        "playwright>=1.56\n",
        [],
    ),
    ("沒有任何 workflow 用 image → 不要求 pin", {"ci.yml": "jobs: {}\n"}, "playwright>=1.56\n", []),
    (
        "pin 行帶尾註解 → 仍算精確 pin",
        {"ci.yml": GOOD_WF},
        "playwright==1.56.0  # bundles chromium 1194\n",
        [],
    ),
]


def self_test() -> int:
    failed = 0
    for label, workflows, requirements, expected in CASES:
        got = check(workflows, requirements)
        prefixes = [v.split(" ", 1)[0] for v in got]
        if prefixes != expected:
            failed += 1
            print(f"FAIL [{label}] 預期 {expected},實得 {prefixes}")
            for v in got:
                print(f"       {v}")
    if failed:
        print(f"self-test:{failed}/{len(CASES)} 案例失敗")
        return 1
    print(f"self-test:{len(CASES)} 案例全過")
    return 0


def scan() -> int:
    workflows = {
        p.name: p.read_text(encoding="utf-8")
        for p in sorted(WORKFLOWS_DIR.glob("*.yml"))
        if p.is_file()
    }
    requirements = REQUIREMENTS.read_text(encoding="utf-8") if REQUIREMENTS.exists() else ""
    violations = check(workflows, requirements)
    if violations:
        print("Playwright image 版本檢查未過:")
        for v in violations:
            print(f"  - {v}")
        return 1
    used = sum(len(image_tags(t)) for t in workflows.values())
    print(f"Playwright image 版本檢查通過({used} 處 image 宣告,pin={pinned_version(requirements)})")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else scan())
