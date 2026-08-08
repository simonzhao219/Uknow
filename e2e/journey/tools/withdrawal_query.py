"""提領紀錄的 service-role 查詢——欄位名獨立成模組,好讓離線測試釘住。

為什麼值得一個模組:`withdrawals` 沒有 `created_at`(它的建立時間欄位叫
`requested_at`),而步驟檔原本用 `order=created_at.desc` 排序。PostgREST 對
不存在的欄位回 **400**,於是 f50「完整生命週期」在真後端一路紅,錯誤訊息
只是一句 `400 Client Error`——看不出是哪個欄位、更看不出是測試寫錯而不是
產品壞了(2026-08-08 run 31234221750)。

欄位名寫在這裡、由 tools/test_withdrawal_query.py 直接比對 migration,
schema 改名時會在**離線軌**就紅,而不是等下一場 30 分鐘的 journey。
"""

from __future__ import annotations

# withdrawals 的建立時間欄位。定義於
# supabase/migrations/20260620000001_initial_schema.sql。
# ⚠️ 不是 created_at——這張表沒有那個欄位。
ORDER_COLUMN = "requested_at"

SELECT_COLUMNS = "id,status,amount"


def latest_withdrawal(admin, user_id: str) -> dict:
    """該使用者最新的一筆提領紀錄(以 service role 直讀)。"""
    rows = admin.rest_select(
        "withdrawals",
        {
            "select": SELECT_COLUMNS,
            "user_id": f"eq.{user_id}",
            "order": f"{ORDER_COLUMN}.desc",
            "limit": "1",
        },
    )
    assert rows, "沒有提領紀錄"
    return rows[0]


def backdate_todays_withdrawals(admin, user_id: str, days: int = 1) -> int:
    """把該使用者「今天」的提領紀錄往前挪,解除一天一次的限制。

    產品規則是每人每天只能申請一次提領——`has_withdrawn_today` 是
    `exists(withdrawals where tw_day(requested_at) = tw_day(now()))`,
    **不看狀態**,所以被退件的那筆一樣佔住當天的額度
    (`20260718000101_withdrawal_lifecycle.sql`)。

    50_withdrawal.feature 有兩個情境都讓 A0 提領,第二個因此永遠點不到
    「申請Point提領」(鈕 disabled、20 秒點擊逾時,run 31234221750)。
    規則沒有錯、產品沒有錯,是情境之間共用了同一個人的當日額度。

    照本套件既有的原則:**資料是種的,行為斷言是真的**——把前一筆的
    `requested_at` 挪到昨天,後面的申請與斷言仍然走 GUI 與真後端。
    """
    from datetime import datetime, timedelta, timezone

    rows = admin.rest_select(
        "withdrawals", {"select": f"id,{ORDER_COLUMN}", "user_id": f"eq.{user_id}"}
    )
    if not rows:
        return 0

    backdated = datetime.now(timezone.utc) - timedelta(days=days)
    for row in rows:
        admin.rest_update(
            "withdrawals",
            {"id": f"eq.{row['id']}"},
            {ORDER_COLUMN: backdated.isoformat()},
        )
    return len(rows)
