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
