-- ============================================================
-- Uknow — 0802 0001 證件審核子系統
-- ============================================================
--
-- 規格書 §13「會員管理」那列的「資料審核」是動詞:會員上傳身分證後由
-- admin 核可。本 migration 建立狀態欄位與 backfill;守衛與端點分別在
-- 階段 1.2、1.3。
--
-- **審核結果只在 rejected 時阻擋提領**(需求方裁決,見
-- `docs/plans/admin-dashboard-members-withdrawal/plan.md` §2.1):真正的
-- 關卡是匯款不是申請——admin 本來就不會在沒核對證件的情況下把錢轉出去。
-- 在申請端擋「還沒輪到審核」的人不增加實質保護,只讓每個新會員的第一次
-- 提領多等三個工作天。
-- ============================================================

alter table public.profiles
  add column id_verification_status text not null default 'none'
    check (id_verification_status in ('none', 'pending', 'approved', 'rejected')),
  add column id_verified_at   timestamptz,
  add column id_verified_by   uuid references public.profiles(id) on delete set null,
  add column id_reject_reason text;

comment on column public.profiles.id_verification_status is
  'none=證件未交齊;pending=待 admin 審核;approved=已通過;rejected=已退回。'
  '只有 rejected 會擋提領——pending 不擋,見 request_withdrawal 守衛 #5a。';

create index idx_profiles_id_verification_pending
  on public.profiles (id_verification_status)
  where id_verification_status = 'pending';

-- ------------------------------------------------------------
-- backfill:做成可呼叫的函數,而不是 migration 內嵌的一次性 SQL。
--
-- 理由是可測性:內嵌版本在整合測試裡搆不到——migration 早在測試開始前
-- 就跑完了,無從用 fixture 驗判準。這是金流相鄰的資料異動,判準錯了會讓
-- 該被審的人靜默通過,可測性優先於「一次性操作不該留函數」的潔癖。
--
-- 只動 status = 'none' 的列,所以重複呼叫不會翻案已審核過的結果。
-- ------------------------------------------------------------
create or replace function public.backfill_id_verification()
returns void
language sql
security definer
set search_path = public
as $$
  -- 曾有提領實際匯出者視為已審核:admin 當初為了匯款,必然看過那兩張照片。
  -- 刻意排除只到 rejected 的——退件的原因可能是銀行帳號有誤,不代表 admin
  -- 仔細看過證件。
  update public.profiles p
  set id_verification_status = 'approved',
      id_verified_at = now()
  where p.id_verification_status = 'none'
    and p.id_card_front_path is not null
    and p.id_card_back_path is not null
    and exists (
      select 1 from public.withdrawals w
      where w.user_id = p.id
        and w.status in ('awaiting_collection', 'completed')
    );

  -- 照片齊全但從未成功提領的,進佇列待審——這批人正是這道關卡本來就該
  -- 看的對象。依裁決 pending 不擋提領,所以沒有人會因此被卡住。
  update public.profiles p
  set id_verification_status = 'pending'
  where p.id_verification_status = 'none'
    and p.id_card_front_path is not null
    and p.id_card_back_path is not null;
$$;

-- Postgres 對函數的 EXECUTE 預設授予 PUBLIC,而 PostgREST 的 rpc 端點
-- 不經過 Edge Function 的 /admin/* middleware——每個新函數都要自己收回。
revoke execute on function public.backfill_id_verification() from anon, authenticated, public;

select public.backfill_id_verification();
