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
    #
    # 一律以**會員**鎖定那一列,不用 ".first"。
    #
    # 舊版用 `.first` 取清單第一列,依賴一個跨 feature 的不變式:「此刻分支上
    # 恰好只有一筆 pending 提領」(50_ 會在 70_ 之前把自己那筆解掉)。那個
    # 不變式在 2026-08-08 run 31235468231 破了——f70 第 6 章退件退到了別人的
    # 申請,K0 的那筆還留著 pending,於是付款頁的 fresh 選項沒有解封,
    # 第 6 章紅、第 7 與第 10 章跟著倒。舊版的註解自己就預言了這件事並指定了
    # 修法(「add a filter-by-member variant instead of stretching .first further」)。
    #
    # 管理台這張表每一列同時含會員姓名與該列的操作鈕(`WithdrawalManagement.tsx`
    # 的 TableRow),所以用 row filter 鎖定是穩的;而且 admin 端的 userName 是
    # **未遮罩的真名**(客服要拿它比對收款帳號與身分證),不必套 gen 遮罩規則。

    def _pending_row_of(self, member_name: str) -> Locator:
        return self.page.get_by_role("row").filter(has_text=member_name)

    def mark_withdrawal_paid(self, member_name: str) -> None:
        # Money-state change goes through a confirmation dialog, same as 退件.
        # exact=True so this doesn't also match the dialog's "確認匯款" button,
        # nor the batch bar's "批次標記已匯款".
        self._pending_row_of(member_name).get_by_role(
            "button", name="標記已匯款", exact=True
        ).click()
        self.page.get_by_role("button", name="確認匯款").click()

    def reject_withdrawal(
        self, member_name: str, reason: str = "收款帳號與身分證姓名不符"
    ) -> None:
        # The reason is mandatory: the backend rejects a blank note, and it is the
        # only text the member ever sees explaining why they were turned down.
        self._pending_row_of(member_name).get_by_role(
            "button", name="退件", exact=True
        ).click()
        self.page.get_by_label("退件理由").fill(reason)
        self.page.get_by_role("button", name="確認退件").click()
