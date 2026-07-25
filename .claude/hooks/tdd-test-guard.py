#!/usr/bin/env python3
"""PreToolUse hook:TDD 相位鎖——紅燈期禁改測試檔。

紅燈期(.claude/tdd-lock 存在)代表「測試已 commit、實作未綠」。此時改
*.test.* 幾乎必然是「改測試遷就實作」,deny 並指路。範圍刻意只含 vitest
(src/**/*.test.ts[x]):e2e 的 .feature/_steps.py 第一期不納入(設計裁決)。

定位:防無意作弊,不防蓄意(Bash heredoc 寫檔可繞——bash-guard 擋常見
形態,殘餘風險已在設計文件記錄並接受)。

決策邏輯放在純函式 decide() 裡,好讓 scripts/test-hooks.py 用表格案例
直接驗行為。
"""

import json
import re
import sys
from pathlib import Path

DENY_REASON = (
    "TDD 紅燈期(.claude/tdd-lock)禁改測試檔:紅燈的修法是改實作,"
    "不是改測試。實作至綠後跑 scripts/tdd-unlock.sh 解鎖;"
    "若測試本身真的寫錯,先把理由記入該 feature 的 progress.md "
    "並取得人工裁決,再由人解鎖修測試。"
)


def decide(lock_exists: bool, file_path: str) -> str | None:
    """回傳 deny 理由,或 None 表示放行。純函式,無 I/O。"""
    if not lock_exists:
        return None  # 非紅燈期,一切照常
    if re.search(r"\.test\.(ts|tsx)$", file_path):
        return DENY_REASON
    return None


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return  # 讀不懂就放行——guard 壞掉不該把人鎖死

    root = Path(__file__).resolve().parent.parent.parent
    lock_exists = (root / ".claude" / "tdd-lock").exists()
    file_path = str(payload.get("tool_input", {}).get("file_path", ""))

    reason = decide(lock_exists, file_path)
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
