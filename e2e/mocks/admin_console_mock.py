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
    record = detail if detail is not None else build_admin_member_detail(id=member_id)

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

    欄位與契約 `AdminMemberDetailSchema` 一一對應（這份 mock 是唯一沒有型別守護的
    副本，缺欄位時元件會畫出 Invalid Date 之類的假畫面）。兩個由後端推導的欄位
    在這裡也由推導得出，覆寫時不會和真端點分岔：
    - `suspended` 一律等於 `suspendedAt is not None`（後端 `!!suspended_at`）；
    - `idRejectReason` 只在 `idVerificationStatus == "rejected"` 時保留（核准與
      重新送審時後端會清成 null）。
    """
    detail = {
        "id": "mem-admin-1",
        "name": "陳大文",
        "email": "member@example.com",
        "phone": "0912345678",
        "isAdmin": False,
        "suspendedAt": None,
        "createdAt": "2026-07-01T00:00:00.000Z",
        "accountStatus": "active",
        "endDate": "2027-01-01T00:00:00.000Z",
        "idVerificationStatus": "approved",
        "idRejectReason": None,
        "idNumber": "A12****789",
        "bankCode": "004",
        "bankAccount": "****901234",
        "referrerName": None,
        "directChildCount": 2,
        "listingCount": 1,
        "availablePoints": 12000,
        "pendingPoints": 0,
        "withdrawnPoints": 3000,
        "recentWithdrawals": [],
    }
    detail.update(overrides)
    detail["suspended"] = detail["suspendedAt"] is not None
    if detail["idVerificationStatus"] != "rejected":
        detail["idRejectReason"] = None
    return detail


def build_admin_member_withdrawal(**overrides) -> dict:
    """詳情裡的一筆近期提領（`AdminMemberWithdrawal`）。"""
    withdrawal = {
        "id": "wd-1",
        "amount": 1000,
        "fee": 15,
        "status": "pending",
        "note": None,
        "requestedAt": "2026-08-01T00:00:00.000Z",
        "processedAt": None,
        "completedAt": None,
    }
    withdrawal.update(overrides)
    return withdrawal


# 自由文字、後端沒有長度上限的欄位：退件理由（事件備註）與證件退回理由。
# 給一段沒有空白可斷的長字串，量得到「不可斷字串」在 375px 的行為。
_LONG_NOTE = "收款帳號與身分證姓名不符請至會員資料更正後重新申請" + "ABCD1234" * 6
_LONG_ID_REJECT = "證件照片反光模糊無法辨識請於光線充足處重新拍攝正反兩面並確認四角完整入鏡"


def build_worst_case_member_detail(*, name: str, email: str, points: int) -> dict:
    """會員詳情 Sheet 的**最壞但可達**測資：375px 版面量測與溢版巡檢共用。

    長姓名、無空白長 Email、停權＋管理員（身分卡徽章最多）、證件退回＋長理由、
    10 筆提領（SQL 上限，會出尾註）含長退件理由與待查收／已完成的時間列、
    大額點數。短測資下「間距 0」「沒有橫向溢出」在改版前就是綠的，量不到東西。
    """
    statuses = [
        "rejected",
        "awaiting_collection",
        "completed",
        "pending",
        "rejected",
        "completed",
        "awaiting_collection",
        "pending",
        "completed",
        "rejected",
    ]
    # 真端點依 requested_at **降冪**（新的在上，admin_member_detail SQL 的 order by）。
    withdrawals = [
        build_admin_member_withdrawal(
            id=f"wd-{i}",
            amount=8000,
            status=status,
            note=_LONG_NOTE if status == "rejected" else None,
            requestedAt=f"2026-08-{i + 1:02d}T08:30:00.000Z",
            processedAt=None if status == "pending" else f"2026-08-{i + 1:02d}T10:00:00.000Z",
            completedAt=f"2026-08-{i + 2:02d}T09:00:00.000Z" if status == "completed" else None,
        )
        for i, status in enumerate(statuses)
    ][::-1]
    return build_admin_member_detail(
        name=name,
        email=email,
        isAdmin=True,
        suspendedAt="2026-07-20T03:15:00.000Z",
        idVerificationStatus="rejected",
        idRejectReason=_LONG_ID_REJECT,
        referrerName=name,
        directChildCount=128,
        listingCount=12,
        availablePoints=points,
        pendingPoints=points,
        withdrawnPoints=points,
        recentWithdrawals=withdrawals,
    )
