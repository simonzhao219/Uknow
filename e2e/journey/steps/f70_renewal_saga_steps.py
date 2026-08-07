"""70_renewal_saga.feature 的步驟定義——「阿凱的七年」章節劇本。

cast 獨立於 30 人主樹:orgchart-saga.yaml 不走 tools/orgchart.load_nodes()
的單根管線,由本檔自帶載入;只共用 registration/payment builder 層與
page objects(f60 的 scratch 使用者已有同型先例)。預設推薦人 P0 由
saga 自備:P0 首購後,harness 把它的推薦碼寫入分支的
reward_config.default_referrer_code(僅拋棄式分支的 seed 調整,人審
2026-08-07 裁決)。對 P0 的獎勵斷言一律用事件前後 delta。
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

scenarios("70_renewal_saga.feature")

SAGA_CHART_PATH = Path(__file__).resolve().parent.parent / "orgchart-saga.yaml"


@pytest.fixture(scope="session")
def saga(supabase_admin):
    """saga 級跨情境狀態:名冊、P0 身分、點數快照(marks)。"""
    raise NotImplementedError("階段 2 綠燈實作")


@given("saga 演員名冊與預設推薦人 P0 已就緒")
def saga_roster_ready(saga, journey_config, supabase_admin, run_state):
    raise NotImplementedError("階段 2 綠燈實作")


@when(parsers.parse('saga 演員 "{node}" 不填推薦碼完成首購'))
def saga_purchase_without_code(saga, journey_config, supabase_admin, run_state, node):
    raise NotImplementedError("階段 2 綠燈實作")


@when(parsers.parse('saga 演員 "{node}" 以 "{referrer}" 的推薦碼完成首購'))
def saga_purchase_with_code(saga, journey_config, supabase_admin, run_state, node, referrer):
    raise NotImplementedError("階段 2 綠燈實作")


@then(parsers.parse('"{node}" 的上代在管理台會員詳情顯示為預設推薦人'))
def admin_detail_shows_default_referrer(guarded_page, run_state, saga, node):
    raise NotImplementedError("階段 2 綠燈實作")


@then(parsers.parse('"{node}" 的預設推薦標記已寫入【DB】'))
def default_flag_written(supabase_admin, run_state, node):
    raise NotImplementedError("階段 2 綠燈實作")


@then(parsers.parse('"{node}" 的推薦邊指向 "{referrer}"【DB】'))
def edge_points_to(supabase_admin, run_state, node, referrer):
    raise NotImplementedError("階段 2 綠燈實作")


@then(parsers.parse('"{referrer}" 因 "{node}" 的首購獲得第 {gen:d} 代獎勵【DB】'))
def referrer_rewarded_at_generation(supabase_admin, run_state, reward_amount, referrer, node, gen):
    raise NotImplementedError("階段 2 綠燈實作")


@then(parsers.parse('"{node}" 的任務卡顯示進度 {count:d}/8'))
def task_card_shows_progress(guarded_page, supabase_admin, run_state, node, count):
    raise NotImplementedError("階段 2 綠燈實作")


@then(parsers.parse('預設推薦人本章的點數增量合計 {amount:d}P【DB】'))
def p_delta_since_saga_start(saga, supabase_admin, amount):
    raise NotImplementedError("階段 2 綠燈實作")


@then(parsers.parse('預設推薦人本次事件的點數增量為 {amount:d}P【DB】'))
def p_delta_last_event(saga, supabase_admin, amount):
    raise NotImplementedError("階段 2 綠燈實作")


@then(parsers.parse('"{node}" 於 active 期間開啟付款頁被導回儀表板並顯示訂閱中'))
def active_checkout_redirects_to_dashboard(guarded_page, run_state, node):
    raise NotImplementedError("階段 2 綠燈實作")
