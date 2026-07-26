#!/usr/bin/env python3
"""PreToolUse hook(Bash):擋五種確定性後門。

這些不是「風格偏好」而是框架的完整性條件:
1. git commit --no-verify——繞過 pre-commit 閘門(閘門存在的意義歸零)
2. git push --force / -f——改寫共享歷史(--force-with-lease 除外)
3. 直接 push main/develop——git-flow 的底線:main/develop 只吃 PR,
   不吃直推(branch protection 是第二道,這裡是即刻生效的第一道)
4. 本機跑 journey 套件——打真 Supabase 分支、產真資料、耗分支費用
   (離線的 pytest tools/ 與 --collect-only 不擋)
5. 新分支未以最新 develop 為 base——git checkout -b / switch -c 沒指定
   start-point 時預設繼承目前 HEAD,HEAD 若不是最新 develop,新分支就悄悄
   長歪(2026-07-25 friction-log:本專案的 claude.ai/code web session 就因
   GitHub repo 的 default branch 設成 main,一開局直接從 main 開分支,整個
   session 看不到 .claude/ 框架與 CLAUDE.md)。顯式指定 main 為 start-point
   同樣擋——git-flow 規定 feature/fix 一律從 develop 切出。

決策邏輯放在純函式 decide() 裡,好讓 scripts/test-hooks.py 用表格案例
直接驗行為。第 5 項需要「HEAD 是否等於 origin/develop」這個事實,由
main() 用本地(不觸發 fetch)的 git rev-parse 取得後,以現成的布林值傳入
decide()——decide() 本身仍是純函式,不自己做 I/O(與 tdd-test-guard.py
的 lock_exists 同慣例)。
"""

import json
import re
import subprocess
import sys

PROTECTED_BRANCHES = ("main", "develop")

BRANCH_CREATE = re.compile(r"\bgit\b[^\n|;&]*\b(?:checkout\s+-b|switch\s+-c)\b(?P<rest>[^\n|;&]*)")

# deny 理由上提成具名常數,decide() 回傳常數本身,main() 據此查出 rule id 記錄。
# 本檔是五個 hook 裡唯一有多條規則的,不分辨 rule 的話「bash-guard 擋了 40 次」
# 這個讀數沒有可行動性——擋的是 --no-verify 還是誤判了分支 base,處置完全不同。
REASON_NO_VERIFY = (
    "git commit --no-verify 會繞過 pre-commit 閘門。commit 被擋代表 check 紅,"
    "修到綠再提交;紅燈測試 commit 走 .claude/tdd-lock 紅燈通道(見 CLAUDE.md)。"
)
REASON_FORCE_PUSH = (
    "git push --force 會改寫共享歷史。需要安全強推時用 --force-with-lease,並先說明原因。"
)
REASON_PROTECTED_BRANCH = (
    "git-flow:main/develop 只接受 PR 合併,不接受直接 push。"
    "請推 feature/fix 分支並開 PR(feature → develop;晉升 → main,"
    "見 CLAUDE.md 晉升 SOP)。"
)
REASON_LOCAL_JOURNEY = (
    "journey 套件打真 Supabase 分支,絕不在本機跑(見 .claude/rules/e2e-tests.md)。"
    "它只在 journey-nightly workflow 執行;本機可跑的只有 "
    "`cd e2e/journey && pytest tools/ -q` 與 `pytest --collect-only -q`。"
)
REASON_BASE_MAIN = (
    "新分支不得以 main 為 base。git-flow:feature/fix 一律從 develop 切出,"
    "PR 回 develop(見 CLAUDE.md)。改用 "
    "`git fetch origin develop && git checkout -b <name> origin/develop`。"
)
REASON_BASE_STALE = (
    "目前 HEAD 不是最新的 origin/develop,沒指定 start-point 的新分支會直接"
    "繼承這個錯的 base(git-flow:feature/fix 一律從 develop 切出,見 CLAUDE.md)。"
    "先 `git fetch origin develop && git checkout develop && git pull`"
    " 再切分支,或明確指定 `git checkout -b <name> origin/develop`。"
)

RULE_IDS = {
    REASON_NO_VERIFY: "no-verify",
    REASON_FORCE_PUSH: "force-push",
    REASON_PROTECTED_BRANCH: "protected-branch",
    REASON_LOCAL_JOURNEY: "local-journey",
    REASON_BASE_MAIN: "base-main",
    REASON_BASE_STALE: "base-stale",
}


def _branch_create_start_point(cmd: str) -> tuple[str, str | None] | None:
    """解析建分支指令,回傳 (新分支名, 顯式 start-point 或 None)。

    非「建立分支」的指令(純切換分支、列出、刪除、改名)回傳 None——
    刻意只認 checkout -b / switch -c 這兩個沒有歧義的建立語法,不碰
    `git branch <name>`:-d/-D/-m/-M/-c/-C 等旗標都可能讓 `git branch`
    帶一個看似分支名的參數卻不是在建立分支,誤判會擋到正常的刪除/改名。
    """
    m = BRANCH_CREATE.search(cmd)
    if not m:
        return None
    tokens = [t for t in m.group("rest").split() if not t.startswith("-")]
    if not tokens:
        return None
    name = tokens[0]
    start_point = tokens[1] if len(tokens) > 1 else None
    return name, start_point


def decide(cmd: str, head_matches_develop: bool | None = None) -> str | None:
    """回傳 deny 理由,或 None 表示放行。

    head_matches_develop:目前 HEAD 是否等於 origin/develop 的 tip,由呼叫
    方預先量測後傳入(None = 量不到,如沒有 origin/develop 時一律放行——
    guard 壞掉不該把人鎖死)。只有第 5 類檢查會用到這個參數。
    """
    if re.search(r"\bgit\b[^\n|;&]*\bcommit\b", cmd) and "--no-verify" in cmd:
        return REASON_NO_VERIFY

    push = re.search(r"\bgit\b[^\n|;&]*\bpush\b(?P<rest>[^\n|;&]*)", cmd)
    if push:
        rest = push.group("rest")
        if re.search(r"(\s--force(\s|$)|\s-f(\s|$))", rest + " "):
            return REASON_FORCE_PUSH
        for token in rest.split():
            if token.startswith("-"):
                continue
            dest = token.split(":")[-1] if ":" in token else token
            if dest.removeprefix("refs/heads/") in PROTECTED_BRANCHES:
                return REASON_PROTECTED_BRANCH

    if re.search(r"\bpytest\b", cmd) and "journey" in cmd:
        if "tools/" not in cmd and "--collect-only" not in cmd:
            return REASON_LOCAL_JOURNEY

    branch_create = _branch_create_start_point(cmd)
    if branch_create is not None:
        _name, start_point = branch_create
        if start_point:
            if start_point.removeprefix("origin/") == "main":
                return REASON_BASE_MAIN
        elif head_matches_develop is False:
            return REASON_BASE_STALE

    return None


def _head_matches_develop() -> bool | None:
    """本地(不 fetch)比對 HEAD 與 origin/develop 快取的 tip。量不到就回 None。"""
    try:
        head = subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, timeout=5
        )
        develop = subprocess.run(
            ["git", "rev-parse", "origin/develop"], capture_output=True, text=True, timeout=5
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if head.returncode != 0 or develop.returncode != 0:
        return None
    return head.stdout.strip() == develop.stdout.strip()


def _record(rule: str | None) -> None:
    """記一次決策給 harness 感測器。感測器故障不得影響閘門,所以整段吞例外。

    刻意在 main() 期間才 import(而不是模組層):本檔會被 check-output-filter
    與 scripts/test-hooks.py 以 exec_module 載入,模組層 import 會讓記錄器跟著
    被拉進那些情境。它們只呼叫 decide() 不呼叫 main(),所以這裡是安全的邊界。
    """
    try:
        import decision_log

        decision_log.record("bash-guard", rule)
    except Exception:  # noqa: BLE001 — 量測的優先序永遠低於工作
        return


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return

    cmd = str(payload.get("tool_input", {}).get("command", ""))
    # 只有指令文字看起來像建分支時才付 git rev-parse 的 I/O 成本——
    # bash-guard 掛在每一次 Bash 呼叫上,不能讓其餘 99% 的指令(commit、
    # npm test……)平白多兩個 subprocess。
    head_matches_develop = _head_matches_develop() if BRANCH_CREATE.search(cmd) else None

    reason = decide(cmd, head_matches_develop)
    _record(RULE_IDS.get(reason) if reason else None)

    if reason:
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": reason,
                    }
                },
                ensure_ascii=False,
            )
        )


if __name__ == "__main__":
    main()
