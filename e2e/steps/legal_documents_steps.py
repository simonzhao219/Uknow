"""Steps for legal_documents.feature."""

import re

from pytest_bdd import scenarios, then, when
from playwright.sync_api import expect

from steps.common_steps import *  # noqa: F401,F403

scenarios("legal_documents.feature")


@when("I click the document back button")
def click_document_back(page):
    page.get_by_test_id("doc-back-button").click()


@when("I open the join referral program dialog")
def open_join_dialog(page):
    # The card's trigger button; the dialog's submit button shares the label,
    # so .first targets the trigger before the dialog exists.
    page.get_by_role("button", name="加入推薦計畫").first.click()
    expect(page.get_by_text("完成以下步驟即可開始使用推薦碼邀請好友")).to_be_visible(timeout=5_000)


@when("I open the referral rules document")
def open_referral_rules_doc(page):
    page.get_by_test_id("referral-rules-link").click()


@then("the document should open in an in-page dialog on the dashboard")
def doc_in_page_dialog(page):
    # It opens as a modal (not a route change / new tab): the dialog is visible
    # AND the URL is unchanged — we never left the dashboard.
    expect(page.get_by_role("dialog")).to_be_visible(timeout=5_000)
    expect(page.get_by_role("heading", name="推廣獎勵規章").first).to_be_visible()
    expect(page).to_have_url(re.compile(r"/dashboard"))


@when("I close the document dialog")
def close_doc_dialog(page):
    page.keyboard.press("Escape")
    expect(page.get_by_role("dialog")).to_be_hidden(timeout=5_000)


@then("the join referral program dialog should still be open")
def join_dialog_still_open(page):
    # The whole point: reading a doc did not tear down the join dialog — the
    # signature section and its unchanged state are still there.
    expect(page.get_by_text("簽名確認（中文正楷）")).to_be_visible(timeout=5_000)
