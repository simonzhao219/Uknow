"""`HomePage.tsx` — the public landing page (route `/`, no auth guard). Reads
the `public_listings` view as a list and filters it client-side by keyword
(name / description / tags), category, location and gender. Renders each
provider as a `<Link>` card to `/service-providers/:id`.

Both a mobile and a desktop card grid are always in the DOM (one hidden by a
responsive `md:` class); at the suite's 1280px viewport the desktop grid is the
visible one, so card locators are scoped with `:visible` to avoid the hidden
mobile duplicate."""

from playwright.sync_api import Locator, Page

from pages.base_page import BasePage


class HomePage(BasePage):
    PATH = "/"

    def __init__(self, page: Page):
        super().__init__(page)

    def open(self) -> "HomePage":
        self.goto(self.PATH)
        return self

    # --- actions -----------------------------------------------------------

    def search(self, text: str) -> None:
        self.search_box().fill(text)

    def clear_filters(self) -> None:
        self.clear_filters_button().click()

    def open_listing(self, listing_id: str) -> None:
        self.card(listing_id).click()

    # --- locators ----------------------------------------------------------

    def search_box(self) -> Locator:
        # <Input type="search"> → implicit ARIA role "searchbox".
        return self.page.get_by_role("searchbox")

    def card(self, listing_id: str) -> Locator:
        """The visible (desktop) card link for a given listing id."""
        return self.page.locator(f"a[href='/service-providers/{listing_id}']:visible")

    def no_results_message(self) -> Locator:
        """Empty state when a search/filter is active but nothing matches."""
        return self.page.get_by_text("沒有找到符合條件的服務者")

    def no_listings_message(self) -> Locator:
        """Empty state when the directory itself has no active listings."""
        return self.page.get_by_text("目前沒有可用的服務者")

    def clear_filters_button(self) -> Locator:
        return self.page.get_by_role("button", name="清除搜尋與篩選")
