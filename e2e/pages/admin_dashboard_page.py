"""`AdminDashboard.tsx` — the admin-only console at `/admin` (guarded by
AdminRoute). A Radix `Tabs` with four triggers whose accessible names are
獎金提領管理 / 會員管理 / 系統公告 / 系統告警 (only the two-character tail —
提領 / 會員 / 公告 / 告警 — is visible; the rest is sr-only so the names stay
stable for e2e and journey); only the active tab's panel is mounted, so switching
tabs is what triggers each management component's data fetch."""

from playwright.sync_api import Locator, Page, expect

from pages.base_page import BasePage


# 列表載入的上限。這是「載入完成」的等待,不是「那一列存在」的期望值:慢到超過
# 就是要的診斷(骨架還在),不是更長的等待。
_LIST_SETTLE_TIMEOUT_MS = 30_000


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
        # Radix TabsTrigger exposes ARIA role "tab". exact=True: name matching is
        # substring by default, and the members panel mounts its own inner tabs
        # (會員列表 / 證件審核) — a future rename must not silently match two.
        return self.page.get_by_role("tab", name=name, exact=True)

    def open_tab(self, name: str) -> None:
        self.tab(name).click()

    # 提領列表區（`WithdrawalManagement.tsx` 的 `<section aria-label="提領申請列表">`）：
    # 骨架、錯誤區、空狀態與表格（手機是卡片）都在裡面；背景更新時它帶 aria-busy、列表留著。
    # 「更新失敗」的陳舊提示與它的「重試」在列表區**外面**。
    def withdrawal_list(self) -> Locator:
        return self.page.get_by_role("region", name="提領申請列表")

    def withdrawal_skeleton(self) -> Locator:
        return self.page.get_by_role("status", name="載入提領申請中")

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

    # 會員名**不足以**鎖定一列——同一個會員在這張表上會有好幾列(申請過幾次
    # 就有幾列)。2026-08-08 run 31265631149 實測:前一個情境的「標記已匯款」
    # 沒生效留下一筆 pending,下一個情境再申請一筆,同一個會員就有兩列可退件,
    # 於是 strict mode violation。
    #
    # 這正是 S1 學到那件事的同一個形狀:**識別鍵撐不住就補一把結構性的鑰匙**
    # (S1 補的是 aria-level)。這裡補的是「該列真的提供這個動作」——產品只在
    # `status === 'pending'` 的列渲染「標記已匯款/退件」(WithdrawalManagement.tsx),
    # 所以「有這顆鈕」就是「這列是 pending」的結構等價物,不必再抄一份狀態文案。
    #
    # 鎖不到唯一一列時**擲錯而不是取 .first**:取第一列正是這個修法要移除的
    # 假設,再套一次只會換個地方重演。
    # 列表是**掛載時一次性抓取**(WithdrawalManagement 的 fetchWithdrawals),載入中
    # 顯示骨架、失敗顯示「重試」、真的沒資料才顯示空訊息。對 0 列的表格直接套
    # expect 的 5 秒預設逾時,等於把「API 還在回」讀成「那一列不存在」:2026-09-26
    # 排程 run 36269079479 的 f50 就是這樣紅的(同一份 log 的下一個情境暖機後也要
    # 輪詢約 3 秒才看到列,5 秒的餘裕本來就薄)。所以先等列表**確實載入完成**,
    # 再去數列;並且失敗時說明畫面屬於哪一態,而不是只丟一個 0。
    def _wait_list_settled(self) -> None:
        skeleton = self.page.get_by_role("status", name="載入提領申請中")
        table = self.page.get_by_role("table")
        empty = self.page.get_by_text("目前沒有提領申請")
        retry = self.page.get_by_role("button", name="重試", exact=True)
        # 先等「任一終態或骨架」出現:分頁剛切過去、元件還沒掛上時骨架也不在,
        # 直接等骨架消失會在那一刻空轉成立。
        expect(skeleton.or_(table).or_(empty).or_(retry)).to_be_visible(
            timeout=_LIST_SETTLE_TIMEOUT_MS
        )
        try:
            expect(skeleton).to_be_hidden(timeout=_LIST_SETTLE_TIMEOUT_MS)
        except AssertionError as exc:
            raise AssertionError(
                f"提領列表 {_LIST_SETTLE_TIMEOUT_MS // 1000} 秒後仍在載入中（骨架未消失）——"
                "管理台 GET /admin/withdrawals 太慢或卡住,不是那一列不存在。"
                f"\n{self._list_state()}"
            ) from exc
        if retry.count():
            raise AssertionError(
                "提領列表載入失敗（畫面出現「重試」鈕）——不是那一列不存在。"
                f"\n{self._list_state()}"
            )

    def _list_state(self) -> str:
        """目前列表屬於哪一態,供失敗訊息使用(任何一段取不到只降級成一行)。"""
        try:
            if self.page.get_by_role("status", name="載入提領申請中").count():
                return "列表狀態：載入中（骨架）"
            if self.page.get_by_role("button", name="重試", exact=True).count():
                text = " ".join(self.page.get_by_role("tabpanel").inner_text(timeout=3_000).split())
                return f"列表狀態：載入失敗——{text[:300]}"
            if self.page.get_by_text("目前沒有提領申請").count():
                return "列表狀態：載入完成但是空的（目前沒有提領申請）"
            return f"列表狀態：載入完成，共 {self.page.get_by_role('row').count() - 1} 列資料"
        except Exception as exc:
            return f"（列表狀態取得失敗：{exc}）"

    def _actionable_row_of(self, member_name: str, action: str) -> Locator:
        self._wait_list_settled()
        rows = (
            self.page.get_by_role("row")
            .filter(has_text=member_name)
            .filter(has=self.page.get_by_role("button", name=action, exact=True))
        )
        try:
            expect(rows).to_have_count(1)
        except AssertionError as exc:
            raise AssertionError(
                f"「{member_name}」可執行「{action}」的列有 {rows.count()} 列，"
                f"無法唯一鎖定。{self._list_state()}\n"
                "該會員在提領管理上的所有列：\n"
                + "\n".join(
                    f"  - {' '.join(row.split())}"
                    for row in self.page.get_by_role("row")
                    .filter(has_text=member_name)
                    .all_inner_texts()
                )
                + "\n（若這裡有不屬於本情境的待處理列，先看**上一個**失敗的情境——"
                "它沒處理完的申請會留到這裡。）"
            ) from exc
        return rows

    # 動作送出後一律等產品自己的完成回報(`ACTION_DONE`：`已退件：<會員名>`)。
    # 那段字是刻意**留在畫面上**而不是 toast 的(admin 做完會切去網銀),所以
    # 它是穩定的後置條件。不等它的話,後端把這次轉換擋掉(例如 note 必填、
    # 狀態機不允許)會**靜默**通過,紅燈落到下游某個看不出關聯的斷言上——
    # run 31263854444 的「點數未退回」就有這個可能。
    #
    # 這是動作的**後置條件**,不是測試的期望值(同 `BasePage.fill_exact` 的
    # 取捨):送出了卻沒生效,那一步本身就沒完成。
    def _expect_action_landed(self, member_name: str, done_label: str) -> None:
        expect(
            self.page.get_by_text(f"{done_label}：{member_name}")
        ).to_be_visible(timeout=15_000)

    def mark_withdrawal_paid(self, member_name: str) -> None:
        # Money-state change goes through a confirmation dialog, same as 退件.
        # exact=True so this doesn't also match the dialog's "確認匯款" button,
        # nor the batch bar's "批次標記已匯款".
        self._actionable_row_of(member_name, "標記已匯款").get_by_role(
            "button", name="標記已匯款", exact=True
        ).click()
        self.page.get_by_role("button", name="確認匯款").click()
        self._expect_action_landed(member_name, "已標記匯款完成")

    def reject_withdrawal(
        self, member_name: str, reason: str = "收款帳號與身分證姓名不符"
    ) -> None:
        # The reason is mandatory: the backend rejects a blank note, and it is the
        # only text the member ever sees explaining why they were turned down.
        self._actionable_row_of(member_name, "退件").get_by_role(
            "button", name="退件", exact=True
        ).click()
        self.page.get_by_label("退件理由").fill(reason)
        self.page.get_by_role("button", name="確認退件").click()
        self._expect_action_landed(member_name, "已退件")
