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
        "referralCode": "8048876",
        "referralProgramJoined": True,
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
    10 筆提領（SQL 上限，會出尾註）含長備註與待查收／已完成的時間列、
    大額點數。短測資下「間距 0」「沒有橫向溢出」在改版前就是綠的，量不到東西。

    `note` 是該筆最新事件的備註，**任何狀態都可能有**：退件理由、匯款備註、代為完成
    的必填原因。代為完成（pending 直接標已完成）沒有匯款那一步，`processedAt` 是 null。
    """
    # (狀態, 有沒有長備註, 是不是代為完成)
    rows = [
        ("rejected", True, False),
        ("awaiting_collection", True, False),
        ("completed", True, True),
        ("pending", False, False),
        ("rejected", True, False),
        ("completed", False, False),
        ("awaiting_collection", False, False),
        ("pending", False, False),
        ("completed", True, False),
        ("rejected", True, False),
    ]
    # 真端點依 requested_at **降冪**（新的在上，admin_member_detail SQL 的 order by）。
    withdrawals = [
        build_admin_member_withdrawal(
            id=f"wd-{i}",
            amount=8000,
            status=status,
            note=_LONG_NOTE if long_note else None,
            requestedAt=f"2026-08-{i + 1:02d}T08:30:00.000Z",
            processedAt=(
                None
                if status == "pending" or proxy_completed
                else f"2026-08-{i + 1:02d}T10:00:00.000Z"
            ),
            completedAt=f"2026-08-{i + 2:02d}T09:00:00.000Z" if status == "completed" else None,
        )
        for i, (status, long_note, proxy_completed) in enumerate(rows)
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


# --- 後台推薦樹（第 6 波 S3a）---------------------------------------------------------
# 欄位與契約 `admin-referral-contract.ts` 一一對應（這份 mock 沒有型別守護）。測資取最壞
# 但可達：長姓名、多徽章、深層級、收獎人不符與無法判定的付款卡（每代三行）。

_TREE_NAME = "專業美髮師小美工作室ABCDEFGHIJKLMNOP"


def build_referral_tree_node(**overrides) -> dict:
    node = {
        "id": "tree-node-1",
        "name": _TREE_NAME,
        "referralCode": "8048876",
        "layer": 7,
        "directCount": 128,
        "status": "expiring",
        "daysToExpiry": 12,
        "endDate": "2026-11-20T15:59:59.000Z",
        "referralProgramJoined": True,
        "referralProgramJoinedAt": "2026-10-01T00:00:00.000Z",
        "anomalyKinds": ["missing_reward", "recipient_mismatch"],
        "anomalyScanTruncated": True,
    }
    node.update(overrides)
    return node


def _gen(generation: int, result: str, **overrides) -> dict:
    row = {
        "generation": generation,
        "result": result,
        "reason": None,
        "expectedId": f"exp-{generation}",
        "expectedName": _TREE_NAME,
        "actualId": f"act-{generation}",
        "actualName": _TREE_NAME,
        "actualAmount": 100,
    }
    row.update(overrides)
    return row


def build_referral_member_audit(node: dict) -> dict:
    return {
        "node": node,
        "upline": [
            {"id": f"up-{i}", "name": _TREE_NAME, "referralCode": f"80488{i:02d}"}
            for i in range(6)
        ],
        "uplineStatus": "truncated",
        "rewards": {
            "byGeneration": {"g1": 1234500, "g2": 234500, "g3": 34500},
            "available": 1503500,
            "totalEarned": 1503500,
        },
        "tasks": {
            "monthKey": "2026-11",
            "monthlyCount": 7,
            "threshold": 8,
            "creditsUnclaimed": 3,
            "creditsClaimed": 12,
        },
        "withdrawals": {
            "pendingAmount": 8000,
            "awaitingCollectionAmount": 8000,
            "completedAmount": 1200000,
        },
        "referrerHistory": {
            "pastReferrers": [
                {"id": f"past-{i}", "name": _TREE_NAME, "referralCode": None} for i in range(3)
            ],
            "freshEvents": [
                {
                    "completedAt": "2026-10-15T02:00:00.000Z",
                    "newReferrerId": "past-0",
                    "newReferrerName": _TREE_NAME,
                    "effective": "confirmed",
                },
                {
                    "completedAt": "2026-09-01T02:00:00.000Z",
                    "newReferrerId": "past-1",
                    "newReferrerName": _TREE_NAME,
                    "effective": "unknown",
                },
            ],
        },
        "referrerMismatch": True,
        "anomalies": ["missing_reward", "recipient_mismatch", "cycle", "ledger_mismatch"],
        "paymentSummary": {"missingCount": 2, "mismatchCount": 1},
    }


def build_referral_payments() -> dict:
    items = [
        {
            "kind": "payment",
            "eventId": "ev-1",
            "at": "2026-11-01T02:00:00.000Z",
            "subscriptionId": "sub-1",
            "claimId": None,
            "generations": [
                _gen(1, "recipient_mismatch", actualId="other", actualName=_TREE_NAME + "他人"),
                _gen(2, "missing", actualId=None, actualName=None, actualAmount=None),
                _gen(3, "undeterminable", reason="changed_after"),
            ],
        },
        {
            "kind": "claim",
            "eventId": "ev-2",
            "at": "2026-10-01T02:00:00.000Z",
            "subscriptionId": None,
            "claimId": "claim-1",
            "generations": [
                _gen(1, "paid"),
                _gen(2, "cycle_stopped", expectedId=None, expectedName=None, actualId=None,
                     actualName=None, actualAmount=None),
                _gen(3, "cycle_stopped", expectedId=None, expectedName=None, actualId=None,
                     actualName=None, actualAmount=None),
            ],
        },
    ]
    return {"total": 25, "items": items}


def build_referral_ledger() -> dict:
    """點數來源（S3b）：推薦獎勵、提領扣款、新約清空，含兩種核對不符與延遲補沖資訊。"""
    def row(**over):
        base = {
            "id": "lg-1", "at": "2026-11-01T02:00:00.000Z", "type": "referral_reward",
            "sourceCategory": "referral_signup", "amount": 12000, "balanceAfter": 1234567,
            "description": "推薦獎勵", "generation": 1, "refereeId": "payer-1",
            "refereeName": _TREE_NAME + "付款人", "eventAt": "2026-11-01T01:59:00.000Z",
            "withdrawalId": None, "withdrawalStatus": None, "subscriptionId": "sub-1",
            "finding": None,
        }
        base.update(over)
        return base
    items = [
        row(id="lg-3", type="ledger_reset", sourceCategory="ledger_reset", amount=-1234567,
            balanceAfter=0, generation=None, refereeId=None, refereeName=None, eventAt=None,
            finding="reset_amount"),
        row(id="lg-2", type="withdrawal", sourceCategory="withdrawal", amount=-100015,
            balanceAfter=1222567, generation=None, refereeId=None, refereeName=None,
            eventAt=None, withdrawalId="w-1", withdrawalStatus="awaiting_collection"),
        row(),
    ]
    findings = [
        {"kind": "reset_amount", "transactionId": "lg-3", "withdrawalId": None, "info": False},
        {"kind": "refund_missing", "transactionId": None, "withdrawalId": "w-9", "info": False},
        {"kind": "reset_delayed", "transactionId": "lg-0", "withdrawalId": None, "info": True},
    ]
    return {"total": 42, "items": items, "findings": findings}


def route_admin_referral_tree(context) -> None:
    """GET /admin/referral-tree/* — 推薦樹次分頁與節點詳情 Sheet（最壞但可達的測資）。"""
    top = [build_referral_tree_node(id=f"tree-node-{i}", layer=1) for i in range(1, 4)]
    children = [build_referral_tree_node(id=f"tree-child-{i}", layer=2) for i in range(1, 4)]

    def respond(route, data):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"success": True, "data": data}),
        )

    def nodes(route):
        url = route.request.url
        if "parentId=" in url:
            respond(route, {"total": 128, "nodes": children, "pinned": None})
        elif "group=unplaceable" in url:
            respond(route, {"total": 1, "nodes": [build_referral_tree_node(
                id="tree-cycle", layer=None, anomalyKinds=["cycle"])], "pinned": None})
        else:
            respond(route, {"total": 24, "nodes": top, "pinned": None, "unplaceableCount": 1})

    def search(route):
        respond(route, {"total": 1, "matches": [
            {**top[0], "ancestorIds": [], "unplaceableReason": None}]})

    context.route(f"{API_BASE}/admin/referral-tree/nodes**", nodes)
    context.route(f"{API_BASE}/admin/referral-tree/search**", search)
    context.route(
        f"{API_BASE}/admin/referral-tree/members/*",
        lambda route: respond(route, build_referral_member_audit(top[0])),
    )
    context.route(
        f"{API_BASE}/admin/referral-tree/members/*/payments**",
        lambda route: respond(route, build_referral_payments()),
    )
    context.route(
        f"{API_BASE}/admin/referral-tree/members/*/ledger**",
        lambda route: respond(route, build_referral_ledger()),
    )
