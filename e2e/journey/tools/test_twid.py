"""twid 產生器的離線單元測試——不需要瀏覽器、不需要 journey 環境。"""

from tools import twid


def test_known_valid_id_passes():
    # 官方演算法的經典示例號碼。
    assert twid.validate("A123456789")


def test_known_invalid_ids_fail():
    assert not twid.validate("A123456780")  # 檢查碼錯
    assert not twid.validate("A323456789")  # 性別碼非 1/2
    assert not twid.validate("112345678")   # 長度錯
    assert not twid.validate("a123456789")  # 小寫字母不接受


def test_generated_ids_are_valid():
    for node in ("A0", "B1", "C8", "G1"):
        assert twid.validate(twid.generate_for_node("j0001", node))


def test_generated_ids_deterministic_and_unique_within_run():
    nodes = [f"N{i}" for i in range(30)]
    first = [twid.generate_for_node("j0001", n) for n in nodes]
    second = [twid.generate_for_node("j0001", n) for n in nodes]
    assert first == second            # 同 run 重跑 → 同號碼（冪等清理的前提）
    assert len(set(first)) == 30      # 同 run 30 人不重複


def test_different_runs_diverge():
    a = twid.generate_for_node("j0001", "A0")
    b = twid.generate_for_node("j0002", "A0")
    assert a != b
