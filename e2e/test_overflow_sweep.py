"""375px 溢字/溢版全路由巡檢（預設 report-only）。

**為什麼不是 .feature**：其他測試都是 pytest-bdd，因為它們描述使用者行為
（「我登入後看到 X」）。這支不是行為，是橫切面巡檢——把每條路由在手機
寬度下畫出來、量一次盒子。硬套 Gherkin 只會得到一份沒人想讀的假場景，
所以走 `pytest.ini` 已經允許的 `test_*.py`。

**為什麼預設不擋 CI**：一上線就硬失敗的品質閘門，會在兩週內被關掉。這支
先跑 report-only：把結果寫成報告存進 `test-results/`（CI 已經會把整個
目錄當 artifact 上傳），讓紅色 baseline 先變成看得見的證據。等 baseline
清乾淨了，設 `E2E_OVERFLOW_STRICT=1` 就會轉成硬失敗——ratchet 機制現在
就內建好，不用之後再改測試。

**測資原則：最壞但可達**。每個欄位取的是產品實際允許的極端值，不是憑空
的長字串——名稱 10 字是 `CreateServiceProvider.tsx` 的硬上限、類別取清單
裡最長的、FB 存的是使用者貼上的原始網址（`contactValidation.ts` 只驗證
不正規化）。用超出產品約束的假資料會做出假紅，反而讓報告不可信。
"""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

import pytest

from mocks.backend_api_mock import (
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
# SERVICE_CATEGORIES 裡最長的兩個之一（utils/constants.ts:50）。
LONGEST_CATEGORY = "各項運動教練"
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


def _setup_admin(context, api_mock, rest_mock):
    _seed_member(context, isAdmin=True)
    api_mock.set_admin_withdrawals(
        [build_admin_withdrawal(status="pending", userName=NAME_CJK_10, amount=BIG_POINTS)]
    )
    api_mock.set_admin_members(
        [build_admin_member(name=NAME_CJK_10, email=LONG_EMAIL, listingCount=3)]
    )
    api_mock.set_admin_announcements([])
    api_mock.set_system_alerts(
        [build_system_alert(message="Edge Function 回應逾時：/rewards/withdraw 連續失敗 5 次")]
    )
    api_mock.set_admin_setup(is_admin=True)


def _setup_complete_profile(context, api_mock, rest_mock):
    _seed_member(context, registration_step=1, accountStatus="expired", name=None)


ROUTES = [
    SweepRoute("/", "首頁（服務者列表）", _setup_home, "/"),
    SweepRoute(
        "/service-providers/11111111-1111-1111-1111-111111111111",
        "服務者詳情",
        _setup_detail,
        "/service-providers/",
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
    SweepRoute("/rewards", "獎勵回饋", _setup_rewards, "/rewards"),
    SweepRoute("/payment/checkout", "付款結帳", _setup_checkout, "/payment/checkout"),
    SweepRoute(
        f"/payment/result?tradeNo={LONG_TRADE_NO}&status=SUCCESS",
        "付款結果",
        _setup_payment_result,
        "/payment/result",
    ),
    SweepRoute("/admin", "平台管理", _setup_admin, "/admin"),
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
        f"- 模式：{'STRICT（會讓 CI 失敗）' if STRICT else 'report-only（不擋 CI）'}",
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
            lines += [head, "", "無發現。", ""]
            continue
        lines += [head, ""]
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
        "- **對話框／下拉／Sheet**：需要點擊才開啟（查收預覽、篩選面板、排序選單等）。",
        "- **極端數值**：點數與推薦人數用的是可達的量級；真要撐爆需要 5 位數以上，",
        "  目前測資到不了（推薦人數由 mock 的清單長度推導）。",
        "- **320px 與字級放大**：本輪只跑 375px 單一軸。",
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
@pytest.mark.parametrize("route", ROUTES, ids=lambda r: r.path)
def test_no_text_overflow_at_375px(page, context, api_mock, rest_mock, overflow_results, route):
    page.set_viewport_size(MOBILE_VIEWPORT)

    if route.setup:
        route.setup(context, api_mock, rest_mock)

    page.goto(route.path)
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
        }
    )

    if route.expect_prefix and not landed.startswith(route.expect_prefix):
        pytest.fail(
            f"路由守衛把 {route.path} 導到 {landed}，這條巡檢沒掃到目標頁面。"
            "請修正 setup 的登入/會籍狀態，否則報告會漏掉這一頁。"
        )

    if STRICT:
        assert not result["findings"], (
            f"{route.label}（{route.path}）有 {len(result['findings'])} 處溢出：\n"
            + "\n".join(
                f"  [{f['kind']} +{f['by']}px] {f['path']}  «{f['text']}»"
                for f in result["findings"]
            )
        )
