// ============================================================
// 補繳計畫（backfillPlan）的共用案例表 —— 兩側測試同吃這一份
// ============================================================
//
// 與 @name-cases 同一個模式:檔案物理放在 Deno 側,前端經 vite/tsconfig
// 的 `@backfill-cases` alias 讀入。backfillPlan 本身是雙副本
// （api/tw-dates.ts 與 src/utils/twDate.ts,Q4 裁決不收斂）,案例表是
// 兩副本不漂移的唯一保證——改規則先改這裡,兩邊測試一起紅。
//
// 規則(plan renewal-backfill A1-A4):
//   * extend 錨點 = 前一期最後一天的隔天,一筆一年,字面接續不做
//     greatest(now()) 補救;算出來仍在過去也照給。
//   * backfillCount = 要連續付幾筆才會 active(第一筆迄日 >= today 即 1)。
//   * 到期日當天仍是 active(隔天才 expired)→ lastEndDay >= today 時
//     backfillCount = 0、expiredForMonths 固定 0。
//   * expiredForMonths = 已過期的完整月數:最大的 m 使
//     (lastEndDay + m 個月,月底夾擠) <= today。
// ============================================================

export type BackfillCaseExpected = {
  extendAnchorDay: string;
  extendEndDay: string;
  backfillCount: number;
  backfillFinalEndDay: string;
  expiredForMonths: number;
  installments: ReadonlyArray<{ anchorDay: string; endDay: string }>;
};

export type BackfillCase = {
  name: string;
  lastEndDay: string;
  today: string;
  expected: BackfillCaseExpected;
};

export const BACKFILL_CASES: readonly BackfillCase[] = [
  {
    // AC-1 核心情境:規劃書 §1 的三筆補繳表。
    name: '過期兩年一個月：三筆接續補繳，週年日 04-02 保留',
    lastEndDay: '2024-04-02',
    today: '2026-05-02',
    expected: {
      extendAnchorDay: '2024-04-03',
      extendEndDay: '2025-04-02',
      backfillCount: 3,
      backfillFinalEndDay: '2027-04-02',
      expiredForMonths: 25,
      installments: [
        { anchorDay: '2024-04-03', endDay: '2025-04-02' },
        { anchorDay: '2025-04-03', endDay: '2026-04-02' },
        { anchorDay: '2026-04-03', endDay: '2027-04-02' },
      ],
    },
  },
  {
    name: '過期未滿一年：一筆即補回 active',
    lastEndDay: '2026-02-02',
    today: '2026-05-02',
    expected: {
      extendAnchorDay: '2026-02-03',
      extendEndDay: '2027-02-02',
      backfillCount: 1,
      backfillFinalEndDay: '2027-02-02',
      expiredForMonths: 3,
      installments: [{ anchorDay: '2026-02-03', endDay: '2027-02-02' }],
    },
  },
  {
    // 到期日當天仍 active(隔天才 expired)。
    name: '剛好今天到期：仍 active，backfillCount 0、expiredForMonths 0',
    lastEndDay: '2026-05-02',
    today: '2026-05-02',
    expected: {
      extendAnchorDay: '2026-05-03',
      extendEndDay: '2027-05-02',
      backfillCount: 0,
      backfillFinalEndDay: '2026-05-02',
      expiredForMonths: 0,
      installments: [],
    },
  },
  {
    name: 'active 未到期：僅預告下一筆錨點與迄日',
    lastEndDay: '2027-01-15',
    today: '2026-05-02',
    expected: {
      extendAnchorDay: '2027-01-16',
      extendEndDay: '2028-01-15',
      backfillCount: 0,
      backfillFinalEndDay: '2027-01-15',
      expiredForMonths: 0,
      installments: [],
    },
  },
  {
    // 跨年 + 過期未滿一個完整月。
    name: '跨年到期：錨點落在 01-01，過期十天完整月數為 0',
    lastEndDay: '2025-12-31',
    today: '2026-01-10',
    expected: {
      extendAnchorDay: '2026-01-01',
      extendEndDay: '2026-12-31',
      backfillCount: 1,
      backfillFinalEndDay: '2026-12-31',
      expiredForMonths: 0,
      installments: [{ anchorDay: '2026-01-01', endDay: '2026-12-31' }],
    },
  },
  {
    // 閏日到期:每筆迄日走 compute_subscription_period 的對用戶有利分支
    // (greatest 規則),02-28 錨定不漂移。
    name: '閏日 2024-02-29 到期：三筆補繳迄日都落在 02-28',
    lastEndDay: '2024-02-29',
    today: '2026-05-02',
    expected: {
      extendAnchorDay: '2024-03-01',
      extendEndDay: '2025-02-28',
      backfillCount: 3,
      backfillFinalEndDay: '2027-02-28',
      expiredForMonths: 26,
      installments: [
        { anchorDay: '2024-03-01', endDay: '2025-02-28' },
        { anchorDay: '2025-03-01', endDay: '2026-02-28' },
        { anchorDay: '2026-03-01', endDay: '2027-02-28' },
      ],
    },
  },
  {
    // 非閏年 1/31:過期月數的「+1 個月」夾到 02-28。
    name: '非閏年 01-31 到期：完整月數夾到 02-28 計 1',
    lastEndDay: '2025-01-31',
    today: '2025-03-15',
    expected: {
      extendAnchorDay: '2025-02-01',
      extendEndDay: '2026-01-31',
      backfillCount: 1,
      backfillFinalEndDay: '2026-01-31',
      expiredForMonths: 1,
      installments: [{ anchorDay: '2025-02-01', endDay: '2026-01-31' }],
    },
  },
  {
    // 月底 3/31 → 30 天月:+1 個月夾到 04-30。
    name: '03-31 到期遇 30 天月：完整月數夾到 04-30 計 1',
    lastEndDay: '2025-03-31',
    today: '2025-05-01',
    expected: {
      extendAnchorDay: '2025-04-01',
      extendEndDay: '2026-03-31',
      backfillCount: 1,
      backfillFinalEndDay: '2026-03-31',
      expiredForMonths: 1,
      installments: [{ anchorDay: '2025-04-01', endDay: '2026-03-31' }],
    },
  },
] as const;
