"""推薦碼序列格式契約的離線單元測試——不需要瀏覽器、不需要 journey 環境。"""

from tools import referral_code


def test_sequence_start_code_accepted():
    # 8048876 是序列的第一個碼，同時是 §7.4 預設推薦人的指定碼。
    assert referral_code.is_sequence_code("8048876")


def test_codes_issued_after_the_start_accepted():
    for code in ("8048877", "8048905", "9000000", "12345678"):
        assert referral_code.is_sequence_code(code), code


def test_legacy_letter_prefixed_code_rejected():
    # 舊格式「3 碼小寫英文 + 6 碼數字」在正式站仍然有效，但拋棄式分支
    # 從零重播 migration，只會發出序列碼——這裡出現舊格式就是真的壞了。
    assert not referral_code.is_sequence_code("abc123456")


def test_codes_below_sequence_start_rejected():
    # 序列被 restart 回小於起始值是撞號的前兆，不能當成合法碼放過。
    for code in ("8048875", "1", "0"):
        assert not referral_code.is_sequence_code(code), code


def test_malformed_codes_rejected():
    assert not referral_code.is_sequence_code("")
    assert not referral_code.is_sequence_code("zzz999999")   # 查無此碼用的假碼
    assert not referral_code.is_sequence_code("8048876a")    # 尾巴帶字母
    assert not referral_code.is_sequence_code(" 8048876")    # 前後空白
    assert not referral_code.is_sequence_code("08048876")    # 前導零，序列不會產生
    assert not referral_code.is_sequence_code("８０４８８７６")  # 全形數字（見 #313）
