"""`ReferralManagement.tsx` — the referral page: stats, attention banner, tree."""

import re

from playwright.sync_api import Locator, Page

from pages.base_page import BasePage


class ReferralPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    def heading(self) -> Locator:
        return self.page.get_by_role("heading", name="推薦管理")

    def tree(self) -> Locator:
        return self.page.get_by_role("tree", name="我的推薦網絡")

    def show_all_button(self) -> Locator:
        """「全部 N 位 ›」 — only present when more members are about to expire
        than the banner can list."""
        return self.page.get_by_role("button", name=re.compile(r"^全部 \d+ 位"))

    def back_to_tree_button(self) -> Locator:
        return self.page.get_by_role("button", name="返回推薦樹")

    def shown_count(self, shown: int, total: int) -> Locator:
        return self.page.get_by_text(f"已顯示 {shown} / {total} 筆記錄")

    def load_more_button(self) -> Locator:
        return self.page.get_by_role("button", name="加載更多")

    def load_error(self) -> Locator:
        return self.page.get_by_text("暫時無法取得推薦資料")

    def retry_button(self) -> Locator:
        return self.page.get_by_role("button", name="重新載入")
