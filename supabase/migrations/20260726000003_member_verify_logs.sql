-- 會員身分核身稽核紀錄（member-verify-qr Phase 1）
--
-- admin 掃會員核身碼、後端解析成功時逐次寫一筆。append-only：不更新、不刪除。
-- 業主決策：核身要留紀錄（誰在何時核了誰）；本期只寫入，查閱走 Supabase Studio，
-- 不做前端查閱介面。
--
-- FK on delete set null：刪帳號**不得**清空稽核（比照 announcements.created_by），
-- 否則「刪掉 admin 帳號 = 抹掉他核過的所有紀錄」直接牴觸稽核可追溯的目的。
-- RLS + revoke：全部存取走 service role（繞過 RLS）+ app 層 isAdminUser 把關；
-- 一律 enable RLS 並 revoke anon/authenticated 當 defense-in-depth（比照 system_alerts），
-- 避免一般 authenticated 使用者直接讀到別人的核身紀錄。

create table public.member_verify_logs (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references public.profiles(id) on delete set null,
  member_id   uuid references public.profiles(id) on delete set null,
  result      text not null default 'ok',
  verified_at timestamptz not null default now()
);

comment on table public.member_verify_logs is
  '會員身分核身稽核：admin 掃碼核身成功時逐次寫入（append-only）。查閱走 Supabase Studio，本期無前端介面。';

-- 本期雖只寫入，預留低成本索引：日後若做稽核查詢（依會員或依 admin 撈近期），
-- 免全表掃。晚加代價高（表會愈長愈大），現在加成本極低。
create index member_verify_logs_member_idx on public.member_verify_logs (member_id, verified_at desc);
create index member_verify_logs_admin_idx on public.member_verify_logs (admin_id, verified_at desc);

alter table public.member_verify_logs enable row level security;
revoke all on public.member_verify_logs from anon, authenticated;
