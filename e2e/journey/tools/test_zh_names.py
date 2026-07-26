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

# 與 profileValidation.ts / index.ts 的 HAN_RANGE 對齊。
# **必須用 \u 跳脫寫死,不可寫字面漢字**——index.ts 該常數上方的註解記載過
# 一次真實事故:字面「豈」(U+F900) 曾被編輯器 NFC 正規化成同形的 U+8C48,
# 範圍尾端因此悄悄涵蓋全部 surrogate。這是第三份複製品,表示法也要一致,
# 否則等於把已經記取的教訓又複製回來。
HAN = "\u3400-\u9fff\uf900-\ufaff"
ZH_NAME = re.compile(f"^(?:[{HAN}]+|[{HAN}]{{2,}} [{HAN}]{{2,}})$")
MAX_LEN = 10


def _assert_valid(name: str) -> None:
    assert name, "姓名不得為空"
    assert len(name) <= MAX_LEN, f"「{name}」超過中文模式上限 {MAX_LEN} 字"
    assert ZH_NAME.match(name), f"「{name}」不符中文模式規則"


# 真實 CI 用 `JOURNEY_RUN_ID: gh<github.run_id>`(journey.yml),GitHub 的
# run id 目前是 10 位以上數字——加 `gh` 前綴就超過姓名上限 10 字。這些樣本
# 必須包含那個形狀,否則測試永遠踩不進截斷區間,對真實輸入沒有辨別力。
REAL_RUN_IDS = ("gh30182175581", "gh9999999999999", "a1b2", "0000", "zzzz")
NODES = ("A0", "B1", "G1", "admin")


def test_典型的_run_id_與節點代號產生合規姓名():
    for run_id in REAL_RUN_IDS:
        for node in NODES:
            _assert_valid(zh_name_for(run_id, node))


def test_同一組輸入永遠得到同一個姓名():
    # journey 的 UI 斷言靠姓名認人,產生器必須是決定性的。
    assert zh_name_for("gh30182175581", "A0") == zh_name_for("gh30182175581", "A0")


def test_不同節點不撞名():
    # 用**真實長度**的 run_id:先前用 4 字元的 "a1b2" 測,永遠不會踩進截斷
    # 區間,而真實 CI 的 gh<10+ 位數字> 會——最初的實作在那個輸入下讓 30 個
    # 節點全部同名,測試卻全綠,提供了假的保護感。
    nodes = ["A0", "B1", "B2", "C1", "C2", "D1", "E1", "F1", "G1", "admin"]
    for run_id in REAL_RUN_IDS:
        names = [zh_name_for(run_id, n) for n in nodes]
        assert len(set(names)) == len(names), f"run_id={run_id} 節點姓名撞名:{names}"


def test_node_的字元永遠不被截斷():
    # 截斷只該發生在 run_id 那一段。node 是認人的依據,被切掉就會撞名。
    for run_id in REAL_RUN_IDS:
        for node in NODES:
            name = zh_name_for(run_id, node)
            # run_id 給空字串時得到的就是「測 + node 映射」,那段必須完整出現
            # 在真實 run_id 版本的尾端。
            expected_tail = zh_name_for("", node).removeprefix("測")
            assert name.endswith(expected_tail), (
                f"run_id={run_id} node={node} 的 node 段被截斷:{name}"
            )


def test_不含任何英數字元():
    name = zh_name_for("gh30182175581", "A0")
    assert not re.search(r"[A-Za-z0-9]", name), f"「{name}」夾帶英數字元"
