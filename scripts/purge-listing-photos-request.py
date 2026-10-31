#!/usr/bin/env python3
"""purge-listing-photos.yml 的 request body 組裝與回應判讀。

存在理由:這支排程要刪的是**沒有備份**的 Storage 物件,而送出去的參數由
四個維度組合而成——觸發方式(schedule／dispatch)、repo variable
`PHOTO_PURGE_LIVE`、dispatch 的 `dry_run`／`force_ratio` 輸入、以及回應的
HTTP 狀態與 `notRemoved`。`reconcile-payments.yml` 把組裝與判讀內聯在
workflow 裡,那樣這些組合就沒有測試落點;抽到這裡,`--self-test` 由
framework-check 每次 CI 跑。

規則:

  B1 實刪只能是 JSON boolean false —— 排程觸發時,只有
     `PHOTO_PURGE_LIVE == 'true'` 才送 `dry_run: false`(W2-8 上線閘門);
     dispatch 時只有輸入字面量 `false` 才實刪。其餘(含空字串、大小寫
     不同的 `False`)一律 dry-run。
  B2 `force_ratio` 只有 dispatch 輸入字面量 `true` 才送 true;排程永不放行。
  B3 workflow 永遠不送 `include_names`——repo 是 public,回應裡不能有含
     會員 uid 的 name。

  J1 404:未開實刪時降為 warning 略過(晉升後到正式站部署核准前,端點還
     不存在);開了實刪(`PHOTO_PURGE_LIVE == 'true'`)或本輪送出 `dry_run: false`
     (手動 dispatch 實刪)還 404 就判失敗——否則排程會永遠靜默,手動實刪也會
     看似成功。
  J2 其餘非 200、`success` 不為 true、統計欄位缺漏或型別不符 → 失敗。
  J3 `notRemoved > 0` → 失敗(端點照常回 200,但有物件刪不掉、每輪霸佔額度)。
  J4 輸出只放 HTTP 狀態、`error.code`、斷路器 `reason`(anchor／ratio)與統計數字。**絕不印 `message`、
     `names` 或原始回應**:Storage 錯誤字串可能含 uid,Actions log 公開。

決策邏輯放在純函式裡,好讓表格案例直接驗行為(同 check-migration-versions.py
等的慣例)。不 import 第三方套件——framework-check 的契約是免依賴安裝。

跑法:
  python3 scripts/purge-listing-photos-request.py body --event schedule --live "$LIVE" \\
      --dry-input "$DRY" --force-input "$FORCE"         印出 request body(JSON)
  python3 scripts/purge-listing-photos-request.py judge --status 200 \\
      --body-file resp.json --live "$LIVE" --sent-file body.json   判讀回應;失敗 exit 1
      (有 $GITHUB_OUTPUT 時寫入 code= 與 stats=,給失敗 issue 用)
  python3 scripts/purge-listing-photos-request.py --self-test
"""
from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass, field

STAT_KEYS = (
    "candidateCount", "orphanTotal", "removed", "notRemoved", "totalObjects",
    "referencedUrls", "matchedUrls", "referencedOwners", "matchedOwners",
)


def build_body(event: str, live: str, dry_input: str, force_input: str) -> dict:
    """B1–B3:只回 dry_run 與 force_ratio 兩個 JSON boolean。"""
    if event == "workflow_dispatch":
        return {"dry_run": dry_input != "false", "force_ratio": force_input == "true"}
    return {"dry_run": live != "true", "force_ratio": False}


@dataclass
class Verdict:
    ok: bool
    code: str
    lines: list[str] = field(default_factory=list)
    stats: str = ""


def _stats_line(data: dict) -> str:
    mode = "dry-run" if data.get("dryRun") else "實刪"
    return f"{mode}：" + " ".join(f"{k}={data[k]}" for k in STAT_KEYS)


def judge(status: str, body_text: str, live: str, sent_dry_run: bool = True) -> Verdict:
    """J1–J4。lines 只含狀態、code、統計數字;原始回應一律不輸出。"""
    # curl 失敗時 -w 已印 000,呼叫端若再補一次會變兩行;只取最後一個三位數。
    codes = re.findall(r"\d{3}", status)
    status = codes[-1] if codes else "000"
    if status == "404":
        if live == "true" or not sent_dry_run:
            return Verdict(False, "not_deployed", ["::error::清理端點 404，但本輪要求實刪或已開 PHOTO_PURGE_LIVE：路由可能漏註冊"])
        return Verdict(True, "not_deployed", ["::warning::清理端點尚未部署（404），本輪略過。"])
    try:
        body = json.loads(body_text)
    except ValueError:
        body = None
    if status != "200":
        if status == "401":
            return Verdict(False, "unauthorized", ["::error::清理端點拒絕（401）：RECONCILE_SECRET 與後端不一致"])
        err = body.get("error") if isinstance(body, dict) else None
        code = err.get("code") if isinstance(err, dict) and isinstance(err.get("code"), str) else f"http_{status}"
        removed = body.get("removedSoFar") if isinstance(body, dict) else None
        removed = removed if isinstance(removed, int) and not isinstance(removed, bool) else "?"
        stats = f"removedSoFar={removed}"
        # 斷路器是哪一道(固定枚舉,不含 uid):anchor 不可放行,ratio 可 force_ratio。
        reason = err.get("reason") if isinstance(err, dict) else None
        if reason in ("anchor", "ratio"):
            stats += f" reason={reason}"
        return Verdict(False, code, [f"::error::清理失敗（HTTP {status}，code={code}，{stats}）"], stats)
    data = body.get("data") if isinstance(body, dict) and body.get("success") is True else None
    if (
        not isinstance(data, dict)
        or not isinstance(data.get("dryRun"), bool)
        or any(not isinstance(data.get(k), int) or isinstance(data.get(k), bool) for k in STAT_KEYS)
    ):
        return Verdict(False, "bad_shape", ["::error::清理回應形狀不符（HTTP 200 但缺 success／統計欄位）"])
    stats = _stats_line(data)
    if data["notRemoved"] > 0:
        return Verdict(False, "not_removed", [f"::error::有 {data['notRemoved']} 個物件未被 Storage 刪除；{stats}"], stats)
    return Verdict(True, "", [f"清理完成；{stats}"], stats)


def _arg(argv: list[str], name: str) -> str:
    return argv[argv.index(name) + 1] if name in argv else ""


def main(argv: list[str]) -> int:
    if argv[:1] == ["body"]:
        print(json.dumps(build_body(
            _arg(argv, "--event"), _arg(argv, "--live"), _arg(argv, "--dry-input"), _arg(argv, "--force-input"),
        )))
        return 0
    if argv[:1] == ["judge"]:
        path = _arg(argv, "--body-file")
        try:
            with open(path, encoding="utf-8") as f:
                text = f.read()
        except OSError:
            text = ""
        sent_dry_run = True
        try:
            with open(_arg(argv, "--sent-file"), encoding="utf-8") as f:
                sent_dry_run = json.load(f).get("dry_run") is not False
        except (OSError, ValueError, AttributeError):
            pass
        v = judge(_arg(argv, "--status"), text, _arg(argv, "--live"), sent_dry_run)
        print("\n".join(v.lines))
        out = os.environ.get("GITHUB_OUTPUT")
        if out:
            with open(out, "a", encoding="utf-8") as f:
                f.write(f"code={v.code}\nstats={v.stats}\n")
        return 0 if v.ok else 1
    print(__doc__)
    return 2


# ---------------------------------------------------------------------------
# 表格案例
# ---------------------------------------------------------------------------
UID = "11111111-2222-3333-4444-555555555555"

BODY_CASES: list[tuple[str, tuple[str, str, str, str], dict]] = [
    ("排程、LIVE 未設 → dry-run", ("schedule", "", "", ""), {"dry_run": True, "force_ratio": False}),
    ("排程、LIVE=true → 實刪", ("schedule", "true", "", ""), {"dry_run": False, "force_ratio": False}),
    ("排程、LIVE=TRUE（大小寫不同）→ dry-run", ("schedule", "TRUE", "", ""), {"dry_run": True, "force_ratio": False}),
    (
        "排程不吃 dispatch 輸入（即使殘留 false／true）",
        ("schedule", "", "false", "true"),
        {"dry_run": True, "force_ratio": False},
    ),
    (
        "dispatch dry_run=true → dry-run（LIVE=true 也不影響）",
        ("workflow_dispatch", "true", "true", "false"),
        {"dry_run": True, "force_ratio": False},
    ),
    (
        "dispatch dry_run=false → 實刪（LIVE 未設也照輸入）",
        ("workflow_dispatch", "", "false", "false"),
        {"dry_run": False, "force_ratio": False},
    ),
    ("dispatch dry_run 空字串 → dry-run", ("workflow_dispatch", "", "", ""), {"dry_run": True, "force_ratio": False}),
    (
        "dispatch force_ratio=true → 放行比例閘",
        ("workflow_dispatch", "", "false", "true"),
        {"dry_run": False, "force_ratio": True},
    ),
]


def _ok_body(**over) -> str:
    data = {
        "dryRun": True,
        "candidateCount": 3,
        "orphanTotal": 3,
        "removed": 0,
        "notRemoved": 0,
        "totalObjects": 100,
        "referencedUrls": 50,
        "matchedUrls": 50,
        "referencedOwners": 20,
        "matchedOwners": 20,
    }
    data.update(over)
    return json.dumps({"success": True, "data": data})


def _fail_body(code: str, reason: str | None = None) -> str:
    error = {"code": code, "message": f"storage down {UID}/1_a.jpg"}
    if reason:
        error["reason"] = reason
    return json.dumps({"success": False, "error": error, "removedSoFar": 7})


# (說明, (status, body, live[, 本輪送出的 dry_run]), 預期 ok, 預期 code)
JUDGE_CASES: list[tuple[str, tuple, bool, str]] = [
    ("200 dry-run 統計齊全 → 通過", ("200", _ok_body(), ""), True, ""),
    ("200 實刪全數刪除 → 通過", ("200", _ok_body(dryRun=False, removed=3), "true"), True, ""),
    ("200 但 notRemoved > 0 → 失敗", ("200", _ok_body(dryRun=False, removed=2, notRemoved=1), "true"), False, "not_removed"),
    ("200 但缺統計欄位 → 失敗", ("200", '{"success": true, "data": {"dryRun": true}}', ""), False, "bad_shape"),
    ("200 但統計欄位型別不符 → 失敗", ("200", _ok_body(removed="3"), ""), False, "bad_shape"),
    ("200 但 success 不為 true → 失敗", ("200", '{"success": false}', ""), False, "bad_shape"),
    ("200 但不是 JSON → 失敗", ("200", "<html>", ""), False, "bad_shape"),
    ("404 未開實刪 → warning 略過", ("404", "", ""), True, "not_deployed"),
    ("404 已開實刪 → 失敗（路由漏註冊不可靜默）", ("404", "", "true"), False, "not_deployed"),
    (
        "404 dispatch 實刪（LIVE 未設）→ 失敗（不可讓手動實刪看似成功）",
        ("404", "", "", False),
        False,
        "not_deployed",
    ),
    ("200 但缺 matchedOwners → 失敗", ("200", json.dumps({"success": True, "data": {**json.loads(_ok_body())["data"], "matchedOwners": None}}), ""), False, "bad_shape"),
    ("200 但缺 orphanTotal → 失敗", ("200", json.dumps({"success": True, "data": {**json.loads(_ok_body())["data"], "orphanTotal": None}}), ""), False, "bad_shape"),
    ("狀態碼重複輸出（curl 失敗時 000 兩次）→ 正規化為 000", ("000\n000", "", ""), False, "http_000"),
    ("狀態碼帶空白換行 → 正規化", (" 200\n", _ok_body(), ""), True, ""),
    ("401 → 失敗（密鑰不一致）", ("401", '{"success": false}', ""), False, "unauthorized"),
    ("500 circuit_open → 失敗並帶 code", ("500", _fail_body("circuit_open"), ""), False, "circuit_open"),
    ("500 sweep_failed → 失敗並帶 code", ("500", _fail_body("sweep_failed"), "true"), False, "sweep_failed"),
    ("000 連線失敗 → 失敗", ("000", "", ""), False, "http_000"),
    ("502 非 JSON → 失敗", ("502", "Bad Gateway", ""), False, "http_502"),
]


def self_test() -> int:
    failures: list[str] = []
    for label, args, want in BODY_CASES:
        got = build_body(*args)
        if got != want:
            failures.append(f"  FAIL: [body] {label} — 預期 {want},實得 {got}")
        if "include_names" in got:
            failures.append(f"  FAIL: [body] {label} — 不得送 include_names(B3)")
    for label, args, want_ok, want_code in JUDGE_CASES:
        v = judge(*args)
        if (v.ok, v.code) != (want_ok, want_code):
            failures.append(f"  FAIL: [judge] {label} — 預期 ok={want_ok} code={want_code!r},實得 ok={v.ok} code={v.code!r}")
        out = "\n".join(v.lines)
        if UID in out or "storage down" in out:
            failures.append(f"  FAIL: [judge] {label} — 輸出含 message／uid(J4):{out[:120]}")
    # 斷路器的 reason 要出現在輸出與 stats,業主才分得出能不能 force_ratio
    for reason in ("anchor", "ratio"):
        v = judge("500", _fail_body("circuit_open", reason), "")
        if f"reason={reason}" not in "\n".join(v.lines) or f"reason={reason}" not in v.stats:
            failures.append(f"  FAIL: [judge] circuit_open 的 reason={reason} 未出現在輸出或 stats")
    ok = judge("200", _ok_body(orphanTotal=900), "")
    if "orphanTotal=900" not in ok.stats:
        failures.append("  FAIL: [judge] stats 應含 orphanTotal")
    if "matchedOwners=20" not in ok.stats or "referencedOwners=20" not in ok.stats:
        failures.append("  FAIL: [judge] stats 應含 referencedOwners／matchedOwners（錨點依據）")
    # 回應帶 names(例如有人誤送 include_names)時,輸出也不能印出來
    leaked = judge("200", _ok_body(names=[f"{UID}/1_a.jpg"]), "")
    if UID in "\n".join(leaked.lines):
        failures.append("  FAIL: [judge] 回應含 names 時輸出不得印出 name(J4)")

    if failures:
        print("purge-listing-photos-request 表格案例未過:")
        print("\n".join(failures))
        return 1
    print(f"purge-listing-photos-request self-test: OK（{len(BODY_CASES) + len(JUDGE_CASES) + 1} 條案例）")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else main(sys.argv[1:]))
