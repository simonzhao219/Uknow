"""Journey 測試資料清理——第二道保險（第一道是整個測試分支用完即刪）。

用法（也可由 conftest 的 session finalizer 直接呼叫函數）：

    python tools/cleanup.py --run-id j07201530 [--dry-run]

流程：
1. 以 email 前綴 `e2e+{run_id}+` 找出該 run 的所有 auth users（含 admin）；
2. 先刪 Storage 物件（不會跟著 user cascade）；
3. 刪 auth users——schema 全面 on delete cascade，業務資料隨之抹除；
4. 零殘留斷言：逐表以 user id 清單查詢，任何一表筆數 > 0 即失敗。
   清理本身是測項，不是善後。
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools.supa import SupabaseAdmin

STORAGE_BUCKETS = ["id-cards", "referral-signatures", "make-5c6718b9-listings-photos"]

# (table, user-id 欄位) — 零殘留斷言掃的表。新增含會員 FK 的表時要同步
# 補這裡（M4 會改成 schema 巡檢動態產生，漏列直接紅燈）。
RESIDUE_TABLES: list[tuple[str, str]] = [
    ("profiles", "id"),
    ("subscriptions", "user_id"),
    ("payment_orders", "user_id"),
    ("referral_codes", "user_id"),
    ("referral_edges", "referrer_user_id"),
    ("referral_edges", "referee_user_id"),
    ("reward_transactions", "user_id"),
    ("reward_schedules", "user_id"),
    ("referral_king_rewards", "user_id"),
    ("withdrawals", "user_id"),
    ("listings", "user_id"),
    ("task_progress", "user_id"),
]


def email_prefix(run_id: str) -> str:
    return f"e2e+{run_id}+"


def cleanup_run(admin: SupabaseAdmin, run_id: str, dry_run: bool = False) -> list[str]:
    """清掉一個 run 的所有資料。回傳被刪除（或 dry-run 下將被刪除）的 user id。"""
    users = admin.list_users_by_email_prefix(email_prefix(run_id))
    user_ids = [u["id"] for u in users]
    print(f"[cleanup] run {run_id}: 找到 {len(user_ids)} 個測試帳號")

    for bucket in STORAGE_BUCKETS:
        for uid in user_ids:
            try:
                paths = admin.storage_list(bucket, uid)
                if paths and not dry_run:
                    admin.storage_delete(bucket, paths)
                if paths:
                    print(f"[cleanup] storage {bucket}: {len(paths)} 個物件 (user {uid[:8]})")
            except Exception as exc:  # storage 清理盡力而為；殘留由分支刪除兜底
                print(f"[cleanup] storage {bucket} 清理失敗（續行）: {exc}")

    for user in users:
        if dry_run:
            print(f"[cleanup] dry-run: 將刪除 {user.get('email')}")
        else:
            admin.delete_user(user["id"])

    return user_ids


def assert_zero_residue(admin: SupabaseAdmin, run_id: str, user_ids: list[str]) -> None:
    """清理後逐表斷言零殘留；任何殘留都拋 AssertionError。"""
    leftovers = admin.list_users_by_email_prefix(email_prefix(run_id))
    assert not leftovers, f"auth.users 殘留 {len(leftovers)} 筆：{[u.get('email') for u in leftovers]}"

    if not user_ids:
        return
    id_list = ",".join(f'"{uid}"' for uid in user_ids)
    for table, column in RESIDUE_TABLES:
        rows = admin.rest_select(table, {"select": column, column: f"in.({id_list})", "limit": "5"})
        assert not rows, f"{table}.{column} 殘留 {len(rows)}+ 筆（run {run_id}）"
    print(f"[cleanup] 零殘留斷言通過：{len(RESIDUE_TABLES)} 個檢查點全數為 0")


def main() -> int:
    parser = argparse.ArgumentParser(description="刪除一個 journey run 的全部測試資料")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    ref = os.environ.get("JOURNEY_SUPABASE_PROJECT_REF")
    service = os.environ.get("JOURNEY_SUPABASE_SERVICE_ROLE_KEY")
    anon = os.environ.get("JOURNEY_SUPABASE_ANON_KEY", "")
    if not (ref and service):
        print("需要 JOURNEY_SUPABASE_PROJECT_REF / JOURNEY_SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 2

    admin = SupabaseAdmin(project_ref=ref, service_role_key=service, anon_key=anon)
    user_ids = cleanup_run(admin, args.run_id, dry_run=args.dry_run)
    if not args.dry_run:
        assert_zero_residue(admin, args.run_id, user_ids)
    return 0


if __name__ == "__main__":
    sys.exit(main())
