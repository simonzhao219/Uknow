#!/usr/bin/env python3
"""GitHub Actions 用量排行——各 workflow 的 job 分鐘數與月估。

存在理由(2026-08-07 額度事故的防線回填):GitHub UI 只給總量、run usage
API 的 billable 欄位已棄用(回 0),所以這支從 runs+jobs API 自己重算,讓
雙週框架整併時的用量 review 是機械動作而不是憑感覺。

⚠️ **本 repo 於 2026-08-07 轉為 public,標準 runner 免費且無上限——下面
算出來的分鐘數在 public 期間不代表金錢**。它現在的用途是讀「誰在拖長
回饋」:哪個 workflow 的 job 最多、最慢,以及頻率是否與價值相稱。真的要
看錢時,journey 的成本在 Supabase preview branch 而不在這裡。
(若日後改回 private,這個數字自動恢復成帳單意義:每 job 各自進位計費。)

跑法(本機,需 gh CLI 已登入;web session 沒有 gh):
  python3 scripts/actions-usage.py            # 過去 14 天
  python3 scripts/actions-usage.py --days 30  # 自訂窗口

計算模型:minutes(run) = Σ_jobs ceil((completed_at - started_at)/60s)
——skipped 的 job 為 0;cancelled 的 job 照其實際跑掉的時間計算。
進位到整分是**刻意保留**的:它讓「job 數量」的固定開銷顯性化(見
.claude/rules/github-actions.md 規則 8a),即使不再對應帳單。
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

REPO = "simonzhao219/Uknow"


def gh_api(path: str) -> dict:
    out = subprocess.run(
        ["gh", "api", path], capture_output=True, text=True, check=True
    ).stdout
    return json.loads(out)


def iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def run_billable_minutes(run_id: int) -> int:
    total = 0
    page = 1
    while True:
        d = gh_api(f"repos/{REPO}/actions/runs/{run_id}/jobs?per_page=100&page={page}")
        jobs = d.get("jobs", [])
        for j in jobs:
            if j.get("conclusion") == "skipped" or not j.get("completed_at"):
                continue
            secs = (iso(j["completed_at"]) - iso(j["started_at"])).total_seconds()
            if secs > 0:
                total += math.ceil(secs / 60)
        if len(jobs) < 100:
            return total
        page += 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    args = ap.parse_args()
    since = datetime.now(timezone.utc) - timedelta(days=args.days)

    per_wf: dict[str, list[int]] = defaultdict(list)
    page = 1
    while True:
        d = gh_api(
            f"repos/{REPO}/actions/runs?per_page=100&page={page}"
            f"&created=>{since.strftime('%Y-%m-%d')}"
        )
        runs = d.get("workflow_runs", [])
        for r in runs:
            per_wf[r["path"].rsplit("/", 1)[-1]].append(r["id"])
        if len(runs) < 100:
            break
        page += 1

    print(f"{REPO} 過去 {args.days} 天(每 job 進位到整分計)")
    print("※ repo 為 public 時標準 runner 免費——下列分鐘數讀的是"
          "「誰在拖長回饋」,不是帳單\n")
    print(f"{'workflow':<28}{'runs':>6}{'計費分':>8}{'月估':>8}")
    grand = 0
    for wf, ids in sorted(per_wf.items(), key=lambda kv: -len(kv[1])):
        mins = sum(run_billable_minutes(i) for i in ids)
        grand += mins
        print(f"{wf:<28}{len(ids):>6}{mins:>8}{round(mins * 30 / args.days):>8}")
    print(f"\n合計 {grand} 分,月估 {round(grand * 30 / args.days)} 分")
    print("排行看的是「哪一軌最慢、誰的 job 最多」;改回 private 時,"
          "這個數字才重新對應帳單(額度紅線 Free 2,000/Pro 3,000 分/月)。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
