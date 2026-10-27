"""80_referral_email_invite.feature 的步驟定義——Email 邀請的後端旅程。

目前刻意**不走 GUI**：寄送（POST /referrals/invites）、接受（POST
/auth/invite/accept——設密碼同時驗證 email）都直打 API，驗 hosted 才測得到的部分
（GoTrue 真實互動、send-email hook 底下的寄送、service role 呼叫 purge）。
設定密碼畫面與完善資料頁的 UI 步驟，由前端工項在 AuthPage 的 invite 模式上線後
補進同一個 feature。

信中連結一律以 service key 從被邀請人的 user_metadata 讀出——不在 Python 重算
簽章（那等於在測試裡複製一份產品的簽章邏輯）。
"""

from __future__ import annotations

import uuid
from urllib.parse import parse_qs, urlparse

import pytest
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("80_referral_email_invite.feature")

INVITEE_PASSWORD = "Invitee!Pass-2026"


# --- 播種與限流重置 ----------------------------------------------------------


@given(parsers.parse('"{node}" 已加入推薦計畫'))
def referrer_joined(supabase_admin, run_state, node):
    """service role 標記已加入（加入流程本身由 50_ 的 GUI 驗）；並清掉該推薦人的
    每人兩窗計數——本檔三個情境合計寄 4 封，再加情境就會撞每小時 5 封的上限。
    兩者都是拋棄式分支上的測試基礎設施操作，正式碼不動。"""
    user = run_state.users.get(node)
    if not user or not user.user_id or not user.referral_code:
        pytest.skip(f"組織樹缺 {node} 或其推薦碼——請先跑 10_org_build")
    supabase_admin.rest_update(
        "profiles", {"id": f"eq.{user.user_id}"}, {"referral_program_joined": True}
    )
    supabase_admin.rest_delete(
        "rate_limits", {"key": f"in.(referral-invite:{user.user_id},referral-invite-day:{user.user_id})"}
    )


# --- helpers ---------------------------------------------------------------


def _invitee_email(run_state) -> str:
    # 沿用 run 的 email 前綴：cleanup 以 `e2e+<run_id>+` 掃描，空殼也一併清掉
    return f"e2e+{run_state.run_id}+invitee-{uuid.uuid4().hex[:8]}@{run_state.email_domain}"


def _auth_user(supabase_admin, email: str) -> dict | None:
    users = supabase_admin.list_users_by_email_prefix(email)
    return next((u for u in users if (u.get("email") or "").lower() == email.lower()), None)


def _invite(supabase_admin, run_state, node: str, email: str):
    user = run_state.users[node]
    token = supabase_admin.password_grant_token(user.email, user.password)
    return supabase_admin.api_post("/referrals/invites", token, {"email": email, "consent": True})


def _accept(supabase_admin, token: str, password: str):
    return supabase_admin.api_post_public("/auth/invite/accept", {"token": token, "password": password})


# --- 推薦人側 ---------------------------------------------------------------


@when(parsers.parse('"{node}" 以 Email 邀請一個新信箱'))
def invite_new(supabase_admin, run_state, scenario_memo, node):
    email = _invitee_email(run_state)
    scenario_memo["email"] = email
    scenario_memo["response"] = _invite(supabase_admin, run_state, node, email)


@when(parsers.parse('"{node}" 再邀請同一個信箱一次'))
def invite_again(supabase_admin, run_state, scenario_memo, node):
    first = _auth_user(supabase_admin, scenario_memo["email"])
    assert first, "第一封邀請應已建立帳號"
    scenario_memo["sent_before"] = (first.get("invited_at"), first.get("confirmation_sent_at"))
    scenario_memo["response"] = _invite(supabase_admin, run_state, node, scenario_memo["email"])


@then("邀請已受理")
def invite_accepted(scenario_memo):
    resp = scenario_memo["response"]
    assert resp.status_code == 202, f"{resp.status_code} {resp.text[:300]}"
    assert resp.json() == {"accepted": True}


@then(parsers.parse('被邀請人的帳號已建立、尚未驗證，並蓋有 "{node}" 的推薦碼'))
def invitee_shell(supabase_admin, run_state, scenario_memo, node):
    user = _auth_user(supabase_admin, scenario_memo["email"])
    assert user, "應已建立被邀請人的帳號"
    assert not user.get("email_confirmed_at"), "接受前不應已驗證"
    stamp = (user.get("app_metadata") or {}).get("referral_invite") or {}
    assert stamp.get("code") == run_state.users[node].referral_code, stamp
    # 推薦人 uuid 不進被邀請人可讀之處（兩種 metadata 都會進對方的 JWT）
    referrer_id = run_state.users[node].user_id
    assert referrer_id not in str(user.get("app_metadata")), "app_metadata 不得含推薦人 id"
    assert referrer_id not in str(user.get("user_metadata")), "user_metadata 不得含推薦人 id"
    url = (user.get("user_metadata") or {}).get("referral_invite_url")
    assert url, "user_metadata 應帶信中連結"
    token = parse_qs(urlparse(url).query).get("invite", [""])[0]
    assert token, url
    scenario_memo["token"] = token


@then("被邀請人的邀請信只寄出一次")
def sent_once(supabase_admin, scenario_memo):
    user = _auth_user(supabase_admin, scenario_memo["email"])
    assert user
    # GoTrue 寄成功才更新 invited_at／confirmation_sent_at：第二次沒寄，兩者都不變
    assert (user.get("invited_at"), user.get("confirmation_sent_at")) == scenario_memo["sent_before"]


# --- 被邀請人側 ---------------------------------------------------------------


@when("被邀請人以信中連結設定密碼")
def accept_invite(supabase_admin, scenario_memo):
    resp = _accept(supabase_admin, scenario_memo["token"], INVITEE_PASSWORD)
    assert resp.status_code == 200, f"{resp.status_code} {resp.text[:300]}"
    # 不回 session：前端接著以剛設的密碼登入（下一步「能以剛設定的密碼登入」驗的就是這件事）
    assert resp.json() == {"accepted": True}, resp.text[:300]


@then("被邀請人的 email 已驗證")
def invitee_confirmed(supabase_admin, scenario_memo):
    user = _auth_user(supabase_admin, scenario_memo["email"])
    assert user and user.get("email_confirmed_at"), user
    # 用過的連結從 user_metadata 拿掉
    assert not (user.get("user_metadata") or {}).get("referral_invite_url")


@then("被邀請人能以剛設定的密碼登入")
def invitee_can_login(supabase_admin, scenario_memo):
    assert supabase_admin.password_grant_token(scenario_memo["email"], INVITEE_PASSWORD)


@when("被邀請人再以同一連結設定一次密碼")
def accept_again(supabase_admin, scenario_memo):
    scenario_memo["response"] = _accept(supabase_admin, scenario_memo["token"], INVITEE_PASSWORD)


@then("回應為邀請已完成設定")
def already_accepted(scenario_memo):
    resp = scenario_memo["response"]
    assert resp.status_code == 409, f"{resp.status_code} {resp.text[:300]}"
    assert resp.json()["error"]["code"] == "already_accepted"


# --- 客服刪除 ---------------------------------------------------------------


@when("客服以 service role 依信箱刪除邀請中的帳號")
def purge_by_email(supabase_admin, scenario_memo):
    scenario_memo["purged"] = supabase_admin.rpc(
        "purge_stale_referral_invites", {"p_email": scenario_memo["email"]}
    )


@then(parsers.parse("刪除筆數為 {count:d}"))
def purged_count(scenario_memo, count):
    assert scenario_memo["purged"] == count, scenario_memo["purged"]


@then("被邀請人的帳號已不存在")
def invitee_gone(supabase_admin, scenario_memo):
    assert _auth_user(supabase_admin, scenario_memo["email"]) is None
