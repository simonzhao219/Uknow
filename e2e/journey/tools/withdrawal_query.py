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
ORDER_COLUMN = "created_at"

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
