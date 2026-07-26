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


# --------------------------------------------------------------------------
# develop 示範資料樹（orgchart-develop-seed.yaml）
#
# 與測試樹是兩張獨立的圖、兩種生命週期（種子資料留著、測試資料跑完刪），
# 但共用同一套載入與計算——所以同一組不變式必須在兩張圖上都成立。
# --------------------------------------------------------------------------

SEED_PATH = orgchart.JOURNEY_DIR / "orgchart-develop-seed.yaml"


@pytest.fixture
def seed_nodes():
    return orgchart.load_nodes(SEED_PATH)


def test_seed_chart_shape_is_32_8_4(seed_nodes):
    """人審指定的形狀（2026-07-25）：第 1 代 32、第 2 代 8、第 3 代 4。"""
    levels = orgchart.generation_levels(seed_nodes)
    assert [len(level) for level in levels] == [1, 32, 8, 4]
    assert len(seed_nodes) == 45


def test_seed_chart_keeps_a_zero_reward_control_group(seed_nodes):
    """B9–B32 沒有下線＝帳上恆 0P 的對照組。

    這不是巧合而是設計：畫面上要同時看得到「有下線的」與「沒下線的」
    兩種會員，獎勵明細的差異才顯示得出來。掛法改了要一起改這條。
    """
    zero = [n for n in seed_nodes if orgchart.expected_reward_count(seed_nodes, n) == 0]
    assert len(zero) >= 24


def test_seed_chart_expected_rewards_match_yaml_ledger(seed_nodes):
    expected = orgchart.load_expected_rewards(SEED_PATH)
    assert expected, "orgchart-develop-seed.yaml 缺 expected_rewards"
    for node, points in expected.items():
        count = orgchart.expected_reward_count(seed_nodes, node)
        assert count * 100 == points, f"{node}: 筆數 {count}×100 ≠ yaml {points}"


def test_seed_chart_root_collects_from_all_three_generations(seed_nodes):
    """root 的 44 筆＝32+8+4，全樹發出 6,000P。"""
    assert orgchart.expected_reward_count(seed_nodes, "A0") == 44
    total = sum(orgchart.expected_reward_count(seed_nodes, n) for n in seed_nodes)
    assert total * 100 == 6000


def test_orgchart_path_override_switches_chart(monkeypatch):
    """JOURNEY_ORGCHART_PATH 換圖；未設時仍是測試樹（預設不可被影響）。"""
    monkeypatch.delenv("JOURNEY_ORGCHART_PATH", raising=False)
    assert orgchart.active_orgchart_path() == orgchart.ORGCHART_PATH

    monkeypatch.setenv("JOURNEY_ORGCHART_PATH", "orgchart-develop-seed.yaml")
    assert orgchart.active_orgchart_path() == SEED_PATH
    assert len(orgchart.load_nodes()) == 45
