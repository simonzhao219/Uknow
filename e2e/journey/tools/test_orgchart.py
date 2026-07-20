"""orgchart 純函數的離線測試——鎖住六代 30 人的形狀與預期帳本。

樹形或 expected_rewards 改了其中一邊而沒改另一邊，這裡會先紅。
"""

import pytest

from tools import orgchart


@pytest.fixture(scope="module")
def nodes():
    return orgchart.load_nodes()


def test_tree_shape_is_six_generations_of_thirty(nodes):
    levels = orgchart.generation_levels(nodes)
    assert [len(level) for level in levels] == [1, 8, 8, 8, 3, 1, 1]
    assert sum(len(level) for level in levels) == 30
    assert levels[0] == ["A0"]


def test_root_reward_counts_exclude_generation_four_and_beyond(nodes):
    gens = orgchart.downline_by_generation(nodes, "A0")
    assert [len(g) for g in gens] == [8, 8, 8]      # 24 筆；E/F/G 零貢獻
    flat = [n for g in gens for n in g]
    assert "E1" not in flat and "F1" not in flat and "G1" not in flat


def test_expected_reward_counts_match_yaml_ledger(nodes):
    # yaml 的 expected_rewards 以「單代 100P」寫死；這裡驗證兩邊一致：
    # 筆數 × 100 == yaml 金額。單代獎金改了（reward_config），執行期
    # 斷言用筆數 × 實際金額，yaml 僅作 100P 基準的文件。
    expected = orgchart.load_expected_rewards()
    assert expected, "orgchart.yaml 缺 expected_rewards"
    for node, points in expected.items():
        count = orgchart.expected_reward_count(nodes, node)
        assert count * 100 == points, f"{node}: 筆數 {count}×100 ≠ yaml {points}"


def test_every_non_root_has_reachable_parent_chain(nodes):
    for node in nodes:
        seen, cur = set(), node
        while nodes[cur] is not None:
            assert cur not in seen, f"{node} 的上線鏈有環"
            seen.add(cur)
            cur = nodes[cur]
        assert cur == "A0"
