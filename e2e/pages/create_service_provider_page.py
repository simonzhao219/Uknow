"""`CreateServiceProvider.tsx` — the 刊登新服務 form (route
`/service-providers/create`). One-step form: name, category, gender, city
(auto-selects every district), exactly 3 photos, and ≥1 contact."""

from playwright.sync_api import Page

from pages.base_page import BasePage

# A tiny but validly-typed JPEG payload. Only File.type (image/jpeg) and size
# (<5MB) are checked before the bytes leave the browser, and nothing downstream
# decodes them — so a 20-byte stub is enough for both suites. Note this page
# object is shared: e2e/ mocks the upload, but e2e/journey/ posts these bytes to
# a real Supabase Storage bucket, so it must stay a genuinely valid payload.

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
        # 名稱欄位有 maxLength：走 fill_exact，超長輸入當場炸掉而不是被靜默截斷
        self.fill_exact(self.page.locator("#name"), name, "#name")
        self._select("服務類別", category)
        self._select("性別", gender)
        self._select("服務城市", city)  # auto-selects 全區 + every district
        self._upload_three_photos()
        self.page.locator("#instagram").fill(instagram)
        return self

    def fill_valid_form_photos_first(
        self,
        name: str = "測試服務者",
        category: str = "美髮",
        gender: str = "女",
        city: str = "台北市",
        instagram: str = "valid_ig",
    ) -> "CreateServiceProviderPage":
        """與 fill_valid_form 同內容，但把照片上傳排在聯絡方式之前——
        搭配 deferred upload mock，聯絡方式是在「上傳仍在途」時輸入的。"""
        # 名稱欄位有 maxLength：走 fill_exact，超長輸入當場炸掉而不是被靜默截斷
        self.fill_exact(self.page.locator("#name"), name, "#name")
        self._select("服務類別", category)
        self._select("性別", gender)
        self._select("服務城市", city)
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
