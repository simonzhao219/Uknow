"""`AdminDashboardPage` 的列表等待——在 mock 下先證它的診斷，不等 journey。

**為什麼有這支**：`_wait_list_settled` 是 journey f50／f70 的提領動作共用的等待，行為
只有晉升 PR 上的 journey 跑得到（真後端、30-90 分鐘）。它答錯的代價是紅燈落在看不出
關聯的地方。S5 之後列表多了兩種狀態，舊的等待都答錯：

- **背景更新**（切回、寫入後的重讀）：表格留在畫面上、骨架不出現、`aria-busy` 為
  true。只等骨架的話會立刻放行，對著即將被換掉的列動作。
- **更新失敗保留舊列**：表格與陳舊提示的「重試」同時可見。重試進 `or_` 鏈會撞
  strict mode，吃掉「是哪一種失敗」的診斷（R3-P2-25）。

這裡用 mock 扣住或打壞列表讀取，直接呼叫等待、斷言它給的診斷。不是 BDD：被測的是
page object 本身，不是產品行為。
"""

import re

import pytest
from playwright.sync_api import expect

import pages.admin_dashboard_page as admin_page_module
from mocks.backend_api_mock import build_admin_withdrawal
from mocks.fixtures import seed_authenticated_session
from pages.admin_dashboard_page import AdminDashboardPage


@pytest.fixture
def dashboard(page, context, api_mock):
    seed_authenticated_session(context, registration_step=3, isAdmin=True, accountStatus="active")
    api_mock.set_admin_withdrawals([build_admin_withdrawal(status="pending", userName="王小明")])
    admin = AdminDashboardPage(page).open()
    expect(admin.withdrawal_list().get_by_role("row", name=re.compile("王小明"))).to_be_visible(
        timeout=15_000
    )
    return admin


def _refresh(page):
    page.get_by_role("button", name="重新整理").click()


def test_settle_wait_reports_a_failed_refresh_that_kept_old_rows(page, api_mock, dashboard):
    api_mock.fail_admin_withdrawal_list()
    _refresh(page)
    expect(page.get_by_text(re.compile(r"^更新失敗，以下是"))).to_be_visible(timeout=5_000)

    with pytest.raises(AssertionError, match="更新失敗"):
        dashboard._wait_list_settled()


def test_settle_wait_does_not_pass_through_a_background_refresh(
    page, api_mock, dashboard, monkeypatch
):
    api_mock.hold_admin_withdrawal_list()
    _refresh(page)
    expect(dashboard.withdrawal_list()).to_have_attribute("aria-busy", "true")
    # 卡住的背景更新要等到上限才報；縮短上限，只驗它有等、而且說得出卡在哪。
    monkeypatch.setattr(admin_page_module, "_LIST_SETTLE_TIMEOUT_MS", 1_000)

    with pytest.raises(AssertionError, match="背景更新"):
        dashboard._wait_list_settled()


def test_settle_wait_still_reports_a_first_load_failure(page, context, api_mock):
    seed_authenticated_session(context, registration_step=3, isAdmin=True, accountStatus="active")
    api_mock.set_admin_withdrawals([build_admin_withdrawal(status="pending", userName="王小明")])
    api_mock.fail_admin_withdrawal_list()
    admin = AdminDashboardPage(page).open()

    with pytest.raises(AssertionError, match="載入失敗"):
        admin._wait_list_settled()
