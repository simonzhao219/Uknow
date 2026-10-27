"""`CreateServiceProvider.tsx` — the 刊登新服務 form (route
`/service-providers/create`). One-step form: name, category, gender, city
(auto-selects every district), exactly 3 photos, and ≥1 contact."""

from pathlib import Path

from playwright.sync_api import Page, expect

from pages.base_page import BasePage

# 真的小 JPEG（192×64、三塊縱向色帶，帶 EXIF APP1）。照片管線會在真瀏覽器裡
# createImageBitmap 解碼＋canvas 重編，假檔解不出來。置中 1:1 裁切框正好框住
# 中間的藍帶，所以輸出主色可驗；原檔的 APP1 讓「輸出無 EXIF」的斷言有意義。
# 本頁物件被 e2e/（mock 上傳）與 e2e/journey/（真 Storage）共用。
PHOTO_FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "photo_stripes.jpg"

PHOTO_COUNT = 3


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
        self._upload_three_photos(wait_done=False)
        self.page.locator("#instagram").fill(instagram)
        return self

    def photo_input(self):
        return self.page.locator('input[type="file"]')

    def crop_dialog(self, n: int):
        return self.page.get_by_role("dialog", name=f"調整第 {n} 張照片範圍")

    def choose_photo(self, n: int) -> None:
        """選第 n 張 → 等取景對話框 → 按「完成」。不等上傳完成（deferred 情境要能在
        上傳在途時繼續操作）；完成後對話框關閉即回傳。"""
        file_input = self.photo_input()
        expect(file_input).to_be_enabled(timeout=10_000)
        file_input.set_input_files(PHOTO_FIXTURE)
        dialog = self.crop_dialog(n)
        expect(dialog).to_be_visible(timeout=15_000)
        done = dialog.get_by_role("button", name="完成")
        expect(done).to_be_enabled(timeout=15_000)  # Cropper 回報裁切範圍後才可按
        done.click()
        expect(dialog).to_be_hidden(timeout=10_000)

    def wait_photos_uploaded(self) -> None:
        """三張都上傳完成：每格出現「調整第 N 張範圍」（本次新增且 done 才有）。"""
        for n in range(1, PHOTO_COUNT + 1):
            expect(self.page.get_by_role("button", name=f"調整第 {n} 張範圍")).to_be_visible(
                timeout=15_000
            )

    def _upload_three_photos(self, wait_done: bool = True) -> None:
        for n in range(1, PHOTO_COUNT + 1):
            self.choose_photo(n)
        if wait_done:
            self.wait_photos_uploaded()

    def submit_button(self):
        return self.page.get_by_role("button", name="建立刊登")

    def submit(self) -> "CreateServiceProviderPage":
        self.submit_button().click()
        return self
