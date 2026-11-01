"""route_guards.feature: entitlement redirects (shared steps in common_steps.py)
plus the first-paint header scenarios (T1 auth-state-trust, plan §1.1 S1–S11).

The header scenarios watch the top <nav> from document creation with an init
script: a MutationObserver records every link/button label that ever appeared
there, and a PerformanceObserver sums layout shifts whose sources sit inside it.
"Never showed X" is therefore a statement about the whole page life, not about
the final frame."""

import json

from playwright.sync_api import expect
from pytest_bdd import given, parsers, scenarios, then, when

from config import API_BASE
from mocks.backend_api_mock import build_profile
from mocks.fixtures import seed_authenticated_session
from steps.common_steps import *  # noqa: F401,F403
from mocks.backend_api_mock import build_payuni_response

scenarios("route_guards.feature")

OTHER_USER_ID = "99999999-0000-0000-0000-000000000009"

HEADER_OBSERVER = r"""
(() => {
  const rec = { labels: [], shift: 0, sources: [] };
  window.__header = rec;
  const header = () => document.querySelector('nav:not([aria-label])');
  const scan = () => {
    const nav = header();
    if (!nav) return;
    for (const el of nav.querySelectorAll('a, button')) {
      for (const label of [el.textContent.trim(), el.getAttribute('aria-label') || '']) {
        if (label && !rec.labels.includes(label)) rec.labels.push(label);
      }
    }
  };
  new MutationObserver(scan).observe(document, {
    subtree: true, childList: true, characterData: true, attributes: true,
  });
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const nav = header();
        const inNav = (entry.sources || []).filter((s) => s.node && nav && nav.contains(s.node));
        if (inNav.length) {
          rec.shift += entry.value;
          for (const s of inNav) {
            const n = s.node.nodeType === 1 ? s.node : s.node.parentElement;
            rec.sources.push(`${n.tagName}.${(n.className || '').toString().slice(0, 60)} ` +
              `${JSON.stringify(s.previousRect)}→${JSON.stringify(s.currentRect)}`);
          }
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
})();
"""


def _header(page):
    return page.locator("nav:not([aria-label])")


def _quiet_home(rest_mock):
    # 首頁讀 public_listings；空清單讓頁面安靜下來（頁首斷言與清單無關）。
    rest_mock.set_public_listings([])


# --- Given ---------------------------------------------------------------


@given(parsers.parse('the browser remembers a member hint for "{initial}"'))
def remembers_member_hint(seed_auth_hint, initial):
    seed_auth_hint("member", initial=initial)


@given(parsers.parse('the browser remembers a member hint for "{initial}" from another account'))
def remembers_other_member_hint(seed_auth_hint, initial):
    seed_auth_hint("member", initial=initial, uid=OTHER_USER_ID)


@given(parsers.parse('the browser remembers a funnel hint heading to "{next_kind}"'))
def remembers_funnel_hint(seed_auth_hint, next_kind):
    seed_auth_hint("funnel", initial="", next_kind=next_kind)


@given("the header is being observed")
def header_observed(context, rest_mock):
    _quiet_home(rest_mock)
    context.add_init_script(HEADER_OBSERVER)


@given("the profile request is held", target_fixture="held_profile")
@when("the profile request is held", target_fixture="held_profile")
def hold_profile(context):
    # 後註冊的路由優先：扣住 /profile，release 時 fallback 給先前的 mock 回應。
    held = {"routes": [], "holding": True}

    def handler(route):
        if held["holding"]:
            held["routes"].append(route)
        else:
            route.fallback()

    context.route(f"{API_BASE}/profile**", handler)
    context.route(f"{API_BASE}/auth/profile**", handler)
    return held


@given("profile requests are counted", target_fixture="profile_calls")
def count_profile_calls(context, rest_mock):
    _quiet_home(rest_mock)
    calls = []

    def handler(route):
        calls.append(route.request.url)
        route.fallback()

    context.route(f"{API_BASE}/profile**", handler)
    context.route(f"{API_BASE}/auth/profile**", handler)
    return calls


@given(parsers.parse('trade "{trade_no}" enriches with a successful PayUni payment'))
def enrich_success(api_mock, trade_no):
    api_mock.set_payuni_result(trade_no, "completed", build_payuni_response("SUCCESS", TradeNo=trade_no))


@given(parsers.parse('the profile activates while polling for trade "{trade_no}"'))
def profile_activates_while_polling(api_mock, trade_no):
    # 同 payment_result_steps：前幾次「已付款、待開通」，之後轉有效會員。
    awaiting = build_profile(
        2, accountStatus="expired", paidAwaitingActivation=True, lastTradeNo=trade_no
    )
    # 頁首情境只需要一次轉換：冷啟動拿到待開通、第一次輪詢（約 3 秒）就開通。
    api_mock.set_profile_sequence([awaiting, awaiting, build_profile(3)])


@given(parsers.parse('I am mid-registration awaiting activation for trade "{trade_no}"'))
def mid_registration_awaiting(context, api_mock, rest_mock, trade_no):
    _quiet_home(rest_mock)
    seed_authenticated_session(
        context,
        registration_step=2,
        accountStatus="expired",
        paidAwaitingActivation=True,
        lastTradeNo=trade_no,
    )
    api_mock.set_payuni_result(trade_no, "pending")


@given("I am logged in and the profile is still loading")
def logged_in_profile_loading(context, rest_mock):
    _quiet_home(rest_mock)
    seed_authenticated_session(context, registration_step=1, lastTradeNo=None)
    hold_profile(context)


@given("I am logged in as an admin with pending withdrawals")
def admin_with_pending(context, rest_mock):
    _quiet_home(rest_mock)
    seed_authenticated_session(
        context, registration_step=3, isAdmin=True, accountStatus="active",
        subscriptionEndDate="2027-01-01T00:00:00.000Z",
    )
    context.route(
        f"{API_BASE}/admin/withdrawals/summary**",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"success": True, "data": {"pendingCount": 3, "pendingAmount": 3000}}),
        ),
    )


@given(parsers.parse('I have a pending email verification for "{email}"'))
def pending_email_verification(context, email):
    # 剛註冊、還沒輸入驗證碼：沒有 session，只有 OTP 頁接續用的待驗證紀錄。
    context.add_init_script(
        "localStorage.setItem('pending_otp', "
        f"{json.dumps(json.dumps({'email': email, 'otpType': 'signup'}))});"
    )


@given("I am on a 320px-wide screen")
def screen_320(page):
    page.set_viewport_size({"width": 320, "height": 640})


# --- When ----------------------------------------------------------------


@when("the profile request is released")
def release_profile(held_profile):
    held_profile["holding"] = False
    for route in held_profile["routes"]:
        route.fallback()
    held_profile["routes"].clear()


@when("I reload the page")
def reload_page(page):
    page.reload()


# --- Then ----------------------------------------------------------------


@then(parsers.parse('the header avatar shows "{initial}"'))
def header_avatar_shows(page, initial):
    trigger = _header(page).get_by_role("button", name="開啟會員選單")
    expect(trigger).to_be_visible(timeout=5_000)
    expect(trigger).to_contain_text(initial)


@then("the header shows the member menu")
def header_member_menu(page):
    expect(_header(page).get_by_role("button", name="開啟會員選單")).to_be_visible(timeout=5_000)


@then("the header then switches to the member menu")
def header_switches_to_member_menu(page):
    # PaymentResult 每 3 秒輪詢；開通那次回應之後頭像鈕應立即出現（plan S5：5 秒內）。
    expect(_header(page).get_by_role("button", name="開啟會員選單")).to_be_visible(timeout=10_000)


@then("the header shows the guest links")
def header_guest_links(page):
    expect(_header(page).get_by_role("link", name="登入", exact=True)).to_be_visible(timeout=10_000)
    expect(_header(page).get_by_role("link", name="立即刊登", exact=True)).to_be_visible()


@then("the header shows only a logout button")
def header_only_logout(page):
    header = _header(page)
    expect(header.get_by_role("button", name="登出")).to_be_visible(timeout=10_000)
    expect(header.get_by_role("button")).to_have_count(1)
    # logo 之外沒有任何連結（沒有登入、立即刊登、繼續完成註冊）
    expect(header.get_by_role("link")).to_have_count(1)


@then("the header has a logout button")
def header_has_logout(page):
    expect(_header(page).get_by_role("button", name="登出")).to_be_visible(timeout=10_000)


@then("the header right side is empty")
def header_right_empty(page):
    header = _header(page)
    expect(header.get_by_role("link")).to_have_count(1, timeout=5_000)  # 只有 logo
    expect(header.get_by_role("button")).to_have_count(0)


@then(parsers.parse('the header shows a disabled "{name}" link'))
def header_disabled_link(page, name):
    link = _header(page).get_by_role("link", name=name)
    expect(link).to_be_visible(timeout=5_000)
    expect(link).to_have_attribute("aria-disabled", "true")


@then("the bottom navigation is present")
def bottom_nav_present(page):
    # md:hidden——桌機寬度不可見但已掛載；問的是「首繪就畫了」，不是可見性。
    expect(page.locator('nav[aria-label="主要導覽"]')).to_have_count(1, timeout=5_000)


@then("the bottom navigation is absent")
def bottom_nav_absent(page):
    expect(_header(page).get_by_role("button", name="登出")).to_be_visible(timeout=10_000)
    expect(page.locator('nav[aria-label="主要導覽"]')).to_have_count(0)


@then(parsers.parse('the header never showed "{text}"'))
def header_never_showed(page, text):
    labels = page.evaluate("() => window.__header ? window.__header.labels : null")
    assert labels is not None, "header observer was not installed"
    assert not any(text in label for label in labels), f"header showed {text!r} at some point: {labels}"


@then("the header layout never shifted")
def header_never_shifted(page):
    rec = page.evaluate("() => window.__header")
    assert rec["shift"] == 0, f"header layout shift total = {rec['shift']}: {rec['sources']}"


@then("no profile request was made")
def no_profile_request(page, profile_calls):
    page.wait_for_timeout(500)
    assert profile_calls == [], f"unexpected /profile requests: {profile_calls}"


@then(parsers.parse("the header shows the {version} version"))
def header_shows_version(page, version):
    header = _header(page)
    if version == "guest":
        expect(header.get_by_role("link", name="登入", exact=True)).to_be_visible(timeout=10_000)
    elif version == "placeholder":
        expect(page.get_by_test_id("auth-slot-placeholder")).to_be_attached(timeout=5_000)
    elif version == "logout-only":
        header_only_logout(page)
    elif version == "continue-and-logout":
        expect(header.get_by_role("link", name="繼續完成註冊")).to_be_visible(timeout=10_000)
        expect(header.get_by_role("button", name="登出")).to_be_visible()
    elif version == "member":
        expect(header.get_by_role("link", name="平台管理（待處理 3 筆）")).to_be_visible(timeout=10_000)
        expect(header.get_by_role("button", name="開啟會員選單")).to_be_visible()
    else:
        raise AssertionError(f"unknown header version {version!r}")


@then("the header fits one 64px row")
def header_fits_one_row(page):
    m = page.evaluate(
        """() => {
          const nav = document.querySelector('nav:not([aria-label])');
          const row = nav.firstElementChild;
          const inner = row.getBoundingClientRect();
          const style = getComputedStyle(row);
          const right = inner.right - parseFloat(style.paddingRight);
          const kids = [...row.querySelectorAll(':scope > *, :scope > * > *')]
            .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
          const visible = kids.filter((el) => el.matches('a, button, [data-testid="auth-slot-placeholder"]'));
          const logo = row.querySelector('a[href="/"] img').getBoundingClientRect();
          return {
            logoOverlap: visible
              .filter((el) => !el.contains(row.querySelector('a[href="/"] img')))
              .map((el) => logo.right - el.getBoundingClientRect().left)
              .filter((d) => d > 0.5),
            height: nav.getBoundingClientRect().height,
            tops: visible.map((el) => Math.round(el.getBoundingClientRect().top)),
            overflow: visible.map((el) => el.getBoundingClientRect().right - right).filter((d) => d > 0.5),
          };
        }"""
    )
    assert round(m["height"]) in (64, 65), f"header height {m['height']}"  # 64 + 1px border-b
    assert len(set(m["tops"])) <= 1 or max(m["tops"]) - min(m["tops"]) <= 12, f"wrapped: tops={m['tops']}"
    assert m["overflow"] == [], f"overflowing the row: {m['overflow']}"
    assert m["logoOverlap"] == [], f"controls overlap the logo by {m['logoOverlap']}px"
