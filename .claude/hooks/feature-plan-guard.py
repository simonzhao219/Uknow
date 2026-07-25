#!/usr/bin/env python3
"""PreToolUse hook:feature 分支必須先有規劃書才能寫產品程式碼。

三段式流程的確定性後盾。skill 的自動觸發是啟發式的(靠 description 比對,
不保證每次都中),這道守衛則是機械的:站在 `feature/<slug>` 分支上而
`docs/plans/<slug>/plan.md` 不存在,就不准動 src/ 與 supabase/functions/。

為什麼判準是「分支名」而不是「檔案內容像不像新功能」:
- 誤擋率極低——框架維護、bug 修復(fix/*)、探索性 session、web UI 自動
  開的 claude/* 分支都不在 feature/* 上,完全不受影響
- 它把「規劃書存在」變成寫 feature code 的前置條件,而不是一句叮嚀
- 副作用是慣例被自動執行:要開新功能就得開 feature/* 分支、就得有規劃書

規劃書目錄名必須等於分支 slug(/plan-feature 與 /tdd-implement 都照此約定)。

決策邏輯放在純函式 decide() 裡,好讓 scripts/test-hooks.py 用表格案例
直接驗行為——守衛自己也該有紅綠燈。
"""

import json
import subprocess
import sys
from pathlib import Path

# 受保護的產品程式碼路徑(測試檔也算——TDD 的紅燈測試同樣屬於實作階段)
GUARDED_PREFIXES = ("src/", "supabase/functions/")


def decide(branch: str, rel_path: str, plan_exists: bool) -> str | None:
    """回傳 deny 理由,或 None 表示放行。純函式,無 I/O。"""
    if not branch.startswith("feature/"):
        return None  # 只管 feature 分支
    slug = branch[len("feature/") :]
    if not slug:
        return None
    if not rel_path.startswith(GUARDED_PREFIXES):
        return None  # 文件、規劃書、設定檔等不受限
    if plan_exists:
        return None
    return (
        f"分支 {branch} 還沒有規劃書(docs/plans/{slug}/plan.md 不存在),"
        f"不能直接寫 {rel_path}。新功能一律三段式:先 /plan-feature {slug} 產出"
        f"四面向規劃書(會自動接 /review-plan 四視角審查),人審通過後才由人啟動 "
        f"/tdd-implement {slug}。若這不是新功能開發(修 bug 走 /fix-bug、"
        f"框架維護等),請改用 fix/* 或其他分支名。"
    )


def current_branch(root: Path) -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return out.stdout.strip() if out.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return  # 讀不懂就放行——guard 壞掉不該把人鎖死

    file_path = str(payload.get("tool_input", {}).get("file_path", ""))
    if not file_path:
        return

    root = Path(__file__).resolve().parent.parent.parent
    branch = current_branch(root)

    try:
        rel = Path(file_path).resolve().relative_to(root).as_posix()
    except ValueError:
        rel = file_path.lstrip("./")

    slug = branch[len("feature/") :] if branch.startswith("feature/") else ""
    plan_exists = bool(slug) and (root / "docs" / "plans" / slug / "plan.md").exists()

    reason = decide(branch, rel, plan_exists)
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
