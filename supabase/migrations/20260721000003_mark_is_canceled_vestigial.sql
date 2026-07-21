-- ============================================================
-- Uknow — 0721 (3) 標記 subscriptions.is_canceled 為 vestigial
-- ============================================================
--
-- 背景：會員兩態（見 0721）只有 active／expired，沒有自助取消訂閱的
-- 流程（一次性年費、無自動續扣）。`is_canceled` 自始未被任何流程寫成
-- true，也無任何 live 邏輯讀它（user_account_status view 僅原樣帶出、
-- 無人消費）。spec §2 的「已取消」已標為未實作保留概念。
--
-- 決策：與 grace_period_end 一致——保留欄位（保留未來實作取消流程的
-- 彈性、避免破壞性 migration），僅加註記。不從 view 移除該欄：view 有
-- 相依函式（referral_tree / admin_list_members），且 CREATE OR REPLACE
-- VIEW 不允許刪欄，drop+recreate 風險不成比例。
-- ============================================================

comment on column public.subscriptions.is_canceled is
  'Vestigial（見 0721）：兩態模型無自助取消流程，此欄未被寫入或讀取；'
  '保留供未來可能的取消功能。user_account_status view 僅原樣帶出、無消費者。';
