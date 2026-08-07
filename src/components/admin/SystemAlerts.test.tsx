// @vitest-environment jsdom
//
// 系統告警表格的「長內容不得溢出欄位」契約。
//
// 為什麼在這層守 class 字串而不是量盒子：jsdom 沒有排版引擎，算不出
// scrollWidth，也不會套用 Tailwind 產生的 CSS——真正把頁面畫出來量的是
// e2e/test_overflow_sweep.py。這支測試守的是「修法本身沒被改回去」的三個
// 前提條件，它們都是可以靜態驗證的結構事實：
//
//   1. `TableCell` 基底帶 `whitespace-nowrap`（ui/table.tsx），而
//      `white-space: nowrap` 會讓 `break-all` 完全失效——不是覆蓋優先序
//      的問題，是 nowrap 直接取消所有換行機會。內層元素必須自己宣告
//      `whitespace-normal`（white-space 是繼承屬性，子元素顯式宣告即勝出，
//      不必和 td 的 class 比 specificity）。
//   2. 限寬必須落在**內層 block** 上。`max-width` 加在 `<td>` 上，auto
//      table layout 只當提示（CSS 2.1 §17.5.2 明訂 table cell 的
//      min/max-width 效果 undefined），既不約束也不裁切。
//   3. 那個內層元素必須是 block。`<code>`/`<span>` 預設 inline，
//      `max-width` 對 inline 元素無效。
//
// 三個條件缺一，長 JSON 就會以單行畫到隔壁「發生時間」欄位上面。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { SystemAlert } from '@contract';

const apiRequestJson = vi.fn();

vi.mock('../../utils/apiClient', () => ({
  apiRequestJson: (...args: unknown[]) => apiRequestJson(...args),
  buildApiUrl: (path: string) => `https://test.local/functions/v1/api${path}`,
}));

vi.mock('../notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn() }),
}));

const { SystemAlerts } = await import('./SystemAlerts');

// 「最壞但可達」：context 是 jsonb，後端寫什麼就存什麼，長度無上限。
// 這串取自實際出現在正式站的 time_domain_backfill 告警。
const LONG_CONTEXT = {
  shrunk_count: 0,
  subs_updated: 0,
  orders_updated: 0,
  shrunk_subscription_ids: [],
  scanned_at: '2026-07-25T09:56:03.000Z',
};
const LONG_MESSAGE =
  'backfill 完成：orders=0, subscriptions=0, 效期縮短=0，未偵測到需要人工介入的資料，' +
  '下次排程於 2026-07-26 09:00 再次執行';

function seedAlert(overrides: Partial<SystemAlert> = {}) {
  const alert: SystemAlert = {
    id: 'alert-1',
    source: 'time_domain_backfill',
    severity: 'info',
    message: LONG_MESSAGE,
    context: LONG_CONTEXT,
    created_at: '2026-07-25T01:56:03.000Z',
    resolved_at: null,
    ...overrides,
  };
  apiRequestJson.mockResolvedValue({ success: true, data: { alerts: [alert], total: 1 } });
  return alert;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SystemAlerts', () => {
  it('詳細資訊的長 JSON 換行與限寬落在同一個 block 上', async () => {
    seedAlert();
    render(<SystemAlerts />);

    const code = await screen.findByText(JSON.stringify(LONG_CONTEXT));

    // 換行、限寬、block 三者必須在同一個元素上（見檔頭）。
    expect(code.className).toContain('whitespace-normal');
    expect(code.className).toContain('break-all');
    expect(code.className).toContain('block');
    expect(code.className).toMatch(/\bmax-w-/);

    // 限寬掛在 <td> 上會被 auto table layout 忽略——不是「多此一舉」，
    // 是「看起來有做、實際沒有」，比沒寫更糟。
    const cell = code.closest('td');
    expect(cell?.className ?? '').not.toMatch(/\bmax-w-/);
  });

  it('訊息欄的長告警文字同樣換行且限寬', async () => {
    seedAlert();
    render(<SystemAlerts />);

    const message = await screen.findByText(LONG_MESSAGE);

    expect(message.className).toContain('whitespace-normal');
    expect(message.className).toContain('block');
    expect(message.className).toMatch(/\bmax-w-/);
  });

  it('發生時間維持不換行', async () => {
    seedAlert();
    render(<SystemAlerts />);

    // 反向防護：修長內容欄位時不該順手把日期欄的 nowrap 一起拆掉——
    // 「2026/07/25 09:56:03」被折成兩行是另一種難讀。
    await waitFor(() => expect(screen.getByText(/2026\/07\/25/)).toBeTruthy());
    const timeCell = screen.getByText(/2026\/07\/25/).closest('td');
    expect(timeCell?.className ?? '').toContain('whitespace-nowrap');
  });
});
