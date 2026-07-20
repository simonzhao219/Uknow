"""台灣身分證字號產生器／驗證器。

profiles 對 national_id 有唯一性檢核，前後端都驗格式與檢查碼，所以
journey 測試的 30 個假會員需要「檢查碼合法、同 run 不重複、跨 run 幾乎
不重複」的號碼。做法：以 (run_id, node) 的 SHA-256 決定性導出序號——
同一個 run 重跑產生同一組號碼（配合冪等清理），不同 run 幾乎不相撞
（就算撞上，分支隔離也互不影響）。
"""

from __future__ import annotations

import hashlib

# 首字母 → 數值（戶籍縣市代碼），檢查碼演算法的官方對照表。
LETTER_VALUES = {
    "A": 10, "B": 11, "C": 12, "D": 13, "E": 14, "F": 15, "G": 16, "H": 17,
    "I": 34, "J": 18, "K": 19, "L": 20, "M": 21, "N": 22, "O": 35, "P": 23,
    "Q": 24, "R": 25, "S": 26, "T": 27, "U": 28, "V": 29, "W": 32, "X": 30,
    "Y": 31, "Z": 33,
}

# 首字母數值的十位數×1、個位數×9，其後 8 碼依序 ×8..×1，加上檢查碼×1
# 之後總和須為 10 的倍數。
_BODY_WEIGHTS = (8, 7, 6, 5, 4, 3, 2, 1)


def _check_digit(letter: str, body8: str) -> str:
    value = LETTER_VALUES[letter]
    total = (value // 10) * 1 + (value % 10) * 9
    total += sum(int(d) * w for d, w in zip(body8, _BODY_WEIGHTS))
    return str((10 - total % 10) % 10)


def validate(national_id: str) -> bool:
    """完整驗證：長度、首字母、性別碼、檢查碼。"""
    if len(national_id) != 10:
        return False
    letter, digits = national_id[0], national_id[1:]
    if letter not in LETTER_VALUES or not digits.isdigit():
        return False
    if digits[0] not in ("1", "2"):
        return False
    return digits[-1] == _check_digit(letter, digits[:-1])


def generate(seed: str) -> str:
    """由任意種子字串決定性導出一個檢查碼合法的身分證字號。

    同一種子永遠得到同一號碼；不同種子在 7 位序號空間內雜湊分佈。
    """
    digest = int(hashlib.sha256(seed.encode("utf-8")).hexdigest(), 16)
    letter = "A"
    gender = "1" if digest % 2 == 0 else "2"
    serial = (digest // 2) % 10_000_000  # 7 碼序號
    body8 = f"{gender}{serial:07d}"
    return f"{letter}{body8}{_check_digit(letter, body8)}"


def generate_for_node(run_id: str, node: str) -> str:
    """journey 的標準入口：以 (run_id, node) 為種子。"""
    return generate(f"uknow-journey:{run_id}:{node}")
