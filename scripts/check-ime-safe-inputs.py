#!/usr/bin/env python3
"""受控 input 的 IME 安全性檢查——通則見 docs/plans/friction-log.md 的 2026-08-07 條。

存在理由:2026-08-07 的 iOS 注音災情(姓名欄位打不了字)在三層閘門下全綠通過,
同一個原因——沒有任何一層走過 IME 組字生命週期。vitest 用 `fireEvent.change`
一次丟完整字串、e2e 用 Playwright `fill()`,兩者模擬的都是「已經組完字」的
終點狀態;biome/typecheck 看不出「這個 setState 發生在組字期間」,那是執行期
的瀏覽器狀態,不是靜態性質。

**但「onChange 有沒有原樣接受 e.target.value」是靜態看得出來的。** 這支檢查器
守的就是這條——它不證明 iOS 上不會壞(那只有真機能證明),它證明的是「沒有人
再度引入那個形狀」。

規則:

  I1 JSX 的 `onChange={...}` 內不得改寫 `e.target.value`
     `.replace()` / `.toUpperCase()` / `.trim()` / `.slice()` … 都算。
     React 受控元件在 re-render 時會比對 props.value 與 node.value,不一致就
     把 DOM 蓋掉;IME 組字期間這麼做,WebKit 會丟失 composition range 卻不清
     IME 緩衝,下一次按鍵把整個緩衝再插一次。

  I2 JSX 的 `onChange={...}` 內不得**條件性地拒收** `e.target.value`
     `if (value.length <= N) setState(...)` 這種形狀,不滿足條件時整個丟掉。
     **拒收比改寫更糟**:它寫回的是上一個值,等於在組字中途把欄位倒帶。

兩條的修法都一樣:改寫/拒收要嘛拿掉(長度上限交給 DOM 的 `maxLength` 屬性,
瀏覽器不對組字中的文字套用長度限制),要嘛延後到組字結束——用
`src/hooks/useImeComposition.ts`,把 onChange 拆成 onCompose(組字期間原樣
收下)與 onCommit(組字結束才改寫)。

檢查器刻意只看 **JSX 屬性字面量**:修好之後這些欄位根本不會有 `onChange={`,
它們展開的是 hook 回傳的 props。所以「JSX onChange 裡出現改寫」= 有人繞過了
hook,零例外、不需要 allowlist。

決策邏輯放在純函式裡,好讓表格案例直接驗行為(與 check-test-names.py、
check-workflows.py 同慣例)。刻意不 import 任何第三方套件——framework-check
的契約是免依賴安裝。

跑法:
  python3 scripts/check-ime-safe-inputs.py              掃全 repo
  python3 scripts/check-ime-safe-inputs.py --self-test  跑表格案例(驗檢查器自己)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# I1:`e.target.value` 後面直接接字串方法 = 改寫。刻意用「接了任何方法呼叫」
# 而非窮舉方法名——窮舉一定會漏(`.normalize()`、`.padStart()`、下一個 ES 版本
# 新增的),而漏掉的那一個正是下次出事的那一個。
REWRITE = re.compile(r"\.target\.value\s*\.\s*[A-Za-z_$][\w$]*\s*\(")

# I2:body 裡同時出現 `if (` 與 `.target.value` = 條件性拒收的形狀。
# 三元運算子(`? :`)同樣是條件,一併認。
REJECT = re.compile(r"\bif\s*\(|\?[^:]*:")
TARGET_VALUE = re.compile(r"\.target\.value\b")

ONCHANGE = re.compile(r"\bon(?:Change|Input)\s*=\s*\{")


def extract_handler_bodies(source: str) -> list[tuple[int, str]]:
    """挖出每個 `onChange={...}` / `onInput={...}` JSX 屬性的 body。

    以大括號配對切出來(不是正則抓到底):handler body 常含巢狀物件與箭頭
    函式,`\\{[^}]*\\}` 會在第一個 `}` 就斷掉,把多行的 handler 攔腰切斷——
    而多行的那些正是最可能藏著改寫邏輯的。回傳 (1-indexed 行號, body)。
    """
    found: list[tuple[int, str]] = []
    for match in ONCHANGE.finditer(source):
        start = match.end()  # 開頭 `{` 的後一個字元
        depth = 1
        i = start
        while i < len(source) and depth > 0:
            char = source[i]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
            elif char in "'\"`":
                # 跳過字串字面量,裡面的括號不算配對(例:placeholder="{}")
                quote = char
                i += 1
                while i < len(source) and source[i] != quote:
                    i += 2 if source[i] == "\\" else 1
            i += 1
        if depth == 0:
            found.append((source.count("\n", 0, match.start()) + 1, source[start : i - 1]))
    return found


def check_source(source: str, path: str) -> list[str]:
    violations: list[str] = []
    for line_no, body in extract_handler_bodies(source):
        if not TARGET_VALUE.search(body):
            # 不碰 e.target.value 的 handler(檔案上傳、自訂元件的 value 回呼)
            # 與這條規則無關。
            continue
        if REWRITE.search(body):
            violations.append(
                f"{path}:{line_no}: I1 onChange 內改寫了 e.target.value"
                "（IME 組字期間會毀掉組字狀態）"
            )
        elif REJECT.search(body):
            violations.append(
                f"{path}:{line_no}: I2 onChange 內條件性拒收 e.target.value"
                "（組字中途把欄位倒帶,比改寫更糟）"
            )
    return violations


def scan() -> int:
    violations: list[str] = []
    for path in sorted(SRC.rglob("*.tsx")):
        if ".test." in path.name:
            continue
        violations += check_source(path.read_text(encoding="utf-8"), str(path.relative_to(ROOT)))

    if violations:
        print("check-ime-safe-inputs 發現違規:")
        print("\n".join(f"  {v}" for v in violations))
        print(
            "\n修法:改寫/拒收要嘛拿掉（長度上限交給 DOM 的 maxLength 屬性）,"
            "\n要嘛用 src/hooks/useImeComposition.ts 延後到組字結束。"
            "\n通則見 docs/plans/friction-log.md 的 2026-08-07 條。"
        )
        return 1
    print("check-ime-safe-inputs: OK")
    return 0


# (標籤, 原始碼片段, 預期違規數)
CASES: list[tuple[str, str, int]] = [
    ("原樣收下 → 通過", "<Input onChange={(e) => setName(e.target.value)} />", 0),
    (
        "改寫大小寫 → 違規",
        "<Input onChange={(e) => setId(e.target.value.toUpperCase())} />",
        1,
    ),
    (
        "改寫 replace → 違規",
        "<Input onChange={(e) => setName(e.target.value.replace(/x/g, ' '))} />",
        1,
    ),
    (
        "窮舉外的方法(normalize)同樣被抓 → 違規",
        "<Input onChange={(e) => setName(e.target.value.normalize('NFC'))} />",
        1,
    ),
    (
        "條件性拒收(長度) → 違規",
        "<Input\n  onChange={(e) => {\n    if (e.target.value.length <= 10) {\n"
        "      setName(e.target.value);\n    }\n  }}\n/>",
        1,
    ),
    (
        "條件性拒收(格式) → 違規",
        "<Input onChange={(e) => {\n  const v = e.target.value;\n"
        "  if (v === '' || /^[0-9]+$/.test(v)) setAccount(v);\n}} />",
        1,
    ),
    (
        "多行但原樣收下 → 通過",
        "<Input\n  onChange={(e) => {\n    setForm({ ...form, name: e.target.value });\n"
        "    setErrors({ ...errors, name: '' });\n  }}\n/>",
        0,
    ),
    (
        "巢狀物件 spread 不會讓括號配對斷掉 → 通過",
        "<Input\n  onChange={(e) =>\n    setForm({\n      ...form,\n"
        "      contacts: { ...form.contacts, line: e.target.value },\n    })\n  }\n/>",
        0,
    ),
    (
        "檔案上傳(碰 files 不碰 value) → 通過",
        "<input type=\"file\" onChange={(e) => setFront(e.target.files?.[0])} />",
        0,
    ),
    (
        "自訂元件的 value 回呼(不碰 e.target.value) → 通過",
        "<IdNumberInput onChange={(value) => setId(value.toUpperCase())} />",
        0,
    ),
    (
        "展開 useImeComposition 回傳的 props → 通過(沒有 onChange 字面量)",
        "<Input value={name} {...nameImeProps} onBlur={handleBlur} />",
        0,
    ),
    (
        "onInput 與 onChange 同等對待 → 違規",
        "<input onInput={(e) => setName(e.target.value.trim())} />",
        1,
    ),
    (
        "三元運算子形式的拒收 → 違規",
        "<Input onChange={(e) => setName(e.target.value.length > 5 ? name : e.target.value)} />",
        1,
    ),
]


def self_test() -> int:
    failures: list[str] = []
    for label, snippet, want in CASES:
        got = len(check_source(snippet, "t.tsx"))
        if got != want:
            failures.append(f"  FAIL: {label} — 預期 {want} 筆違規,實得 {got}")

    if failures:
        print("check-ime-safe-inputs 表格案例未過:")
        print("\n".join(failures))
        return 1
    print(f"check-ime-safe-inputs self-test: OK（{len(CASES)} 條案例）")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv[1:] else scan())
