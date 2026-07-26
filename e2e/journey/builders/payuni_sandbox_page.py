"""PayUni sandbox 刷卡頁的 Page Object——journey 套件唯一的「外部」頁面。

選擇器狀態：**2026-07-26 已對真 sandbox 校準**（見下方各清單的註解）。
每個欄位都用候選清單，第一個出現的生效，降低改版斷裂面；對不上時會把
當下的頁面結構印進錯誤訊息（page_diagnostics），所以下次改版只要讀
log 就能改對，不必猜。

⚠️ 這頁**不是只有卡號/有效期/CVV**：付款人電子信箱是必填。少填它的症狀
不是報錯，是「什麼都沒發生」——所以送出後有一道「表單真的消失了嗎」的
檢查，讓這類沉默失敗當場現形，而不是拖到上層導回逾時才發現。
"""

from __future__ import annotations

from playwright.sync_api import Page, expect

from builders.page_diagnostics import dump_page

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
# 付款人電子信箱：**必填**。2026-07-26 那輪整整停在表單上不動，就是因為
# 它空著——驗證失敗的提示框還被下面的確認框探測按掉了，所以 180 秒後畫面
# 看起來像什麼都沒送出。
_EMAIL_CANDIDATES = [
    "input[type='email']",
    "input[autocomplete='email']",
    "input[name='payerEmail']",
]
# 付款方式的 radio。卡片欄位預設就看得到，但不確定 radio 是否已選——
# 明確選一次比較保險（已選就不動）。
_CREDIT_RADIO_CANDIDATES = [
    "input[type='radio'][name='radioOptionpayGroupCredit']",
    "input[type='radio'][name*='Credit']",
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
# ⚠️ 這顆在表單階段就已經在 DOM 裡（隱藏的 modal），而且**也可能是驗證
# 失敗提示框的確定鍵**——按掉之後畫面跟沒送出一樣。所以按之前先把當下的
# 頁面文字留下來，失敗時帶得出去。
_CONFIRM_CANDIDATES = [
    "button:has-text('確定')",
]


class PayuniSandboxPage:
    def __init__(self, page: Page):
        self.page = page

    def wait_loaded(self, timeout: float = 60_000) -> None:
        self.page.wait_for_url(SANDBOX_URL_GLOB, timeout=timeout)
        self.page.wait_for_load_state("domcontentloaded")

    def _optional(self, candidates: list[str]):
        """找得到就回 locator，找不到回 None——用於「有才填」的欄位。"""
        for selector in candidates:
            locator = self.page.locator(selector).first
            if locator.count() > 0:
                return locator
        return None

    def _first_present(self, candidates: list[str], label: str):
        locator = self._optional(candidates)
        if locator is not None:
            return locator
        raise RuntimeError(
            f"PayUni sandbox 頁找不到「{label}」欄位——頁面結構可能已改版，"
            f"請更新 payuni_sandbox_page.py 的候選選擇器（tried: {candidates}）\n"
            f"{dump_page(self.page, label)}"
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

    def complete_payment(
        self, card_number: str, expiry: str, cvv: str, payer_email: str = ""
    ) -> None:
        """填測試卡並送出；成功後 PayUni 會 302 回我們的 /payuni/return。"""
        self.wait_loaded()

        credit_radio = self._optional(_CREDIT_RADIO_CANDIDATES)
        if credit_radio is not None and not credit_radio.is_checked():
            credit_radio.check()

        card_field = self._first_present(_CARD_NUMBER_CANDIDATES, "卡號")
        card_field.fill(card_number)
        self._first_present(_EXPIRY_CANDIDATES, "有效期").fill(self._format_expiry(expiry))
        self._first_present(_CVV_CANDIDATES, "CVV").fill(cvv)

        email_field = self._optional(_EMAIL_CANDIDATES)
        if email_field is not None and payer_email:
            email_field.fill(payer_email)

        self._first_present(_SUBMIT_CANDIDATES, "送出").click()
        dialog_context = self._dismiss_optional_confirm()

        # 卡號欄位消失 ＝ 表單真的送出去了（換頁會讓 locator 解不到，原地
        # 重繪會讓它隱藏，兩種都接得住）。停在原地就不要再去耗上層那 180
        # 秒的導回等待——當下把畫面帶回來，錯在哪一眼就看到。
        try:
            expect(card_field).to_be_hidden(timeout=45_000)
        except AssertionError as exc:
            raise RuntimeError(
                "按下「確認送出」後 45 秒，PayUni 的刷卡表單仍在畫面上——"
                "多半是欄位驗證沒過。\n"
                f"送出後彈框當下的頁面文字：{dialog_context or '（沒有彈出確認框）'}\n"
                f"{dump_page(self.page, 'payuni-not-submitted')}"
            ) from exc

    def _dismiss_optional_confirm(self) -> str:
        """有確認框就記下當下頁面文字再按掉，沒有就回空字串。

        用短 timeout 探一下，不要用預設的 30 秒去等一個本來就可能不存在的
        東西。回傳的文字是失敗診斷用的——見 `_CONFIRM_CANDIDATES` 的說明。
        """
        for selector in _CONFIRM_CANDIDATES:
            locator = self.page.locator(selector).first
            try:
                locator.wait_for(state="visible", timeout=3_000)
            except Exception:
                continue
            text = ""
            try:
                text = " ".join(self.page.inner_text("body").split())[:300]
            except Exception:
                pass
            locator.click()
            return text
        return ""
