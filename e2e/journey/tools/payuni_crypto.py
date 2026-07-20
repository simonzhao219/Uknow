"""PayUni AES-256-GCM + SHA-256 的 Python 移植——webhook 備援模式用。

演算法與 supabase/functions/api/crypto.ts 一字一句對齊：
- 明文 = URLSearchParams 編碼的 key=value 字串；
- AES-256-GCM（key/iv 皆為金鑰字串的 UTF-8 bytes，tag 16 bytes）；
- EncryptInfo = hex(utf8("{b64(密文)}:::{b64(tag)}"))；
- HashInfo    = SHA256("{key}{EncryptInfo}{iv}").hex.upper()。

harness 用分支的 PAYUNI_TEST_* 金鑰簽出「後端驗得過」的 notify，
打進 /webhooks/payuni/notify——後端的解密、驗簽、入帳、獎勵連動
全走真程式碼，被替代的只有 PayUni 這個發訊者。
"""

from __future__ import annotations

import base64
import hashlib
from urllib.parse import parse_qsl, urlencode

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_TAG_BYTES = 16


def encrypt_info(data: dict, key: str, iv: str) -> str:
    plaintext = urlencode({k: str(v) for k, v in data.items()})
    sealed = AESGCM(key.encode("utf-8")).encrypt(
        iv.encode("utf-8"), plaintext.encode("utf-8"), None
    )
    ct, tag = sealed[:-_TAG_BYTES], sealed[-_TAG_BYTES:]
    combined = f"{base64.b64encode(ct).decode()}:::{base64.b64encode(tag).decode()}"
    return combined.encode("utf-8").hex()


def decrypt_info(encrypt_str: str, key: str, iv: str) -> dict:
    """反向操作——僅供單元測試驗證與 crypto.ts 同構。"""
    combined = bytes.fromhex(encrypt_str).decode("utf-8")
    ct_b64, tag_b64 = combined.split(":::")
    sealed = base64.b64decode(ct_b64) + base64.b64decode(tag_b64)
    plaintext = AESGCM(key.encode("utf-8")).decrypt(
        iv.encode("utf-8"), sealed, None
    ).decode("utf-8")
    return dict(parse_qsl(plaintext))


def hash_info(encrypt_str: str, key: str, iv: str) -> str:
    return hashlib.sha256(f"{key}{encrypt_str}{iv}".encode("utf-8")).hexdigest().upper()


def build_notify_form(trade_no: str, key: str, iv: str,
                      amount: int = 1200, status: str = "SUCCESS") -> dict:
    """組出 /webhooks/payuni/notify 期待的 form 欄位。

    後端 resolveOrderFromPayUni 讀 Status / MerTradeNo / TradeNo / TradeAmt
    ——TradeNo 模擬 PayUni 的平台交易號。"""
    payload = {
        "Status": status,
        "MerTradeNo": trade_no,
        "TradeNo": f"SIM{trade_no[-12:]}",
        "TradeAmt": str(amount),
    }
    enc = encrypt_info(payload, key, iv)
    return {"EncryptInfo": enc, "HashInfo": hash_info(enc, key, iv)}
