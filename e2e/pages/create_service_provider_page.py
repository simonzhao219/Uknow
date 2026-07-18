"""`CreateServiceProvider.tsx` — the 刊登新服務 form (route
`/service-providers/create`). One-step form: name, category, gender, city
(auto-selects every district), exactly 3 photos, and ≥1 contact."""

from playwright.sync_api import Page

from pages.base_page import BasePage

# A tiny but validly-typed JPEG payload; only File.type (image/jpeg) and size
# (<5MB) are checked client-side before upload, and the upload itself is mocked.
_FAKE_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"


class CreateServiceProviderPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    def _select(self, trigger_name: str, option: str) -> None:
        # Radix SelectTrigger renders role="combobox" (accessible name from its
        # aria-labelledby); options render as role="option" in a portal.
        self.page.get_by_role("combobox", name=trigger_name).click()
        self.page.get_by_role("option", name=option, exact=True).click()

    def fill_valid_form(
        self,
        name: str = "測試服務者",
        category: str = "美髮",
        gender: str = "女",
        city: str = "台北市",
        instagram: str = "valid_ig",
    ) -> "CreateServiceProviderPage":
        self.page.locator("#name").fill(name)
        self._select("服務類別", category)
        self._select("性別", gender)
        self._select("服務城市", city)  # auto-selects 全區 + every district
        self._upload_three_photos()
        self.page.locator("#instagram").fill(instagram)
        return self

    def _upload_three_photos(self) -> None:
        files = [
            {"name": f"photo{i}.jpg", "mimeType": "image/jpeg", "buffer": _FAKE_JPEG}
            for i in range(3)
        ]
        self.page.locator('input[type="file"]').set_input_files(files)

    def submit_button(self):
        return self.page.get_by_role("button", name="建立刊登")

    def submit(self) -> "CreateServiceProviderPage":
        self.submit_button().click()
        return self
