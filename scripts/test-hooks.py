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
import json
import os
import subprocess
import sys
import tempfile
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


# bash-guard 第 5 類:新分支的 base 檢查。head_matches_develop 由呼叫方
# (main() 的 git rev-parse)量測後傳入,這裡直接餵布林值,不需要真的建 repo。
BRANCH_CASES = [
    # (指令, head 是否等於 origin/develop, 應否 deny, 說明)
    ("git checkout -b feature/x", True, False, "HEAD 已是最新 develop"),
    ("git checkout -b feature/x", False, True, "HEAD 不是最新 develop"),
    ("git checkout -b feature/x", None, False, "量不到(如無 origin/develop)時放行"),
    ("git checkout -b feature/x origin/develop", False, False, "顯式指定 origin/develop 為 base"),
    ("git checkout -b feature/x develop", True, False, "顯式指定 develop(短名)為 base"),
    ("git checkout -b feature/x main", True, True, "顯式指定 main 為 base——違反 git-flow"),
    ("git checkout -b feature/x origin/main", False, True, "顯式指定 origin/main 為 base"),
    ("git switch -c fix/y", False, True, "switch -c 同樣受控"),
    ("git switch -c fix/y origin/develop", False, False, "switch -c 顯式指定 develop"),
    ("git branch -d old-feature", False, False, "刪除分支不受影響(不是 checkout -b/switch -c)"),
    ("git branch -a", False, False, "列出分支不受影響"),
    ("git checkout develop", False, False, "純切換分支(非建立)不受影響"),
    ("git checkout -b feature/x  ", True, False, "尾隨空白不誤判成有 start-point"),
]

for cmd, head_ok, want, why in BRANCH_CASES:
    expect(f"bash-guard[{why}]", bash_guard.decide(cmd, head_ok) is not None, want)


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


# ----------------------------------------------------- deletion-residue-check
residue = load("deletion-residue-check")

RESIDUE_WATCH_CASES = [
    # (刪除路徑, 應否納入監看, 說明)
    ("docs/blackbox/01-spec.md", True, "docs/ 底下的刪除"),
    (".claude/rules/old-rule.md", True, ".claude/ 底下的刪除"),
    ("src/components/Old.tsx", False, "src/ 不在監看範圍(避免一般重構的雜訊)"),
    ("supabase/functions/api/old.ts", False, "supabase/ 不在監看範圍"),
]

for path, want, why in RESIDUE_WATCH_CASES:
    checked += 1
    got = residue.watched_deletions([path]) == [path]
    if got != want:
        failures.append(f"deletion-residue-check[watch:{why}]: 預期 {want},實得 {got}")

RESIDUE_KEYWORD_CASES = [
    # (刪除路徑, 上層目錄是否還在, 預期關鍵字, 說明)
    ("docs/blackbox/01-spec.md", False, "blackbox", "整個目錄被刪光 → 用目錄名"),
    ("docs/old-notes.md", True, "old-notes", "上層(docs/)還在 → 用去除副檔名的檔名"),
    (".claude/rules/old-rule.md", True, "old-rule", "上層(.claude/rules/)還在 → 同規則,不誤用目錄名"),
]

for path, parent_exists, want, why in RESIDUE_KEYWORD_CASES:
    checked += 1
    got_kw = residue.keyword_for(path, parent_exists)
    if got_kw != want:
        failures.append(f"deletion-residue-check[keyword:{why}]: 預期 {want!r},實得 {got_kw!r}")

RESIDUE_REPORT_CASES = [
    # ((刪除路徑, 關鍵字) 配對清單, grep 命中對照表, 應否產出報告, 說明)
    ([("docs/blackbox/01-spec.md", "blackbox")], {"blackbox": ["docs/plans/friction-log.md"]}, True, "有殘留 → 有報告"),
    ([("docs/blackbox/01-spec.md", "blackbox")], {"blackbox": []}, False, "無殘留 → 無報告"),
    ([], {}, False, "沒有監看範圍內的刪除 → 無報告"),
]

for keyed, hits, want_report, why in RESIDUE_REPORT_CASES:
    checked += 1
    got = residue.residue_report(keyed, hits) is not None
    if got != want_report:
        failures.append(f"deletion-residue-check[report:{why}]: 應{'要' if want_report else '不要'}產出報告")


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
    harness_metrics: str | None = None,
) -> str:
    """跑 pre-commit 的 dry-run,回傳 DRYRUN: 決策行(空白分隔)。"""
    # 鎖檔要**兩個方向都控制**:只做「要鎖時建立」的話,開發者真的處在紅燈期
    # (鎖存在)時,所有 lock=False 的案例都會假紅——與下面 staged/deno/doc_diff
    # 各自隔離的理由完全相同,當初漏了這一個。lock=False 時先把既有鎖移開,
    # finally 一定放回去(移開而不是刪除:鎖是 session 狀態,弄丟等於靜默解鎖)。
    lock_path = ROOT / ".claude" / "tdd-lock"
    stash_path = lock_path.with_name("tdd-lock.testhooks-stash")
    created = False
    stashed = False
    if lock:
        if not lock_path.exists():
            lock_path.parent.mkdir(parents=True, exist_ok=True)
            lock_path.touch()
            created = True
    elif lock_path.exists():
        lock_path.replace(stash_path)
        stashed = True
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
        # 感測器的關閉開關。測試要能兩邊都釘住——只驗「開著會落檔」的話,
        # 一個永遠回 true 的判斷式也會通過。
        if harness_metrics is not None:
            env["HARNESS_METRICS"] = harness_metrics
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
        if stashed:
            stash_path.replace(lock_path)


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

# harness 感測器的落檔點。這是整條鏈唯一能讓資料進得了 git 的地方(Stop hook
# 跑在最後一次 commit 之後,寫了也白寫),所以它靜默失效等於整個感測器不存在。
metrics_on = pre_commit_dryrun(staged="src/App.tsx")
expect_in("pre-commit[預設會落檔 harness 指標]", "WOULD_FLUSH metrics", metrics_on)

metrics_off = pre_commit_dryrun(staged="src/App.tsx", harness_metrics="0")
expect_in("pre-commit[HARNESS_METRICS=0:宣告停用]", "METRICS disabled", metrics_off)
expect_not_in("pre-commit[HARNESS_METRICS=0:不落檔]", "WOULD_FLUSH", metrics_off)


# ------------------------------------------------------------- decision_log
# 感測器與閘門的差別:閘門壞了會擋住人(看得見),感測器壞了只是靜靜地不
# 記錄(看不見)。所以這一段的重點不只是「功能對不對」,更是「壞掉時看不看
# 得出來」——沿用 friction-log 那條通則(回報 OK 的檢查必須能區分「真的沒
# 問題」與「根本沒檢查到」)。
decision_log = load("decision_log")


def expect_eq(label: str, got: object, want: object) -> None:
    global checked
    checked += 1
    if got != want:
        failures.append(f"{label}: 預期 {want!r},實得 {got!r}")


# bump():rule 是 None 記進 passed(誤擋率的分母),否則記進 fired。
BUMP_CASES = [
    # (初始 fired, 初始 passed, hook, rule, 預期 fired, 預期 passed, 說明)
    ({}, {}, "bash-guard", None, {}, {"bash-guard": 1}, "沒出手記進 passed"),
    ({}, {}, "bash-guard", "no-verify", {"bash-guard/no-verify": 1}, {}, "出手記進 fired 帶 rule"),
    (
        {"bash-guard/no-verify": 2},
        {},
        "bash-guard",
        "no-verify",
        {"bash-guard/no-verify": 3},
        {},
        "同一條 rule 累加",
    ),
    ({}, {"bash-guard": 5}, "bash-guard", None, {}, {"bash-guard": 6}, "passed 累加"),
    (
        {},
        {},
        "check-output-filter",
        "collapse",
        {"check-output-filter/collapse": 1},
        {},
        "改寫器的出手同樣進 fired(桶子刻意語意中性,不叫 deny)",
    ),
]

for f0, p0, hook, rule, want_f, want_p, why in BUMP_CASES:
    st = {**decision_log.new_state("s1", "T0", "b"), "fired": f0, "passed": p0}
    got = decision_log.bump(st, hook, rule, "T1")
    expect_eq(f"decision_log.bump[{why}] fired", got["fired"], want_f)
    expect_eq(f"decision_log.bump[{why}] passed", got["passed"], want_p)

# 不可變性:bump 不得改動傳入的 state。共用可變 dict 的計數器最典型的 bug
# 就是別名——一旦發生,兩個 session 的數字會互相污染而且完全看不出來。
_orig = decision_log.new_state("s1", "T0", "b")
decision_log.bump(_orig, "bash-guard", "no-verify", "T1")
expect_eq("decision_log.bump[不改動傳入的 state]", _orig["fired"], {})

# ended 每次 bump 都往前推(session 的涵蓋期間靠它算)
expect_eq(
    "decision_log.bump[更新 ended]",
    decision_log.bump(decision_log.new_state("s1", "T0", "b"), "h", None, "T9")["ended"],
    "T9",
)

# merge_lines():同 session 取代自己那一行,不是附加。pre-commit 每次 commit
# 都會 flush,附加的話一個 session 會留下十幾行半成品。
_a = json.dumps({"session": "aaa", "n": 1})
_b = json.dumps({"session": "bbb", "n": 2})
_a2 = json.dumps({"session": "aaa", "n": 99})

MERGE_CASES = [
    ([], _a, "aaa", [_a], "空 log:附加"),
    ([_b], _a, "aaa", [_b, _a], "沒有自己那一行:附加在最後"),
    ([_a, _b], _a2, "aaa", [_a2, _b], "有自己那一行:就地取代,不附加"),
    ([_b, _a], _a2, "aaa", [_b, _a2], "取代時保持原本的行序"),
    (["{壞掉的行", _b], _a, "aaa", ["{壞掉的行", _b, _a], "壞行原樣保留,不得吞掉別人的資料"),
]

for lines, line, session, want, why in MERGE_CASES:
    expect_eq(f"decision_log.merge_lines[{why}]", decision_log.merge_lines(lines, line, session), want)

# to_line():鍵序必須穩定,否則同一個 session 的多次 flush 會讓 git diff
# 因字典順序抖動而看起來每次都變,讀不出「這行到底改了什麼」。
expect_eq(
    "decision_log.to_line[鍵序穩定]",
    decision_log.to_line({"b": 1, "a": 2}),
    decision_log.to_line({"a": 2, "b": 1}),
)


def test_decision_log_io() -> None:
    """record → flush → 讀回的真實 I/O,以及關閉開關。

    純函式測不到的部分:落檔點是否真的寫出一行、同 session 多次 flush 是否
    仍是一行、HARNESS_METRICS=0 是否真的完全不碰檔案系統。全部指到 temp 目錄,
    所以跑測試不會污染 repo 的 sessions.jsonl。
    """
    global checked
    hook_path = str(HOOKS / "decision_log.py")

    def run(env_extra: dict, body: str, tmp: str) -> Path:
        """在子行程裡 import 記錄器並執行 body,回傳它被指到的 metrics 目錄。

        指到的是 tmp 底下**尚未存在**的子目錄:目錄本身有沒有被建出來,就是
        「有沒有碰檔案系統」的訊號。若直接指向 tmp(已存在),
        `mkdir(exist_ok=True)` 這種副作用會完全隱形——第一版就是這樣寫的,
        突變測試把它抓了出來(見 friction-log:空轉與健康長得一樣的檢查
        等於沒有檢查)。
        """
        target = Path(tmp) / "metrics"
        code = (
            "import importlib.util\n"
            f"spec = importlib.util.spec_from_file_location('dl', r'{hook_path}')\n"
            "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\n" + body
        )
        subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            env={**os.environ, "HARNESS_METRICS_DIR": str(target), **env_extra},
        )
        return target

    # 1. 模組層零 I/O。scripts/test-hooks.py 用 exec_module 載入 hook 模組,而
    #    check-output-filter 每次呼叫也會 exec_module 載入 bash-guard——模組層
    #    若有副作用,跑一次測試就污染一次日誌,且每個 Bash 指令會被記兩次。
    with tempfile.TemporaryDirectory() as tmp:
        target = run({}, "pass\n", tmp)
        checked += 1
        if target.exists():
            failures.append("decision_log[模組層零 I/O]: 只是 import 就碰了檔案系統")

    # 2. record → flush 的來回:寫得出一行,且內容讀得回來
    with tempfile.TemporaryDirectory() as tmp:
        target = run(
            {}, "m.record('bash-guard', 'no-verify')\nm.record('bash-guard', None)\nm.flush()\n", tmp
        )
        log = target / "sessions.jsonl"
        checked += 1
        if not log.exists():
            failures.append("decision_log[record→flush]: sessions.jsonl 沒被建立")
        else:
            rows = [json.loads(ln) for ln in log.read_text(encoding="utf-8").splitlines() if ln.strip()]
            expect_eq("decision_log[record→flush] 行數", len(rows), 1)
            expect_eq("decision_log[record→flush] fired", rows[0]["fired"], {"bash-guard/no-verify": 1})
            expect_eq("decision_log[record→flush] passed", rows[0]["passed"], {"bash-guard": 1})

    # 3. 同一個 session flush 兩次仍是一行(pre-commit 每次 commit 都會 flush)
    with tempfile.TemporaryDirectory() as tmp:
        target = run({}, "m.record('h', None)\nm.flush()\nm.record('h', None)\nm.flush()\n", tmp)
        rows = [
            ln
            for ln in (target / "sessions.jsonl").read_text(encoding="utf-8").splitlines()
            if ln.strip()
        ]
        expect_eq("decision_log[同 session 兩次 flush 仍是一行]", len(rows), 1)
        expect_eq("decision_log[第二次 flush 的計數有累加]", json.loads(rows[0])["passed"], {"h": 2})

    # 4. 關閉開關:HARNESS_METRICS=0 必須完全不碰檔案系統
    with tempfile.TemporaryDirectory() as tmp:
        target = run({"HARNESS_METRICS": "0"}, "m.record('h', None)\nm.flush()\n", tmp)
        checked += 1
        if target.exists():
            failures.append("decision_log[HARNESS_METRICS=0]: 關掉了還是碰了檔案系統")

    # 5. rotate:把殘留 buffer 搬進 pending,**不得碰受版控的 sessions.jsonl**。
    #
    #    「不遺失」與「不弄髒」是兩件事,所以拆成兩條分別釘死——併成一條的話,
    #    一個「什麼都不做」的 rotate 也可能因為斷言太鬆而通過。
    #    受版控的檔案只有 pre-commit 能寫:SessionStart 之後「通常」會有 commit
    #    把它帶走,但唯讀 session（問答、review、plan mode）不會,此時直接落檔
    #    就是讓使用者什麼都還沒做、工作區就髒了。
    with tempfile.TemporaryDirectory() as tmp:
        target = run({}, "m.record('h', None)\nm.rotate()\n", tmp)
        checked += 1
        if (target / ".session.json").exists():
            failures.append("decision_log[rotate]: buffer 沒被清掉")
        checked += 1
        if (target / "sessions.jsonl").exists():
            failures.append(
                "decision_log[rotate 不得寫受版控檔案]: sessions.jsonl 被建立了"
                "——唯讀 session 會因此留下髒工作區"
            )
        checked += 1
        pending = target / ".pending.jsonl"
        if not pending.exists():
            failures.append("decision_log[rotate]: 沒搬進 pending,清掉 buffer 等於資料遺失")
        else:
            rows = [json.loads(ln) for ln in pending.read_text(encoding="utf-8").splitlines() if ln.strip()]
            expect_eq("decision_log[rotate] pending 保住計數", rows[0]["passed"].get("h"), 1)

    # 6. 跨 session 累積確實會被帶到終點:rotate 過的舊 session 與當前 session
    #    在下一次 flush 一起落檔,各自一行。少了這條,pending 可能只進不出。
    with tempfile.TemporaryDirectory() as tmp:
        target = run({}, "m.record('old', None)\nm.rotate()\n", tmp)
        run({}, "m.record('new', None)\nm.flush()\n", tmp)
        rows = [
            json.loads(ln)
            for ln in (target / "sessions.jsonl").read_text(encoding="utf-8").splitlines()
            if ln.strip()
        ]
        expect_eq("decision_log[跨 session 累積:兩個 session 各一行]", len(rows), 2)
        expect_eq(
            "decision_log[跨 session 累積:兩邊的計數都在]",
            sorted(k for r in rows for k in r["passed"]),
            ["new", "old"],
        )
        checked += 1
        if (target / ".pending.jsonl").exists():
            failures.append("decision_log[flush 後 pending 未清空]: 同一筆會被重複落檔")

    # 7. 並行安全。bash-guard 與 check-output-filter 掛在同一個 Bash matcher 上,
    #    Claude Code 會**並行**執行它們——每個 Bash 指令都是一次 read-modify-write
    #    競賽。這條是實測抓到的迴歸:沒有鎖與原子寫入時,其中一方會讀到寫到一半
    #    的 buffer、把它當成「還沒有 buffer」,於是開一個新 session id 蓋掉既有
    #    那筆——**整個 session 的計數就這樣消失**,而且不會有任何錯誤訊息。
    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "metrics"
        n = 24
        code = (
            "import importlib.util\n"
            f"spec = importlib.util.spec_from_file_location('dl', r'{hook_path}')\n"
            "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\n"
            "m.record('race', None)\n"
        )
        env = {**os.environ, "HARNESS_METRICS_DIR": str(target)}
        procs = [
            subprocess.Popen(
                [sys.executable, "-c", code], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            for _ in range(n)
        ]
        for p in procs:
            p.wait()

        state = json.loads((target / ".session.json").read_text(encoding="utf-8"))
        expect_eq(f"decision_log[{n} 個並行 record 不掉計數]", state["passed"].get("race"), n)

    # 8. sessions.jsonl 必須是「換檔」而不是「就地覆寫」。
    #
    #    第 7 條那道鎖只保護有參與鎖的行程,而 scripts/harness-metrics.py 讀日誌
    #    時**不上鎖**——就地覆寫(truncate 後再寫)會讓它讀到半截的 JSON,而這是
    #    會進 git 的檔案,寫壞了等於 commit 一份垃圾進版本庫。
    #
    #    判準用 inode 而不是「一邊寫一邊讀看會不會壞」:後者要賭中那個極窄的
    #    時間窗,抓不到就是靜靜地通過,而且在 CI 上必然 flaky——一條只有機率會
    #    說話的測試,跟不會說話的測試差別不大。rename-into-place 必然換 inode,
    #    就地覆寫必然保留 inode,這個差別是確定性的。
    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "metrics"
        run({}, "m.record('h', None)\nm.flush()\n", tmp)
        log_path = target / "sessions.jsonl"
        before = log_path.stat().st_ino
        run({}, "m.record('h', None)\nm.flush()\n", tmp)
        checked += 1
        if log_path.stat().st_ino == before:
            failures.append(
                "decision_log[sessions.jsonl 必須換檔寫入]: inode 沒變,代表是就地覆寫"
                "——不上鎖的讀取器會讀到半截 JSON"
            )


test_decision_log_io()


# --------------------------------------------------------------------- 結果
if failures:
    print(f"test-hooks: {len(failures)} 個案例失敗(共 {checked} 條)", file=sys.stderr)
    for f in failures:
        print(f"  FAIL {f}", file=sys.stderr)
    sys.exit(1)

print(f"test-hooks: OK（{checked} 條行為案例）")
