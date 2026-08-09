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

    def fill_exact(self, locator: Locator, value: str, field: str) -> None:
        """Fill a field and verify it actually took the whole string.

        `fill()` goes through the DOM, and the browser still applies
        `maxlength` — so filling 17 characters into a `maxLength={10}` input
        silently stores 10. Nothing fails at that point: the form validates,
        submits, and creates a record with a truncated value. The failure
        surfaces far away, as some later `get_by_text` finding nothing, with
        no hint pointing back at the fill. That cost the f40/f60 journey
        scenarios a full CI run on 2026-08-08 (run 31231809650).

        This is deliberately a postcondition of the *action* — "the field did
        not accept what I asked it to hold" — not a test expectation about
        product behaviour, so it does not contradict this module's rule that
        page objects never assert.
        """
        locator.fill(value)
        actual = locator.input_value()
        if actual != value:
            raise AssertionError(
                f"{field} did not accept the full value (most likely a maxlength "
                f"truncation): tried to fill {len(value)} chars {value!r}, "
                f"field holds {len(actual)} chars {actual!r}"
            )
