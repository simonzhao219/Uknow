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

export const CONTROL_ALERT_SOURCE = 'payuni-positive-control';

export type ControlOutcome = 'success' | 'failed' | 'no_sample';

export type ControlRecord = {
  checkedAt: string;
  outcome: ControlOutcome;
  tradeNo: string | null;
  reason: string | null;
};

export type PositiveControlDeps = {
  /** 最近一次正控紀錄；沒有紀錄回 null；讀取失敗擲錯。 */
  latest: () => Promise<{ checkedAt: string; outcome: ControlOutcome } | null>;
  /** 本環境最近一張 completed 且有 PayUni SUCCESS 存檔的單號；沒有回 null；讀取失敗擲錯。 */
  pickSample: () => Promise<string | null>;
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
  void latest;
  void now;
  return false; // 紅燈 stub
}

/** 本輪要不要跑正控。 */
export function isControlDue(
  latest: { checkedAt: string; outcome: ControlOutcome } | null,
  now: Date,
): boolean {
  void latest;
  void now;
  return true; // 紅燈 stub
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
  void merTradeNo;
  void raw;
  void decrypted;
  return { ok: false, reason: 'not_implemented' }; // 紅燈 stub
}

/**
 * 到期就跑一次正控、落檔、失敗告警，回傳本輪 03001 可否改判。
 * 永不擲錯：任何意外都當「不可改判」，不能讓對帳因為正控而停擺。
 */
export function runPositiveControl(
  deps: PositiveControlDeps,
): Promise<PositiveControlSummary> {
  void deps;
  return Promise.resolve({ ran: false, outcome: null, fresh: false, error: false }); // 紅燈 stub
}

/**
 * 正式路徑的資料庫 deps（payuni_query_controls、payment_orders）。
 * 挑單口徑：status=completed、transaction_id 非空、payuni_response 存有 SUCCESS
 * （notify／return／對帳收斂過，代表 PayUni 端確實有這筆已付款交易），取
 * completed_at 最新的一張。沒有 PayUni 存檔的 completed 單（人工開通等）不算樣本。
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
    pickSample: async () => {
      const { data, error } = await getClient().from('payment_orders')
        .select('transaction_id')
        .eq('status', 'completed')
        .not('transaction_id', 'is', null)
        .eq('payuni_response->>Status', 'SUCCESS')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`挑正控樣本失敗: ${error.message}`);
      return (data?.transaction_id as string | undefined) ?? null;
    },
    record: async (row) => {
      const { error } = await getClient().from('payuni_query_controls').insert({
        checked_at: row.checkedAt,
        outcome: row.outcome,
        trade_no: row.tradeNo,
        reason: row.reason,
      });
      if (error) throw new Error(`寫入 payuni_query_controls 失敗: ${error.message}`);
    },
  };
}
