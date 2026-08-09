"""步驟 1(email 檢核)送出後的等待——登入與註冊唯一的共用入口。

登入(`login.py`)與註冊(`registration.py`)在這一步做的是**同一件事**:
送出 email、等步驟 2 的控制項出現。差別只有等哪一個 test id。兩邊各寫
一次的話,任何一邊補的防線另一邊都沒有——這正是交接文件記的第二種形狀
(兩份做同一件事的東西默默分岔),所以收斂成一個函式。

失敗時**先產出診斷再決定**:限流(check_email_quota)是已知且可自癒的
測試環境前提,重試一次;其他原因原樣拋出,並把 `dump_page` 的頁面文字
接在訊息後面——`auth-login-button 不出現` 本身指不出任何東西,而畫面上
通常就寫著原因。
"""

from __future__ import annotations

from playwright.sync_api import Page, expect

from builders import check_email_quota
from builders.page_diagnostics import dump_page
from pages.auth_page import AuthPage

# 步驟 1 → 步驟 2 只等一次 API round-trip,5 秒足夠;真的慢到超過 5 秒
# 時我們要的是診斷,不是更長的等待——把逾時拉長只會讓紅燈晚 30 秒到,
# 死因一樣讀不出來。
_STEP2_TIMEOUT_MS = 5_000


def submit_email_and_expect(page: Page, auth: AuthPage, test_id: str) -> None:
    """送出 email 並等步驟 2 的控制項;撞限流時重置配額後重試一次。"""
    target = page.get_by_test_id(test_id)

    auth.submit_email()
    try:
        expect(target).to_be_visible(timeout=_STEP2_TIMEOUT_MS)
        return
    except AssertionError as first:
        diagnostics = dump_page(page, f"check-email-{test_id}")
        if not check_email_quota.looks_rate_limited(diagnostics):
            raise AssertionError(
                f"{first}\n\n送出 email 後步驟 2 沒出現,且畫面上沒有限流訊息"
                f"——不是 check-email 配額用完。\n{diagnostics}"
            ) from first

        # 撞到已知的測試環境前提:配額是全 session 共用的,清掉再送一次。
        check_email_quota.reset()
        auth.submit_email()
        expect(target).to_be_visible(timeout=_STEP2_TIMEOUT_MS)
