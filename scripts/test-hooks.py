#!/usr/bin/env python3
"""框架 hook 的行為測試——表格案例驅動。

存在理由(friction-log 2026-07-25 的防線回填):framework-check 原本只驗
腳本語法,不驗行為分支。pre-commit 誤擋 merge commit 那次是靠人工模擬才
發現的——閘門自己沒有紅綠燈,就只能靠事故發現迴歸。

三個 PreToolUse guard 的判斷都抽成了純函式 decide(),所以可以直接表格化;
pre-commit 靠 PRE_COMMIT_DRY_RUN=1 的決策輸出驗模式選擇(dry-run 一律以
99 退出,不可能被當成繞過閘門的手段)。

跑法:python3 scripts/test-hooks.py(framework-check.sh 會呼叫)
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOKS = ROOT / ".claude" / "hooks"

failures: list[str] = []
checked = 0


def load(name: str):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HOOKS / f"{name}.py")
    if spec is None or spec.loader is None:
        raise RuntimeError(f"無法載入 {name}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def expect(label: str, got_denied: bool, want_denied: bool) -> None:
    global checked
    checked += 1
    if got_denied != want_denied:
        verb = "應該擋但放行了" if want_denied else "應該放行但擋了"
        failures.append(f"{label}: {verb}")


# ---------------------------------------------------------------- bash-guard
bash_guard = load("bash-guard")

BASH_CASES = [
    # (指令, 應否 deny, 說明)
    ("git commit -m x --no-verify", True, "--no-verify 繞閘門"),
    ("git commit -m 'feat: x'", False, "正常 commit"),
    ("git push --force origin feature/x", True, "force push"),
    ("git push -f origin feature/x", True, "force push 短旗標"),
    ("git push --force-with-lease origin feature/x", False, "force-with-lease 是安全的"),
    ("git push origin main", True, "直推 main"),
    ("git push -u origin develop", True, "直推 develop"),
    ("git push origin HEAD:main", True, "refspec 直推 main"),
    ("git push origin refs/heads/develop", True, "全 ref 直推 develop"),
    ("git push -u origin feature/task-fav", False, "推 feature 分支"),
    ("git push -u origin fix/main-page-crash", False, "分支名含 main 不該誤擋"),
    ("git push -u origin claude/foo-abc123", False, "web UI 自動分支"),
    ("cd e2e/journey && pytest -m skeleton", True, "本機跑 journey"),
    ("cd e2e/journey && pytest tools/ -q", False, "journey 離線單元測試"),
    ("cd e2e/journey && pytest --collect-only -q", False, "journey 情境收集"),
    ("cd e2e && pytest", False, "主 e2e 套件(全 mock)"),
    ("npm run check", False, "一般指令"),
]

for cmd, want, why in BASH_CASES:
    expect(f"bash-guard[{why}]", bash_guard.decide(cmd) is not None, want)


# ------------------------------------------------------------ tdd-test-guard
tdd_guard = load("tdd-test-guard")

TDD_CASES = [
    # (鎖存在, 檔案, 應否 deny, 說明)
    (True, "src/utils/foo.test.ts", True, "紅燈期改 vitest 測試"),
    (True, "src/components/Bar.test.tsx", True, "紅燈期改元件測試"),
    (True, "src/utils/foo.ts", False, "紅燈期改實作(這才是正解)"),
    (True, "docs/plans/x/progress.md", False, "紅燈期寫進度"),
    (True, "e2e/features/x.feature", False, "e2e 第一期不納入相位鎖"),
    (False, "src/utils/foo.test.ts", False, "非紅燈期改測試(自由)"),
    (False, "src/utils/foo.ts", False, "非紅燈期改實作"),
]

for lock, path, want, why in TDD_CASES:
    expect(f"tdd-test-guard[{why}]", tdd_guard.decide(lock, path) is not None, want)


# --------------------------------------------------------- feature-plan-guard
plan_guard = load("feature-plan-guard")

PLAN_CASES = [
    # (分支, 檔案, 規劃書曾存在, 應否 deny, 說明)
    ("feature/task-fav", "src/utils/favorites.ts", False, True, "feature 分支無規劃書寫 src"),
    ("feature/task-fav", "src/utils/favorites.test.ts", False, True, "測試檔同樣受管"),
    ("feature/task-fav", "supabase/functions/api/index.ts", False, True, "後端同樣受管"),
    ("feature/task-fav", "src/utils/favorites.ts", True, False, "有規劃書就放行"),
    ("feature/task-fav", "docs/plans/task-fav/plan.md", False, False, "寫規劃書本身不受管"),
    ("feature/task-fav", "CLAUDE.md", False, False, "文件不受管"),
    ("fix/bug-x", "src/utils/foo.ts", False, False, "fix 分支不受管(走 /fix-bug)"),
    ("claude/web-session-abc", "src/utils/foo.ts", False, False, "web UI 分支不受管"),
    ("develop", "src/utils/foo.ts", False, False, "非 feature 分支不受管"),
    ("feature/", "src/utils/foo.ts", False, False, "空 slug 不誤擋"),
]

for branch, path, plan, want, why in PLAN_CASES:
    expect(f"feature-plan-guard[{why}]", plan_guard.decide(branch, path, plan) is not None, want)


def test_plan_ever_existed() -> None:
    """plan_ever_existed 的真實 git 查詢——在拋棄式 repo 裡驗三種狀態。

    這條是「收尾清理規劃檔」能成立的前提:清掉之後守衛仍須放行,否則
    清理完就無法再修 CI 紅燈(守衛會鎖死自己)。純函式測不到這段,因為
    它的判斷來自 git 歷史。
    """
    global checked
    import tempfile

    def git(cwd: str, *args: str) -> None:
        subprocess.run(
            ["git", *args],
            cwd=cwd,
            check=True,
            capture_output=True,
            env=dict(
                os.environ,
                GIT_AUTHOR_NAME="t",
                GIT_AUTHOR_EMAIL="t@e",
                GIT_COMMITTER_NAME="t",
                GIT_COMMITTER_EMAIL="t@e",
            ),
        )

    with tempfile.TemporaryDirectory() as tmp:
        git(tmp, "init", "-q")
        plan_dir = Path(tmp) / "docs" / "plans" / "demo"
        plan_dir.mkdir(parents=True)
        (plan_dir / "plan.md").write_text("# demo\n")
        git(tmp, "add", "-A")
        git(tmp, "commit", "-qm", "add plan")

        checked += 1
        if not plan_guard.plan_ever_existed(Path(tmp), "demo"):
            failures.append("plan_ever_existed[檔案存在]: 應為 True")

        # 模擬 /tdd-implement 收尾的鷹架拆除
        git(tmp, "rm", "-rq", "docs/plans/demo")
        git(tmp, "commit", "-qm", "chore(plans): 清理 demo 規劃檔")

        checked += 1
        if not plan_guard.plan_ever_existed(Path(tmp), "demo"):
            failures.append("plan_ever_existed[已清理但歷史有過]: 應為 True(否則清理後守衛會鎖死自己)")

        checked += 1
        if plan_guard.plan_ever_existed(Path(tmp), "never-planned"):
            failures.append("plan_ever_existed[從未存在]: 應為 False")


test_plan_ever_existed()


# ----------------------------------------------------------------- pre-commit
def pre_commit_dryrun(fake_merge: bool = False, lock: bool = False) -> str:
    """跑 pre-commit 的 dry-run,回傳 DRYRUN: 決策行(空白分隔)。"""
    lock_path = ROOT / ".claude" / "tdd-lock"
    created = False
    if lock and not lock_path.exists():
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        lock_path.touch()
        created = True
    try:
        env = dict(os.environ, PRE_COMMIT_DRY_RUN="1")
        if fake_merge:
            env["PRE_COMMIT_FAKE_MERGE"] = "1"
        out = subprocess.run(
            ["bash", str(ROOT / "scripts" / "git-hooks" / "pre-commit")],
            cwd=ROOT,
            capture_output=True,
            text=True,
            env=env,
            timeout=60,
        )
        if out.returncode != 99:
            failures.append(f"pre-commit dry-run 退出碼應為 99(不可被當繞道),實得 {out.returncode}")
        return " ".join(
            line.strip() for line in out.stdout.splitlines() if line.startswith("DRYRUN:")
        )
    finally:
        if created:
            lock_path.unlink(missing_ok=True)


def expect_in(label: str, needle: str, haystack: str) -> None:
    global checked
    checked += 1
    if needle not in haystack:
        failures.append(f"{label}: 決策輸出缺少 '{needle}'(實得: {haystack or '<空>'})")


def expect_not_in(label: str, needle: str, haystack: str) -> None:
    global checked
    checked += 1
    if needle in haystack:
        failures.append(f"{label}: 決策輸出不該有 '{needle}'(實得: {haystack})")


normal = pre_commit_dryrun()
expect_in("pre-commit[無鎖走全量 check]", "MODE full-check", normal)
expect_not_in("pre-commit[無鎖不該走紅燈通道]", "MODE red-channel", normal)

red = pre_commit_dryrun(lock=True)
expect_in("pre-commit[有鎖走紅燈通道]", "MODE red-channel", red)
expect_in("pre-commit[紅燈期只跑靜態閘門]", "WOULD_RUN static-gates", red)
expect_not_in("pre-commit[紅燈期不跑 npm run check]", "WOULD_RUN npm-run-check", red)

# Deno 分支只有在 staged 含 supabase/functions/ 時才會走到;沒有暫存變更時
# 應該完全不出現 DENO 決策——這本身就是一條該釘住的行為。
expect_not_in("pre-commit[無後端變更不碰 Deno 閘門]", "DENO", normal)

# 合併例外只在「有後端變更且本機無 deno」時才有意義。此環境無 deno,
# 但也沒有暫存的後端檔案,所以只驗「假合併訊號不會憑空觸發 Deno 分支」。
merge_dry = pre_commit_dryrun(fake_merge=True)
expect_not_in("pre-commit[假合併訊號不憑空觸發 Deno]", "DENO", merge_dry)


# --------------------------------------------------------------------- 結果
if failures:
    print(f"test-hooks: {len(failures)} 個案例失敗(共 {checked} 條)", file=sys.stderr)
    for f in failures:
        print(f"  FAIL {f}", file=sys.stderr)
    sys.exit(1)

print(f"test-hooks: OK（{checked} 條行為案例）")
