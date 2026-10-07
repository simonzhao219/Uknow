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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminWithdrawalRecord, AdminWithdrawalsResponse } from '@contract';
import { stubMediaQuery, stubMediaQueryWithControl } from '../../test-utils/stubMediaQuery';
import { nextStamp } from '../../hooks/useLatestRequest';
import { type AdminCache, type AdminSlot, createAdminCache } from './adminCache';
import type { AdminBusy } from './adminBusy';
import { WithdrawalManagement, type WithdrawalQuery } from './WithdrawalManagement';

afterEach(cleanup);

// Radix Select 在 jsdom 開選單要用到的 API（同 CategorySelectField.test）。
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

type Page = AdminWithdrawalsResponse['data'];

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
    // 只看列表區的載入狀態：工具列另有一個常駐（平時為空）的匯出狀態宣告區。
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: '載入提領申請中' })).toBeNull(),
    );
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
    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));

    // 匯出必須自己把剩下的頁補齊，而不是拿畫面上現有的那筆交差。
    await waitFor(() => expect(pages.mock.calls.length).toBeGreaterThan(1));
  });

  it('篩選結果超過匯出上限時明示拒絕，不給半份檔案', async () => {
    renderConsole({
      loadWithdrawals: async () => page({ withdrawals: [record()], total: 2500 }),
    });

    await screen.findByText('已顯示 1 / 2500 筆');
    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));

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

  // 業主裁決 D4（#354）：列內的退件是紅框字（tone="destructive"），紅實心只留給
  // 確認退件那一步。手機卡片與桌機表格是同一個動作，外觀也要同一套（§11.1）——
  // 兩邊各有一份實作，只改一邊就會分岔。
  it.each([
    ['手機卡片', false],
    ['桌機表格', true],
  ])('%s的退件鈕是紅框字，紅實心只在確認框', async (_where, desktop) => {
    stubMediaQuery(desktop);
    renderConsole();
    const reject = await screen.findByRole('button', { name: '退件' });
    for (const c of ['border-destructive-border', 'text-destructive-subtle-foreground']) {
      expect(reject.classList.contains(c), c).toBe(true);
    }
    expect(reject.classList.contains('bg-destructive')).toBe(false);
    fireEvent.click(reject);
    const confirm = await screen.findByRole('button', { name: '確認退件' });
    expect(confirm.classList.contains('bg-destructive')).toBe(true);
  });

  // 畫面稿後台一節：代為完成是次要外框，手機卡片與桌機表格同一種外觀（§11.1）。
  it.each([
    ['手機卡片', false],
    ['桌機表格', true],
  ])('%s的代為完成是白底外框的次要鈕', async (_where, desktop) => {
    stubMediaQuery(desktop);
    renderConsole({
      loadWithdrawals: async () =>
        page({ withdrawals: [record({ status: 'awaiting_collection' })] }),
    });
    const complete = await screen.findByRole('button', { name: '代為完成' });
    for (const c of ['border', 'bg-card', 'text-foreground']) {
      expect(complete.classList.contains(c), c).toBe(true);
    }
  });

  it('桌機上待處理的申請看得到標記已匯款', async () => {
    renderConsole();
    expect(await screen.findByRole('button', { name: '標記已匯款' })).toBeTruthy();
  });

  // 這條原本名叫「確認後才送出並帶理由」，斷言卻是 `..., 'rejected', undefined)`
  // ——名字宣稱的行為與斷言證明的行為相反，等於把「退件不帶理由」錄成預期。
  // 後端對 rejected 強制要求非空 note，所以那個實作在正式環境每次都 400，
  // 而三層測試（元件 mock、mock e2e、journey 的 page object）都攔不到。
  it('退件沒填理由時送不出去', async () => {
    const update = vi.fn(async () => {});
    renderConsole({ updateStatus: update });

    fireEvent.click(await screen.findByRole('button', { name: '退件' }));
    const confirm = await screen.findByRole('button', { name: '確認退件' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('請填寫退件理由')).toBeTruthy();
    fireEvent.click(confirm);
    expect(update).not.toHaveBeenCalled();
  });

  it('退件把 admin 填的理由送到後端', async () => {
    const update = vi.fn(async () => {});
    renderConsole({ updateStatus: update });

    fireEvent.click(await screen.findByRole('button', { name: '退件' }));
    fireEvent.change(screen.getByLabelText('退件理由'), {
      target: { value: '收款帳號與身分證姓名不符' },
    });
    fireEvent.click(screen.getByRole('button', { name: '確認退件' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('w1', 'rejected', '收款帳號與身分證姓名不符', undefined),
    );
    expect(await screen.findByText(/已退件/)).toBeTruthy();
  });

  it('代為完成走確認框，明示會員端會看到是管理員結案', async () => {
    const update = vi.fn(async () => {});
    renderConsole({
      loadWithdrawals: async () =>
        page({ withdrawals: [record({ status: 'awaiting_collection' })] }),
      updateStatus: update,
    });

    fireEvent.click(await screen.findByRole('button', { name: '代為完成' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/管理員代為完成/)).toBeTruthy();
    // 理由由 admin 自己寫：稽核要答得出「憑什麼認定會員已收到錢」，
    // 寫死一句固定文案只是機械滿足後端的非空檢查。
    fireEvent.change(within(dialog).getByLabelText('代為結案理由'), {
      target: { value: '2026-08-01 致電確認，會員回覆已收到款項' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '確認代為完成' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        'w1',
        'completed',
        '2026-08-01 致電確認，會員回覆已收到款項',
        undefined,
      ),
    );
  });

  it('狀態更新失敗時把原因說出來', async () => {
    renderConsole({
      updateStatus: async () => {
        throw Object.assign(new Error('這筆已被其他管理員處理'), { status: 409 });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: '退件' }));
    fireEvent.change(screen.getByLabelText('退件理由'), { target: { value: '資料有誤' } });
    fireEvent.click(screen.getByRole('button', { name: '確認退件' }));
    expect(await screen.findByText(/這筆已被其他管理員處理/)).toBeTruthy();
  });

  it('批次有失敗時說出成功與失敗各幾筆，不只說失敗', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({ withdrawals: [record(), record({ id: 'w2', userName: '李小華' })] }),
      batchMarkPaid: async () => ({ succeeded: ['w1'], failed: [{ id: 'w2', error: 'x' }] }),
    });

    fireEvent.click(await screen.findByRole('checkbox', { name: '全選本頁的提領記錄' }));
    fireEvent.click(screen.getByRole('button', { name: '批次標記已匯款' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認批次匯款' }));

    // 「1 筆成功、1 筆失敗」比「批次失敗」有用得多：admin 知道要重做哪一筆。
    expect(await screen.findByText(/1 筆成功、1 筆失敗/)).toBeTruthy();
  });

  it('標記已匯款可帶交易序號，那是唯一能跟銀行對帳的錨點', async () => {
    const update = vi.fn(async () => {});
    renderConsole({ updateStatus: update });

    fireEvent.click(await screen.findByRole('button', { name: '標記已匯款' }));
    fireEvent.change(screen.getByLabelText('交易序號'), { target: { value: 'TX20260801001' } });
    fireEvent.click(screen.getByRole('button', { name: '確認匯款' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('w1', 'awaiting_collection', undefined, 'TX20260801001'),
    );
  });

  it('標記已匯款後畫面回報「已標記匯款完成」並帶上該會員', async () => {
    // 「送出的參數對」與「畫面真的說了什麼」是兩件事：上一條驗前者，這條驗
    // 後者。原本後者由 admin 的 e2e 情境守（斷言同一串「已標記匯款完成」），
    // 那條情境刪掉時一度沒有任何一層接手——按鈕可見、參數正確，都證不到
    // admin 按完之後畫面有沒有回話。帶會員姓名是因為這個動作不可回退，
    // 「對誰做的」比「做了幾筆」重要。
    renderConsole({ updateStatus: async () => {} });

    fireEvent.click(await screen.findByRole('button', { name: '標記已匯款' }));
    fireEvent.click(screen.getByRole('button', { name: '確認匯款' }));

    expect(await screen.findByText(/已標記匯款完成：王小明/)).toBeTruthy();
  });

  it('交易序號留空時不送出空字串', async () => {
    const update = vi.fn(async () => {});
    renderConsole({ updateStatus: update });

    fireEvent.click(await screen.findByRole('button', { name: '標記已匯款' }));
    fireEvent.click(screen.getByRole('button', { name: '確認匯款' }));
    // 選填就是選填：空字串進資料庫會變成「有填但填了空白」，比 null 難查。
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('w1', 'awaiting_collection', undefined, undefined),
    );
  });

  it('尚無轉換紀錄時歷史對話框說出來，不留空清單', async () => {
    renderConsole();
    fireEvent.click(await screen.findByRole('button', { name: '查看歷史' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('尚無轉換紀錄')).toBeTruthy();
  });

  it('載入更多把下一頁接在後面', async () => {
    renderConsole({
      loadWithdrawals: async ({ offset }: { offset: number }) =>
        page({ withdrawals: [record({ id: `w${offset}` })], total: 2 }),
    });

    await screen.findByText('已顯示 1 / 2 筆');
    fireEvent.click(screen.getByRole('button', { name: '載入更多' }));
    await screen.findByText('已顯示 2 / 2 筆');
  });

  it('手機上完全沒有批次匯款這條路徑——連勾選框都不渲染', async () => {
    stubMediaQuery(false);
    renderConsole({
      loadWithdrawals: async () =>
        page({ withdrawals: [record(), record({ id: 'w2', userName: '李小華' })] }),
    });
    await screen.findByText('李小華');

    // 這條測試原本是「勾了之後批次鍵不出現」——當時手機仍渲染勾選框。
    // Q2 裁決後手機不再渲染它（勾選唯一的下游是批次匯款，而批次鎖在桌面
    // ＝ 留一個按了沒有用的控制項）。它保護的行為（W8:手機不得有批次匯款
    // 路徑）沒有變，而且變得更強:現在連入口都不存在。
    expect(screen.queryByRole('checkbox', { name: '全選本頁的提領記錄' })).toBeNull();
    expect(screen.queryByRole('button', { name: '批次標記已匯款' })).toBeNull();
  });

  it('事件歷史顯示交易序號與會員本人的動作', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({
          withdrawals: [
            record({
              status: 'completed',
              events: [
                {
                  fromStatus: 'awaiting_collection',
                  toStatus: 'completed',
                  note: null,
                  bankRef: 'TX20260801001',
                  transferredOn: '2026-08-01',
                  byAdmin: false,
                  createdAt: '2026-08-01T05:00:00Z',
                },
              ],
            }),
          ],
        }),
    });

    fireEvent.click(await screen.findByRole('button', { name: '查看歷史' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/TX20260801001/)).toBeTruthy();
    // 誰按的要看得出來——admin 代為結案與會員本人查收是兩件事。
    expect(within(dialog).getByText(/會員本人/)).toBeTruthy();
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

    // 手機版:查看歷史依 ui-ux-guidelines §11 規則 3 收進溢出選單（唯讀、罕用、
    // 無時效性）。它仍然到得了——只是多一次點擊，而列表頁的工作是「找到那一筆」，
    // 不是對每一筆都做決定。
    // 用鍵盤開選單:Radix 的 DropdownMenuTrigger 監聽 pointerdown，jsdom 的
    // fireEvent.click 觸發不了它。走 Enter 順帶證明這顆選單是鍵盤可達的。
    fireEvent.keyDown(await screen.findByRole('button', { name: /的更多操作/ }), {
      key: 'Enter',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: '查看歷史' }));
    const history = await screen.findByRole('dialog');
    expect(within(history).getByText(/收款帳號與身分證姓名不符/)).toBeTruthy();
  });
});

// --- 手機版（階段 2） --------------------------------------------------------
//
// 這一組全部跑在 `stubMediaQuery(false)` 底下。守的是「表格換成卡片時，
// **互動不能被悄悄拿掉**」——排版變更最危險的失效方式不是版面難看，是某個
// 只存在於 <tr> 結構裡的職責在轉卡片時蒸發了（審查 F1）。
// 工具列（S3 A2）與匯出的狀態正確性。匯出要逐頁收集（可能好幾秒），而它
// 產出的檔案是拿去跟銀行轉出紀錄對帳的——重複的一份、或跟畫面篩選不一致的
// 一份，都會在對帳時變成「多一筆／少一筆」的假警報。
describe('WithdrawalManagement 工具列與匯出', () => {
  // 匯出完成的回報文案依瀏覽器而定（內建瀏覽器改說補救方式）。jsdom 預設的 UA
  // 「AppleWebKit 但沒有 Safari」會被 detectInAppBrowser 的 iOS WebView 啟發式
  // 判成內建瀏覽器，所以這組固定扮演一般桌機瀏覽器；LINE 那條自己換掉。
  const DESKTOP_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  let uaSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(DESKTOP_UA);
  });
  afterEach(() => {
    uaSpy.mockRestore();
  });

  // 第一次載入回第 1 頁（共 3 筆）；之後每次呼叫（匯出收集）先掛著，由測試放行。
  function pagedLoaderWithGate() {
    const gates: Array<() => void> = [];
    let calls = 0;
    const load = vi.fn(async ({ offset }: WithdrawalQuery) => {
      calls += 1;
      const result = page({
        withdrawals: [record({ id: `w${offset}`, userName: `會員${offset}` })],
        total: 3,
        limit: 1,
        offset,
      });
      if (calls === 1) return result;
      await new Promise<void>((r) => gates.push(r));
      return result;
    });
    // 收集是逐頁 await 的：放行一頁、等它觸發下一頁，直到第 1 次載入＋3 頁收集都放行。
    const releaseAll = async () => {
      while (gates.length || load.mock.calls.length < 4) {
        await act(async () => {
          for (const release of gates.splice(0)) release();
          await Promise.resolve();
        });
      }
    };
    return { load, releaseAll };
  }

  it('同一個事件迴圈內連按兩次只收集一輪——同一份對帳檔不得下載兩次', async () => {
    const pages = vi.fn(async ({ offset }: WithdrawalQuery) =>
      page({
        withdrawals: [record({ id: `w${offset}`, userName: `會員${offset}` })],
        total: 3,
        limit: 1,
        offset,
      }),
    );
    const createUrl = vi.fn(() => 'blob:test');
    URL.createObjectURL = createUrl;
    renderConsole({ loadWithdrawals: pages });
    await screen.findByText('已顯示 1 / 3 筆');
    pages.mockClear();

    const csv = screen.getByRole('button', { name: /下載 CSV/ });
    // 兩次點擊包在同一個 act 裡：中間不 re-render，按鈕還沒 disabled——
    // 擋得住的只有 handler 入口那個同步的 ref（fireEvent 分兩次呼叫的話，
    // 第二次點到的已經是 disabled 的鈕，量不到 ref）。
    act(() => {
      csv.click();
      csv.click();
    });

    expect(await screen.findByText('已匯出 3 筆')).toBeTruthy();
    expect(pages).toHaveBeenCalledTimes(3);
    expect(createUrl).toHaveBeenCalledTimes(1);
  });

  it('收集期間 CSV 忙碌，篩選與重新整理一併停用；完成後恢復並回報筆數', async () => {
    const { load, releaseAll } = pagedLoaderWithGate();
    renderConsole({ loadWithdrawals: load });
    await screen.findByText('已顯示 1 / 3 筆');

    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));

    const busy = await screen.findByRole('button', { name: /匯出中/ });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: '重新整理' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(true);

    await releaseAll();

    expect(await screen.findByText('已匯出 3 筆')).toBeTruthy();
    expect(screen.getByRole('button', { name: /下載 CSV/ }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: '重新整理' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(false);
  });

  it('收集失敗時說出原因，按鈕恢復可再試', async () => {
    let calls = 0;
    const load = vi.fn(async ({ offset }: WithdrawalQuery) => {
      calls += 1;
      if (calls > 1) throw new Error('第 2 頁讀取失敗');
      return page({ withdrawals: [record({ id: `w${offset}` })], total: 3, limit: 1, offset });
    });
    renderConsole({ loadWithdrawals: load });
    await screen.findByText('已顯示 1 / 3 筆');

    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));

    expect(await screen.findByText('第 2 頁讀取失敗')).toBeTruthy();
    const csv = screen.getByRole('button', { name: /下載 CSV/ });
    expect(csv.hasAttribute('disabled')).toBe(false);
    expect(csv.getAttribute('aria-busy')).toBeNull();
  });

  it('超過上限被拒後按鈕恢復，不卡在忙碌', async () => {
    renderConsole({
      loadWithdrawals: async () => page({ withdrawals: [record()], total: 2500 }),
    });
    await screen.findByText('已顯示 1 / 2500 筆');

    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));

    expect(await screen.findByText(/超過匯出上限/)).toBeTruthy();
    const csv = screen.getByRole('button', { name: /下載 CSV/ });
    expect(csv.hasAttribute('disabled')).toBe(false);
    expect(csv.getAttribute('aria-busy')).toBeNull();
  });

  it('載入更多進行中按不到重新整理與匯出——交錯會把舊頁尾接到新列表上', async () => {
    let releaseMore!: () => void;
    const load = vi.fn(async ({ offset }: WithdrawalQuery) => {
      if (offset > 0) await new Promise<void>((r) => (releaseMore = r));
      return page({
        withdrawals: [record({ id: `w${offset}`, userName: `會員${offset}` })],
        total: 2,
        limit: 1,
        offset,
      });
    });
    renderConsole({ loadWithdrawals: load });
    await screen.findByText('已顯示 1 / 2 筆');

    fireEvent.click(screen.getByRole('button', { name: '載入更多' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '重新整理' }).hasAttribute('disabled')).toBe(true),
    );
    expect(screen.getByRole('button', { name: /下載 CSV/ }).hasAttribute('disabled')).toBe(true);
    releaseMore();
    await screen.findByText('已顯示 2 / 2 筆');
    expect(screen.getByRole('button', { name: '重新整理' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: /下載 CSV/ }).hasAttribute('disabled')).toBe(false);
  });

  it('匯出期間列上的寫入動作與載入更多都停用——中途有列離開篩選會讓收集的 offset 錯位', async () => {
    const { load, releaseAll } = pagedLoaderWithGate();
    renderConsole({ loadWithdrawals: load });
    await screen.findByText('已顯示 1 / 3 筆');

    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));
    await screen.findByRole('button', { name: '匯出中…' });

    for (const name of ['標記已匯款', '退件', '載入更多']) {
      expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true);
    }

    await releaseAll();
    await screen.findByText('已匯出 3 筆');
    for (const name of ['標記已匯款', '退件', '載入更多']) {
      expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(false);
    }
  });

  it('手機卡片上的退件在匯出期間也停用', async () => {
    stubMediaQuery(false);
    const { load, releaseAll } = pagedLoaderWithGate();
    renderConsole({ loadWithdrawals: load });
    await screen.findByText('已顯示 1 / 3 筆');

    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));
    await screen.findByRole('button', { name: '匯出中…' });
    expect(screen.getByRole('button', { name: '退件' }).hasAttribute('disabled')).toBe(true);
    await releaseAll();
  });

  it('LINE 等內建瀏覽器裡不說「已匯出」——下載是否落檔偵測不到，說了可能是假成功', async () => {
    uaSpy.mockReturnValue('Mozilla/5.0 (iPhone) Line/13.0.0');
    renderConsole({
      loadWithdrawals: async () => page({ withdrawals: [record()], total: 1 }),
    });
    await screen.findByText('已顯示 1 / 1 筆');
    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));
    expect(await screen.findByText('已產生 1 筆，若沒收到檔案請用外部瀏覽器開啟')).toBeTruthy();
    expect(screen.queryByText('已匯出 1 筆')).toBeNull();
  });

  it('換篩選後清掉上一次的匯出回報——那個筆數屬於舊篩選', async () => {
    renderConsole({ loadWithdrawals: async () => page({ withdrawals: [record()], total: 1 }) });
    await screen.findByText('已顯示 1 / 1 筆');
    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));
    await screen.findByText('已匯出 1 筆');

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: '待處理' }));

    await waitFor(() => expect(screen.queryByText('已匯出 1 筆')).toBeNull());
  });

  it('重新整理是工具列上的 icon 鈕，名稱由文字承擔', async () => {
    const load = vi.fn(async () => page());
    renderConsole({ loadWithdrawals: load });
    await screen.findAllByText('王小明');
    load.mockClear();

    const refresh = screen.getByRole('button', { name: '重新整理' });
    expect(refresh.getAttribute('aria-label')).toBeNull();
    fireEvent.click(refresh);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  });

  // 特徵測試（S5 階段 4a 遷移前補上）：清勾選原本寫在 fetchWithdrawals 裡，遷移到
  // usePagedList 後要搬到「重讀成功」時——留著的勾選指向上一批資料，下一步是不可
  // 回退的批次匯款。
  it('重新整理成功後已選取歸零', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({ withdrawals: [record(), record({ id: 'w2', userName: '李小華' })] }),
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: '全選本頁的提領記錄' }));
    expect(screen.getByText('已選取 2 筆')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await waitFor(() => expect(screen.queryByText('已選取 2 筆')).toBeNull());
  });
});

describe('WithdrawalManagement 跨斷點', () => {
  it('視窗從桌面縮到手機時清空已選取的筆數', async () => {
    // useMediaQuery 是即時訂閱 change 事件的。Q2 裁決手機不渲染勾選框，
    // 但 selected 不會自己消失——「已選取 N 筆」橫幅還在、卻沒有任何逐筆
    // 取消的入口。不會寫壞資料（批次動作仍鎖在 isDesktop 之後），但那是
    // 一個看得到、動不了的殭屍狀態（審查 R7）。
    const setDesktop = stubMediaQueryWithControl(true);
    renderConsole({
      loadWithdrawals: async () =>
        page({ withdrawals: [record(), record({ id: 'w2', userName: '李小華' })] }),
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: '全選本頁的提領記錄' }));
    expect(screen.getByText('已選取 2 筆')).toBeTruthy();

    act(() => setDesktop(false));
    await waitFor(() => expect(screen.queryByText('已選取 2 筆')).toBeNull());
  });
});

describe('WithdrawalManagement 手機版', () => {
  beforeEach(() => {
    stubMediaQuery(false);
  });

  it('不渲染 table，改以每筆一張卡呈現', async () => {
    const { container } = renderConsole();
    await screen.findByText('王小明');
    expect(container.querySelector('table')).toBeNull();
  });

  it('每張卡都帶會員、匯款金額與狀態，資訊量不低於桌面表格的關鍵欄位', async () => {
    renderConsole();
    const card = await screen.findByRole('group', { name: /王小明/ });
    expect(within(card).getByText('王小明')).toBeTruthy();
    expect(within(card).getByText(/1,000/)).toBeTruthy();
    expect(within(card).getByText('待處理')).toBeTruthy();
  });

  it('展開鍵把該筆設為作業對象並就地顯示匯款五欄', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({
          withdrawals: [
            record({ id: 'w-1', userName: '甲會員' }),
            record({ id: 'w-2', userName: '乙會員', bankAccount: '99988877766' }),
          ],
        }),
    });
    const card = await screen.findByRole('group', { name: /乙會員/ });
    fireEvent.click(within(card).getByRole('button', { name: '匯款資訊' }));
    // 第二筆的帳號要出現——出現代表 activeId 真的被寫進去了。若卡片沒有接手
    // setActiveId，畫面永遠停在 withdrawals[0]（甲會員）。
    await waitFor(() => expect(within(card).getByText('99988877766')).toBeTruthy());
  });

  it('展開鍵是按鈕，鍵盤可達', async () => {
    renderConsole();
    const card = await screen.findByRole('group', { name: /王小明/ });
    const trigger = within(card).getByRole('button', { name: '匯款資訊' });
    expect(trigger.tagName).toBe('BUTTON');
  });

  it('已展開的卡片再點一次會收合', async () => {
    // onOpenChange 收到的是「使用者想要的結果」（目前 open 的相反值），
    // 忽略它會讓卡片永遠關不掉——setActiveId(w.id) 在 activeId 已是 w.id 時
    // 不改變任何狀態。aria-expanded 也會跟著說謊。
    renderConsole();
    const card = await screen.findByRole('group', { name: /王小明/ });
    const trigger = within(card).getByRole('button', { name: '匯款資訊' });

    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'));
  });
});

// --- S5 階段 4b：快取、確認閘門與更新中的呈現 -------------------------------
//
// 快取讓切回的分頁立刻有列表，但「上次看到的樣子」不能拿來匯款：本次讀取確認前，
// 匯款類入口（標記已匯款、勾選與批次、CSV、查看證件）擋下點擊，統計與作業面板不顯示；
// 退件、代為完成、查看歷史照常（後端狀態機擋不合法的轉換）。停用的外觀延遲 0.3 秒，
// 快網路下不閃灰；失敗與逾時則立即遮住收款資訊。

function seedCache(p: Page = page(), fetchedAt = Date.now(), status = 'all') {
  const cache = createAdminCache();
  cache.write(
    `withdrawals:${status}` as AdminSlot,
    { items: p.withdrawals, total: p.total, meta: p.stats, fetchedAt },
    nextStamp(),
  );
  return cache;
}

/** 每次讀取都掛著，由測試結算。 */
function heldLoader() {
  const calls: {
    params: WithdrawalQuery;
    resolve: (p: Page) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const load = vi.fn(
    (params: WithdrawalQuery) =>
      new Promise<Page>((resolve, reject) => {
        calls.push({ params, resolve, reject });
      }),
  );
  return { calls, load };
}

function renderWith(cache: AdminCache | undefined, load: (p: WithdrawalQuery) => Promise<Page>) {
  return render(
    <WithdrawalManagement
      cache={cache}
      loadWithdrawals={load}
      updateStatus={async () => {}}
      batchMarkPaid={async () => ({ succeeded: [], failed: [] })}
    />,
  );
}

const statusLine = () => screen.getByText(/^已顯示 \d+ \/ \d+ 筆$/);
const listRegion = () => screen.getByRole('region', { name: '提領申請列表' });
const rowOf = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

describe('WithdrawalManagement 快取與確認閘門', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('帶快取重掛時列表立即出現、不出骨架；統計與作業面板等本次讀取確認', async () => {
    const cache = seedCache();
    const { calls, load } = heldLoader();
    renderWith(cache, load);

    expect(screen.queryByRole('status', { name: '載入提領申請中' })).toBeNull();
    expect(within(screen.getByRole('table')).getByText('王小明')).toBeTruthy();
    expect(listRegion().getAttribute('aria-busy')).toBe('true');
    const stats = screen.getByRole('region', { name: '提領彙總' });
    expect(within(stats).queryByText('$1,000')).toBeNull();
    expect(screen.queryByRole('region', { name: '匯款作業面板' })).toBeNull();
    expect(screen.queryByRole('button', { name: '複製收款帳號' })).toBeNull();

    await act(async () => calls[0].resolve(page()));
    expect(listRegion().getAttribute('aria-busy')).not.toBe('true');
    expect(within(stats).getByText('$1,000')).toBeTruthy();
    expect(screen.getByRole('region', { name: '匯款作業面板' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '複製收款帳號' })).toBeTruthy();
  });

  // 主防線在 store 層之外也要成立：頁面帶著未遮罩的帳號與身分證走完種子→重讀→寫回。
  it('帶快取重掛到落地寫回快取，全程不呼叫 Storage 的寫入', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const cache = seedCache();
    const { calls, load } = heldLoader();
    renderWith(cache, load);
    await act(async () => calls[0].resolve(page()));

    const cached = cache.read<AdminWithdrawalRecord>('withdrawals:all');
    expect(cached?.items[0].bankAccount).toBe('1234567890123');
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('未確認時匯款類入口從第一個 render 就擋下點擊，0.3 秒後才套停用樣式並說出原因', () => {
    vi.useFakeTimers();
    const cache = seedCache();
    const { load } = heldLoader();
    renderWith(cache, load);

    const gated = [
      screen.getByRole('button', { name: '標記已匯款' }),
      screen.getByRole('checkbox', { name: '選取 王小明 的提領記錄' }),
      screen.getByRole('checkbox', { name: '全選本頁的提領記錄' }),
      screen.getByRole('button', { name: '查看' }),
      screen.getByRole('button', { name: /下載 CSV/ }),
    ];
    for (const el of gated) {
      expect(el.getAttribute('aria-disabled'), el.textContent ?? '').toBe('true');
      expect(el.getAttribute('data-paused'), el.textContent ?? '').toBeNull();
    }
    fireEvent.click(gated[0]);
    fireEvent.click(gated[1]);
    fireEvent.click(gated[3]);
    fireEvent.click(gated[4]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/已選取/)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/暫停匯款相關操作/)).toBeNull();
    expect(listRegion().getAttribute('data-dimmed')).not.toBe('true');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(statusLine().textContent).toBe('已顯示 1 / 1 筆・更新中，暫停匯款相關操作');
    expect(listRegion().getAttribute('data-dimmed')).toBe('true');
    for (const el of gated) {
      expect(el.getAttribute('data-paused'), el.textContent ?? '').toBe('true');
      expect(el.getAttribute('aria-describedby'), el.textContent ?? '').toBe(statusLine().id);
    }
  });

  // 載入更多在確認前也按不出去（舊列後面不接新頁）；只擋不灰的話，手機上按了沒反應也看不出原因。
  it('確認前載入更多照樣擋下，0.3 秒後套停用外觀，鈕旁寫原因並以 aria-describedby 指向', async () => {
    vi.useFakeTimers();
    const cache = seedCache(page({ withdrawals: [record()], total: 3 }));
    const { calls, load } = heldLoader();
    renderWith(cache, load);
    const more = () => screen.getByRole('button', { name: '載入更多' });
    const reason = () =>
      document.getElementById(more().getAttribute('aria-describedby') ?? '')?.textContent;
    expect(more().getAttribute('aria-disabled')).toBe('true');
    expect(more().getAttribute('data-paused')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(more().getAttribute('data-paused')).toBe('true');
    expect(reason()).toBe('更新中，完成後可載入更多');

    await act(async () => calls[0].reject(new Error('連線中斷')));
    expect(more().getAttribute('data-paused')).toBe('true');
    expect(reason()).toBe('更新失敗，重試後可載入更多');

    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '重試' }));
    await act(async () => calls[1].resolve(page({ withdrawals: [record()], total: 3 })));
    expect(more().getAttribute('aria-disabled')).toBeNull();
    expect(more().getAttribute('data-paused')).toBeNull();
    expect(more().getAttribute('aria-describedby')).toBeNull();
  });

  it('退件、代為完成與查看歷史在未確認時照常可按', async () => {
    const cache = seedCache(
      page({
        withdrawals: [
          record(),
          record({ id: 'w2', userName: '李小華', status: 'awaiting_collection' }),
        ],
      }),
    );
    const { load } = heldLoader();
    renderWith(cache, load);

    const reject = screen.getByRole('button', { name: '退件' });
    expect(reject.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(reject);
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: '代為完成' }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    fireEvent.click(screen.getAllByRole('button', { name: '查看歷史' })[0]);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('CSV 在確認前按不出去，確認後以這次讀到的總數收集', async () => {
    // 快取裡的總數是 3（過期），這次讀到的是 1：以快取的總數收集會多打兩頁。
    const cache = seedCache(page({ withdrawals: [record()], total: 3 }));
    const { calls, load } = heldLoader();
    renderWith(cache, load);

    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => calls[0].resolve(page({ withdrawals: [record()], total: 1 })));
    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));
    expect(await screen.findByText(/^(已匯出|已產生) 1 筆/)).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('換篩選後勾選歸零', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({ withdrawals: [record(), record({ id: 'w2', userName: '李小華' })] }),
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: '全選本頁的提領記錄' }));
    expect(screen.getByText('已選取 2 筆')).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: '待處理' }));
    await waitFor(() => expect(screen.queryByText('已選取 2 筆')).toBeNull());
  });

  it('統計區在本次讀取確認前是骨架、不先閃 0，讀取失敗時寫「—」', async () => {
    const { calls, load } = heldLoader();
    renderWith(undefined, load);
    const stats = screen.getByRole('region', { name: '提領彙總' });
    expect(within(stats).queryByText('$0')).toBeNull();
    expect(within(stats).queryByText('0')).toBeNull();

    await act(async () => calls[0].reject(new Error('連線失敗')));
    expect(within(stats).getAllByText('—')).toHaveLength(4);
  });

  // 舊 mock 與缺欄位的回應不回 stats：確認了卻沒有數字可寫，就寫「—」，不要永遠是骨架。
  it('讀取成功但回應缺統計時統計區寫「—」，不停在骨架', async () => {
    const { calls, load } = heldLoader();
    renderWith(undefined, load);
    await act(async () => calls[0].resolve({ ...page(), stats: undefined } as unknown as Page));
    const stats = screen.getByRole('region', { name: '提領彙總' });
    expect(within(stats).getAllByText('—')).toHaveLength(4);
  });

  it('作業面板確認前是骨架、失敗時寫「資料未確認，暫停顯示」，兩者都不渲染複製鈕', async () => {
    const cache = seedCache();
    const { calls, load } = heldLoader();
    renderWith(cache, load);
    expect(screen.queryByRole('region', { name: '匯款作業面板' })).toBeNull();
    expect(screen.queryByRole('button', { name: '複製收款帳號' })).toBeNull();

    await act(async () => calls[0].reject(new Error('連線中斷')));
    expect(screen.getByText('資料未確認，暫停顯示')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '複製收款帳號' })).toBeNull();
  });

  it('自動更新失敗時保留舊列並遮住收款資訊、扣點照常，重試在背景進行', async () => {
    const cache = seedCache();
    const { calls, load } = heldLoader();
    renderWith(cache, load);
    await act(async () => calls[0].reject(new Error('連線中斷')));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('更新失敗，以下是剛剛的資料');
    expect(alert.textContent).toContain('連線中斷');
    expect(alert.textContent).toContain('收款資訊已隱藏，重試後顯示');
    expect(listRegion().getAttribute('data-stale')).toBe('true');
    const row = rowOf('王小明');
    expect(within(row).getAllByText('已隱藏')).toHaveLength(3);
    expect(within(row).queryByText('1234567890123')).toBeNull();
    expect(within(row).queryByText('822')).toBeNull();
    expect(within(row).queryByText('$1,000')).toBeNull();
    expect(within(row).getByText('1015 P')).toBeTruthy();

    fireEvent.click(within(alert).getByRole('button', { name: '重試' }));
    expect(screen.queryByRole('status', { name: '載入提領申請中' })).toBeNull();
    expect(within(screen.getByRole('table')).getByText('王小明')).toBeTruthy();
    await act(async () => calls[1].resolve(page()));
    expect(within(rowOf('王小明')).queryByText('已隱藏')).toBeNull();
    expect(screen.queryByText(/更新失敗，以下是/)).toBeNull();
    expect(listRegion().getAttribute('data-stale')).not.toBe('true');
  });

  // 失敗後遮到確認為止（業主 2026-10-07 裁決 A）：重試期間已知失敗的舊資料上不重新露出帳號，
  // 提示改寫「正在更新…」、重試鈕顯示進行中；本次讀取確認後才解開。
  it('陳舊提示按重試後收款資訊維持遮住，提示寫「正在更新…」，確認後才解開', async () => {
    const cache = seedCache();
    const { calls, load } = heldLoader();
    renderWith(cache, load);
    await act(async () => calls[0].reject(new Error('連線中斷')));

    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '重試' }));
    const row = rowOf('王小明');
    expect(within(row).getAllByText('已隱藏')).toHaveLength(3);
    expect(within(row).queryByText('1234567890123')).toBeNull();
    expect(screen.getByText('正在更新…')).toBeTruthy();
    expect(screen.getByText('收款資訊已隱藏，更新完成後顯示')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重試' }).getAttribute('aria-disabled')).toBe('true');

    await act(async () => calls[1].resolve(page()));
    expect(within(rowOf('王小明')).queryByText('已隱藏')).toBeNull();
    expect(screen.queryByText('正在更新…')).toBeNull();
  });

  it('失敗後改按工具列的重新整理也維持遮住，再失敗時帳號從未露出', async () => {
    const cache = seedCache();
    const { calls, load } = heldLoader();
    renderWith(cache, load);
    await act(async () => calls[0].reject(new Error('連線中斷')));
    let exposed = false;
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes('1234567890123')) exposed = true;
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    expect(within(rowOf('王小明')).getAllByText('已隱藏')).toHaveLength(3);
    expect(screen.getByText('正在更新…')).toBeTruthy();
    await act(async () => calls[1].reject(new Error('仍然連不上')));
    observer.disconnect();

    expect(within(rowOf('王小明')).getAllByText('已隱藏')).toHaveLength(3);
    expect(screen.getByText(/更新失敗，以下是/)).toBeTruthy();
    expect(exposed).toBe(false);
  });

  it('沒有資料時錯誤區按重試後原地寫「正在更新…」、重試鈕顯示進行中', async () => {
    const { calls, load } = heldLoader();
    renderWith(undefined, load);
    await act(async () => calls[0].reject(new Error('連線失敗')));

    const retry = screen.getByRole('button', { name: '重試' });
    retry.focus();
    fireEvent.click(retry);
    expect(screen.getByText('正在更新…')).toBeTruthy();
    expect(screen.queryByText('連線失敗')).toBeNull();
    expect(retry.isConnected).toBe(true);
    expect(retry.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(retry);

    await act(async () => calls[1].resolve(page()));
    expect(within(screen.getByRole('table')).getByText('王小明')).toBeTruthy();
    expect(document.activeElement).toBe(listRegion());
  });

  // 「目前沒有提領申請」在重試途中閃出來，等於在結果出來前先說了一次沒有（與公告、告警同一個判準）。
  it('有過資料但清單為空時，錯誤區重試途中留在原位，不閃出空狀態', async () => {
    const { calls, load } = heldLoader();
    renderWith(undefined, load);
    await act(async () => calls[0].resolve(page({ withdrawals: [] })));
    expect(screen.getByText('目前沒有提領申請')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await act(async () => calls[1].reject(new Error('連線失敗')));

    const retry = screen.getByRole('button', { name: '重試' });
    fireEvent.click(retry);
    expect(screen.getByText('正在更新…')).toBeTruthy();
    expect(screen.queryByText('目前沒有提領申請')).toBeNull();
    expect(retry.isConnected).toBe(true);
  });

  it('手動重新整理失敗時陳舊提示不再帶 alert——狀態文字已經播過', async () => {
    const { calls, load } = heldLoader();
    renderWith(undefined, load);
    await act(async () => calls[0].resolve(page()));

    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await act(async () => calls[1].reject(new Error('連線中斷')));
    expect(screen.getByText('更新失敗')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/更新失敗，以下是剛剛的資料/)).toBeTruthy();
  });

  it('逾 15 秒仍在更新時同樣遮住收款資訊，提示更新較久，並放行重新整理', () => {
    vi.useFakeTimers();
    const cache = seedCache();
    const { load } = heldLoader();
    renderWith(cache, load);
    const refresh = screen.getByRole('button', { name: '重新整理' });
    expect(refresh.getAttribute('aria-disabled')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByText(/更新較久，以下是剛剛的資料/)).toBeTruthy();
    // 逾時提示沒有重試鈕：寫「重新整理後顯示」，不寫「重試後顯示」（業主 2026-10-07，P2-22）。
    expect(screen.getByText('收款資訊已隱藏，重新整理後顯示')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(rowOf('王小明')).getAllByText('已隱藏')).toHaveLength(3);
    expect(refresh.getAttribute('aria-disabled')).toBeNull();
  });

  // K2：權限可能被撤，畫面上不再留會員的帳號與身分證。
  it('讀取回 403 時丟掉種子列改顯示錯誤，統計寫「—」，快取與切回位置一併清空', async () => {
    const cache = seedCache(page(), Date.now(), 'pending');
    cache.writeView({ withdrawalStatus: 'pending' });
    const { calls, load } = heldLoader();
    renderWith(cache, load);
    expect(within(screen.getByRole('table')).getByText('王小明')).toBeTruthy();

    await act(async () => calls[0].reject(Object.assign(new Error('沒有權限'), { status: 403 })));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('沒有權限')).toBeTruthy();
    const stats = screen.getByRole('region', { name: '提領彙總' });
    expect(within(stats).getAllByText('—')).toHaveLength(4);
    expect(cache.read('withdrawals:pending')).toBeUndefined();
    expect(cache.readView().withdrawalStatus).toBe('all');
  });

  it('作業面板的資料時間每 60 秒重算，滿 10 分鐘提示先重新整理', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 7, 9, 0));
    const { calls, load } = heldLoader();
    renderWith(undefined, load);
    await act(async () => calls[0].resolve(page()));
    expect(screen.getByText('剛剛更新')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('資料更新於 1 分鐘前')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(9 * 60_000);
    });
    expect(screen.getByText('資料更新於 10 分鐘前，建議先重新整理')).toBeTruthy();
  });

  it('切走再切回仍是原本的狀態篩選', async () => {
    const cache = createAdminCache();
    const first = renderWith(
      cache,
      vi.fn(async () => page()),
    );
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: '待處理' }));
    first.unmount();

    const load = vi.fn(async (_params: WithdrawalQuery) => page());
    renderWith(cache, load);
    expect(screen.getByRole('combobox').textContent).toContain('待處理');
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
  });

  it('查看歷史在未確認時可開，對話框寫開框當下的資料時間，更新落地後也不變', async () => {
    const cache = seedCache(page(), Date.now() - 5 * 60_000);
    const { calls, load } = heldLoader();
    renderWith(cache, load);

    fireEvent.click(screen.getByRole('button', { name: '查看歷史' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('資料更新於 5 分鐘前')).toBeTruthy();

    await act(async () => calls[0].resolve(page()));
    expect(within(dialog).getByText('資料更新於 5 分鐘前')).toBeTruthy();
    expect(within(dialog).queryByText('剛剛更新')).toBeNull();
  });

  it('確認框寫開框當下的資料時間：標記已匯款、退件、代為完成與批次', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({
          withdrawals: [
            record(),
            record({ id: 'w2', userName: '李小華', status: 'awaiting_collection' }),
          ],
        }),
    });
    const open = async (button: HTMLElement) => {
      fireEvent.click(button);
      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText('剛剛更新')).toBeTruthy();
      fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    };
    await open(await screen.findByRole('button', { name: '標記已匯款' }));
    await open(screen.getByRole('button', { name: '退件' }));
    await open(screen.getByRole('button', { name: '代為完成' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '全選本頁的提領記錄' }));
    await open(screen.getByRole('button', { name: '批次標記已匯款' }));
  });

  it('自動更新途中按重新整理不加請求，文字「正在更新」→「仍在更新」→「已更新 HH:mm」', async () => {
    const cache = seedCache();
    const { calls, load } = heldLoader();
    renderWith(cache, load);
    const refresh = screen.getByRole('button', { name: '重新整理' });

    fireEvent.click(refresh);
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByText('正在更新')).toBeTruthy();
    fireEvent.click(refresh);
    expect(screen.getByText('仍在更新')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => calls[0].resolve(page()));
    expect(screen.getByText(/^已更新 \d\d:\d\d$/)).toBeTruthy();
  });

  it('陳舊提示的重試走同一套狀態文字', async () => {
    const cache = seedCache();
    const { calls, load } = heldLoader();
    renderWith(cache, load);
    await act(async () => calls[0].reject(new Error('連線中斷')));

    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '重試' }));
    expect(screen.getByText('正在更新')).toBeTruthy();
    await act(async () => calls[1].resolve(page()));
    expect(screen.getByText(/^已更新 \d\d:\d\d$/)).toBeTruthy();
  });

  it('沒有資料時錯誤區的重試也走同一套狀態文字', async () => {
    const { calls, load } = heldLoader();
    renderWith(undefined, load);
    await act(async () => calls[0].reject(new Error('連線失敗')));

    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(screen.getByText('正在更新')).toBeTruthy();
    await act(async () => calls[1].resolve(page()));
    expect(screen.getByText(/^已更新 \d\d:\d\d$/)).toBeTruthy();
  });

  it('手動重新整理失敗後，退件引起的重讀一開始就收掉「更新失敗」', async () => {
    const { calls, load } = heldLoader();
    renderWith(undefined, load);
    await act(async () => calls[0].resolve(page()));
    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await act(async () => calls[1].reject(new Error('連線中斷')));
    expect(screen.getByText('更新失敗')).toBeTruthy();

    await rejectRow('王小明');
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(screen.queryByText('更新失敗')).toBeNull();
  });

  it('換篩選時收掉上一個篩選的「已更新 HH:mm」', async () => {
    const { calls, load } = heldLoader();
    renderWith(undefined, load);
    await act(async () => calls[0].resolve(page()));
    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await act(async () => calls[1].resolve(page()));
    expect(screen.getByText(/^已更新 \d\d:\d\d$/)).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: '待處理' }));
    expect(screen.queryByText(/^已更新 \d\d:\d\d$/)).toBeNull();
  });
});

describe('WithdrawalManagement 手機版的確認閘門', () => {
  beforeEach(() => {
    stubMediaQuery(false);
  });

  it('⋯ 選單裡只有「查看證件」停用並帶原因，查看歷史照常', async () => {
    const cache = seedCache();
    const { load } = heldLoader();
    renderWith(cache, load);

    fireEvent.keyDown(screen.getByRole('button', { name: /的更多操作/ }), { key: 'Enter' });
    const idCard = await screen.findByRole('menuitem', { name: '查看證件' });
    const history = screen.getByRole('menuitem', { name: '查看歷史' });
    expect(idCard.getAttribute('aria-disabled')).toBe('true');
    expect(idCard.getAttribute('aria-describedby')).toBe(statusLine().id);
    expect(history.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(idCard);
    expect(screen.queryByRole('dialog', { name: '身分證照片查閱' })).toBeNull();
  });

  // 觸控沒有游標可變：只變淡的項目點了沒反應，看不出是壞了還是在等。
  it('⋯ 選單的「查看證件」出現停用外觀時，項目內寫「更新中」，名稱不變', async () => {
    const cache = seedCache();
    const { load } = heldLoader();
    renderWith(cache, load);

    fireEvent.keyDown(screen.getByRole('button', { name: /的更多操作/ }), { key: 'Enter' });
    const idCard = await screen.findByRole('menuitem', { name: '查看證件' });
    await waitFor(() => expect(idCard.getAttribute('data-paused')).toBe('true'));
    expect(within(idCard).getByText('更新中')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '查看證件' })).toBe(idCard);
  });

  it('從 ⋯ 選單開的查看歷史關閉後，焦點回到 ⋯ 鈕', async () => {
    renderConsole();
    const more = await screen.findByRole('button', { name: /的更多操作/ });
    fireEvent.keyDown(more, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: '查看歷史' }));
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it('更新失敗時卡片遮住匯款金額，展開寫「資料未確認，暫停顯示」、扣點照常', async () => {
    const cache = seedCache();
    const { calls, load } = heldLoader();
    renderWith(cache, load);
    await act(async () => calls[0].reject(new Error('連線中斷')));

    const card = screen.getByRole('group', { name: /王小明/ });
    expect(within(card).queryByText('$1,000')).toBeNull();
    expect(within(card).getByText('已隱藏')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: '匯款資訊' }));
    await waitFor(() => expect(within(card).getByText('資料未確認，暫停顯示')).toBeTruthy());
    expect(within(card).getByText('扣點 1015 P')).toBeTruthy();
    expect(within(card).queryByText('1234567890123')).toBeNull();
  });

  it('確認後展開的卡片寫資料時間', async () => {
    renderConsole();
    const card = await screen.findByRole('group', { name: /王小明/ });
    fireEvent.click(within(card).getByRole('button', { name: '匯款資訊' }));
    await waitFor(() => expect(within(card).getByText('剛剛更新')).toBeTruthy());
  });
});

// --- S5 階段 4c：動作側——回報、結果分類、失效、焦點、匯出核對、busy -------------
//
// 寫入的結局分三種：成功、後端拒絕（4xx，交易沒提交）、結果不明（其餘，可能已提交）。
// 成功與結果不明都要讓快取失效並背景重讀；後端拒絕不失效，但同樣重讀一次（D5）讓列表
// 回到真實狀態。回報出現在工具列下方，文字只出現一次；剛按下的失敗取得焦點。

interface Held<T> {
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

function heldWrites() {
  const writes: Held<void>[] = [];
  const update = vi.fn(
    (_id: string, _status: string, _note?: string, _bankRef?: string) =>
      new Promise<void>((resolve, reject) => {
        writes.push({ resolve, reject });
      }),
  );
  return { writes, update };
}

const rejected = (message: string, status = 409) => Object.assign(new Error(message), { status });

function renderPage(
  opts: {
    cache?: AdminCache;
    busy?: AdminBusy;
    load?: (p: WithdrawalQuery) => Promise<Page>;
    update?: (id: string, status: string, note?: string, bankRef?: string) => Promise<void>;
    batch?: (
      items: { id: string; bankRef?: string }[],
    ) => Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }>;
  } = {},
) {
  return render(
    <WithdrawalManagement
      cache={opts.cache}
      busy={opts.busy}
      loadWithdrawals={opts.load ?? (async () => page())}
      updateStatus={opts.update ?? (async () => {})}
      batchMarkPaid={opts.batch ?? (async () => ({ succeeded: [], failed: [] }))}
    />,
  );
}

const twoRows = () => page({ withdrawals: [record(), record({ id: 'w2', userName: '李小華' })] });

async function rejectRow(name: string, reason = '資料有誤') {
  fireEvent.click(within(rowOf(name)).getByRole('button', { name: '退件' }));
  fireEvent.change(await screen.findByLabelText('退件理由'), { target: { value: reason } });
  fireEvent.click(screen.getByRole('button', { name: '確認退件' }));
}

async function openBatch() {
  fireEvent.click(await screen.findByRole('checkbox', { name: '全選本頁的提領記錄' }));
  fireEvent.click(screen.getByRole('button', { name: '批次標記已匯款' }));
  return screen.findByRole('alertdialog');
}

describe('WithdrawalManagement 動作回報與結果分類', () => {
  it('成功回報在畫面上只出現一次', async () => {
    renderPage();
    await screen.findAllByText('王小明');
    await rejectRow('王小明');
    await screen.findByText('已退件：王小明');
    expect(screen.getAllByText('已退件：王小明')).toHaveLength(1);
  });

  it('成功回報出現的那一次 commit 裡，列表已經在更新', async () => {
    const { calls, load } = heldLoader();
    renderPage({ load });
    await act(async () => calls[0].resolve(page()));
    const region = listRegion();
    const busyWhenReported: (string | null)[] = [];
    // 以 MutationObserver 記錄 commit 的先後：回報先出現、重讀晚一個 commit 才開始的話，
    // 第一次看到回報時列表還不是 aria-busy——那一瞬間 page object 會以為列表已經更新完。
    const observer = new MutationObserver(() => {
      if (screen.queryByText('已退件：王小明')) {
        busyWhenReported.push(region.getAttribute('aria-busy'));
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeOldValue: true,
    });
    await rejectRow('王小明');
    await screen.findByText('已退件：王小明');
    observer.disconnect();
    expect(busyWhenReported[0]).toBe('true');
  });

  it('後端拒絕時照原文說出來並前綴姓名，列表照常顯示', async () => {
    renderPage({
      update: async () => {
        throw rejected('這筆已被其他管理員處理');
      },
    });
    await screen.findAllByText('王小明');
    await rejectRow('王小明');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('王小明：這筆已被其他管理員處理');
    expect(within(screen.getByRole('table')).getByText('王小明')).toBeTruthy();
  });

  it('沒收到伺服器確認時改寫固定文案並前綴姓名', async () => {
    renderPage({
      update: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await screen.findAllByText('王小明');
    await rejectRow('王小明');
    expect(
      await screen.findByText('王小明：未收到伺服器確認，結果不明，列表更新後請確認該筆狀態'),
    ).toBeTruthy();
  });

  it('批次沒收到伺服器確認時寫固定文案', async () => {
    renderPage({
      load: async () => twoRows(),
      batch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await openBatch();
    fireEvent.click(screen.getByRole('button', { name: '確認批次匯款' }));
    expect(
      await screen.findByText(
        '批次匯款未收到伺服器確認，結果不明。若款項已匯出請勿重匯，逐筆確認狀態後再補標記',
      ),
    ).toBeTruthy();
  });

  // 標記已匯款是網銀轉出之後才按的：重讀後仍顯示待處理時，最怕的是 admin 以為沒匯成而再匯
  // 一次（業主 2026-10-07 裁決 E）。退件與代為完成沒有轉帳，維持原本的文案。
  it('標記已匯款沒收到伺服器確認時，提醒款項若已匯出請勿重匯', async () => {
    renderPage({
      update: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: '標記已匯款' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認匯款' }));
    expect(
      await screen.findByText(
        '王小明：未收到伺服器確認，結果不明。若款項已匯出請勿重匯，確認狀態後再補標記',
      ),
    ).toBeTruthy();
  });

  it('剛按下的那筆失敗時捲進視線並取得焦點，較早那筆晚到的失敗不搶', async () => {
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    const { writes, update } = heldWrites();
    renderPage({ load: async () => twoRows(), update });
    await screen.findAllByText('王小明');
    await rejectRow('王小明');
    await rejectRow('李小華');
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    scroll.mockClear();

    await act(async () => writes[0].reject(rejected('這筆已被其他管理員處理')));
    expect(document.activeElement).not.toBe(screen.getByRole('alert'));
    expect(scroll).not.toHaveBeenCalled();

    await act(async () => writes[1].reject(rejected('帳號與姓名不符')));
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    expect(scroll).toHaveBeenCalled();
    scroll.mockRestore();
  });

  it('單筆動作失敗後自動背景重讀一次，列表不換骨架', async () => {
    const load = vi.fn(async (_params: WithdrawalQuery) => page());
    renderPage({
      load,
      update: async () => {
        throw rejected('狀態已變更');
      },
    });
    await screen.findAllByText('王小明');
    load.mockClear();
    await rejectRow('王小明');
    await screen.findByText(/狀態已變更/);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('status', { name: '載入提領申請中' })).toBeNull();
    expect(within(screen.getByRole('table')).getByText('王小明')).toBeTruthy();
  });

  // 回報一次只放一則的話，晚到的成功會把「結果不明」那句蓋掉——admin 就不知道要回頭確認。
  it('較早那筆結果不明、較晚那筆成功時，兩則回報都留著', async () => {
    const { writes, update } = heldWrites();
    renderPage({ load: async () => twoRows(), update });
    await screen.findAllByText('王小明');
    await rejectRow('王小明');
    await rejectRow('李小華');
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));

    await act(async () => writes[0].reject(new TypeError('Failed to fetch')));
    await act(async () => writes[1].resolve());
    expect(screen.getByText(/^王小明：未收到伺服器確認/)).toBeTruthy();
    expect(screen.getByText('已退件：李小華')).toBeTruthy();
  });

  it('匯出途中先前的寫入以結果不明收場，匯出完成後那則失敗仍在', async () => {
    const gates: Array<() => void> = [];
    const load = vi.fn(async ({ offset }: WithdrawalQuery) => {
      if (offset === 1) await new Promise<void>((r) => gates.push(r));
      return page({
        withdrawals: [offset === 1 ? record({ id: 'w2', userName: '李小華' }) : record()],
        total: 2,
      });
    });
    const { writes, update } = heldWrites();
    renderPage({ load, update });
    await screen.findAllByText('王小明');
    await rejectRow('王小明');
    await waitFor(() => expect(writes).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));
    await waitFor(() => expect(gates).toHaveLength(1));

    await act(async () => writes[0].reject(new TypeError('Failed to fetch')));
    await act(async () => gates[0]());
    expect(await screen.findByText(/^(已匯出|已產生) 2 筆/)).toBeTruthy();
    expect(screen.getByText(/^王小明：未收到伺服器確認/)).toBeTruthy();
  });

  it('兩筆寫入同時在途時各自停用，先回來的那筆不解開另一筆', async () => {
    const { writes, update } = heldWrites();
    renderPage({ load: async () => twoRows(), update });
    await screen.findAllByText('王小明');
    await rejectRow('王小明');
    await rejectRow('李小華');
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    const rejectOf = (name: string) => within(rowOf(name)).getByRole('button', { name: '退件' });
    expect(rejectOf('王小明').hasAttribute('disabled')).toBe(true);
    expect(rejectOf('李小華').hasAttribute('disabled')).toBe(true);

    await act(async () => writes[0].resolve());
    expect(rejectOf('王小明').hasAttribute('disabled')).toBe(false);
    expect(rejectOf('李小華').hasAttribute('disabled')).toBe(true);
  });

  // 批次在途時那幾筆正在變成待查收：匯款類入口比照未確認擋下（業主 2026-10-07，P2-14）。
  it('批次在途時匯款類入口比照未確認擋下，單筆的標記已匯款按不出去', async () => {
    type BatchResult = { succeeded: string[]; failed: { id: string; error: string }[] };
    const pending: Array<(result: BatchResult) => void> = [];
    const batch = vi.fn(() => new Promise<BatchResult>((resolve) => pending.push(resolve)));
    renderPage({ load: async () => twoRows(), batch });
    await openBatch();
    fireEvent.click(screen.getByRole('button', { name: '確認批次匯款' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(batch).toHaveBeenCalledTimes(1);

    const markPaid = within(rowOf('王小明')).getByRole('button', { name: '標記已匯款' });
    expect(markPaid.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: /下載 CSV/ }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    fireEvent.click(markPaid);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(async () => pending[0]({ succeeded: ['w1', 'w2'], failed: [] }));
  });

  it('寫入在途時離開頁面，之後才失敗也不再重讀', async () => {
    const load = vi.fn(async (_params: WithdrawalQuery) => page());
    const { writes, update } = heldWrites();
    const { unmount } = renderPage({ load, update });
    await screen.findAllByText('王小明');
    await rejectRow('王小明');
    await waitFor(() => expect(writes).toHaveLength(1));
    load.mockClear();
    unmount();
    await act(async () => writes[0].reject(rejected('狀態已變更')));
    expect(load).not.toHaveBeenCalled();
  });
});

describe('WithdrawalManagement 寫入後的快取失效', () => {
  it.each([
    ['成功', async () => {}, ['withdrawalStatus']],
    [
      '結果不明',
      async () => {
        throw new TypeError('Failed to fetch');
      },
      ['withdrawalStatus'],
    ],
    [
      '被後端拒絕',
      async () => {
        throw rejected('狀態已變更');
      },
      [],
    ],
  ])('單筆動作%s時的失效事件', async (_label, update, expected) => {
    const cache = createAdminCache();
    const invalidate = vi.spyOn(cache, 'invalidate');
    const load = vi.fn(async (_params: WithdrawalQuery) => page());
    renderPage({ cache, load, update });
    await screen.findAllByText('王小明');
    await rejectRow('王小明');
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(invalidate.mock.calls.map(([event]) => event)).toEqual(expected);
  });

  it.each([
    ['全數成功', async () => ({ succeeded: ['w1', 'w2'], failed: [] }), ['withdrawalBatchPaid']],
    [
      '部分失敗',
      async () => ({ succeeded: ['w1'], failed: [{ id: 'w2', error: '帳號不符' }] }),
      ['withdrawalBatchPaid'],
    ],
    [
      '全數失敗',
      async () => ({
        succeeded: [],
        failed: [
          { id: 'w1', error: '帳號不符' },
          { id: 'w2', error: '帳號不符' },
        ],
      }),
      [],
    ],
    [
      '整批被後端拒絕',
      async () => {
        throw rejected('狀態已變更', 409);
      },
      [],
    ],
    // 業主 Q1：403＝權限可能已失，與讀取回 403 同一個意圖（K2）——清空快取，不為那次寫入失效。
    [
      '整批回 403',
      async () => {
        throw rejected('沒有權限', 403);
      },
      ['accessLost'],
    ],
    [
      '結果不明',
      async () => {
        throw new TypeError('Failed to fetch');
      },
      ['withdrawalBatchPaid'],
    ],
  ])('批次%s時的失效事件', async (_label, batch, expected) => {
    const cache = createAdminCache();
    const invalidate = vi.spyOn(cache, 'invalidate');
    const load = vi.fn(async (_params: WithdrawalQuery) => twoRows());
    renderPage({ cache, load, batch });
    await openBatch();
    fireEvent.click(screen.getByRole('button', { name: '確認批次匯款' }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(invalidate.mock.calls.map(([event]) => event)).toEqual(expected);
  });
});

describe('WithdrawalManagement 批次確認框', () => {
  it('確認框列出開框當下勾選的會員，送出的也是那幾筆', async () => {
    const batch = vi.fn(async () => ({ succeeded: ['w1', 'w2'], failed: [] }));
    renderPage({ load: async () => twoRows(), batch });
    const dialog = await openBatch();
    expect(within(dialog).getByText('王小明')).toBeTruthy();
    expect(within(dialog).getByText('李小華')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '確認批次匯款' }));
    await waitFor(() => expect(batch).toHaveBeenCalledWith([{ id: 'w1' }, { id: 'w2' }]));
  });

  it('確認框開著時列表開始更新就關框，並提示重新勾選', async () => {
    const { calls, load } = heldLoader();
    const { writes, update } = heldWrites();
    const batch = vi.fn(async () => ({ succeeded: [], failed: [] }));
    renderPage({ load, update, batch });
    await act(async () => calls[0].resolve(twoRows()));
    await rejectRow('李小華');
    await waitFor(() => expect(writes).toHaveLength(1));

    fireEvent.click(screen.getByRole('checkbox', { name: '選取 王小明 的提領記錄' }));
    fireEvent.click(screen.getByRole('button', { name: '批次標記已匯款' }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();

    await act(async () => writes[0].resolve());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText('列表已更新，請重新勾選')).toBeTruthy();
    expect(batch).not.toHaveBeenCalled();
  });
});

describe('WithdrawalManagement 焦點後備', () => {
  it('確認後焦點落在該列；那一列因重讀離開清單時移到下一列', async () => {
    const { calls, load } = heldLoader();
    renderPage({ load });
    await act(async () => calls[0].resolve(twoRows()));
    await rejectRow('王小明');
    await waitFor(() => expect(document.activeElement).toBe(rowOf('王小明')));

    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () =>
      calls[1].resolve(page({ withdrawals: [record({ id: 'w2', userName: '李小華' })] })),
    );
    expect(document.activeElement).toBe(rowOf('李小華'));
  });

  it('取消或 Esc 時焦點回到開框的觸發鈕', async () => {
    renderPage();
    await screen.findAllByText('王小明');
    const trigger = within(rowOf('王小明')).getByRole('button', { name: '退件' });

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('button', { name: '取消' }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    fireEvent.click(trigger);
    fireEvent.keyDown(await screen.findByRole('alertdialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('清除選取與按「知道了」之後焦點移到列表區', async () => {
    renderPage({ load: async () => twoRows() });
    fireEvent.click(await screen.findByRole('checkbox', { name: '全選本頁的提領記錄' }));
    fireEvent.click(screen.getByRole('button', { name: '清除選取' }));
    expect(document.activeElement).toBe(listRegion());

    await rejectRow('王小明');
    await screen.findByText('已退件：王小明');
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    expect(screen.queryByText('已退件：王小明')).toBeNull();
    expect(document.activeElement).toBe(listRegion());
  });

  it('載入更多進行中鈕改 aria-disabled，焦點留在鈕上', async () => {
    const gates: Array<() => void> = [];
    const load = vi.fn(async ({ offset }: WithdrawalQuery) => {
      if (offset > 0) await new Promise<void>((r) => gates.push(r));
      return page({
        withdrawals: [record({ id: `w${offset}`, userName: `會員${offset}` })],
        total: 3,
      });
    });
    renderPage({ load });
    const more = await screen.findByRole('button', { name: '載入更多' });
    more.focus();
    fireEvent.click(more);
    expect(more.getAttribute('aria-disabled')).toBe('true');
    expect(more.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(more);
  });

  it('陳舊提示的重試期間提示留在原位、焦點留在鈕上，更新完成後焦點移到列表區', async () => {
    const cache = seedCache();
    const { calls, load } = heldLoader();
    renderPage({ cache, load });
    await act(async () => calls[0].reject(new Error('連線中斷')));

    const retry = within(screen.getByRole('alert')).getByRole('button', { name: '重試' });
    retry.focus();
    fireEvent.click(retry);
    expect(retry.isConnected).toBe(true);
    expect(document.activeElement).toBe(retry);

    await act(async () => calls[1].resolve(page()));
    expect(retry.isConnected).toBe(false);
    expect(document.activeElement).toBe(listRegion());
  });
});

describe('WithdrawalManagement 載入更多與換篩選', () => {
  it('載入到最後一頁、「載入更多」消失時焦點移到列表區，不掉到 body', async () => {
    const load = vi.fn(async ({ offset }: WithdrawalQuery) =>
      page({ withdrawals: [record({ id: `w${offset}`, userName: `會員${offset}` })], total: 2 }),
    );
    renderPage({ load });
    const more = await screen.findByRole('button', { name: '載入更多' });
    more.focus();
    fireEvent.click(more);
    await waitFor(() => expect(more.isConnected).toBe(false));
    expect(document.activeElement).toBe(listRegion());
  });

  it('載入更多失敗時在鈕旁說出原因，已顯示的列保留', async () => {
    const load = vi.fn(async ({ offset }: WithdrawalQuery) => {
      if (offset > 0) throw new Error('連線中斷');
      return page({ withdrawals: [record()], total: 3 });
    });
    renderPage({ load });
    fireEvent.click(await screen.findByRole('button', { name: '載入更多' }));
    expect(await screen.findByText('連線中斷')).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('王小明')).toBeTruthy();
    expect(screen.getByRole('button', { name: '載入更多' })).toBeTruthy();
    // 焦點停在鈕上的人要聽得到失敗（業主 Q7）。
    expect(screen.getByText('連線中斷').getAttribute('role')).toBe('alert');
  });

  it('換篩選時在途的載入更多不接到新列表上', async () => {
    const tail: Held<Page>[] = [];
    const load = vi.fn((params: WithdrawalQuery) => {
      if (params.offset > 0) {
        return new Promise<Page>((resolve, reject) => {
          tail.push({ resolve, reject });
        });
      }
      return Promise.resolve(
        params.status === 'all'
          ? page({ withdrawals: [record()], total: 3 })
          : page({ withdrawals: [record({ id: 'p1', userName: '待處理者' })], total: 1 }),
      );
    });
    renderPage({ load });
    fireEvent.click(await screen.findByRole('button', { name: '載入更多' }));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: '待處理' }));
    await screen.findAllByText('待處理者');

    await act(async () =>
      tail[0].resolve(page({ withdrawals: [record({ id: 'old', userName: '舊尾巴' })], total: 3 })),
    );
    expect(screen.queryByText('舊尾巴')).toBeNull();
  });

  it('寫入在途時換篩選，畫面不以新篩選的標籤顯示舊列，寫完的重讀帶新篩選', async () => {
    const load = vi.fn((params: WithdrawalQuery) =>
      params.status === 'all' ? Promise.resolve(page()) : new Promise<Page>(() => {}),
    );
    const { writes, update } = heldWrites();
    renderPage({ load, update });
    await screen.findAllByText('王小明');
    await rejectRow('王小明');
    await waitFor(() => expect(writes).toHaveLength(1));

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: '待處理' }));
    await waitFor(() => expect(screen.queryByRole('table')).toBeNull());
    expect(screen.getByRole('status', { name: '載入提領申請中' })).toBeTruthy();

    await act(async () => writes[0].resolve());
    expect(load).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'pending', offset: 0 }),
    );
  });
});

describe('WithdrawalManagement 匯出的核對與鎖', () => {
  it('匯出途中某頁的總數變了就不下載，說出資料有變動，列表照常', async () => {
    const createUrl = vi.fn(() => 'blob:test');
    URL.createObjectURL = createUrl;
    let listed = false;
    const load = vi.fn(async ({ offset }: WithdrawalQuery) => {
      if (!listed) {
        listed = true;
        return page({ withdrawals: [record({ id: 'w0', userName: '會員0' })], total: 3 });
      }
      return page({
        withdrawals: [record({ id: `w${offset}`, userName: `會員${offset}` })],
        total: offset === 0 ? 3 : 4,
      });
    });
    renderPage({ load });
    await screen.findAllByText('會員0');
    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));
    expect(await screen.findByText('匯出途中資料有變動，請重新匯出')).toBeTruthy();
    expect(createUrl).not.toHaveBeenCalled();
    expect(within(screen.getByRole('table')).getByText('會員0')).toBeTruthy();
  });

  it('最後一頁在途時離開頁面就不下載', async () => {
    const createUrl = vi.fn(() => 'blob:test');
    URL.createObjectURL = createUrl;
    const gates: Array<() => void> = [];
    let listed = false;
    const load = vi.fn(async ({ offset }: WithdrawalQuery) => {
      if (!listed) {
        listed = true;
        return page({ withdrawals: [record({ id: 'w0' })], total: 2 });
      }
      if (offset === 1) await new Promise<void>((r) => gates.push(r));
      return page({ withdrawals: [record({ id: `w${offset}` })], total: 2 });
    });
    const { unmount } = renderPage({ load });
    await screen.findAllByText('王小明');
    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));
    await waitFor(() => expect(gates).toHaveLength(1));
    unmount();
    await act(async () => gates[0]());
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('匯出途中讀到 403 時清空快取', async () => {
    const cache = createAdminCache();
    let listed = false;
    const load = vi.fn(async (_params: WithdrawalQuery) => {
      if (!listed) {
        listed = true;
        return page({ withdrawals: [record({ id: 'w0' })], total: 2 });
      }
      throw rejected('沒有權限', 403);
    });
    renderPage({ cache, load });
    await screen.findAllByText('王小明');
    expect(cache.read('withdrawals:all')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));
    expect(await screen.findByText(/沒有權限/)).toBeTruthy();
    expect(cache.read('withdrawals:all')).toBeUndefined();
  });

  it('寫入期間鎖分頁，寫入請求一結算就釋放、不等之後的重讀', async () => {
    const release = vi.fn();
    const busy: AdminBusy = {
      locked: false,
      noteId: '',
      startWrite: vi.fn(() => release),
      startExport: vi.fn(() => ({ progress: vi.fn(), end: vi.fn() })),
    };
    const { calls, load } = heldLoader();
    const { writes, update } = heldWrites();
    renderPage({ busy, load, update });
    await act(async () => calls[0].resolve(page()));
    await rejectRow('王小明');
    await waitFor(() => expect(busy.startWrite).toHaveBeenCalledTimes(1));
    expect(release).not.toHaveBeenCalled();

    await act(async () => writes[0].resolve());
    expect(release).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  // 2xx 但回應形狀不對（解析後讀欄位擲錯）：交易可能已提交，歸結果不明；鎖只包住寫入請求、
  // 只釋放一次（§2.11）。
  it('批次回應形狀不對時以結果不明回報，寫入鎖只釋放一次', async () => {
    const release = vi.fn();
    const busy: AdminBusy = {
      locked: false,
      noteId: '',
      startWrite: vi.fn(() => release),
      startExport: vi.fn(() => ({ progress: vi.fn(), end: vi.fn() })),
    };
    renderPage({
      busy,
      load: async () => twoRows(),
      batch: async () => ({}) as { succeeded: string[]; failed: { id: string; error: string }[] },
    });
    await openBatch();
    fireEvent.click(screen.getByRole('button', { name: '確認批次匯款' }));
    expect(await screen.findByText(/^批次匯款未收到伺服器確認/)).toBeTruthy();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('匯出期間呼叫匯出鎖並回報收集進度，結束時解除', async () => {
    const progress = vi.fn();
    const end = vi.fn();
    const busy: AdminBusy = {
      locked: false,
      noteId: '',
      startWrite: vi.fn(() => () => {}),
      startExport: vi.fn(() => ({ progress, end })),
    };
    let listed = false;
    const load = vi.fn(async ({ offset }: WithdrawalQuery) => {
      if (!listed) {
        listed = true;
        return page({ withdrawals: [record({ id: 'w0' })], total: 2 });
      }
      return page({ withdrawals: [record({ id: `w${offset}` })], total: 2 });
    });
    renderPage({ busy, load });
    await screen.findAllByText('王小明');
    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));
    expect(await screen.findByText(/^(已匯出|已產生) 2 筆/)).toBeTruthy();
    expect(busy.startExport).toHaveBeenCalledTimes(1);
    expect(progress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
