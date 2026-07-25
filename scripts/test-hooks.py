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


# ------------------------------------------------------- check-output-filter
# 這個 hook 不擋東西、只改寫指令,所以 expect() 的語意在這裡是
# 「是否出手改寫」而不是「是否 deny」。
out_filter = load("check-output-filter")

FILTER_CASES = [
    # (指令, 應否改寫, 說明)
    ("npm run check", True, "統一閘門——最高頻的支出"),
    ("npm run check:full", True, "送 PR 前的指令"),
    ("npm test", True, "vitest"),
    ("npm run test:coverage", True, "覆蓋率"),
    ("npx vitest run", True, "直接呼叫 vitest"),
    ("cd supabase/functions && deno task check", True, "Deno 型別檢查"),
    ("cd supabase/functions && deno task test:unit", True, "Deno 單元測試"),
    ("npm run check | tail -80", False, "已有 pipe——這就是取回完整輸出的繞過方式"),
    ("npm run check > out.txt", False, "已自行重導向"),
    ("npm run check 2>&1 | grep FAIL", False, "已自行處理輸出"),
    ("npm run build", False, "非驗證指令,輸出本來就短"),
    ("npm run dev", False, "長跑指令不能包裝"),
    ("git commit -m 'x'", False, "刻意不含 git commit(不在 allowlist,且常帶 heredoc)"),
    ("ls -la", False, "無關指令"),
]

for cmd, want, why in FILTER_CASES:
    expect(f"check-output-filter[{why}]", out_filter.decide(cmd) is not None, want)

# 安全條件:本 hook 與 bash-guard 掛在同一個 Bash matcher,而它回報的
# permissionDecision: allow 有可能蓋掉 bash-guard 的 deny。所以 bash-guard
# 要擋的指令,本 hook 必須不出手。少了這條分支,一條「npm run check &&
# <危險指令>」就能靠本 hook 的 allow 繞過守衛。
_danger = "npm run check && git " + "push --for" + "ce origin develop"  # 僅字串,不執行
expect(
    "check-output-filter[bash-guard 要擋時不出手,不覆蓋 deny]",
    out_filter.decide(_danger, guard_denies=True) is not None,
    False,
)
expect(
    "check-output-filter[上述危險指令確實會被 bash-guard 擋]",
    bash_guard.decide(_danger) is not None,
    True,
)


def test_output_filter_preserves_exit_code() -> None:
    """改寫後的指令必須原樣傳遞 exit code——這是本 hook 唯一的致命失敗模式。

    純函式測不到:`cmd | grep ...` 這種寫法在語法上完全正常,但 exit status
    會變成 grep/head 的,於是**紅燈會被當成綠燈**。必須真的跑一次才知道。
    """
    global checked

    # 把包裝內的真實指令換成 `exit N`:驗的是包裝層對 exit code 的傳遞,
    # 不是 vitest 本身(那由 vitest 自己的軌負責),因此不依賴 node_modules。
    for inner, want_rc, label in [
        ("npm test", 0, "綠燈保留 0"),
        ("npm test", 1, "紅燈保留非零"),
    ]:
        rewritten = out_filter.decide(inner)
        assert rewritten is not None
        # 把真正的受測指令換成 true/false:驗的是包裝層的 exit code 傳遞,
        # 不是 vitest 本身(那由 vitest 自己的 CI 軌負責)。
        probe = rewritten.replace(f"{{ {inner} ; }}", "{ sh -c 'exit %d' ; }" % want_rc)
        rc = subprocess.run(["bash", "-c", probe], capture_output=True, text=True).returncode
        checked += 1
        if rc != want_rc:
            failures.append(f"check-output-filter[{label}]: 預期 exit {want_rc},實得 {rc}")


test_output_filter_preserves_exit_code()


# ---------------------------------------------------- pre-commit 綠燈安靜化
def test_pre_commit_quiet_wrapper() -> None:
    """run_gate_quiet:綠燈折疊、紅燈全印,且 exit code 一律原樣傳遞。

    這是 commit 閘門的一部分,吞掉退出碼等於閘門「看起來正常」地失效——
    所以紅燈那條刻意用退出碼 3(而不是 1)驗,證明傳遞的是**原始碼**而不是
    「某個非零值」。

    包裝器抽成 scripts/git-hooks/lib-quiet.sh 就是為了這幾條能直接餵
    true/false,不必真的跑一次 npm run check(那要 30 秒且依賴環境)。
    """
    lib = ROOT / "scripts" / "git-hooks" / "lib-quiet.sh"

    def run(snippet: str, env_extra: dict[str, str] | None = None):
        return subprocess.run(
            ["bash", "-c", f". '{lib}'\n{snippet}"],
            capture_output=True,
            text=True,
            env=dict(os.environ, **(env_extra or {})),
        )

    def check_case(label: str, ok: bool) -> None:
        global checked
        checked += 1
        if not ok:
            failures.append(f"pre-commit-quiet[{label}]")

    green = run("run_gate_quiet demo bash -c 'echo noise; echo more noise'")
    check_case("綠燈保留 exit 0", green.returncode == 0)
    check_case("綠燈折疊成摘要", "綠燈" in green.stdout and "2 行" in green.stdout)
    check_case("綠燈不外洩原始輸出", "noise" not in green.stdout)

    red = run("run_gate_quiet demo bash -c 'echo BOOM >&2; exit 3'")
    check_case("紅燈傳遞原始退出碼 3(不是任意非零)", red.returncode == 3)
    check_case("紅燈原樣印出輸出", "BOOM" in red.stderr)
    check_case("紅燈不印綠燈摘要", "綠燈" not in red.stdout)

    verbose = run("run_gate_quiet demo bash -c 'echo LIVE'", {"PRE_COMMIT_VERBOSE": "1"})
    check_case("VERBOSE=1 直接透傳不折疊", "LIVE" in verbose.stdout and "綠燈" not in verbose.stdout)
    check_case("VERBOSE=1 仍保留 exit 0", verbose.returncode == 0)

    verbose_red = run("run_gate_quiet demo bash -c 'exit 7'", {"PRE_COMMIT_VERBOSE": "1"})
    check_case("VERBOSE=1 紅燈仍傳遞原始退出碼 7", verbose_red.returncode == 7)


test_pre_commit_quiet_wrapper()


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
def pre_commit_dryrun(
    fake_merge: bool = False,
    lock: bool = False,
    staged: str | None = None,
    deno: str | None = None,
    doc_diff: str | None = None,
) -> str:
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
        # 明確指定 staged 清單,行為測試才不會受「此刻剛好暫存了什麼」影響
        if staged is not None:
            env["PRE_COMMIT_FAKE_STAGED"] = staged
        # 明確指定「本機有沒有 deno」（present / absent），測試才不會
        # 取決於跑它的那台機器
        if deno is not None:
            env["PRE_COMMIT_FAKE_DENO"] = deno
        # 明確指定文件 diff 內容,行為測試才不會受「此刻暫存區剛好有什麼
        # docs/e2e 變更」影響
        if doc_diff is not None:
            env["PRE_COMMIT_FAKE_DOC_DIFF"] = doc_diff
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

# Deno 分支只有在 staged 含 supabase/functions/ 時才會走到。
# 這兩條顯式指定 staged 清單:過去它們讀真實 git index,於是 CI 的乾淨
# checkout 恆綠、開發者正在改後端時恆紅——一條在該說話時剛好不說話的
# 測試。現在兩個方向都釘住,且與工作區狀態無關。
front_only = pre_commit_dryrun(staged="src/App.tsx")
expect_not_in("pre-commit[純前端變更不碰 Deno 閘門]", "DENO", front_only)

BACKEND = "supabase/functions/api/index.ts"

# 有 deno:照跑 fmt + type-check 兩道閘門
with_deno = pre_commit_dryrun(staged=BACKEND, deno="present")
expect_in("pre-commit[後端變更＋有 deno:跑 fmt]", "WOULD_RUN deno-fmt", with_deno)
expect_in("pre-commit[後端變更＋有 deno:跑 type-check]", "WOULD_RUN deno-check", with_deno)

# 無 deno 且非合併:擋下 commit(顯式指定 no_deno,不看跑測試的機器裝了沒——
# 本機裝了走 A 路、CI runner 沒裝走 B 路,那樣同一份測試在兩邊給不同答案)
no_deno = pre_commit_dryrun(staged=BACKEND, deno="absent")
expect_in("pre-commit[後端變更＋無 deno:擋下]", "DENO block-no-deno", no_deno)

# 合併例外:合併帶進來的後端變更是上游 commit(已過 CI),缺 deno 時
# 降為略過而不是死鎖——沒有這條,沒裝 deno 的環境無法完成任何含後端
# 檔案的合併。
merge_no_deno = pre_commit_dryrun(fake_merge=True, staged=BACKEND, deno="absent")
expect_in("pre-commit[合併中＋無 deno:降為略過]", "DENO merge-exception-skip", merge_no_deno)

# 假合併訊號不得讓「沒有後端變更」的 commit 憑空走進 Deno 分支
merge_front = pre_commit_dryrun(fake_merge=True, staged="src/App.tsx")
expect_not_in("pre-commit[假合併訊號不憑空觸發 Deno]", "DENO", merge_front)

# 文件旁白提醒:只提醒不擋(exit code 99 的斷言已包在 pre_commit_dryrun 裡)。
# 關鍵字刻意窄——只認「已定案不提供/非落差」這種自我辯護措辭,不能誤觸發
# §14 表格本身合法的「未實作」字樣(見 .claude/rules/document-writing.md 的例外條款)。
doc_bad = pre_commit_dryrun(doc_diff="+不提供自助取消訂閱（已定案的產品決策，非落差）")
expect_in("pre-commit[新增「已定案不提供」文字:advisory 提醒]", "DOC_ADVISORY triggered", doc_bad)

doc_ok = pre_commit_dryrun(doc_diff="+一般文件變更，不含旁白字樣")
expect_not_in("pre-commit[一般文件變更:不觸發]", "DOC_ADVISORY", doc_ok)

doc_legit_gap_row = pre_commit_dryrun(doc_diff="+| 5 | 到期前 Email 提醒 | 未實作 |")
expect_not_in("pre-commit[§14 合法的「未實作」措辭:不誤觸發]", "DOC_ADVISORY", doc_legit_gap_row)


# --------------------------------------------------------------------- 結果
if failures:
    print(f"test-hooks: {len(failures)} 個案例失敗(共 {checked} 條)", file=sys.stderr)
    for f in failures:
        print(f"  FAIL {f}", file=sys.stderr)
    sys.exit(1)

print(f"test-hooks: OK（{checked} 條行為案例）")
