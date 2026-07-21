"""40_listing.feature 的步驟定義——刊登 CRUD 與公開可見性。"""

from __future__ import annotations

import re

from playwright.sync_api import expect
from pytest_bdd import parsers, scenarios, then, when

from builders.login import login_via_gui
from pages.create_service_provider_page import CreateServiceProviderPage
from pages.home_page import HomePage
from pages.service_provider_management_page import ServiceProviderManagementPage

scenarios("40_listing.feature")


def listing_name(run_state, node: str) -> str:
    """刊登名稱由 run_id 決定性導出——跨情境（不同瀏覽器 context）
    不需要共享狀態就能重建。"""
    return f"服務{run_state.run_id}{node}"


def _open_management(page, run_state, node):
    login_via_gui(page, run_state.users[node])
    page.goto("/service-providers")
    expect(ServiceProviderManagementPage(page).heading()).to_be_visible(timeout=15_000)


@when(parsers.parse('"{node}" 登入並建立自己的刊登'))
def create_listing(guarded_page, run_state, node):
    _open_management(guarded_page, run_state, node)
    ServiceProviderManagementPage(guarded_page).create_link().click()
    form = CreateServiceProviderPage(guarded_page)
    form.fill_valid_form(name=listing_name(run_state, node))
    form.submit()


@then("刊登管理頁顯示該刊登")
def listing_shown(guarded_page, run_state):
    # 刊登本身沒有狀態徽章；建立成功即應在管理頁看到該刊登。
    expect(guarded_page.get_by_text(listing_name(run_state, "A0"))).to_be_visible(
        timeout=30_000
    )


@when(parsers.parse('訪客在首頁搜尋 "{node}" 的刊登名稱'))
def visitor_search(guarded_page, run_state, node):
    home = HomePage(guarded_page)
    home.open()
    home.search(listing_name(run_state, node))


@then("搜尋結果出現該刊登卡片")
def card_visible(guarded_page, run_state):
    home = HomePage(guarded_page)
    expect(home.cards().first).to_be_visible(timeout=15_000)
    expect(home.cards()).to_have_count(1)


@then("點開後詳情頁顯示刊登名稱")
def detail_shows_name(guarded_page, run_state):
    HomePage(guarded_page).cards().first.click()
    expect(guarded_page).to_have_url(re.compile(r"/service-providers/"), timeout=15_000)
    expect(
        guarded_page.get_by_text(listing_name(run_state, "A0")).first
    ).to_be_visible(timeout=15_000)


@when(parsers.parse('"{node}" 登入並開啟刊登管理頁'))
def open_management(guarded_page, run_state, node):
    _open_management(guarded_page, run_state, node)


@then("刊登管理頁沒有「刊登新服務」入口")
def no_second_listing_entry(guarded_page, run_state):
    management = ServiceProviderManagementPage(guarded_page)
    expect(guarded_page.get_by_text(listing_name(run_state, "A0"))).to_be_visible(
        timeout=15_000
    )
    expect(management.create_link()).to_have_count(0)


@when(parsers.parse('"{node}" 登入並刪除自己的刊登'))
def delete_listing(guarded_page, run_state, node):
    _open_management(guarded_page, run_state, node)
    management = ServiceProviderManagementPage(guarded_page)
    management.click_delete()
    # W7 起全站統一的 shadcn AlertDialog 確認彈窗
    guarded_page.get_by_role("button", name="確認刪除").click()
    expect(management.empty_state()).to_be_visible(timeout=15_000)


@then("首頁顯示查無結果")
def no_results(guarded_page):
    expect(HomePage(guarded_page).no_results_message()).to_be_visible(timeout=15_000)
