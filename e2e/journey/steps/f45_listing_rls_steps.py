"""45_listing_rls.feature 的步驟定義——直打 PostgREST 的 RLS 授權邊界。

與其他 feature 不同,這裡刻意**不走 GUI**:偽造 `user_id` 的 insert、
跨使用者的 PATCH/DELETE 在介面上根本沒有入口,但持有 anon key 的人可以
直接送——那正是 RLS 要擋的東西,也是唯一能驗證它的方式。

資料以 service role 播種(「資料是種的,行為斷言是真的」),斷言一律走
使用者身分的真實請求。
"""

from __future__ import annotations

import pytest
from pytest_bdd import parsers, given, scenarios, then, when

from tools import rls_probe, seed_time_machine
from tools.rest_as_user import RestAsUser, body_of

scenarios("45_listing_rls.feature")


# --- 播種 -------------------------------------------------------------------


def _listing_row(user_id: str, node: str, run_id: str) -> dict:
    return {
        "user_id": user_id,
        "name": f"RLS{run_id}{node}"[:60],
        "category": "美髮",
        "city": "台北市",
        "districts": ["全區"],
        "gender": "女",
        "photos": [],
        "contacts": {"instagram": f"rls_{node.lower()}"},
        "description": "RLS 邊界測試用",
    }


@pytest.fixture(scope="session")
def rls_seed(supabase_admin, run_state, org_nodes):
    """B5 有效擁有者、B7 失效擁有者各一筆刊登;B8 保持無刊登(偽造目標)。

    B7 用 capture/restore 還原訂閱效期,比照 60_time_scenarios 對 A0 的做法
    ——別的 feature 沒有用到 B5/B6/B7/B8,但還原是便宜的保險。
    """
    for node in ("B5", "B6", "B7", "B8"):
        if node not in run_state.users or not run_state.users[node].user_id:
            pytest.skip(f"組織樹缺 {node}——請先跑 10_org_build")

    ids = {n: run_state.users[n].user_id for n in ("B5", "B6", "B7", "B8")}

    for node in ("B5", "B7"):
        supabase_admin.rest_insert("listings", _listing_row(ids[node], node, run_state.run_id))

    snapshot = seed_time_machine.capture_dates(supabase_admin, ids["B7"])
    seed_time_machine.enter_expired(supabase_admin, ids["B7"])

    yield ids

    seed_time_machine.restore_dates(supabase_admin, ids["B7"], snapshot)
    for node in ("B5", "B7"):
        supabase_admin.rest_delete("listings", {"user_id": f"eq.{ids[node]}"})


@given("RLS 測試資料已就緒")
def rls_ready(rls_seed):
    """把播種 fixture 串進情境;實際工作在 rls_seed 裡。"""


# --- 建立各身分的 client -----------------------------------------------------


def _client(journey_config, supabase_admin, run_state, node: str | None) -> RestAsUser:
    """node 為 None → 訪客(anon);否則以該節點的 access token 登入。"""
    token = None
    if node is not None:
        user = run_state.users[node]
        token = supabase_admin.password_grant_token(user.email, user.password)
    return RestAsUser(
        project_ref=journey_config.project_ref,
        anon_key=journey_config.anon_key,
        access_token=token,
    )


def _remember(memo: dict, resp) -> None:
    memo["resp"] = resp
    memo["body"] = body_of(resp)
    memo["kind"] = rls_probe.classify(resp.status_code, memo["body"])


def _owner_ids(body: object) -> list[str]:
    return [row["user_id"] for row in body] if isinstance(body, list) else []


# --- 讀取 -------------------------------------------------------------------


@when(parsers.parse('"{node}" 以自己的身分直讀 listings'))
def member_reads(journey_config, supabase_admin, run_state, scenario_memo, node):
    client = _client(journey_config, supabase_admin, run_state, node)
    _remember(scenario_memo, client.select("listings", {"select": "id,user_id,description"}))


@when("訪客直讀 listings")
def visitor_reads(journey_config, supabase_admin, run_state, scenario_memo):
    client = _client(journey_config, supabase_admin, run_state, None)
    _remember(scenario_memo, client.select("listings", {"select": "id,user_id,description"}))


@when("管理員以自己的身分直讀 listings")
def admin_reads(journey_config, supabase_admin, run_state, scenario_memo):
    client = _client(journey_config, supabase_admin, run_state, "admin")
    _remember(scenario_memo, client.select("listings", {"select": "id,user_id,description"}))


@then(parsers.parse('直讀結果包含 "{node}" 的刊登'))
def result_contains(scenario_memo, rls_seed, node):
    assert scenario_memo["kind"] in ("allowed", "filtered_empty"), (
        f"直讀應該成功(可能 0 列),實際是 {scenario_memo['kind']}:{scenario_memo['body']}"
    )
    assert rls_seed[node] in _owner_ids(scenario_memo["body"]), (
        f"預期讀得到 {node} 的刊登,實際擁有者清單:{_owner_ids(scenario_memo['body'])}"
    )


@then(parsers.parse('直讀結果不包含 "{node}" 的刊登'))
def result_excludes(scenario_memo, rls_seed, node):
    assert scenario_memo["kind"] in ("allowed", "filtered_empty"), (
        f"直讀應該成功(可能 0 列),實際是 {scenario_memo['kind']}:{scenario_memo['body']}"
    )
    assert rls_seed[node] not in _owner_ids(scenario_memo["body"]), (
        f"{node} 已失效,其刊登不該被讀到"
    )


# --- 寫入 -------------------------------------------------------------------


@when(parsers.parse('"{node}" 把自己刊登的服務介紹改成 "{text}"'))
def owner_updates_own(journey_config, supabase_admin, run_state, scenario_memo, rls_seed, node, text):
    client = _client(journey_config, supabase_admin, run_state, node)
    _remember(
        scenario_memo,
        client.update("listings", {"user_id": f"eq.{rls_seed[node]}"}, {"description": text}),
    )


@when(parsers.parse('"{actor}" 嘗試以 "{victim}" 的身分建立刊登'))
def member_forges_insert(
    journey_config, supabase_admin, run_state, scenario_memo, rls_seed, actor, victim
):
    client = _client(journey_config, supabase_admin, run_state, actor)
    row = _listing_row(rls_seed[victim], victim, run_state.run_id)
    _remember(scenario_memo, client.insert("listings", row))


@when(parsers.parse('訪客嘗試以 "{victim}" 的身分建立刊登'))
def visitor_forges_insert(
    journey_config, supabase_admin, run_state, scenario_memo, rls_seed, victim
):
    client = _client(journey_config, supabase_admin, run_state, None)
    row = _listing_row(rls_seed[victim], victim, run_state.run_id)
    _remember(scenario_memo, client.insert("listings", row))


@when(parsers.parse('"{actor}" 嘗試把 "{victim}" 的刊登服務介紹改成 "{text}"'))
def member_updates_other(
    journey_config, supabase_admin, run_state, scenario_memo, rls_seed, actor, victim, text
):
    client = _client(journey_config, supabase_admin, run_state, actor)
    _remember(
        scenario_memo,
        client.update("listings", {"user_id": f"eq.{rls_seed[victim]}"}, {"description": text}),
    )


@when(parsers.parse('"{actor}" 嘗試刪除 "{victim}" 的刊登'))
def member_deletes_other(
    journey_config, supabase_admin, run_state, scenario_memo, rls_seed, actor, victim
):
    client = _client(journey_config, supabase_admin, run_state, actor)
    _remember(scenario_memo, client.delete("listings", {"user_id": f"eq.{rls_seed[victim]}"}))


@when(parsers.parse('"{actor}" 嘗試把自己刊登的擁有者改成 "{victim}"'))
def owner_gives_away(
    journey_config, supabase_admin, run_state, scenario_memo, rls_seed, actor, victim
):
    client = _client(journey_config, supabase_admin, run_state, actor)
    _remember(
        scenario_memo,
        client.update(
            "listings", {"user_id": f"eq.{rls_seed[actor]}"}, {"user_id": rls_seed[victim]}
        ),
    )


# --- 寫入結果的斷言 ----------------------------------------------------------


@then("該次更新影響一列")
def update_affected_one(scenario_memo):
    assert scenario_memo["kind"] == "allowed", (
        f"擁有者更新自己的刊登應該成功,實際是 {scenario_memo['kind']}:{scenario_memo['body']}"
    )
    assert len(scenario_memo["body"]) == 1


@then("該次更新影響零列")
def update_affected_none(scenario_memo):
    # 被 USING 過濾不是錯誤——PostgREST 回 200 + []。只斷言「請求失敗」的話,
    # policy 全開時也會過。
    assert scenario_memo["kind"] == "filtered_empty", (
        f"跨使用者更新應被過濾成 0 列,實際是 {scenario_memo['kind']}:{scenario_memo['body']}"
    )


@then("該次刪除影響零列")
def delete_affected_none(scenario_memo):
    assert scenario_memo["kind"] == "filtered_empty", (
        f"跨使用者刪除應被過濾成 0 列,實際是 {scenario_memo['kind']}:{scenario_memo['body']}"
    )


@then("該次寫入被 RLS 拒絕")
def write_denied_by_rls(scenario_memo):
    # 形狀要精確:GRANT 拒絕與 RLS 拒絕共用 SQLSTATE 42501,只認「被拒」
    # 會讓斷言失去辨別力——即使 policy 沒生效、拒絕來自不相干的權限層,
    # 測試也照樣綠(見 name-write-paths.test.ts 檔頭的同款教訓)。
    assert scenario_memo["kind"] == "denied_by_rls", (
        f"應被 RLS 的 WITH CHECK 擋下,實際是 {scenario_memo['kind']}:{scenario_memo['body']}"
    )


@then("該次寫入被拒絕")
def write_denied(scenario_memo):
    # 訪客路徑不釘死形狀:hosted 上 anon 有 INSERT 的 table GRANT,所以預期
    # 走到 RLS;但這個 GRANT 是環境相依的事實,釘死會讓測試綁上某個環境設定。
    assert scenario_memo["kind"] in ("denied_by_rls", "denied_by_grant", "unauthenticated"), (
        f"訪客不該寫得進去,實際是 {scenario_memo['kind']}:{scenario_memo['body']}"
    )


# --- 以 service role 回頭確認資料真相 ----------------------------------------


def _listings_of(supabase_admin, user_id: str) -> list[dict]:
    return supabase_admin.rest_select(
        "listings", {"select": "id,user_id,description", "user_id": f"eq.{user_id}"}
    )


@then(parsers.parse('"{node}" 名下沒有任何刊登'))
def victim_has_no_listing(supabase_admin, rls_seed, node):
    assert _listings_of(supabase_admin, rls_seed[node]) == [], f"{node} 名下不該有刊登"


@then(parsers.parse('"{node}" 的刊登服務介紹已變成 "{text}"'))
def description_changed(supabase_admin, rls_seed, node, text):
    rows = _listings_of(supabase_admin, rls_seed[node])
    assert rows and rows[0]["description"] == text


@then(parsers.parse('"{node}" 的刊登服務介紹不是 "{text}"'))
def description_unchanged(supabase_admin, rls_seed, node, text):
    # 0 列 + 資料未變,兩段一起斷言:只看「回應 0 列」擋不住「其實被改了但
    # 回應沒帶回來」這種假設落空的情況。
    rows = _listings_of(supabase_admin, rls_seed[node])
    assert rows, f"{node} 的刊登不該消失"
    assert rows[0]["description"] != text, "跨使用者更新竟然真的寫進去了"


@then(parsers.parse('"{node}" 的刊登仍然存在'))
def listing_still_there(supabase_admin, rls_seed, node):
    assert _listings_of(supabase_admin, rls_seed[node]), f"{node} 的刊登被別人刪掉了"


@then(parsers.parse('"{node}" 的刊登仍然屬於 "{owner}"'))
def listing_owner_unchanged(supabase_admin, rls_seed, node, owner):
    rows = _listings_of(supabase_admin, rls_seed[node])
    assert rows, f"{node} 的刊登不該消失"
    assert rows[0]["user_id"] == rls_seed[owner]
