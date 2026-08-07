"""rls_probe 純函式的離線單元測試——PostgREST 回應形狀的判讀。

不需要瀏覽器、不需要 journey 環境;CI 的 journey-offline 軌會跑。

這裡釘住的是本 feature 最容易寫錯的兩件事(見 plan §2):
1. RLS 違規與 GRANT 拒絕共用 SQLSTATE 42501,必須靠訊息分開;
2. 被 USING 過濾回 200/204 + 0 列,**不是**錯誤。
"""

import pytest

from tools import rls_probe


# --- 允許 -------------------------------------------------------------------


def test_rows_returned_is_allowed():
    assert rls_probe.classify(200, [{"id": "l1", "name": "服務"}]) == "allowed"


def test_insert_representation_is_allowed():
    # PostgREST 的 insert 帶 Prefer: return=representation 時回 201 + [列]
    assert rls_probe.classify(201, [{"id": "l1"}]) == "allowed"


# --- 被 USING 過濾:不是錯誤,是 0 列 ---------------------------------------


def test_empty_array_is_filtered_not_denied():
    assert rls_probe.classify(200, []) == "filtered_empty"


def test_no_content_is_filtered_not_denied():
    # 不帶 return=representation 的 PATCH/DELETE 成功時回 204 無 body
    assert rls_probe.classify(204, None) == "filtered_empty"


# --- 兩種 42501 必須分得開 --------------------------------------------------


def test_rls_violation_is_denied_by_rls():
    body = {
        "code": "42501",
        "message": 'new row violates row-level security policy for table "listings"',
    }
    assert rls_probe.classify(403, body) == "denied_by_rls"


def test_table_grant_denial_is_denied_by_grant():
    body = {"code": "42501", "message": "permission denied for table listings"}
    assert rls_probe.classify(403, body) == "denied_by_grant"


def test_function_grant_denial_is_denied_by_grant():
    # 0726 的實際症狀:anon 讀 public_listings 踩到 own-policy 裡的 is_admin()
    body = {"code": "42501", "message": "permission denied for function is_admin"}
    assert rls_probe.classify(403, body) == "denied_by_grant"


def test_unclassifiable_42501_raises_instead_of_guessing():
    # 歸錯類等於讓斷言失去辨別力——寧可吵也不要靜默猜。
    # 注意這裡要用「兩個標記都不含」的裸 42501:"permission denied for X"
    # 不論 X 是 table/function/schema/sequence 都是合法的 GRANT 形狀,
    # 拿它當「無法歸類」的例子,測的其實是 denied_by_grant。
    body = {"code": "42501", "message": "insufficient privilege"}
    with pytest.raises(ValueError):
        rls_probe.classify(403, body)


# --- 未認證 -----------------------------------------------------------------


def test_missing_jwt_is_unauthenticated():
    body = {"message": "JWSError JWSInvalidSignature"}
    assert rls_probe.classify(401, body) == "unauthenticated"
