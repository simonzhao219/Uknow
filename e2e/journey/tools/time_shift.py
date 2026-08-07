"""月鍵平移的純函式——`seed_time_machine.age_monthly_bucket` 的離線核心。

production 月鍵一律是 Asia/Taipei 的 'YYYY-MM'(tw-dates.ts、
apply_referral_side_effects)。這裡只做「字串 → 字串」的平移運算,
**絕不自行推算「現在的月份」**——Python 側自算時區月份若與 DB 寫入的
key 不一致,對不存在的 key 平移是靜默 no-op,Q14a 的斷言會假綠
(規劃 renewal-rewards-automation-test §2.3)。
"""

from __future__ import annotations


def shifted_month_key(key: str, months_back: int) -> str:
    """'YYYY-MM' 往回平移 N 個月(N=0 原樣返回)。"""
    year_s, month_s = key.split("-")
    total = int(year_s) * 12 + (int(month_s) - 1) - months_back
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def merge_buckets(base: dict, incoming: dict) -> dict:
    """合併兩組月桶:同 key 以 append 合併並去重(保序),絕不整把覆寫
    ——覆寫會靜默吃掉歷史桶,打穿 M8「歷史桶永久保留」。"""
    merged = {k: list(v) for k, v in base.items()}
    for key, values in incoming.items():
        bucket = merged.setdefault(key, [])
        bucket.extend(v for v in values if v not in bucket)
    return merged


def shift_bucket_keys(buckets: dict, months_back: int) -> dict:
    """把整組 monthly_referrals 的 key 統一往回平移 N 個月。

    回傳全新結構(值為複本,不與輸入共享 list);統一平移下 key 映射
    是單射,防禦性地仍走 merge_buckets 合流。"""
    shifted: dict = {}
    for key, values in buckets.items():
        shifted = merge_buckets(shifted, {shifted_month_key(key, months_back): list(values)})
    return shifted
