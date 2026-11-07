"""`ServiceProviderDetail.tsx` — the public listing detail page (route
`/service-providers/:id`, no auth guard). Reads the `public_listings` view."""

import re

from playwright.sync_api import Page

from pages.base_page import BasePage


class ServiceProviderDetailPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    def name_heading(self, name: str):
        return self.page.get_by_role("heading", name=name)

    def description_section(self):
        return self.page.get_by_role("heading", name="服務介紹")

    def contact_section(self):
        return self.page.get_by_role("heading", name="聯絡方式")

    def not_found(self):
        return self.page.get_by_role("heading", name="找不到此服務者")

    # --- 載入與讀取失敗（S6）------------------------------------------------
    # 骨架是 <output aria-busy aria-label="載入服務者詳情中">（隱含 role="status"）；
    # 讀取失敗是 warning 提示框，標題為 h2，唯一出路是「重試」。

    def loading_skeleton(self):
        return self.page.get_by_role("status", name="載入服務者詳情中")

    def load_error(self):
        return self.page.get_by_role("heading", name="暫時無法載入服務者資料")

    def retry_button(self):
        return self.page.get_by_role("button", name="重試")

    def back_button(self):
        """頁首返回圖示鈕。名稱說去向：站內有上一頁時「返回上一頁」，從分享連結直接
        開進來（沒有站內歷史）時「回首頁」。"""
        return self.page.get_by_role("button", name=re.compile(r"^(返回上一頁|回首頁)$"))

    # --- 換篇（S7）----------------------------------------------------------
    # 頁首列右側的「‹ 3/12 ›」：<nav aria-label="換篇">，按鈕名稱是「上一篇／下一篇」
    # （輪播自己的箭頭叫「上一張／下一張」，不會撞名）。頭尾的鈕用 aria-disabled，不是 disabled。

    def browse_nav(self):
        return self.page.get_by_role("navigation", name="換篇")

    def browse_button(self, label: str):
        return self.browse_nav().get_by_role("button", name=label)
