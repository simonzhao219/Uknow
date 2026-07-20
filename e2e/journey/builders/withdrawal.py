"""提領的 GUI 操作——會員端三步申請與查收（管理員端用 AdminDashboardPage）。

步驟序照抄 mocked 套件 reward_steps 的實測順序：
金額 → 下一步 → 確認並繼續 → 身分資料＋銀行＋證件照＋同意 → 提交申請。
"""

from __future__ import annotations

from playwright.sync_api import Page, expect

from pages.reward_page import RewardPage
from run_state import JourneyUser

BANK_NAME = "臺灣銀行"          # TAIWAN_BANKS 第一家（004）
BANK_ACCOUNT = "12345678901234"  # 10–16 位純數字


def open_rewards(page: Page) -> RewardPage:
    page.goto("/rewards")
    reward = RewardPage(page)
    expect(reward.heading()).to_be_visible(timeout=15_000)
    return reward


def apply_via_gui(page: Page, user: JourneyUser, amount: int) -> None:
    """從獎勵頁完成一筆提領申請（結束時申請已送出）。"""
    reward = open_rewards(page)
    reward.start_withdrawal()
    reward.fill_amount(str(amount))
    reward.next_step()
    reward.confirm_and_continue()
    reward.fill_id_number(user.national_id)
    reward.select_bank(BANK_NAME)
    reward.fill_bank_account(BANK_ACCOUNT)
    reward.upload_id_photos()
    reward.agree_terms()
    reward.submit_withdrawal()
    # 送出後回到獎勵頁，該筆以「處理中」呈現
    expect(page.get_by_text("處理中").first).to_be_visible(timeout=15_000)


def expect_amount_error(page: Page, reward: RewardPage, amount: str, message: str) -> None:
    """在金額步驟輸入非法值，斷言錯誤訊息並停留在原步驟。"""
    reward.fill_amount(amount)
    reward.next_step()
    expect(page.get_by_text(message).first).to_be_visible()


def collect_via_gui(page: Page, user: JourneyUser) -> None:
    """查收：確認 → 預覽 → 身分證驗證 → 確認查收。"""
    reward = open_rewards(page)
    expect(reward.collect_button()).to_be_visible(timeout=15_000)
    reward.collect_button().click()
    reward.collection_next()   # 步驟 1/3
    reward.collection_next()   # 步驟 2/3
    reward.fill_collection_id(user.national_id)
    reward.confirm_collection()
    expect(page.get_by_text("已完成").first).to_be_visible(timeout=15_000)
