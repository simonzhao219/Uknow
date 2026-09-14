"""推薦碼格式契約——與 supabase/migrations/20260914000001 的序列一致。

推薦碼自 2026-09-14 起由 `public.referral_code_seq` 發出：純數字、單調
遞增、**8048876 起**（規格書 §7.2）。起始值是結構事實而非可調參數——
序列一旦開始發碼就不該被 restart，restart 會讓後發的碼與先發的碼重疊。
因此「小於起始值」不是無傷大雅的邊界，而是撞號的前兆，要當成壞掉。

journey 跑在拋棄式分支上，migration 從零重播、序列必然從 8048876 起，
所以這裡可以比正式站嚴格：**只接受序列碼**。正式站在 2026-09-14 之前
發出的舊格式碼（3 碼小寫英文 + 6 碼數字）仍然有效，那是歷史相容問題，
不是 journey 該驗的東西。

為什麼獨立成 tools/ 的純函式：tools/ 是每一支 PR 都會跑的離線軌
（`pytest tools/ -q`），而 journey 全套只在 develop→main 的晉升 PR 跑。
契約留在 builders/ 裡，格式漂移就只有晉升當天才會爆——PR #317 正是這樣
爆的（#311 改了發碼規則，斷言留在舊格式）。
"""

from __future__ import annotations

import re

# 序列的第一個碼，同時是 §7.4 預設推薦人的指定碼。
SEQUENCE_START = 8048876

# 前導零由 `[1-9]` 排除：nextval 不會產生，出現了就是有人手動塞過碼。
_SEQUENCE_DIGITS = re.compile(r"^[1-9][0-9]*$")


def is_sequence_code(code: str) -> bool:
    """碼是否為 referral_code_seq 發出的：純數字、無前導零、不小於起始值。"""
    if not isinstance(code, str) or not _SEQUENCE_DIGITS.fullmatch(code):
        return False
    return int(code) >= SEQUENCE_START
