#!/usr/bin/env python3
"""PreToolUse hook(Bash):擋四種確定性後門。

這些不是「風格偏好」而是框架的完整性條件:
1. git commit --no-verify——繞過 pre-commit 閘門(閘門存在的意義歸零)
2. git push --force / -f——改寫共享歷史(--force-with-lease 除外)
3. 直接 push main/develop——git-flow 的底線:main/develop 只吃 PR,
   不吃直推(branch protection 是第二道,這裡是即刻生效的第一道)
4. 本機跑 journey 套件——打真 Supabase 分支、產真資料、耗分支費用
   (離線的 pytest tools/ 與 --collect-only 不擋)

決策邏輯放在純函式 decide() 裡,好讓 scripts/test-hooks.py 用表格案例
直接驗行為。
"""

import json
import re
import sys

PROTECTED_BRANCHES = ("main", "develop")


def decide(cmd: str) -> str | None:
    """回傳 deny 理由,或 None 表示放行。純函式,無 I/O。"""
    if re.search(r"\bgit\b[^\n|;&]*\bcommit\b", cmd) and "--no-verify" in cmd:
        return (
            "git commit --no-verify 會繞過 pre-commit 閘門。commit 被擋代表 check 紅,"
            "修到綠再提交;紅燈測試 commit 走 .claude/tdd-lock 紅燈通道(見 CLAUDE.md)。"
        )

    push = re.search(r"\bgit\b[^\n|;&]*\bpush\b(?P<rest>[^\n|;&]*)", cmd)
    if push:
        rest = push.group("rest")
        if re.search(r"(\s--force(\s|$)|\s-f(\s|$))", rest + " "):
            return "git push --force 會改寫共享歷史。需要安全強推時用 --force-with-lease,並先說明原因。"
        for token in rest.split():
            if token.startswith("-"):
                continue
            dest = token.split(":")[-1] if ":" in token else token
            if dest.removeprefix("refs/heads/") in PROTECTED_BRANCHES:
                return (
                    "git-flow:main/develop 只接受 PR 合併,不接受直接 push。"
                    "請推 feature/fix 分支並開 PR(feature → develop;晉升 → main,"
                    "見 CLAUDE.md 晉升 SOP)。"
                )

    if re.search(r"\bpytest\b", cmd) and "journey" in cmd:
        if "tools/" not in cmd and "--collect-only" not in cmd:
            return (
                "journey 套件打真 Supabase 分支,絕不在本機跑(見 .claude/rules/e2e-tests.md)。"
                "它只在 journey-nightly workflow 執行;本機可跑的只有 "
                "`cd e2e/journey && pytest tools/ -q` 與 `pytest --collect-only -q`。"
            )

    return None


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return

    reason = decide(str(payload.get("tool_input", {}).get("command", "")))
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
