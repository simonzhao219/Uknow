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


def decide(branch: str, rel_path: str, plan_present: bool) -> str | None:
    """回傳 deny 理由,或 None 表示放行。純函式,無 I/O。

    plan_present 由呼叫方判定,語意是「這條分支上曾經有過規劃書」——
    工作目錄現存**或**分支歷史裡出現過都算。規劃檔是鷹架,`/tdd-implement`
    收尾會把它刪掉(見 CLAUDE.md 規劃檔生命週期),若只看工作目錄,清理完
    之後的修正(例如修 CI 紅燈)會被自己的守衛擋住。
    """
    if not branch.startswith("feature/"):
        return None  # 只管 feature 分支
    slug = branch[len("feature/") :]
    if not slug:
        return None
    if not rel_path.startswith(GUARDED_PREFIXES):
        return None  # 文件、規劃書、設定檔等不受限
    if plan_present:
        return None
    return (
        f"分支 {branch} 沒有(也從未有過)規劃書 docs/plans/{slug}/plan.md,"
        f"不能直接寫 {rel_path}。新功能先 /plan-feature {slug}(會自動接 "
        f"/review-plan 四視角審查),人審通過後才由人啟動 /tdd-implement {slug}。"
        f"輕量改動可走 Plan Mode 規劃、不落檔——但那種情況請用 fix/* 或其他"
        f"分支名,別用 feature/*(修 bug 走 /fix-bug)。"
    )


def plan_ever_existed(root: Path, slug: str) -> bool:
    """工作目錄現存,或這條分支的歷史裡出現過——兩者皆算「有規劃書」。

    看歷史是為了讓「收尾清理規劃檔」與這道守衛不衝突:清掉之後仍能繼續
    修 CI 紅燈。git 查詢失敗時退回只看工作目錄(守衛寧可寬鬆也不要誤鎖)。
    """
    rel = f"docs/plans/{slug}/plan.md"
    if (root / rel).exists():
        return True
    try:
        out = subprocess.run(
            ["git", "log", "--oneline", "-1", "--", rel],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return out.returncode == 0 and bool(out.stdout.strip())
    except (OSError, subprocess.SubprocessError):
        return False


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


def _record(rule: str | None) -> None:
    """記一次決策給 harness 感測器(理由與邊界見 bash-guard.py 的同名函式)。"""
    try:
        import decision_log

        decision_log.record("feature-plan-guard", rule)
    except Exception:  # noqa: BLE001 — 量測的優先序永遠低於工作
        return


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
    plan_present = bool(slug) and plan_ever_existed(root, slug)

    reason = decide(branch, rel, plan_present)
    # 這條的計數格外有價值:守衛擋下來的每一次,都正好是 /plan-feature 那一層
    # 沒被觸發的一次(skill 靠 description 比對,是啟發式的)。這個數字就是
    # skill 命中率的補數——而那個機率至今沒人量過。
    _record("no-plan" if reason else None)

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
