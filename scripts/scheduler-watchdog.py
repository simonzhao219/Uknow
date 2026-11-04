#!/usr/bin/env python3
"""pg_cron 排程的 GitHub 看門狗:決定要不要補跑、要不要推 LINE。

存在理由:對帳(每小時)與刊登照片清理(每日)改由 Supabase pg_cron 觸發
(pg-cron-schedulers)。GitHub 兩支 workflow 改當看門狗兼後備觸發:每次讀
`GET /internal/scheduler-health`,pg_cron 停擺就自己補跑並告警。決策邏輯放在
這裡的純函式,好讓表格案例(`--self-test`,framework-check 每次 CI 跑)直接驗
行為;workflow 只做 curl 與呼叫本腳本。不 import 第三方套件(framework-check
的契約是免依賴安裝)。

health 的形狀由 `scripts/fixtures/scheduler-health/shape.json` 釘住(Deno 的
scheduler-health.test.ts 讀同一份);self-test 逐份驗 `scenario-*.json` 的鍵都
屬於 shape.json。

對帳判準(由上往下取第一個命中;plan §2.5):

  R1 health 404(Edge 尚未部署／空窗)          → 補跑;不推
  R2 health 查詢失敗(非 200、非 404)          → 補跑;P1(6 小時節流)
  R3 cronJobPresent = false                    → 補跑;P1「排程不存在」(6 小時節流)
  R4 cronJobActive = false(人為停用)          → 補跑;P2,只在 UTC 01 時那一輪推
  R5 lastPgCronCompletedAt ≤ 90 分鐘           → 不補、不推
  R6 其餘(逾期或從未完成)                      → 補跑;P1「停擺」(6 小時節流)

  存活只看 pg_cron 的完成列(lastPgCronCompletedAt):GitHub 補跑寫的完成列
  不能刷新它,否則停擺期間每隔一小時才補一次、節流的桶也不會前進。

6 小時節流(無狀態):
  L = lastPgCronCompletedAt;P = 上一次成功的看門狗 run 的建立時間
  bucket(m) = floor((m - 90) / 360),m < 90 為負(未逾期)
  m_prev = 0 if L > P else P - L;bucket(now - L) != bucket(m_prev) 才推
  L 為 null 時,以「P 與現在是否落在不同的 UTC 6 小時格」判斷
  查不到 P 就推(寧可多推)

照片清理(每日 run):
  P1 lastCompletedAt > 26 小時(或從未完成、health 非 200)→ 補跑;推 P2
  P2 lastPurgeDryRun 與 repo var PHOTO_PURGE_LIVE 不一致(兩個方向)→ 推 P2

LINE body 前 200 字必須寫出結論與「下一步」(notify action 把 body 截在 200 字)。

跑法:
  python3 scripts/scheduler-watchdog.py reconcile --status 200 --health-file h.json \\
      --now 2026-11-20T01:37:03Z [--prev-run 2026-11-20T00:37:02Z]
  python3 scripts/scheduler-watchdog.py purge --status 200 --health-file h.json \\
      --now ... --repo-live true
  印出 JSON 決策;有 $GITHUB_OUTPUT 時寫入 backfill= / notify= / level= / title= / body=
  python3 scripts/scheduler-watchdog.py --self-test
"""
from __future__ import annotations

import json
import math
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "scheduler-health"
STALE_MINUTES = 90
THROTTLE_MINUTES = 360
PURGE_STALE_MINUTES = 26 * 60
PAUSED_PUSH_UTC_HOUR = 1
BODY_LIMIT = 200


@dataclass
class Decision:
    backfill: bool
    notify: bool = False
    level: str = ""
    title: str = ""
    body: str = ""
    rule: str = ""
    summary: list[str] = field(default_factory=list)


def _ts(v: str | None) -> datetime | None:
    if not v:
        return None
    return datetime.fromisoformat(v.replace("Z", "+00:00"))


def decide_reconcile(status: int, health: dict | None, now: datetime, prev_run: datetime | None) -> Decision:
    """階段 7 stub。"""
    return Decision(backfill=False)


def decide_purge(status: int, health: dict | None, now: datetime, repo_live: str) -> Decision:
    """階段 7 stub。"""
    return Decision(backfill=False)


# ---------------------------------------------------------------- self-test

def _key_paths(v: object, prefix: str = "") -> set[str]:
    if isinstance(v, dict):
        out: set[str] = set()
        for k, child in v.items():
            out.add(prefix + k)
            out |= _key_paths(child, f"{prefix}{k}.")
        return out
    return set()


def _scenario(name: str) -> dict:
    return json.loads((FIXTURES / f"scenario-{name}.json").read_text(encoding="utf-8"))["health"]


NOW = "2026-11-20T01:37:03Z"
PREV = "2026-11-20T00:37:02Z"  # 上一次看門狗 run(一小時前)

# (說明, 情境, (status, now, prev_run), 預期 backfill, 預期 notify, 預期 level, 預期 rule)
RECONCILE_CASES: list[tuple[str, str | None, tuple, bool, bool, str, str]] = [
    ("R5 正常：30 分鐘前 pg_cron 完成 → 不補不推", "healthy", (200, NOW, PREV), False, False, "", "R5"),
    ("R1 health 404 → 補跑、不推", None, (404, NOW, PREV), True, False, "", "R1"),
    ("R2 health 500、上次 run 在同一 6 小時格 → 補跑、不推", None, (500, NOW, PREV), True, False, "", "R2"),
    ("R2 health 500、跨過 6 小時格 → 補跑、推 P1", None, (500, "2026-11-20T06:37:03Z", "2026-11-20T05:37:02Z"), True, True, "P1", "R2"),
    ("R2 health 500、查不到上次 run → 推（寧可多推）", None, (500, NOW, None), True, True, "P1", "R2"),
    ("R3 cron.job 沒有排程 → 補跑、推 P1", "job-missing", (200, NOW, None), True, True, "P1", "R3"),
    ("R4 人為停用、UTC 01 時 → 補跑、推 P2", "paused", (200, NOW, PREV), True, True, "P2", "R4"),
    ("R4 人為停用、其他時段 → 補跑、不推", "paused", (200, "2026-11-20T05:37:03Z", PREV), True, False, "", "R4"),
    # stalled：L = 22:07:41，now 01:37 → m≈209；上次 run 00:37 → m_prev≈149。
    # bucket(209)=0、bucket(149)=0 → 同桶不推；但首次跨過 90 分的那次 run 會推（下一案）
    ("R6 停擺且最近完成列是 GitHub 補跑 → 仍判逾期、補跑；同桶不重推", "stalled", (200, NOW, PREV), True, False, "", "R6"),
    ("R6 停擺首次跨過 90 分 → 補跑、推 P1", "stalled", (200, "2026-11-19T23:40:00Z", "2026-11-19T23:30:00Z"), True, True, "P1", "R6"),
    ("R6 停擺持續、跨進下一個 6 小時桶 → 再推", "stalled", (200, "2026-11-20T05:40:00Z", "2026-11-20T05:00:00Z"), True, True, "P1", "R6"),
    ("R6 上次 run 之後 pg_cron 曾恢復（L > P）→ 視同首推", "stalled", (200, NOW, "2026-11-19T22:00:00Z"), True, True, "P1", "R6"),
    ("R6 從未完成、上次 run 在同一 6 小時格 → 補跑、不推", "never-completed", (200, NOW, PREV), True, False, "", "R6"),
    ("R6 從未完成、查不到上次 run → 推", "never-completed", (200, NOW, None), True, True, "P1", "R6"),
    ("R6 pg_net 401 → 推 P1 且 body 帶 401 診斷", "net-401", (200, "2026-11-19T23:40:00Z", "2026-11-19T23:30:00Z"), True, True, "P1", "R6"),
]

# (說明, 情境, (status, now, repo_live), 預期 backfill, 預期 notify, 預期 rule)
PURGE_CASES: list[tuple[str, str | None, tuple, bool, bool, str]] = [
    ("正常：6 小時前完成、實刪與 repo var 一致 → 不補不推", "healthy", (200, NOW, "true"), False, False, ""),
    ("P1 超過 26 小時沒完成 → 補跑、推 P2", "purge-stale", (200, NOW, "true"), True, True, "P1"),
    ("P1 health 404 → 補跑、不推（空窗）", None, (404, NOW, "true"), True, False, "P1"),
    ("P1 health 500 → 補跑、推 P2", None, (500, NOW, "true"), True, True, "P1"),
    ("P2 Edge dry-run、repo var 開 → 推 P2", "purge-dry-run", (200, NOW, "true"), False, True, "P2"),
    ("P2 Edge 實刪、repo var 沒開 → 推 P2", "healthy", (200, NOW, ""), False, True, "P2"),
    ("P2 兩邊都沒開 → 一致，不推", "purge-dry-run", (200, NOW, ""), False, False, ""),
]


def self_test() -> int:
    failures: list[str] = []
    shape = _key_paths(json.loads((FIXTURES / "shape.json").read_text(encoding="utf-8"))["data"])
    for f in sorted(FIXTURES.glob("scenario-*.json")):
        extra = _key_paths(json.loads(f.read_text(encoding="utf-8"))["health"]) - shape
        if extra:
            failures.append(f"  FAIL: [fixture] {f.name} 有 shape.json 沒有的鍵：{sorted(extra)}")

    for label, scen, (status, now, prev), want_bf, want_notify, want_level, want_rule in RECONCILE_CASES:
        d = decide_reconcile(status, _scenario(scen) if scen else None, _ts(now), _ts(prev))
        got = (d.backfill, d.notify, d.level, d.rule)
        want = (want_bf, want_notify, want_level, want_rule)
        if got != want:
            failures.append(f"  FAIL: [reconcile] {label} — 預期 {want},實得 {got}")
        if d.notify and "下一步" not in d.body[:BODY_LIMIT]:
            failures.append(f"  FAIL: [reconcile] {label} — LINE body 前 {BODY_LIMIT} 字沒有「下一步」")
        if label.startswith("R6 pg_net 401") and "401" not in d.body + " ".join(d.summary):
            failures.append(f"  FAIL: [reconcile] {label} — 診斷沒有帶出 401")

    for label, scen, (status, now, live), want_bf, want_notify, want_rule in PURGE_CASES:
        d = decide_purge(status, _scenario(scen) if scen else None, _ts(now), live)
        got = (d.backfill, d.notify, d.rule)
        if got != (want_bf, want_notify, want_rule):
            failures.append(f"  FAIL: [purge] {label} — 預期 {(want_bf, want_notify, want_rule)},實得 {got}")
        if d.notify and (d.level != "P2" or "下一步" not in d.body[:BODY_LIMIT]):
            failures.append(f"  FAIL: [purge] {label} — 照片清理的 LINE 要是 P2 且前 {BODY_LIMIT} 字含「下一步」")

    if failures:
        print("scheduler-watchdog 表格案例未過:")
        print("\n".join(failures))
        return 1
    print(f"scheduler-watchdog self-test: OK（{len(RECONCILE_CASES) + len(PURGE_CASES)} 條案例）")
    return 0


# ---------------------------------------------------------------- CLI

def _arg(argv: list[str], name: str) -> str:
    return argv[argv.index(name) + 1] if name in argv else ""


def main(argv: list[str]) -> int:
    if argv[:1] == ["--self-test"]:
        return self_test()
    if argv[:1] not in (["reconcile"], ["purge"]):
        print(__doc__)
        return 2
    status = int(_arg(argv, "--status") or "0")
    health = None
    path = _arg(argv, "--health-file")
    if status == 200 and path:
        try:
            body = json.loads(Path(path).read_text(encoding="utf-8"))
            health = body.get("data") if body.get("success") is True else None
        except (OSError, ValueError):
            health = None
        if health is None:
            status = 0  # 200 但讀不出 data → 當查詢失敗處理(R2)
    now = _ts(_arg(argv, "--now")) or datetime.now(timezone.utc)
    if argv[0] == "reconcile":
        d = decide_reconcile(status, health, now, _ts(_arg(argv, "--prev-run")))
    else:
        d = decide_purge(status, health, now, _arg(argv, "--repo-live"))
    print(json.dumps(d.__dict__, ensure_ascii=False))
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(f"backfill={'true' if d.backfill else 'false'}\n")
            fh.write(f"notify={'true' if d.notify else 'false'}\n")
            fh.write(f"level={d.level}\ntitle={d.title}\nrule={d.rule}\n")
            fh.write(f"body<<WATCHDOG_EOF\n{d.body}\nWATCHDOG_EOF\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
