"""頁面診斷的離線測試——用替身 page,不開瀏覽器。

## 在防什麼

2026-10-03 CI run 37143906920 的 f30「領取推薦王獎勵」FAILED,耗時 3 分 47 秒
(正常 15 秒上下)。當時的診斷有兩個洞:

1. `dump_page` 的 `inner_text`／`screenshot` 沒給 timeout、`content()`／
   `eval_on_selector_all` 根本沒有 timeout 參數——頁面主執行緒卡住時,失敗後的
   「診斷」本身就是下一個卡點,把一次失敗拖成好幾分鐘。
2. 瀏覽器端發生了什麼(整頁 reload、API 4xx/5xx、console error)完全沒有
   紀錄,頁面只剩失敗瞬間的快照。
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from builders import page_diagnostics


class StubPage:
    url = "http://localhost:3100/tasks"

    def __init__(self, alive: bool = True):
        self.alive = alive
        self.calls: list[tuple[str, dict]] = []
        self.handlers: dict[str, list] = {}

    def on(self, event, handler):
        self.handlers.setdefault(event, []).append(handler)

    def fire(self, event, payload):
        for handler in self.handlers.get(event, []):
            handler(payload)

    def inner_text(self, selector, **kw):
        self.calls.append(("inner_text", kw))
        if not self.alive:
            raise TimeoutError("renderer hung")
        return "任務中心 免費續約 1 年"

    def content(self):
        self.calls.append(("content", {}))
        return "<html></html>"

    def screenshot(self, **kw):
        self.calls.append(("screenshot", kw))

    def eval_on_selector_all(self, selector, js):
        self.calls.append(("eval_on_selector_all", {}))
        return "button name=- id=- type=button placeholder=- value=- text=下一步"


@pytest.fixture(autouse=True)
def _isolated_results_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(page_diagnostics, "_TEST_RESULTS", tmp_path)


def test_every_renderer_bound_call_that_can_take_a_timeout_gets_one():
    page = StubPage()
    page_diagnostics.dump_page(page, "unit")
    for name, kw in page.calls:
        if name in ("inner_text", "screenshot"):
            assert kw.get("timeout"), f"{name} 沒給 timeout——卡住的頁面會讓診斷本身變成下一個卡點"


def test_hung_page_skips_the_calls_that_cannot_be_bounded():
    page = StubPage(alive=False)
    out = page_diagnostics.dump_page(page, "unit")
    names = [n for n, _ in page.calls]
    assert "content" not in names and "eval_on_selector_all" not in names, (
        "頁面已無回應時還去呼叫沒有 timeout 參數的 content()／eval_on_selector_all,"
        "會無限期卡住"
    )
    assert "screenshot" not in names
    assert "無回應" in out, "要明說頁面沒回應,不然讀的人會以為只是沒有內容"


def test_dump_includes_url_and_text_when_page_is_alive():
    out = page_diagnostics.dump_page(StubPage(), "unit")
    assert "http://localhost:3100/tasks" in out
    assert "免費續約 1 年" in out


def test_event_log_records_navigation_http_errors_and_page_errors():
    page = StubPage()
    page_diagnostics.attach_event_log(page)
    page.fire("framenavigated", SimpleNamespace(parent_frame=None, url="http://x/tasks"))
    page.fire("framenavigated", SimpleNamespace(parent_frame=object(), url="http://x/iframe"))
    page.fire(
        "response",
        SimpleNamespace(status=504, url="http://x/node_modules/.vite/deps/a.js?v=1",
                        request=SimpleNamespace(method="GET")),
    )
    page.fire("pageerror", Exception("boom"))
    page.fire("console", SimpleNamespace(type="error", text="Failed to load"))
    page.fire("console", SimpleNamespace(type="log", text="noise"))
    out = page_diagnostics.dump_page(page, "unit")
    assert "導航" in out and "http://x/tasks" in out
    assert "iframe" not in out, "子 frame 導航不是整頁 reload,不該混進來"
    assert "504" in out and "a.js" in out
    assert "boom" in out and "Failed to load" in out
    assert "noise" not in out


def test_event_log_is_bounded():
    page = StubPage()
    page_diagnostics.attach_event_log(page)
    for i in range(500):
        page.fire("pageerror", Exception(f"e{i}"))
    out = page_diagnostics.dump_page(page, "unit")
    assert "e499" in out and "e0\n" not in out


def test_phase_failure_names_the_phase_and_carries_the_timeline():
    page = StubPage()
    with pytest.raises(AssertionError) as info:
        with page_diagnostics.phase(page, "登入"):
            pass
        with page_diagnostics.phase(page, "領取"):
            raise TimeoutError("waiting for locator")
    message = str(info.value)
    assert "領取" in message and "waiting for locator" in message
    assert "登入" in message, "時間軸要列出已完成的階段與各自耗時"
    assert "http://localhost:3100/tasks" in message


def test_phase_does_not_dump_twice_when_the_error_already_carries_a_dump():
    page = StubPage()
    inner = AssertionError("等不到成功字樣\n目前頁面 URL：http://x")
    with pytest.raises(AssertionError) as info:
        with page_diagnostics.phase(page, "領取"):
            raise inner
    assert str(info.value).count("目前頁面 URL：") == 1
