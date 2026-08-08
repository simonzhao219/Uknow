"""姓名遮罩鏡像的離線單元測試——釘住「journey 斷言的是畫面真的會顯示的字」。

不需要瀏覽器、不需要 journey 環境;CI 的 journey-offline 軌會跑。

這支測試存在的理由有兩層:

1. **鏡像會漂。** 遮罩規則的單一事實來源是後端的 `maskNameByGen`,而
   Python 這份是複製品。產品改了規則、複製品沒跟上時,失敗只會在下一場
   journey(30-90 分鐘、真後端拋棄式分支)以「某個 expect 找不到東西」的
   形式出現,完全指不回這裡。下面的 `test_mirror_matches_the_backend_source`
   直接讀 index.ts 比對,漂了在秒級的離線軌就紅。
2. **遮罩會讓原本唯一的姓名不再唯一。** 遮罩只留首尾字,journey 的節點姓名
   尾字是節點編號(C7 → 柒),於是 C7 與 D7 遮成同一個字串。定位樹節點時
   若只用姓名會撞上 Playwright 的 strict mode。
   `test_masked_names_stay_unique_within_each_generation` 鎖住的正是
   `builders/referral_tree.tree_row`「姓名 + aria-level」這組定位鍵所依賴的
   不變式:同一代之內遮罩後仍唯一。
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from tools.name_mask import HAN_RANGE, masked_name
from tools.orgchart import generation_levels, load_nodes
from tools.zh_names import zh_name_for

_API_INDEX_TS = (
    Path(__file__).resolve().parents[3] / "supabase" / "functions" / "api" / "index.ts"
)

# 真實 CI 用 `JOURNEY_RUN_ID: gh<github.run_id>`(journey.yml)。撞名檢查必須
# 用真實長度的 run_id——短的 run_id 產生的姓名較短,遮罩後留下的字反而更多,
# 對真實輸入沒有辨別力。
REAL_RUN_IDS = ("gh31235468231", "gh9999999999999", "a1b2")


def test_first_generation_is_never_masked():
    # 直推(gen 1)全顯是產品的刻意設計:那是使用者自己招募的人。
    name = zh_name_for("gh31235468231", "B3")
    assert masked_name(name, 1) == name
    assert masked_name(name, 0) == name


def test_chinese_name_keeps_only_first_and_last_character():
    assert masked_name("測伍肆陸捌貳參壹丙柒", 2) == "測○○○○○○○○柒"
    assert masked_name("王小明", 3) == "王○明"


def test_two_character_chinese_name_keeps_only_the_first():
    assert masked_name("王明", 2) == "王○"


def test_single_character_name_is_returned_unchanged():
    # 只有一個字時沒有「中間」可遮,原樣回傳(遮了等於直接洩漏那唯一的字)。
    assert masked_name("王", 2) == "王"


def test_latin_name_hides_length_behind_a_fixed_bullet_run():
    # 英數樣式刻意固定三個 bullet:逐字遮會把姓名長度洩漏出去。
    assert masked_name("Johnathan", 2) == "J•••n"
    assert masked_name("Jon", 2) == "J•••n"
    assert masked_name("Jo", 2) == "J•"


def test_blank_and_none_names_do_not_raise():
    # 節點資料不全時遮罩不得炸——`maskNameByGen` 對 null/空字串回空字串。
    assert masked_name(None, 3) == ""
    assert masked_name("   ", 3) == ""


def test_masked_names_stay_unique_within_each_generation():
    """同一代之內,遮罩後的姓名必須仍然唯一。

    這是 `tree_row`(姓名 + aria-level)能唯一定位一列的前提。orgchart 是
    嚴格分層樹,某檢視者的第 k 代必定落在同一個絕對層,所以「每個絕對層內
    唯一」就涵蓋所有檢視者。

    跨層則**本來就會撞**(C7 與 D7 同樣遮成「測○…○柒」)——那不是缺陷,
    是遮罩的本意;定位鍵帶上代數就是為了繞開它。
    """
    nodes = load_nodes()
    for depth, level in enumerate(generation_levels(nodes)):
        if depth == 0:
            continue  # root 是檢視者自己,不會出現在別人的樹上
        for run_id in REAL_RUN_IDS:
            shown = {node: masked_name(zh_name_for(run_id, node), depth) for node in level}
            assert len(set(shown.values())) == len(level), (
                f"run_id={run_id} 第 {depth} 層遮罩後撞名:{shown}——"
                "以姓名定位樹節點會撞上 Playwright 的 strict mode"
            )


@pytest.fixture(scope="module")
def backend_source() -> str:
    return _API_INDEX_TS.read_text(encoding="utf-8")


def test_mirror_matches_the_backend_source(backend_source):
    """遮罩規則的單一事實來源是 index.ts,這裡逐項比對而不是另抄一份。

    抄一份的話,產品改了規則這支測試會繼續綠,然後 journey 又壞一次——
    而那正是這支測試存在的理由(同 `test_listing_name.py` 讀 NAME_MAX_LENGTH)。
    """
    ts_range = re.search(r"const HAN_RANGE = '([^']+)'", backend_source)
    assert ts_range, f"在 {_API_INDEX_TS} 找不到 HAN_RANGE——後端改名了?"
    # index.ts 那份是 JS 字串字面值,再被塞進 `new RegExp()`,所以源碼裡的反斜線
    # 是雙寫的;去掉那一層之後兩側都是同一段 regex 源碼,直接字串比對。
    ts_source = ts_range.group(1).replace("\\\\", "\\").lower()
    assert ts_source == HAN_RANGE, (
        f"漢字偵測範圍已漂移:後端 {ts_source!r} vs 鏡像 {HAN_RANGE!r}"
    )

    start = backend_source.index("export function maskNameByGen")
    body = backend_source[start:backend_source.index("\n}", start)]
    for token in ("gen <= 1", "name.length <= 1", "'○'", "'•'", "'•••'", "chars.length === 2"):
        assert token in body, (
            f"`maskNameByGen` 已不含 {token!r}——遮罩規則改了,"
            f"{Path(__file__).name} 旁邊的 name_mask.py 要跟著改"
        )
