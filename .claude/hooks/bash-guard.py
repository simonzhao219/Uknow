#!/usr/bin/env python3
"""PreToolUse hook(Bash):擋四種確定性後門。

這些不是「風格偏好」而是框架的完整性條件:
1. git commit --no-verify——繞過 pre-commit 閘門(閘門存在的意義歸零)
2. git push --force / -f——改寫共享歷史(--force-with-lease 除外)
3. 直接 push main/develop——git-flow 的底線:main/develop 只吃 PR,
   不吃直推(branch protection 是第二道,這裡是即刻生效的第一道)
4. 本機跑 journey 套件——打真 Supabase 分支、產真資料、耗分支費用
   (離線的 pytest tools/ 與 --collect-only 不擋)
"""

import json
import re
import sys


def deny(reason: str) -> None:
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


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return

    cmd = str(payload.get("tool_input", {}).get("command", ""))

    if re.search(r"\bgit\b[^\n|;&]*\bcommit\b", cmd) and "--no-verify" in cmd:
        deny(
            "git commit --no-verify 會繞過 pre-commit 閘門。commit 被擋代表 check 紅,"
            "修到綠再提交;紅燈測試 commit 走 .claude/tdd-lock 紅燈通道(見 CLAUDE.md)。"
        )
        return

    if re.search(r"\bgit\b[^\n|;&]*\bpush\b", cmd) and re.search(
        r"(\s--force(\s|$)|\s-f(\s|$))", cmd
    ):
        deny("git push --force 會改寫共享歷史。需要安全強推時用 --force-with-lease,並先說明原因。")
        return

    push_match = re.search(r"\bgit\b[^\n|;&]*\bpush\b(?P<rest>[^\n|;&]*)", cmd)
    if push_match:
        for token in push_match.group("rest").split():
            if token.startswith("-"):
                continue
            dest = token.split(":")[-1] if ":" in token else token
            if dest.removeprefix("refs/heads/") in ("main", "develop"):
                deny(
                    "git-flow:main/develop 只接受 PR 合併,不接受直接 push。"
                    "請推 feature/fix 分支並開 PR(feature → develop;晉升 → main,"
                    "見 CLAUDE.md 晉升 SOP)。"
                )
                return

    if re.search(r"\bpytest\b", cmd) and "journey" in cmd:
        if "tools/" not in cmd and "--collect-only" not in cmd:
            deny(
                "journey 套件打真 Supabase 分支,絕不在本機跑(見 .claude/rules/e2e-tests.md)。"
                "它只在 journey-nightly workflow 執行;本機可跑的只有 "
                "`cd e2e/journey && pytest tools/ -q` 與 `pytest --collect-only -q`。"
            )
            return


if __name__ == "__main__":
    main()
