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

    # 裸 auth 帳號沒有 profiles 列,而 admin_setup_claim 是 UPDATE——
    # 0 列命中也回 success,is_admin 實際沒落地;前端冷啟動 /profile 404
    # 更會直接 signOut(App.tsx),GUI 永遠進不了 /admin(2026-08-07
    # run 31147957094 實測)。profile 還得過 isProfileComplete
    # (name+phone+birthDate,registrationFlow.ts)——不完整不 setUser、
    # 被導去 complete-profile,AdminRoute 一樣進不去(run 31148505278)。
    # 補一列完整 profile,與 create_confirmed_user 同屬測試基礎設施範疇。
    rows = admin.rest_select("profiles", {"select": "id", "id": f"eq.{user.user_id}"})
    if not rows:
        admin.rest_insert("profiles", {
            "id": user.user_id,
            "name": user.name,
            "phone": user.phone,
            "birth_date": "1990-01-01",
            "national_id": user.national_id,
        })

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

    # claim 的 UPDATE 靜默 0 列正是上面那個坑——回頭驗 is_admin 真的落地。
    flags = admin.rest_select(
        "profiles", {"select": "is_admin", "id": f"eq.{user.user_id}"}
    )
    if not (flags and flags[0].get("is_admin") is True):
        raise RuntimeError(f"set-self-admin 後 is_admin 未落地:{flags}")
    return user
