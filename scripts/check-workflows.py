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


# ============================================================================
# 命名與結構規則(規則 2-7)——完整原則見 .claude/rules/github-actions.md
# ============================================================================

JOB_ID = re.compile(r"^  ([a-z][a-z0-9-]*):\s*$")
CJK = re.compile(r"[\u4e00-\u9fff]")
TITLE_CASE = re.compile(r"^[A-Z][A-Za-z0-9]*( [A-Z(][A-Za-z0-9)/-]*)*$")

# job id 不得只講「跑什麼工具」——工具會換,那一軌要證明的事不會
TOOL_NAMES = {
    "npm-audit", "biome", "eslint", "vitest", "jest", "pytest", "tsc",
    "deno", "playwright", "knip", "shellcheck", "actionlint",
}
# job id 不得是裸形容詞/裸動詞:branch protection 的 check 清單只看得到這串字
BARE_WORDS = {
    "static", "unit", "build", "test", "tests", "lint", "check", "deploy",
    "run", "verify", "e2e", "integration", "release", "publish",
}
# 這些 job id 進了 branch protection 的 required checks,改名要同步改保護規則
FROZEN_JOB_IDS = {"ci-ok"}

# 規則 9:required check 的名字不得被 push run 蓋章(2026-08-07 PR #236 事故)
#        required status check 的鍵是 (commit SHA, check-run 名稱),不綁
#        workflow run。晉升 PR 的 head SHA 就是 develop 的 tip,而那顆 SHA
#        早已被 push run 跑過並蓋上同名的綠 ci-ok。
PUSH_TRIGGER = re.compile(r"^\s+push\s*:\s*$", re.M)

# 規則 8b:schedule 觸發的偵測(縮排開頭的 `schedule:` 行;註解行有 # 前綴
# 不會命中)與頻率依據註記的存在檢查。
# 用固定標籤而不是關鍵字啟發式:標籤難以意外滿足、也難以意外違反,而且
# 自我說明——看到 `頻率依據:` 就知道下面那段在回答什麼問題。
SCHEDULE_TRIGGER = re.compile(r"^\s+schedule\s*:\s*$", re.M)
FREQUENCY_RATIONALE = re.compile(r"頻率依據")


def _jobs(text: str) -> list[tuple[str, str]]:
    """切出 (job_id, job 區塊文字)。純文字掃描,不 import yaml。"""
    lines = text.splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if l.rstrip() == "jobs:")
    except StopIteration:
        return []
    out: list[tuple[str, str]] = []
    cur_id: str | None = None
    cur: list[str] = []
    for line in lines[start + 1 :]:
        m = JOB_ID.match(line)
        if m:
            if cur_id:
                out.append((cur_id, "\n".join(cur)))
            cur_id, cur = m.group(1), []
            continue
        if cur_id is not None:
            cur.append(line)
    if cur_id:
        out.append((cur_id, "\n".join(cur)))
    return out


def naming_violations(text: str, filename: str = "<inline>") -> list[str]:
    """workflow 的命名與結構規則。純函式,無 I/O。"""
    found: list[str] = []

    # 規則 2:workflow name 是識別字(workflow_run 以名稱引用、也是 badge URL)
    #        → 英文 Title Case,不得含中文
    for line in text.splitlines():
        if line.startswith("name:"):
            wf = line.split(":", 1)[1].strip()
            if CJK.search(wf):
                found.append(f"workflow name {wf!r} 含中文——它是識別字(workflow_run 以名稱引用),須為英文 Title Case")
            elif not TITLE_CASE.match(wf):
                found.append(f"workflow name {wf!r} 不是 Title Case(每個字首大寫、不用標點)")
            break

    # 規則 3:禁止 workflow 層 permissions
    #        它是**上限**不是預設值,會讓需要更多權限的 job 越權而整個
    #        workflow 拒絕啟動(startup_failure,連 check run 都不建立)。
    for i, line in enumerate(text.splitlines()):
        if line.rstrip() == "permissions:" and not line.startswith(" "):
            found.append(
                "出現 workflow 層 permissions——它是上限而非預設值,"
                "需要 issues: write 之類的 job 會被判越權,整個 workflow 拒絕啟動。"
                "權限一律逐 job 宣告。"
            )
            break

    jobs = _jobs(text)
    for job_id, block in jobs:
        # 規則 4:job id 命名——kebab-case 名詞片語,不得是工具名或裸形容詞/動詞
        if job_id in TOOL_NAMES:
            found.append(f"job id {job_id!r} 是工具名——請改成「這一軌證明了什麼」(例:dependency-audit)")
        elif job_id in BARE_WORDS:
            found.append(f"job id {job_id!r} 是裸形容詞/動詞——branch protection 只顯示這串字,請用名詞片語(例:{job_id}-tests / {job_id}-checks)")

        is_reusable_call = any(l.strip().startswith("uses: ./") for l in block.splitlines())

        # 規則 5:每個 job 都要有 timeout-minutes(呼叫 reusable 的 job 不支援)
        if not is_reusable_call and "timeout-minutes:" not in block:
            found.append(f"job {job_id!r} 缺 timeout-minutes——沒有上限的 job 卡住就是燒滿 6 小時")

        # 規則 6:每個 step 都要有 name
        for bl in _steps(block):
            first = bl.splitlines()[0]
            if re.match(r"^\s*-\s+uses\s*:", first) or re.match(r"^\s*-\s+run\s*:", first):
                found.append(
                    f"job {job_id!r} 有無名 step({first.strip()[:50]})——"
                    "UI 會顯示成 'Run actions/xxx',與真正的閘門混在一起難以判讀"
                )

    # 規則 8b:帶 schedule 的 workflow 必須有「頻率依據」註記
    #        排程頻率是有後果的決定:太密浪費資源、太疏讓問題晚被發現,
    #        而「後果落在哪裡」逐個 workflow 不同(GitHub 分鐘、Supabase
    #        分支時數、外部 API 額度、訊號疲勞…)。依據要留在檔案裡,不是
    #        留在某次對話裡——下一個要改頻率的人只讀得到檔案。
    #        沿革:本檢查原本要求的是「費用註記」,依據是私有 repo 每 job
    #        進位計費(2026-08-07 分鐘數用罄事故);同日 repo 轉為 public、
    #        標準 runner 不再計費,該框架失效而**要求本身仍然成立**,
    #        故泛化為頻率依據。
    if SCHEDULE_TRIGGER.search(text) and not FREQUENCY_RATIONALE.search(text):
        found.append(
            "workflow 帶 schedule 觸發但沒有「頻率依據」註記——排程頻率是"
            "有後果的決定(太密浪費資源、太疏讓問題晚被發現),請在檔頭註解"
            "寫明「頻率依據:<為什麼是這個頻率>」,並點出成本落在哪裡"
            "(GitHub 分鐘 / Supabase 分支 / 外部額度 / 訊號疲勞…)。"
        )

    # 規則 7:ci.yml 的 ci-ok 必須 needs 全部其他 job
    #        漏一個 = 那一軌不擋合併(2026-07-25 PR #109 就是這樣被 auto-merge 掉的)
    if filename.endswith("ci.yml") and any(j == "ci-ok" for j, _ in jobs):
        ci_ok_block = next(b for j, b in jobs if j == "ci-ok")
        declared = {
            l.strip().lstrip("- ").strip()
            for l in ci_ok_block.splitlines()
            if re.match(r"^\s+-\s+[a-z][a-z0-9-]*\s*$", l)
        }
        others = {j for j, _ in jobs if j != "ci-ok"}
        missing = others - declared
        if missing:
            found.append(
                f"ci-ok 的 needs 漏了 {sorted(missing)}——那幾軌紅了也不會擋合併。"
                "ci-ok 是唯一的 required check,新增 job 必須同步進它的 needs。"
            )

        # 規則 9:ci.yml 同時有 push 觸發時,ci-ok 的 check-run 名稱必須依事件區隔
        #        否則 push run 會在同一顆 SHA 上蓋出一顆同名的綠 ci-ok,而晉升
        #        PR 的 head 正是 develop 的 tip——綠章早在 PR 開啟前就在了,
        #        required check 從頭到尾沒有東西可以擋(PR #236)。
        if PUSH_TRIGGER.search(text):
            name_line = next(
                (l for l in ci_ok_block.splitlines() if re.match(r"^\s+name\s*:", l)), None
            )
            if name_line is None or "pull_request" not in name_line:
                found.append(
                    "ci.yml 有 push: 觸發,但 ci-ok 沒有依事件區隔的 name:——"
                    "push run 會在同一顆 SHA 上蓋出同名的綠 ci-ok,而晉升 PR 的 head "
                    "就是 develop 的 tip,綠章早在 PR 開啟前就在了,required check "
                    "永遠不會 pending。修法:name: ${{ github.event_name == "
                    "'pull_request' && 'ci-ok' || 'ci-ok-push' }}"
                )

        # 規則 10:ci-ok 必須把「晉升 PR 的 journey-full 不得 skipped」寫進匯總
        #         skipped 算通過是為純文件 PR 設計的,但套在 journey-full 上等於
        #         「上線前唯一的真後端閘門沒跑也算過」。這條防它被重構靜默刪掉。
        #         只在真的有 journey-full 這一軌時才適用——沒有那一軌就沒有這個
        #         閘門要保護。比對不分大小寫:表達式寫 github.base_ref、env 名寫
        #         BASE_REF,兩種都算數。
        lowered = ci_ok_block.lower()
        has_journey_job = any(j == "journey-full" for j, _ in jobs)
        if has_journey_job and ("base_ref" not in lowered or "journey-full" not in lowered):
            found.append(
                "ci-ok 的匯總沒有針對晉升 PR 檢查 journey-full——ci-ok 把 skipped "
                "算通過(純文件 PR 需要),套在 journey-full 上就是「上線前唯一的"
                "真後端閘門沒跑也算過」。修法:在匯總 step 加上 base_ref == 'main' "
                "時 needs['journey-full'].result 必須為 success。"
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

    for label, snippet, fname, want in NAMING_CASES:
        got = len(naming_violations(snippet, fname))
        if got != want:
            failures.append(f"  FAIL: {label} — 預期 {want} 筆違規,實得 {got}")

    if failures:
        print("check-workflows 表格案例未過:")
        print("\n".join(failures))
        return 1
    print(f"check-workflows self-test: OK（{len(CASES) + len(NAMING_CASES)} 條案例）")
    return 0


def scan() -> int:
    if not WORKFLOW_DIR.is_dir():
        return 0  # 沒有 workflow 目錄視為通過

    fail = 0
    for path in sorted(WORKFLOW_DIR.glob("*.yml")) + sorted(WORKFLOW_DIR.glob("*.yaml")):
        text = path.read_text(encoding="utf-8")
        for msg in list(violations(text)) + naming_violations(text, path.name):
            print(f"FAIL: {path.relative_to(ROOT)}: {msg}")
            fail = 1

    if fail == 0:
        print("check-workflows: OK")
    return fail



# --- 命名規則的表格案例:每筆是 (標籤, workflow 片段, 檔名, 預期違規數) ---
NAMING_CASES: list[tuple[str, str, str, int]] = [
    ("workflow name 含中文 → 違規", "name: 持續整合\njobs:\n", "x.yml", 1),
    ("workflow name 非 Title Case → 違規", "name: ci pipeline\njobs:\n", "x.yml", 1),
    ("workflow name Title Case → 通過", "name: Security Audit\njobs:\n", "x.yml", 0),
    (
        "workflow 層 permissions → 違規(PR #114:整個 workflow 拒絕啟動)",
        "name: CI\npermissions:\n  contents: read\njobs:\n",
        "x.yml",
        1,
    ),
    (
        "job id 是工具名 → 違規",
        "name: CI\njobs:\n  npm-audit:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n",
        "x.yml",
        1,
    ),
    (
        "job id 是裸形容詞 → 違規",
        "name: CI\njobs:\n  static:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n",
        "x.yml",
        1,
    ),
    (
        "job id 是名詞片語 → 通過",
        "name: CI\njobs:\n  static-checks:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n",
        "x.yml",
        0,
    ),
    (
        "job 缺 timeout-minutes → 違規",
        "name: CI\njobs:\n  static-checks:\n    steps:\n      - name: a\n        run: b\n",
        "x.yml",
        1,
    ),
    (
        "無名 step → 違規",
        "name: CI\njobs:\n  static-checks:\n    timeout-minutes: 5\n    steps:\n      - uses: actions/checkout@v4\n",
        "x.yml",
        1,
    ),
    (
        "ci-ok 漏掉某一軌 → 違規(PR #109 的事故形態)",
        (
            "name: CI\njobs:\n"
            "  unit-tests:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n"
            "  e2e-tests:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n"
            "  ci-ok:\n    timeout-minutes: 5\n    needs:\n      - unit-tests\n"
            "    steps:\n      - name: a\n        run: b\n"
        ),
        "ci.yml",
        1,
    ),
    (
        "ci-ok needs 完整 → 通過",
        (
            "name: CI\njobs:\n"
            "  unit-tests:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n"
            "  e2e-tests:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n"
            "  ci-ok:\n    timeout-minutes: 5\n    needs:\n      - unit-tests\n      - e2e-tests\n"
            "    steps:\n      - name: a\n        run: b\n"
        ),
        "ci.yml",
        0,
    ),
    (
        "schedule 觸發但無頻率依據註記 → 違規",
        (
            "name: Nightly Sweep\n"
            "on:\n  schedule:\n    - cron: '0 18 * * *'\njobs:\n"
            "  data-sweep:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n"
        ),
        "x.yml",
        1,
    ),
    (
        "schedule 觸發且有頻率依據註記 → 通過",
        (
            "name: Nightly Sweep\n"
            "# 頻率依據:每天一次。掃出來的東西要人接手,日級節奏接得住;\n"
            "# 成本落在下游 API 額度而不是 runner。\n"
            "on:\n  schedule:\n    - cron: '0 18 * * *'\njobs:\n"
            "  data-sweep:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n"
        ),
        "x.yml",
        0,
    ),
    (
        "只寫費用註記、沒寫頻率依據 → 違規(2026-08-07 轉 public 後,"
        "光講計費分鐘不再是有效依據)",
        (
            "name: Nightly Sweep\n"
            "# 費用:每天 1 次 × 1 分 ≈ 30 分/月。\n"
            "on:\n  schedule:\n    - cron: '0 18 * * *'\njobs:\n"
            "  data-sweep:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n"
        ),
        "x.yml",
        1,
    ),
    (
        "無 schedule 的 workflow 不要求頻率依據註記 → 通過",
        (
            "name: CI\n"
            "on:\n  pull_request:\n    branches: [develop]\njobs:\n"
            "  unit-tests:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n"
        ),
        "x.yml",
        0,
    ),
    # --- 規則 9／10:PR #236 的事故形態 ---
    (
        "ci.yml 有 push 觸發但 ci-ok 無事件區隔 name → 違規(PR #236 的事故形態)",
        (
            "name: CI\n"
            "on:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\njobs:\n"
            "  journey-full:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n"
            "  ci-ok:\n    timeout-minutes: 5\n    needs:\n      - journey-full\n"
            "    steps:\n      - name: a\n        run: |\n"
            "          [ \"$BASE_REF\" = main ] && echo journey-full\n"
        ),
        "ci.yml",
        1,
    ),
    (
        "ci.yml 有 push 觸發且 ci-ok 有事件區隔 name → 通過",
        (
            "name: CI\n"
            "on:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\njobs:\n"
            "  journey-full:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n"
            "  ci-ok:\n"
            "    name: ${{ github.event_name == 'pull_request' && 'ci-ok' || 'ci-ok-push' }}\n"
            "    timeout-minutes: 5\n    needs:\n      - journey-full\n"
            "    steps:\n      - name: a\n        run: |\n"
            "          [ \"$BASE_REF\" = main ] && echo journey-full\n"
        ),
        "ci.yml",
        0,
    ),
    (
        "ci.yml 無 push 觸發 → 不要求事件區隔 name（規則 9 不適用）",
        (
            "name: CI\n"
            "on:\n  pull_request:\n    branches: [main]\njobs:\n"
            "  journey-full:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n"
            "  ci-ok:\n    timeout-minutes: 5\n    needs:\n      - journey-full\n"
            "    steps:\n      - name: a\n        run: |\n"
            "          [ \"$BASE_REF\" = main ] && echo journey-full\n"
        ),
        "ci.yml",
        0,
    ),
    (
        "ci-ok 沒有晉升 PR 的 journey-full 強制條款 → 違規(規則 10)",
        (
            "name: CI\n"
            "on:\n  pull_request:\n    branches: [main]\njobs:\n"
            "  journey-full:\n    timeout-minutes: 5\n    steps:\n      - name: a\n        run: b\n"
            "  ci-ok:\n    timeout-minutes: 5\n    needs:\n      - journey-full\n"
            "    steps:\n      - name: a\n        run: echo ok\n"
        ),
        "ci.yml",
        1,
    ),
]

if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else scan())
