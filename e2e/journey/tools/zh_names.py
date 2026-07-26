"""把 run_id / 節點代號轉成通過註冊規則的中文姓名。

註冊「資料完善」的姓名欄位自 2026-07 起有格式規則（見
`src/utils/profileValidation.ts` 與 `supabase/functions/api/index.ts` 的
`validateNameFormat`）：中文模式只收中文字元，恰好 0 或 1 個半形空格。

原本的 `f"測試{run_id}{node}"` 會拼出「測試a1b2A0」這種含英數的字串，在新規則
下**必定被拒**，整套 journey 會在 Step 2 全滅。而 journey 依規則不能在本機跑，
只在排程或晉升 PR 才會發現——晚且貴。

做法：把英數逐字映射成中文字，保留「同一個 run_id + node 一定得到同一個姓名」
這個性質（journey 的 UI 斷言靠姓名認人），也保證不同 node 不撞名。
"""

# 0-9 與 a-z 各自映射到一個中文字。刻意用常見字，讓失敗截圖仍然讀得懂。
_DIGITS = "零壹貳參肆伍陸柒捌玖"
_LETTERS = (
    "甲乙丙丁戊己庚辛壬癸"  # a-j
    "子丑寅卯辰巳午未申酉"  # k-t
    "戌亥東西南北"  # u-z
)

_PREFIX = "測"


def _map_char(ch: str) -> str:
    if ch.isdigit():
        return _DIGITS[int(ch)]
    lowered = ch.lower()
    if "a" <= lowered <= "z":
        return _LETTERS[ord(lowered) - ord("a")]
    # 其他字元（理論上不會出現）一律丟棄，寧可短也不要夾帶非中文字元。
    return ""


def zh_name_for(run_id: str, node: str) -> str:
    """回傳「測 + run_id 映射 + node 映射」的純中文姓名。

    長度上限:中文模式是 10 字。run_id 目前是 4 碼、node 最多 3 碼,加前綴
    共 8 字以內;真的超長時從尾端截斷,寧可短也不要被規則擋下。
    """
    body = "".join(_map_char(c) for c in f"{run_id}{node}")
    return (_PREFIX + body)[:10]
