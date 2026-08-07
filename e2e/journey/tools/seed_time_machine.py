"""時光機：以 service role 改寫訂閱時間戳，讓「跨時間」的會籍狀態
在單次測試內可達。會員兩態（見 0721 移除寬限期）：到期即失效，只有
active / expired；不再有 60 天緩衝窗。

原則：**資料是種的，行為斷言是真的**——回填只動 subscriptions 的
end_date（user_account_status 視圖由 end_date 即時推導狀態；
grace_period_end 一併回填只為維持資料完整，狀態判斷已不讀它），
其後所有斷言仍走 GUI 與真後端。

僅限拋棄式測試分支；正式碼與正式環境沒有任何路徑觸及此模組。
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from tools import time_shift
from tools.supa import SupabaseAdmin


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _latest_subscription(admin: SupabaseAdmin, user_id: str) -> dict:
    rows = admin.rest_select(
        "subscriptions",
        {"select": "id,end_date,grace_period_end", "user_id": f"eq.{user_id}",
         "order": "end_date.desc", "limit": "1"},
    )
    assert rows, f"user {user_id} 沒有訂閱可回填"
    return rows[0]


def _shift_latest(admin: SupabaseAdmin, user_id: str,
                  end_delta_days: int, grace_delta_days: int) -> dict:
    """把最新一筆訂閱的 end/grace 設為「現在 + N 天」，回傳更新後的列。"""
    sub = _latest_subscription(admin, user_id)
    now = datetime.now(timezone.utc)
    updated = admin.rest_update(
        "subscriptions",
        {"id": f"eq.{sub['id']}"},
        {
            "end_date": _iso(now + timedelta(days=end_delta_days)),
            "grace_period_end": _iso(now + timedelta(days=grace_delta_days)),
        },
    )
    assert updated, "訂閱回填未生效"
    return updated[0]


def enter_recently_expired(admin: SupabaseAdmin, user_id: str) -> dict:
    """進入「剛過期」：到期 30 天（未滿一年，仍可走續約 extend 接續）。

    兩態模型下 end_date 一過即 expired，沒有寬限期；到期 30 天仍在
    「續約接續」的一年窗內。回傳更新後的訂閱列——end_date 就是補繳
    extend 的接續錨點，呼叫端要拿它斷言「接續原週期、不是從付款日起算」。"""
    return _shift_latest(admin, user_id, end_delta_days=-30, grace_delta_days=+30)


def enter_expired(admin: SupabaseAdmin, user_id: str) -> dict:
    """進入「完全失效」：到期 90 天（兩態模型：end_date 一過即失效，
    無寬限期）。刊登隨即隱藏。"""
    return _shift_latest(admin, user_id, end_delta_days=-90, grace_delta_days=-30)


def enter_expired_over_a_year(admin: SupabaseAdmin, user_id: str) -> dict:
    """進入「過期超過一年」：補繳制（A1-A3）下 extend 仍可選——一筆一年
    從原到期日隔天字面接續，算出來仍在過去就再補下一筆，付款頁會揭露
    需補繳的筆數與總額。"""
    return _shift_latest(admin, user_id, end_delta_days=-400, grace_delta_days=-340)


def capture_dates(admin: SupabaseAdmin, user_id: str) -> dict:
    """快照最新訂閱的時間欄位——搭配 restore_dates 讓「把 A0 推入失效」
    這類情境測完能還原，不把污染留給後續調查。"""
    return _latest_subscription(admin, user_id)


def restore_dates(admin: SupabaseAdmin, user_id: str, snapshot: dict) -> None:
    updated = admin.rest_update(
        "subscriptions",
        {"id": f"eq.{snapshot['id']}"},
        {"end_date": snapshot["end_date"],
         "grace_period_end": snapshot["grace_period_end"]},
    )
    assert updated, f"user {user_id} 的訂閱效期還原失敗"


# ---------------------------------------------------------------------------
# renewal-saga(70_)的四個原語——同一原則:資料是種的,行為斷言是真的。
# ---------------------------------------------------------------------------


def age_monthly_bucket(admin: SupabaseAdmin, user_id: str, months_back: int) -> dict:
    """把該使用者 monthly_referrals 的**全部**月桶 key 統一往回平移。

    準則:讀現有 key 平移,絕不自行推算「現在的月份」——Python 自算的
    時區月份若與 DB 寫入的 Asia/Taipei 'YYYY-MM' 不一致,對不存在的 key
    平移是靜默 no-op,Q14a 的「跨清空歷史桶」斷言會假綠。空桶硬失敗,
    平移後帶 key 存在性自檢。"""
    rows = admin.rest_select(
        "task_progress",
        {"select": "user_id,monthly_referrals", "user_id": f"eq.{user_id}"},
    )
    assert rows, f"user {user_id} 沒有 task_progress 列可平移"
    buckets = rows[0].get("monthly_referrals") or {}
    assert buckets, (
        f"user {user_id} 的 monthly_referrals 是空的——沒有 key 可平移"
        "(拒絕靜默 no-op)"
    )
    shifted = time_shift.shift_bucket_keys(buckets, months_back)
    updated = admin.rest_update(
        "task_progress", {"user_id": f"eq.{user_id}"}, {"monthly_referrals": shifted}
    )
    assert updated, "月桶平移未生效"
    got = set((updated[0].get("monthly_referrals") or {}).keys())
    assert got == set(shifted), f"平移後 key 不符:{sorted(got)} != {sorted(shifted)}"
    return updated[0]


def seed_reward_points(admin: SupabaseAdmin, user_id: str, amount: int, run_id: str) -> dict:
    """種一筆 RUN_ID 標記的獎勵列(type=adjustment),把餘額墊到提領
    門檻——僅供 Q9 情境前置。「點數怎麼賺來的」由 20_referral_rewards
    覆蓋,saga 不重演(人審裁決 #4)。"""
    rows = admin.rest_insert(
        "reward_transactions",
        {
            "user_id": user_id,
            "type": "adjustment",
            "amount": amount,
            "description": f"journey 種子點數({run_id})",
        },
    )
    assert rows and rows[0].get("id"), "種子點數插入未生效"
    return rows[0]


def seed_unclaimed_king_credit(admin: SupabaseAdmin, user_id: str, month_key: str) -> dict:
    """種一張 unclaimed 推薦王 credit。發放路徑(當月滿 8 人)由
    30_tasks 以真 8 人覆蓋;saga 只驗 claim 的下游連動與 A8
    (人審裁決 #3)。month_key 由呼叫端給(通常取自該使用者既有月桶
    或其平移結果,同樣不自行推算現在月份)。"""
    rows = admin.rest_insert(
        "referral_king_rewards",
        {"user_id": user_id, "month_key": month_key, "status": "unclaimed"},
    )
    assert rows and rows[0].get("id"), "種子 credit 插入未生效"
    return rows[0]


def set_default_referrer_code(admin: SupabaseAdmin, code: str) -> None:
    """把分支的 reward_config.default_referrer_code 設為指定碼(冪等)。

    分支只 replay schema,正式站在資料層設定的預設碼不會跟過來——saga
    自備 P0 後用這支把它接上(人審 2026-08-07 裁決)。reward_config 是
    單列表(id boolean primary key = true)。

    已知的非阻擋性殘留:cleanup 的零殘留斷言只掃逐使用者 FK 表,這個
    單列共享設定不在其中——刪除 P0 後碼會暫時指向已刪使用者。無實害:
    拋棄式分支測完整個刪除,滿量重跑時本函式(冪等)會覆寫。"""
    updated = admin.rest_update(
        "reward_config", {"id": "eq.true"}, {"default_referrer_code": code.lower()}
    )
    assert updated and (updated[0].get("default_referrer_code") or "").lower() == code.lower(), (
        f"default_referrer_code 設定未生效:{updated}"
    )


def resolve_default_referrer_identity(admin: SupabaseAdmin) -> dict:
    """解析預設推薦人 P 的身分(user_id + 顯示名 + 碼)。

    A12 的 /health 只回三態 enum、不含身分;「上代=P」要在 admin 查詢台
    比對推薦人姓名,預期值只能從 reward_config.default_referrer_code
    → referral_codes → profiles 這條鏈查出來。"""
    code = (admin.reward_config().get("default_referrer_code") or "").strip().lower()
    assert code, "reward_config.default_referrer_code 未設定——A10 情境無法斷言"
    codes = admin.rest_select(
        "referral_codes",
        {"select": "user_id,code", "code": f"eq.{code}", "limit": "1"},
    )
    assert codes, f"預設推薦碼 {code} 不存在於 referral_codes"
    uid = codes[0]["user_id"]
    profs = admin.rest_select(
        "profiles", {"select": "id,name", "id": f"eq.{uid}", "limit": "1"}
    )
    assert profs, f"預設推薦人 profile 不存在({uid})"
    return {"user_id": uid, "name": profs[0].get("name") or "", "code": code}
