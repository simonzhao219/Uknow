// ============================================================
// 台灣時間（Asia/Taipei）日期工具 —— 前端唯一實作
// ============================================================
//
// 設計原則：
//   * 所有會員/業務日期一律以台灣日曆日顯示，不隨瀏覽器時區漂移。
//     一律用 Intl API 以 IANA 時區換算，禁止 `+8 小時` 手工偏移、
//     禁止 `toISOString().slice(0, 10)`（那是 UTC 日，台灣晚間會
//     少一天）。
//   * 效期計算的 SQL 主實作在 migration 20260718000001 的
//     compute_subscription_period；這裡的 subscriptionLastDay 是
//     鏡射版，只用於前端預覽——最終寫進資料庫的值一律出自 SQL。
//   * 後端有一份同邏輯的副本 supabase/functions/api/tw-dates.ts
//     （Vite 與 Supabase deploy bundling 的邊界使然，兩邊不能互相
//     import）。改這裡記得同步那邊。
// ============================================================

const TW_DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 某個時點落在台灣的哪個日曆日，回傳 'YYYY-MM-DD' */
export function twDayOf(at: Date | string | number = new Date()): string {
  return TW_DAY_FMT.format(new Date(at));
}

/** 顯示用日期 'YYYY/MM/DD'（台灣日曆日） */
export function formatTwDate(at: Date | string | number): string {
  return twDayOf(at).replaceAll('-', '/');
}

/** 顯示用完整時間 'YYYY/MM/DD HH:mm:ss'（台灣時間） */
export function formatTwTimestamp(at: Date | string | number): string {
  const d = new Date(at);
  const time = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
  return `${formatTwDate(d)} ${time}`;
}

function parseDay(day: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error(`twDate: 非法的日期字串 '${day}'（需 YYYY-MM-DD）`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function fmtDay(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 日曆日 + n 天（純日期運算，與時區無關） */
export function twDayPlusDays(day: string, n: number): string {
  const [y, m, d] = parseDay(day);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmtDay(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * 日曆日 + n 年。跟 Postgres `date + interval 'n year'` 同語意：
 * 2/29 起算遇到非閏年夾到 2/28（不是滾到 3/1）。
 */
export function twDayPlusYears(day: string, n: number): string {
  const [y, m, d] = parseDay(day);
  const targetY = y + n;
  const daysInMonth = new Date(Date.UTC(targetY, m, 0)).getUTCDate();
  return fmtDay(targetY, m, Math.min(d, daysInMonth));
}

/**
 * 訂閱效期最後一天：鏡射 SQL compute_subscription_period 的規則
 * greatest((D + 1yr) − 1 天, (D − 1 天) + 1yr)。
 * 平常 = D + 1 年 − 1 天（2026-07-16 → 2027-07-15）。
 */
export function subscriptionLastDay(anchorDay: string): string {
  const a = twDayPlusDays(twDayPlusYears(anchorDay, 1), -1);
  const b = twDayPlusYears(twDayPlusDays(anchorDay, -1), 1);
  return a >= b ? a : b; // ISO 字串可直接字典序比較
}

/** 台灣某日 00:00:00 的時點 */
export function twStartOfDayInstant(day: string): Date {
  parseDay(day); // 驗證格式
  return new Date(`${day}T00:00:00+08:00`);
}

/** 台灣某日 23:59:59.999 的時點（JS 毫秒精度；DB 端是微秒） */
export function twEndOfDayInstant(day: string): Date {
  return new Date(twStartOfDayInstant(day).getTime() + 86_400_000 - 1);
}
