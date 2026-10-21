"""`TaskDashboard.tsx` — the task center: this round's progress, four medals, pending rewards."""

from playwright.sync_api import Locator, Page

from pages.base_page import BasePage


class TaskPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    def heading(self) -> Locator:
        return self.page.get_by_role("heading", name="任務中心")

    def round_progress(self) -> Locator:
        """The main number: this round's "x / target"."""
        return self.page.get_by_test_id("round-progress")

    def medals(self) -> Locator:
        """The four medals, each carrying its fill as data-fill (0, 0.5 or 1)."""
        return self.page.locator("li[data-fill]")

    def medal_fills(self) -> list[str]:
        return [item.get_attribute("data-fill") for item in self.medals().all()]

    def claim_button(self) -> Locator:
        return self.page.get_by_role("button", name="領取獎勵")

    def not_joined_link(self) -> Locator:
        return self.page.get_by_role("link", name="前往推薦管理加入")

    def load_error(self) -> Locator:
        return self.page.get_by_text("暫時無法取得任務資料")

    def retry_button(self) -> Locator:
        return self.page.get_by_role("button", name="重新載入")
