"""失敗當下把頁面狀態落地——建樹的瀏覽器沒有別的方式留下證據。

建樹用 org_builder 自己的瀏覽器實例（ThreadPool），不走上層的 page
fixture，所以 --tracing / --screenshot 對它完全無效。少了這個模組，
每個「頁面沒有照預期反應」的失敗都只能靠猜，一輪 CI 換一組猜測。

2026-07-26 用它校準了 PayUni sandbox 的欄位選擇器（那頁的 input 沒有
name 也沒有 id，只有 placeholder——猜不出來，讀出來只花一輪）。
"""

from __future__ import annotations

import time
import weakref
from collections import deque
from contextlib import contextmanager
from pathlib import Path

from playwright.sync_api import Page

_TEST_RESULTS = Path(__file__).resolve().parents[1] / "test-results"

# 診斷本身不能成為下一個卡點。2026-10-03 run 37143906920 的 f30 FAILED 耗時
# 3 分 47 秒(正常 15 秒上下):舊版 dump_page 的 inner_text／screenshot 沒給
# timeout,content()／eval_on_selector_all 則**根本沒有** timeout 參數——頁面
# 主執行緒卡住時,失敗後的診斷會比失敗本身更久。所以有 timeout 的給上限,
# 沒有的先用一個有上限的探測確認頁面還活著,死了就整段略過並明說。
_PIECE_TIMEOUT_MS = 5_000

_EVENT_LIMIT = 80
_SLOW_REQUEST_S = 5.0
# 用弱引用當鍵:id(page) 會在 page 被回收後重複使用,後面的情境會繼承前一個
# 情境的事件紀錄,或被誤判成「已經掛過」而沒掛上。
_events: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()
_live_writer = None

# value 一起帶回來：不少「畫面看起來填好了、送出卻沒反應」的失敗，唯一
# 的分界就在欄位到底有沒有值（遮罩輸入、React 還沒掛上 handler…）。密碼
# 只回長度，不回內容。
_FIELDS_JS = """els => els.slice(0, 40).map(e => {
     const v = e.type === 'password' ? (e.value ? `<${e.value.length} 碼>` : '') : (e.value || '');
     return `${e.tagName.toLowerCase()} name=${e.name || '-'} id=${e.id || '-'} `
       + `type=${e.type || '-'} placeholder=${e.placeholder || '-'} value=${v || '-'} `
       + `text=${(e.innerText || '').trim().slice(0, 20)}`;
   }).join('\\n')"""


def set_live_writer(writer) -> None:
    """由 conftest 綁定 terminalreporter——直接 print 會被 pytest 擷取,失敗前看不到。"""
    global _live_writer
    _live_writer = writer


def live(message: str) -> None:
    """即時輸出一行(不被擷取)。runner 中途被收掉時,log 仍留得下進度。"""
    line = f"  [journey] {message}"
    if _live_writer is not None:
        _live_writer(line)
    else:
        print(line, flush=True)


def attach_event_log(page: Page) -> None:
    """記下瀏覽器端的事件:整頁導航、HTTP 錯誤、慢請求、console error、頁面例外。

    快照只看得到失敗**瞬間**的畫面。「中途整頁 reload 把對話框洗掉」「某支 API
    回 5xx」「Vite 的依賴重新最佳化」這類原因發生在過去,只能事先記下來。
    環形緩衝,只留最近 _EVENT_LIMIT 筆。
    """
    if page in _events:
        return
    log: deque = deque(maxlen=_EVENT_LIMIT)
    _events[page] = log
    started: dict[object, float] = {}

    def add(kind: str, detail: str) -> None:
        log.append(f"{time.strftime('%H:%M:%S')} {kind} {detail}"[:300])

    def on_request(request) -> None:
        started[request] = time.monotonic()

    def on_finished(request) -> None:
        t0 = started.pop(request, None)
        if t0 is not None and time.monotonic() - t0 >= _SLOW_REQUEST_S:
            add("慢請求", f"{time.monotonic() - t0:.1f}s {request.method} {request.url}")

    def on_response(response) -> None:
        if response.status >= 400:
            add("HTTP", f"{response.status} {response.request.method} {response.url}")

    def on_failed(request) -> None:
        started.pop(request, None)
        add("請求失敗", f"{request.method} {request.url} {request.failure}")

    def on_nav(frame) -> None:
        if frame.parent_frame is None:
            add("導航", frame.url)

    def on_console(msg) -> None:
        if msg.type in ("error", "warning") or msg.text.startswith("[vite]"):
            add(f"console.{msg.type}", msg.text)

    page.on("request", on_request)
    page.on("requestfinished", on_finished)
    page.on("response", on_response)
    page.on("requestfailed", on_failed)
    page.on("framenavigated", on_nav)
    page.on("console", on_console)
    page.on("pageerror", lambda exc: add("頁面例外", str(exc)))


def dump_page(page: Page, label: str) -> str:
    """存 HTML／截圖並回傳可直接讀的摘要（URL、事件紀錄、頁面文字、表單元素）。

    回傳值會被接在錯誤訊息後面——log 讀得到，不必下載 artifact，這是
    它比存檔更重要的部分。任何一段診斷失敗都只降級成一行說明，絕不
    蓋掉原始錯誤，也絕不無限期等待（見 _PIECE_TIMEOUT_MS）。
    """
    parts = [f"目前頁面 URL：{page.url}"]

    log = _events.get(page)
    if log:
        parts.append("瀏覽器事件（最近，舊→新）：\n" + "\n".join(f"  {e}" for e in log))

    # 頁面文字兼作探測:它有 timeout,拿不到就代表頁面主執行緒沒在回應,
    # 後面沒有 timeout 參數的呼叫一律不碰。金流頁的失敗多半直接寫在畫面上
    # （例如「授權失敗(模擬)」），一眼就能定位。
    alive = True
    try:
        text = " ".join(page.inner_text("body", timeout=_PIECE_TIMEOUT_MS).split())
        parts.append(f"頁面文字（前 600 字）：{text[:600]}")
    except Exception as exc:
        alive = False
        parts.append(
            f"（頁面無回應或文字取得失敗：{exc}——略過存檔與表單元素,"
            "它們沒有 timeout 參數,頁面卡住時會無限期等待）"
        )

    if alive:
        try:
            _TEST_RESULTS.mkdir(parents=True, exist_ok=True)
            stem = f"page-{label}"
            (_TEST_RESULTS / f"{stem}.html").write_text(page.content(), encoding="utf-8")
            page.screenshot(path=str(_TEST_RESULTS / f"{stem}.png"), full_page=True,
                            timeout=_PIECE_TIMEOUT_MS)
        except Exception as exc:
            parts.append(f"（頁面存檔失敗：{exc}）")

        try:
            parts.append("表單元素：\n" + page.eval_on_selector_all("input, select, button", _FIELDS_JS))
        except Exception as exc:
            parts.append(f"（表單元素取得失敗：{exc}）")

    return "\n".join(parts)


@contextmanager
def phase(page: Page, name: str):
    """把一段多步驟流程切成有名字的階段,失敗時指出死在哪一段、各段花了多久。

    只有「FAILED + 3 分 47 秒」的失敗不知道時間花在哪。這裡每段結束即時印一行
    (runner 中途被收掉也留得下),失敗時把已完成階段的耗時一起接進錯誤訊息。
    """
    timeline = _timelines.setdefault(page, [])
    t0 = time.monotonic()
    live(f"階段開始：{name}")
    try:
        yield
    except Exception as exc:
        elapsed = time.monotonic() - t0
        live(f"階段失敗：{name}（{elapsed:.1f}s）")
        done = "\n".join(f"  ✓ {n}：{s:.1f}s" for n, s in timeline) or "  （無已完成階段）"
        message = (
            f"[階段「{name}」失敗，該階段已耗時 {elapsed:.1f}s] {type(exc).__name__}: {exc}\n"
            f"已完成階段：\n{done}"
        )
        if "目前頁面 URL：" not in str(exc):
            message += "\n" + dump_page(page, f"phase-{name}")
        raise AssertionError(message) from exc
    else:
        elapsed = time.monotonic() - t0
        timeline.append((name, elapsed))
        live(f"階段完成：{name}（{elapsed:.1f}s）")


_timelines: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()
