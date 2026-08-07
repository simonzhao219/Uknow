"""time_shift 純函式的離線單元測試——月桶時光機的日期核心。

不需要瀏覽器、不需要 journey 環境;CI 的 journey-offline 軌會跑。
"""

from tools import time_shift


def test_shift_within_year():
    assert time_shift.shifted_month_key("2026-08", 1) == "2026-07"
    assert time_shift.shifted_month_key("2026-08", 7) == "2026-01"


def test_shift_across_year_boundary():
    assert time_shift.shifted_month_key("2026-01", 1) == "2025-12"
    assert time_shift.shifted_month_key("2026-03", 15) == "2024-12"


def test_shift_zero_keeps_key():
    assert time_shift.shifted_month_key("2026-08", 0) == "2026-08"


def test_bucket_keys_all_shift_uniformly():
    buckets = {"2026-08": ["u1"], "2026-07": ["u2", "u3"]}
    assert time_shift.shift_bucket_keys(buckets, 1) == {
        "2026-07": ["u1"],
        "2026-06": ["u2", "u3"],
    }


def test_merge_appends_and_dedupes_on_same_key():
    merged = time_shift.merge_buckets(
        {"2026-07": ["u1"]},
        {"2026-07": ["u2", "u1"], "2026-05": ["u4"]},
    )
    assert merged == {"2026-07": ["u1", "u2"], "2026-05": ["u4"]}


def test_shifted_buckets_are_copies_not_aliases():
    src = {"2026-08": ["u1"]}
    out = time_shift.shift_bucket_keys(src, 1)
    out["2026-07"].append("u9")
    assert src["2026-08"] == ["u1"]
