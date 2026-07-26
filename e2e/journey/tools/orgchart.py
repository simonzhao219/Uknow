"""orgchart.yaml 的載入與純計算——建樹順序與預期帳本的單一真相。

這裡全部是純函數，離線單元測試（test_orgchart.py）鎖住：
- 六代 30 人的形狀（每代人數、總數）；
- 每個節點「自己的三代」下線數——乘上 reward_config 的單代獎金
  就是該節點的預期獎勵總額，20_referral_rewards 的斷言直接用。
"""

from __future__ import annotations

import os
from pathlib import Path

import yaml

JOURNEY_DIR = Path(__file__).resolve().parent.parent
ORGCHART_PATH = JOURNEY_DIR / "orgchart.yaml"


def active_orgchart_path() -> Path:
    """這一輪要用哪張樹形圖。

    預設是測試用的 orgchart.yaml；`JOURNEY_ORGCHART_PATH` 可換成別張
    ——目前唯一的用途是 develop 的示範資料（orgchart-develop-seed.yaml，
    形狀與生命週期都與測試樹不同，見該檔檔頭）。相對路徑以 journey 目錄
    為基準，好讓 workflow 只寫檔名。

    刻意做成「換檔案」而不是「加參數」：樹形是 builder 與斷言的單一真相，
    兩邊都讀同一張圖才不會出現「建的樹」與「驗的樹」不一致。
    """
    override = os.environ.get("JOURNEY_ORGCHART_PATH")
    if not override:
        return ORGCHART_PATH
    path = Path(override)
    return path if path.is_absolute() else JOURNEY_DIR / path

REWARD_GENERATIONS = 3  # 三代制：獎勵只往上發三層


def load_nodes(path: Path | None = None) -> dict[str, str | None]:
    """回傳 {節點: 上線節點或 None}。順便驗證結構完整性。

    path 省略時走 active_orgchart_path()（預設測試樹，可用環境變數換成
    develop 的示範資料樹）。
    """
    data = yaml.safe_load((path or active_orgchart_path()).read_text(encoding="utf-8"))
    nodes: dict[str, str | None] = data["nodes"]
    for node, parent in nodes.items():
        if parent is not None and parent not in nodes:
            raise ValueError(f"{node} 的上線 {parent} 不存在於 orgchart")
    roots = [n for n, p in nodes.items() if p is None]
    if len(roots) != 1:
        raise ValueError(f"orgchart 必須恰好一個 root，目前：{roots}")
    return nodes


def load_expected_rewards(path: Path | None = None) -> dict[str, int]:
    data = yaml.safe_load((path or active_orgchart_path()).read_text(encoding="utf-8"))
    return data.get("expected_rewards", {})


def generation_levels(nodes: dict[str, str | None]) -> list[list[str]]:
    """BFS 分層：levels[0] = [root]，levels[k] = 第 k 代。也是建樹波次順序
    ——上線必須先付款成為訂閱中，推薦碼才能給下一代用。"""
    children: dict[str | None, list[str]] = {}
    for node, parent in nodes.items():
        children.setdefault(parent, []).append(node)

    levels: list[list[str]] = []
    current = sorted(children.get(None, []))
    while current:
        levels.append(current)
        current = sorted(c for n in current for c in children.get(n, []))
    total = sum(len(level) for level in levels)
    if total != len(nodes):
        raise ValueError(f"orgchart 有斷鏈節點：分層共 {total}，nodes 共 {len(nodes)}")
    return levels


def downline_by_generation(nodes: dict[str, str | None], node: str,
                           depth: int = REWARD_GENERATIONS) -> list[list[str]]:
    """以 node 為根往下爬 depth 層：[一代成員, 二代成員, ...]。"""
    children: dict[str | None, list[str]] = {}
    for child, parent in nodes.items():
        children.setdefault(parent, []).append(child)

    result: list[list[str]] = []
    current = sorted(children.get(node, []))
    for _ in range(depth):
        result.append(current)
        current = sorted(c for n in current for c in children.get(n, []))
    return result


def expected_reward_count(nodes: dict[str, str | None], node: str) -> int:
    """該節點應得的獎勵「筆數」＝自己三代內的下線人數（每人每代一筆）。"""
    return sum(len(gen) for gen in downline_by_generation(nodes, node))
