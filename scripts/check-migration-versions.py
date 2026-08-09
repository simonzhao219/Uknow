#!/usr/bin/env python3
"""Supabase migration 檔名的機械檢查——版本號唯一、格式正確、順序不倒退。

存在理由(2026-08-07,PR #246):`20260807000002_custom_service_categories.sql`
與 #247 的 `20260807000002_member_verify_logs_comment.sql` 撞號。**三層閘門
全綠通過**:

  - git 不標成衝突——兩個不同檔名、各自新增,rebase 乾乾淨淨
  - CI 的 api-tests 抓不到——本地 `supabase start` 從零重播,兩支都跑得到
  - 型別檢查、biome、vitest 全部與檔名無關

失效只發生在**正式站部署**那一刻:Supabase 以檔名的數字前綴當版本鍵寫進
`supabase_migrations.schema_migrations`,重複版本會讓其中一支被當成已套用而
**靜默跳過**——沒有錯誤訊息,只有一個永遠不會被建立的 view,以及線上 404。

那次是靠人工比對 `ls` 的輸出才發現的。這支檢查器把它變成機械的。

規則:

  M1 版本號唯一 —— 兩個檔案共用同一個數字前綴 = 部署時必有一支被跳過。
     這是本檢查器存在的唯一理由,其餘規則是順手把同類問題一併關掉。

  M2 檔名格式 —— `<version>_<name>.sql`,version 為 14 位數字
     (`YYYYMMDDHHMMSS`,Supabase CLI 的產生格式)。格式不符的檔案,
     Supabase 解析版本號的行為未定義。

  M3 版本號不得早於已合併的最大值 —— 新 migration 的號碼比既有的小時,
     它在乾淨重播(新分支、journey 拋棄式分支)會**排在前面**執行,但在
     已部署的環境會**接在後面**執行。同一份 SQL 兩種執行順序,是 heisenbug
     的溫床。這條只在新增檔案時才有意義,故以「目錄整體是否遞增」表達。

決策邏輯放在純函式裡,好讓表格案例直接驗行為(與 check-document-naming.py、
check-workflows.py、.claude/hooks/ 的 decide() 同慣例)。刻意不 import 任何
第三方套件——framework-check 的契約是免依賴安裝。

跑法:
  python3 scripts/check-migration-versions.py              掃 supabase/migrations/
  python3 scripts/check-migration-versions.py --self-test  跑表格案例(驗檢查器自己)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"

# Supabase CLI 產生的格式:14 位數字 + 底線 + 名稱 + .sql
MIGRATION_NAME = re.compile(r"^(\d{14})_([a-z0-9_]+)\.sql$")


def check_filenames(filenames: list[str]) -> list[str]:
    """回傳違規訊息清單。純函式,無 I/O——傳入的是排序過的檔名。"""
    violations: list[str] = []

    # M2:格式。格式不符的檔案抽不出版本號,後面兩條無從檢查,故先擋。
    parsed: list[tuple[str, str]] = []
    for name in filenames:
        match = MIGRATION_NAME.match(name)
        if match is None:
            violations.append(
                f"M2 檔名格式不符 `<14 位數字>_<snake_case 名稱>.sql`:{name}"
                "(Supabase 解析版本號的行為未定義)"
            )
            continue
        parsed.append((match.group(1), name))

    # M1:版本號唯一。**這條是本檢查器的核心**——重複版本在部署時會讓其中
    # 一支被靜默跳過,而所有既有閘門都看不見它。
    seen: dict[str, list[str]] = {}
    for version, name in parsed:
        seen.setdefault(version, []).append(name)
    for version, names in sorted(seen.items()):
        if len(names) > 1:
            violations.append(
                f"M1 版本號 {version} 被 {len(names)} 個檔案共用:{'、'.join(sorted(names))}"
                "(Supabase 以版本號為鍵,部署時只會套用其中一支,另一支靜默跳過)"
            )

    # M3:版本號遞增。檔名排序與版本號排序必須一致——不一致代表有人補了一個
    # 號碼比既有小的 migration。
    versions = [version for version, _ in parsed]
    if versions != sorted(versions):
        violations.append(
            "M3 版本號未遞增:檔名字典序與版本號順序不一致"
            "(乾淨重播與已部署環境會得到不同的執行順序)"
        )

    return violations


def scan() -> int:
    if not MIGRATIONS_DIR.is_dir():
        print(f"check-migration-versions: 找不到 {MIGRATIONS_DIR},跳過")
        return 0

    filenames = sorted(p.name for p in MIGRATIONS_DIR.glob("*.sql"))
    violations = check_filenames(filenames)

    if violations:
        print("check-migration-versions 發現違規:")
        print("\n".join(f"  {v}" for v in violations))
        print(
            "\n修法:把後加入的那一支改成下一個未使用的版本號,"
            "\n並同步更新所有引用該檔名的地方(程式碼註解、規格書、測試檔頭)"
            "\n——規格書的引用有 check-spec-drift 驗證路徑存在,漏改會紅。"
        )
        return 1

    print(f"check-migration-versions: OK（{len(filenames)} 支 migration，版本號唯一且遞增）")
    return 0


# (標籤, 檔名清單, 預期違規數)
CASES: list[tuple[str, list[str], int]] = [
    ("版本號唯一且遞增 → 通過", ["20260101000001_a.sql", "20260101000002_b.sql"], 0),
    (
        "撞號 → 違規（PR #246 實際踩到的那個）",
        ["20260807000002_custom_service_categories.sql", "20260807000002_member_verify_logs_comment.sql"],
        1,
    ),
    (
        "三個檔案共用同一版本號 → 仍只報一條（同一個問題不重複刷版面）",
        ["20260101000001_a.sql", "20260101000001_b.sql", "20260101000001_c.sql"],
        1,
    ),
    (
        "兩組各自撞號 → 兩條",
        [
            "20260101000001_a.sql",
            "20260101000001_b.sql",
            "20260101000002_c.sql",
            "20260101000002_d.sql",
        ],
        2,
    ),
    ("空目錄 → 通過", [], 0),
    ("單一檔案 → 通過", ["20260101000001_only.sql"], 0),
    (
        "版本號位數不對 → 違規",
        ["2026010100001_too_short.sql"],
        1,
    ),
    (
        "缺底線與名稱 → 違規",
        ["20260101000001.sql"],
        1,
    ),
    (
        "名稱含大寫 → 違規（與 Supabase CLI 產生的格式不一致）",
        ["20260101000001_CamelCase.sql"],
        1,
    ),
    (
        "格式不符者抽不出版本號，不會連帶誤報 M1/M3",
        ["readme.sql", "20260101000001_a.sql"],
        1,
    ),
]


def self_test() -> int:
    failures: list[str] = []
    for label, filenames, want in CASES:
        # scan() 傳進來的一定是排序過的,表格案例照樣模擬
        got = len(check_filenames(sorted(filenames)))
        if got != want:
            failures.append(f"  FAIL: {label} — 預期 {want} 筆違規,實得 {got}")

    if failures:
        print("check-migration-versions 表格案例未過:")
        print("\n".join(failures))
        return 1
    print(f"check-migration-versions self-test: OK（{len(CASES)} 條案例）")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else scan())
