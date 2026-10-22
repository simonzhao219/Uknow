"""`MemberDashboard.tsx` — status cards titled after their destination pages."""

import re

from playwright.sync_api import Locator, Page

from pages.base_page import BasePage


class DashboardPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    def heading(self):
        return self.page.get_by_role("heading", name="會員中心")

    def status_card(self, title: str) -> Locator:
        """A whole-card link; its accessible name starts with the card title
        and states everything visible on the card (ui-ux-guidelines §13)."""
        return self.page.get_by_role("link", name=re.compile(f"^{re.escape(title)}"))

    def attention_area(self) -> Locator:
        """The retired 「需要注意」 area — the dashboard no longer has one."""
        return self.page.get_by_role("heading", name="需要注意")
