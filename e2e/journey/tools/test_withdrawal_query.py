"""提領查詢的欄位存在性——離線比對 migration,不需要真後端。

這條釘的是 2026-08-08 run 31234221750 的 f50 失敗:查詢用
`order=created_at.desc`,但 `withdrawals` 的建立時間欄位叫 `requested_at`。
PostgREST 回 400,而 journey 一場要 20 分鐘、一週跑一次——這種
「欄位名打錯」的錯誤不該用真後端的牆鐘去換。

欄位清單直接從 migration 解析,不在測試裡另抄一份:schema 改名時這裡會紅,
而不是等下一場 journey。
"""

from __future__ import annotations

import re
from pathlib import Path

from tools import withdrawal_query

_MIGRATIONS = Path(__file__).resolve().parents[3] / "supabase" / "migrations"


def _withdrawals_columns() -> set[str]:
    """從 migration 收集 withdrawals 的欄位:建表的欄位 + 後續 add column。"""
    columns: set[str] = set()

    for sql_path in sorted(_MIGRATIONS.glob("*.sql")):
        sql = sql_path.read_text(encoding="utf-8")

        # create table public.withdrawals ( ... );
        create = re.search(
            r"create table public\.withdrawals\s*\((.*?)\n\);", sql, re.DOTALL
        )
        if create:
            for line in create.group(1).split("\n"):
                line = line.strip()
                if not line or line.startswith("--"):
                    continue
                name = re.match(r"([a-z_][a-z0-9_]*)\s", line)
                # 略過表層 constraint 宣告(check/primary/unique…)
                if name and name.group(1) not in {
                    "check", "primary", "unique", "foreign", "constraint",
                }:
                    columns.add(name.group(1))

        # alter table public.withdrawals ... add column <name>
        for block in re.findall(
            r"alter table public\.withdrawals(.*?);", sql, re.DOTALL
        ):
            columns.update(re.findall(r"add column\s+([a-z_][a-z0-9_]*)", block))

    return columns


def test_migration_parsing_finds_the_table():
    # 解析失敗時下面兩條會變成「空集合 → 什麼都不包含」而假性通過,先擋住
    columns = _withdrawals_columns()
    assert "user_id" in columns and "status" in columns, (
        f"migration 解析看起來壞了,只找到:{sorted(columns)}"
    )


def test_order_column_exists_on_withdrawals():
    columns = _withdrawals_columns()
    assert withdrawal_query.ORDER_COLUMN in columns, (
        f"排序欄位 {withdrawal_query.ORDER_COLUMN!r} 不在 withdrawals 上——"
        f"PostgREST 會回 400。實際欄位:{sorted(columns)}"
    )


def test_selected_columns_exist_on_withdrawals():
    columns = _withdrawals_columns()
    missing = [c for c in withdrawal_query.SELECT_COLUMNS.split(",") if c not in columns]
    assert not missing, f"select 的欄位不存在:{missing}。實際欄位:{sorted(columns)}"
