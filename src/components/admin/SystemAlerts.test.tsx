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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import type { AdminBusy } from './adminBusy';
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
      // 後端明確拒絕（4xx）：照舊說「標記失敗，請重試」。不帶 status 的錯誤歸「結果不明」。
      if (opts.resolveFails) throw Object.assign(new Error('boom'), { status: 409 });
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

  it('回應形狀不對時也是錯誤態，不是「目前沒有未處理的告警」', async () => {
    // 監控面板的「空」必須是真的空。形狀不合（契約漂移、代理回了別的東西）
    // 若退回空清單，維運看到的是一切正常——fail-open 的監控等於沒有監控。
    apiRequestJson.mockResolvedValue({ data: { items: [], total: 0 } });
    render(<SystemAlerts />);

    expect(await screen.findByText('載入告警失敗，請檢查網路後再試')).toBeTruthy();
    expect(screen.queryByText('目前沒有未處理的告警')).toBeNull();
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
    apiRequestJson.mockImplementation(async (_url: unknown, init?: { method?: string }) => {
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

  it('context 的 code 帶 break-all——長 jsonb 不得單行畫出容器', async () => {
    // 回歸釘。桌面那顆 code 已有同型斷言（本檔上方），手機這顆先前只斷言
    // 「點開後文字出現」，零 class 斷言:拿掉 break-all 時 vitest、溢版巡檢、
    // 版面測試三道閘門全綠，而展開態實測 +309px。巡檢已補展開態路由，
    // 這條是成本更低的第二道網。
    mockApi([alert()]);
    render(<SystemAlerts />);
    const card = await screen.findByRole('group', { name: /process_successful_payment/ });
    fireEvent.click(within(card).getByRole('button', { name: '詳細資訊' }));
    const code = await within(card).findByText(/PU00000001/);
    expect(code.className).toContain('break-all');
  });

  it('標記已處理在卡片內可點', async () => {
    mockApi([alert()]);
    render(<SystemAlerts />);
    const card = await screen.findByRole('group', { name: /process_successful_payment/ });
    expect(within(card).getByRole('button', { name: '標記已處理' })).toBeTruthy();
  });
});

// --- S5 階段 6：工具列、背景更新、寫入協議 -----------------------------------------------
//
// 告警不快取、不走共用的分頁 hook（業主裁決 H），只接上共用的呈現：AdminToolbar（沒有篩選、
// 重新整理靠右）、手動重新整理與標記後的重讀在背景進行（保留列表）、失敗且有列時陳舊提示、
// 首次載入共用骨架。標記走 runAdminWrite：成功與結果不明重讀一次（K3），後端拒絕只說出來。
// 讀取回 403 時清空列表並通知殼層清空快取（onAccessLost）。

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** GET 每次都掛著（由測試結算），POST 交給 `resolve`。 */
function heldReads(resolve: () => Promise<unknown> = async () => ({ success: true })) {
  const reads: ReturnType<typeof deferred<SystemAlertsResponse>>[] = [];
  apiRequestJson.mockImplementation((_url: unknown, init?: { method?: string }) => {
    if (init?.method === 'POST') return resolve();
    const d = deferred<SystemAlertsResponse>();
    reads.push(d);
    return d.promise;
  });
  return reads;
}

const listRegion = () => screen.getByRole('region', { name: '告警列表' });
const rowOf = (message: string) => screen.getByRole('row', { name: new RegExp(message) });

function fakeBusy(): AdminBusy & { release: ReturnType<typeof vi.fn> } {
  const release = vi.fn();
  return {
    locked: false,
    noteId: '',
    release,
    startWrite: vi.fn(() => release),
    startExport: vi.fn(() => ({ progress: vi.fn(), end: vi.fn() })),
  };
}

describe('SystemAlerts 工具列與背景更新', () => {
  it('工具列只有重新整理、沒有篩選，鈕靠右', async () => {
    mockApi([alert()]);
    const { container } = render(<SystemAlerts />);
    await screen.findByText('付款處理失敗，需人工介入');
    const toolbar = container.querySelector<HTMLElement>('[data-slot="admin-toolbar"]');
    expect(toolbar).not.toBeNull();
    if (!toolbar) return;
    expect(toolbar.classList.contains('justify-end')).toBe(true);
    expect(within(toolbar).getByRole('button', { name: '重新整理' })).toBeTruthy();
  });

  it('首次載入是共用骨架，帶名稱', () => {
    heldReads();
    render(<SystemAlerts />);
    expect(screen.getByRole('status', { name: '載入告警中' })).toBeTruthy();
  });

  it('手動重新整理在背景進行、保留列表，文字「正在更新」→「已更新 HH:mm」', async () => {
    const reads = heldReads();
    render(<SystemAlerts />);
    await act(async () => reads[0].resolve(listResponse([alert()])));

    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    expect(screen.getByText('正在更新')).toBeTruthy();
    expect(screen.queryByRole('status', { name: '載入告警中' })).toBeNull();
    expect(screen.getByText('付款處理失敗，需人工介入')).toBeTruthy();
    expect(listRegion().getAttribute('aria-busy')).toBe('true');

    await act(async () => reads[1].resolve(listResponse([alert()])));
    expect(screen.getByText(/^已更新 \d\d:\d\d$/)).toBeTruthy();
    expect(listRegion().getAttribute('aria-busy')).not.toBe('true');
  });

  it('標記已處理後在背景重讀，列表不換骨架', async () => {
    const reads = heldReads();
    render(<SystemAlerts />);
    await act(async () => reads[0].resolve(listResponse([alert()])));
    fireEvent.click(screen.getByRole('button', { name: '標記已處理' }));
    await waitFor(() => expect(reads).toHaveLength(2));
    expect(screen.queryByRole('status', { name: '載入告警中' })).toBeNull();
    expect(screen.getByText('付款處理失敗，需人工介入')).toBeTruthy();
  });

  it('背景更新失敗且有列時保留舊列並提示，附重試', async () => {
    const reads = heldReads();
    render(<SystemAlerts />);
    await act(async () => reads[0].resolve(listResponse([alert()])));
    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await act(async () => reads[1].reject(new Error('連線中斷')));

    expect(screen.getByText(/更新失敗，以下是剛剛的資料/)).toBeTruthy();
    expect(screen.getByText('付款處理失敗，需人工介入')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
    expect(listRegion().getAttribute('data-stale')).toBe('true');
  });

  it('沒有列時讀取失敗用共用錯誤區：中性字與流程鈕的重新載入', async () => {
    apiRequestJson.mockRejectedValue(new Error('network down'));
    render(<SystemAlerts />);
    const alertBox = await screen.findByRole('alert');
    expect(
      within(alertBox)
        .getByText('載入告警失敗，請檢查網路後再試')
        .classList.contains('text-muted-foreground'),
    ).toBe(true);
    expect(
      within(alertBox).getByRole('button', { name: '重新載入' }).classList.contains('bg-primary'),
    ).toBe(true);
  });

  it('讀取回 403 時清空列表、顯示錯誤，並通知殼層清空快取', async () => {
    const onAccessLost = vi.fn();
    const reads = heldReads();
    render(<SystemAlerts onAccessLost={onAccessLost} />);
    await act(async () => reads[0].resolve(listResponse([alert()])));
    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await act(async () => reads[1].reject(Object.assign(new Error('沒有權限'), { status: 403 })));

    expect(screen.queryByText('付款處理失敗，需人工介入')).toBeNull();
    expect(screen.getByText('載入告警失敗，請檢查網路後再試')).toBeTruthy();
    expect(onAccessLost).toHaveBeenCalledTimes(1);
  });
});

describe('SystemAlerts 標記已處理', () => {
  it('沒收到伺服器確認時提醒確認告警列表，並重讀一次', async () => {
    apiRequestJson.mockImplementation(async (_url: unknown, init?: { method?: string }) => {
      if (init?.method === 'POST') throw new TypeError('Failed to fetch');
      return listResponse([alert()]);
    });
    render(<SystemAlerts />);
    fireEvent.click(await screen.findByRole('button', { name: '標記已處理' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        '未收到伺服器確認，結果不明，請確認告警列表',
        'warning',
      ),
    );
    const reads = () =>
      apiRequestJson.mock.calls.filter(([, init]) => !(init as { method?: string })?.method);
    await waitFor(() => expect(reads()).toHaveLength(2));
  });

  it('被後端拒絕時只說出來，不重讀', async () => {
    mockApi([alert()], { resolveFails: true });
    render(<SystemAlerts />);
    fireEvent.click(await screen.findByRole('button', { name: '標記已處理' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('標記失敗，請重試', 'error'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const reads = apiRequestJson.mock.calls.filter(
      ([, init]) => !(init as { method?: string } | undefined)?.method,
    );
    expect(reads).toHaveLength(1);
  });

  it('不受閘門約束：背景更新途中照常可按', async () => {
    const reads = heldReads();
    render(<SystemAlerts />);
    await act(async () => reads[0].resolve(listResponse([alert()])));
    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    const mark = screen.getByRole('button', { name: '標記已處理' });
    expect(mark.hasAttribute('disabled')).toBe(false);
    expect(mark.getAttribute('aria-disabled')).toBeNull();
  });

  it('寫入期間呼叫 busy，寫入一結算就釋放', async () => {
    const busy = fakeBusy();
    const pending = deferred<unknown>();
    const reads = heldReads(() => pending.promise);
    render(<SystemAlerts busy={busy} />);
    await act(async () => reads[0].resolve(listResponse([alert()])));
    fireEvent.click(screen.getByRole('button', { name: '標記已處理' }));
    await waitFor(() => expect(busy.startWrite).toHaveBeenCalledTimes(1));
    expect(busy.release).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ success: true }));
    expect(busy.release).toHaveBeenCalledTimes(1);
  });

  it('標記後那一則離開列表時，焦點移到下一則', async () => {
    const reads = heldReads();
    render(<SystemAlerts />);
    const second = alert({ id: 'a2', message: '對帳錯誤，金額不符' });
    await act(async () => reads[0].resolve(listResponse([alert(), second])));
    fireEvent.click(within(rowOf('付款處理失敗')).getByRole('button', { name: '標記已處理' }));
    await waitFor(() => expect(reads).toHaveLength(2));
    await act(async () => reads[1].resolve(listResponse([second])));
    expect(document.activeElement).toBe(rowOf('對帳錯誤'));
  });
});
