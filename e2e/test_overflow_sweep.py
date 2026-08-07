"""375px 溢字/溢版全路由巡檢（逐路由棘輪）。

**為什麼不是 .feature**：其他測試都是 pytest-bdd，因為它們描述使用者行為
（「我登入後看到 X」）。這支不是行為，是橫切面巡檢——把每條路由在手機
寬度下畫出來、量一次盒子。硬套 Gherkin 只會得到一份沒人想讀的假場景，
所以走 `pytest.ini` 已經允許的 `test_*.py`。

**閘門是逐路由的**：一上線就全面硬失敗的品質閘門會在兩週內被關掉，所以
這支曾經是全域 report-only。但那個設計**永遠翻不動**——只要還有任何一條
髒的，整支就得留在 report-only，而已經清乾淨的路由就一直沒有守衛、退化
了也沒人知道。現在改成:沒標 `known_overflow` 的路由**一律硬失敗**，標了
的才暫時放行（並得寫出理由）。清乾淨一條就刪掉它那行，只准往少的方向走。
`E2E_OVERFLOW_STRICT=1` 仍然存在，但它現在是「連已知債務也一併擋」的更嚴
模式，不再是唯一開關。報告一律寫進 `test-results/`（CI 會當 artifact 上傳）。

**測資原則：最壞但可達**。每個欄位取的是產品實際允許的極端值，不是憑空
的長字串——名稱 10 字是 `CreateServiceProvider.tsx` 的硬上限、類別取清單
裡最長的、FB 存的是使用者貼上的原始網址（`contactValidation.ts` 只驗證
不正規化）。用超出產品約束的假資料會做出假紅，反而讓報告不可信。
**反過來也成立**：測資不夠壞、mock 少回欄位讓條件渲染整塊消失、或清單給空的，
都會量出假的乾淨而把一條路由誤標成上鎖。上鎖前的自檢清單見 `README.md`。
"""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

import pytest

from mocks.admin_console_mock import route_admin_member_detail
from mocks.backend_api_mock import (
    build_admin_announcement,
    build_admin_member,
    build_admin_withdrawal,
    build_monthly_king_task,
    build_payuni_response,
    build_pending_free_year_reward,
    build_referral_member,
    build_reward_history_record,
    build_system_alert,
    build_withdrawal_record,
)
from mocks.fixtures import seed_authenticated_session
from mocks.supabase_rest_mock import build_listing, build_public_listing
from overflow_probe import MOBILE_VIEWPORT, cjk_em_ratio, scan_overflow, settle

STRICT = os.environ.get("E2E_OVERFLOW_STRICT") == "1"
REPORT_DIR = Path(__file__).parent / "test-results"

# --- 「最壞但可達」測資 -------------------------------------------------------

# 服務者名稱與真實姓名都硬上限 10 字（CreateServiceProvider.tsx:297、
# formDraft.ts:37）。10 個中日韓字在 text-3xl 下比 10 個拉丁字寬得多，
# 所以中文版才是這裡的最壞情況。
NAME_CJK_10 = "專業美髮師小美工作室"
# Email 來自 Supabase Auth，前端沒有、也不該有長度上限。刻意不含連字號：
# Chrome 只在 "-" 與 "/" 處斷長字，有連字號的 Email 會僥倖不溢出。
LONG_EMAIL = "chienmingchangservice@uknowplatform.com.tw"
# 自訂服務類別上線後，最壞情況不再是內建清單裡最長的那個（「各項運動教練」，
# 6 字）——使用者能自訂到 CUSTOM_CATEGORY_MAX_LENGTH（10 字，
# utils/serviceCategories.ts）。測資原則是「最壞但可達」，所以這裡跟著上限走；
# 內建清單再怎麼變動都不會超過它。
LONGEST_CATEGORY = "寵物美容與行為訓練師"
MANY_DISTRICTS = ["板橋區", "中和區", "永和區", "三重區", "新莊區", "土城區"]
# 使用者從 FB 網址列貼上的原字串。validateFacebook() 會從中抽出
# username（"profile.php"）來驗長度，但存檔存的是整串（含 query），
# 所以顯示端拿到的是長度無上限的字串。
FB_PASTED_URL = "https://www.facebook.com/profile.php?id=61554321098765"
IG_HANDLE = "beautysalon_taipei_official_ig"  # 30 字，validateInstagram 上限
LINE_ID = "beautysalontaipei2026"  # 20 字，validateLine 上限
# description 上限 200 字，但單一 token 可以很長——網址就是這樣進來的。
LONG_DESCRIPTION = (
    "專營各式剪髮染髮護髮與頭皮養護，二十年資歷，提供到府服務與線上預約。"
    "詳細價目與最新優惠請見官方網站 "
    "https://uknowplatform.example.com.tw/providers/beautysalontaipei/pricing "
    "，或直接透過下方聯絡方式與我們聯繫，我們會在一個工作天內回覆您的預約需求。"
)
# 點數是累積值，前端無上限。6 位數對重度推薦者是可達的。
BIG_POINTS = 128460
LONG_TRADE_NO = "UK20260725143012ABC1234567890"
# 身分證照片佔位圖。用 data URI 而非外部檔案，這支才維持「網路全 mock」。
# 856×540 是實體身分證的比例（85.6×54mm）——`w-full h-auto` 的實際高度由
# 內在比例決定，隨便給一張方圖會量到錯的版面高度。
ID_CARD_IMAGE = (
    "data:image/svg+xml;utf8,"
    "%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='856'%20height='540'%3E"
    "%3Crect%20width='856'%20height='540'%20fill='%23d4d4d8'/%3E%3C/svg%3E"
)


def _hostile_public_listing(listing_id: str = "11111111-1111-1111-1111-111111111111") -> dict:
    return build_public_listing(
        listing_id,
        name=NAME_CJK_10,
        category=LONGEST_CATEGORY,
        city="新北市",
        districts=MANY_DISTRICTS,
        description=LONG_DESCRIPTION,
        contacts={"instagram": IG_HANDLE, "line": LINE_ID, "facebook": FB_PASTED_URL},
    )


def _hostile_listing() -> dict:
    return build_listing(
        name=NAME_CJK_10,
        category=LONGEST_CATEGORY,
        city="新北市",
        districts=MANY_DISTRICTS,
        description=LONG_DESCRIPTION,
        contacts={"instagram": IG_HANDLE, "line": LINE_ID, "facebook": FB_PASTED_URL},
    )


def _seed_member(context, **profile_overrides):
    defaults = dict(
        registration_step=3,
        email=LONG_EMAIL,
        name=NAME_CJK_10,
        accountStatus="active",
        referralCode="UK8K3M9Q2X",
        referralProgramJoined=True,
    )
    defaults.update(profile_overrides)
    step = defaults.pop("registration_step")
    return seed_authenticated_session(context, registration_step=step, **defaults)


# --- 路由表 -------------------------------------------------------------------


@dataclass
class SweepRoute:
    path: str
    label: str
    setup: Optional[Callable] = None
    # 導頁後預期停留的路徑前綴；不符代表被守衛導走了，掃到的不是目標頁面。
    expect_prefix: Optional[str] = None
    tags: list = field(default_factory=list)
    # 導頁後的必要互動（page → None）。被動載入只畫得到預設狀態，tab 介面
    # 的其他面板從未被畫出來過——沒畫出來就量不到，報告會看起來比實際乾淨。
    # 只放「切換到另一個持久畫面」這種互動；一次性彈出物（對話框、toast）
    # 仍在盲區，見報告文末。
    after_load: Optional[Callable] = None
    # 已知未清的溢出：值是「為什麼還沒清」。**非空 = 這條路由暫時不硬失敗**。
    #
    # 這是逐路由棘輪，取代原本「全域 STRICT 一翻全翻」的全有全無：沒有這個
    # 欄位的路由**一律硬失敗**，不管全域開關。理由是全域開關永遠翻不動——
    # 只要還有任何一條髒的，整支就得留在 report-only，而已經清乾淨的路由
    # 就一直沒有守衛，退化了也沒人知道。
    #
    # 清乾淨後把這一行刪掉。只准往少的方向走。
    known_overflow: Optional[str] = None

    def hard_fails(self) -> bool:
        """這條路由的發現要不要讓 CI 紅。"""
        return STRICT or self.known_overflow is None


def _setup_home(context, api_mock, rest_mock):
    rest_mock.set_public_listings(
        [
            _hostile_public_listing("11111111-1111-1111-1111-11111111100%d" % i)
            for i in range(1, 5)
        ]
    )


def _setup_detail(context, api_mock, rest_mock):
    rest_mock.set_public_listing(_hostile_public_listing())


def _setup_dashboard(context, api_mock, rest_mock):
    _seed_member(context)
    rest_mock.set_user_listing(_hostile_listing())


def _setup_listing_mgmt(context, api_mock, rest_mock):
    _seed_member(context)
    rest_mock.set_user_listing(_hostile_listing())


def _setup_listing_create(context, api_mock, rest_mock):
    _seed_member(context)
    rest_mock.set_user_listing(None)


def _setup_listing_edit(context, api_mock, rest_mock):
    _seed_member(context)
    rest_mock.set_user_listing(_hostile_listing())
    rest_mock.set_listing_by_id(_hostile_listing())


def _setup_referrals(context, api_mock, rest_mock):
    _seed_member(context)
    api_mock.set_referral_tree(
        first_generation=[
            build_referral_member(NAME_CJK_10),
            build_referral_member("王大明"),
        ],
        second_generation=[build_referral_member("李小華")] * 3,
        third_generation=[build_referral_member("張美玲")] * 2,
        user_referral_code="UK8K3M9Q2X",
    )


def _setup_tasks(context, api_mock, rest_mock):
    _seed_member(context)
    api_mock.set_task_center(
        tasks=[build_monthly_king_task(current=8, hasUnclaimedReward=True, unclaimedRewardCount=1)],
        pending_rewards=[
            build_pending_free_year_reward(
                description="2026 年 7 月推薦王任務達成獎勵（單月推薦滿 8 人）"
            )
        ],
    )


def _setup_rewards(context, api_mock, rest_mock):
    _seed_member(context)
    api_mock.set_reward_dashboard(
        available=BIG_POINTS,
        pending=BIG_POINTS // 3,
        withdrawn=BIG_POINTS // 2,
        total_earned=BIG_POINTS * 2,
        withdrawals=[build_withdrawal_record(status="awaiting_collection", amount=BIG_POINTS)],
        history=[
            build_reward_history_record(
                amount=BIG_POINTS,
                balance=BIG_POINTS * 2,
                description=f"一代推薦 - {NAME_CJK_10}",
            ),
            build_reward_history_record(
                source_category="withdrawal",
                amount=-BIG_POINTS,
                balance=BIG_POINTS,
                description="點數提領",
                generation=None,
            ),
        ],
    )


def _setup_checkout(context, api_mock, rest_mock):
    # 待付款會員（registrationStep 2）：PaymentCheckout 的註冊資訊確認區
    # 就是渲染這份 profile 的地方。
    _seed_member(context, registration_step=2, accountStatus="expired", referredByCode="UK8K3M9Q2X")


def _setup_payment_result(context, api_mock, rest_mock):
    _seed_member(context)
    api_mock.set_payuni_result(
        LONG_TRADE_NO,
        "completed",
        build_payuni_response(
            "SUCCESS",
            TradeNo=LONG_TRADE_NO,
            AuthBankName="台北富邦商業銀行股份有限公司",
            AuthAmt="1,200",
        ),
    )


def _setup_admin(context, api_mock, rest_mock, *, alerts=None):
    _seed_member(context, isAdmin=True)
    api_mock.set_admin_withdrawals(
        [
            build_admin_withdrawal(
                status="pending",
                userName=NAME_CJK_10,
                amount=BIG_POINTS,
                # 身分證照片對話框的最壞情況是**兩張圖都在**（雙欄並排）。
                # 留 None 只會量到「未上傳」的文字佔位，比真實情況窄得多。
                idCardFrontUrl=ID_CARD_IMAGE,
                idCardBackUrl=ID_CARD_IMAGE,
                events=[
                    {
                        "fromStatus": "pending",
                        "toStatus": "awaiting_collection",
                        "byAdmin": True,
                        "note": "已於網銀轉出，交易序號如下",
                        "bankRef": "TXN20260725143012ABC1234567890",
                        "createdAt": "2026-07-25T14:30:12.000Z",
                    }
                ],
            )
        ]
    )
    api_mock.set_admin_members(
        [build_admin_member(name=NAME_CJK_10, email=LONG_EMAIL, listingCount=3)]
    )
    # 詳情 Sheet 用；**必須在 set_admin_members 之後**（見該模組的 docstring：
    # 列表的尾綴 glob 也吃得下詳情 URL，只是回錯形狀）。
    route_admin_member_detail(context, "mem-admin-1")
    # 空清單只會渲染「尚無公告」——公告列一列裡有標題＋三顆 Badge＋刪除鍵
    # （SystemNotifications.tsx:242-266），不給資料等於那一列從未被量過。
    # title/message 後端都沒有長度上限（api/index.ts:1670-1671），實務上
    # 公告內文會貼網址，長 token 不斷行。
    api_mock.set_admin_announcements(
        [
            build_admin_announcement(
                title="系統維護預告：2026/08/15 02:00-06:00 全站停機",
                message=(
                    "維護期間無法登入與付款，造成不便敬請見諒。詳細影響範圍請見 "
                    "https://www.uknowplatform.com.tw/announcements/2026-08-maintenance"
                ),
                type="error",
                endsAt="2026-08-15T06:00:00.000Z",
            )
        ]
    )
    api_mock.set_system_alerts(
        alerts
        or [build_system_alert(message="Edge Function 回應逾時：/rewards/withdraw 連續失敗 5 次")]
    )
    # 管理員設置分頁的最壞但可達測資。Email 來自 Supabase Auth（無長度上限），
    # 姓名吃 10 字上限，兩者在 `flex justify-between` 的同一列裡與固定寬的
    # 標籤搶空間（AdminSetup.tsx:147-163）。
    api_mock.set_admin_setup(is_admin=True, user_name=NAME_CJK_10, user_email=LONG_EMAIL)


def _setup_admin_alerts(context, api_mock, rest_mock):
    """系統告警 tab 的最壞但可達測資。message 與 context 都由後端寫入、
    長度無上限（context 是 jsonb），這串取自正式站實際出現過的
    time_domain_backfill 告警——欄位數再多一點就是它。"""
    _setup_admin(
        context,
        api_mock,
        rest_mock,
        alerts=[
            build_system_alert(
                source="time_domain_backfill",
                severity="info",
                message=(
                    "backfill 完成：orders=0, subscriptions=0, 效期縮短=0，"
                    "未偵測到需要人工介入的資料，下次排程於 2026-07-26 09:00 再次執行"
                ),
                context={
                    "shrunk_count": 0,
                    "subs_updated": 0,
                    "orders_updated": 0,
                    "shrunk_subscription_ids": [],
                },
            )
        ],
    )


def _open_system_alerts_tab(page):
    page.get_by_role("tab", name="系統告警").click()


# 其餘 admin 分頁與彈出物的掛鉤。契約與上面那個一致：**掛鉤只做動作，
# 靜置交給測試本體**（本體在 after_load 之後會 settle 一次）——掛鉤自己再
# settle 一次只是白等。唯一的例外是需要「等前一步畫出來才點得到下一步」的
# 多步掛鉤，那種在步驟之間自己 settle。


def _open_tab(name: str):
    def go(page):
        page.get_by_role("tab", name=name).click()

    return go


def _open_id_card_dialog(page):
    page.get_by_role("button", name="查看", exact=True).first.click()


def _open_history_dialog(page):
    page.get_by_role("button", name="查看歷史").first.click()


def _open_member_detail_sheet(page):
    page.get_by_role("tab", name="會員管理").click()
    # 這一步的 settle 不能省：列表要先畫出來，才點得到「查看」。
    settle(page)
    page.get_by_role("button", name="查看").first.click()


def _setup_complete_profile(context, api_mock, rest_mock):
    _seed_member(context, registration_step=1, accountStatus="expired", name=None)


ROUTES = [
    SweepRoute("/", "首頁（服務者列表）", _setup_home, "/"),
    SweepRoute(
        "/service-providers/11111111-1111-1111-1111-111111111111",
        "服務者詳情",
        _setup_detail,
        "/service-providers/",
        known_overflow="description 內的長網址與貼上的 FB 原始網址不斷行（+311px／+204px）",
    ),
    SweepRoute("/login", "登入", None, "/login"),
    SweepRoute("/register", "註冊", None, "/register"),
    SweepRoute("/forgot-password", "忘記密碼", None, "/forgot-password"),
    SweepRoute("/terms-of-service", "服務條款", None, "/terms-of-service"),
    SweepRoute("/listing-plans", "刊登方案", None, "/listing-plans"),
    SweepRoute("/referral-reward-rules", "推廣獎勵規章", None, "/referral-reward-rules"),
    SweepRoute("/referral-reward-contract", "推廣獎勵契約", None, "/referral-reward-contract"),
    SweepRoute("/auth/complete-profile", "完成會員資料", _setup_complete_profile, None),
    SweepRoute("/dashboard", "會員中心", _setup_dashboard, "/dashboard"),
    SweepRoute("/service-providers", "刊登管理", _setup_listing_mgmt, "/service-providers"),
    SweepRoute("/service-providers/create", "建立刊登", _setup_listing_create, "/service-providers/create"),
    SweepRoute(
        "/service-providers/edit/11111111-1111-1111-1111-111111111111",
        "編輯刊登",
        _setup_listing_edit,
        "/service-providers/edit/",
    ),
    SweepRoute("/referrals", "推薦管理", _setup_referrals, "/referrals"),
    SweepRoute("/tasks", "任務中心", _setup_tasks, "/tasks"),
    SweepRoute(
        "/rewards",
        "獎勵回饋",
        _setup_rewards,
        "/rewards",
        known_overflow="六位數點數在統計卡兩欄佈局下溢出 4px",
    ),
    SweepRoute(
        "/payment/checkout",
        "付款結帳",
        _setup_checkout,
        "/payment/checkout",
        known_overflow="長 Email 不斷行（+80px）",
    ),
    SweepRoute(
        f"/payment/result?tradeNo={LONG_TRADE_NO}&status=SUCCESS",
        "付款結果",
        _setup_payment_result,
        "/payment/result",
        known_overflow="29 字訂單編號不斷行（+55px）",
    ),
    SweepRoute(
        "/admin",
        "平台管理",
        _setup_admin,
        "/admin",
        known_overflow="工具列未換行（篩選+2 鍵+筆數擠一列，+95px）與統計卡六位數金額"
        "（+13px）；待 platform-admin-rwd 的 P3 處置",
    ),
    # 同一條路由掃第二次：Radix Tabs 只掛載 active 面板，預設 tab 之外的
    # 內容不切過去就不存在於 DOM。系統告警的「詳細資訊」欄放的是 jsonb 原文，
    # 是這個 console 裡唯一長度無上限的欄位。
    SweepRoute(
        "/admin",
        "平台管理 · 系統告警",
        _setup_admin_alerts,
        "/admin",
        tags=["system-alerts"],
        after_load=_open_system_alerts_tab,
        # 這條測資（正式站真實的 time_domain_backfill 告警）一量就爆，而換成
        # 一句短訊息時是 0 發現——**「測資是最壞但可達」反過來也成立：測資
        # 不夠壞會量出假的乾淨**。`Table` 原語的每個 td 都帶 whitespace-nowrap
        # （`ui/table.tsx:86`），裡面的 jsonb 原文因此斷不了行。
        known_overflow="系統告警的 context jsonb 原文在 whitespace-nowrap 的 td 裡"
        "不斷行（+294px）；待 platform-admin-rwd 的 P10 處置",
    ),
    # 其餘 admin 分頁與彈出物。報告以 label+path 呈現、results 是 list，
    # 重複 path 不會互相覆蓋；pytest 的 id 則靠 tags 區分。
    SweepRoute(
        "/admin",
        "平台管理 · 會員管理",
        _setup_admin,
        "/admin",
        tags=["members"],
        after_load=_open_tab("會員管理"),
        # 只有 +9px 的 CardHeader（標題與搜尋框擠一列）。8 欄表格**量不到**
        # ——它在 Table 原語的 overflow-x-auto 裡捲動，探針刻意不報那種（明示
        # 要捲動 = 有意為之）。「要橫向捲才讀得完一列」是可用性問題，不是
        # 溢出，這支永遠測不出來，別誤以為它有守住。
        known_overflow="標題與搜尋框擠一列（+9px）；待 platform-admin-rwd 的 P8 處置",
    ),
    SweepRoute(
        "/admin",
        "平台管理 · 公告管理",
        _setup_admin,
        "/admin",
        tags=["announcements"],
        after_load=_open_tab("公告管理"),
        # 同上：這條先前也是靠空清單「上鎖」的。公告內文沒有 break-words，
        # 貼一條網址就撐破（SystemNotifications.tsx:263）。規劃書 §4.0 的
        # P1–P14 沒有這一項——是補齊測資之後才浮現的新證據。
        known_overflow="公告內文的網址不斷行（+153px）；待 platform-admin-rwd 處置",
    ),
    SweepRoute(
        "/admin",
        "平台管理 · 管理員設置",
        _setup_admin,
        "/admin",
        tags=["admin-setup"],
        after_load=_open_tab("管理員設置"),
        # 這條先前是「上鎖」的——但 set_admin_setup 少回 userName，而
        # AdminSetup.tsx:146 拿它當渲染條件，整個帳號資訊區塊從未進 DOM。
        # 補齊後端真正會回的三欄（api/index.ts:1725-1727）之後才顯形。
        known_overflow="Email 與標籤在 flex justify-between 的同一列裡不換行"
        "（+119px）；待 platform-admin-rwd 處置",
    ),
    SweepRoute(
        "/admin",
        "平台管理 · 身分證照片對話框",
        _setup_admin,
        "/admin",
        tags=["id-card-dialog"],
        after_load=_open_id_card_dialog,
        # 量到的是**底下那頁**的債務，不是對話框自己的。對話框本身沒有溢出
        # ——`w-full` 在 fixed 元素上已依視窗定寬 375px，`max-w-3xl`(768px)
        # 比它大所以不生效。真正的退化是失去 calc(100%-2rem) 的安全邊距、
        # 貼齊螢幕邊緣，而那要量盒子才看得到 → test_admin_mobile_layout.py。
        known_overflow="繼承提領分頁的工具列/統計卡溢出（對話框自身無溢出）",
    ),
    SweepRoute(
        "/admin",
        "平台管理 · 轉換歷史對話框",
        _setup_admin,
        "/admin",
        tags=["history-dialog"],
        after_load=_open_history_dialog,
        # 探針掃整份 document 而不是只掃對話框，這是刻意的——使用者看到的是
        # 整個視窗，開著對話框時底下畫壞了一樣是畫壞了。代價是開在提領分頁
        # 之上的對話框都會繼承該頁的債務，兩邊要一起清才能上鎖。
        known_overflow="繼承提領分頁的工具列/統計卡溢出（對話框自身無溢出）",
    ),
    SweepRoute(
        "/admin",
        "平台管理 · 會員詳情 Sheet",
        _setup_admin,
        "/admin",
        tags=["member-sheet"],
        after_load=_open_member_detail_sheet,
        known_overflow="繼承會員管理分頁的標題列溢出（Sheet 自身無溢出）",
    ),
]

# 沒掃到的路由要寫出來，不能靜默略過——「報告沒提到」和「掃過沒問題」
# 是兩件事，混在一起會讓 baseline 看起來比實際乾淨。
SKIPPED_ROUTES = [
    ("/auth/verify-otp", "需要 signup 流程留在 localStorage 的待驗證 email，直接導頁會被導走"),
    ("/auth/reset-password", "需要 Supabase recovery token（只能從信件連結進入）"),
]


# --- 報告蒐集 -----------------------------------------------------------------


@pytest.fixture(scope="session")
def overflow_results():
    results = []
    yield results
    _write_report(results)


def _write_report(results):
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    total = sum(len(r["findings"]) for r in results)

    lines = [
        "# 375px 溢字/溢版巡檢報告",
        "",
        f"- 視窗寬度：{MOBILE_VIEWPORT['width']}px",
        f"- 掃描路由：{len(results)} 條（另有 {len(SKIPPED_ROUTES)} 條未掃，見文末）",
        f"- 發現總數：**{total}**",
        f"- 上鎖路由：**{sum(1 for r in results if r['hardFails'])} / {len(results)}** 條"
        "（沒有 `known_overflow` 的一律硬失敗，退化會直接讓 CI 紅）",
        f"- 已知債務：{sum(1 for r in results if r['knownOverflow'])} 條"
        "（逐條列在下方，清乾淨後刪掉該行 `known_overflow`）",
        f"- 全域 STRICT：{'開（連已知債務也一併擋）' if STRICT else '關'}",
        f"- 中文字寬：{results[0]['cjkEmRatio'] if results else '?'}em"
        "（應為 1.0；跨環境比對 baseline 時先確認這個值一致）",
        "",
        "訊號說明：`horizontal` 內容比框寬｜`vertical` 固定高度容器內文字被切"
        "｜`viewport-escape` fixed 元素超出視窗。",
        "",
    ]

    for r in sorted(results, key=lambda x: -len(x["findings"])):
        head = f"## {r['label']} — `{r['path']}`"
        if not r["findings"]:
            lines += [head, "", "無發現（🔒 已上鎖）。" if r["hardFails"] else "無發現。", ""]
            continue
        lines += [head, ""]
        if r["knownOverflow"]:
            lines += [f"> 🏷 已知債務（不擋 CI）：{r['knownOverflow']}", ""]
        if r["landed"] != r["path"]:
            lines += [f"> ⚠ 導頁後停在 `{r['landed']}`，掃到的可能不是目標頁面。", ""]
        if r["pageHorizontalScroll"]:
            lines += [f"> 整頁出現橫向捲軸：超出 {r['pageHorizontalScroll']}px。", ""]
        lines += ["| 訊號 | 超出 | 元素 | 文字 |", "|---|---|---|---|"]
        for f in r["findings"]:
            text = f["text"].replace("|", "\\|")
            path = f["path"].replace("|", "\\|")
            lines.append(f"| {f['kind']} | {f['by']}px | `{path}` | {text} |")
        lines.append("")

    lines += ["## 未掃描的路由", ""]
    for path, reason in SKIPPED_ROUTES:
        lines.append(f"- `{path}` — {reason}")

    # 「報告沒提到」不等於「掃過沒問題」。這支只做被動載入，以下狀態天生
    # 不在覆蓋範圍內——不寫出來的話，baseline 會看起來比實際乾淨。
    lines += [
        "",
        "## 已知盲區（這支掃不到）",
        "",
        "- **Toast**：要有操作才會出現，被動載入頁面掃不到。",
        "- **未接 `after_load` 的 tab 面板／對話框／下拉／Sheet**：Radix Tabs 只掛載",
        "  active 面板，切不過去就不在 DOM 裡；對話框與下拉要點擊才開啟",
        "  （查收預覽、篩選面板、排序選單等）。`after_load` 已讓這類畫面**可以**",
        "  納入巡檢（/admin 的四個非預設 tab、身分證對話框、轉換歷史、會員詳情",
        "  Sheet 都已接上），但沒有明確加進 `ROUTES` 的仍然掃不到——**能掃不等於掃了**。",
        "  Select/DropdownMenu 的 popover 目前沒有任何 ROUTES 覆蓋。",
        "- **admin 的證件審核次分頁**：需要 `/admin/id-reviews` 的 mock，尚未建。",
        "- **表格的橫向捲動不算溢出**：`Table` 原語自帶 `overflow-x-auto`，明示要捲動",
        "  ＝有意為之。「要橫向捲才讀得完一列」是可用性問題，這支測不出來。但單一",
        "  儲存格裡斷不了行的長字串照樣會報（每個 td 都帶 `whitespace-nowrap`）。",
        "- **極端數值**：點數與推薦人數用的是可達的量級；真要撐爆需要 5 位數以上，",
        "  目前測資到不了（推薦人數由 mock 的清單長度推導）。",
        "- **320px 與字級放大**：本輪只跑 375px 單一軸。",
        "- **正向版面斷言**：這支只量「有沒有溢出」，不量「該長成什麼樣」",
        "  （分頁標籤是否排成兩列、對話框是否留有安全邊距）。那類期望走",
        "  `layout_probe.py`，寫在 `test_admin_mobile_layout.py`。",
        "",
    ]

    (REPORT_DIR / "overflow-report.md").write_text("\n".join(lines), encoding="utf-8")
    (REPORT_DIR / "overflow-report.json").write_text(
        json.dumps({"viewport": MOBILE_VIEWPORT, "strict": STRICT, "routes": results},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\n[overflow-sweep] {total} finding(s) across {len(results)} route(s)")
    print(f"[overflow-sweep] report: {REPORT_DIR / 'overflow-report.md'}")


# --- 巡檢 ---------------------------------------------------------------------


@pytest.mark.compatibility
@pytest.mark.parametrize(
    "route",
    ROUTES,
    # 同一條 path 可以掃多次（不同 tab），用 tag 區分才不會得到 /admin0、/admin1。
    ids=lambda r: r.path if not r.tags else f"{r.path}#{r.tags[0]}",
)
def test_no_text_overflow_at_375px(page, context, api_mock, rest_mock, overflow_results, route):
    page.set_viewport_size(MOBILE_VIEWPORT)

    if route.setup:
        route.setup(context, api_mock, rest_mock)

    page.goto(route.path)
    settle(page)

    if route.after_load:
        route.after_load(page)
        settle(page)

    # 地基檢查:全站文案是中文，所有溢出數字都建立在中文字寬上。字沒有以
    # 全形畫出來，量到的就不是這個 app 在真實裝置上的樣子。這條是硬失敗、
    # 不受 report-only 影響——量測工具本身壞掉時,報告不該還裝作有效。
    ratio = cjk_em_ratio(page)
    assert 0.95 <= ratio <= 1.05, (
        f"這台機器的中文字寬是 {ratio:.2f}em（應為 1.00em）——中文沒有以全形寬度"
        "畫出來，量到的溢出數字不能代表真實裝置，baseline 不可信。"
        "請確認有裝中文字型（Debian/Ubuntu:fonts-wqy-zenhei 或 fonts-noto-cjk）。"
    )

    result = scan_overflow(page)
    landed = page.url.split("localhost:3000", 1)[-1] or "/"

    overflow_results.append(
        {
            "path": route.path,
            "label": route.label,
            "landed": landed,
            "findings": result["findings"],
            "pageHorizontalScroll": result["pageHorizontalScroll"],
            # 記在報告裡:所有數字都是以這個字寬量出來的。跨環境比對 baseline
            # 時，先看這個值是否一致，再看發現數量。
            "cjkEmRatio": round(ratio, 3),
            "knownOverflow": route.known_overflow,
            "hardFails": route.hard_fails(),
        }
    )

    if route.expect_prefix and not landed.startswith(route.expect_prefix):
        pytest.fail(
            f"路由守衛把 {route.path} 導到 {landed}，這條巡檢沒掃到目標頁面。"
            "請修正 setup 的登入/會籍狀態，否則報告會漏掉這一頁。"
        )

    if route.hard_fails():
        assert not result["findings"], (
            f"{route.label}（{route.path}）有 {len(result['findings'])} 處溢出：\n"
            + "\n".join(
                f"  [{f['kind']} +{f['by']}px] {f['path']}  «{f['text']}»"
                for f in result["findings"]
            )
        )
