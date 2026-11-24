-- ============================================================
-- PayUni 交易查詢正控紀錄（W6-36、W7-2；第 7 波 S2）。
--
-- 對帳端點（每小時）約每天查一次本環境最近一張 completed、存有 PayUni SUCCESS
-- 的單，斷言查詢回 Status=SUCCESS 且同號 TradeStatus=1，結果一列寫進這張表。
-- 對帳讀「最近一次」：是 success 且 checked_at 在 36 小時內，QUERY03001 才判
-- 「確認查無」；否則維持改判前的告警路徑。邏輯與理由在
-- supabase/functions/api/payuni-positive-control.ts 檔頭。
--
-- 為什麼另開表而不放 scheduled_job_runs.summary：summary 是每輪對帳的帳本，
-- 90 天輪替、正控只在約 1／24 的列上；「最近一次正控」要從 summary 撈得掃 jsonb，
-- 讀失敗也分不出是表壞還是沒跑過。量約每日 1 列（失敗時每小時 1 列），不輪替。
--
-- 部署相容：純新增。舊 Edge 配新 DB 不碰這張表；新 Edge 配舊 DB 讀不到表 →
-- 正控不跑、QUERY03001 維持改判前行為（warning 一筆），建單與對帳不受影響。
-- ============================================================

create table if not exists public.payuni_query_controls (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  outcome text not null check (outcome in ('success', 'failed', 'no_sample')),
  trade_no text,
  -- 樣本的付款完成時間（W7-14 審查 P2-2）：樣本一直不變新，代表新單可能都 completed 不了。
  sample_completed_at timestamptz,
  reason text
);

comment on table public.payuni_query_controls is
  'PayUni 交易查詢正控紀錄（W6-36／W7-2）：最近一次 success 且 36 小時內，對帳才把 QUERY03001 判確認查無。由 Edge Function 以 service_role 寫入。';

create index if not exists payuni_query_controls_checked_idx
  on public.payuni_query_controls (checked_at desc, id desc);

alter table public.payuni_query_controls enable row level security;
-- RLS 無 policy 已擋住 API 角色；再 revoke 一次，RLS 不是唯一防線。
revoke all on table public.payuni_query_controls from anon, authenticated, public;
grant all on table public.payuni_query_controls to service_role;
