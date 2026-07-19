"""`AdminDashboard.tsx` — the admin-only console at `/admin` (guarded by
AdminRoute). A Radix `Tabs` with four triggers (獎金提領管理 / 會員管理 /
公告管理 / 管理員設置); only the active tab's panel is mounted, so switching
tabs is what triggers each management component's data fetch."""

from playwright.sync_api import Locator, Page

from pages.base_page import BasePage


class AdminDashboardPage(BasePage):
    PATH = "/admin"

    def __init__(self, page: Page):
        super().__init__(page)

    def open(self) -> "AdminDashboardPage":
        self.goto(self.PATH)
        return self

    def heading(self) -> Locator:
        return self.page.get_by_role("heading", name="平台管理")

    def tab(self, name: str) -> Locator:
        # Radix TabsTrigger exposes ARIA role "tab".
        return self.page.get_by_role("tab", name=name)

    def open_tab(self, name: str) -> None:
        self.tab(name).click()
