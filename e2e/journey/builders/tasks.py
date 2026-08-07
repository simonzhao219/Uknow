"""任務中心的 GUI 操作——推薦王獎勵的領取（免費續約一年）。"""

from __future__ import annotations

from playwright.sync_api import Page, expect

from run_state import JourneyUser


def open_task_center(page: Page) -> None:
    page.goto("/tasks")
    expect(page.get_by_role("heading", name="任務中心")).to_be_visible(timeout=15_000)


def claim_first_pending_reward(page: Page, user: JourneyUser) -> None:
    """待領取區塊 → ThreeStepDialog：通知 → 點數預覽 → 身分證驗證 → 確認領取。

    「確認領取」後必須等到 claim API 回應與成功 toast 才返回——上一版
    點完就走，DB 斷言與後端寫入賽跑（2026-08-04 run 30944836300 的
    「到期日延長 0 天」極可能是這個競態）；就算真失敗，也要把回應
    內容帶進錯誤訊息，不留「0 天」這種讀不出死因的斷言。"""
    expect(page.get_by_text("免費續約 1 年").first).to_be_visible(timeout=15_000)
    page.get_by_role("button", name="立即領取").first.click()

    page.get_by_role("button", name="下一步").click()   # 步驟 1 → 2（不可逆通知）
    page.get_by_role("button", name="下一步").click()   # 步驟 2 → 3（SSOT 點數預覽）

    page.get_by_label("身分證字號", exact=False).first.fill(user.national_id)
    page.get_by_text("身分證驗證成功").first.wait_for(timeout=10_000)

    with page.expect_response(
        lambda r: "/tasks/claim-reward/" in r.url and r.request.method == "POST",
        timeout=30_000,
    ) as resp_info:
        page.get_by_role("button", name="確認領取").click()
    resp = resp_info.value
    assert resp.ok, f"claim-reward 回 {resp.status}：{resp.text()[:500]}"

    # 單筆走「領取任務獎勵成功！」、批次走「批次領取完成」——任一出現
    # 即代表前端已收到後端完成訊號（訂閱延展已落地）。
    expect(
        page.get_by_text("領取任務獎勵成功！")
        .or_(page.get_by_text("批次領取完成"))
        .first
    ).to_be_visible(timeout=15_000)
