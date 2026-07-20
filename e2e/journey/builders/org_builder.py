"""六代 30 人組織樹的 GUI 建置——M2 的核心 builder。

原則與取捨：
- **全 GUI**：每個節點都走完整註冊三步＋付款（產品決策：純黑箱）。
- **以代為序**：上線必須先付款成為訂閱中，推薦碼才能給下一代——
  所以逐代（BFS 波次）推進；同代之間互不依賴，可平行。
- **平行 = 執行緒 × 各自的 Playwright 實例**：sync API 物件綁定建立它
  的執行緒，不能共用 Browser——每個 worker 自己 launch 一個 headless
  chromium（JOURNEY_BUILD_PARALLELISM，預設 3）。
- **冪等**：run_state 中已有推薦碼的節點直接跳過——中途失敗後同一
  RUN_ID 重跑，只補沒完成的節點。
- **限流**：每波開始前重置分支上的 check-email 計數（拋棄式分支限定
  的基礎設施操作，正式碼不動）。

run_state 的寫入全部在主執行緒（worker 只回傳結果），避免 JSON 併發寫壞。
"""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

from playwright.sync_api import sync_playwright

from builders import payment, registration
from builders.verification import fetch_backend_landing
from run_state import JourneyUser, RunState
from tools import orgchart, twid
from tools.supa import SupabaseAdmin

DEFAULT_PARALLELISM = 3


def _parallelism() -> int:
    return max(1, int(os.environ.get("JOURNEY_BUILD_PARALLELISM", DEFAULT_PARALLELISM)))


def _is_built(user: JourneyUser | None) -> bool:
    return bool(user and user.referral_code)


def _guard_context(context, cfg) -> None:
    """瀏覽器層的正式環境封鎖——與 conftest.guarded_page 同一套規則。"""
    def _abort(route):
        print(f"[journey] 封鎖對正式環境的請求: {route.request.method} {route.request.url}")
        route.abort("failed")

    for pattern in (
        f"https://{cfg.production_ref}.supabase.co/**",
        "https://api.payuni.com.tw/**",
        "https://www.payuni.com.tw/**",
    ):
        context.route(pattern, _abort)


def _build_one(cfg, admin: SupabaseAdmin, user: JourneyUser,
               referral_code: str | None, referrer_name: str | None) -> str:
    """在自己的 Playwright 實例中完成一個節點的註冊＋付款，回傳推薦碼。"""
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            base_url=cfg.base_url,
            locale="zh-TW",
            viewport={"width": 1280, "height": 900},
        )
        _guard_context(context, cfg)
        page = context.new_page()
        page.set_default_timeout(20_000)
        try:
            registration.register_via_gui(
                page, admin, user,
                referral_code=referral_code,
                referrer_name=referrer_name,
            )
            payment.pay_via_gui(page, cfg)
        finally:
            browser.close()

    fetch_backend_landing(admin, user)  # 回填 user_id / referral_code 並斷言落地
    return user.referral_code


def build_tree(cfg, admin: SupabaseAdmin, state: RunState,
               nodes: dict[str, str | None] | None = None,
               progress=print) -> None:
    """把 orgchart 的所有節點建置完成（已完成的跳過）。"""
    nodes = nodes or orgchart.load_nodes()
    levels = orgchart.generation_levels(nodes)
    parallelism = _parallelism()

    for gen_index, level in enumerate(levels):
        pending = [n for n in level if not _is_built(state.users.get(n))]
        if not pending:
            progress(f"[build] 第 {gen_index} 代 {len(level)} 人已完成，跳過")
            continue

        # 主執行緒先備妥所有 user 物件（run_state 寫入單執行緒化）
        for node in pending:
            if node not in state.users:
                state.new_user(node, twid.generate_for_node(state.run_id, node))

        progress(f"[build] 第 {gen_index} 代：{len(pending)} 人待建置（平行 {parallelism}）")
        for start in range(0, len(pending), parallelism):
            wave = pending[start:start + parallelism]
            admin.reset_check_email_rate_limit()

            with ThreadPoolExecutor(max_workers=parallelism) as pool:
                futures = {}
                for node in wave:
                    parent = nodes[node]
                    parent_user = state.users[parent] if parent else None
                    if parent and not _is_built(parent_user):
                        raise RuntimeError(f"{node} 的上線 {parent} 尚未完成——波次順序錯誤")
                    futures[node] = pool.submit(
                        _build_one, cfg, admin, state.users[node],
                        parent_user.referral_code if parent_user else None,
                        parent_user.name if parent_user else None,
                    )
                failures = []
                for node, future in futures.items():
                    try:
                        code = future.result()
                        progress(f"[build]   {node} ✓ 推薦碼 {code}")
                    except Exception as exc:
                        failures.append((node, exc))
                        progress(f"[build]   {node} ✗ {exc}")
            state.save()
            if failures:
                raise RuntimeError(
                    f"第 {gen_index} 代有 {len(failures)} 個節點建置失敗："
                    f"{[n for n, _ in failures]}——修正後以同一 RUN_ID 重跑即可續建"
                )

    missing = [n for n in nodes if not _is_built(state.users.get(n))]
    assert not missing, f"建樹結束仍有節點未完成：{missing}"


def verify_edges(admin: SupabaseAdmin, state: RunState,
                 nodes: dict[str, str | None] | None = None) -> None:
    """斷言 referral_edges 的每條邊都指向 orgchart 宣告的上線。"""
    nodes = nodes or orgchart.load_nodes()
    for node, parent in nodes.items():
        if parent is None:
            continue
        child, expected = state.users[node], state.users[parent]
        edges = admin.rest_select(
            "referral_edges",
            {"select": "referrer_user_id", "referee_user_id": f"eq.{child.user_id}"},
        )
        assert edges, f"{node} 沒有推薦邊"
        actual = edges[0]["referrer_user_id"]
        assert actual == expected.user_id, (
            f"{node} 的推薦邊指向 {actual}，應為 {parent}（{expected.user_id}）"
        )
