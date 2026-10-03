"""失敗摘要的離線測試。

2026-10-03 run 37143906920:f30 在 18:33:05 就 FAILED,但 pytest 的失敗詳情
是**整場結束後**才印——18:42:55 runner 收到 shutdown 訊號,詳情從未輸出,
log 裡只剩一個 FAILED 與 3 分 47 秒。失敗當下就要把死因印出來。
"""

from __future__ import annotations

from pathlib import Path

from tools.failure_digest import digest

JOURNEY_DIR = Path(__file__).resolve().parents[1]


def test_digest_keeps_only_the_error_lines():
    text = "\n".join(
        [
            "    def f():",
            ">       expect(x).to_be_visible()",
            "E       AssertionError: Locator expected to be visible",
            "E       Call log:",
            "E         - waiting for locator",
            "../pages/a.py:10: AssertionError",
        ]
    )
    out = digest(text)
    assert "Locator expected to be visible" in out
    assert "waiting for locator" in out
    assert "def f()" not in out


def test_digest_is_capped():
    text = "\n".join(f"E   line {i} " + "x" * 200 for i in range(200))
    assert len(digest(text)) <= 6_000


def test_digest_falls_back_to_the_tail_when_there_are_no_error_lines():
    text = "\n".join(f"plain {i}" for i in range(100))
    assert "plain 99" in digest(text)


def test_conftest_prints_failures_when_they_happen():
    source = (JOURNEY_DIR / "conftest.py").read_text(encoding="utf-8")
    assert "def pytest_runtest_logreport" in source, (
        "沒有失敗當下輸出的 hook——pytest 的失敗詳情要等整場結束才印,"
        "runner 中途被收掉時死因就永遠不見了"
    )


def test_pytest_ini_dumps_stacks_of_a_stalled_test():
    ini = (JOURNEY_DIR / "pytest.ini").read_text(encoding="utf-8")
    assert "faulthandler_timeout" in ini, (
        "沒設 faulthandler_timeout——單一測試卡住時,log 讀不出卡在哪一行"
    )


def test_expect_timeout_is_aligned_with_the_page_default():
    """expect 預設 5 秒、page 預設 20 秒——兩個旋鈕要一起調。"""
    source = (JOURNEY_DIR / "conftest.py").read_text(encoding="utf-8")
    assert "expect.set_options(timeout=" in source, (
        "guarded_page 沒有調 expect 的逾時——set_default_timeout 管不到它,"
        "打真網路時 API 慢於 5 秒的頁面會在斷言處誤判"
    )
