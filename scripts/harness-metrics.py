#!/usr/bin/env python3
"""把 .claude/metrics/ 底下的 session 日誌彙總成人看得懂的數字。

存在理由:`.claude/hooks/decision_log.py` 負責**收**資料,但一份 JSONL 對人
的資訊量趨近於零。感測器沒有讀取器就只是在產生垃圾——沒人看的量測不會改變
任何決定,而不改變決定的量測不值得它的維護成本。

## 這份報表要回答的三個問題

1. **誤擋率**——哪個 hook 在擋東西,擋的頻率是不是高到不正常。friction-log
   有「誤擋」分類,代表這個專案在乎它,但至今只能靠人記得寫下來。
2. **skill 的命中率**——`feature-plan-guard/no-plan` 每出手一次,就是
   `/plan-feature` 那一層漏掉一次(skill 靠 description 比對觸發,是啟發式的;
   守衛是確定性的備援)。這個計數就是命中率的補數。
3. **改了 hook 之後有沒有變**——出手率是改 guard 判斷式時唯一的迴歸訊號。

## 不變式:無資料 ≠ 零問題

這是本檔最重要的一行設計。一個回報「誤擋率 0%」的讀取器,如果在「感測器
根本沒收到東西」時也印 0%,那它就是 friction-log 那則教訓的翻版——空轉與
健康長得一樣的檢查等於沒有檢查,而且比沒有更糟(它會讓人停止懷疑)。

所以沒有可解析的資料時,本檔明說「無資料」並列出該檢查什麼,絕不輸出百分比。
`--self-test` 有一條案例專門釘住這個行為。

跑法:
  python3 scripts/harness-metrics.py              讀本 repo 的日誌
  python3 scripts/harness-metrics.py --self-test  跑表格案例
framework-check.sh 會依序呼叫兩者(與其他 canary 同慣例:先驗自己再驗 repo)。
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
METRICS = ROOT / ".claude" / "metrics"
# 分片前(~2026-08-07)的共享單檔。**凍結**:decision_log.py 不再寫它,但那 458
# 個 session 仍是資料,所以照讀。見 decision_log.py 檔頭「為什麼一分支一個檔」。
LEGACY_LOG = METRICS / "sessions.jsonl"
# 現行落檔:一分支一個 .jsonl。讀取端一律 glob——分片是為了「寫」不衝突,
# 「讀」這邊本來就該把它們當成同一份日誌。
SHARD_DIR = METRICS / "sessions"

# 終端機裡 CJK 佔兩欄,而 f-string 的對齊數的是字元數。混排的表頭直接用
# f"{'出手':>8}" 會歪掉(第一版就歪了)。check-context-budget.py 的 token
# 估算也是為了同一件事在做 CJK 感知。
WIDE = re.compile(r"[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]")


def display_width(text: str) -> int:
    """字串在終端機的顯示寬度(CJK 字元算兩欄)。純函式。"""
    return len(text) + sum(1 for ch in text if WIDE.match(ch))


def ljust(text: str, width: int) -> str:
    """靠左對齊到顯示寬度。純函式。"""
    return text + " " * max(0, width - display_width(text))


def rjust(text: str, width: int) -> str:
    """靠右對齊到顯示寬度。純函式。"""
    return " " * max(0, width - display_width(text)) + text


# --------------------------------------------------------------- 純函式區


def parse_lines(lines: list[str]) -> tuple[list[dict], int]:
    """解析 JSONL,回傳 (可用的列, 壞掉的行數)。純函式。

    壞行單獨計數而不是靜默丟掉:感測器開始吐垃圾是需要被看見的事,
    悄悄跳過等於把故障偽裝成健康。
    """
    rows: list[dict] = []
    bad = 0
    for line in lines:
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            bad += 1
            continue
        if isinstance(row, dict) and "session" in row:
            rows.append(row)
        else:
            bad += 1
    return rows, bad


def _total(row: dict) -> int:
    return sum(row.get("fired", {}).values()) + sum(row.get("passed", {}).values())


def dedupe(rows: list[dict]) -> list[dict]:
    """同一個 session id 只留計數最完整的那筆。純函式。

    同一個 session 出現兩份快照有兩條路徑,都不是異常:.gitattributes 的
    merge=union 在同分支 rebase 後可能兩邊都留一份;session 中途換分支時,
    flush 會寫進新分支的分片,舊分支那份仍在。留總數最大的那筆——flush 是
    累加式的,所以數字最大的必定是最晚、最完整的那次。
    """
    best: dict[str, dict] = {}
    for row in rows:
        key = str(row.get("session", ""))
        if key not in best or _total(row) > _total(best[key]):
            best[key] = row
    return list(best.values())


def aggregate(rows: list[dict]) -> dict:
    """把多個 session 摺成每個 hook 與每條 rule 的總計。純函式。"""
    fired: dict[str, int] = {}
    passed: dict[str, int] = {}
    for row in rows:
        for key, n in row.get("fired", {}).items():
            fired[key] = fired.get(key, 0) + n
        for hook, n in row.get("passed", {}).items():
            passed[hook] = passed.get(hook, 0) + n

    hooks = sorted(set(passed) | {k.split("/", 1)[0] for k in fired})
    per_hook = {}
    for hook in hooks:
        f = sum(n for k, n in fired.items() if k.split("/", 1)[0] == hook)
        p = passed.get(hook, 0)
        per_hook[hook] = {"fired": f, "passed": p, "total": f + p}

    stamps = [str(r.get("started", "")) for r in rows if r.get("started")]
    return {
        "sessions": len(rows),
        "since": min(stamps)[:10] if stamps else "",
        "until": max(stamps)[:10] if stamps else "",
        "per_hook": per_hook,
        "rules": dict(sorted(fired.items(), key=lambda kv: -kv[1])),
    }


def render(agg: dict, bad: int) -> str:
    """把彙總結果排版成報表。純函式。

    無資料時回傳的是診斷指引而不是一張全 0 的表——見本檔開頭的不變式。
    """
    if agg["sessions"] == 0:
        lines = [
            "harness-metrics: 無資料（沒有任何可解析的 session）",
            "  這不是「零誤擋」,是感測器還沒收到東西——兩者的處置完全不同。",
            "  若這不符預期,依序檢查:",
            "    1. HARNESS_METRICS 是不是被設成 0",
            "    2. git config core.hooksPath 是不是 scripts/git-hooks（pre-commit 才是落檔點）",
            "    3. .claude/settings.json 的 hooks 區塊是不是合法 JSON",
        ]
        if bad:
            lines.append(f"  ⚠️ 另有 {bad} 行無法解析——感測器可能正在吐垃圾。")
        return "\n".join(lines)

    span = f"{agg['since']} ~ {agg['until']}" if agg["since"] else "期間未知"
    out = [f"harness-metrics: {agg['sessions']} 個 session（{span}）", ""]
    out.append("  " + ljust("hook", 24) + rjust("出手", 8) + rjust("放行", 10) + rjust("出手率", 10))
    for hook, s in sorted(agg["per_hook"].items(), key=lambda kv: -kv[1]["fired"]):
        rate = f"{s['fired'] / s['total'] * 100:.1f}%" if s["total"] else "—"
        out.append(
            "  " + ljust(hook, 24) + rjust(str(s["fired"]), 8)
            + rjust(str(s["passed"]), 10) + rjust(rate, 10)
        )

    if agg["rules"]:
        out += ["", "  出手明細（rule）"]
        out += [f"    {ljust(rule, 34)}{rjust(str(n), 6)}" for rule, n in agg["rules"].items()]

    if bad:
        out += ["", f"  ⚠️ {bad} 行無法解析——感測器可能正在吐垃圾。"]
    return "\n".join(out)


# ------------------------------------------------------------- self-test

PARSE_CASES = [
    ([], 0, 0, "空輸入"),
    (['{"session":"a"}'], 1, 0, "一行合法"),
    (["", "  "], 0, 0, "空白行不算壞行"),
    (["{壞掉"], 0, 1, "壞 JSON 計入 bad"),
    (["[1,2]"], 0, 1, "合法 JSON 但不是 session 物件"),
    (['{"no_session":1}'], 0, 1, "缺 session 鍵"),
]

DEDUPE_CASES = [
    ([{"session": "a", "passed": {"h": 1}}], 1, "單筆"),
    ([{"session": "a", "passed": {"h": 1}}, {"session": "b", "passed": {"h": 1}}], 2, "不同 session"),
    ([{"session": "a", "passed": {"h": 1}}, {"session": "a", "passed": {"h": 9}}], 1, "同 session 收斂成一筆"),
]


WIDTH_CASES = [
    ("hook", 4, "純 ASCII"),
    ("出手", 4, "兩個 CJK = 四欄"),
    ("出手率", 6, "三個 CJK = 六欄"),
    ("a出", 3, "混排"),
    ("12.5%", 5, "數字與符號"),
]


def self_test() -> int:
    failures: list[str] = []
    checked = 0

    for text, want, why in WIDTH_CASES:
        checked += 1
        if display_width(text) != want:
            failures.append(f"display_width[{why}]: 預期 {want},實得 {display_width(text)}")

    # 對齊後每一欄的顯示寬度必須真的相等——表格歪掉不影響正確性,但一份讀起來
    # 費力的報表不會有人讀,而沒人讀的量測等於沒有量測。
    checked += 1
    if display_width(ljust("出手", 10)) != display_width(ljust("hook", 10)):
        failures.append("ljust: CJK 與 ASCII 補齊後的顯示寬度不一致")
    checked += 1
    if display_width(rjust("出手率", 9)) != display_width(rjust("12.5%", 9)):
        failures.append("rjust: CJK 與 ASCII 補齊後的顯示寬度不一致")

    for lines, want_rows, want_bad, why in PARSE_CASES:
        rows, bad = parse_lines(lines)
        checked += 2
        if len(rows) != want_rows:
            failures.append(f"parse_lines[{why}]: 預期 {want_rows} 列,實得 {len(rows)}")
        if bad != want_bad:
            failures.append(f"parse_lines[{why}]: 預期 {want_bad} 壞行,實得 {bad}")

    for rows, want, why in DEDUPE_CASES:
        checked += 1
        if len(dedupe(rows)) != want:
            failures.append(f"dedupe[{why}]: 預期 {want} 筆,實得 {len(dedupe(rows))}")

    # 同 session 取計數最完整的那筆(flush 是累加式的,所以最大 = 最晚)
    merged = dedupe([{"session": "a", "passed": {"h": 1}}, {"session": "a", "passed": {"h": 9}}])
    checked += 1
    if merged[0]["passed"]["h"] != 9:
        failures.append(f"dedupe[取最完整那筆]: 預期 9,實得 {merged[0]['passed']['h']}")

    agg = aggregate(
        [
            {"session": "a", "started": "2026-07-26T00:00:00+00:00",
             "fired": {"bash-guard/no-verify": 2}, "passed": {"bash-guard": 8}},
            {"session": "b", "started": "2026-07-28T00:00:00+00:00",
             "fired": {"bash-guard/base-stale": 1}, "passed": {"tdd-test-guard": 4}},
        ]
    )
    for label, got, want in [
        ("session 數", agg["sessions"], 2),
        ("跨 session 合併 fired", agg["per_hook"]["bash-guard"]["fired"], 3),
        ("跨 session 合併 passed", agg["per_hook"]["bash-guard"]["passed"], 8),
        ("沒出手過的 hook 也要在表上", agg["per_hook"]["tdd-test-guard"]["fired"], 0),
        ("起始日", agg["since"], "2026-07-26"),
        ("結束日", agg["until"], "2026-07-28"),
    ]:
        checked += 1
        if got != want:
            failures.append(f"aggregate[{label}]: 預期 {want!r},實得 {got!r}")

    # 本檔最重要的一條:無資料**絕不能**印成 0%。空轉與健康長得一樣的檢查
    # 等於沒有檢查(friction-log 2026-07-25 的通則)。
    empty = render(aggregate([]), 0)
    checked += 2
    if "無資料" not in empty:
        failures.append("render[無資料]: 沒有明說「無資料」")
    if "%" in empty:
        failures.append(f"render[無資料]: 不得輸出百分比,實得:\n{empty}")

    # 壞行必須被看見,不論有沒有正常資料
    checked += 2
    if "無法解析" not in render(aggregate([]), 3):
        failures.append("render[無資料+壞行]: 沒有回報壞行")
    if "無法解析" not in render(agg, 3):
        failures.append("render[有資料+壞行]: 沒有回報壞行")

    if failures:
        print(f"harness-metrics --self-test: {len(failures)} 個案例失敗(共 {checked} 條)", file=sys.stderr)
        for f in failures:
            print(f"  FAIL {f}", file=sys.stderr)
        return 1
    print(f"harness-metrics --self-test: OK（{checked} 條案例）")
    return 0


def _read(path: Path) -> list[str]:
    try:
        return path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []


def collect_lines() -> list[str]:
    """凍結的歷史檔 + 所有分片,當成同一份日誌。

    排序過才讀,是為了讓兩次執行的輸出一致——glob 的順序是檔案系統決定的,
    不排序的話「壞行在第幾行」這種診斷會在不同機器上跳來跳去。
    """
    lines = _read(LEGACY_LOG)
    for shard in sorted(SHARD_DIR.glob("*.jsonl")):
        lines.extend(_read(shard))
    return lines


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()

    rows, bad = parse_lines(collect_lines())
    print(render(aggregate(dedupe(rows)), bad))

    # 唯一會讓本檔紅燈的情況:檔案裡有東西,但沒有一行讀得懂。那代表感測器
    # 正在寫出壞資料——「沒有資料」是可接受的初始狀態,「只有壞資料」不是。
    if bad and not rows:
        print("harness-metrics: 日誌裡沒有任何可解析的行", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
