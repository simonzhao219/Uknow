"""`ServiceProviderManagement.tsx` — the 刊登管理 landing page (route
`/service-providers`). Lists the member's single listing with its status
(「上架中」 + 會籍至; the only other status is 「已隱藏」), or an empty state with a
"刊登新服務" call to action, plus view / edit / delete actions."""

from playwright.sync_api import Page

from pages.base_page import BasePage


class ServiceProviderManagementPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    def heading(self):
        return self.page.get_by_role("heading", name="刊登管理")

    def empty_state(self):
        return self.page.get_by_text("尚未刊登服務者")

    def create_link(self):
        return self.page.get_by_role("link", name="刊登新服務")

    def delete_button(self):
        return self.page.get_by_role("button", name="刪除刊登")

    def edit_link(self):
        return self.page.get_by_role("link", name="編輯刊登")

    def view_link(self):
        return self.page.get_by_role("link", name="查看刊登")

    def status_badge(self, label: str):
        """The listing status badge: 「上架中」 (membership active) or 「已隱藏」."""
        return self.page.get_by_text(label, exact=True)

    def member_until(self, date: str):
        return self.page.get_by_text(f"會籍至 {date}")

    def load_error(self):
        return self.page.get_by_text("暫時無法取得刊登狀態")

    def retry_button(self):
        return self.page.get_by_role("button", name="重新載入")

    def click_delete(self) -> "ServiceProviderManagementPage":
        self.delete_button().click()
        return self
