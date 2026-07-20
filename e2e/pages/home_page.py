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

    # --- desktop location filter（Collapsible + FilterChip 膠囊按鈕）------
    # FilterChip 是原生 <button aria-pressed>，以文字為可存取名稱；
    # 每個已選縣市有自己的「{city}的服務區域」面板，「全區」與同名區
    # 都以該面板為 scope 定位，天然對齊 per-city 的選取語意。

    def open_location_filter(self) -> None:
        # 桌面版「服務地區」Collapsible 的觸發鈕（手機版 Sheet 在寬視窗
        # display:none，不會被 role 選中）。
        self.page.get_by_role("button", name="服務地區").click()

    def check_city(self, city: str) -> None:
        self.page.get_by_role("button", name=city, exact=True).click()

    def _city_district_panel(self):
        return self.page.locator("div.rounded-lg")

    def toggle_all_districts(self, city: str) -> None:
        panel = self._city_district_panel().filter(has_text=f"{city}的服務區域")
        panel.get_by_role("button", name="全區", exact=True).click()

    def check_district(self, city: str, district: str) -> None:
        panel = self._city_district_panel().filter(has_text=f"{city}的服務區域")
        panel.get_by_role("button", name=district, exact=True).click()

    # --- locators ----------------------------------------------------------

    def search_box(self) -> Locator:
        # <Input type="search"> → implicit ARIA role "searchbox".
        return self.page.get_by_role("searchbox")

    def card(self, listing_id: str) -> Locator:
        """The visible card link for a given listing id (desktop grid at wide
        viewports, mobile grid at narrow ones — the other is `display:none`)."""
        return self.page.locator(f"a[href='/service-providers/{listing_id}']:visible")

    def cards(self) -> Locator:
        """All currently-visible listing cards, in DOM order — which is render
        order, so `.first` is the top card after any client-side sort."""
        return self.page.locator("a[href^='/service-providers/']:visible")

    def no_results_message(self) -> Locator:
        """Empty state when a search/filter is active but nothing matches."""
        return self.page.get_by_text("沒有找到符合條件的服務者")

    def no_listings_message(self) -> Locator:
        """Empty state when the directory itself has no active listings."""
        return self.page.get_by_text("目前沒有可用的服務者")

    def clear_filters_button(self) -> Locator:
        return self.page.get_by_role("button", name="清除搜尋與篩選")
