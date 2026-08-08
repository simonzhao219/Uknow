"""`maskNameByGen` 的 Python 鏡像——推薦網絡樹上**畫面實際顯示**的姓名。

為什麼需要這支:`/referrals/network/*` 三個端點對 **gen >= 2** 的姓名做隱私
遮罩(`supabase/functions/api/index.ts` 的 `maskNameByGen`),但 journey 一直
拿**未遮罩的原名**去比對 UI:

| 代 | 原名 | 畫面實際顯示 |
|---|---|---|
| gen 1 | 測伍肆陸捌貳參壹乙參 | 原樣(不遮) |
| gen 2 | 測伍肆陸捌貳參壹丙柒 | 測○○○○○○○○柒 |

於是 f20「展開全部世代後名單包含 D8」在展開 gen 2 的 C7 時 `treeitem` 的
`aria-label` 永遠對不上,15 秒逾時,而錯誤訊息指向遠處的 `expect`——與刊登
名稱被 `maxLength` 截斷、提領查詢用了改名前的欄位是同一個形狀:**測試相信
了一個產品從未承諾的值**。產品是對的,遮罩是刻意的隱私設計。

遮罩後**首尾字以外的資訊全部消失**,原本唯一的姓名因此可能不再唯一
(`C7` 與 `D7` 都遮成「測○○○○○○○○柒」)。拿遮罩後的名字定位節點一定要
連同代數一起收斂——見 `builders/referral_tree.tree_row`,以及
`test_name_mask.py` 鎖住的「同一代內遮罩後仍唯一」。
"""

from __future__ import annotations

import re

# 與 index.ts 的 HAN_RANGE **逐字**對齊(`test_name_mask.py` 讀源碼比對,漂了就紅)。
# 存的是 regex 源碼(跳脫序列的字面文字),不是解碼後的字元,兩個理由:
#   1. **不可寫字面漢字**——index.ts 該常數上方的註解記載過一次真實事故:字面
#      「豈」(U+F900) 曾被編輯器 NFC 正規化成同形的 U+8C48,範圍尾端因此悄悄
#      涵蓋全部 surrogate,單一 emoji 姓名就能把端點打成 500;
#   2. 兩側形狀一致,比對才是字串相等而不是一層猜測性的解碼。
# 這是 Python 側唯一一份,`test_zh_names.py` 引用同一個常數。
HAN_RANGE = "\\u3400-\\u9fff\\uf900-\\ufaff"
HAS_HAN = re.compile(f"[{HAN_RANGE}]")

CJK_FILL = "○"
# 英數樣式固定三個 bullet(不洩漏長度),與 CJK 樣式逐字遮不同。
LATIN_FILL = "•"
LATIN_FILL_WIDTH = 3


def _utf16_length(text: str) -> int:
    """JS `String.prototype.length` 的語意——UTF-16 code unit 數。

    鏡像要精確就得區分這個與 Python `len()`(code point 數):`maskNameByGen`
    的提前返回用 `name.length`、後續切字用展開後的 `[...name]`,兩者只在
    輔助平面(戶政「缺字」那類擴充 B 區漢字)才分歧。
    """
    return len(text.encode("utf-16-le")) // 2


def masked_name(raw: str | None, gen: int) -> str:
    """回傳第 `gen` 代節點在 UI 上顯示的姓名。

    `gen` 以**檢視者**為基準:直推 = 1(不遮)、二代 = 2、三代 = 3。
    """
    name = (raw or "").strip()
    if gen <= 1 or _utf16_length(name) <= 1:
        return name
    if HAS_HAN.search(name):
        if len(name) == 2:
            return name[0] + CJK_FILL
        return name[0] + CJK_FILL * (len(name) - 2) + name[-1]
    if len(name) == 2:
        return name[0] + LATIN_FILL
    return name[0] + LATIN_FILL * LATIN_FILL_WIDTH + name[-1]
