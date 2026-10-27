-- 第 1 波 10/29–31 量測（plan.md §5 第 1、3、4、5、6、9 項；唯讀）
-- 由排程任務 trig_01KmMD7RYZFDjNiLWHrNDhx3 每 2 小時以 Supabase MCP execute_sql 對正式專案跑，
-- 結果摘要記 plan.md §8。第 2（Auth logs）、7（/health）、8（客服回報）項不是 SQL，另外看。
-- 退場：10/31 凍結期結束後隨整個 launch-wave-1 目錄刪除。

-- 1. 每小時註冊漏斗（最近 24 小時）：完成率 <80% 或整點斷崖＝寄信額度
select date_trunc('hour', created_at) as hour,
       count(*) as signups,
       count(email_confirmed_at) as confirmed,
       round(100.0 * count(email_confirmed_at) / nullif(count(*), 0), 1) as confirm_pct
from auth.users
where created_at > now() - interval '24 hours'
group by 1 order by 1;

-- 3. 註冊步驟分布（函式，不讀已棄用的 profiles.registration_step）
select public.effective_registration_step(id) as step, count(*)
from public.profiles group by 1 order by 1;

-- 4. 訂單：最近 24 小時各小時各狀態；卡住的 pending；pending 但 PayUni 已 SUCCESS（目標 0）
select date_trunc('hour', created_at) as hour, status, count(*)
from public.payment_orders
where created_at > now() - interval '24 hours'
group by 1, 2 order by 1, 2;
select count(*) as pending_no_response_over_20m
from public.payment_orders
where status = 'pending' and payuni_response is null
  and created_at < now() - interval '20 minutes';
select count(*) as pending_but_payuni_success
from public.payment_orders
where status = 'pending' and payuni_response->>'Status' = 'SUCCESS';

-- 5. 未解決告警依 source／severity
select source, severity, count(*)
from public.system_alerts
where resolved_at is null
group by 1, 2 order by 2, 3 desc;

-- 6. check-email 限流壓力（上限值以部署版本為準：容量 hotfix 前 10、後 60）
select count(*) filter (where count >= 60) as buckets_at_limit_60,
       count(*) filter (where count >= 10) as buckets_at_limit_10,
       coalesce(max(count) filter (where key = 'check-email:unknown'), 0) as unknown_bucket_count
from public.rate_limits
where key like 'check-email:%' and window_start > now() - interval '15 minutes';

-- 9. R2 邀請：邀請總數、超過 8 天仍未驗證（應為 0，purge 失效的訊號）
select count(*) as invited,
       count(*) filter (where email_confirmed_at is null
                        and (raw_app_meta_data->'referral_invite'->>'issued_at')::timestamptz
                            < now() - interval '8 days') as stale_unconfirmed
from auth.users
where jsonb_typeof(raw_app_meta_data->'referral_invite') = 'object';
