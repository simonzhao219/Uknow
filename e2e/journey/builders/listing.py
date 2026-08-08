"""刊登名稱的單一產生器——40_listing 與 60_time_scenarios 共用。

原本 f40 與 f60 各有一份一模一樣的 `f"服務{run_id}{node}"`,兩份一起錯、
也必須一起修;收斂成一處之後,「名稱怎麼產生」只有一個答案。
"""

from __future__ import annotations


def listing_name(run_id: str, node: str) -> str:
    """刊登名稱。決定性(只由 run_id 與 node 導出)是刻意的——跨情境用的是
    不同的 browser context,不共享任何狀態也能重建出同一個名稱。"""
    return f"服務{run_id}{node}"
