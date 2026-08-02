-- ============================================================
-- 管理員授予／撤銷（規劃書階段 3.3 / 驗收情境 M4）
-- ============================================================
--
-- 守的是「系統不能失去所有管理員」。兩道防線：
--
--   1. `cannot_demote_self` —— 管理員不能撤銷自己。
--   2. `last_admin` —— 撤銷後不能變成零管理員。
--
-- **兩者的可達性不對稱，這點值得寫下來。** 經由 `POST /admin/members/:id/admin`
-- 端點，`last_admin` 其實到不了：只有管理員能呼叫該端點，系統只剩一位管理員
-- 時他唯一能撤銷的對象就是自己，那會先撞 `cannot_demote_self`。
--
-- 那為什麼還留著 `last_admin`？因為它守的是**呼叫者與目標不同人**的路徑：
-- service_role 直呼、未來可能出現的批次或清理流程。防線的價值在於「當某天
-- 有人從別的入口進來時它還在」，而不是「今天有沒有人走到」。
--
-- **本函數刻意不檢查「呼叫者是不是管理員」。** 授權由兩層負責：端點的
-- `isAdminUser`，以及下面的 `revoke execute`（真正擋住 PostgREST `rpc/` 這條
-- 繞過 middleware 的路徑）。`p_admin_id` 在這裡只用於「是不是自己」的比對與
-- 稽核，不是授權依據——把授權判斷同時放兩個地方，維護時只會有一邊被改到。
-- ============================================================

create or replace function public.admin_set_member_admin(
  p_admin_id  uuid,
  p_target_id uuid,
  p_is_admin  boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining int;
begin
  -- 撤銷自己：即使系統還有其他管理員也擋。只有兩位管理員時 last_admin 不會
  -- 叫，而「我不小心把自己降級了」在那種系統裡等於把整個後台交給另一個人
  -- ——不可自救的狀態，不該只靠使用者小心。
  if p_admin_id = p_target_id and p_is_admin = false then
    return jsonb_build_object('success', false, 'error_code', 'cannot_demote_self');
  end if;

  -- 兩人同時按「撤銷管理員」：advisory lock 序列化，第二人才看得到第一人的
  -- 結果。比照 admin_setup_claim。沒有它，兩個並行交易各自看到「還有 2 位」
  -- 而同時撤掉，系統歸零。
  perform pg_advisory_xact_lock(hashtext('admin_set_member_admin'));

  if p_is_admin = false then
    select count(*) into v_remaining
    from public.profiles
    where is_admin = true and id <> p_target_id;

    if v_remaining = 0 then
      return jsonb_build_object('success', false, 'error_code', 'last_admin');
    end if;
  end if;

  update public.profiles set is_admin = p_is_admin where id = p_target_id;
  if not found then
    return jsonb_build_object('success', false, 'error_code', 'member_not_found');
  end if;

  return jsonb_build_object('success', true, 'is_admin', p_is_admin);
end;
$$;

-- 這是 P0-2 的真實漏洞路徑：PostgREST 的 rpc/ 端點繞過 Hono 的 /admin/*
-- middleware，一般會員直呼這支就能把自己變成管理員。middleware 不是防線，
-- 這行才是。
revoke execute on function public.admin_set_member_admin(uuid, uuid, boolean)
  from anon, authenticated, public;
