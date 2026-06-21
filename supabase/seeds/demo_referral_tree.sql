-- ============================================================
-- DEMO 種子資料 — Simon 推薦組織圖 / 推薦關係 / 獎金 / 人物
-- ============================================================
--
-- 目的：在 Simon（root）底下建立一棵完整的三代推薦樹，供 demo
--   展示「組織圖、推薦關係、獎金、人物（刊登）」等功能。
--
--   Simon (abc1234)  ← root，既有帳號
--   ├─ 陳美玲 (一代)  ├─ 黃雅婷 (二代) ── 蔡明翰 (三代)
--   │                 └─ 吳建宏 (二代)
--   ├─ 林志豪 (一代) ── 劉怡君 (二代)
--   ├─ 王淑芬 (一代)
--   └─ 張家偉 (一代)
--
--   一代下線 = 4 人；二代 = 3 人；三代 = 1 人。
--   每位下線皆有：有效年度訂閱（會員 active）＋ 刊登（人物）＋ 推薦碼。
--   依「每筆訂單每代 10 點 × 12 月 = 120 點、最多三代」規則，
--   為各上線寫入 referral_reward 獎勵：
--     Simon  960 點 (一代×4 + 二代×3 + 三代×1)
--     陳美玲 360 點 (一代×2 + 二代×1)
--     林志豪 120 點 (一代×1)
--     黃雅婷 120 點 (一代×1)
--   並設定 Simon 當月（推薦王任務）直接推薦進度 4/10。
--
-- 特性：可重複執行（idempotent）。固定 UUID（d1a.. ~ d3a..）方便清除。
-- 清除：執行 supabase/seeds/demo_referral_tree_cleanup.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1) auth.users（profiles 的外鍵來源；demo 帳號）
--    email 用 @demo.uknow.local，密碼統一 Demo2026!（如需登入下線視角）
--    插入後 handle_new_user 觸發器會自動建立對應 profiles 列。
-- ------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', d.id, 'authenticated', 'authenticated',
  d.email, crypt('Demo2026!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('name', d.name, 'phone', d.phone),
  '', '', '', ''
from (values
  ('d1a00000-0000-4000-8000-000000000001'::uuid, 'demo.meiling@demo.uknow.local',  '陳美玲', '0911000001'),
  ('d1b00000-0000-4000-8000-000000000002'::uuid, 'demo.zhihao@demo.uknow.local',   '林志豪', '0911000002'),
  ('d1c00000-0000-4000-8000-000000000003'::uuid, 'demo.shufen@demo.uknow.local',   '王淑芬', '0911000003'),
  ('d1d00000-0000-4000-8000-000000000004'::uuid, 'demo.jiawei@demo.uknow.local',   '張家偉', '0911000004'),
  ('d2a00000-0000-4000-8000-000000000005'::uuid, 'demo.yating@demo.uknow.local',   '黃雅婷', '0911000005'),
  ('d2b00000-0000-4000-8000-000000000006'::uuid, 'demo.jianhong@demo.uknow.local', '吳建宏', '0911000006'),
  ('d2c00000-0000-4000-8000-000000000007'::uuid, 'demo.yijun@demo.uknow.local',    '劉怡君', '0911000007'),
  ('d3a00000-0000-4000-8000-000000000008'::uuid, 'demo.minghan@demo.uknow.local',  '蔡明翰', '0911000008')
) as d(id, email, name, phone)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2) profiles：補齊業務欄位（註冊完成、已加入推薦計畫、上線、推薦碼快照、銀行）
--    referred_by_code 為「註冊當下使用的上線推薦碼」。
-- ------------------------------------------------------------
insert into public.profiles (
  id, name, phone, birth_date, national_id,
  registration_step, referral_program_joined, referral_program_joined_at,
  referred_by_user_id, referred_by_code, bank_code, bank_account
)
select
  v.id, v.name, v.phone, v.birth_date, v.national_id,
  3, true, now(), v.referrer, v.referred_by_code, v.bank_code, v.bank_account
from (values
  ('d1a00000-0000-4000-8000-000000000001'::uuid, '陳美玲', '0911000001', date '1990-03-15', 'A223456781',
     '973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, 'abc1234',   '808', '8081234500001'),
  ('d1b00000-0000-4000-8000-000000000002'::uuid, '林志豪', '0911000002', date '1988-07-22', 'B123456782',
     '973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, 'abc1234',   '822', '8221234500002'),
  ('d1c00000-0000-4000-8000-000000000003'::uuid, '王淑芬', '0911000003', date '1992-11-05', 'C223456783',
     '973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, 'abc1234',   '700', '7001234500003'),
  ('d1d00000-0000-4000-8000-000000000004'::uuid, '張家偉', '0911000004', date '1985-01-30', 'D123456784',
     '973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, 'abc1234',   '013', '0131234500004'),
  ('d2a00000-0000-4000-8000-000000000005'::uuid, '黃雅婷', '0911000005', date '1995-06-18', 'E223456785',
     'd1a00000-0000-4000-8000-000000000001'::uuid, 'dem100001', '812', '8121234500005'),
  ('d2b00000-0000-4000-8000-000000000006'::uuid, '吳建宏', '0911000006', date '1983-09-12', 'F123456786',
     'd1a00000-0000-4000-8000-000000000001'::uuid, 'dem100001', '807', '8071234500006'),
  ('d2c00000-0000-4000-8000-000000000007'::uuid, '劉怡君', '0911000007', date '1996-04-08', 'G223456787',
     'd1b00000-0000-4000-8000-000000000002'::uuid, 'dem100002', '006', '0061234500007'),
  ('d3a00000-0000-4000-8000-000000000008'::uuid, '蔡明翰', '0911000008', date '1991-12-25', 'H123456788',
     'd2a00000-0000-4000-8000-000000000005'::uuid, 'dem100005', '004', '0041234500008')
) as v(id, name, phone, birth_date, national_id, referrer, referred_by_code, bank_code, bank_account)
on conflict (id) do update set
  name                       = excluded.name,
  phone                      = excluded.phone,
  birth_date                 = excluded.birth_date,
  national_id                = excluded.national_id,
  registration_step          = excluded.registration_step,
  referral_program_joined    = excluded.referral_program_joined,
  referral_program_joined_at = excluded.referral_program_joined_at,
  referred_by_user_id        = excluded.referred_by_user_id,
  referred_by_code           = excluded.referred_by_code,
  bank_code                  = excluded.bank_code,
  bank_account               = excluded.bank_account;

-- ------------------------------------------------------------
-- 3) referral_codes：每位下線一組 active 推薦碼（格式 3 英 + 6 數）
-- ------------------------------------------------------------
insert into public.referral_codes (user_id, code, status, activated_at)
values
  ('d1a00000-0000-4000-8000-000000000001'::uuid, 'dem100001', 'active', now()),
  ('d1b00000-0000-4000-8000-000000000002'::uuid, 'dem100002', 'active', now()),
  ('d1c00000-0000-4000-8000-000000000003'::uuid, 'dem100003', 'active', now()),
  ('d1d00000-0000-4000-8000-000000000004'::uuid, 'dem100004', 'active', now()),
  ('d2a00000-0000-4000-8000-000000000005'::uuid, 'dem100005', 'active', now()),
  ('d2b00000-0000-4000-8000-000000000006'::uuid, 'dem100006', 'active', now()),
  ('d2c00000-0000-4000-8000-000000000007'::uuid, 'dem100007', 'active', now()),
  ('d3a00000-0000-4000-8000-000000000008'::uuid, 'dem100008', 'active', now())
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- 4) listings：刊登（人物）— 名稱 / 服務類別 / 縣市 / 區 / 性別 / 聯絡方式
--    類別與縣市區皆採 utils/constants.ts 之合法值。
-- ------------------------------------------------------------
insert into public.listings (
  user_id, name, category, city, districts, gender, photos, contacts, description
)
select
  v.id, v.name, v.category, v.city, v.districts, v.gender,
  '{}'::text[],
  jsonb_build_object('line', v.line),
  v.description
from (values
  ('d1a00000-0000-4000-8000-000000000001'::uuid, '美玲時尚美容工作室', '美容',       '台北市', array['大安區'],       '女', 'meiling_beauty',  '專業臉部護膚、霧眉，給你最自然的好氣色。'),
  ('d1b00000-0000-4000-8000-000000000002'::uuid, '志豪體能訓練中心',   '健身教練',   '新北市', array['板橋區'],       '男', 'zhihao_fit',      '一對一體態雕塑與肌力訓練，量身打造課表。'),
  ('d1c00000-0000-4000-8000-000000000003'::uuid, '淑芬心靈療癒坊',     '身心靈老師', '台中市', array['西屯區'],       '女', 'shufen_soul',     '塔羅占卜、靈氣療癒，陪你找回內在平衡。'),
  ('d1d00000-0000-4000-8000-000000000004'::uuid, '家偉影像婚紗',       '攝影師',     '高雄市', array['左營區'],       '男', 'jiawei_photo',    '婚紗、形象、商品攝影，捕捉每個動人瞬間。'),
  ('d2a00000-0000-4000-8000-000000000005'::uuid, '雅婷美甲沙龍',       '美甲',       '台北市', array['信義區'],       '女', 'yating_nail',     '日系光療、手足保養，指尖上的精緻美學。'),
  ('d2b00000-0000-4000-8000-000000000006'::uuid, '建宏汽車保養廠',     '汽車',       '桃園市', array['中壢區'],       '男', 'jianhong_auto',   '定期保養、引擎檢測，行車安全交給專業。'),
  ('d2c00000-0000-4000-8000-000000000007'::uuid, '怡君鋼琴音樂教室',   '各類音樂老師','新竹市', array['東區'],         '女', 'yijun_music',     '兒童與成人鋼琴、樂理，從零開始也沒問題。'),
  ('d3a00000-0000-4000-8000-000000000008'::uuid, '明翰造型髮廊',       '美髮',       '台南市', array['中西區'],       '男', 'minghan_hair',    '剪燙染護一站式服務，打造專屬個人風格。')
) as v(id, name, category, city, districts, gender, line, description)
on conflict (user_id) do update set
  name        = excluded.name,
  category    = excluded.category,
  city        = excluded.city,
  districts   = excluded.districts,
  gender      = excluded.gender,
  contacts    = excluded.contacts,
  description = excluded.description;

-- ------------------------------------------------------------
-- 5) subscriptions：每位下線一筆有效年度訂閱（會員狀態 = active）
--    end_date = start + 1 年；grace = end + 60 天。
-- ------------------------------------------------------------
delete from public.subscriptions
where user_id in (
  'd1a00000-0000-4000-8000-000000000001','d1b00000-0000-4000-8000-000000000002',
  'd1c00000-0000-4000-8000-000000000003','d1d00000-0000-4000-8000-000000000004',
  'd2a00000-0000-4000-8000-000000000005','d2b00000-0000-4000-8000-000000000006',
  'd2c00000-0000-4000-8000-000000000007','d3a00000-0000-4000-8000-000000000008'
);

insert into public.subscriptions (
  user_id, start_date, end_date, grace_period_end, amount, payment_method, is_renewal
)
select
  v.uid, v.s, v.s + interval '1 year', v.s + interval '1 year' + interval '60 days',
  1200, 'credit_card', false
from (values
  ('d1a00000-0000-4000-8000-000000000001'::uuid, timestamptz '2026-06-10 02:00:00+00'),
  ('d1b00000-0000-4000-8000-000000000002'::uuid, timestamptz '2026-06-12 03:00:00+00'),
  ('d1c00000-0000-4000-8000-000000000003'::uuid, timestamptz '2026-06-14 04:00:00+00'),
  ('d1d00000-0000-4000-8000-000000000004'::uuid, timestamptz '2026-06-16 05:00:00+00'),
  ('d2a00000-0000-4000-8000-000000000005'::uuid, timestamptz '2026-06-17 02:00:00+00'),
  ('d2b00000-0000-4000-8000-000000000006'::uuid, timestamptz '2026-06-18 03:00:00+00'),
  ('d2c00000-0000-4000-8000-000000000007'::uuid, timestamptz '2026-06-18 06:00:00+00'),
  ('d3a00000-0000-4000-8000-000000000008'::uuid, timestamptz '2026-06-20 07:00:00+00')
) as v(uid, s);

-- ------------------------------------------------------------
-- 6) referral_edges：推薦關係（推薦樹唯一真相，只記直接上線一層）
--    referred_at 落在 2026-06，使「本月推薦」與推薦王任務一致。
-- ------------------------------------------------------------
insert into public.referral_edges (referee_user_id, referrer_user_id, referred_at)
values
  ('d1a00000-0000-4000-8000-000000000001'::uuid, '973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, timestamptz '2026-06-10 02:00:00+00'),
  ('d1b00000-0000-4000-8000-000000000002'::uuid, '973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, timestamptz '2026-06-12 03:00:00+00'),
  ('d1c00000-0000-4000-8000-000000000003'::uuid, '973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, timestamptz '2026-06-14 04:00:00+00'),
  ('d1d00000-0000-4000-8000-000000000004'::uuid, '973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, timestamptz '2026-06-16 05:00:00+00'),
  ('d2a00000-0000-4000-8000-000000000005'::uuid, 'd1a00000-0000-4000-8000-000000000001'::uuid, timestamptz '2026-06-17 02:00:00+00'),
  ('d2b00000-0000-4000-8000-000000000006'::uuid, 'd1a00000-0000-4000-8000-000000000001'::uuid, timestamptz '2026-06-18 03:00:00+00'),
  ('d2c00000-0000-4000-8000-000000000007'::uuid, 'd1b00000-0000-4000-8000-000000000002'::uuid, timestamptz '2026-06-18 06:00:00+00'),
  ('d3a00000-0000-4000-8000-000000000008'::uuid, 'd2a00000-0000-4000-8000-000000000005'::uuid, timestamptz '2026-06-20 07:00:00+00')
on conflict (referee_user_id) do update set
  referrer_user_id = excluded.referrer_user_id,
  referred_at      = excluded.referred_at;

-- ------------------------------------------------------------
-- 7) reward_transactions：推薦獎勵（獎金）即時一次發清，每筆訂單每代 120 點
--    先清除本 demo 下線造成的獎勵，再重建（idempotent）。
-- ------------------------------------------------------------
delete from public.reward_transactions
where referee_user_id in (
  'd1a00000-0000-4000-8000-000000000001','d1b00000-0000-4000-8000-000000000002',
  'd1c00000-0000-4000-8000-000000000003','d1d00000-0000-4000-8000-000000000004',
  'd2a00000-0000-4000-8000-000000000005','d2b00000-0000-4000-8000-000000000006',
  'd2c00000-0000-4000-8000-000000000007','d3a00000-0000-4000-8000-000000000008'
);

insert into public.reward_transactions (
  user_id, type, amount, generation, referee_user_id, description, created_at
)
select
  v.beneficiary, 'referral_reward', 120, v.gen, v.referee,
  '推薦獎勵 第' || v.gen || '代（' || v.referee_name || ' 訂閱年費）',
  v.created_at
from (values
  -- Simon（root）：一代×4 + 二代×3 + 三代×1 = 960 點
  ('973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, 1::smallint, 'd1a00000-0000-4000-8000-000000000001'::uuid, '陳美玲', timestamptz '2026-06-10 02:00:00+00'),
  ('973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, 1::smallint, 'd1b00000-0000-4000-8000-000000000002'::uuid, '林志豪', timestamptz '2026-06-12 03:00:00+00'),
  ('973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, 1::smallint, 'd1c00000-0000-4000-8000-000000000003'::uuid, '王淑芬', timestamptz '2026-06-14 04:00:00+00'),
  ('973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, 1::smallint, 'd1d00000-0000-4000-8000-000000000004'::uuid, '張家偉', timestamptz '2026-06-16 05:00:00+00'),
  ('973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, 2::smallint, 'd2a00000-0000-4000-8000-000000000005'::uuid, '黃雅婷', timestamptz '2026-06-17 02:00:00+00'),
  ('973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, 2::smallint, 'd2b00000-0000-4000-8000-000000000006'::uuid, '吳建宏', timestamptz '2026-06-18 03:00:00+00'),
  ('973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, 2::smallint, 'd2c00000-0000-4000-8000-000000000007'::uuid, '劉怡君', timestamptz '2026-06-18 06:00:00+00'),
  ('973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid, 3::smallint, 'd3a00000-0000-4000-8000-000000000008'::uuid, '蔡明翰', timestamptz '2026-06-20 07:00:00+00'),
  -- 陳美玲：一代×2（黃雅婷、吳建宏）+ 二代×1（蔡明翰）= 360 點
  ('d1a00000-0000-4000-8000-000000000001'::uuid, 1::smallint, 'd2a00000-0000-4000-8000-000000000005'::uuid, '黃雅婷', timestamptz '2026-06-17 02:00:00+00'),
  ('d1a00000-0000-4000-8000-000000000001'::uuid, 1::smallint, 'd2b00000-0000-4000-8000-000000000006'::uuid, '吳建宏', timestamptz '2026-06-18 03:00:00+00'),
  ('d1a00000-0000-4000-8000-000000000001'::uuid, 2::smallint, 'd3a00000-0000-4000-8000-000000000008'::uuid, '蔡明翰', timestamptz '2026-06-20 07:00:00+00'),
  -- 林志豪：一代×1（劉怡君）= 120 點
  ('d1b00000-0000-4000-8000-000000000002'::uuid, 1::smallint, 'd2c00000-0000-4000-8000-000000000007'::uuid, '劉怡君', timestamptz '2026-06-18 06:00:00+00'),
  -- 黃雅婷：一代×1（蔡明翰）= 120 點
  ('d2a00000-0000-4000-8000-000000000005'::uuid, 1::smallint, 'd3a00000-0000-4000-8000-000000000008'::uuid, '蔡明翰', timestamptz '2026-06-20 07:00:00+00')
) as v(beneficiary, gen, referee, referee_name, created_at);

-- ------------------------------------------------------------
-- 8) task_progress：Simon 當月（2026-06）直接推薦 4 人 → 推薦王任務 4/10
-- ------------------------------------------------------------
insert into public.task_progress (user_id, monthly_referrals, total_referrals, updated_at)
values (
  '973bd8b4-50a5-4a1d-99bf-4c72884934a7'::uuid,
  jsonb_build_object('2026-06', jsonb_build_array(
    'd1a00000-0000-4000-8000-000000000001',
    'd1b00000-0000-4000-8000-000000000002',
    'd1c00000-0000-4000-8000-000000000003',
    'd1d00000-0000-4000-8000-000000000004'
  )),
  4, now()
)
on conflict (user_id) do update set
  monthly_referrals = excluded.monthly_referrals,
  total_referrals   = excluded.total_referrals,
  updated_at        = excluded.updated_at;
