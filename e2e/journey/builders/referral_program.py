"""加入推薦計畫的 GUI 流程——提領的硬前置。

request_withdrawal RPC 的第一道檢核是 profiles.referral_program_joined
（未加入 → 「尚未加入推薦計畫，無法提領」）；加入要走會員中心的
「加入推薦計畫」對話框：勾同意條款 → 簽名板手寫簽名 → 送出
（POST /referrals/join-program，簽名圖上傳 referral-signatures bucket）。

⚠️ 送出按鈕與對話框結構屬首跑校準對象（同 payuni_sandbox_page 的
候選清單策略）。
"""

from __future__ import annotations

from playwright.sync_api import Page, expect

from builders.login import login_via_gui
from run_state import JourneyUser
from tools.supa import SupabaseAdmin

_SUBMIT_CANDIDATES = ["確認加入", "送出", "確認", "加入推薦計畫"]


def _is_joined(admin: SupabaseAdmin, user: JourneyUser) -> bool:
    rows = admin.rest_select(
        "profiles",
        {"select": "referral_program_joined", "id": f"eq.{user.user_id}"},
    )
    return bool(rows and rows[0].get("referral_program_joined"))


def _draw_signature(page: Page, canvas) -> None:
    box = canvas.bounding_box()
    assert box, "簽名板 canvas 不可見"
    x0, y0 = box["x"] + box["width"] * 0.2, box["y"] + box["height"] * 0.5
    page.mouse.move(x0, y0)
    page.mouse.down()
    # 畫一個之字形——確保產生足夠的筆跡讓「空白簽名」檢查通過
    for i in range(1, 7):
        page.mouse.move(
            x0 + box["width"] * 0.1 * i,
            y0 + (box["height"] * 0.15 if i % 2 else -box["height"] * 0.15),
            steps=4,
        )
    page.mouse.up()


def ensure_joined_via_gui(page: Page, admin: SupabaseAdmin, user: JourneyUser) -> None:
    """冪等：已加入直接返回；未加入走完整 GUI 簽名流程。"""
    if not user.user_id:
        matches = admin.list_users_by_email_prefix(user.email)
        assert matches, f"auth.users 找不到 {user.email}"
        user.user_id = matches[0]["id"]
    if _is_joined(admin, user):
        return

    login_via_gui(page, user)
    page.get_by_role("button", name="加入推薦計畫").click()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_be_visible()

    dialog.get_by_role("checkbox").first.check()
    _draw_signature(page, dialog.locator("canvas").first)

    for name in _SUBMIT_CANDIDATES:
        button = dialog.get_by_role("button", name=name, exact=True)
        if button.count() > 0 and button.first.is_enabled():
            button.first.click()
            break
    else:
        raise RuntimeError(
            f"加入推薦計畫對話框找不到可用的送出按鈕（tried: {_SUBMIT_CANDIDATES}）"
            "——請校準 referral_program.py"
        )

    expect(dialog).to_be_hidden(timeout=20_000)
    assert _is_joined(admin, user), "對話框已關閉但 referral_program_joined 仍為 false"
