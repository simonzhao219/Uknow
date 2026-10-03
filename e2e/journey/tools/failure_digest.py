"""pytest 失敗詳情的摘要——供失敗當下即時輸出用。

pytest 的失敗詳情要等**整場結束**才印。journey 一場 20–90 分鐘,runner 中途被
收掉(2026-10-03 run 37143906920:18:42:55 收到 shutdown 訊號)時,先前已經
FAILED 的情境只剩一行結果,死因永遠不見。conftest 的 `pytest_runtest_logreport`
在失敗當下就把這份摘要印出來。

只留 `E ` 開頭的行:那是斷言／例外訊息本體(含 Playwright 的 Call log 與我們
接上去的 dump_page),程式碼片段與堆疊行是雜訊。
"""

from __future__ import annotations

MAX_CHARS = 6_000


def digest(longrepr_text: str) -> str:
    lines = longrepr_text.splitlines()
    error_lines = [line for line in lines if line.startswith("E ")]
    chosen = error_lines or lines[-40:]
    return "\n".join(chosen)[:MAX_CHARS]
