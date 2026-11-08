#!/usr/bin/env python3
"""部署 Edge Function 前，確認目標環境已套用 repo 內每一支 migration（W5-62）。

存在理由（第 5 波 #514 審查 P2-2）：Database migration 由 Supabase 原生 GitHub 整合套用，
Edge Function 由 deploy-supabase.yml 部署，兩者各走各的。新 Edge 若先於它依賴的 migration
上線（例：S6 的六參數 `prepare_payment_order`），建單會全部 500。第 5、6 波晉升時靠人工在核准
前查 `supabase_migrations.schema_migrations`（晉升清單 4a）；這支把它變成部署 job 內的閘門。

判準：repo `supabase/migrations/` 每一支的版本號都在遠端已套用清單裡（遠端多出的不管）。
不設基線截斷：第 6 波主 session 實查過（2026-11-08），develop 與 repo 一一對應，正式站只缺
尚未晉升的版本，沒有歷史漂移。

讀遠端：Management API `GET /v1/projects/{ref}/database/migrations`（唯讀）。刻意不用
`/database/query`——那個端點能跑任意 SQL。

結果三分（退出碼）：
  0 齊 —— 放行部署
  1 缺版本 —— 輪詢到 --max-wait 仍缺（整合套用通常在 CI 跑完前就完成；晚到時等一下）
  2 讀不到 —— HTTP 錯誤、逾時、網路錯誤、回應格式不符、沒有 token。不輪詢，直接失敗：
     讀不到不等於沒套，但也不能當成套了（fail-closed）

版本解析與 check-migration-versions.py 的 M2 同一格式（14 位數字前綴）；格式不符的檔名
略過——那是 M2 的職責，該檢查器會先在 CI 擋下。兩檔互相指向，不互相 import（scripts/ 無此慣例）。

決策邏輯放在純函式，fetch 與 sleep 可注入，好讓表格案例直接驗行為。免第三方依賴。

跑法：
  SUPABASE_ACCESS_TOKEN=… python3 scripts/check-remote-migrations.py --project-ref <ref> [--max-wait 600]
  python3 scripts/check-remote-migrations.py --self-test
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"

# 與 check-migration-versions.py 的 MIGRATION_NAME 同一版本格式（只取前綴）。
VERSION_PREFIX = re.compile(r"^(\d{14})_.+\.sql$")

API_BASE = "https://api.supabase.com/v1/projects"
REQUEST_TIMEOUT_S = 15

OK, MISSING, UNREADABLE = 0, 1, 2


class ReadError(Exception):
    """讀不到遠端清單（任何原因）。訊息只放狀態或例外類別，不放 token 與回應內文。"""


def repo_versions(filenames: list[str]) -> list[str]:
    out = set()
    for name in filenames:
        m = VERSION_PREFIX.match(name)
        if m:
            out.add(m.group(1))
    return sorted(out)


def parse_remote(payload: object) -> set[str]:
    """回應須為陣列、每個元素是含 version 的物件；version 一律轉字串。"""
    if not isinstance(payload, list):
        raise ReadError("回應格式不符：不是陣列")
    versions: set[str] = set()
    for item in payload:
        if not isinstance(item, dict) or item.get("version") in (None, ""):
            raise ReadError("回應格式不符：元素缺 version")
        versions.add(str(item["version"]))
    return versions


def missing_versions(repo: list[str], remote: set[str]) -> list[str]:
    return [v for v in repo if v not in remote]


def check(
    repo: list[str],
    fetch: Callable[[], object],
    sleep: Callable[[float], None],
    max_wait_s: float,
    interval_s: float,
) -> tuple[int, str]:
    """（紅燈 stub）"""
    return OK, ""


def http_fetch(project_ref: str, token: str) -> Callable[[], object]:
    """（紅燈 stub）"""
    def fetch() -> object:
        return []

    return fetch


def run(argv: list[str], env: dict[str, str]) -> int:
    def arg(name: str, default: str | None = None) -> str | None:
        return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default

    project_ref = arg("--project-ref") or env.get("SUPABASE_PROJECT_REF", "")
    max_wait = float(arg("--max-wait", "600") or 600)
    interval = float(arg("--interval", "30") or 30)
    token = env.get("SUPABASE_ACCESS_TOKEN", "")
    if not project_ref:
        print("::error::未指定 project ref（--project-ref 或 SUPABASE_PROJECT_REF）")
        return UNREADABLE
    if not token:
        print("::error::未設定 SUPABASE_ACCESS_TOKEN，讀不到目標環境的 migration 套用紀錄")
        return UNREADABLE

    repo = repo_versions(sorted(p.name for p in MIGRATIONS_DIR.glob("*.sql")))
    code, message = check(repo, http_fetch(project_ref, token), time.sleep, max_wait, interval)
    if code == OK:
        print(f"✅ {message}")
    else:
        print(f"::error::{message}")
        print("::error::處置：到 Supabase 儀表板確認 migration 套用紀錄（或整合是否失敗），套好後 Re-run。"
              "未套齊就部署 Edge，新函式呼叫舊 DB 會失敗。")
    summary = env.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"- Migration 套用確認：{'✅' if code == OK else '❌'} {message}\n")
    return code


# ----------------------------------------------------------------------------
# self-test
# ----------------------------------------------------------------------------
REPO = ["20260101000001", "20260101000002", "20260101000003"]


def _rows(*vs: object) -> list[dict]:
    return [{"version": v, "name": "x"} for v in vs]


def _fetcher(*responses: object) -> Callable[[], object]:
    """依序回傳；元素是 Exception 時拋出。"""
    queue = list(responses)

    def fetch() -> object:
        r = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(r, Exception):
            raise r
        return r

    return fetch


CHECK_CASES: list[tuple[str, Callable[[], object], float, int]] = [
    ("全齊", _fetcher(_rows(*REPO)), 600, OK),
    ("遠端多出不影響", _fetcher(_rows(*REPO, "20990101000001")), 600, OK),
    ("版本為數字型別也比得到", _fetcher(_rows(*(int(v) for v in REPO))), 600, OK),
    ("缺一支且等到上限", _fetcher(_rows(*REPO[:2])), 60, MISSING),
    ("遠端空清單", _fetcher([]), 0, MISSING),
    ("第二輪才齊", _fetcher(_rows(*REPO[:2]), _rows(*REPO)), 600, OK),
    ("回應不是陣列", _fetcher({"data": _rows(*REPO)}), 600, UNREADABLE),
    ("元素缺 version", _fetcher([{"name": "x"}]), 600, UNREADABLE),
    ("HTTP 401", _fetcher(ReadError("HTTP 401")), 600, UNREADABLE),
    ("HTTP 5xx 不輪詢", _fetcher(ReadError("HTTP 503"), _rows(*REPO)), 600, UNREADABLE),
    ("逾時", _fetcher(ReadError("TimeoutError")), 600, UNREADABLE),
    ("缺版本後讀取失敗", _fetcher(_rows(*REPO[:2]), ReadError("URLError")), 600, UNREADABLE),
]


def _http_case(exc: Exception) -> str:
    """把 urlopen 換成拋指定例外，回傳 ReadError 訊息（驗正規化）。"""
    original = urllib.request.urlopen

    def boom(*_a, **_k):
        raise exc

    urllib.request.urlopen = boom  # type: ignore[assignment]
    try:
        http_fetch("ref", "secret-token")()
    except ReadError as e:
        return str(e)
    finally:
        urllib.request.urlopen = original  # type: ignore[assignment]
    return "沒有拋 ReadError"


def self_test() -> int:
    failures: list[str] = []

    got = repo_versions(["20260101000002_b.sql", "20260101000001_a.sql", "README.md", "2026_bad.sql"])
    if got != ["20260101000001", "20260101000002"]:
        failures.append(f"repo_versions 略過格式不符檔名：得到 {got}")

    for label, fetch, max_wait, want in CHECK_CASES:
        slept: list[float] = []
        code, _ = check(REPO, fetch, slept.append, max_wait, 30)
        if code != want:
            failures.append(f"{label}：期望 {want}，得到 {code}")
        if want == UNREADABLE and label.startswith("HTTP 5xx") and slept:
            failures.append(f"{label}：讀取錯誤不得輪詢")

    for exc, want in [
        (urllib.error.HTTPError("u", 401, "x", {}, None), "HTTP 401"),  # type: ignore[arg-type]
        (TimeoutError("t"), "TimeoutError"),
        (urllib.error.URLError("dns"), "URLError"),
        (ConnectionResetError("r"), "ConnectionResetError"),
    ]:
        msg = _http_case(exc)
        if msg != want:
            failures.append(f"http_fetch 正規化 {type(exc).__name__}：期望 {want}，得到 {msg}")
        if "secret-token" in msg:
            failures.append("錯誤訊息不得含 token")

    import io
    from contextlib import redirect_stdout

    buf = io.StringIO()
    with redirect_stdout(buf):
        code = run(["--project-ref", "ref"], {"SUPABASE_ACCESS_TOKEN": ""})
    if code != UNREADABLE or "SUPABASE_ACCESS_TOKEN" not in buf.getvalue():
        failures.append(f"空 token：期望退出碼 2 並點名變數，得到 {code}")

    if failures:
        print("check-remote-migrations self-test: FAIL")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"check-remote-migrations self-test: OK（{len(CHECK_CASES) + 6} 條案例）")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv[1:]:
        sys.exit(self_test())
    sys.exit(run(sys.argv[1:], dict(os.environ)))
