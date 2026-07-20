"""任務中心的 GUI 操作——推薦王獎勵的領取（免費續約一年）。"""

from __future__ import annotations

from playwright.sync_api import Page, expect

from run_state import JourneyUser


def open_task_center(page: Page) -> None:
    page.goto("/tasks")
    expect(page.get_by_role("heading", name="任務中心")).to_be_visible(timeout=15_000)


def claim_first_pending_reward(page: Page, user: JourneyUser) -> None:
    """待領取區塊 → ThreeStepDialog：通知 → 點數預覽 → 身分證驗證 → 確認領取。"""
    expect(page.get_by_text("免費續約 1 年").first).to_be_visible(timeout=15_000)
    page.get_by_role("button", name="立即領取").first.click()

    page.get_by_role("button", name="下一步").click()   # 步驟 1 → 2（不可逆通知）
    page.get_by_role("button", name="下一步").click()   # 步驟 2 → 3（SSOT 點數預覽）

    page.get_by_label("身分證字號", exact=False).first.fill(user.national_id)
    page.get_by_text("身分證驗證成功").first.wait_for(timeout=10_000)
    page.get_by_role("button", name="確認領取").click()
