// @vitest-environment jsdom
//
// 系統告警 tab。這支測試補的是 e2e 去重盤點揪出的覆蓋缺口
// （friction-log 2026-08-07）：這個元件先前**沒有任何元件測試**，
// 唯一的前端防線是 admin 的 e2e 情境，後端則只有 Deno 的
// `system-alerts-api.test.ts`（驗 API，證不到畫面）。
//
// 這張表收的是「需要人工介入」的事件（付款處理失敗、對帳錯誤、金額不符）。
// 它的失效模式很安靜：**告警只進不出、或畫面根本沒把它畫出來，都不會有人
// 收到通知**——維運以為沒事，其實是看板壞了。所以這裡釘的是三態
// （載入／錯誤／空）與「標記已處理之後真的從清單消失」。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SystemAlert, SystemAlertsResponse } from '@contract';

const apiRequestJson = vi.fn();
const showToast = vi.fn();

vi.mock('../../utils/apiClient', () => ({
  apiRequestJson: (...args: unknown[]) => apiRequestJson(...args),
  buildApiUrl: (path: string) => path,
}));
vi.mock('../notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast }),
}));

import { stubMediaQuery } from '../../test-utils/stubMediaQuery';
import { SystemAlerts } from './SystemAlerts';

function alert(over: Partial<SystemAlert> = {}): SystemAlert {
  return {
    id: 'a1',
    source: 'process_successful_payment',
    severity: 'error',
    message: '付款處理失敗，需人工介入',
    context: { tradeNo: 'PU00000001' },
    created_at: '2026-08-01T02:00:00Z',
    resolved_at: null,
    ...over,
  };
}

function listResponse(alerts: SystemAlert[]): SystemAlertsResponse {
  return { success: true, data: { alerts, total: alerts.length } };
}

/** 預設：GET 回 alerts，POST（標記）成功。個別測試再覆寫。 */
function mockApi(alerts: SystemAlert[], opts: { resolveFails?: boolean } = {}) {
  apiRequestJson.mockImplementation(async (_url: unknown, init?: { method?: string }) => {
    if (init?.method === 'POST') {
      if (opts.resolveFails) throw new Error('boom');
      return { success: true };
    }
    return listResponse(alerts);
  });
}

beforeEach(() => {
  apiRequestJson.mockReset();
  showToast.mockReset();
});
afterEach(cleanup);

beforeEach(() => {
  stubMediaQuery(true);
});

describe('SystemAlerts', () => {
  it('載入失敗時顯示錯誤態與重新載入,不是假裝沒有告警', async () => {
    // 這是最危險的一種失效：載入失敗若渲染成空清單，維運會讀成
    // 「目前沒有未處理的告警」——把故障讀成健康。
    apiRequestJson.mockRejectedValue(new Error('network down'));
    render(<SystemAlerts />);

    expect(await screen.findByText('載入告警失敗，請檢查網路後再試')).toBeTruthy();
    expect(screen.queryByText('目前沒有未處理的告警')).toBeNull();
    expect(screen.getByRole('button', { name: '重新載入' })).toBeTruthy();
  });

  it('載入失敗後按重新載入會重抓', async () => {
    apiRequestJson.mockRejectedValueOnce(new Error('network down'));
    render(<SystemAlerts />);
    await screen.findByText('載入告警失敗，請檢查網路後再試');

    mockApi([alert()]);
    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));

    expect(await screen.findByText('付款處理失敗，需人工介入')).toBeTruthy();
  });

  it('沒有未處理告警時顯示空態', async () => {
    mockApi([]);
    render(<SystemAlerts />);

    expect(await screen.findByText('目前沒有未處理的告警')).toBeTruthy();
  });

  it('列出告警的等級、來源、訊息、context 與時間', async () => {
    mockApi([alert()]);
    render(<SystemAlerts />);

    expect(await screen.findByText('付款處理失敗，需人工介入')).toBeTruthy();
    expect(screen.getByText('process_successful_payment')).toBeTruthy();
    expect(screen.getByText('error')).toBeTruthy();
    // context 是 jsonb，維運要靠它定位那一筆訂單——不能只顯示訊息。
    expect(screen.getByText(/PU00000001/)).toBeTruthy();
  });

  it('三種等級各自顯示對應標籤', async () => {
    mockApi([
      alert({ id: 'a1', severity: 'error', message: '甲' }),
      alert({ id: 'a2', severity: 'warning', message: '乙' }),
      alert({ id: 'a3', severity: 'info', message: '丙' }),
    ]);
    render(<SystemAlerts />);

    expect(await screen.findByText('error')).toBeTruthy();
    expect(screen.getByText('warning')).toBeTruthy();
    expect(screen.getByText('info')).toBeTruthy();
  });

  it('標記已處理後送出 POST、回報成功,且該筆從清單消失', async () => {
    // 「同類事件才會再次告警」是這個動作的意義（見元件說明），所以標記完
    // 一定要重抓——不重抓的話畫面留著已處理的那筆，維運會重複處理。
    let resolved = false;
    apiRequestJson.mockImplementation(async (url: unknown, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        resolved = true;
        return { success: true };
      }
      return listResponse(resolved ? [] : [alert()]);
    });
    render(<SystemAlerts />);

    fireEvent.click(await screen.findByRole('button', { name: '標記已處理' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('已標記處理', 'success'));
    expect(apiRequestJson).toHaveBeenCalledWith('/admin/system-alerts/a1/resolve', {
      method: 'POST',
    });
    expect(await screen.findByText('目前沒有未處理的告警')).toBeTruthy();
  });

  it('標記失敗時說出來,不靜默吞掉', async () => {
    mockApi([alert()], { resolveFails: true });
    render(<SystemAlerts />);

    fireEvent.click(await screen.findByRole('button', { name: '標記已處理' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('標記失敗，請重試', 'error'));
    // 失敗就該留在清單上等人再試。
    expect(screen.getByText('付款處理失敗，需人工介入')).toBeTruthy();
  });

  it('長訊息與長 context 都以可換行的區塊呈現,不會單行畫到隔壁欄位', async () => {
    // 回歸釘（2026-08-07 修正）：TableCell 基底帶 whitespace-nowrap，
    // 內層必須同時具備 block + 限寬 + whitespace-normal/break，缺一項長內容
    // 就會以單行畫到隔壁欄位的文字上面。這三個 class 是修正本身，不是裝飾。
    const long = '對帳錯誤：'.repeat(40);
    mockApi([alert({ message: long, context: { detail: 'x'.repeat(400) } })]);
    render(<SystemAlerts />);

    const messageEl = await screen.findByText(long);
    expect(messageEl.className).toContain('block');
    expect(messageEl.className).toContain('whitespace-normal');
    expect(messageEl.className).toMatch(/break-(words|all)/);
    expect(messageEl.className).toMatch(/max-w-/);

    const contextEl = screen.getByText(/"detail"/);
    expect(contextEl.className).toContain('block');
    expect(contextEl.className).toContain('whitespace-normal');
    expect(contextEl.className).toMatch(/break-(words|all)/);
    expect(contextEl.className).toMatch(/max-w-/);
  });
});

// --- 手機版（階段 4） --------------------------------------------------------
describe('SystemAlerts 手機版', () => {
  beforeEach(() => {
    stubMediaQuery(false);
  });

  it('不渲染 table，改以每筆一張卡呈現', async () => {
    mockApi([alert()]);
    const { container } = render(<SystemAlerts />);
    await screen.findByText('付款處理失敗，需人工介入');
    expect(container.querySelector('table')).toBeNull();
  });

  it('訊息全文可讀，context 收在預設收合的 Collapsible 裡', async () => {
    mockApi([alert()]);
    render(<SystemAlerts />);
    const card = await screen.findByRole('group', { name: /process_successful_payment/ });
    expect(within(card).getByText('付款處理失敗，需人工介入')).toBeTruthy();
    // 預設收合:context 是 jsonb 原文，長度無上限，攤開會把卡片撐爆。
    expect(within(card).queryByText(/PU00000001/)).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: '詳細資訊' }));
    await waitFor(() => expect(within(card).getByText(/PU00000001/)).toBeTruthy());
  });

  it('標記已處理在卡片內可點', async () => {
    mockApi([alert()]);
    render(<SystemAlerts />);
    const card = await screen.findByRole('group', { name: /process_successful_payment/ });
    expect(within(card).getByRole('button', { name: '標記已處理' })).toBeTruthy();
  });
});
