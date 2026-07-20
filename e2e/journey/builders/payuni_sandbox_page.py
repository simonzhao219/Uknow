"""PayUni sandbox 刷卡頁的 Page Object——journey 套件唯一的「外部」頁面。

⚠️ 選擇器狀態：依 PayUni 收銀台的常見欄位命名寫的第一版，**尚未對真
sandbox 驗證**（M1 首次帶憑證執行時校準；sandbox 改版也只需要修這一
個檔案）。每個欄位都用候選清單，第一個出現的生效，降低改版斷裂面。
"""

from __future__ import annotations

from playwright.sync_api import Page

SANDBOX_URL_GLOB = "https://sandbox-api.payuni.com.tw/**"

_CARD_NUMBER_CANDIDATES = [
    "input[name='cardNo']",
    "input[name='card_no']",
    "input[autocomplete='cc-number']",
    "input[placeholder*='卡號']",
]
_EXPIRY_CANDIDATES = [
    "input[name='cardExpired']",
    "input[name='exp_date']",
    "input[autocomplete='cc-exp']",
    "input[placeholder*='有效']",
]
_CVV_CANDIDATES = [
    "input[name='cardCvc']",
    "input[name='cvc']",
    "input[autocomplete='cc-csc']",
    "input[placeholder*='CVV'], input[placeholder*='末三碼']",
]
_SUBMIT_CANDIDATES = [
    "button[type='submit']",
    "button:has-text('確認付款')",
    "button:has-text('付款')",
    "input[type='submit']",
]


class PayuniSandboxPage:
    def __init__(self, page: Page):
        self.page = page

    def wait_loaded(self, timeout: float = 60_000) -> None:
        self.page.wait_for_url(SANDBOX_URL_GLOB, timeout=timeout)
        self.page.wait_for_load_state("domcontentloaded")

    def _first_present(self, candidates: list[str], label: str):
        for selector in candidates:
            locator = self.page.locator(selector).first
            if locator.count() > 0:
                return locator
        raise RuntimeError(
            f"PayUni sandbox 頁找不到「{label}」欄位——頁面結構可能已改版，"
            f"請更新 payuni_sandbox_page.py 的候選選擇器（tried: {candidates}）"
        )

    def complete_payment(self, card_number: str, expiry: str, cvv: str) -> None:
        """填測試卡並送出；成功後 PayUni 會 302 回我們的 /payuni/return。"""
        self.wait_loaded()
        self._first_present(_CARD_NUMBER_CANDIDATES, "卡號").fill(card_number)
        self._first_present(_EXPIRY_CANDIDATES, "有效期").fill(expiry)
        self._first_present(_CVV_CANDIDATES, "CVV").fill(cvv)
        self._first_present(_SUBMIT_CANDIDATES, "送出").click()
