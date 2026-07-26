"""PayUni sandbox 刷卡頁的 Page Object——journey 套件唯一的「外部」頁面。

⚠️ 選擇器狀態：依 PayUni 收銀台的常見欄位命名寫的第一版，**尚未對真
sandbox 驗證**（M1 首次帶憑證執行時校準；sandbox 改版也只需要修這一
個檔案）。每個欄位都用候選清單，第一個出現的生效，降低改版斷裂面。
"""

from __future__ import annotations

from pathlib import Path

from playwright.sync_api import Page

SANDBOX_URL_GLOB = "https://sandbox-api.payuni.com.tw/**"

# 2026-07-26 對真 sandbox 校準：那頁的欄位**沒有 name 也沒有 id**，唯一
# 穩定的識別是 placeholder。候選清單把實測值放第一，其餘保留為改版時的
# 後備（PayUni 若哪天補上語意屬性，那些會先命中）。
_CARD_NUMBER_CANDIDATES = [
    "input[placeholder='**** **** **** ****']",
    "input[autocomplete='cc-number']",
    "input[name='cardNo']",
    "input[name='card_no']",
]
_EXPIRY_CANDIDATES = [
    "input[placeholder='MM/YY']",
    "input[autocomplete='cc-exp']",
    "input[name='cardExpired']",
    "input[name='exp_date']",
]
_CVV_CANDIDATES = [
    "input[type='tel'][placeholder='***']",
    "input[autocomplete='cc-csc']",
    "input[name='cardCvc']",
    "input[name='cvc']",
]
# ⚠️ 這頁有三顆 type=submit（其中一顆完全沒有文字），所以泛用的
# `button[type='submit']` 必須排在最後——它原本排第一，會點到那顆空白的。
_SUBMIT_CANDIDATES = [
    "button:has-text('確認送出')",
    "button:has-text('確認付款')",
    "button:has-text('付款')",
    "button[type='submit']",
    "input[type='submit']",
]
# 送出後可能跳確認框；有就按，沒有就跳過（不同金額/卡別行為不一）。
_CONFIRM_CANDIDATES = [
    "button:has-text('確定')",
]


class PayuniSandboxPage:
    def __init__(self, page: Page):
        self.page = page

    def wait_loaded(self, timeout: float = 60_000) -> None:
        self.page.wait_for_url(SANDBOX_URL_GLOB, timeout=timeout)
        self.page.wait_for_load_state("domcontentloaded")

    def _dump_page(self, label: str) -> str:
        """把當下的頁面結構落地，讓「選擇器對不上」變成可以直接修的資訊。

        校準這些選擇器需要看到真的 sandbox 頁，但沒有人能從 CI runner 以外
        的地方看到它——建樹用自己的瀏覽器實例（org_builder 的 ThreadPool），
        不走 pytest-playwright 的 page fixture，所以 --tracing/--screenshot
        都不會產出東西。少了這一步，每次改選擇器都只是換一組猜測。
        """
        out_dir = Path(__file__).resolve().parents[1] / "test-results"
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = f"payuni-sandbox-{label}"
        try:
            (out_dir / f"{stem}.html").write_text(self.page.content(), encoding="utf-8")
            self.page.screenshot(path=str(out_dir / f"{stem}.png"), full_page=True)
        except Exception as exc:  # 診斷失敗不該蓋掉原始錯誤
            return f"（頁面存檔失敗：{exc}）"

        try:
            fields = self.page.eval_on_selector_all(
                "input, select, button",
                """els => els.slice(0, 40).map(e =>
                     `${e.tagName.toLowerCase()} name=${e.name || '-'} id=${e.id || '-'} `
                   + `type=${e.type || '-'} placeholder=${e.placeholder || '-'} text=${(e.innerText || '').trim().slice(0, 20)}`
                   ).join('\\n')""",
            )
        except Exception as exc:
            fields = f"（欄位清單取得失敗：{exc}）"
        return f"目前頁面 URL：{self.page.url}\n實際的表單元素：\n{fields}"

    def _first_present(self, candidates: list[str], label: str):
        for selector in candidates:
            locator = self.page.locator(selector).first
            if locator.count() > 0:
                return locator
        raise RuntimeError(
            f"PayUni sandbox 頁找不到「{label}」欄位——頁面結構可能已改版，"
            f"請更新 payuni_sandbox_page.py 的候選選擇器（tried: {candidates}）\n"
            f"{self._dump_page(label)}"
        )

    @staticmethod
    def _format_expiry(expiry: str) -> str:
        """MMYY → MM/YY。

        設定值沿用 conftest 的四碼慣例（0933），但這頁的欄位期待 MM/YY。
        多數收銀台會自動補斜線，PayUni 這頁沒有明說，補了比較保險——
        已經帶斜線的值原樣放行。
        """
        digits = expiry.strip()
        if "/" in digits or len(digits) != 4:
            return digits
        return f"{digits[:2]}/{digits[2:]}"

    def complete_payment(self, card_number: str, expiry: str, cvv: str) -> None:
        """填測試卡並送出；成功後 PayUni 會 302 回我們的 /payuni/return。"""
        self.wait_loaded()
        self._first_present(_CARD_NUMBER_CANDIDATES, "卡號").fill(card_number)
        self._first_present(_EXPIRY_CANDIDATES, "有效期").fill(self._format_expiry(expiry))
        self._first_present(_CVV_CANDIDATES, "CVV").fill(cvv)
        self._first_present(_SUBMIT_CANDIDATES, "送出").click()

        # 確認框是可選的：出現就按，沒出現不算失敗（用短 timeout 探一下，
        # 不要用預設的 30 秒去等一個本來就可能不存在的東西）。
        for selector in _CONFIRM_CANDIDATES:
            locator = self.page.locator(selector).first
            try:
                locator.wait_for(state="visible", timeout=3_000)
            except Exception:
                continue
            locator.click()
            break
