"""失敗當下把頁面狀態落地——建樹的瀏覽器沒有別的方式留下證據。

建樹用 org_builder 自己的瀏覽器實例（ThreadPool），不走上層的 page
fixture，所以 --tracing / --screenshot 對它完全無效。少了這個模組，
每個「頁面沒有照預期反應」的失敗都只能靠猜，一輪 CI 換一組猜測。

2026-07-26 用它校準了 PayUni sandbox 的欄位選擇器（那頁的 input 沒有
name 也沒有 id，只有 placeholder——猜不出來，讀出來只花一輪）。
"""

from __future__ import annotations

from pathlib import Path

from playwright.sync_api import Page

_TEST_RESULTS = Path(__file__).resolve().parents[1] / "test-results"

_FIELDS_JS = """els => els.slice(0, 40).map(e =>
     `${e.tagName.toLowerCase()} name=${e.name || '-'} id=${e.id || '-'} `
   + `type=${e.type || '-'} placeholder=${e.placeholder || '-'} text=${(e.innerText || '').trim().slice(0, 20)}`
   ).join('\\n')"""


def dump_page(page: Page, label: str) -> str:
    """存 HTML／截圖並回傳可直接讀的摘要（URL、頁面文字、表單元素）。

    回傳值會被接在錯誤訊息後面——log 讀得到，不必下載 artifact，這是
    它比存檔更重要的部分。任何一段診斷失敗都只降級成一行說明，絕不
    蓋掉原始錯誤。
    """
    parts = [f"目前頁面 URL：{page.url}"]

    try:
        _TEST_RESULTS.mkdir(parents=True, exist_ok=True)
        stem = f"page-{label}"
        (_TEST_RESULTS / f"{stem}.html").write_text(page.content(), encoding="utf-8")
        page.screenshot(path=str(_TEST_RESULTS / f"{stem}.png"), full_page=True)
    except Exception as exc:
        parts.append(f"（頁面存檔失敗：{exc}）")

    # 頁面文字先於元素清單：金流頁的失敗多半直接寫在畫面上
    # （例如「授權失敗(模擬)」），一眼就能定位。
    try:
        text = " ".join(page.inner_text("body").split())
        parts.append(f"頁面文字（前 600 字）：{text[:600]}")
    except Exception as exc:
        parts.append(f"（頁面文字取得失敗：{exc}）")

    try:
        parts.append("表單元素：\n" + page.eval_on_selector_all("input, select, button", _FIELDS_JS))
    except Exception as exc:
        parts.append(f"（表單元素取得失敗：{exc}）")

    return "\n".join(parts)
