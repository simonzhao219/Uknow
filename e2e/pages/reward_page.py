"""`RewardDashboard.tsx` (route `/rewards`, 「獎勵回饋」) — the page where a
paid member sees their accumulated points, the referral/task history that
earned them, and applies for / collects withdrawals.

Page objects perform actions and expose locators only; assertions live in the
`then_*` steps. Radix `Select` / dialog portals render at the document root,
so options are matched by role rather than by nesting under a container.
"""

from playwright.sync_api import Locator, Page

from pages.base_page import BasePage

# A minimal valid 1x1 PNG, used as the in-memory ID-card image so the upload
# path can be driven without shipping a fixture file.
_TINY_PNG = bytes([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
    0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
])


class RewardPage(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

    # --- Summary / history ---------------------------------------------------

    def heading(self) -> Locator:
        return self.page.get_by_role("heading", name="獎勵回饋")

    def history_empty_state(self) -> Locator:
        return self.page.get_by_text("尚無獎勵記錄")

    # --- Withdrawal eligibility ---------------------------------------------

    def apply_withdrawal_button(self) -> Locator:
        # WithdrawalSection's gating button ("申請Point提領"). The multi-step
        # WithdrawalProcess reuses the same label for its own submit intro, so
        # scope to the first (the section-level trigger) when it matters.
        return self.page.get_by_role("button", name="申請Point提領").first

    def disabled_reason(self, text: str) -> Locator:
        return self.page.get_by_text(text)

    def start_withdrawal(self) -> None:
        self.apply_withdrawal_button().click()

    # --- Withdrawal application (WithdrawalProcess, 3 steps) ------------------

    def fill_amount(self, amount: str) -> None:
        self.page.get_by_label("提領Point", exact=False).fill(amount)

    def next_step(self) -> None:
        self.page.get_by_role("button", name="下一步").click()

    def confirm_and_continue(self) -> None:
        self.page.get_by_role("button", name="確認並繼續").click()

    def fill_id_number(self, id_number: str) -> None:
        self.page.get_by_label("身分證字號", exact=False).first.fill(id_number)

    def select_bank(self, bank_name: str) -> None:
        self.page.get_by_role("combobox").click()
        self.page.get_by_role("option", name=bank_name).click()

    def fill_bank_account(self, account: str) -> None:
        self.page.get_by_label("收款銀行帳號", exact=False).fill(account)

    def upload_id_photos(self) -> None:
        # The two `<input type="file" accept="image/*">` for the front/back ID
        # card. Playwright can set files on them directly (in-memory PNG, no
        # real file on disk), which fires the component's onChange the same way
        # picking a file in the OS chooser would.
        # Picking a photo swaps that block from the upload input to a thumbnail
        # (its <input> leaves the DOM), which would reindex the remaining input.
        # Set the back one (nth 1) first while both exist, then the front (nth 0).
        file_inputs = self.page.locator('input[type="file"]')
        file_inputs.nth(1).set_input_files(
            files=[{"name": "id-back.png", "mimeType": "image/png", "buffer": _TINY_PNG}]
        )
        file_inputs.nth(0).set_input_files(
            files=[{"name": "id-front.png", "mimeType": "image/png", "buffer": _TINY_PNG}]
        )

    def remove_front_id_photo(self) -> None:
        # The X button on the front-photo thumbnail (saved photo or fresh
        # preview). Named per the component's aria-label.
        self.page.get_by_role("button", name="移除正面照片").click()

    def front_upload_input(self):
        # With the back photo still showing its thumbnail, the front upload
        # block is the only `<input type="file">` in the DOM.
        return self.page.locator('input[type="file"]')

    def upload_replacement_front_photo(self) -> None:
        self.front_upload_input().set_input_files(
            files=[{"name": "id-front-new.png", "mimeType": "image/png", "buffer": _TINY_PNG}]
        )

    def agree_terms(self) -> None:
        self.page.get_by_role("checkbox").check()

    def submit_button(self) -> Locator:
        return self.page.get_by_role("button", name="提交申請")

    def submit_withdrawal(self) -> None:
        # The national ID is verified asynchronously (POST /rewards/verify-id
        # once 10 chars are entered); wait for the success marker so the submit
        # doesn't race the isIdVerified gate.
        self.page.get_by_text("身分證驗證成功").first.wait_for(timeout=5_000)
        self.submit_button().click()

    # --- Collection (查收) flow — CollectionConfirm/Preview/Verify dialogs ----

    def collect_button(self) -> Locator:
        return self.page.get_by_role("button", name="查收")

    def collection_next(self) -> None:
        # Both the confirm (步驟 1/3) and preview (步驟 2/3) dialogs advance
        # with a 下一步 button; call once per step.
        self.page.get_by_role("button", name="下一步").click()

    def fill_collection_id(self, id_number: str) -> None:
        self.page.get_by_label("身分證字號", exact=False).first.fill(id_number)

    def confirm_collection(self) -> None:
        # 確認查收 stays disabled until the async ID verification succeeds.
        self.page.get_by_text("身分證驗證成功").first.wait_for(timeout=5_000)
        self.page.get_by_role("button", name="確認查收").click()
