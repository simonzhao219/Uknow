"""`ServiceProviderDetail.tsx` — the public listing detail page (route
`/service-providers/:id`, no auth guard). Reads the `public_listings` view."""

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

    def back_link(self):
        return self.page.get_by_role("button", name="返回", exact=True)
