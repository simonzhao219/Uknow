"""Shared conveniences for every page object. Page objects perform actions
and expose locators/state getters only — they never assert. Assertions live
in the `then_*` step functions, using Playwright's auto-retrying `expect()`."""

from playwright.sync_api import Locator, Page


class BasePage:
    def __init__(self, page: Page):
        self.page = page

    def goto(self, path: str = "/") -> "BasePage":
        self.page.goto(path)
        return self

    def toast(self) -> Locator:
        """The most recent toast raised via `useNotification().showToast()`."""
        return self.page.get_by_test_id("toast").last

    def confirmation_dialog_button(self, name: str) -> Locator:
        """Buttons inside the blocking `NotificationCard` confirm/cancel dialog
        (e.g. the referral-code confirmation warning), matched by their exact
        label since each call site supplies distinct confirm/cancel text."""
        return self.page.get_by_role("button", name=name)

    def wait_for_path(self, path: str, timeout: int = 10_000) -> None:
        self.page.wait_for_url(f"**{path}", timeout=timeout)
