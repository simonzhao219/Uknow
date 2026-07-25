#!/usr/bin/env python3
"""規格書漂移的機械檢查——把「規格書說的」與「程式碼做的」逐條對上。

存在理由(2026-07-25 文件整理的防線回填):`docs/Uknow_Software_Specification.md`
是 `plan-reviewer-requirements` 的溯源對象——契約寫明「規劃書的功能斷言對不到
規格書章節 → 一律 P0」。那次整理發現規格書有多處與實作**相反**(金流商、獎金
120P vs 100P、推薦王門檻 10 vs 8、已移除的任務、路由大小寫),而規格書失真時
這道閘門不是失效而是**反向作用**:用作廢的規則 P0 擋掉正確的規劃。

更關鍵的是它**怎麼漏掉的**:同一組落差被三份文件各自獨立記錄過,每個發現者都
在自己的文件裡註記「以程式碼為準」繞過去,沒有人回頭修上游。落差被記了三次卻
一次都沒被消除——**旁註是繞道,不是修復**。人工比對顯然不會發生第二次,所以
要有機器。

## 設計原則

1. **兩邊都從真實檔案抽取**,不設「規格書專用的機器可讀錨點」。錨點本身會與
   它旁邊的散文漂移,那只是把問題搬個位置。
2. **抽不到 = 失敗**,不是略過。若有人改寫規格書措辭讓抽取式失配,檢查必須紅
   ——否則這個閘門會靜默變成 no-op,而那正是 friction-log 的教訓:
   **宣稱有的治理若不生效,比沒有治理更貴**(沒人會再去看它)。
3. **SQL 常數取「最後定義者」**。本專案的金流函數以 `create or replace` 覆寫
   多版(`v_fee` 同時存在於 0718000101 與 0720000001),依檔名排序取最後一個
   命中的檔案,語意才跟資料庫實際生效的版本一致。

## 四類檢查

- `constant_violations` 可驗證常數(獎金、門檻、費用、上限、長度限制)
- `route_violations`    §3 路由表 vs `src/App.tsx` 的 `<Route path>` 集合對照
- `enum_violations`     狀態機與分類列舉(提領狀態、獎勵來源分類)
- `path_violations`     規格書引用的檔案路徑是否存在(引用腐爛)

決策邏輯全在純函式裡,好讓表格案例直接驗行為(與 `.claude/hooks/` 的 `decide()`
及 `check-workflows.py` 的 `violations()` 同慣例)。刻意只用標準庫——
framework-check 的契約是免依賴安裝。

跑法:
  python3 scripts/check-spec-drift.py              實掃
  python3 scripts/check-spec-drift.py --self-test  跑表格案例(驗檢查器自己)
framework-check.sh 會依序呼叫兩者。
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC_REL = "docs/Uknow_Software_Specification.md"
APP_REL = "src/App.tsx"

BACKTICKED = re.compile(r"`([^`]+)`")


def _num(text: str) -> int:
    """把 '1,200' / '１２' 這類寫法正規化成 int。"""
    return int(re.sub(r"[,，\s]", "", text))


# ============================================================
# 1. 可驗證常數
# ============================================================


@dataclass(frozen=True)
class ConstantRule:
    label: str
    spec_re: str  # group(1) = 規格書寫的數字
    code_glob: str  # 程式碼真相的來源(可 glob;依檔名排序取最後命中者)
    code_re: str  # group(1) = 程式碼的數字


CONSTANTS: tuple[ConstantRule, ...] = (
    ConstantRule(
        "推薦獎金（每代）",
        r"每代 \*\*([\d,]+) P\*\*",
        "supabase/migrations/*.sql",
        r"referral_reward_amount\s+integer not null default (\d+)",
    ),
    ConstantRule(
        "推薦王月門檻",
        r"累積滿 \*\*([\d,]+) 位\*\*",
        "supabase/migrations/*.sql",
        r"referral_king_monthly_threshold\s+integer not null default (\d+)",
    ),
    ConstantRule(
        "提領手續費",
        r"每筆固定 \*\*([\d,]+) P\*\*",
        "supabase/migrations/*.sql",
        r"v_fee\s+constant int := (\d+)",
    ),
    ConstantRule(
        "提領下限",
        r"金額 ≥ \*\*([\d,]+)\*\*",
        "supabase/migrations/*.sql",
        r"v_min\s+constant int := (\d+)",
    ),
    ConstantRule(
        "提領單日上限",
        r"單日上限 ([\d,]+)\*\*",
        "supabase/migrations/*.sql",
        r"v_daily_cap\s+constant int := (\d+)",
    ),
    ConstantRule(
        "年費金額",
        r"\*\*年繳 \$([\d,]+)\*\*",
        "src/utils/constants.ts",
        r"YEARLY_PRICE = (\d+)",
    ),
    ConstantRule(
        "刊登名稱長度上限",
        r"名稱長度 \| 最多 ([\d,]+) 字",
        "src/utils/constants.ts",
        r"NAME_MAX_LENGTH = (\d+)",
    ),
    ConstantRule(
        "服務介紹長度上限",
        r"服務介紹 \| 最多 ([\d,]+) 字",
        "src/utils/constants.ts",
        r"DESCRIPTION_MAX_LENGTH = (\d+)",
    ),
    ConstantRule(
        "刊登照片張數上限",
        r"照片 \| 最多 ([\d,]+) 張",
        "src/utils/constants.ts",
        r"MAX_PHOTO_COUNT = (\d+)",
    ),
    ConstantRule(
        "刊登單張照片大小上限（MB）",
        r"單張 ≤ ([\d,]+) MB",
        "src/utils/constants.ts",
        r"MAX_PHOTO_SIZE = (\d+) \* 1024 \* 1024",
    ),
)


def _last_match(sources: dict[str, str], glob: str, pattern: str) -> tuple[str, str] | None:
    """依檔名排序找最後一個命中 pattern 的來源,回傳 (檔名, 值)。

    金流函數被 create or replace 覆寫多版時,最後一版才是資料庫實際生效的。
    """
    rx = re.compile(pattern)
    hit: tuple[str, str] | None = None
    for name in sorted(sources):
        if not Path(name).match(glob):
            continue
        found = rx.findall(sources[name])
        if found:
            hit = (name, found[-1])
    return hit


def constant_violations(
    spec_text: str, sources: dict[str, str], rules: tuple[ConstantRule, ...] = CONSTANTS
) -> list[str]:
    """比對規格書寫的數字與程式碼的真相。抽不到任一邊都算違規。

    rules 可覆寫,讓表格案例用單一規則驗行為而不必造出整份規格書。
    """
    found: list[str] = []

    for rule in rules:
        spec_hits = re.findall(rule.spec_re, spec_text)
        if not spec_hits:
            found.append(
                f"{rule.label}：在規格書裡找不到 /{rule.spec_re}/。"
                "措辭若有調整，請同步更新 scripts/check-spec-drift.py 的抽取式"
                "——抽不到就當通過會讓這道閘門靜默失效。"
            )
            continue
        if len({_num(h) for h in spec_hits}) > 1:
            found.append(
                f"{rule.label}：規格書內出現不一致的值 {sorted({_num(h) for h in spec_hits})}"
                "——同一個常數在文件內就自相矛盾。"
            )
            continue

        code = _last_match(sources, rule.code_glob, rule.code_re)
        if code is None:
            found.append(
                f"{rule.label}：在 {rule.code_glob} 找不到 /{rule.code_re}/。"
                "程式碼若已改寫，請同步更新本檢查器的抽取式。"
            )
            continue

        code_file, code_val = code
        if _num(spec_hits[0]) != _num(code_val):
            found.append(
                f"{rule.label}：規格書寫 {_num(spec_hits[0])}，"
                f"但 {code_file} 是 {_num(code_val)}——以程式碼為準，回頭修規格書。"
            )

    return found


# ============================================================
# 2. 路由集合對照
# ============================================================

SPEC_SECTION_3 = re.compile(r"^## 3\..*?(?=^## )", re.MULTILINE | re.DOTALL)
ROUTE_ATTR = re.compile(r'path="([^"]+)"')


def _spec_routes(spec_text: str) -> set[str] | None:
    """抽 §3 路由表第一欄的路由。找不到該節回 None(與空集合區分)。"""
    section = SPEC_SECTION_3.search(spec_text)
    if not section:
        return None

    routes: set[str] = set()
    for line in section.group(0).splitlines():
        line = line.strip()
        if not line.startswith("|") or set(line) <= set("|- "):
            continue
        cells = line.split("|")
        if len(cells) < 2:
            continue
        # 只看第一欄——描述欄也可能出現反引號路徑（如「導回 `/`」），
        # 掃整列會把它誤當成宣告的路由。
        for token in BACKTICKED.findall(cells[1]):
            if token.startswith("/") or token == "*":
                routes.add(token)
    return routes


def route_violations(spec_text: str, app_text: str) -> list[str]:
    spec_routes = _spec_routes(spec_text)
    if spec_routes is None:
        return ["路由對照：規格書找不到「## 3.」章節，無法抽取路由表。"]
    if not spec_routes:
        return ["路由對照：規格書 §3 的路由表抽不到任何路由（表格格式可能已變動）。"]

    app_routes = set(ROUTE_ATTR.findall(app_text))
    if not app_routes:
        return [f"路由對照：{APP_REL} 抽不到任何 <Route path>（元件寫法可能已變動）。"]

    found: list[str] = []
    if missing := sorted(app_routes - spec_routes):
        found.append(
            f"路由對照：程式碼有但規格書 §3 沒列的路由 {missing}"
            "——新頁面上線後規格書要一起更新。"
        )
    if extra := sorted(spec_routes - app_routes):
        found.append(
            f"路由對照：規格書 §3 列了但程式碼沒有的路由 {extra}"
            "——路由被改名或移除時規格書漏改（歷史上 /serviceProviders 就是這樣長期失真）。"
        )
    return found


# ============================================================
# 3. 列舉（狀態機 / 分類）
# ============================================================


@dataclass(frozen=True)
class EnumRule:
    label: str
    spec_re: str  # group(1) = 含反引號列舉的規格書片段
    code_glob: str
    code_re: str  # group(1) = 含引號列舉的程式碼片段
    ignore: frozenset[str] = field(default=frozenset())


ENUMS: tuple[EnumRule, ...] = (
    EnumRule(
        "提領狀態機",
        # 用 [^\n]* 而非 .*：enum_violations 為了 §8.4 的跨行表格開了 re.DOTALL，
        # 這裡若寫 .* 會一路吃到文件結尾，把全文的反引號識別字都當成狀態值。
        r"^(`pending` → [^\n]*)$",
        "supabase/migrations/*.sql",
        r"withdrawals_status_check\s*\n?\s*check \(status in \(([^)]*)\)",
    ),
    EnumRule(
        "獎勵來源分類",
        r"### 8\.4 .*?\n(.*?)(?=\n#{2,3} )",
        "supabase/functions/_shared/api-contract.ts",
        r"REWARD_SOURCE_CATEGORIES = \[([^\]]*)\]",
    ),
)

QUOTED = re.compile(r"['\"]([a-z_]+)['\"]")


def enum_violations(spec_text: str, sources: dict[str, str]) -> list[str]:
    found: list[str] = []

    for rule in ENUMS:
        spec_hit = re.search(rule.spec_re, spec_text, re.MULTILINE | re.DOTALL)
        if not spec_hit:
            found.append(
                f"{rule.label}：在規格書裡找不到 /{rule.spec_re}/——"
                "章節措辭若有調整，請同步更新本檢查器的抽取式。"
            )
            continue
        spec_values = {
            t for t in BACKTICKED.findall(spec_hit.group(1)) if re.fullmatch(r"[a-z_]+", t)
        } - rule.ignore

        code = _last_match(sources, rule.code_glob, rule.code_re)
        if code is None:
            found.append(f"{rule.label}：在 {rule.code_glob} 找不到 /{rule.code_re}/。")
            continue
        code_file, code_blob = code
        code_values = set(QUOTED.findall(code_blob)) - rule.ignore

        if not spec_values or not code_values:
            found.append(f"{rule.label}：任一邊抽不到列舉值（規格 {spec_values}／程式碼 {code_values}）。")
            continue

        if missing := sorted(code_values - spec_values):
            found.append(f"{rule.label}：程式碼有但規格書沒寫的值 {missing}（來源 {code_file}）。")
        if extra := sorted(spec_values - code_values):
            found.append(f"{rule.label}：規格書寫了但程式碼沒有的值 {extra}（來源 {code_file}）。")

    return found


# ============================================================
# 4. 引用路徑存活
# ============================================================

# 保守判定：看起來像 repo 內檔案才驗（含副檔名，或是 migration 檔名）。
PATHISH = re.compile(r"^[\w./{},:-]+\.(ts|tsx|sql|md|py|json|sh|css)$")
# 大括號展開：src/components/{A,B}.tsx
BRACES = re.compile(r"^(.*)\{([^}]*)\}(.*)$")
# 相對引用可能省略的前綴（規格書常寫 _shared/api-contract.ts）
BASES = ("", "supabase/migrations/", "supabase/functions/", "docs/", "src/")


def _expand(token: str) -> list[str]:
    m = BRACES.match(token)
    if not m:
        return [token]
    head, body, tail = m.groups()
    return [f"{head}{part}{tail}" for part in body.split(",")]


def path_violations(spec_text: str, exists) -> list[str]:
    """規格書裡引用的檔案路徑必須存在。exists(rel_path) -> bool 由呼叫端注入。"""
    missing: list[str] = []
    for token in dict.fromkeys(BACKTICKED.findall(spec_text)):  # 去重且保序
        for candidate in _expand(token.strip()):
            if not PATHISH.match(candidate):
                continue
            if not any(exists(base + candidate) for base in BASES):
                missing.append(candidate)
    if missing:
        return [
            "引用腐爛：規格書提到但 repo 裡找不到的檔案 "
            f"{sorted(set(missing))}——檔案被移動/改名/刪除時要一起更新規格書。"
        ]
    return []


# ============================================================
# 表格案例：每筆是 (標籤, 執行函式, 預期違規數)
# ============================================================

_SPEC_OK = """# 規格書

## 3. 路由與存取控制

| 路由 | 頁面 | 存取層級 |
|---|---|---|
| `/` | 首頁 | 公開 |
| `/tasks` | 任務 | 會籍 |
| `*` | 未匹配路由導回首頁 | — |

## 8. 獎勵系統

- **發放金額**：每代 **100 P**，付款當下一次發清。

### 8.4 獎勵明細的來源分類

| 分類 | 語意 |
|---|---|
| `referral_signup` | 拉新 |
| `referral_renewal` | 續約 |

## 10. 提領系統

| 3 | 金額 ≥ **1,000**、為 **1,000 的倍數**、≤ **單日上限 8,000** | x |

### 10.3 狀態機

`pending` → `awaiting_collection` → `completed`／`rejected`

## 11. 附錄
"""

_SOURCES_OK = {
    "supabase/migrations/20260101000001_a.sql": "v_min        constant int := 999;\n",
    "supabase/migrations/20260101000002_b.sql": (
        "v_min        constant int := 1000;\n"
        "v_daily_cap  constant int := 8000;\n"
        "alter table public.withdrawals add constraint withdrawals_status_check\n"
        "  check (status in ('pending', 'awaiting_collection', 'completed', 'rejected'));\n"
    ),
    "supabase/functions/_shared/api-contract.ts": (
        "export const REWARD_SOURCE_CATEGORIES = [\n"
        "  'referral_signup',\n"
        "  'referral_renewal',\n"
        "] as const;\n"
    ),
}

_APP_OK = """
<Route path="/" element={<Home />} />
<Route path="/tasks" element={<Tasks />} />
<Route path="*" element={<Navigate to="/" replace />} />
"""

_MIN_RULE = ConstantRule(
    "提領下限", r"金額 ≥ \*\*([\d,]+)\*\*", "supabase/migrations/*.sql", r"v_min\s+constant int := (\d+)"
)


def _only(rules: tuple[ConstantRule, ...], spec: str, sources: dict[str, str]) -> list[str]:
    """用指定的規則子集跑常數檢查（表格案例專用）。"""
    return constant_violations(spec, sources, rules)


CASES: list[tuple[str, object, int]] = [
    # --- 常數 ---
    ("常數一致 → 通過", lambda: _only((_MIN_RULE,), _SPEC_OK, _SOURCES_OK), 0),
    (
        "常數不一致 → 違規（120P vs 100P 那類漂移）",
        lambda: _only((_MIN_RULE,), _SPEC_OK.replace("金額 ≥ **1,000**", "金額 ≥ **500**"), _SOURCES_OK),
        1,
    ),
    (
        "取最後一個 migration 的定義（create or replace 語意）",
        # 較早的 a.sql 是 999、較晚的 b.sql 是 1000；規格書寫 1000 應通過
        lambda: _only((_MIN_RULE,), _SPEC_OK, _SOURCES_OK),
        0,
    ),
    (
        "規格書措辭改動導致抽不到 → 違規（不可靜默略過）",
        lambda: _only((_MIN_RULE,), _SPEC_OK.replace("金額 ≥ **1,000**", "金額至少一千"), _SOURCES_OK),
        1,
    ),
    (
        "程式碼抽不到 → 違規",
        lambda: _only((_MIN_RULE,), _SPEC_OK, {"supabase/migrations/x.sql": "-- 什麼都沒有\n"}),
        1,
    ),
    (
        "規格書內同一常數自相矛盾 → 違規",
        lambda: _only(
            (_MIN_RULE,), _SPEC_OK + "\n又一次：金額 ≥ **2,000**\n", _SOURCES_OK
        ),
        1,
    ),
    # --- 路由 ---
    ("路由集合相同 → 通過", lambda: route_violations(_SPEC_OK, _APP_OK), 0),
    (
        "程式碼多一條路由 → 違規",
        lambda: route_violations(_SPEC_OK, _APP_OK + '<Route path="/new" />'),
        1,
    ),
    (
        "規格書多一條路由 → 違規（路由改名時的形態）",
        lambda: route_violations(_SPEC_OK.replace("| `/tasks` |", "| `/taskCenter` |"), _APP_OK),
        2,  # 程式碼有而規格沒有 + 規格有而程式碼沒有，各一筆
    ),
    (
        "描述欄的反引號路徑不可被誤當成宣告的路由",
        # `*` 那列描述欄若寫「導回 `/`」，掃整列會多抽出一個 `/`；只看第一欄才對
        lambda: route_violations(
            _SPEC_OK.replace("| `*` | 未匹配路由導回首頁 | — |", "| `*` | 導回 `/dashboard` | — |"),
            _APP_OK,
        ),
        0,
    ),
    ("規格書缺 §3 章節 → 違規", lambda: route_violations("# 空的\n", _APP_OK), 1),
    ("App.tsx 抽不到路由 → 違規", lambda: route_violations(_SPEC_OK, "// 沒有路由\n"), 1),
    # --- 列舉 ---
    ("列舉一致 → 通過", lambda: enum_violations(_SPEC_OK, _SOURCES_OK), 0),
    (
        "程式碼多一個狀態 → 違規",
        lambda: enum_violations(
            _SPEC_OK,
            {
                **_SOURCES_OK,
                "supabase/migrations/20260101000003_c.sql": (
                    "alter table public.withdrawals add constraint withdrawals_status_check\n"
                    "  check (status in ('pending', 'awaiting_collection', 'completed',"
                    " 'rejected', 'frozen'));\n"
                ),
            },
        ),
        1,
    ),
    (
        "規格書多寫一個狀態 → 違規",
        lambda: enum_violations(
            _SPEC_OK.replace("`completed`／`rejected`", "`completed`／`rejected`／`refunded`"),
            _SOURCES_OK,
        ),
        1,
    ),
    (
        "狀態機抽取不可跨行吃到全文（DOTALL 迴歸）",
        # 初版寫 `^(`pending` → .*)$` 且開了 re.DOTALL，.* 一路吃到文件結尾，
        # 把全文所有反引號識別字都當成狀態值誤報。實掃時才發現。
        lambda: enum_violations(
            _SPEC_OK + "\n## 附錄\n\n`profiles`、`system_alerts`、`announcements`\n",
            _SOURCES_OK,
        ),
        0,
    ),
    # --- 路徑存活 ---
    ("引用的檔案都存在 → 通過", lambda: path_violations("見 `src/App.tsx`", lambda p: True), 0),
    ("引用的檔案不存在 → 違規", lambda: path_violations("見 `src/Gone.tsx`", lambda p: False), 1),
    (
        "非路徑的反引號（識別字、狀態值）不誤判",
        lambda: path_violations("`reward_config`、`active`、`pending`", lambda p: False),
        0,
    ),
    (
        "大括號展開後逐一驗（src/components/{A,B}.tsx）",
        lambda: path_violations(
            "`src/components/{A,B}.tsx`", lambda p: p.endswith("A.tsx")
        ),
        1,  # B.tsx 不存在
    ),
]


def self_test() -> int:
    failures: list[str] = []
    for label, run, want in CASES:
        got = len(run())  # type: ignore[operator]
        if got != want:
            failures.append(f"  FAIL: {label} — 預期 {want} 筆違規，實得 {got}")

    if failures:
        print("check-spec-drift 表格案例未過:")
        print("\n".join(failures))
        return 1
    print(f"check-spec-drift self-test: OK（{len(CASES)} 條案例）")
    return 0


def _load_sources() -> dict[str, str]:
    sources: dict[str, str] = {}
    for pattern in ("supabase/migrations/*.sql", "src/utils/constants.ts",
                    "supabase/functions/_shared/api-contract.ts"):
        for path in ROOT.glob(pattern):
            sources[str(path.relative_to(ROOT))] = path.read_text(encoding="utf-8")
    return sources


def scan() -> int:
    spec_path = ROOT / SPEC_REL
    app_path = ROOT / APP_REL
    if not spec_path.is_file():
        return 0  # 規格書不存在視為通過（與 framework-check 的分批交付契約一致）

    spec_text = spec_path.read_text(encoding="utf-8")
    app_text = app_path.read_text(encoding="utf-8") if app_path.is_file() else ""
    sources = _load_sources()

    problems = (
        constant_violations(spec_text, sources)
        + route_violations(spec_text, app_text)
        + enum_violations(spec_text, sources)
        + path_violations(spec_text, lambda rel: (ROOT / rel).exists())
    )

    for msg in problems:
        print(f"FAIL: {SPEC_REL}: {msg}")
    if problems:
        return 1
    print("check-spec-drift: OK")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else scan())
