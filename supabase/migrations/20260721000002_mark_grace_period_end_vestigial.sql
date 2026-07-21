-- ============================================================
-- Uknow — 0721 (2) 標記 grace_period_end 為 vestigial（殘留欄位）
-- ============================================================
--
-- 背景：0721 (1) 移除寬限期後，會員狀態只看 end_date；
-- subscriptions.grace_period_end 已無任何 live 邏輯讀取——
--   * user_account_status 狀態判斷改用 end_date；
--   * has_active_subscription 可見性改用 end_date；
--   * 續約 extend 的「過期超過一年」判斷用 end_date。
--
-- 決策（保留而非 drop）：drop column 是破壞性且不可逆的 migration，
-- 而欄位成本僅每列一個 timestamptz；保留可用近乎零的成本保留「日後若
-- 恢復寬限期只需改 view 一行」的彈性，並維持歷史資料完整。訂閱建立與
-- claim_referral_king_reward 仍照 end + 60 天寫入此欄，不影響任何行為。
--
-- 本 migration 只加 column comment，不改結構、不改資料。
-- ============================================================

comment on column public.subscriptions.grace_period_end is
  'Vestigial（見 0721）：移除寬限期後狀態/可見性判斷均改用 end_date，'
  '此欄不再被任何 live 邏輯讀取。保留欄位以維持歷史資料完整並保留日後'
  '恢復寬限期的彈性；仍由訂閱建立/claim 依 end + 60 天寫入。';
