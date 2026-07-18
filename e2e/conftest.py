"""Top-level fixtures shared by every feature:

- Boots (and tears down) the Vite dev server for the session unless one is
  already running (e.g. started separately in CI).
- Wires Playwright's `base_url`/`browser_context_args` to this app.
- Installs a network safety net that fails any Supabase/PayUni request a
  scenario forgot to mock, instead of silently hitting production.
- Exposes one fixture per mock helper and per page object so step
  definitions never construct these directly.
"""

import os
import socket
import subprocess
import time
from pathlib import Path

import pytest

from config import BASE_URL, SUPABASE_PROJECT_REF
from mocks.backend_api_mock import BackendApiMock
from mocks.supabase_auth_mock import SupabaseAuthMock
from pages.auth_page import AuthPage
from pages.complete_profile_page import CompleteProfilePage
from pages.dashboard_page import DashboardPage
from pages.forgot_password_page import ForgotPasswordPage
from pages.navbar import Navbar
from pages.otp_page import OtpPage
from pages.reset_password_page import ResetPasswordPage
from pages.payment_checkout_page import PaymentCheckoutPage
from pages.payment_result_page import PaymentResultPage
from pages.reward_page import RewardPage

REPO_ROOT = Path(__file__).resolve().parent.parent

REAL_NETWORK_GUARD_PATTERNS = [
    f"https://{SUPABASE_PROJECT_REF}.supabase.co/**",
    "https://api.payuni.com.tw/**",
]


def _port_open(host: str, port: int) -> bool:
    # socket.connect_ex() combined with settimeout() is flaky on some
    # platforms (observed spuriously returning WSAEWOULDBLOCK on Windows even
    # once a server is listening) — create_connection() uses blocking connect
    # semantics under the hood and doesn't have that failure mode.
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except OSError:
        return False


def _windows_pid_on_port(port: int):
    """`npm run dev` on Windows only runs via a cmd.exe wrapper (shell=True),
    and npm/node don't reliably stay attached to that wrapper's process tree —
    a tree-kill on the wrapper's PID can leave node.exe running. Killing
    whoever actually holds the port is the reliable alternative."""
    try:
        output = subprocess.run(
            ["netstat", "-ano"], capture_output=True, text=True, timeout=5
        ).stdout
    except Exception:
        return None
    needle = f":{port} "
    for line in output.splitlines():
        if "LISTENING" in line and needle in line:
            return line.split()[-1]
    return None


@pytest.fixture(scope="session", autouse=True)
def dev_server():
    """Starts `npm run dev` for the session unless E2E_SKIP_DEV_SERVER is set
    or something is already listening on port 3000."""
    if os.environ.get("E2E_SKIP_DEV_SERVER") or _port_open("localhost", 3000):
        yield
        return

    # On Windows, npm is a .cmd shim that CreateProcess can't resolve without
    # going through a shell (subprocess.Popen(["npm.cmd", ...], shell=False)
    # fails with WinError 2 even when npm is on PATH).
    process = subprocess.Popen(
        "npm run dev",
        cwd=REPO_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=True,
    )
    try:
        # Generous: Vite's first cold start (dependency pre-bundling) can
        # take well over a minute; later runs are much faster.
        for _ in range(120):
            if _port_open("localhost", 3000):
                break
            time.sleep(1)
        else:
            process.terminate()
            raise RuntimeError("Vite dev server did not start on http://localhost:3000 within 120s")
        yield
    finally:
        if os.name == "nt":
            pid = _windows_pid_on_port(3000)
            if pid:
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", pid],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
        else:
            process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture
def browser_context_args(browser_context_args):
    return {
        **browser_context_args,
        "locale": "zh-TW",
        "viewport": {"width": 1280, "height": 900},
    }


@pytest.fixture(autouse=True)
def _block_real_network(context):
    def guard(route):
        print(f"[e2e] blocked unmocked request: {route.request.method} {route.request.url}")
        route.abort("failed")

    for pattern in REAL_NETWORK_GUARD_PATTERNS:
        context.route(pattern, guard)
    yield


# --- Mocks -----------------------------------------------------------------


@pytest.fixture
def auth_mock(context, _block_real_network):
    return SupabaseAuthMock(context)


@pytest.fixture
def api_mock(context, _block_real_network):
    return BackendApiMock(context)


# --- Page objects ------------------------------------------------------------


@pytest.fixture
def auth_page(page):
    return AuthPage(page)


@pytest.fixture
def otp_page(page):
    return OtpPage(page)


@pytest.fixture
def forgot_password_page(page):
    return ForgotPasswordPage(page)


@pytest.fixture
def reset_password_page(page):
    return ResetPasswordPage(page)


@pytest.fixture
def complete_profile_page(page):
    return CompleteProfilePage(page)


@pytest.fixture
def payment_checkout_page(page):
    return PaymentCheckoutPage(page)


@pytest.fixture
def payment_result_page(page):
    return PaymentResultPage(page)


@pytest.fixture
def dashboard_page(page):
    return DashboardPage(page)


@pytest.fixture
def navbar(page):
    return Navbar(page)


@pytest.fixture
def reward_page(page):
    return RewardPage(page)
