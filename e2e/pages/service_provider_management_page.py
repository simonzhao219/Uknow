"""`ServiceProviderManagement.tsx` — the 刊登管理 landing page (route
`/service-providers`). Lists the member's single listing, or an empty state
with a "刊登新服務" call to action, plus view / edit / delete actions."""

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

    def click_delete(self) -> "ServiceProviderManagementPage":
        self.delete_button().click()
        return self
