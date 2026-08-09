"""admin 主控台的補充 mock：**必須蓋過既有尾綴 glob** 的那幾個端點。

`BackendApiMock._route()` 註冊的是 `{API_BASE}{path}**`。`set_admin_members()`
因此也吃得下 `/admin/members/{id}`——只是回的是**列表形狀**（沒有
`data.member`），元件讀 `detail.availablePoints` 會直接炸。詳情端點要能用，
就得晚一步註冊一條更精確的路由蓋過去（Playwright 以**反向註冊順序**比對
handler，後註冊的先贏）。

放在獨立模組而不是 `BackendApiMock` 的方法，是因為這裡的東西有共同的使用
限制:**呼叫順序有意義**（必須在對應的 `set_admin_*` 之後）。混進那個類別
會讓它看起來和其他順序無關的 setter 一樣安全。
"""

import json

from config import API_BASE


def route_admin_member_detail(context, member_id: str, detail=None) -> None:
    """GET /admin/members/{id} — MemberManagement 的詳情 Sheet。

    **在 `api_mock.set_admin_members(...)` 之後呼叫**，否則列表的 glob 會贏。
    """
    record = detail if detail is not None else build_admin_member_detail()

    def handler(route):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"success": True, "data": {"member": record}}),
        )

    context.route(f"{API_BASE}/admin/members/{member_id}", handler)


def build_admin_member_detail(**overrides) -> dict:
    """`/admin/members/{id}` 的詳情負載（`AdminMemberDetail`）。

    身分證與銀行帳號是**遮罩值**——與正式端點一致（規格書 §13:查詢台是客服
    日常翻閱的地方，翻閱不需要全碼；需要全碼時回提領作業台看）。用完整值當
    測資會讓這份 mock 悄悄比真實端點寬鬆，遮罩相關的版面問題就測不出來。
    """
    detail = {
        "id": "mem-admin-1",
        "name": "陳大文",
        "email": "member@example.com",
        "phone": "0912345678",
        "accountStatus": "active",
        "endDate": "2027-01-01T00:00:00.000Z",
        "availablePoints": 12000,
        "withdrawnPoints": 3000,
        "referrerName": None,
        "directChildCount": 2,
        "idVerificationStatus": "approved",
        "listingCount": 1,
        "idNumber": "A12****789",
        "bankCode": "004",
        "bankAccount": "****901234",
        "recentWithdrawals": [],
    }
    detail.update(overrides)
    return detail
