// ============================================================
// PayUni 交易查詢正控（W6-36、W7-2）。
//
// 為什麼要有：對帳把 `QUERY03001`（PayUni「查無符合訂單資料」）當成「確認棄單」
// 的前提是「已付款的單一定查得到」。只看棄單回 03001 證明不了這件事——單號格式
// 日後被改壞時，已付款的單也會回 03001，改判後會被靜默標 expired。正控每天查一張
// 本環境最近一張 completed、有 PayUni SUCCESS 存檔的單，要求 Status=SUCCESS 且
// 同號交易 TradeStatus=1：查得到已付款的單，03001 才可信。
//
// 觸發：併在每小時的 reconcile 端點（同一支 Edge、同一個租約），不另開 pg_cron：
//   * PayUni 金鑰只在 Edge Secrets，GitHub runner 沒有
//   * 新 pg_cron 要改 invoke_internal_endpoint 白名單與 Vault、看門狗也要多看一支；
//     併進 reconcile 一行都不用，且本輪對帳讀得到本輪剛做的正控結果
//   * 頻率：最近一次是 success 且未滿 CONTROL_INTERVAL_HOURS → 本輪不跑；否則
//     （無紀錄、失敗、無樣本、已滿 23 小時）本輪跑一次。失敗每小時重試一次
//     PayUni 查詢（一張單），告警按 logSystemAlertOnce 去重到有人標處理
//
// 把關（W7-2，程式內）：本輪 03001 可以改判 ⇔ 正控「最近一次」是 success 且
// checked_at 在 CONTROL_FRESH_HOURS 內。最近一次是 failed／no_sample、過期、
// 讀不到紀錄、本輪正控擲錯 → 一律 false，對帳維持現行行為（fail-safe）。
// 本輪有跑正控時以本輪結果為準（寫入失敗也一樣），不回頭讀舊紀錄。
// ============================================================

/** 最近一次正控成功在這個時數內，03001 才判「確認查無」（W7-2）。邊界含 36 小時整。 */
export const CONTROL_FRESH_HOURS = 36;
/** 最近一次成功未滿這個時數就不重跑：每小時的 reconcile 約每天跑一次。 */
export const CONTROL_INTERVAL_HOURS = 23;
/**
 * 樣本至少付款完成這麼久（W7-14 審查 P2-1）：剛付款幾分鐘的單 PayUni 可能還回
 * DataSource=B 或狀態未定，會推一則假的「正控失敗」。
 */
export const SAMPLE_MIN_AGE_HOURS = 1;
/**
 * 樣本付款完成超過這麼久就寫 warning（W7-14 審查 P2-2）：若日後新單的 MerTradeNo
 * 被改得與存的 transaction_id 不一致，新單永遠 completed 不了，正控會一直挑改壞前的
 * 舊單照樣成功。warning 不推 LINE、不影響 fresh——只讓後台看得到「樣本在變舊」。
 */
export const SAMPLE_STALE_DAYS = 14;

export const CONTROL_ALERT_SOURCE = 'payuni-positive-control';

export type ControlOutcome = 'success' | 'failed' | 'no_sample';

export type ControlRecord = {
  checkedAt: string;
  outcome: ControlOutcome;
  tradeNo: string | null;
  /** 樣本的付款完成時間（completed_at）；沒挑到樣本時 null。 */
  sampleCompletedAt: string | null;
  reason: string | null;
};

export type PositiveControlDeps = {
  /** 最近一次正控紀錄；沒有紀錄回 null；讀取失敗擲錯。 */
  latest: () => Promise<{ checkedAt: string; outcome: ControlOutcome } | null>;
  /**
   * 本環境 completed_at ≤ completedBefore 的單中最新一張有 PayUni SUCCESS 存檔的；
   * 沒有回 null；讀取失敗擲錯。
   */
  pickSample: (completedBefore: Date) => Promise<{ tradeNo: string; completedAt: string } | null>;
  /** 打 PayUni 查詢：raw 是最外層 JSON，decrypted 是 EncryptInfo 解開的欄位（沒有時 null）。 */
  query: (
    merTradeNo: string,
  ) => Promise<{ raw: Record<string, unknown>; decrypted: Record<string, string> | null }>;
  record: (row: ControlRecord) => Promise<void>;
  alertOnce: (
    source: string,
    dedupe: Record<string, string>,
    context: Record<string, unknown>,
    message: string,
    severity: 'info' | 'warning' | 'error',
  ) => Promise<void>;
  now: () => Date;
};

/** 帳本 summary.positiveControl 的形狀（不放單號以外的識別資料）。 */
export type PositiveControlSummary = {
  /** 本輪有沒有跑正控。 */
  ran: boolean;
  /** 本輪結果（ran=false 時是沿用的最近一次）；讀不到紀錄時 null。 */
  outcome: ControlOutcome | null;
  /** 本輪 03001 可否改判。 */
  fresh: boolean;
  /** 讀紀錄、挑單或寫紀錄出錯（不含 PayUni 查詢失敗，那是 outcome=failed）。 */
  error: boolean;
  /** 本輪樣本的付款完成時間（看樣本有沒有在變舊）；本輪沒跑或沒挑到樣本時 null。 */
  sampleCompletedAt: string | null;
};

const HOUR = 3_600_000;

/** checkedAt 是否在 now 之前 hours 小時內（含邊界）。解析不了的時間一律 false。 */
export function withinHours(checkedAt: string, now: Date, hours: number): boolean {
  const t = new Date(checkedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= hours * HOUR;
}

/** 最近一次紀錄能不能讓本輪改判。 */
export function isControlFresh(
  latest: { checkedAt: string; outcome: ControlOutcome } | null,
  now: Date,
): boolean {
  return latest !== null && latest.outcome === 'success' &&
    withinHours(latest.checkedAt, now, CONTROL_FRESH_HOURS);
}

/** 本輪要不要跑正控。 */
export function isControlDue(
  latest: { checkedAt: string; outcome: ControlOutcome } | null,
  now: Date,
): boolean {
  if (latest === null || latest.outcome !== 'success') return true;
  const t = new Date(latest.checkedAt).getTime();
  // 恰好 23 小時整算到期；解析不了的時間當到期（重跑一次比沿用來路不明的紀錄安全）。
  return Number.isNaN(t) || now.getTime() - t >= CONTROL_INTERVAL_HOURS * HOUR;
}

/**
 * 判讀正控的查詢回應。比對帳的 classify 嚴格：只接受**同號**交易（不接受
 * 「只有一筆且沒帶 MerTradeNo」的寬鬆規則），DataSource＝B 也不算成功。
 */
export function evaluateControlResponse(
  merTradeNo: string,
  raw: Record<string, unknown>,
  decrypted: Record<string, string> | null,
): { ok: true } | { ok: false; reason: string } {
  const status = String(raw.Status ?? '');
  if (status !== 'SUCCESS') {
    const message = String(raw.Message ?? '');
    return {
      ok: false,
      reason: `query_status:${status || '(empty)'}${message ? ` ${message}` : ''}`,
    };
  }
  if (!decrypted) return { ok: false, reason: 'missing_encrypt_info' };

  const want = merTradeNo.trim();
  const same = (t: unknown) =>
    !!t && typeof t === 'object' &&
    String((t as Record<string, unknown>).MerTradeNo ?? '').trim() === want;

  let trade: Record<string, unknown> | undefined;
  if (decrypted.Result) {
    try {
      const list = JSON.parse(decrypted.Result);
      if (Array.isArray(list)) trade = list.find(same);
    } catch { /* Result 不是 JSON → 看平鋪欄位 */ }
  }
  if (!trade && same(decrypted)) trade = decrypted;
  if (!trade) return { ok: false, reason: 'no_matching_trade' };

  if (String(trade.DataSource ?? '').trim() === 'B') return { ok: false, reason: 'data_source_b' };
  const tradeStatus = String(trade.TradeStatus ?? '').trim();
  if (tradeStatus !== '1') {
    return { ok: false, reason: `trade_status:${tradeStatus || '(empty)'}` };
  }
  return { ok: true };
}

/**
 * 到期就跑一次正控、落檔、失敗告警，回傳本輪 03001 可否改判。
 * 永不擲錯：任何意外都當「不可改判」，不能讓對帳因為正控而停擺。
 */
export async function runPositiveControl(
  deps: PositiveControlDeps,
): Promise<PositiveControlSummary> {
  const now = deps.now();
  let latest: { checkedAt: string; outcome: ControlOutcome } | null;
  try {
    latest = await deps.latest();
  } catch (e) {
    // 讀不到紀錄（例如新 Edge 先於 migration 上線）：不跑正控、不改判。
    await deps.alertOnce(
      CONTROL_ALERT_SOURCE,
      { reason: 'control_read_failed' },
      { error: String(e) },
      '讀取 PayUni 查詢正控紀錄失敗，本輪起 QUERY03001 維持現行判讀（告警＋人工核對）',
      'warning',
    );
    return { ran: false, outcome: null, fresh: false, error: true, sampleCompletedAt: null };
  }

  if (!isControlDue(latest, now)) {
    return {
      ran: false,
      outcome: latest!.outcome,
      fresh: isControlFresh(latest, now),
      error: false,
      sampleCompletedAt: null,
    };
  }

  const checkedAt = now.toISOString();
  let row: ControlRecord;
  let error = false;
  let sample: { tradeNo: string; completedAt: string } | null = null;
  let pickError: unknown = null;
  try {
    sample = await deps.pickSample(now); // 紅燈 stub：尚無 1 小時下限
  } catch (e) {
    pickError = e;
  }
  if (pickError !== null) {
    error = true;
    row = {
      checkedAt,
      outcome: 'failed',
      tradeNo: null,
      sampleCompletedAt: null,
      reason: `pick_failed: ${String(pickError)}`,
    };
  } else if (sample === null) {
    row = { checkedAt, outcome: 'no_sample', tradeNo: null, sampleCompletedAt: null, reason: null };
  } else {
    const { tradeNo, completedAt } = sample;
    const base = { checkedAt, tradeNo, sampleCompletedAt: completedAt };
    try {
      const { raw, decrypted } = await deps.query(tradeNo);
      const verdict = evaluateControlResponse(tradeNo, raw, decrypted);
      row = verdict.ok
        ? { ...base, outcome: 'success', reason: null }
        : { ...base, outcome: 'failed', reason: verdict.reason };
    } catch (e) {
      row = { ...base, outcome: 'failed', reason: `query_threw: ${String(e)}` };
    }
    if (SAMPLE_STALE_DAYS < 0) { // 紅燈 stub：尚無樣本年齡 warning
      await deps.alertOnce(
        CONTROL_ALERT_SOURCE,
        { reason: 'sample_stale' },
        { tradeNo, sampleCompletedAt: completedAt },
        `PayUni 查詢正控的樣本單已超過 ${SAMPLE_STALE_DAYS} 天沒有新的已付款單可挑（最新一張 ${tradeNo} 於 ${completedAt} 完成）。若近期確有會員付款，請檢查新單是否卡在 pending（單號格式可能被改壞）`,
        'warning',
      );
    }
  }

  try {
    await deps.record(row!);
  } catch (e) {
    error = true;
    await deps.alertOnce(
      CONTROL_ALERT_SOURCE,
      { reason: 'control_record_failed' },
      { error: String(e), outcome: row!.outcome },
      '寫入 PayUni 查詢正控紀錄失敗（本輪仍以本輪結果判讀，下一輪會再跑）',
      'warning',
    );
  }

  if (row!.outcome === 'failed') {
    // W6-24：LINE 每則只留前 60 字，行動放最前面。
    await deps.alertOnce(
      CONTROL_ALERT_SOURCE,
      { reason: 'control_failed' },
      { tradeNo: row!.tradeNo, failReason: row!.reason },
      `【PayUni查詢正控失敗・請開Claude查查詢層】棄單自動判讀已停用，QUERY03001 回到人工核對。樣本單 ${
        row!.tradeNo ?? '(挑單失敗)'
      }：${row!.reason}`,
      'error',
    );
  }

  return {
    ran: true,
    outcome: row!.outcome,
    // 本輪結果為準：寫入失敗也不回頭讀舊的 success。
    fresh: row!.outcome === 'success',
    error,
    sampleCompletedAt: row!.sampleCompletedAt,
  };
}

/**
 * 正式路徑的資料庫 deps（payuni_query_controls、payment_orders）。
 * 挑單口徑：status=completed、transaction_id 非空、payuni_response 存有 SUCCESS
 * （notify／return／對帳收斂過，代表 PayUni 端確實有這筆已付款交易），取
 * completed_at 最新、且早於 completedBefore（＝現在 − SAMPLE_MIN_AGE_HOURS）的一張。
 * 沒有 PayUni 存檔的 completed 單（人工開通等）、completed_at 為 null 的單不算樣本。
 * 傳 factory 而非 client：同 scheduledRunDeps 的理由。
 */
// deno-lint-ignore no-explicit-any
export function positiveControlDbDeps(getClient: () => any): Pick<
  PositiveControlDeps,
  'latest' | 'pickSample' | 'record'
> {
  return {
    latest: async () => {
      const { data, error } = await getClient().from('payuni_query_controls')
        .select('checked_at, outcome')
        .order('checked_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`讀取 payuni_query_controls 失敗: ${error.message}`);
      return data
        ? { checkedAt: data.checked_at as string, outcome: data.outcome as ControlOutcome }
        : null;
    },
    pickSample: async (completedBefore) => {
      const { data, error } = await getClient().from('payment_orders')
        .select('transaction_id, completed_at')
        .eq('status', 'completed')
        .lte('completed_at', completedBefore.toISOString())
        .not('transaction_id', 'is', null)
        .eq('payuni_response->>Status', 'SUCCESS')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`挑正控樣本失敗: ${error.message}`);
      if (!data?.transaction_id || !data.completed_at) return null;
      return {
        tradeNo: data.transaction_id as string,
        completedAt: new Date(data.completed_at as string).toISOString(),
      };
    },
    record: async (row) => {
      const { error } = await getClient().from('payuni_query_controls').insert({
        checked_at: row.checkedAt,
        outcome: row.outcome,
        trade_no: row.tradeNo,
        sample_completed_at: row.sampleCompletedAt,
        reason: row.reason,
      });
      if (error) throw new Error(`寫入 payuni_query_controls 失敗: ${error.message}`);
    },
  };
}
