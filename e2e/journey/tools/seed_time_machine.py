"""時光機：以 service role 改寫訂閱時間戳，讓「跨時間」的會籍狀態
（即將失效 grace／永久失效 expired）在單次測試內可達。

原則：**資料是種的，行為斷言是真的**——回填只動 subscriptions 的
end_date / grace_period_end 兩欄（user_account_status 視圖由這兩欄即時
推導狀態），其後所有斷言仍走 GUI 與真後端。

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


def enter_grace(admin: SupabaseAdmin, user_id: str) -> dict:
    """進入「即將失效」：到期 30 天、仍在 60 天寬限內（寬限剩 30 天）。

    回傳更新後的訂閱列——end_date 就是補繳 extend 的接續錨點，
    呼叫端要拿它斷言「接續原週期、不是從付款日起算」。"""
    return _shift_latest(admin, user_id, end_delta_days=-30, grace_delta_days=+30)


def enter_expired(admin: SupabaseAdmin, user_id: str) -> dict:
    """進入「永久失效」：到期 90 天、寬限也已於 30 天前結束。"""
    return _shift_latest(admin, user_id, end_delta_days=-90, grace_delta_days=-30)
