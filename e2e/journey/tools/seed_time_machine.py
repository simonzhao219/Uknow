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
