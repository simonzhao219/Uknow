"""payuni_crypto 的離線測試——鎖住與 crypto.ts 的同構性。"""

from tools import payuni_crypto

KEY = "0123456789abcdef0123456789abcdef"  # 32 bytes（AES-256）
IV = "0123456789abcdef"                   # 16 bytes


def test_encrypt_decrypt_roundtrip():
    data = {"Status": "SUCCESS", "MerTradeNo": "UK1234567890", "TradeAmt": "1200"}
    enc = payuni_crypto.encrypt_info(data, KEY, IV)
    assert payuni_crypto.decrypt_info(enc, KEY, IV) == data


def test_encrypt_info_structure_matches_ts():
    # crypto.ts：hex(utf8("{b64}:::{b64}"))——hex 解回來要有 ::: 分隔的兩段 base64。
    enc = payuni_crypto.encrypt_info({"A": "1"}, KEY, IV)
    combined = bytes.fromhex(enc).decode("utf-8")
    ct_b64, tag_b64 = combined.split(":::")
    import base64
    assert base64.b64decode(tag_b64.encode()).__len__() == 16  # GCM tag 固定 16 bytes
    assert base64.b64decode(ct_b64.encode())


def test_hash_info_is_uppercase_sha256():
    enc = payuni_crypto.encrypt_info({"A": "1"}, KEY, IV)
    h = payuni_crypto.hash_info(enc, KEY, IV)
    assert len(h) == 64 and h == h.upper()
    import hashlib
    assert h == hashlib.sha256(f"{KEY}{enc}{IV}".encode()).hexdigest().upper()


def test_build_notify_form_fields():
    form = payuni_crypto.build_notify_form("UK987654321", KEY, IV)
    assert set(form) == {"EncryptInfo", "HashInfo"}
    data = payuni_crypto.decrypt_info(form["EncryptInfo"], KEY, IV)
    assert data["MerTradeNo"] == "UK987654321"
    assert data["Status"] == "SUCCESS"
    assert data["TradeAmt"] == "1200"
    assert payuni_crypto.hash_info(form["EncryptInfo"], KEY, IV) == form["HashInfo"]
