"""journey 產生的姓名必須通過註冊規則——離線驗證,不需真後端。

為什麼這支測試必須存在:`run_state.new_user()` 產生的姓名若不合規則,整套
journey 會在 Step 2 全滅,而 journey 依規則不能在本機跑,只有排程或晉升 PR
才會發現。原先規劃把測試落點填成 `pytest tools/`,但 `run_state.py` 不在
`tools/` 目錄下、現有三支測試也都測其他模組——照那樣執行會全綠卻什麼都
沒驗到,正是本階段自己要避免的「晚且貴的失敗點」。

規則來源(單一事實來源是那兩份實作,這裡只複述必要的部分):
`src/utils/profileValidation.ts` 的 `validateName(name, 'zh')` 與
`supabase/functions/api/index.ts` 的 `validateNameFormat`。
"""

import re

from tools.zh_names import zh_name_for

# 與 profileValidation.ts / index.ts 的 HAN_RANGE 對齊(U+3400–U+9FFF 與
# U+F900–U+FAFF)。這裡是第三份複製品,刻意寫成單一常數並在下方註明出處。
HAN = "㐀-鿿豈-﫿"
ZH_NAME = re.compile(f"^(?:[{HAN}]+|[{HAN}]{{2,}} [{HAN}]{{2,}})$")
MAX_LEN = 10


def _assert_valid(name: str) -> None:
    assert name, "姓名不得為空"
    assert len(name) <= MAX_LEN, f"「{name}」超過中文模式上限 {MAX_LEN} 字"
    assert ZH_NAME.match(name), f"「{name}」不符中文模式規則"


def test_典型的_run_id_與節點代號產生合規姓名():
    for run_id in ("a1b2", "0000", "zzzz", "9f3k"):
        for node in ("A0", "B1", "G1", "admin"):
            _assert_valid(zh_name_for(run_id, node))


def test_同一組輸入永遠得到同一個姓名():
    # journey 的 UI 斷言靠姓名認人,產生器必須是決定性的。
    assert zh_name_for("a1b2", "A0") == zh_name_for("a1b2", "A0")


def test_不同節點不撞名():
    run_id = "a1b2"
    nodes = ["A0", "B1", "B2", "C1", "C2", "D1", "E1", "F1", "G1"]
    names = [zh_name_for(run_id, n) for n in nodes]
    assert len(set(names)) == len(names), f"節點姓名撞名:{names}"


def test_不含任何英數字元():
    name = zh_name_for("a1b2", "A0")
    assert not re.search(r"[A-Za-z0-9]", name), f"「{name}」夾帶英數字元"
