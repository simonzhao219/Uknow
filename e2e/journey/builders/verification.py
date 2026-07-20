"""付款後的後端落地驗證——skeleton 步驟與 org builder 共用。"""

from __future__ import annotations

import re

from run_state import JourneyUser
from tools.supa import SupabaseAdmin

REFERRAL_CODE_PATTERN = re.compile(r"^[a-z]{3}\d{6}$")  # 3 碼小寫英文 + 6 碼數字


def fetch_backend_landing(admin: SupabaseAdmin, user: JourneyUser) -> None:
    """斷言訂閱/完成訂單/active 推薦碼皆已落地，並回填 user_id 與推薦碼。"""
    matches = admin.list_users_by_email_prefix(user.email)
    assert matches, f"auth.users 找不到 {user.email}"
    user.user_id = matches[0]["id"]

    subs = admin.rest_select(
        "subscriptions",
        {"select": "id,end_date,amount", "user_id": f"eq.{user.user_id}"},
    )
    assert subs, f"{user.node} 沒有任何訂閱列"
    assert subs[0]["amount"] == 1200, f"{user.node} 訂閱金額異常：{subs[0]}"

    orders = admin.rest_select(
        "payment_orders",
        {"select": "id,status", "user_id": f"eq.{user.user_id}", "status": "eq.completed"},
    )
    assert orders, f"{user.node} 沒有 completed 付款訂單"

    codes = admin.rest_select(
        "referral_codes",
        {"select": "code,status", "user_id": f"eq.{user.user_id}", "status": "eq.active"},
    )
    assert codes, f"{user.node} 沒有 active 推薦碼"
    code = codes[0]["code"]
    assert REFERRAL_CODE_PATTERN.fullmatch(code), f"{user.node} 推薦碼格式不符：{code}"
    user.referral_code = code
