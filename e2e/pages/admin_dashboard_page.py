"""`AdminDashboard.tsx` — the admin-only console at `/admin` (guarded by
AdminRoute). A Radix `Tabs` with four triggers (獎金提領管理 / 會員管理 /
公告管理 / 管理員設置); only the active tab's panel is mounted, so switching
tabs is what triggers each management component's data fetch."""

from playwright.sync_api import Locator, Page

from pages.base_page import BasePage


class AdminDashboardPage(BasePage):
    PATH = "/admin"

    def __init__(self, page: Page):
        super().__init__(page)

    def open(self) -> "AdminDashboardPage":
        self.goto(self.PATH)
        return self

    def heading(self) -> Locator:
        return self.page.get_by_role("heading", name="平台管理")

    def tab(self, name: str) -> Locator:
        # Radix TabsTrigger exposes ARIA role "tab".
        return self.page.get_by_role("tab", name=name)

    def open_tab(self, name: str) -> None:
        self.tab(name).click()

    # --- withdrawal review actions (pending rows only) ---------------------

    def mark_first_withdrawal_paid(self) -> None:
        # Money-state change goes through a confirmation dialog, same as 退件.
        # exact=True so this doesn't also match the dialog's "確認匯款" button,
        # nor the batch bar's "批次標記已匯款".
        self.page.get_by_role("button", name="標記已匯款", exact=True).first.click()
        self.page.get_by_role("button", name="確認匯款").click()

    def reject_first_withdrawal(self, reason: str = "收款帳號與身分證姓名不符") -> None:
        # ".first" relies on a cross-feature invariant: at this point exactly one
        # pending withdrawal exists on the branch (50_ resolves its own to
        # paid/rejected before 70_ starts, by filename order). If a future
        # feature leaves a pending withdrawal behind, add a filter-by-member
        # variant instead of stretching ".first" further.
        # exact=True so this doesn't also match the dialog's "確認退件" button.
        # The reason is mandatory: the backend rejects a blank note, and it is the
        # only text the member ever sees explaining why they were turned down.
        self.page.get_by_role("button", name="退件", exact=True).first.click()
        self.page.get_by_label("退件理由").fill(reason)
        self.page.get_by_role("button", name="確認退件").click()
