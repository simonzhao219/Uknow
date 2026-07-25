#!/usr/bin/env python3
"""Stop hook:docs/、.claude/ 底下的刪除,檢查路徑關鍵字是否仍殘留在全庫。

存在理由:PR#115 刪除 docs/blackbox/ 整個目錄,但 .claude/settings.json 的
deny 規則、docs/claude-code-token-best-practices.md 的一整節分析都還在提它
——連續兩個文件盤點 PR(#115 本身、#124 的文件命名盤點)都路過卻沒發現。
PR#115 checklist 寫的是「全 repo 相對連結解析驗證通過」,但這兩處殘留都不是
markdown 連結:一個是 JSON 字串裡的 glob pattern,一個是散文與表格——
連結完整性檢查structurally 抓不到。這道 hook 補的是另一種過時:內容還在
講一個已經不存在的東西。

範圍刻意只收斂在 docs/ 與 .claude/ 底下的刪除:這兩個子系統彼此高度耦合
(settings.json 的權限規則常常因某份文件而存在、規則檔互相引用文件路徑),
且是本次真實發生過的問題範圍。全庫任何刪除都查會對一般的 src/ 重構製造
大量不相關雜訊——這是有實證的地方才開檢查,不是撒大網。

非阻斷:只在 stop 回饋裡列出,由人/下一輪 agent 判斷是刻意保留(如
friction-log 的歷史記錄,已排除在搜尋範圍外)還是真的漏改。

決策邏輯放純函式,好讓 scripts/test-hooks.py 用表格案例驗行為(與其他
四個 hook 同慣例)。
"""

from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
WATCHED_PREFIXES = ("docs/", ".claude/")

# C・長期記憶:刻意保留舊事物的歷史紀錄,不算殘留(見 docs/README.md 分級表)
EXCLUDE_PATHSPEC = ":(exclude)docs/plans/friction-log.md"


def watched_deletions(deleted_paths: list[str]) -> list[str]:
    """留下 docs/、.claude/ 底下的刪除路徑。純函式。"""
    return [p for p in deleted_paths if p.startswith(WATCHED_PREFIXES)]


def keyword_for(path: str, parent_dir_exists: bool = False) -> str:
    """從刪除路徑抽取搜尋關鍵字。純函式——parent_dir_exists 由呼叫方
    (真的查檔案系統)注入:

    - 上層目錄已經整個不在了(代表這整個目錄被刪光,如 docs/blackbox/ 的
      三個檔案)→ 用目錄名。settings.json、文件裡通常用目錄名指稱整批
      內容,不是單一檔名(「docs/blackbox」而不是「01-spec」)。
    - 上層目錄還在(只刪了裡面一個檔案,其他手足檔案都沒動)→ 用去除
      副檔名的檔名——這種情況目錄名還在被正常引用,拿它當關鍵字只會
      製造誤報。
    """
    parts = Path(path).parts
    if not parent_dir_exists and len(parts) > 1:
        return parts[-2]
    return Path(path).stem


def residue_report(keyed_paths: list[tuple[str, str]], grep_hits: dict[str, list[str]]) -> str | None:
    """組出警告文字,或 None 表示無殘留。純函式。

    keyed_paths 是 (刪除路徑, 搜尋關鍵字) 配對——決定關鍵字需要查檔案系統
    (上層目錄還在不在),那段 I/O 由呼叫方(main())先做完再傳進來。
    grep_hits 同樣由呼叫方(真的跑 git grep)注入,好讓表格案例不必真的
    動檔案系統。
    """
    lines = []
    seen_kw: set[str] = set()
    for path, kw in keyed_paths:
        if kw in seen_kw:
            continue
        seen_kw.add(kw)
        hits = grep_hits.get(kw, [])
        if hits:
            lines.append(f"- 已刪除 {path!r},但 {kw!r} 仍出現在:{', '.join(hits)}")
    if not lines:
        return None
    return (
        "[deletion-residue-check] 偵測到刪除路徑的關鍵字仍殘留於其他檔案,"
        "請確認是刻意保留(如歷史紀錄)還是漏改:\n" + "\n".join(lines)
    )


def _git_deleted_paths(root: Path) -> list[str]:
    """working tree 未 commit 的刪除,加上相對 upstream/develop/main 的
    已 commit 刪除,合併去重。"""
    paths: set[str] = set()

    try:
        status = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=10,
        )
        for line in status.stdout.splitlines():
            if len(line) > 3 and "D" in line[:2]:
                paths.add(line[3:].strip().strip('"'))
    except (OSError, subprocess.SubprocessError):
        pass

    for ref in ("@{u}", "origin/develop", "origin/main"):
        try:
            mb = subprocess.run(
                ["git", "merge-base", "HEAD", ref],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=5,
            )
            if mb.returncode != 0 or not mb.stdout.strip():
                continue
            base = mb.stdout.strip()
            diff = subprocess.run(
                ["git", "diff", "--name-status", "--diff-filter=D", base, "HEAD"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=10,
            )
            for line in diff.stdout.splitlines():
                parts = line.split("\t")
                if len(parts) >= 2:
                    paths.add(parts[1])
            break
        except (OSError, subprocess.SubprocessError):
            continue

    return sorted(paths)


def _grep_keyword(root: Path, keyword: str) -> list[str]:
    try:
        out = subprocess.run(
            ["git", "grep", "-l", "-i", "-F", keyword, "--", ".", EXCLUDE_PATHSPEC],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=15,
        )
        return [line for line in out.stdout.splitlines() if line]
    except (OSError, subprocess.SubprocessError):
        return []


def main() -> None:
    watched = watched_deletions(_git_deleted_paths(ROOT))
    if not watched:
        return

    keyed: list[tuple[str, str]] = []
    hits: dict[str, list[str]] = {}
    for path in watched:
        parent_exists = (ROOT / Path(path).parent).is_dir()
        kw = keyword_for(path, parent_exists)
        keyed.append((path, kw))
        if kw not in hits:
            hits[kw] = _grep_keyword(ROOT, kw)

    report = residue_report(keyed, hits)
    if report:
        print(report)


if __name__ == "__main__":
    main()
