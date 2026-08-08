"""刊登名稱產生器的離線單元測試——釘住「名稱必須填得進去」。

不需要瀏覽器、不需要 journey 環境;CI 的 journey-offline 軌會跑。

為什麼這條不變式值得一個測試:名稱是要送進 CreateServiceProvider 的
`#name` 欄位的,而該欄位有 `maxLength={10}`(產品規則,見
src/utils/constants.ts 的 NAME_MAX_LENGTH)。超過上限時 Playwright 的
`fill()` **會被瀏覽器靜默截斷**——表單照樣通過驗證、照樣送得出去、刊登
照樣建得起來,只有名字短了一截。於是失敗出現在很遠的地方(某個
`get_by_text` 找不到東西),完全指不回名稱產生器。

2026-08-08 run 31231809650 的 f40 三連敗 + f60 兩連敗即此因:
`服務gh31231809650A0`(17 字)進到欄位裡只剩 `服務gh312318`(10 字),
而且 A0/C7/C8 三個節點截斷後**變成同一個名字**。
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from builders.listing import listing_name

# journey 實際會用到的節點(f40 用 A0,f60 用 C7/C8)
NODES = ("A0", "C7", "C8")
# GitHub Actions 的 run id 是 11 位數,前面再加 "gh"
RUN_ID = "gh31231809650"

_CONSTANTS_TS = Path(__file__).resolve().parents[3] / "src" / "utils" / "constants.ts"


def _product_name_max_length() -> int:
    """從產品程式碼讀出真正的上限,不在測試裡另抄一份數字。

    抄一份的話,產品把上限改掉時這個測試會繼續綠,然後 journey 又壞一次
    ——而那正是這個測試存在的理由。
    """
    source = _CONSTANTS_TS.read_text(encoding="utf-8")
    match = re.search(r"NAME_MAX_LENGTH\s*=\s*(\d+)", source)
    assert match, f"在 {_CONSTANTS_TS} 找不到 NAME_MAX_LENGTH——產品端改名了?"
    return int(match.group(1))


@pytest.mark.parametrize("node", NODES)
def test_name_fits_the_product_length_cap(node):
    name = listing_name(RUN_ID, node)
    cap = _product_name_max_length()
    assert len(name) <= cap, (
        f"{name!r} 有 {len(name)} 字,超過 #name 的 maxLength={cap}——"
        f"填進去會被瀏覽器靜默截斷成 {name[:cap]!r},之後所有以全名做的斷言都會失配"
    )


def test_names_stay_distinct_per_node():
    names = {node: listing_name(RUN_ID, node) for node in NODES}
    assert len(set(names.values())) == len(NODES), (
        f"不同節點必須產生不同名稱,實際:{names}——"
        "截斷後撞名會讓「首頁只搜到一張卡片」這類斷言互相干擾"
    )


def test_name_is_deterministic():
    # 跨情境(不同 browser context)靠重算取得同一個名稱,不共享狀態
    assert listing_name(RUN_ID, "A0") == listing_name(RUN_ID, "A0")


def test_names_differ_across_runs():
    assert listing_name("gh31231809650", "A0") != listing_name("gh31231809651", "A0")
