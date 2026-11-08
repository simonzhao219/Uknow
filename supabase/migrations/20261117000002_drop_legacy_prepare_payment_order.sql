-- ============================================================
-- 移除三參數版 prepare_payment_order（第 6 波 S6；見 renewal-referrer-intent.test.ts）
-- ============================================================
--
-- 為什麼：20261113000002 把三參數版改成委派六參數版的 wrapper，只為部署空窗內的舊 Edge
--   （migration 由 Supabase 整合先套、Edge 等核准才換）。正式站 Edge（main f5a1ed8，第 5 波）與
--   develop 的 Edge 皆已呼叫六參數版（p_referrer_source），空窗已過。
-- 修法（基準與唯一差異）：只 drop 三參數簽章；六參數版不動。
-- 正式站安全：套用時點與之後的 Edge 都不呼叫三參數版。萬一有未知呼叫端 → 建單 RPC 回
--   PGRST202（Edge 回 500、不建單、不扣款）；回滾＝依 20261113000002 原文重建 wrapper。
-- ============================================================

drop function if exists public.prepare_payment_order(uuid, text, text);
