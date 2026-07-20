"""Journey 套件的 harness：打「真的」拋棄式 Supabase 測試分支。

與上層全 mock 套件的關係：
- 這裡有自己的 pytest.ini（rootdir = e2e/journey），confcutdir 停在本層，
  上層 conftest 的網路封鎖 guard 與 3000 埠 dev server 完全不會載入；
- Page Object 仍重用上層 `e2e/pages/`（sys.path 注入）。

安全設計（缺一不可）：
1. 未設定 JOURNEY_* 環境變數 → 需要環境的測試整批 skip（twid 等離線
   單元測試照跑）；
2. project ref 指向正式專案 → 直接 pytest.exit，拒絕執行；
3. 瀏覽器層再擋一次：正式站 Supabase 與正式站 PayUni 網域一律 abort。

Session 結束時（不論成敗）執行 cleanup + 零殘留斷言；第一道保險
「整個分支用完即刪」由 CI workflow 負責（M4）。
"""

from __future__ import annotations

import os
import re
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import pytest

JOURNEY_DIR = Path(__file__).resolve().parent
E2E_DIR = JOURNEY_DIR.parent
REPO_ROOT = E2E_DIR.parent

# 重用上層 pages/（並讓 journey 內部以 tools.* / builders.* 匯入）。
for p in (str(JOURNEY_DIR), str(E2E_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from run_state import RunState  # noqa: E402
from tools.supa import SupabaseAdmin  # noqa: E402


# --- 設定 -------------------------------------------------------------------


def _generated_project_ref() -> str:
    """從自動產生的 info.tsx 讀出正式專案 ref——封鎖名單的單一真相。"""
    text = (REPO_ROOT / "src" / "utils" / "supabase" / "info.tsx").read_text(encoding="utf-8")
    match = re.search(r'projectId\s*=\s*"([a-z0-9]+)"', text)
    return match.group(1) if match else "uhtwwxtazwqnlbejhprl"


@dataclass(frozen=True)
class JourneyConfig:
    project_ref: str
    anon_key: str
    service_role_key: str
    base_url: str
    payment_mode: str        # sandbox | webhook
    run_id: str
    email_domain: str
    card_number: str
    card_expiry: str         # MMYY
    card_cvv: str
    production_ref: str
    anon_key_public: str     # webhook 模式打 Edge Function 用
    payuni_hash_key: str     # webhook 模式：分支的 PAYUNI_TEST_HASH_KEY
    payuni_hash_iv: str      # webhook 模式：分支的 PAYUNI_TEST_HASH_IV


@pytest.fixture(scope="session")
def journey_config() -> JourneyConfig:
    ref = os.environ.get("JOURNEY_SUPABASE_PROJECT_REF")
    anon = os.environ.get("JOURNEY_SUPABASE_ANON_KEY")
    service = os.environ.get("JOURNEY_SUPABASE_SERVICE_ROLE_KEY")
    if not (ref and anon and service):
        pytest.skip(
            "journey 環境未設定：需要 JOURNEY_SUPABASE_PROJECT_REF / "
            "JOURNEY_SUPABASE_ANON_KEY / JOURNEY_SUPABASE_SERVICE_ROLE_KEY"
            "（一律指向拋棄式測試分支，見 journey/README.md）"
        )

    production_ref = _generated_project_ref()
    if ref == production_ref:
        pytest.exit(
            f"JOURNEY_SUPABASE_PROJECT_REF 指向正式專案 {production_ref}——拒絕執行。"
            "journey 測試只能打拋棄式測試分支。",
            returncode=2,
        )

    return JourneyConfig(
        project_ref=ref,
        anon_key=anon,
        service_role_key=service,
        base_url=os.environ.get("JOURNEY_BASE_URL", "http://localhost:3100"),
        payment_mode=os.environ.get("JOURNEY_PAYMENT_MODE", "sandbox"),
        run_id=os.environ.get("JOURNEY_RUN_ID") or time.strftime("j%m%d%H%M"),
        email_domain=os.environ.get("JOURNEY_EMAIL_DOMAIN", "uknow-journey.test"),
        card_number=os.environ.get("JOURNEY_TEST_CARD_NUMBER", "4147631000000001"),
        card_expiry=os.environ.get("JOURNEY_TEST_CARD_EXPIRY", "0131"),
        card_cvv=os.environ.get("JOURNEY_TEST_CARD_CVV", "123"),
        production_ref=production_ref,
        anon_key_public=anon,
        payuni_hash_key=os.environ.get("JOURNEY_PAYUNI_HASH_KEY", ""),
        payuni_hash_iv=os.environ.get("JOURNEY_PAYUNI_HASH_IV", ""),
    )


@pytest.fixture(scope="session")
def supabase_admin(journey_config) -> SupabaseAdmin:
    return SupabaseAdmin(
        project_ref=journey_config.project_ref,
        service_role_key=journey_config.service_role_key,
        anon_key=journey_config.anon_key,
    )


@pytest.fixture(scope="session")
def run_state(journey_config, supabase_admin):
    """RUN_ID 掛載的執行期狀態＋session 收尾的清理與零殘留斷言。"""
    state = RunState(run_id=journey_config.run_id, email_domain=journey_config.email_domain)
    state.save()
    yield state

    if os.environ.get("JOURNEY_KEEP_DATA") == "1":
        print(f"[journey] JOURNEY_KEEP_DATA=1 — 保留 run {state.run_id} 的資料，"
              f"之後請手動執行 tools/cleanup.py --run-id {state.run_id}")
        return
    from tools.cleanup import assert_zero_residue, cleanup_run
    user_ids = cleanup_run(supabase_admin, state.run_id)
    assert_zero_residue(supabase_admin, state.run_id, user_ids)


# --- Dev server（指向測試分支的 Vite）--------------------------------------


def _port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except OSError:
        return False


@pytest.fixture(scope="session")
def dev_server(journey_config):
    """以 VITE_SUPABASE_PROJECT_ID/_ANON_KEY 指向測試分支啟動 Vite。

    預設埠 3100，刻意避開全 mock 套件的 3000——兩套可以同時開著。
    已有東西在聽（或 JOURNEY_SKIP_DEV_SERVER=1）就直接沿用。
    """
    parsed = urlparse(journey_config.base_url)
    host, port = parsed.hostname or "localhost", parsed.port or 80

    if os.environ.get("JOURNEY_SKIP_DEV_SERVER") or _port_open(host, port):
        yield
        return

    env = {
        **os.environ,
        "VITE_SUPABASE_PROJECT_ID": journey_config.project_ref,
        "VITE_SUPABASE_ANON_KEY": journey_config.anon_key,
    }
    process = subprocess.Popen(
        f"npm run dev -- --port {port} --strictPort",
        cwd=REPO_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=True,
    )
    try:
        for _ in range(120):
            if _port_open(host, port):
                break
            time.sleep(1)
        else:
            process.terminate()
            raise RuntimeError(f"Vite dev server 未在 120 秒內於 {journey_config.base_url} 啟動")
        yield
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


# --- Playwright 佈線 --------------------------------------------------------


@pytest.fixture(scope="session")
def base_url():
    # 刻意不依賴 journey_config：pytest-base-url 的 autouse fixture 會對
    # 「每個」測試要求 base_url，若在這裡串 journey_config，連 twid 這種
    # 離線單元測試都會被「環境未設定」整批 skip。
    return os.environ.get("JOURNEY_BASE_URL", "http://localhost:3100")


@pytest.fixture
def browser_context_args(browser_context_args):
    return {
        **browser_context_args,
        "locale": "zh-TW",
        "viewport": {"width": 1280, "height": 900},
    }


@pytest.fixture
def guarded_page(page, dev_server, journey_config):
    """所有 journey 步驟都必須用這個 page：

    - 封鎖正式站 Supabase 與正式站 PayUni（sandbox 網域不在此列，放行）；
    - 打真網路，預設逾時放寬到 20 秒。
    """
    def _abort(route):
        print(f"[journey] 封鎖對正式環境的請求: {route.request.method} {route.request.url}")
        route.abort("failed")

    for pattern in (
        f"https://{journey_config.production_ref}.supabase.co/**",
        "https://api.payuni.com.tw/**",
        "https://www.payuni.com.tw/**",
    ):
        page.context.route(pattern, _abort)

    page.set_default_timeout(20_000)
    return page
