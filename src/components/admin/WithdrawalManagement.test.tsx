// @vitest-environment jsdom
//
// 提領作業台。這支測試守的是**匯款這件事實際怎麼做**，不是「畫面有沒有渲染」：
//
//   1. **同屏**（W1）——admin 開著網銀打字，姓名／身分證／銀行代號／帳號／
//      匯款金額必須同時在眼前，帳號還要能一鍵複製。要捲動或點開才看得到，
//      就是逼人在兩個視窗間來回對帳，那正是打錯帳號的來源。
//   2. **批次確認要列姓名**（§4 危險動作）——這個動作不可回退，金額相近時
//      光看「12 筆共 $36,000」不會露出異常，看到名字才會。
//   3. **「全選」限已載入頁**——悄悄擴大到未載入的頁，等於使用者以為勾了 20 筆
//      實際送出 200 筆。
//   4. **手機鎖「標記已匯款」**（W8）——那個動作需要同時開著網銀，手機上做
//      不到；但退件與代為完成是客服當下就該能處理的事，不該一起鎖。
//   5. **不得靜默截斷**（ui-ux-guidelines §5）——「已顯示 X / Y 筆」。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminWithdrawalRecord, AdminWithdrawalsResponse } from '@contract';
import { WithdrawalManagement, type WithdrawalQuery } from './WithdrawalManagement';

afterEach(cleanup);

type Page = AdminWithdrawalsResponse['data'];

// jsdom 沒有 matchMedia。預設回「桌機」，手機情境的測試自己覆寫。
function stubMediaQuery(isDesktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: isDesktop,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  stubMediaQuery(true);
  // jsdom 沒有 Blob URL API；CSV 下載會用到它。不替身掉會變成 unhandled
  // error，讓整個檔案的結果失去可信度（vitest 自己也會這麼警告）。
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
});

function record(over: Partial<AdminWithdrawalRecord> = {}): AdminWithdrawalRecord {
  return {
    id: 'w1',
    userId: 'u1',
    userName: '王小明',
    userPhone: '0912345678',
    idNumber: 'A123456789',
    amount: 1000,
    fee: 15,
    status: 'pending',
    bankCode: '822',
    bankAccount: '1234567890123',
    note: null,
    events: [],
    requestedAt: '2026-08-01T02:00:00Z',
    processedAt: null,
    completedAt: null,
    idCardFrontUrl: null,
    idCardBackUrl: null,
    ...over,
  };
}

function page(over: Partial<Page> = {}): Page {
  const withdrawals = over.withdrawals ?? [record()];
  return {
    withdrawals,
    total: over.total ?? withdrawals.length,
    limit: over.limit ?? 50,
    offset: over.offset ?? 0,
    stats: over.stats ?? {
      pendingAmount: 1000,
      byStatus: { pending: 1, awaiting_collection: 0, completed: 0, rejected: 0 },
    },
  };
}

function renderConsole(
  opts: {
    loadWithdrawals?: (params: WithdrawalQuery) => Promise<Page>;
    updateStatus?: (id: string, status: string, note?: string, bankRef?: string) => Promise<void>;
    batchMarkPaid?: (
      items: { id: string; bankRef?: string }[],
    ) => Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }>;
  } = {},
) {
  return render(
    <WithdrawalManagement
      loadWithdrawals={opts.loadWithdrawals ?? (async () => page())}
      updateStatus={opts.updateStatus ?? (async () => {})}
      batchMarkPaid={opts.batchMarkPaid ?? (async () => ({ succeeded: [], failed: [] }))}
    />,
  );
}

describe('WithdrawalManagement', () => {
  it('取資料期間顯示載入態', async () => {
    let resolve!: (v: Page) => void;
    const pendingPage = new Promise<Page>((r) => {
      resolve = r;
    });
    renderConsole({ loadWithdrawals: () => pendingPage });

    expect(screen.getByRole('status', { name: '載入提領申請中' })).toBeTruthy();
    resolve(page({ withdrawals: [] }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('取資料失敗時顯示錯誤態並提供重試', async () => {
    const load = vi
      .fn<(params: WithdrawalQuery) => Promise<Page>>()
      .mockRejectedValueOnce(new Error('連線失敗'))
      .mockResolvedValueOnce(page());
    renderConsole({ loadWithdrawals: load });

    await screen.findByText('連線失敗');
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    // findAllByText：重試成功後姓名同時出現在同屏作業面板與表格列，
    // 而那正是 W1 要的形狀，不是重複渲染的瑕疵。
    await screen.findAllByText('王小明');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('沒有任何申請時顯示空態而非空白表格', async () => {
    renderConsole({ loadWithdrawals: async () => page({ withdrawals: [], total: 0 }) });
    expect(await screen.findByText('目前沒有提領申請')).toBeTruthy();
  });

  it('作業面板同屏顯示姓名、身分證、銀行代號、帳號與匯款金額', async () => {
    renderConsole();
    const panel = await screen.findByRole('region', { name: '匯款作業面板' });

    expect(within(panel).getByText('王小明')).toBeTruthy();
    expect(within(panel).getByText('A123456789')).toBeTruthy();
    expect(within(panel).getByText('822')).toBeTruthy();
    expect(within(panel).getByText('1234567890123')).toBeTruthy();
    expect(within(panel).getByText('$1,000')).toBeTruthy();
  });

  it('收款帳號可一鍵複製', async () => {
    // 攔 execCommand 而非 navigator.clipboard：後者是 src/utils/clipboard.ts
    // **刻意排除**的路徑（LINE 等 in-app 瀏覽器會擋掉，而本專案使用者大量
    // 從 LINE 進來）。攔錯層就等於在作業台重新引入階段 2.2 排掉的失效模式。
    const copied: string[] = [];
    document.execCommand = vi.fn(() => {
      copied.push((document.activeElement as HTMLTextAreaElement)?.value ?? '');
      return true;
    });
    renderConsole();

    const panel = await screen.findByRole('region', { name: '匯款作業面板' });
    fireEvent.click(within(panel).getByRole('button', { name: '複製收款帳號' }));
    await waitFor(() => expect(copied).toContain('1234567890123'));
  });

  it('待匯款總額用匯款金額加總，不含平台收的手續費', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({
          withdrawals: [record(), record({ id: 'w2', userName: '李小華' })],
          stats: {
            pendingAmount: 2000,
            byStatus: { pending: 2, awaiting_collection: 0, completed: 0, rejected: 0 },
          },
        }),
    });

    const stats = await screen.findByRole('region', { name: '提領彙總' });
    expect(within(stats).getByText('$2,000')).toBeTruthy();
  });

  // CSV 匯出（W6）。這兩條是補階段 2.7 的缺陷：當時匯出的是「已載入的列」，
  // 而畫面同時寫著「已顯示 50 / 300」——admin 拿到的是一份殘缺檔案，而且
  // **沒有任何跡象告訴他這件事**。給半份比明示拒絕糟得多，因為對帳是拿這份
  // 檔案去比銀行的轉出紀錄，少的那些不會自己浮出來。
  it('匯出涵蓋整個篩選結果，不是只有已載入的那頁', async () => {
    const pages = vi.fn(async ({ offset }: { offset: number }) =>
      page({
        withdrawals: [record({ id: `w${offset}`, userName: `會員${offset}` })],
        total: 3,
        limit: 1,
        offset,
      }),
    );
    renderConsole({ loadWithdrawals: pages as never });

    await screen.findByText('已顯示 1 / 3 筆');
    pages.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '下載CSV' }));

    // 匯出必須自己把剩下的頁補齊，而不是拿畫面上現有的那筆交差。
    await waitFor(() => expect(pages.mock.calls.length).toBeGreaterThan(1));
  });

  it('篩選結果超過匯出上限時明示拒絕，不給半份檔案', async () => {
    renderConsole({
      loadWithdrawals: async () => page({ withdrawals: [record()], total: 2500 }),
    });

    await screen.findByText('已顯示 1 / 2500 筆');
    fireEvent.click(screen.getByRole('button', { name: '下載CSV' }));

    expect(await screen.findByText(/超過匯出上限/)).toBeTruthy();
  });

  it('列表顯示已顯示筆數與總筆數，未載完時提供加載更多', async () => {
    renderConsole({
      loadWithdrawals: async () => page({ withdrawals: [record()], total: 37 }),
    });

    expect(await screen.findByText('已顯示 1 / 37 筆')).toBeTruthy();
    expect(screen.getByRole('button', { name: '載入更多' })).toBeTruthy();
  });

  it('全選只勾已載入的頁，計數說出實際勾選筆數', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({
          withdrawals: [record(), record({ id: 'w2', userName: '李小華' })],
          total: 37,
        }),
    });

    fireEvent.click(await screen.findByRole('checkbox', { name: '全選本頁的提領記錄' }));
    // 總共 37 筆，但只載入 2 筆——全選不得悄悄擴大到未載入的頁
    expect(screen.getByText('已選取 2 筆')).toBeTruthy();
  });

  it('批次確認框列出受影響會員姓名，不只給筆數與總額', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({ withdrawals: [record(), record({ id: 'w2', userName: '李小華' })] }),
    });

    fireEvent.click(await screen.findByRole('checkbox', { name: '全選本頁的提領記錄' }));
    fireEvent.click(screen.getByRole('button', { name: '批次標記已匯款' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/王小明/)).toBeTruthy();
    expect(within(dialog).getByText(/李小華/)).toBeTruthy();
  });

  it('逐筆 checkbox 的 aria-label 帶會員姓名', async () => {
    renderConsole();
    expect(await screen.findByRole('checkbox', { name: '選取 王小明 的提領記錄' })).toBeTruthy();
  });

  it('手機上不顯示標記已匯款，但退件與代為完成照樣可用', async () => {
    stubMediaQuery(false);
    // 兩筆記錄各帶自己的前置狀態：退件只在 pending 可用、代為完成只在
    // awaiting_collection 可用。plan §1.4 不做 awaiting_collection → rejected，
    // 所以一筆記錄不可能同時長出這兩顆鍵。
    renderConsole({
      loadWithdrawals: async () =>
        page({
          withdrawals: [record(), record({ id: 'w2', status: 'awaiting_collection' })],
        }),
    });

    await screen.findAllByText('王小明');
    expect(screen.queryByRole('button', { name: '標記已匯款' })).toBeNull();
    expect(screen.getByRole('button', { name: '退件' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '代為完成' })).toBeTruthy();
  });

  it('桌機上待處理的申請看得到標記已匯款', async () => {
    renderConsole();
    expect(await screen.findByRole('button', { name: '標記已匯款' })).toBeTruthy();
  });

  it('事件歷史逐筆列出轉換與說明，手機同樣看得到', async () => {
    stubMediaQuery(false);
    renderConsole({
      loadWithdrawals: async () =>
        page({
          withdrawals: [
            record({
              status: 'rejected',
              note: '收款帳號與身分證姓名不符',
              events: [
                {
                  fromStatus: 'pending',
                  toStatus: 'rejected',
                  note: '收款帳號與身分證姓名不符',
                  bankRef: null,
                  transferredOn: null,
                  byAdmin: true,
                  createdAt: '2026-08-01T03:00:00Z',
                },
              ],
            }),
          ],
        }),
    });

    fireEvent.click(await screen.findByRole('button', { name: '查看歷史' }));
    const history = await screen.findByRole('dialog');
    expect(within(history).getByText(/收款帳號與身分證姓名不符/)).toBeTruthy();
  });
});
