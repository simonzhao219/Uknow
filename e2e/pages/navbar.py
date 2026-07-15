"""`Navbar.tsx` — header links present on every page, modelled as a
component object rather than a full page since it's shared across routes."""

from playwright.sync_api import Page


class Navbar:
    def __init__(self, page: Page):
        self.page = page

    def click_login(self) -> "Navbar":
        self.page.get_by_role("link", name="登入", exact=True).click()
        return self

    def click_register(self) -> "Navbar":
        self.page.get_by_role("link", name="立即刊登", exact=True).click()
        return self
