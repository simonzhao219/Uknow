#!/usr/bin/env python3
"""測試命名的機械檢查——完整原則見 .claude/rules/test-naming.md。

存在理由:命名慣例只寫在文件裡一定會漂。2026-07 盤點時,同一層測試裡
中英文各半(vitest `it` 英文 23%、`Deno.test` 英文 15%),不是誰寫錯,
是沒有任何一層在檢查。訂了規則卻沒有閘門,等於沒訂。

規則(逐條對應 .claude/rules/test-naming.md):
  T1 敘述語言分層固定
     - vitest it/test、Deno.test、journey Scenario → 必須含中文
     - e2e/(mocked Gherkin)的關鍵字行 → 不得含中文
       例外:引號內的斷言值是**資料**不是名稱(UI 實際文字必須是中文)
  T2 測試名長度上限(棘輪)——過長代表一個測試在測太多件事
  T3 禁止空泛名(works / 正確 / 正常 …)——說不出「證明了什麼」
  T4 `*.unit.test.ts` 不得碰資料庫 helper
     這個檔名是 CI 分軌的依據(unit 軌不跑 supabase start),名實不符
     會讓快軌去連一個不存在的資料庫。

決策邏輯放在純函式裡,好讓表格案例直接驗行為(與 check-workflows.py、
.claude/hooks/ 的 decide() 同慣例)。刻意不 import 任何第三方套件——
framework-check 的契約是免依賴安裝。

跑法:
  python3 scripts/check-test-names.py              掃全 repo
  python3 scripts/check-test-names.py --self-test  跑表格案例(驗檢查器自己)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CJK = re.compile(r"[一-鿿]")

# 長度上限**必須分層**:中文每字的資訊量遠高於拉丁字母,同一個字元門檻
# 套到兩層會誤判。2026-07 實測:
#   中文層(vitest it / Deno.test / journey Scenario)  中位 27、p95 53、max 71
#   英文層(e2e Gherkin Scenario)                      中位 60、p95 78、max 107
# 門檻是棘輪:擋住「越寫越長」,不是要求現在就全部縮短。
MAX_LEN_ZH = 72
MAX_LEN_EN = 110

# 說不出「證明了什麼」的名字。整個名稱只有這些字時才算違規——
# 「正確」出現在長句裡(例:手機號碼格式不正確)完全沒問題。
VAGUE = {
    "works", "works correctly", "test", "tests", "ok", "should work",
    "正確", "正常", "成功", "失敗", "測試", "基本測試", "沒問題",
}

VITEST_CASE = re.compile(r"^\s*(?:it|test)\(\s*(['\"`])(.+?)\1\s*,", re.M)
DENO_CASE = re.compile(r"Deno\.test\(\s*(['\"])(.+?)\1")
SCENARIO = re.compile(r"^\s*Scenario(?: Outline)?:\s*(.+?)\s*$", re.M)
GHERKIN_LINE = re.compile(
    r"^\s*(Feature|Background|Scenario|Scenario Outline|Examples|Given|When|Then|And|But)\b"
)
DB_HELPERS = ("adminClient", "createTestUser", "payForUser", "getUserAccessToken", "postgres")


def _common(name: str, where: str, max_len: int = MAX_LEN_ZH) -> list[str]:
    """T2 / T3:所有層共用的規則(長度上限依層而定)。"""
    out = []
    if len(name) > max_len:
        out.append(f"{where}: 測試名 {len(name)} 字,超過 {max_len}——通常代表一個測試在測太多件事:{name[:40]}…")
    if name.strip().lower() in VAGUE:
        out.append(f"{where}: 測試名 {name!r} 太空泛,說不出證明了什麼")
    return out


def check_zh_cases(text: str, where: str, pattern: re.Pattern[str], group: int) -> list[str]:
    """T1(中文層)+ T2 + T3:vitest it/test、Deno.test、journey Scenario。"""
    out: list[str] = []
    for m in pattern.finditer(text):
        name = m.group(group)
        if not CJK.search(name):
            out.append(f"{where}: {name!r} 沒有中文——本層的敘述語言是中文(識別字仍用英文原樣)")
        out += _common(name, where)
    return out


def check_en_gherkin(text: str, where: str) -> list[str]:
    """T1(英文層):e2e/ 的 mocked Gherkin。

    引號內的斷言值先挖掉再檢查——那是 UI 的實際文字(必須是中文),
    是資料不是名稱。
    """
    out: list[str] = []
    for i, line in enumerate(text.splitlines(), 1):
        if not GHERKIN_LINE.match(line):
            continue
        without_values = re.sub(r"\"[^\"]*\"", '""', line)
        if CJK.search(without_values):
            out.append(
                f"{where}:{i}: Gherkin 關鍵字行含中文——e2e/ 的步驟文字與 "
                f"*_steps.py 的 @given 逐字綁定,本層固定英文:{line.strip()[:50]}"
            )
    for m in SCENARIO.finditer(text):
        out += _common(m.group(1), where, MAX_LEN_EN)
    return out


def check_unit_file_purity(name: str, text: str) -> list[str]:
    """T4:`*.unit.test.ts` 不得碰資料庫 helper。"""
    used = [h for h in DB_HELPERS if h in text]
    if used:
        return [
            f"{name}: 檔名是 *.unit.test.ts 卻用了 {used}——"
            "這個檔名是 CI 分軌的依據(unit 軌不跑 supabase start),"
            "需要資料庫請改名為 *.test.ts"
        ]
    return []


def scan() -> int:
    problems: list[str] = []

    for f in sorted((ROOT / "src").rglob("*.test.ts*")):
        rel = f.relative_to(ROOT)
        problems += check_zh_cases(f.read_text(encoding="utf-8"), str(rel), VITEST_CASE, 2)

    api = ROOT / "supabase" / "functions" / "api"
    if api.is_dir():
        for f in sorted(api.glob("*.test.ts")):
            text = f.read_text(encoding="utf-8")
            rel = str(f.relative_to(ROOT))
            problems += check_zh_cases(text, rel, DENO_CASE, 2)
            if f.name.endswith(".unit.test.ts"):
                problems += check_unit_file_purity(rel, text)

    for f in sorted((ROOT / "e2e" / "features").glob("*.feature")):
        problems += check_en_gherkin(f.read_text(encoding="utf-8"), str(f.relative_to(ROOT)))

    jdir = ROOT / "e2e" / "journey" / "features"
    if jdir.is_dir():
        for f in sorted(jdir.glob("*.feature")):
            problems += check_zh_cases(
                f.read_text(encoding="utf-8"), str(f.relative_to(ROOT)), SCENARIO, 1
            )

    for p in problems:
        print(f"FAIL: {p}")
    if not problems:
        print("check-test-names: OK")
    return 1 if problems else 0


# --- 表格案例:每筆是 (標籤, 檢查函式, 輸入, 預期違規數) ---
CASES: list[tuple[str, str, str, int]] = [
    ("vitest it 英文 → 違規", "zh_vitest", "  it('returns null when empty', () => {", 1),
    ("vitest it 中文 → 通過", "zh_vitest", "  it('空值時回傳 null', () => {", 0),
    ("vitest it 中文含英文識別字 → 通過", "zh_vitest", "  it('buildApiUrl 空路徑視為根路徑', () => {", 0),
    ("Deno.test 英文 → 違規", "zh_deno", "Deno.test('rejects an empty code', async () => {", 1),
    ("Deno.test 中文 → 通過", "zh_deno", "Deno.test('空推薦碼被拒', async () => {", 0),
    ("中文測試名過長 → 違規", "zh_vitest", "  it('" + "很" * 80 + "', () => {", 1),
    ("英文 Gherkin 60 字 → 通過(英文層門檻較寬)", "en_gherkin", "  Scenario: " + "a" * 60 + "\n", 0),
    ("英文 Gherkin 120 字 → 違規", "en_gherkin", "  Scenario: " + "a" * 120 + "\n", 1),
    ("測試名空泛 → 違規", "zh_vitest", "  it('正常', () => {", 1),
    ("Gherkin 英文 → 通過", "en_gherkin", "  Scenario: A member can log in\n", 0),
    ("Gherkin 情境名中文 → 違規", "en_gherkin", "  Scenario: 會員可以登入\n", 1),
    (
        "Gherkin 斷言值中文 → 通過(那是 UI 實際文字,是資料不是名稱)",
        "en_gherkin",
        '    Then I should see the text "已推薦 3 人"\n',
        0,
    ),
    (
        "*.unit.test.ts 用了 DB helper → 違規",
        "unit_purity",
        "import { adminClient } from './test-helpers.ts';",
        1,
    ),
    ("*.unit.test.ts 純函式 → 通過", "unit_purity", "import { assertEquals } from 'jsr:@std/assert@1';", 0),
]


def self_test() -> int:
    failures: list[str] = []
    for label, kind, snippet, want in CASES:
        if kind == "zh_vitest":
            got = len(check_zh_cases(snippet, "t", VITEST_CASE, 2))
        elif kind == "zh_deno":
            got = len(check_zh_cases(snippet, "t", DENO_CASE, 2))
        elif kind == "en_gherkin":
            got = len(check_en_gherkin(snippet, "t"))
        else:
            got = len(check_unit_file_purity("t.unit.test.ts", snippet))
        if got != want:
            failures.append(f"  FAIL: {label} — 預期 {want} 筆違規,實得 {got}")

    if failures:
        print("check-test-names 表格案例未過:")
        print("\n".join(failures))
        return 1
    print(f"check-test-names self-test: OK（{len(CASES)} 條案例）")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else scan())
