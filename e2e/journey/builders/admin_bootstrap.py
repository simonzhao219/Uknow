"""管理員帳號 bootstrap——測試基礎設施，不是受測旅程。

走 Admin API 建立已驗證帳號，再以該帳號的 JWT 打
`/admin-setup/set-self-admin`（分支是全新資料庫，必然還沒有管理員，
首次認領一定成功）。管理員也帶 run_id 前綴，teardown 一併清除。
"""

from __future__ import annotations

from run_state import JourneyUser, RunState
from tools import twid
from tools.supa import SupabaseAdmin


def ensure_admin(admin: SupabaseAdmin, state: RunState) -> JourneyUser:
    node = "admin"
    user = state.users.get(node) or state.new_user(node, twid.generate_for_node(state.run_id, node))

    if not user.user_id:
        user.user_id = admin.create_confirmed_user(user.email, user.password)
        state.save()

    token = admin.password_grant_token(user.email, user.password)

    check = admin.api_get("/admin-setup/check", token)
    check.raise_for_status()
    status = check.json()
    if status.get("isAdmin"):
        return user
    if not status.get("canBecomeAdmin"):
        raise RuntimeError(
            "分支上已存在其他管理員——journey 分支應該是乾淨的，"
            f"請確認 ref 是否指錯環境（check 回應：{status}）"
        )

    resp = admin.api_post("/admin-setup/set-self-admin", token)
    if not resp.ok:
        raise RuntimeError(f"set-self-admin 失敗：{resp.status_code} {resp.text}")
    return user
