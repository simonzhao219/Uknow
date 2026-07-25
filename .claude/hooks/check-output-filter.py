#!/usr/bin/env python3
"""PreToolUse hook(Bash):把驗證指令的綠燈輸出折疊成一行。

存在理由(token 治理):`npm run check` 串了 biome + tsc + vitest + knip,
綠燈時仍吐數百行——目前光 biome 就有 214 條 warning(全部 advisory、exit 0)。
CLAUDE.md 規定「改完必跑」,所以這是單位時間內最高頻的 context 支出,而它
在綠燈時的資訊量是「零」:唯一需要知道的事就是「綠了」。

紅燈時**不折疊**:保留失敗段落與前後文,失敗才是要讀的東西。

三個刻意的設計約束(缺任一個就會製造比省下的更貴的問題):

1. **exit code 必須原樣傳遞。** 改寫成 `cmd | grep ...` 會讓 exit status 變成
   grep/head 的——紅燈會被當成綠燈。這裡把輸出寫檔、捕捉 `$?`、最後 `exit`
   原碼,過濾只影響「顯示什麼」,不影響「成功還是失敗」。
2. **不覆蓋 bash-guard 的 deny。** 本 hook 與 bash-guard 掛在同一個 Bash
   matcher 上,而回報 `permissionDecision: allow` 有可能蓋掉另一個 hook 的
   deny。所以先問過 bash-guard:它要擋的指令,本 hook 一律不出手(回 {})。
3. **只碰已在 allowlist 的驗證指令。** 回 allow 對它們不授予任何新權限。
   刻意**不含 `git commit`**——它不在 allowlist,自動 allow 等於偷偷放寬
   commit 權限;而它常以 heredoc 形式出現,包裝會破壞 heredoc。
   (pre-commit 自己跑 `npm run check` 的輸出因此仍未折疊——那要改
   scripts/git-hooks/pre-commit 本身,是另一件事。)

繞過方式:指令自帶 pipe / 重導向 / heredoc 時一律不改寫,所以
`npm run check 2>&1 | tail -80` 永遠拿得到完整輸出。

決策邏輯放在純函式 decide() 裡,好讓 scripts/test-hooks.py 用表格案例
直接驗行為(與其他三個 guard 同慣例)。
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

# 會被折疊的驗證指令(全部已在 .claude/settings.json 的 permissions.allow 內)
FILTERED = re.compile(
    r"""
    npm\s+run\s+check(:\S+)?\b     # check / check:full / check:deno / check:deno:lint
  | npm\s+(run\s+)?test(:\S+)?\b   # npm test / npm run test:coverage
  | npx\s+vitest\s+run\b
  | deno\s+task\s+(test(:\S+)?|check)\b
    """,
    re.VERBOSE,
)

# 已經自行處理輸出的指令不碰:pipe、重導向、heredoc(包裝會破壞 heredoc)
ALREADY_HANDLED = re.compile(r"[|>]|<<")

# 紅燈時要撈出來的訊號。寧可寬鬆——多印幾行遠好過漏掉失敗原因。
FAIL_PAT = (
    r"(FAIL|FAILED|✕|✗|error TS[0-9]+|error:|ERROR|Unused (files|dependencies|exports)"
    r"|Found [0-9]+ error|AssertionError|panicked|Expected|not ok)"
)


def _bash_guard_denies(cmd: str) -> bool:
    """bash-guard 是否要擋這條指令。擋的話本 hook 不出手,免得 allow 蓋掉 deny。"""
    path = Path(__file__).resolve().parent / "bash-guard.py"
    if not path.exists():
        return False
    spec = importlib.util.spec_from_file_location("bash_guard", path)
    if spec is None or spec.loader is None:
        return False
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.decide(cmd) is not None


def decide(cmd: str, guard_denies: bool = False) -> str | None:
    """回傳改寫後的指令,或 None 表示不動。純函式,無 I/O。

    guard_denies 由呼叫方注入(而非在此讀檔),讓表格案例能單獨釘住
    「bash-guard 要擋時本 hook 不出手」這條分支。
    """
    if guard_denies:
        return None
    if not FILTERED.search(cmd):
        return None
    if ALREADY_HANDLED.search(cmd):
        return None

    return (
        f'__o=$(mktemp); {{ {cmd} ; }} >"$__o" 2>&1; __rc=$?; '
        'if [ "$__rc" -eq 0 ]; then '
        'echo "[check-filter] 綠燈（$(wc -l <"$__o") 行輸出已折疊；'
        '需完整輸出時在指令後接 | tail -80）"; '
        f"elif grep -qE '{FAIL_PAT}' \"$__o\"; then grep -E -A5 '{FAIL_PAT}' \"$__o\" | head -150; "
        'else tail -60 "$__o"; fi; '
        'rm -f "$__o"; exit "$__rc"'
    )


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return  # 讀不懂就放行——filter 壞掉不該把人卡住

    cmd = str(payload.get("tool_input", {}).get("command", ""))
    new = decide(cmd, guard_denies=_bash_guard_denies(cmd))
    if not new:
        return

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "allow",
                    "updatedInput": {"command": new},
                }
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
