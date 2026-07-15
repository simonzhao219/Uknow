"""`MemberDashboard.tsx` — smoke-level coverage only for this first pass."""

from playwright.sync_api import Page

from pages.base_page import BasePage


class DashboardPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    def heading(self):
        return self.page.get_by_role("heading", name="會員中心")
